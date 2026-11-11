<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getResearchName } from '@/src/utils/metadata';
import { formatDuration } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const now = ref(Date.now());
let timer: number | null = null;

// Search and sort filters
const nextResearchFilterQuery = ref('');
const nextResearchSortOrder = ref<'level-desc' | 'level-asc' | 'time-asc' | 'time-desc' | 'name-asc'>('level-desc');
const researchSearchQuery = ref('');
const researchFilterTab = ref<'all' | 'completed' | 'in_progress' | 'available'>('all');

// Storage-backed auto-queue
interface ResearchQueueItem {
  researchId: number;
  currentLevel: number;
  nextLevel: number;
  durationMs: number;
  estStart?: number;
  estFinish?: number;
}

interface ResearchQueueState {
  enabled: boolean;
  items: ResearchQueueItem[];
}

const researchQueue = ref<ResearchQueueState>({
  enabled: true,
  items: [],
});

const buildingQueueItems = ref<any[]>([]);

const onStorageChanged = (changes: any, area: string) => {
  if (area !== 'local') return;
  if (changes.buildingQueue?.newValue?.items) {
    buildingQueueItems.value = normalizeArray(changes.buildingQueue.newValue.items);
  }
  if (changes.researchQueue?.newValue) {
    researchQueue.value = {
      enabled: changes.researchQueue.newValue.enabled !== false,
      items: normalizeArray(changes.researchQueue.newValue.items),
    };
  }
};

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['researchQueue', 'buildingQueue']);
      if (stored.researchQueue) {
        researchQueue.value = {
          enabled: stored.researchQueue.enabled !== false,
          items: normalizeArray(stored.researchQueue.items),
        };
      }
      if (stored.buildingQueue?.items) {
        buildingQueueItems.value = normalizeArray(stored.buildingQueue.items);
      }
      chrome.storage?.onChanged?.addListener(onStorageChanged);
    } catch (_) {}
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('keydown', handleKeydown);
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch (_) {}
  }
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

async function saveResearchQueue() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      researchQueue: {
        enabled: researchQueue.value.enabled,
        items: researchQueue.value.items,
      },
    });
    try {
      chrome.runtime?.sendMessage?.({ kind: 'research-queue-action', action: 'sync' });
    } catch {}
  }
}

// Queues from cache
const rawQueues = computed(() => normalizeArray(cache.value?.researchStatus?.data?.queues));

const activeQueues = computed(() => {
  return rawQueues.value.filter(
    (q: any) =>
      Number.isFinite(q.startDate) &&
      Number.isFinite(q.durationMs) &&
      q.startDate + q.durationMs > now.value
  );
});

const finishedQueues = computed(() => {
  return rawQueues.value.filter(
    (q: any) =>
      Number.isFinite(q.startDate) &&
      Number.isFinite(q.durationMs) &&
      q.startDate + q.durationMs <= now.value
  );
});

const isFinishing = ref<Record<string, boolean>>({});

async function finishResearch(f: any) {
  const key = `${f.researchId}-${f.level}`;
  isFinishing.value[key] = true;
  try {
    await dispatchRpc([
      {
        name: 'completeResearch',
        feature: 'personalResearch',
        args: {
          researchId: f.researchId,
          level: f.level,
          queueNumber: f.queueNumber || 0,
        },
      },
      { name: 'getSummary', feature: 'personalResearch', args: {} },
    ]);
  } finally {
    isFinishing.value[key] = false;
  }
}

// Timeline
const queueTimeline = computed(() => {
  const rQueueHelper = (globalThis as any).hwaHelperResearchQueue;
  if (rQueueHelper?.calculateQueueTimeline) {
    return rQueueHelper.calculateQueueTimeline(rawQueues.value, researchQueue.value.items, now.value);
  }
  let currentEst = now.value;
  if (activeQueues.value.length > 0) {
    currentEst = Math.max(...activeQueues.value.map((q: any) => q.startDate + q.durationMs));
  }
  let totalMs = 0;
  const items = researchQueue.value.items.map((item) => {
    const dur = item.durationMs || 60000;
    const estStart = currentEst;
    const estFinish = currentEst + dur;
    currentEst = estFinish;
    totalMs += dur;
    return {
      ...item,
      estStart,
      estFinish,
    };
  });
  return {
    items,
    totalDurationMs: totalMs,
    allDoneAt: currentEst,
  };
});

function moveQueueItem(idx: number, direction: 'up' | 'down') {
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= researchQueue.value.items.length) return;
  const item = researchQueue.value.items.splice(idx, 1)[0];
  researchQueue.value.items.splice(newIdx, 0, item);
  saveResearchQueue();
}

function removeQueueItem(idx: number) {
  researchQueue.value.items.splice(idx, 1);
  saveResearchQueue();
}

function clearQueue() {
  researchQueue.value.items = [];
  saveResearchQueue();
}

// Researches from cache
const rawResearches = computed(() => {
  const rawData = cache.value?.researchStatus?.data?.researches || cache.value?.clan_getSummary?.data?.researches;
  const data = normalizeArray(rawData);
  if (Array.isArray(data)) {
    return data
      .map((r: any) => ({
        id: Number(r.researchId ?? r.id),
        level: Number(r.level) || 0,
        isCompleted: true,
      }))
      .filter((r: any) => Number.isFinite(r.id));
  }
  return Object.entries(data)
    .map(([id, r]: [string, any]) => ({
      id: Number(id),
      level: Number(r?.level) || 0,
      isCompleted: true,
    }))
    .filter((r: any) => Number.isFinite(r.id));
});

// All researches directory data
const allResearchesList = computed(() => {
  const researchMap = new Map<number, any>();
  const raw = rawResearches.value;
  for (const r of raw) {
    const rId = Number(r.id);
    if (Number.isFinite(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: r.level ?? 1,
        isCompleted: true,
        isResearching: false,
        nextLevel: (r.level ?? 1) + 1,
      });
    }
  }

  for (const q of activeQueues.value) {
    const rId = Number(q.researchId);
    if (researchMap.has(rId)) {
      const item = researchMap.get(rId)!;
      item.isResearching = true;
      item.nextLevel = q.level ?? (item.level + 1);
    } else {
      researchMap.set(rId, {
        id: rId,
        level: q.level ? q.level - 1 : 0,
        isCompleted: false,
        isResearching: true,
        nextLevel: q.level ?? 1,
      });
    }
  }

  const allDict = (globalThis as any).hwaHelperNameData?.names?.research || {};
  for (const key of Object.keys(allDict)) {
    const rId = Number(key);
    if (!researchMap.has(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: 0,
        isCompleted: false,
        isResearching: false,
        nextLevel: 1,
      });
    }
  }

  const rDataDict = (globalThis as any).hwaHelperResearchData?.data || {};
  for (const key of Object.keys(rDataDict)) {
    const rId = Number(key);
    if (!researchMap.has(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: 0,
        isCompleted: false,
        isResearching: false,
        nextLevel: 1,
      });
    }
  }

  return Array.from(researchMap.values());
});

const completedResearchesCount = computed(() => {
  return allResearchesList.value.filter((r) => r.isCompleted).length;
});

const availableResearchesCount = computed(() => {
  return allResearchesList.value.filter((r) => !r.isCompleted && !r.isResearching).length;
});

// Research Center building level (ID 43 / 165)
const researchCenterLevel = computed(() => {
  const rawBuildings = normalizeArray(cache.value?.buildingStatus?.data?.buildings || cache.value?.clan_getSummary?.data?.buildings);
  let baseLevel = 0;
  let found = false;
  if (Array.isArray(rawBuildings) && rawBuildings.length > 0) {
    const center = rawBuildings.find((b: any) => (b.buildingId ?? b.id) === 43 || (b.buildingId ?? b.id) === 165);
    if (center && Number.isFinite(center.level)) {
      baseLevel = Number(center.level);
      found = true;
    }
  }
  if (!found && !rawBuildings.length) {
    return Infinity;
  }
  let projected = baseLevel;
  const buildingQueues = normalizeArray(cache.value?.buildingStatus?.data?.queues);
  for (const q of buildingQueues) {
    const bId = Number(q.buildingId ?? q.id);
    if ((bId === 43 || bId === 165) && Number.isFinite(q.level)) {
      projected = Math.max(projected, Number(q.level));
    }
  }
  for (const item of buildingQueueItems.value) {
    const bId = Number(item.buildingId);
    if ((bId === 43 || bId === 165) && Number.isFinite(item.nextLevel)) {
      projected = Math.max(projected, Number(item.nextLevel));
    }
  }
  return projected;
});

// Calculate simulated levels including active queue and queued automation items
const simulatedResearchLevels = computed(() => {
  const rQueueHelper = (globalThis as any).hwaHelperResearchQueue;
  const researchMap = new Map<number, number>();
  for (const r of allResearchesList.value) {
    researchMap.set(Number(r.id), Number(r.level) || 0);
  }
  if (rQueueHelper?.getSimulatedLevels) {
    return rQueueHelper.getSimulatedLevels(researchMap, rawQueues.value, researchQueue.value.items);
  }
  const sim = new Map<number, number>();
  for (const [id, r] of researchMap.entries()) sim.set(id, r);
  for (const q of normalizeArray(rawQueues.value)) {
    if (Number.isFinite(q.researchId) && Number.isFinite(q.level)) {
      sim.set(Number(q.researchId), Math.max(sim.get(Number(q.researchId)) || 0, q.level));
    }
  }
  for (const item of normalizeArray(researchQueue.value?.items)) {
    if (Number.isFinite(item.researchId) && Number.isFinite(item.nextLevel)) {
      sim.set(Number(item.researchId), Math.max(sim.get(Number(item.researchId)) || 0, item.nextLevel));
    }
  }
  return sim;
});

// Section 2: Candidate upgrades
const upgradeCandidates = computed(() => {
  const researchDataHelper = (globalThis as any).hwaHelperResearchData;
  const simulatedLevels = simulatedResearchLevels.value;
  const centerLevel = researchCenterLevel.value;

  return allResearchesList.value
    .map((r: any) => {
      const curLvl = simulatedLevels.get(r.id) ?? (r.isCompleted ? r.level : 0);
      const nextLvl = (curLvl > 0 || r.isCompleted) ? (curLvl + 1) : 1;
      const durationMs = researchDataHelper?.calculateEffectiveDurationMs
        ? researchDataHelper.calculateEffectiveDurationMs(r.id, nextLvl)
        : 60000;
      const maxLvl = researchDataHelper?.getMaxLevel ? researchDataHelper.getMaxLevel(r.id) : 0;
      return {
        ...r,
        name: getResearchName(r.id),
        currentLevel: curLvl,
        level: curLvl,
        nextLevel: nextLvl,
        maxLevel: maxLvl,
        durationMs: durationMs || 60000,
      };
    })
    .filter((r: any) => {
      if (researchDataHelper?.getMaxLevel) {
        const maxLevel = researchDataHelper.getMaxLevel(r.id);
        if (maxLevel > 0) {
          if (r.nextLevel > maxLevel) return false;
          if (researchDataHelper.isAvailable && !researchDataHelper.isAvailable(r.id, r.nextLevel, simulatedLevels, centerLevel)) {
            return false;
          }
          return true;
        }
      }
      return (r.currentLevel > 0 || r.isCompleted) && r.nextLevel <= centerLevel;
    })
    .sort((a: any, b: any) => (b.currentLevel - a.currentLevel) || (a.id - b.id));
});

const filteredNextResearch = computed(() => {
  const query = nextResearchFilterQuery.value.toLowerCase().trim();
  return upgradeCandidates.value
    .filter((r: any) => {
      if (!query) return true;
      const name = (r.name || getResearchName(r.id)).toLowerCase();
      const idStr = String(r.id);
      return name.includes(query) || idStr.includes(query);
    })
    .sort((a: any, b: any) => {
      const aDur = a.durationMs || 0;
      const bDur = b.durationMs || 0;
      const aLvl = a.currentLevel ?? a.level ?? 0;
      const bLvl = b.currentLevel ?? b.level ?? 0;
      if (nextResearchSortOrder.value === 'time-asc') {
        return (aDur - bDur) || (bLvl - aLvl) || (a.id - b.id);
      }
      if (nextResearchSortOrder.value === 'time-desc') {
        return (bDur - aDur) || (bLvl - aLvl) || (a.id - b.id);
      }
      if (nextResearchSortOrder.value === 'level-asc') {
        return (aLvl - bLvl) || (a.id - b.id);
      }
      if (nextResearchSortOrder.value === 'name-asc') {
        const nameA = a.name || getResearchName(a.id);
        const nameB = b.name || getResearchName(b.id);
        return nameA.localeCompare(nameB) || (a.id - b.id);
      }
      return (bLvl - aLvl) || (a.id - b.id);
    });
});

function locateResearch(r: any) {
  const name = r.name || getResearchName(r.id);
  researchSearchQuery.value = name;
  const el = document.getElementById('research-search-input');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus();
}

function addToQueue(candidate: any) {
  researchQueue.value.items.push({
    researchId: Number(candidate.id),
    currentLevel: Number(candidate.currentLevel ?? candidate.level ?? 0),
    nextLevel: Number(candidate.nextLevel ?? 1),
    durationMs: Number(candidate.durationMs) || 60000,
  });
  saveResearchQueue();
}

const isStarting = ref<Record<string, boolean>>({});

function hasEnoughResearchResources(candidate: any) {
  const rHelper = (globalThis as any).hwaHelperResearchData;
  if (!rHelper?.getMissingCosts) return true;
  const resourcesMap = new Map([
    [1, cache.value?.['resource:material:1']?.data?.amount ?? 0],
    [2, cache.value?.['resource:material:2']?.data?.amount ?? 0],
    [3, cache.value?.['resource:material:3']?.data?.amount ?? 0],
    [4, cache.value?.['resource:material:4']?.data?.amount ?? 0],
    [5, cache.value?.['resource:material:5']?.data?.amount ?? 0],
    [12, cache.value?.['resource:material:12']?.data?.amount ?? 0],
  ]);
  const missing = rHelper.getMissingCosts(candidate.id, candidate.nextLevel, resourcesMap);
  return !missing || missing.length === 0;
}

function requiresSpecialResource(researchId: number | string, level: number = 1): boolean {
  const rHelper = (globalThis as any).hwaHelperResearchData;
  if (typeof rHelper?.requiresSpecialResource === 'function') {
    return rHelper.requiresSpecialResource(Number(researchId), Number(level));
  }
  if (!rHelper) return false;
  const meta = rHelper.getResearchLevelData?.(Number(researchId), Number(level)) || rHelper.data?.[Number(researchId)]?.['1'];
  if (!meta || !meta.c) return false;
  return Object.keys(meta.c).some((m: string) => Number(m) === 12 || Number(m) > 5);
}

async function startResearchUpgrade(candidate: any) {
  const key = `${candidate.id}-${candidate.nextLevel}`;
  isStarting.value[key] = true;
  try {
    const calls: any[] = [];
    for (const f of normalizeArray(finishedQueues.value)) {
      calls.push({
        name: 'completeResearch',
        feature: 'personalResearch',
        args: {
          researchId: f.researchId,
          level: f.level,
          queueNumber: f.queueNumber || 0,
        },
      });
    }
    calls.push({
      name: 'startResearch',
      feature: 'personalResearch',
      args: {
        researchId: candidate.id,
        nextLevel: candidate.nextLevel,
        level: candidate.nextLevel,
        startDate: Date.now(),
        durationMs: candidate.durationMs || 60000,
        queueNumber: 0,
      },
    });
    calls.push({ name: 'getSummary', feature: 'personalResearch', args: {} });
    await dispatchRpc(calls);
    try {
      chrome.runtime?.sendMessage?.({ kind: 'research-queue-action', action: 'sync' });
    } catch {}
  } finally {
    isStarting.value[key] = false;
  }
}

// Section 3: Directory filter
const filteredResearchDirectory = computed(() => {
  const query = researchSearchQuery.value.toLowerCase().trim();
  return allResearchesList.value
    .filter((r: any) => {
      if (researchFilterTab.value === 'completed' && !r.isCompleted) return false;
      if (researchFilterTab.value === 'in_progress' && !r.isResearching) return false;
      if (researchFilterTab.value === 'available' && (r.isCompleted || r.isResearching)) return false;
      if (!query) {
        if (researchFilterTab.value === 'all') return r.isCompleted || r.isResearching;
        return true;
      }
      const name = getResearchName(r.id).toLowerCase();
      const idStr = String(r.id);
      return name.includes(query) || idStr.includes(query);
    })
    .sort((a: any, b: any) => {
      if (a.isResearching !== b.isResearching) return a.isResearching ? -1 : 1;
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1;
      return (b.level - a.level) || (a.id - b.id);
    });
});

async function refreshResearch() {
  await dispatchRpc([{ name: 'clan_getSummary' }, { name: 'getSummary', feature: 'personalResearch' }]);
}
</script>

<template>
  <div
    v-if="modelValue"
    id="research-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="research-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    @click.self="close"
  >
    <div
      class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-slate-800 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="text-xl shrink-0" aria-hidden="true">🔬</span>
          <h2 id="research-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Academy Research Tree
          </h2>

          <!-- Status Badge -->
          <div id="research-dialog-status" class="flex items-center gap-2 truncate">
            <span
              v-if="activeQueues.length > 0"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            >
              <span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Active: <span class="truncate max-w-[140px]">{{ getResearchName(activeQueues[0].researchId) }}</span>
              {{ activeQueues[0].level ? ` Lv. ${activeQueues[0].level}` : '' }} ·
              {{ formatDuration(Math.max(0, Math.ceil(((activeQueues[0].startDate + activeQueues[0].durationMs) - now) / 1000))) }}
            </span>
            <span
              v-else-if="finishedQueues.length > 0"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              <span class="size-1.5 rounded-full bg-emerald-500"></span>
              Ready to finish: {{ getResearchName(finishedQueues[0].researchId) }}
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              <span class="size-1.5 rounded-full bg-emerald-500"></span>
              Idle
            </span>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close research dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="research-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Section 1: Active Research Queue -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span class="flex items-center gap-2">
              <span>🔬</span> Active Research Queue
            </span>
            <button
              type="button"
              class="cursor-pointer text-2xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 lowercase font-normal"
              @click="refreshResearch"
            >
              ↻ refresh
            </button>
          </h3>

          <div v-if="activeQueues.length > 0 || finishedQueues.length > 0" class="space-y-3">
            <!-- Finished Queues -->
            <div
              v-for="f in finishedQueues"
              :key="`fin-${f.researchId}-${f.level}`"
              class="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30 flex items-center justify-between gap-2 flex-wrap"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xl">🎉</span>
                <div>
                  <div class="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                    <span>{{ getResearchName(f.researchId) }} · Complete</span>
                    <span
                      v-if="requiresSpecialResource(f.researchId, f.level)"
                      class="special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none"
                      title="Requires Honor Marks / Special Material"
                      aria-label="Requires Honor Marks"
                    >
                      🎖️
                    </span>
                  </div>
                  <div class="text-xs text-emerald-700 dark:text-emerald-400">
                    Queue #{{ f.queueNumber ?? 0 }} · Target Lv. {{ f.level ?? '?' }} finished
                  </div>
                </div>
              </div>

              <button
                type="button"
                :disabled="isFinishing[`${f.researchId}-${f.level}`]"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                @click="finishResearch(f)"
              >
                <span>✅</span>
                <span>{{ isFinishing[`${f.researchId}-${f.level}`] ? 'Finishing...' : 'Finish' }}</span>
              </button>
            </div>

            <!-- In Progress Queues -->
            <div
              v-for="q in activeQueues"
              :key="`act-${q.researchId}-${q.startDate}`"
              class="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20"
            >
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-lg">🔬</span>
                  <div>
                    <div class="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                      <span>{{ getResearchName(q.researchId) }}</span>
                      <span
                        v-if="requiresSpecialResource(q.researchId, q.level)"
                        class="special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none"
                        title="Requires Honor Marks / Special Material"
                        aria-label="Requires Honor Marks"
                      >
                        🎖️
                      </span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      Queue #{{ q.queueNumber ?? 0 }} · Research ID: {{ q.researchId }}
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                    Target Lv. {{ q.level ?? '?' }}
                  </span>
                  <div class="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 mt-1">
                    {{ formatDuration(Math.max(0, Math.ceil(((q.startDate + q.durationMs) - now) / 1000))) }} remaining
                  </div>
                </div>
              </div>

              <div class="mt-3">
                <div class="flex justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>
                    Progress: {{ Math.min(100, Math.max(0, ((now - q.startDate) / q.durationMs) * 100)).toFixed(1) }}%
                  </span>
                  <span>
                    Est. finish: {{ new Date(q.startDate + q.durationMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
                  </span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    class="bg-purple-500 h-full rounded-full transition-all"
                    :style="{ width: `${Math.min(100, Math.max(0, ((now - q.startDate) / q.durationMs) * 100))}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty idle box -->
          <div
            v-else
            class="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400"
          >
            <span class="text-xl">✅</span>
            <div>
              <div class="font-semibold text-slate-700 dark:text-slate-300">Academy is currently idle</div>
              <div>No technology research in progress. Ready for new technology research.</div>
            </div>
          </div>

          <!-- Subsection: Auto-Research Queue -->
          <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>⚡</span> Auto-Research Queue
                </span>
                <span class="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ researchQueue.items.length }} queued
                </span>
              </div>

              <div class="flex items-center gap-2">
                <label class="inline-flex items-center gap-1.5 text-2xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    v-model="researchQueue.enabled"
                    type="checkbox"
                    class="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
                    @change="saveResearchQueue"
                  />
                  <span>Auto-advance</span>
                </label>

                <button
                  v-if="researchQueue.items.length > 0"
                  type="button"
                  class="text-2xs text-rose-500 hover:text-rose-600 dark:text-rose-400 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  @click="clearQueue"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- Queue list -->
            <div v-if="queueTimeline.items.length > 0" class="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
              <div
                v-for="(item, idx) in queueTimeline.items"
                :key="`rqueue-${idx}-${item.researchId}`"
                class="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs dark:border-slate-700/60 dark:bg-slate-800/60"
              >
                <div class="min-w-0 flex items-center gap-2 flex-1">
                  <span class="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-2xs font-bold shrink-0">
                    #{{ idx + 1 }}
                  </span>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                      <span>{{ getResearchName(item.researchId) }}</span>
                      <span
                        v-if="requiresSpecialResource(item.researchId, item.nextLevel)"
                        class="special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none"
                        title="Requires Honor Marks / Special Material"
                        aria-label="Requires Honor Marks"
                      >
                        🎖️
                      </span>
                      <span class="text-2xs font-normal text-slate-400">(ID: {{ item.researchId }})</span>
                    </div>
                    <div class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-amber-600 dark:text-amber-400">
                        Lv. {{ item.currentLevel ?? '?' }} ➔ {{ item.nextLevel }}
                      </span>
                      <span>·</span>
                      <span>⏱ {{ formatDuration(Math.ceil((item.durationMs || 1000) / 1000)) }}</span>
                      <span v-if="item.estFinish">
                        · Est: {{ new Date(item.estStart!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }} ➔ {{ new Date(item.estFinish).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Move up"
                    :disabled="idx === 0"
                    class="size-6 rounded flex items-center justify-center text-2xs transition-colors"
                    :class="
                      idx === 0
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer'
                    "
                    @click="moveQueueItem(idx, 'up')"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    :disabled="idx === queueTimeline.items.length - 1"
                    class="size-6 rounded flex items-center justify-center text-2xs transition-colors"
                    :class="
                      idx === queueTimeline.items.length - 1
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer'
                    "
                    @click="moveQueueItem(idx, 'down')"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    title="Remove from queue"
                    class="size-6 rounded flex items-center justify-center text-2xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    @click="removeQueueItem(idx)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <!-- Queue footer -->
              <div class="mt-2 text-2xs text-slate-400 dark:text-slate-500 flex justify-between items-center">
                <span>
                  Total time:
                  <strong class="font-semibold text-slate-600 dark:text-slate-300">
                    {{ formatDuration(Math.ceil(queueTimeline.totalDurationMs / 1000)) }}
                  </strong>
                </span>
                <span>
                  Completion:
                  <strong class="font-semibold text-slate-600 dark:text-slate-300">
                    {{ queueTimeline.allDoneAt ? new Date(queueTimeline.allDoneAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }}
                  </strong>
                </span>
              </div>
            </div>

            <p v-else class="text-2xs text-slate-400 italic py-1">
              Queue is empty. Click "+ Queue" on candidates below to automate next upgrades.
            </p>
          </div>
        </section>

        <!-- Section 2: Research Upgrade Candidates -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>⚡</span> Next Research Candidates
            </h3>
            <span id="next-research-count-badge" class="text-2xs font-normal text-slate-400">
              {{ nextResearchFilterQuery ? `${filteredNextResearch.length} / ${upgradeCandidates.length} available` : `${upgradeCandidates.length} available` }}
            </span>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ activeQueues.length > 0 ? 'Academy queue is currently occupied. Once complete, the following technologies can be researched or upgraded next:' : 'Academy queue is available. The following technologies can be researched or upgraded next:' }}
          </p>

          <!-- Search & Sort Controls -->
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex-1 min-w-[140px]">
              <input
                id="next-research-search-input"
                v-model="nextResearchFilterQuery"
                type="search"
                placeholder="Filter research or ID..."
                class="h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
              <span class="text-2xs text-slate-400">Sort:</span>
              <select
                id="next-research-sort-select"
                v-model="nextResearchSortOrder"
                class="h-7 rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-700 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="level-desc">Level: High → Low</option>
                <option value="level-asc">Level: Low → High</option>
                <option value="time-asc">Research Time: Shortest → Longest</option>
                <option value="time-desc">Research Time: Longest → Shortest</option>
                <option value="name-asc">Name: A → Z</option>
              </select>
            </div>
          </div>

          <div v-if="filteredNextResearch.length === 0" class="text-center py-4 text-xs text-slate-400 italic">
            {{ nextResearchFilterQuery ? 'No matching research found.' : 'No research candidates found.' }}
          </div>

          <div v-else id="next-research-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
            <div
              v-for="r in filteredNextResearch"
              :key="`rcandidate-${r.id}`"
              class="rounded-xl border border-slate-200/90 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div class="flex items-center justify-between gap-2 min-w-0">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                    #{{ r.id }}
                  </span>
                  <span class="font-bold text-slate-900 dark:text-slate-100 truncate text-xs sm:text-sm" :title="r.name || getResearchName(r.id)">
                    {{ r.name || getResearchName(r.id) }}
                  </span>
                  <span
                    v-if="requiresSpecialResource(r.id, r.nextLevel)"
                    class="special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none"
                    title="Requires Honor Marks / Special Material"
                    aria-label="Requires Honor Marks"
                  >
                    🎖️
                  </span>
                </div>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 shrink-0">
                  {{ (r.currentLevel ?? r.level ?? 0) > 0 ? `Lv. ${r.currentLevel ?? r.level} ➔ ${r.nextLevel}${r.maxLevel ? ` / ${r.maxLevel}` : ''}` : `Lv. 1${r.maxLevel ? ` / ${r.maxLevel}` : ''}` }}
                </span>
              </div>

              <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/50">
                <div class="flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400 min-w-0">
                  <span class="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300" title="Research Duration">
                    <span>⏱</span><span>{{ formatDuration(Math.ceil((r.durationMs || 300000) / 1000)) }}</span>
                  </span>
                  <span class="text-slate-300 dark:text-slate-600">·</span>
                  <span class="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500" title="Estimated Finish Time">
                    <span>🏁</span><span>{{ new Date((queueTimeline.allDoneAt || now) + (r.durationMs || 300000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600 shrink-0"
                    :title="`Locate ${r.name || getResearchName(r.id)} in academy technologies directory`"
                    :aria-label="`Locate ${r.name || getResearchName(r.id)}`"
                    @click="locateResearch(r)"
                  >
                    <span>🔍</span>
                  </button>

                  <button
                    type="button"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600 shrink-0"
                    :title="`Add ${r.name || getResearchName(r.id)} Lv. ${r.nextLevel} to auto-research queue`"
                    :aria-label="`Queue ${r.name || getResearchName(r.id)} Lv. ${r.nextLevel}`"
                    @click="addToQueue(r)"
                  >
                    <span>➕</span>
                  </button>

                  <button
                    v-if="activeQueues.length === 0 && !r.isResearching && hasEnoughResearchResources(r)"
                    type="button"
                    :disabled="isStarting[`${r.id}-${r.nextLevel}`]"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                    :title="`${isStarting[`${r.id}-${r.nextLevel}`] ? 'Starting research...' : 'Research'} ${r.name || getResearchName(r.id)} to Lv. ${r.nextLevel}`"
                    :aria-label="`Research ${r.name || getResearchName(r.id)} to Lv. ${r.nextLevel}`"
                    @click="startResearchUpgrade(r)"
                  >
                    <span v-if="isStarting[`${r.id}-${r.nextLevel}`]" class="animate-spin text-3xs">⏳</span>
                    <span v-else>🔬</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 3: Personal Research Directory -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>📚</span> Personal Research Directory
              </h3>
              <p id="research-count-subtitle" class="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">
                {{ researchSearchQuery ? `${filteredResearchDirectory.length} matching "${researchSearchQuery}" (${completedResearchesCount} completed)` : `${completedResearchesCount} completed technologies` }}
              </p>
            </div>

            <div class="w-full sm:w-64">
              <input
                id="research-search-input"
                v-model="researchSearchQuery"
                type="search"
                placeholder="Search technologies or ID..."
                class="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
          </div>

          <!-- Filter Tabs -->
          <div id="research-filter-tabs" class="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              class="cursor-pointer rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors"
              :class="researchFilterTab === 'all' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'"
              @click="researchFilterTab = 'all'"
            >
              All ({{ allResearchesList.length }})
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors"
              :class="researchFilterTab === 'completed' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'"
              @click="researchFilterTab = 'completed'"
            >
              Completed ({{ completedResearchesCount }})
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors"
              :class="researchFilterTab === 'in_progress' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'"
              @click="researchFilterTab = 'in_progress'"
            >
              In Progress ({{ activeQueues.length }})
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors"
              :class="researchFilterTab === 'available' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'"
              @click="researchFilterTab = 'available'"
            >
              Available ({{ availableResearchesCount }})
            </button>
          </div>

          <div v-if="filteredResearchDirectory.length === 0" class="col-span-full py-8 text-center text-xs text-slate-400">
            No research matches your filters.
          </div>

          <div v-else id="research-grid-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            <div
              v-for="r in filteredResearchDirectory"
              :key="`rdir-${r.id}`"
              class="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors"
              :class="
                r.isResearching
                  ? 'border-purple-300 bg-purple-50/70 dark:border-purple-800 dark:bg-purple-950/30'
                  : r.isCompleted
                    ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                    : 'border-dashed border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40'
              "
            >
              <div class="min-w-0">
                <div
                  class="font-semibold truncate flex items-center gap-1.5"
                  :class="r.isCompleted ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'"
                  :title="getResearchName(r.id)"
                >
                  <span class="truncate">{{ getResearchName(r.id) }}</span>
                  <span
                    v-if="requiresSpecialResource(r.id, r.isCompleted ? r.level : (r.nextLevel || 1))"
                    class="special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none"
                    title="Requires Honor Marks / Special Material"
                    aria-label="Requires Honor Marks"
                  >
                    🎖️
                  </span>
                </div>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  ID: {{ r.id }}
                </div>
              </div>

              <div class="text-right shrink-0 space-y-1">
                <div
                  class="font-bold text-xs"
                  :class="r.isCompleted ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'"
                >
                  {{ r.isCompleted ? `Lv. ${r.level}` : '—' }}
                </div>
                <div>
                  <span
                    v-if="r.isResearching"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                  >
                    <span class="size-1 rounded-full bg-amber-500 animate-pulse"></span>Researching
                  </span>
                  <span
                    v-else-if="r.isCompleted"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  >
                    Completed
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Available
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
