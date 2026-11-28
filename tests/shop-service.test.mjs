import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseShopCatalog,
  isEmeraldShopSlot,
  canFreeRefreshShop,
  planFavoriteShopPurchases,
  findFreeRenewableFavoriteShops,
  buildShopBuyCall,
  buildShopRefreshCall,
} from '../src/services/shopService.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

const SAMPLE_SHOPS = {
  '1': {
    id: 1,
    refreshTime: 1795849200,
    slots: {
      '1': { id: 1, reward: { fragmentGear: { '96': 1 } }, bought: 0, cost: { starmoney: 150 }, uniqId: 0 },
      '4': { id: 4, reward: { fragmentHero: { '29': 5 } }, bought: 0, cost: { gold: 750000 }, uniqId: 0 },
      '8': { id: 8, reward: { consumable: { '102': 4 } }, bought: 0, cost: { gold: 100 }, uniqId: 0 },
    },
  },
  '4': {
    id: 4,
    refreshTime: 1795874400,
    slots: {
      '6': { id: 6, reward: { fragmentHero: { '55': 5 } }, bought: 1, cost: { coin: { '1': 500 } }, uniqId: 0 },
      '7': { id: 7, reward: { fragmentHero: { '64': 5 } }, bought: 0, cost: { coin: { '1': 500 } }, uniqId: 0 },
    },
  },
  '15': {
    id: 15,
    refreshTime: 0,
    slots: {
      '5': { id: 5, reward: { fragmentHero: { '501': 5 } }, bought: 1, cost: { coin: { '21': 500 } }, uniqId: 0 },
    },
  },
};

test('P2-43: parseShopCatalog, isEmeraldShopSlot, and canFreeRefreshShop enforce 0-Emerald & scheduled free-refresh rules', () => {
  assert.equal(isEmeraldShopSlot({ cost: { starmoney: 100 } }), true);
  assert.equal(isEmeraldShopSlot({ cost: { gold: 500 } }), false);
  assert.equal(isEmeraldShopSlot({ cost: { coin: { '1': 500 } } }), false);

  assert.equal(canFreeRefreshShop({ refreshTime: 1795874400 }, 1795874399), false);
  assert.equal(canFreeRefreshShop({ refreshTime: 1795874400 }, 1795874400), true);
  assert.equal(canFreeRefreshShop({ refreshTime: 0 }, 1795874400), false);

  const cache = {
    userGetInfo: { data: { gold: 800000 } },
    'resource:coin:1': { data: { amount: 1200 } },
  };
  const parsed = parseShopCatalog(SAMPLE_SHOPS, cache, 1795849200);
  assert.equal(parsed.shops.length, 3);
  assert.equal(parsed.freeRefreshCount, 1, 'Only shop 1 has nowSec >= refreshTime');
  const emeraldSlot = parsed.slots.find((s) => s.shopId === 1 && s.slotId === 1);
  assert.equal(emeraldSlot?.isEmerald, true);
  const goldSlot = parsed.slots.find((s) => s.shopId === 1 && s.slotId === 4);
  assert.equal(goldSlot?.affordable, true);
  assert.deepEqual(buildShopBuyCall(goldSlot), {
    name: 'shopBuy',
    args: { shopId: 1, slot: 4, reward: { fragmentHero: { '29': 5 } }, amount: 1 },
  });
  assert.deepEqual(buildShopRefreshCall(4), { name: 'shopRefresh', args: { shopId: 4 } });
});

test('P2-44: planFavoriteShopPurchases blocks starmoney, enforces currencyReserves, and deducts projected balances', () => {
  const parsed = parseShopCatalog(SAMPLE_SHOPS, {}, 1795849200);
  const favorites = {
    'fragmentGear:96': { itemKey: 'fragmentGear:96', enabled: true }, // starmoney -> MUST block
    'fragmentHero:29': { itemKey: 'fragmentHero:29', enabled: true }, // 750,000 gold
    'consumable:102': { itemKey: 'consumable:102', enabled: true },   // 100 gold
    'fragmentHero:55': { itemKey: 'fragmentHero:55', enabled: true }, // already bought -> skip
    'fragmentHero:64': { itemKey: 'fragmentHero:64', enabled: true }, // 500 coin:1
  };
  const balances = { gold: 760000, 'coin:1': 600 };
  const reserves = { gold: 50000 }; // leaves 710,000 spendable gold -> cannot buy 750k, CAN buy 100 gold

  const { plan, skippedInsufficient, projectedBalances } = planFavoriteShopPurchases(
    parsed.slots,
    favorites,
    balances,
    reserves
  );
  assert.deepEqual(
    plan.map((s) => s.itemKey),
    ['consumable:102', 'fragmentHero:64']
  );
  assert.deepEqual(
    skippedInsufficient.map((s) => s.itemKey),
    ['fragmentHero:29']
  );
  assert.equal(projectedBalances.gold, 759900);
  assert.equal(projectedBalances['coin:1'], 100);
});

test('P2-44: findFreeRenewableFavoriteShops selects only shops with bought favorites and elapsed refreshTime', () => {
  const favorites = {
    'fragmentHero:55': { itemKey: 'fragmentHero:55', enabled: true }, // bought in shop 4
    'fragmentHero:501': { itemKey: 'fragmentHero:501', enabled: true }, // bought in shop 15 (refreshTime=0)
  };
  const beforeReset = parseShopCatalog(SAMPLE_SHOPS, {}, 1795874399);
  assert.deepEqual(findFreeRenewableFavoriteShops(beforeReset.shops, beforeReset.slots, favorites, 1795874399), []);

  const afterReset = parseShopCatalog(SAMPLE_SHOPS, {}, 1795874400);
  assert.deepEqual(findFreeRenewableFavoriteShops(afterReset.shops, afterReset.slots, favorites, 1795874400), [4]);
});

test('P2-43: rpcCache updates shopGetMany on shopBuy and shopRefresh responses', () => {
  const initialCache = {
    shopGetMany: { key: 'shopGetMany', method: 'shopGetMany', group: 'items', data: structuredClone(SAMPLE_SHOPS), updatedAt: '2026-11-28T03:00:00Z' },
  };
  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  const buyRecord = {
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-28T03:51:00Z',
    requestBody: JSON.stringify({ calls: [{ ident: 'c1', name: 'shopBuy', args: { shopId: 1, slot: 4, reward: { fragmentHero: { '29': 5 } }, amount: 1 } }] }),
    responseBody: JSON.stringify({
      results: [{ ident: 'c1', result: { response: { slot: { id: 4, reward: { fragmentHero: { '29': '5' } }, bought: 1, cost: { gold: 750000 } }, refreshTime: 1795849200 } } }],
    }),
  };
  const afterBuy = rpcCacheService.merge(initialCache, [buyRecord]);
  assert.equal(afterBuy.cache.shopGetMany.data['1'].slots['4'].bought, 1);

  const refreshRecord = {
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-28T03:52:00Z',
    requestBody: JSON.stringify({ calls: [{ ident: 'c2', name: 'shopRefresh', args: { shopId: 4 } }] }),
    responseBody: JSON.stringify({
      results: [{ ident: 'c2', result: { response: { id: 4, availableUntil: 0, refreshTime: 1795960800, slots: { '6': { id: 6, bought: 0, reward: { fragmentHero: { '55': '5' } }, cost: { coin: { '1': 500 } } } } } } }],
    }),
  };
  const afterRefresh = rpcCacheService.merge(afterBuy.cache, [refreshRecord]);
  assert.equal(afterRefresh.cache.shopGetMany.data['4'].refreshTime, 1795960800);
  assert.equal(afterRefresh.cache.shopGetMany.data['4'].slots['6'].bought, 0);
});

test('P2-43 & P2-44: DashboardTab mounts #open-shop-dialog icon button and ShopModal renders unified grid + favorite footer actions', async () => {
  const dashSrc = await readFile(resolve(process.cwd(), 'src/components/dashboard/DashboardTab.vue'), 'utf8');
  assert.match(dashSrc, /id="open-shop-dialog"/);
  assert.match(dashSrc, /openModal\('shop'\)/);

  const modalSrc = await readFile(resolve(process.cwd(), 'src/components/dialogs/ShopModal.vue'), 'utf8');
  assert.match(modalSrc, /id="shop-items-grid"/);
  assert.match(modalSrc, /id="shop-filter-favorites"/);
  assert.match(modalSrc, /id="btn-shop-buy-favorites"/);
  assert.match(modalSrc, /id="btn-shop-renew-favorites"/);
  assert.match(modalSrc, /id="shop-dialog-footer"/);
});
