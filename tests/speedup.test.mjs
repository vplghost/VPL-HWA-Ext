import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as Vue from 'vue';
import { speedup } from '../src/utils/speedup.ts';
const fixture = JSON.parse(await readFile(new URL('./fixtures/speedup-20261115.json', import.meta.url), 'utf8'));
const context = { TextEncoder };
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
import { speedupService } from '../src/services/speedupService.ts';
import { speedupData } from '../src/data/speedupData.ts';
const now = Date.parse('2026-11-15T03:38:40Z');
const stamp = time => new Date(time).toISOString();
const entry = (data, time = now) => ({ data, updatedAt: stamp(time) });
function baseline() {
  const items = ['speedUpConstruction', 'speedUpResearch', 'speedUpUnitHealing'].map(type => ({ type, id: type === 'speedUpUnitHealing' ? 2 : 1, quantity: 10 }));
  const cache = { accountStatus: entry({ id: 1 }),
    buildingStatus: { data: { queues: structuredClone(fixture.baselines.building.queues) }, updatedAt: fixture.baselines.building.updatedAt },
    researchStatus: { data: { queues: structuredClone(fixture.baselines.research.queues) }, updatedAt: fixture.baselines.research.updatedAt },
    // The log contains no initial healing or inventory snapshot: these two baselines are synthetic.
    'getHealing:unit': entry({ injuredUnits: [{ unitId: 7, count: 5 }], healing: { startDate: now - 100000, duration: 3600000, units: [{ unitId: 7, count: 5 }] } }),
    speedupInventory: entry({ accountId: '1', items, observedAt: stamp(now) }) };
  for (const item of items) cache[`resource:${item.type}:${item.id}`] = entry({ amount: item.quantity });
  return cache;
}
function record(call, response = {}, time = now + 1000, error) {
  const sent = { ...call, ident: call.ident || '0123456789abcdef0123456789abcdef' };
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: stamp(time),
    requestBody: JSON.stringify({ calls: [sent] }), responseBody: JSON.stringify(error ? { error: { name: error, call: sent } } : { results: [{ ident: sent.ident, result: { response } }] }) };
}

test('captured healing/construction/research speedups shorten timers and consume exact stock once', () => {
  let cache = baseline();
  for (const event of fixture.records) {
    const call = JSON.parse(event.requestBody).calls[0], info = speedup.validate(call), resource = `resource:${info.item.type}:${info.item.id}`;
    assert.ok(info);
    const before = speedup.target(cache, info.kind, call.args[info.id] || 0);
    cache = reducer.merge(cache, [event]).cache;
    const after = speedup.target(cache, info.kind, call.args[info.id] || 0);
    assert.equal(before.endsAt - after.endsAt, info.totalMs);
    assert.equal(cache[resource].data.amount, 10 - info.item.amount);
    assert.equal(cache.speedupInventory.data.items.find(item => item.type === info.item.type).quantity, 10 - info.item.amount);
    assert.equal(cache.speedupStatus.data.success, true);
    assert.equal(reducer.merge(cache, [event]).changed, false);
  }
  assert.equal(cache['getHealing:unit'].data.injuredUnits[0].count, 5, 'speedup does not collect healed troops');
});

test('known duration validation refuses unknown categories, refund guesses and incorrect healing totals', () => {
  assert.deepEqual(fixture.records.map(event => speedup.validate(JSON.parse(event.requestBody).calls[0]).totalMs), [600000, 60000, 180000]);
  const healing = JSON.parse(fixture.records[0].requestBody).calls[0];
  for (const change of [call => { call.args.speedUpDuration = 600; }, call => { call.args.resourcesToSpend[0].amount = -1; },
    call => { call.args.resourcesToSpend[0].type = 'speedUpUniversal'; }, call => { call.args.resourcesToReward = [{ type: 'gold', id: 1, amount: 1 }]; }]) {
    const call = structuredClone(healing); change(call); assert.equal(speedup.validate(call), null);
  }
});

test('rejections, stale replay and account switches never shorten the current run or spend stock', () => {
  const original = baseline(), event = fixture.records[1], call = JSON.parse(event.requestBody).calls[0];
  const rejected = reducer.merge(original, [record(call, {}, Date.parse(event.timestamp), 'NotEnough')]).cache;
  assert.equal(rejected.speedupStatus.data.success, false);
  assert.equal(rejected.buildingStatus.data.queues[0].durationMs, original.buildingStatus.data.queues[0].durationMs);
  assert.equal(rejected['resource:speedUpConstruction:1'].data.amount, 10);
  const newer = baseline(); newer.buildingStatus.updatedAt = stamp(now + 120000); newer['resource:speedUpConstruction:1'].updatedAt = stamp(now + 120000);
  const replay = reducer.merge(newer, [event]).cache;
  assert.equal(replay.buildingStatus.data.queues[0].durationMs, original.buildingStatus.data.queues[0].durationMs);
  assert.equal(replay['resource:speedUpConstruction:1'].data.amount, 10);
  const switched = reducer.merge(original, [record({ name: 'userGetInfo', args: {} }, { id: 2, name: 'Other', level: 80 }, now + 120000)]).cache;
  assert.equal(switched.speedupInventory, undefined);
  assert.equal(reducer.merge(switched, [event]).cache.speedupStatus, undefined);
});

test('missing or unfamiliar response bodies never manufacture a receipt that releases an uncertain spend', () => {
  const event = structuredClone(fixture.records[1]), body = JSON.parse(event.responseBody);
  for (const result of [{}, { response: null }, { response: 'unknown' }, { response: { unfamiliar: true } }]) {
    body.results[0].result = result; event.responseBody = JSON.stringify(body);
    const cache = reducer.merge(baseline(), [event]).cache;
    assert.equal(cache.speedupStatus, undefined); assert.equal(cache.speedupReceipts, undefined);
    assert.equal(cache['resource:speedUpConstruction:1'].data.amount, 10);
  }
});

test('same-batch authoritative queue and inventory snapshots override speedup deltas', () => {
  const original = baseline(), event = fixture.records[1], call = JSON.parse(event.requestBody).calls[0];
  const changed = { ...original.buildingStatus.data.queues[0], durationMs: original.buildingStatus.data.queues[0].durationMs - 60000 };
  const inventory = [{ type: 'speedUpConstruction', id: 1, quantity: 9 }];
  for (const reverse of [false, true]) {
    const pairs = [[call, {}], [{ name: 'getSummary', feature: 'building', args: {}, ident: 'summary' }, { queues: [changed] }],
      [{ name: 'getInventory', feature: 'inventory', args: {}, ident: 'inventory' }, { inventory: { items: inventory } }]];
    if (reverse) pairs.reverse();
    const batch = { ...event, requestBody: JSON.stringify({ calls: pairs.map(([call]) => call) }),
      responseBody: JSON.stringify({ results: pairs.map(([call, response]) => ({ ident: call.ident, result: { response } })) }) };
    const result = reducer.merge(original, [batch]).cache;
    assert.equal(result.buildingStatus.data.queues[0].durationMs, changed.durationMs);
    assert.equal(result['resource:speedUpConstruction:1'].data.amount, 9);
    assert.equal(result.speedupInventory.data.items[0].quantity, 9);
  }
});

test('quotes require owned fresh stock, matching target and no unverified overrun', () => {
  const cache = baseline(), time = Date.parse(fixture.baselines.building.updatedAt) + 1;
  assert.ok(speedup.quote(cache, 'building', 20, 1, 1, time));
  for (const [id, count, at] of [[99, 1, time], [1, 11, time], [1, 1.5, time], [1, 1, time + 121000]]) assert.equal(speedup.quote(cache, 'building', 20, id, count, at), null);
  assert.equal(speedup.quote(cache, 'building', 999, 1, 1, time), null);
  cache.buildingStatus.data.queues = [{ buildingId: 20, level: 21, startDate: time - 1000, durationMs: 30000 }];
  assert.equal(speedup.quote(cache, 'building', 20, 1, 1, time), null);
});

async function control(t, kind = 'building', targetId = 20) {
  const cache = Vue.ref(baseline()), clock = Vue.ref(Date.parse(fixture.baselines.research.updatedAt) + 1), calls = [], storage = {};
  const source = await readFile(new URL('../src/components/common/SpeedupControl.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const stops = [], context = { ...Vue, speedup, defineProps: () => ({ kind, targetId, targetLabel: 'Selected target' }),
    useRpcCache: () => ({ cache }), useNow: () => clock, onMounted() {}, onUnmounted() {},
    watch: (...args) => { const stop = Vue.watch(...args); stops.push(stop); return stop; },
    chrome: { runtime: { sendMessage: async message => { calls.push(message); storage.speedupSpendState = { pending: { token: 'pending' } }; return { ok: true, queued: true }; } },
      storage: { local: { get: async () => structuredClone(storage) } } } };
  vm.runInNewContext(js + '\nglobalThis.ui = { openForm, formOpen, suggestAmount, review, confirm, confirmation, confirmValid, quote, waiting, itemId, amount };', context);
  t.after(() => stops.forEach(stop => stop()));
  return { ...context.ui, cache, clock, calls };
}

test('actual control review/cancel never spends; explicit confirmation sends once and holds pending', async t => {
  const ui = await control(t); assert.equal(ui.formOpen.value, false); ui.openForm(); ui.amount.value = 1; ui.review(); assert.ok(ui.confirmation.value); assert.equal(ui.calls.length, 0);
  ui.confirmation.value = null; assert.equal(ui.calls.length, 0);
  ui.review(); await ui.confirm(); assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].confirmed, true);
  assert.equal(ui.calls[0].quote.amount, 1); assert.equal(ui.waiting.value, true);
  await ui.confirm(); ui.review(); assert.equal(ui.calls.length, 1);
  assert.equal(ui.cache.value['resource:speedUpConstruction:1'].data.amount, 10, 'queued ack never consumes items locally');
});

test('actual confirmation invalidates changed inventory, target and account before sending', async t => {
  for (const change of [ui => { ui.cache.value.speedupInventory.data.items[0].quantity--; },
    ui => { ui.cache.value.buildingStatus.data.queues[0].durationMs--; }, ui => { ui.cache.value.accountStatus.data.id = 2; }]) {
    const ui = await control(t); ui.openForm(); ui.amount.value = 1; ui.review(); change(ui); await Vue.nextTick();
    assert.ok(!ui.confirmValid.value); await ui.confirm(); assert.equal(ui.calls.length, 0);
  }
});

test('research and healing controls confirm the correct kind and captured time amounts', async t => {
  for (const [kind, id, amount, total] of [['research', 122, 3, 180000], ['healing', 0, 2, 600000]]) {
    const ui = await control(t, kind, id); ui.openForm(); ui.amount.value = amount; ui.review();
    assert.equal(ui.confirmation.value.totalMs, total); assert.equal(ui.calls.length, 0);
    await ui.confirm(); assert.equal(ui.calls[0].quote.kind, kind); assert.equal(ui.calls[0].quote.totalMs, total);
  }
});

test('suggested amount leaves one item short on exact/nonexact durations and uses all insufficient stock', () => {
  for (const [remaining, each, stock, expected] of [[600000,300000,10,1], [660000,300000,10,2],
    [660000,300000,1,1], [300000,300000,10,0], [300001,300000,10,1], [1000,60000,3,0], [0,60000,3,0], [600000,60000,0,0]]) {
    assert.equal(speedup.suggestedAmount(remaining, each, stock), expected);
  }
});

test('opening the form and changing selected item automatically suggest the quantity without spending', async t => {
  const ui = await control(t), current = ui.clock.value;
  ui.cache.value.buildingStatus.data.queues[0] = { buildingId: 20, level: 21, startDate: current - 60000, durationMs: 720000 };
  ui.cache.value.speedupInventory.data.items = [{ type: 'speedUpConstruction', id: 1, quantity: 20 }, { type: 'speedUpConstruction', id: 2, quantity: 1 }];
  ui.openForm(); assert.equal(ui.amount.value, 10, '11 minutes / 1 minute: ceil(11)-1');
  ui.itemId.value = 2; await Vue.nextTick(); assert.equal(ui.amount.value, 1, 'insufficient five-minute items: use all stock');
  ui.itemId.value = 1; await Vue.nextTick(); assert.equal(ui.amount.value, 10);
  assert.equal(ui.calls.length, 0); assert.equal(ui.confirmation.value, null);
});
