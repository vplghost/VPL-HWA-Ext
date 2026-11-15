import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { getAmountAt, getNextRefillSeconds, formatResourceAmount } from '../src/utils/resourceData.ts';

async function setup(name, exports, extra) {
  const source = await readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const context = { ref, computed, onMounted() {}, onUnmounted() {},
    useModals: () => ({ openModal() {} }), useGameConnection: () => ({ hasGameTab: ref(true) }), ...extra };
  vm.runInNewContext(js + '\nglobalThis.api = {' + exports + '};', context);
  return context.api;
}

test('Dashboard refresh requests both energy sources first and resource amounts wait for authoritative snapshots', async () => {
  const cache = ref({ 'resource:energy': { data: { amount: 1 } }, 'resource:world-energy': { data: { amount: 2 } } }), batches = [];
  const useRpcCache = () => ({ cache, dispatchRpc: async calls => { batches.push(calls); return { ok: true, queued: true }; } });
  const ui = await setup('DashboardTab.vue', 'refreshAllDashboard, dashboardRefreshMessage', { useRpcCache });
  const resources = await setup('ResourceSummary.vue', 'energyVal, worldEnergyVal', { useRpcCache, getAmountAt, getNextRefillSeconds, formatResourceAmount });
  await ui.refreshAllDashboard();
  assert.deepEqual(JSON.parse(JSON.stringify(batches[0])), [{ name: 'userGetInfo' }, { name: 'refillableGetAll', feature: 'refillable' }]);
  assert.equal(batches.length, 2);
  assert.equal(batches[1].some(call => ['userGetInfo', 'refillableGetAll'].includes(call.name)), false);
  assert.match(ui.dashboardRefreshMessage.value, /queued.*Energy and World Energy/);
  assert.equal(resources.energyVal.value, 1); assert.equal(resources.worldEnergyVal.value, 2);
  const context = { TextEncoder };
  vm.runInNewContext(await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8'), context);
  cache.value = context.hwaHelperRpcCache.merge(cache.value, [{ method: 'POST', status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date().toISOString(),
    requestBody: JSON.stringify({ calls: batches[0].map((call, index) => ({ ...call, ident: String(index) })) }),
    responseBody: JSON.stringify({ results: [
      { ident: '0', result: { response: { id: 1, name: 'Fixture', level: 80, refillable: [{ id: 1, amount: 120 }] } } },
      { ident: '1', result: { response: { refillables: [{ refillableId: 2, amount: 90 }] } } }
    ] }) }]).cache;
  assert.equal(resources.energyVal.value, 120); assert.equal(resources.worldEnergyVal.value, 90);
});

test('energy refresh reports shared-RPC failure and ignores overlapping clicks', async () => {
  let respond, calls = 0;
  const ui = await setup('DashboardTab.vue', 'refreshAllDashboard, dashboardRefreshing, dashboardRefreshMessage', {
    useRpcCache: () => ({ cache: ref({}), dispatchRpc: () => { calls++; return new Promise(resolve => { respond = resolve; }); } }) });
  const pending = ui.refreshAllDashboard();
  assert.equal(ui.dashboardRefreshing.value, true);
  await ui.refreshAllDashboard(); assert.equal(calls, 1);
  respond({ ok: false, error: 'Popup RPC disabled' }); await pending;
  assert.equal(ui.dashboardRefreshing.value, false); assert.match(ui.dashboardRefreshMessage.value, /Popup RPC disabled/);
  assert.equal(calls, 1, 'other reads do not proceed after dispatch rejection');
});
