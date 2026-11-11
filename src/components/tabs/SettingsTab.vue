<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTheme } from '@/src/composables/useTheme';
import { useRpcCache } from '@/src/composables/useRpcCache';
import type { ThemeMode } from '@/src/types';

const { theme, applyTheme } = useTheme();
const { recordingState } = useRpcCache();

const dispatchMode = ref<'piggyback' | 'direct'>('piggyback');
const mqttCaptureEnabled = ref(true);

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['dispatchMode', 'mqttCaptureEnabled']);
      if (stored.dispatchMode) dispatchMode.value = stored.dispatchMode;
      if (stored.mqttCaptureEnabled !== undefined) mqttCaptureEnabled.value = stored.mqttCaptureEnabled;
    } catch (_) {}
  }
});

function handleThemeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  applyTheme(target.value as ThemeMode);
}

async function handleModeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  dispatchMode.value = target.value as 'piggyback' | 'direct';
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ dispatchMode: dispatchMode.value });
  }
}

async function toggleMqtt() {
  mqttCaptureEnabled.value = !mqttCaptureEnabled.value;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ mqttCaptureEnabled: mqttCaptureEnabled.value });
  }
}

async function toggleRecording() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: recordingState.value?.active ? 'stop-recording' : 'start-recording',
    });
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

    <!-- API & Network Automation -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
        <span>⚡</span> Network & RPC Dispatch
      </h3>

      <div class="flex items-center justify-between pt-1">
        <div>
          <div class="font-semibold text-slate-700 dark:text-slate-200">RPC Dispatch Mode</div>
          <div class="text-[11px] text-slate-400">
            Piggyback rides alongside legitimate user interactions; Direct dispatches immediately to active game tab.
          </div>
        </div>
        <select
          :value="dispatchMode"
          class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          @change="handleModeChange"
        >
          <option value="piggyback">🛡️ Piggyback (Safe Stealth)</option>
          <option value="direct">⚡ Direct (Fast RPC)</option>
        </select>
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
    </div>

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
          class="cursor-pointer px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5"
          :class="
            recordingState?.active
              ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          "
          @click="toggleRecording"
        >
          <span>{{ recordingState?.active ? '⏹ Stop Recording' : '🔴 Record API Session' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

