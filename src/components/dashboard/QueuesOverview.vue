<script setup lang="ts">
import { computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { useNow } from '@/src/composables/useNow';
import { dashboardQueues, dashboardMarches } from '@/src/utils/dashboardState';
import { getBuildingName, getResearchName } from '@/src/utils/metadata';
import { formatMarchTooltip } from '@/src/utils/marchTooltip';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';

const { cache } = useRpcCache();
const { openModal } = useModals();
const now = useNow();

const buildingQueue = computed(() => dashboardQueues(cache.value, 'building', now.value));
const researchQueue = computed(() => dashboardQueues(cache.value, 'research', now.value));
const queueGroups = computed(() => [
  { id: 'building', title: 'Building Queue', icon: '🏗️', ...buildingQueue.value,
    rows: buildingQueue.value.rows.map((row) => ({ ...row, name: getBuildingName(row.entityId) })) },
  { id: 'research', title: 'Research Queue', icon: '🔬', ...researchQueue.value,
    rows: researchQueue.value.rows.map((row) => ({ ...row, name: getResearchName(row.entityId) })) },
]);
const marches = computed(() => dashboardMarches(cache.value, now.value));
const marchesKnown = computed(() => cache.value.marchStatus?.data?.marches != null);
function handleMarchClick(category: string) {
  if (category === 'raid') openModal('raid');
  else if (category === 'gather') openModal('gathering');
  else if (category === 'monster') openModal('monster');
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2 shadow-2xs">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>⏱️</span> Queue Status
        </h4>
        <span class="text-[10px] text-slate-400">Construction & Academy</span>
      </div>
      <div v-for="group in queueGroups" :key="group.id" class="space-y-1.5 text-xs">
        <button
          type="button"
          class="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-left cursor-pointer transition-colors"
          :aria-label="`Open ${group.title}`"
          @click="group.id === 'building' ? openModal('building') : openModal('research')"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-slate-800 dark:text-slate-200">{{ group.icon }} {{ group.title }}</span>
            <span v-if="!group.rows.length" class="text-[11px] text-slate-400">
              {{ group.state === 'unknown' ? 'Waiting for game data' : 'Idle' }}
            </span>
            <span v-else class="text-[10px] text-slate-400">{{ group.rows.length }} upgrades</span>
          </div>
          <div v-for="row in group.rows" :key="row.id" class="flex items-center justify-between gap-2 mt-2">
            <div class="min-w-0">
              <div class="font-medium text-slate-800 dark:text-slate-200 truncate">
                {{ row.name }}<span v-if="row.level != null"> (Lv.{{ row.level }})</span>
              </div>
              <div class="text-[10px] text-slate-400">
                {{ row.state === 'ready' ? 'Ready to finish · Click to manage' : row.state === 'active' ? 'In progress · Click to manage' : 'Timing unavailable · Click to manage' }}
              </div>
            </div>
            <span
              class="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
              :class="row.state === 'ready' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'"
            >{{ row.timerText }}</span>
          </div>
        </button>
      </div>
    </div>

    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2 shadow-2xs">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>🚩</span> Active Marches
        </h4>
        <span class="text-[10px] text-slate-400 tabular-nums">{{ marches.length }} active</span>
      </div>
      <div v-if="marches.length === 0" class="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 text-center text-xs text-slate-400">
        {{ marchesKnown ? 'No active squad marches outside city' : 'Waiting for game data' }}
      </div>
      <div v-else class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        <BaseTooltip v-for="m in marches" :key="m.id" class="w-full" :text="formatMarchTooltip(m.march, now, cache)" position="bottom">
          <button
            type="button"
            class="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-between gap-2 text-left text-xs"
            :class="{ 'cursor-pointer': m.category !== 'other' }"
            @click="handleMarchClick(m.category)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span>{{ m.icon }}</span>
              <div class="min-w-0">
                <div class="font-semibold text-slate-800 dark:text-slate-200">{{ m.title }} · {{ m.stage }}</div>
                <div class="text-[10px] text-slate-400 truncate max-w-40">{{ m.target }}</div>
              </div>
            </div>
            <span class="shrink-0 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-mono font-semibold text-[11px]">{{ m.timerText }}</span>
          </button>
        </BaseTooltip>
      </div>
    </div>
  </div>
</template>
