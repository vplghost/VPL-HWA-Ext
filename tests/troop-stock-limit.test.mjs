import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { calculateTroopMax, getTroopType, normalizeArray, TROOP_DEFS, CAMP_BUILDING_IDS, troopStockProgress } from '../src/utils/troops.ts';
import { DRILL_GROUND_LIMIT_BY_LEVEL } from '../src/utils/troopLimitData.ts';

const snapshot = buildings => ({ buildingStatus: { data: { buildings } } });
test('troop stock sums only confirmed Drill Grounds and ignores every Camp', () => {
  const cache = snapshot([{ buildingId: 182, level: 10 }, { buildingId: 183, level: 5 }, { buildingId: 184, level: 2 },
    { buildingId: 40, level: 8 }, { buildingId: 41, level: 10 }, { buildingId: 42, level: 5 }]);
  const shared = 5630 + 4170 + 3100;
  assert.equal(calculateTroopMax(0, cache), shared);
  assert.equal(calculateTroopMax(1, cache), shared);
  assert.equal(calculateTroopMax(2, cache), shared);
  assert.equal(calculateTroopMax(0, cache, 999999), shared);
  assert.equal(calculateTroopMax(3, cache), null);
  assert.equal(DRILL_GROUND_LIMIT_BY_LEVEL[25], 9500);
  const example = snapshot([{ buildingId: 182, level: 19 }, { buildingId: 183, level: 14 },
    { buildingId: 40, level: 25 }, { buildingId: 41, level: 25 }, { buildingId: 42, level: 25 }]);
  for (const type of [0, 1, 2]) assert.equal(calculateTroopMax(type, example), 14230);});

test('only completed building levels affect capacity, with unknown and unbuilt states distinct', () => {
  assert.equal(calculateTroopMax(0, {}), null);
  assert.equal(calculateTroopMax(0, snapshot([])), 0);
  const cache = snapshot({ 182: { level: 2 }, 183: 1, 41: { level: 3 } });
  assert.equal(calculateTroopMax(0, cache), 3100 + 2770);
  cache.buildingStatus.data.queues = [{ buildingId: 182, level: 25 }];
  assert.equal(calculateTroopMax(0, cache), 5870, 'Queued target level must not be counted');
  cache.buildingStatus.data.buildings[182].level = 3;
  assert.equal(calculateTroopMax(0, cache), 3470 + 2770);
  assert.equal(calculateTroopMax(0, snapshot([{ buildingId: 182, level: 26 }])), null);
  assert.equal(calculateTroopMax(0, snapshot([{ buildingId: 182, level: 'invalid' }])), null);
  assert.equal(calculateTroopMax(0, { 'getUnitSummary:unit': { data: { limits: { 0: 12345 } } } }), 12345);
  cache.researchStatus = { data: { completedResearches: [{ researchId: 3, level: 5 }] } };
  assert.equal(calculateTroopMax(0, cache), 3470 + 2770, 'Training batch bonuses are not stock capacity');
});

test('actual troop training stays bounded by the confirmed stock limit and blocks unknown/overflow', async () => {
  const source = await readFile(new URL('../src/composables/useTroopTraining.ts', import.meta.url), 'utf8');
  const input = source.replace(/^import [\s\S]*?;\r?$/gm, '').replace(/^export \{[^}]+\};\r?$/gm, '');
  const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
  const cache = ref({ ...snapshot([{ buildingId: 182, level: 1 }]),
    'getUnitSummary:unit': { data: { available: [{ unitId: 1, count: 2760 }] } } });
  const calls = [];
  const context = { ref, computed, watch() {}, onMounted() {}, onUnmounted() {}, getTroopType, normalizeArray, TROOP_DEFS,
    calculateTroopMax, CAMP_BUILDING_IDS, useRpcCache: () => ({ cache, dispatchRpc: async batch => { calls.push(batch); return { ok: true }; } }) };
  vm.runInNewContext(code + '\nglobalThis.api = useTroopTraining();', context);
  assert.equal(context.api.troopStats.value[0].maxTroops, 2770);
  await context.api.startTrain(0, 1);
  assert.equal(calls[0][0].args.count, 10, 'The last batch may only fill remaining space');
  cache.value['getUnitSummary:unit'].data.available[0].count = 3000;
  await context.api.startTrain(0, 1);
  assert.equal(calls.length, 1, 'Existing stock above limit cannot expand the limit');
  delete cache.value.buildingStatus;
  await context.api.startTrain(0, 1);
  assert.equal(calls.length, 1, 'Unknown building data cannot authorize training');
});

test('progress references the Drill Grounds cap and clips overflow without renormalizing stock', () => {
  const normal = troopStockProgress({ readyCount: 10000, hospitalCount: 3000, trainingCount: 500, maxTroops: 14230 });
  assert.equal(normal.currentTotal, 13500);
  assert.equal(normal.remaining, 730);
  assert.equal(normal.readyPct, 10000 / 14230 * 100);
  assert.equal(normal.occupancyPct, 13500 / 14230 * 100);
  const overflow = troopStockProgress({ readyCount: 14000, hospitalCount: 500, trainingCount: 1000, maxTroops: 14230 });
  assert.equal(overflow.overLimit, 1270);
  assert.equal(overflow.remaining, 0);
  assert.equal(overflow.canTrain, false);
  assert.equal(overflow.readyPct, 14000 / 14230 * 100, 'Ready segment uses cap even when total exceeds it');
  assert.equal(overflow.filledPct, 100);
  assert.equal(overflow.trainingPct, 0, 'Clipped segments must not extend beyond 100%');
  assert.ok(overflow.occupancyPct > 100);
  const unknown = troopStockProgress({ readyCount: 5000, hospitalCount: 200, trainingCount: 100, maxTroops: null });
  assert.equal(unknown.occupancyPct, null);
  assert.equal(unknown.filledPct, 0);
  const zero = troopStockProgress({ readyCount: 1, hospitalCount: 0, trainingCount: 0, maxTroops: 0 });
  assert.equal(zero.overLimit, 1);
  assert.equal(zero.occupancyPct, null);
  assert.equal(zero.filledPct, 100);
});

test('actual Troops card reacts to cap changes and exposes correct overflow progress', async () => {
  const source = await readFile(new URL('../src/components/dashboard/TroopsOverview.vue', import.meta.url), 'utf8');
  const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const stats = ref([{ type: 0, readyCount: 14000, hospitalCount: 500, trainingCount: 1000, maxTroops: 14230 }]);
  const context = { computed, troopStockProgress, normalizeArray, getTroopType, formatNumber: String, formatDuration: String,
    useTroopTraining: () => ({ troopStats: stats, trainSettings: ref({}), trainings: ref({}), now: ref(Date.now()) }) };
  const code = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(code + '\nglobalThis.cards = troopCards;', context);
  assert.equal(context.cards.value[0].st.overLimit, 1270);
  assert.equal(context.cards.value[0].st.filledPct, 100);
  stats.value[0].maxTroops = 20000;
  assert.equal(context.cards.value[0].st.overLimit, 0);
  assert.equal(context.cards.value[0].st.filledPct, 77.5);
  stats.value[0].maxTroops = null;
  assert.equal(context.cards.value[0].st.limitKnown, false);
  assert.equal(context.cards.value[0].st.canTrain, false);
  assert.equal(context.cards.value[0].st.filledPct, 0);
});
