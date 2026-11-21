import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMP_BUILDING_IDS,
  CAMP_TRAINING_CAPACITY_BY_LEVEL,
  getBuildingTrainingCapacity,
  getUnlockedTroopLevels,
  buildAutoTrainCalls,
  troopStockProgress,
  getTroopType,
} from '../src/utils/troops.ts';

test('getBuildingTrainingCapacity resolves correct capacity from camp building level', () => {
  // Level 1: 17, Level 2: 22, Level 3: 26, Level 10: 56, Level 25: 167
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[1], 17);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[2], 22);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[3], 26);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[10], 56);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[25], 167);

  // Type 0 (Marksmen Camp, buildingId 41)
  const cacheLvl3 = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 41, level: 3 },
          { buildingId: 42, level: 2 },
          { buildingId: 40, level: 1 },
        ],
      },
    },
  };
  assert.equal(getBuildingTrainingCapacity(0, cacheLvl3), 26);
  assert.equal(getBuildingTrainingCapacity(1, cacheLvl3), 22);
  assert.equal(getBuildingTrainingCapacity(2, cacheLvl3), 17);

  // Keyed object format from getSummary:building
  const cacheKeyed = {
    'getSummary:building': {
      data: {
        buildings: {
          '41': { level: 10 },
          '42': 5,
        },
      },
    },
  };
  assert.equal(getBuildingTrainingCapacity(0, cacheKeyed), 56);
  assert.equal(getBuildingTrainingCapacity(1, cacheKeyed), 35);
  // Missing building defaults to 26
  assert.equal(getBuildingTrainingCapacity(2, cacheKeyed), 26);
});

test('getUnlockedTroopLevels restricts options to unlocked player tiers', () => {
  const cache = {
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 1, count: 0 },
          { unitId: 2, count: 0 },
          { unitId: 3, count: 0 },
          { unitId: 4, count: 0 },
          { unitId: 5, count: 120 },
          { unitId: 11, count: 0 },
          { unitId: 12, count: 0 },
          { unitId: 13, count: 50 },
          { unitId: 21, count: 0 },
          { unitId: 22, count: 0 },
          { unitId: 27, count: 3000 },
        ],
      },
    },
  };

  // Marksmen (type 0): highest in available is 5 -> [1, 2, 3, 4, 5]
  assert.deepEqual(getUnlockedTroopLevels(0, cache), [1, 2, 3, 4, 5]);

  // Spearmen (type 1): highest in available is 13 (lvl 3) -> [1, 2, 3]
  assert.deepEqual(getUnlockedTroopLevels(1, cache), [1, 2, 3]);

  // Infantry (type 2): highest in available is 27 (lvl 7) -> [1, 2, 3, 4, 5, 6, 7]
  assert.deepEqual(getUnlockedTroopLevels(2, cache), [1, 2, 3, 4, 5, 6, 7]);

  // If saved level is higher than currently detected, preserve saved choice
  assert.deepEqual(getUnlockedTroopLevels(0, cache, 7), [1, 2, 3, 4, 5, 6, 7]);

  // Empty cache fallback
  assert.deepEqual(getUnlockedTroopLevels(0, {}), [1]);
});

test('buildAutoTrainCalls respects autoTrainEnabled gate and skips active queues', () => {
  const now = 1794200000000;
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 182, level: 10 },
          { buildingId: 183, level: 10 },
          { buildingId: 184, level: 10 },
          { buildingId: 41, level: 3 }, // 26 cap
        ],
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [{ unitId: 7, count: 1000 }],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          // Active queue for Marksmen (type 0)
          { unitId: 7, unitCount: 26, startDate: now - 10000, duration: 60000 },
        ],
      },
    },
  };

  // 1. When autoTrainEnabled is false, produces 0 calls
  const disabled = buildAutoTrainCalls(cache, { autoTrainEnabled: false }, now);
  assert.equal(disabled.calls.length, 0);

  // 2. When enabled, skips type 0 because queue is active, but processes idle types 1 and 2
  const enabled = buildAutoTrainCalls(cache, {
    autoTrainEnabled: true,
    trainLevels: { 0: 7, 1: 5, 2: 7 },
  }, now);

  const trainedTypes = enabled.actions.map(a => a.type);
  assert.ok(!trainedTypes.includes(0), 'Active training queue must not be interrupted');
  assert.ok(trainedTypes.includes(1), 'Idle Spearmen queue should start training');
  assert.ok(trainedTypes.includes(2), 'Idle Infantry queue should start training');
});

test('buildAutoTrainCalls collects completed queues and trains min(remaining, buildingCapacity)', () => {
  const now = 1794200000000;
  // Drill grounds level 1 = 2770 max stock limit
  // Marksmen Camp level 2 = 22 trainingCapacity
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 182, level: 1 },
          { buildingId: 41, level: 2 }, // 22 batch capacity
        ],
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 1, count: 0 },
          { unitId: 7, count: 2738 }, // 2738 ready + 22 completed queue = 2760 total -> 10 remaining until 2770 cap
        ],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          // Completed queue for Marksmen (type 0)
          { unitId: 7, unitCount: 22, startDate: now - 100000, duration: 50000 },
        ],
      },
    },
  };

  const plan = buildAutoTrainCalls(cache, {
    autoTrainEnabled: true,
    trainLevels: { 0: 7 },
  }, now);

  // Should have completeTraining for unit 7
  const collect = plan.actions.find(a => a.type === 0 && a.action === 'collect');
  assert.ok(collect, 'Must collect completed queue');
  assert.equal(collect.unitId, 7);

  // Should have startTraining for Marksmen clamped to min(remaining, buildingCapacity)
  // remaining = 2770 - (2760 + 0) = 10, buildingCapacity = 22 -> min is 10!
  const train = plan.actions.find(a => a.type === 0 && a.action === 'train');
  assert.ok(train, 'Must start training for idle queue');
  assert.equal(train.count, 10, 'Training amount must be clamped to remaining cap when < building capacity');
  assert.equal(train.unitId, 7, 'Target unitId must match chosen level 7');

  // Should have refresh calls at the end
  const names = plan.calls.map(c => c.name);
  assert.ok(names.includes('completeTraining'));
  assert.ok(names.includes('startTraining'));
  assert.ok(names.includes('getTrainings'));
  assert.ok(names.includes('getUnitSummary'));
});

test('buildAutoTrainCalls blocks training when troop stock reaches or exceeds max limit', () => {
  const now = 1794200000000;
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 182, level: 1 }, // 2770 cap
          { buildingId: 41, level: 3 },  // 26 capacity
        ],
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 7, count: 2800 }, // Over cap!
        ],
      },
    },
  };

  const plan = buildAutoTrainCalls(cache, {
    autoTrainEnabled: true,
    trainLevels: { 0: 7 },
  }, now);

  const marksmenTrain = plan.actions.find(a => a.type === 0 && a.action === 'train');
  assert.equal(marksmenTrain, undefined, 'Must not train when already over cap');
});
