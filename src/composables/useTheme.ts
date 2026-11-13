import { ref, onMounted, onUnmounted } from 'vue';
import type { ThemeMode } from '@/src/types';

const theme = ref<ThemeMode>('dark');
let themeRevision = 0;
function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'system' ? value : 'dark';
}

export function useTheme() {
  let media: MediaQueryList | undefined;
  function renderTheme(mode: ThemeMode) {
    theme.value = normalizeTheme(mode);
    const isDark = theme.value === 'dark' ||
      (theme.value === 'system' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }
  function applyTheme(mode: ThemeMode) {
    ++themeRevision;
    renderTheme(mode);
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      chrome.storage.local.set({ theme: theme.value }).catch(() => {});
    }
  }
  function onSystemThemeChange() {
    if (theme.value === 'system') renderTheme('system');
  }
  function onStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && 'theme' in changes) {
      ++themeRevision;
      renderTheme(normalizeTheme(changes.theme?.newValue));
    }
  }
  onMounted(async () => {
    media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', onSystemThemeChange);
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(onStorageChange);
    const revision = themeRevision;
    try {
      const stored = typeof chrome !== 'undefined' ? await chrome.storage?.local?.get('theme') : undefined;
      if (revision === themeRevision) renderTheme(normalizeTheme(stored?.theme));
    } catch (_) {
      if (revision === themeRevision) renderTheme(theme.value);
    }
  });
  onUnmounted(() => {
    media?.removeEventListener('change', onSystemThemeChange);
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(onStorageChange);
  });
  return { theme, applyTheme };
}
