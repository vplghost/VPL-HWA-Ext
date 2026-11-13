import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, ref, shallowRef, watch, nextTick } from 'vue';
import { campAttackError, campAttackCalls, campHeroIds, BRIGAND_ENERGY_COST } from '../src/utils/brigandCamp.ts';
import { getAmountAt } from '../src/utils/resourceData.ts';

const context = { TextEncoder };
for (const file of ['refillable-rules', 'resource-data', 'rpc-cache']) {
  vm.runInNewContext(await readFile(new URL('../extension/' + file + '.js', import.meta.url), 'utf8'), context);
}
const reducer = context.hwaHelperRpcCache;
const at = '2026-11-13T09:02:02.924Z';
const campId = '2eb37df6-e1f1-4d1d-8cf2-36822ec986e6';
const heroes = [79, 72, 16, 54, 60];
const rewards = [{ type: 'lootboxChanced', id: 27, amount: 1 }, { type: 'coin', id: 40077, amount: 135 }, { type: 'gold', id: 0, amount: 15000 }, { type: 'experience', id: 0, amount: 6 }];
function record(result = { response: { reward: rewards } }, timestamp = at, ident = 'camp-1') {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp,
    requestBody: JSON.stringify({ calls: [{ ...campAttackCalls(campId, heroes)[0], ident }] }),
    responseBody: JSON.stringify({ results: [{ ident, result }] }) };
}
function baseline(amount = 100, updatedAt = '2026-11-13T09:01:00.000Z') {
  return { 'resource:world-energy': { key: 'resource:world-energy', data: { amount, label: 'World Energy' }, updatedAt },
    worldEnergyStatus: { key: 'worldEnergyStatus', data: { energy: amount }, updatedAt } };
}

test('successful camp receipt deducts ten world energy once and retains exact team and rewards', () => {
  let state = reducer.merge(baseline(), [record()]).cache;
  assert.equal(state['resource:world-energy'].data.amount, 90);
  assert.equal(state.worldEnergyStatus.data.energy, 90);
  assert.equal(state.brigandCampStatus.data.success, true);
  assert.equal(JSON.stringify(state.brigandCampStatus.data.heroIds), JSON.stringify(heroes));
  assert.equal(JSON.stringify(state.brigandCampStatus.data.rewards), JSON.stringify(rewards));
  assert.equal(state['resource:gold'].data.amount, 15000);
  assert.equal(state['resource:coin:40077'].data.amount, 135);
  state = reducer.merge(state, [record(), record()]).cache;
  assert.equal(state['resource:world-energy'].data.amount, 90);
  assert.equal(state['resource:gold'].data.amount, 15000);
  assert.equal(state['resource:lootboxChanced:27'].data.amount, 1);
  assert.equal(state.marchStatus, undefined);
});

test('camp errors and unconfirmed responses never spend energy or grant rewards', () => {
  for (const result of [{ error: { code: 'notEnoughEnergy' } }, { response: { error: 'campNotFound' } }, { response: null }, { response: {} }]) {
    const state = reducer.merge(baseline(), [record(result)]).cache;
    assert.equal(state['resource:world-energy'].data.amount, 100);
    assert.equal(state['resource:gold'], undefined);
    if (result.error || result.response?.error) assert.equal(state.brigandCampStatus.data.success, false);
    else assert.equal(state.brigandCampStatus, undefined);
  }
});

test('camp deduction requires known world energy and respects newer snapshots and regeneration', () => {
  assert.equal(reducer.merge({}, [record()]).cache['resource:world-energy'], undefined);
  const newer = reducer.merge(baseline(150, '2026-11-13T09:03:00Z'), [record()]).cache;
  assert.equal(newer['resource:world-energy'].data.amount, 150);
  const initial = baseline(100);
  initial['resource:world-energy'].data = { amount: 100, cap: 200, lastRefillAt: Date.parse(at) - 120000, refillEveryMs: 60000, refillAmount: 1 };
  assert.equal(reducer.merge(initial, [record()]).cache['resource:world-energy'].data.amount, 92);
  const full = baseline(200);
  full['resource:world-energy'].data = { amount: 200, cap: 200, lastRefillAt: Date.parse(at) - 120000, refillEveryMs: 60000, refillAmount: 1 };
  const state = reducer.merge(full, [record()]).cache;
  assert.equal(state['resource:world-energy'].data.amount, 190);
  assert.equal(state['resource:world-energy'].data.lastRefillAt, Date.parse(at));
});

test('observed globalMapCamp team is retained only after successful battle_teamSet', () => {
  const input = record();
  input.requestBody = JSON.stringify({ calls: [{ name: 'battle_teamSet', ident: 'team', args: { key: 'globalMapCamp', units: [heroes] } }] });
  input.responseBody = JSON.stringify({ results: [{ ident: 'team', result: { response: null } }] });
  assert.equal(JSON.stringify(reducer.merge({}, [input]).cache.brigandCampTeam.data.units), JSON.stringify([heroes]));
  input.responseBody = JSON.stringify({ results: [{ ident: 'team', result: { error: 'invalidTeam' } }] });
  assert.equal(reducer.merge({}, [input]).cache.brigandCampTeam, undefined);
});

test('camp commands validate owned unique heroes, UUID and known energy and preserve the captured contract', () => {
  const owned = Object.fromEntries(heroes.map(id => [id, {}]));
  assert.equal(campAttackError(campId, heroes, owned, 10), '');
  for (const [id, team, energy] of [['bad', heroes, 20], [campId, [], 20], [campId, [79, 79], 20], [campId, [999], 20], [campId, heroes, null], [campId, heroes, 9]]) {
    assert.ok(campAttackError(id, team, owned, energy));
  }
  assert.equal(BRIGAND_ENERGY_COST, 10);
  assert.deepEqual(campHeroIds([heroes]), heroes);
  assert.deepEqual(campAttackCalls(' ' + campId + ' ', heroes), [{ name: 'winCampBattle', feature: 'camp', args: { campId, userHeroesIds: heroes } }]);
});

test('actual Brigand dialog prevents duplicate sends and waits for server result rather than transport ack', async t => {
  const source = await readFile(new URL('../src/components/dialogs/BrigandCampModal.vue', import.meta.url), 'utf8');
  const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const state = ref({ ...baseline(), accountStatus: { data: { id: 1 } }, heroGetAll: { data: Object.fromEntries(heroes.map(id => [id, { power: id }])) } });
  const calls = [], callbacks = [], timers = [], stops = [];
  const context = { computed, ref, shallowRef, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; },
    onMounted() {}, onUnmounted() {}, defineProps: () => ({ modelValue: true }), defineEmits: () => () => {},
    useRpcCache: () => ({ cache: state, dispatchRpc: batch => { calls.push(batch); return new Promise(resolve => callbacks.push(resolve)); } }),
    useAccountTeams: () => ({ customTeams: ref([]) }), getHeroMetadata: () => ({}), getItemName: () => '',
    BRIGAND_ENERGY_COST, campHeroIds, campAttackError, campAttackCalls, getAmountAt,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, clearInterval() {}, Date };
  t.after(() => stops.forEach(stop => stop()));
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(js + '\nglobalThis.api = { attack, pending, message, error, campId, heroIds, validation };', context);
  const ui = context.api;
  ui.campId.value = campId;
  ui.heroIds.value = heroes;
  const sending = ui.attack();
  await ui.attack();
  assert.equal(calls.length, 1);
  callbacks.shift()({ ok: true, queued: true });
  await sending;
  assert.ok(ui.pending.value, 'Queue acceptance must not mark a victory');
  assert.match(ui.message.value, /queued/);
  timers[0]();
  assert.ok(ui.pending.value, 'A timeout must not permit unsafe automatic retries');
  const receiptAt = new Date().toISOString();
  state.value.brigandCampStatus = { updatedAt: receiptAt, data: { campId: 'unrelated', success: true } };
  await nextTick();
  assert.ok(ui.pending.value);
  state.value.brigandCampStatus = { updatedAt: receiptAt, data: { campId, success: false, error: 'notEnoughEnergy' } };
  await nextTick();
  assert.equal(ui.pending.value, null);
  assert.equal(ui.error.value, 'notEnoughEnergy');
  const retry = ui.attack();
  callbacks.shift()({ ok: false, error: 'Popup RPC calls are disabled in Settings.' });
  await retry;
  assert.equal(ui.pending.value, null);
  assert.match(ui.error.value, /disabled/);
  const race = ui.attack();
  state.value.brigandCampStatus = { updatedAt: new Date(Date.now() + 1).toISOString(), data: { campId, success: true } };
  await nextTick();
  callbacks.shift()({ ok: true });
  await race;
  assert.equal(ui.pending.value, null);
  assert.match(ui.message.value, /defeated/);
  await ui.attack();
  assert.equal(calls.length, 3, 'Do not submit the same completed camp again');
});

test('private Brigand trace replays the captured victory and 10 energy deduction', async t => {
  const file = new URL('../temp/tracking-data/hwa-game-record-202611131602_brigand.json', import.meta.url);
  try { await access(file); } catch (error) { if (error.code !== 'ENOENT') throw error; t.skip('Optional private Brigand trace unavailable'); return; }
  const capture = JSON.parse(await readFile(file, 'utf8'));
  const records = capture.records || capture.entries || capture.timeline;
  assert.ok(Array.isArray(records));
  const state = reducer.merge(baseline(), records.map(entry => entry.record || entry)).cache;
  assert.equal(state.brigandCampStatus.data.campId, campId);
  assert.equal(state['resource:world-energy'].data.amount, 90);
});
