import test from 'node:test';
import assert from 'node:assert/strict';
import {
  heroSoulProgress,
  titanSoulProgress,
  isSoulUpgradeReady,
  countEvolvableHeroes,
  countEvolvableTitans,
  heroEquipmentRank,
  getUnreadChatCount,
  formatChatRole,
  formatChatTime,
  formatCountdown,
  questLocaleMap,
} from '../src/utils/popupData.ts';

test('heroSoulProgress and titanSoulProgress return accurate owned and needed', () => {
  const inventory = {
    fragmentHero: { 1: 30, 2: 100 },
    fragmentTitan: { 4001: 50 },
  };
  const hero1 = { star: 1 };
  const hero2 = { star: 6 };
  const titan1 = { star: 1 };

  const res1 = heroSoulProgress(1, hero1, inventory);
  assert.equal(res1.owned, 30);
  assert.equal(res1.needed, 20); // star 1 -> 2 costs 20

  const res2 = heroSoulProgress(2, hero2, inventory);
  assert.equal(res2.owned, 100);
  assert.equal(res2.needed, 'Max');

  const resTitan = titanSoulProgress(4001, titan1, inventory);
  assert.equal(resTitan.owned, 50);
  assert.equal(resTitan.needed, 50); // star 1 -> 2 costs 50
});

test('isSoulUpgradeReady handles slash strings and numbers with null safety', () => {
  assert.equal(isSoulUpgradeReady('25 / 20'), true);
  assert.equal(isSoulUpgradeReady('15 / 20'), false);
  assert.equal(isSoulUpgradeReady(30, 20), true);
  assert.equal(isSoulUpgradeReady(10, 20), false);
  assert.equal(isSoulUpgradeReady(null, 20), false);
  assert.equal(isSoulUpgradeReady(20, null), false);
});

test('countEvolvableHeroes and countEvolvableTitans aggregate upgradeable units', () => {
  const inventory = {
    fragmentHero: { 1: 50, 2: 5 },
    fragmentTitan: { 4001: 100 },
  };
  const heroes = {
    1: { star: 1 }, // needs 20, has 50 -> ready
    2: { star: 1 }, // needs 20, has 5 -> not ready
    3: { star: 6 }, // Max -> not ready
  };
  const titans = {
    4001: { star: 1 }, // needs 50, has 100 -> ready
  };

  assert.equal(countEvolvableHeroes(heroes, inventory), 1);
  assert.equal(countEvolvableTitans(titans, inventory), 1);
});

test('heroEquipmentRank computes tier colors and glow text shadow', () => {
  const rank1 = heroEquipmentRank(1);
  assert.ok(rank1);
  assert.equal(rank1.label, 'White');
  assert.equal(rank1.color, '#B7B0B3');

  const rankRed = heroEquipmentRank(16);
  assert.ok(rankRed);
  assert.equal(rankRed.label, 'Red');
  assert.equal(rankRed.color, '#FD6C6C');

  assert.equal(heroEquipmentRank(0), null);
  assert.equal(heroEquipmentRank(99), null);
});

test('getUnreadChatCount respects lastReadTime and 3-day cutoff', () => {
  const now = 1700000000;
  const messages = [
    { id: 1, ctime: now - 100 },
    { id: 2, ctime: now - 50 },
    { id: 3, ctime: now - 10 },
  ];

  assert.equal(getUnreadChatCount(messages, now - 60, now), 2);
  assert.equal(getUnreadChatCount(messages, now, now), 0);
  assert.equal(getUnreadChatCount([], 0), 0);
});

test('formatChatRole and formatChatTime format correctly', () => {
  assert.equal(formatChatRole(255).label, 'Leader');
  assert.equal(formatChatRole(4).label, 'Officer');
  assert.equal(formatChatRole(3).label, 'Member');

  const formattedTime = formatChatTime(1700000000);
  assert.match(formattedTime, /^\d{2}\/\d{2} \d{2}:\d{2}$/);
});

test('formatCountdown and questLocaleMap exist and function', () => {
  assert.equal(formatCountdown(100, 40), '01:00');
  assert.ok(questLocaleMap.QUEST_TAB_NAME_LOGIN);
});
