import { ref, watch, onMounted } from 'vue';
import type { ThemeMode } from '@/src/types';

const theme = ref<ThemeMode>('dark');

export function useTheme() {
  function applyTheme(mode: ThemeMode) {
    theme.value = mode;
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      chrome.storage.local.set({ theme: mode }).catch(() => {});
    }
  }

  async function initTheme() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get('theme');
        if (stored.theme) {
          applyTheme(stored.theme as ThemeMode);
          return;
        }
      } catch (_) {}
    }
    applyTheme('dark');
  }

  onMounted(() => {
    initTheme();
  });

  return {
    theme,
    applyTheme,
  };
}

