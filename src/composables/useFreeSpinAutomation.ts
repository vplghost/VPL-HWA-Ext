import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useFreeSpinAutomation() {
  const enabled = ref(false);
  const state = ref<any>(null);
  let revision = 0;
  function consume(stored: Record<string, any>) {
    if ('autoFreeSpinEnabled' in stored) enabled.value = stored.autoFreeSpinEnabled === true;
    if ('autoFreeSpinState' in stored) state.value = stored.autoFreeSpinState || null;
  }
  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('autoFreeSpinEnabled' in changes || 'autoFreeSpinState' in changes)) {
      revision++;
      consume(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue])));
    }
  }
  async function save() {
    await chrome.storage.local.set({ autoFreeSpinEnabled: enabled.value });
    await chrome.runtime.sendMessage({ kind: 'free-spin-tick' });
  }
  onMounted(async () => {
    if (typeof chrome === 'undefined') return;
    chrome.storage.onChanged.addListener(changed);
    const started = revision;
    const stored = await chrome.storage.local.get(['autoFreeSpinEnabled', 'autoFreeSpinState']);
    if (revision === started) consume(stored);
  });
  onUnmounted(() => { if (typeof chrome !== 'undefined') chrome.storage.onChanged.removeListener(changed); });
  return { enabled, save, pending: computed(() => state.value?.pending?.phase === 'sent'), status: computed(() => state.value?.status || '') };
}
