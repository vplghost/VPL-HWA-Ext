<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { engineDiagnostics } from '@/src/composables/engineDiagnostics';
import { useTheme } from '@/src/composables/useTheme';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useGameConnection } from '@/src/composables/useGameConnection';
import '@/src/utils/metadata';
import { usePopupAutomation } from '@/src/composables/usePopupAutomation';
import { useFreeSpinAutomation } from '@/src/composables/useFreeSpinAutomation';
import { useFrontierAutomation } from '@/src/composables/useFrontierAutomation';
import { useDraft } from '@/src/composables/useDraft';
import { TROOP_DEFS, getBuildingTrainingCapacity, getUnlockedTroopLevels } from '@/src/utils/troops';
import { DEFAULT_WASM_PROFILE_VERSION } from '@/src/data/wasmSymbols';
import type { ThemeMode, TroopTrainSettings } from '@/src/types';

const { theme, applyTheme } = useTheme();
const { recordingState, cache, updateRecordingState } = useRpcCache();
const isTogglingRecording = ref(false);
const { autoClaimSettings, priorityAutoJoin, teams: autoJoinTeams, pending: pendingClaims, selectedCount, busy: claimBusy, message: claimMessage, saveAutoClaim, savePriorityJoin, claimRewards } = usePopupAutomation(cache);
const { hasGameTab, isHealthy, alertMessage, isRefreshing, reloadGameTab, gameEngineStatus, checkStatus } = useGameConnection();
const engine = computed(() => engineDiagnostics(gameEngineStatus.value));
const enginePingMessage = ref('');
const enginePingPending = ref(false);
const wasmTestPending = ref(false);
const wasmTestResult = ref<any>(null);
const wasmTestError = ref<string | null>(null);
const wasmTestErrorDetail = ref<any>(null);
const showWasmDiagnostics = ref(false);
const wasmCallPending = ref(false);
const wasmCallResult = ref<any>(null);
const wasmCallError = ref<string | null>(null);
const wasmCallErrorDetail = ref<any>(null);
const showWasmCallDiagnostics = ref(false);

// WASM Symbol Profile & Override
const wasmProfileVersion = DEFAULT_WASM_PROFILE_VERSION;
const cachedGameVersion = ref<string | null>(null);
const wasmOverrideText = ref('');
const wasmOverrideActive = ref(false);
const wasmOverrideStatus = ref('');
const wasmOverrideError = ref('');
const showWasmOverrideEditor = ref(false);

const liveGameVersion = computed<string | null>(() => {
  return (
    cachedGameVersion.value ||
    (gameEngineStatus.value as any)?.gameVersion ||
    (cache.value as any)?.gameVersion ||
    null
  );
});

const wasmVersionMismatch = computed<boolean>(() => {
  if (!liveGameVersion.value || !wasmProfileVersion) return false;
  return liveGameVersion.value !== wasmProfileVersion;
});

async function applyWasmOverride() {
  wasmOverrideError.value = '';
  wasmOverrideStatus.value = '';
  const raw = wasmOverrideText.value.trim();
  if (!raw) {
    wasmOverrideError.value = 'Please paste a valid JSON object (e.g. {"symbols":{"Play_ctor":291996}}).';
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Override must be a JSON object.');
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ wasmSymbolOverrides: parsed });
    }
    wasmOverrideActive.value = true;
    wasmOverrideStatus.value = 'Symbol override saved and pushed to active game tabs.';
  } catch (err: any) {
    wasmOverrideError.value = `Invalid JSON: ${err?.message || String(err)}`;
  }
}

async function resetWasmOverride() {
  wasmOverrideError.value = '';
  wasmOverrideStatus.value = '';
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
    await chrome.storage.local.remove('wasmSymbolOverrides');
  }
  wasmOverrideText.value = '';
  wasmOverrideActive.value = false;
  wasmOverrideStatus.value = `Reset to built-in WASM profile v${wasmProfileVersion}.`;
}

// Storage & Runtime Telemetry (P1-03)
const storageTelemetry = ref<any>(null);
const storageTelemetryLoading = ref(false);
const storageCompactPending = ref(false);
const storageCompactMessage = ref('');

function formatBytes(bytes: number | undefined): string {
  const b = Number(bytes) || 0;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

async function refreshStorageTelemetry() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  storageTelemetryLoading.value = true;
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'get-storage-telemetry' });
    if (res && typeof res === 'object' && !res.error) {
      storageTelemetry.value = res;
    }
  } catch (_) {
  } finally {
    storageTelemetryLoading.value = false;
  }
}

async function compactStorageCache() {
  if (storageCompactPending.value || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  storageCompactPending.value = true;
  storageCompactMessage.value = '';
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'compact-storage-cache' });
    if (res?.ok) {
      storageCompactMessage.value = `Compacted cache (${res.removedCount || 0} stale entries pruned, ${res.legacyKeysRemoved || 0} legacy recorder keys removed).`;
      if (res.snapshot) storageTelemetry.value = res.snapshot;
    } else {
      storageCompactMessage.value = res?.error || 'Compact cache failed.';
    }
  } catch (err: any) {
    storageCompactMessage.value = err?.message || String(err);
  } finally {
    storageCompactPending.value = false;
  }
}
const { enabled: autoFreeSpinEnabled, status: autoFreeSpinStatus, save: saveAutoFreeSpin } = useFreeSpinAutomation();
const { enabled: autoFrontierEnabled, status: autoFrontierStatus, save: saveAutoFrontier } = useFrontierAutomation();
const { autoOpenDraft, saveAutoOpen: saveDraftAutoOpen } = useDraft();

// Auto Troop Training
const autoTrainEnabled = ref(false);
const autoTrainLevels = ref<Record<number, number>>({});
const autoTrainState = ref<{
  status?: string;
  lastError?: string | null;
  lastRunAt?: number;
  nextWakeAt?: number | null;
} | null>(null);
const autoTrainTickPending = ref(false);

async function loadTroopTrainSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['troopTrainSettings', 'autoTrainState']);
      if (stored.troopTrainSettings) {
        autoTrainEnabled.value = stored.troopTrainSettings.autoTrainEnabled === true;
        if (stored.troopTrainSettings.trainLevels) {
          autoTrainLevels.value = { ...stored.troopTrainSettings.trainLevels };
        }
      }
      if (stored.autoTrainState) {
        autoTrainState.value = stored.autoTrainState;
      }
    } catch (_) {}
  }
}

async function saveAutoTrain() {
  const trainLevels: Record<number, number> = {};
  for (const item of troopSettingsList.value) {
    const val = Number(autoTrainLevels.value[item.type] ?? item.selectedLevel);
    if (Number.isInteger(val) && val >= 1 && val <= 10) {
      trainLevels[item.type] = val;
    }
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      const existing = await chrome.storage.local.get('troopTrainSettings');
      const payload: TroopTrainSettings = {
        ...(existing?.troopTrainSettings || {}),
        autoTrainEnabled: autoTrainEnabled.value,
        trainLevels,
      };
      await chrome.storage.local.set({ troopTrainSettings: payload });
      if (autoTrainEnabled.value && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ kind: 'auto-train-tick' }).catch(() => {});
      }
    } catch (_) {}
  }
}

function onAutoTrainLevelChange(type: number, event: Event) {
  const target = event.target as HTMLSelectElement;
  const val = parseInt(target.value, 10);
  if (!isNaN(val) && val >= 1 && val <= 10) {
    autoTrainLevels.value = { ...autoTrainLevels.value, [type]: val };
    saveAutoTrain();
  }
}

async function triggerAutoTrainNow() {
  if (autoTrainTickPending.value || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  autoTrainTickPending.value = true;
  try {
    await chrome.runtime.sendMessage({ kind: 'auto-train-tick', force: true });
    await loadTroopTrainSettings();
  } catch (_) {
  } finally {
    autoTrainTickPending.value = false;
  }
}

const troopSettingsList = computed(() => {
  return TROOP_DEFS.map((def) => {
    const cap = getBuildingTrainingCapacity(def.type, cache?.value);
    const savedLvl = autoTrainLevels.value[def.type];
    const unlocked = getUnlockedTroopLevels(def.type, cache?.value, savedLvl);
    const selectedLevel =
      typeof savedLvl === 'number' && unlocked.includes(savedLvl)
        ? savedLvl
        : unlocked[unlocked.length - 1];
    return {
      ...def,
      trainingCapacity: cap,
      unlockedLevels: unlocked,
      selectedLevel,
    };
  });
});
async function pingEngine() {
  enginePingPending.value = true;
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'engine-ping' });
    if (!response?.ok) throw new Error(response?.error || 'No active Hero Wars tab found.');
    enginePingMessage.value = 'Ping sent. Waiting for engine status.';
    await checkStatus();
  } catch (cause) { enginePingMessage.value = String(cause); }
  finally { enginePingPending.value = false; }
}

async function testWasmEngine() {
  wasmTestPending.value = true;
  wasmTestResult.value = null;
  wasmTestError.value = null;
  wasmTestErrorDetail.value = null;
  showWasmDiagnostics.value = false;
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'test-wasm-engine' });
    if (!response) throw new Error('No response from game tab or extension background.');
    if (response.ok && response.result) {
      wasmTestResult.value = response.result;
    } else {
      wasmTestError.value = response.error || 'WASM engine diagnostic probe failed.';
      if (response.errorDetail) wasmTestErrorDetail.value = response.errorDetail;
    }
  } catch (cause: any) {
    wasmTestError.value = cause?.message || String(cause);
  } finally {
    wasmTestPending.value = false;
  }
}

async function testWasmCall() {
  wasmCallPending.value = true;
  wasmCallResult.value = null;
  wasmCallError.value = null;
  wasmCallErrorDetail.value = null;
  showWasmCallDiagnostics.value = false;
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'test-wasm-call' });
    if (!response) throw new Error('No response from game tab or extension background.');
    if (response.ok && response.result) {
      wasmCallResult.value = response.result;
    } else {
      wasmCallError.value = response.error || 'WASM engine live call probe failed.';
      if (response.errorDetail) wasmCallErrorDetail.value = response.errorDetail;
    }
  } catch (cause: any) {
    wasmCallError.value = cause?.message || String(cause);
  } finally {
    wasmCallPending.value = false;
  }
}

const dispatchMode = ref<'piggyback' | 'direct'>('direct');
const popupRpcEnabled = ref(true);
const interceptEnabled = ref(true);
const mqttCaptureEnabled = ref(true);

const DEFAULT_TAB_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'items', label: 'Items' },
  { id: 'resources', label: 'Resources' },
  { id: 'titans', label: 'Titans' },
  { id: 'teams', label: 'Teams' },
  { id: 'events', label: 'Events' },
  { id: 'goals', label: 'Goals' },
  { id: 'guild', label: 'Guild' },
];

interface TabSettingItem {
  id: string;
  label: string;
  visible: boolean;
}

const tabSettings = ref<TabSettingItem[]>(
  DEFAULT_TAB_ITEMS.map((t) => ({ ...t, visible: true }))
);

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored: Record<string, any> = await chrome.storage.local.get([
        'dispatchMode',
        'socketRefreshMode',
        'popupRpcEnabled',
        'mqttCaptureEnabled',
        'captureSettings',
        'tabConfig',
        'wasmSymbolOverrides',
        'cachedGameVersion',
      ]);
      if (stored.cachedGameVersion) {
        cachedGameVersion.value = String(stored.cachedGameVersion);
      }
      if (stored.wasmSymbolOverrides && typeof stored.wasmSymbolOverrides === 'object') {
        wasmOverrideActive.value = true;
        wasmOverrideText.value = JSON.stringify(stored.wasmSymbolOverrides, null, 2);
      }
      const rawMode = stored.socketRefreshMode || stored.dispatchMode;
      dispatchMode.value = rawMode === 'piggyback' ? 'piggyback' : 'direct';
      popupRpcEnabled.value = stored.popupRpcEnabled !== false;
      if (stored.captureSettings?.interceptEnabled !== undefined) {
        interceptEnabled.value = stored.captureSettings.interceptEnabled !== false;
      }
      if (stored.mqttCaptureEnabled !== undefined) {
        mqttCaptureEnabled.value = stored.mqttCaptureEnabled !== false;
      } else {
        mqttCaptureEnabled.value = interceptEnabled.value;
      }
      if (Array.isArray(stored.tabConfig) && stored.tabConfig.length > 0) {
        const labelMap = new Map(DEFAULT_TAB_ITEMS.map((t) => [t.id, t.label]));
        const result: TabSettingItem[] = [];
        const seen = new Set<string>();
        for (const item of stored.tabConfig) {
          if (item && labelMap.has(item.id) && !seen.has(item.id)) {
            result.push({
              id: item.id,
              label: labelMap.get(item.id)!,
              visible: item.visible !== false,
            });
            seen.add(item.id);
          }
        }
        for (const def of DEFAULT_TAB_ITEMS) {
          if (!seen.has(def.id)) {
            result.push({ ...def, visible: true });
          }
        }
        tabSettings.value = result;
      }
      await loadTroopTrainSettings();
      void refreshStorageTelemetry();
    } catch (_) {}
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener(handleAutoTrainStorageChange);
  }
});

function handleAutoTrainStorageChange(changes: any, area: string) {
  if (area !== 'local') return;
  if (changes?.autoTrainState) {
    autoTrainState.value = changes.autoTrainState.newValue || null;
  }
  if (changes?.troopTrainSettings?.newValue) {
    autoTrainEnabled.value = changes.troopTrainSettings.newValue.autoTrainEnabled === true;
    if (changes.troopTrainSettings.newValue.trainLevels) {
      autoTrainLevels.value = { ...changes.troopTrainSettings.newValue.trainLevels };
    }
  }
  if (changes?.cachedGameVersion) {
    cachedGameVersion.value = changes.cachedGameVersion.newValue ? String(changes.cachedGameVersion.newValue) : null;
  }
  if (changes?.wasmSymbolOverrides) {
    const ov = changes.wasmSymbolOverrides.newValue;
    wasmOverrideActive.value = Boolean(ov && typeof ov === 'object');
    wasmOverrideText.value = ov ? JSON.stringify(ov, null, 2) : '';
  }
}

onUnmounted(() => {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.removeListener) {
    chrome.storage.onChanged.removeListener(handleAutoTrainStorageChange);
  }
});

async function saveTabs() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    const serialized = tabSettings.value.map((t) => ({ id: t.id, visible: t.visible }));
    await chrome.storage.local.set({ tabConfig: serialized });
  }
}

function moveTab(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= tabSettings.value.length) return;
  const item = tabSettings.value.splice(index, 1)[0];
  if (item) tabSettings.value.splice(targetIndex, 0, item);
  saveTabs();
}

function toggleTabVisible(index: number) {
  const item = tabSettings.value[index];
  if (!item) return;
  item.visible = !item.visible;
  if (!tabSettings.value.some((t) => t.visible)) {
    item.visible = true;
  }
  saveTabs();
}

function resetDefaultTabs() {
  tabSettings.value = DEFAULT_TAB_ITEMS.map((t) => ({ ...t, visible: true }));
  saveTabs();
}

function handleThemeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  applyTheme(target.value as ThemeMode);
}

async function handleModeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const newMode = target.value as 'piggyback' | 'direct';
  dispatchMode.value = newMode;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    const updates: Record<string, any> = {
      dispatchMode: newMode,
      socketRefreshMode: newMode,
    };
    if (newMode === 'direct') {
      updates.popupRpcEnabled = true;
      popupRpcEnabled.value = true;
    }
    await chrome.storage.local.set(updates);
  }
}

async function togglePopupRpc() {
  popupRpcEnabled.value = !popupRpcEnabled.value;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ popupRpcEnabled: popupRpcEnabled.value });
  }
}

async function toggleIntercept() {
  interceptEnabled.value = !interceptEnabled.value;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    const stored = await chrome.storage.local.get('captureSettings');
    await chrome.storage.local.set({
      captureSettings: {
        ...(stored.captureSettings || {}),
        interceptEnabled: interceptEnabled.value,
      },
    });
  }
}

async function toggleMqtt() {
  mqttCaptureEnabled.value = !mqttCaptureEnabled.value;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    const stored = await chrome.storage.local.get('captureSettings');
    await chrome.storage.local.set({
      mqttCaptureEnabled: mqttCaptureEnabled.value,
      captureSettings: {
        ...(stored.captureSettings || {}),
        interceptEnabled: mqttCaptureEnabled.value,
      },
    });
    interceptEnabled.value = mqttCaptureEnabled.value;
  }
}

async function toggleRecording() {
  if (isTogglingRecording.value) return;
  isTogglingRecording.value = true;
  const currentActive = Boolean(recordingState.value?.active);
  const nextKind = currentActive ? 'record-stop' : 'record-start';
  // Optimistic immediate update so the popup button responds synchronously without lag
  updateRecordingState({ active: !currentActive });
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({ kind: nextKind });
      if (res && typeof res.active === 'boolean') {
        updateRecordingState(res);
      }
    }
  } catch (err) {
    console.warn('Failed to toggle recording:', err);
    updateRecordingState({ active: currentActive });
  } finally {
    isTogglingRecording.value = false;
  }
}
</script>

<template>
  <div class="space-y-4 text-xs">
    <!-- UI & Display -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
        <span>🎨</span> Appearance & Theme
      </h3>

      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">Theme Mode</div>
          <div class="text-[11px] text-slate-400">Choose between dark gaming aesthetic, clean light mode, or system default.</div>
        </div>
        <select
          :value="theme"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          @change="handleThemeChange"
        >
          <option value="dark">🌙 Dark Mode (Default)</option>
          <option value="light">☀️ Light Mode</option>
          <option value="system">💻 System Preference</option>
        </select>
      </div>
    </div>

    <!-- Customize Tabs -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <span>📑</span> Customize Tabs
          </h3>
          <div class="text-[11px] text-slate-400 mt-0.5">Show, hide, or reorder navigation tabs.</div>
        </div>
        <button
          type="button"
          class="cursor-pointer text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          @click="resetDefaultTabs"
        >
          Reset Default
        </button>
      </div>

      <div class="space-y-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-2">
        <div
          v-for="(t, idx) in tabSettings"
          :key="t.id"
          class="flex items-center justify-between p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              :checked="t.visible"
              class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 size-4 cursor-pointer"
              @change="toggleTabVisible(idx)"
            />
            <span>{{ t.label }}</span>
          </label>

          <div class="flex items-center gap-1">
            <button
              type="button"
              class="cursor-pointer rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="idx === 0"
              title="Move Up"
              @click="moveTab(idx, 'up')"
            >
              ▲
            </button>
            <button
              type="button"
              class="cursor-pointer rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="idx === tabSettings.length - 1"
              title="Move Down"
              @click="moveTab(idx, 'down')"
            >
              ▼
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- API & Network Automation -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
        <span>⚡</span> Network & RPC Dispatch
      </h3>

      <!-- Popup RPC Master Toggle -->
      <div class="flex items-center justify-between pt-1">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">Allow Popup RPC Calls</div>
          <div class="text-[11px] text-slate-400">
            Enables background queues, battle rallies, solo monster attacks, and gathering automation.
          </div>
        </div>
        <button
          id="popup-rpc-enabled"
          type="button"
          class="cursor-pointer px-3 py-1 rounded-lg font-semibold transition-colors text-xs"
          :class="popupRpcEnabled ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
          @click="togglePopupRpc"
        >
          {{ popupRpcEnabled ? 'Enabled' : 'Disabled' }}
        </button>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">RPC Dispatch Mode</div>
          <div class="text-[11px] text-slate-400">
            Direct dispatches immediately to active game tab; Piggyback rides alongside game interaction.
          </div>
        </div>
        <select
          id="socket-refresh-mode"
          :value="dispatchMode"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          @change="handleModeChange"
        >
          <option value="direct">⚡ Direct (Fast RPC)</option>
          <option value="piggyback">🛡️ Piggyback (Safe Stealth)</option>
        </select>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">Network & API Intercept</div>
          <div class="text-[11px] text-slate-400">
            Captures game RPC fetch responses to keep heroes, queues, and resources in sync.
          </div>
        </div>
        <button
          id="intercept-enabled"
          type="button"
          class="cursor-pointer px-3 py-1 rounded-lg font-semibold transition-colors text-xs"
          :class="interceptEnabled ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
          @click="toggleIntercept"
        >
          {{ interceptEnabled ? 'Enabled' : 'Disabled' }}
        </button>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">MQTT Live Telemetry</div>
          <div class="text-[11px] text-slate-400">
            Intercepts real-time WebSocket push notifications for chat, rally results, and battle returns.
          </div>
        </div>
        <button
          type="button"
          class="cursor-pointer px-3 py-1 rounded-lg font-semibold transition-colors"
          :class="mqttCaptureEnabled ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'"
          @click="toggleMqtt"
        >
          {{ mqttCaptureEnabled ? 'Active' : 'Disabled' }}
        </button>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">Game Tab Connection</div>
          <div class="text-[11px] text-slate-400">
            {{ !hasGameTab ? 'No Hero Wars game tab found in browser.' : isHealthy ? 'Connected to active game tab and engine hooks.' : alertMessage?.body || 'Refresh recommended.' }}
          </div>
        </div>
        <button
          type="button"
          class="cursor-pointer px-3 py-1 rounded-lg font-semibold transition-all text-xs inline-flex items-center gap-1.5"
          :class="isHealthy ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white'"
          :disabled="isRefreshing"
          @click="reloadGameTab"
        >
          <span :class="{ 'animate-spin': isRefreshing }">↻</span>
          <span>{{ isRefreshing ? 'Refreshing...' : 'Refresh Game Tab' }}</span>
        </button>
      </div>
    </div>

    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <h3 class="text-sm font-bold">Auto Free Spin</h3>
      <label class="flex items-center gap-2"><input id="setting-auto-free-spin" v-model="autoFreeSpinEnabled" type="checkbox" @change="saveAutoFreeSpin" />Use free spin when its timer expires</label>
      <p class="text-xs text-slate-500">Runs while the game is open, including when this popup is closed. Uses shared RPC settings and free spins only.</p>
      <p role="status" class="text-xs text-slate-500">{{ autoFreeSpinStatus }}</p>
    </section>

    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <h3 class="text-sm font-bold">Auto Frontier Rewards</h3>
      <label class="flex items-center gap-2"><input id="setting-auto-frontier-rewards" v-model="autoFrontierEnabled" type="checkbox" @change="saveAutoFrontier" />Auto claim Frontier chest hourly (every 60 minutes)</label>
      <p class="text-xs text-slate-500">Collects accumulated Frontier (Eternal Story) chest rewards every hour while the game is open. Uses shared RPC settings.</p>
      <p role="status" class="text-xs text-slate-500">{{ autoFrontierStatus }}</p>
    </section>

    <!-- Legends Draft -->
    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold flex items-center gap-1.5">
          <span>🏆</span> Legends Draft
        </h3>
        <span
          v-if="autoOpenDraft"
          class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          Active
        </span>
      </div>
      <label class="flex items-center gap-2">
        <input
          id="setting-auto-open-draft"
          v-model="autoOpenDraft"
          type="checkbox"
          @change="saveDraftAutoOpen(autoOpenDraft)"
        />
        Auto-open Legends Draft dialog when a draft match starts
      </label>
      <p class="text-xs text-slate-500">
        Automatically opens the 15-hero candidate dialog when the game signals a Legends Draft match start or round transition (decrypted from DraftsXORCipher / session key).
      </p>
    </section>

    <!-- Auto Troop Training -->
    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>🪖</span> Auto Troop Training
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Automatically collect finished troops and train new units when queue is idle (batch size is min of max allowed and building training capacity).
          </p>
        </div>
        <span
          v-if="autoTrainEnabled"
          class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          Active
        </span>
      </div>

      <!-- Master Toggle & Status -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label for="setting-auto-train" class="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
          <input
            id="setting-auto-train"
            v-model="autoTrainEnabled"
            type="checkbox"
            class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 size-4 cursor-pointer"
            @change="saveAutoTrain"
          />
          <span>Enable Auto Troop Training</span>
        </label>
        <button
          v-if="autoTrainEnabled"
          type="button"
          :disabled="autoTrainTickPending"
          class="cursor-pointer rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          @click="triggerAutoTrainNow"
        >
          {{ autoTrainTickPending ? 'Checking...' : 'Check Now' }}
        </button>
      </div>

      <div
        v-if="autoTrainEnabled && (autoTrainState?.status || autoTrainState?.lastError)"
        class="text-xs rounded-lg px-3 py-2 border"
        :class="
          autoTrainState?.lastError
            ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
            : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-950/40 dark:border-slate-800 dark:text-slate-300'
        "
      >
        {{ autoTrainState.lastError ? `Error: ${autoTrainState.lastError}` : autoTrainState.status }}
      </div>

      <!-- Troop Types Level Selection Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div
          v-for="troop in troopSettingsList"
          :key="troop.type"
          class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1 text-xs font-semibold" :class="troop.badgeCls">
              <span>{{ troop.icon }}</span> <span>{{ troop.label }}</span>
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              Batch: <strong class="text-slate-700 dark:text-slate-200">{{ troop.trainingCapacity }}</strong>
            </span>
          </div>

          <div class="flex items-center justify-between gap-2 pt-1">
            <label :for="'auto-train-level-' + troop.type" class="text-xs text-slate-600 dark:text-slate-300">
              Train Level:
            </label>
            <select
              :id="'auto-train-level-' + troop.type"
              :value="troop.selectedLevel"
              class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
              @change="onAutoTrainLevelChange(troop.type, $event)"
            >
              <option v-for="lvl in troop.unlockedLevels" :key="lvl" :value="lvl">
                Lv.{{ lvl }}
              </option>
            </select>
          </div>

          <div class="text-[10px] text-slate-400">
            Allowed levels: Lv.{{ troop.unlockedLevels[0] }} – Lv.{{ troop.unlockedLevels[troop.unlockedLevels.length - 1] }}
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Auto Claim Freebies & Rewards</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Configure separate auto-claim rules for each daily reward channel</p>
        </div>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          {{ pendingClaims.totalCount }} total ready
        </span>
      </div>

      <!-- Freebie Groups Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <!-- 1. Mail -->
        <label for="autoclaim-opt-mail" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-mail" v-model="autoClaimSettings.mail" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>✉️ Developer Mail</span>
              <span v-if="pendingClaims.letterIds?.length" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{{ pendingClaims.letterIds.length }} ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Collect inbox letters containing rewards</div>
          </div>
        </label>

        <!-- 2. Reports -->
        <label for="autoclaim-opt-reports" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-reports" v-model="autoClaimSettings.reports" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>⚔️ Battle Reports</span>
              <span v-if="pendingClaims.hasReports" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Claim rewards from defense and battle reports</div>
          </div>
        </label>

        <!-- 3. Quests -->
        <label for="autoclaim-opt-quests" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-quests" v-model="autoClaimSettings.quests" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>📋 Daily Quests</span>
              <span v-if="pendingClaims.questIds?.length" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{{ pendingClaims.questIds.length }} ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Turn in completed daily quest rewards</div>
          </div>
        </label>

        <!-- 4. Attention Bonuses / Free Chests -->
        <label for="autoclaim-opt-attention-bonuses" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-attention-bonuses" v-model="autoClaimSettings.attentionBonuses" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>🎁 Free Chests & Gifts</span>
              <span v-if="pendingClaims.attentionBonusIds?.length" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{{ pendingClaims.attentionBonusIds.length }} ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Collect LiveOps free gifts (Energy, coins)</div>
          </div>
        </label>

        <!-- 5. Video Boxes -->
        <label for="autoclaim-opt-video-boxes" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-video-boxes" v-model="autoClaimSettings.videoBoxes" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>🎬 Video Boxes & Tickets</span>
              <span v-if="pendingClaims.videoBoxNums?.length || pendingClaims.videoTicketCount" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {{ [pendingClaims.videoBoxNums?.length ? `${pendingClaims.videoBoxNums.length} Boxes` : '', pendingClaims.videoTicketCount ? `${pendingClaims.videoTicketCount} Tickets` : ''].filter(Boolean).join(', ') }} ready
              </span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Free video mystery boxes (0-4) & Cinema tickets (up to 8/day)</div>
          </div>
        </label>

        <!-- 6. Alchemy Spin -->
        <label for="autoclaim-opt-alchemy-spin" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-alchemy-spin" v-model="autoClaimSettings.alchemySpin" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>⚗️ Alchemy Free Spin</span>
              <span v-if="pendingClaims.hasAlchemySpin" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Daily free emerald exchange roll for gold</div>
          </div>
        </label>

        <!-- 7. Valkyrie Airship Gift -->
        <label for="autoclaim-opt-airship-gift" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-airship-gift" v-model="autoClaimSettings.airshipGift" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>🎈 Airship Valkyrie Gift</span>
              <span v-if="pendingClaims.hasAirshipGift" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Collect Valkyrie daily blessing gift</div>
          </div>
        </label>

        <!-- 8. Daily Sign-In Bonus -->
        <label for="autoclaim-opt-daily-bonus" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-daily-bonus" v-model="autoClaimSettings.dailyBonus" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>📅 Daily Sign-In Bonus</span>
              <span v-if="pendingClaims.hasDailyBonus" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Claim monthly calendar login reward</div>
          </div>
        </label>

        <!-- 9. Special Offer Free Gifts (Progressive Bundles) -->
        <label for="autoclaim-opt-free-offers" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-free-offers" v-model="autoClaimSettings.freeOffers" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>✨ Special Offer Free Gifts</span>
              <span v-if="pendingClaims.freeOfferIds?.length" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{{ pendingClaims.freeOfferIds.length }} ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Claim free tiers from progressive bundle ladders and event offers</div>
          </div>
        </label>

        <!-- 10. Frontier Rewards (Eternal Story Chest) -->
        <label for="autoclaim-opt-frontier-rewards" class="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
          <input id="autoclaim-opt-frontier-rewards" v-model="autoClaimSettings.frontierRewards" type="checkbox" class="mt-0.5 rounded" @change="saveAutoClaim" />
          <div class="flex-1 text-xs">
            <div class="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
              <span>🏰 Frontier Chest</span>
              <span v-if="pendingClaims.hasFrontierRewards" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Collect accumulated Eternal Story chest rewards</div>
          </div>
        </label>
      </div>

      <!-- Trigger Option: onOpen -->
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <label for="autoclaim-opt-on-open" class="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
          <input id="autoclaim-opt-on-open" v-model="autoClaimSettings.onOpen" type="checkbox" class="rounded" @change="saveAutoClaim" />
          <span>⚡ Auto-claim all enabled groups when extension popup opens</span>
        </label>
      </div>

      <div class="flex items-center gap-3 pt-1">
        <button id="btn-claim-all" type="button" :disabled="claimBusy || !popupRpcEnabled || selectedCount === 0" @click="claimRewards"
          class="rounded-lg px-4 py-2 bg-emerald-600 text-white font-medium text-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
          Claim Selected Rewards ({{ selectedCount }})
        </button>
        <p role="status" class="text-xs text-slate-500">{{ claimMessage }}</p>
      </div>
    </section>

    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <h3 class="text-sm font-bold">Priority Rally Auto Join</h3>
      <p class="text-slate-500">Joins priority rallies using the shared RPC dispatch settings. Requires popup RPC calls.</p>
      <label class="flex items-center gap-2"><input id="setting-priority-autojoin-enabled" v-model="priorityAutoJoin.enabled" type="checkbox" @change="savePriorityJoin" />Enabled</label>
      <label class="flex items-center gap-2">Minimum monster level
        <input id="setting-priority-autojoin-min-level" v-model.number="priorityAutoJoin.minLevel" type="number" min="1" max="30" @change="savePriorityJoin" class="rounded border p-1 dark:bg-slate-800" />
      </label>
      <label class="flex items-center gap-2">Team
        <select id="setting-priority-autojoin-team" v-model="priorityAutoJoin.teamId" @change="savePriorityJoin" class="rounded border p-1 dark:bg-slate-800">
          <option v-for="team in autoJoinTeams" :key="team.id" :value="team.id">{{ team.label }}</option>
        </select>
      </label>
    </section>

    <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <h3 class="text-sm font-bold">Game Engine Diagnostics</h3>
      <p id="engine-status-badge">{{ engine.badge }}</p>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <dt>Unity instance</dt><dd id="engine-unity-instance">{{ engine.instance }}</dd>
        <dt>SendMessage</dt><dd id="engine-send-message">{{ engine.sendMessage }}</dd>
        <dt>RPC authentication headers</dt><dd id="engine-rpc-headers">{{ engine.rpcHeaders }}</dd>
        <dt>Game tab extension version</dt><dd>{{ gameEngineStatus?.extensionVersion || 'Unknown' }}</dd>
        <dt>WASM Engine Profile</dt>
        <dd id="wasm-profile-status" class="flex items-center gap-1.5 flex-wrap">
          <span class="font-mono text-xs">v{{ wasmProfileVersion }}</span>
          <span v-if="liveGameVersion" class="text-xs text-slate-500">(Game: v{{ liveGameVersion }})</span>
          <span
            v-if="wasmVersionMismatch"
            id="wasm-version-mismatch-badge"
            class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            ⚠️ Version Mismatch
          </span>
          <span
            v-else-if="liveGameVersion"
            class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          >
            ✓ Matched
          </span>
          <span
            v-if="wasmOverrideActive"
            id="wasm-override-active-badge"
            class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
          >
            Override Active
          </span>
        </dd>
      </dl>

      <!-- WASM Symbol Override Hot-Patch -->
      <div class="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-slate-700 dark:text-slate-300">WASM Symbol Override (Hot-Patch)</span>
          <button
            id="btn-toggle-wasm-override"
            type="button"
            class="cursor-pointer text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            @click="showWasmOverrideEditor = !showWasmOverrideEditor"
          >
            {{ showWasmOverrideEditor ? 'Hide JSON Editor' : (wasmOverrideActive ? 'Edit Override JSON' : 'Import Symbol Override') }}
          </button>
        </div>
        <div v-if="showWasmOverrideEditor" class="space-y-2">
          <textarea
            id="wasm-symbol-override-input"
            v-model="wasmOverrideText"
            rows="4"
            placeholder='{"gameVersion":"1.295.0","symbols":{"Play_ctor":291996}}'
            class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 font-mono text-[11px] text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          ></textarea>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              id="btn-apply-wasm-override"
              type="button"
              class="cursor-pointer rounded-md px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
              @click="applyWasmOverride"
            >
              Apply Override
            </button>
            <button
              id="btn-reset-wasm-override"
              type="button"
              class="cursor-pointer rounded-md px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
              @click="resetWasmOverride"
            >
              Reset to Default
            </button>
          </div>
          <p v-if="wasmOverrideError" class="text-[11px] text-rose-600 dark:text-rose-400">{{ wasmOverrideError }}</p>
          <p v-if="wasmOverrideStatus" class="text-[11px] text-emerald-600 dark:text-emerald-400">{{ wasmOverrideStatus }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 pt-1 flex-wrap">
        <button id="btn-ping-engine" type="button" :disabled="enginePingPending" @click="pingEngine" class="cursor-pointer rounded-lg px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 text-xs font-semibold transition-colors">Ping Engine</button>
        <button id="btn-test-wasm-engine" type="button" :disabled="wasmTestPending" @click="testWasmEngine" class="cursor-pointer rounded-lg px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 text-xs font-semibold transition-colors">Test WASM Engine</button>
        <button id="btn-test-wasm-call" type="button" :disabled="wasmCallPending" @click="testWasmCall" class="cursor-pointer rounded-lg px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 text-xs font-semibold transition-colors">Test Live Call</button>
      </div>
      <p v-if="enginePingMessage" id="engine-ping-result" role="status" class="text-slate-500 text-xs font-mono">{{ enginePingMessage }}</p>

      <!-- WASM Diagnostic Probe Results -->
      <div v-if="wasmTestResult || wasmTestError" id="engine-wasm-test-container" class="mt-2 space-y-1.5 text-xs">
        <div v-if="wasmTestResult" class="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div class="font-bold flex items-center gap-1.5">
            <span>✅</span> WASM Engine Diagnostics PASSED
          </div>
          <div class="font-mono text-[11px] mt-1 space-y-0.5">
            <div>Table size: {{ wasmTestResult.tableSize }} · Memory: {{ wasmTestResult.memorySizeMb }} MB</div>
            <div>String roundtrip: "{{ wasmTestResult.sampleString }}"</div>
            <div>Verified symbols ({{ wasmTestResult.verifiedSymbolsCount }}): {{ wasmTestResult.verifiedSymbols?.join(', ') }}</div>
            <div v-if="wasmTestResult.stringClass">String class: {{ wasmTestResult.stringClass }}</div>
            <div v-if="wasmTestResult.verifiedPresets">Presets probed: {{ wasmTestResult.verifiedPresets }}</div>
          </div>
        </div>

        <div v-if="wasmTestError" class="p-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 space-y-1.5">
          <div class="font-bold flex items-center justify-between">
            <span class="flex items-center gap-1.5"><span>⚠️</span> WASM Engine Test Failed</span>
            <button
              v-if="wasmTestErrorDetail"
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded border border-rose-300 dark:border-rose-700 bg-white/60 dark:bg-slate-900/60 hover:bg-white text-[10px] font-semibold"
              @click="showWasmDiagnostics = !showWasmDiagnostics"
            >
              {{ showWasmDiagnostics ? 'Hide Details' : 'Show Diagnostics' }}
            </button>
          </div>
          <p id="engine-wasm-test-result" class="font-mono text-[11px] break-words">{{ wasmTestError }}</p>
          <div v-if="showWasmDiagnostics && wasmTestErrorDetail" class="bg-black/85 text-emerald-300 p-2 rounded font-mono text-[10px] leading-relaxed overflow-x-auto max-h-36 border border-black/40">
            <div>Phase: {{ wasmTestErrorDetail.phase }}</div>
            <div>Kind: {{ wasmTestErrorDetail.kind }}</div>
            <div v-if="wasmTestErrorDetail.context" class="mt-0.5">Context: {{ JSON.stringify(wasmTestErrorDetail.context) }}</div>
            <div v-if="wasmTestErrorDetail.stack" class="text-slate-400 mt-1 whitespace-pre">{{ wasmTestErrorDetail.stack }}</div>
          </div>
        </div>
      </div>

      <!-- WASM Live Function Call Results -->
      <div v-if="wasmCallResult || wasmCallError" id="engine-wasm-call-container" class="mt-2 space-y-1.5 text-xs">
        <div v-if="wasmCallResult" class="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div class="font-bold flex items-center gap-1.5">
            <span>✅</span> Live Engine Function Call PASSED
          </div>
          <div class="font-mono text-[11px] mt-1 space-y-0.5">
            <div>{{ wasmCallResult.message }}</div>
            <div v-if="wasmCallResult.jsonNodePtr">JSON_Parse: {{ wasmCallResult.jsonNodePtr }}</div>
            <div v-if="wasmCallResult.typePtr">Type_GetType: {{ wasmCallResult.typePtr }}</div>
            <div v-if="wasmCallResult.stringClass">String class: {{ wasmCallResult.stringClass }}</div>
          </div>
        </div>

        <div v-if="wasmCallError" class="p-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 space-y-1.5">
          <div class="font-bold flex items-center justify-between">
            <span class="flex items-center gap-1.5"><span>⚠️</span> Live Engine Call Failed / Trap</span>
            <button
              v-if="wasmCallErrorDetail"
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded border border-rose-300 dark:border-rose-700 bg-white/60 dark:bg-slate-900/60 hover:bg-white text-[10px] font-semibold"
              @click="showWasmCallDiagnostics = !showWasmCallDiagnostics"
            >
              {{ showWasmCallDiagnostics ? 'Hide Details' : 'Show Diagnostics' }}
            </button>
          </div>
          <p id="engine-wasm-call-result" class="font-mono text-[11px] break-words">{{ wasmCallError }}</p>
          <div v-if="showWasmCallDiagnostics && wasmCallErrorDetail" class="bg-black/85 text-emerald-300 p-2 rounded font-mono text-[10px] leading-relaxed overflow-x-auto max-h-36 border border-black/40">
            <div>Phase: {{ wasmCallErrorDetail.phase }}</div>
            <div>Kind: {{ wasmCallErrorDetail.kind }}</div>
            <div v-if="wasmCallErrorDetail.context" class="mt-0.5">Context: {{ JSON.stringify(wasmCallErrorDetail.context) }}</div>
            <div v-if="wasmCallErrorDetail.stack" class="text-slate-400 mt-1 whitespace-pre">{{ wasmCallErrorDetail.stack }}</div>
          </div>
        </div>
      </div>
    </section>
    <!-- Storage & Runtime Telemetry -->
    <section
      id="storage-telemetry-card"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
    >
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>💾</span> Storage & Runtime Telemetry
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Chrome storage partition usage, IndexedDB recorder offload, and bridge-to-background latency.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            id="btn-refresh-telemetry"
            type="button"
            :disabled="storageTelemetryLoading"
            class="cursor-pointer rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
            @click="refreshStorageTelemetry"
          >
            {{ storageTelemetryLoading ? 'Refreshing...' : 'Refresh' }}
          </button>
          <button
            id="btn-compact-cache"
            type="button"
            :disabled="storageCompactPending"
            class="cursor-pointer rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
            @click="compactStorageCache"
          >
            {{ storageCompactPending ? 'Compacting...' : 'Compact Cache' }}
          </button>
        </div>
      </div>

      <div v-if="storageTelemetry" class="space-y-2.5 text-xs">
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-700 dark:text-slate-300">
              chrome.storage.local Quota
            </span>
            <span class="font-mono">
              {{ formatBytes(storageTelemetry.storageUsedBytes) }} / {{ formatBytes(storageTelemetry.storageQuotaBytes) }}
              ({{ storageTelemetry.storageUsagePct }}%)
              <span
                v-if="storageTelemetry.quotaWarning"
                id="storage-quota-warning"
                class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                High Usage
              </span>
            </span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full transition-all"
              :class="
                storageTelemetry.storageUsagePct >= 85
                  ? 'bg-rose-500'
                  : storageTelemetry.storageUsagePct >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              "
              :style="{ width: Math.min(100, storageTelemetry.storageUsagePct || 0) + '%' }"
            ></div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2">
            <div class="text-[10px] text-slate-500">Avg / P95 Latency</div>
            <div class="font-mono font-bold text-slate-800 dark:text-slate-100">
              {{ storageTelemetry.avgBridgeLatencyMs }}ms / {{ storageTelemetry.p95BridgeLatencyMs }}ms
            </div>
          </div>
          <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2">
            <div class="text-[10px] text-slate-500">Disk Flushes / min</div>
            <div class="font-mono font-bold text-slate-800 dark:text-slate-100">
              {{ storageTelemetry.flushesPerMinute }} ({{ storageTelemetry.avgFlushDurationMs }}ms avg)
            </div>
          </div>
          <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2">
            <div class="text-[10px] text-slate-500">Recorder Store</div>
            <div class="font-mono font-bold text-slate-800 dark:text-slate-100 uppercase">
              {{ storageTelemetry.recorderBackend }}
            </div>
          </div>
          <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2">
            <div class="text-[10px] text-slate-500">Recorded Entries</div>
            <div class="font-mono font-bold text-slate-800 dark:text-slate-100">
              {{ storageTelemetry.recorderCounts?.apiCount || 0 }} API · {{ storageTelemetry.recorderCounts?.interactionCount || 0 }} UI
            </div>
          </div>
        </div>

        <div v-if="storageTelemetry.partitions?.length" class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
          <div
            v-for="part in storageTelemetry.partitions"
            :key="part.name"
            class="flex items-center justify-between px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70 font-mono text-[11px]"
          >
            <span class="truncate text-slate-600 dark:text-slate-300">{{ part.name }}</span>
            <span class="font-semibold text-slate-800 dark:text-slate-100">{{ formatBytes(part.bytes) }}</span>
          </div>
        </div>
      </div>

      <p v-if="storageCompactMessage" role="status" class="text-xs text-emerald-600 dark:text-emerald-400">
        {{ storageCompactMessage }}
      </p>
    </section>

    <!-- Session Profiling & Recording -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
        <span>📼</span> Session Profiling & API Recording
      </h3>

      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">Session Recorder</div>
          <div class="text-[11px] text-slate-400">
            Capture full sequence of game requests, responses, and cache deltas for debugging and data analysis.
          </div>
        </div>
        <button
          type="button"
          :disabled="isTogglingRecording"
          class="cursor-pointer px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          :class="
            recordingState?.active
              ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          "
          @click="toggleRecording"
        >
          <span v-if="isTogglingRecording" class="inline-block animate-spin mr-1">⏳</span>
          <span>{{ isTogglingRecording ? (recordingState?.active ? 'Stopping...' : 'Starting...') : (recordingState?.active ? '⏹ Stop Recording' : '🔴 Record API Session') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
