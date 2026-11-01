import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const filterSource = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');
const cacheSource = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');

test('background bounds stored records and removes query strings from forged input', async () => {
  let listener;
  let stored = Array.from({ length: 500 }, (_, index) => ({ index }));
  const chrome = {
    runtime: { onMessage: { addListener: (callback) => { listener = callback; } } },
    storage: { local: {
      get: async () => ({ apiRecords: stored }),
      set: async (value) => { stored = value.apiRecords; }
    } }
  };
  runInNewContext(`${filterSource}\n${cacheSource}\n${source}`, { chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {} });
  const record = {
    transport: 'fetch', method: 'GET',
    endpoint: 'https://www.hero-wars-alliance.com/api/test?token=secret#fragment',
    status: 200, durationMs: 14, outcome: 'completed', timestamp: '2026-11-01T00:00:00.000Z'
  };
  const result = await new Promise((resolve) => {
    assert.equal(listener({ kind: 'api-record', record },
      { url: 'https://www.hero-wars-alliance.com/' }, resolve), true);
  });
  assert.equal(result.saved, true);
  assert.equal(stored.length, 500);
  assert.equal(stored[0].index, 1);
  assert.equal(stored.at(-1).endpoint, 'https://www.hero-wars-alliance.com/api/test');
  assert.equal('requestBody' in stored.at(-1), false);
  assert.equal(listener({ kind: 'api-record', record }, { url: 'https://other.example/' }, () => {}), undefined);
  assert.equal(listener({ kind: 'api-record', record: {
    ...record, endpoint: 'https://analytics.nextersglobal.com/analytics/event/gamebeat'
  } }, { url: 'https://www.hero-wars-alliance.com/' }, () => {}), undefined);
  assert.equal(stored.length, 500);
});

test('background bounds POST body fields and retains them for export', async () => {
  let listener;
  let stored = [];
  const chrome = {
    runtime: { onMessage: { addListener: (callback) => { listener = callback; } } },
    storage: { local: {
      get: async () => ({ apiRecords: stored }),
      set: async (value) => { stored = value.apiRecords; }
    } }
  };
  runInNewContext(`${filterSource}\n${cacheSource}\n${source}`, { chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {} });
  await new Promise((resolve) => listener({ kind: 'api-record', record: {
    transport: 'xhr', method: 'POST', endpoint: 'https://www.hero-wars-alliance.com/save',
    status: 201, durationMs: 5, outcome: 'completed', timestamp: '2026-11-01T00:00:00.000Z',
    requestBody: 'a'.repeat(530000), responseBody: '{"ok":true}'
  } }, { url: 'https://www.hero-wars-alliance.com/' }, resolve));
  assert.equal(stored[0].requestBody.length, 524288);
  assert.equal(stored[0].requestBodyTruncated, true);
  assert.equal(stored[0].responseBody, '{"ok":true}');
});

test('background drops oldest entries when body data reaches storage budget', async () => {
  let listener;
  let stored = Array.from({ length: 500 }, (_, index) => ({
    index, method: 'POST', requestBody: 'x'.repeat(15000)
  }));
  const chrome = {
    runtime: { onMessage: { addListener: (callback) => { listener = callback; } } },
    storage: { local: {
      get: async () => ({ apiRecords: stored }),
      set: async (value) => { stored = value.apiRecords; }
    } }
  };
  runInNewContext(`${filterSource}\n${cacheSource}\n${source}`, { chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {} });
  await new Promise((resolve) => listener({ kind: 'api-record', record: {
    transport: 'fetch', method: 'POST', endpoint: 'https://www.hero-wars-alliance.com/api/new',
    status: 200, durationMs: 2, outcome: 'completed', timestamp: '2026-11-01T00:00:00.000Z',
    requestBody: 'new', responseBody: 'ok'
  } }, { url: 'https://www.hero-wars-alliance.com/' }, resolve));
  assert.ok(stored.length < 500);
  assert.ok(stored[0].index > 0);
  assert.equal(stored.at(-1).requestBody, 'new');
  assert.ok(new TextEncoder().encode(JSON.stringify(stored)).byteLength < 5 * 1024 * 1024);
});

test('background caches selected RPC responses and can rebuild cache from stored log', async () => {
  let listener;
  const state = { apiRecords: [] };
  const chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener: (callback) => { listener = callback; } } },
    storage: { local: {
      get: async () => state,
      set: async (value) => { Object.assign(state, value); }
    } }
  };
  runInNewContext(`${filterSource}\n${cacheSource}\n${source}`, {
    chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {}
  });
  const record = {
    transport: 'fetch', method: 'POST', endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200, durationMs: 3, outcome: 'completed', timestamp: '2026-11-01T09:18:28.248Z',
    requestBody: JSON.stringify({ calls: [{ name: 'heroGetAll', ident: 1 }] }),
    responseBody: JSON.stringify({ results: [{ ident: 1, result: { response: { 5: { level: 70 } } } }] })
  };
  await new Promise((resolve) => listener({ kind: 'api-record', record },
    { url: 'https://www.hero-wars-alliance.com/' }, resolve));
  assert.equal(state.rpcCache.heroGetAll.data[5].level, 70);
  delete state.rpcCache;
  state.captureSettings = { interceptEnabled: false, logEnabled: false };
  const rebuilt = await new Promise((resolve) => listener({ kind: 'rebuild-cache' },
    { url: 'chrome-extension://test-extension/popup.html' }, resolve));
  assert.equal(rebuilt.count, 1);
  assert.equal(state.rpcCache.heroGetAll.data[5].level, 70);
});

test('log off keeps cache updates; intercept off blocks both cache and log', async () => {
  let listener;
  const state = { apiRecords: [], captureSettings: { interceptEnabled: true, logEnabled: false } };
  const chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener: (callback) => { listener = callback; } } },
    storage: { local: {
      get: async () => state,
      set: async (value) => { Object.assign(state, value); }
    } }
  };
  runInNewContext(`${filterSource}\n${cacheSource}\n${source}`, {
    chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {}
  });
  const makeRecord = (level) => ({
    transport: 'fetch', method: 'POST', endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200, durationMs: 3, outcome: 'completed', timestamp: `2026-11-01T09:18:${level}.000Z`,
    requestBody: JSON.stringify({ calls: [{ name: 'heroGetAll', ident: 1 }] }),
    responseBody: JSON.stringify({ results: [{ ident: 1, result: { response: { 5: { level } } } }] })
  });
  const sender = { url: 'https://www.hero-wars-alliance.com/' };
  const first = await new Promise((resolve) => listener({ kind: 'api-record', record: makeRecord(30) }, sender, resolve));
  assert.equal(first.saved, false);
  assert.equal(first.cached, true);
  assert.equal(state.apiRecords.length, 0);
  assert.equal(state.rpcCache.heroGetAll.data[5].level, 30);
  state.captureSettings.interceptEnabled = false;
  const second = await new Promise((resolve) => listener({ kind: 'api-record', record: makeRecord(31) }, sender, resolve));
  assert.equal(second.saved, false);
  assert.equal(second.cached, false);
  assert.equal(state.apiRecords.length, 0);
  assert.equal(state.rpcCache.heroGetAll.data[5].level, 30);
});
