<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  createDefaultRemoteBridgeSettings,
  normalizeRemoteBridgeSettings,
  normalizeEndpointUrl,
  buildMobilePairUrl,
  generateTotpCode,
  generateBase32Secret,
  generateRandomHex,
  type RemoteBridgeSettings,
  type RemoteBridgeState,
} from '@/src/services/remoteBridgeService';
import { renderQrSvg } from '@/src/utils/qrSvg';

const settings = ref<RemoteBridgeSettings>(createDefaultRemoteBridgeSettings());
const bridgeState = ref<RemoteBridgeState>({
  status: 'disconnected',
  lastError: null,
  lastSyncedAt: null,
  pairedEndpoint: null,
  recentCommands: [],
});

const checking = ref(false);
const checkResult = ref<{ ok: boolean; message: string } | null>(null);
const actionNotice = ref('');
const copiedField = ref('');

const otpCode = ref('------');
const otpRemaining = ref(30);
let otpTimer: number | null = null;

const normalizedEndpoint = computed(() => normalizeEndpointUrl(settings.value.endpointUrl));
const pairUrl = computed(() =>
  normalizedEndpoint.value ? buildMobilePairUrl(normalizedEndpoint.value, settings.value.clientGuid) : null
);
const qrSvgMarkup = computed(() => {
  if (!pairUrl.value) return '';
  try {
    return renderQrSvg(pairUrl.value, 2);
  } catch {
    return '';
  }
});

async function refreshOtp() {
  try {
    const res = await generateTotpCode(settings.value.otpSecret, Date.now());
    otpCode.value = res.code;
    otpRemaining.value = res.remainingSeconds;
  } catch {
    otpCode.value = '------';
    otpRemaining.value = 0;
  }
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area !== 'local') return;
  if (changes.remoteBridgeSettings?.newValue) {
    settings.value = normalizeRemoteBridgeSettings(changes.remoteBridgeSettings.newValue);
    void refreshOtp();
  }
  if (changes.remoteBridgeState?.newValue) {
    bridgeState.value = { ...bridgeState.value, ...changes.remoteBridgeState.newValue };
  }
}

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['remoteBridgeSettings', 'remoteBridgeState']);
      if (stored.remoteBridgeSettings) {
        settings.value = normalizeRemoteBridgeSettings(stored.remoteBridgeSettings);
      } else {
        await chrome.storage.local.set({ remoteBridgeSettings: settings.value });
      }
      if (stored.remoteBridgeState) {
        bridgeState.value = { ...bridgeState.value, ...stored.remoteBridgeState };
      }
    } catch (_) {}
    chrome.storage.onChanged?.addListener(handleStorageChange);
  }
  await refreshOtp();
  otpTimer = window.setInterval(() => {
    void refreshOtp();
  }, 1000);
});

onUnmounted(() => {
  if (otpTimer != null) clearInterval(otpTimer);
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(handleStorageChange);
});

async function persistSettings(notifyKind: 'remote-bridge-sync' | 'remote-bridge-pair' = 'remote-bridge-sync') {
  const payload = normalizeRemoteBridgeSettings(settings.value);
  settings.value = payload;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ remoteBridgeSettings: payload });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: notifyKind }).catch(() => {});
  }
}

async function handleCheckConnection() {
  if (!normalizedEndpoint.value) {
    checkResult.value = { ok: false, message: 'Enter a valid https:// URL or local LAN http://192.168.x.x:8080 URL.' };
    return;
  }
  checking.value = true;
  checkResult.value = null;
  try {
    await persistSettings('remote-bridge-sync');
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({
        kind: 'remote-bridge-check',
        endpointUrl: normalizedEndpoint.value,
      });
      if (res?.ok) {
        checkResult.value = { ok: true, message: `Online (${res.latencyMs ?? 0}ms)` };
      } else {
        checkResult.value = { ok: false, message: res?.error || 'Server unreachable' };
      }
    }
  } catch (err: any) {
    checkResult.value = { ok: false, message: err?.message || 'Connection check failed' };
  } finally {
    checking.value = false;
  }
}

async function handleToggleEnabled() {
  if (settings.value.enabled && !normalizedEndpoint.value) {
    settings.value.enabled = false;
    checkResult.value = { ok: false, message: 'Configure a valid Endpoint URL before enabling.' };
    return;
  }
  await persistSettings('remote-bridge-pair');
}

async function handleRegenerateCredentials() {
  settings.value = {
    ...settings.value,
    clientGuid: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : settings.value.clientGuid,
    deviceToken: generateRandomHex(24),
    otpSecret: generateBase32Secret(20),
  };
  await refreshOtp();
  await persistSettings('remote-bridge-pair');
  actionNotice.value = 'Generated new GUID, device token, and OTP secret.';
}

async function handleRevokeSessions() {
  actionNotice.value = '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const res = await chrome.runtime.sendMessage({ kind: 'remote-bridge-revoke-sessions' });
    actionNotice.value = res?.ok
      ? `Revoked ${res.revoked ?? 0} mobile session(s).`
      : res?.error || 'Could not revoke sessions.';
  }
}

async function copyText(text: string | null, field: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = field;
    window.setTimeout(() => {
      if (copiedField.value === field) copiedField.value = '';
    }, 1500);
  } catch (_) {}
}

function formatTime(ts?: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div class="space-y-3 text-xs">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <!-- Card 1: Connection & Endpoint -->
      <section
        id="control-panel-connection-card"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
      >
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-base">📱</span>
            <div>
              <h2 class="text-sm font-bold text-slate-800 dark:text-slate-100">HWA Control Panel</h2>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Personal mobile monitoring &amp; emergency commands</p>
            </div>
          </div>

          <span
            id="control-panel-status-badge"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border"
            :class="
              bridgeState.status === 'connected'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : bridgeState.status === 'connecting'
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : bridgeState.status === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            "
          >
            <span
              class="size-1.5 rounded-full"
              :class="
                bridgeState.status === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : bridgeState.status === 'connecting'
                    ? 'bg-amber-500'
                    : bridgeState.status === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
              "
            />
            <span class="capitalize">{{ bridgeState.status }}</span>
          </span>
        </div>

        <div class="space-y-2.5">
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Proxy Endpoint URL
            <div class="mt-1 flex gap-2">
              <input
                id="setting-remote-bridge-url"
                v-model="settings.endpointUrl"
                type="url"
                placeholder="https://hwa-cp.example.com or http://192.168.1.10:8080"
                class="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono"
                @change="persistSettings('remote-bridge-sync')"
              />
              <button
                id="btn-remote-bridge-check"
                type="button"
                :disabled="checking"
                class="cursor-pointer shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                @click="handleCheckConnection"
              >
                {{ checking ? 'Checking…' : 'Check Connection' }}
              </button>
            </div>
          </label>

          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Optional Pairing Key (BOOTSTRAP_KEY)
            <input
              v-model="settings.bootstrapKey"
              type="password"
              placeholder="Leave blank if server has no BOOTSTRAP_KEY"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono"
              @change="persistSettings('remote-bridge-sync')"
            />
          </label>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label class="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
              <input
                id="setting-remote-bridge-enabled"
                v-model="settings.enabled"
                type="checkbox"
                class="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                @change="handleToggleEnabled"
              />
              <span>Enable Control Panel Bridge</span>
            </label>

            <span class="text-[11px] text-slate-400">
              Last sync: {{ formatTime(bridgeState.lastSyncedAt) }}
            </span>
          </div>

          <p
            v-if="checkResult"
            class="rounded-lg px-2.5 py-1.5 text-[11px] border"
            :class="
              checkResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            "
          >
            {{ checkResult.ok ? '✓' : '✕' }} {{ checkResult.message }}
          </p>

          <p
            v-if="bridgeState.lastError"
            class="rounded-lg px-2.5 py-1.5 text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          >
            ⚠️ {{ bridgeState.lastError }}
          </p>
        </div>
      </section>

      <!-- Card 2: Mobile Pairing (GUID, Link, QR & OTP) -->
      <section
        id="control-panel-pairing-card"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
      >
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            🔐 Mobile Pairing (Scan QR Once + 6-Digit OTP)
          </h3>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              @click="handleRegenerateCredentials"
            >
              Regenerate
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300"
              @click="handleRevokeSessions"
            >
              Revoke Sessions
            </button>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 items-start">
          <!-- Offline QR Code -->
          <div class="shrink-0">
            <div
              v-if="qrSvgMarkup"
              id="remote-bridge-qr"
              class="size-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1.5 shadow-2xs"
              v-html="qrSvgMarkup"
            />
            <div
              v-else
              id="remote-bridge-qr"
              class="size-32 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center text-center p-2 text-[11px] text-slate-400"
            >
              Enter Endpoint URL to generate QR
            </div>
          </div>

          <!-- GUID, Link & Live 30s OTP -->
          <div class="flex-1 min-w-0 space-y-2.5 w-full">
            <div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Client GUID</div>
              <div class="mt-0.5 flex items-center gap-1.5">
                <code class="flex-1 truncate rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-200">
                  {{ settings.clientGuid }}
                </code>
                <button
                  type="button"
                  class="cursor-pointer shrink-0 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-1 text-[11px] font-semibold"
                  @click="copyText(settings.clientGuid, 'guid')"
                >
                  {{ copiedField === 'guid' ? 'Copied' : 'Copy' }}
                </button>
              </div>
            </div>

            <div v-if="pairUrl">
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Mobile Pair Link</div>
              <div class="mt-0.5 flex items-center gap-1.5">
                <code class="flex-1 truncate rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono text-blue-600 dark:text-blue-400">
                  {{ pairUrl }}
                </code>
                <button
                  type="button"
                  class="cursor-pointer shrink-0 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-1 text-[11px] font-semibold"
                  @click="copyText(pairUrl, 'link')"
                >
                  {{ copiedField === 'link' ? 'Copied' : 'Copy Link' }}
                </button>
              </div>
            </div>

            <div class="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200">One-Time Passcode (1-Year Cookie)</span>
                <span class="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">{{ otpRemaining }}s</span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2">
                <span id="remote-bridge-otp" class="text-xl font-mono font-bold tracking-[0.25em] text-indigo-700 dark:text-indigo-300">
                  {{ otpCode }}
                </span>
                <button
                  type="button"
                  class="cursor-pointer rounded bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 text-[11px] font-semibold"
                  @click="copyText(otpCode, 'otp')"
                >
                  {{ copiedField === 'otp' ? 'Copied' : 'Copy OTP' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p v-if="actionNotice" class="text-[11px] text-emerald-700 dark:text-emerald-300">
          {{ actionNotice }}
        </p>
      </section>
    </div>

    <!-- Card 3: Recent Remote Commands -->
    <section
      id="control-panel-commands-card"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 shadow-xs"
    >
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        📡 Recent Remote Commands
      </h3>
      <div v-if="!bridgeState.recentCommands?.length" class="p-3 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
        No remote commands received yet.
      </div>
      <div v-else class="space-y-1.5">
        <div
          v-for="cmd in bridgeState.recentCommands"
          :key="cmd.id"
          class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
        >
          <div class="min-w-0">
            <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{{ cmd.action }}</span>
            <span class="ml-2 text-[11px] text-slate-500 dark:text-slate-400">{{ cmd.message }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
              :class="cmd.status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'"
            >
              {{ cmd.status }}
            </span>
            <span class="text-[10px] font-mono text-slate-400">{{ formatTime(cmd.at) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
