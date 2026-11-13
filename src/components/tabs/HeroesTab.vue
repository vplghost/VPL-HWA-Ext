<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStoredFavorites } from '@/src/composables/useStoredFavorites';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  getHeroMetadata,
  getHeroEquipmentRank,
  getHeroSoulProgress,
  starGlowClass,
  downloadJson,
  type HeroMeta,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import HeroDetailModal from '@/src/components/dialogs/HeroDetailModal.vue';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedClass = ref('All');
const selectedFaction = ref('All');
const filterFavsOnly = ref(false);
const filterEvolveOnly = ref(false);
const viewMode = ref<'table' | 'grid'>('table');

// Sorting
type SortColumn = 'fav' | 'id' | 'name' | 'level' | 'star' | 'rank' | 'soul' | 'power';
const sortColumn = ref<SortColumn>('power');
const sortDirection = ref<'asc' | 'desc'>('desc');

const selectedHero = ref<any>(null);
const showHeroModal = ref(false);

// Favorite heroes stored as string IDs
const favoriteHeroes = useStoredFavorites('favoriteHeroes');

async function toggleFavorite(heroId: number | string) {
  const idStr = String(heroId);
  const next = new Set(favoriteHeroes.value);
  if (next.has(idStr)) {
    next.delete(idStr);
  } else {
    next.add(idStr);
  }
  favoriteHeroes.value = next;

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      await chrome.storage.local.set({ favoriteHeroes: Array.from(next) });
    } catch (e) {
      console.warn('Failed to persist favoriteHeroes:', e);
    }
  }
}

const heroEntries = computed(() => {
  const data = cache.value.heroGetAll?.data || {};
  const inventory = cache.value.inventoryGet?.data;
  return Object.entries(data).map(([id, hero]: [string, any]) => {
    const meta: HeroMeta | undefined = getHeroMetadata(id);
    const idStr = String(id);
    const soulProg = getHeroSoulProgress(id, hero, inventory);
    const ownedStones = Number(soulProg?.owned) || 0;
    const neededStones = soulProg?.needed;
    const canEvolve = typeof neededStones === 'number' && ownedStones >= neededStones;
    const isFav = favoriteHeroes.value.has(idStr);
    const eqRank = getHeroEquipmentRank(hero.color);
    const starNum = Number(hero.star) || 1;
    const powerNum = Number(hero.power) || 0;
    const levelNum = Number(hero.level) || 1;

    return {
      id: Number(id),
      idStr,
      name: meta?.name || (globalThis as any).hwaHelperNameMap?.hero?.(id) || `Hero #${id}`,
      class: meta?.class || 'Other',
      role: meta?.role || '',
      faction: meta?.faction || '',
      avatarFile: meta?.avatarFile,
      power: powerNum,
      level: levelNum,
      star: starNum,
      color: Number(hero.color) || 1,
      equipmentRank: eqRank,
      soulProg: {
        owned: ownedStones,
        needed: neededStones,
        formatted: `${formatNumber(ownedStones)} / ${typeof neededStones === 'number' ? formatNumber(neededStones) : (neededStones ?? '—')}`,
        canEvolve,
      },
      isFav,
      smallGlow: starGlowClass(starNum, false),
      largeGlow: starGlowClass(starNum, true),
      raw: hero,
    };
  });
});

const classes = computed(() => {
  const set = new Set<string>();
  for (const h of heroEntries.value) {
    if (h.class) set.add(h.class);
  }
  return ['All', ...Array.from(set).sort()];
});

const factions = computed(() => {
  const set = new Set<string>();
  for (const h of heroEntries.value) {
    if (h.faction) set.add(h.faction);
  }
  return ['All', ...Array.from(set).sort()];
});

const filteredHeroes = computed(() => {
  const list = heroEntries.value.filter((h) => {
    if (filterFavsOnly.value && !h.isFav) return false;
    if (filterEvolveOnly.value && !h.soulProg.canEvolve) return false;
    if (selectedClass.value !== 'All' && h.class !== selectedClass.value) return false;
    if (selectedFaction.value !== 'All' && h.faction !== selectedFaction.value) return false;
    if (search.value) {
      const q = search.value.toLowerCase().trim();
      if (!h.name.toLowerCase().includes(q) && !h.idStr.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const col = sortColumn.value;
  const dir = sortDirection.value === 'asc' ? 1 : -1;

  return list.sort((a, b) => {
    // If not sorting by a specific column, or to maintain favorite priority
    if (col === 'fav') {
      const favDiff = (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0);
      if (favDiff !== 0) return favDiff * dir;
      return (b.power - a.power);
    }
    if (col === 'power') return (a.power - b.power) * dir;
    if (col === 'level') return (a.level - b.level) * dir;
    if (col === 'star') return (a.star - b.star) * dir;
    if (col === 'id') return (a.id - b.id) * dir;
    if (col === 'name') return a.name.localeCompare(b.name) * dir;
    if (col === 'rank') return (a.color - b.color) * dir;
    if (col === 'soul') {
      const aCan = a.soulProg.canEvolve ? 1 : 0;
      const bCan = b.soulProg.canEvolve ? 1 : 0;
      if (aCan !== bCan) return (aCan - bCan) * dir;
      return (a.soulProg.owned - b.soulProg.owned) * dir;
    }
    return 0;
  });
});

function handleSort(col: SortColumn) {
  if (sortColumn.value === col) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn.value = col;
    sortDirection.value = (col === 'name' || col === 'id') ? 'asc' : 'desc';
  }
}

function getAvatarUrl(file: string | undefined): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

function openHeroDetail(hero: any) {
  selectedHero.value = hero;
  showHeroModal.value = true;
}

async function refreshHeroes() {
  await dispatchRpc([{ name: 'heroGetAll' }]);
}

function exportHeroesJson() {
  const popupData = (globalThis as any).hwaHelperPopupData;
  const exported = popupData?.exportTableData?.('heroes', cache.value, search.value);
  if (Array.isArray(exported) && exported.length > 0) {
    downloadJson('hwa-heroes.json', exported);
  } else {
    downloadJson(
      'hwa-heroes.json',
      filteredHeroes.value.map((h) => ({
        id: h.id,
        name: h.name,
        level: h.level,
        star: h.star,
        power: h.power,
        class: h.class,
        faction: h.faction,
        color: h.color,
        soulStones: h.soulProg,
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
            placeholder="Search hero name or ID..."
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <!-- Class filter -->
          <select
            v-model="selectedClass"
            aria-label="Filter by class"
            class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option v-for="c in classes" :key="c" :value="c">
              Class: {{ c }}
            </option>
          </select>

          <!-- Faction filter -->
          <select
            v-model="selectedFaction"
            aria-label="Filter by faction"
            class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option v-for="f in factions" :key="f" :value="f">
              Faction: {{ f.replace('Way of ', '') }}
            </option>
          </select>

          <!-- Favorites filter toggle -->
          <button
            type="button"
            :class="filterFavsOnly
              ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800 font-semibold'
              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'"
            class="cursor-pointer inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors shrink-0"
            title="Filter only favorited heroes"
            @click="filterFavsOnly = !filterFavsOnly"
          >
            <span>⭐ Favs</span>
            <span v-if="favoriteHeroes.size > 0" class="rounded-full bg-amber-500 px-1 text-[10px] text-white">
              {{ favoriteHeroes.size }}
            </span>
          </button>

          <!-- Ready to Evolve filter toggle -->
          <button
            type="button"
            :class="filterEvolveOnly
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 font-semibold'
              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'"
            class="cursor-pointer inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors shrink-0"
            title="Filter heroes ready for evolution"
            @click="filterEvolveOnly = !filterEvolveOnly"
          >
            <span>✨ Ready</span>
          </button>
        </div>
      </div>

      <!-- Right Controls: View Switcher & Refresh -->
      <div class="flex items-center justify-between xl:justify-end gap-2 text-xs shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100 dark:border-slate-800">
        <!-- Count badge -->
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {{ formatNumber(filteredHeroes.length) }} heroes
        </span>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- View mode switcher -->
          <div class="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              class="cursor-pointer px-2 py-1 rounded text-xs transition-colors"
              :class="viewMode === 'table' ? 'bg-white dark:bg-slate-700 font-semibold text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
              title="Table View (Snapshot)"
              @click="viewMode = 'table'"
            >
              📋 Table
            </button>
            <button
              type="button"
              class="cursor-pointer px-2 py-1 rounded text-xs transition-colors"
              :class="viewMode === 'grid' ? 'bg-white dark:bg-slate-700 font-semibold text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
              title="Grid View (Cards)"
              @click="viewMode = 'grid'"
            >
              🔲 Grid
            </button>
          </div>

          <!-- Export JSON button -->
          <button
            id="btn-toolbar-export-heroes"
            type="button"
            class="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            title="Export heroes data as JSON"
            @click="exportHeroesJson"
          >
            📥 Export
          </button>

          <button
            id="btn-toolbar-refresh-heroes"
            type="button"
            class="cursor-pointer rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
            title="Refresh Heroes via RPC"
            @click="refreshHeroes"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="filteredHeroes.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No heroes found matching your search and filter criteria.
    </div>

    <!-- TABLE VIEW (1:1 with legacy HTML snapshot table) -->
    <div
      v-else-if="viewMode === 'table'"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-x-auto"
    >
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 font-semibold text-slate-700 dark:text-slate-200">
            <!-- Fav column -->
            <th class="w-10 px-3 py-2 text-center">
              <button
                type="button"
                class="cursor-pointer hover:text-amber-500"
                title="Sort by favorite"
                @click="handleSort('fav')"
              >
                ⭐
              </button>
            </th>

            <!-- Hero ID -->
            <th class="w-20 px-3 py-2">
              <button
                type="button"
                class="cursor-pointer flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('id')"
              >
                <span>ID</span>
                <span class="text-[10px]">{{ sortColumn === 'id' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Name -->
            <th class="px-3 py-2 min-w-44">
              <button
                type="button"
                class="cursor-pointer flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('name')"
              >
                <span>Name</span>
                <span class="text-[10px]">{{ sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Level -->
            <th class="w-16 px-3 py-2 text-right tabular-nums">
              <button
                type="button"
                class="cursor-pointer flex items-center justify-end gap-1 w-full hover:text-blue-600"
                @click="handleSort('level')"
              >
                <span>Level</span>
                <span class="text-[10px]">{{ sortColumn === 'level' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Star -->
            <th class="w-24 px-3 py-2">
              <button
                type="button"
                class="cursor-pointer flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('star')"
              >
                <span>Star</span>
                <span class="text-[10px]">{{ sortColumn === 'star' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Equipment rank -->
            <th class="px-3 py-2">
              <button
                type="button"
                class="cursor-pointer flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('rank')"
              >
                <span>Equipment rank</span>
                <span class="text-[10px]">{{ sortColumn === 'rank' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Soul stones -->
            <th class="px-3 py-2">
              <button
                type="button"
                class="cursor-pointer flex items-center gap-1 hover:text-blue-600"
                @click="handleSort('soul')"
              >
                <span>Soul stones</span>
                <span class="text-[10px]">{{ sortColumn === 'soul' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
            </th>

            <!-- Power -->
            <th class="w-24 px-3 py-2 text-right tabular-nums">
              <button
                type="button"
                class="cursor-pointer flex items-center justify-end gap-1 w-full hover:text-blue-600"
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
            v-for="h in filteredHeroes"
            :key="h.id"
            class="transition-colors cursor-pointer"
            :class="[
              h.soulProg.canEvolve
                ? 'bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-950 dark:text-emerald-200 font-medium'
                : h.isFav
                  ? 'bg-amber-50/30 hover:bg-amber-100/40 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-slate-800 dark:text-slate-200'
                  : 'hover:bg-blue-50/50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
            ]"
            @click="openHeroDetail(h)"
          >
            <!-- Favorite button cell -->
            <td class="px-3 py-2 text-center" @click.stop="toggleFavorite(h.id)">
              <button
                type="button"
                :title="h.isFav ? 'Remove favorite' : 'Add favorite'"
                :aria-label="h.isFav ? 'Remove favorite' : 'Add favorite'"
                class="cursor-pointer p-0.5 rounded transition-colors"
                :class="h.isFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" :fill="h.isFav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </td>

            <!-- Hero ID -->
            <td class="px-3 py-2 font-mono text-[11px] text-slate-400">
              #{{ h.id }}
            </td>

            <!-- Name with Hover Card Popover -->
            <td class="px-3 py-2">
              <span class="hero-hover-trigger inline-flex items-center gap-2 align-middle">
                <!-- Small Avatar with Star Glow -->
                <span class="relative size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center" :class="h.smallGlow">
                  <img
                    v-if="h.avatarFile"
                    :src="getAvatarUrl(h.avatarFile)"
                    :alt="h.name"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[10px]">🦸</span>
                </span>

                <!-- Name Label -->
                <span class="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {{ h.name }}
                </span>

                <!-- Hover Card Popover Component -->
                <HeroHoverCard :hero-id="h.id" :hero="h.raw" :inventory="cache.inventoryGet?.data" />
              </span>
            </td>

            <!-- Level -->
            <td class="px-3 py-2 text-right tabular-nums font-mono">
              {{ h.level }}
            </td>

            <!-- Star -->
            <td class="px-3 py-2">
              <span v-if="h.star >= 6" class="text-amber-400 font-bold flex items-center gap-0.5">
                <span>★★★★★</span>
                <span class="text-amber-300 font-black">★</span>
              </span>
              <span v-else class="text-amber-400 tracking-wider">
                {{ '★'.repeat(h.star) }}
              </span>
            </td>

            <!-- Equipment Rank -->
            <td class="px-3 py-2">
              <span
                v-if="h.equipmentRank"
                class="font-semibold"
                :style="{ color: h.equipmentRank.color, textShadow: h.equipmentRank.textShadow }"
              >
                {{ h.equipmentRank.label }}
              </span>
              <span v-else class="text-slate-400">—</span>
            </td>

            <!-- Soul Stones -->
            <td class="px-3 py-2 font-mono" :class="h.soulProg.canEvolve ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''">
              <span class="inline-flex items-center gap-1.5">
                <span>{{ h.soulProg.formatted }}</span>
                <span v-if="h.soulProg.canEvolve" class="rounded bg-emerald-500 px-1 py-0.2 text-[9px] font-bold text-white uppercase">
                  Ready
                </span>
              </span>
            </td>

            <!-- Power -->
            <td class="px-3 py-2 text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-400 font-mono">
              {{ formatNumber(h.power) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- GRID VIEW (Cards) -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
      <div
        v-for="h in filteredHeroes"
        :key="h.id"
        class="group relative rounded-xl border p-2.5 space-y-2 shadow-2xs transition-all cursor-pointer hero-hover-trigger"
        :class="[
          h.soulProg.canEvolve
            ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20'
            : h.isFav
              ? 'border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-indigo-400 dark:hover:border-indigo-600'
        ]"
        @click="openHeroDetail(h)"
      >
        <div class="flex items-center justify-between gap-1.5">
          <!-- Avatar + Star Glow -->
          <div class="relative size-11 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700" :class="h.smallGlow">
            <img
              v-if="h.avatarFile"
              :src="getAvatarUrl(h.avatarFile)"
              :alt="h.name"
              class="size-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-base">🦸</span>
            <span class="absolute bottom-0 right-0 bg-slate-900/80 text-white font-mono text-[9px] px-1 rounded-tl">
              {{ h.level }}
            </span>
          </div>

          <!-- Hero Name & Class -->
          <div class="min-w-0 flex-1">
            <div class="font-bold text-xs text-slate-800 dark:text-slate-100 truncate" :title="h.name">
              {{ h.name }}
            </div>
            <div class="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <span>{{ h.class }}</span>
              <span v-if="h.role">({{ h.role }})</span>
            </div>
            <div v-if="h.equipmentRank" class="text-[10px] font-semibold truncate" :style="{ color: h.equipmentRank.color }">
              {{ h.equipmentRank.label }}
            </div>
          </div>

          <!-- Favorite Button -->
          <button
            type="button"
            :title="h.isFav ? 'Remove favorite' : 'Add favorite'"
            class="cursor-pointer p-1 rounded transition-colors shrink-0"
            :class="h.isFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'"
            @click.stop="toggleFavorite(h.id)"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" :fill="h.isFav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>

        <!-- Soul Stones Progress bar -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-slate-400 font-medium">Soul:</span>
            <span
              class="font-mono font-bold"
              :class="h.soulProg.canEvolve ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'"
            >
              {{ formatNumber(h.soulProg.owned) }} / {{ typeof h.soulProg.needed === 'number' ? formatNumber(h.soulProg.needed) : (h.soulProg.needed ?? '—') }}
            </span>
          </div>
          <!-- Progress bar -->
          <div class="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="h.soulProg.canEvolve ? 'bg-emerald-500' : 'bg-blue-500'"
              :style="{ width: `${typeof h.soulProg.needed === 'number' && h.soulProg.needed > 0 ? Math.min(100, (h.soulProg.owned / h.soulProg.needed) * 100) : 100}%` }"
            ></div>
          </div>
        </div>

        <!-- Power & Stars Footer -->
        <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex items-center text-amber-400 text-[10px]">
            <span v-if="h.star >= 6" class="font-bold">★★★★★★</span>
            <span v-else>{{ '★'.repeat(h.star) }}</span>
          </div>
          <div class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-[11px] font-mono">
            {{ formatNumber(h.power) }}
          </div>
        </div>

        <!-- Hover Card Popover -->
        <HeroHoverCard :hero-id="h.id" :hero="h.raw" :inventory="cache.inventoryGet?.data" />
      </div>
    </div>

    <!-- Hero Detail Modal -->
    <HeroDetailModal v-model="showHeroModal" :hero="selectedHero" />
  </div>
</template>
