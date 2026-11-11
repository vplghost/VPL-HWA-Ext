<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getTitanMetadata, type TitanMeta } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedElement = ref('All');
const sortBy = ref<'power' | 'level' | 'star' | 'name'>('power');

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
        const q = search.value.toLowerCase();
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
  await dispatchRpc([{ name: 'titanGetAll' }]);
}
</script>

<template>
  <div class="space-y-3">
    <!-- Filter Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
      <div class="flex flex-wrap items-center gap-2 flex-1">
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
            {{ el }}
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

      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span>{{ filteredTitans.length }} titans</span>
        <button
          type="button"
          class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
          title="Refresh titans"
          @click="refreshTitans"
        >
          ↻ Refresh
        </button>
      </div>
    </div>

    <!-- Titans Grid -->
    <div v-if="filteredTitans.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No titans found. Open the game or trigger titan snapshot to populate data.
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
      <div
        v-for="t in filteredTitans"
        :key="t.id"
        class="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2.5 space-y-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer"
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
  </div>
</template>

