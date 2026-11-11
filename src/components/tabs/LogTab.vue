<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface ApiLogEntry {
  id: string;
  name: string;
  timestamp: number;
  durationMs: number;
  status: 'ok' | 'error';
  calls?: any[];
}

const logs = ref<ApiLogEntry[]>([]);
const search = ref('');

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get('apiLogs');
      if (Array.isArray(stored.apiLogs)) {
        logs.value = stored.apiLogs;
      }
    } catch (_) {}
  }
});

function clearLogs() {
  logs.value = [];
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    chrome.storage.local.set({ apiLogs: [] }).catch(() => {});
  }
}

function exportLogs() {
  const json = JSON.stringify(logs.value, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hwa-api-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="space-y-3">
    <!-- Toolbar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
      <div class="relative w-full sm:w-64">
        <input
          v-model="search"
          type="search"
          placeholder="Filter logs by RPC name..."
          class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
        />
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
      </div>

      <div class="flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 font-medium transition-colors"
          @click="clearLogs"
        >
          Clear
        </button>
        <button
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          @click="exportLogs"
        >
          Export JSON
        </button>
      </div>
    </div>

    <!-- Logs list -->
    <div v-if="logs.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No API logs captured yet in this session.
    </div>

    <div v-else class="space-y-1.5 max-h-96 overflow-y-auto">
      <div
        v-for="log in logs"
        :key="log.id"
        class="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
      >
        <div class="flex items-center gap-2">
          <span :class="log.status === 'ok' ? 'text-emerald-500' : 'text-rose-500'">●</span>
          <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{{ log.name }}</span>
        </div>
        <div class="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
          <span>{{ log.durationMs }}ms</span>
          <span>{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
