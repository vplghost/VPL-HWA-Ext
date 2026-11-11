<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

export interface TabConfigItem {
  id: string;
  visible: boolean;
}

const DEFAULT_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'heroes', label: 'Heroes', icon: '🦸' },
  { id: 'items', label: 'Items', icon: '🎒' },
  { id: 'resources', label: 'Resources', icon: '🪙' },
  { id: 'titans', label: 'Titans', icon: '🗿' },
  { id: 'teams', label: 'Teams', icon: '⚔️' },
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'log', label: 'Log', icon: '📜' },
];

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const { cache } = useRpcCache();
const tabConfig = ref<TabConfigItem[]>(DEFAULT_TABS.map((t) => ({ id: t.id, visible: true })));

function normalizeConfig(stored: any[]): TabConfigItem[] {
  if (!Array.isArray(stored) || stored.length === 0) {
    return DEFAULT_TABS.map((t) => ({ id: t.id, visible: true }));
  }
  const known = new Set(DEFAULT_TABS.map((t) => t.id));
  const result: TabConfigItem[] = [];
  const seen = new Set<string>();

  for (const item of stored) {
    if (item && known.has(item.id) && !seen.has(item.id)) {
      result.push({ id: item.id, visible: item.visible !== false });
      seen.add(item.id);
    }
  }

  for (const def of DEFAULT_TABS) {
    if (!seen.has(def.id)) {
      result.push({ id: def.id, visible: true });
    }
  }

  if (!result.some((t) => t.visible)) {
    result[0].visible = true;
  }
  return result;
}

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('tabConfig');
      if (stored.tabConfig) {
        tabConfig.value = normalizeConfig(stored.tabConfig);
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.tabConfig) {
        tabConfig.value = normalizeConfig(changes.tabConfig.newValue);
      }
    });
  }
});

// Dynamic ordered list of visible tabs
const visibleTabs = computed(() => {
  const map = new Map(DEFAULT_TABS.map((t) => [t.id, t]));
  return tabConfig.value
    .filter((item) => item.visible && map.has(item.id))
    .map((item) => map.get(item.id)!);
});

// Badges
const heroesBadge = computed(() => {
  const popupData = (globalThis as any).hwaHelperPopupData;
  if (popupData?.countEvolvableHeroes) {
    const count = popupData.countEvolvableHeroes(cache.value.heroGetAll?.data, cache.value.inventoryGet?.data);
    return count > 0 ? count : null;
  }
  return null;
});

const titansBadge = computed(() => {
  const popupData = (globalThis as any).hwaHelperPopupData;
  if (popupData?.countEvolvableTitans) {
    const count = popupData.countEvolvableTitans(cache.value.titanGetAll?.data, cache.value.inventoryGet?.data);
    return count > 0 ? count : null;
  }
  return null;
});

const hasActiveEvents = computed(() => {
  return Boolean(
    cache.value.clanVersusStatus ||
    cache.value.clanWarChampStatus ||
    cache.value.clanClashStatus ||
    cache.value.brawlStatus
  );
});

function selectTab(id: string) {
  emit('update:modelValue', id);
}
</script>

<template>
  <nav
    id="tabs"
    role="tablist"
    aria-label="Game data"
    class="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-0.5 text-xs scrollbar-none items-center"
  >
    <!-- Configurable Tabs -->
    <button
      v-for="t in visibleTabs"
      :key="t.id"
      type="button"
      role="tab"
      :data-tab="t.id"
      :aria-selected="modelValue === t.id"
      class="cursor-pointer flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-1.5 font-medium transition-colors border-b-2"
      :class="
        modelValue === t.id
          ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
      "
      @click="selectTab(t.id)"
    >
      <span>{{ t.icon }}</span>
      <span>{{ t.label }}</span>

      <!-- Heroes Badge -->
      <span
        v-if="t.id === 'heroes' && heroesBadge"
        id="heroes-tab-badge"
        class="ml-0.5 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white"
      >
        {{ heroesBadge }}
      </span>

      <!-- Titans Badge -->
      <span
        v-if="t.id === 'titans' && titansBadge"
        id="titans-tab-badge"
        class="ml-0.5 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white"
      >
        {{ titansBadge }}
      </span>

      <!-- Events Live Badge -->
      <span
        v-if="t.id === 'events' && hasActiveEvents"
        id="events-tab-badge"
        class="ml-0.5 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase"
      >
        Live
      </span>
    </button>

    <!-- Settings (Config) Cog Button - Right aligned -->
    <button
      type="button"
      role="tab"
      data-tab="config"
      aria-label="Settings"
      title="Settings"
      :aria-selected="modelValue === 'settings' || modelValue === 'config'"
      class="ml-auto cursor-pointer flex items-center justify-center rounded-t-lg p-1.5 transition-colors border-b-2"
      :class="
        modelValue === 'settings' || modelValue === 'config'
          ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
      "
      @click="selectTab('settings')"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M10 2h4l.5 2.2 1.9.8 1.9-1.2 2.8 2.8-1.2 1.9.8 1.9L23 10v4l-2.3.5-.8 1.9 1.2 1.9-2.8 2.8-1.9-1.2-1.9.8L14 23h-4l-.5-2.3-1.9-.8-1.9 1.2-2.8-2.8 1.2-1.9-.8-1.9L1 14v-4l2.2-.5.8-1.9-1.2-1.9 2.8-2.8 1.9 1.2 1.9-.8L10 2Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
  </nav>
</template>
