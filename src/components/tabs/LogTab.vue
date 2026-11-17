<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRecorder } from '@/src/composables/useRecorder';
import { downloadJson } from '@/src/utils/metadata';
import {
  createConfigExportPayload,
  createFullDataExportPayload,
  prepareImportUpdates,
} from '@/src/utils/dataBackup';

const { logs, filteredLogs, search, sort, error, busy, control } = useRecorder();

async function exportLogs() {
  const payload = await control('record-export');
  if (payload) downloadJson(`hwa-api-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, payload);
}

// Backup & Restore state
const overwriteExisting = ref(true);
const importStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isExporting = ref(false);

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
      importStatus.value = { type: 'error', message: 'Tệp không hợp lệ: Không thể đọc định dạng JSON.' };
      return;
    }

    const currentLocal = (typeof chrome !== 'undefined' && chrome.storage?.local?.get)
      ? await chrome.storage.local.get(null)
      : {};

    const prep = prepareImportUpdates(parsed, currentLocal, overwriteExisting.value);
    if (!prep.success || !prep.updates) {
      importStatus.value = { type: 'error', message: prep.error || 'Import thất bại.' };
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set(prep.updates);
    }

    const modeText = overwriteExisting.value ? 'ghi đè' : 'hợp nhất giữ nguyên giá trị máy này';
    importStatus.value = {
      type: 'success',
      message: `Import thành công ${prep.keysCount} mục dữ liệu (${modeText})!`,
    };
  } catch (err: any) {
    importStatus.value = { type: 'error', message: `Import lỗi: ${err?.message || err}` };
  } finally {
    if (input) input.value = '';
  }
}

// Legends Draft Logging state & actions
const legendDraftLoggingEnabled = ref(false);
const draftLogsCount = ref(0);
const lastDraftMatchId = ref<string | number | null>(null);
const draftLogStatus = ref<string | null>(null);

async function loadDraftLogStats() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  try {
    const stored = await chrome.storage.local.get([
      'legendDraftLoggingEnabled',
      'legendDraftSessionLog',
      'rpcCache'
    ]);
    legendDraftLoggingEnabled.value = Boolean(stored.legendDraftLoggingEnabled);
    draftLogsCount.value = Array.isArray(stored.legendDraftSessionLog) ? stored.legendDraftSessionLog.length : 0;
    lastDraftMatchId.value = stored.rpcCache?.legendDraft?.matchId || null;
  } catch (_) {}
}

async function handleDraftLoggingToggle() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  try {
    await chrome.storage.local.set({ legendDraftLoggingEnabled: legendDraftLoggingEnabled.value });
    draftLogStatus.value = legendDraftLoggingEnabled.value
      ? 'Draft session logging enabled. RPC steps and WebAssembly memory scans will be recorded.'
      : 'Draft session logging disabled.';
  } catch (err: any) {
    draftLogStatus.value = `Failed to update settings: ${err?.message || err}`;
  }
}

async function exportDraftLog() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  try {
    const stored = await chrome.storage.local.get([
      'legendDraftSessionLog',
      'legendDraftHookTelemetry',
      'rpcCache'
    ]);
    const logs = Array.isArray(stored.legendDraftSessionLog) ? stored.legendDraftSessionLog : [];
    let matchId = stored.rpcCache?.legendDraft?.matchId ||
      stored.rpcCache?.legendDraftStatus?.data?.matchId ||
      stored.legendDraftHookTelemetry?.matchId || null;
    if (!matchId && logs.length > 0) {
      for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        const m = l.out?.matchId || l.in?.matchId || l.matchId;
        if (m) { matchId = m; break; }
      }
    }

    let candidates = stored.rpcCache?.legendDraft?.candidates ||
      stored.legendDraftHookTelemetry?.topCandidateIds || [];
    if ((!Array.isArray(candidates) || candidates.length === 0) && logs.length > 0) {
      for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        if (Array.isArray(l.topCandidateIds) && l.topCandidateIds.length > 0) {
          candidates = l.topCandidateIds;
          break;
        }
      }
    }

    const payload = {
      _format: 'hwa-legend-draft-session-log',
      _version: 2,
      _exportedAt: new Date().toISOString(),
      matchId,
      candidates,
      lastTelemetry: stored.legendDraftHookTelemetry || null,
      entriesCount: logs.length,
      logs
    };
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`hwa-legend-draft-session-${dateStr}.json`, payload);
    draftLogStatus.value = `Exported ${payload.entriesCount} draft log lines to JSON successfully!`;
  } catch (err: any) {
    draftLogStatus.value = `Failed to export draft log: ${err?.message || err}`;
  }
}

async function clearDraftLog() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  try {
    await chrome.storage.local.set({ legendDraftSessionLog: [] });
    draftLogsCount.value = 0;
    draftLogStatus.value = 'Cleared all current draft session logs.';
  } catch (err: any) {
    draftLogStatus.value = `Failed to clear draft log: ${err?.message || err}`;
  }
}

let draftStorageListener: ((changes: any, area: string) => void) | null = null;

onMounted(() => {
  loadDraftLogStats();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    draftStorageListener = (changes: any, area: string) => {
      if (area !== 'local') return;
      if ('legendDraftLoggingEnabled' in changes) {
        legendDraftLoggingEnabled.value = changes.legendDraftLoggingEnabled.newValue === true;
      }
      if ('legendDraftSessionLog' in changes) {
        draftLogsCount.value = Array.isArray(changes.legendDraftSessionLog.newValue)
          ? changes.legendDraftSessionLog.newValue.length
          : 0;
      }
      if ('rpcCache' in changes) {
        lastDraftMatchId.value = changes.rpcCache.newValue?.legendDraft?.matchId || null;
      }
    };
    chrome.storage.onChanged.addListener(draftStorageListener);
  }
});

onUnmounted(() => {
  if (draftStorageListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(draftStorageListener);
  }
});
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
    </section>

    <!-- Legends Draft Diagnostics & Session Log Section -->
    <section
      id="legend-draft-log-section"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3 shadow-xs"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🛡️</span>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-bold text-slate-800 dark:text-slate-100">
                Legends Draft (randomDraft) Diagnostics & Hook Logs
              </h3>
              <span
                v-if="draftLogsCount > 0"
                id="draft-logs-count-badge"
                class="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
              >
                {{ draftLogsCount }} entries
              </span>
            </div>
            <p class="text-[10px] text-slate-400">
              Capture RPC transactions (inputs & outputs) and WebAssembly memory scans (Unity HEAPU8/HEAPU32) for current draft session
            </p>
          </div>
        </div>

        <!-- Toggle Switch -->
        <label class="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            id="toggle-draft-logging"
            v-model="legendDraftLoggingEnabled"
            type="checkbox"
            class="sr-only peer"
            @change="handleDraftLoggingToggle"
          />
          <div class="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600 relative"></div>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {{ legendDraftLoggingEnabled ? 'Draft Logging Enabled' : 'Draft Logging Disabled' }}
          </span>
        </label>
      </div>

      <!-- Action Row -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-[11px] text-slate-500">
          <span v-if="lastDraftMatchId">Latest Draft match: <code class="font-mono font-semibold text-slate-700 dark:text-slate-300">#{{ lastDraftMatchId }}</code></span>
          <span v-else>No draft match recorded in this session yet.</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            id="clear-draft-log-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 font-medium transition-colors"
            :disabled="draftLogsCount === 0"
            @click="clearDraftLog"
          >
            Clear Draft Logs
          </button>
          <button
            type="button"
            id="export-draft-log-btn"
            class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="draftLogsCount === 0"
            @click="exportDraftLog"
          >
            <span>📥</span>
            <span>Export Draft Session Log</span>
          </button>
        </div>
      </div>

      <!-- Status banner -->
      <div
        v-if="draftLogStatus"
        id="draft-log-status-banner"
        class="text-xs p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
      >
        <span>{{ draftLogStatus }}</span>
        <button
          type="button"
          class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold px-1"
          @click="draftLogStatus = null"
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
