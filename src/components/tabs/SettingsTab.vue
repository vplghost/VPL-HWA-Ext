<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { engineDiagnostics } from '@/src/composables/engineDiagnostics';
import { useTheme } from '@/src/composables/useTheme';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useGameConnection } from '@/src/composables/useGameConnection';
import '@/src/utils/metadata';
import { usePopupAutomation } from '@/src/composables/usePopupAutomation';
import { useFreeSpinAutomation } from '@/src/composables/useFreeSpinAutomation';
import { useFrontierAutomation } from '@/src/composables/useFrontierAutomation';
import type { ThemeMode } from '@/src/types';

const { theme, applyTheme } = useTheme();
const { recordingState, cache, updateRecordingState } = useRpcCache();
const isTogglingRecording = ref(false);
const { autoClaimSettings, priorityAutoJoin, teams: autoJoinTeams, pending: pendingClaims, selectedCount, busy: claimBusy, message: claimMessage, saveAutoClaim, savePriorityJoin, claimRewards } = usePopupAutomation(cache);
const { hasGameTab, isHealthy, alertMessage, isRefreshing, reloadGameTab, gameEngineStatus, checkStatus } = useGameConnection();
const engine = computed(() => engineDiagnostics(gameEngineStatus.value));
const enginePingMessage = ref('');
const enginePingPending = ref(false);
const { enabled: autoFreeSpinEnabled, status: autoFreeSpinStatus, save: saveAutoFreeSpin } = useFreeSpinAutomation();
const { enabled: autoFrontierEnabled, status: autoFrontierStatus, save: saveAutoFrontier } = useFrontierAutomation();
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
      ]);
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
    } catch (_) {}
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
              <span>🎬 Video Mystery Boxes</span>
              <span v-if="pendingClaims.videoBoxNums?.length" class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{{ pendingClaims.videoBoxNums.length }} ready</span>
            </div>
            <div class="text-slate-500 dark:text-slate-400 mt-0.5">Free video ad placement mystery boxes (0-4)</div>
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
      </dl>
      <button id="btn-ping-engine" type="button" :disabled="enginePingPending" @click="pingEngine" class="rounded-lg px-3 py-1.5 bg-indigo-600 text-white disabled:opacity-50">Ping Engine</button>
      <p id="engine-ping-result" role="status" class="text-slate-500">{{ enginePingMessage }}</p>
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
