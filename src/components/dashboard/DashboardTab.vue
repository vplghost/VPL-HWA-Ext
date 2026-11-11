<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ResourceSummary from './ResourceSummary.vue';
import TroopsOverview from './TroopsOverview.vue';
import QueuesOverview from './QueuesOverview.vue';
import ActivityGoals from './ActivityGoals.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';

const { dispatchRpc, cache } = useRpcCache();
const { openModal } = useModals();

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

async function refreshAllDashboard() {
  await dispatchRpc([
    { name: 'getUnitSummary', feature: 'unit' },
    { name: 'getTrainings', feature: 'unit' },
    { name: 'getHealing', feature: 'unit' },
    { name: 'inventoryGet' },
    { name: 'clan_getSummary' },
  ]);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Quick Actions Banner -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
      <div class="flex items-center gap-2">
        <span class="text-lg">⚡</span>
        <div>
          <h3 class="font-bold text-xs text-slate-800 dark:text-slate-100">Quick Actions</h3>
          <p class="text-[10px] text-slate-400">Launch rallies, start gathering, hunt monsters, or farm gear</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- Guild Raid -->
        <button
          id="open-raid-dialog"
          type="button"
          class="relative cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
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
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('gathering')"
        >
          <span>⛏️</span> <span>Gathering</span>
        </button>

        <!-- Solo Monster -->
        <button
          id="open-monster-dialog"
          type="button"
          class="relative cursor-pointer px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
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

        <!-- Campaign Raid -->
        <button
          id="open-campaign-dialog"
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('campaign')"
        >
          <span>🗺️</span> <span>Campaign Raid</span>
        </button>

        <!-- Refresh All -->
        <button
          type="button"
          class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 ml-1"
          title="Refresh dashboard snapshots"
          @click="refreshAllDashboard"
        >
          ↻ Refresh All
        </button>
      </div>
    </div>

    <!-- Top Resource Summary -->
    <ResourceSummary />

    <!-- Troop Forces, Hospital & Training Section -->
    <TroopsOverview />

    <!-- Active Queues & Marches -->
    <QueuesOverview />

    <!-- Daily Activities & Progress -->
    <ActivityGoals />
  </div>
</template>
