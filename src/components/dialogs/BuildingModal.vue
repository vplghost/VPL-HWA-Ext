<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getBuildingName } from '@/src/utils/metadata';
import { formatDuration } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const now = ref(Date.now());
let timer: number | null = null;

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
  }
}

// Queues from cache
const rawQueues = computed(() => cache.value?.buildingStatus?.data?.queues || []);

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

// Candidate upgrades
const rawBuildings = computed(() => {
  const data = cache.value?.buildingStatus?.data?.buildings || cache.value?.clan_getSummary?.data?.buildings || [];
  if (Array.isArray(data)) return data;
  return Object.entries(data).map(([id, b]: [string, any]) => ({
    id: Number(id),
    level: Number(b.level) || 0,
    isBuilt: true,
  }));
});

const upgradeCandidates = computed(() => {
  const bHelper = (globalThis as any).hwaHelperBuildingData;
  const bQueueHelper = (globalThis as any).hwaHelperBuildingQueue;

  const buildingMap = new Map();
  for (const b of rawBuildings.value) {
    buildingMap.set(Number(b.id), Number(b.level) || 0);
  }

  if (bQueueHelper?.getSimulatedLevels && bQueueHelper?.getEligibleCandidates && bHelper) {
    const simulated = bQueueHelper.getSimulatedLevels(buildingMap, rawQueues.value, buildingQueue.value.items);
    return bQueueHelper.getEligibleCandidates(rawBuildings.value, simulated, bHelper);
  }

  // Fallback candidates
  return rawBuildings.value.map((b: any) => {
    const curLevel = Number(b.level) || 0;
    const nextLevel = curLevel + 1;
    return {
      id: Number(b.id),
      name: getBuildingName(b.id),
      currentLevel: curLevel,
      nextLevel,
      durationMs: 300000,
    };
  });
});

function addToQueue(candidate: any) {
  buildingQueue.value.items.push({
    buildingId: Number(candidate.id),
    currentLevel: Number(candidate.currentLevel ?? candidate.level ?? 0),
    nextLevel: Number(candidate.nextLevel ?? 1),
    durationMs: Number(candidate.durationMs) || 60000,
  });
  saveBuildingQueue();
}

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
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <span>🏛️</span> Available Building Upgrades
            </span>
            <span class="text-2xs font-normal text-slate-400">
              {{ upgradeCandidates.length }} available
            </span>
          </h3>

          <div v-if="upgradeCandidates.length === 0" class="text-center py-4 text-xs text-slate-400">
            No building upgrade candidates available.
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-0.5">
            <div
              v-for="c in upgradeCandidates"
              :key="c.id"
              class="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs gap-2"
            >
              <div class="min-w-0 flex items-center gap-2">
                <span class="text-base shrink-0">🏛️</span>
                <div class="min-w-0">
                  <div class="font-semibold text-slate-800 dark:text-slate-200 truncate" :title="c.name">
                    {{ c.name }}
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-1.5">
                    <span>Lv. {{ c.currentLevel ?? 0 }} ➔ {{ c.nextLevel }}</span>
                    <span v-if="c.durationMs">· {{ formatDuration(Math.ceil(c.durationMs / 1000)) }}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="shrink-0 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-2xs cursor-pointer transition-colors"
                @click="addToQueue(c)"
              >
                + Queue
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
