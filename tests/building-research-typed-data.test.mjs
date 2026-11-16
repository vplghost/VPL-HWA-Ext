import test from 'node:test';
import assert from 'node:assert/strict';

// Import newly created typed modules
import {
  buildingLevelsData,
  legacyBuildingDurations,
  getBuildingLevelData,
  getMissingRequirements as getMissingBuildingRequirements,
  getMissingCosts as getMissingBuildingCosts,
  calculateEffectiveDurationMs as calculateEffectiveBuildingDurationMs,
  normalizeQueuedDuration,
  buildingDataHelper,
} from '../src/data/buildingData.ts';

import {
  researchData,
  getMaxLevel,
  getResearchLevelData,
  getMissingRequirements as getMissingResearchRequirements,
  isAvailable,
  calculateEffectiveDurationMs as calculateEffectiveResearchDurationMs,
  getMissingCosts as getMissingResearchCosts,
  requiresSpecialResource,
  researchDataHelper,
} from '../src/data/researchData.ts';

test('buildingData exports complete data and typed helpers with 100% parity', () => {
  assert.equal(Object.keys(buildingLevelsData).length, 154, 'Should contain 154 building types');
  assert.ok(legacyBuildingDurations[20], 'Should contain legacy durations for Hall');

  // getBuildingLevelData
  const hallLv2 = getBuildingLevelData(20, 2);
  assert.ok(hallLv2);
  assert.equal(hallLv2.d, 2);
  assert.deepEqual(hallLv2.c, { 4: 180 });

  // Missing requirements
  const levelsMap = new Map([
    [21, 1], // Lumber Mill Lv 1 (needs 2 for Hall Lv 3)
  ]);
  const missingReqs = getMissingBuildingRequirements(20, 3, levelsMap);
  assert.equal(missingReqs.length, 1);
  assert.equal(missingReqs[0].buildingId, 21);
  assert.equal(missingReqs[0].requiredLevel, 2);
  assert.equal(missingReqs[0].currentLevel, 1);

  // Missing costs
  const resourcesMap = new Map([
    [4, 100], // 100 Wood (needs 180 for Hall Lv 2)
  ]);
  const missingCosts = getMissingBuildingCosts(20, 2, resourcesMap);
  assert.equal(missingCosts.length, 1);
  assert.equal(missingCosts[0].materialId, 4);
  assert.equal(missingCosts[0].required, 180);
  assert.equal(missingCosts[0].current, 100);

  // calculateEffectiveDurationMs
  const durationMs = calculateEffectiveBuildingDurationMs(20, 2);
  assert.equal(durationMs, Math.round(2 * 1000 * 0.58));

  // normalizeQueuedDuration
  const item = { buildingId: 20, nextLevel: 16, durationMs: Math.round(5496 * 1000 * 0.58) };
  const normalized = normalizeQueuedDuration(item);
  assert.equal(normalized.durationMs, Math.round(109680 * 1000 * 0.58));

  // Typed helper
  assert.ok(buildingDataHelper);
  assert.equal(buildingDataHelper.getBuildingLevelData, getBuildingLevelData);
});

test('researchData exports complete data and typed helpers with 100% parity', () => {
  assert.equal(Object.keys(researchData).length, 229, 'Should contain 229 research technologies');

  // getMaxLevel
  const maxGrowth1 = getMaxLevel(1);
  assert.equal(maxGrowth1, 3);

  // getResearchLevelData
  const tech1Lv1 = getResearchLevelData(1, 1);
  assert.ok(tech1Lv1);
  assert.equal(tech1Lv1.d, 2);
  assert.equal(tech1Lv1.b, 1);

  // Missing requirements - Research Center check
  const currentResearches = new Map([[1, 0]]);
  const missingRC = getMissingResearchRequirements(1, 1, currentResearches, 0);
  assert.equal(missingRC.length, 1);
  assert.equal(missingRC[0].type, 'building');
  assert.equal(missingRC[0].buildingId, 43);
  assert.equal(missingRC[0].required, 1);

  // Missing requirements - Prerequisite check
  const missingPrereq = getMissingResearchRequirements(4, 1, new Map([[1, 0], [3, 0]]), 5);
  assert.equal(missingPrereq.length, 2);

  // isAvailable helper
  const available = isAvailable(1, 1, new Map(), 5);
  assert.equal(available, true);

  // Missing costs
  const matsMap = new Map([[1, 100]]);
  const missingMats = getMissingResearchCosts(1, 1, matsMap);
  assert.ok(missingMats.length > 0);
  const mat1Deficit = missingMats.find(m => m.materialId === 1);
  assert.ok(mat1Deficit);
  assert.equal(mat1Deficit.required, 160);
  assert.equal(mat1Deficit.current, 100);
  assert.equal(mat1Deficit.deficit, 60);

  // calculateEffectiveDurationMs
  const resDuration = calculateEffectiveResearchDurationMs(1, 1);
  assert.equal(resDuration, Math.round(2 * 1000 * 0.892));

  // requiresSpecialResource
  assert.equal(requiresSpecialResource(1, 1), false);
  assert.equal(requiresSpecialResource(558, 1), true); // Tactical classes require material 12

  // Typed helper
  assert.ok(researchDataHelper);
  assert.equal(researchDataHelper.getMaxLevel, getMaxLevel);
});
