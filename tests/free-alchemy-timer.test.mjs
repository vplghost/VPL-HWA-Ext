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
// Captured wheel_timer.json, SHA256 a686d9295e81cd81eda2c634e14ac3561ef0704f1575017daef976878e7307d9.
const timestamp = '2026-11-14T06:49:21.255Z';
const at = Date.parse(timestamp);
const call = { name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' }, ident: '000270e8a7052db8005eb1aada0af868' };
const error = { name: 'NotEnough', description: 'Refillable 53. Has 0 need 1. Last refill 1794613856 now 1794638961 delta 25105 in /app/classes/RPCRequest.php (1324); rpc=`refillable_alchemyUseVideo`', call };
function record(response = { error, date: 1794638961.162786 }, calls = [call], time = timestamp) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: time,
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify(response) };
}
const entry = (data, time = at) => ({ data, updatedAt: new Date(time).toISOString() });

test('captured top-level failure settles spin, persists 1:01:35 timer without awarding resources, and is idempotent', () => {
  const cache = reducer.merge({}, [record()]).cache;
  assert.equal(cache.freeAlchemySpinStatus.data.success, false);
  assert.equal(cache.freeAlchemySpinStatus.data.cooldownUntil, at + 3695000);
  assert.equal(cache['resource:gold'], undefined);
  assert.equal(cache['resource:refillable:53'], undefined);
  assert.equal(freeAlchemyAvailability(cache, at).remainingSeconds, 3695);
  assert.equal(freeAlchemyTimer(3695), '01:01:35');
  assert.equal(freeAlchemyAvailability(cache, at + 3695000).ready, true);
  assert.equal(reducer.merge(cache, [record()]).changed, false);
  const newer = reducer.merge(cache, [record({ results: [{ ident: call.ident, result: { response: [{ reward: { gold: 10 } }] } }] }, [{ ...call, ident: call.ident }], new Date(at + 1000).toISOString())]).cache;
  // Same request token is never counted twice, including a contradictory replay.
  assert.equal(newer['resource:gold'], undefined);
});

test('only matching exact free calls and refillable53 errors establish cooldown', () => {
  for (const calls of [[{ ...call, ident: 'other' }], [{ ...call, args: { type: 'alchemy', times: 10 } }], [{ ...call, feature: 'paid' }]]) {
    assert.equal(reducer.merge({}, [record(undefined, calls)]).changed, false);
  }
  for (const description of [error.description.replace('53.', '62.'), 'Video unavailable']) {
    const cache = reducer.merge({}, [record({ error: { ...error, description } })]).cache;
    assert.equal(cache.freeAlchemySpinStatus.data.cooldownUntil, null);
  }
});

test('server success starts cooldown; newer quota wins and lastRefill is retained without renewable balance mutation', () => {
  const success = record({ results: [{ ident: call.ident, result: { response: [{ reward: { gold: 73800 } }] } }] });
  let cache = reducer.merge({}, [success]).cache;
  assert.equal(freeAlchemyAvailability(cache, at).remainingSeconds, 28800);
  const info = { name: 'userGetInfo', ident: 'info' };
  const snapshot = record({ results: [{ ident: 'info', result: { response: { id: 1, name: 'Player', refillable: [{ id: 53, amount: 0, lastRefill: 1794613856 }] } } }] }, [info], new Date(at + 1000).toISOString());
  cache = reducer.merge(cache, [snapshot]).cache;
  assert.equal(cache['resource:refillable:53'].data.lastRefillAt, 1794613856000);
  assert.equal(cache['resource:refillable:53'].data.renewable, undefined);
  assert.ok(freeAlchemyAvailability(cache, at + 1000).remainingSeconds < 3700);
  cache['resource:refillable:53'] = entry({ amount: 1 }, at + 2000);
  assert.equal(freeAlchemyAvailability(cache, at + 2000).ready, true);
});

test('game day reset overrides old exhausted quota/receipt, including a stale nextDayAt', () => {
  const reset = at + 60000;
  const cache = { questResetStatus: entry({ nextDayAt: reset }),
    freeAlchemySpinStatus: entry({ cooldownUntil: at + 28800000 }),
    'resource:refillable:53': entry({ amount: 0, lastRefillAt: at }) };
  assert.equal(freeAlchemyAvailability(cache, reset - 1).remainingSeconds, 1);
  assert.equal(freeAlchemyAvailability(cache, reset).ready, true);
  assert.equal(freeAlchemyAvailability(cache, reset + 86400000).ready, true);
  cache['resource:refillable:53'] = entry({ amount: 0, lastRefillAt: reset + 1000 }, reset + 1000);
  assert.equal(freeAlchemyAvailability(cache, reset + 1000).ready, false);
  const midnight = new Date(at); midnight.setHours(24, 0, 0, 0);
  delete cache.questResetStatus;
  assert.equal(freeAlchemyAvailability(cache, midnight.getTime()).ready, true);
  assert.equal(freeAlchemyAvailability({}, at).ready, true);
});

test('account change clears prior spin and quota state', () => {
  const cache = reducer.merge({ accountStatus: entry({ id: 1 }) }, [record()]).cache;
  cache['resource:refillable:53'] = entry({ amount: 0 });
  const info = { name: 'userGetInfo', ident: 'info' };
  const switched = reducer.merge(cache, [record({ results: [{ ident: 'info', result: { response: { id: 2, name: 'Other player' } } }] }, [info], new Date(at + 1000).toISOString())]).cache;
  assert.equal(switched.freeAlchemySpinStatus, undefined);
  assert.equal(switched['resource:refillable:53'], undefined);
});

test('actual button ticks tooltip, blocks dispatch, unlocks at reset and cleans stale errors', async t => {
  const source = await readFile(new URL('../src/components/dashboard/FreeAlchemySpinButton.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const clock = ref(at), cache = ref({ ...reducer.merge({}, [record()]).cache, questResetStatus: entry({ nextDayAt: at + 60000 }) });
  const stops = [], calls = [], props = { hasGameTab: true };
  const boundary = { computed, ref, shallowRef, Date: class extends Date { static now() { return clock.value; } },
    defineProps: () => props, useNow: () => clock, freeAlchemyAvailability, freeAlchemyTimer,
    watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; }, onUnmounted() {},
    useRpcCache: () => ({ cache, dispatchRpc: async batch => { calls.push(batch); return { ok: false, error: 'RPC disabled' }; } }),
    setTimeout, clearTimeout };
  vm.runInNewContext(js + '\nglobalThis.api = { spin, disabled, tooltip, message };', boundary);
  t.after(() => stops.forEach(stop => stop()));
  const ui = boundary.api;
  assert.equal(ui.disabled.value, true);
  assert.match(ui.tooltip.value, /00:01:00/);
  await ui.spin(); assert.equal(calls.length, 0);
  clock.value += 1000; await nextTick();
  assert.match(ui.tooltip.value, /00:00:59/);
  ui.message.value = 'Old rejection';
  clock.value = at + 60000; await nextTick();
  assert.equal(ui.disabled.value, false);
  assert.equal(ui.tooltip.value, 'Free Spin · Emerald Exchange');
  await ui.spin(); assert.equal(calls.length, 1);
  assert.match(source, /:disabled="disabled"/);
});
