import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOptimizedGatheringTeam,
  calculateMineCargo,
} from '../src/utils/experimentalData.ts';
import { planAutoGather } from '../src/services/queues/autoGather.ts';
import { resumePlan } from '../src/services/queues/smartGather.ts';

test('calculateMineCargo respects target mine remaining resources instead of full mine level capacity', () => {
  // Food weight is 1. Level 10 full capacity is 14,000,000.
  assert.equal(calculateMineCargo('food', 10), 14000000);

  // When target mine has 250,000 remaining food, cargo must be 250,000
  assert.equal(calculateMineCargo('food', 10, 250000), 250000);

  // Stone weight is 5. Level 8 full capacity is 7,500,000.
  assert.equal(calculateMineCargo('stone', 8), 7500000);

  // When target stone mine has 100,000 remaining stone, cargo must be 500,000
  assert.equal(calculateMineCargo('stone', 8, 100000), 500000);

  // Iron weight is 20. Level 9 full capacity is 10,500,000.
  assert.equal(calculateMineCargo('iron', 9), 10500000);

  // When target iron mine has 20,000 remaining iron, cargo must be 400,000
  assert.equal(calculateMineCargo('iron', 9, 20000), 400000);
});

test('buildOptimizedGatheringTeam scales heroes and troops to target mine remaining amount', () => {
  const heroes = {
    10: { power: 1200 },
    11: { power: 800 },
    12: { power: 2500 },
    13: { power: 1800 },
    14: { power: 950 },
    15: { power: 4000 },
    16: { power: 500 },
  };
  const availableHeroIds = [10, 11, 12, 13, 14, 15, 16];
  const unitSummary = {
    available: [
      { unitId: 7, count: 10000 }, // Tier 7 troops: 1,900 cargo each
    ],
  };

  // Full level 10 food mine (14M cargo) -> requires 7369 troops -> requires all 5 heroes
  const fullLv10 = buildOptimizedGatheringTeam({
    heroes,
    availableHeroIds,
    unitSummary,
    mineType: 'food',
    mineLevel: 10,
  });
  assert.equal(fullLv10.requiredCargo, 14000000);
  assert.equal(fullLv10.requiredTroops, 7369);
  assert.equal(fullLv10.heroIds.length, 5);

  // Partially cleared level 10 food mine with only 80,000 remaining resources -> requires 43 troops -> 1 hero
  const partialLv10 = buildOptimizedGatheringTeam({
    heroes,
    availableHeroIds,
    unitSummary,
    mineType: 'food',
    mineLevel: 10,
    resourceAmount: 80000,
  });
  assert.equal(partialLv10.requiredCargo, 80000);
  assert.equal(partialLv10.requiredTroops, 43);
  assert.deepEqual(Array.from(partialLv10.heroIds), [16]);
  assert.equal(partialLv10.heroIds.length, 1);
  assert.equal(partialLv10.allocatedTroops.reduce((sum, u) => sum + u.count, 0), 43);

  // Supports passing targetMine object with remaining resource amount
  const targetMineObj = {
    mineId: 'mine-lv10-part',
    mineType: 'food',
    level: 10,
    resourceAmount: 120000,
  };
  const fromTargetMine = buildOptimizedGatheringTeam({
    heroes,
    availableHeroIds,
    unitSummary,
    targetMine: targetMineObj,
  });
  assert.equal(fromTargetMine.requiredCargo, 120000);
  assert.equal(fromTargetMine.requiredTroops, 64);
  assert.deepEqual(Array.from(fromTargetMine.heroIds), [16]);
  assert.equal(fromTargetMine.allocatedTroops.reduce((sum, u) => sum + u.count, 0), 64);
});

test('planAutoGather with optimizeTeam reads target mine remaining resource amount', () => {
  const now = 200000;
  const stored = {
    popupRpcEnabled: true,
    autoGatherSettings: {
      enabled: true,
      mineType: 'food',
      mineLevel: 10,
      selectedTeam: 'optimized',
    },
  };
  const cache = {
    accountStatus: { data: { id: 'acc1' } },
    experimentalMapContext: { data: { mapId: 'map1', center: { x: 10, y: 20 } } },
    heroGetAll: {
      data: {
        16: { power: 500 },
        11: { power: 800 },
        14: { power: 950 },
        10: { power: 1200 },
        13: { power: 1800 },
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [{ unitId: 7, count: 10000 }],
      },
    },
    marchStatus: { data: { marches: [] } },
    experimentalMineSearch: {
      data: {
        mineConfigId: 68, // Food Level 10
        mines: [
          {
            mineId: 'm10-part',
            coordinates: { x: 50, y: 50 },
            resourceAmount: 95000, // 95k remaining instead of 14M full
          },
        ],
      },
    },
  };

  const plan = planAutoGather(cache, stored, now);
  assert.equal(plan.action, 'gather');
  assert.equal(plan.mineId, 'm10-part');
  // 95,000 food / 1900 = 50 troops. Squad capacity of hero 16 is 1,550 >= 50.
  // Must deploy ONLY 1 hero instead of all 5!
  assert.equal(plan.call.args.squad.heroes.length, 1);
  assert.equal(plan.call.args.squad.heroes[0].heroId, 16);
  assert.equal(plan.call.args.squad.units[0].count, 50);
});

test('resumePlan preserves probed resourceAmount on resume target mine', () => {
  const now = 300000;
  const cache = {
    experimentalMapContext: { data: { mapId: 'map1', center: { x: 0, y: 0 } } },
    marchStatus: { data: { marches: [] } },
  };
  const state = {
    interrupted: [{ mapId: 'map1', mineId: 'interrupted-1', configId: 68 }],
    resumeCandidate: { mineId: 'interrupted-1', checkedAt: now - 5000, resourceAmount: 185000 },
  };

  const plan = resumePlan(cache, state, now);
  assert.equal(plan.action, 'target');
  assert.equal(plan.mine.mineId, 'interrupted-1');
  assert.equal(plan.mine.resourceAmount, 185000);
  assert.equal(plan.mine.resourcesAmount, 185000);
});
