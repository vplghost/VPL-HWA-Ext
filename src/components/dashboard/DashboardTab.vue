<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ResourceSummary from './ResourceSummary.vue';
import IncomeOverview from './IncomeOverview.vue';
import TroopsOverview from './TroopsOverview.vue';
import QueuesOverview from './QueuesOverview.vue';
import ActivityGoals from './ActivityGoals.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { useGameConnection } from '@/src/composables/useGameConnection';
import { useNow } from '@/src/composables/useNow';
import { useDailyAutopilot } from '@/src/composables/useDailyAutopilot';

const { dispatchRpc, cache } = useRpcCache();
const { openModal } = useModals();
const { hasGameTab, alertMessage, isRefreshing, reloadGameTab } = useGameConnection();
const now = typeof useNow === 'function' ? useNow() : ref(Date.now());
const autopilot =
  typeof useDailyAutopilot === 'function'
    ? useDailyAutopilot(cache, dispatchRpc, now)
    : null;
const availableFreebiesCount = computed(() => {
  if (!autopilot) return 0;
  return autopilot.freeGiftItems.value.filter((item) => item.clickable && item.state === 'available').length;
});
function toggleTopAutopilot() {
  if (!autopilot) return;
  if (autopilot.runtimeState.running) {
    autopilot.stopAutopilot();
  } else {
    void autopilot.startAutopilot();
  }
}

const raidQueueState = ref<any>(null);
const monsterQueueState = ref<any>(null);

const raidQueueCount = computed(() => {
  const q = raidQueueState.value;
  if (!q || ['stopped', 'complete'].includes(q.phase)) return 0;
  if (Number.isFinite(q.bossQueue?.remain_raid_count)) {
    return Math.max(0, q.bossQueue.remain_raid_count);
  }
  const total = Number(q.options?.count || 0);
  const wins = Number(q.completed || 0) + (q.current?.result === 'win' ? 1 : 0);
  return Math.max(0, total - wins);
});

const monsterQueueCount = computed(() => {
  const q = monsterQueueState.value;
  if (!q || ['stopped', 'complete'].includes(q.phase)) return 0;
  const total = Number(q.options?.count || 0);
  const done = Number(q.completed || 0) + (q.current?.result === 'win' ? 1 : 0);
  return Math.max(0, total - done);
});

const onStorageChanged = (changes: any, area: string) => {
  if (area !== 'local') return;
  if (changes.raidQueue) {
    raidQueueState.value = changes.raidQueue.newValue || null;
  }
  if (changes.monsterQueue) {
    monsterQueueState.value = changes.monsterQueue.newValue || null;
  }
};

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['raidQueue', 'monsterQueue']);
      if (stored.raidQueue) raidQueueState.value = stored.raidQueue;
      if (stored.monsterQueue) monsterQueueState.value = stored.monsterQueue;
      chrome.storage?.onChanged?.addListener(onStorageChanged);
    } catch (_) {}
  }
});

onUnmounted(() => {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch (_) {}
  }
});

const dashboardRefreshing = ref(false);
const dashboardRefreshMessage = ref('');
async function refreshAllDashboard() {
  if (dashboardRefreshing.value || !hasGameTab.value) return;
  dashboardRefreshing.value = true;
  dashboardRefreshMessage.value = 'Requesting Energy and World Energy…';
  try {
    // Refresh resource snapshots before the unrelated dashboard reads.
    const energy = await dispatchRpc([{ name: 'userGetInfo' }, { name: 'refillableGetAll', feature: 'refillable' }]);
    if (!energy?.ok) {
      dashboardRefreshMessage.value = energy?.error || 'Energy refresh could not be sent.';
      return;
    }
    const result = await dispatchRpc([
    { name: 'getUnitSummary', feature: 'unit' },
    { name: 'getTrainings', feature: 'unit' },
    { name: 'getHealing', feature: 'unit' },
    { name: 'inventoryGet' },
    { name: 'clan_getSummary' },
    { name: 'getSummary', feature: 'building' },
    { name: 'getSummary', feature: 'personalResearch' },
    { name: 'getMarches', feature: 'march' },
    { name: 'getMineSummary', feature: 'mine' },
    { name: 'magicTower_briefInfo' },
    { name: 'magicTower_getAll' },
    { name: 'arenaGetAll' },
    { name: 'clanBoss_getAll' },
    { name: 'questGetAll' },
    { name: 'getDailyQuests', feature: 'quest', args: {} },
    { name: 'user_getNextDayTime' },
    { name: 'dungeonGetInfo' },
    { name: 'titanGetAll' },
    { name: 'expeditionGet' },
    { name: 'heroGetAll' },
    { name: 'eternalStory_getChest', args: {} },
    { name: 'eternalStory_getState', args: { hero_packs: [] } },
    ]);
    dashboardRefreshMessage.value = !result?.ok
      ? `Energy refresh requested. Other dashboard refresh failed: ${result?.error || 'RPC error'}`
      : energy.queued || result.queued
        ? 'Refresh queued. Energy and World Energy update after the next game RPC.'
        : 'Refresh requested. Waiting for Energy, World Energy and dashboard snapshots from the game.';
  } catch (error) {
    dashboardRefreshMessage.value = `Refresh failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    dashboardRefreshing.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Game Connection Alert Banner -->
    <div
      v-if="alertMessage"
      id="dashboard-game-status-alert"
      class="dashboard-game-alert flex items-start sm:items-center justify-between gap-3 rounded-xl p-3.5 shadow-2xs transition-all"
      :class="
        !hasGameTab
          ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700/50 dark:bg-sky-950/40 dark:text-sky-200'
      "
    >
      <div class="flex items-start sm:items-center gap-3 flex-1">
        <span class="text-lg select-none shrink-0 leading-none">
          {{ !hasGameTab ? '⚠️' : '🔄' }}
        </span>
        <div class="flex-1 text-xs leading-relaxed">
          <strong class="font-semibold block sm:inline text-slate-900 dark:text-slate-100 mb-0.5 sm:mb-0 sm:mr-1">
            {{ alertMessage.title }}
          </strong>
          <span>{{ alertMessage.body }}</span>
        </div>
      </div>
      <button
        v-if="hasGameTab"
        type="button"
        class="cursor-pointer shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-xs inline-flex items-center gap-1.5"
        :disabled="isRefreshing"
        @click="reloadGameTab"
      >
        <span :class="{ 'animate-spin': isRefreshing }">↻</span>
        <span>{{ isRefreshing ? 'Refreshing...' : 'Refresh browser' }}</span>
      </button>
    </div>

    <!-- Compact Unified Top Action Bar -->
    <div
      id="dashboard-top-actions"
      class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs"
    >
      <div id="dashboard-actions" class="flex flex-wrap items-center gap-1.5">
        <span class="text-sm select-none mr-0.5" title="Quick Actions">⚡</span>

        <!-- Guild Raid -->
        <button
          id="open-raid-dialog"
          type="button"
          class="relative cursor-pointer px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('raid')"
        >
          <span>⚔️</span> <span>Guild Raid</span>
          <span
            v-if="raidQueueCount > 0"
            id="open-raid-dialog-badge"
            :data-queue-count="raidQueueCount"
            :title="`${raidQueueCount} queued remaining`"
            :aria-label="`${raidQueueCount} queued remaining`"
            class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold leading-none text-white shadow-xs ring-2 ring-slate-900 animate-pulse pointer-events-none"
          >
            {{ raidQueueCount }}
          </span>
        </button>

        <!-- Gathering -->
        <button
          id="open-gather-dialog"
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('gathering')"
        >
          <span>⛏️</span> <span>Gathering</span>
        </button>

        <!-- Solo Monster -->
        <button
          id="open-monster-dialog"
          type="button"
          class="relative cursor-pointer px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('monster')"
        >
          <span>👹</span> <span>Solo Monster</span>
          <span
            v-if="monsterQueueCount > 0"
            id="open-monster-dialog-badge"
            :data-queue-count="monsterQueueCount"
            :title="`${monsterQueueCount} queued remaining`"
            :aria-label="`${monsterQueueCount} queued remaining`"
            class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold leading-none text-white shadow-xs ring-2 ring-slate-900 animate-pulse pointer-events-none"
          >
            {{ monsterQueueCount }}
          </span>
        </button>

        <button
          id="open-brigand-dialog"
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('brigand')"
        >
          <span>⛺</span> <span>Brigand Camp</span>
        </button>

        <!-- Campaign Raid -->
        <button
          id="open-campaign-dialog"
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('campaign')"
        >
          <span>🗺️</span> <span>Campaign Raid</span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- Quick Daily Autopilot Shortcut -->
        <button
          v-if="autopilot"
          id="dashboard-top-autopilot-btn"
          type="button"
          :disabled="!hasGameTab"
          class="relative cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
          :class="
            autopilot.runtimeState.running
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          "
          :title="autopilot.runtimeState.running ? 'Stop Daily Autopilot' : 'Run Daily Routine Autopilot'"
          @click="toggleTopAutopilot"
        >
          <span>{{ autopilot.runtimeState.running ? '⏹ Stop' : '▶ Autopilot' }}</span>
          <span
            v-if="!autopilot.runtimeState.running && availableFreebiesCount > 0"
            class="px-1 py-0.2 rounded-full bg-emerald-400 text-slate-950 text-[9px] font-bold leading-none"
            :title="`${availableFreebiesCount} free gift group(s) ready`"
          >
            {{ availableFreebiesCount }}
          </span>
        </button>

        <!-- Refresh All + inline non-jumping status -->
        <button
          id="dashboard-refresh-all-btn"
          type="button"
          class="cursor-pointer px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="dashboardRefreshMessage || 'Refresh Energy, World Energy and dashboard snapshots'"
          :disabled="dashboardRefreshing || !hasGameTab"
          @click="refreshAllDashboard"
        >
          {{ dashboardRefreshing ? '↻ Syncing…' : '↻ Refresh All' }}
        </button>

        <span
          v-if="dashboardRefreshMessage"
          role="status"
          class="max-w-56 truncate text-[11px] text-slate-500 dark:text-slate-400"
          :title="dashboardRefreshMessage"
        >
          {{ dashboardRefreshMessage }}
        </span>
      </div>
    </div>

    <!-- Top Resource Summary -->
    <ResourceSummary />

    <!-- Resource Income Analytics & 7-Day Chart -->
    <IncomeOverview />

    <!-- Troop Forces, Hospital & Training Section -->
    <TroopsOverview />

    <!-- Active Queues & Marches -->
    <QueuesOverview />

    <!-- Daily Activities & Progress (includes unified Free Gifts strip) -->
    <ActivityGoals :has-game-tab="hasGameTab" />
  </div>
</template>
