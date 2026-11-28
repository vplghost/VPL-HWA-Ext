import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  doesCityQueueItemDependOn,
  getCityQueueMoveBounds,
  computeConstrainedCityQueueMove,
  formatCityQueueMoveTitles,
} from '../src/utils/cityQueueReorder.ts';
import { getBuildingLevelData } from '../src/data/buildingData.ts';
import { researchData } from '../src/data/researchData.ts';
import { runCityQueueMutation } from '../src/background/backgroundRuntime.ts';

test('P2-48: prevents moving higher level before lower level for the same building or research', () => {
  const queue = [
    { queueItemId: 'a', buildingId: 40, nextLevel: 20, name: 'Infantry Camp' },
    { queueItemId: 'b', buildingId: 41, nextLevel: 15, name: 'Marksmen Camp' },
    { queueItemId: 'c', buildingId: 40, nextLevel: 21, name: 'Infantry Camp' },
  ];

  // Moving Lv.21 up -> goes to index 1 (right after Lv.20)
  const moveUp = computeConstrainedCityQueueMove('building', queue, 2, 'up');
  assert.equal(moveUp.moved, true);
  assert.equal(moveUp.targetIndex, 1);
  assert.deepEqual(
    moveUp.items.map((x) => x.queueItemId),
    ['a', 'c', 'b']
  );

  // Moving Lv.21 to 'first' from index 2 -> stops at index 1 (right after Lv.20), NEVER index 0
  const moveFirst = computeConstrainedCityQueueMove('building', queue, 2, 'first');
  assert.equal(moveFirst.moved, true);
  assert.equal(moveFirst.targetIndex, 1);

  // Once Lv.21 is at index 1 (right after Lv.20), it cannot move up or first, and Lv.20 cannot move down
  const afterQueue = moveFirst.items;
  const lv21Bounds = getCityQueueMoveBounds('building', afterQueue, 1);
  assert.equal(lv21Bounds.minIndex, 1);
  assert.equal(lv21Bounds.canMoveUp, false);
  assert.equal(lv21Bounds.canMoveFirst, false);
  assert.equal(lv21Bounds.blockedUpBy?.queueItemId, 'a');

  const lv20Bounds = getCityQueueMoveBounds('building', afterQueue, 0);
  assert.equal(lv20Bounds.maxIndex, 0);
  assert.equal(lv20Bounds.canMoveDown, false);
  assert.equal(lv20Bounds.blockedDownBy?.queueItemId, 'c');

  const blockedDown = computeConstrainedCityQueueMove('building', afterQueue, 0, 'down');
  assert.equal(blockedDown.moved, false);
});

test('P2-48: enforces real cross-building prerequisites (e.g. Hall of Heroes Lv.23 requires its prereq building) and Hall Cap', () => {
  const hall23Meta = getBuildingLevelData(20, 23);
  assert.ok(hall23Meta && Array.isArray(hall23Meta.r) && hall23Meta.r.length > 0, 'Hall of Heroes Lv.23 must have prerequisites in buildingData');
  const [reqBuildingId, reqLevel] = hall23Meta.r[0];

  const queue = [
    { queueItemId: 'indep1', buildingId: 42, nextLevel: 10, name: 'Spearmen Camp' },
    { queueItemId: 'req', buildingId: reqBuildingId, nextLevel: reqLevel, name: 'Prereq Building' },
    { queueItemId: 'indep2', buildingId: 41, nextLevel: 10, name: 'Marksmen Camp' },
    { queueItemId: 'hall23', buildingId: 20, nextLevel: 23, name: 'Hall of Heroes' },
    { queueItemId: 'camp23', buildingId: 40, nextLevel: 23, name: 'Infantry Camp' }, // Hall Cap: depends on Hall Lv.23
  ];

  // Hall of Heroes Lv.23 depends on reqBuildingId Lv.reqLevel
  assert.equal(doesCityQueueItemDependOn('building', queue[3], queue[1]), true);
  // Infantry Camp Lv.23 depends on Hall of Heroes Lv.23 (Hall Cap)
  assert.equal(doesCityQueueItemDependOn('building', queue[4], queue[3]), true);

  // Move Hall Lv.23 to 'first' -> stops right after `req` (index 2), NOT index 0
  const hallFirst = computeConstrainedCityQueueMove('building', queue, 3, 'first');
  assert.equal(hallFirst.moved, true);
  assert.equal(hallFirst.targetIndex, 2);
  assert.deepEqual(
    hallFirst.items.map((x) => x.queueItemId),
    ['indep1', 'req', 'hall23', 'indep2', 'camp23']
  );

  // Now `req` at index 1 cannot move down past `hall23` at index 2
  const reqBounds = getCityQueueMoveBounds('building', hallFirst.items, 1);
  assert.equal(reqBounds.canMoveDown, false);
  assert.equal(reqBounds.blockedDownBy?.queueItemId, 'hall23');

  // And `camp23` at index 4 moving to 'first' stops right after `hall23` (index 3), respecting transitive chain
  const campFirst = computeConstrainedCityQueueMove('building', hallFirst.items, 4, 'first');
  assert.equal(campFirst.moved, true);
  assert.equal(campFirst.targetIndex, 3);
  assert.deepEqual(
    campFirst.items.map((x) => x.queueItemId),
    ['indep1', 'req', 'hall23', 'camp23', 'indep2']
  );

  // Check formatted English tooltips
  const titles = formatCityQueueMoveTitles(reqBounds, (it) => `${it.name} Lv.${it.nextLevel}`);
  assert.match(titles.down, /Required by Hall of Heroes Lv\.23/);
});

test('P2-48: enforces real cross-research prerequisites and transitive chain in researchQueue', () => {
  // Find a real research entry with a prerequisite in researchData
  let depId = null;
  let depLvl = null;
  let reqId = null;
  let reqLvl = null;
  for (const [rId, levels] of Object.entries(researchData)) {
    if (!levels || typeof levels !== 'object') continue;
    for (const [lvlStr, meta] of Object.entries(levels)) {
      if (meta && Array.isArray(meta.r) && meta.r.length > 0) {
        depId = Number(rId);
        depLvl = Number(lvlStr);
        reqId = Number(meta.r[0][0]);
        reqLvl = Number(meta.r[0][1]);
        if (depId !== reqId) break;
      }
    }
    if (depId && depId !== reqId) break;
  }
  assert.ok(depId && reqId && depId !== reqId, 'Must find a cross-research prerequisite in researchData');

  const queue = [
    { queueItemId: 'other', researchId: 999999, nextLevel: 1, name: 'Independent Tech' },
    { queueItemId: 'req', researchId: reqId, nextLevel: reqLvl, name: 'Base Tech' },
    { queueItemId: 'other2', researchId: 999998, nextLevel: 1, name: 'Independent Tech 2' },
    { queueItemId: 'dep', researchId: depId, nextLevel: depLvl, name: 'Dependent Tech' },
  ];

  // Move 'dep' to first -> stops at index 2 (right after 'req')
  const moveFirst = computeConstrainedCityQueueMove('research', queue, 3, 'first');
  assert.equal(moveFirst.moved, true);
  assert.equal(moveFirst.targetIndex, 2);
  assert.deepEqual(
    moveFirst.items.map((x) => x.queueItemId),
    ['other', 'req', 'dep', 'other2']
  );

  // Cannot move 'req' down below 'dep'
  const moveReqDown = computeConstrainedCityQueueMove('research', moveFirst.items, 1, 'down');
  assert.equal(moveReqDown.moved, false);
});

test('P2-48: runCityQueueMutation enforces prerequisite bounds in background and modals bind queueMoveMeta', async () => {
  const storageState = {
    buildingQueue: {
      enabled: false,
      items: [
        { queueItemId: 'b1', buildingId: 40, currentLevel: 19, nextLevel: 20, durationMs: 1000, name: 'Infantry Camp' },
        { queueItemId: 'b2', buildingId: 41, currentLevel: 14, nextLevel: 15, durationMs: 1000, name: 'Marksmen Camp' },
        { queueItemId: 'b3', buildingId: 40, currentLevel: 20, nextLevel: 21, durationMs: 1000, name: 'Infantry Camp' },
      ],
    },
  };

  const mockChrome = {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, storageState[k]]));
          return { ...storageState };
        },
        async set(patch) {
          Object.assign(storageState, patch);
        },
      },
    },
    tabs: {
      query(_f, cb) {
        cb([]);
      },
    },
  };

  // Move b3 (Lv.21) to 'first' -> clamped to index 1 (right after b1 Lv.20)
  const res1 = await runCityQueueMutation('building', { action: 'move', item: { queueItemId: 'b3' }, direction: 'first' }, mockChrome);
  assert.equal(res1.ok, true);
  assert.deepEqual(
    storageState.buildingQueue.items.map((x) => x.queueItemId),
    ['b1', 'b3', 'b2']
  );

  // Attempting to move b3 up further is rejected cleanly as unchanged
  const res2 = await runCityQueueMutation('building', { action: 'move', item: { queueItemId: 'b3' }, direction: 'up' }, mockChrome);
  assert.equal(res2.ok, true);
  assert.equal(res2.unchanged, true);
  assert.deepEqual(
    storageState.buildingQueue.items.map((x) => x.queueItemId),
    ['b1', 'b3', 'b2']
  );

  // Verify UI bindings in both modals
  const buildingVue = await readFile(resolve('src/components/dialogs/BuildingModal.vue'), 'utf8');
  assert.match(buildingVue, /getCityQueueMoveBounds/);
  assert.match(buildingVue, /queueMoveMeta\[Number\(idx\)\]\?\.bounds\.canMoveFirst/);

  const researchVue = await readFile(resolve('src/components/dialogs/ResearchModal.vue'), 'utf8');
  assert.match(researchVue, /getCityQueueMoveBounds/);
  assert.match(researchVue, /queueMoveMeta\[Number\(idx\)\]\?\.bounds\.canMoveFirst/);
});
