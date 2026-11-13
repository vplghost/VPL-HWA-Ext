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
  const search = ref('');
  const sort = ref('newest');
  const error = ref('');
  const busy = ref(false);
  let revision = 0;
  async function reload() {
    const current = ++revision;
    try {
      const stored = await chrome.storage.session.get(null);
      if (current === revision) logs.value = recorderEntries(stored);
    } catch (cause) { error.value = String(cause); }
  }
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'session' && Object.keys(changes).some((key) => key.startsWith('record:'))) void reload();
  }
  onMounted(() => {
    chrome.storage.onChanged.addListener(onChanged);
    void reload();
  });
  onUnmounted(() => { ++revision; chrome.storage.onChanged.removeListener(onChanged); });
  async function control(kind: 'record-clear' | 'record-export') {
    busy.value = true;
    error.value = '';
    try {
      const response = await chrome.runtime.sendMessage({ kind });
      if (!response || response.error) throw new Error(response?.error || 'Recorder is unavailable.');
      if (kind === 'record-clear') await reload();
      return response;
    } catch (cause) { error.value = String(cause); }
    finally { busy.value = false; }
  }
  return { logs, search, sort, error, busy, control,
    filteredLogs: computed(() => filterRecorderEntries(logs.value, search.value, sort.value)) };
}
