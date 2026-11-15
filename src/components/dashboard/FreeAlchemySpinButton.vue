<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useNow } from '@/src/composables/useNow';
import { freeAlchemyAvailability, freeAlchemyTimer } from '@/src/utils/freeAlchemySpin';
import { useFreeSpinAutomation } from '@/src/composables/useFreeSpinAutomation';

const props = defineProps<{ hasGameTab: boolean }>();
const { cache, dispatchRpc } = useRpcCache();
const { pending: sharedPending, status: autoStatus } = useFreeSpinAutomation();
const accountId = computed(() => cache.value.accountStatus?.data?.id);
const result = computed(() => cache.value.freeAlchemySpinStatus);
const now = useNow();
const availability = computed(() => freeAlchemyAvailability(cache.value, now.value));
const disabled = computed(() => !!pending.value || sharedPending.value || !props.hasGameTab || !availability.value.ready);
const pending = shallowRef<{ startedAt: number; previous?: string } | null>(null);
const message = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
const tooltip = computed(() => !props.hasGameTab ? 'Open the game to use Free Spin'
  : !availability.value.ready ? `Free Spin available in ${freeAlchemyTimer(availability.value.remainingSeconds)}`
  : message.value || autoStatus.value || 'Free Spin · Emerald Exchange');
watch(result, entry => {
  const request = pending.value;
  if (!request || !entry || entry.data?.token === request.previous || Date.parse(entry.updatedAt) < request.startedAt) return;
  pending.value = null;
  clearTimeout(timer);
  message.value = entry.data?.success
    ? `Free Spin: +${Number(entry.data.gold).toLocaleString('en-US')} Gold`
    : entry.data?.error || 'Free Spin was rejected.';
});
watch(() => availability.value.ready, (ready, wasReady) => {
  if (ready && !wasReady && !pending.value) message.value = '';
});
watch(accountId, () => { pending.value = null; message.value = ''; clearTimeout(timer); });
onUnmounted(() => clearTimeout(timer));
async function spin() {
  if (pending.value || sharedPending.value || !props.hasGameTab || !freeAlchemyAvailability(cache.value, Date.now()).ready) return;
  const request = { startedAt: Date.now(), previous: result.value?.data?.token };
  pending.value = request;
  message.value = 'Free Spin requested…';
  try {
    const response = await dispatchRpc([{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }]);
    if (pending.value !== request) return;
    if (!response?.ok) {
      pending.value = null;
      message.value = response?.error || 'Free Spin could not be sent.';
      return;
    }
    message.value = response.queued ? 'Free Spin queued. Waiting for game traffic.' : 'Free Spin: waiting for game result…';
    timer = setTimeout(() => {
      if (pending.value === request) message.value = 'Free Spin is still awaiting confirmation. Refresh the game data before retrying.';
    }, 30000);
  } catch (error) {
    if (pending.value === request) { pending.value = null; message.value = error instanceof Error ? error.message : String(error); }
  }
}
</script>

<template>
  <BaseTooltip :content="tooltip">
    <button id="dashboard-free-alchemy-spin" type="button" :disabled="disabled" :aria-label="tooltip" :aria-busy="!!pending" class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors" @click="spin">
      <svg class="size-4" :class="{ 'animate-spin': pending }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ message }}</span>
  </BaseTooltip>
</template>
