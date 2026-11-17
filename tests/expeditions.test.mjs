import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, ref, shallowRef, watch, nextTick } from 'vue';
import { expeditionRows, expeditionTeam, expeditionPlan, expeditionActivity, expeditionRefreshCalls } from '../src/utils/expeditions.ts';
import { towerActivityState } from '../src/composables/activityState.ts';

import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
const at = Date.parse('2026-11-14T07:31:23.682Z');
const entry = (data, time = at) => ({ data, updatedAt: new Date(time).toISOString() });
// Shape/values from expeditionGet in the 20261110 dungeon capture; refreshed for this test day.
const rows = Array.from({ length: 8 }, (_, id) => ({ id, slotId: id + 1, status: [5, 6].includes(id) ? 0 : 1,
  heroes: [], endTime: 0, duration: [480, 360, 21600, 1500, 360, 32400, 180, 21600][id],
  day: '20261114', reward: { consumable: { 34: 5 } }, power: [117600, 117600, 29400, 55300, 117600, 55300, 117600, 1500][id],
  attemptsLeft: id === 5 ? 3 : 1 }));
const account = { accountStatus: entry({ id: 1, level: 87 }), userGetInfo: entry({ id: 1, vipPoints: '350', level: '87' }) };
function rpc(name, response, args = {}, time = at, ident = name, error) {
  const call = { name, args, ident };
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(time).toISOString(),
    requestBody: JSON.stringify({ calls: [call] }), responseBody: JSON.stringify({ results: [{ ident, result: error ? { error } : { response } }] }) };
}
function state(extraRows = rows, time = at) { return reducer.merge(account, [rpc('expeditionGet', extraRows, {}, time)]).cache; }
const owned = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [index + 1, { id: index + 1, power: 40000 - index * 1000 }]));

test('hero expeditions require five unique heroes even when one hero meets the power target', () => {
  const heroes = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, power: 100000 - index * 1000 }));
  const team = expeditionTeam(heroes, 1);
  assert.equal(team.length, 5); assert.equal(new Set(team).size, 5);
  assert.equal(expeditionTeam(heroes.slice(0, 4), 1), null);
  assert.equal(expeditionTeam([...heroes.slice(0, 4), heroes[0]], 1), null);
  assert.equal(expeditionTeam(heroes, 1e9), null);
  assert.equal(expeditionTeam(heroes, 0).length, 5);
});

test('a roster with fewer than ten heroes cannot create two hero teams; video stays hero-free', () => {
  const cache = state(rows.map(row => ({ ...row, power: 1 })));
  cache.heroGetAll = entry(Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, { id: index + 1, power: 100 }])));
  const plan = expeditionPlan(cache, at);
  assert.equal(plan.filter(item => item.slotId !== 8).length, 1);
  assert.equal(plan.find(item => item.slotId !== 8).heroes.length, 5);
  assert.deepEqual(plan.find(item => item.slotId === 8).heroes, []);
});

test('Nov15 captured four-hero NotEnough error remains observable without inventing a start', () => {
  // hwa-game-record-202611151008_expedition.json SHA256 8f00149e386c5ba72a5771b0e06941089782271c5747d6ec889c19722df04db7.
  const call = { name: 'artifact_expeditionStart', args: { expeditionId: 0, heroes: [16, 54, 79, 501] }, ident: '00b089a82fad6b180000389583b3d543' };
  const record = { ...rpc(call.name, {}, call.args), timestamp: '2026-11-15T03:07:46.115Z',
    requestBody: JSON.stringify({ calls: [call] }), responseBody: JSON.stringify({ error: { name: 'NotEnough',
      description: 'hero count in /app/classes/RPCRequest.php (1324); rpc=`artifact_expeditionStart`', call } }) };
  const cache = reducer.merge(state(), [record]).cache;
  assert.equal(cache.expeditionStartStatus.data.success, false); assert.match(cache.expeditionStartStatus.data.error, /hero count/);
  assert.equal(cache.expeditionStatus.data.rows[0].status, 1); assert.equal(cache.expeditionStatus.data.rows[0].endTime, 0);
});

test('snapshot keeps every slot and distinguishes VIP8, subscription, unknown and no-hero video expeditions', () => {
  const cache = state(), model = expeditionRows(cache, at);
  assert.equal(model.length, 8);
  assert.equal(model[5].state, 'locked'); assert.match(model[5].reason, /subscription/);
  assert.equal(model[6].state, 'locked'); assert.match(model[6].reason, /VIP 8.*VIP 3/);
  assert.equal(model[7].needsHeroes, false);
  assert.deepEqual(expeditionPlan(cache, at).map(item => item.expeditionId), [7]);
  assert.equal(expeditionActivity(cache, at).detail, '0 running · 0 ready · 0/6 completed · 2 locked');
  assert.ok(expeditionRows({}, at).every(row => row.state === 'unknown'));
  assert.equal(expeditionPlan(cache, at + 86400000).length, 0, 'Yesterday idle records cannot dispatch today');
});

test('automatic teams are owned, distinct, fit server power and preserve running/ready heroes', () => {
  const withBusy = rows.map(row => row.id === 0 ? { ...row, status: 2, heroes: [1, 2, 3, 4, 5], endTime: at / 1000 + 10 } : row);
  const cache = state(withBusy); cache.heroGetAll = entry(owned);
  const plan = expeditionPlan(cache, at), ids = plan.flatMap(item => item.heroes);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => owned[id] && id > 5));
  assert.ok(plan.every(item => item.slotId === 8 ? !item.heroes.length : item.heroes.length === 5 && item.power >= rows[item.expeditionId].power));
  assert.ok(plan.every(item => ![0, 5, 6].includes(item.expeditionId)));
  assert.deepEqual(expeditionPlan(cache, at + 10000).flatMap(item => item.heroes), ids, 'Expired timers do not release heroes before collection');
  const model = expeditionRows(cache, at + 10000);
  assert.equal(model[0].state, 'ready'); assert.equal(model[0].progress, 100);
  assert.equal(model[0].reason, 'Ready to collect');
});

test('captured start responses retain authoritative endTime and block re-use without crediting quest rewards', () => {
  // hwa-game-record-202611141432_start_expedition.json SHA256 527689ed2808fd77701d33382b94a15ea332a9d3388629578a2c619812202a95.
  const starts = [[4, [15, 16, 72, 2, 56], 1794641843], [7, [], 1794663090],
    [1, [54, 502, 79, 71, 501], 1794641860], [2, [35, 43, 34, 38, 42], 1794663125], [3, [33, 70, 37, 49, 78], 1794643633]];
  let cache = state();
  for (const [index, [id, heroes, endTime]] of starts.entries()) {
    const event = rpc('artifact_expeditionStart', { endTime }, { expeditionId: id, heroes }, at + index + 1, `start-${id}`);
    cache = reducer.merge(cache, [event]).cache;
    const row = cache.expeditionStatus.data.rows.find(row => row.id === id);
    assert.equal(row.endTime, endTime); assert.equal(row.status, 2); assert.equal(row.attemptsLeft, 0);
    assert.deepEqual(Array.from(row.heroes), heroes);
    assert.equal(reducer.merge(cache, [event]).changed, false);
  }
  assert.equal(cache['resource:consumable:45'], undefined);
  assert.equal(expeditionRows(cache, at + 100).filter(row => row.state === 'running').length, 5);
  const stale = reducer.merge(cache, [rpc('expeditionGet', rows)]).cache;
  assert.equal(stale.expeditionStatus.data.rows.filter(row => row.status === 2).length, 5, 'An older snapshot cannot erase accepted starts');
});

test('same-batch idle snapshots cannot overwrite a newly confirmed start', () => {
  const start = rpc('artifact_expeditionStart', { endTime: 1794641843 }, { expeditionId: 4, heroes: [15, 16, 72, 2, 56] }, at + 1, 'start');
  const snapshot = rpc('expeditionGet', rows, {}, at + 1, 'snapshot');
  const a = JSON.parse(start.requestBody), b = JSON.parse(snapshot.requestBody);
  const x = JSON.parse(start.responseBody), y = JSON.parse(snapshot.responseBody);
  const record = { ...start, requestBody: JSON.stringify({ calls: [...a.calls, ...b.calls] }),
    responseBody: JSON.stringify({ results: [...x.results, ...y.results] }) };
  const cache = reducer.merge(state(), [record]).cache;
  assert.equal(cache.expeditionStatus.data.rows.find(row => row.id === 4).status, 2);
});

test('rejections including matching top-level errors settle without inventing a start; foreign/malformed calls do not dispatch', () => {
  const call = { name: 'artifact_expeditionStart', args: { expeditionId: 4, heroes: [15, 16, 72, 2, 56] }, ident: 'failed' };
  const event = { ...rpc(call.name, {}, call.args), requestBody: JSON.stringify({ calls: [call] }),
    responseBody: JSON.stringify({ error: { name: 'NotEnough', description: 'Hero power too low', call } }) };
  const cache = reducer.merge(state(), [event]).cache;
  assert.equal(cache.expeditionStartStatus.data.success, false);
  assert.match(cache.expeditionStartStatus.data.error, /power too low/);
  assert.equal(cache.expeditionStatus.data.rows[4].status, 1);
  for (const args of [{ expeditionId: 4, heroes: [1, 1] }, { expeditionId: 4, heroes: [1], buy: true }, { expeditionId: -1, heroes: [] }]) {
    assert.equal(reducer.merge(state(), [rpc(call.name, { endTime: 1794641843 }, args)]).changed, false);
  }
  const foreign = { ...cache, accountStatus: entry({ id: 2 }) };
  assert.ok(expeditionRows(foreign, at).every(row => row.state === 'unknown'));
  const switched = reducer.merge({ ...cache, heroGetAll: entry(owned) }, [rpc('userGetInfo', { id: 2, name: 'Other', level: 50 }, {}, at + 100)]).cache;
  assert.equal(switched.expeditionStatus, undefined); assert.equal(switched.heroGetAll, undefined);
});

test('running progress uses server end and duration, complete status excludes locks from the denominator', () => {
  const cache = state(rows.map(row => row.status === 0 ? row : { ...row, status: 3, attemptsLeft: 0 }));
  assert.equal(expeditionActivity(cache, at).state, 'done'); assert.equal(expeditionActivity(cache, at).progress, 100);
  const active = state([{ ...rows[0], status: 2, endTime: (at + 240000) / 1000, duration: 480, heroes: [1] }]);
  assert.equal(expeditionRows(active, at)[0].progress, 50);
  assert.equal(expeditionRows(active, at + 240000)[0].progress, 100);
});

async function view(t) {
  const source = await readFile(new URL('../src/components/dialogs/ExpeditionsModal.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const clock = ref(at + 1000), cache = ref(state()); cache.value.heroGetAll = entry(owned);
  const calls = [], callbacks = [], stops = [], timers = [], props = { modelValue: true };
  const boundary = { computed, ref, shallowRef, nextTick, Date: class extends Date { static now() { return clock.value; } },
    defineProps: () => props, defineEmits: () => () => {}, onUnmounted() {},
    watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; },
    useNow: () => clock, useGameConnection: () => ({ hasGameTab: ref(true) }),
    useRpcCache: () => ({ cache, dispatchRpc: batch => { calls.push(batch); return new Promise(resolve => callbacks.push(resolve)); } }),
    expeditionRows, expeditionPlan, expeditionRefreshCalls,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, getHeroMetadata: id => ({ name: `Hero ${id}` }) };
  vm.runInNewContext(js + '\nglobalThis.ui = { startAvailable, startNext, collect, refresh, refreshing, isSlotBusy, getSlotBusyText, transitioningSlots, pending, autoRunning, message, rows, plan };', boundary);
  t.after(() => stops.forEach(stop => stop()));
  return { ...boundary.ui, cache, clock, props, calls, callbacks, timers };
}
const flush = async () => { await nextTick(); await nextTick(); };

test('real dialog waits through queued ack and confirms each auto start before sending the next', async t => {
  const v = await view(t); v.startAvailable();
  assert.equal(v.calls.length, 1); assert.ok(v.pending.value);
  v.callbacks.shift()({ ok: true, queued: true }); await flush();
  assert.equal(v.calls.length, 1);
  const first = v.calls[0][0];
  assert.equal(first.args.heroes.length, 5);
  v.clock.value = at + 1001;
  v.cache.value = reducer.merge(v.cache.value, [rpc(first.name, { endTime: (at + 361000) / 1000 }, first.args, at + 1001, 'accepted')]).cache;
  await flush();
  assert.equal(v.calls.length, 2);
  assert.ok(v.calls.every(batch => batch[0].name === 'artifact_expeditionStart'));
  const all = v.calls.flatMap(batch => batch[0].args.heroes);
  assert.equal(new Set(all).size, all.length);
  v.autoRunning.value = false; // Stop after current: pending confirmation is retained.
  v.callbacks.shift()({ ok: true, queued: true }); await flush();
  const second = v.calls[1][0];
  v.clock.value = at + 1002;
  v.cache.value = reducer.merge(v.cache.value, [rpc(second.name, { endTime: (at + 400000) / 1000 }, second.args, at + 1002, 'second')]).cache;
  await flush(); assert.equal(v.calls.length, 2); assert.equal(v.pending.value, null);
});

test('real dialog stops on rejection/timeout, never retries uncertain starts, and resets on account change', async t => {
  const v = await view(t); v.startAvailable();
  v.callbacks.shift()({ ok: true, queued: true }); await flush();
  v.timers[0](); assert.ok(v.pending.value); assert.equal(v.autoRunning.value, false);
  await v.startNext(); assert.equal(v.calls.length, 1);
  v.cache.value.accountStatus = entry({ id: 2 }); await flush();
  assert.equal(v.pending.value, null); assert.equal(v.plan.value.length, 0);
  const w = await view(t); w.startAvailable(); w.callbacks.shift()({ ok: false, error: 'RPC disabled' }); await flush();
  assert.equal(w.pending.value, null); assert.equal(w.autoRunning.value, false); assert.match(w.message.value, /RPC disabled/);
});

test('captured expedition collection releases heroes, updates exact rewards and quest progress only once', () => {
  const before = state(rows.map(row => [1, 4].includes(row.id) ? { ...row, status: 2, endTime: at / 1000 - 1, heroes: row.id === 1 ? [54, 502, 79, 71, 501] : [15, 16, 72, 2, 56], attemptsLeft: 0 } : row));
  before.inventoryGet = entry({ consumable: { 35: 10, 39: 20, 36: 30, 40: 40 } });
  for (const [id, amount] of [[35, 10], [39, 20], [36, 30], [40, 40]]) before['resource:consumable:' + id] = entry({ amount });
  const captured = (id, reward, progress, offset) => {
    const event = rpc('expeditionFarm', { reward, newExpedition: null }, { expeditionId: id }, at + offset, 'collect-' + id);
    const body = JSON.parse(event.responseBody);
    body.results[0].result.quests = [{ id: 439, state: 1, progress, reward: { gold: 65000, consumable: { 44: 1 } } }];
    event.responseBody = JSON.stringify(body); return event;
  };
  const one = captured(1, { consumable: { 35: 7, 39: 12 } }, 252, 1);
  const two = captured(4, { consumable: { 36: 4, 40: 7 } }, 253, 2);
  const cache = reducer.merge(before, [one, two]).cache;
  for (const id of [1, 4]) {
    const row = cache.expeditionStatus.data.rows.find(row => row.id === id);
    assert.equal(row.status, 3); assert.equal(row.endTime, 0); assert.equal(row.heroes.length, 0);
  }
  for (const [id, amount] of [[35, 17], [39, 32], [36, 34], [40, 47]]) {
    assert.equal(cache['resource:consumable:' + id].data.amount, amount);
    assert.equal(cache.inventoryGet.data.consumable[id], amount);
  }
  assert.equal(cache.questGetAll.data[439].progress, 253);
  assert.equal(cache['resource:gold'], undefined); assert.equal(cache['resource:consumable:44'], undefined);
  assert.equal(reducer.merge(cache, [one, two]).changed, false);
  const stale = reducer.merge(cache, [rpc('expeditionGet', before.expeditionStatus.data.rows)]).cache;
  assert.equal(stale.expeditionStatus.data.rows[1].status, 3);
});

test('collection snapshots win over reward deltas and rejection does not release heroes', () => {
  const before = state(rows.map(row => row.id === 1 ? { ...row, status: 2, heroes: [1, 2], endTime: at / 1000 - 1, attemptsLeft: 0 } : row));
  const collect = rpc('expeditionFarm', { reward: { consumable: { 35: 7 } }, newExpedition: null }, { expeditionId: 1 }, at + 1);
  const snapshot = rpc('inventoryGet', { consumable: { 35: 100 } }, {}, at + 1);
  const a = JSON.parse(collect.requestBody), b = JSON.parse(snapshot.requestBody), x = JSON.parse(collect.responseBody), y = JSON.parse(snapshot.responseBody);
  const together = { ...collect, requestBody: JSON.stringify({ calls: [...a.calls, ...b.calls] }), responseBody: JSON.stringify({ results: [...x.results, ...y.results] }) };
  const cache = reducer.merge(before, [together]).cache;
  assert.equal(cache['resource:consumable:35'].data.amount, 100);
  assert.equal(cache.inventoryGet.data.consumable[35], 100);
  const call = { name: 'expeditionFarm', args: { expeditionId: 1 }, ident: 'rejected' };
  const rejected = { ...collect, requestBody: JSON.stringify({ calls: [call] }), responseBody: JSON.stringify({ error: { name: 'NotReady', description: 'Not ready', call } }) };
  const failed = reducer.merge(before, [rejected]).cache;
  assert.equal(failed.expeditionCollectStatus.data.success, false);
  assert.equal(failed.expeditionStatus.data.rows[1].status, 2);
  assert.equal(failed['resource:consumable:35'], undefined);
});

test('collecting an overnight expedition does not refresh yesterday idle slots into start eligibility', () => {
  const before = state(rows.map(row => row.id === 1 ? { ...row, status: 2, heroes: [1], endTime: at / 1000 + 1000 } : row));
  const nextDay = at + 86400000;
  const cache = reducer.merge(before, [rpc('expeditionFarm', { reward: { consumable: { 35: 7 } }, newExpedition: null }, { expeditionId: 1 }, nextDay)]).cache;
  assert.equal(expeditionRows(cache, nextDay)[1].state, 'done');
  assert.equal(expeditionPlan(cache, nextDay).length, 0);
});

test('real dialog Collect sends exact ID only when ready, serializes with starts, and waits for confirmation', async t => {
  const v = await view(t);
  await v.collect(2); assert.equal(v.calls.length, 0, 'Idle is not collectable');
  v.cache.value = { ...state(rows.map(row => row.id === 1 ? { ...row, status: 2, endTime: at / 1000 - 1, heroes: [1], attemptsLeft: 0 } : row)), heroGetAll: entry(owned) };
  v.collect(2); await v.collect(2); await v.startNext();
  assert.equal(v.calls.length, 1);
  assert.equal(JSON.stringify(v.calls[0]), JSON.stringify([{ name: 'expeditionFarm', args: { expeditionId: 1 } }]));
  v.callbacks.shift()({ ok: true, queued: true }); await flush(); assert.ok(v.pending.value);
  v.timers[0](); await v.collect(2); assert.equal(v.calls.length, 1); assert.ok(v.pending.value);
  v.clock.value = at + 1001;
  v.cache.value = reducer.merge(v.cache.value, [rpc('expeditionFarm', { reward: { consumable: { 35: 7 } }, newExpedition: null }, { expeditionId: 1 }, at + 1001, 'collected')]).cache;
  await flush(); assert.equal(v.pending.value, null); assert.equal(v.rows.value[1].state, 'done'); assert.match(v.message.value, /rewards collected/);
  await v.collect(2); assert.equal(v.calls.length, 1);
});

test('Tower completed final boss snapshot stays Done after briefInfo in either order, but untouched/reset floors do not', () => {
  const floor = { floorNumber: 23, currentRoomNumber: 0, rooms: { 1: { type: 'boss_battle', state: 'room_completed' } } };
  const full = rpc('magicTower_getAll', { skipState: 'disabled', floorData: floor });
  const brief = rpc('magicTower_briefInfo', { state: 'win', deadHeroesCount: 0 });
  for (const records of [[full], [brief, full], [full, brief]]) {
    const cache = reducer.merge({}, records).cache;
    assert.equal(cache.towerStatus.data.isCleared, true); assert.equal(cache.towerSession?.data.completed ?? true, true);
    assert.equal(towerActivityState(cache, at).state, 'done');
  }
  const legacy = { towerStatus: entry({ isCleared: false, floorNumber: 23, floorData: floor }),
    towerSession: entry({ floorNumber: 23, rooms: floor.rooms, completed: false }) };
  assert.equal(towerActivityState(legacy, at).state, 'done', 'Existing caches recover without replay');
  for (const changed of [{ ...floor, floorNumber: 22 }, { ...floor, rooms: { 1: { type: 'boss_battle', state: 'initial' } } },
    { ...floor, rooms: { 1: { type: 'hero_battle', state: 'room_completed' } } }]) {
    const cache = reducer.merge({}, [rpc('magicTower_getAll', { floorData: changed })]).cache;
    assert.notEqual(towerActivityState(cache, at).state, 'done');
  }
  assert.equal(towerActivityState(legacy, at + 86400000).state, 'unknown');
  legacy.towerStatus = entry({ floorNumber: 1, isCleared: false }, at + 1);
  assert.equal(towerActivityState(legacy, at + 1).state, 'pending');
});

test('dialog refresh and slot actions manage in-place busy state without flashing empty UI', async t => {
  const v = await view(t);
  // Initial state has rows populated from state
  assert.equal(v.rows.value.length, 8);
  assert.equal(v.refreshing.value, false);

  // Trigger refresh
  const refreshPromise = v.refresh();
  assert.equal(v.refreshing.value, true, 'refreshing overlay must activate immediately');
  assert.equal(v.calls.length, 1);
  assert.equal(v.calls[0][0].name, 'userGetInfo');

  // While refreshing is in flight, rows remain stable
  assert.equal(v.rows.value.length, 8, 'rows must not collapse or blank out during refresh');

  // Complete refresh RPC response
  v.callbacks.shift()({ ok: true });
  await refreshPromise;
  // Timer for smooth finish
  if (v.timers.length) v.timers.at(-1)();
  assert.equal(v.refreshing.value, false);

  // Test slot-level busy state during collect
  v.cache.value = { ...state(rows.map(row => row.id === 1 ? { ...row, status: 2, endTime: at / 1000 - 1, heroes: [1], attemptsLeft: 0 } : row)), heroGetAll: entry(owned) };
  assert.equal(v.isSlotBusy(2, 1), false);
  v.collect(2);
  assert.equal(v.isSlotBusy(2, 1), true, 'slot must be marked busy during collection');
  assert.match(v.getSlotBusyText(2, 1), /Collecting rewards/);
});

