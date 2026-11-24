import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  isOpenableChest,
  isChoiceChest,
  getChestChoices,
  aggregateChestRewards,
  CHOICE_CHEST_DEFINITIONS,
  KNOWN_CHEST_IDS,
  NON_CHEST_CATEGORIES,
  VALID_CHEST_CATEGORIES
} from '../src/utils/chestHelper.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

const root = resolve(import.meta.dirname, '..');

test('chestHelper accurately detects openable chests, choice options, and aggregates drops', async () => {
  // 1. Detection of openable chests
  assert.equal(isOpenableChest({ id: 62, category: 'consumable', name: 'Artifact Essence Chest' }), true);
  assert.equal(isOpenableChest({ id: 28, category: 'consumable', name: 'Legendary Chest' }), true);
  assert.equal(isOpenableChest({ id: 15, category: 'consumable', name: 'Bronze casket' }), true);
  assert.equal(isOpenableChest({ id: 18, category: 'consumable', name: 'Silver casket' }), true);
  assert.equal(isOpenableChest({ id: 21, category: 'consumable', name: 'Golden casket' }), true);
  assert.equal(isOpenableChest({ id: 51, category: 'consumable', name: 'Skin Stone Chest' }), true);
  assert.equal(isOpenableChest({ id: '999', category: 'lootboxChanced', name: 'Special Mystery Box' }), true);
  assert.equal(isOpenableChest({ id: 9, category: 'consumable', name: 'Smaller EXP potion' }), false);

  // 1b. Non-chest items with colliding IDs MUST NOT be detected as openable chests
  assert.equal(isOpenableChest({ id: 18, category: 'gear', name: 'Orcish Hammer' }), false, 'Gear #18 must not be openable');
  assert.equal(isOpenableChest({ id: 62, category: 'gear', name: 'Orcish Plate' }), false, 'Gear #62 must not be openable');
  assert.equal(isOpenableChest({ id: 15, category: 'gear', name: 'Heavy Belt' }), false, 'Gear #15 must not be openable');
  assert.equal(isOpenableChest({ id: 21, category: 'patron', name: 'Relic Shard #21' }), false, 'Relic shard #21 must not be openable');
  assert.equal(isOpenableChest({ id: 62, rawCategory: 'gear' }), false, 'rawCategory gear #62 must not be openable');
  assert.equal(isOpenableChest({ id: 18, category: 'fragmentGear' }), false, 'fragmentGear #18 must not be openable');
  assert.equal(isOpenableChest({ id: 22, category: 'artifact' }), false, 'artifact #22 must not be openable');
  assert.equal(isOpenableChest({ id: 19, category: 'scroll' }), false, 'scroll #19 must not be openable');
  assert.equal(isOpenableChest({ id: 47, category: 'fragmentTitan' }), false, 'fragmentTitan #47 must not be openable');
  assert.equal(isOpenableChest({ id: 51, category: 'coin' }), false, 'coin #51 must not be openable');
  assert.ok(NON_CHEST_CATEGORIES.has('gear'), 'NON_CHEST_CATEGORIES must contain gear');
  assert.ok(NON_CHEST_CATEGORIES.has('patron'), 'NON_CHEST_CATEGORIES must contain patron');

  // 2. Choice Chest identification
  assert.equal(isChoiceChest(62), true, 'Chest 62 must be recognized as Choice Chest');
  assert.equal(isChoiceChest(63), true, 'Chest 63 must be recognized as Choice Chest');
  assert.equal(isChoiceChest(64), true, 'Chest 64 must be recognized as Choice Chest');
  assert.equal(isChoiceChest(51), true, 'Chest 51 must be recognized as Choice Chest');
  assert.equal(isChoiceChest(65), true, 'Chest 65 (Large Skin Stone Chest) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(274), true, 'Chest 274 (Fire Titan Artifact Chest) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(273), true, 'Chest 273 (Water Titan Artifact Chest) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(275), true, 'Chest 275 (Earth Titan Artifact Chest) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(276), true, 'Chest 276 (Chest of Seals) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(40228), true, 'Chest 40228 (Heroes Trove) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(40229), true, 'Chest 40229 (Rare Heroes Trove) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(40230), true, 'Chest 40230 (Titans Trove) must be recognized as Choice Chest');
  assert.equal(isChoiceChest(40231), true, 'Chest 40231 (Rare Titans Trove) must be recognized as Choice Chest');
  assert.equal(isChoiceChest('custom-chest', { rawCategory: 'lootboxChoiced' }), true, 'lootboxChoiced category must be recognized as choice');
  assert.equal(isChoiceChest(15), false, 'Chest 15 (Bronze casket) is random, not choice');
  assert.equal(isChoiceChest(28), false, 'Chest 28 (Legendary Chest) is random, not choice');

  // 2b. Large Skin Stone Chest (65) amount validation (150 per choice, NOT 350)
  const choices65 = getChestChoices(65);
  assert.equal(choices65.length, 3, 'Large Skin Stone Chest has 3 choices');
  for (const opt of choices65) {
    assert.equal(opt.reward.amount, 150, `Choice ${opt.label} must give exactly 150 skin stones, not 350`);
    assert.equal(opt.reward.type, 'coin');
  }

  // 2c. Fire Titan Artifact Chest (274) choices validation
  const choices274 = getChestChoices(274);
  assert.equal(choices274.length, 5, 'Fire Titan Artifact Chest has 5 choices');
  assert.ok(choices274.some((c) => c.label.includes('Ragni') || c.reward.id === 11005));
  assert.ok(choices274.some((c) => c.label.includes('Fire Crown') || c.reward.id === 12001));
  for (const opt of choices274) {
    assert.equal(opt.reward.amount, 25, 'Titan artifact fragments reward amount must be 25');
  }

  // 2d. Heroes Trove (40228) and Titans Trove (40230) choices validation
  const choices40228 = getChestChoices(40228);
  assert.equal(choices40228.length, 6, 'Heroes Trove has 6 choices');
  const choices40230 = getChestChoices(40230);
  assert.equal(choices40230.length, 6, 'Titans Trove has 6 choices');

  // 3. Choices for 62: Artifact Essence Chest
  const choices62 = getChestChoices(62);
  assert.equal(choices62.length, 5, 'Artifact Essence Chest has 5 quality tiers (White to Orange)');
  assert.equal(choices62[0].reward.id, 29);
  assert.equal(choices62[0].reward.amount, 12);
  assert.equal(choices62[0].reward.icon, 'assets/items/consumable/29.png', 'Choices must have resolved icon path');
  assert.equal(choices62[1].reward.id, 30);
  assert.equal(choices62[1].reward.amount, 7);
  assert.equal(choices62[1].reward.icon, 'assets/items/consumable/30.png');
  assert.equal(choices62[2].reward.id, 31);
  assert.equal(choices62[2].reward.amount, 4);
  assert.equal(choices62[3].reward.id, 32);
  assert.equal(choices62[3].reward.amount, 2);
  assert.equal(choices62[4].reward.id, 33);
  assert.equal(choices62[4].reward.amount, 1);

  // 4. Test drop aggregation from live game record hwa-game-record-202611200058_chest_opening.json
  const { readTrackingLog } = await import('./helpers/trackingLog.mjs');
  const logRaw = await readTrackingLog('hwa-game-record-202611200058_chest_opening.json');
  const logData = JSON.parse(logRaw);
  const rpcs = (logData.timeline || []).filter(
    (t) => t.transport === 'fetch' && t.endpoint?.includes('/api/rpc') && t.requestBody?.includes('inventory_use')
  );

  assert.equal(rpcs.length, 3, 'Must have 3 inventory_use calls in tracking log');

  // Call 1: 2x choice 0 -> 24x id 29
  const res1 = JSON.parse(rpcs[0].responseBody);
  const rewards1 = aggregateChestRewards(res1.results[0].result.response);
  assert.equal(rewards1.length, 1);
  assert.equal(rewards1[0].id, '29');
  assert.equal(rewards1[0].amount, 24);
  assert.equal(rewards1[0].name, 'Artifact Essence');

  // Call 2: 3x choice 1 -> 21x id 30
  const res2 = JSON.parse(rpcs[1].responseBody);
  const rewards2 = aggregateChestRewards(res2.results[0].result.response);
  assert.equal(rewards2.length, 1);
  assert.equal(rewards2[0].id, '30');
  assert.equal(rewards2[0].amount, 21);
  assert.equal(rewards2[0].name, 'Uncommon Artifact Essence');

  // Call 3: 1x choice 2 -> 4x id 31
  const res3 = JSON.parse(rpcs[2].responseBody);
  const rewards3 = aggregateChestRewards(res3.results[0].result.response);
  assert.equal(rewards3.length, 1);
  assert.equal(rewards3[0].id, '31');
  assert.equal(rewards3[0].amount, 4);
  assert.equal(rewards3[0].name, 'Rare Artifact Essence');
});

test('rpcCache accurately extracts and merges inventory_use chest opening from live tracking data', async () => {
  const { readTrackingLog } = await import('./helpers/trackingLog.mjs');
  const logRaw = await readTrackingLog('hwa-game-record-202611200058_chest_opening.json');
  const logData = JSON.parse(logRaw);
  const rpcs = (logData.timeline || []).filter(
    (t) => t.transport === 'fetch' && t.endpoint?.includes('/api/rpc')
  );

  const initialCache = {
    inventoryGet: {
      data: {
        consumable: {
          '62': 100, // 100 Artifact Essence Chests
          '29': 10,  // initial essences
          '30': 5,
          '31': 2
        }
      }
    }
  };

  const { cache: merged } = rpcCacheService.merge(initialCache, rpcs);
  const consumable = merged.inventoryGet?.data?.consumable || {};

  // Opened: 2 + 3 + 1 = 6 chests
  assert.equal(consumable['62'], 100 - 6, 'Chests must be decremented by 6');
  assert.equal(consumable['29'], 10 + 24, 'Essence #29 must increase by 24 (2x12)');
  assert.equal(consumable['30'], 5 + 21, 'Uncommon Essence #30 must increase by 21 (3x7)');
  assert.equal(consumable['31'], 2 + 4, 'Rare Essence #31 must increase by 4 (1x4)');
});

test('ChestModal and ItemsTab integrate Open Chest dialog and actions', async () => {
  const modalPath = join(root, 'src/components/dialogs/ChestModal.vue');
  const modalContent = await readFile(modalPath, 'utf8');

  assert.ok(modalContent.includes('chest-dialog'), 'ChestModal must have chest-dialog id');
  assert.ok(modalContent.includes('btn-open-chest-execute'), 'ChestModal must have btn-open-chest-execute action button');
  assert.ok(modalContent.includes('isChoice'), 'ChestModal must handle choice chests');
  assert.ok(modalContent.includes('selectedChoiceIndex'), 'ChestModal must track selected choice index');
  assert.ok(modalContent.includes('inventory_use'), 'ChestModal must dispatch inventory_use');
  assert.ok(modalContent.includes('isOpening'), 'ChestModal must track opening state for anti-double-click');
  assert.ok(modalContent.includes('pointer-events-none'), 'Must block clicks during opening');
  assert.equal(modalContent.includes('dark:bg-slate-850'), false, 'Must not have invalid dark:bg-slate-850 class');
  assert.equal(modalContent.includes('dark:bg-slate-750'), false, 'Must not have invalid dark:bg-slate-750 class');
  assert.equal(modalContent.includes('dark:hover:bg-slate-750'), false, 'Must not have invalid dark:hover:bg-slate-750 class');
  assert.ok(modalContent.includes('NON_CHEST_CATEGORIES'), 'ChestModal must filter out non-chest categories');

  // Verify ItemsTab integration
  const itemsTabPath = join(root, 'src/components/tabs/ItemsTab.vue');
  const itemsContent = await readFile(itemsTabPath, 'utf8');
  assert.ok(itemsContent.includes('btn-toolbar-open-chests'), 'ItemsTab must have Open Chests toolbar button');
  assert.ok(itemsContent.includes('isOpenableChest'), 'ItemsTab must check isOpenableChest');
  assert.ok(itemsContent.includes("openModal('chest'"), 'ItemsTab must open chest modal');

  // Verify useModals registration
  const useModalsPath = join(root, 'src/composables/useModals.ts');
  const useModalsContent = await readFile(useModalsPath, 'utf8');
  assert.ok(useModalsContent.includes("'chest'"), "useModals must register 'chest' modal");
});
