import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useFrontierAutomation() {
  const enabled = ref(false);
  const state = ref<any>(null);
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if ('autoFrontierRewardsEnabled' in stored) enabled.value = stored.autoFrontierRewardsEnabled === true;
    if ('autoFrontierRewardsState' in stored) state.value = stored.autoFrontierRewardsState || null;
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('autoFrontierRewardsEnabled' in changes || 'autoFrontierRewardsState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue])));
    }
  }

  async function save() {
    await chrome.storage.local.set({ autoFrontierRewardsEnabled: enabled.value });
    await chrome.runtime.sendMessage({ kind: 'frontier-rewards-tick', manual: true }).catch(() => {});
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['autoFrontierRewardsEnabled', 'autoFrontierRewardsState']);
    if (revision === started) consume(stored);
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined') chrome.storage.onChanged.removeListener(changed);
  });

  return {
    enabled,
    save,
    status: computed(() => state.value?.status || ''),
    lastClaimAt: computed(() => state.value?.lastClaimAt || 0),
    nextWakeAt: computed(() => state.value?.nextWakeAt || 0)
  };
}
