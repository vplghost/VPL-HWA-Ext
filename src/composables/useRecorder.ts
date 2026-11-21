import { computed, onMounted, onUnmounted, ref } from 'vue';

export interface RecorderEntry {
  id?: string;
  timestamp?: string;
  method?: string;
  endpoint?: string;
  topic?: string;
  direction?: string;
  eventMethod?: string;
  eventType?: string;
  transport?: string;
  outcome?: string;
  status?: number | null;
  durationMs?: number;
  requestBody?: string;
  responseBody?: string;
  payload?: string;
  [key: string]: unknown;
}

export function recorderEntries(stored: Record<string, unknown>): RecorderEntry[] {
  return Object.entries(stored)
    .filter(([key, value]) => /^record:\d+$/.test(key) && value && typeof value === 'object')
    .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)))
    .map(([key, value]) => ({ ...(value as RecorderEntry), id: key }));
}

export function filterRecorderEntries(entries: RecorderEntry[], query: string, sort = 'newest') {
  const term = query.trim().toLowerCase();
  return entries.filter((entry) => [entry.endpoint, entry.method, entry.topic, entry.direction,
    entry.eventMethod, entry.eventType].some((value) => String(value || '').toLowerCase().includes(term)))
    .sort((a, b) => sort === 'duration-desc' ? Number(b.durationMs || 0) - Number(a.durationMs || 0)
      : sort === 'duration-asc' ? Number(a.durationMs || 0) - Number(b.durationMs || 0)
      : sort === 'oldest' ? String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
      : String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

export function useRecorder() {
  const logs = ref<RecorderEntry[]>([]);
  const activeCount = ref(0);
  const interactionCount = ref(0);
  const isRecording = ref(false);
  const search = ref('');
  const sort = ref('newest');
  const error = ref('');
  const busy = ref(false);
  let revision = 0;

  async function reload() {
    const current = ++revision;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
        const stored = await chrome.storage.session.get(null).catch(() => ({}));
        const entries = recorderEntries(stored);
        if (entries.length > 0) {
          if (current === revision) {
            logs.value = entries;
            activeCount.value = entries.length;
          }
          return;
        }
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const res = await chrome.runtime.sendMessage({ kind: 'record-list' }).catch(() => null);
        if (res?.records && Array.isArray(res.records)) {
          if (current === revision) {
            logs.value = res.records;
            activeCount.value = res.records.length;
            if (typeof res.active === 'boolean') isRecording.value = res.active;
          }
          return;
        }
      }
      if (current === revision) {
        logs.value = [];
        activeCount.value = 0;
      }
    } catch (cause) { error.value = String(cause); }
  }

  function onRuntimeMessage(msg: any) {
    if (msg?.kind === 'record-tick') {
      activeCount.value = Number(msg.count || 0);
      interactionCount.value = Number(msg.interactionCount || 0);
      if (typeof msg.active === 'boolean') isRecording.value = msg.active;
      if (msg.reset) {
        logs.value = [];
        activeCount.value = 0;
        interactionCount.value = 0;
      } else if (msg.latestEntry) {
        logs.value.push(msg.latestEntry);
      }
    }
  }

  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && ('gameRecordingActive' in changes || 'recordingState' in changes)) {
      isRecording.value = changes.gameRecordingActive?.newValue === true || Boolean(changes.recordingState?.newValue?.active);
      void reload();
    } else if (area === 'session' && Object.keys(changes).some((key) => key.startsWith('record:') || key === 'recordingState')) {
      void reload();
    }
  }

  onMounted(() => {
    chrome.storage?.onChanged?.addListener?.(onChanged);
    chrome.runtime?.onMessage?.addListener?.(onRuntimeMessage);
    void reload();
    if (typeof chrome !== 'undefined' && typeof chrome.runtime?.onMessage?.addListener === 'function') {
      chrome.runtime.sendMessage({ kind: 'record-status' }).then((res: any) => {
        if (res && typeof res.count === 'number') {
          activeCount.value = res.count;
          interactionCount.value = Number(res.interactionCount || 0);
          isRecording.value = Boolean(res.active);
          if (res.count > 0 && logs.value.length === 0) void reload();
        }
      }).catch(() => {});
    }
  });

  onUnmounted(() => {
    ++revision;
    chrome.storage?.onChanged?.removeListener?.(onChanged);
    chrome.runtime?.onMessage?.removeListener?.(onRuntimeMessage);
  });

  async function control(kind: 'record-clear' | 'record-export') {
    busy.value = true;
    error.value = '';
    try {
      const response = await chrome.runtime.sendMessage({ kind });
      if (!response || response.error) throw new Error(response?.error || 'Recorder is unavailable.');
      if (kind === 'record-clear') {
        logs.value = [];
        activeCount.value = 0;
        interactionCount.value = 0;
      }
      return response;
    } catch (cause) { error.value = String(cause); }
    finally { busy.value = false; }
  }
  return {
    logs,
    activeCount,
    interactionCount,
    isRecording,
    search,
    sort,
    error,
    busy,
    control,
    filteredLogs: computed(() => filterRecorderEntries(logs.value, search.value, sort.value))
  };
}
