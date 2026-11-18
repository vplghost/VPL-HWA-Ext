<script setup lang="ts">
import { computed } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { usePopupAutomation } from '@/src/composables/usePopupAutomation';

const props = defineProps<{ hasGameTab: boolean }>();
const { cache } = useRpcCache();
const {
  autoClaimSettings,
  pending: pendingClaims,
  selectedCount,
  busy: claimBusy,
  message: claimMessage,
  claimRewards,
} = usePopupAutomation(cache);

const readyChannels = computed(() => {
  const p = pendingClaims.value;
  const s = autoClaimSettings.value;
  const channels: string[] = [];
  if (s.mail && p?.letterIds?.length) channels.push(`Mail: ${p.letterIds.length}`);
  if (s.reports && p?.hasReports) channels.push('Reports');
  if (s.quests && p?.questIds?.length) channels.push(`Quests: ${p.questIds.length}`);
  if (s.attentionBonuses && p?.attentionBonusIds?.length) channels.push(`Chests: ${p.attentionBonusIds.length}`);
  if (s.videoBoxes && p?.videoBoxNums?.length) channels.push(`Video Boxes: ${p.videoBoxNums.length}`);
  if (s.alchemySpin && p?.hasAlchemySpin) channels.push('Alchemy');
  if (s.airshipGift && p?.hasAirshipGift) channels.push('Airship');
  if (s.dailyBonus && p?.hasDailyBonus) channels.push('Daily Bonus');
  if (s.freeOffers && p?.freeOfferIds?.length) channels.push(`Offers: ${p.freeOfferIds.length}`);
  return channels;
});

const disabled = computed(() =>
  claimBusy.value || !props.hasGameTab || selectedCount.value === 0
);

const tooltip = computed(() => {
  if (!props.hasGameTab) return 'Open the game to claim Freebies';
  if (claimBusy.value) return claimMessage.value || 'Claiming freebies…';
  if (claimMessage.value && selectedCount.value === 0) return claimMessage.value;
  if (selectedCount.value > 0) {
    return `Claim All Freebies: ${selectedCount.value} ready (${readyChannels.value.join(', ')})`;
  }
  return 'All enabled freebies have been claimed';
});
</script>

<template>
  <BaseTooltip :content="tooltip">
    <button
      id="dashboard-claim-all-freebies"
      type="button"
      :disabled="disabled"
      :aria-label="tooltip"
      :aria-busy="claimBusy"
      class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 active:scale-95 dark:border-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all relative"
      @click="claimRewards"
    >
      <!-- Sparkle / Gift Icon -->
      <svg
        class="size-4 shrink-0"
        :class="{ 'animate-spin': claimBusy }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
      <span>Claim All</span>
      <!-- Badge -->
      <span
        v-if="selectedCount > 0"
        id="dashboard-claim-all-freebies-badge"
        class="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-xs dark:bg-emerald-500"
      >
        {{ selectedCount }}
      </span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ claimMessage }}</span>
  </BaseTooltip>
</template>
