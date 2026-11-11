import { ref, readonly } from 'vue';

const resourceSelection = ref<string[]>([]);
let isLoaded = false;
let listenerAttached = false;

export function normalizeResourceSelection(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((item): item is string => typeof item === 'string');
  }
  if (val && typeof val === 'object') {
    return Object.keys(val).filter((k) => Boolean((val as Record<string, unknown>)[k]));
  }
  return [];
}

async function loadInitial() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('resourceSelection');
      if (stored.resourceSelection !== undefined) {
        resourceSelection.value = normalizeResourceSelection(stored.resourceSelection);
      }
    } catch (e) {
      console.warn('Failed to load resourceSelection from storage:', e);
    }
  }
  isLoaded = true;
}

function ensureStorageListener() {
  if (listenerAttached) return;
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.resourceSelection) {
        resourceSelection.value = normalizeResourceSelection(changes.resourceSelection.newValue);
      }
    });
    listenerAttached = true;
  }
}

export function useResourceSelection() {
  if (!isLoaded) {
    loadInitial();
  }
  ensureStorageListener();

  async function togglePin(key: string) {
    const next = new Set(resourceSelection.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    const updated = [...next];
    // Immediate synchronous reactive update across Vue components
    resourceSelection.value = updated;

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        await chrome.storage.local.set({ resourceSelection: updated });
      } catch (e) {
        console.warn('Failed to persist resourceSelection:', e);
      }
    }
  }

  function isPinned(key: string): boolean {
    return resourceSelection.value.includes(key);
  }

  async function setSelection(keys: string[]) {
    const updated = normalizeResourceSelection(keys);
    resourceSelection.value = updated;
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        await chrome.storage.local.set({ resourceSelection: updated });
      } catch (e) {
        console.warn('Failed to persist resourceSelection:', e);
      }
    }
  }

  return {
    resourceSelection,
    togglePin,
    isPinned,
    setSelection,
    reload: loadInitial,
  };
}
