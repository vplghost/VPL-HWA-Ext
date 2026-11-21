import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupBackgroundRuntime,
  flushRpcCacheImmediate
} from '../src/background/backgroundRuntime.ts';
import { filterConfigData, RUNTIME_EXCLUDE_KEYS } from '../src/utils/dataBackup.ts';

test('backgroundRuntime partitions cache:world and cache:roster domain keys during storage flush', async () => {
  const local = {};
  const writes = [];

  const chromeMock = {
    alarms: {
      get: (_name, cb) => cb(null),
      create: () => {},
      onAlarm: { addListener: () => {} }
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      query: (_filter, cb) => cb([]),
      reload: () => {},
      sendMessage: async () => {}
    },
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: '0.11.149' }),
      onMessage: { addListener: (cb) => { listener = cb; } },
      onInstalled: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return { ...local };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => Object.hasOwn(local, k)).map((k) => [k, local[k]]));
        },
        set: async (value) => {
          writes.push({ ...value });
          Object.assign(local, value);
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete local[k];
        }
      },
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    }
  };

  let listener;
  const bg = setupBackgroundRuntime({ chrome: chromeMock, rpcDebounceMs: 0 });

  // 1. Send march record (should populate cache:world)
  const marchRecord = {
    transport: 'fetch',
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    durationMs: 30,
    outcome: 'completed',
    timestamp: new Date().toISOString(),
    requestBody: JSON.stringify({
      calls: [{ name: 'getMarches', feature: 'march', ident: 'm1' }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'm1', result: { response: { marches: { gathering: [{ squadId: 'sq1', endsAt: 12345 }] } } } }]
    })
  };

  await new Promise((resolve) => listener({ kind: 'api-record', record: marchRecord }, { url: 'https://www.hero-wars-alliance.com/' }, resolve));
  await bg.drain();

  // Verify cache:world domain key was written
  assert.ok(local['cache:world']);
  assert.equal(local['cache:world'].marchStatus.data.marches[0].squadId, 'sq1');

  // 2. Send heroGetAll and inventoryGet record (should populate cache:roster)
  const rosterRecord = {
    transport: 'fetch',
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    durationMs: 40,
    outcome: 'completed',
    timestamp: new Date().toISOString(),
    requestBody: JSON.stringify({
      calls: [
        { name: 'heroGetAll', ident: 'h1' },
        { name: 'inventoryGet', ident: 'inv1' }
      ]
    }),
    responseBody: JSON.stringify({
      results: [
        { ident: 'h1', result: { response: { 10: { level: 80, star: 5 } } } },
        { ident: 'inv1', result: { response: { coin: { 1: 5000 } } } }
      ]
    })
  };

  await new Promise((resolve) => listener({ kind: 'api-record', record: rosterRecord }, { url: 'https://www.hero-wars-alliance.com/' }, resolve));
  await bg.drain();

  // Verify cache:roster domain key was written
  assert.ok(local['cache:roster']);
  assert.equal(local['cache:roster'].heroGetAll.data[10].level, 80);
  assert.equal(local['cache:roster'].inventoryGet.data.coin[1], 5000);
});

test('dataBackup RUNTIME_EXCLUDE_KEYS excludes domain partition keys', () => {
  assert.ok(RUNTIME_EXCLUDE_KEYS.has('cache:world'));
  assert.ok(RUNTIME_EXCLUDE_KEYS.has('cache:roster'));
  assert.ok(RUNTIME_EXCLUDE_KEYS.has('rpcCache'));
  assert.ok(RUNTIME_EXCLUDE_KEYS.has('guildChat'));
  assert.ok(RUNTIME_EXCLUDE_KEYS.has('dungeonBattleHistory'));

  const exportPayload = filterConfigData({
    autoGatherSettings: { enabled: true },
    'cache:world': { marchStatus: {} },
    'cache:roster': { heroGetAll: {} },
    rpcCache: { accountStatus: {} }
  });

  assert.equal('autoGatherSettings' in exportPayload, true);
  assert.equal('cache:world' in exportPayload, false);
  assert.equal('cache:roster' in exportPayload, false);
  assert.equal('rpcCache' in exportPayload, false);
});
