import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RESOURCE_THEMES,
  resolveMarchResourceType,
  getMarchBadgeInfo,
  resourceAppearance,
} from '../src/utils/resourceData.ts';

const root = process.cwd();

test('RESOURCE_THEMES defines distinctive color themes and icons for all primary resources', () => {
  assert.ok(RESOURCE_THEMES.food, 'Food theme must exist');
  assert.equal(RESOURCE_THEMES.food.icon, '🌾');
  assert.ok(RESOURCE_THEMES.food.badgeClasses.includes('lime'));
  assert.ok(RESOURCE_THEMES.food.textClass.includes('lime'));
  assert.ok(RESOURCE_THEMES.food.progressBarClass.includes('lime'));

  assert.ok(RESOURCE_THEMES.wood, 'Wood theme must exist');
  assert.equal(RESOURCE_THEMES.wood.icon, '🪵');
  assert.ok(RESOURCE_THEMES.wood.badgeClasses.includes('emerald'));
  assert.ok(RESOURCE_THEMES.wood.textClass.includes('emerald'));
  assert.ok(RESOURCE_THEMES.wood.progressBarClass.includes('emerald'));

  assert.ok(RESOURCE_THEMES.stone, 'Stone theme must exist');
  assert.equal(RESOURCE_THEMES.stone.icon, '🪨');
  assert.ok(RESOURCE_THEMES.stone.badgeClasses.includes('slate'));
  assert.ok(RESOURCE_THEMES.stone.textClass.includes('slate'));
  assert.ok(RESOURCE_THEMES.stone.progressBarClass.includes('slate'));

  assert.ok(RESOURCE_THEMES.iron, 'Iron theme must exist');
  assert.equal(RESOURCE_THEMES.iron.icon, '⚙️');
  assert.ok(RESOURCE_THEMES.iron.badgeClasses.includes('cyan'));
  assert.ok(RESOURCE_THEMES.iron.textClass.includes('cyan'));
  assert.ok(RESOURCE_THEMES.iron.progressBarClass.includes('cyan'));
});

test('resolveMarchResourceType resolves resource type across diverse march properties and cache', () => {
  assert.equal(resolveMarchResourceType({ kind: 'food' }), 'food');
  assert.equal(resolveMarchResourceType({ kind: 'return', previousKind: 'wood' }), 'wood');
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineType: 'stone' }), 'stone');
  assert.equal(resolveMarchResourceType({ kind: 'mine', resourceType: 'iron' }), 'iron');
  // Mine config 68 is Food level 10 (food mine configs: 59-68)
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineConfigId: 68 }), 'food');
  // Mine config 58 is Wood level 10 (wood mine configs: 49-58)
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineConfigId: 58 }), 'wood');
  // Mine config 78 is Stone level 10 (stone mine configs: 69-78)
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineConfigId: 78 }), 'stone');
  // Mine config 88 is Iron level 10 (iron mine configs: 79-88)
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineConfigId: 88 }), 'iron');

  // Cache mineMap lookup
  const cache = { mineMap: { 'mine-stone': { mineType: 'stone' } } };
  assert.equal(resolveMarchResourceType({ kind: 'mine', mineId: 'mine-stone' }, cache), 'stone');

  // Target name fallback
  assert.equal(resolveMarchResourceType({ kind: 'mine', targetName: 'Food Farm Lv.5' }), 'food');
  assert.equal(resolveMarchResourceType({ kind: 'mine', targetName: 'Lumber Mill' }), 'wood');
  assert.equal(resolveMarchResourceType({ kind: 'mine', targetName: 'Stone Quarry' }), 'stone');
  assert.equal(resolveMarchResourceType({ kind: 'mine', targetName: 'Iron Mine Lv.10' }), 'iron');
});

test('getMarchBadgeInfo distinguishes active gathering squads with specific resource icons and theme classes', () => {
  const now = Date.now();

  const foodGather = { kind: 'food', stage: 'gathering', mineId: 'm1' };
  const foodInfo = getMarchBadgeInfo(foodGather, now);
  assert.equal(foodInfo.category, 'gather');
  assert.equal(foodInfo.icon, '🌾');
  assert.ok(foodInfo.classes.includes('lime'));

  const woodGather = { kind: 'wood', stage: 'gathering', mineId: 'm2' };
  const woodInfo = getMarchBadgeInfo(woodGather, now);
  assert.equal(woodInfo.category, 'gather');
  assert.equal(woodInfo.icon, '🪵');
  assert.ok(woodInfo.classes.includes('emerald'));

  const stoneGather = { kind: 'stone', stage: 'gathering', mineId: 'm3' };
  const stoneInfo = getMarchBadgeInfo(stoneGather, now);
  assert.equal(stoneInfo.category, 'gather');
  assert.equal(stoneInfo.icon, '🪨');
  assert.ok(stoneInfo.classes.includes('slate'));

  const ironGather = { kind: 'iron', stage: 'gathering', mineId: 'm4' };
  const ironInfo = getMarchBadgeInfo(ironGather, now);
  assert.equal(ironInfo.category, 'gather');
  assert.equal(ironInfo.icon, '⚙️');
  assert.ok(ironInfo.classes.includes('cyan'));

  // Returning squads retain return arrow
  const returning = { kind: 'return', previousKind: 'wood' };
  assert.equal(getMarchBadgeInfo(returning, now).icon, '↩️');

  // Solo marching squads display traveler
  const traveling = { kind: 'food', stage: 'moveToTargetInSolo', targetArrivalAt: now + 50000 };
  assert.equal(getMarchBadgeInfo(traveling, now).icon, '🚶‍♂️');
});

test('resourceAppearance maps resource:material entries to matching theme icons and classes', () => {
  const foodApp = resourceAppearance({ key: 'resource:material:5' });
  assert.equal(foodApp.icon, '🌾');
  assert.ok(foodApp.classes.includes('lime'));

  const woodApp = resourceAppearance({ key: 'resource:material:4' });
  assert.equal(woodApp.icon, '🪵');
  assert.ok(woodApp.classes.includes('emerald'));

  const stoneApp = resourceAppearance({ key: 'resource:material:3' });
  assert.equal(stoneApp.icon, '🪨');
  assert.ok(stoneApp.classes.includes('slate'));

  const ironApp = resourceAppearance({ key: 'resource:material:2' });
  assert.equal(ironApp.icon, '⚙️');
  assert.ok(ironApp.classes.includes('cyan'));
});

test('UI components apply themed colors and icons across dashboard, modal, and header', async () => {
  const resourceSummary = await readFile(join(root, 'src/components/dashboard/ResourceSummary.vue'), 'utf8');
  assert.ok(resourceSummary.includes('text-lime-600'), 'ResourceSummary must style Food with lime');
  assert.ok(resourceSummary.includes('text-emerald-600'), 'ResourceSummary must style Wood with emerald');
  assert.ok(resourceSummary.includes('text-slate-600'), 'ResourceSummary must style Stone with slate');
  assert.ok(resourceSummary.includes('text-cyan-600'), 'ResourceSummary must style Iron with cyan');

  const gatheringProgress = await readFile(join(root, 'src/components/common/GatheringProgress.vue'), 'utf8');
  assert.ok(gatheringProgress.includes('progressBarClass'), 'GatheringProgress must bind dynamic progressBarClass');

  const queuesOverview = await readFile(join(root, 'src/components/dashboard/QueuesOverview.vue'), 'utf8');
  assert.ok(queuesOverview.includes("m.gathering.type === 'food'"), 'QueuesOverview must style food progress/timer');
  assert.ok(queuesOverview.includes('bg-lime-500'), 'QueuesOverview must include lime progress bar');
  assert.ok(queuesOverview.includes('bg-emerald-500'), 'QueuesOverview must include emerald progress bar');
  assert.ok(queuesOverview.includes('bg-cyan-500'), 'QueuesOverview must include cyan progress bar');

  const header = await readFile(join(root, 'src/components/common/Header.vue'), 'utf8');
  assert.ok(header.includes('autoGatherBadge'), 'Header must compute autoGatherBadge');
  assert.ok(header.includes('RESOURCE_THEMES'), 'Header must import RESOURCE_THEMES');

  const gatheringModal = await readFile(join(root, 'src/components/dialogs/GatheringModal.vue'), 'utf8');
  assert.ok(gatheringModal.includes('🌾 Food Farm'), 'GatheringModal options must use Food Farm icon');
  assert.ok(gatheringModal.includes('🪵 Lumber Mill'), 'GatheringModal options must use Lumber Mill icon');
  assert.ok(gatheringModal.includes('🪨 Stone Quarry'), 'GatheringModal options must use Stone Quarry icon');
  assert.ok(gatheringModal.includes('⚙️ Iron Mine'), 'GatheringModal options must use Iron Mine icon');
});
