import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useHeroicChestVideoAutomation() {
  const enabled = ref(false);
  const state = ref<any>(null);
  let revision = 0;

  function consume(stored: Record<string, any>) {
    if ('autoHeroicChestVideoEnabled' in stored) enabled.value = stored.autoHeroicChestVideoEnabled === true;
    if ('autoHeroicChestVideoState' in stored) state.value = stored.autoHeroicChestVideoState || null;
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('autoHeroicChestVideoEnabled' in changes || 'autoHeroicChestVideoState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue])));
    }
  }

  async function save() {
    await chrome.storage.local.set({ autoHeroicChestVideoEnabled: enabled.value });
    await chrome.runtime.sendMessage({ kind: 'heroic-chest-video-tick', manual: true }).catch(() => {});
  }

  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['autoHeroicChestVideoEnabled', 'autoHeroicChestVideoState']);
    if (revision === started) consume(stored);
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined') chrome.storage.onChanged.removeListener(changed);
  });

  return {
    enabled,
    save,
    status: computed(() => state.value?.status || ''),
    lastOpenAt: computed(() => state.value?.lastOpenAt || 0),
    nextWakeAt: computed(() => state.value?.nextWakeAt || 0),
  };
}
