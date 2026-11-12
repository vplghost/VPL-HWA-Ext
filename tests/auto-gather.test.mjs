import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/march-rules.js';
import '../extension/hero-metadata.js';
import '../extension/experimental-data.js';
import '../extension/auto-gather.js';

test('normalizeAutoGatherSettings defaults and clamps correctly', () => {
  const norm = globalThis.hwaHelperAutoGather.normalizeAutoGatherSettings;
  const def = norm({});
  assert.equal(def.enabled, false);
  assert.equal(def.maxMarches, 3);
  assert.equal(def.mineLevel, 5);
  assert.equal(def.mineType, 'rotate');
  assert.equal(def.lastAutoMineType, null);

  const custom = norm({ enabled: true, maxMarches: 4, mineLevel: 8, mineType: 'stone', lastAutoMineType: 'wood' });
  assert.equal(custom.enabled, true);
  assert.equal(custom.maxMarches, 4);
  assert.equal(custom.mineLevel, 8);
  assert.equal(custom.mineType, 'stone');
  assert.equal(custom.lastAutoMineType, 'wood');
});

test('resolveNextMineType rotates through basic mine types and persists order', () => {
  const resolve = globalThis.hwaHelperAutoGather.resolveNextMineType;
  // Specific types return as is
  assert.equal(resolve('stone', 'food'), 'stone');
  assert.equal(resolve('iron', null), 'iron');

  // Rotate cycles: food -> wood -> stone -> iron -> food
  assert.equal(resolve('rotate', null), 'food');
  assert.equal(resolve('rotate', 'food'), 'wood');
  assert.equal(resolve('rotate', 'wood'), 'stone');
  assert.equal(resolve('rotate', 'stone'), 'iron');
  assert.equal(resolve('rotate', 'iron'), 'food');
});

test('countActiveMarches handles ongoing marches and expired returning marches', () => {
  const count = globalThis.hwaHelperAutoGather.countActiveMarches;
  const now = 1000000;
  const marches = [
    { id: 1, kind: 'gather', stage: 'harvest' },
    { id: 2, kind: 'attack', stage: 'moveToTargetInSolo' },
    { id: 3, kind: 'return', stage: 'returnToOutpost', endsAt: 1000500 }, // still returning
    { id: 4, kind: 'return', stage: 'returnToOutpost', endsAt: 999000 }   // arrived at base
  ];
  assert.equal(count(marches, now), 3, 'Expired returning march is excluded');
});

test('planAutoGather plans search when no cached mines and gather when full mines exist', () => {
  const plan = globalThis.hwaHelperAutoGather.planAutoGather;
  const now = 1000000;

  const heroes = {
    '1': { id: 1, power: 1000 },
    '2': { id: 2, power: 2000 },
    '3': { id: 3, power: 3000 },
    '4': { id: 4, power: 4000 },
    '5': { id: 5, power: 5000 },
    '6': { id: 6, power: 10000 }
  };
  const unitSummary = {
    available: [{ unitId: 1, count: 5000 }]
  };
  const mapContext = {
    mapId: 42,
    center: { x: 100, y: 200 }
  };

  const stored = {
    popupRpcEnabled: true,
    autoGatherSettings: {
      enabled: true,
      maxMarches: 3,
      mineLevel: 5,
      mineType: 'rotate',
      lastAutoMineType: 'food'
    }
  };

  const cache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: unitSummary },
    experimentalMapContext: { data: mapContext },
    marchStatus: { data: { marches: [{ id: 'm1', kind: 'gather' }] } } // 1 active march < 3 maxMarches
  };

  // Step 1: No cached search -> plans search for 'wood' (next after 'food')
  const step1 = plan(cache, stored, now);
  assert.equal(step1.action, 'search');
  assert.equal(step1.mineType, 'wood');
  assert.equal(step1.mineLevel, 5);
  assert.equal(step1.call.name, 'searchMine');
  assert.equal(step1.call.args.mapId, 42);

  // Step 2: Full mines cached for wood level 5 (mineConfigId 56)
  const woodLvl5Config = globalThis.hwaHelperExperimentalData.mineConfigId('wood', 5);
  cache.experimentalMineSearch = {
    data: {
      mapId: 42,
      mineConfigId: woodLvl5Config,
      mines: [{ mineId: 'mine_wood_999', coordinates: { x: 105, y: 205 } }]
    }
  };

  const step2 = plan(cache, stored, now);
  assert.equal(step2.action, 'gather');
  assert.equal(step2.mineType, 'wood');
  assert.equal(step2.mineId, 'mine_wood_999');
  assert.equal(step2.nextLastAutoMineType, 'wood');
  assert.equal(step2.call.name, 'attackMine');
  assert.equal(step2.call.args.mineId, 'mine_wood_999');
  assert.equal(step2.call.args.squad.heroes.length, 5);
});

test('auto-gather handles object-shaped marches and mine search without TypeError', () => {
  const plan = globalThis.hwaHelperAutoGather.planAutoGather;
  const count = globalThis.hwaHelperAutoGather.countActiveMarches;
  const now = 1000000;

  // Object-shaped marches
  const objectMarches = {
    '0': { id: 1, kind: 'gather', stage: 'harvest' },
    '1': { id: 2, kind: 'attack', stage: 'moveToTargetInSolo' }
  };
  assert.equal(count(objectMarches, now), 2, 'Object-shaped marches counted correctly');

  const cache = {
    heroGetAll: {
      data: {
        '1': { id: 1, power: 1000 },
        '2': { id: 2, power: 2000 },
        '3': { id: 3, power: 3000 },
        '4': { id: 4, power: 4000 },
        '5': { id: 5, power: 5000 }
      }
    },
    'getUnitSummary:unit': {
      data: {
        units: { '0': { unitId: 1, count: 5000 } }
      }
    },
    experimentalMapContext: { data: { mapId: 42, center: { x: 100, y: 200 } } },
    marchStatus: { data: { marches: objectMarches } },
    experimentalMineSearch: {
      data: {
        mapId: 42,
        mineConfigId: globalThis.hwaHelperExperimentalData.mineConfigId('wood', 5),
        mines: {
          '0': { mineId: 'mine_wood_obj', coordinates: { x: 105, y: 205 } }
        }
      }
    }
  };

  const stored = {
    popupRpcEnabled: true,
    autoGatherSettings: {
      enabled: true,
      maxMarches: 3,
      mineLevel: 5,
      mineType: 'rotate',
      lastAutoMineType: 'food'
    }
  };

  assert.doesNotThrow(() => {
    const res = plan(cache, stored, now);
    assert.equal(res.action, 'gather');
    assert.equal(res.mineId, 'mine_wood_obj');
  });
});
