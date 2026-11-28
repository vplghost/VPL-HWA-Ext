import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MAX_COMMANDS_PER_CLIENT = 500;

export class ControlPanelDb {
  constructor(dbPath) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        guid TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        otp_secret TEXT NOT NULL,
        last_seen_at INTEGER NOT NULL,
        meta_json TEXT
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        guid TEXT PRIMARY KEY,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        guid TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at INTEGER NOT NULL,
        acked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_commands_guid_created ON commands(guid, created_at DESC);
      CREATE TABLE IF NOT EXISTS web_sessions (
        token_hash TEXT PRIMARY KEY,
        guid TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_guid ON web_sessions(guid);
    `);
  }

  ping() {
    const row = this.db.prepare('SELECT 1 AS ok').get();
    return row?.ok === 1;
  }

  upsertClient({ guid, tokenHash, otpSecret, lastSeenAt, meta }) {
    this.db
      .prepare(
        `INSERT INTO clients (guid, token_hash, otp_secret, last_seen_at, meta_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guid) DO UPDATE SET
           token_hash = excluded.token_hash,
           otp_secret = excluded.otp_secret,
           last_seen_at = excluded.last_seen_at,
           meta_json = COALESCE(excluded.meta_json, clients.meta_json)`
      )
      .run(guid, tokenHash, otpSecret, lastSeenAt, meta ? JSON.stringify(meta) : null);
  }

  getClient(guid) {
    const row = this.db.prepare('SELECT * FROM clients WHERE guid = ?').get(guid);
    if (!row) return null;
    return {
      guid: row.guid,
      tokenHash: row.token_hash,
      otpSecret: row.otp_secret,
      lastSeenAt: row.last_seen_at,
      meta: row.meta_json ? JSON.parse(row.meta_json) : null,
    };
  }

  touchClient(guid, now = Date.now()) {
    this.db.prepare('UPDATE clients SET last_seen_at = ? WHERE guid = ?').run(now, guid);
  }

  upsertSnapshot(guid, payload, updatedAt = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO snapshots (guid, updated_at, payload_json)
         VALUES (?, ?, ?)
         ON CONFLICT(guid) DO UPDATE SET
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`
      )
      .run(guid, updatedAt, JSON.stringify(payload));
  }

  getSnapshot(guid) {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE guid = ?').get(guid);
    if (!row) return null;
    return {
      guid: row.guid,
      updatedAt: row.updated_at,
      payload: JSON.parse(row.payload_json),
    };
  }

  createCommand({ id, guid, action, payload, status = 'pending', createdAt = Date.now() }) {
    this.db
      .prepare(
        `INSERT INTO commands (id, guid, action, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, guid, action, payload != null ? JSON.stringify(payload) : null, status, createdAt);

    // Prune older commands beyond limit
    this.db
      .prepare(
        `DELETE FROM commands
         WHERE guid = ? AND id NOT IN (
           SELECT id FROM commands WHERE guid = ? ORDER BY created_at DESC LIMIT ?
         )`
      )
      .run(guid, guid, MAX_COMMANDS_PER_CLIENT);

    return this.getCommand(id);
  }

  getCommand(id) {
    const row = this.db.prepare('SELECT * FROM commands WHERE id = ?').get(id);
    return row ? this._formatCommand(row) : null;
  }

  ackCommand(id, guid, { status, result, ackedAt = Date.now() }) {
    const info = this.db
      .prepare(
        `UPDATE commands
         SET status = ?, result_json = ?, acked_at = ?
         WHERE id = ? AND guid = ?`
      )
      .run(status, result != null ? JSON.stringify(result) : null, ackedAt, id, guid);
    if (!info.changes) return null;
    return this.getCommand(id);
  }

  listCommands(guid, limit = 25) {
    const rows = this.db
      .prepare('SELECT * FROM commands WHERE guid = ? ORDER BY created_at DESC LIMIT ?')
      .all(guid, Math.max(1, Math.min(100, Number(limit) || 25)));
    return rows.map((r) => this._formatCommand(r));
  }

  _formatCommand(row) {
    return {
      id: row.id,
      guid: row.guid,
      action: row.action,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      status: row.status,
      result: row.result_json ? JSON.parse(row.result_json) : null,
      createdAt: row.created_at,
      ackedAt: row.acked_at ?? null,
    };
  }

  createSession({ tokenHash, guid, expiresAt, createdAt = Date.now() }) {
    this.db
      .prepare(
        `INSERT INTO web_sessions (token_hash, guid, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(tokenHash, guid, expiresAt, createdAt);
  }

  getSession(tokenHash, now = Date.now()) {
    const row = this.db.prepare('SELECT * FROM web_sessions WHERE token_hash = ?').get(tokenHash);
    if (!row) return null;
    if (row.expires_at <= now) {
      this.deleteSession(tokenHash);
      return null;
    }
    return {
      tokenHash: row.token_hash,
      guid: row.guid,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  deleteSession(tokenHash) {
    this.db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(tokenHash);
  }

  revokeSessionsByGuid(guid) {
    const info = this.db.prepare('DELETE FROM web_sessions WHERE guid = ?').run(guid);
    return Number(info.changes || 0);
  }

  close() {
    this.db.close();
  }
}
