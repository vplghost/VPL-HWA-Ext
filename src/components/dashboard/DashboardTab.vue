<script setup lang="ts">
import { ref } from 'vue';
import ResourceSummary from './ResourceSummary.vue';
import TroopsOverview from './TroopsOverview.vue';
import QueuesOverview from './QueuesOverview.vue';
import ActivityGoals from './ActivityGoals.vue';
import RaidModal from '@/src/components/dialogs/RaidModal.vue';
import MonsterModal from '@/src/components/dialogs/MonsterModal.vue';
import CampaignRaidModal from '@/src/components/dialogs/CampaignRaidModal.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { dispatchRpc } = useRpcCache();

const showRaidModal = ref(false);
const showMonsterModal = ref(false);
const showCampaignModal = ref(false);

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
          <p class="text-[10px] text-slate-400">Launch rallies, hunt monsters, or farm campaign gear</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="showRaidModal = true"
        >
          <span>⚔️</span> <span>Guild Raid</span>
        </button>

        <button
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="showMonsterModal = true"
        >
          <span>👹</span> <span>Solo Monster</span>
        </button>

        <button
          type="button"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
          @click="showCampaignModal = true"
        >
          <span>🗺️</span> <span>Campaign Raid</span>
        </button>

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

    <!-- Dialogs -->
    <RaidModal v-model="showRaidModal" />
    <MonsterModal v-model="showMonsterModal" />
    <CampaignRaidModal v-model="showCampaignModal" />
  </div>
</template>
