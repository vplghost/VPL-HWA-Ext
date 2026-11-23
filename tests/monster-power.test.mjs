import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { MONSTER_POWER } from '../src/utils/rallyPowerData.ts';
import * as power from '../src/utils/monsterPower.ts';
import { normalizeArray } from '../src/utils/troops.ts';
import { formatNumber } from '../src/utils/formatters.ts';
import { soloMonsterConfigIds, soloMonsterLevel } from '../src/utils/mobData.ts';

const ids = [1, 2, 3, 4, 5];
const roster = (value = 100) => Object.fromEntries(ids.map(id => [id, { power: value }]));
test('all 30 solo levels preserve both verified preset families, separate from rally bosses', () => {
  assert.equal(Object.keys(MONSTER_POWER).length, 60);
  for (let level = 1; level <= 30; level++) {
    assert.deepEqual(Object.values(MONSTER_POWER).filter(row => row.level === level).map(row => row.variant).sort(), ['normal', 'pvp']);
  }
  assert.deepEqual([MONSTER_POWER[109].heroes, MONSTER_POWER[109].troops, MONSTER_POWER[109].count], [70903, 56050, 2950]);
  assert.equal(MONSTER_POWER[17].troops, 8645 * 19);
});

test('squad power uses the allocation, handles object collections and discloses unknown data', () => {
  const own = power.monsterSquadPower({ a: 1, b: 2, c: 3, d: 4, e: 5 }, roster(), { a: { unitId: 7, count: 100 }, b: { unitId: 27, count: 200 } }, true);
  assert.equal(own.total.value, 10300); assert.equal(own.total.complete, true);
  const missing = roster(); delete missing[5];
  const partial = power.monsterSquadPower(ids, missing, [{ unitId: 999, count: 1 }], true);
  assert.equal(partial.total.complete, false);
  const comparison = power.monsterPowerComparison(15, partial);
  assert.equal(comparison.squad.total, '400+'); assert.match(comparison.message, /Incomplete/);
  assert.equal(comparison.rows.some(row => row.weaker), false, 'unknown total never becomes a definite weaker result');
  assert.equal(power.monsterSquadPower(ids, roster(), [], false).troops.known, false);
  assert.equal(power.monsterSquadPower(ids, roster(), [], true).troops.value, 0);
});

test('advisory distinguishes weaker, equal and higher power and rejects wrong-level target presets', () => {
  const squad = power.monsterSquadPower(ids, roster(100), [], true);
  const both = power.monsterPowerComparison(15, squad);
  assert.equal(both.rows.length, 2); assert.equal(both.variantKnown, false);
  assert.match(both.message, /Risk of defeat/);
  const exact = power.monsterPowerComparison(15, squad, { predefinedSquadId: 109 });
  assert.equal(exact.rows.length, 1); assert.equal(exact.variantKnown, true);
  assert.equal(power.monsterPowerComparison(1, squad, { predefinedSquadId: 109 }).rows.length, 2);
  for (const value of [126953, 126954]) {
    const result = power.monsterPowerComparison(15, { ...squad, total: { value, known: true, complete: true } }, { predefinedSquadId: 109 });
    assert.equal(result.warning, false); assert.match(result.message, /does not guarantee victory/);
  }
});

const source = await readFile(new URL('../src/components/dialogs/MonsterModal.vue', import.meta.url), 'utf8');
function fixture() {
  const cache = Vue.ref({ heroGetAll: { data: roster() }, 'getUnitSummary:unit': { data: {} } });
  const selectedTeam = Vue.ref({ id: 'team', label: 'Test', heroIds: ids });
  const allocatedTroops = Vue.ref([{ unitId: 1, count: 100 }]);
  const squad = { selectedTeam, selectedTeamId: Vue.ref('team'), teams: Vue.computed(() => selectedTeam.value ? [selectedTeam.value] : []),
    allocatedTroops, squadCapacity: Vue.ref(100), totalAllocatedTroops: Vue.ref(100), troopTypeSummaries: Vue.ref([]),
    isRefreshingTroops: Vue.ref(false), mapContext: Vue.ref({ mapId: 'map' }), mapCenter: Vue.ref({ x: 1, y: 1 }),
    loadSquadData: async () => {}, refreshTroops: async () => {}, handleTeamChange: async () => {},
    getHeroSnapshot: () => null, getHeroName: id => `Hero ${id}`, getHeroAvatarUrl: () => '', getHeroGlow: () => '' };
  const search = level => { cache.value.experimentalSoloSearch = { data: { mapId: 'map', mobConfigIds: soloMonsterConfigIds(level), mobs: [{ mobId: 'target' }] } }; };
  return { cache, selectedTeam, squad, search };
}

test('actual dialog computed state waits for matching search and reacts to level, target and team changes', async t => {
  const h = fixture(), stops = [];
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const context = { ...Vue, ...power, normalizeArray, soloMonsterConfigIds, soloMonsterLevel, formatNumber,
    useRpcCache: () => ({ cache: h.cache }), useSquadTeams: () => h.squad, defineProps: () => ({ modelValue: true }), defineEmits: () => () => {},
    onMounted() {}, onUnmounted() {}, watch: (...args) => { const stop = Vue.watch(...args); stops.push(stop); return stop; } };
  vm.runInNewContext(js + '\nglobalThis.api = { powerComparison, mobLevel, selectedMobId };', context);
  t.after(() => stops.forEach(stop => stop()));
  const api = context.api;
  assert.equal(api.powerComparison.value, null);
  h.search(1); await Vue.nextTick();
  assert.equal(api.powerComparison.value.warning, true);
  api.mobLevel.value = 2; await Vue.nextTick();
  assert.equal(api.powerComparison.value, null, 'old search is hidden immediately');
  h.search(2); await Vue.nextTick(); assert.equal(api.powerComparison.value.rows[0].level, 2);
  api.selectedMobId.value = 'not-in-search'; assert.equal(api.powerComparison.value, null);
  api.selectedMobId.value = 'target';
  h.cache.value.heroGetAll.data = roster(1e6); assert.equal(api.powerComparison.value.warning, false);
  h.squad.allocatedTroops.value = [{ unitId: 999, count: 1 }]; assert.match(api.powerComparison.value.message, /Incomplete/);
  h.selectedTeam.value = null; assert.equal(api.powerComparison.value, null);
});

test('actual Monster template displays power and warning before attack and updates with hero cache', async () => {
  const h = fixture(); h.search(1);
  const { descriptor } = parse(source);
  const compiled = compileScript(descriptor, { id: 'monster-power-fixture', inlineTemplate: true });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }, require = createRequire(import.meta.url);
  const useModalsModule = await import('../src/composables/useModals.ts');
  const imports = { '@/src/composables/useRpcCache': { useRpcCache: () => ({ cache: h.cache }) },
    '@/src/composables/useSquadTeams': { useSquadTeams: () => h.squad },
    '@/src/composables/useModals': useModalsModule,
    '@/src/utils/monsterPower': power,
    '@/src/utils/troops': { normalizeArray }, '@/src/utils/formatters': { formatNumber },
    '@/src/utils/mobData': { soloMonsterConfigIds, soloMonsterLevel },
    '@/src/utils/experimentalData': { soloMonsterConfigIds, soloMonsterLevel },
    '@/src/components/common/HeroHoverCard.vue': { render: () => null },
    '@/src/components/common/StatusAlertBanner.vue': { render: () => null } };
  new Function('require', 'module', 'exports', js)(name => imports[name] || require(name), module, module.exports);
  const render = () => renderToString(Vue.createSSRApp(module.exports.default, { modelValue: true }));
  const first = await render();
  assert.match(first, /Power comparison/); assert.match(first, /Risk of defeat/);
  assert.match(first, /Normal monster/); assert.match(first, /PvP monster/); assert.match(first, /800/);
  assert.match(first, /Search does not identify/);
  h.cache.value.heroGetAll.data = roster(1e6);
  const updated = await render(); assert.doesNotMatch(updated, /Risk of defeat/); assert.match(updated, /does not guarantee victory/);
});
