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
    if ('rpcCache' in changes) {
      const nextRpc = changes.rpcCache?.newValue ? { ...changes.rpcCache.newValue } : {};
      if (!nextRpc.guildChat && cache.value?.guildChat) {
        nextRpc.guildChat = cache.value.guildChat;
      }
      cache.value = nextRpc;
    }
    if ('cache:world' in changes) {
      const nextWorld = changes['cache:world']?.newValue || {};
      if (cache.value) {
        Object.assign(cache.value, nextWorld);
      }
    }
    if ('cache:roster' in changes) {
      const nextRoster = changes['cache:roster']?.newValue || {};
      if (cache.value) {
        Object.assign(cache.value, nextRoster);
      }
    }
    if ('guildChat' in changes) {
      const nextChat = changes.guildChat?.newValue;
      if (nextChat && cache.value) {
        cache.value.guildChat = nextChat;
      }
    }
    if ('recordingState' in changes) recordingState.value = changes.recordingState?.newValue || { active: false };
    else if ('gameRecordingActive' in changes) {
      recordingState.value = { ...recordingState.value, active: changes.gameRecordingActive?.newValue === true };
    }
  } else if (areaName === 'session') {
    if ('recordingState' in changes) recordingState.value = changes.recordingState?.newValue || { active: false };
    if ('rpcQueueCounts' in changes) rpcQueueCount.value = countQueued(changes.rpcQueueCounts?.newValue);
  }
}

function handleRuntimeMessage(message: any) {
  if (message?.kind === 'rpc-cache-delta' && message.delta && typeof message.delta === 'object') {
    revisions.set('local:rpcCache', (revisions.get('local:rpcCache') || 0) + 1);
    cache.value = {
      ...(cache.value || {}),
      ...message.delta
    };
  }
}

function ensureStorageListener() {
  if (listenerAttached) return;
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime?.onMessage?.addListener?.(handleRuntimeMessage);
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
      const stored = await chrome.storage.local.get([
        'rpcCache',
        'guildChat',
        'cache:world',
        'cache:roster',
        'recordingState',
        'gameRecordingActive'
      ]);
      if (unchanged('local', 'rpcCache')) {
        const loaded = {
          ...(stored.rpcCache || {}),
          ...(stored['cache:world'] || {}),
          ...(stored['cache:roster'] || {})
        };
        if (stored.guildChat) loaded.guildChat = stored.guildChat;
        cache.value = loaded;
      }
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

export function updateRecordingState(next: any) {
  if (!next) return;
  recordingState.value = typeof next.active === 'boolean' ? next : { active: Boolean(next) };
}

export function clonePlainCache<T>(value: T): T {
  const raw = toRaw(value);
  if (raw == null || typeof raw !== 'object') return raw;
  try {
    return JSON.parse(JSON.stringify(raw)) as T;
  } catch {
    return structuredClone(raw);
  }
}

export function useRpcCache() {
  onMounted(() => {
    ensureStorageListener();
    if (!isInitialized.value) void loadInitial();
  });

  async function updateCacheLocally(updater: (draft: RpcCache) => void) {
    // The background reducer owns persisted RPC state. Optimistic UI changes
    // must never replace its entire cache with a potentially stale snapshot.
    // Use JSON deep-plain clone so nested Vue reactive Proxies never throw DataCloneError.
    const next = clonePlainCache(cache.value);
    updater(next);
    cache.value = next;
  }

  async function dispatchRpc(calls: Array<{ name: string; args?: any; feature?: string }>, options: { passiveFirst?: boolean; direct?: boolean; userAction?: boolean } = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { ok: false, error: 'Extension runtime is unavailable.' };
    }
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls, userAction: true, ...options }, (response) => {
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
    updateRecordingState,
    updateCacheLocally,
    dispatchRpc,
    reload: loadInitial,
  };
}
