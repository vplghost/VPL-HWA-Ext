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
  assert.match(raidModalSource, /id="raid-params-row"[\s\S]*?sm:grid-cols-12/, 'P2-40: RaidModal puts Level, Target, and Rounds on 1 row');
  assert.match(raidModalSource, /Lv\. \{\{ lvl \}\}/, 'P2-40: Boss Level options omit redundant Boss word');
  assert.doesNotMatch(raidModalSource, /Boss level \{\{ lvl \}\}/, 'P2-40: No redundant Boss level option text');
  assert.match(raidModalSource, /#\{\{ Number\(idx\) \+ 1 \}\} ·/, 'P2-40: Target options omit redundant Boss word');
  assert.doesNotMatch(raidModalSource, /id="raid-auto-energy-section"/, 'P2-50: Auto Raid Energy moved from RaidModal into SettingsTab Anti-Cap Energy Auto-Burner');
  const actionsIdx = raidModalSource.indexOf('id="raid-dialog-actions"');
  const bannerIdx = raidModalSource.indexOf('<StatusAlertBanner');
  assert.ok(actionsIdx > 0 && bannerIdx > actionsIdx, 'P2-40: StatusAlertBanner renders below #raid-dialog-actions to prevent button jump');

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
  const mActionsIdx = monsterModalSource.indexOf('id="monster-dialog-actions"');
  const mBannerIdx = monsterModalSource.indexOf('<StatusAlertBanner');
  assert.ok(mActionsIdx > 0 && mBannerIdx > mActionsIdx, 'P2-41: MonsterModal StatusAlertBanner renders below #monster-dialog-actions in #monster-dialog-footer');
  assert.ok(monsterModalSource.includes('id="monster-dialog-footer"'), 'P2-41: MonsterModal mounts pinned #monster-dialog-footer');

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

test('P2-41: Arena, GrandArena, PvP Optimizer, and Expeditions dialogs pin primary actions in ModalDialog #footer', async () => {
  const checks = [
    ['dialogs/ArenaModal.vue', 'id="arena-dialog-footer"', 'id="btn-arena-auto-start"'],
    ['dialogs/GrandArenaModal.vue', 'id="grand-arena-dialog-footer"', 'id="btn-grand-arena-auto-start"'],
    ['dialogs/PvpTeamOptimizerModal.vue', 'id="pvp-optimizer-dialog-footer"', 'id="btn-start-pvp-optimizer"'],
    ['dialogs/ExpeditionsModal.vue', 'id="expeditions-dialog-footer"', '@click="startAvailable"'],
  ];
  for (const [file, footerId, primaryAction] of checks) {
    const src = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
    const footerSlotIdx = src.indexOf('<template #footer>');
    const footerIdIdx = src.indexOf(footerId);
    const actionIdx = src.indexOf(primaryAction);
    assert.ok(footerSlotIdx > 0, `${file} must use ModalDialog #footer slot`);
    assert.ok(footerIdIdx > footerSlotIdx, `${file} must render ${footerId} inside #footer`);
    assert.ok(actionIdx > footerSlotIdx, `${file} must place ${primaryAction} inside pinned #footer`);
  }
});

test('P2-42: ModalDialog supports #header-status/#header-actions and dialogs use compact header status + subtle icon-only refresh', async () => {
  const modalBase = await readFile(new URL('../src/components/common/ModalDialog.vue', import.meta.url), 'utf8');
  assert.ok(modalBase.includes('name="header-status"'), 'ModalDialog must expose #header-status slot');
  assert.ok(modalBase.includes('name="header-actions"'), 'ModalDialog must expose #header-actions slot');

  const dialogs = [
    ['dialogs/TowerModal.vue', 'id="tower-header-status"', 'id="btn-tower-refresh"', 'id="tower-dialog-footer"'],
    ['dialogs/ArenaModal.vue', 'id="arena-header-status"', 'id="btn-arena-refresh"', null],
    ['dialogs/GrandArenaModal.vue', 'id="grand-arena-header-status"', 'id="btn-grand-arena-refresh"', null],
    ['dialogs/HydraModal.vue', 'id="hydra-status-bar"', 'id="btn-hydra-refresh"', null],
    ['dialogs/ShopModal.vue', 'id="shop-header-status"', 'id="btn-shop-refresh-all"', null],
  ];
  for (const [file, statusId, refreshId, footerId] of dialogs) {
    const src = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
    assert.ok(src.includes('<template #header-status>'), `${file} must use #header-status`);
    assert.ok(src.includes(statusId), `${file} must render ${statusId}`);
    assert.ok(src.includes('<template #header-actions>'), `${file} must use #header-actions`);
    assert.ok(src.includes(refreshId), `${file} must render subtle icon-only ${refreshId}`);
    if (footerId) assert.ok(src.includes(footerId), `${file} must render ${footerId}`);
  }
});
