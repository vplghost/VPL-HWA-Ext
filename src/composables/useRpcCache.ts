import { ref, onMounted, readonly, toRaw } from 'vue';
import type { RpcCache } from '@/src/types';

const cache = ref<RpcCache>({});
const recordingState = ref<any>({ active: false });
const rpcQueueCount = ref(0);
const isInitialized = ref(false);
let listenerAttached = false;
let initialLoad: Promise<void> | null = null;
const revisions = new Map<string, number>();

function countQueued(raw: unknown = {}) {
  const counts = raw && typeof raw === 'object' ? raw : {};
  return Object.values(counts).reduce<number>((sum, count) => sum + (Number(count) || 0), 0);
}

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) {
  for (const key of Object.keys(changes)) {
    const id = areaName + ':' + key;
    revisions.set(id, (revisions.get(id) || 0) + 1);
  }
  if (areaName === 'local') {
    if ('rpcCache' in changes) cache.value = changes.rpcCache?.newValue || {};
    if ('recordingState' in changes) recordingState.value = changes.recordingState?.newValue || { active: false };
    else if ('gameRecordingActive' in changes) {
      recordingState.value = { ...recordingState.value, active: changes.gameRecordingActive?.newValue === true };
    }
  } else if (areaName === 'session') {
    if ('recordingState' in changes) recordingState.value = changes.recordingState?.newValue || { active: false };
    if ('rpcQueueCounts' in changes) rpcQueueCount.value = countQueued(changes.rpcQueueCounts?.newValue);
  }
}

function ensureStorageListener() {
  if (listenerAttached) return;
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    listenerAttached = true;
  }
}

function loadInitial(): Promise<void> {
  if (initialLoad) return initialLoad;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return Promise.resolve();
  ensureStorageListener();
  const started = new Map(revisions);
  const unchanged = (area: string, key: string) =>
    (revisions.get(area + ':' + key) || 0) === (started.get(area + ':' + key) || 0);
  initialLoad = (async () => {
    try {
      const stored = await chrome.storage.local.get(['rpcCache', 'recordingState', 'gameRecordingActive']);
      if (unchanged('local', 'rpcCache')) cache.value = stored.rpcCache || {};
      if (unchanged('local', 'recordingState') && unchanged('local', 'gameRecordingActive') &&
          unchanged('session', 'recordingState')) {
        recordingState.value = stored.recordingState || { active: stored.gameRecordingActive === true };
      }
    } catch (error) {
      console.warn('Failed to load storage in useRpcCache:', error);
    }
    try {
      if (chrome.storage?.session?.get) {
        const sessionData = await chrome.storage.session.get(['rpcQueueCounts', 'recordingState']);
        if (sessionData.recordingState && unchanged('session', 'recordingState') &&
            unchanged('local', 'recordingState') && unchanged('local', 'gameRecordingActive')) {
          recordingState.value = sessionData.recordingState;
        }
        if (unchanged('session', 'rpcQueueCounts')) rpcQueueCount.value = countQueued(sessionData.rpcQueueCounts);
      }
    } catch (error) {
      console.warn('Failed to load session storage in useRpcCache:', error);
    }
    isInitialized.value = true;
  })().finally(() => { initialLoad = null; });
  return initialLoad;
}

export function useRpcCache() {
  onMounted(() => {
    ensureStorageListener();
    if (!isInitialized.value) void loadInitial();
  });

  async function updateCacheLocally(updater: (draft: RpcCache) => void) {
    // The background reducer owns persisted RPC state. Optimistic UI changes
    // must never replace its entire cache with a potentially stale snapshot.
    const next = structuredClone(toRaw(cache.value));
    updater(next);
    cache.value = next;
  }

  async function dispatchRpc(calls: Array<{ name: string; args?: any; feature?: string }>) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { ok: false, error: 'Extension runtime is unavailable.' };
    }
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? { ok: false, error: error.message || 'RPC transport failed.' } :
            response || { ok: false, error: 'No response from extension background.' });
        });
      } catch (error) {
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
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
