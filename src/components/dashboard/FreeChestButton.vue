<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useNow } from '@/src/composables/useNow';
import { getAttentionBonusAvailability, formatCooldownTimer } from '@/src/utils/freeChestHelper';

const props = defineProps<{ hasGameTab: boolean }>();
const { cache, dispatchRpc } = useRpcCache();

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const bonuses = computed(() => cache.value.attentionBonusStatus?.data?.bonuses);
const now = useNow();

const availability = computed(() => getAttentionBonusAvailability(bonuses.value, now.value));
const availableCount = computed(() => availability.value.availableCount);
const nextRefreshSeconds = computed(() => availability.value.nextRefreshSeconds);

const pending = shallowRef<boolean>(false);
const message = ref<string>('');
let abortClaim = false;

const disabled = computed(() =>
  pending.value || !props.hasGameTab || !availability.value.ready
);

const tooltip = computed(() => {
  if (!props.hasGameTab) return 'Open the game to claim Free Gifts';
  if (pending.value) return message.value || 'Claiming Free Gifts…';
  if (message.value) return message.value;
  if (availability.value.ready) {
    return `Free Gifts: ${availableCount.value} available to claim (Energy, items)`;
  }
  if (nextRefreshSeconds.value != null && nextRefreshSeconds.value > 0) {
    return `Free Gifts available in ${formatCooldownTimer(nextRefreshSeconds.value)}`;
  }
  return 'Free Gifts (Energy, items)';
});

onMounted(() => {
  if (props.hasGameTab && (!bonuses.value || Object.keys(bonuses.value).length === 0)) {
    void dispatchRpc([{ name: 'liveOps_refresh', args: {} }]);
  }
});

watch(accountId, () => {
  pending.value = false;
  message.value = '';
  abortClaim = true;
});

watch(() => availability.value.ready, (ready, wasReady) => {
  if (ready && !wasReady && !pending.value) {
    message.value = '';
  }
});

onUnmounted(() => {
  abortClaim = true;
});

async function claimChests() {
  if (disabled.value || pending.value || !props.hasGameTab) return;

  pending.value = true;
  abortClaim = false;
  message.value = 'Checking available Free Gifts…';

  try {
    let currentBonuses = bonuses.value;
    if (!currentBonuses || Object.keys(currentBonuses).length === 0) {
      await dispatchRpc([{ name: 'liveOps_refresh', args: {} }]);
      currentBonuses = cache.value.attentionBonusStatus?.data?.bonuses;
    }

    const currentAvail = getAttentionBonusAvailability(currentBonuses, Date.now());
    if (!currentAvail.ready || currentAvail.readyBonusIds.length === 0) {
      pending.value = false;
      message.value = 'All Free Gifts have already been claimed today.';
      return;
    }

    const queue = [...currentAvail.readyBonusIds];
    let claimed = 0;

    for (let idx = 0; idx < queue.length; idx++) {
      if (abortClaim) break;
      const bonusId = queue[idx];
      message.value = `Claiming gift ${idx + 1}/${queue.length}…`;

      const response = await dispatchRpc([{
        name: 'attentionBonus_collectReward',
        args: { id: bonusId }
      }]);

      if (abortClaim) break;

      if (!response?.ok) {
        message.value = response?.error || `Failed to claim gift #${bonusId}.`;
        break;
      }

      claimed++;

      if (idx < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Synchronize Energy, World Energy, and inventory right after claiming
    if (claimed > 0) {
      await dispatchRpc([
        { name: 'userGetInfo' },
        { name: 'refillableGetAll', feature: 'refillable' },
        { name: 'inventoryGet' }
      ]);
      message.value = `Successfully claimed ${claimed} Free Gift${claimed > 1 ? 's' : ''}! Energy and resources updated.`;
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
      id="dashboard-free-chests"
      type="button"
      :disabled="disabled"
      :aria-label="tooltip"
      :aria-busy="pending"
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors relative"
      @click="claimChests"
    >
      <!-- Chest / Gift Icon -->
      <svg
        class="size-4"
        :class="{ 'animate-pulse': pending }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 12v10H4V12" />
        <path d="M2 7h20v5H2z" />
        <path d="M12 22V7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
      <!-- Available count badge -->
      <span
        v-if="availableCount > 0"
        id="dashboard-free-chests-badge"
        class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm dark:bg-emerald-500"
      >
        {{ availableCount }}
      </span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ message }}</span>
  </BaseTooltip>
</template>
