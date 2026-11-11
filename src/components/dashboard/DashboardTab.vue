<script setup lang="ts">
import ResourceSummary from './ResourceSummary.vue';
import TroopsOverview from './TroopsOverview.vue';
import QueuesOverview from './QueuesOverview.vue';
import ActivityGoals from './ActivityGoals.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { dispatchRpc } = useRpcCache();

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

