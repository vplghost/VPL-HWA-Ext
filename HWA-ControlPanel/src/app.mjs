import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ControlPanelDb } from './db.mjs';
import { sha256Hex, timingSafeEqualHex, verifyTotp } from './totp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SESSION_COOKIE_NAME = 'hwa_cp_session';
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;
const OTP_REPLAY_TTL_MS = 90 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_COMMAND_ACTIONS = new Set([
  'refresh-snapshot',
  'emergency-recall-gatherers',
  'toggle-automation',
  'stop-queue',
  'trigger-special',
]);

function parseCookies(headerValue) {
  const out = {};
  if (!headerValue || typeof headerValue !== 'string') return out;
  for (const part of headerValue.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isHttpsRequest(req, cookieSecureMode) {
  if (cookieSecureMode === true || cookieSecureMode === 'true') return true;
  if (cookieSecureMode === false || cookieSecureMode === 'false') return false;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto === 'https';
}

function formatSetCookie(name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function createControlPanelServer(options = {}) {
  const dataDir = options.dataDir ?? path.resolve(__dirname, '../data');
  const dbPath = options.dbPath ?? (dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'control-panel.db'));
  const publicDir = options.publicDir ?? path.resolve(__dirname, '../public');
  const bootstrapKey = options.bootstrapKey ?? process.env.BOOTSTRAP_KEY ?? '';
  const cookieSecureMode = options.cookieSecure ?? process.env.COOKIE_SECURE ?? 'auto';
  const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();

  const db = new ControlPanelDb(dbPath);
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // Minimal CORS for Chrome Extension requests
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Guid, X-Bootstrap-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Live WS registries
  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const extSockets = new Map();
  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const webSockets = new Map();
  /** @type {Map<string, number[]>} */
  const authFailures = new Map();
  /** @type {Map<string, number>} */
  const usedOtpSteps = new Map();

  function addSocket(map, guid, ws) {
    let set = map.get(guid);
    if (!set) {
      set = new Set();
      map.set(guid, set);
    }
    set.add(ws);
  }

  function removeSocket(map, guid, ws) {
    const set = map.get(guid);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) map.delete(guid);
  }

  function broadcast(map, guid, message) {
    const set = map.get(guid);
    if (!set || set.size === 0) return 0;
    const raw = JSON.stringify(message);
    let sent = 0;
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(raw);
        sent++;
      }
    }
    return sent;
  }

  function isExtensionOnline(guid) {
    const set = extSockets.get(guid);
    if (!set) return false;
    for (const ws of set) {
      if (ws.readyState === 1) return true;
    }
    return false;
  }

  function verifyExtensionAuth(guid, bearerToken) {
    if (!UUID_RE.test(String(guid || ''))) return null;
    if (!bearerToken || typeof bearerToken !== 'string') return null;
    const client = db.getClient(guid);
    if (!client) return null;
    const incomingHash = sha256Hex(bearerToken);
    if (!timingSafeEqualHex(incomingHash, client.tokenHash)) return null;
    return client;
  }

  function requireExtension(req, res, next) {
    const guid = String(req.headers['x-client-guid'] || '').trim();
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const client = verifyExtensionAuth(guid, token);
    if (!client) {
      res.status(401).json({ ok: false, error: 'Unauthorized extension credentials' });
      return;
    }
    db.touchClient(client.guid, nowFn());
    req.extClient = client;
    next();
  }

  function resolveWebSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE_NAME];
    if (!rawToken) return null;
    return db.getSession(sha256Hex(rawToken), nowFn());
  }

  function requireWebSession(req, res, next) {
    const session = resolveWebSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: 'Authentication required' });
      return;
    }
    req.webSession = session;
    next();
  }

  function checkRateLimit(ip, now) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const list = (authFailures.get(ip) || []).filter((ts) => ts > cutoff);
    if (list.length === 0) authFailures.delete(ip);
    else authFailures.set(ip, list);
    return list.length >= RATE_LIMIT_MAX_FAILURES;
  }

  function recordAuthFailure(ip, now) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const list = (authFailures.get(ip) || []).filter((ts) => ts > cutoff);
    list.push(now);
    authFailures.set(ip, list);
  }

  function pruneReplayCache(now) {
    for (const [k, exp] of usedOtpSteps.entries()) {
      if (exp <= now) usedOtpSteps.delete(k);
    }
  }

  // Health & Readiness probes (K8s)
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'hwa-control-panel', timestamp: nowFn() });
  });

  app.get('/readyz', (_req, res) => {
    try {
      const ok = db.ping();
      res.status(ok ? 200 : 503).json({ ok, db: ok ? 'ready' : 'unavailable' });
    } catch (err) {
      res.status(503).json({ ok: false, error: String(err) });
    }
  });

  // Extension Pairing & Telemetry API
  app.post('/api/ext/pair', (req, res) => {
    if (bootstrapKey) {
      const provided = String(req.headers['x-bootstrap-key'] || req.body?.bootstrapKey || '');
      if (!timingSafeEqualHex(sha256Hex(provided), sha256Hex(bootstrapKey))) {
        res.status(403).json({ ok: false, error: 'Invalid bootstrap pairing key' });
        return;
      }
    }
    const guid = String(req.body?.clientGuid || '').trim();
    const deviceToken = String(req.body?.deviceToken || '').trim();
    const otpSecret = String(req.body?.otpSecret || '').trim();
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : null;

    if (!UUID_RE.test(guid)) {
      res.status(400).json({ ok: false, error: 'Invalid clientGuid (UUID required)' });
      return;
    }
    if (deviceToken.length < 16) {
      res.status(400).json({ ok: false, error: 'Invalid deviceToken' });
      return;
    }
    if (otpSecret.replace(/[^A-Z2-7]/gi, '').length < 16) {
      res.status(400).json({ ok: false, error: 'Invalid otpSecret' });
      return;
    }

    const existing = db.getClient(guid);
    if (existing) {
      const incomingHash = sha256Hex(deviceToken);
      if (!timingSafeEqualHex(incomingHash, existing.tokenHash)) {
        res.status(403).json({ ok: false, error: 'Client GUID already paired with a different token' });
        return;
      }
    }

    db.upsertClient({
      guid,
      tokenHash: sha256Hex(deviceToken),
      otpSecret,
      lastSeenAt: nowFn(),
      meta,
    });
    res.json({ ok: true, guid });
  });

  app.post('/api/ext/snapshot', requireExtension, (req, res) => {
    const payload = req.body?.snapshot ?? req.body;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ ok: false, error: 'Snapshot payload object required' });
      return;
    }
    const now = nowFn();
    db.upsertSnapshot(req.extClient.guid, payload, now);
    broadcast(webSockets, req.extClient.guid, {
      type: 'snapshot_updated',
      updatedAt: now,
      snapshot: payload,
      extensionOnline: isExtensionOnline(req.extClient.guid),
    });
    res.json({ ok: true, updatedAt: now });
  });

  app.post('/api/ext/command-ack', requireExtension, (req, res) => {
    const id = String(req.body?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!id || !['running', 'done', 'failed'].includes(status)) {
      res.status(400).json({ ok: false, error: 'Invalid command ack payload' });
      return;
    }
    const updated = db.ackCommand(id, req.extClient.guid, {
      status,
      result: req.body?.result ?? null,
      ackedAt: nowFn(),
    });
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Command not found' });
      return;
    }
    if (req.body?.snapshot && typeof req.body.snapshot === 'object') {
      const now = nowFn();
      db.upsertSnapshot(req.extClient.guid, req.body.snapshot, now);
      broadcast(webSockets, req.extClient.guid, {
        type: 'snapshot_updated',
        updatedAt: now,
        snapshot: req.body.snapshot,
        extensionOnline: isExtensionOnline(req.extClient.guid),
      });
    }
    broadcast(webSockets, req.extClient.guid, {
      type: 'command_updated',
      command: updated,
    });
    res.json({ ok: true, command: updated });
  });

  app.post('/api/ext/revoke-sessions', requireExtension, (req, res) => {
    const revoked = db.revokeSessionsByGuid(req.extClient.guid);
    const sockets = webSockets.get(req.extClient.guid);
    if (sockets) {
      for (const ws of [...sockets]) {
        try {
          ws.close(4001, 'Session revoked by extension');
        } catch (_) {}
      }
      webSockets.delete(req.extClient.guid);
    }
    res.json({ ok: true, revoked });
  });

  // WebView Auth & Control API
  app.post('/api/web/auth', (req, res) => {
    const now = nowFn();
    const ip = getClientIp(req);
    if (checkRateLimit(ip, now)) {
      res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
      res.status(429).json({ ok: false, error: 'Too many failed attempts. Please wait 5 minutes.' });
      return;
    }

    const guid = String(req.body?.guid || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!UUID_RE.test(guid) || !/^\d{6}$/.test(otp)) {
      recordAuthFailure(ip, now);
      res.status(401).json({ ok: false, error: 'Invalid GUID or 6-digit OTP' });
      return;
    }

    const client = db.getClient(guid);
    if (!client) {
      recordAuthFailure(ip, now);
      res.status(401).json({ ok: false, error: 'Invalid GUID or 6-digit OTP' });
      return;
    }

    const check = verifyTotp(client.otpSecret, otp, now, 1, 30);
    if (!check.valid) {
      recordAuthFailure(ip, now);
      res.status(401).json({ ok: false, error: 'Invalid or expired OTP' });
      return;
    }

    pruneReplayCache(now);
    const replayKey = `${guid}:${check.step}`;
    if (usedOtpSteps.has(replayKey)) {
      recordAuthFailure(ip, now);
      res.status(401).json({ ok: false, error: 'OTP already used. Wait for the next 30s code.' });
      return;
    }
    usedOtpSteps.set(replayKey, now + OTP_REPLAY_TTL_MS);

    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + ONE_YEAR_SECONDS * 1000;
    db.createSession({
      tokenHash: sha256Hex(rawSessionToken),
      guid,
      expiresAt,
      createdAt: now,
    });

    const secure = isHttpsRequest(req, cookieSecureMode);
    res.setHeader(
      'Set-Cookie',
      formatSetCookie(SESSION_COOKIE_NAME, rawSessionToken, { maxAge: ONE_YEAR_SECONDS, secure })
    );
    res.json({ ok: true, guid, expiresAt });
  });

  app.post('/api/web/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE_NAME];
    if (rawToken) {
      db.deleteSession(sha256Hex(rawToken));
    }
    const secure = isHttpsRequest(req, cookieSecureMode);
    res.setHeader('Set-Cookie', formatSetCookie(SESSION_COOKIE_NAME, '', { maxAge: 0, secure }));
    res.json({ ok: true });
  });

  app.get('/api/web/session', (req, res) => {
    const session = resolveWebSession(req);
    if (!session) {
      res.json({ ok: true, authenticated: false });
      return;
    }
    res.json({ ok: true, authenticated: true, guid: session.guid, expiresAt: session.expiresAt });
  });

  app.get('/api/web/state', requireWebSession, (req, res) => {
    const guid = req.webSession.guid;
    const client = db.getClient(guid);
    const snap = db.getSnapshot(guid);
    const commands = db.listCommands(guid, 15);
    res.json({
      ok: true,
      guid,
      extensionOnline: isExtensionOnline(guid),
      lastSeenAt: client?.lastSeenAt ?? null,
      snapshot: snap?.payload ?? null,
      snapshotUpdatedAt: snap?.updatedAt ?? null,
      recentCommands: commands,
    });
  });

  app.get('/api/web/commands', requireWebSession, (req, res) => {
    const limit = Number(req.query?.limit) || 20;
    res.json({ ok: true, commands: db.listCommands(req.webSession.guid, limit) });
  });

  app.post('/api/web/command', requireWebSession, (req, res) => {
    const action = String(req.body?.action || '').trim();
    const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
    if (!ALLOWED_COMMAND_ACTIONS.has(action)) {
      res.status(400).json({ ok: false, error: `Unsupported command action: ${action}` });
      return;
    }
    const guid = req.webSession.guid;
    const command = db.createCommand({
      id: crypto.randomUUID(),
      guid,
      action,
      payload,
      status: 'pending',
      createdAt: nowFn(),
    });
    const delivered = broadcast(extSockets, guid, { type: 'command', command });
    res.status(202).json({
      ok: true,
      command,
      delivered: delivered > 0,
      extensionOnline: delivered > 0,
    });
  });

  // Static Mobile WebView
  app.use(express.static(publicDir));

  // HTTP + WebSocket server
  const server = http.createServer(app);
  const wssExt = new WebSocketServer({ noServer: true });
  const wssWeb = new WebSocketServer({ noServer: true });

  wssExt.on('connection', (ws, req, client) => {
    let authedClient = client || null;

    const attachAuthed = (c) => {
      authedClient = c;
      addSocket(extSockets, c.guid, ws);
      db.touchClient(c.guid, nowFn());
      broadcast(webSockets, c.guid, {
        type: 'extension_presence',
        extensionOnline: true,
        lastSeenAt: nowFn(),
      });
      ws.send(JSON.stringify({ type: 'connected', guid: c.guid }));
    };

    if (authedClient) {
      attachAuthed(authedClient);
    }

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!authedClient) {
        if (msg?.type === 'auth') {
          const verified = verifyExtensionAuth(msg.guid, msg.token);
          if (!verified) {
            ws.close(4401, 'Unauthorized');
            return;
          }
          attachAuthed(verified);
        }
        return;
      }

      const now = nowFn();
      db.touchClient(authedClient.guid, now);
      if (msg?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', now }));
      } else if (msg?.type === 'snapshot' && msg.snapshot && typeof msg.snapshot === 'object') {
        db.upsertSnapshot(authedClient.guid, msg.snapshot, now);
        broadcast(webSockets, authedClient.guid, {
          type: 'snapshot_updated',
          updatedAt: now,
          snapshot: msg.snapshot,
          extensionOnline: true,
        });
      } else if (msg?.type === 'command-ack' && msg.id && ['running', 'done', 'failed'].includes(msg.status)) {
        const updated = db.ackCommand(String(msg.id), authedClient.guid, {
          status: msg.status,
          result: msg.result ?? null,
          ackedAt: now,
        });
        if (msg.snapshot && typeof msg.snapshot === 'object') {
          db.upsertSnapshot(authedClient.guid, msg.snapshot, now);
          broadcast(webSockets, authedClient.guid, {
            type: 'snapshot_updated',
            updatedAt: now,
            snapshot: msg.snapshot,
            extensionOnline: true,
          });
        }
        if (updated) {
          broadcast(webSockets, authedClient.guid, { type: 'command_updated', command: updated });
        }
      }
    });

    ws.on('close', () => {
      if (!authedClient) return;
      removeSocket(extSockets, authedClient.guid, ws);
      broadcast(webSockets, authedClient.guid, {
        type: 'extension_presence',
        extensionOnline: isExtensionOnline(authedClient.guid),
        lastSeenAt: nowFn(),
      });
    });
  });

  wssWeb.on('connection', (ws, _req, session) => {
    addSocket(webSockets, session.guid, ws);
    ws.send(
      JSON.stringify({
        type: 'subscribed',
        guid: session.guid,
        extensionOnline: isExtensionOnline(session.guid),
      })
    );
    ws.on('close', () => {
      removeSocket(webSockets, session.guid, ws);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/ws/extension') {
      const guid = String(req.headers['x-client-guid'] || url.searchParams.get('guid') || '').trim();
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(url.searchParams.get('token') || '').trim();
      let client = null;
      if (guid || token) {
        client = verifyExtensionAuth(guid, token);
        if (!client) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }
      wssExt.handleUpgrade(req, socket, head, (ws) => {
        wssExt.emit('connection', ws, req, client);
      });
      return;
    }

    if (url.pathname === '/ws/web') {
      const session = resolveWebSession(req);
      if (!session) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wssWeb.handleUpgrade(req, socket, head, (ws) => {
        wssWeb.emit('connection', ws, req, session);
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });

  return {
    app,
    server,
    db,
    wssExt,
    wssWeb,
    async start(port = 8080, host = '0.0.0.0') {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return server.address();
    },
    async close() {
      for (const set of [...extSockets.values(), ...webSockets.values()]) {
        for (const ws of set) {
          try {
            ws.terminate();
          } catch (_) {}
        }
      }
      extSockets.clear();
      webSockets.clear();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}
