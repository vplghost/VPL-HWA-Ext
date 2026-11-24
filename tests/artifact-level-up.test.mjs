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
  // 1. Slot mapping (0-indexed in game RPC: 0: weapon, 1: book, 2: ring)
  assert.equal(getArtifactSlotId('weapon'), 0);
  assert.equal(getArtifactSlotId('book'), 1);
  assert.equal(getArtifactSlotId('ring'), 2);
  assert.equal(getArtifactSlotType(0), 'weapon');
  assert.equal(getArtifactSlotType(1), 'book');
  assert.equal(getArtifactSlotType(2), 'ring');

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

test('getArtifactUpgradePlan generates complete plan for +1, milestone delta, and chest bridge', () => {
  // Hero 501 weapon at level 13 with 63 gray essence (item 29)
  // Consumable inventory has 63 item 29, and 100 chests (item 62)
  const inventory = { 29: 63, 62: 100 };
  const plan = getArtifactUpgradePlan('weapon', 13, inventory);

  assert.equal(plan.currentLevel, 13);
  assert.equal(plan.targetLevel, 25);
  assert.equal(plan.levelsDelta, 12);
  assert.equal(plan.costForNextOne, 27);
  assert.equal(plan.canUpgradeOne, true); // 63 >= 27
  assert.equal(plan.totalCost, 456); // Sum of levels 14..25
  assert.equal(plan.affordableLevels, 2);
  assert.equal(plan.affordableCost, 56);
  assert.equal(plan.milestoneLevels, 2); // min(12, 2)
  assert.equal(plan.milestoneCost, 56);
  assert.equal(plan.consumableId, 29);

  // Chest plan verification:
  // Target milestone is 25 (delta: 12).
  // Total cost for 12 levels = 456.
  // Owned essence = 63. Deficit = 456 - 63 = 393.
  // Weapon gray chest yield = 12 essence per chest (chest 62 choice index 0).
  // Ceil(393 / 12) = 33 chests.
  // Player has 100 chests, so player can afford all 12 levels with chests.
  assert.ok(plan.chestPlan);
  assert.equal(plan.chestPlan.hasChests, true);
  assert.equal(plan.chestPlan.canUpgradeWithChests, true);
  assert.equal(plan.chestPlan.levelsDeltaWithChests, 12);
  assert.equal(plan.chestPlan.chestsToOpen, 33);
  assert.equal(plan.chestPlan.chestId, 62);
  assert.equal(plan.chestPlan.choiceIndex, 0);

  // Plan when abundant resources are available directly
  const richPlan = getArtifactUpgradePlan('weapon', 13, { 29: 1000, 62: 10 });
  assert.equal(richPlan.affordableLevels, 12);
  assert.equal(richPlan.affordableCost, 456);
  assert.equal(richPlan.milestoneLevels, 12);
  assert.equal(richPlan.milestoneCost, 456);
  // Deficit is 0, so chestsToOpen is 0 and canUpgradeWithChests is false
  assert.equal(richPlan.chestPlan?.canUpgradeWithChests, false);

  // Plan when 0 chests owned
  const noChestsPlan = getArtifactUpgradePlan('weapon', 13, { 29: 63, 62: 0 });
  assert.equal(noChestsPlan.chestPlan?.hasChests, false);
  assert.equal(noChestsPlan.chestPlan?.canUpgradeWithChests, false);

  // Plan when max level
  const maxPlan = getArtifactUpgradePlan('weapon', 100, { 33: 500 });
  assert.equal(maxPlan.isMax, true);
  assert.equal(maxPlan.canUpgradeOne, false);
  assert.equal(maxPlan.canUpgradeMilestone, false);
  assert.equal(maxPlan.chestPlan?.canUpgradeWithChests, false);
});

test('rpcCache accurately extracts and merges artifact_levelUp from game tracking data', async () => {
  const { readTrackingLog } = await import('./helpers/trackingLog.mjs');
  const raw = await readTrackingLog('hwa-game-record-202611192352_artifacts_level_up.json');
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

  // In hwa-game-record-202611192352:
  // slotId: 1 (book) upgraded 6 times (17 -> 23)
  // slotId: 2 (ring) upgraded 3 times (18 -> 21)
  // slotId: 0 (weapon) was not upgraded in that file
  const hero501 = cache.heroGetAll.data['501'];
  assert.ok(hero501, 'Hero 501 must exist in cache');
  assert.equal(hero501.artifacts[0].level, 13, 'Weapon level should remain 13');
  assert.equal(hero501.artifacts[1].level, 23, 'Book level should be 23 (17 + 6)');
  assert.equal(hero501.artifacts[2].level, 21, 'Ring level should be 21 (18 + 3)');

  // Verify consumable resources were deducted:
  // Book 17->23: costs for 18(35), 19(37), 20(39), 21(41), 22(43), 23(45) = 240 total item 34
  assert.equal(cache.inventoryGet.data.consumable[34], 300 - 240);

  // Now test weapon level up with slotId: 0 from hwa-game-record-202611200026_hero_weapon_raise.json
  const weaponRaw = await readTrackingLog('hwa-game-record-202611200026_hero_weapon_raise.json');
  const weaponRecordData = JSON.parse(weaponRaw);
  const weaponRpcRecords = (weaponRecordData.timeline || []).filter(item => item.transport === 'fetch' && item.endpoint.includes('/api/rpc'));

  const weaponInitialCache = {
    heroGetAll: {
      data: {
        502: {
          id: 502,
          artifacts: [
            { artifactType: 'weapon', level: 1, star: 1 },
            { artifactType: 'book', level: 1, star: 1 },
            { artifactType: 'ring', level: 1, star: 1 }
          ]
        }
      }
    },
    inventoryGet: {
      data: {
        consumable: {
          29: 50
        }
      }
    }
  };

  const weaponMerged = rpcCacheService.merge(weaponInitialCache, weaponRpcRecords);
  const hero502 = weaponMerged.cache.heroGetAll.data['502'];
  assert.ok(hero502, 'Hero 502 must exist in cache');
  assert.equal(hero502.artifacts[0].level, 2, 'Weapon (slotId: 0) should level up from 1 to 2');
  // Cost 1->2 is 2 * 2 - 1 = 3
  assert.equal(weaponMerged.cache.inventoryGet.data.consumable[29], 50 - 3);
});

test('HeroDetailModal template includes artifact leveling buttons (+1, +#1 milestone, and +#2 chest bridge)', async () => {
  const modalPath = join(root, 'src/components/dialogs/HeroDetailModal.vue');
  const content = await readFile(modalPath, 'utf8');

  assert.match(content, /detailedArtifacts/, 'Must compute detailedArtifacts');
  assert.match(content, /upgradeArtifactSingle/, 'Must define upgradeArtifactSingle');
  assert.match(content, /upgradeArtifactToMilestone/, 'Must define upgradeArtifactToMilestone');
  assert.match(content, /upgradeArtifactWithChests/, 'Must define upgradeArtifactWithChests');
  assert.match(content, /upgradingArtifactAction/, 'Must track upgradingArtifactAction');
  assert.match(content, /artifact_levelUp/, 'Must dispatch artifact_levelUp RPC');
  assert.match(content, /inventory_use/, 'Must dispatch inventory_use for chests');
  assert.match(content, /\+1<\/span>/, 'Must display +1 button');
  assert.match(content, /\+\{\{\s*art\.plan\.milestoneLevels/, 'Must display +#1 button to milestone');
  assert.match(content, /\+\{\{\s*art\.plan\.chestPlan\.levelsDeltaWithChests\s*\}\}<\/span>/, 'Must display +#2 button with chest bridge');
  assert.match(content, /art\.plan\.costForNextOne/, 'Must display cost for +1 in button text');
  assert.match(content, /art\.plan\.milestoneCost/, 'Must display milestoneCost for milestone in button text');
  assert.match(content, /art\.plan\.chestPlan\.chestsToOpen/, 'Must display chestsToOpen on chest bridge button');
  assert.match(content, /pointer-events-none/, 'Must disable pointer events during artifact upgrade to prevent double-click');
});
