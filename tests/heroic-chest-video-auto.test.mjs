import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runHeroicChestVideoOpen } from '../src/background/backgroundRuntime.ts';

function createMockChrome(initialStorage = {}, tabs = [{ id: 42, active: true, url: 'https://www.hero-wars-alliance.com/game' }]) {
  const storage = structuredClone(initialStorage);
  const alarmsCreated = [];
  const alarmsCleared = [];
  const sentMessages = [];

  const chromeMock = {
    storage: {
      local: {
        async get(keys) {
          if (!keys) return structuredClone(storage);
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) {
            if (k in storage) out[k] = structuredClone(storage[k]);
          }
          return out;
        },
        async set(patch) {
          Object.assign(storage, structuredClone(patch));
        },
      },
    },
    alarms: {
      create(name, info) {
        alarmsCreated.push({ name, ...info });
      },
      clear(name) {
        alarmsCleared.push(name);
      },
    },
    tabs: {
      query(_filter, cb) {
        if (typeof cb === 'function') {
          cb(tabs);
          return;
        }
        return Promise.resolve(tabs);
      },
      async sendMessage(tabId, msg) {
        sentMessages.push({ tabId, msg });
        return { ok: true };
      },
    },
  };

  return { chromeMock, storage, alarmsCreated, alarmsCleared, sentMessages };
}

test('P2-38: SettingsTab Auto Freebies & Resource Collectors uses 2-column grid with all 4 collectors', async () => {
  const src = await readFile(resolve(process.cwd(), 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(src, /useHeroicChestVideoAutomation/);
  assert.match(src, /id="settings-auto-collectors-section"/);
  assert.match(src, /id="settings-auto-collectors-grid"[\s\S]*?grid-cols-1 md:grid-cols-2/);
  assert.match(src, /id="setting-auto-free-spin"/);
  assert.match(src, /id="setting-auto-frontier-rewards"/);
  assert.match(src, /id="setting-auto-realm-resources"/);
  assert.match(src, /id="setting-auto-heroic-chest-video"/);
});

test('P2-38: runHeroicChestVideoOpen schedules single alarm when videoCooldown is in the future', async () => {
  const futureSec = Math.floor(Date.now() / 1000) + 3600;
  const { chromeMock, alarmsCreated, sentMessages } = createMockChrome({
    autoHeroicChestVideoEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
      heroChest_getInfo: { data: { videoCooldown: futureSec } },
    },
  });

  const res = await runHeroicChestVideoOpen(false, chromeMock);
  assert.equal(res.ok, true);
  assert.equal(res.scheduled, true);
  assert.equal(res.nextWakeAt, futureSec * 1000 + 5000);
  assert.equal(sentMessages.length, 0);
  assert.equal(alarmsCreated.length, 1);
  assert.equal(alarmsCreated[0].name, 'hwa-auto-heroic-chest-video');
  assert.equal(alarmsCreated[0].when, futureSec * 1000 + 5000);
});

test('P2-38: runHeroicChestVideoOpen refreshes heroChest_getInfo without blind-opening when cache is missing', async () => {
  const { chromeMock, alarmsCreated, sentMessages } = createMockChrome({
    autoHeroicChestVideoEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
    },
  });

  const res = await runHeroicChestVideoOpen(false, chromeMock);
  assert.equal(res.ok, true);
  assert.equal(res.refreshed, true);
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].msg.calls, [{ name: 'heroChest_getInfo', args: {} }]);
  assert.equal(alarmsCreated.length, 1);
  assert.equal(alarmsCreated[0].name, 'hwa-auto-heroic-chest-video');
});

test('P2-38: runHeroicChestVideoOpen opens strictly free video chest when ready and deduplicates within 60s', async () => {
  const pastSec = Math.floor(Date.now() / 1000) - 10;
  const { chromeMock, storage, alarmsCreated, sentMessages } = createMockChrome({
    autoHeroicChestVideoEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
      heroChest_getInfo: { data: { videoCooldown: pastSec } },
    },
  });

  const first = await runHeroicChestVideoOpen(false, chromeMock);
  assert.equal(first.ok, true);
  assert.equal(first.opened, true);
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].msg.calls, [
    { name: 'heroChest_openChest', args: { count: 1, free: true, video: true, costId: '' } },
    { name: 'heroChest_getInfo', args: {} },
  ]);
  assert.ok(storage.autoHeroicChestVideoState.lastOpenAt > 0);
  assert.equal(alarmsCreated.length, 1);
  assert.equal(alarmsCreated[0].name, 'hwa-auto-heroic-chest-video');

  // Immediate second tick while cache hasn't refreshed yet must NOT double-open
  const second = await runHeroicChestVideoOpen(false, chromeMock);
  assert.equal(second.ok, true);
  assert.equal(second.deduplicated, true);
  assert.equal(sentMessages.length, 1);
});

test('P2-38: runHeroicChestVideoOpen clears alarm when disabled', async () => {
  const { chromeMock, alarmsCleared, sentMessages } = createMockChrome({
    autoHeroicChestVideoEnabled: false,
    popupRpcEnabled: true,
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
    },
  });

  const res = await runHeroicChestVideoOpen(true, chromeMock);
  assert.equal(res.ok, true);
  assert.equal(res.disabled, true);
  assert.deepEqual(alarmsCleared, ['hwa-auto-heroic-chest-video']);
  assert.equal(sentMessages.length, 0);
});
