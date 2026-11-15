<script setup lang="ts">
import { formatNumber, formatCompact } from '@/src/utils/formatters';
import type { gatheringProgress } from '@/src/utils/gatheringProgress';
defineProps<{ progress: ReturnType<typeof gatheringProgress>; compact?: boolean }>();
</script>

<template>
  <div class="space-y-1 mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span v-if="progress.collected != null">{{ compact ? 'Est.' : 'Est. collected:' }} {{ compact ? formatCompact(progress.collected) : formatNumber(progress.collected) }}<template v-if="!compact"> {{ progress.resource }}</template><span v-if="progress.total != null"> / {{ compact ? formatCompact(progress.total) : formatNumber(progress.total) }}</span></span>
      <span v-else>{{ compact ? 'Amount unavailable' : `${progress.resource} · Collection amount unavailable` }}</span>
      <span v-if="progress.progress != null" class="font-mono tabular-nums">{{ progress.progress }}%</span>
    </div>
    <div v-if="progress.progress != null" role="progressbar" :aria-label="`${progress.resource} collection progress`" :aria-valuenow="progress.progress" :aria-valuemin="0" :aria-valuemax="100" class="h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
      <div class="h-full bg-teal-500 transition-[width]" :style="{ width: `${progress.progress}%` }" />
    </div>
  </div>
</template>
