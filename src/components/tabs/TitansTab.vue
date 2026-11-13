<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStoredFavorites } from '@/src/composables/useStoredFavorites';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  getTitanMetadata,
  getTitanSoulProgress,
  starGlowClass,
  downloadJson,
  type TitanMeta,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import TitanHoverCard from '@/src/components/common/TitanHoverCard.vue';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedElement = ref('All');
const filterFavsOnly = ref(false);
const filterEvolveOnly = ref(false);
const viewMode = ref<'grid' | 'table'>('grid');
const isRefreshing = ref(false);

// Sorting
type SortColumn = 'fav' | 'id' | 'name' | 'level' | 'star' | 'soul' | 'power';
const sortColumn = ref<SortColumn>('power');
const sortDirection = ref<'asc' | 'desc'>('desc');

// Favorite titans stored as string IDs
const favoriteTitans = useStoredFavorites('favoriteTitans');

async function toggleFavorite(titanId: number | string) {
  const idStr = String(titanId);
  const next = new Set(favoriteTitans.value);
  if (next.has(idStr)) {
    next.delete(idStr);
  } else {
    next.add(idStr);
  }
  favoriteTitans.value = next;

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      await chrome.storage.local.set({ favoriteTitans: Array.from(next) });
    } catch (e) {
      console.warn('Failed to persist favoriteTitans:', e);
    }
  }
}

const elements = ['All', 'Water', 'Fire', 'Earth', 'Light', 'Darkness'];

const ELEMENT_STYLES: Record<string, {
  dot: string;
  gradient: string;
  border: string;
  badge: string;
  cardBorder: string;
}> = {
  Water: {
    dot: 'bg-sky-400',
    gradient: 'from-sky-500 to-blue-700',
    border: 'border-sky-300 dark:border-sky-800',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/80',
    cardBorder: 'border-sky-200 hover:border-sky-400 dark:border-sky-800/60 dark:hover:border-sky-600 bg-sky-50/20',
  },
  Fire: {
    dot: 'bg-red-500',
    gradient: 'from-amber-600 to-red-700',
    border: 'border-red-300 dark:border-red-800',
    badge: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800/80',
    cardBorder: 'border-red-200 hover:border-red-400 dark:border-red-800/60 dark:hover:border-red-600 bg-red-50/20',
  },
  Earth: {
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-600 to-green-800',
    border: 'border-emerald-300 dark:border-emerald-800',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
    cardBorder: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-800/60 dark:hover:border-emerald-600 bg-emerald-50/20',
  },
  Light: {
    dot: 'bg-amber-300',
    gradient: 'from-amber-400 to-yellow-600',
    border: 'border-amber-300 dark:border-amber-800',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    cardBorder: 'border-amber-200 hover:border-amber-400 dark:border-amber-800/60 dark:hover:border-amber-600 bg-amber-50/20',
  },
  Darkness: {
    dot: 'bg-purple-400',
    gradient: 'from-purple-800 to-slate-900',
    border: 'border-purple-300 dark:border-purple-800',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
    cardBorder: 'border-purple-200 hover:border-purple-400 dark:border-purple-800/60 dark:hover:border-purple-600 bg-purple-50/20',
  },
};

function getElementStyle(el: string) {
  return ELEMENT_STYLES[el] || {
    dot: 'bg-slate-400',
    gradient: 'from-slate-600 to-slate-800',
    border: 'border-slate-300 dark:border-slate-700',
    badge: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    cardBorder: 'border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-700',
  };
}

const titanEntries = computed(() => {
  const data = cache.value.titanGetAll?.data || {};
  const inventory = cache.value.inventoryGet?.data;
  return Object.entries(data).map(([id, titan]: [string, any]) => {
    const meta: TitanMeta | undefined = getTitanMetadata(id);
    const idStr = String(id);
    const isFav = favoriteTitans.value.has(idStr);
    const starNum = Number(titan.star) || 1;
    const powerNum = Number(titan.power) || 0;
    const levelNum = Number(titan.level) || 1;
    const soulProg = getTitanSoulProgress(id, titan, inventory);
    const ownedStones = Number(soulProg?.owned) || 0;
    const neededStones = soulProg?.needed;
    const canEvolve = typeof neededStones === 'number' && ownedStones >= neededStones;

    const arts = titan.artifacts;
    const artifactsList: Array<{ type: string; star: number; level: number; isUpgradable: boolean }> = [];
    if (Array.isArray(arts) && arts.length > 0) {
      const typeNames = ['Wpn', 'Crown', 'Seal'];
      const popupData = (globalThis as any).hwaHelperPopupData;
      arts.forEach((art: any, idx: number) => {
        const isUpgradable = popupData?.isTitanArtifactUpgradable?.(id, idx, titan, cache.value);
        artifactsList.push({
          type: typeNames[idx] || `Art${idx + 1}`,
          star: art?.star ?? 0,
          level: art?.level ?? 1,
          isUpgradable: Boolean(isUpgradable),
        });
      });
    }

    return {
      id: Number(id),
      idStr,
      name: meta?.name || `Titan #${id}`,
      role: meta?.role || 'Titan',
      element: meta?.element || 'Unknown',
      avatarFile: meta?.avatarFile,
      power: powerNum,
      level: levelNum,
      star: starNum,
      isFav,
      canEvolve,
      soulProg: {
        owned: ownedStones,
        needed: neededStones ?? '—',
        canEvolve,
      },
      artifacts: artifactsList,
      smallGlow: starGlowClass(starNum, false),
      largeGlow: starGlowClass(starNum, true),
      raw: titan,
    };
  });
});

const evolvableCount = computed(() => {
  return titanEntries.value.filter((t) => t.canEvolve).length;
});

const favoritesCount = computed(() => {
  return titanEntries.value.filter((t) => t.isFav).length;
});

const filteredTitans = computed(() => {
  return titanEntries.value
    .filter((t) => {
      if (search.value) {
        const q = search.value.toLowerCase().trim();
        if (!t.name.toLowerCase().includes(q) && !t.idStr.includes(q)) {
          return false;
        }
      }
      if (selectedElement.value !== 'All' && t.element.toLowerCase() !== selectedElement.value.toLowerCase()) {
        return false;
      }
      if (filterFavsOnly.value && !t.isFav) {
        return false;
      }
      if (filterEvolveOnly.value && !t.canEvolve) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // If favorite column sorted or general sort, prioritize favorites when requested
      const col = sortColumn.value;
      const dir = sortDirection.value === 'asc' ? 1 : -1;

      if (col === 'fav') {
        return (Number(b.isFav) - Number(a.isFav)) * dir;
      }
      if (col === 'id') {
        return (a.id - b.id) * dir;
      }
      if (col === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      if (col === 'level') {
        return (a.level - b.level) * dir;
      }
      if (col === 'star') {
        return (a.star - b.star) * dir;
      }
      if (col === 'soul') {
        return (a.soulProg.owned - b.soulProg.owned) * dir;
      }
      if (col === 'power') {
        return (a.power - b.power) * dir;
      }
      return (b.power - a.power);
    });
});

function handleSort(col: SortColumn) {
  if (sortColumn.value === col) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn.value = col;
    sortDirection.value = col === 'name' ? 'asc' : 'desc';
  }
}

function getAvatarUrl(file: string | undefined): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

function getElementIcon(el: string): string {
  switch (el.toLowerCase()) {
    case 'water': return '💧';
    case 'fire': return '🔥';
    case 'earth': return '🌍';
    case 'light': return '☀️';
    case 'darkness': return '🌑';
    default: return '🗿';
  }
}

async function refreshTitans() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'titanGetAll' }, { name: 'inventoryGet' }]);
  } finally {
    isRefreshing.value = false;
  }
}

function exportTitansJson() {
  const popupData = (globalThis as any).hwaHelperPopupData;
  const exported = popupData?.exportTableData?.('titans', cache.value, search.value);
  if (Array.isArray(exported) && exported.length > 0) {
    downloadJson('hwa-titans.json', exported);
  } else {
    downloadJson(
      'hwa-titans.json',
      filteredTitans.value.map((t) => ({
        id: t.id,
        name: t.name,
        level: t.level,
        star: t.star,
        power: t.power,
        element: t.element,
        role: t.role,
        favorite: t.isFav,
        soulStones: `${t.soulProg.owned} / ${t.soulProg.needed}`,
      }))
    );
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Filter & Action Toolbar -->
    <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <!-- Left Controls: Search + Filters -->
      <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <!-- Search input -->
        <div class="relative w-full sm:w-48 xl:w-56 shrink-0">
          <input
            v-model="search"
            type="search"
            placeholder="Search titan name or ID..."
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <!-- Element filter -->
          <select
            v-model="selectedElement"
            class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option v-for="el in elements" :key="el" :value="el">
              {{ el === 'All' ? 'All Elements' : `${getElementIcon(el)} ${el}` }}
            </option>
          </select>

          <!-- Favorites Only Toggle -->
          <button
            type="button"
            class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors shrink-0"
            :class="filterFavsOnly
              ? 'bg-amber-500 border-amber-600 text-white shadow-xs'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
            @click="filterFavsOnly = !filterFavsOnly"
          >
            <span>★</span>
            <span>Favorites</span>
            <span
              v-if="favoritesCount > 0"
              class="text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums"
              :class="filterFavsOnly ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              {{ favoritesCount }}
            </span>
          </button>

          <!-- Can Evolve Only Toggle -->
          <button
            type="button"
            class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors shrink-0"
            :class="filterEvolveOnly
              ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
            @click="filterEvolveOnly = !filterEvolveOnly"
          >
            <span>⚡</span>
            <span>Ready to Evolve</span>
            <span
              v-if="evolvableCount > 0"
              class="text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums"
              :class="filterEvolveOnly ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'"
            >
              {{ evolvableCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- Right Controls: View Switcher, Count, Export & Refresh -->
      <div class="flex items-center justify-between xl:justify-end gap-2 text-xs shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100 dark:border-slate-800">
        <!-- Count badge -->
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {{ formatNumber(filteredTitans.length) }} titans
        </span>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- View mode switcher -->
          <div class="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              class="cursor-pointer px-2 py-1 rounded text-xs transition-colors"
              :class="viewMode === 'grid' ? 'bg-white dark:bg-slate-700 font-semibold text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
              title="Grid View (Cards)"
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
            id="btn-toolbar-export-titans"
            type="button"
            class="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            title="Export titans data as JSON"
            @click="exportTitansJson"
          >
            📥 Export
          </button>

          <!-- Refresh button -->
          <button
            id="btn-toolbar-refresh-titans"
            type="button"
            :disabled="isRefreshing"
            class="cursor-pointer rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="Refresh titans via RPC"
            @click="refreshTitans"
          >
            <span :class="{ 'inline-block animate-spin': isRefreshing }">🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredTitans.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No titans found matching your search and filter criteria.
    </div>

    <!-- GRID VIEW -->
    <div
      v-else-if="viewMode === 'grid'"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5"
    >
      <div
        v-for="t in filteredTitans"
        :key="t.id"
        class="group relative rounded-xl border p-2.5 space-y-2 shadow-2xs transition-all select-none"
        :class="[
          getElementStyle(t.element).cardBorder,
          t.isFav ? 'ring-1 ring-amber-400/60 dark:ring-amber-500/50' : '',
          t.canEvolve ? 'ring-2 ring-emerald-500/80 bg-emerald-50/10' : ''
        ]"
      >
        <!-- Top Row: Avatar with Star Glow + Favorite Star Button -->
        <div class="flex items-start justify-between gap-1.5">
          <!-- Avatar with Hover Trigger -->
          <div class="hero-hover-trigger flex items-center gap-2 min-w-0 flex-1">
            <div
              class="relative size-11 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border"
              :class="t.smallGlow"
            >
              <img
                v-if="t.avatarFile"
                :src="getAvatarUrl(t.avatarFile)"
                :alt="t.name"
                class="size-full object-cover"
                loading="lazy"
              />
              <span v-else class="text-lg">{{ getElementIcon(t.element) }}</span>

              <!-- Level Pill -->
              <span class="absolute bottom-0 right-0 bg-slate-900/85 text-white font-mono text-[9px] px-1 rounded-tl">
                {{ t.level }}
              </span>
            </div>

            <!-- Name and Element -->
            <div class="min-w-0 flex-1">
              <div class="font-bold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" :title="t.name">
                {{ t.name }}
              </div>
              <div class="flex items-center gap-1 text-[10px] text-slate-400 truncate mt-0.5">
                <span>{{ getElementIcon(t.element) }}</span>
                <span>{{ t.element }}</span>
              </div>
            </div>

            <!-- Hover Card Popover -->
            <TitanHoverCard
              :titan-id="t.id"
              :titan="t.raw"
              :inventory="cache.inventoryGet?.data"
            />
          </div>

          <!-- Favorite Toggle Button -->
          <button
            type="button"
            class="cursor-pointer p-1 rounded-md transition-colors shrink-0"
            :class="t.isFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'"
            :title="t.isFav ? 'Remove favorite' : 'Add favorite'"
            @click.stop="toggleFavorite(t.id)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" :fill="t.isFav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>

        <!-- Soul Stones Progress & Stars -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-slate-400 font-medium">Soul:</span>
            <span
              class="font-mono font-bold"
              :class="t.canEvolve ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'"
            >
              {{ formatNumber(t.soulProg.owned) }} / {{ typeof t.soulProg.needed === 'number' ? formatNumber(t.soulProg.needed) : t.soulProg.needed }}
            </span>
          </div>
          <!-- Progress bar -->
          <div class="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="t.canEvolve ? 'bg-emerald-500' : 'bg-blue-500'"
              :style="{ width: `${typeof t.soulProg.needed === 'number' && t.soulProg.needed > 0 ? Math.min(100, (t.soulProg.owned / t.soulProg.needed) * 100) : 100}%` }"
            ></div>
          </div>
        </div>

        <!-- Power & Stars Footer -->
        <div class="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center text-amber-400 text-[10px]">
            <span v-for="s in t.star" :key="s">★</span>
          </div>
          <div class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-[11px]">
            ⚡ {{ formatNumber(t.power) }}
          </div>
        </div>
      </div>
    </div>

    <!-- TABLE VIEW -->
    <div
      v-else
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-x-auto"
    >
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 font-semibold text-slate-700 dark:text-slate-200">
            <!-- Fav column -->
            <th class="w-10 px-2.5 py-2 text-center">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 hover:text-amber-500"
                title="Sort by Favorites"
                @click="handleSort('fav')"
              >
                <span>Fav</span>
                <span class="text-[10px]">{{ sortColumn === 'fav' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Titan ID -->
            <th class="w-16 px-2.5 py-2">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('id')"
              >
                <span>ID</span>
                <span class="text-[10px]">{{ sortColumn === 'id' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Titan Name -->
            <th class="px-2.5 py-2">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('name')"
              >
                <span>Titan Name</span>
                <span class="text-[10px]">{{ sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Element -->
            <th class="px-2.5 py-2">Element</th>

            <!-- Role -->
            <th class="px-2.5 py-2">Role</th>

            <!-- Level -->
            <th class="px-2.5 py-2 text-center">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center justify-center gap-1 hover:text-blue-600"
                @click="handleSort('level')"
              >
                <span>Level</span>
                <span class="text-[10px]">{{ sortColumn === 'level' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Stars -->
            <th class="px-2.5 py-2 text-center">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center justify-center gap-1 hover:text-blue-600"
                @click="handleSort('star')"
              >
                <span>Star</span>
                <span class="text-[10px]">{{ sortColumn === 'star' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Soul stones -->
            <th class="px-2.5 py-2">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('soul')"
              >
                <span>Soul stones</span>
                <span class="text-[10px]">{{ sortColumn === 'soul' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Artifacts -->
            <th class="px-2.5 py-2">Artifacts</th>

            <!-- Power -->
            <th class="px-2.5 py-2 text-right tabular-nums">
              <button
                type="button"
                class="cursor-pointer inline-flex items-center justify-end gap-1 hover:text-blue-600 w-full"
                @click="handleSort('power')"
              >
                <span>Power</span>
                <span class="text-[10px]">{{ sortColumn === 'power' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr
            v-for="t in filteredTitans"
            :key="t.id"
            class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
            :class="[
              t.canEvolve ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : '',
              t.isFav ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
            ]"
          >
            <!-- Favorite button cell -->
            <td class="px-2.5 py-2 text-center" @click.stop="toggleFavorite(t.id)">
              <button
                type="button"
                :title="t.isFav ? 'Remove favorite' : 'Add favorite'"
                :aria-label="t.isFav ? 'Remove favorite' : 'Add favorite'"
                class="cursor-pointer p-0.5 rounded transition-colors"
                :class="t.isFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" :fill="t.isFav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </td>

            <!-- Titan ID -->
            <td class="px-2.5 py-2 font-mono text-[11px] text-slate-400">
              #{{ t.id }}
            </td>

            <!-- Titan Name with Hover Card -->
            <td class="px-2.5 py-2">
              <span class="hero-hover-trigger inline-flex items-center gap-2 align-middle cursor-pointer">
                <!-- Small Avatar with Star Glow -->
                <span class="relative size-6 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border" :class="t.smallGlow">
                  <img
                    v-if="t.avatarFile"
                    :src="getAvatarUrl(t.avatarFile)"
                    :alt="t.name"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[10px]">{{ getElementIcon(t.element) }}</span>
                </span>

                <span class="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {{ t.name }}
                </span>

                <!-- Hover Card Popover -->
                <TitanHoverCard
                  :titan-id="t.id"
                  :titan="t.raw"
                  :inventory="cache.inventoryGet?.data"
                />
              </span>
            </td>

            <!-- Element Badge -->
            <td class="px-2.5 py-2">
              <span
                class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border"
                :class="getElementStyle(t.element).badge"
              >
                <span>{{ getElementIcon(t.element) }}</span>
                <span>{{ t.element }}</span>
              </span>
            </td>

            <!-- Role -->
            <td class="px-2.5 py-2 text-slate-500 dark:text-slate-400">
              {{ t.role }}
            </td>

            <!-- Level -->
            <td class="px-2.5 py-2 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
              {{ t.level }}
            </td>

            <!-- Stars -->
            <td class="px-2.5 py-2 text-center text-amber-400 text-xs">
              <span v-for="s in t.star" :key="s">★</span>
            </td>

            <!-- Soul stones progress -->
            <td class="px-2.5 py-2">
              <div class="flex items-center gap-2">
                <span
                  class="font-mono text-xs"
                  :class="t.canEvolve ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'"
                >
                  {{ formatNumber(t.soulProg.owned) }} / {{ typeof t.soulProg.needed === 'number' ? formatNumber(t.soulProg.needed) : t.soulProg.needed }}
                </span>
                <span
                  v-if="t.canEvolve"
                  class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 ring-1 ring-emerald-500/40"
                  title="Ready to evolve!"
                >
                  ⚡ Ready
                </span>
              </div>
            </td>

            <!-- Artifacts -->
            <td class="px-2.5 py-2">
              <div v-if="t.artifacts.length > 0" class="flex items-center gap-1.5 flex-wrap">
                <span
                  v-for="a in t.artifacts"
                  :key="a.type"
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border"
                  :class="a.isUpgradable
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-400/50'
                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'"
                  :title="`${a.type}: ${a.star}★ Lv.${a.level}${a.isUpgradable ? ' (Ready to Upgrade)' : ''}`"
                >
                  {{ a.type }}: {{ a.star }}★ L{{ a.level }}
                </span>
              </div>
              <span v-else class="text-slate-400 italic text-[11px]">—</span>
            </td>

            <!-- Power -->
            <td class="px-2.5 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {{ formatNumber(t.power) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
