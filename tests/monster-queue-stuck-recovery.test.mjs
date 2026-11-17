import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { setupBackgroundRuntime, isTabAlive } from '../src/background/backgroundRuntime.ts';

const gameSender = { url: 'https://www.hero-wars-alliance.com/play', tab: { id: 1 } };
const popupSender = { url: 'chrome-extension://test-extension/popup.html' };

function setup() {
  let listener;
  const local = {};
  const session = {};
  const pick = (state, keys) => keys == null ? { ...state } :
    Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]]));
  const tabsList = [];
  const forwardedMessages = [];
  const alarms = new Map();
  const chrome = {
    alarms: {
      get: (name, cb) => cb(alarms.get(name)),
      create: (name, options) => alarms.set(name, options),
      onAlarm: { addListener: () => {} },
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      query: (filter, cb) => cb(tabsList),
      sendMessage: async (tabId, msg) => { forwardedMessages.push({ tabId, msg }); }
    },
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: '0.9.117' }),
      onMessage: { addListener: (callback) => { listener = callback; } },
      onInstalled: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async (keys) => pick(local, keys),
        set: async (value) => { Object.assign(local, value); },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key]; }
      },
      session: {
        get: async (keys) => pick(session, keys),
        set: async (value) => { Object.assign(session, value); },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete session[key]; }
      }
    }
  };
  setupBackgroundRuntime({ chrome });
  const invoke = (message, sender = popupSender) => new Promise((resolve) => listener(message, sender, resolve));
  return { local, tabsList, forwardedMessages, chrome, invoke };
}

test('monster-queue-stop successfully stops an active monster queue and drops rpc group', async () => {
  const { local, invoke, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  local.monsterQueue = {
    id: 'monster:123:1',
    tabId: 1,
    accountId: 10,
    phase: 'active',
    current: { mobId: 'mob-1', squadId: 'squad-1' }
  };

  const response = await invoke({ kind: 'monster-queue-stop' });
  assert.equal(response.ok, true);
  assert.equal(local.monsterQueue.phase, 'stopped');
  assert.match(local.monsterQueue.reason, /Stopped by user/);
  assert.ok(forwardedMessages.some(m => m.msg.kind === 'drop-rpc-group'));
});

test('monster-queue-stop is idempotent and safely marks phase as stopped even if queue was terminal or incomplete', async () => {
  const { local, invoke } = setup();
  local.monsterQueue = {
    id: 'monster:123:1',
    phase: 'stopped'
  };

  const response = await invoke({ kind: 'monster-queue-stop' });
  assert.equal(response.ok, true);
  assert.equal(local.monsterQueue.phase, 'stopped');
});

test('monster-queue-start auto-recovers from orphaned queue when previous tab is dead', async () => {
  const { local, tabsList, invoke, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  local.socketRefreshMode = 'direct';
  // Old queue was left running on tab 999 (which is now dead)
  local.monsterQueue = {
    id: 'monster:old:999',
    tabId: 999,
    accountId: 10,
    phase: 'attacking',
    current: { mobId: 'old-mob' },
    wakeAt: Date.now() + 100000
  };

  // Live game tab is tab 1
  tabsList.push({ id: 1, url: gameSender.url });
  local.rpcCache = {
    accountStatus: { data: { id: 10 } },
    heroGetAll: { data: Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { level: 30, star: 2, power: 100, troopCapacity: 500 }])) },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) } },
    experimentalSoloSearch: { data: { mapId: 'map', mobConfigIds: [37, 67], mobs: [{ mobId: 'mob-a' }] } },
    'resource:world-energy': { data: { amount: 100 } }
  };

  // Should NOT reject with "A monster queue is already running."
  // Instead, it should clean up the dead tab's queue and start the new queue!
  const response = await invoke({
    kind: 'monster-queue-start',
    options: {
      mapId: 'map', center: { x: 1, y: 2 }, level: 15, heroIds: [1, 2, 3, 4, 5],
      firstMobId: 'mob-a', count: 1
    }
  });

  assert.equal(response.ok, true, 'Must start successfully after clearing orphaned queue: ' + response.error);
  assert.equal(local.monsterQueue.tabId, 1);
  assert.equal(local.monsterQueue.phase, 'attacking');
  assert.ok(forwardedMessages.some(m => m.msg.calls?.[0]?.name === 'attackMob'));
});

test('Header.vue correctly determines isMonsterQueueRunning without requiring .running property', async () => {
  const content = await readFile(new URL('../src/components/common/Header.vue', import.meta.url), 'utf8');
  assert.ok(
    !content.includes('q.running && ![\'stopped\', \'complete\'].includes(q.phase)'),
    'Header.vue must not require non-existent .running property on queue'
  );
  assert.ok(
    content.includes('Boolean(q && ![\'stopped\', \'complete\'].includes(q.phase))'),
    'Header.vue must check ![\'stopped\', \'complete\'].includes(q.phase)'
  );
});

test('MonsterModal.vue correctly determines isRunning and renders Stop button when queue is active', async () => {
  const content = await readFile(new URL('../src/components/dialogs/MonsterModal.vue', import.meta.url), 'utf8');
  assert.ok(
    !content.includes('stored.monsterQueue.running || false'),
    'MonsterModal.vue must not check stored.monsterQueue.running'
  );
  assert.ok(
    content.includes('![\'stopped\', \'complete\'].includes(stored.monsterQueue.phase)'),
    'MonsterModal.vue must check queue phase against stopped/complete'
  );
  // Ensure the Stop button is rendered when queue is running or when already running error is encountered
  assert.ok(
    content.includes('statusMessage?.includes(\'already running\')'),
    'MonsterModal.vue must offer Stop button when queue is already running'
  );
});
