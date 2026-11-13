import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { calculateTroopMax, getTroopType, normalizeArray, TROOP_DEFS, CAMP_BUILDING_IDS } from '../src/utils/troops.ts';
import { DRILL_GROUND_LIMIT_BY_LEVEL, CAMP_LIMIT_BY_LEVEL } from '../src/utils/troopLimitData.ts';

const snapshot = buildings => ({ buildingStatus: { data: { buildings } } });
test('troop stock combines each confirmed Drill Grounds with the corresponding Camp', () => {
  const cache = snapshot([{ buildingId: 182, level: 10 }, { buildingId: 183, level: 5 }, { buildingId: 184, level: 2 },
    { buildingId: 40, level: 8 }, { buildingId: 41, level: 10 }, { buildingId: 42, level: 5 }]);
  const shared = 5630 + 4170 + 3100;
  assert.equal(calculateTroopMax(0, cache), shared + 9500);
  assert.equal(calculateTroopMax(1, cache), shared + 6150);
  assert.equal(calculateTroopMax(2, cache), shared + 8650);
  assert.equal(calculateTroopMax(0, cache, 999999), shared + 9500);
  assert.equal(calculateTroopMax(3, cache), null);
  assert.equal(DRILL_GROUND_LIMIT_BY_LEVEL[25], 9500);
  assert.equal(CAMP_LIMIT_BY_LEVEL[25], 18500);
});

test('only completed building levels affect capacity, with unknown and unbuilt states distinct', () => {
  assert.equal(calculateTroopMax(0, {}), null);
  assert.equal(calculateTroopMax(0, snapshot([])), 0);
  const cache = snapshot({ 182: { level: 2 }, 183: 1, 41: { level: 3 } });
  assert.equal(calculateTroopMax(0, cache), 3100 + 2770 + 3450);
  cache.buildingStatus.data.queues = [{ buildingId: 182, level: 25 }];
  assert.equal(calculateTroopMax(0, cache), 9320, 'Queued target level must not be counted');
  cache.buildingStatus.data.buildings[182].level = 3;
  assert.equal(calculateTroopMax(0, cache), 3470 + 2770 + 3450);
  assert.equal(calculateTroopMax(0, snapshot([{ buildingId: 182, level: 26 }])), null);
  assert.equal(calculateTroopMax(0, snapshot([{ buildingId: 182, level: 'invalid' }])), null);
  assert.equal(calculateTroopMax(0, { 'getUnitSummary:unit': { data: { limits: { 0: 12345 } } } }), 12345);
  cache.researchStatus = { data: { completedResearches: [{ researchId: 3, level: 5 }] } };
  assert.equal(calculateTroopMax(0, cache), 3470 + 2770 + 3450, 'Training batch bonuses are not stock capacity');
});

test('actual troop training stays bounded by the confirmed stock limit and blocks unknown/overflow', async () => {
  const source = await readFile(new URL('../src/composables/useTroopTraining.ts', import.meta.url), 'utf8');
  const input = source.replace(/^import [\s\S]*?;\r?$/gm, '').replace(/^export \{[^}]+\};\r?$/gm, '');
  const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
  const cache = ref({ ...snapshot([{ buildingId: 41, level: 1 }]),
    'getUnitSummary:unit': { data: { available: [{ unitId: 1, count: 1290 }] } } });
  const calls = [];
  const context = { ref, computed, watch() {}, onMounted() {}, onUnmounted() {}, getTroopType, normalizeArray, TROOP_DEFS,
    calculateTroopMax, CAMP_BUILDING_IDS, useRpcCache: () => ({ cache, dispatchRpc: async batch => { calls.push(batch); return { ok: true }; } }) };
  vm.runInNewContext(code + '\nglobalThis.api = useTroopTraining();', context);
  assert.equal(context.api.troopStats.value[0].maxTroops, 1300);
  await context.api.startTrain(0, 1);
  assert.equal(calls[0][0].args.count, 10, 'The last batch may only fill remaining space');
  cache.value['getUnitSummary:unit'].data.available[0].count = 1500;
  await context.api.startTrain(0, 1);
  assert.equal(calls.length, 1, 'Existing stock above limit cannot expand the limit');
  delete cache.value.buildingStatus;
  await context.api.startTrain(0, 1);
  assert.equal(calls.length, 1, 'Unknown building data cannot authorize training');
});
