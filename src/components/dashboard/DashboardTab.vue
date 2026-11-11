<script setup lang="ts">
import { computed } from 'vue';
import ResourceSummary from './ResourceSummary.vue';
import TroopsOverview from './TroopsOverview.vue';
import QueuesOverview from './QueuesOverview.vue';
import ActivityGoals from './ActivityGoals.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';

const { dispatchRpc, cache } = useRpcCache();
const { openModal } = useModals();

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
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('raid')"
        >
          <span>⚔️</span> <span>Guild Raid</span>
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
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="openModal('monster')"
        >
          <span>👹</span> <span>Solo Monster</span>
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
