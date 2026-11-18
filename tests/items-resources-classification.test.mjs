import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemName } from '../src/data/nameData.ts';
import { getItemIcon, getResourceIcon } from '../src/data/itemData.ts';
import { isItemResourceKey, isListedInventoryItem, CHEST_REFILLABLES, ITEM_CATEGORIES } from '../src/utils/resourceData.ts';
import { merge } from '../src/core/cache/rpcCache.ts';

test('patron names and icons map correctly for new heroes', () => {
  assert.equal(getItemName('patron', 61), 'Wodryn Relic Shard');
  assert.equal(getItemName('patron', 21), 'Kendle Relic Shard');
  assert.equal(getItemName('patron', 22), 'Dorian Relic Shard');
  assert.equal(getItemName('patron', 1), 'Relic Shard');

  assert.equal(getItemIcon('patron', 61), 'assets/items/patron/61.png');
  assert.equal(getItemIcon('patron', 21), 'assets/items/patron/21.png');
  assert.equal(getItemIcon('patron', 22), 'assets/items/patron/22.png');
  assert.equal(getItemIcon('patron', 1), 'assets/items/patron/1.png');
  assert.equal(getResourceIcon({ key: 'resource:patron:61' }), 'assets/items/patron/61.png');
});

test('refillable and material names map for new version assets', () => {
  assert.equal(getItemName('refillable', 45), 'Golden Easter Chest');
  assert.equal(getItemName('refillable', 50), 'Brigand Battles');
  assert.equal(getItemName('refillable', 52), 'Raid Battles');
  assert.equal(getItemName('material', 14), 'Blueprints');
});

test('isItemResourceKey cleanly separates item categories from genuine resources', () => {
  // Items must be classified as items
  for (const cat of ['gear', 'fragmentGear', 'artifact', 'fragmentArtifact', 'scroll', 'fragmentScroll', 'consumable', 'coin', 'fragmentHero', 'fragmentTitan', 'fragmentSkin', 'patron', 'lootboxChanced', 'teleporter']) {
    assert.equal(isItemResourceKey(`resource:${cat}:1`), true, cat);
  }
  for (const speedUp of ['speedUpConstruction', 'speedUpResearch', 'speedUpUniversal', 'speedUpUnitTraining', 'speedUpUnitHealing']) {
    assert.equal(isItemResourceKey(`resource:${speedUp}:1`), true, speedUp);
  }
  // Chest refillables are items
  for (const id of ['3', '4', '35', '37', '40', '41', '42', '43', '44', '45']) {
    assert.equal(isItemResourceKey(`resource:refillable:${id}`), true, `refillable:${id}`);
  }

  // Genuine resources must not be classified as items
  assert.equal(isItemResourceKey('resource:gold'), false);
  assert.equal(isItemResourceKey('resource:starMoney'), false);
  assert.equal(isItemResourceKey('resource:energy'), false);
  assert.equal(isItemResourceKey('resource:world-energy'), false);
  assert.equal(isItemResourceKey('resource:material:1'), false);
  assert.equal(isItemResourceKey('resource:material:2'), false);
  assert.equal(isItemResourceKey('resource:material:14'), false);
  assert.equal(isItemResourceKey('resource:refillable:1'), false);
  assert.equal(isItemResourceKey('resource:refillable:2'), false);
  assert.equal(isItemResourceKey('resource:refillable:21'), false);
  assert.equal(isItemResourceKey('resource:refillable:50'), false);
  assert.equal(isItemResourceKey('resource:refillable:52'), false);
});

test('rpcCache zeroes out missing inventory items on inventoryGet', () => {
  const initialCache = {
    'resource:gear:131': { key: 'resource:gear:131', data: { amount: 1 } },
    'resource:gear:91': { key: 'resource:gear:91', data: { amount: 1 } },
    'resource:scroll:50': { key: 'resource:scroll:50', data: { amount: 2 } },
    'resource:patron:61': { key: 'resource:patron:61', data: { amount: 10 } },
  };

  const inventoryGetEntry = {
    key: 'inventoryGet',
    method: 'inventoryGet',
    data: {
      gear: {},
      scroll: { 50: 1 },
      patron: {},
      coin: { 1: 10 }
    },
    updatedAt: 2000
  };

  const { cache: updatedCache } = merge(initialCache, [inventoryGetEntry]);
  assert.equal(updatedCache['resource:gear:131']?.data?.amount, 0, 'gear 131 reset to 0');
  assert.equal(updatedCache['resource:gear:91']?.data?.amount, 0, 'gear 91 reset to 0');
  assert.equal(updatedCache['resource:patron:61']?.data?.amount, 0, 'patron 61 reset to 0');
  assert.equal(updatedCache['resource:scroll:50']?.data?.amount, 2, 'scroll 50 retained in cache');
});

test('ItemsTab aggregates inventoryGet, strategicInventory, and resource items while hiding quantity 0', async () => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const ts = (await import('typescript')).default;
  const Vue = await import('vue');

  const source = await readFile(new URL('../src/components/tabs/ItemsTab.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');

  const cache = Vue.ref({
    inventoryGet: {
      data: {
        gear: { '1': 5 },
        consumable: { '2': 0 }, // 0 quantity
      }
    },
    'getInventory:inventory': {
      data: {
        inventory: {
          items: [
            { type: 'speedUpUniversal', id: 1, quantity: 15 },
            { type: 'speedUpResearch', id: 2, quantity: 0 }, // 0 quantity
          ]
        }
      }
    },
    'resource:lootboxChanced:27': { data: { amount: 3 } },
    'resource:patron:61': { data: { amount: 8 } },
    'resource:refillable:45': { data: { amount: 2 } },
    'resource:gear:131': { data: { amount: 0 } }, // 0 quantity
    'resource:gold': { data: { amount: 1000000 } }, // genuine resource, must NOT be in ItemsTab
  });

  const boundary = {
    ref: Vue.ref,
    computed: Vue.computed,
    useRpcCache: () => ({ cache, dispatchRpc() {} }),
    getItemName,
    getItemIcon,
    isInactiveResource: () => false,
    formatNumber: (n) => String(n),
    popupDataHelper: {},
    downloadJson: () => {},
    isItemResourceKey,
    CHEST_REFILLABLES,
  };

  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js + '\nglobalThis.api = { items, filteredItems, categories, getItemImgSrc };', boundary);

  const itemsList = boundary.api.items.value;
  // Should include gear 1, speedUp 1, lootboxChanced 27, patron 61, refillable (chest) 45
  const itemKeys = itemsList.map(it => `${it.category}:${it.id}`);
  assert.ok(itemKeys.includes('gear:1'), 'gear:1 present');
  assert.ok(itemKeys.includes('speedUp:1'), 'speedUp:1 present');
  assert.ok(itemKeys.includes('lootboxChanced:27'), 'lootboxChanced:27 present');
  assert.ok(itemKeys.includes('patron:61'), 'patron:61 present');
  assert.ok(itemKeys.includes('lootboxChanced:45'), 'lootboxChanced:45 (Golden Easter Chest) present');

  // Should NOT include 0 quantity items or resources
  assert.ok(!itemKeys.includes('consumable:2'), 'consumable:2 (0 count) excluded');
  assert.ok(!itemKeys.includes('speedUp:2'), 'speedUp:2 (0 count) excluded');
  assert.ok(!itemKeys.includes('gear:131'), 'gear:131 (0 count) excluded');
  assert.ok(!itemKeys.includes('gold'), 'gold excluded');

  // Check name resolution
  const patronItem = itemsList.find(it => it.id === '61' && it.category === 'patron');
  assert.equal(patronItem?.name, 'Wodryn Relic Shard');

  const easterChest = itemsList.find(it => it.id === '45' && it.category === 'lootboxChanced');
  assert.equal(easterChest?.name, 'Golden Easter Chest');

  // Check icon path resolution
  assert.equal(boundary.api.getItemImgSrc(patronItem), 'assets/items/patron/61.png');
  const speedUpItem = itemsList.find(it => it.id === '1' && it.category === 'speedUp');
  assert.equal(boundary.api.getItemImgSrc(speedUpItem), 'assets/items/speedUpUniversal/1.png');
});
