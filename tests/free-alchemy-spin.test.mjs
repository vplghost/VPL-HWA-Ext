import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, ref, shallowRef, watch, nextTick } from 'vue';
import { freeAlchemyAvailability, freeAlchemyTimer } from '../src/utils/freeAlchemySpin.ts';

const context = { TextEncoder };
vm.runInNewContext(await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8'), context);
const reducer = context.hwaHelperRpcCache;
const timestamp = '2026-11-13T23:50:55.872Z';
const rewards = [{ reward: { gold: 73800 }, crit: 2 }];
const quests = [
  { id: 10006, state: 2, progress: 1, multiplier: 0, reward: { gold: 4500, experience: 50 } },
  { id: 10044, state: 1, progress: 1, multiplier: 0, reward: { gold: 10000, experience: 100 } },
  { id: 10020, state: 1, progress: 1, multiplier: 0, reward: { gold: 10000, consumable: { 1001: '3' } } },
];
function record(result = { response: rewards, quests }, args = { type: 'alchemy' }) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp,
    requestBody: JSON.stringify({ calls: [{ name: 'refillable_alchemyUseVideo', args, ident: 'free-spin' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'free-spin', result }] }),
  };
}

test('captured free alchemy result credits exact gold once, does not multiply crit or claim quest rewards', () => {
  for (const initialQuests of [[{ id: 10006, progress: 0 }, { id: 1, progress: 5 }], { 10006: { id: 10006, progress: 0 } }]) {
    const initial = { 'resource:gold': { data: { amount: 1000 }, updatedAt: '2026-11-13T23:40:00Z' },
      'resource:starMoney': { data: { amount: 100 } }, 'resource:refillable:53': { data: { amount: 1 } },
      userGetInfo: { data: { gold: 1000 } }, questGetAll: { data: initialQuests, updatedAt: '2026-11-13T23:40:00Z' } };
    const state = reducer.merge(initial, [record()]).cache;
    assert.equal(state['resource:gold'].data.amount, 74800);
    assert.equal(state.userGetInfo.data.gold, 74800);
    assert.equal(state['resource:starMoney'].data.amount, 100);
    assert.equal(state['resource:refillable:53'].data.amount, 1, 'Quota changes require a real snapshot');
    const updated = Array.isArray(state.questGetAll.data) ? state.questGetAll.data.find(q => q.id === 10006) : state.questGetAll.data[10006];
    assert.equal(updated.progress, 1); assert.equal(updated.state, 2);
    assert.equal(state['resource:consumable:1001'], undefined, 'Quest reward is not a claimed prize');
    assert.equal(reducer.merge(state, [record()]).changed, false);
  }
});

test('free spin failure and invalid argument shapes cannot credit gold or accept paid modes', () => {
  const failed = reducer.merge({}, [record({ error: 'videoNotAvailable' })]).cache;
  assert.equal(failed.freeAlchemySpinStatus.data.success, false);
  assert.equal(failed['resource:gold'], undefined);
  for (const args of [{ type: 'paid' }, { type: 'alchemy', times: 10 }, { type: 'alchemy', emeralds: 20 }]) {
    assert.equal(reducer.merge({}, [record(undefined, args)]).changed, false);
  }
  assert.equal(reducer.merge({}, [{ ...record(), responseBodyTruncated: true }]).changed, false);
  const newer = { 'resource:gold': { data: { amount: 99999 }, updatedAt: '2026-11-14T00:00:00Z' } };
  assert.equal(reducer.merge(newer, [record()]).cache['resource:gold'].data.amount, 99999);
});

test('same-batch gold snapshot is not credited again by the free spin delta', () => {
  const event = record(), calls = JSON.parse(event.requestBody).calls, results = JSON.parse(event.responseBody).results;
  calls.push({ name: 'userGetInfo', ident: 'info' });
  results.push({ ident: 'info', result: { response: { gold: 74800, refillable: [{ id: 53, amount: 0 }] } } });
  const state = reducer.merge({}, [{ ...event, requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results }) }]).cache;
  assert.equal(state['resource:gold'].data.amount, 74800);
  assert.equal(state['resource:refillable:53'].data.amount, 0);
});

test('actual dashboard button sends only free RPC, waits through queued ack/timeout, and handles late receipt without duplicate sends', async t => {
  const source = await readFile(new URL('../src/components/dashboard/FreeAlchemySpinButton.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const cache = ref({ accountStatus: { data: { id: 1 } } }), props = { hasGameTab: true };
  const calls = [], callbacks = [], timers = [], stops = [];
  const boundary = { computed, ref, shallowRef, Date, defineProps: () => props,
    useNow: () => ref(Date.now()), freeAlchemyAvailability, freeAlchemyTimer,
    watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; }, onUnmounted() {},
    useRpcCache: () => ({ cache, dispatchRpc: batch => { calls.push(batch); return new Promise(resolve => callbacks.push(resolve)); } }),
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
  };
  vm.runInNewContext(js + '\nglobalThis.api = { spin, pending, message };', boundary);
  t.after(() => stops.forEach(stop => stop()));
  const ui = boundary.api, sending = ui.spin();
  await ui.spin(); assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify([{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }]));
  callbacks.shift()({ ok: true, queued: true }); await sending;
  assert.ok(ui.pending.value); timers[0](); assert.ok(ui.pending.value);
  assert.match(ui.message.value, /confirmation/);
  cache.value.freeAlchemySpinStatus = { updatedAt: new Date(Date.now() + 1).toISOString(), data: { token: 'receipt', success: true, gold: 73800 } };
  await nextTick();
  assert.equal(ui.pending.value, null); assert.match(ui.message.value, /73,800/);
  const retry = ui.spin(); callbacks.shift()({ ok: false, error: 'RPC disabled' }); await retry;
  assert.equal(ui.pending.value, null); assert.equal(ui.message.value, 'RPC disabled');
  props.hasGameTab = false; await ui.spin(); assert.equal(calls.length, 2);
});
