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
const transitioningSlots = ref<number[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const names = (ids: number[]) => ids.map(id => getHeroMetadata(id)?.name || `Hero #${id}`).join(', ');
const teamFor = (slotId: number) => plan.value.find(item => item.slotId === slotId);

function isSlotBusy(slotId: number, expeditionId?: number): boolean {
  if (pending.value && (pending.value.slotId === slotId || pending.value.expeditionId === expeditionId)) {
    return true;
  }
  return transitioningSlots.value.includes(slotId);
}

function getSlotBusyText(slotId: number, expeditionId?: number): string {
  if (pending.value && (pending.value.slotId === slotId || pending.value.expeditionId === expeditionId)) {
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
  if (success && request.action === 'collect' && request.slotId != null) {
    if (!transitioningSlots.value.includes(request.slotId)) {
      transitioningSlots.value.push(request.slotId);
    }
  }
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
  const next = expeditionPlan(cache.value, Date.now()).find(item => slotId == null || item.slotId === slotId);
  if (!next) { autoRunning.value = false; message.value = 'No more expeditions can start with the available heroes.'; return; }
  const request = { action: 'start' as const, expeditionId: next.expeditionId, slotId: next.slotId, heroes: [...next.heroes], startedAt: Date.now(),
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
watch(accountId, () => { autoRunning.value = false; pending.value = null; message.value = ''; transitioningSlots.value = []; clearTimeout(timer); clearTimeout(refreshTimer); });
onUnmounted(() => { clearTimeout(timer); clearTimeout(refreshTimer); });
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Expeditions" icon="⛵" max-width="max-w-4xl" @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-slate-500">Hero expeditions require 5 available heroes and enough power. Video Expedition requires no heroes.</p>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50" :disabled="refreshing || !hasGameTab" @click="refresh">
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button v-if="autoRunning" type="button" class="rounded-lg border border-amber-400 px-3 py-1.5 text-xs cursor-pointer" @click="autoRunning = false">Stop after current</button>
          <button v-else type="button" class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!!pending || refreshing || !hasGameTab || !plan.length" @click="startAvailable">Start available ({{ plan.length }})</button>
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
                :disabled="!!pending || autoRunning || refreshing || isSlotBusy(row.slotId, row.id) || !hasGameTab"
                @click="collect(row.slotId)"
              >
                {{ pending?.action === 'collect' && (pending.expeditionId === row.id || pending.slotId === row.slotId) ? 'Awaiting confirmation…' : 'Collect' }}
              </button>
              <button
                v-if="row.state === 'idle'"
                type="button"
                class="w-full sm:w-auto rounded-lg border border-violet-300 dark:border-violet-800 px-3 py-1 text-xs text-violet-600 dark:text-violet-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                :disabled="!!pending || autoRunning || refreshing || isSlotBusy(row.slotId, row.id) || !hasGameTab || !teamFor(row.slotId)"
                @click="startNext(row.slotId)"
              >
                {{ pending?.expeditionId === row.id ? 'Awaiting confirmation…' : 'Auto select & start' }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
