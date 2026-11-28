/**
 * Pure In-Game Shop Service (`shopService.ts`).
 *
 * Verified against live capture `hwa-game-record-202611281051_shop.json` & `rpcCache.shopGetMany`:
 * - `shopGetMany` returns `{ [shopId]: { id, availableUntil, refreshTime, slots: { [slotId]: { id, reward, bought, cost, uniqId, buyRequirement } } } }`
 * - `shopBuy`: `{ shopId, slot, reward, amount: 1 }`
 * - `shopRefresh`: `{ shopId }` (STRICTLY free ONLY when `shop.refreshTime > 0 && nowSec >= shop.refreshTime`)
 * - Strict 0-Emerald guard: `cost.starmoney > 0` is blocked for auto/favorite buying.
 */

import { getItemName, getHeroName } from '../data/nameData.ts';
import { getItemIcon } from '../data/itemData.ts';
import { getHeroAvatar } from '../data/heroMetadata.ts';
import { getGold } from '../utils/resourceData.ts';

export interface ShopMeta {
  id: number;
  name: string;
  shortName: string;
  icon: string;
  currencyLabel: string;
}

export const SHOP_CATALOG: Record<number, ShopMeta> = {
  1: { id: 1, name: 'Merchant Shop', shortName: 'Merchant', icon: '🏪', currencyLabel: 'Gold' },
  4: { id: 4, name: 'Arena Shop', shortName: 'Arena', icon: '🏟️', currencyLabel: 'Arena Coin' },
  5: { id: 5, name: 'Grand Arena Shop', shortName: 'Grand Arena', icon: '🛡️', currencyLabel: 'GA Coin' },
  6: { id: 6, name: 'Tower Shop', shortName: 'Tower', icon: '🗼', currencyLabel: 'Tower Coin' },
  8: { id: 8, name: 'Outland Shop', shortName: 'Outland', icon: '🌋', currencyLabel: 'Outland Coin' },
  10: { id: 10, name: 'Highwaymen Shop', shortName: 'Highwaymen', icon: '🏴', currencyLabel: 'Highwaymen Coin' },
  11: { id: 11, name: 'Guild War Shop', shortName: 'Guild War', icon: '⚔️', currencyLabel: 'GW Coin' },
  13: { id: 13, name: 'Soul Shop', shortName: 'Soul', icon: '💎', currencyLabel: 'Soul Coin' },
  14: { id: 14, name: 'Hydra Shop', shortName: 'Hydra', icon: '🐉', currencyLabel: 'Hydra Coin' },
  15: { id: 15, name: 'Dungeon Shop', shortName: 'Dungeon', icon: '🏰', currencyLabel: 'Dungeon Coin' },
  16: { id: 16, name: 'Global Championship Shop', shortName: 'Championship', icon: '🏆', currencyLabel: 'GC Coin' },
  17: { id: 17, name: 'Frontier Shop', shortName: 'Frontier', icon: '🧭', currencyLabel: 'Frontier Coin' },
  1000: { id: 1000, name: 'Cinema Shop', shortName: 'Cinema', icon: '🎬', currencyLabel: 'Ticket' },
  1001: { id: 1001, name: 'Battle Pass Shop', shortName: 'Battle Pass', icon: '🎫', currencyLabel: 'BP Coin' },
};

export interface ParsedShop {
  shopId: number;
  name: string;
  shortName: string;
  icon: string;
  refreshTime: number;
  availableUntil: number;
  canFreeRefresh: boolean;
  refreshInSec: number;
  slotCount: number;
  unboughtCount: number;
  primaryCurrencyKey: string;
  primaryCurrencyLabel: string;
  primaryBalance: number | null;
}

export interface ParsedShopSlot {
  shopId: number;
  shopName: string;
  shopShortName: string;
  shopIcon: string;
  slotId: number;
  itemKey: string;
  rewardType: string;
  itemId: string;
  itemName: string;
  iconUrl: string;
  quantity: number;
  bought: boolean;
  costType: 'gold' | 'starmoney' | 'coin' | 'other';
  costId: string;
  currencyKey: string;
  costLabel: string;
  costAmount: number;
  isEmerald: boolean;
  balance: number | null;
  affordable: boolean;
  buyRequirement: any;
  rawReward: Record<string, Record<string, number>>;
  refreshTime: number;
  canFreeRefresh: boolean;
}

export interface ShopFavoriteRule {
  itemKey: string;
  shopIds?: number[];
  maxPrice?: number;
  enabled: boolean;
}

export function getShopMeta(shopId: number): ShopMeta {
  if (SHOP_CATALOG[shopId]) return SHOP_CATALOG[shopId];
  return {
    id: shopId,
    name: `Event Shop #${shopId}`,
    shortName: `Shop #${shopId}`,
    icon: '🎁',
    currencyLabel: 'Event Coin',
  };
}

/**
 * Strict 0-Emerald check: returns true if a shop slot costs Emeralds (`starmoney`).
 */
export function isEmeraldShopSlot(slot: any): boolean {
  const cost = slot?.cost;
  if (!cost || typeof cost !== 'object') return false;
  return Number(cost.starmoney || 0) > 0;
}

/**
 * Strict Free Refresh check:
 * `shopRefresh` is ONLY free when the shop's scheduled `refreshTime` is positive and has elapsed.
 * Calling `shopRefresh` when `nowSec < shop.refreshTime` spends Emeralds/Coins and MUST be blocked.
 */
export function canFreeRefreshShop(shop: any, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const rt = Number(shop?.refreshTime || 0);
  return Number.isFinite(rt) && rt > 0 && nowSec >= rt;
}

export function getShopCurrencyBalance(
  cache: Record<string, any> | null | undefined,
  costType: string,
  costId: string
): number | null {
  if (!cache || typeof cache !== 'object') return null;
  if (costType === 'gold') {
    const g = getGold(cache);
    return Number.isFinite(g) ? Number(g) : null;
  }
  if (costType === 'starmoney') {
    const sm = cache.userGetInfo?.data?.starMoney ?? cache['resource:starmoney']?.data?.amount;
    return Number.isFinite(Number(sm)) ? Number(sm) : null;
  }
  if (costType === 'coin' && costId) {
    const resEntry = cache[`resource:coin:${costId}`]?.data?.amount;
    if (Number.isFinite(Number(resEntry))) return Number(resEntry);
    const invCoin = cache.inventoryGet?.data?.coin?.[costId];
    if (Number.isFinite(Number(invCoin))) return Number(invCoin);
  }
  return null;
}

function resolveRewardInfo(reward: Record<string, any> | undefined): {
  rewardType: string;
  itemId: string;
  itemKey: string;
  quantity: number;
  itemName: string;
  iconUrl: string;
  rawReward: Record<string, Record<string, number>>;
} {
  if (!reward || typeof reward !== 'object') {
    return {
      rewardType: 'unknown',
      itemId: '0',
      itemKey: 'unknown:0',
      quantity: 1,
      itemName: 'Unknown Item',
      iconUrl: '',
      rawReward: {},
    };
  }

  for (const [rewardType, payload] of Object.entries(reward)) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const entries = Object.entries(payload);
      if (entries.length === 0) continue;
      const [itemId, rawQty] = entries[0];
      const quantity = Math.max(1, Number(rawQty) || 1);
      const itemKey = `${rewardType}:${itemId}`;
      const rawReward = { [rewardType]: { [itemId]: quantity } };

      if (rewardType === 'fragmentHero') {
        const heroName = getHeroName(Number(itemId)) || `Hero #${itemId}`;
        return {
          rewardType,
          itemId,
          itemKey,
          quantity,
          itemName: `${heroName} Soul Stone`,
          iconUrl: getHeroAvatar(Number(itemId)) || '',
          rawReward,
        };
      }

      const nameCategory =
        rewardType === 'fragmentGear' || rewardType === 'gear'
          ? 'gear'
          : rewardType === 'fragmentScroll' || rewardType === 'scroll'
            ? 'scroll'
            : rewardType;

      const resolvedName = getItemName(nameCategory, itemId) || getItemName(rewardType, itemId);
      const baseName = resolvedName || `${rewardType} #${itemId}`;
      const itemName =
        (rewardType === 'fragmentGear' || rewardType === 'fragmentScroll') && !String(baseName).includes('(Frag)')
          ? `${baseName} (Frag)`
          : String(baseName);
      const iconUrl = getItemIcon(rewardType, itemId) || getItemIcon(nameCategory, itemId) || '';
      return { rewardType, itemId, itemKey, quantity, itemName, iconUrl, rawReward };
    }
    if (typeof payload === 'number' || typeof payload === 'string') {
      const quantity = Math.max(1, Number(payload) || 1);
      const itemKey = `${rewardType}:0`;
      const itemName = rewardType === 'gold' ? 'Gold' : rewardType;
      return {
        rewardType,
        itemId: '0',
        itemKey,
        quantity,
        itemName,
        iconUrl: '',
        rawReward: { [rewardType]: { '0': quantity } },
      };
    }
  }

  return {
    rewardType: 'unknown',
    itemId: '0',
    itemKey: 'unknown:0',
    quantity: 1,
    itemName: 'Unknown Item',
    iconUrl: '',
    rawReward: {},
  };
}

function resolveCostInfo(cost: Record<string, any> | undefined): {
  costType: 'gold' | 'starmoney' | 'coin' | 'other';
  costId: string;
  currencyKey: string;
  costLabel: string;
  costAmount: number;
  isEmerald: boolean;
} {
  if (!cost || typeof cost !== 'object') {
    return { costType: 'other', costId: '', currencyKey: 'other', costLabel: 'Free', costAmount: 0, isEmerald: false };
  }
  if (Number(cost.starmoney || 0) > 0) {
    return {
      costType: 'starmoney',
      costId: 'starmoney',
      currencyKey: 'starmoney',
      costLabel: 'Emeralds',
      costAmount: Number(cost.starmoney),
      isEmerald: true,
    };
  }
  if (Number(cost.gold || 0) > 0) {
    return {
      costType: 'gold',
      costId: 'gold',
      currencyKey: 'gold',
      costLabel: 'Gold',
      costAmount: Number(cost.gold),
      isEmerald: false,
    };
  }
  if (cost.coin && typeof cost.coin === 'object') {
    const entries = Object.entries(cost.coin);
    if (entries.length > 0) {
      const [coinId, amount] = entries[0];
      const coinName = getItemName('coin', coinId) || `Coin #${coinId}`;
      return {
        costType: 'coin',
        costId: coinId,
        currencyKey: `coin:${coinId}`,
        costLabel: String(coinName),
        costAmount: Number(amount) || 0,
        isEmerald: false,
      };
    }
  }
  const firstKey = Object.keys(cost)[0] || 'other';
  return {
    costType: 'other',
    costId: firstKey,
    currencyKey: firstKey,
    costLabel: firstKey,
    costAmount: Number(cost[firstKey]) || 0,
    isEmerald: false,
  };
}

function resolveDynamicShopMeta(
  shopId: number,
  rawSlots: Array<[string, any]>,
  cache?: Record<string, any> | null
): ShopMeta & { primaryCurrencyKey: string; primaryCurrencyLabel: string; primaryBalance: number | null } {
  // Determine dominant non-Emerald currency across slots
  const currencyCounts = new Map<string, { count: number; type: 'gold' | 'coin' | 'starmoney' | 'other'; id: string; label: string }>();
  for (const [, rawSlot] of rawSlots) {
    const cost = resolveCostInfo(rawSlot?.cost);
    if (cost.isEmerald) continue;
    const prev = currencyCounts.get(cost.currencyKey);
    if (prev) prev.count++;
    else currencyCounts.set(cost.currencyKey, { count: 1, type: cost.costType, id: cost.costId, label: cost.costLabel });
  }
  const primary = [...currencyCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const primaryCurrencyKey = primary?.[0] || '';
  const primaryCurrencyLabel = primary?.[1]?.label || '';
  const primaryBalance = primary ? getShopCurrencyBalance(cache, primary[1].type, primary[1].id) : null;

  if (SHOP_CATALOG[shopId]) {
    const base = SHOP_CATALOG[shopId];
    return {
      ...base,
      primaryCurrencyKey,
      primaryCurrencyLabel: primaryCurrencyLabel || base.currencyLabel,
      primaryBalance,
    };
  }

  // Check active questEvents for explicit shop/event title match
  const events = cache?.questEvents?.data?.events;
  if (Array.isArray(events)) {
    const matchedEvent = events.find(
      (ev: any) =>
        ev &&
        (Number(ev.shopId) === shopId ||
          (primary?.[1]?.type === 'coin' &&
            (String(ev.coinId ?? '') === primary[1].id ||
              String(ev.exchangeRule?.coinId ?? '') === primary[1].id)))
    );
    const evTitle = matchedEvent?.title || matchedEvent?.name;
    if (typeof evTitle === 'string' && evTitle.trim()) {
      const clean = evTitle.trim();
      return {
        id: shopId,
        name: /shop/i.test(clean) ? clean : `${clean} Shop`,
        shortName: clean.replace(/\s+Shop$/i, ''),
        icon: '🎉',
        currencyLabel: primaryCurrencyLabel || 'Event Coin',
        primaryCurrencyKey,
        primaryCurrencyLabel: primaryCurrencyLabel || 'Event Coin',
        primaryBalance,
      };
    }
  }

  // Derive clean event shop name from its real primary coin name (e.g., "Adventure Coin" -> "Adventure Shop")
  if (primaryCurrencyLabel && !/^Coin #\d+$/.test(primaryCurrencyLabel)) {
    const stem = primaryCurrencyLabel.replace(/\s+(Coin|Coins|Trophy|Trophies)$/i, '').trim() || primaryCurrencyLabel;
    return {
      id: shopId,
      name: /shop/i.test(stem) ? stem : `${stem} Shop`,
      shortName: stem,
      icon: '🎁',
      currencyLabel: primaryCurrencyLabel,
      primaryCurrencyKey,
      primaryCurrencyLabel,
      primaryBalance,
    };
  }

  return {
    ...getShopMeta(shopId),
    primaryCurrencyKey,
    primaryCurrencyLabel: primaryCurrencyLabel || 'Event Coin',
    primaryBalance,
  };
}

/**
 * Flattens all shops from `rpcCache.shopGetMany.data` into a unified catalog + slot list.
 */
export function parseShopCatalog(
  shopGetManyData: Record<string, any> | null | undefined,
  cache?: Record<string, any> | null,
  nowSec = Math.floor(Date.now() / 1000)
): { shops: ParsedShop[]; slots: ParsedShopSlot[]; freeRefreshCount: number } {
  if (!shopGetManyData || typeof shopGetManyData !== 'object') {
    return { shops: [], slots: [], freeRefreshCount: 0 };
  }

  const shops: ParsedShop[] = [];
  const slots: ParsedShopSlot[] = [];

  const shopEntries = Object.entries(shopGetManyData)
    .map(([key, shop]) => ({ shopId: Number(shop?.id ?? key), shop }))
    .filter((x) => Number.isFinite(x.shopId) && x.shopId > 0 && x.shop && typeof x.shop === 'object')
    .sort((a, b) => a.shopId - b.shopId);

  for (const { shopId, shop } of shopEntries) {
    const rawSlots = shop.slots && typeof shop.slots === 'object' ? Object.entries(shop.slots) : [];
    const meta = resolveDynamicShopMeta(shopId, rawSlots, cache);
    const refreshTime = Number(shop.refreshTime || 0);
    const availableUntil = Number(shop.availableUntil || 0);
    const canFreeRefresh = canFreeRefreshShop(shop, nowSec);
    const refreshInSec = refreshTime > nowSec ? refreshTime - nowSec : 0;

    let unboughtCount = 0;

    for (const [slotKey, rawSlot] of rawSlots) {
      if (!rawSlot || typeof rawSlot !== 'object') continue;
      const slotId = Number((rawSlot as any).id ?? slotKey);
      if (!Number.isFinite(slotId) || slotId <= 0) continue;

      const bought = Number((rawSlot as any).bought || 0) > 0;
      if (!bought) unboughtCount++;

      const rew = resolveRewardInfo((rawSlot as any).reward);
      const cost = resolveCostInfo((rawSlot as any).cost);
      const balance = getShopCurrencyBalance(cache, cost.costType, cost.costId);
      const affordable = balance == null ? true : balance >= cost.costAmount;

      slots.push({
        shopId,
        shopName: meta.name,
        shopShortName: meta.shortName,
        shopIcon: meta.icon,
        slotId,
        itemKey: rew.itemKey,
        rewardType: rew.rewardType,
        itemId: rew.itemId,
        itemName: rew.itemName,
        iconUrl: rew.iconUrl,
        quantity: rew.quantity,
        bought,
        costType: cost.costType,
        costId: cost.costId,
        currencyKey: cost.currencyKey,
        costLabel: cost.costLabel,
        costAmount: cost.costAmount,
        isEmerald: cost.isEmerald,
        balance,
        affordable,
        buyRequirement: (rawSlot as any).buyRequirement ?? null,
        rawReward: rew.rawReward,
        refreshTime,
        canFreeRefresh,
      });
    }

    shops.push({
      shopId,
      name: meta.name,
      shortName: meta.shortName,
      icon: meta.icon,
      refreshTime,
      availableUntil,
      canFreeRefresh,
      refreshInSec,
      slotCount: rawSlots.length,
      unboughtCount,
      primaryCurrencyKey: meta.primaryCurrencyKey,
      primaryCurrencyLabel: meta.primaryCurrencyLabel,
      primaryBalance: meta.primaryBalance,
    });
  }

  const freeRefreshCount = shops.filter((s) => s.canFreeRefresh).length;
  return { shops, slots, freeRefreshCount };
}

export function buildShopBuyCall(slot: ParsedShopSlot) {
  return {
    name: 'shopBuy',
    args: {
      shopId: slot.shopId,
      slot: slot.slotId,
      reward: slot.rawReward,
      amount: 1,
    },
  };
}

export function buildShopRefreshCall(shopId: number) {
  return {
    name: 'shopRefresh',
    args: { shopId },
  };
}

function matchesFavoriteRule(slot: ParsedShopSlot, rule: ShopFavoriteRule): boolean {
  if (!rule || rule.enabled === false) return false;
  if (rule.itemKey !== slot.itemKey) return false;
  if (Array.isArray(rule.shopIds) && rule.shopIds.length > 0 && !rule.shopIds.includes(slot.shopId)) {
    return false;
  }
  if (rule.maxPrice != null && Number.isFinite(rule.maxPrice) && slot.costAmount > rule.maxPrice) {
    return false;
  }
  return true;
}

/**
 * P2-44: Plans an ordered batch of unbought, non-Emerald, affordable favorite shop slots
 * while deducting projected currency balances and respecting optional currency reserves.
 */
export function planFavoriteShopPurchases(
  slots: ParsedShopSlot[],
  favorites: ShopFavoriteRule[] | Record<string, ShopFavoriteRule>,
  balances: Record<string, number>,
  reserves: Record<string, number> = {}
): {
  plan: ParsedShopSlot[];
  skippedInsufficient: ParsedShopSlot[];
  projectedBalances: Record<string, number>;
} {
  const rules = Array.isArray(favorites) ? favorites : Object.values(favorites || {});
  const projectedBalances: Record<string, number> = { ...balances };
  const plan: ParsedShopSlot[] = [];
  const skippedInsufficient: ParsedShopSlot[] = [];

  for (const slot of slots) {
    if (slot.bought || slot.isEmerald || slot.buyRequirement != null) continue;
    const matched = rules.some((rule) => matchesFavoriteRule(slot, rule));
    if (!matched) continue;

    const key = slot.currencyKey;
    const currentBal = projectedBalances[key] ?? slot.balance;
    const reserve = Math.max(0, Number(reserves[key] || 0));

    if (currentBal == null) {
      plan.push(slot);
      continue;
    }

    if (currentBal - slot.costAmount >= reserve) {
      projectedBalances[key] = currentBal - slot.costAmount;
      plan.push(slot);
    } else {
      skippedInsufficient.push(slot);
    }
  }

  return { plan, skippedInsufficient, projectedBalances };
}

/**
 * P2-44: Returns shop IDs that have at least 1 bought favorite slot AND are eligible for FREE refresh
 * (`refreshTime > 0 && nowSec >= refreshTime`). Never returns paid-refresh shops.
 */
export function findFreeRenewableFavoriteShops(
  shops: ParsedShop[],
  slots: ParsedShopSlot[],
  favorites: ShopFavoriteRule[] | Record<string, ShopFavoriteRule>,
  nowSec = Math.floor(Date.now() / 1000)
): number[] {
  const rules = Array.isArray(favorites) ? favorites : Object.values(favorites || {});
  if (rules.length === 0) return [];

  const renewable: number[] = [];
  for (const shop of shops) {
    if (!canFreeRefreshShop(shop, nowSec)) continue;
    const hasBoughtFavorite = slots.some(
      (slot) =>
        slot.shopId === shop.shopId &&
        slot.bought &&
        !slot.isEmerald &&
        rules.some((rule) => matchesFavoriteRule(slot, rule))
    );
    if (hasBoughtFavorite) {
      renewable.push(shop.shopId);
    }
  }
  return renewable;
}

export function formatShopCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
