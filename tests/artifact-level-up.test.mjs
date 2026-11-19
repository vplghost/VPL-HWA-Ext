import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  getArtifactSlotId,
  getArtifactSlotType,
  getArtifactNextMilestone,
  getArtifactTierColor,
  getArtifactLevelUpCost,
  getArtifactResourceInfo,
  getArtifactUpgradePlan,
  ARTIFACT_MILESTONES
} from '../src/utils/artifactHelper.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

const root = resolve(import.meta.dirname, '..');

test('artifactHelper calculates correct milestones, resource transitions, and costs', () => {
  // 1. Slot mapping
  assert.equal(getArtifactSlotId('weapon'), 1);
  assert.equal(getArtifactSlotId('book'), 2);
  assert.equal(getArtifactSlotId('ring'), 3);
  assert.equal(getArtifactSlotType(1), 'weapon');
  assert.equal(getArtifactSlotType(2), 'book');
  assert.equal(getArtifactSlotType(3), 'ring');

  // 2. Next Milestone thresholds
  assert.equal(getArtifactNextMilestone(1), 25);
  assert.equal(getArtifactNextMilestone(13), 25);
  assert.equal(getArtifactNextMilestone(25), 50);
  assert.equal(getArtifactNextMilestone(26), 50);
  assert.equal(getArtifactNextMilestone(50), 70);
  assert.equal(getArtifactNextMilestone(70), 85);
  assert.equal(getArtifactNextMilestone(85), 100);
  assert.equal(getArtifactNextMilestone(100), 100);

  // 3. Level Up Costs
  // White tier: 2 * target - 1
  assert.equal(getArtifactLevelUpCost(1), 3); // Lvl 1 -> 2
  assert.equal(getArtifactLevelUpCost(13), 27); // Lvl 13 -> 14
  assert.equal(getArtifactLevelUpCost(17), 35); // Lvl 17 -> 18
  assert.equal(getArtifactLevelUpCost(24), 49); // Lvl 24 -> 25
  // Green tier transition
  assert.equal(getArtifactLevelUpCost(25), 30); // Lvl 25 -> 26
  assert.equal(getArtifactLevelUpCost(49), 54); // Lvl 49 -> 50
  // Blue tier transition
  assert.equal(getArtifactLevelUpCost(50), 30); // Lvl 50 -> 51
  assert.equal(getArtifactLevelUpCost(69), 49); // Lvl 69 -> 70
  // Purple tier transition
  assert.equal(getArtifactLevelUpCost(70), 30); // Lvl 70 -> 71
  assert.equal(getArtifactLevelUpCost(84), 44); // Lvl 84 -> 85
  // Orange tier transition
  assert.equal(getArtifactLevelUpCost(85), 30); // Lvl 85 -> 86
  assert.equal(getArtifactLevelUpCost(99), 44); // Lvl 99 -> 100
  assert.equal(getArtifactLevelUpCost(100), 0); // Max

  // 4. Resource mapping
  const weaponRes13 = getArtifactResourceInfo('weapon', 13);
  assert.equal(weaponRes13.consumableId, 29);
  assert.equal(weaponRes13.tierColor, 'white');
  assert.equal(weaponRes13.nextMilestone, 25);

  const weaponRes25 = getArtifactResourceInfo('weapon', 25);
  assert.equal(weaponRes25.consumableId, 30);
  assert.equal(weaponRes25.tierColor, 'green');
  assert.equal(weaponRes25.nextMilestone, 50);

  const bookRes17 = getArtifactResourceInfo('book', 17);
  assert.equal(bookRes17.consumableId, 34);
  assert.equal(bookRes17.tierColor, 'white');

  const ringRes70 = getArtifactResourceInfo('ring', 70);
  assert.equal(ringRes70.consumableId, 42); // Violet metal
  assert.equal(ringRes70.tierColor, 'purple');
});

test('getArtifactUpgradePlan generates complete plan for +1 and milestone delta', () => {
  // Hero 501 weapon at level 13 with 63 gray essence (item 29)
  const plan = getArtifactUpgradePlan('weapon', 13, { 29: 63 });

  assert.equal(plan.currentLevel, 13);
  assert.equal(plan.targetLevel, 25);
  assert.equal(plan.levelsDelta, 12);
  assert.equal(plan.costForNextOne, 27);
  assert.equal(plan.canUpgradeOne, true); // 63 >= 27
  assert.equal(plan.totalCost, 456); // Sum of levels 14..25
  assert.equal(plan.canUpgradeMilestone, true); // can afford at least 2 levels (27 + 29 = 56 <= 63)
  assert.equal(plan.affordableLevels, 2);
  assert.equal(plan.affordableCost, 56);
  assert.equal(plan.consumableId, 29);

  // Plan when abundant resources are available
  const richPlan = getArtifactUpgradePlan('weapon', 13, { 29: 1000 });
  assert.equal(richPlan.affordableLevels, 12);
  assert.equal(richPlan.affordableCost, 456);

  // Plan when max level
  const maxPlan = getArtifactUpgradePlan('weapon', 100, { 33: 500 });
  assert.equal(maxPlan.isMax, true);
  assert.equal(maxPlan.canUpgradeOne, false);
  assert.equal(maxPlan.canUpgradeMilestone, false);
});

test('rpcCache accurately extracts and merges artifact_levelUp from game tracking data', async () => {
  const filePath = join(root, 'temp/tracking-data/hwa-game-record-202611192352_artifacts_level_up.json');
  const raw = await readFile(filePath, 'utf8');
  const recordData = JSON.parse(raw);

  // Prepare initial cache state with hero 501 at level 13 weapon, 17 book
  const initialCache = {
    heroGetAll: {
      data: {
        501: {
          id: 501,
          artifacts: [
            { artifactType: 'weapon', level: 13, star: 3 },
            { artifactType: 'book', level: 17, star: 2 },
            { artifactType: 'ring', level: 18, star: 2 }
          ]
        }
      }
    },
    inventoryGet: {
      data: {
        consumable: {
          29: 300,
          34: 300
        }
      }
    }
  };

  const timeline = recordData.timeline || [];
  const rpcRecords = timeline.filter(item => item.transport === 'fetch' && item.endpoint.includes('/api/rpc'));

  const merged = rpcCacheService.merge(initialCache, rpcRecords);
  const cache = merged.cache;

  // Hero 501 had 6 weapon level-ups (13 -> 19) and 3 book level-ups (17 -> 20)
  const hero501 = cache.heroGetAll.data['501'];
  assert.ok(hero501, 'Hero 501 must exist in cache');
  assert.equal(hero501.artifacts[0].level, 19, 'Weapon level should be 19 (13 + 6)');
  assert.equal(hero501.artifacts[1].level, 20, 'Book level should be 20 (17 + 3)');
  assert.equal(hero501.artifacts[2].level, 18, 'Ring level should remain 18');

  // Verify consumable resources were deducted
  // Weapon 13->19: costs for 14(27), 15(29), 16(31), 17(33), 18(35), 19(37) = 192 total
  assert.equal(cache.inventoryGet.data.consumable[29], 300 - 192);

  // Book 17->20: costs for 18(35), 19(37), 20(39) = 111 total
  assert.equal(cache.inventoryGet.data.consumable[34], 300 - 111);
});

test('HeroDetailModal template includes artifact leveling buttons (+1 and +##)', async () => {
  const modalPath = join(root, 'src/components/dialogs/HeroDetailModal.vue');
  const content = await readFile(modalPath, 'utf8');

  assert.match(content, /detailedArtifacts/, 'Must compute detailedArtifacts');
  assert.match(content, /upgradeArtifactSingle/, 'Must define upgradeArtifactSingle');
  assert.match(content, /upgradeArtifactToMilestone/, 'Must define upgradeArtifactToMilestone');
  assert.match(content, /artifact_levelUp/, 'Must dispatch artifact_levelUp RPC');
  assert.match(content, /\+1<\/span>/, 'Must display +1 button');
  assert.match(content, /\+\{\{\s*art\.plan\.levelsDelta\s*\}\}<\/span>/, 'Must display +## button to milestone');
  assert.match(content, /art\.plan\.costForNextOne/, 'Must display cost for +1 in button text');
  assert.match(content, /art\.plan\.totalCost/, 'Must display total cost for milestone in button text');
});
