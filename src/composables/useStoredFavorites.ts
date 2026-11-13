import { onMounted, onUnmounted, ref } from 'vue';

export function useStoredFavorites(key: 'favoriteHeroes' | 'favoriteTitans') {
  const favorites = ref<Set<string>>(new Set());
  let revision = 0;
  function apply(value: unknown) {
    favorites.value = new Set(Array.isArray(value) ? value.map(String) : []);
  }
  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && key in changes) { ++revision; apply(changes[key]?.newValue); }
  }
  onMounted(async () => {
    chrome.storage.onChanged.addListener(changed);
    const current = revision;
    try {
      const stored = await chrome.storage.local.get(key);
      if (current === revision) apply(stored[key]);
    } catch (cause) { console.warn('Could not load favorites:', cause); }
  });
  onUnmounted(() => { ++revision; chrome.storage.onChanged.removeListener(changed); });
  return favorites;
}
