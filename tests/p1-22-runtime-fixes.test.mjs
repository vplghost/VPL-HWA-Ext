import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { clonePlainCache } from '../src/composables/useRpcCache.ts';
import { advanceBuildingQueue } from '../src/background/backgroundRuntime.ts';

test('P1-22: AutomationLogPanel guards undefined entries/logs and GrandArenaModal passes :entries', async () => {
  const panelSrc = await readFile(resolve(process.cwd(), 'src/components/common/AutomationLogPanel.vue'), 'utf8');
  assert.match(panelSrc, /entries\?: AutomationLogEntry\[\]/);
  assert.match(panelSrc, /logs\?: AutomationLogEntry\[\]/);
  assert.match(panelSrc, /Array\.isArray\(props\.entries\)/);
  assert.match(panelSrc, /emptyText\?: string/);

  const gaSrc = await readFile(resolve(process.cwd(), 'src/components/dialogs/GrandArenaModal.vue'), 'utf8');
  assert.match(gaSrc, /<AutomationLogPanel\s+:entries="logs"/);
  assert.doesNotMatch(gaSrc, /<AutomationLogPanel\s+:logs="logs"/);
});

test('P1-22: clonePlainCache safely clones deeply nested Vue reactive Proxy objects without DataCloneError', () => {
  const reactiveCache = ref({
    accountStatus: { data: { id: 123, nested: { list: [1, 2, { a: 'ok' }] } } },
    heroGetAll: { data: { '1': { id: 1, power: 50000 } } },
  });

  // Direct structuredClone(toRaw(reactiveCache.value)) fails on nested Vue Proxies; clonePlainCache must succeed
  const cloned = clonePlainCache(reactiveCache.value);
  assert.deepEqual(cloned, {
    accountStatus: { data: { id: 123, nested: { list: [1, 2, { a: 'ok' }] } } },
    heroGetAll: { data: { '1': { id: 1, power: 50000 } } },
  });
  cloned.accountStatus.data.nested.list.push(99);
  assert.equal(reactiveCache.value.accountStatus.data.nested.list.length, 3, 'cloned copy must be detached from reactive ref');
});

test('P1-22: advanceBuildingQueue handles rejected summary request with deduplicated warn instead of console.error', async () => {
  const storage = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    buildingQueue: {
      accountId: 1001,
      active: true,
      items: [{ queueItemId: 'q1', buildingId: 20, nextLevel: 5 }],
    },
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
    },
    buildingQueueLogs: [],
  };

  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args);

  const mockChrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (k in storage) out[k] = structuredClone(storage[k]);
          return out;
        },
        async set(patch) {
          Object.assign(storage, structuredClone(patch));
        },
      },
    },
    alarms: { create() {}, clear() {} },
    tabs: {
      query(_f, cb) { cb([{ id: 77, active: true, url: 'https://www.hero-wars-alliance.com/game' }]); },
      async sendMessage() { return { ok: false, error: 'Game tab rejected summary request.' }; },
    },
  };

  try {
    await advanceBuildingQueue(77, undefined, mockChrome);
    assert.equal(errors.length, 0, 'Transient summary rejection must not trigger console.error');
    assert.equal(storage.buildingQueue.lastBlocked, 'verify');
    assert.equal(storage.buildingQueueLogs.length, 1);
    assert.equal(storage.buildingQueueLogs[0].status, 'warn');

    // Second rejection after cooldown must be deduplicated (still 1 log entry)
    storage.buildingQueue.lastVerifiedAt = 0;
    await advanceBuildingQueue(77, undefined, mockChrome);
    assert.equal(storage.buildingQueueLogs.length, 1, 'Repeated verify deferrals must be deduplicated');
  } finally {
    console.error = origError;
  }
});
