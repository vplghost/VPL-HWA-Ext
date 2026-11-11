<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getTitanMetadata, downloadJson, type TitanMeta } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedElement = ref('All');
const sortBy = ref<'power' | 'level' | 'star' | 'name'>('power');
const viewMode = ref<'grid' | 'table'>('grid');
const isRefreshing = ref(false);

const titanEntries = computed(() => {
  const data = cache.value.titanGetAll?.data || {};
  return Object.entries(data).map(([id, titan]: [string, any]) => {
    const meta: TitanMeta | undefined = getTitanMetadata(id);
    return {
      id: Number(id),
      name: meta?.name || `Titan #${id}`,
      role: meta?.role || 'Titan',
      element: meta?.element || 'Unknown',
      avatarFile: meta?.avatarFile,
      power: Number(titan.power) || 0,
      level: Number(titan.level) || 1,
      star: Number(titan.star) || 1,
      raw: titan,
    };
  });
});

const elements = ['All', 'Water', 'Fire', 'Earth', 'Light', 'Darkness'];

const filteredTitans = computed(() => {
  return titanEntries.value
    .filter((t) => {
      if (search.value) {
        const q = search.value.toLowerCase().trim();
        if (!t.name.toLowerCase().includes(q) && !String(t.id).includes(q)) {
          return false;
        }
      }
      if (selectedElement.value !== 'All' && t.element.toLowerCase() !== selectedElement.value.toLowerCase()) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy.value === 'power') return b.power - a.power;
      if (sortBy.value === 'level') return b.level - a.level;
      if (sortBy.value === 'star') return b.star - a.star;
      return a.name.localeCompare(b.name);
    });
});

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
    await dispatchRpc([{ name: 'titanGetAll' }]);
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
      }))
    );
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Filter Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
      <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <!-- Search input -->
        <input
          v-model="search"
          type="search"
          placeholder="Search titan name or ID..."
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden w-48"
        />

        <!-- Element filter -->
        <select
          v-model="selectedElement"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
        >
          <option v-for="el in elements" :key="el" :value="el">
            {{ el === 'All' ? 'All Elements' : `${getElementIcon(el)} ${el}` }}
          </option>
        </select>

        <!-- Sort dropdown -->
        <select
          v-model="sortBy"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
        >
          <option value="power">Sort by Power (High to Low)</option>
          <option value="level">Sort by Level</option>
          <option value="star">Sort by Stars</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      <!-- Right Controls: View Switcher, Count, Export & Refresh -->
      <div class="flex items-center gap-2 text-xs shrink-0">
        <!-- Count badge -->
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {{ formatNumber(filteredTitans.length) }} titans
        </span>

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

    <!-- Empty State -->
    <div v-if="filteredTitans.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No titans found matching your search and filter criteria.
    </div>

    <!-- GRID VIEW -->
    <div
      v-else-if="viewMode === 'grid'"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5"
    >
      <div
        v-for="t in filteredTitans"
        :key="t.id"
        class="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2.5 space-y-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all select-none"
      >
        <div class="flex items-center gap-2">
          <!-- Avatar -->
          <div class="relative size-10 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
            <img
              v-if="t.avatarFile"
              :src="getAvatarUrl(t.avatarFile)"
              :alt="t.name"
              class="size-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-base">{{ getElementIcon(t.element) }}</span>
            <!-- Level Pill -->
            <span class="absolute bottom-0 right-0 bg-slate-900/80 text-white font-mono text-[9px] px-1 rounded-tl">
              {{ t.level }}
            </span>
          </div>

          <!-- Titan Name & Element -->
          <div class="min-w-0 flex-1">
            <div class="font-bold text-xs text-slate-800 dark:text-slate-100 truncate" :title="t.name">
              {{ t.name }}
            </div>
            <div class="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <span>{{ getElementIcon(t.element) }}</span>
              <span>{{ t.element }} · {{ t.role }}</span>
            </div>
          </div>
        </div>

        <!-- Power & Stars -->
        <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex items-center text-amber-400 text-[10px]">
            <span v-for="s in t.star" :key="s">★</span>
          </div>
          <div class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-[11px]">
            {{ formatNumber(t.power) }}
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
            <th class="p-2.5 w-12 text-center">Icon</th>
            <th class="p-2.5">Titan Name</th>
            <th class="p-2.5">Element</th>
            <th class="p-2.5">Role</th>
            <th class="p-2.5 text-center">Level</th>
            <th class="p-2.5 text-center">Stars</th>
            <th class="p-2.5 text-right">Power</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr
            v-for="t in filteredTitans"
            :key="t.id"
            class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
          >
            <td class="p-2.5 text-center">
              <div class="size-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto border border-slate-200 dark:border-slate-700">
                <img
                  v-if="t.avatarFile"
                  :src="getAvatarUrl(t.avatarFile)"
                  :alt="t.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
                <span v-else class="text-xs">{{ getElementIcon(t.element) }}</span>
              </div>
            </td>
            <td class="p-2.5 font-bold text-slate-800 dark:text-slate-200">
              {{ t.name }}
            </td>
            <td class="p-2.5">
              <span class="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                <span>{{ getElementIcon(t.element) }}</span>
                <span>{{ t.element }}</span>
              </span>
            </td>
            <td class="p-2.5 text-slate-500 dark:text-slate-400">
              {{ t.role }}
            </td>
            <td class="p-2.5 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
              {{ t.level }}
            </td>
            <td class="p-2.5 text-center text-amber-400 text-xs">
              <span v-for="s in t.star" :key="s">★</span>
            </td>
            <td class="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {{ formatNumber(t.power) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
