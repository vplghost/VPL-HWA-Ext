import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  planFavoriteSoulStoneSweep,
  planRecursiveGearCraftAndEquip,
  buildRecursiveGearCraftEquipCalls,
  clampReserveEnergy,
  DEFAULT_SOUL_SWEEP_RESERVE_ENERGY,
} from '../src/services/heroSoulSweepService.ts';
import { DEFAULT_DAILY_STEP_ORDER, DAILY_STEP_LABELS } from '../src/services/dailyAutopilotService.ts';
import { getHeroSoulMissions } from '../src/data/campaignData.ts';

test('planFavoriteSoulStoneSweep skips 6-star & canEvolve heroes, filters 3-star Heroic tries, and respects reserveEnergy', () => {
  const hero1Missions = getHeroSoulMissions(1);
  assert.ok(hero1Missions.length > 0, 'Hero 1 should have Heroic soul stone missions');
  const missionGetAllData = Object.fromEntries(
    hero1Missions.map((m) => [String(m.id), { id: m.id, stars: 3, triesSpent: 0 }])
  );
  const cache = {
    heroGetAll: {
      data: {
        1: { id: 1, star: 3, level: 60 },
        2: { id: 2, star: 6, level: 80 },
        3: { id: 3, star: 2, level: 50 },
      },
    },
    inventoryGet: {
      data: {
        fragmentHero: {
          1: 10,
          3: 100, // already enough to evolve from 2★ -> 3★
        },
      },
    },
    missionGetAll: {
      data: missionGetAllData,
    },
    userGetInfo: { data: { refillable: [{ id: 1, amount: 66, cap: 180 }] } },
  };

  assert.equal(DEFAULT_SOUL_SWEEP_RESERVE_ENERGY, 30);
  assert.equal(clampReserveEnergy(-5), 30);
  assert.equal(clampReserveEnergy(250), 200);

  // Reserve 30⚡ out of 66⚡ -> budget = 36⚡ (also verify reading live energy from cache when currentEnergy is omitted)
  const planFromCache = planFavoriteSoulStoneSweep(cache, [1, 2, 3], { reserveEnergy: 30 });
  assert.equal(planFromCache.currentEnergy, 66, 'Should read numeric energy from getEnergy(cache)');
  assert.ok(planFromCache.plannedRaids > 0);

  const plan = planFavoriteSoulStoneSweep(cache, [1, 2, 3], { reserveEnergy: 30, currentEnergy: 66 });
  assert.equal(plan.eligibleHeroCount, 1, 'Only hero 1 (not 6★, not canEvolve) is eligible');
  assert.ok(plan.missions.every((m) => m.heroId === 1));
  assert.ok(plan.plannedEnergy <= 36, 'Planned energy must never exceed currentEnergy - reserveEnergy');
  assert.ok(plan.plannedRaids > 0);

  // When currentEnergy <= reserveEnergy -> 0 raids planned with clear skippedReason
  const lowEnergy = planFavoriteSoulStoneSweep(cache, [1], { reserveEnergy: 30, currentEnergy: 30 });
  assert.equal(lowEnergy.plannedRaids, 0);
  assert.match(lowEnergy.skippedReason || '', /reserve/i);
});

test('planRecursiveGearCraftAndEquip builds bottom-up craft order with shared inventory accounting and never auto-promotes', () => {
  // Custom craft map:
  // Gear 1000 (parent) requires 1x Gear 2000 + 1x Scroll 3000, gold: 5000
  // Gear 2000 requires 5x fragmentGear:2000, gold: 1000
  // Scroll 3000 requires 5x fragmentScroll:3000, gold: 2000
  // Slot 2 also needs Gear 1000 — with only 5 fragments of 2000, Slot 1 succeeds and Slot 2 MUST NOT double-spend!
  const customCraftMap = {
    '1000': { recipe: { '2000': 1 }, scroll: { '3000': 1 }, gold: 5000 },
    '2000': { fragmentCount: 5, gold: 1000 },
    '3000': { fragmentCount: 5, gold: 2000 },
    '4000': { fragmentCount: 5, gold: 500 },
  };
  const inventory = {
    gear: { '4000': 1 }, // Slot 3 already in inventory (0 craft, 0 gold)
    scroll: {},
    fragmentGear: { '2000': 5 },
    fragmentScroll: { '3000': 5 },
  };
  const slots = [
    { slotNum: 1, itemId: 1000, itemName: 'Parent Gear', isEquipped: false },
    { slotNum: 2, itemId: 1000, itemName: 'Duplicate Parent', isEquipped: false },
    { slotNum: 3, itemId: 4000, itemName: 'Ready Direct Gear', isEquipped: false },
    { slotNum: 4, itemId: 9999, itemName: 'Already Equipped', isEquipped: true },
  ];

  const plan = planRecursiveGearCraftAndEquip(slots, inventory, 10000, customCraftMap);
  assert.equal(plan.readySlotCount, 2, 'Slot 1 (recursive) + Slot 3 (in inventory) ready; Slot 2 blocked by shared stock');
  assert.equal(plan.totalGoldCost, 8000, '1000 + 2000 + 5000 = 8000 gold');
  assert.equal(plan.canAffordGold, true);
  assert.deepEqual(
    plan.craftSteps.map((s) => `${s.rpcName}:${s.type}:${s.libId}`),
    [
      'inventoryCraftFragments:gear:2000',
      'inventoryCraftFragments:scroll:3000',
      'inventoryCraftRecipe:gear:1000',
    ],
    'Craft steps must be strictly bottom-up (children before parent)'
  );
  assert.deepEqual(
    plan.equipSlots.map((s) => s.slotIdx),
    [0, 2],
    'Equip indices are 0-based for Slot 1 and Slot 3'
  );

  const calls = buildRecursiveGearCraftEquipCalls(1, plan);
  assert.equal(calls.some((c) => c.name === 'heroPromote'), false, 'CRITICAL: must NEVER auto-promote');
  assert.equal(calls.filter((c) => c.name === 'heroInsertItem').length, 2);

  // Insufficient gold flags canAffordGold = false
  const brokePlan = planRecursiveGearCraftAndEquip(slots, inventory, 1000, customCraftMap);
  assert.equal(brokePlan.canAffordGold, false);
});

test('Daily Routine Autopilot registers soul-sweep step and UI selectors exist in CampaignRaidModal & HeroDetailModal', () => {
  assert.ok(DEFAULT_DAILY_STEP_ORDER.includes('soul-sweep'));
  assert.equal(DAILY_STEP_LABELS['soul-sweep'], 'Favorite Soul Stones');

  const campaignSrc = fs.readFileSync(new URL('../src/components/dialogs/CampaignRaidModal.vue', import.meta.url), 'utf8');
  assert.match(campaignSrc, /id="campaign-soul-sweep-panel"/);
  assert.match(campaignSrc, /id="campaign-soul-reserve-input"/);
  assert.match(campaignSrc, /id="campaign-soul-sweep-btn"/);

  const heroSrc = fs.readFileSync(new URL('../src/components/dialogs/HeroDetailModal.vue', import.meta.url), 'utf8');
  assert.match(heroSrc, /id="hero-equip-all-ready-btn"/);
});
