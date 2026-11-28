import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useShopFavoritesAutomation() {
  const enabled = ref(false);
  const state = ref<any>(null);
  const running = ref(false);
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if ('autoShopFavoritesEnabled' in stored) enabled.value = stored.autoShopFavoritesEnabled === true;
    if ('autoShopFavoritesState' in stored) state.value = stored.autoShopFavoritesState || null;
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('autoShopFavoritesEnabled' in changes || 'autoShopFavoritesState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue])));
    }
  }

  async function save() {
    if (typeof chrome === 'undefined') return;
    await chrome.storage.local.set({ autoShopFavoritesEnabled: enabled.value });
    await chrome.runtime.sendMessage({ kind: 'auto-shop-favorites-tick', manual: true }).catch(() => {});
  }

  async function runNow() {
    if (running.value || typeof chrome === 'undefined') return;
    running.value = true;
    try {
      await chrome.runtime.sendMessage({ kind: 'auto-shop-favorites-tick', manual: true }).catch(() => {});
    } finally {
      running.value = false;
    }
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['autoShopFavoritesEnabled', 'autoShopFavoritesState']);
    if (revision === started) consume(stored);
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined') chrome.storage.onChanged.removeListener(changed);
  });

  return {
    enabled,
    running,
    save,
    runNow,
    status: computed(() => state.value?.status || ''),
    lastRunAt: computed(() => state.value?.lastRunAt || 0),
    nextWakeAt: computed(() => state.value?.nextWakeAt || 0),
  };
}
