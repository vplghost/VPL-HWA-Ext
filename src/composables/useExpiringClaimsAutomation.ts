import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  DEFAULT_EXPIRING_CLAIM_SETTINGS,
  normalizeExpiringClaimSettings,
} from '../services/expiringClaimService.ts';
import type { ExpiringClaimSettings, ExpiringClaimState } from '../types/index.ts';

export function useExpiringClaimsAutomation() {
  const settings = ref<ExpiringClaimSettings>({ ...DEFAULT_EXPIRING_CLAIM_SETTINGS });
  const state = ref<ExpiringClaimState | null>(null);
  const checking = ref(false);
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if ('expiringClaimSettings' in stored) {
      settings.value = normalizeExpiringClaimSettings(stored.expiringClaimSettings);
    }
    if ('expiringClaimState' in stored) {
      state.value = stored.expiringClaimState || null;
    }
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('expiringClaimSettings' in changes || 'expiringClaimState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.newValue])));
    }
  }

  async function save() {
    const normalized = normalizeExpiringClaimSettings(settings.value);
    settings.value = normalized;
    if (typeof chrome === 'undefined') return;
    await chrome.storage.local.set({ expiringClaimSettings: normalized });
    await chrome.runtime.sendMessage({ kind: 'auto-expiring-claims-tick', manual: true }).catch(() => {});
  }

  async function checkNow() {
    if (checking.value || typeof chrome === 'undefined') return;
    checking.value = true;
    try {
      await chrome.runtime.sendMessage({ kind: 'auto-expiring-claims-tick', manual: true }).catch(() => {});
    } finally {
      checking.value = false;
    }
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['expiringClaimSettings', 'expiringClaimState']);
    if (revision === started) consume(stored);
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined') chrome.storage.onChanged.removeListener(changed);
  });

  return {
    settings,
    state,
    checking,
    save,
    checkNow,
    status: computed(() => state.value?.status || ''),
    lastError: computed(() => state.value?.lastError || null),
  };
}
