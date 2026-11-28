<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useShopFavorites } from '@/src/composables/useShopFavorites';
import { formatNumber } from '@/src/utils/formatters';
import {
  parseShopCatalog,
  canFreeRefreshShop,
  buildShopBuyCall,
  buildShopRefreshCall,
  planFavoriteShopPurchases,
  findFreeRenewableFavoriteShops,
  formatShopCountdown,
  type ParsedShopSlot,
} from '@/src/services/shopService';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { favoritesMap, favoriteList, favoriteCount, reserves, isFavorite, toggleFavorite } = useShopFavorites();

const nowSec = ref(Math.floor(Date.now() / 1000));
let clockTimer: number | null = null;

const selectedShopId = ref<number | 'all'>('all');
const searchQuery = ref('');
const hideEmerald = ref(true);
const affordableOnly = ref(false);
const availableOnly = ref(false);
const favoritesOnly = ref(false);
const autoFreeRenewAfterBuy = ref(true);

const isBusy = ref(false);
const isRefreshingAll = ref(false);
const busySlotKey = ref<string | null>(null);
const statusMessage = ref('');
const errorMessage = ref('');

const catalog = computed(() => parseShopCatalog(cache.value?.shopGetMany?.data, cache.value, nowSec.value));

const filteredSlots = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return catalog.value.slots.filter((slot) => {
    if (selectedShopId.value !== 'all' && slot.shopId !== selectedShopId.value) return false;
    if (hideEmerald.value && slot.isEmerald) return false;
    if (availableOnly.value && slot.bought) return false;
    if (affordableOnly.value && !slot.affordable) return false;
    if (favoritesOnly.value && !isFavorite(slot.itemKey)) return false;
    if (q) {
      const hay = `${slot.itemName} ${slot.shopName} ${slot.costLabel} ${slot.itemKey}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const currentBalances = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  for (const slot of catalog.value.slots) {
    if (slot.balance != null && !(slot.currencyKey in map)) {
      map[slot.currencyKey] = slot.balance;
    }
  }
  return map;
});

const favoriteBuyPlan = computed(() =>
  planFavoriteShopPurchases(catalog.value.slots, favoritesMap.value, currentBalances.value, reserves.value)
);

const freeRenewableShopIds = computed(() =>
  findFreeRenewableFavoriteShops(catalog.value.shops, catalog.value.slots, favoritesMap.value, nowSec.value)
);

const selectedShopObj = computed(() =>
  selectedShopId.value === 'all'
    ? null
    : catalog.value.shops.find((s) => s.shopId === selectedShopId.value) || null
);

function slotUid(slot: ParsedShopSlot): string {
  return `${slot.shopId}:${slot.slotId}`;
}

async function refreshAllShops() {
  if (isRefreshingAll.value) return;
  isRefreshingAll.value = true;
  errorMessage.value = '';
  try {
    const knownIds = catalog.value.shops.map((s) => s.shopId);
    const shopIds = knownIds.length > 0 ? knownIds : [1, 4, 5, 6, 8, 10, 11, 13, 14, 15, 16, 17];
    const res = await dispatchRpc([{ name: 'shopGetMany', args: { shopIds } }]);
    if (res?.ok === false && res?.error) {
      errorMessage.value = String(res.error);
    } else {
      statusMessage.value = `Refreshed ${shopIds.length} shops.`;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
  } finally {
    isRefreshingAll.value = false;
  }
}

async function handleBuySlot(slot: ParsedShopSlot) {
  if (isBusy.value || slot.bought || slot.isEmerald) return;
  if (!slot.affordable) {
    errorMessage.value = `Not enough ${slot.costLabel} (${formatNumber(slot.balance ?? 0)} / ${formatNumber(slot.costAmount)}).`;
    return;
  }
  isBusy.value = true;
  busySlotKey.value = slotUid(slot);
  errorMessage.value = '';
  try {
    const res = await dispatchRpc([buildShopBuyCall(slot)]);
    if (res?.ok === false && res?.error) {
      errorMessage.value = String(res.error);
    } else {
      statusMessage.value = `Bought ${slot.itemName} ×${slot.quantity} from ${slot.shopShortName}.`;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
  } finally {
    isBusy.value = false;
    busySlotKey.value = null;
  }
}

async function handleFreeRefreshShop(shopId: number) {
  const shop = catalog.value.shops.find((s) => s.shopId === shopId);
  if (!shop || !canFreeRefreshShop(shop, nowSec.value)) {
    errorMessage.value = 'Shop is not eligible for free refresh yet (paid refresh blocked).';
    return;
  }
  isBusy.value = true;
  errorMessage.value = '';
  try {
    const res = await dispatchRpc([buildShopRefreshCall(shopId)]);
    if (res?.ok === false && res?.error) {
      errorMessage.value = String(res.error);
    } else {
      statusMessage.value = `Free-refreshed ${shop.name}.`;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
  } finally {
    isBusy.value = false;
  }
}

async function handleRenewFavoriteShops() {
  const ids = [...freeRenewableShopIds.value];
  if (isBusy.value || ids.length === 0) return;
  isBusy.value = true;
  errorMessage.value = '';
  let renewed = 0;
  try {
    for (const shopId of ids) {
      const shop = catalog.value.shops.find((s) => s.shopId === shopId);
      if (!shop || !canFreeRefreshShop(shop, Math.floor(Date.now() / 1000))) continue;
      const res = await dispatchRpc([buildShopRefreshCall(shopId)]);
      if (res?.ok === false && res?.error) {
        errorMessage.value = String(res.error);
        break;
      }
      renewed++;
    }
    statusMessage.value = renewed > 0 ? `Free-renewed ${renewed} shop(s).` : 'No shops eligible for free renew.';
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
  } finally {
    isBusy.value = false;
  }
}

async function handleBuyAllFavorites() {
  if (isBusy.value) return;
  const initialPlan = favoriteBuyPlan.value.plan;
  if (initialPlan.length === 0 && (!autoFreeRenewAfterBuy.value || freeRenewableShopIds.value.length === 0)) {
    statusMessage.value = 'No affordable favorite items available right now.';
    return;
  }

  isBusy.value = true;
  errorMessage.value = '';
  let boughtTotal = 0;
  let renewedTotal = 0;
  try {
    const touchedShops = new Set<number>();
    for (const slot of initialPlan) {
      if (slot.isEmerald || slot.bought) continue;
      busySlotKey.value = slotUid(slot);
      const res = await dispatchRpc([buildShopBuyCall(slot)]);
      if (res?.ok === false && res?.error) {
        errorMessage.value = String(res.error);
        break;
      }
      boughtTotal++;
      touchedShops.add(slot.shopId);
    }

    if (autoFreeRenewAfterBuy.value && !errorMessage.value) {
      const renewableNow = findFreeRenewableFavoriteShops(
        catalog.value.shops,
        catalog.value.slots,
        favoritesMap.value,
        Math.floor(Date.now() / 1000)
      );
      for (const shopId of renewableNow) {
        const res = await dispatchRpc([buildShopRefreshCall(shopId)]);
        if (res?.ok === false && res?.error) {
          errorMessage.value = String(res.error);
          break;
        }
        renewedTotal++;
      }
      if (renewedTotal > 0 && !errorMessage.value) {
        const secondCatalog = parseShopCatalog(cache.value?.shopGetMany?.data, cache.value, Math.floor(Date.now() / 1000));
        const secondBalances: Record<string, number> = {};
        for (const s of secondCatalog.slots) {
          if (s.balance != null && !(s.currencyKey in secondBalances)) secondBalances[s.currencyKey] = s.balance;
        }
        const secondPlan = planFavoriteShopPurchases(secondCatalog.slots, favoritesMap.value, secondBalances, reserves.value).plan;
        for (const slot of secondPlan) {
          if (slot.isEmerald || slot.bought) continue;
          busySlotKey.value = slotUid(slot);
          const res = await dispatchRpc([buildShopBuyCall(slot)]);
          if (res?.ok === false && res?.error) {
            errorMessage.value = String(res.error);
            break;
          }
          boughtTotal++;
        }
      }
    }

    const parts: string[] = [];
    if (boughtTotal > 0) parts.push(`Bought ${boughtTotal} favorite(s)`);
    if (renewedTotal > 0) parts.push(`free-renewed ${renewedTotal} shop(s)`);
    statusMessage.value = parts.length > 0 ? `${parts.join(' · ')}.` : 'Nothing bought.';
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
  } finally {
    isBusy.value = false;
    busySlotKey.value = null;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      nowSec.value = Math.floor(Date.now() / 1000);
      errorMessage.value = '';
    }
  }
);

onMounted(() => {
  clockTimer = window.setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="In-Game Shops"
    icon="🛒"
    max-width="max-w-5xl"
    modal-name="shop"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div id="shop-dialog-content" class="space-y-3">
      <!-- Top Filter Bar -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
          <input
            id="shop-search-input"
            v-model="searchQuery"
            type="text"
            placeholder="Search item, hero, or shop..."
            class="flex-1 min-w-[160px] max-w-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
          />

          <button
            id="shop-filter-favorites"
            type="button"
            class="cursor-pointer px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors"
            :class="
              favoritesOnly
                ? 'bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400'
            "
            @click="favoritesOnly = !favoritesOnly"
          >
            ⭐ Favorites ({{ favoriteCount }})
          </button>

          <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input id="shop-hide-emerald" v-model="hideEmerald" type="checkbox" class="rounded border-slate-300 text-amber-600" />
            <span>Hide Emerald</span>
          </label>
          <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input id="shop-affordable-only" v-model="affordableOnly" type="checkbox" class="rounded border-slate-300 text-amber-600" />
            <span>Affordable</span>
          </label>
          <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input id="shop-available-only" v-model="availableOnly" type="checkbox" class="rounded border-slate-300 text-amber-600" />
            <span>Available</span>
          </label>
        </div>

        <button
          id="btn-shop-refresh-all"
          type="button"
          :disabled="isRefreshingAll || isBusy"
          class="cursor-pointer px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50"
          title="Refresh all shops from game (shopGetMany)"
          @click="refreshAllShops"
        >
          {{ isRefreshingAll ? 'Refreshing...' : '↻ Refresh Shops' }}
        </button>
      </div>

      <!-- Shop Filter Pills -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
          :class="
            selectedShopId === 'all'
              ? 'bg-slate-800 text-white border-slate-800 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
          "
          @click="selectedShopId = 'all'"
        >
          All Shops ({{ catalog.shops.length }})
        </button>
        <button
          v-for="shop in catalog.shops"
          :key="shop.shopId"
          type="button"
          class="relative cursor-pointer px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1"
          :class="
            selectedShopId === shop.shopId
              ? 'bg-slate-800 text-white border-slate-800 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
              : 'bg-white dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
          "
          :title="shop.canFreeRefresh ? `${shop.name} · Free Refresh Ready!` : (shop.refreshInSec > 0 ? `${shop.name} · Resets in ${formatShopCountdown(shop.refreshInSec)}` : shop.name)"
          @click="selectedShopId = shop.shopId"
        >
          <span>{{ shop.icon }}</span>
          <span>{{ shop.shortName }}</span>
          <span
            v-if="shop.canFreeRefresh"
            class="size-1.5 rounded-full bg-emerald-500"
          />
        </button>
      </div>

      <!-- Selected Shop Free Refresh Banner -->
      <div
        v-if="selectedShopObj"
        class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
      >
        <div class="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
          <span>{{ selectedShopObj.icon }} {{ selectedShopObj.name }}</span>
          <span class="text-[11px] font-normal text-slate-500">
            {{ selectedShopObj.unboughtCount }}/{{ selectedShopObj.slotCount }} available
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="!selectedShopObj.canFreeRefresh && selectedShopObj.refreshInSec > 0" class="text-[11px] font-mono text-slate-500">
            Resets in {{ formatShopCountdown(selectedShopObj.refreshInSec) }}
          </span>
          <button
            v-if="selectedShopObj.canFreeRefresh"
            type="button"
            :disabled="isBusy"
            class="cursor-pointer px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold disabled:opacity-50"
            @click="handleFreeRefreshShop(selectedShopObj.shopId)"
          >
            🔄 Free Refresh
          </button>
        </div>
      </div>

      <!-- Unified Items Grid -->
      <div
        v-if="filteredSlots.length > 0"
        id="shop-items-grid"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
      >
        <div
          v-for="slot in filteredSlots"
          :key="slotUid(slot)"
          class="rounded-xl border p-2.5 flex flex-col justify-between gap-2 transition-colors"
          :class="
            slot.bought
              ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800 opacity-65'
              : isFavorite(slot.itemKey)
                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          "
        >
          <div class="flex items-start gap-2.5">
            <div class="size-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
              <img v-if="slot.iconUrl" :src="slot.iconUrl" :alt="slot.itemName" class="size-full object-cover" loading="lazy" />
              <span v-else class="text-base">{{ slot.shopIcon }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-1">
                <span class="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate" :title="slot.itemName">
                  {{ slot.itemName }}
                </span>
                <button
                  type="button"
                  class="cursor-pointer shrink-0 text-sm leading-none hover:scale-110 transition-transform"
                  :class="isFavorite(slot.itemKey) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'"
                  :title="isFavorite(slot.itemKey) ? 'Remove from favorites' : 'Add to favorites'"
                  @click="toggleFavorite(slot.itemKey)"
                >
                  {{ isFavorite(slot.itemKey) ? '★' : '☆' }}
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200">×{{ formatNumber(slot.quantity) }}</span>
                <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {{ slot.shopIcon }} {{ slot.shopShortName }}
                </span>
                <span v-if="slot.isEmerald" class="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold">
                  💎 Emerald Blocked
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <div class="text-[11px] font-mono" :class="slot.affordable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
              <span class="font-bold">{{ formatNumber(slot.costAmount) }}</span>
              <span class="text-slate-500 dark:text-slate-400 ml-1">{{ slot.costLabel }}</span>
            </div>

            <span v-if="slot.bought" class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Bought ✓
            </span>
            <button
              v-else
              type="button"
              :disabled="isBusy || slot.isEmerald || !slot.affordable || slot.buyRequirement != null"
              class="cursor-pointer px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              :title="slot.isEmerald ? 'Emerald purchases are blocked for safety' : (slot.affordable ? `Buy ${slot.itemName}` : `Insufficient ${slot.costLabel}`)"
              @click="handleBuySlot(slot)"
            >
              {{ busySlotKey === slotUid(slot) ? '...' : 'Buy' }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="py-10 text-center text-xs text-slate-400">
        {{ catalog.shops.length === 0 ? 'No shop data captured yet. Click "Refresh Shops" or open any shop in game.' : 'No items match the current filters.' }}
      </div>
    </div>

    <template #footer>
      <div id="shop-dialog-footer" class="w-full flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-col gap-0.5 min-w-0 max-w-[52%]">
          <div class="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span>{{ favoriteBuyPlan.plan.length }} fav ready · {{ freeRenewableShopIds.length }} free renew</span>
            <label class="inline-flex items-center gap-1 cursor-pointer text-[10px] text-slate-500 dark:text-slate-400">
              <input v-model="autoFreeRenewAfterBuy" type="checkbox" class="rounded border-slate-300 text-amber-600" />
              <span>Auto free-renew</span>
            </label>
          </div>
          <span v-if="errorMessage" class="text-[11px] text-rose-600 dark:text-rose-400 truncate">⚠️ {{ errorMessage }}</span>
          <span v-else-if="statusMessage" class="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{{ statusMessage }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2 ml-auto">
          <button
            id="btn-shop-renew-favorites"
            type="button"
            :disabled="isBusy || freeRenewableShopIds.length === 0"
            class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Free-refresh shops that have bought favorite items and elapsed reset timers"
            @click="handleRenewFavoriteShops"
          >
            🔄 Free Renew ({{ freeRenewableShopIds.length }})
          </button>
          <button
            id="btn-shop-buy-favorites"
            type="button"
            :disabled="isBusy || (favoriteBuyPlan.plan.length === 0 && (!autoFreeRenewAfterBuy || freeRenewableShopIds.length === 0))"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Buy all affordable non-Emerald favorite items across all shops"
            @click="handleBuyAllFavorites"
          >
            ⭐ Buy All Favorites ({{ favoriteBuyPlan.plan.length }})
          </button>
        </div>
      </div>
    </template>
  </ModalDialog>
</template>
