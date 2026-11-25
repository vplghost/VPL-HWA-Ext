<script setup lang="ts">
import { computed } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import ClaimAllFreebiesButton from './ClaimAllFreebiesButton.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useNow } from '@/src/composables/useNow';
import { useDailyAutopilot } from '@/src/composables/useDailyAutopilot';
import { computeFreeGiftStripItems, type FreeGiftStripItem } from '@/src/services/dailyAutopilotService';

const props = withDefaults(defineProps<{ hasGameTab?: boolean }>(), {
  hasGameTab: true,
});

const { cache, dispatchRpc } = useRpcCache();
const now = useNow();
const { runningFreeGiftIds, freeGiftErrors, runSingleFreeGift } = useDailyAutopilot(cache, dispatchRpc, now);

const items = computed<FreeGiftStripItem[]>(() =>
  computeFreeGiftStripItems(cache.value, now.value, {
    hasGameTab: props.hasGameTab,
    runningIds: runningFreeGiftIds.value,
    errorMap: freeGiftErrors.value,
  })
);

function chipClasses(item: FreeGiftStripItem): string {
  if (item.state === 'error') {
    return 'border-rose-400 bg-rose-500/10 text-rose-700 dark:border-rose-600 dark:bg-rose-950/50 dark:text-rose-300';
  }
  if (item.state === 'running') {
    return 'border-indigo-400 bg-indigo-500/15 text-indigo-700 dark:border-indigo-500 dark:text-indigo-300 animate-pulse';
  }
  if (item.state === 'available') {
    return 'border-emerald-400 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 cursor-pointer';
  }
  if (item.state === 'done') {
    return 'border-slate-200 bg-slate-100/70 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500 opacity-65';
  }
  return 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-500 opacity-55';
}
</script>

<template>
  <div
    id="dashboard-free-gifts-strip"
    class="pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2"
  >
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
        Free Gifts:
      </span>

      <BaseTooltip v-for="item in items" :key="item.id" :content="item.tooltip">
        <button
          :id="`free-gift-chip-${item.id}`"
          type="button"
          :disabled="item.disabled"
          :aria-label="item.tooltip"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all disabled:cursor-not-allowed"
          :class="chipClasses(item)"
          @click="!item.disabled && runSingleFreeGift(item.id)"
        >
          <span class="text-xs leading-none" aria-hidden="true">{{ item.icon }}</span>
          <span
            class="min-w-[14px] text-center font-mono text-[10px] font-bold"
            :class="{
              'text-emerald-700 dark:text-emerald-300': item.state === 'available',
              'text-rose-600 dark:text-rose-400': item.state === 'error',
            }"
          >
            {{ item.badgeText }}
          </span>
        </button>
      </BaseTooltip>
    </div>

    <ClaimAllFreebiesButton :has-game-tab="hasGameTab" />
  </div>
</template>
