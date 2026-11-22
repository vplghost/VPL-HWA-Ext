import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSkinUpgradeCost,
  getSkinRangeCost,
  getNextTenMilestone,
  getNextTenPlus10Milestone,
  getHeroMainStat,
  getSkinStoneInfo,
  buildChestOpenPlan,
  getSkinName,
  getHeroSkinsDetailed,
} from '../src/utils/skinHelper.ts';

test('skinHelper: verifies mathematical accuracy of skin level costs', () => {
  // Default skin total from 1 to 60 is 30,790 (59 upgrades), or 30,825 from 0 to 60 (60 upgrades)
  const defaultTotalFrom1 = getSkinRangeCost(1, 60, 'default');
  assert.equal(defaultTotalFrom1, 30790, 'Default skin total cost from 1 to 60 must be 30,790');
  const defaultTotalFrom0 = getSkinRangeCost(0, 60, 'default');
  assert.equal(defaultTotalFrom0, 30825, 'Default skin total cost from 0 to 60 must be 30,825');

  // Other skin upgrade total from 1 to 60 is 50,410
  const otherTotal = getSkinRangeCost(1, 60, 'other');
  assert.equal(otherTotal, 50410, 'Other skin upgrade cost from 1 to 60 must be 50,410');

  // Champion skin upgrade total from 1 to 60 is 54,330
  const champTotal = getSkinRangeCost(1, 60, 'champion');
  assert.equal(champTotal, 54330, 'Champion skin upgrade cost from 1 to 60 must be 54,330');

  // Winter skin upgrade total from 1 to 60 is 53,412
  const winterTotal = getSkinRangeCost(1, 60, 'winter');
  assert.equal(winterTotal, 53412, 'Winter skin upgrade cost from 1 to 60 must be 53,412');

  // Single step costs
  assert.equal(getSkinUpgradeCost(1, 'default'), 35);
  assert.equal(getSkinUpgradeCost(5, 'default'), 55);
  assert.equal(getSkinUpgradeCost(10, 'default'), 130);
  assert.equal(getSkinUpgradeCost(60, 'default'), 0);
});

test('skinHelper: computes next multiples of 10 accurately', () => {
  assert.equal(getNextTenMilestone(1), 10);
  assert.equal(getNextTenMilestone(7), 10);
  assert.equal(getNextTenMilestone(10), 20);
  assert.equal(getNextTenMilestone(14), 20);
  assert.equal(getNextTenMilestone(20), 30);
  assert.equal(getNextTenMilestone(30), 40);
  assert.equal(getNextTenMilestone(40), 50);
  assert.equal(getNextTenMilestone(50), 60);
  assert.equal(getNextTenMilestone(59), 60);
  assert.equal(getNextTenMilestone(60), 60);

  assert.equal(getNextTenPlus10Milestone(1), 20);
  assert.equal(getNextTenPlus10Milestone(10), 30);
  assert.equal(getNextTenPlus10Milestone(20), 40);
  assert.equal(getNextTenPlus10Milestone(30), 50);
  assert.equal(getNextTenPlus10Milestone(40), 60);
  assert.equal(getNextTenPlus10Milestone(50), 60);
});

test('skinHelper: resolves hero primary stat and skin stones correctly', () => {
  // Hero 1 (Aurora) is Strength
  assert.equal(getHeroMainStat(1), 'strength');
  const strInfo = getSkinStoneInfo('strength');
  assert.equal(strInfo.coinId, 9);
  assert.equal(strInfo.choiceIndex, 1);

  // Hero 3 (Keira) is Agility
  assert.equal(getHeroMainStat(3), 'agility');
  const agiInfo = getSkinStoneInfo('agility');
  assert.equal(agiInfo.coinId, 10);
  assert.equal(agiInfo.choiceIndex, 2);

  // Hero 5 (Kai) is Intelligence
  assert.equal(getHeroMainStat(5), 'intelligence');
  const intInfo = getSkinStoneInfo('intelligence');
  assert.equal(intInfo.coinId, 8);
  assert.equal(intInfo.choiceIndex, 0);
});

test('skinHelper: buildChestOpenPlan optimizes large and small skin stone chests', () => {
  // Need 400 stones, have 2 large chests (300) and 3 small chests (450)
  const res = buildChestOpenPlan(400, 1, 2, 3);
  assert.equal(res.canFulfill, true);
  assert.equal(res.totalYield, 450); // 2 large (300) + 1 small (150) = 450
  assert.deepEqual(res.plan, [
    { libId: 65, name: 'Large Skin Stone Chest', amount: 2, choiceIndex: 1, yieldPerChest: 150 },
    { libId: 51, name: 'Skin Stone Chest', amount: 1, choiceIndex: 1, yieldPerChest: 150 },
  ]);

  // Deficit 0
  const noDeficit = buildChestOpenPlan(0, 1, 5, 5);
  assert.equal(noDeficit.canFulfill, true);
  assert.equal(noDeficit.plan.length, 0);

  // Insufficient chests
  const insuff = buildChestOpenPlan(500, 1, 1, 1);
  assert.equal(insuff.canFulfill, false);
  assert.equal(insuff.totalYield, 300); // 1 large (150) + 1 small (150) = 300
});

test('skinHelper: getHeroSkinsDetailed calculates complete plans for a hero', () => {
  const heroData = {
    id: 1, // Aurora
    baseSkinId: 1,
    currentSkin: 1,
    skins: {
      '1': 5, // Default skin at level 5
      '35': 10, // Demonic skin at level 10
    },
  };

  const inventoryCoins = { '9': 100 }; // 100 Strength Skin Stones
  const inventoryConsumables = { '65': 5, '51': 2 }; // 5 Large chests, 2 small chests

  const skins = getHeroSkinsDetailed(1, heroData, inventoryCoins, inventoryConsumables);
  assert.equal(skins.length, 2);

  // Default skin: level 5
  const defaultSkin = skins[0];
  assert.equal(defaultSkin.skinId, 1);
  assert.equal(defaultSkin.isDefault, true);
  assert.equal(defaultSkin.level, 5);
  assert.equal(defaultSkin.plan.costOne, 55); // lvl 6 cost is 55
  assert.equal(defaultSkin.plan.canUpgradeOneDirect, true); // 100 >= 55
  assert.equal(defaultSkin.plan.targetNextTen, 10);
  assert.equal(defaultSkin.plan.deltaNextTen, 5); // 5 -> 10
  assert.equal(defaultSkin.plan.costNextTen, 275); // 55 * 5 = 275
  assert.equal(defaultSkin.plan.canUpgradeNextTenDirect, false); // 100 < 275
  assert.equal(defaultSkin.plan.canUpgradeNextTenWithChests, true); // 100 + (7*150) >= 275
  assert.equal(defaultSkin.plan.chestsForNextTen, 2); // deficit 175 -> ceil(175/150) = 2 chests

  // Demonic skin: level 10
  const demonicSkin = skins[1];
  assert.equal(demonicSkin.skinId, 35);
  assert.equal(demonicSkin.isDefault, false);
  assert.equal(demonicSkin.level, 10);
  assert.equal(demonicSkin.plan.targetNextTen, 20); // next multiple of 10 from 10 is 20!
  assert.equal(demonicSkin.plan.deltaNextTen, 10);
});
