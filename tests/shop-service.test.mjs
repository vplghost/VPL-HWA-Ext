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
  buildGrandFarmCoinsCall,
  shouldClaimGrandArenaCoins,
  computeNextAutoShopWakeAt,
  AUTO_SHOP_ALARM_NAME,
} from '../src/services/shopService.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';
import { runAutoShopFavorites } from '../src/background/backgroundRuntime.ts';
import { DEFAULT_DAILY_STEP_ORDER, DAILY_STEP_LABELS } from '../src/services/dailyAutopilotService.ts';
import { CONFIG_KEYS } from '../src/utils/dataBackup.ts';

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

test('P2-46: parseShopCatalog resolves real coin/item names via getItemName and names active event shops dynamically', () => {
  const eventShops = {
    '4': SAMPLE_SHOPS['4'],
    '1000263': {
      id: 1000263,
      refreshTime: 0,
      slots: {
        '1': { id: 1, reward: { coin: { '18': 200 } }, bought: 0, cost: { coin: { '40181': 1100 } } },
      },
    },
    '1000266': {
      id: 1000266,
      refreshTime: 0,
      slots: {
        '1': { id: 1, reward: { consumable: { '102': 4 } }, bought: 0, cost: { coin: { '40194': 500 } } },
      },
    },
    '1000268': {
      id: 1000268,
      refreshTime: 0,
      slots: {
        '1': { id: 1, reward: { fragmentGear: { '96': 1 } }, bought: 0, cost: { coin: { '40188': 300 } } },
      },
    },
  };
  const cache = {
    'resource:coin:40181': { data: { amount: 41600 } },
    'resource:coin:40194': { data: { amount: 750 } },
    'resource:coin:40188': { data: { amount: 500 } },
  };
  const parsed = parseShopCatalog(eventShops, cache, 1795849200);
  const arenaSlot = parsed.slots.find((s) => s.shopId === 4);
  assert.equal(arenaSlot?.costLabel, 'Arena coin');

  const eternalShop = parsed.shops.find((s) => s.shopId === 1000263);
  assert.equal(eternalShop?.name, 'Eternal Marks Shop');
  assert.equal(eternalShop?.primaryCurrencyLabel, 'Eternal Marks');
  assert.equal(eternalShop?.primaryBalance, 41600);

  const adventureShop = parsed.shops.find((s) => s.shopId === 1000266);
  assert.equal(adventureShop?.name, 'Adventure Shop');
  assert.equal(adventureShop?.primaryCurrencyLabel, 'Adventure Coin');

  const clashShop = parsed.shops.find((s) => s.shopId === 1000268);
  assert.equal(clashShop?.name, 'Guild Clash Shop');
  assert.equal(clashShop?.primaryCurrencyLabel, 'Guild Clash Trophy');
});

test('P3-11: rpcCache merges verified grandFarmCoins response into inventoryGet.coin[2] and cache.grandFarmCoins', () => {
  let cache = {
    inventoryGet: {
      key: 'inventoryGet',
      method: 'inventoryGet',
      group: 'items',
      data: { coin: { '2': 400 } },
      updatedAt: '2026-11-28T08:00:00.000Z',
    },
    'resource:coin:2': {
      key: 'resource:coin:2',
      group: 'items',
      data: { amount: 400 },
      updatedAt: '2026-11-28T08:00:00.000Z',
    },
  };
  const record = {
    timestamp: '2026-11-28T08:28:22.000Z',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    method: 'POST',
    status: 200,
    outcome: 'completed',
    requestBody: JSON.stringify({
      calls: [{ ident: 'ga_farm_1', name: 'grandFarmCoins', args: {} }],
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'ga_farm_1',
          result: {
            response: {
              reward: { coin: { '2': 103 } },
              grandCoin: 0.92238888888889,
              grandCoinTime: 1795854502,
            },
          },
        },
      ],
    }),
  };

  const merged = rpcCacheService.merge(cache, [record]);
  assert.equal(merged.changed, true);
  assert.equal(merged.cache.inventoryGet.data.coin['2'], 503);
  assert.equal(merged.cache.grandFarmCoins.data.grandCoinTime, 1795854502);
  assert.equal(merged.cache.grandFarmCoins.data.lastClaimed, 103);
});

test('P3-11: shouldClaimGrandArenaCoins handles on-demand shortfall, 6h anti-cap, and 15m cooldown', () => {
  const nowSec = 1_800_000_000;
  const gaShopData = {
    '5': {
      id: 5,
      refreshTime: nowSec + 3600,
      slots: {
        '1': { id: 1, reward: { fragmentHero: { '12': 5 } }, bought: 0, cost: { coin: { '2': 500 } }, uniqId: 0 },
      },
    },
  };
  const favs = [{ itemKey: 'fragmentHero:12' }];

  const lowBalCache = {
    inventoryGet: { data: { coin: { '2': 200 } } },
    grandFarmCoins: { data: { grandCoinTime: nowSec - 2000 } },
  };
  const { slots: lowSlots } = parseShopCatalog(gaShopData, lowBalCache, nowSec);
  const dec1 = shouldClaimGrandArenaCoins(lowBalCache, lowSlots, favs, {}, nowSec, { allowAntiCap: false });
  assert.equal(dec1.shouldClaim, true);
  assert.equal(dec1.reason, 'on_demand_shortfall');

  const coolCache = {
    inventoryGet: { data: { coin: { '2': 200 } } },
    grandFarmCoins: { data: { grandCoinTime: nowSec - 300 } },
  };
  const dec2 = shouldClaimGrandArenaCoins(coolCache, lowSlots, favs, {}, nowSec, { allowAntiCap: true });
  assert.equal(dec2.shouldClaim, false);
  assert.equal(dec2.reason, 'cooldown');

  const richOldCache = {
    inventoryGet: { data: { coin: { '2': 2000 } } },
    grandFarmCoins: { data: { grandCoinTime: nowSec - 7 * 3600 } },
  };
  const { slots: richSlots } = parseShopCatalog(gaShopData, richOldCache, nowSec);
  const dec3 = shouldClaimGrandArenaCoins(richOldCache, richSlots, favs, {}, nowSec, { allowAntiCap: true });
  assert.equal(dec3.shouldClaim, true);
  assert.equal(dec3.reason, 'anti_cap');
});

test('P3-11: runAutoShopFavorites schedules single zero-polling alarm and dispatches grandFarmCoins + free refresh + 0-Emerald buys only', async () => {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const futureRefreshSec = nowSec + 7200;

  const storageState = {
    autoShopFavoritesEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    shopFavorites: {
      'fragmentHero:12': { itemKey: 'fragmentHero:12', itemName: 'GA Hero' },
      'fragmentGear:96': { itemKey: 'fragmentGear:96', itemName: 'Emerald Trap' },
      'consumable:102': { itemKey: 'consumable:102', itemName: 'Gold Item' },
    },
    shopCurrencyReserves: {},
    rpcCache: {
      accountStatus: { data: { id: 1001 } },
      userGetInfo: { data: { gold: 500000 } },
      inventoryGet: { data: { coin: { '2': 100 } } },
      grandFarmCoins: { data: { grandCoinTime: nowSec - 3600 } },
      shopGetMany: {
        data: {
          '1': {
            id: 1,
            refreshTime: futureRefreshSec,
            slots: {
              '1': { id: 1, reward: { fragmentGear: { '96': 1 } }, bought: 0, cost: { starmoney: 150 } },
              '8': { id: 8, reward: { consumable: { '102': 4 } }, bought: 0, cost: { gold: 100 } },
            },
          },
          '5': {
            id: 5,
            refreshTime: nowSec - 60,
            slots: {
              '1': { id: 1, reward: { fragmentHero: { '12': 5 } }, bought: 1, cost: { coin: { '2': 500 } } },
              '2': { id: 2, reward: { fragmentHero: { '12': 5 } }, bought: 0, cost: { coin: { '2': 500 } } },
            },
          },
        },
      },
    },
  };

  const createdAlarms = [];
  const sentMessages = [];
  const mockChrome = {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((k) => [k, storageState[k]]));
          }
          return { ...storageState };
        },
        async set(patch) {
          Object.assign(storageState, patch);
        },
      },
    },
    alarms: {
      create(name, info) {
        createdAlarms.push({ name, info });
      },
      clear() {},
    },
    tabs: {
      query(_filter, cb) {
        cb([{ id: 77, url: 'https://www.hero-wars-alliance.com/', active: true }]);
      },
      async sendMessage(tabId, msg) {
        sentMessages.push({ tabId, msg });
        return { ok: true, results: [] };
      },
    },
  };

  const result = await runAutoShopFavorites(true, mockChrome);
  assert.equal(result.ok, true);
  assert.equal(sentMessages.length, 1);

  const dispatchedCalls = sentMessages[0].msg.calls;
  const callNames = dispatchedCalls.map((c) => c.name);
  assert.ok(callNames.includes('grandFarmCoins'));
  assert.ok(callNames.includes('shopRefresh'));
  assert.ok(callNames.includes('shopBuy'));

  assert.equal(
    dispatchedCalls.some((c) => c.name === 'shopRefresh' && c.args?.shopId === 1),
    false
  );
  assert.equal(
    dispatchedCalls.some((c) => c.name === 'shopBuy' && c.args?.reward?.fragmentGear?.['96']),
    false
  );

  assert.equal(createdAlarms.length, 1);
  assert.equal(createdAlarms[0].name, AUTO_SHOP_ALARM_NAME);
  assert.equal(createdAlarms[0].info.when, futureRefreshSec * 1000 + 5000);
});

test('P3-11: SettingsTab, ShopModal, Daily Autopilot, and CONFIG_KEYS wiring', async () => {
  assert.equal(buildGrandFarmCoinsCall().name, 'grandFarmCoins');
  assert.ok(DEFAULT_DAILY_STEP_ORDER.includes('shop-favorites'));
  assert.ok(DAILY_STEP_LABELS['shop-favorites']);
  assert.ok(CONFIG_KEYS.includes('autoShopFavoritesEnabled'));

  const settingsVue = await readFile(resolve('src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsVue, /id="setting-auto-shop-favorites"/);

  const shopModalVue = await readFile(resolve('src/components/dialogs/ShopModal.vue'), 'utf8');
  assert.match(shopModalVue, /id="shop-collect-ga-coins-btn"/);

  const wake = computeNextAutoShopWakeAt(
    [{ shopId: 1, refreshTime: 1_900_000_000 }],
    [{ shopId: 1, itemKey: 'consumable:102', isEmerald: false }],
    [{ itemKey: 'consumable:102' }],
    {},
    1_899_990_000_000
  );
  assert.equal(wake, 1_900_000_000 * 1000 + 5000);
});
