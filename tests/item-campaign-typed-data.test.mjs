import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nameData,
  nameMap,
  getHeroName,
  getItemName,
  getBuildingName,
  getResearchName,
  getArtifactName
} from '../src/data/nameData.ts';

import {
  itemResources,
  getItemIcon,
  isInactiveResource,
  getResourceIcon
} from '../src/data/itemData.ts';

import {
  campaignMissions,
  itemDrops,
  getMissionsForItem,
  getMissionProgress,
  getMissionTries,
  isMissionRaidable,
  getHighestRaidableMission
} from '../src/data/campaignData.ts';

import { buildGearRecipeTree, recipeMissions } from '../src/utils/recipeTree.ts';
import { resourceLabel } from '../src/utils/resourceData.ts';

test('typed nameData correctly resolves hero, item, and category names with 100% parity', () => {
  assert.equal(getHeroName(1), 'Aurora');
  assert.equal(getHeroName(4000), 'Sigurd');
  assert.equal(getHeroName('1'), 'Aurora');
  assert.equal(getHeroName(5016), 'Golem');
  assert.equal(getHeroName(999999), null);

  assert.equal(getItemName('fragmentHero', 1), 'Aurora fragment');
  assert.equal(getItemName('fragmentTitan', 4000), 'Sigurd fragment');
  assert.equal(getItemName('fragmentArtifact', 1001), "Selias' Legacy fragment");
  assert.equal(getItemName('consumable', 2001), "Captain's Coin");
  assert.equal(getItemName('coin', 40094), 'Ancient Coin');
  assert.equal(getItemName('gear', 1), 'Orcish Knuckles');
  assert.equal(getItemName('gear', 999999), null);

  assert.equal(getArtifactName(1001), "Selias' Legacy");
  assert.equal(getBuildingName(9999), 'Building #9999');
  assert.equal(getResearchName(9999), 'Research #9999');
  assert.equal(getResearchName(633), 'Additional Infirmary I');
  assert.equal(getResearchName(634), 'Additional Infirmary II');
  assert.equal(getResearchName(635), 'New Drill Ground I');

  // Verify nameMap interface parity
  assert.equal(nameMap.hero(1), 'Aurora');
  assert.equal(nameMap.item('coin', 40094), 'Ancient Coin');
});

test('typed itemData correctly resolves icons and inactivity states', () => {
  assert.ok(itemResources.icons);
  assert.ok(itemResources.items);

  // Icon resolution
  assert.equal(getItemIcon('artifact', 1001), 'assets/items/artifact/1001.png');
  assert.equal(getItemIcon('fragmentArtifact', 1001), 'assets/items/artifact/1001.png');
  assert.equal(getItemIcon('unknown_category', 999999), null);

  // Inactive resource checks
  const now = Date.parse('2026-11-14T00:00:00Z');
  assert.equal(isInactiveResource({ key: 'resource:refillable:61' }, now), true);
  assert.equal(isInactiveResource({ key: 'resource:refillable:511' }, now), true);
  assert.equal(isInactiveResource({ key: 'resource:gold' }, now), false);
  assert.equal(isInactiveResource({ key: 'resource:refillable:6' }, now), false);

  // getResourceIcon
  assert.equal(getResourceIcon({ key: 'resource:artifact:1001' }), 'assets/items/artifact/1001.png');
  assert.equal(getResourceIcon({ key: 'nonresource:artifact:1001' }), null);
});

test('typed campaignData validates missions, item drops, and raid calculations', () => {
  const missionCount = Object.keys(campaignMissions).length;
  assert.ok(missionCount >= 180, `Expected at least 180 campaign missions, got ${missionCount}`);

  const mission1 = campaignMissions['1'];
  assert.ok(mission1);
  assert.equal(mission1.id, 1);
  assert.equal(mission1.chapter, 1);
  assert.equal(mission1.isHeroic, true);
  assert.ok(mission1.cost > 0);

  // getMissionsForItem
  const drops1 = getMissionsForItem(1);
  assert.ok(Array.isArray(drops1));
  assert.ok(drops1.length > 0);

  // getMissionProgress
  const pMap = { '1': { stars: 3, resetToday: 1, triesSpent: 2 } };
  const p = getMissionProgress(1, pMap);
  assert.equal(p?.stars, 3);
  assert.equal(p?.resetToday, 1);

  // getMissionTries
  const tries = getMissionTries(1, pMap);
  assert.equal(tries.isHeroic, true);
  assert.equal(tries.maxTries, 6); // (1 + 1) * 3
  assert.equal(tries.triesSpent, 2);
  assert.equal(tries.triesLeft, 4);

  // Non-heroic mission
  const mission2Tries = getMissionTries(2, pMap);
  assert.equal(mission2Tries.isHeroic, false);
  assert.equal(mission2Tries.triesLeft, Infinity);

  // isMissionRaidable
  assert.equal(isMissionRaidable(1, pMap), true);
  assert.equal(isMissionRaidable(1, { '1': { stars: 2 } }), false);
  assert.equal(isMissionRaidable(1, { '1': { stars: 3, resetToday: 0, triesSpent: 3 } }), false);
  assert.equal(isMissionRaidable(1, pMap, { disabledIds: [1] }), false);

  // getHighestRaidableMission
  const candidates = [1, 2, 3];
  const highest = getHighestRaidableMission(candidates, {
    '1': { stars: 3 },
    '2': { stars: 3 },
    '3': { stars: 2 }
  });
  assert.equal(highest, 2);
});

test('resourceData and recipeTree integrate cleanly with typed item and campaign modules', () => {
  const label = resourceLabel({ key: 'resource:coin:40094' });
  assert.equal(label, 'Ancient Coin');

  const tree = buildGearRecipeTree(131, { inventoryGet: { data: {} } });
  assert.ok(tree);
  assert.equal(tree.id, '131');
  assert.equal(tree.name, 'World Tremor');
  assert.ok(tree.children.length > 0);
});
