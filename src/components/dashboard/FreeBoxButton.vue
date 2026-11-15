<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import type { CinemaCountersData } from '@/src/types';

const props = defineProps<{ hasGameTab: boolean }>();
const { cache, dispatchRpc } = useRpcCache();

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const counters = computed<CinemaCountersData | undefined>(() => cache.value.cinemaGetCounters?.data);
const placementViewed = computed(() => Number(counters.value?.placementViewed ?? 0));
const remainingBoxes = computed(() => Math.max(0, 5 - placementViewed.value));
const allClaimed = computed(() => counters.value ? placementViewed.value >= 5 : false);

const pending = shallowRef<boolean>(false);
const message = ref<string>('');
let abortClaim = false;

const disabled = computed(() =>
  pending.value || !props.hasGameTab || allClaimed.value
);

const tooltip = computed(() => {
  if (!props.hasGameTab) return 'Open the game to claim Free Video Boxes';
  if (allClaimed.value) return 'All 5 Free Video Boxes claimed today';
  if (pending.value) return message.value || 'Opening Free Video Boxes…';
  if (message.value) return message.value;
  return `Free Video Boxes: ${remainingBoxes.value}/5 available today`;
});

// Auto-fetch counters on mount if not available
onMounted(() => {
  if (props.hasGameTab && !counters.value) {
    void dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
  }
});

watch(accountId, () => {
  pending.value = false;
  message.value = '';
  abortClaim = true;
});

onUnmounted(() => {
  abortClaim = true;
});

async function openBoxes() {
  if (disabled.value || pending.value || !props.hasGameTab) return;

  pending.value = true;
  abortClaim = false;
  message.value = 'Checking available video boxes…';

  try {
    // Refresh counters first to get authoritative placement state if needed
    let currentCounters = counters.value;
    if (!currentCounters) {
      await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
      currentCounters = cache.value.cinemaGetCounters?.data;
    }

    const viewed = Number(currentCounters?.placementViewed ?? 0);
    if (viewed >= 5) {
      pending.value = false;
      message.value = 'All 5 video boxes have already been opened today.';
      return;
    }

    const availableCount = Math.max(0, 5 - viewed);
    const rewardList = currentCounters?.placementRewards || [];

    // Determine boxes to open (boxNum 0..4)
    const boxesToOpen: number[] = [];
    if (rewardList.length > 0) {
      for (const item of rewardList) {
        if (Number.isInteger(item?.boxNum) && !boxesToOpen.includes(item.boxNum)) {
          boxesToOpen.push(item.boxNum);
        }
      }
    }
    // Fallback: fill up to 5 box numbers (0..4)
    for (let i = 0; i < 5; i++) {
      if (!boxesToOpen.includes(i)) boxesToOpen.push(i);
    }

    // Slice to the remaining count today
    const queue = boxesToOpen.slice(0, availableCount);
    let opened = 0;
    let earnedGold = 0;

    for (let idx = 0; idx < queue.length; idx++) {
      if (abortClaim) break;
      const boxNum = queue[idx];
      message.value = `Opening box ${idx + 1}/${queue.length}…`;

      const response = await dispatchRpc([{
        name: 'cinemaGiveReward',
        args: { type: 'firstPlacement', boxNum }
      }]);

      if (abortClaim) break;

      if (!response?.ok) {
        message.value = response?.error || `Failed to open box ${idx + 1}.`;
        break;
      }

      opened++;
      const lastStatus = cache.value.cinemaGiveRewardStatus?.data;
      if (lastStatus?.success && lastStatus.reward?.gold) {
        earnedGold += Number(lastStatus.reward.gold) || 0;
      }

      // Small delay between calls for clean sequential RPC dispatch
      if (idx < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }

    // Final sync of counters and inventory
    if (opened > 0) {
      await dispatchRpc([
        { name: 'cinemaGetCounters', args: {} },
        { name: 'userGetInfo' },
        { name: 'inventoryGet' }
      ]);
      const goldStr = earnedGold > 0 ? ` (+${earnedGold.toLocaleString('en-US')} Gold)` : '';
      message.value = `Successfully opened ${opened} video box${opened > 1 ? 'es' : ''}${goldStr}!`;
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <BaseTooltip :content="tooltip">
    <button
      id="dashboard-free-video-boxes"
      type="button"
      :disabled="disabled"
      :aria-label="tooltip"
      :aria-busy="pending"
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors relative"
      @click="openBoxes"
    >
      <svg
        class="size-4"
        :class="{ 'animate-pulse': pending }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13" />
        <path d="M3 12h18" />
        <path d="M12 8c-1.5-3-5.5-3-5.5 0 0 2 5.5 4 5.5 4s5.5-2 5.5-4c0-3-4-3-5.5 0z" />
      </svg>
      <!-- Remaining count badge -->
      <span
        v-if="remainingBoxes > 0 && !allClaimed"
        class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white shadow-sm dark:bg-purple-500"
      >
        {{ remainingBoxes }}
      </span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ message }}</span>
  </BaseTooltip>
</template>
