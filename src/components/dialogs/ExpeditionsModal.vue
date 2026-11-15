<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useGameConnection } from '@/src/composables/useGameConnection';
import { useNow } from '@/src/composables/useNow';
import { expeditionRows, expeditionPlan, expeditionRefreshCalls } from '@/src/utils/expeditions';
import { formatDuration, formatFinishTime } from '@/src/utils/formatters';
import { getHeroMetadata } from '@/src/utils/metadata';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
const { cache, dispatchRpc } = useRpcCache();
const { hasGameTab } = useGameConnection();
const now = useNow();
const accountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);
const rows = computed(() => expeditionRows(cache.value, now.value));
const plan = computed(() => expeditionPlan(cache.value, now.value));
const autoRunning = ref(false);
const refreshing = ref(false);
const message = ref('');
const pending = shallowRef<{ action: 'start' | 'collect'; expeditionId: number; slotId?: number; heroes: number[]; startedAt: number; previous?: string } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
const names = (ids: number[]) => ids.map(id => getHeroMetadata(id)?.name || `Hero #${id}`).join(', ');
const teamFor = (slotId: number) => plan.value.find(item => item.slotId === slotId);

async function refresh() {
  if (refreshing.value || !hasGameTab.value) return;
  refreshing.value = true;
  try {
    const result = await dispatchRpc(expeditionRefreshCalls());
    if (!result?.ok) message.value = result?.error || 'Refresh could not be sent.';
    else message.value = 'Refresh requested. Waiting for game data.';
  } catch (error) { message.value = String(error); }
  finally { refreshing.value = false; }
}

async function settle(success: boolean, error?: string) {
  const request = pending.value;
  if (!request) return;
  pending.value = null;
  clearTimeout(timer);
  message.value = success ? (request.action === 'collect' ? 'Expedition rewards collected.' : 'Expedition started.')
    : error || (request.action === 'collect' ? 'Expedition collection was rejected.' : 'Expedition start was rejected.');
  if (!success) autoRunning.value = false;
  await nextTick();
  if (autoRunning.value && props.modelValue) void startNext();
}

watch(() => cache.value.expeditionStartStatus, entry => {
  const request = pending.value;
  if (!request || request.action !== 'start' || !entry || entry.data?.token === request.previous ||
      entry.data?.expeditionId !== request.expeditionId || String(entry.data.accountId) !== String(accountId.value) ||
      Date.parse(entry.updatedAt) < request.startedAt) return;
  void settle(entry.data.success === true, entry.data.error);
});
watch(() => cache.value.expeditionCollectStatus, entry => {
  const request = pending.value;
  if (!request || request.action !== 'collect' || !entry || entry.data?.token === request.previous ||
      entry.data?.expeditionId !== request.expeditionId || String(entry.data.accountId) !== String(accountId.value) ||
      Date.parse(entry.updatedAt) < request.startedAt) return;
  void settle(entry.data.success === true, entry.data.error);
});
watch(() => cache.value.expeditionStatus, entry => {
  const request = pending.value;
  if (!request || !entry || String(entry.data?.accountId) !== String(accountId.value) || Date.parse(entry.updatedAt) < request.startedAt) return;
  const row = entry.data.rows?.find((row: any) => row.id === request.expeditionId);
  if (request.action === 'collect') {
    const replacement = entry.data.rows?.find((row: any) => row.slotId === request.slotId);
    if (row?.status === 3 || replacement && replacement.id !== request.expeditionId) void settle(true);
    return;
  }
  if (row?.status === 2 && Array.isArray(row.heroes) && row.heroes.length === request.heroes.length &&
      row.heroes.every((id: number) => request.heroes.includes(id))) void settle(true);
});

async function startNext(slotId?: number) {
  if (pending.value || !props.modelValue || !hasGameTab.value) return;
  // Recompute from current snapshots before every mutation, never from a stale preview.
  const next = expeditionPlan(cache.value, Date.now()).find(item => slotId == null || item.slotId === slotId);
  if (!next) { autoRunning.value = false; message.value = 'No more expeditions can start with the available heroes.'; return; }
  const request = { action: 'start' as const, expeditionId: next.expeditionId, heroes: [...next.heroes], startedAt: Date.now(),
    previous: cache.value.expeditionStartStatus?.data?.token };
  pending.value = request;
  message.value = 'Starting expedition…';
  try {
    const response = await dispatchRpc([{ name: 'artifact_expeditionStart', args: { expeditionId: next.expeditionId, heroes: [...next.heroes] } }]);
    if (pending.value !== request) return;
    if (!response?.ok) { void settle(false, response?.error || 'Expedition start could not be sent.'); return; }
    message.value = response.queued ? 'Start queued. Waiting for game traffic.' : 'Waiting for expedition confirmation…';
    timer = setTimeout(() => {
      if (pending.value === request) { autoRunning.value = false; message.value = 'Still awaiting confirmation. Refresh game data before continuing.'; }
    }, 30000);
  } catch (error) { if (pending.value === request) void settle(false, String(error)); }
}
async function collect(slotId: number) {
  if (pending.value || autoRunning.value || !props.modelValue || !hasGameTab.value) return;
  const row = expeditionRows(cache.value, Date.now()).find(row => row.slotId === slotId && row.state === 'ready');
  if (!row || !Number.isInteger(row.id)) return;
  const request = { action: 'collect' as const, expeditionId: row.id, slotId,
    heroes: [...row.heroes], startedAt: Date.now(), previous: cache.value.expeditionCollectStatus?.data?.token };
  pending.value = request;
  message.value = 'Collecting expedition rewards…';
  try {
    const response = await dispatchRpc([{ name: 'expeditionFarm', args: { expeditionId: row.id } }]);
    if (pending.value !== request) return;
    if (!response?.ok) { void settle(false, response?.error || 'Collection could not be sent.'); return; }
    message.value = response.queued ? 'Collection queued. Waiting for game traffic.' : 'Waiting for collection confirmation…';
    timer = setTimeout(() => {
      if (pending.value === request) message.value = 'Still awaiting collection confirmation. Refresh game data before continuing.';
    }, 30000);
  } catch (error) { if (pending.value === request) void settle(false, String(error)); }
}
function startAvailable() { if (!pending.value) { autoRunning.value = true; void startNext(); } }
watch(() => props.modelValue, open => { if (open) void refresh(); else autoRunning.value = false; });
watch(accountId, () => { autoRunning.value = false; pending.value = null; message.value = ''; clearTimeout(timer); });
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Expeditions" icon="⛵" max-width="max-w-4xl" @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-slate-500">Hero expeditions require 5 available heroes and enough power. Video Expedition requires no heroes.</p>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50" :disabled="refreshing || !hasGameTab" @click="refresh">Refresh</button>
          <button v-if="autoRunning" type="button" class="rounded-lg border border-amber-400 px-3 py-1.5 text-xs cursor-pointer" @click="autoRunning = false">Stop after current</button>
          <button v-else type="button" class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!!pending || !hasGameTab || !plan.length" @click="startAvailable">Start available ({{ plan.length }})</button>
        </div>
      </div>
      <p v-if="message" class="text-xs text-slate-600 dark:text-slate-300" role="status">{{ message }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <article v-for="row in rows" :key="row.slotId" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2" :class="{ 'opacity-65': row.state === 'locked' }">
          <div class="flex justify-between gap-2 text-sm font-semibold"><span>{{ row.title }}</span><span class="text-xs capitalize" :class="row.state === 'locked' ? 'text-slate-500' : 'text-violet-500'">{{ row.state === 'locked' ? '🔒 Locked' : row.state }}</span></div>
          <p class="text-xs text-slate-500">{{ row.reason }}</p>
          <p v-if="row.subscription || row.vip" class="text-[11px] text-amber-600 dark:text-amber-400">{{ row.requirement }}</p>
          <div v-if="row.state === 'running' || row.state === 'ready' || row.state === 'done'" class="space-y-1">
            <progress :value="row.progress" max="100" class="h-2 w-full accent-violet-600" :aria-label="`${row.title} progress`" />
            <div class="flex justify-between text-xs"><span>{{ Math.floor(row.progress) }}%</span><span>{{ row.state === 'running' && row.remainingSeconds != null ? formatDuration(row.remainingSeconds) : row.state === 'ready' ? 'Ready to collect' : 'Completed' }}</span></div>
            <p v-if="row.endTime" class="text-[11px] text-slate-400">Finishes {{ formatFinishTime(row.endTime, now) }}</p>
          </div>
          <button v-if="row.state === 'ready'" type="button" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!!pending || autoRunning || !hasGameTab" @click="collect(row.slotId)">{{ pending?.action === 'collect' && pending.expeditionId === row.id ? 'Awaiting confirmation…' : 'Collect' }}</button>
          <p v-if="row.heroes.length" class="text-xs text-slate-500">{{ names(row.heroes) }}</p>
          <div v-if="row.state === 'idle'" class="space-y-2">
            <p class="text-xs text-slate-500">{{ row.needsHeroes ? `Required power: ${Number.isFinite(row.power) ? row.power.toLocaleString('en-US') : 'Unknown'}` : 'No heroes required' }} · {{ row.durationMs ? formatDuration(row.durationMs / 1000) : 'Duration unknown' }}</p>
            <p class="text-xs text-slate-500">{{ teamFor(row.slotId) ? (row.needsHeroes ? `Selected (5/5): ${names(teamFor(row.slotId)!.heroes)}` : 'Video expedition available') : 'Need 5 available heroes with enough power · Free heroes reserved for stronger expeditions first' }}</p>
            <button type="button" class="rounded-lg border border-violet-300 dark:border-violet-800 px-3 py-1 text-xs text-violet-600 dark:text-violet-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!!pending || autoRunning || !hasGameTab || !teamFor(row.slotId)" @click="startNext(row.slotId)">{{ pending?.expeditionId === row.id ? 'Awaiting confirmation…' : 'Auto select & start' }}</button>
          </div>
        </article>
      </div>
    </div>
  </ModalDialog>
</template>
