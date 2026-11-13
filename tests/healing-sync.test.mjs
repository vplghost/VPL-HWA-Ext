import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRenderer, nextTick } from 'vue';
import { useTroopTraining } from '../src/composables/useTroopTraining.ts';
import { useRpcCache } from '../src/composables/useRpcCache.ts';

const source = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const context = { Date, TextEncoder, globalThis: {} };
vm.runInNewContext(source, context);
const reducer = context.globalThis.hwaHelperRpcCache;
// Sanitized contract from hwa-game-record-202611131344_sync_healed.json.
const completeDate = 1794552240233;
const units = [{ unitId: 27, count: 2 }, { unitId: 17, count: 2 }, { unitId: 7, count: 1 }];
const completion = (error = false, date = completeDate) => ({
  method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
  timestamp: '2026-11-13T06:44:00.882Z',
  requestBody: JSON.stringify({ calls: [{ name: 'completeHealing', feature: 'unit', args: { completeDate: date }, ident: 'heal-complete' }] }),
  responseBody: JSON.stringify({ results: [{ ident: 'heal-complete', result: error ? { error: 'Not ready' } : { response: {} } }] }),
});
function initial() {
  return {
    'getUnitSummary:unit': { data: { available: [{ unitId: 7, count: 10 }] } },
    'getHealing:unit': { data: {
      injuredUnits: [{ unitId: 7, count: 2 }, { unitId: 17, count: 3 }, { unitId: 27, count: 3 }],
      healing: { startDate: completeDate - 30000, duration: 24000,
        units: [{ unitId: 7, count: 1 }, { unitId: 17, count: 1 }, { unitId: 27, count: 1 }] },
    } },
  };
}

test('confirmed completeHealing clears only the elapsed run and preserves remaining injuries until next heal', () => {
  const cache = initial();
  const result = reducer.merge(cache, [completion()]);
  assert.equal(result.cache['getHealing:unit'].data.healing, null);
  assert.deepEqual(Array.from(result.cache['getHealing:unit'].data.injuredUnits, u => u.count), [1, 2, 2]);
  assert.equal(result.cache['getUnitSummary:unit'].data.available[0].count, 10, 'Do not invent available troops before authoritative snapshot');
  assert.equal(cache['getHealing:unit'].data.healing.units.length, 3, 'Input snapshot remains immutable');
  const duplicate = reducer.merge(result.cache, [completion()]);
  assert.deepEqual(duplicate.cache, result.cache);
  const rejected = reducer.merge(cache, [completion(true)]);
  assert.deepEqual(JSON.parse(JSON.stringify(rejected.cache)), cache);
  const next = initial();
  next['getHealing:unit'].data.healing.startDate = completeDate + 1000;
  assert.deepEqual(JSON.parse(JSON.stringify(reducer.merge(next, [completion()]).cache)), next, 'Stale completion cannot clear a newer run');
});

test('Vue Sync Healed dispatches completion, waits for confirmed cache, then starts the next five-unit heal', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: completeDate });
  const previous = globalThis.chrome;
  let storedCache = initial();
  const sent = [], writes = [], listeners = new Set();
  let response = { ok: false, error: 'Popup RPC is disabled' };
  globalThis.chrome = { storage: { local: {
    get: async () => ({ rpcCache: structuredClone(storedCache) }), set: async value => writes.push(value),
  }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } },
  runtime: { sendMessage(message, callback) { sent.push(message); callback(response); } } };
  let training, rpc;
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null });
  const app = renderer.createApp({ setup() { training = useTroopTraining(); rpc = useRpcCache(); return () => null; } });
  app.mount({});
  t.after(() => { app.unmount(); globalThis.chrome = previous; });
  await rpc.reload(); await nextTick();
  assert.equal(training.isHealingReady.value, true);
  await training.syncHealed();
  assert.equal(sent.at(-1).calls[0].name, 'completeHealing');
  assert.equal(sent.at(-1).calls[0].feature, 'unit');
  assert.equal(sent.at(-1).calls[0].args.completeDate, completeDate);
  assert.match(training.healStatus.value, /disabled/);
  assert.equal(training.isHealingReady.value, true, 'Rejected command must not fabricate completion');
  assert.deepEqual(writes, []);
  response = { ok: true, queued: true };
  await training.syncHealed();
  assert.match(training.healStatus.value, /Queued/);
  assert.equal(training.isHealingReady.value, true, 'Queued command awaits observed response');
  const before = sent.length;
  await training.healAll();
  assert.equal(sent.length, before, 'Do not start another heal before completing the current run');
  storedCache = reducer.merge(storedCache, [completion()]).cache;
  await rpc.reload(); await nextTick();
  assert.equal(training.isHealingReady.value, false);
  assert.equal(training.totalInjured.value, 5);
  await training.healAll();
  const call = sent.at(-1).calls[0];
  assert.equal(call.name, 'startHealing');
  assert.equal(call.args.duration, 40000, 'Five units take the observed 40 seconds, not a fabricated 60-second minimum');
  assert.deepEqual(call.args.units.slice().sort((a,b) => a.unitId - b.unitId), units.slice().sort((a,b) => a.unitId - b.unitId));
  assert.equal(rpc.cache.value['getHealing:unit'].data.healing, null, 'Starting also waits for confirmed server state');
});
