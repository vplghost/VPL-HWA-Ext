<script setup lang="ts">
import { useRecorder } from '@/src/composables/useRecorder';
import { downloadJson } from '@/src/utils/metadata';

const { logs, filteredLogs, search, sort, error, busy, control } = useRecorder();
async function exportLogs() {
  const payload = await control('record-export');
  if (payload) downloadJson(`hwa-api-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, payload);
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
          :disabled="busy" @click="control('record-clear')"
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

    <p v-if="error" role="alert" class="text-rose-600">{{ error }}</p>
    <div class="flex items-center gap-2 text-xs text-slate-500">
      <span>{{ filteredLogs.length }} / {{ logs.length }} entries</span>
      <select v-model="sort" aria-label="Sort API logs" class="rounded border p-1 dark:bg-slate-900">
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
        <option value="duration-desc">Slowest first</option><option value="duration-asc">Fastest first</option>
      </select>
    </div>
    <!-- Logs list -->
    <div v-if="filteredLogs.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No API logs captured yet in this session.
    </div>

    <div v-else class="space-y-1.5 max-h-96 overflow-y-auto">
      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2"
      >
        <div class="flex items-center gap-2">
          <span :class="log.outcome !== 'failed' ? 'text-emerald-500' : 'text-rose-500'">●</span>
          <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{{ log.method }} {{ log.topic || log.endpoint }}</span>
        </div>
        <div class="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
          <span>{{ log.durationMs }}ms</span>
          <span>{{ new Date(log.timestamp || '').toLocaleTimeString() }}</span>
        </div>
        <details v-if="log.payload != null || log.requestBody != null || log.responseBody != null">
          <summary class="cursor-pointer text-blue-600">Request / response / MQTT payload</summary>
          <pre class="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-100 dark:bg-slate-800 p-2">{{ log.payload ?? log.requestBody ?? '(no request body)' }}</pre>
          <pre v-if="log.responseBody != null" class="max-h-60 overflow-auto whitespace-pre-wrap break-all p-2">{{ log.responseBody }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>
