import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const filterSource = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');
const cacheSource = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const refillRules = await readFile(new URL('../extension/refillable-rules.js', import.meta.url), 'utf8');
const gameSender = { url: 'https://www.hero-wars-alliance.com/' };
const popupSender = { url: 'chrome-extension://test-extension/popup.html' };

function setup(quota = Infinity) {
  let listener;
  let installed;
  const local = {};
  const session = {};
  const pick = (state, keys) => keys == null ? { ...state } :
    Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]]));
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener: (callback) => { listener = callback; } },
      onInstalled: { addListener: (callback) => { installed = callback; } }
    },
    storage: {
      local: {
        get: async (keys) => pick(local, keys),
        set: async (value) => { Object.assign(local, value); },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key]; }
      },
      session: {
        get: async (keys) => pick(session, keys),
        set: async (value) => {
          const next = { ...session, ...value };
          if (new TextEncoder().encode(JSON.stringify(next)).byteLength > quota) throw Error('QUOTA_BYTES exceeded');
          Object.assign(session, value);
        },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete session[key]; }
      }
    }
  };
  runInNewContext(`${filterSource}\n${refillRules}\n${cacheSource}\n${source}`, {
    chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {}
  });
  const send = (kind, record, sender = kind === 'api-record' ? gameSender : popupSender) =>
    new Promise((resolve) => listener({ kind, record }, sender, resolve));
  return { local, session, send, installed, listener };
}

function rpc(calls, results, timestamp = '2026-11-01T09:18:28.248Z') {
  return {
    transport: 'fetch', method: 'POST', endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200, durationMs: 3, outcome: 'completed', timestamp,
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results })
  };
}

function getRecord(index) {
  return {
    transport: 'fetch', method: 'GET',
    endpoint: `https://www.hero-wars-alliance.com/api/test?token=${index}#fragment`,
    status: 200, durationMs: index, outcome: 'completed',
    timestamp: new Date(2026, 10, 1, 0, 0, index).toISOString()
  };
}

test('passive cache updates Energy and World Energy without recording or account data', async () => {
  const { local, session, send } = setup();
  const record = rpc([
    { name: 'userGetInfo', ident: 1 },
    { name: 'refillableGetAll', feature: 'refillable', ident: 2 }
  ], [
    { ident: 1, result: { response: { id: 'private-id', name: 'private-name',
      refillable: [{ id: 1, amount: 42 }] } } },
    { ident: 2, result: { response: { refillables: [{ refillableId: 2, amount: 44 }] } } }
  ]);
  const result = await send('api-record', record);
  assert.equal(result.saved, false);
  assert.equal(result.cached, true);
  assert.equal(local.rpcCache.energyStatus.data.energy, 42);
  assert.equal(local.rpcCache.worldEnergyStatus.data.energy, 44);
  assert.equal(JSON.stringify(local).includes('private-id'), false);
  assert.equal('apiRecords' in local, false);
  assert.equal(Object.keys(session).length, 0);
});

test('Record and Stop keep an uncapped session log and never write raw records locally', async () => {
  const { local, session, send } = setup();
  local.apiRecords = [{ legacy: true }];
  local.captureSettings = { interceptEnabled: false, logEnabled: true };
  const started = await send('record-start');
  assert.equal(started.active, true);
  assert.equal(local.captureSettings.interceptEnabled, true);
  assert.equal('apiRecords' in local, false);
  for (let index = 0; index < 501; index++) {
    const result = await send('api-record', getRecord(index));
    assert.equal(result.saved, true);
  }
  assert.equal(session.recordingState.nextIndex, 501);
  assert.equal(Object.keys(session).filter((key) => key.startsWith('record:')).length, 501);
  assert.equal(session['record:500'].endpoint, 'https://www.hero-wars-alliance.com/api/test');
  assert.equal('apiRecords' in local, false);
  await send('record-stop');
  assert.equal((await send('api-record', getRecord(502))).saved, false);
  assert.equal(session.recordingState.nextIndex, 501);
  await send('record-clear');
  assert.equal(Object.keys(session).filter((key) => key.startsWith('record:')).length, 0);
});

test('recorded POST bodies remain bounded and tracking endpoints stay excluded', async () => {
  const { session, send, listener } = setup();
  await send('record-start');
  await send('api-record', {
    ...getRecord(1), method: 'POST', requestBody: 'a'.repeat(530000), responseBody: '{"ok":true}'
  });
  assert.equal(session['record:0'].requestBody.length, 524288);
  assert.equal(session['record:0'].requestBodyTruncated, true);
  assert.equal(session['record:0'].responseBody, '{"ok":true}');
  assert.equal(listener({ kind: 'api-record', record: {
    ...getRecord(2), endpoint: 'https://analytics.nextersglobal.com/analytics/event/gamebeat'
  } }, gameSender, () => {}), undefined);
  assert.equal(session.recordingState.nextIndex, 1);
});

test('session quota failure stops recording and preserves earlier records', async () => {
  const { session, send } = setup(650);
  await send('record-start');
  assert.equal((await send('api-record', getRecord(1))).saved, true);
  const result = await send('api-record', {
    ...getRecord(2), method: 'POST', requestBody: 'x'.repeat(1000), responseBody: 'ok'
  });
  assert.equal(result.saved, false);
  assert.equal(session.recordingState.active, false);
  assert.match(session.recordingState.error, /full/);
  assert.equal(session['record:0'].endpoint, 'https://www.hero-wars-alliance.com/api/test');
  assert.equal('record:1' in session, false);
});

test('cache can rebuild from temporary session records and old local logs are removed on update', async () => {
  const { local, send, installed } = setup();
  local.apiRecords = [{ legacy: true }];
  installed();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal('apiRecords' in local, false);
  await send('record-start');
  await send('api-record', rpc([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 5: { level: 70 } } } }]));
  assert.equal(local.rpcCache.heroGetAll.data[5].level, 70);
  delete local.rpcCache;
  const rebuilt = await send('rebuild-cache');
  assert.equal(rebuilt.count, 1);
  assert.equal(local.rpcCache.heroGetAll.data[5].level, 70);
  local.captureSettings = { interceptEnabled: false };
  const skipped = await send('api-record', getRecord(3));
  assert.equal(skipped.saved, false);
  assert.equal(skipped.cached, false);
});
