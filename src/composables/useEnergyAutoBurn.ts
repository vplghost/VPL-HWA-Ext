import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  DEFAULT_ENERGY_AUTO_BURN_SETTINGS,
  normalizeEnergyAutoBurnSettings,
} from '../services/energyAutoBurnService.ts';
import type { EnergyAutoBurnSettings, EnergyAutoBurnState } from '../types/index.ts';

export function useEnergyAutoBurn() {
  const settings = ref<EnergyAutoBurnSettings>({ ...DEFAULT_ENERGY_AUTO_BURN_SETTINGS });
  const state = ref<EnergyAutoBurnState | null>(null);
  const checking = ref(false);
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if ('energyAutoBurnSettings' in stored) {
      settings.value = normalizeEnergyAutoBurnSettings(stored.energyAutoBurnSettings);
    }
    if ('energyAutoBurnState' in stored) {
      state.value = stored.energyAutoBurnState || null;
    }
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('energyAutoBurnSettings' in changes || 'energyAutoBurnState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.newValue])));
    }
  }

  async function save() {
    const normalized = normalizeEnergyAutoBurnSettings(settings.value);
    settings.value = normalized;
    if (typeof chrome === 'undefined') return;
    await chrome.storage.local.set({ energyAutoBurnSettings: normalized });
    await chrome.runtime.sendMessage({ kind: 'auto-energy-burn-tick', manual: true }).catch(() => {});
  }

  async function checkNow() {
    if (checking.value || typeof chrome === 'undefined') return;
    checking.value = true;
    try {
      await chrome.runtime.sendMessage({ kind: 'auto-energy-burn-tick', manual: true }).catch(() => {});
    } finally {
      checking.value = false;
    }
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['energyAutoBurnSettings', 'energyAutoBurnState']);
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
