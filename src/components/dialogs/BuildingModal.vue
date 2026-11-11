<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getBuildingName } from '@/src/utils/metadata';
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
const nextBuildingFilterQuery = ref('');
const nextBuildingSortOrder = ref<'level-desc' | 'level-asc' | 'time-asc' | 'time-desc' | 'name-asc'>('level-desc');
const buildingSearchQuery = ref('');

// Storage-backed auto-queue
interface BuildingQueueItem {
  buildingId: number;
  currentLevel: number;
  nextLevel: number;
  durationMs: number;
  estStart?: number;
  estFinish?: number;
}

interface BuildingQueueState {
  enabled: boolean;
  items: BuildingQueueItem[];
}

const buildingQueue = ref<BuildingQueueState>({
  enabled: true,
  items: [],
});

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['buildingQueue']);
      if (stored.buildingQueue) {
        buildingQueue.value = {
          enabled: stored.buildingQueue.enabled !== false,
          items: Array.isArray(stored.buildingQueue.items) ? stored.buildingQueue.items : [],
        };
      }
    } catch (_) {}
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('keydown', handleKeydown);
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

async function saveBuildingQueue() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      buildingQueue: {
        enabled: buildingQueue.value.enabled,
        items: buildingQueue.value.items,
      },
    });
    try {
      chrome.runtime?.sendMessage?.({ kind: 'building-queue-action', action: 'sync' });
    } catch {}
  }
}

// Queues from cache
const rawQueues = computed(() => normalizeArray(cache.value?.buildingStatus?.data?.queues));

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

async function finishConstruction(f: any) {
  const key = `${f.buildingId}-${f.level}`;
  isFinishing.value[key] = true;
  try {
    await dispatchRpc([
      {
        name: 'completeConstruction',
        feature: 'building',
        args: {
          buildingId: f.buildingId,
          nextLevel: f.level,
          completeDate: Date.now(),
        },
      },
      { name: 'getSummary', feature: 'building', args: {} },
    ]);
  } finally {
    isFinishing.value[key] = false;
  }
}

// Timeline
const queueTimeline = computed(() => {
  const bQueueHelper = (globalThis as any).hwaHelperBuildingQueue;
  if (bQueueHelper?.calculateQueueTimeline) {
    return bQueueHelper.calculateQueueTimeline(rawQueues.value, buildingQueue.value.items, now.value);
  }
  let currentEst = now.value;
  if (activeQueues.value.length > 0) {
    currentEst = Math.max(...activeQueues.value.map((q: any) => q.startDate + q.durationMs));
  }
  let totalMs = 0;
  const items = buildingQueue.value.items.map((item) => {
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
  if (newIdx < 0 || newIdx >= buildingQueue.value.items.length) return;
  const item = buildingQueue.value.items.splice(idx, 1)[0];
  buildingQueue.value.items.splice(newIdx, 0, item);
  saveBuildingQueue();
}

function removeQueueItem(idx: number) {
  buildingQueue.value.items.splice(idx, 1);
  saveBuildingQueue();
}

function clearQueue() {
  buildingQueue.value.items = [];
  saveBuildingQueue();
}

// Raw buildings from cache
const rawBuildings = computed(() => {
  const rawData = cache.value?.buildingStatus?.data?.buildings || cache.value?.clan_getSummary?.data?.buildings;
  const data = normalizeArray(rawData);
  if (Array.isArray(data)) {
    return data
      .map((b: any) => ({
        id: Number(b.buildingId ?? b.id),
        level: Number(b.level) || 0,
        initialBuildDate: b.initialBuildDate,
        isBuilt: true,
      }))
      .filter((b: any) => Number.isFinite(b.id));
  }
  return Object.entries(data)
    .map(([id, b]: [string, any]) => ({
      id: Number(id),
      level: Number(b?.level) || 0,
      initialBuildDate: b?.initialBuildDate,
      isBuilt: true,
    }))
    .filter((b: any) => Number.isFinite(b.id));
});

// Section 3: All City Buildings Directory
const allBuildingsList = computed(() => {
  const buildingMap = new Map<number, any>();
  const raw = rawBuildings.value;
  for (const b of raw) {
    const bId = Number(b.id);
    if (Number.isFinite(bId)) {
      buildingMap.set(bId, {
        id: bId,
        level: b.level ?? 1,
        initialBuildDate: b.initialBuildDate,
        isBuilt: true,
        isUpgrading: false,
        nextLevel: (b.level ?? 1) + 1,
      });
    }
  }

  for (const q of activeQueues.value) {
    const bId = Number(q.buildingId);
    if (buildingMap.has(bId)) {
      const item = buildingMap.get(bId)!;
      item.isUpgrading = true;
      item.nextLevel = q.level ?? (item.level + 1);
    } else {
      buildingMap.set(bId, {
        id: bId,
        level: q.level ? q.level - 1 : 1,
        isBuilt: true,
        isUpgrading: true,
        nextLevel: q.level ?? 2,
      });
    }
  }

  const allDict = (globalThis as any).hwaHelperNameData?.names?.building || {};
  for (const key of Object.keys(allDict)) {
    const bId = Number(key);
    if (!buildingMap.has(bId)) {
      buildingMap.set(bId, {
        id: bId,
        level: 0,
        isBuilt: false,
        isUpgrading: false,
        nextLevel: 1,
      });
    }
  }

  return Array.from(buildingMap.values());
});

// Calculate simulated levels including active queue and queued automation items
const simulatedBuildingLevels = computed(() => {
  const bQueueHelper = (globalThis as any).hwaHelperBuildingQueue;
  const buildingMap = new Map<number, number>();
  for (const b of allBuildingsList.value) {
    buildingMap.set(Number(b.id), Number(b.level) || 0);
  }
  if (bQueueHelper?.getSimulatedLevels) {
    return bQueueHelper.getSimulatedLevels(buildingMap, rawQueues.value, buildingQueue.value.items);
  }
  const sim = new Map<number, number>();
  for (const [id, lvl] of buildingMap.entries()) sim.set(id, lvl);
  for (const q of rawQueues.value || []) {
    const bId = Number(q.buildingId);
    if (Number.isFinite(bId) && Number.isFinite(q.level)) {
      sim.set(bId, Math.max(sim.get(bId) || 0, q.level));
    }
  }
  for (const item of buildingQueue.value.items || []) {
    const bId = Number(item.buildingId);
    if (Number.isFinite(bId) && Number.isFinite(item.nextLevel)) {
      sim.set(bId, Math.max(sim.get(bId) || 0, item.nextLevel));
    }
  }
  return sim;
});

const SYSTEM_LANDMARK_BUILDING_IDS = new Set([44, 160, 161, 166, 167, 168, 169, 176, 177]);

// Section 2: Candidate upgrades
const upgradeCandidates = computed(() => {
  const bHelper = (globalThis as any).hwaHelperBuildingData;
  const simulatedLevels = simulatedBuildingLevels.value;
  const hallLevel = simulatedLevels.get(20) ?? Infinity;

  return allBuildingsList.value
    .map((b: any) => {
      const curLvl = simulatedLevels.get(b.id) ?? (b.isBuilt ? b.level : 0);
      const nextLvl = (curLvl > 0 || b.isBuilt) ? (curLvl + 1) : 1;
      const durationMs = bHelper?.calculateEffectiveDurationMs
        ? bHelper.calculateEffectiveDurationMs(b.id, nextLvl)
        : 1000;
      return {
        ...b,
        name: getBuildingName(b.id),
        currentLevel: curLvl,
        level: curLvl,
        nextLevel: nextLvl,
        durationMs: durationMs || 1000,
      };
    })
    .filter((b: any) => {
      if (SYSTEM_LANDMARK_BUILDING_IDS.has(Number(b.id))) return false;
      if (!b.isBuilt && (b.currentLevel ?? b.level ?? 0) <= 0) return false;
      if (b.isUpgrading) return false;
      if (b.id !== 20 && b.level >= hallLevel) return false;
      if (bHelper?.getBuildingLevelData && bHelper.data?.[b.id] && !bHelper.getBuildingLevelData(b.id, b.nextLevel)) {
        return false;
      }
      if (bHelper?.getMissingRequirements) {
        const missingReqs = bHelper.getMissingRequirements(b.id, b.nextLevel, simulatedLevels);
        if (missingReqs && missingReqs.length > 0) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => (b.level - a.level) || (a.id - b.id));
});

const filteredNextBuildings = computed(() => {
  const query = nextBuildingFilterQuery.value.toLowerCase().trim();
  return upgradeCandidates.value
    .filter((b: any) => {
      if (!query) return true;
      const name = (b.name || getBuildingName(b.id)).toLowerCase();
      const idStr = String(b.id);
      return name.includes(query) || idStr.includes(query);
    })
    .sort((a: any, b: any) => {
      const aDur = a.durationMs || 0;
      const bDur = b.durationMs || 0;
      const aLvl = a.currentLevel ?? a.level ?? 0;
      const bLvl = b.currentLevel ?? b.level ?? 0;
      if (nextBuildingSortOrder.value === 'time-asc') {
        return (aDur - bDur) || (bLvl - aLvl) || (a.id - b.id);
      }
      if (nextBuildingSortOrder.value === 'time-desc') {
        return (bDur - aDur) || (bLvl - aLvl) || (a.id - b.id);
      }
      if (nextBuildingSortOrder.value === 'level-asc') {
        return (aLvl - bLvl) || (a.id - b.id);
      }
      if (nextBuildingSortOrder.value === 'name-asc') {
        const nameA = a.name || getBuildingName(a.id);
        const nameB = b.name || getBuildingName(b.id);
        return nameA.localeCompare(nameB) || (a.id - b.id);
      }
      return (bLvl - aLvl) || (a.id - b.id);
    });
});

function locateBuilding(b: any) {
  const name = b.name || getBuildingName(b.id);
  buildingSearchQuery.value = name;
  const el = document.getElementById('building-search-input');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus();
}

function addToQueue(candidate: any) {
  buildingQueue.value.items.push({
    buildingId: Number(candidate.id),
    currentLevel: Number(candidate.currentLevel ?? candidate.level ?? 0),
    nextLevel: Number(candidate.nextLevel ?? 1),
    durationMs: Number(candidate.durationMs) || 60000,
  });
  saveBuildingQueue();
}

const isStarting = ref<Record<string, boolean>>({});

function hasEnoughBuildingResources(candidate: any) {
  const bHelper = (globalThis as any).hwaHelperBuildingData;
  if (!bHelper?.getMissingCosts) return true;
  const resourcesMap = new Map([
    [2, cache.value?.['resource:material:2']?.data?.amount ?? 0],
    [3, cache.value?.['resource:material:3']?.data?.amount ?? 0],
    [4, cache.value?.['resource:material:4']?.data?.amount ?? 0],
    [5, cache.value?.['resource:material:5']?.data?.amount ?? 0],
  ]);
  const missing = bHelper.getMissingCosts(candidate.id, candidate.nextLevel, resourcesMap);
  return !missing || missing.length === 0;
}

async function startBuildingUpgrade(candidate: any) {
  const key = `${candidate.id}-${candidate.nextLevel}`;
  isStarting.value[key] = true;
  try {
    const calls: any[] = [];
    for (const f of finishedQueues.value) {
      calls.push({
        name: 'completeConstruction',
        feature: 'building',
        args: {
          buildingId: f.buildingId,
          nextLevel: f.level,
          completeDate: Date.now(),
        },
      });
    }
    calls.push({
      name: 'startConstruction',
      feature: 'building',
      args: {
        buildingId: candidate.id,
        nextLevel: candidate.nextLevel,
        startDate: Date.now(),
        durationMs: candidate.durationMs || 60000,
      },
    });
    calls.push({ name: 'getSummary', feature: 'building', args: {} });
    await dispatchRpc(calls);
    try {
      chrome.runtime?.sendMessage?.({ kind: 'building-queue-action', action: 'sync' });
    } catch {}
  } finally {
    isStarting.value[key] = false;
  }
}

const builtBuildingsCount = computed(() => {
  return allBuildingsList.value.filter((b) => b.isBuilt).length;
});

const filteredBuildingDirectory = computed(() => {
  const query = buildingSearchQuery.value.toLowerCase().trim();
  return allBuildingsList.value
    .filter((b: any) => {
      if (!query) return b.isBuilt;
      const name = getBuildingName(b.id).toLowerCase();
      const idStr = String(b.id);
      return name.includes(query) || idStr.includes(query);
    })
    .sort((a: any, b: any) => {
      if (a.isUpgrading !== b.isUpgrading) return a.isUpgrading ? -1 : 1;
      if (a.isBuilt !== b.isBuilt) return a.isBuilt ? -1 : 1;
      return (b.level - a.level) || (a.id - b.id);
    });
});

async function refreshBuildings() {
  await dispatchRpc([{ name: 'clan_getSummary' }, { name: 'getSummary', feature: 'building' }]);
}
</script>

<template>
  <div
    v-if="modelValue"
    id="building-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="building-dialog-title"
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
          <span class="text-xl shrink-0" aria-hidden="true">🏗️</span>
          <h2 id="building-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            City Buildings & Construction
          </h2>

          <!-- Status Badge -->
          <div id="building-dialog-status" class="flex items-center gap-2 truncate">
            <span
              v-if="activeQueues.length > 0"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            >
              <span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Active: <span class="truncate max-w-[140px]">{{ getBuildingName(activeQueues[0].buildingId) }}</span>
              {{ activeQueues[0].level ? ` Lv. ${activeQueues[0].level}` : '' }} ·
              {{ formatDuration(Math.max(0, Math.ceil(((activeQueues[0].startDate + activeQueues[0].durationMs) - now) / 1000))) }}
            </span>
            <span
              v-else-if="finishedQueues.length > 0"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              <span class="size-1.5 rounded-full bg-emerald-500"></span>
              Ready to finish: {{ getBuildingName(finishedQueues[0].buildingId) }}
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
          aria-label="Close building dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="building-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Section 1: Active Construction Queue -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span class="flex items-center gap-2">
              <span>🏗️</span> Active Construction Queue
            </span>
            <button
              type="button"
              class="cursor-pointer text-2xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 lowercase font-normal"
              @click="refreshBuildings"
            >
              ↻ refresh
            </button>
          </h3>

          <div v-if="activeQueues.length > 0 || finishedQueues.length > 0" class="space-y-3">
            <!-- Finished Queues -->
            <div
              v-for="f in finishedQueues"
              :key="`fin-${f.buildingId}-${f.level}`"
              class="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30 flex items-center justify-between gap-2 flex-wrap"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xl">🎉</span>
                <div>
                  <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {{ getBuildingName(f.buildingId) }} · Complete
                  </div>
                  <div class="text-xs text-emerald-700 dark:text-emerald-400">
                    Queue #{{ f.queueNumber ?? 0 }} · Target Lv. {{ f.level ?? '?' }} finished
                  </div>
                </div>
              </div>

              <button
                type="button"
                :disabled="isFinishing[`${f.buildingId}-${f.level}`]"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                @click="finishConstruction(f)"
              >
                <span>✅</span>
                <span>{{ isFinishing[`${f.buildingId}-${f.level}`] ? 'Finishing...' : 'Finish' }}</span>
              </button>
            </div>

            <!-- In Progress Queues -->
            <div
              v-for="q in activeQueues"
              :key="`act-${q.buildingId}-${q.startDate}`"
              class="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20"
            >
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-lg">🏗️</span>
                  <div>
                    <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {{ getBuildingName(q.buildingId) }}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      Queue #{{ q.queueNumber ?? 0 }} · Building ID: {{ q.buildingId }}
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
                    class="bg-amber-500 h-full rounded-full transition-all"
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
              <div class="font-semibold text-slate-700 dark:text-slate-300">Builder is currently idle</div>
              <div>No construction in progress. Ready for new building upgrades.</div>
            </div>
          </div>

          <!-- Subsection: Auto-Build Queue -->
          <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>⚡</span> Auto-Build Queue
                </span>
                <span class="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ buildingQueue.items.length }} queued
                </span>
              </div>

              <div class="flex items-center gap-2">
                <label class="inline-flex items-center gap-1.5 text-2xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    v-model="buildingQueue.enabled"
                    type="checkbox"
                    class="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
                    @change="saveBuildingQueue"
                  />
                  <span>Auto-advance</span>
                </label>

                <button
                  v-if="buildingQueue.items.length > 0"
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
                :key="`queue-${idx}-${item.buildingId}`"
                class="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs dark:border-slate-700/60 dark:bg-slate-800/60"
              >
                <div class="min-w-0 flex items-center gap-2 flex-1">
                  <span class="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-2xs font-bold shrink-0">
                    #{{ idx + 1 }}
                  </span>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                      <span>{{ getBuildingName(item.buildingId) }}</span>
                      <span class="text-2xs font-normal text-slate-400">(ID: {{ item.buildingId }})</span>
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

        <!-- Section 2: Building Upgrade Candidates -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>⚡</span> Next Building Candidates
            </h3>
            <span id="next-building-count-badge" class="text-2xs font-normal text-slate-400">
              {{ nextBuildingFilterQuery ? `${filteredNextBuildings.length} / ${upgradeCandidates.length} ready` : `${upgradeCandidates.length} ready` }}
            </span>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ activeQueues.length > 0 ? 'Builder queue is currently occupied. Once complete, the following buildings can be upgraded next:' : 'Builder queue is available. The following buildings can be upgraded next:' }}
          </p>

          <!-- Search & Sort Controls -->
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex-1 min-w-[140px]">
              <input
                id="next-building-search-input"
                v-model="nextBuildingFilterQuery"
                type="search"
                placeholder="Filter candidates or ID..."
                class="h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
              <span class="text-2xs text-slate-400">Sort:</span>
              <select
                id="next-building-sort-select"
                v-model="nextBuildingSortOrder"
                class="h-7 rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-700 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="level-desc">Level: High → Low</option>
                <option value="level-asc">Level: Low → High</option>
                <option value="time-asc">Build Time: Shortest → Longest</option>
                <option value="time-desc">Build Time: Longest → Shortest</option>
                <option value="name-asc">Name: A → Z</option>
              </select>
            </div>
          </div>

          <div v-if="filteredNextBuildings.length === 0" class="text-center py-4 text-xs text-slate-400 italic">
            {{ nextBuildingFilterQuery ? 'No matching buildings found.' : 'No upgradable buildings found.' }}
          </div>

          <div v-else id="next-building-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
            <div
              v-for="b in filteredNextBuildings"
              :key="`candidate-${b.id}`"
              class="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs hover:border-amber-300 hover:bg-amber-50/40 transition-colors dark:border-slate-700/80 dark:bg-slate-800/60 dark:hover:border-amber-800/60"
            >
              <div class="flex items-center justify-between gap-2 min-w-0">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                    #{{ b.id }}
                  </span>
                  <span class="font-bold text-slate-900 dark:text-slate-100 truncate text-xs" :title="b.name || getBuildingName(b.id)">
                    {{ b.name || getBuildingName(b.id) }}
                  </span>
                </div>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 shrink-0">
                  {{ (b.currentLevel ?? b.level ?? 0) > 0 ? `Lv. ${b.currentLevel ?? b.level} ➔ ${b.nextLevel}` : 'Build Lv. 1' }}
                </span>
              </div>

              <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/50">
                <div class="flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400 min-w-0">
                  <span class="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300" title="Build Duration">
                    <span>⏱</span><span>{{ formatDuration(Math.ceil((b.durationMs || 300000) / 1000)) }}</span>
                  </span>
                  <span class="text-slate-300 dark:text-slate-600">·</span>
                  <span class="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500" title="Estimated Finish Time">
                    <span>🏁</span><span>{{ new Date((queueTimeline.allDoneAt || now) + (b.durationMs || 300000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600 shrink-0"
                    :title="`Locate ${b.name || getBuildingName(b.id)} in city buildings directory`"
                    :aria-label="`Locate ${b.name || getBuildingName(b.id)}`"
                    @click="locateBuilding(b)"
                  >
                    <span>🔍</span>
                  </button>

                  <button
                    type="button"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600 shrink-0"
                    :title="`Add ${b.name || getBuildingName(b.id)} Lv. ${b.nextLevel} to auto-build queue`"
                    :aria-label="`Queue ${b.name || getBuildingName(b.id)} Lv. ${b.nextLevel}`"
                    @click="addToQueue(b)"
                  >
                    <span>➕</span>
                  </button>

                  <button
                    v-if="activeQueues.length === 0 && hasEnoughBuildingResources(b)"
                    type="button"
                    :disabled="isStarting[`${b.id}-${b.nextLevel}`]"
                    class="size-6.5 rounded-md inline-flex items-center justify-center text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                    :title="`${isStarting[`${b.id}-${b.nextLevel}`] ? 'Building...' : ((b.currentLevel ?? b.level ?? 0) > 0 ? 'Upgrade' : 'Build')} ${b.name || getBuildingName(b.id)} to Lv. ${b.nextLevel}`"
                    :aria-label="`${((b.currentLevel ?? b.level ?? 0) > 0 ? 'Upgrade' : 'Build')} ${b.name || getBuildingName(b.id)} to Lv. ${b.nextLevel}`"
                    @click="startBuildingUpgrade(b)"
                  >
                    <span v-if="isStarting[`${b.id}-${b.nextLevel}`]" class="animate-spin text-3xs">⏳</span>
                    <span v-else>🔨</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 3: All City Buildings Directory -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>🏛️</span> All City Buildings
              </h3>
              <p id="building-count-subtitle" class="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">
                {{ buildingSearchQuery ? `${filteredBuildingDirectory.length} matching "${buildingSearchQuery}" (${builtBuildingsCount} built)` : `${builtBuildingsCount} built buildings` }}
              </p>
            </div>

            <div class="w-full sm:w-64">
              <input
                id="building-search-input"
                v-model="buildingSearchQuery"
                type="search"
                placeholder="Search buildings or ID..."
                class="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
          </div>

          <div v-if="filteredBuildingDirectory.length === 0" class="col-span-full py-8 text-center text-xs text-slate-400">
            No buildings match your search.
          </div>

          <div v-else id="building-grid-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            <div
              v-for="b in filteredBuildingDirectory"
              :key="`dir-${b.id}`"
              class="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors"
              :class="
                b.isUpgrading
                  ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                  : b.isBuilt
                    ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                    : 'border-dashed border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40'
              "
            >
              <div class="min-w-0">
                <div
                  class="font-semibold truncate"
                  :class="b.isBuilt ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'"
                  :title="getBuildingName(b.id)"
                >
                  {{ getBuildingName(b.id) }}
                </div>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  ID: {{ b.id }}{{ b.initialBuildDate ? ` · Built ${new Date(b.initialBuildDate * 1000).toLocaleDateString()}` : '' }}
                </div>
              </div>

              <div class="text-right shrink-0 space-y-1">
                <div
                  class="font-bold text-xs"
                  :class="b.isBuilt ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'"
                >
                  {{ b.isBuilt ? `Lv. ${b.level}` : '—' }}
                </div>
                <div>
                  <span
                    v-if="b.isUpgrading"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                  >
                    <span class="size-1 rounded-full bg-amber-500 animate-pulse"></span>Upgrading
                  </span>
                  <span
                    v-else-if="b.isBuilt"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  >
                    Built
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Unbuilt
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
