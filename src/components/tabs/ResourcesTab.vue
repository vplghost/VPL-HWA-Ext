<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNow } from '@/src/composables/useNow';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useResourceSelection } from '@/src/composables/useResourceSelection';
import { downloadJson } from '@/src/utils/metadata';
import {
  formatResourceAmount,
  getAmountAt,
  resourceAppearance,
  resourceLabel,
  isSelectableForHeader,
  isListedInventoryItem,
} from '@/src/utils/resourceData';

const { cache, dispatchRpc } = useRpcCache();
const { togglePin, isPinned } = useResourceSelection();

const now = useNow();
const search = ref('');
const filterPinnedOnly = ref(false);
const isRefreshing = ref(false);

const allResources = computed(() => {
  const list: any[] = [];
  for (const [key, val] of Object.entries(cache.value)) {
    if (key.startsWith('resource:') && val?.data && Number.isFinite(val.data.amount) &&
        !isListedInventoryItem({ key }, cache.value.inventoryGet?.data)) {
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
        isPinned: isPinned(key),
      });
    }
  }
  return list;
});

const pinnedResourceCount = computed(() => allResources.value.filter(resource => resource.isPinned).length);

const filteredResources = computed(() => {
  const q = search.value.trim().toLowerCase();
  return allResources.value.filter((r) => {
    if (filterPinnedOnly.value && !r.isPinned) {
      return false;
    }
    if (q && !r.label.toLowerCase().includes(q) && !r.key.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
});

async function refreshResources() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'inventoryGet' }]);
  } finally {
    isRefreshing.value = false;
  }
}

function exportResourcesJson() {
  downloadJson('hwa-resources.json', filteredResources.value.map(resource => ({
    key: resource.key,
    name: resource.label,
    amount: resource.amount,
    cap: resource.cap,
  })));
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filter Toolbar -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2 flex-1 min-w-0 basis-64">
        <div class="relative min-w-0 flex-1">
          <input
            v-model="search"
            type="search"
            aria-label="Search resources"
            placeholder="Search resource name or ID..."
            class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>

        <button
          type="button"
          :class="filterPinnedOnly
            ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800 font-semibold'
            : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'"
          class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors shrink-0"
          @click="filterPinnedOnly = !filterPinnedOnly"
        >
          <span>📌 Pinned only</span>
          <span v-if="pinnedResourceCount > 0" class="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">
            {{ pinnedResourceCount }}
          </span>
        </button>
      </div>

      <div class="flex items-center gap-2 text-xs shrink-0 sm:ml-auto">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {{ formatResourceAmount(filteredResources.length) }} resources
        </span>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- Export JSON button -->
          <button
            id="btn-toolbar-export-resources"
            type="button"
            class="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            title="Export resources data as JSON"
            @click="exportResourcesJson"
          >
            📥 Export
          </button>

          <!-- Refresh button -->
          <button
            id="btn-toolbar-refresh-resources"
            type="button"
            :disabled="isRefreshing"
            class="cursor-pointer rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="Refresh resources via RPC"
            @click="refreshResources"
          >
            <span :class="{ 'inline-block animate-spin': isRefreshing }">🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Resource Cards Grid -->
    <div v-if="filteredResources.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No resources found matching search query.
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2">
      <div
        v-for="r in filteredResources"
        :key="r.key"
        class="min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-xs flex items-center justify-between gap-2 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span
            class="size-7 rounded-md flex items-center justify-center text-sm shrink-0 ring-1"
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

        <!-- Pin to Header Toggle Button -->
        <div v-if="r.isSelectable" class="shrink-0 flex items-center">
          <button
            type="button"
            :aria-checked="r.isPinned"
            role="checkbox"
            :title="r.isPinned ? 'Unpin from header' : 'Pin to header'"
            :aria-label="`${r.isPinned ? 'Unpin' : 'Pin'} ${r.label} ${r.isPinned ? 'from' : 'to'} header`"
            class="cursor-pointer inline-flex size-7 items-center justify-center rounded-md text-xs transition-colors"
            :class="r.isPinned
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-800'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
            @click.stop="togglePin(r.key)"
          >
            <span aria-hidden="true">📌</span>
            <span class="sr-only">{{ r.isPinned ? 'Pinned' : 'Pin' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
