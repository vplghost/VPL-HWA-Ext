import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMP_BUILDING_IDS,
  CAMP_TRAINING_CAPACITY_BY_LEVEL,
  RESEARCH_TRAINING_CAPACITY_BY_ID,
  getResearchTrainingCapacityBonus,
  getBuildingTrainingCapacity,
  getTrainingSpeedBonusPct,
  calculateTrainingDurationMs,
  getUnlockedTroopLevels,
  isCampBuildingUpgrading,
  buildAutoTrainCalls,
  getNextTroopTrainWakeAt,
  needsTroopTrainingRefresh,
  troopStockProgress,
  getTroopType,
} from '../src/utils/troops.ts';
import {
  advanceTroopTraining,
  resetTroopTrainRuntimeState,
  setupBackgroundRuntime,
} from '../src/background/backgroundRuntime.ts';

test('getBuildingTrainingCapacity resolves correct capacity from camp building level', () => {
  // Level 1: 17, Level 2: 22, Level 3: 26, Level 10: 56, Level 25: 167
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[1], 17);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[2], 22);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[3], 26);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[10], 56);
  assert.equal(CAMP_TRAINING_CAPACITY_BY_LEVEL[25], 167);

  // Type 0 = Infantry Camp (40), Type 1 = Spearmen Camp (42), Type 2 = Marksmen Camp (41)
  const cacheLvl3 = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 40, level: 1 },
          { buildingId: 42, level: 2 },
          { buildingId: 41, level: 3 },
        ],
      },
    },
  };
  // Shared training capacity sums ALL 3 camps: 17 (Lv.1) + 22 (Lv.2) + 26 (Lv.3) = 65
  assert.equal(getBuildingTrainingCapacity(0, cacheLvl3), 65);
  assert.equal(getBuildingTrainingCapacity(1, cacheLvl3), 65);
  assert.equal(getBuildingTrainingCapacity(2, cacheLvl3), 65);

  // Keyed object format from getSummary:building (Camp 41 Lv.10=56 + Camp 42 Lv.5=35 = 91)
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
  assert.equal(getBuildingTrainingCapacity(0, cacheKeyed), 91);
  assert.equal(getBuildingTrainingCapacity(1, cacheKeyed), 91);
  assert.equal(getBuildingTrainingCapacity(2, cacheKeyed), 91);
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

  // Infantry (type 0): highest in available is 5 -> [1, 2, 3, 4, 5]
  assert.deepEqual(getUnlockedTroopLevels(0, cache), [1, 2, 3, 4, 5]);

  // Spearmen (type 1): highest in available is 13 (lvl 3) -> [1, 2, 3]
  assert.deepEqual(getUnlockedTroopLevels(1, cache), [1, 2, 3]);

  // Marksmen (type 2): highest in available is 27 (lvl 7) -> [1, 2, 3, 4, 5, 6, 7]
  assert.deepEqual(getUnlockedTroopLevels(2, cache), [1, 2, 3, 4, 5, 6, 7]);

  // If saved level is higher than currently detected, preserve saved choice
  assert.deepEqual(getUnlockedTroopLevels(0, cache, 7), [1, 2, 3, 4, 5, 6, 7]);

  // Empty cache fallback
  assert.deepEqual(getUnlockedTroopLevels(0, {}), [1]);
});

test('isCampBuildingUpgrading detects building upgrade state for all camp types', () => {
  const cacheWithInfantryUpgrading = {
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 40, level: 8, startDate: 1000, durationMs: 5000 },
        ],
      },
    },
  };
  assert.equal(isCampBuildingUpgrading(0, cacheWithInfantryUpgrading), true);
  assert.equal(isCampBuildingUpgrading(1, cacheWithInfantryUpgrading), false);
  assert.equal(isCampBuildingUpgrading(2, cacheWithInfantryUpgrading), false);

  const cacheWithMarksmenUpgrading = {
    'getSummary:building': {
      data: {
        queues: [
          { id: 41, level: 12, startDate: 1000, duration: 60000 },
        ],
      },
    },
  };
  assert.equal(isCampBuildingUpgrading(0, cacheWithMarksmenUpgrading), false);
  assert.equal(isCampBuildingUpgrading(1, cacheWithMarksmenUpgrading), false);
  assert.equal(isCampBuildingUpgrading(2, cacheWithMarksmenUpgrading), true);

  // Empty or invalid
  assert.equal(isCampBuildingUpgrading(0, {}), false);
  assert.equal(isCampBuildingUpgrading(99, cacheWithInfantryUpgrading), false);
});

test('buildAutoTrainCalls skips training when camp building is upgrading but still collects completed queues', () => {
  const now = 1794200000000;
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 182, level: 1 }, // 2770 cap
          { buildingId: 40, level: 3 },  // Infantry Camp
        ],
        queues: [
          // Infantry camp (40) is currently upgrading
          { buildingId: 40, level: 4, startDate: now - 5000, durationMs: 100000 },
        ],
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 7, count: 1000 },
        ],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          // Completed training queue for Infantry (type 0, unitId 7)
          { unitId: 7, unitCount: 26, startDate: now - 100000, duration: 50000 },
        ],
      },
    },
  };

  const plan = buildAutoTrainCalls(cache, {
    autoTrainEnabled: true,
    trainLevels: { 0: 7 },
  }, now);

  // Should collect the completed queue
  const collect = plan.actions.find(a => a.type === 0 && a.action === 'collect');
  assert.ok(collect, 'Must collect completed queue even if building is upgrading');
  assert.equal(collect.unitId, 7);

  // But MUST NOT start a new training queue because camp building 40 is upgrading!
  const train = plan.actions.find(a => a.type === 0 && a.action === 'train');
  assert.equal(train, undefined, 'Must not start training when camp building is upgrading');
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
          { buildingId: 40, level: 3 }, // 26 cap for Infantry (type 0)
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
          // Active queue for Infantry (type 0)
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
  assert.ok(trainedTypes.includes(2), 'Idle Marksmen queue should start training');
});

test('buildAutoTrainCalls collects completed queues and trains min(remaining, buildingCapacity)', () => {
  const now = 1794200000000;
  // Drill grounds level 1 = 2770 max stock limit
  // Infantry Camp level 2 = 22 trainingCapacity
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 182, level: 1 },
          { buildingId: 40, level: 2 }, // 22 batch capacity
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
          // Completed queue for Infantry (type 0)
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

  // Should have startTraining for Infantry clamped to min(remaining, buildingCapacity)
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
          { buildingId: 40, level: 3 },  // 26 capacity
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

  const infantryTrain = plan.actions.find(a => a.type === 0 && a.action === 'train');
  assert.equal(infantryTrain, undefined, 'Must not train when already over cap');
});

test('troop type classification maps ID 20s to Marksmen, 10s to Spearmen, and 0s to Infantry', async () => {
  const { unitInfo } = await import('../src/utils/experimentalData.ts');

  // Head 2 (e.g. 21, 26, 27) = Marksmen (type 2)
  const u27 = unitInfo(27);
  assert.equal(u27?.type, 2);
  assert.equal(u27?.label, 'Marksmen');
  assert.equal(u27?.level, 7);

  const u26 = unitInfo(26);
  assert.equal(u26?.type, 2);
  assert.equal(u26?.label, 'Marksmen');
  assert.equal(u26?.level, 6);

  // Head 1 (e.g. 17) = Spearmen (type 1)
  const u17 = unitInfo(17);
  assert.equal(u17?.type, 1);
  assert.equal(u17?.label, 'Spearmen');
  assert.equal(u17?.level, 7);

  // Head 0 (e.g. 7) = Infantry (type 0)
  const u7 = unitInfo(7);
  assert.equal(u7?.type, 0);
  assert.equal(u7?.label, 'Infantry');
  assert.equal(u7?.level, 7);
});

test('isCampBuildingUpgrading extracts queues from building_getSummary and prevents Marksmen train when Camp 41 is upgrading', () => {
  // Simulating tracking log structure where Building 41 (Marksmen Camp) is upgrading
  const cacheWithMarksmenCampUpgrading = {
    building_getSummary: {
      data: {
        queues: [
          { buildingId: 41, nextLevel: 22, startDate: 1795287896295, durationMs: 50251200 },
        ],
      },
    },
  };

  assert.equal(isCampBuildingUpgrading(0, cacheWithMarksmenCampUpgrading), false, 'Infantry camp not upgrading');
  assert.equal(isCampBuildingUpgrading(1, cacheWithMarksmenCampUpgrading), false, 'Spearmen camp not upgrading');
  assert.equal(isCampBuildingUpgrading(2, cacheWithMarksmenCampUpgrading), true, 'Marksmen camp 41 must be detected as upgrading');

  // buildAutoTrainCalls must not dispatch startTraining for Marksmen (type 2 / unitId 26)
  const plan = buildAutoTrainCalls(cacheWithMarksmenCampUpgrading, {
    autoTrainEnabled: true,
    trainLevels: { 2: 6 },
  });
  const marksmenTrain = plan.actions.find(a => a.type === 2 && a.action === 'train');
  assert.equal(marksmenTrain, undefined, 'Must block Marksmen training to prevent server ValidationError');
});

test('upgradeQueues: getUnlockedTroopLevels unlocks target and source levels from upgradeQueues', () => {
  const cache = {
    'getTrainings:unit': {
      data: {
        trainingQueues: [],
        upgradeQueues: [
          {
            sourceUnitId: 27,
            targetUnitId: 28,
            unitCount: 1868,
            startDate: 1000,
            duration: 50000,
          },
        ],
      },
    },
  };

  // Marksmen (type 2): targetUnitId 28 -> Level 8 unlocked!
  const unlocked = getUnlockedTroopLevels(2, cache);
  assert.deepEqual(unlocked, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('upgradeQueues: buildAutoTrainCalls respects active upgrade queue and does not attempt training', () => {
  const now = 10000;
  const cache = {
    'getSummary:building': {
      data: {
        buildings: {
          '41': { level: 20 },
        },
      },
    },
    'getUnitSummary:unit': {
      data: {
        limits: [100000, 100000, 100000],
        available: [
          { unitId: 27, count: 500 },
        ],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [],
        upgradeQueues: [
          {
            sourceUnitId: 27,
            targetUnitId: 28,
            unitCount: 1868,
            startDate: 5000,
            duration: 20000, // ends at 25000 > now (active)
          },
        ],
      },
    },
  };

  const plan = buildAutoTrainCalls(cache, { autoTrainEnabled: true }, now);
  const marksmenTrain = plan.actions.find(a => a.type === 2 && a.action === 'train');
  assert.equal(marksmenTrain, undefined, 'Marksmen camp is busy promoting; must not train');
});

test('upgradeQueues: buildAutoTrainCalls collects finished upgrade queue', () => {
  const now = 30000;
  const cache = {
    'getSummary:building': {
      data: {
        buildings: {
          '41': { level: 20 },
        },
      },
    },
    'getUnitSummary:unit': {
      data: {
        limits: [100000, 100000, 100000],
        available: [
          { unitId: 27, count: 500 },
        ],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [],
        upgradeQueues: [
          {
            sourceUnitId: 27,
            targetUnitId: 28,
            unitCount: 1868,
            startDate: 5000,
            duration: 20000, // ends at 25000 <= now (completed)
          },
        ],
      },
    },
  };

  const plan = buildAutoTrainCalls(cache, { autoTrainEnabled: true }, now);
  const collectAction = plan.actions.find(a => a.type === 2 && a.action === 'collect');
  assert.ok(collectAction, 'Should generate collect action for finished upgrade');
  assert.equal(collectAction.unitId, 28);
  const collectCall = plan.calls.find(c => c.name === 'completeTraining' && c.args?.unitId === 28);
  assert.ok(collectCall, 'Should dispatch completeTraining with targetUnitId 28');
});

test('getNextTroopTrainWakeAt resolves earliest future completion across trainings, upgrades, and camp buildings', () => {
  const now = 100000;
  const cache = {
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 20, startDate: now - 1000, durationMs: 5000 }, // non-camp building -> ignore
          { buildingId: 40, startDate: now - 1000, durationMs: 20000 }, // Infantry camp ends at 119000
        ],
      },
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          { unitId: 17, unitCount: 30, startDate: now - 5000, duration: 15000 }, // ends at 110000 (earliest)
        ],
        upgradeQueues: [
          { sourceUnitId: 27, targetUnitId: 28, unitCount: 100, startDate: now - 1000, duration: 50000 }, // ends at 149000
        ],
      },
    },
  };

  assert.equal(getNextTroopTrainWakeAt(cache, now), 110000);
  assert.equal(getNextTroopTrainWakeAt({}, now), null);
});

test('needsTroopTrainingRefresh detects missing cache, elapsed camp upgrades, and stale idle trainings', () => {
  const now = 1000000;
  assert.equal(needsTroopTrainingRefresh({}, now), true, 'Missing cache must trigger refresh');

  // Complete and fresh cache with active queue -> no refresh needed
  const freshCache = {
    buildingStatus: {
      data: { buildings: [{ buildingId: 182, level: 10 }], queues: [] },
    },
    'getUnitSummary:unit': {
      data: { available: [{ unitId: 7, count: 100 }] },
      updatedAt: new Date(now - 10000).toISOString(),
    },
    'getTrainings:unit': {
      data: { trainingQueues: [] },
      updatedAt: new Date(now - 10000).toISOString(),
    },
  };
  assert.equal(needsTroopTrainingRefresh(freshCache, now), false);

  // Elapsed camp upgrade queue in buildingStatus -> must refresh
  const elapsedCampCache = {
    ...freshCache,
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 182, level: 10 }],
        queues: [{ buildingId: 41, startDate: now - 60000, durationMs: 30000 }],
      },
    },
  };
  assert.equal(needsTroopTrainingRefresh(elapsedCampCache, now), true);

  // Stale getTrainings (> 5 min) with no active queue -> must refresh
  const staleTrainingsCache = {
    ...freshCache,
    'getTrainings:unit': {
      data: { trainingQueues: [] },
      updatedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    },
  };
  assert.equal(needsTroopTrainingRefresh(staleTrainingsCache, now), true);
});

test('auto-train-tick from extension tab resolves game tab instead of sending to sender extension tab', async () => {
  resetTroopTrainRuntimeState();
  const sentToTabs = [];
  const alarmsCreated = [];
  const localData = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    troopTrainSettings: { autoTrainEnabled: true, trainLevels: { 0: 5 } },
    rpcCache: {
      buildingStatus: {
        data: {
          buildings: [
            { buildingId: 182, level: 1 }, // 2770 cap
            { buildingId: 40, level: 3 },  // 26 capacity
          ],
          queues: [],
        },
      },
      'getUnitSummary:unit': {
        data: { available: [{ unitId: 5, count: 100 }] },
        updatedAt: new Date().toISOString(),
      },
      'getTrainings:unit': {
        data: { trainingQueues: [], upgradeQueues: [] },
        updatedAt: new Date().toISOString(),
      },
    },
  };

  let onMessageListener = null;
  const mockChrome = {
    runtime: {
      id: 'ext-test-id',
      onMessage: { addListener: (fn) => { onMessageListener = fn; } },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
    alarms: {
      get: (_name, cb) => cb && cb(null),
      create: (name, opts) => alarmsCreated.push({ name, opts }),
      clear: async () => {},
      onAlarm: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) out[k] = localData[k];
            return out;
          }
          if (typeof keys === 'string') return { [keys]: localData[keys] };
          return { ...localData };
        },
        set: async (obj) => { Object.assign(localData, obj); },
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: (_opts, cb) => {
        const res = [
          { id: 999, url: 'chrome-extension://ext-test-id/popup.html', active: true },
          { id: 42, url: 'https://hero-wars-alliance.com/game', active: false },
        ];
        if (typeof cb === 'function') cb(res);
        return Promise.resolve(res);
      },
      sendMessage: async (tabId, msg) => {
        sentToTabs.push({ tabId, msg });
        return { ok: true, results: [] };
      },
    },
  };

  setupBackgroundRuntime({ chrome: mockChrome });
  assert.ok(onMessageListener, 'Message listener must be registered');

  const response = await new Promise((resolve) => {
    onMessageListener(
      { kind: 'auto-train-tick' },
      { url: 'chrome-extension://ext-test-id/popup.html', tab: { id: 999 } },
      resolve
    );
  });

  assert.equal(response?.ok, true);
  assert.equal(sentToTabs.length, 1);
  assert.equal(sentToTabs[0].tabId, 42, 'Must dispatch to active Hero Wars game tab (42), NOT extension tab (999)');
  assert.ok(sentToTabs[0].msg.calls.some((c) => c.name === 'startTraining'), 'Must include startTraining call');
  assert.equal(localData.autoTrainState?.lastError, null);
});

test('advanceTroopTraining refreshes missing cache and schedules wake alarm when queues are active', async () => {
  resetTroopTrainRuntimeState();
  const sent = [];
  const alarms = [];
  const now = Date.now();
  const localData = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    troopTrainSettings: { autoTrainEnabled: true, trainLevels: {} },
    rpcCache: {},
  };

  const mockChrome = {
    alarms: {
      create: (name, opts) => alarms.push({ name, opts }),
      clear: async () => {},
    },
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) out[k] = localData[k];
          return out;
        },
        set: async (obj) => { Object.assign(localData, obj); },
      },
    },
    tabs: {
      query: (_opts, cb) => {
        const res = [{ id: 77, url: 'https://hero-wars-alliance.com/game', active: true }];
        if (typeof cb === 'function') cb(res);
        return Promise.resolve(res);
      },
      sendMessage: async (tabId, msg) => {
        sent.push({ tabId, msg });
        return { ok: true, results: [] };
      },
    },
  };

  // 1. Missing cache -> dispatches read-only refresh
  const refreshRes = await advanceTroopTraining(undefined, mockChrome);
  assert.equal(refreshRes.ok, true);
  assert.equal(refreshRes.refreshing, true);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].msg.calls.some((c) => c.name === 'getTrainings'));
  assert.ok(sent[0].msg.calls.some((c) => c.name === 'getSummary' && c.feature === 'building'));

  // 2. All queues active -> schedules hwa-troop-train-wake alarm
  localData.rpcCache = {
    buildingStatus: { data: { buildings: [{ buildingId: 182, level: 10 }], queues: [] } },
    'getUnitSummary:unit': { data: { available: [{ unitId: 7, count: 100 }] }, updatedAt: new Date(now).toISOString() },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          { unitId: 7, unitCount: 26, startDate: now - 1000, duration: 60000 },
          { unitId: 17, unitCount: 26, startDate: now - 1000, duration: 90000 },
          { unitId: 27, unitCount: 26, startDate: now - 1000, duration: 120000 },
        ],
      },
      updatedAt: new Date(now).toISOString(),
    },
  };

  const waitRes = await advanceTroopTraining(undefined, mockChrome);
  assert.equal(waitRes.ok, true);
  assert.ok(waitRes.nextWakeAt > now);
  const wakeAlarm = alarms.find((a) => a.name === 'hwa-troop-train-wake');
  assert.ok(wakeAlarm, 'Must schedule hwa-troop-train-wake alarm');
  assert.ok(wakeAlarm.opts.when >= waitRes.nextWakeAt);
});


test('getBuildingTrainingCapacity sums all 3 camps + Personal Research Camp Expansion bonuses (512 exact)', () => {
  // Real player state from 202611241126_fresh_reload:
  // Camp 40 Lv.22 (142) + Camp 41 Lv.22 (142) + Camp 42 Lv.22 (142) = 426
  // + Camp Expansion I-IV max + V Lv.1 (7 + 15 + 23 + 30 + 11 = +86) => 512!
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 40, level: 22 }, // 142
          { buildingId: 41, level: 22 }, // 142
          { buildingId: 42, level: 22 }, // 142
          { buildingId: 182, level: 20 },
          { buildingId: 183, level: 15 },
        ],
      },
    },
    researchStatus: {
      data: {
        completedResearches: [
          { researchId: 3, level: 3 },   // +7
          { researchId: 59, level: 3 },  // +15
          { researchId: 90, level: 3 },  // +23
          { researchId: 125, level: 3 }, // +30
          { researchId: 158, level: 1 }, // +11
          { researchId: 6, level: 3 },   // trainingSpeed +7.4%
          { researchId: 62, level: 3 },  // trainingSpeed +15.2%
          { researchId: 93, level: 3 },  // trainingSpeed +22.6%
          { researchId: 128, level: 2 }, // trainingSpeed +18%
        ],
      },
    },
    'getUnitSummary:unit': {
      data: { available: [{ unitId: 27, count: 100 }] },
    },
    'getTrainings:unit': {
      data: { trainingQueues: [], upgradeQueues: [] },
    },
  };

  assert.equal(getResearchTrainingCapacityBonus(cache), 86);
  assert.equal(getBuildingTrainingCapacity(0, cache), 512);
  assert.equal(getBuildingTrainingCapacity(1, cache), 512);
  assert.equal(getBuildingTrainingCapacity(2, cache), 512);

  // Verify buildAutoTrainCalls uses 512 batch capacity and speed-adjusted duration
  const plan = buildAutoTrainCalls(cache, { autoTrainEnabled: true, trainLevels: { 2: 7 } }, 1000000);
  const mks = plan.actions.find((a) => a.type === 2 && a.action === 'train');
  assert.equal(mks?.count, 512);

  // Speed without clan bonus: 3 * 5.8% (camps) + 63.2% (researches) = 80.6%
  assert.equal(getTrainingSpeedBonusPct(cache), 80.6);
  const durNoClan = calculateTrainingDurationMs(27, 228, cache);
  assert.equal(durNoClan, Math.ceil(83000 / 1.806) * 228);

  // With productionBonusStatus (including Clan Fortress Lv.4 5523 x2 = +20% -> total 100.6%)
  const bonusCache = {
    productionBonusStatus: {
      data: {
        bonuses: [
          [5523, 2], // +20% trainingSpeed
          [2852, 1], // +9%
          [2853, 1], // +9%
          [2833, 1], [2834, 1], [2835, 1], // +22.6%
          [2817, 1], [2818, 1], [2819, 1], // +15.2%
          [2800, 1], [2801, 1], [2802, 1], // +7.4%
        ],
      },
    },
  };
  assert.equal(getTrainingSpeedBonusPct(bonusCache), 83.2);
  assert.equal(calculateTrainingDurationMs(27, 10, bonusCache), Math.ceil(83000 / 1.832) * 10);

  // Max Camp Expansion I-VII sum check: 7 + 15 + 23 + 30 + 37 + 46 + 20 = 178
  const maxCache = {
    researchStatus: {
      data: {
        completedResearches: Object.entries(RESEARCH_TRAINING_CAPACITY_BY_ID).map(([id, tbl]) => ({
          researchId: Number(id),
          level: tbl.length - 1,
        })),
      },
    },
  };
  assert.equal(getResearchTrainingCapacityBonus(maxCache), 178);
});
