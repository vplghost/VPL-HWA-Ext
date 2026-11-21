<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRecorder } from '@/src/composables/useRecorder';
import { downloadJson } from '@/src/utils/metadata';
import {
  createConfigExportPayload,
  createFullDataExportPayload,
  prepareImportUpdates,
  executeStoragePrune,
} from '@/src/utils/dataBackup';

const { logs, activeCount, interactionCount, isRecording, filteredLogs, search, sort, error, busy, control } = useRecorder();

async function exportLogs() {
  const payload = await control('record-export');
  if (payload) downloadJson(`hwa-api-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, payload);
}

// Backup & Restore state
const overwriteExisting = ref(true);
const importStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const pruneStatus = ref<{ type: 'success' | 'error'; message: string; details?: string[] } | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isExporting = ref(false);
const isPruning = ref(false);

async function handlePruneStorage() {
  if (isPruning.value) return;
  isPruning.value = true;
  pruneStatus.value = null;
  try {
    const summary = await executeStoragePrune();
    const total = summary.totalPrunedKeys;
    const itemsText = total === 1 ? '1 item' : `${total} items`;
    pruneStatus.value = {
      type: 'success',
      message: total > 0
        ? `Cleaned ${itemsText} from local storage (${summary.removedInteractions} interactions, ${summary.removedLegacyKeys} legacy keys, ${summary.trimmedLogEntries} log entries trimmed).`
        : 'Storage is already clean. No obsolete or bloated items found.',
      details: summary.details,
    };
  } catch (err: any) {
    pruneStatus.value = {
      type: 'error',
      message: `Prune failed: ${err?.message || err}`,
    };
  } finally {
    isPruning.value = false;
  }
}

async function exportConfig() {
  isExporting.value = true;
  importStatus.value = null;
  try {
    const all = (typeof chrome !== 'undefined' && chrome.storage?.local?.get)
      ? await chrome.storage.local.get(null)
      : {};
    const payload = createConfigExportPayload(all);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`hwa-config-${dateStr}.json`, payload);
  } catch (err: any) {
    importStatus.value = { type: 'error', message: `Export config failed: ${err?.message || err}` };
  } finally {
    isExporting.value = false;
  }
}

async function exportAllData() {
  isExporting.value = true;
  importStatus.value = null;
  try {
    const all = (typeof chrome !== 'undefined' && chrome.storage?.local?.get)
      ? await chrome.storage.local.get(null)
      : {};
    const payload = createFullDataExportPayload(all);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`hwa-full-data-${dateStr}.json`, payload);
  } catch (err: any) {
    importStatus.value = { type: 'error', message: `Export all data failed: ${err?.message || err}` };
  } finally {
    isExporting.value = false;
  }
}

function triggerImportPicker() {
  importStatus.value = null;
  fileInputRef.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importStatus.value = null;

  try {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      importStatus.value = { type: 'error', message: 'Invalid file: Unable to parse JSON format.' };
      return;
    }

    const currentLocal = (typeof chrome !== 'undefined' && chrome.storage?.local?.get)
      ? await chrome.storage.local.get(null)
      : {};

    const prep = prepareImportUpdates(parsed, currentLocal, overwriteExisting.value);
    if (!prep.success || !prep.updates) {
      importStatus.value = { type: 'error', message: prep.error || 'Import failed.' };
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set(prep.updates);
    }

    const modeText = overwriteExisting.value ? 'overwrite' : 'merge (preserve local values)';
    importStatus.value = {
      type: 'success',
      message: `Successfully imported ${prep.keysCount} data items (${modeText})!`,
    };
  } catch (err: any) {
    importStatus.value = { type: 'error', message: `Import error: ${err?.message || err}` };
  } finally {
    if (input) input.value = '';
  }
}

</script>

<template>
  <div class="space-y-3">
    <!-- Backup, Export & Import Section -->
    <section
      id="data-backup-section"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3 shadow-xs"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">💾</span>
          <div>
            <h3 class="text-xs font-bold text-slate-800 dark:text-slate-100">
              Data & Configuration Management
            </h3>
            <p class="text-[10px] text-slate-400">
              Backup configs or full user data (teams, queues, income, settings) and restore across machines
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons Row -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Export Group -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Export Config Button -->
          <button
            type="button"
            id="export-config-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            :disabled="isExporting"
            @click="exportConfig"
          >
            <span>⚙️</span>
            <span>Export Config</span>
          </button>

          <!-- Export All Data Button -->
          <button
            type="button"
            id="export-all-data-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
            :disabled="isExporting"
            @click="exportAllData"
          >
            <span>📦</span>
            <span>Export All Data</span>
          </button>

          <!-- Prune Storage Button -->
          <button
            type="button"
            id="prune-storage-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-xs font-semibold text-amber-800 dark:text-amber-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            :disabled="isPruning || isExporting"
            @click="handlePruneStorage"
          >
            <span>🧹</span>
            <span>{{ isPruning ? 'Pruning...' : 'Prune Old Data' }}</span>
          </button>
        </div>

        <!-- Import Group -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Overwrite Checkbox -->
          <label class="inline-flex items-center gap-1.5 cursor-pointer text-xs select-none text-slate-600 dark:text-slate-300">
            <input
              id="import-overwrite-checkbox"
              v-model="overwriteExisting"
              type="checkbox"
              class="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span class="text-[11px] font-medium">Overwrite local values</span>
          </label>

          <!-- Hidden File Input -->
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="handleFileSelect"
          />

          <!-- Import Button -->
          <button
            type="button"
            id="import-data-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
            @click="triggerImportPicker"
          >
            <span>📥</span>
            <span>Import Backup JSON</span>
          </button>
        </div>
      </div>

      <!-- Import Feedback Alert Banner -->
      <div
        v-if="importStatus"
        id="import-status-banner"
        class="rounded-lg p-2.5 text-xs flex items-center justify-between gap-2 border"
        :class="
          importStatus.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
        "
      >
        <div class="flex items-center gap-2">
          <span>{{ importStatus.type === 'success' ? '✅' : '⚠️' }}</span>
          <span class="font-medium">{{ importStatus.message }}</span>
        </div>
        <button
          type="button"
          class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold px-1"
          @click="importStatus = null"
        >
          ✕
        </button>
      </div>

      <!-- Prune Storage Feedback Alert Banner -->
      <div
        v-if="pruneStatus"
        id="prune-status-banner"
        class="rounded-lg p-2.5 text-xs flex items-center justify-between gap-2 border"
        :class="
          pruneStatus.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
        "
      >
        <div class="flex items-center gap-2">
          <span>{{ pruneStatus.type === 'success' ? '🧹' : '⚠️' }}</span>
          <span class="font-medium">{{ pruneStatus.message }}</span>
        </div>
        <button
          type="button"
          class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold px-1"
          @click="pruneStatus = null"
        >
          ✕
        </button>
      </div>
    </section>

    <!-- Toolbar for API Logs -->
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
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <div class="flex items-center gap-2">
        <span v-if="isRecording" class="flex items-center gap-1.5 text-rose-500 font-semibold">
          <span class="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          <span>Recording: {{ logs.length || activeCount }} API, {{ interactionCount }} UI</span>
        </span>
        <span v-else>
          {{ filteredLogs.length }} / {{ logs.length || activeCount }} entries {{ interactionCount > 0 ? `(${interactionCount} UI)` : '' }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="sort" aria-label="Sort API logs" class="rounded border p-1 dark:bg-slate-900">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          <option value="duration-desc">Slowest first</option><option value="duration-asc">Fastest first</option>
        </select>
      </div>
    </div>

    <!-- Logs list -->
    <div v-if="filteredLogs.length === 0" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      <div v-if="isRecording" class="flex flex-col items-center gap-2 text-rose-500">
        <span class="inline-block w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
        <span>Recording in progress... Intercepting game actions ({{ logs.length || activeCount }} API, {{ interactionCount }} UI captured)</span>
      </div>
      <span v-else>No API logs captured yet in this session.</span>
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
