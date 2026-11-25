import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  classifyRpc,
  sanitizeAndCompact,
  sanitizeTopic,
  verifySampleData,
} from '../scripts/curate-sample-data.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SAMPLE_DIR = path.join(ROOT_DIR, 'sample-data');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'curate-sample-data.mjs');

test('sample-data catalog passes integrity, schema, and redaction verification', () => {
  const res = verifySampleData(SAMPLE_DIR);
  assert.equal(res.ok, true, `verifySampleData failed: ${res.errors.join('; ')}`);
  assert.ok(res.fileCount >= 20, `Expected >= 20 curated sample files, got ${res.fileCount}`);
  assert.ok(res.totalRpcMethods >= 240, `Expected >= 240 RPC methods, got ${res.totalRpcMethods}`);
  assert.ok(res.totalBytes < 3 * 1024 * 1024, `Curated sample-data should stay < 3 MB, got ${res.totalBytes} bytes`);

  const index = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, 'index.json'), 'utf8'));
  assert.equal(index._schema, 'hwa-sample-data-index/v1');
  assert.equal(index.summary.unclassifiedMethods.length, 0, 'All observed RPC methods should be classified');
  assert.ok(index.summary.mqttEventTypes >= 30, `Expected >= 30 MQTT event types, got ${index.summary.mqttEventTypes}`);
});

test('sanitizeAndCompact redacts sensitive headers/keys and compacts large structures', () => {
  const dirty = {
    'x-auth-token': 'super-secret-token-12345',
    'x-auth-session-id': 'sess-999999',
    accessToken: 'jwt-secret-value',
    nested: { cookie: 'sid=abcdef', safeField: 42 },
    bigList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
  const clean = sanitizeAndCompact(dirty, { maxArray: 3 });
  assert.equal(clean['x-auth-token'], '[REDACTED]');
  assert.equal(clean['x-auth-session-id'], '[REDACTED]');
  assert.equal(clean.accessToken, '[REDACTED]');
  assert.equal(clean.nested.cookie, '[REDACTED]');
  assert.equal(clean.nested.safeField, 42);
  assert.equal(clean.bigList.length, 4);
  assert.equal(clean.bigList[3]._truncatedArrayItems, 7);
});

test('sanitizeTopic masks user, account, clan, and map identifiers', () => {
  assert.equal(
    sanitizeTopic('hwm/user/1216438103'),
    'hwm/user/<REDACTED_USER_ID>'
  );
  assert.equal(
    sanitizeTopic('hwm/account/105000000000000213256070'),
    'hwm/account/<REDACTED_ACCOUNT_ID>'
  );
  assert.equal(
    sanitizeTopic('hwm/pub/clan/305081'),
    'hwm/pub/clan/<REDACTED_CLAN_ID>'
  );
  assert.equal(
    sanitizeTopic('hwm/pub/global-map/5929afff-c3a6-495d-8f2c-37e7c509a4dc/fortress'),
    'hwm/pub/global-map/<REDACTED_MAP_UUID>/fortress'
  );
});

test('classifyRpc routes known methods and flags unknown methods as unclassified', () => {
  assert.equal(classifyRpc('randomDraft_getInfo').domain, 'legends-draft');
  assert.equal(classifyRpc('clanBoss_getDayHistory').domain, 'guild-hydra-war');
  assert.equal(classifyRpc('dungeonStartBattle').domain, 'dungeon-titans');
  assert.equal(classifyRpc('totallyNewFeature_ping').domain, 'unclassified');
});

test('curate-sample-data ingest merges new RPCs incrementally without losing existing samples', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hwa-sample-ingest-'));
  try {
    const outDir = path.join(tmpRoot, 'sample-data');
    const log1 = path.join(tmpRoot, 'log1.json');
    const log2 = path.join(tmpRoot, 'log2.json');

    fs.writeFileSync(
      log1,
      JSON.stringify({
        timeline: [
          {
            timestamp: '2026-11-25T00:00:00Z',
            status: 200,
            requestBody: JSON.stringify({ calls: [{ ident: '1', name: 'arenaGetAll', args: {} }] }),
            responseBody: JSON.stringify({ results: [{ ident: '1', result: { response: { rank: 5 } } }] }),
          },
        ],
      })
    );

    fs.writeFileSync(
      log2,
      JSON.stringify({
        timeline: [
          {
            timestamp: '2026-11-25T01:00:00Z',
            status: 200,
            requestBody: JSON.stringify({
              calls: [{ ident: '2', name: 'futureMode_getStatus', args: { season: 1 } }],
            }),
            responseBody: JSON.stringify({
              results: [{ ident: '2', result: { response: { active: true, token: 'secret-token-xyz' } } }],
            }),
          },
        ],
      })
    );

    execFileSync(process.execPath, [SCRIPT_PATH, 'ingest', log1, '--out', outDir], { stdio: 'pipe' });
    execFileSync(process.execPath, [SCRIPT_PATH, 'ingest', log2, '--out', outDir], { stdio: 'pipe' });

    const verified = verifySampleData(outDir);
    assert.equal(verified.ok, true, `verify after ingest failed: ${verified.errors.join('; ')}`);
    assert.equal(verified.totalRpcMethods, 2);

    const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8'));
    assert.deepEqual(index.summary.unclassifiedMethods, ['futureMode_getStatus']);

    const unclassified = JSON.parse(
      fs.readFileSync(path.join(outDir, 'unclassified', 'unclassified-rpcs.json'), 'utf8')
    );
    assert.equal(unclassified.methods.futureMode_getStatus.response.token, '[REDACTED]');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
