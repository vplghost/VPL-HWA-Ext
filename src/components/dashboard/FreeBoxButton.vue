<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import type { CinemaCountersData } from '@/src/types';

const props = defineProps<{ hasGameTab: boolean }>();
const { cache, dispatchRpc } = useRpcCache();

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const counters = computed<CinemaCountersData | undefined>(() => cache.value.cinemaGetCounters?.data);

// Video Boxes (0..4)
const placementViewed = computed(() => Number(counters.value?.placementViewed ?? 0));
const remainingBoxes = computed(() => Math.max(0, 5 - placementViewed.value));
const allBoxesClaimed = computed(() => counters.value ? placementViewed.value >= 5 : false);

// Video Tickets (Cinema 0..8)
const cinemaViewed = computed(() => Number(counters.value?.viewed ?? 0));
const remainingTickets = computed(() => Math.max(0, 8 - cinemaViewed.value));
const allTicketsClaimed = computed(() => counters.value ? cinemaViewed.value >= 8 : false);

const totalRemaining = computed(() => remainingBoxes.value + remainingTickets.value);
const allClaimed = computed(() => allBoxesClaimed.value && allTicketsClaimed.value);

const pending = shallowRef<boolean>(false);
const message = ref<string>('');
let abortClaim = false;

const disabled = computed(() =>
  pending.value || !props.hasGameTab || allClaimed.value
);

const tooltip = computed(() => {
  if (!props.hasGameTab) return 'Open the game to claim Free Video Boxes & Tickets';
  if (allClaimed.value) return 'All Free Video Boxes & Video Tickets claimed today';
  if (pending.value) return message.value || 'Opening Free Video Boxes & Tickets…';
  if (message.value) return message.value;
  return `Free Video Boxes: ${remainingBoxes.value}/5, Video Tickets: ${remainingTickets.value}/8 available today`;
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
  message.value = 'Checking available video boxes and tickets…';

  try {
    // Always refresh counters first to get authoritative placement state
    await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
    const currentCounters = cache.value.cinemaGetCounters?.data || counters.value;

    let opened = 0;
    let earnedGold = 0;
    let earnedTickets = 0;

    // --- Phase 1: Open Video Boxes ---
    const placementRewards = Array.isArray(currentCounters?.placementRewards) ? currentCounters.placementRewards : [];
    const claimedSet = new Set(placementRewards.map((r: any) => Number(r?.boxNum)));
    const remaining = [0, 1, 2, 3, 4].filter((num) => !claimedSet.has(num));
    const viewed = Number(currentCounters?.placementViewed ?? claimedSet.size);

    if (viewed < 5 && remaining.length > 0) {
      const availableLimit = Number.isFinite(currentCounters?.placementAvailable) && Number(currentCounters?.placementAvailable) > 0
        ? Number(currentCounters?.placementAvailable)
        : remaining.length;
      const queue = remaining.slice(0, availableLimit);

      for (let idx = 0; idx < queue.length; idx++) {
        if (abortClaim) break;
        const boxNum = queue[idx];
        message.value = `Opening box ${boxNum + 1}/5…`;

        const response: any = await dispatchRpc([{
          name: 'cinemaGiveReward',
          args: { type: 'firstPlacement', boxNum }
        }]);

        if (abortClaim) break;

        const callResult = response?.results?.[0];
        const rpcError = callResult?.result?.error || callResult?.result?.response?.error || callResult?.error || response?.error;

        if (rpcError || response?.ok === false) {
          const errMsg = String(
            typeof rpcError === 'object'
              ? rpcError.description || rpcError.name || rpcError.message || JSON.stringify(rpcError)
              : rpcError || response?.error || ''
          );
          if (errMsg.toLowerCase().includes('already')) {
            // Box was already opened on server, record box in local cache and continue to next box
            continue;
          }
          message.value = errMsg || `Failed to open box ${boxNum + 1}.`;
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
    }

    // --- Phase 2: Claim Free Video Tickets ---
    const cinemaViewedCount = Number(currentCounters?.viewed ?? 0);
    const maxTickets = Math.max(0, 8 - cinemaViewedCount);
    const ticketAvailableLimit = Number.isFinite(currentCounters?.available) && Number(currentCounters?.available) > 0
      ? Math.min(maxTickets, Number(currentCounters?.available))
      : maxTickets;

    if (!abortClaim && ticketAvailableLimit > 0) {
      for (let t = 0; t < ticketAvailableLimit; t++) {
        if (abortClaim) break;
        message.value = `Claiming video ticket ${earnedTickets + 1}/${ticketAvailableLimit}…`;

        const response: any = await dispatchRpc([{
          name: 'cinemaGiveReward',
          args: { type: 'cinema' }
        }]);

        if (abortClaim) break;

        const callResult = response?.results?.[0];
        const rpcError = callResult?.result?.error || callResult?.result?.response?.error || callResult?.error || response?.error;

        if (rpcError || response?.ok === false) {
          const errMsg = String(
            typeof rpcError === 'object'
              ? rpcError.description || rpcError.name || rpcError.message || JSON.stringify(rpcError)
              : rpcError || response?.error || ''
          );
          if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('limit')) {
            break;
          }
          message.value = errMsg || `Failed to claim video ticket ${earnedTickets + 1}.`;
          break;
        }

        earnedTickets++;
        if (t < ticketAvailableLimit - 1) {
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      }
    }

    // Final sync of counters and inventory
    if (opened > 0 || earnedTickets > 0) {
      await dispatchRpc([
        { name: 'cinemaGetCounters', args: {} },
        { name: 'userGetInfo' },
        { name: 'inventoryGet' }
      ]);
      const parts: string[] = [];
      if (opened > 0) {
        const goldStr = earnedGold > 0 ? ` (+${earnedGold.toLocaleString('en-US')} Gold)` : '';
        parts.push(`opened ${opened} video box${opened > 1 ? 'es' : ''}${goldStr}`);
      }
      if (earnedTickets > 0) {
        parts.push(`claimed ${earnedTickets} video ticket${earnedTickets > 1 ? 's' : ''}`);
      }
      message.value = `Successfully ${parts.join(' and ')}!`;
    } else if (!message.value || message.value.startsWith('Checking')) {
      message.value = 'All video boxes and tickets have already been claimed today.';
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
        v-if="totalRemaining > 0 && !allClaimed"
        class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white shadow-sm dark:bg-purple-500"
      >
        {{ totalRemaining }}
      </span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ message }}</span>
  </BaseTooltip>
</template>
