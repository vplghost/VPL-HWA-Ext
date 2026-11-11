<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedCategory = ref('All');
const viewMode = ref<'grid' | 'list'>('grid');

const categories = [
  'All',
  'gear',
  'fragmentGear',
  'artifact',
  'fragmentArtifact',
  'scroll',
  'consumable',
  'coin',
];

interface InventoryEntry {
  id: string | number;
  category: string;
  name?: string;
  amount: number;
}

const arenaCoinAmount = computed(() => {
  return cache.value.inventoryGet?.data?.coin?.['1'] ?? 0;
});

const items = computed<InventoryEntry[]>(() => {
  const inventory = cache.value.inventoryGet?.data || {};
  const list: InventoryEntry[] = [];

  for (const [cat, map] of Object.entries(inventory)) {
    if (typeof map === 'object' && map !== null) {
      for (const [id, amount] of Object.entries(map as Record<string, any>)) {
        const count = Number(amount) || 0;
        if (count > 0) {
          list.push({
            id,
            category: cat,
            amount: count,
            name: `${cat} #${id}`,
          });
        }
      }
    }
  }

  return list;
});

const filteredItems = computed(() => {
  return items.value
    .filter((item) => {
      if (search.value) {
        const q = search.value.toLowerCase();
        if (!String(item.id).includes(q) && !(item.name || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      if (selectedCategory.value !== 'All' && item.category !== selectedCategory.value) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.amount - a.amount);
});

function getItemImgSrc(item: InventoryEntry): string {
  let path = '';
  if (item.category === 'fragmentHero') {
    path = `assets/heroes/${item.id}.png`;
  } else if (item.category === 'fragmentTitan') {
    path = `assets/titans/${item.id}.png`;
  } else if (item.category === 'gear' || item.category === 'fragmentGear') {
    path = `assets/items/gear/${item.id}.png`;
  } else if (item.category === 'consumable') {
    path = `assets/items/consumable/${item.id}.png`;
  } else if (item.category === 'scroll' || item.category === 'fragmentScroll') {
    path = `assets/items/scroll/${item.id}.png`;
  } else if (item.category === 'fragmentArtifact') {
    path = `assets/items/fragmentArtifact/${item.id}.png`;
  } else if (item.category === 'artifact') {
    path = `assets/items/artifact/${item.id}.png`;
  } else if (item.category === 'coin') {
    path = `assets/items/coin/${item.id}.png`;
  }

  if (path && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case 'gear':
    case 'fragmentGear':
      return '🛡️';
    case 'artifact':
    case 'fragmentArtifact':
      return '🔮';
    case 'scroll':
      return '📜';
    case 'consumable':
      return '🧪';
    case 'coin':
      return '🪙';
    default:
      return '📦';
  }
}

async function refreshInventory() {
  await dispatchRpc([{ name: 'inventoryGet' }]);
}
</script>

<template>
  <div class="space-y-3">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
      <div class="flex flex-wrap items-center gap-2 flex-1">
        <!-- Search -->
        <input
          v-model="search"
          type="search"
          placeholder="Search items by ID..."
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden w-48"
        />

        <!-- Category Filter -->
        <select
          v-model="selectedCategory"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
        >
          <option v-for="c in categories" :key="c" :value="c">
            {{ c }}
          </option>
        </select>

        <!-- View Mode -->
        <div class="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
          <button
            type="button"
            class="px-2 py-1 rounded transition-colors"
            :class="viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs' : 'text-slate-400'"
            @click="viewMode = 'grid'"
          >
            ▦ Grid
          </button>
          <button
            type="button"
            class="px-2 py-1 rounded transition-colors"
            :class="viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs' : 'text-slate-400'"
            @click="viewMode = 'list'"
          >
            ☰ List
          </button>
        </div>

        <!-- Arena Coin Badge -->
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
          title="Arena Coin (coin #1) - Distinct from Gold"
        >
          <span>🏆</span>
          <span>Arena Coins:</span>
          <span class="font-bold tabular-nums">{{ formatNumber(arenaCoinAmount) }}</span>
        </span>
      </div>

      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span>{{ filteredItems.length }} items</span>
        <button
          type="button"
          class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
          title="Refresh inventory"
          @click="refreshInventory"
        >
          ↻ Refresh
        </button>
      </div>
    </div>

    <!-- Items Grid View -->
    <div
      v-if="viewMode === 'grid'"
      class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2"
    >
      <div
        v-for="item in filteredItems"
        :key="`${item.category}-${item.id}`"
        class="relative aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-1 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all select-none group"
        :title="`${item.category} #${item.id}\nQuantity: ${formatNumber(item.amount)}`"
      >
        <img
          v-if="getItemImgSrc(item)"
          :src="getItemImgSrc(item)"
          :alt="item.name"
          class="size-full object-contain rounded-lg"
          loading="lazy"
        />
        <span v-else class="text-xl">
          {{ getCategoryIcon(item.category) }}
        </span>

        <!-- Quantity Pill -->
        <span class="absolute bottom-1 right-1 bg-slate-900/85 text-white text-[10px] font-mono px-1 rounded-sm tabular-nums">
          {{ formatNumber(item.amount) }}
        </span>
      </div>
    </div>

    <!-- Items List View -->
    <div
      v-else
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs"
    >
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-50 dark:bg-slate-800 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-700">
          <tr>
            <th class="p-2.5">Item</th>
            <th class="p-2.5">Category</th>
            <th class="p-2.5">ID</th>
            <th class="p-2.5 text-right">Quantity</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-for="item in filteredItems" :key="`${item.category}-${item.id}`" class="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
            <td class="p-2.5 flex items-center gap-2">
              <div class="size-7 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <img
                  v-if="getItemImgSrc(item)"
                  :src="getItemImgSrc(item)"
                  :alt="item.name"
                  class="size-full object-contain"
                  loading="lazy"
                />
                <span v-else>{{ getCategoryIcon(item.category) }}</span>
              </div>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ item.name }}</span>
            </td>
            <td class="p-2.5 text-slate-400">{{ item.category }}</td>
            <td class="p-2.5 font-mono text-slate-500">{{ item.id }}</td>
            <td class="p-2.5 text-right font-bold text-slate-700 dark:text-slate-200 tabular-nums">
              {{ formatNumber(item.amount) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

