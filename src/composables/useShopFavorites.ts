import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ShopFavoriteRule } from '../services/shopService.ts';

export const SHOP_FAVORITES_STORAGE_KEY = 'shopFavorites';
export const SHOP_RESERVES_STORAGE_KEY = 'shopCurrencyReserves';

export function useShopFavorites() {
  const favoritesMap = ref<Record<string, ShopFavoriteRule>>({});
  const reserves = ref<Record<string, number>>({});
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if (SHOP_FAVORITES_STORAGE_KEY in stored) {
      const raw = stored[SHOP_FAVORITES_STORAGE_KEY];
      favoritesMap.value = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }
    if (SHOP_RESERVES_STORAGE_KEY in stored) {
      const raw = stored[SHOP_RESERVES_STORAGE_KEY];
      reserves.value = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    }
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area !== 'local') return;
    if (SHOP_FAVORITES_STORAGE_KEY in changes || SHOP_RESERVES_STORAGE_KEY in changes) {
      revision++;
      const patch: Record<string, any> = {};
      if (SHOP_FAVORITES_STORAGE_KEY in changes) patch[SHOP_FAVORITES_STORAGE_KEY] = changes[SHOP_FAVORITES_STORAGE_KEY].newValue;
      if (SHOP_RESERVES_STORAGE_KEY in changes) patch[SHOP_RESERVES_STORAGE_KEY] = changes[SHOP_RESERVES_STORAGE_KEY].newValue;
      consume(patch);
    }
  }

  async function persistFavorites() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ [SHOP_FAVORITES_STORAGE_KEY]: { ...favoritesMap.value } });
    }
  }

  async function persistReserves() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ [SHOP_RESERVES_STORAGE_KEY]: { ...reserves.value } });
    }
  }

  function isFavorite(itemKey: string): boolean {
    return Boolean(favoritesMap.value[itemKey]?.enabled);
  }

  async function toggleFavorite(itemKey: string) {
    if (!itemKey) return;
    const next = { ...favoritesMap.value };
    if (next[itemKey]?.enabled) {
      delete next[itemKey];
    } else {
      next[itemKey] = { itemKey, enabled: true };
    }
    favoritesMap.value = next;
    await persistFavorites();
  }

  async function setReserve(currencyKey: string, amount: number) {
    const val = Math.max(0, Math.floor(Number(amount) || 0));
    reserves.value = { ...reserves.value, [currencyKey]: val };
    await persistReserves();
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage?.onChanged?.addListener?.(onStorageChanged);
    const started = revision;
    const stored = await chrome.storage?.local?.get?.([SHOP_FAVORITES_STORAGE_KEY, SHOP_RESERVES_STORAGE_KEY]);
    if (revision === started && stored) consume(stored);
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined') {
      chrome.storage?.onChanged?.removeListener?.(onStorageChanged);
    }
  });

  return {
    favoritesMap,
    favoriteList: computed(() => Object.values(favoritesMap.value).filter((r) => r?.enabled)),
    favoriteCount: computed(() => Object.values(favoritesMap.value).filter((r) => r?.enabled).length),
    reserves,
    isFavorite,
    toggleFavorite,
    setReserve,
  };
}
