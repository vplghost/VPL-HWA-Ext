<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getItemName, downloadJson } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedCategory = ref('All');
const viewMode = ref<'grid' | 'table'>('grid');
const isRefreshing = ref(false);

const categories = [
  'All',
  'gear',
  'fragmentGear',
  'artifact',
  'fragmentArtifact',
  'scroll',
  'consumable',
  'coin',
  'fragmentHero',
  'fragmentTitan',
];

interface InventoryEntry {
  id: string | number;
  category: string;
  name: string;
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
            name: getItemName(cat, id),
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
        const q = search.value.toLowerCase().trim();
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

// Category sections grouping
interface CategorySection {
  category: string;
  label: string;
  icon: string;
  items: InventoryEntry[];
}

const categoryLabels: Record<string, { label: string; icon: string }> = {
  gear: { label: 'Equipment & Gear', icon: '🛡️' },
  fragmentGear: { label: 'Gear Fragments', icon: '🧩' },
  artifact: { label: 'Artifacts', icon: '🔮' },
  fragmentArtifact: { label: 'Artifact Fragments', icon: '✨' },
  scroll: { label: 'Recipe Scrolls', icon: '📜' },
  consumable: { label: 'Consumables & Potions', icon: '🧪' },
  coin: { label: 'Coins & Tokens', icon: '🪙' },
  fragmentHero: { label: 'Hero Soul Stones', icon: '💎' },
  fragmentTitan: { label: 'Titan Soul Stones', icon: '🗿' },
};

const categorizedSections = computed<CategorySection[]>(() => {
  if (selectedCategory.value !== 'All') {
    const meta = categoryLabels[selectedCategory.value] || { label: selectedCategory.value, icon: '📦' };
    return [
      {
        category: selectedCategory.value,
        label: meta.label,
        icon: meta.icon,
        items: filteredItems.value,
      },
    ];
  }

  // Group by category order
  const order = [
    'gear',
    'fragmentGear',
    'artifact',
    'fragmentArtifact',
    'scroll',
    'consumable',
    'coin',
    'fragmentHero',
    'fragmentTitan',
  ];

  const map = new Map<string, InventoryEntry[]>();
  for (const item of filteredItems.value) {
    if (!map.has(item.category)) {
      map.set(item.category, []);
    }
    map.get(item.category)!.push(item);
  }

  const sections: CategorySection[] = [];
  for (const cat of order) {
    const list = map.get(cat);
    if (list && list.length > 0) {
      const meta = categoryLabels[cat] || { label: cat, icon: '📦' };
      sections.push({
        category: cat,
        label: meta.label,
        icon: meta.icon,
        items: list,
      });
      map.delete(cat);
    }
  }

  // Any remaining categories
  for (const [cat, list] of map.entries()) {
    if (list.length > 0) {
      sections.push({
        category: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        icon: '📦',
        items: list,
      });
    }
  }

  return sections;
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
  return categoryLabels[cat]?.icon || '📦';
}

async function refreshInventory() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'inventoryGet' }]);
  } finally {
    isRefreshing.value = false;
  }
}

function exportItemsJson() {
  const popupData = (globalThis as any).hwaHelperPopupData;
  const exported = popupData?.exportTableData?.(
    'items',
    cache.value,
    search.value,
    selectedCategory.value === 'All' ? '' : selectedCategory.value
  );

  if (Array.isArray(exported) && exported.length > 0) {
    downloadJson('hwa-inventory.json', exported);
  } else {
    // Fallback to formatted filteredItems
    const fallback = filteredItems.value.map((i) => ({
      group: i.category,
      id: Number(i.id) || i.id,
      name: i.name,
      amount: i.amount,
    }));
    downloadJson('hwa-inventory.json', fallback);
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Filter & Action Toolbar -->
    <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <!-- Left Controls: Search + Category + Arena Badge -->
      <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <!-- Search input -->
        <div class="relative w-full sm:w-48 xl:w-56 shrink-0">
          <input
            v-model="search"
            type="search"
            placeholder="Search items by name or ID..."
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <!-- Category Filter -->
          <select
            v-model="selectedCategory"
            aria-label="Filter by category"
            class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option v-for="c in categories" :key="c" :value="c">
              {{ c === 'All' ? 'All Categories' : (categoryLabels[c]?.label || c) }}
            </option>
          </select>

          <!-- Arena Coin Badge -->
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shrink-0"
            title="Arena Coin (coin #1) - Distinct from Gold"
          >
            <span>🏆</span>
            <span>Arena:</span>
            <span class="font-bold tabular-nums">{{ formatNumber(arenaCoinAmount) }}</span>
          </span>
        </div>
      </div>

      <!-- Right Controls: View Switcher, Count, Export & Refresh -->
      <div class="flex items-center justify-between xl:justify-end gap-2 text-xs shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100 dark:border-slate-800">
        <!-- Count badge -->
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {{ formatNumber(filteredItems.length) }} items
        </span>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- View mode switcher -->
          <div class="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              class="cursor-pointer px-2 py-1 rounded text-xs transition-colors"
              :class="viewMode === 'grid' ? 'bg-white dark:bg-slate-700 font-semibold text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
              title="Grid View (Icons)"
              @click="viewMode = 'grid'"
            >
              🔲 Grid
            </button>
            <button
              type="button"
              class="cursor-pointer px-2 py-1 rounded text-xs transition-colors"
              :class="viewMode === 'table' ? 'bg-white dark:bg-slate-700 font-semibold text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
              title="Table View (Snapshot)"
              @click="viewMode = 'table'"
            >
              📋 Table
            </button>
          </div>

          <!-- Export JSON button -->
          <button
            id="btn-toolbar-export-items"
            type="button"
            class="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            title="Export inventory data as JSON"
            @click="exportItemsJson"
          >
            📥 Export
          </button>

          <!-- Refresh button -->
          <button
            id="btn-toolbar-refresh-items"
            type="button"
            :disabled="isRefreshing"
            class="cursor-pointer rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="Refresh inventory via RPC"
            @click="refreshInventory"
          >
            <span :class="{ 'inline-block animate-spin': isRefreshing }">🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredItems.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No items found matching your search and filter criteria.
    </div>

    <!-- Categorized Sections Container -->
    <div v-else class="space-y-4">
      <section
        v-for="sec in categorizedSections"
        :key="sec.category"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs space-y-3"
      >
        <!-- Section Header -->
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <span>{{ sec.icon }}</span>
            <span>{{ sec.label }}</span>
            <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {{ sec.items.length }}
            </span>
          </h3>
          <span class="text-[11px] font-mono text-slate-400">{{ sec.category }}</span>
        </div>

        <!-- 1. Grid Mode -->
        <div
          v-if="viewMode === 'grid'"
          class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-14 gap-2"
        >
          <div
            v-for="item in sec.items"
            :key="`${item.category}-${item.id}`"
            class="relative aspect-square rounded-xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center p-1.5 border border-slate-200 dark:border-slate-700/60 hover:border-blue-400 dark:hover:border-blue-500 transition-all select-none group"
            :title="`${item.name}\nCategory: ${item.category}\nID: ${item.id}\nQuantity: ${formatNumber(item.amount)}`"
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
            <span class="absolute bottom-1 right-1 bg-slate-900/85 text-white text-[10px] font-mono px-1 rounded-sm tabular-nums shadow-xs">
              {{ formatNumber(item.amount) }}
            </span>
          </div>
        </div>

        <!-- 2. Table Mode -->
        <div
          v-else
          class="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto"
        >
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 font-semibold text-slate-700 dark:text-slate-200">
                <th class="p-2 w-12 text-center">Icon</th>
                <th class="p-2">Item Name</th>
                <th class="p-2 w-20">ID</th>
                <th class="p-2 w-28 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr
                v-for="item in sec.items"
                :key="`${item.category}-${item.id}`"
                class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td class="p-2 text-center">
                  <div class="size-7 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
                    <img
                      v-if="getItemImgSrc(item)"
                      :src="getItemImgSrc(item)"
                      :alt="item.name"
                      class="size-full object-contain"
                      loading="lazy"
                    />
                    <span v-else class="text-xs">{{ getCategoryIcon(item.category) }}</span>
                  </div>
                </td>
                <td class="p-2 font-medium text-slate-800 dark:text-slate-200">
                  {{ item.name }}
                </td>
                <td class="p-2 font-mono text-slate-400 text-[11px]">
                  #{{ item.id }}
                </td>
                <td class="p-2 text-right font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  {{ formatNumber(item.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
