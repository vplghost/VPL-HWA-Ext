<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata, type HeroMeta } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const selectedClass = ref('All');
const sortBy = ref<'power' | 'level' | 'star' | 'name'>('power');

const heroEntries = computed(() => {
  const data = cache.value.heroGetAll?.data || {};
  return Object.entries(data).map(([id, hero]: [string, any]) => {
    const meta: HeroMeta | undefined = getHeroMetadata(id);
    return {
      id: Number(id),
      name: meta?.name || `Hero #${id}`,
      class: meta?.class || 'Other',
      faction: meta?.faction || '',
      avatarFile: meta?.avatarFile,
      power: Number(hero.power) || 0,
      level: Number(hero.level) || 1,
      star: Number(hero.star) || 1,
      color: Number(hero.color) || 1,
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

const filteredHeroes = computed(() => {
  return heroEntries.value
    .filter((h) => {
      if (search.value) {
        const q = search.value.toLowerCase();
        if (!h.name.toLowerCase().includes(q) && !String(h.id).includes(q)) {
          return false;
        }
      }
      if (selectedClass.value !== 'All' && h.class !== selectedClass.value) {
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

async function refreshHeroes() {
  await dispatchRpc([{ name: 'heroGetAll' }]);
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
          placeholder="Search hero name or ID..."
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden w-48"
        />

        <!-- Class filter -->
        <select
          v-model="selectedClass"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
        >
          <option v-for="c in classes" :key="c" :value="c">
            {{ c }}
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
        <span>{{ filteredHeroes.length }} heroes</span>
        <button
          type="button"
          class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
          title="Refresh heroes"
          @click="refreshHeroes"
        >
          ↻ Refresh
        </button>
      </div>
    </div>

    <!-- Heroes Grid -->
    <div v-if="filteredHeroes.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No heroes found. Open the game or trigger hero snapshot to populate data.
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
      <div
        v-for="h in filteredHeroes"
        :key="h.id"
        class="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2.5 space-y-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-2">
          <!-- Avatar -->
          <div class="relative size-10 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
            <img
              v-if="h.avatarFile"
              :src="getAvatarUrl(h.avatarFile)"
              :alt="h.name"
              class="size-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-base">🦸</span>
            <!-- Level Pill -->
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
            </div>
          </div>
        </div>

        <!-- Power & Stars -->
        <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex items-center text-amber-400 text-[10px]">
            <span v-for="s in h.star" :key="s">★</span>
          </div>
          <div class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-[11px]">
            {{ formatNumber(h.power) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

