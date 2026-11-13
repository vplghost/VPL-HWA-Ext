import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, nextTick, ref } from 'vue';
import { recorderEntries, filterRecorderEntries, useRecorder } from '../src/composables/useRecorder.ts';
import { normalizeAutoClaim, normalizePriorityJoin, usePopupAutomation } from '../src/composables/usePopupAutomation.ts';
import { useAccountTeams } from '../src/composables/useAccountTeams.ts';
import { useNow } from '../src/composables/useNow.ts';
import { useStoredFavorites } from '../src/composables/useStoredFavorites.ts';
import { towerActivityState, readyQuestCount } from '../src/composables/activityState.ts';
import { engineDiagnostics } from '../src/composables/engineDiagnostics.ts';

function mountComposable(factory) {
  let value;
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {},
    parentNode: () => null, nextSibling: () => null });
  const app = renderer.createApp({ setup() { value = factory(); return () => null; } });
  app.mount({});
  return { value, unmount: () => app.unmount() };
}
const flush = async () => { await nextTick(); await new Promise((resolve) => setImmediate(resolve)); await nextTick(); };

test('recorder reads only session records, orders numeric indexes and filters MQTT/RPC fields', () => {
  const records = recorderEntries({ 'record:10': { method: 'POST', endpoint: '/rpc', durationMs: 50, timestamp: '2026-11-13T10:00:00Z' },
    'record:2': { method: 'PUBLISH', topic: 'clan/chat', durationMs: 5, timestamp: '2026-11-13T09:00:00Z' },
    apiLogs: [], recordingState: { active: true }, 'record:bad': {} });
  assert.deepEqual(records.map((r) => r.id), ['record:2', 'record:10']);
  assert.equal(filterRecorderEntries(records, 'CLAN')[0].method, 'PUBLISH');
  assert.equal(filterRecorderEntries(records, '', 'duration-desc')[0].durationMs, 50);
  assert.equal(filterRecorderEntries(records, '', 'oldest')[0].id, 'record:2');
  assert.equal(filterRecorderEntries(records, 'absent').length, 0);
});

test('Vue recorder reacts to session changes and uses background clear/export commands', async (t) => {
  const listeners = new Set();
  const sent = [];
  let store = { 'record:0': { method: 'POST', endpoint: '/rpc' } };
  globalThis.chrome = { storage: { session: { get: async () => store }, onChanged: {
    addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } },
  runtime: { sendMessage: async ({ kind }) => { sent.push(kind); if (kind === 'record-clear') store = {};
    return kind === 'record-export' ? { extensionVersion: '0.10.52', records: Object.values(store), interactions: [] } : { active: false }; } } };
  t.after(() => { delete globalThis.chrome; });
  const { value, unmount } = mountComposable(useRecorder);
  await flush();
  assert.equal(value.logs.value.length, 1);
  store['record:1'] = { method: 'PUBLISH', topic: 'clan' };
  for (const fn of listeners) fn({ 'record:1': { newValue: store['record:1'] } }, 'session');
  await flush();
  assert.equal(value.logs.value.length, 2);
  const exported = await value.control('record-export');
  assert.equal(exported.records.length, 2);
  assert.deepEqual(exported.interactions, []);
  await value.control('record-clear');
  assert.equal(value.logs.value.length, 0);
  assert.deepEqual(sent, ['record-export', 'record-clear']);
  unmount(); assert.equal(listeners.size, 0);
});

test('automation normalization preserves opt-out defaults and clamps rally level', () => {
  assert.deepEqual(normalizeAutoClaim(), { mail: true, reports: true, quests: true, onOpen: false });
  assert.equal(normalizeAutoClaim({ mail: false }).mail, false);
  assert.equal(normalizePriorityJoin({ minLevel: 99 }).minLevel, 30);
  assert.equal(normalizePriorityJoin({ minLevel: -10 }).minLevel, 1);
  assert.equal(normalizePriorityJoin().enabled, false);
});

test('popup automation honors RPC gate, claims on open once and saves selected team without stale heroes', async (t) => {
  const listeners = new Set(); const writes = []; const sent = [];
  globalThis.chrome = { storage: { local: { get: async () => ({ autoClaimSettings: { onOpen: true }, popupRpcEnabled: false }),
    set: async (value) => writes.push(value) }, onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } },
  runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } } };
  const calls = [{ name: 'quest_multiFarm', args: { questIds: [42] } }];
  globalThis.hwaHelperPopupData = { getPendingClaims: () => ({ letterIds: [], hasReports: false, questIds: [42], totalCount: 1 }),
    buildAutoClaimCalls: () => ({ calls }) };
  globalThis.hwaHelperExperimentalData = { autoJoinTeamOptions: () => [{ id: 'highest', label: 'Top 5' }] };
  t.after(() => { delete globalThis.chrome; delete globalThis.hwaHelperPopupData; delete globalThis.hwaHelperExperimentalData; });
  const cache = ref({}); const { value, unmount } = mountComposable(() => usePopupAutomation(cache, true));
  await flush();
  await value.claimRewards(); assert.equal(sent.length, 0);
  for (const fn of listeners) fn({ popupRpcEnabled: { newValue: true } }, 'local');
  cache.value = { questGetAll: { data: [] } }; await flush();
  assert.deepEqual(sent, [{ kind: 'claim-rewards', calls }]);
  cache.value = {}; await flush(); assert.equal(sent.length, 1);
  value.priorityAutoJoin.value = { enabled: true, minLevel: 80, teamId: 'highest', heroIds: [1, 2, 3, 4, 5] };
  await value.savePriorityJoin();
  assert.deepEqual(writes.at(-1), { priorityAutoJoin: { enabled: true, minLevel: 30, teamId: 'highest' } });
  unmount(); assert.equal(listeners.size, 0);
});

test('account teams reject unknown accounts, stale loads and account switches during save', async (t) => {
  const writes = []; const listeners = new Set(); const reads = [];
  globalThis.chrome = { storage: { local: { get: () => new Promise((resolve) => reads.push(resolve)),
    set: async (value) => writes.push(value) }, onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } } };
  t.after(() => { delete globalThis.chrome; });
  const account = ref(undefined); const { value, unmount } = mountComposable(() => useAccountTeams(account));
  assert.deepEqual(value.customTeams.value, []);
  assert.equal(reads.length, 0);
  await assert.rejects(value.saveTeams([]), /active game account/);
  account.value = 'alice'; await nextTick();
  account.value = 'bob'; await nextTick();
  const store = { customTeams: { alice: [{ id: 'a', name: 'Alice', heroIds: [1] }], bob: [{ id: 'b', name: 'Bob', heroIds: [2] }] } };
  reads[1](store); await flush(); assert.equal(value.customTeams.value[0].name, 'Bob');
  reads[0](store); await flush(); assert.equal(value.customTeams.value[0].name, 'Bob');
  const pendingSave = value.saveTeams([]);
  account.value = 'alice'; await nextTick();
  reads[2](store);
  await assert.rejects(pendingSave, /account changed/);
  assert.equal(writes.length, 0);
  reads[3](store); await flush();
  await Promise.all([...listeners].map((fn) => fn({ customTeams: { newValue: store.customTeams } }, 'local')));
  reads[4]({ customTeams: {} }); await flush();
  assert.deepEqual(value.customTeams.value, []);
  unmount(); assert.equal(listeners.size, 0);
});

test('resource clock ticks while mounted and stops after unmount', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 });
  const { value, unmount } = mountComposable(() => useNow(1000));
  assert.equal(value.value, 1000);
  t.mock.timers.tick(2000); assert.equal(value.value, 3000);
  unmount(); t.mock.timers.tick(5000); assert.equal(value.value, 3000);
});

test('dashboard uses canonical quest cache and brief-only completed Tower state', () => {
  assert.equal(towerActivityState({ magicTower_briefInfo: { data: { state: 'win' } } }).state, 'done');
  assert.equal(towerActivityState({ magicTower_briefInfo: { state: 'win' } }).detail, 'Cleared today');
  assert.equal(towerActivityState({}).state, 'unknown');
  assert.equal(readyQuestCount({ questGetAll: { data: [{ state: 2 }, { state: '2' }, { state: 3 }] } }), 2);
  assert.equal(readyQuestCount({ quest_getAll: { data: { 42: { state: 2 } } } }), 1);
  assert.equal(readyQuestCount({ questGetAll: { data: [] }, quest_getAll: { data: [{ state: 2 }] } }), 0);
});

test('engine diagnostics distinguish standby, canvas, authenticated bridge and exposed Unity message API', () => {
  assert.equal(engineDiagnostics(null).sendMessage, 'Unknown');
  assert.equal(engineDiagnostics({ hasCanvas: true }).badge, 'Canvas Ready');
  const bridge = engineDiagnostics({ hasCanvas: true, hasRpcHeaders: true });
  assert.equal(bridge.badge, 'Active (RPC Bridge)');
  assert.equal(bridge.sendMessage, 'Not exposed by WebGL build');
  assert.equal(engineDiagnostics({ ready: true, hasSendMessage: true }).sendMessage, 'Available (unityInstance.SendMessage)');
  assert.equal(engineDiagnostics({ rpcUrlAvailable: true }).rpcHeaders, 'RPC URL detected (needs refresh)');
});

test('favorites ignore stale initial reads, clear deleted keys and remove both listeners on unmount', async (t) => {
  const listeners = new Set(); const reads = [];
  globalThis.chrome = { storage: { local: { get: () => new Promise((resolve) => reads.push(resolve)) },
    onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } } };
  t.after(() => { delete globalThis.chrome; });
  const heroes = mountComposable(() => useStoredFavorites('favoriteHeroes'));
  const titans = mountComposable(() => useStoredFavorites('favoriteTitans'));
  assert.equal(listeners.size, 2);
  for (const fn of listeners) fn({ favoriteHeroes: { newValue: [7] }, favoriteTitans: { newValue: [4001] } }, 'local');
  reads[0]({ favoriteHeroes: [1] }); reads[1]({ favoriteTitans: [4002] }); await flush();
  assert.deepEqual([...heroes.value.value], ['7']); assert.deepEqual([...titans.value.value], ['4001']);
  for (const fn of listeners) fn({ favoriteHeroes: { oldValue: [7] }, favoriteTitans: { oldValue: [4001] } }, 'local');
  assert.equal(heroes.value.value.size, 0); assert.equal(titans.value.value.size, 0);
  heroes.unmount(); titans.unmount(); assert.equal(listeners.size, 0);
});
