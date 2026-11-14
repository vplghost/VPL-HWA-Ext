<script setup lang="ts">
import { formatNumber } from '@/src/utils/formatters';
import type { gatheringProgress } from '@/src/utils/gatheringProgress';
defineProps<{ progress: ReturnType<typeof gatheringProgress> }>();
</script>

<template>
  <div class="space-y-1 mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span v-if="progress.collected != null">Est. collected: {{ formatNumber(progress.collected) }} {{ progress.resource }}<span v-if="progress.total != null"> / {{ formatNumber(progress.total) }}</span></span>
      <span v-else>{{ progress.resource }} · Collection amount unavailable</span>
      <span v-if="progress.progress != null" class="font-mono tabular-nums">{{ progress.progress }}%</span>
    </div>
    <div v-if="progress.progress != null" role="progressbar" :aria-label="`${progress.resource} collection progress`" :aria-valuenow="progress.progress" :aria-valuemin="0" :aria-valuemax="100" class="h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
      <div class="h-full bg-teal-500 transition-[width]" :style="{ width: `${progress.progress}%` }" />
    </div>
  </div>
</template>
