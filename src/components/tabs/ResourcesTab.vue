<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  formatResourceAmount,
  getAmountAt,
  resourceAppearance,
  resourceLabel,
  isSelectableForHeader,
} from '@/src/utils/resourceData';

const { cache } = useRpcCache();

const now = ref(Date.now());
const search = ref('');
const showAll = ref(false);
const resourceSelection = ref<string[]>([]);

function normalizeResourceSelection(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((item): item is string => typeof item === 'string');
  }
  if (val && typeof val === 'object') {
    return Object.keys(val).filter((k) => Boolean((val as Record<string, unknown>)[k]));
  }
  return [];
}

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('resourceSelection');
      if (stored.resourceSelection !== undefined) {
        resourceSelection.value = normalizeResourceSelection(stored.resourceSelection);
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.resourceSelection) {
        resourceSelection.value = normalizeResourceSelection(changes.resourceSelection.newValue);
      }
    });
  }
});

async function togglePin(key: string) {
  const currentList = Array.isArray(resourceSelection.value) ? resourceSelection.value : [];
  const next = new Set(currentList);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  resourceSelection.value = [...next];

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ resourceSelection: resourceSelection.value });
  }
}

const allResources = computed(() => {
  const list: any[] = [];
  for (const [key, val] of Object.entries(cache.value)) {
    if (key.startsWith('resource:') && val?.data && Number.isFinite(val.data.amount)) {
      const entry = { key, data: val.data };
      const label = resourceLabel(entry);
      const isSelectable = isSelectableForHeader(entry);
      const appearance = resourceAppearance(entry);
      const amount = getAmountAt(entry, now.value);
      list.push({
        key,
        label,
        amount,
        cap: val.data.cap,
        appearance,
        isSelectable,
        isPinned: Array.isArray(resourceSelection.value) && resourceSelection.value.includes(key),
      });
    }
  }
  return list;
});

const filteredResources = computed(() => {
  const q = search.value.trim().toLowerCase();
  return allResources.value.filter((r) => {
    if (q && !r.label.toLowerCase().includes(q) && !r.key.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
});
</script>

<template>
  <div class="space-y-4">
    <!-- Filter Toolbar -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 flex-1 max-w-sm">
        <input
          v-model="search"
          type="search"
          placeholder="Search resource name or ID..."
          class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
        />
      </div>

      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span>Check box to pin resource to the top header</span>
      </div>
    </div>

    <!-- Resource Cards Grid -->
    <div v-if="filteredResources.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No resources found matching search query.
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
      <div
        v-for="r in filteredResources"
        :key="r.key"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs flex items-center justify-between gap-2 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
      >
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            class="size-8 rounded-lg flex items-center justify-center text-base shrink-0 ring-1"
            :class="r.appearance.classes"
          >
            {{ r.appearance.icon }}
          </span>

          <div class="min-w-0 flex-1">
            <div class="font-bold text-xs text-slate-900 dark:text-slate-100 truncate" :title="r.label">
              {{ r.label }}
            </div>
            <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{{ formatResourceAmount(r.amount) }}</span>
              <span v-if="r.cap" class="text-slate-400"> / {{ formatResourceAmount(r.cap) }}</span>
            </div>
          </div>
        </div>

        <!-- Pin to Header Checkbox -->
        <label
          v-if="r.isSelectable"
          class="cursor-pointer inline-flex items-center p-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
          title="Pin to Header"
        >
          <input
            type="checkbox"
            :checked="r.isPinned"
            class="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            @change="togglePin(r.key)"
          />
        </label>
      </div>
    </div>
  </div>
</template>
