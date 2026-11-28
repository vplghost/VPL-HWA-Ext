import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAutoHealCalls,
  buildSmartHealBatch,
  computeMarchDefenseDemand,
  normalizeTroopHealSettings,
} from '../src/services/troopHealService.ts';
import { planPostQueueHeal } from '../src/services/queues/queueCoordination.ts';
import { computeActiveAutomations, AUTOMATION_STORAGE_KEYS } from '../src/composables/useActiveAutomations.ts';
import { CONFIG_KEYS } from '../src/utils/dataBackup.ts';

function makeHeroRoster() {
  // Top 5 heroes by power: IDs 1..5 (each with explicit troopCapacity = 800 -> 5*800 + base 950 = 4950)
  // Plus a weaker hero 6 that should not be selected.
  return {
    1: { id: 1, level: 120, star: 6, power: 90000, troopCapacity: 800 },
    2: { id: 2, level: 120, star: 6, power: 85000, troopCapacity: 800 },
    3: { id: 3, level: 120, star: 6, power: 80000, troopCapacity: 800 },
    4: { id: 4, level: 120, star: 6, power: 75000, troopCapacity: 800 },
    5: { id: 5, level: 120, star: 6, power: 70000, troopCapacity: 800 },
    6: { id: 6, level: 40, star: 2, power: 5000, troopCapacity: 300 },
  };
}

function makeBaseCache(overrides = {}) {
  return {
    accountStatus: { data: { id: 999 } },
    heroGetAll: { data: makeHeroRoster() },
    // Command Tactics I (7) + Command Tactics II (94) => 3 marches (+ 1 defense = 4 teams)
    researchStatus: {
      data: {
        completedResearches: [
          { researchId: 7, level: 1 },
          { researchId: 94, level: 1 },
        ],
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 9, count: 10000 },  // Infantry ready
          { unitId: 19, count: 10000 }, // Spearmen ready
          { unitId: 29, count: 10000 }, // Marksmen ready
        ],
        squads: [],
      },
    },
    ...overrides,
  };
}

test('P2-47: computeMarchDefenseDemand uses top-5 strongest heroes (ignoring customTeams) and (maxMarches + 1) target', () => {
  const cache = makeBaseCache();
  // Even if customTeams has tiny teams, they must be ignored
  const stored = {
    customTeams: { '999': [{ id: 'c1', name: 'Tiny', heroIds: [6], maxTroops: 200 }] },
    troopCapacitySettings: { base: 950, defaultHero: 600 },
  };
  const demand = computeMarchDefenseDemand(cache, stored);

  // 950 + 5 * 800 = 4950
  assert.equal(demand.topTeamCapacity, 4950);
  assert.deepEqual(demand.topTeamHeroIds, [1, 2, 3, 4, 5]);
  assert.equal(demand.autoBatchPerType, 1650); // ceil(4950 / 3)
  assert.equal(demand.maxMarches, 3);
  assert.equal(demand.requiredTeams, 4); // maxMarches + 1 defense
  assert.equal(demand.targetPerType, 6600); // ceil(4950 * 4 / 3)
  assert.equal(demand.totalShortfall, 0);
});

test('P2-47: buildSmartHealBatch prioritizes highest troop levels first and respects manual batchPerType = 1000', () => {
  const healingData = {
    injuredUnits: [
      // Infantry: Lv.7=500, Lv.8=700, Lv.9=600
      { unitId: 7, count: 500 },
      { unitId: 8, count: 700 },
      { unitId: 9, count: 600 },
      // Spearmen: Lv.8=1200, Lv.9=200
      { unitId: 18, count: 1200 },
      { unitId: 19, count: 200 },
      // Marksmen: Lv.9=1500
      { unitId: 29, count: 1500 },
    ],
  };

  const demand = computeMarchDefenseDemand(makeBaseCache());
  const batch = buildSmartHealBatch(
    healingData,
    { batchPerType: 1000, prioritizeTeamDemand: true, onlyHealTeamShortfall: false },
    demand
  );

  assert.equal(batch.effectiveBatchPerType, 1000);
  assert.equal(batch.totalCount, 3000);
  assert.deepEqual(batch.perTypeCounts, [1000, 1000, 1000]);

  const byId = new Map(batch.units.map((u) => [u.unitId, u.count]));
  // Infantry: 600 Lv.9 + 400 Lv.8, 0 Lv.7
  assert.equal(byId.get(9), 600);
  assert.equal(byId.get(8), 400);
  assert.equal(byId.has(7), false);
  // Spearmen: 200 Lv.9 + 800 Lv.8
  assert.equal(byId.get(19), 200);
  assert.equal(byId.get(18), 800);
  // Marksmen: 1000 Lv.9
  assert.equal(byId.get(29), 1000);
});

test('P2-47: buildSmartHealBatch prioritizes deficient troop type for (maxMarches + 1) shortfall and stops when onlyHealTeamShortfall is met', () => {
  // Infantry ready = 5800 (shortfall = 6600 - 5800 = 800), Spearmen & Marksmen = 10000 (shortfall = 0)
  const cache = makeBaseCache({
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 9, count: 5800 },
          { unitId: 19, count: 10000 },
          { unitId: 29, count: 10000 },
        ],
        squads: [],
      },
    },
  });
  const demand = computeMarchDefenseDemand(cache);
  assert.deepEqual(demand.shortfallByType, [800, 0, 0]);

  const healingData = {
    injuredUnits: [
      { unitId: 9, count: 2000 },
      { unitId: 19, count: 2000 },
      { unitId: 29, count: 2000 },
    ],
  };

  // Prioritize deficient Infantry only (capped at 800 shortfall <= 1650 autoBatchPerType)
  const priorityBatch = buildSmartHealBatch(
    healingData,
    { batchPerType: 0, prioritizeTeamDemand: true, onlyHealTeamShortfall: false },
    demand
  );
  assert.equal(priorityBatch.reason, 'shortfall_priority');
  assert.deepEqual(priorityBatch.perTypeCounts, [800, 0, 0]);
  assert.equal(priorityBatch.totalCount, 800);

  // When all 3 types meet (maxMarches + 1) target and onlyHealTeamShortfall = true -> empty batch
  const fullDemand = computeMarchDefenseDemand(makeBaseCache());
  const stoppedBatch = buildSmartHealBatch(
    healingData,
    { batchPerType: 0, prioritizeTeamDemand: true, onlyHealTeamShortfall: true },
    fullDemand
  );
  assert.equal(stoppedBatch.reason, 'demand_met');
  assert.equal(stoppedBatch.units.length, 0);
});

test('P2-47: buildAutoHealCalls handles active wait, completeHealing chaining, threshold, backoff, and 0-Emerald safety', () => {
  const now = 1_700_000_000_000;

  // 1. Active healing -> waiting + nextWakeAt = endsAt + 2000
  const activeCache = makeBaseCache({
    'getHealing:unit': {
      data: {
        injuredUnits: [{ unitId: 9, count: 5000 }],
        healing: { startDate: now - 5000, duration: 60000, units: [{ unitId: 9, count: 1000 }] },
      },
    },
  });
  const waitPlan = buildAutoHealCalls(activeCache, {}, { autoHealEnabled: true }, now);
  assert.equal(waitPlan.action, 'waiting');
  assert.equal(waitPlan.calls.length, 0);
  assert.equal(waitPlan.nextWakeAt, now - 5000 + 60000 + 2000);

  // 2. Finished healing -> completeHealing + getUnitSummary + getHealing
  const doneCache = makeBaseCache({
    'getHealing:unit': {
      data: {
        injuredUnits: [{ unitId: 9, count: 5000 }],
        healing: { startDate: now - 70000, duration: 60000, units: [{ unitId: 9, count: 1000 }] },
      },
    },
  });
  const completePlan = buildAutoHealCalls(doneCache, {}, { autoHealEnabled: true }, now);
  assert.equal(completePlan.action, 'complete');
  assert.deepEqual(
    completePlan.calls.map((c) => c.name),
    ['completeHealing', 'getUnitSummary', 'getHealing']
  );

  // 3. Idle with huge infirmary -> starts smart batch, zero starmoney/speedup calls
  const idleCache = makeBaseCache({
    'getHealing:unit': {
      data: {
        injuredUnits: [
          { unitId: 9, count: 10000 },
          { unitId: 19, count: 10000 },
          { unitId: 29, count: 10000 },
        ],
        healing: null,
      },
    },
  });
  const healPlan = buildAutoHealCalls(idleCache, {}, { autoHealEnabled: true, batchPerType: 1000 }, now);
  assert.equal(healPlan.action, 'heal');
  assert.equal(healPlan.calls[0].name, 'startHealing');
  assert.equal(healPlan.batch?.totalCount, 3000);
  assert.equal(
    healPlan.calls.some((c) => /starmoney|emerald|speedup/i.test(JSON.stringify(c))),
    false
  );

  // 4. Error backoff respected
  const backoffPlan = buildAutoHealCalls(
    idleCache,
    { autoHealState: { nextRetryAt: now + 300_000 } },
    { autoHealEnabled: true },
    now
  );
  assert.equal(backoffPlan.action, 'backoff');
  assert.equal(backoffPlan.calls.length, 0);
  assert.equal(backoffPlan.nextWakeAt, now + 300_000);

  // 5. Below minInjuredToStart when no shortfall -> no-op
  const tinyCache = makeBaseCache({
    'getHealing:unit': {
      data: { injuredUnits: [{ unitId: 9, count: 25 }], healing: null },
    },
  });
  const belowPlan = buildAutoHealCalls(tinyCache, {}, { autoHealEnabled: true, minInjuredToStart: 100 }, now);
  assert.equal(belowPlan.action, 'below_threshold');
  assert.equal(belowPlan.calls.length, 0);
});

test('P2-47: planPostQueueHeal uses smart batch when wounded exceeds top team capacity', () => {
  const now = 1_700_000_000_000;
  const cache = makeBaseCache();
  const healingData = {
    injuredUnits: [
      { unitId: 9, count: 8000 },
      { unitId: 19, count: 8000 },
      { unitId: 29, count: 8000 },
    ],
  };
  const plan = planPostQueueHeal(healingData, now, {
    cache,
    healSettings: normalizeTroopHealSettings({ autoHealEnabled: true, batchPerType: 1000 }),
  });
  assert.equal(plan.action, 'heal');
  assert.equal(plan.summary.troopsCount, 3000);
});

test('P2-47: UI selectors, ActiveAutomations, and CONFIG_KEYS backup wiring', () => {
  assert.ok(CONFIG_KEYS.includes('troopHealSettings'));
  assert.ok(AUTOMATION_STORAGE_KEYS.includes('troopHealSettings'));

  const active = computeActiveAutomations({
    troopHealSettings: { autoHealEnabled: true },
    autoHealState: {},
  });
  const healItem = active.find((a) => a.id === 'heal');
  assert.ok(healItem);
  assert.equal(healItem.storageDisableKey?.key, 'troopHealSettings');
  assert.equal(healItem.storageDisableKey?.patch?.autoHealEnabled, false);

  const settingsVue = fs.readFileSync(path.resolve('src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsVue, /id="settings-auto-heal-section"/);
  assert.match(settingsVue, /id="setting-auto-heal"/);
  assert.match(settingsVue, /id="setting-auto-heal-batch"/);

  const troopsVue = fs.readFileSync(path.resolve('src/components/dashboard/TroopsOverview.vue'), 'utf8');
  assert.match(troopsVue, /id="dashboard-troops-heal-batch-btn"/);
});
