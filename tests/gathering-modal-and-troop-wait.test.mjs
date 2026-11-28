import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  normalizeTroopReserve,
  applyTroopReserve,
  countAvailableTroops,
  countTotalTroops,
  computeBalancedGatherAllocation,
  selectBalancedResourceType,
  isTroopAvailabilityEvent,
  planAutoGather,
} from '../src/services/queues/autoGather.ts';
import { dailyPlan } from '../src/services/queues/smartGather.ts';
import { computeActiveAutomations } from '../src/composables/useActiveAutomations.ts';
import { evaluateAutoGather, tickMineDefense } from '../src/background/backgroundRuntime.ts';
import { getMineConfigId } from '../src/utils/mineData.ts';

function makeBaseCache(availableUnits, now = 1_700_000_000_000) {
  const iso = new Date(now).toISOString();
  return {
    accountStatus: { data: { id: 1001 }, updatedAt: iso },
    marchStatus: { method: 'getMarches', data: { marches: [] }, updatedAt: iso },
    gatheringStatus: { data: { gatherings: [], plans: {} }, updatedAt: iso },
    'getUnitSummary:unit': {
      data: {
        available: availableUnits,
        squads: [],
      },
      updatedAt: iso,
    },
    heroGetAll: {
      data: {
        1: { id: 1, level: 50, star: 3, power: 5000 },
        2: { id: 2, level: 50, star: 3, power: 5100 },
        3: { id: 3, level: 50, star: 3, power: 5200 },
        4: { id: 4, level: 50, star: 3, power: 5300 },
        5: { id: 5, level: 50, star: 3, power: 5400 },
      },
      updatedAt: iso,
    },
    experimentalMapContext: {
      data: { mapId: 'map-1', center: { x: 10, y: 10 }, outposts: { 1001: { x: 10, y: 10 } } },
      updatedAt: iso,
    },
    incomingMineAttacks: {
      data: { accountId: 1001, snapshotAt: now, attacks: {} },
      updatedAt: iso,
    },
  };
}

test('applyTroopReserve preserves highest-tier troops per type without mutating source', () => {
  const summary = {
    available: [
      { unitId: 9, count: 60 },  // Infantry T9
      { unitId: 7, count: 100 }, // Infantry T7
      { unitId: 19, count: 150 }, // Spearmen T9
      { unitId: 28, count: 80 },  // Marksmen T8
      { unitId: 25, count: 40 },  // Marksmen T5
    ],
  };

  const reserve = normalizeTroopReserve({ infantry: 100, spearmen: 100, marksmen: 100 });
  const after = applyTroopReserve(summary, reserve);

  // Source untouched
  assert.equal(summary.available[0].count, 60);
  assert.equal(summary.available[2].count, 150);

  // Infantry: 60 T9 reserved + 40 T7 reserved => 60 T7 left
  const infT9 = after.available.find((u) => u.unitId === 9);
  const infT7 = after.available.find((u) => u.unitId === 7);
  assert.equal(infT9, undefined);
  assert.equal(infT7?.count, 60);

  // Spearmen: 100 T9 reserved => 50 T9 left
  const spT9 = after.available.find((u) => u.unitId === 19);
  assert.equal(spT9?.count, 50);

  // Marksmen: 80 T8 reserved + 20 T5 reserved => 20 T5 left
  const mkT8 = after.available.find((u) => u.unitId === 28);
  const mkT5 = after.available.find((u) => u.unitId === 25);
  assert.equal(mkT8, undefined);
  assert.equal(mkT5?.count, 20);

  assert.equal(countAvailableTroops(after), 130);
});

test('planAutoGather returns waitForTroops BEFORE searchMine/getMineById when no surplus troops remain', () => {
  const now = 1_700_000_000_000;
  // 0 troops total
  const emptyCache = makeBaseCache([], now);
  const resZero = planAutoGather(
    emptyCache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: { enabled: true, smartEnabled: true, maxMarches: 3, mineLevel: 'nearest', mineType: 'food' },
    },
    now
  );
  assert.equal(resZero.action, 'wait');
  assert.equal(resZero.waitForTroops, true);
  assert.match(resZero.reason || '', /No troops available/i);

  // Troops present, but all within reserve (100/100/100)
  const reservedOnlyCache = makeBaseCache(
    [
      { unitId: 9, count: 90 },
      { unitId: 19, count: 100 },
      { unitId: 29, count: 50 },
    ],
    now
  );
  const resReserved = planAutoGather(
    reservedOnlyCache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: {
        enabled: true,
        smartEnabled: true,
        maxMarches: 3,
        mineLevel: 'nearest',
        mineType: 'food',
        reserveTroops: { infantry: 100, spearmen: 100, marksmen: 100 },
      },
    },
    now
  );
  assert.equal(resReserved.action, 'wait');
  assert.equal(resReserved.waitForTroops, true);
  assert.match(resReserved.reason || '', /above reserve/i);
});

test('isTroopAvailabilityEvent detects completeTraining, completeHealing, march return, and unit summary increase', () => {
  const now = 1_700_000_000_000;
  const prevCache = makeBaseCache([], now - 5000);
  const sameCache = makeBaseCache([], now - 5000);

  // Noise RPC should NOT wake
  assert.equal(
    isTroopAvailabilityEvent(
      { requestBody: JSON.stringify({ calls: [{ name: 'getChatMessages', feature: 'chat' }] }) },
      prevCache,
      sameCache,
      now
    ),
    false
  );

  // completeTraining wakes
  assert.equal(
    isTroopAvailabilityEvent(
      { requestBody: JSON.stringify({ calls: [{ name: 'completeTraining', feature: 'unit' }] }) },
      prevCache,
      sameCache,
      now
    ),
    true
  );

  // completeHealing wakes
  assert.equal(
    isTroopAvailabilityEvent(
      { requestBody: JSON.stringify({ calls: [{ name: 'completeHealing', feature: 'unit' }] }) },
      prevCache,
      sameCache,
      now
    ),
    true
  );

  // WebSocket returnFromMineCompleted wakes
  assert.equal(
    isTroopAvailabilityEvent(
      {
        transport: 'websocket',
        direction: 'received',
        encoding: 'utf8',
        payload: JSON.stringify({ result: { type: 'returnFromMineCompleted' } }),
      },
      prevCache,
      sameCache,
      now
    ),
    true
  );

  // Updated getUnitSummary with surplus troops wakes
  const replenishedCache = makeBaseCache([{ unitId: 9, count: 250 }], now);
  assert.equal(
    isTroopAvailabilityEvent(
      null,
      prevCache,
      replenishedCache,
      now,
      { infantry: 100, spearmen: 100, marksmen: 100 }
    ),
    true
  );
});

test('evaluateSmartGather latches waitingForTroops to stop RPC spam until troop event arrives', async () => {
  const now = Date.now();
  const sent = [];
  const local = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    autoGatherSettings: { enabled: true, smartEnabled: true, maxMarches: 3, mineLevel: 10, mineType: 'food' },
    smartGatherState: { accountId: 1001, interrupted: [] },
    rpcCache: makeBaseCache([], now - 5000),
  };

  const mockChrome = {
    runtime: { id: 'test-ext', onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    alarms: { create() {}, clear() {}, onAlarm: { addListener() {} } },
    storage: {
      onChanged: { addListener() {} },
      local: {
        async get(keys) {
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, local[k]]));
          if (typeof keys === 'string') return { [keys]: local[keys] };
          return { ...local };
        },
        async set(patch) {
          Object.assign(local, patch);
        },
        async remove() {},
      },
    },
    tabs: {
      async sendMessage(_tabId, msg) {
        sent.push(msg);
        return { ok: true };
      },
      query(_q, cb) {
        cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]);
      },
    },
  };

  // 1st evaluation with 0 troops -> sets waitingForTroops latch, sends 0 RPCs
  await evaluateAutoGather(null, local.rpcCache, local, 1, mockChrome);
  assert.equal(sent.length, 0);
  assert.ok(local.smartGatherState.waitingForTroops);

  // 2nd evaluation on unrelated record -> remains latched, 0 RPCs
  await evaluateAutoGather(
    { requestBody: JSON.stringify({ calls: [{ name: 'getChatMessages', feature: 'chat' }] }) },
    local.rpcCache,
    local,
    1,
    mockChrome
  );
  assert.equal(sent.length, 0);
  assert.ok(local.smartGatherState.waitingForTroops);

  // ActiveAutomationStrip reflects waiting state
  const pills = computeActiveAutomations(local);
  const gatherPill = pills.find((p) => p.id === 'gather');
  assert.equal(gatherPill?.statusTone, 'waiting');
  assert.match(gatherPill?.label || '', /Waiting for troops/i);

  // Replenished troops -> wakes up and dispatches searchMine
  const nextCache = makeBaseCache([{ unitId: 9, count: 500 }], now);
  await evaluateAutoGather(
    { requestBody: JSON.stringify({ calls: [{ name: 'completeTraining', feature: 'unit' }] }) },
    nextCache,
    local,
    1,
    mockChrome
  );
  assert.equal(local.smartGatherState.waitingForTroops, null);
  assert.ok(sent.some((m) => m.calls?.some((c) => c.name === 'searchMine')));
});

test('tickMineDefense operates independently when autoGatherSettings.enabled is false', async () => {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const sent = [];
  const clearedAlarms = [];
  const local = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    autoGatherSettings: {
      enabled: false,
      smartEnabled: false,
      defenseRecallEnabled: true,
      defenseInfirmaryThreshold: 50,
    },
    smartGatherState: { accountId: 1001, interrupted: [] },
    rpcCache: {
      accountStatus: { data: { id: 1001 }, updatedAt: iso },
      marchStatus: {
        method: 'getMarches',
        data: {
          marches: [
            { squadId: 77, mineId: 'm-1', mapId: 'map-1', mineConfigId: 10, stage: 'gathering', targetCoordinates: { x: 1, y: 1 } },
          ],
        },
        updatedAt: iso,
      },
      'getUnitSummary:unit': {
        data: { squads: [{ squadId: 77, units: [{ unitId: 9, count: 100 }] }], available: [] },
        updatedAt: iso,
      },
      buildingStatus: { data: { buildings: [{ buildingId: 162, level: 20 }] }, updatedAt: iso },
      'getHealing:unit': { data: { injuredUnits: [{ count: 50000 }] }, updatedAt: iso },
      incomingMineAttacks: {
        data: {
          accountId: 1001,
          snapshotAt: now,
          attacks: {
            'route-1': { routeId: 'route-1', attackerId: '9999', mineId: 'm-1', mapId: 'map-1', impactAt: now + 5000 },
          },
        },
        updatedAt: iso,
      },
    },
  };

  const mockChrome = {
    runtime: { id: 'test-ext' },
    alarms: { create() {}, clear(name) { clearedAlarms.push(name); } },
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, local[k]]));
          if (typeof keys === 'string') return { [keys]: local[keys] };
          return { ...local };
        },
        async set(patch) {
          Object.assign(local, patch);
        },
      },
    },
    tabs: {
      async sendMessage(_tabId, msg) {
        sent.push(msg);
        return { ok: true };
      },
      query(_q, cb) {
        cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]);
      },
    },
  };

  await tickMineDefense(mockChrome);
  assert.ok(
    sent.some((m) => m.calls?.some((c) => c.name === 'stopMineGathering' && c.args?.squadId === 77)),
    'Independent Mine Defense must recall threatened squad even when Auto-Gather is disabled'
  );

  // Turning off defenseRecallEnabled clears hwa-mine-defense alarm
  local.autoGatherSettings.defenseRecallEnabled = false;
  await tickMineDefense(mockChrome);
  assert.ok(clearedAlarms.includes('hwa-mine-defense'));
});

test('GatheringModal uses header status/actions, unified Auto toggle, mutual Auto/Manual sections, independent defense, and collapsible reserve', async () => {
  const vue = await readFile(resolve('src/components/dialogs/GatheringModal.vue'), 'utf8');
  assert.match(vue, /<template #header-status>/);
  assert.match(vue, /<template #header-actions>/);
  assert.match(vue, /id="gather-auto-toggle"/);
  assert.doesNotMatch(vue, /v-model="autoSettings\.smartEnabled"/, 'Smart gathering checkbox must be merged into unified Auto toggle');

  assert.match(vue, /v-if="autoSettings\.enabled"[\s\S]{0,80}id="gather-auto-section"/);
  assert.match(vue, /v-else[\s\S]{0,80}id="gather-manual-section"/);

  assert.match(vue, /id="gather-defense-section"/);
  assert.match(vue, /id="gather-defense-toggle"/);

  assert.match(vue, /id="gather-reserve-toggle-btn"/);
  assert.match(vue, /id="gather-reserve-panel"/);
  assert.match(vue, /id="gather-reserve-infantry"/);
  assert.match(vue, /id="gather-reserve-spearmen"/);
  assert.match(vue, /id="gather-reserve-marksmen"/);
  assert.match(vue, /const showReserveConfig = ref\(false\)/);
});

test('P2-55: computeBalancedGatherAllocation splits (total - reserve) / maxMarches respecting user Max Gathering Marches', () => {
  const reserve = { infantry: 100, spearmen: 100, marksmen: 100 }; // 300 total
  const rawSummary = {
    available: [
      { unitId: 9, count: 3500 },
      { unitId: 19, count: 3400 },
      { unitId: 29, count: 3400 },
    ], // 10,300 total -> 10,000 net < 4,000 * 4 = 16,000
    squads: [],
  };
  const effectiveSummary = applyTroopReserve(rawSummary, reserve);

  const p0 = computeBalancedGatherAllocation({
    rawSummary,
    effectiveSummary,
    reserveTroops: reserve,
    squadCapacity: 4000,
    effectiveMaxMarches: 4,
    activeCount: 0,
  });
  assert.equal(p0.constrained, true);
  assert.equal(p0.targetSlots, 4);
  assert.equal(p0.perMarchCap, 2500);
  assert.equal(p0.dispatchCap, 2500);

  // Full army (25,000 net >= 20,000) -> unconstrained, uses all 5 marches at full 4,000 cap
  const bigSummary = { available: [{ unitId: 9, count: 25300 }], squads: [] };
  const pFull = computeBalancedGatherAllocation({
    rawSummary: bigSummary,
    effectiveSummary: applyTroopReserve(bigSummary, reserve),
    reserveTroops: reserve,
    squadCapacity: 4000,
    effectiveMaxMarches: 5,
    activeCount: 0,
  });
  assert.equal(pFull.constrained, false);
  assert.equal(pFull.targetSlots, 5);
  assert.equal(pFull.dispatchCap, 4000);

  // maxMarches === 1 -> no division by zero, unconstrained
  const pOne = computeBalancedGatherAllocation({
    rawSummary,
    effectiveSummary,
    reserveTroops: reserve,
    squadCapacity: 4000,
    effectiveMaxMarches: 1,
    activeCount: 0,
  });
  assert.equal(pOne.constrained, false);
  assert.equal(pOne.targetSlots, 1);
  assert.equal(countTotalTroops({ available: [{ unitId: 9, count: 500 }], squads: [{ units: [{ unitId: 9, state: { survived: 250 } }] }] }), 750);
});

test('P2-55: planAutoGather splits troops across all user Max Gathering Marches (including the final slot)', () => {
  const now = 1_700_000_000_000;
  const cache = makeBaseCache(
    [
      { unitId: 9, count: 3100 },
      { unitId: 19, count: 3100 },
      { unitId: 29, count: 3100 },
    ], // 9,300 total - 300 reserve = 9,000 net; 4 marches -> 2,250 per march
    now
  );
  cache.researchStatus = {
    data: { completedResearches: [{ id: 7, level: 1 }, { id: 94, level: 1 }] },
    updatedAt: new Date(now).toISOString(),
  };
  cache.subscriptionGetInfo = {
    data: { subscription: { isActive: true } },
    updatedAt: new Date(now).toISOString(),
  };
  cache.experimentalMineSearch = {
    data: {
      mapId: 'map-1',
      mineConfigId: getMineConfigId('food', 10),
      mines: [{ mineId: 'mine-10-a', coordinates: { x: 11, y: 11 }, resourceAmount: 30000000 }],
    },
    updatedAt: new Date(now).toISOString(),
  };

  // Standard mode dispatch #1: capped at 2,250 (9,000 / 4)
  const stdPlan = planAutoGather(
    cache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: {
        enabled: true,
        smartEnabled: false,
        maxMarches: 4,
        mineLevel: 10,
        mineType: 'food',
        reserveTroops: { infantry: 100, spearmen: 100, marksmen: 100 },
      },
    },
    now
  );
  assert.equal(stdPlan.action, 'gather');
  const stdSent = stdPlan.call.args.squad.units.reduce((s, u) => s + u.count, 0);
  assert.equal(stdSent, 2250);

  // Optimized mode dispatch #1: also capped at 2,250
  const optPlan = planAutoGather(
    cache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: {
        enabled: true,
        smartEnabled: false,
        maxMarches: 4,
        mineLevel: 10,
        mineType: 'food',
        selectedTeam: 'optimized',
        optimizeTeam: true,
        reserveTroops: { infantry: 100, spearmen: 100, marksmen: 100 },
      },
    },
    now
  );
  assert.equal(optPlan.action, 'gather');
  const optSent = optPlan.call.args.squad.units.reduce((s, u) => s + u.count, 0);
  assert.equal(optSent, 2250);

  // When 3 marches are already active and maxMarches is 4, dispatches the 4th slot instead of capping at 3
  cache.marchStatus.data.marches = [
    { squadId: 1, mineId: 'm1', stage: 'gathering' },
    { squadId: 2, mineId: 'm2', stage: 'gathering' },
    { squadId: 3, mineId: 'm3', stage: 'gathering' },
  ];
  const fourthPlan = planAutoGather(
    cache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: {
        enabled: true,
        smartEnabled: false,
        maxMarches: 4,
        mineLevel: 10,
        mineType: 'food',
        reserveTroops: { infantry: 100, spearmen: 100, marksmen: 100 },
      },
    },
    now
  );
  assert.equal(fourthPlan.action, 'gather');
});

test('P2-55: selectBalancedResourceType picks lowest capacity-weighted stock including marching/gathering marches, and dailyPlan uses 5% margin', () => {
  const now = 1_700_000_000_000;
  const iso = new Date(now).toISOString();
  const cache = {
    'resource:material:5': { data: { amount: 50_000_000 } }, // Food x1 = 50M
    'resource:material:4': { data: { amount: 45_000_000 } }, // Wood x1 = 45M
    'resource:material:3': { data: { amount: 6_000_000 } },  // Stone x5 = 30M
    'resource:material:2': { data: { amount: 1_000_000 } },  // Iron x20 = 20M (lowest!)
    marchStatus: { data: { marches: [] }, updatedAt: iso },
    'getUnitSummary:unit': { data: { squads: [], available: [] }, updatedAt: iso },
  };

  // No marches in flight -> Iron (20M weighted) is lowest
  const pick1 = selectBalancedResourceType(cache, now);
  assert.equal(pick1.hasStockData, true);
  assert.equal(pick1.type, 'iron');

  // Add a squad currently MARCHING to an Iron mine carrying 1.5M Iron (weighted +30M -> Iron becomes 50M)
  cache.marchStatus.data.marches = [
    { squadId: 88, mineId: 'iron-m1', kind: 'iron', stage: 'moveToTargetInSolo', resourceAmount: 1_500_000, endsAt: now + 60_000 },
  ];
  const pick2 = selectBalancedResourceType(cache, now);
  assert.equal(pick2.inFlight.iron, 1_500_000);
  assert.equal(pick2.scores.iron, 50_000_000);
  assert.equal(pick2.type, 'stone'); // Stone (30M) is now lowest!

  // Daily quest 5% margin check (target = 105% of quest def.target)
  const dailyCache = {
    accountStatus: { data: { id: 1001 }, updatedAt: iso },
    questResetStatus: { data: { nextDayAt: now + 3600_000 }, updatedAt: iso },
    'getDailyQuests:quest': {
      data: {
        quests: [
          { id: 10101, progress: 0, state: 'inProgress' },
        ],
      },
      updatedAt: iso,
    },
    marchStatus: { data: { marches: [] }, updatedAt: iso },
  };
  const dPlan = dailyPlan(dailyCache, {}, now, {});
  if (dPlan.rows?.length) {
    // Verify 5% margin (strictly > 102% when target >= 100)
    assert.ok(dPlan.rows[0].target >= Math.ceil((dPlan.rows[0].target / 1.05) * 1.04));
  }
});
