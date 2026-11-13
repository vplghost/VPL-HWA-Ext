import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, nextTick } from 'vue';
import { selectSquadStorage } from '../src/utils/squadStorage.ts';

function mountComposable(factory) {
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  });
  let result;
  const app = renderer.createApp({ setup() { result = factory(); return () => null; } });
  app.mount({});
  return { result, unmount: () => app.unmount() };
}
function events() {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => listeners.forEach(fn => fn(...args)), listeners };
}

test('Vue cache startup coalesces reads, preserves newer events, and handles removals', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  let finishRead;
  let gets = 0;
  const onChanged = events();
  const writes = [];
  globalThis.chrome = { storage: { onChanged,
    local: { get: () => { gets++; return new Promise(resolve => { finishRead = resolve; }); }, set: value => writes.push(value) },
    session: { get: async () => ({ rpcQueueCounts: { a: 2 }, recordingState: { active: false } }) },
  }, runtime: { sendMessage(message, callback) { callback({ ok: true, message }); } } };
  const { useRpcCache } = await import('../src/composables/useRpcCache.ts?runtime-test');
  const a = mountComposable(useRpcCache);
  const b = mountComposable(useRpcCache);
  t.after(() => { a.unmount(); b.unmount(); });
  assert.equal(gets, 1);
  const waiting = a.result.reload();
  onChanged.emit({ rpcCache: { newValue: { live: { data: 2 } } } }, 'local');
  onChanged.emit({ rpcQueueCounts: { newValue: { b: 7 } } }, 'session');
  finishRead({ rpcCache: { stale: { data: 1 } } });
  await waiting;
  assert.deepEqual(a.result.cache.value, { live: { data: 2 } });
  assert.equal(a.result.rpcQueueCount.value, 7);
  await a.result.updateCacheLocally(draft => { draft.live.data = 3; });
  assert.equal(a.result.cache.value.live.data, 3);
  assert.deepEqual(writes, [], 'optimistic state must not overwrite background storage');
  assert.equal((await a.result.dispatchRpc([{ name: 'inventoryGet' }])).message.kind, 'refresh-rpc');
  globalThis.chrome.runtime.sendMessage = (_, callback) => {
    globalThis.chrome.runtime.lastError = { message: 'Background disconnected' };
    callback();
    delete globalThis.chrome.runtime.lastError;
  };
  assert.deepEqual(await a.result.dispatchRpc([]), { ok: false, error: 'Background disconnected' });
  onChanged.emit({ rpcCache: {}, recordingState: {} }, 'local');
  onChanged.emit({ rpcQueueCounts: {} }, 'session');
  assert.deepEqual(a.result.cache.value, {});
  assert.equal(a.result.recordingState.value.active, false);
  assert.equal(a.result.rpcQueueCount.value, 0);
});

test('Squad storage never falls back to another account and scopes preferences', () => {
  const stored = { customTeams: { 1: [{ id: 'one' }], 2: { first: { id: 'two' } } },
    raidPreferences: { accountId: 1, rallyTeam: 'custom:one' } };
  assert.deepEqual(selectSquadStorage(stored, null, 'raidPreferences', 'rallyTeam'), { teams: [], selected: '' });
  assert.deepEqual(selectSquadStorage(stored, 2, 'raidPreferences', 'rallyTeam'), { teams: [{ id: 'two' }], selected: '' });
  assert.equal(selectSquadStorage(stored, '1', 'raidPreferences', 'rallyTeam').selected, 'custom:one');
});

test('Vue theme follows system and external storage changes and cleans listeners', async (t) => {
  const prior = { chrome: globalThis.chrome, document: globalThis.document, window: globalThis.window };
  t.after(() => Object.assign(globalThis, prior));
  const storage = events();
  const mediaListeners = new Set();
  const media = { matches: false, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  let dark;
  const root = { classList: { toggle: (_, value) => { dark = value; } }, style: {} };
  globalThis.document = { documentElement: root };
  globalThis.window = { matchMedia: () => media };
  const writes = [];
  globalThis.chrome = { storage: { onChanged: storage, local: { get: async () => ({ theme: 'system' }), set: async value => { writes.push(value); } } } };
  const { useTheme } = await import('../src/composables/useTheme.ts?runtime-test');
  const mounted = mountComposable(useTheme);
  await nextTick();
  assert.equal(dark, false);
  media.matches = true;
  mediaListeners.forEach(fn => fn());
  assert.equal(dark, true);
  storage.emit({ theme: { newValue: 'light' } }, 'local');
  assert.equal(dark, false);
  assert.equal(mounted.result.theme.value, 'light');
  assert.deepEqual(writes, [], 'hydrating theme must not rewrite preferences');
  mounted.result.applyTheme('dark');
  assert.equal(dark, true);
  assert.deepEqual(writes, [{ theme: 'dark' }]);
  mounted.unmount();
  assert.equal(mediaListeners.size, 0);
  assert.equal(storage.listeners.size, 0);
});

test('Game connection shares polling and releases listeners after its last consumer', async (t) => {
  const previous = { chrome: globalThis.chrome, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  t.after(() => Object.assign(globalThis, previous));
  const onChanged = events();
  const onUpdated = events();
  const onRemoved = events();
  let intervals = 0;
  let cleared = 0;
  globalThis.setInterval = () => ++intervals;
  globalThis.clearInterval = () => cleared++;
  globalThis.chrome = { runtime: { getManifest: () => ({ version: '0.10.52' }),
    sendMessage: (_, callback) => callback({ ok: true, hasGameTab: true, gameEngineStatus: { ready: true } }) },
    storage: { onChanged, local: { get: async () => ({ gameEngineStatus: { ready: true } }) } },
    tabs: { onUpdated, onRemoved } };
  const { useGameConnection } = await import('../src/composables/useGameConnection.ts?runtime-test');
  const a = mountComposable(useGameConnection);
  const b = mountComposable(useGameConnection);
  await nextTick();
  assert.equal(intervals, 1);
  assert.equal(onUpdated.listeners.size, 1);
  assert.equal(a.result.isHealthy.value, true);
  a.unmount();
  assert.equal(cleared, 0);
  b.unmount();
  assert.equal(cleared, 1);
  assert.equal(onChanged.listeners.size, 0);
  assert.equal(onUpdated.listeners.size, 0);
  assert.equal(onRemoved.listeners.size, 0);
});

test('Rejected troop actions never fabricate queues, collected units, or healing state', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  const snapshot = {
    buildingStatus: { data: { buildings: [{ buildingId: 182, level: 1 }] } },
    'getUnitSummary:unit': { data: { available: [{ unitId: 1, count: 2 }] } },
    'getTrainings:unit': { data: { trainingQueues: [{ unitId: 1, unitCount: 3, startDate: 1, duration: 10 }] } },
    'getHealing:unit': { data: { injuredUnits: [{ unitId: 1, count: 4 }], healing: { startDate: 1, duration: 1, units: [{ unitId: 1, count: 4 }] } } },
  };
  const writes = [];
  const sent = [];
  globalThis.chrome = { storage: { onChanged: events(), local: {
    get: async () => ({ rpcCache: structuredClone(snapshot), troopTrainSettings: { maxTargets: { 0: 100 } } }),
    set: async value => writes.push(value),
  } }, runtime: { sendMessage(message, callback) { sent.push(message); callback({ ok: false, error: 'RPC disabled' }); } } };
  const { useTroopTraining } = await import('../src/composables/useTroopTraining.ts');
  const { useRpcCache } = await import('../src/composables/useRpcCache.ts');
  const mounted = mountComposable(() => ({ training: useTroopTraining(), cache: useRpcCache() }));
  t.after(mounted.unmount);
  await mounted.result.cache.reload();
  await nextTick();
  const before = JSON.stringify(mounted.result.cache.cache.value);
  await mounted.result.training.collectTraining(snapshot['getTrainings:unit'].data.trainingQueues[0]);
  await mounted.result.training.startTrain(0, 1);
  await mounted.result.training.healAll();
  await mounted.result.training.syncHealed();
  assert.equal(JSON.stringify(mounted.result.cache.cache.value), before);
  assert.deepEqual(writes, []);
  assert.ok(sent.some(message => message.calls.some(call => call.name === 'completeHealing')));
  // Simulate the next authoritative idle-hospital snapshot before testing a rejected start.
  snapshot['getHealing:unit'].data.healing = null;
  await mounted.result.cache.reload();
  const beforeHeal = JSON.stringify(mounted.result.cache.cache.value);
  await mounted.result.training.healAll();
  assert.equal(JSON.stringify(mounted.result.cache.cache.value), beforeHeal);
  assert.deepEqual(writes, []);
  assert.ok(sent.some(message => message.calls.some(call => call.name === 'completeTraining')));
  assert.ok(sent.some(message => message.calls.some(call => call.name === 'startTraining')));
  assert.ok(sent.some(message => message.calls.some(call => call.name === 'startHealing')));
});
