import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';

async function setupDialog(file, exposed) {
  const text = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
  const source = text.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/^import [\s\S]*?;\r?$/gm, '');
  const mounted = [], sent = [];
  const cache = ref({});
  const api = { cache, dispatchRpc: async calls => { sent.push(calls); return { ok: true }; } };
  const context = vm.createContext({
    ref, computed, console, Date, Map, Set, Number, Object, Array,
    defineProps: () => ({ modelValue: false }),
    defineEmits: () => () => {},
    onMounted: fn => mounted.push(fn),
    onUnmounted() {},
    watch() {},
    useRpcCache: () => api,
    useModals: () => ({ openModal() {} }),
    useSquadTeams: () => ({ loadSquadData: async () => {}, isRefreshingTroops: ref(false) }),
    normalizeArray: value => Array.isArray(value) ? value : Object.values(value || {}),
    formatNumber: n => String(n),
    bossConfigId: () => 1,
    bossLevel: () => 1,
    soloMonsterConfigIds: () => [1],
    soloMonsterLevel: () => 1,
    monsterSquadPower: () => 0,
    monsterPowerComparison: () => null,
    formatMonsterPower: () => '0',
    rallyWaitOptions: [30, 60, 120, 300],
    window: { setInterval: () => 1 },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: fn => { fn(); return 1; },
    clearTimeout() {},
    clearInterval() {},
    chrome: {
      storage: {
        local: { get: async () => ({ popupRpcEnabled: true }), set: async () => {} },
        onChanged: { addListener() {}, removeListener() {} }
      }
    }
  });
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInContext(js + '\nglobalThis.exposed = {' + exposed + '};', context);
  return { handlers: context.exposed, sent };
}

test('StatusAlertBanner SFC definition contains interactive refresh button and state variants', async () => {
  const content = await readFile(new URL('../src/components/common/StatusAlertBanner.vue', import.meta.url), 'utf8');
  assert.ok(content.includes('role="alert"'), 'Must have role=alert');
  assert.ok(content.includes('actionState'), 'Must track action state');
  assert.ok(content.includes('animate-spin'), 'Must have spinner for loading');
  assert.ok(content.includes('aria-busy'), 'Must set aria-busy when loading');
  assert.ok(content.includes('onRefresh'), 'Must support onRefresh callback');
  assert.ok(content.includes('handleAction'), 'Must have action handler');
  assert.ok(content.includes('border-amber-200'), 'Must have warning styling');
  assert.ok(content.includes('border-rose-200'), 'Must have error styling');
  assert.ok(content.includes('border-emerald-200'), 'Must have success styling');
});

test('RaidModal integrates StatusAlertBanner with handleBannerRefresh dispatching marches, units, and heroes', async () => {
  const raidModalSource = await readFile(new URL('../src/components/dialogs/RaidModal.vue', import.meta.url), 'utf8');
  assert.ok(raidModalSource.includes('<StatusAlertBanner'), 'RaidModal must mount StatusAlertBanner');
  assert.ok(raidModalSource.includes('handleBannerRefresh'), 'RaidModal must define handleBannerRefresh');

  const runtime = await setupDialog('dialogs/RaidModal.vue', 'handleBannerRefresh, statusMessage');
  assert.equal(typeof runtime.handlers.handleBannerRefresh, 'function');

  await runtime.handlers.handleBannerRefresh();
  assert.equal(runtime.sent.length, 1);
  const calls = runtime.sent[0];
  assert.ok(calls.some(c => c.name === 'getMarches' && c.feature === 'march'), 'Must refresh marches');
  assert.ok(calls.some(c => c.name === 'getUnitSummary' && c.feature === 'unit'), 'Must refresh unit summary');
  assert.ok(calls.some(c => c.name === 'heroGetAll'), 'Must refresh heroes');
  assert.match(runtime.handlers.statusMessage.value, /refreshed successfully/);
});

test('MonsterModal integrates StatusAlertBanner with handleBannerRefresh dispatching marches, units, and heroes', async () => {
  const monsterModalSource = await readFile(new URL('../src/components/dialogs/MonsterModal.vue', import.meta.url), 'utf8');
  assert.ok(monsterModalSource.includes('<StatusAlertBanner'), 'MonsterModal must mount StatusAlertBanner');
  assert.ok(monsterModalSource.includes('handleBannerRefresh'), 'MonsterModal must define handleBannerRefresh');

  const runtime = await setupDialog('dialogs/MonsterModal.vue', 'handleBannerRefresh, statusMessage');
  assert.equal(typeof runtime.handlers.handleBannerRefresh, 'function');

  await runtime.handlers.handleBannerRefresh();
  assert.equal(runtime.sent.length, 1);
  const calls = runtime.sent[0];
  assert.ok(calls.some(c => c.name === 'getMarches' && c.feature === 'march'), 'Must refresh marches');
  assert.ok(calls.some(c => c.name === 'getUnitSummary' && c.feature === 'unit'), 'Must refresh unit summary');
  assert.ok(calls.some(c => c.name === 'heroGetAll'), 'Must refresh heroes');
  assert.match(runtime.handlers.statusMessage.value, /refreshed successfully/);
});
