<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { questData } from '@/src/data/questData';
import { getBattlePassName } from '@/src/data/battlepassCatalog';
import { useModals } from '@/src/composables/useModals';
import { normalizeArray } from '@/src/utils/troops';
import { formatNumber } from '@/src/utils/formatters';
import { parseRewards } from '@/src/utils/rewardHelper';
import { resolveTierDetail } from '@/src/utils/tierHelper';
import { questRefreshCalls, sendQuestClaim, sendEventQuestClaim } from '@/src/utils/dialogRpc';

const props = defineProps<{
  modelValue: boolean;
  initialEventId?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { openModal } = useModals();

const selectedEventId = ref<number | string | null>(null);
const currentFilter = ref<'all' | 'daily' | 'single' | 'inProgress' | 'completed'>('all');
const searchQuery = ref('');
const expandedChains = ref<Record<string | number, boolean>>({});
const isRefreshing = ref(false);
const isClaiming = ref(false);
const claimStatus = ref('');

// Sync initialEventId
watch(
  () => props.initialEventId,
  (val) => {
    if (val != null) {
      selectedEventId.value = val;
    }
  },
  { immediate: true }
);

// Fallback lookup of quest details from questGetAll
const qAllMap = computed(() => {
  const map = new Map<string, any>();
  const raw = cache.value?.questGetAll?.data ?? cache.value?.quest_getAll?.data;
  for (const q of normalizeArray(raw)) {
    if (q && q.id != null) map.set(String(q.id), q);
  }
  return map;
});

// List of all active visible events
const activeEvents = computed(() => {
  const events = normalizeArray(questData?.visibleEvents?.(cache.value, Date.now()));
  return events.map((ev: any) => {
    const title = questData.title(ev);
    const summary = (questData as any).getMilestoneSummary?.(ev);
    return {
      id: ev.id,
      viewId: ev.viewId,
      title,
      start: ev.start,
      end: ev.end,
      totalMilestones: summary?.totalMilestones ?? 0,
      completedMilestones: summary?.completedMilestones ?? 0,
      percent: summary?.percent ?? 0,
      raw: ev,
    };
  });
});

// Also include active BattlePass
const battlePasses = computed(() => {
  const passes = (questData as any).getBattlePassState?.(cache.value) ?? [];
  return passes.map((bp: any) => ({
    id: `bp:${bp.id}`,
    bpId: bp.id,
    type: bp.type,
    title: getBattlePassName(bp),
    exp: bp.exp,
    endTime: bp.endTime,
    farmedNormal: bp.farmedNormal,
    farmedGold: bp.farmedGold,
    hasGoldenPass: bp.hasGoldenPass,
  }));
});

function openDedicatedBattlePass() {
  const bpId = currentBattlePass.value?.bpId || currentBattlePass.value?.id;
  emit('update:modelValue', false);
  openModal('battlePass', { selectedBattlePassId: bpId });
}

// Ensure selectedEventId points to a valid event
watch(
  [activeEvents, battlePasses],
  ([evList, bpList]) => {
    if (selectedEventId.value == null) {
      if (evList.length > 0) {
        selectedEventId.value = evList[0].id;
      } else if (bpList.length > 0) {
        selectedEventId.value = bpList[0].id;
      }
    } else {
      const existsInEv = evList.some((e: any) => String(e.id) === String(selectedEventId.value));
      const existsInBp = bpList.some((b: any) => String(b.id) === String(selectedEventId.value));
      if (!existsInEv && !existsInBp) {
        selectedEventId.value = evList[0]?.id ?? bpList[0]?.id ?? null;
      }
    }
  },
  { immediate: true }
);

// Active Event or BattlePass
const isBattlePassActive = computed(() => String(selectedEventId.value).startsWith('bp:'));

const currentEvent = computed(() => {
  if (isBattlePassActive.value) return null;
  return activeEvents.value.find((e: any) => String(e.id) === String(selectedEventId.value)) || null;
});

const currentBattlePass = computed(() => {
  if (!isBattlePassActive.value) return null;
  return battlePasses.value.find((b: any) => String(b.id) === String(selectedEventId.value)) || null;
});

// Format remaining time
function formatRemaining(endMs: number): string {
  if (!endMs || !Number.isFinite(endMs)) return 'Active';
  const diff = endMs - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

// Milestone Chains Breakdown for Current Event
const processedChains = computed(() => {
  const ev = currentEvent.value?.raw;
  if (!ev) return [];

  return normalizeArray(ev.groups).map((g: any) => {
    const gTitle = questData.groupTitle(g.localeKey);
    const qList = Array.isArray(g.quests) ? g.quests : [];
    const total = qList.length;

    const milestones = qList.map((q: any, idx: number) => {
      const qAllEntry = qAllMap.value.get(String(q.id));
      return resolveTierDetail(q, g, idx + 1, qAllEntry);
    });

    const completedCount = milestones.filter((m: any) => m.state === 'completed').length;
    const activeMilestone = milestones.find((m: any) => m.state === 'inProgress' || m.state === 'ready') || null;

    return {
      id: g.id,
      title: gTitle,
      localeKey: g.localeKey,
      repeatType: g.repeatType || 'single', // 'daily' or 'single'
      total,
      completedCount,
      percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      isCompleted: completedCount >= total && total > 0,
      activeMilestone,
      milestones,
    };
  });
});

// Filtered Chains
const filteredChains = computed(() => {
  let list = processedChains.value;

  if (currentFilter.value === 'daily') {
    list = list.filter((c: any) => c.repeatType === 'daily');
  } else if (currentFilter.value === 'single') {
    list = list.filter((c: any) => c.repeatType === 'single');
  } else if (currentFilter.value === 'inProgress') {
    list = list.filter((c: any) => !c.isCompleted);
  } else if (currentFilter.value === 'completed') {
    list = list.filter((c: any) => c.isCompleted);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter((c: any) => c.title.toLowerCase().includes(query) || c.localeKey.toLowerCase().includes(query));
  }

  return list;
});

// Ready to claim quests count
const readyToClaimCount = computed(() => {
  let count = 0;
  for (const c of processedChains.value) {
    for (const m of c.milestones) {
      if (m.state === 'ready') count++;
    }
  }
  return count;
});

function toggleChain(id: number | string) {
  expandedChains.value[id] = !expandedChains.value[id];
}

function expandAll() {
  for (const c of processedChains.value) {
    expandedChains.value[c.id] = true;
  }
}

function collapseAll() {
  expandedChains.value = {};
}

async function refreshData() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await dispatchRpc(questRefreshCalls());
  } finally {
    isRefreshing.value = false;
  }
}

async function claimSingleQuest(questId: number | string) {
  if (isClaiming.value) return;
  isClaiming.value = true;
  claimStatus.value = `Claiming quest #${questId}...`;
  try {
    const res = await sendEventQuestClaim(questId);
    if (res.ok) {
      claimStatus.value = 'Reward claimed!';
      await refreshData();
    } else {
      claimStatus.value = res.error || 'Failed to claim reward';
    }
  } catch (err: any) {
    claimStatus.value = err?.message || 'Error claiming reward';
  } finally {
    isClaiming.value = false;
    setTimeout(() => {
      claimStatus.value = '';
    }, 3000);
  }
}

async function claimAllReady() {
  if (isClaiming.value || readyToClaimCount.value === 0) return;
  isClaiming.value = true;
  claimStatus.value = 'Claiming all ready rewards...';
  try {
    const readyIds: (string | number)[] = [];
    for (const c of processedChains.value) {
      for (const m of c.milestones) {
        if (m.state === 'ready') readyIds.push(m.id);
      }
    }
    if (readyIds.length > 0) {
      const res = await sendEventQuestClaim(readyIds);
      if (res.ok) {
        claimStatus.value = `Claimed ${readyIds.length} rewards!`;
        await refreshData();
      } else {
        claimStatus.value = res.error || 'Failed to claim rewards';
      }
    }
  } catch (err: any) {
    claimStatus.value = err?.message || 'Error claiming rewards';
  } finally {
    isClaiming.value = false;
    setTimeout(() => {
      claimStatus.value = '';
    }, 3000);
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Event Viewer & Milestones"
    icon="✨"
    max-width="max-w-4xl"
    modal-name="eventDetail"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="space-y-3.5">
      <!-- 1. Event Selector Horizontal Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        <button
          v-for="ev in activeEvents"
          :key="ev.id"
          type="button"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          :class="
            String(selectedEventId) === String(ev.id)
              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="selectedEventId = ev.id"
        >
          <span>🎯 {{ ev.title }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-3xs font-bold"
            :class="
              String(selectedEventId) === String(ev.id)
                ? 'bg-purple-800/60 text-purple-100'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            "
          >
            {{ ev.completedMilestones }}/{{ ev.totalMilestones }}
          </span>
        </button>

        <!-- Battle Pass Selector Tab -->
        <button
          v-for="bp in battlePasses"
          :key="bp.id"
          type="button"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          :class="
            String(selectedEventId) === String(bp.id)
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="selectedEventId = bp.id"
        >
          <span>🎖️ {{ bp.title }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-3xs font-bold"
            :class="
              String(selectedEventId) === String(bp.id)
                ? 'bg-amber-800/60 text-amber-100'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            "
          >
            {{ formatNumber(bp.exp) }} EXP
          </span>
        </button>
      </div>

      <!-- 2. Current Event Header Banner -->
      <div
        v-if="currentEvent"
        class="rounded-xl border border-purple-200/70 dark:border-purple-800/60 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-slate-900 p-3.5"
      >
        <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-3 rounded-full bg-purple-500 animate-pulse"></span>
            <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {{ currentEvent.title }}
            </h4>
            <span class="rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-2 py-0.5 text-3xs font-semibold">
              View #{{ currentEvent.viewId }}
            </span>
          </div>
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300">
            ⏳ {{ formatRemaining(currentEvent.end) }}
          </span>
        </div>

        <!-- Milestones Overall Progress Bar -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>
              Overall Milestones:
              <strong class="text-purple-700 dark:text-purple-300 font-bold">
                {{ currentEvent.completedMilestones }} / {{ currentEvent.totalMilestones }}
              </strong>
              completed
            </span>
            <span class="font-bold text-purple-600 dark:text-purple-300">{{ currentEvent.percent }}%</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              class="bg-gradient-to-r from-purple-600 to-indigo-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${currentEvent.percent}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Battle Pass Banner (when Battle Pass is selected) -->
      <div
        v-else-if="currentBattlePass"
        class="rounded-xl border border-amber-200/70 dark:border-amber-800/60 bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-white dark:from-amber-950/40 dark:via-orange-950/30 dark:to-slate-900 p-3.5"
      >
        <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-3 rounded-full bg-amber-500 animate-pulse"></span>
            <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {{ currentBattlePass.title }} (#{{ currentBattlePass.bpId }})
            </h4>
            <span
              class="rounded-full px-2 py-0.5 text-3xs font-semibold"
              :class="
                currentBattlePass.hasGoldenPass
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700/60'
                  : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
              "
            >
              {{ currentBattlePass.hasGoldenPass ? '⭐ Golden Pass Active' : 'Free Pass' }}
            </span>
          </div>
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300">
            ⏳ {{ formatRemaining(currentBattlePass.endTime * 1000) }}
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs">
          <div class="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
            <div class="text-2xs text-slate-500 dark:text-slate-400">Battle Pass Points</div>
            <div class="text-amber-600 dark:text-amber-400 font-bold text-sm">{{ formatNumber(currentBattlePass.exp) }} EXP</div>
          </div>
          <div class="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
            <div class="text-2xs text-slate-500 dark:text-slate-400">Normal Rewards Farmed</div>
            <div class="text-slate-800 dark:text-slate-100 font-bold text-sm">{{ currentBattlePass.farmedNormal }} Milestones</div>
          </div>
          <div class="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
            <div class="text-2xs text-slate-500 dark:text-slate-400">Golden Rewards Farmed</div>
            <div class="text-amber-700 dark:text-amber-300 font-bold text-sm">{{ currentBattlePass.farmedGold }} Milestones</div>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-100/70 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/60">
          <div class="text-xs text-amber-900 dark:text-amber-200">
            View full Battle Pass milestones, free & golden rewards ladder, and claim rewards in the dedicated Battle Pass dialog.
          </div>
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
            @click="openDedicatedBattlePass"
          >
            <span>🎖️ Open Battle Pass View</span>
          </button>
        </div>
      </div>

      <!-- 3. Toolbar: Filter Buttons & Search -->
      <div v-if="!isBattlePassActive" class="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div class="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'all'
                ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/80 dark:text-purple-100 dark:border-purple-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'all'"
          >
            All ({{ processedChains.length }})
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'daily'
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/80 dark:text-amber-100 dark:border-amber-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'daily'"
          >
            Daily Resets
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'single'
                ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/80 dark:text-blue-100 dark:border-blue-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'single'"
          >
            Single Chains
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'inProgress'
                ? 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/80 dark:text-indigo-100 dark:border-indigo-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'inProgress'"
          >
            In Progress
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'completed'
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/80 dark:text-emerald-100 dark:border-emerald-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'completed'"
          >
            Completed
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search objectives..."
            class="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-purple-500 w-36 sm:w-48"
          />
          <button
            type="button"
            class="px-2 py-1 rounded text-2xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer font-medium"
            @click="expandAll"
          >
            Expand All
          </button>
          <span class="text-slate-300 dark:text-slate-600">|</span>
          <button
            type="button"
            class="px-2 py-1 rounded text-2xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer font-medium"
            @click="collapseAll"
          >
            Collapse All
          </button>
        </div>
      </div>

      <!-- 4. Chains & Milestones List -->
      <div v-if="!isBattlePassActive" class="space-y-3">
        <div
          v-for="chain in filteredChains"
          :key="chain.id"
          class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-xs transition-all"
        >
          <!-- Chain Header Row -->
          <div
            class="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
            @click="toggleChain(chain.id)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="size-5 rounded-md flex items-center justify-center text-xs font-bold border"
                :class="
                  chain.repeatType === 'daily'
                    ? 'bg-amber-100 border-amber-200 dark:bg-amber-900/50 dark:border-amber-700/60 text-amber-800 dark:text-amber-300'
                    : 'bg-blue-100 border-blue-200 dark:bg-blue-900/50 dark:border-blue-700/60 text-blue-800 dark:text-blue-300'
                "
              >
                {{ chain.repeatType === 'daily' ? 'D' : 'C' }}
              </span>
              <div class="min-w-0">
                <span class="font-bold text-slate-900 dark:text-slate-100 text-xs truncate block">
                  {{ chain.title }}
                </span>
                <span class="text-3xs text-slate-500 dark:text-slate-400 block truncate">
                  {{ chain.localeKey }}
                </span>
              </div>
              <span
                class="rounded px-1.5 py-0.2 text-3xs font-semibold border"
                :class="
                  chain.repeatType === 'daily'
                    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700/60'
                    : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-700/60'
                "
              >
                {{ chain.repeatType === 'daily' ? 'Daily Reset' : 'Single Chain' }}
              </span>
            </div>

            <div class="flex items-center gap-2.5 shrink-0">
              <span
                class="text-xs font-semibold"
                :class="chain.isCompleted ? 'text-emerald-600 dark:text-emerald-300' : 'text-purple-600 dark:text-purple-300'"
              >
                {{ chain.completedCount }}/{{ chain.total }} ({{ chain.percent }}%)
              </span>
              <span
                v-if="chain.isCompleted"
                class="rounded-full bg-emerald-100 border border-emerald-300 dark:bg-emerald-950/80 dark:border-emerald-700/70 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-3xs font-bold"
              >
                ✓ Completed
              </span>
              <span
                v-else-if="chain.activeMilestone?.state === 'ready'"
                class="rounded-full bg-amber-500 text-white px-2 py-0.5 text-3xs font-bold animate-pulse"
              >
                Claim Ready!
              </span>
              <span class="text-slate-400 dark:text-slate-300 text-xs transition-transform duration-200" :class="{ 'rotate-180': expandedChains[chain.id] }">
                ▼
              </span>
            </div>
          </div>

          <!-- Active Objective Banner (when not completed) -->
          <div
            v-if="!chain.isCompleted && chain.activeMilestone"
            class="px-3.5 py-2.5 bg-purple-50/80 dark:bg-purple-950/60 border-t border-b border-purple-200 dark:border-purple-800/70 flex items-center justify-between gap-3 flex-wrap text-xs"
          >
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-2xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                  Current Objective (#{{ chain.activeMilestone.index }}):
                </span>
                <span class="font-bold text-slate-900 dark:text-slate-100">
                  {{ chain.activeMilestone.task }}
                </span>
                <span class="text-3xs font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-700">
                  Target: {{ chain.activeMilestone.targetDisplay }}
                </span>
              </div>

              <!-- Mini Progress Bar & Progress Details -->
              <div class="flex items-center gap-2 flex-wrap">
                <div class="w-24 sm:w-32 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden shrink-0">
                  <div
                    class="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300"
                    :style="{ width: `${chain.activeMilestone.percent}%` }"
                  ></div>
                </div>
                <span class="text-2xs text-slate-600 dark:text-slate-300 font-medium">
                  Progress: <strong class="text-purple-600 dark:text-purple-300 font-bold">{{ formatNumber(chain.activeMilestone.progress) }}</strong> / {{ chain.activeMilestone.targetDisplay }} ({{ chain.activeMilestone.percent }}%)
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <div v-if="chain.activeMilestone.rewards.length > 0" class="flex items-center gap-1 flex-wrap">
                <span class="text-2xs text-slate-600 dark:text-slate-300 font-medium">Rewards:</span>
                <span
                  v-for="(r, idx) in chain.activeMilestone.rewards"
                  :key="idx"
                  class="rounded px-1.5 py-0.2 text-2xs font-semibold"
                  :class="r.badgeClass"
                >
                  {{ r.amount.toLocaleString() }} × {{ r.label }}
                </span>
              </div>
              <button
                v-if="chain.activeMilestone.state === 'ready'"
                type="button"
                class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xs cursor-pointer shadow-xs transition-colors animate-pulse"
                :disabled="isClaiming"
                @click.stop="claimSingleQuest(chain.activeMilestone.id)"
              >
                Claim Reward
              </button>
            </div>
          </div>

          <!-- Expanded Milestones Ladder -->
          <div v-if="expandedChains[chain.id]" class="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700/80 space-y-2">
            <div class="text-2xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5 flex items-center justify-between">
              <span>Milestone Tiers ({{ chain.milestones.length }} Tiers)</span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="m in chain.milestones"
                :key="m.id"
                class="flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors gap-2"
                :class="
                  m.state === 'completed'
                    ? 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    : m.state === 'ready'
                    ? 'bg-amber-50/80 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                "
              >
                <!-- Tier & Status Icon + Task & Target Details -->
                <div class="flex items-center gap-2.5 min-w-0">
                  <span
                    class="size-6 rounded-full flex items-center justify-center text-3xs font-bold shrink-0 border"
                    :class="
                      m.state === 'completed'
                        ? 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/60 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300'
                        : m.state === 'ready'
                        ? 'bg-amber-500 border-amber-500 text-white animate-pulse'
                        : 'bg-slate-100 border-slate-300 dark:bg-slate-700 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                    "
                  >
                    {{ m.state === 'completed' ? '✓' : `#${m.index}` }}
                  </span>

                  <div class="space-y-0.5 min-w-0">
                    <div class="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-xs">Tier #{{ m.index }}: {{ m.task }}</span>
                      <span class="rounded px-1.5 py-0.2 text-3xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        🎯 Target: {{ m.targetDisplay }}
                      </span>
                      <span class="text-3xs text-slate-400 dark:text-slate-500 font-normal">(#{{ m.id }})</span>
                    </div>

                    <!-- Progress vs Target & Mini Bar -->
                    <div class="flex items-center gap-2 text-2xs text-slate-600 dark:text-slate-300 flex-wrap">
                      <span v-if="m.state === 'completed'" class="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span>✓ Completed ({{ m.targetDisplay }})</span>
                      </span>
                      <span v-else-if="m.state === 'ready'" class="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <span>🎉 Target reached: {{ m.progressDisplay }}</span>
                      </span>
                      <span v-else class="flex items-center gap-1.5">
                        <span>Progress:</span>
                        <strong class="text-purple-600 dark:text-purple-300 font-semibold">{{ formatNumber(m.progress) }}</strong>
                        <span>/ {{ m.targetDisplay }}</span>
                        <span class="text-slate-400 dark:text-slate-400">({{ m.percent }}%)</span>
                      </span>

                      <!-- Mini Progress Bar for inProgress -->
                      <div v-if="m.state === 'inProgress'" class="w-16 sm:w-20 bg-slate-200 dark:bg-slate-700 rounded-full h-1 overflow-hidden inline-block shrink-0">
                        <div
                          class="bg-purple-500 h-1 rounded-full"
                          :style="{ width: `${m.percent}%` }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Milestone Rewards & Action -->
                <div class="flex items-center gap-2 shrink-0">
                  <div class="flex items-center gap-1 flex-wrap justify-end">
                    <span
                      v-for="(r, rIdx) in m.rewards"
                      :key="rIdx"
                      class="rounded px-1.5 py-0.5 text-2xs font-semibold"
                      :class="r.badgeClass"
                    >
                      {{ r.amount.toLocaleString() }} × {{ r.label }}
                    </span>
                    <span v-if="m.rewards.length === 0" class="text-2xs text-slate-400 dark:text-slate-400 italic">
                      Standard Reward
                    </span>
                  </div>

                  <button
                    v-if="m.state === 'ready'"
                    type="button"
                    class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xs cursor-pointer shadow-xs transition-colors shrink-0"
                    :disabled="isClaiming"
                    @click.stop="claimSingleQuest(m.id)"
                  >
                    Claim
                  </button>
                  <span
                    v-else-if="m.state === 'completed'"
                    class="text-emerald-600 dark:text-emerald-300 text-2xs font-bold px-2 py-0.5 shrink-0"
                  >
                    Claimed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredChains.length === 0" class="text-center py-8 text-slate-500 dark:text-slate-300 text-xs">
          No quest chains match the selected filter.
        </div>
      </div>
    </div>

    <!-- Modal Footer Actions -->
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <div class="text-2xs font-medium text-slate-600 dark:text-slate-300">
          <span v-if="claimStatus" class="font-bold text-purple-600 dark:text-purple-300 animate-pulse">
            {{ claimStatus }}
          </span>
          <span v-else-if="readyToClaimCount > 0" class="text-amber-600 dark:text-amber-300 font-bold">
            🎉 {{ readyToClaimCount }} quest rewards ready to claim!
          </span>
          <span v-else>
            All event data synchronized with game server
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="readyToClaimCount > 0"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1"
            :disabled="isClaiming"
            @click="claimAllReady"
          >
            <span>🎁 Claim All ({{ readyToClaimCount }})</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs cursor-pointer transition-colors flex items-center gap-1"
            :disabled="isRefreshing"
            @click="refreshData"
          >
            <span :class="{ 'animate-spin': isRefreshing }">🔄</span>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs cursor-pointer transition-colors"
            @click="$emit('update:modelValue', false)"
          >
            Close
          </button>
        </div>
      </div>
    </template>
  </ModalDialog>
</template>
