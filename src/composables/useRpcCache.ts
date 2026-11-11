import { ref, onMounted, readonly } from 'vue';
import type { RpcCache } from '@/src/types';

const cache = ref<RpcCache>({});
const recordingState = ref<any>({ active: false });
const rpcQueueCount = ref<number>(0);
const isInitialized = ref(false);
let listenerAttached = false;

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) {
  if (areaName === 'local') {
    if (changes.rpcCache?.newValue) {
      cache.value = changes.rpcCache.newValue;
    }
    if (changes.recordingState?.newValue) {
      recordingState.value = changes.recordingState.newValue;
    }
  } else if (areaName === 'session') {
    if (changes.rpcQueueCounts?.newValue) {
      const counts = changes.rpcQueueCounts.newValue || {};
      rpcQueueCount.value = Object.values(counts).reduce((sum: number, c: any) => sum + (Number(c) || 0), 0);
    }
  }
}

function ensureStorageListener() {
  if (listenerAttached) return;
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    listenerAttached = true;
  }
}

export function useRpcCache() {
  async function loadInitial() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      const stored = await chrome.storage.local.get(['rpcCache', 'recordingState']);
      if (stored.rpcCache) {
        cache.value = stored.rpcCache;
      }
      if (stored.recordingState) {
        recordingState.value = stored.recordingState;
      }
    } catch (e) {
      console.warn('Failed to load storage in useRpcCache:', e);
    }

    try {
      if (chrome.storage?.session?.get) {
        const sessionData = await chrome.storage.session.get('rpcQueueCounts');
        const counts = sessionData.rpcQueueCounts || {};
        rpcQueueCount.value = Object.values(counts).reduce((sum: number, c: any) => sum + (Number(c) || 0), 0);
      }
    } catch (_) {}

    isInitialized.value = true;
  }

  onMounted(() => {
    if (!isInitialized.value) {
      loadInitial();
    }
    ensureStorageListener();
  });

  async function updateCacheLocally(updater: (draft: RpcCache) => void) {
    const next = { ...cache.value };
    updater(next);
    cache.value = next;
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        await chrome.storage.local.set({ rpcCache: next });
      } catch (e) {
        console.warn('Failed to update local rpcCache:', e);
      }
    }
  }

  async function dispatchRpc(calls: Array<{ name: string; args?: any; feature?: string }>) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, (res) => resolve(res));
      });
    }
  }

  return {
    cache,
    recordingState: readonly(recordingState),
    rpcQueueCount: readonly(rpcQueueCount),
    isInitialized: readonly(isInitialized),
    updateCacheLocally,
    dispatchRpc,
    reload: loadInitial,
  };
}

