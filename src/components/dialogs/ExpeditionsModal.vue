<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useGameConnection } from '@/src/composables/useGameConnection';
import { useNow } from '@/src/composables/useNow';
import { expeditionRows, expeditionPlan, expeditionRefreshCalls } from '@/src/utils/expeditions';
import { formatDuration, formatFinishTime } from '@/src/utils/formatters';
import { getHeroMetadata } from '@/src/utils/metadata';

interface PendingAction {
  action: 'start' | 'collect';
  expeditionIds: number[];
  slotIds: number[];
  expeditionId?: number;
  slotId?: number;
  heroes?: number[];
  startedAt: number;
  count: number;
  previous?: string;
}

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
const { cache, dispatchRpc } = useRpcCache();
const { hasGameTab } = useGameConnection();
const now = useNow();
const accountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);
const rows = computed(() => expeditionRows(cache.value, now.value));
const plan = computed(() => expeditionPlan(cache.value, now.value));
const readyRows = computed(() => rows.value.filter(row => row.state === 'ready' && Number.isInteger(row.id)));
const autoRunning = ref(false);
const refreshing = ref(false);
const message = ref('');
const pending = shallowRef<PendingAction | null>(null);
const transitioningSlots = ref<number[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const names = (ids: number[]) => ids.map(id => getHeroMetadata(id)?.name || `Hero #${id}`).join(', ');
const teamFor = (slotId: number) => plan.value.find(item => item.slotId === slotId);

const isAnyBusy = computed(() => !!pending.value || refreshing.value);

function isSlotBusy(slotId: number, expeditionId?: number): boolean {
  if (pending.value) {
    if (pending.value.slotIds.includes(slotId)) return true;
    if (expeditionId != null && pending.value.expeditionIds.includes(expeditionId)) return true;
  }
  return transitioningSlots.value.includes(slotId);
}

function getSlotBusyText(slotId: number, expeditionId?: number): string {
  if (pending.value && (pending.value.slotIds.includes(slotId) || (expeditionId != null && pending.value.expeditionIds.includes(expeditionId)))) {
    return pending.value.action === 'collect' ? 'Collecting rewards…' : 'Starting expedition…';
  }
  return 'Loading next expedition…';
}

watch(rows, currentRows => {
  if (!transitioningSlots.value.length) return;
  transitioningSlots.value = transitioningSlots.value.filter(slotId => {
    const row = currentRows.find(r => r.slotId === slotId);
    return row?.state === 'unknown';
  });
}, { immediate: true });

async function refresh() {
  if (refreshing.value || !hasGameTab.value) return;
  refreshing.value = true;
  clearTimeout(refreshTimer);
  try {
    const result = await dispatchRpc(expeditionRefreshCalls());
    if (!result?.ok) message.value = result?.error || 'Refresh could not be sent.';
    else message.value = 'Refresh requested. Waiting for game data.';
  } catch (error) { message.value = String(error); }
  finally {
    refreshTimer = setTimeout(() => {
      refreshing.value = false;
    }, 250);
  }
}

async function settle(success: boolean, error?: string) {
  const request = pending.value;
  if (!request) return;
  pending.value = null;
  clearTimeout(timer);
  if (success && request.action === 'collect') {
    for (const slotId of request.slotIds) {
      if (!transitioningSlots.value.includes(slotId)) {
        transitioningSlots.value.push(slotId);
      }
    }
  }
  if (success) {
    if (request.action === 'collect') {
      message.value = request.count > 1
        ? `Collected rewards from ${request.count} expeditions.`
        : 'Expedition rewards collected.';
    } else {
      message.value = request.count > 1
        ? `Started ${request.count} expeditions.`
        : 'Expedition started.';
    }
  } else {
    message.value = error || (request.action === 'collect' ? 'Expedition collection was rejected.' : 'Expedition start was rejected.');
    autoRunning.value = false;
  }
}

watch(() => cache.value.expeditionStartStatus, entry => {
  const request = pending.value;
  if (!request || request.action !== 'start' || !entry || entry.data?.token === request.previous ||
      String(entry.data.accountId) !== String(accountId.value) ||
      Date.parse(entry.updatedAt) < request.startedAt) return;
  if (request.count === 1 && entry.data?.expeditionId === request.expeditionId) {
    void settle(entry.data.success === true, entry.data.error);
  }
});
watch(() => cache.value.expeditionCollectStatus, entry => {
  const request = pending.value;
  if (!request || request.action !== 'collect' || !entry || entry.data?.token === request.previous ||
      String(entry.data.accountId) !== String(accountId.value) ||
      Date.parse(entry.updatedAt) < request.startedAt) return;
  if (request.count === 1 && entry.data?.expeditionId === request.expeditionId) {
    void settle(entry.data.success === true, entry.data.error);
  }
});
watch(() => cache.value.expeditionStatus, entry => {
  const request = pending.value;
  if (!request || !entry || String(entry.data?.accountId) !== String(accountId.value) || Date.parse(entry.updatedAt) < request.startedAt) return;
  const entryRows = entry.data.rows || [];
  if (request.action === 'collect') {
    const allSettled = request.expeditionIds.every((id, idx) => {
      const row = entryRows.find((r: any) => r.id === id);
      const reqSlot = request.slotIds[idx];
      const replacement = entryRows.find((r: any) => r.slotId === reqSlot);
      return row?.status === 3 || (replacement && replacement.id !== id);
    });
    if (allSettled) void settle(true);
    return;
  }
  if (request.action === 'start') {
    const allStarted = request.expeditionIds.every(id => {
      const row = entryRows.find((r: any) => r.id === id);
      return row?.status === 2;
    });
    if (allStarted) void settle(true);
  }
});

async function startAvailable() {
  if (pending.value || !props.modelValue || !hasGameTab.value) return;
  const currentPlan = expeditionPlan(cache.value, Date.now());
  if (!currentPlan.length) {
    autoRunning.value = false;
    message.value = 'No more expeditions can start with the available heroes.';
    return;
  }
  const expeditionIds = currentPlan.map(p => p.expeditionId);
  const slotIds = currentPlan.map(p => p.slotId);
  const request: PendingAction = {
    action: 'start',
    expeditionIds,
    slotIds,
    expeditionId: expeditionIds[0],
    slotId: slotIds[0],
    heroes: [...currentPlan[0].heroes],
    startedAt: Date.now(),
    count: currentPlan.length,
    previous: cache.value.expeditionStartStatus?.data?.token
  };
  pending.value = request;
  message.value = currentPlan.length > 1
    ? `Starting ${currentPlan.length} expeditions…`
    : 'Starting expedition…';

  const calls = currentPlan.map(item => ({
    name: 'artifact_expeditionStart',
    args: { expeditionId: item.expeditionId, heroes: [...item.heroes] }
  }));

  try {
    const response = await dispatchRpc(calls);
    if (pending.value !== request) return;
    if (!response?.ok) {
      void settle(false, response?.error || 'Expedition start could not be sent.');
      return;
    }
    message.value = response.queued
      ? 'Start queued. Waiting for game traffic.'
      : 'Waiting for expedition confirmation…';
    timer = setTimeout(() => {
      if (pending.value === request) {
        autoRunning.value = false;
        message.value = 'Still awaiting confirmation. Refresh game data before continuing.';
      }
    }, 30000);
  } catch (error) {
    if (pending.value === request) void settle(false, String(error));
  }
}

async function startNext(slotId?: number) {
  if (slotId == null) {
    return startAvailable();
  }
  if (pending.value || !props.modelValue || !hasGameTab.value) return;
  const next = expeditionPlan(cache.value, Date.now()).find(item => item.slotId === slotId);
  if (!next) {
    message.value = 'No more expeditions can start with the available heroes.';
    return;
  }
  const request: PendingAction = {
    action: 'start',
    expeditionIds: [next.expeditionId],
    slotIds: [next.slotId],
    expeditionId: next.expeditionId,
    slotId: next.slotId,
    heroes: [...next.heroes],
    startedAt: Date.now(),
    count: 1,
    previous: cache.value.expeditionStartStatus?.data?.token
  };
  pending.value = request;
  message.value = 'Starting expedition…';

  try {
    const response = await dispatchRpc([{
      name: 'artifact_expeditionStart',
      args: { expeditionId: next.expeditionId, heroes: [...next.heroes] }
    }]);
    if (pending.value !== request) return;
    if (!response?.ok) {
      void settle(false, response?.error || 'Expedition start could not be sent.');
      return;
    }
    message.value = response.queued
      ? 'Start queued. Waiting for game traffic.'
      : 'Waiting for expedition confirmation…';
    timer = setTimeout(() => {
      if (pending.value === request) {
        autoRunning.value = false;
        message.value = 'Still awaiting confirmation. Refresh game data before continuing.';
      }
    }, 30000);
  } catch (error) {
    if (pending.value === request) void settle(false, String(error));
  }
}

async function collectAll() {
  if (pending.value || !props.modelValue || !hasGameTab.value) return;
  const ready = readyRows.value;
  if (!ready.length) return;

  const expeditionIds = ready.map(r => r.id);
  const slotIds = ready.map(r => r.slotId);
  const request: PendingAction = {
    action: 'collect',
    expeditionIds,
    slotIds,
    expeditionId: expeditionIds[0],
    slotId: slotIds[0],
    startedAt: Date.now(),
    count: ready.length,
    previous: cache.value.expeditionCollectStatus?.data?.token
  };
  pending.value = request;
  message.value = ready.length > 1
    ? `Collecting rewards from ${ready.length} expeditions…`
    : 'Collecting expedition rewards…';

  const calls = ready.map(r => ({
    name: 'expeditionFarm',
    args: { expeditionId: r.id }
  }));

  try {
    const response = await dispatchRpc(calls);
    if (pending.value !== request) return;
    if (!response?.ok) {
      void settle(false, response?.error || 'Collection could not be sent.');
      return;
    }
    message.value = response.queued
      ? 'Collection queued. Waiting for game traffic.'
      : 'Waiting for collection confirmation…';
    timer = setTimeout(() => {
      if (pending.value === request) {
        message.value = 'Still awaiting collection confirmation. Refresh game data before continuing.';
      }
    }, 30000);
  } catch (error) {
    if (pending.value === request) void settle(false, String(error));
  }
}

async function collect(slotId: number) {
  if (pending.value || !props.modelValue || !hasGameTab.value) return;
  const row = expeditionRows(cache.value, Date.now()).find(row => row.slotId === slotId && row.state === 'ready');
  if (!row || !Number.isInteger(row.id)) return;
  const request: PendingAction = {
    action: 'collect',
    expeditionIds: [row.id],
    slotIds: [slotId],
    expeditionId: row.id,
    slotId,
    heroes: [...row.heroes],
    startedAt: Date.now(),
    count: 1,
    previous: cache.value.expeditionCollectStatus?.data?.token
  };
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

watch(() => props.modelValue, open => { if (open) void refresh(); else autoRunning.value = false; });
watch(accountId, () => { autoRunning.value = false; pending.value = null; message.value = ''; transitioningSlots.value = []; clearTimeout(timer); clearTimeout(refreshTimer); });
onUnmounted(() => { clearTimeout(timer); clearTimeout(refreshTimer); });
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Expeditions" icon="⛵" max-width="max-w-4xl" @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-slate-500">Hero expeditions require 5 available heroes and enough power. Video Expedition requires no heroes.</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isAnyBusy || !hasGameTab"
            @click="refresh"
          >
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            v-if="readyRows.length"
            type="button"
            class="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
            :disabled="isAnyBusy || !hasGameTab"
            @click="collectAll"
          >
            {{ pending?.action === 'collect' && pending.count > 1 ? `Claiming (${pending.count})…` : `Claim all (${readyRows.length})` }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
            :disabled="isAnyBusy || !hasGameTab || !plan.length"
            @click="startAvailable"
          >
            {{ pending?.action === 'start' && pending.count > 1 ? `Starting (${pending.count})…` : `Start available (${plan.length})` }}
          </button>
        </div>
      </div>
      <p v-if="message" class="text-xs text-slate-600 dark:text-slate-300" role="status">{{ message }}</p>

      <div class="relative min-h-[300px]">
        <!-- Refreshing Grid Overlay to block interactions and eliminate blank flickers -->
        <div
          v-if="refreshing"
          class="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-20 rounded-xl transition-opacity duration-150"
        >
          <div class="bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 flex items-center gap-2.5">
            <span class="inline-block animate-spin text-base">⏳</span>
            <span class="text-xs font-medium text-slate-700 dark:text-slate-200">Refreshing expeditions…</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <article
            v-for="row in rows"
            :key="row.slotId"
            class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 relative min-h-[165px] flex flex-col justify-between overflow-hidden transition-all duration-150"
            :class="{ 'opacity-65': row.state === 'locked' }"
          >
            <!-- Slot-level blocking overlay during pending action or slot transition -->
            <div
              v-if="isSlotBusy(row.slotId, row.id)"
              class="absolute inset-0 bg-white/85 dark:bg-slate-900/85 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 p-3 text-center space-y-1.5"
            >
              <span class="inline-block animate-spin text-lg">⏳</span>
              <p class="text-xs font-semibold text-violet-600 dark:text-violet-400">
                {{ getSlotBusyText(row.slotId, row.id) }}
              </p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Awaiting game confirmation…</p>
            </div>

            <div class="space-y-2">
              <div class="flex justify-between gap-2 text-sm font-semibold">
                <span>{{ row.title }}</span>
                <span class="text-xs capitalize font-medium" :class="row.state === 'locked' ? 'text-slate-500' : 'text-violet-500'">
                  {{ row.state === 'locked' ? '🔒 Locked' : row.state }}
                </span>
              </div>
              <p class="text-xs text-slate-500">{{ row.reason }}</p>
              <p v-if="row.subscription || row.vip" class="text-[11px] text-amber-600 dark:text-amber-400">{{ row.requirement }}</p>

              <!-- Running / Ready / Done Progress -->
              <div v-if="row.state === 'running' || row.state === 'ready' || row.state === 'done'" class="space-y-1">
                <progress :value="row.progress" max="100" class="h-2 w-full accent-violet-600" :aria-label="`${row.title} progress`" />
                <div class="flex justify-between text-xs">
                  <span>{{ Math.floor(row.progress) }}%</span>
                  <span>{{ row.state === 'running' && row.remainingSeconds != null ? formatDuration(row.remainingSeconds) : row.state === 'ready' ? 'Ready to collect' : 'Completed' }}</span>
                </div>
                <p v-if="row.endTime" class="text-[11px] text-slate-400">Finishes {{ formatFinishTime(row.endTime, now) }}</p>
              </div>

              <!-- Heroes list -->
              <p v-if="row.heroes?.length" class="text-xs text-slate-500">{{ names(row.heroes) }}</p>

              <!-- Idle State info -->
              <div v-if="row.state === 'idle'" class="space-y-1.5">
                <p class="text-xs text-slate-500">
                  {{ row.needsHeroes ? `Required power: ${Number.isFinite(row.power) ? row.power.toLocaleString('en-US') : 'Unknown'}` : 'No heroes required' }} · {{ row.durationMs ? formatDuration(row.durationMs / 1000) : 'Duration unknown' }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ teamFor(row.slotId) ? (row.needsHeroes ? `Selected (5/5): ${names(teamFor(row.slotId)!.heroes)}` : 'Video expedition available') : 'Need 5 available heroes with enough power · Free heroes reserved for stronger expeditions first' }}
                </p>
              </div>

              <!-- Unknown / Transitioning placeholder keeping card stable -->
              <div v-if="row.state === 'unknown' && !isSlotBusy(row.slotId, row.id)" class="py-3 space-y-1.5 text-center">
                <div class="h-2 w-full bg-slate-200 dark:bg-slate-700 animate-pulse rounded"></div>
                <p class="text-[11px] text-slate-400">Loading expedition details…</p>
              </div>
            </div>

            <!-- Action buttons pinned cleanly at bottom -->
            <div class="pt-2">
              <button
                v-if="row.state === 'ready'"
                type="button"
                class="w-full sm:w-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
                :disabled="isAnyBusy || isSlotBusy(row.slotId, row.id) || !hasGameTab"
                @click="collect(row.slotId)"
              >
                {{ pending?.action === 'collect' && pending.slotIds.includes(row.slotId) ? 'Awaiting confirmation…' : 'Collect' }}
              </button>
              <button
                v-if="row.state === 'idle'"
                type="button"
                class="w-full sm:w-auto rounded-lg border border-violet-300 dark:border-violet-800 px-3 py-1 text-xs text-violet-600 dark:text-violet-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                :disabled="isAnyBusy || isSlotBusy(row.slotId, row.id) || !hasGameTab || !teamFor(row.slotId)"
                @click="startNext(row.slotId)"
              >
                {{ pending?.action === 'start' && pending.slotIds.includes(row.slotId) ? 'Awaiting confirmation…' : 'Auto select & start' }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
