<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useNow } from '@/src/composables/useNow';
import { speedup, type SpeedupKind } from '@/src/utils/speedup';
import { formatDuration, formatFinishTime } from '@/src/utils/formatters';

const props = defineProps<{ kind: SpeedupKind; targetId?: number; targetLabel: string }>();
const { cache, dispatchRpc } = useRpcCache();
const now = useNow();
const itemId = ref(0), amount = ref(1), submitting = ref(false), message = ref('');
const formOpen = ref(false);
const spend = shallowRef<any>(null), confirmation = shallowRef<any>(null);
let revision = 0;
const target = computed(() => speedup.target(cache.value, props.kind, props.targetId || 0));
const items = computed<any[]>(() => speedup.stock(cache.value, props.kind));
const quote = computed(() => speedup.quote(cache.value, props.kind, props.targetId || 0, itemId.value, amount.value, now.value));
const waiting = computed(() => submitting.value || Boolean(spend.value?.pending));
const confirmValid = computed(() => confirmation.value && quote.value && speedup.signature(confirmation.value) === speedup.signature(quote.value));
const itemDuration = computed(() => speedup.duration(speedup.kinds[props.kind].type, itemId.value) || 0);
const maxAmount = computed(() => Math.max(0, Math.min(items.value.find(item => item.id === itemId.value)?.quantity || 0,
  Math.floor(((target.value?.endsAt || 0) - now.value) / (itemDuration.value || 1)))));
watch(items, rows => { if (!rows.some(row => row.id === itemId.value)) itemId.value = rows[0]?.id || 0; }, { immediate: true });
watch(itemId, () => { if (formOpen.value && !confirmation.value && !waiting.value) suggestAmount(); });
watch(() => cache.value.accountStatus?.data?.id, () => { formOpen.value = false; confirmation.value = null; message.value = ''; });
watch(() => [props.kind, props.targetId], () => { formOpen.value = false; confirmation.value = null; });
async function loadSpend() {
  const read = revision;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const stored = await chrome.storage.local.get('speedupSpendState');
  if (read === revision) spend.value = stored.speedupSpendState || null;
}
function storageChanged(changes: any, area: string) {
  if (area === 'local' && changes.speedupSpendState) { revision++; spend.value = changes.speedupSpendState.newValue || null; }
}
onMounted(() => {
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(storageChanged);
  void loadSpend().catch(() => {});
});
onUnmounted(() => { revision++; if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(storageChanged); });
const refreshing = ref(false);

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const result = await dispatchRpc(speedup.refreshCalls(props.kind));
    message.value = result?.ok ? 'Inventory and timer refresh requested. Waiting for game data.' : result?.error || 'Refresh failed.';
  } finally {
    refreshing.value = false;
  }
}
function review() {
  if (!formOpen.value || !quote.value || waiting.value) return;
  confirmation.value = { ...quote.value };
}
function suggestAmount() {
  amount.value = speedup.suggestedAmount((target.value?.endsAt || 0) - now.value, itemDuration.value,
    items.value.find(item => item.id === itemId.value)?.quantity || 0);
}
function openForm() { formOpen.value = true; suggestAmount(); }
async function confirm() {
  if (!confirmValid.value || waiting.value) return;
  const request = confirmation.value;
  submitting.value = true;
  confirmation.value = null;
  try {
    const result = await chrome.runtime.sendMessage({ kind: 'speedup-use', confirmed: true, quote: request });
    message.value = result?.ok ? 'Waiting for game confirmation. Do not resend.' : result?.error || 'Speedup could not be sent.';
    await loadSpend();
  } catch (error) { message.value = String(error); }
  finally { submitting.value = false; }
}
</script>

<template>
  <span class="inline-flex items-center align-middle" data-speedup-control>
    <button type="button" :aria-label="`Speed up ${targetLabel}`" :title="waiting ? 'Speedup awaiting game confirmation' : `Speed up ${targetLabel}`" class="inline-flex cursor-pointer items-center justify-center bg-transparent p-0.5 text-amber-600 hover:text-amber-500 dark:text-amber-400" @click.stop="openForm">
      <svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor" aria-hidden="true"><path d="M3 4v16l9-8-9-8Zm9 0v16l9-8-9-8Z" /></svg>
    </button>
    <ModalDialog :model-value="formOpen && !confirmation" :title="`Speed up ${targetLabel}`" icon="⏩" :stack-level="70" @update:model-value="formOpen = false">
    <div class="space-y-3 text-xs" data-speedup-form>
    <div class="flex items-center justify-between gap-2"><span class="font-semibold">{{ targetLabel }}</span><button type="button" :disabled="refreshing" class="cursor-pointer text-blue-600 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed" @click="refresh">{{ refreshing ? 'Refreshing…' : 'Refresh items &amp; timer' }}</button></div>
    <div class="flex flex-wrap items-center gap-2">
      <select v-model.number="itemId" :disabled="waiting" aria-label="Speedup item" class="min-w-0 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1">
        <option v-if="!items.length" :value="0">No verified items · Refresh</option>
        <option v-for="item in items" :key="item.id" :value="item.id">{{ formatDuration((speedup.duration(item.type, item.id) || 0) / 1000) }} · {{ item.quantity }} available</option>
      </select>
      <input v-model.number="amount" type="number" min="1" :max="maxAmount" :disabled="waiting" aria-label="Speedup quantity" class="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1" />
      <button type="button" :disabled="!quote || waiting" class="cursor-pointer rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50 disabled:cursor-not-allowed" @click="review">Review speedup</button>
    </div>
    <p v-if="quote">Reduce by {{ formatDuration(quote.totalMs / 1000) }} · Estimated finish {{ formatFinishTime(quote.endsAt - quote.totalMs, now) }}</p>
    <p v-else class="text-slate-500">Refresh current items and timer. Choose a quantity within stock and remaining time; overrun/refund exchange is not supported.</p>
    <p class="text-slate-500">Suggested quantity stops one item short of finishing, or uses all available items if stock is insufficient. You can adjust it before confirmation.</p>
    <p v-if="waiting || message || spend?.message" role="status" class="text-slate-500">{{ waiting ? 'Speedup awaiting game confirmation. No automatic retry.' : message || spend?.message }}</p>
    </div>
    </ModalDialog>
    <ModalDialog :model-value="!!confirmation" title="Confirm speedup use" icon="⏩" :stack-level="80" @update:model-value="confirmation = null">
      <template v-if="confirmation">
        <p class="font-semibold">{{ targetLabel }}</p>
        <p>Spend {{ confirmation.amount }} × {{ formatDuration(confirmation.itemMs / 1000) }} {{ kind }} speedup.</p>
        <p>Total time reduction: <strong>{{ formatDuration(confirmation.totalMs / 1000) }}</strong>.</p>
        <p>Estimated finish: {{ formatFinishTime(confirmation.endsAt - confirmation.totalMs, now) }}.</p>
        <p>Items will be consumed. This action cannot be undone.</p>
        <p v-if="!confirmValid" role="alert" class="text-amber-600">Target, inventory or remaining time changed. Cancel and review again.</p>
      </template>
      <template #footer>
        <button type="button" class="cursor-pointer rounded border border-slate-300 px-3 py-1.5" @click="confirmation = null">Cancel</button>
        <button type="button" :disabled="!confirmValid || waiting" class="cursor-pointer rounded bg-amber-600 px-3 py-1.5 text-white disabled:opacity-50" @click="confirm">Confirm &amp; use items</button>
      </template>
    </ModalDialog>
  </span>
</template>
