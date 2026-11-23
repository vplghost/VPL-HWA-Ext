<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { formatNumber } from '@/src/utils/formatters';
import { getHeroAvatar } from '@/src/data/heroMetadata';
import { resolveHeroName, formatMarchDuration } from '@/src/utils/marchTooltip';
import { dashboardMarches } from '@/src/utils/dashboardState';
import { getTroopType, normalizeArray } from '@/src/utils/troops';
import { RESOURCE_THEMES } from '@/src/utils/resourceData';

const props = defineProps<{
  modelValue: boolean;
  initialMarchId?: string | number | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { openModal } = useModals();

const now = ref(Date.now());
let timerInterval: any = null;

onMounted(() => {
  timerInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// Refresh marches on open
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      now.value = Date.now();
      void dispatchRpc([{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }]);
      if (props.initialMarchId != null) {
        selectedId.value = String(props.initialMarchId);
      }
    }
  }
);

watch(
  () => props.initialMarchId,
  (id) => {
    if (id != null) {
      selectedId.value = String(id);
    }
  }
);

// All active marches
const marchesList = computed(() => dashboardMarches(cache.value, now.value));

const selectedId = ref<string>('');

// Ensure selectedId is valid
watch(
  [marchesList, () => props.modelValue],
  ([list, open]) => {
    if (!open) return;
    if (list.length === 0) {
      selectedId.value = '';
      return;
    }
    const exists = list.some((m) => String(m.id) === String(selectedId.value));
    if (!exists) {
      selectedId.value = String(list[0].id);
    }
  },
  { immediate: true }
);

// Active selected march item
const activeItem = computed(() => {
  if (!marchesList.value.length) return null;
  return marchesList.value.find((m) => String(m.id) === String(selectedId.value)) || marchesList.value[0];
});

const activeMarch = computed(() => activeItem.value?.march);

// Account ID for leader checks
const currentAccountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);

// Heroes details in selected march
const squadHeroes = computed(() => {
  const m = activeMarch.value;
  if (!m) return [];

  let heroIds: number[] = [];
  const teamHeroIds = normalizeArray(m?.team?.heroIds);
  const rallyHeroIds = normalizeArray(m?.rally?.team?.heroIds);

  if (teamHeroIds.length > 0) {
    heroIds = teamHeroIds;
  } else if (rallyHeroIds.length > 0) {
    heroIds = rallyHeroIds;
  } else if (m?.squadId && cache.value) {
    const rawSquads =
      cache.value['getUnitSummary:unit']?.data?.squads ||
      cache.value.inventoryGet?.data?.unit?.squads ||
      cache.value['user_getUnitSummary']?.data?.squads;
    const squads = normalizeArray(rawSquads);
    const matchedSquad = squads.find((s: any) => s?.id === m.squadId);
    if (matchedSquad) {
      const heroes = normalizeArray(matchedSquad.heroes);
      heroIds = heroes.map((h: any) => Number(h?.id ?? h?.heroId)).filter(Boolean);
    }
  }

  const heroesData = cache.value.heroGetAll?.data || {};

  return heroIds.map((id) => {
    const heroInfo = heroesData[id] || {};
    return {
      id,
      name: resolveHeroName(id),
      avatar: getHeroAvatar(id),
      level: heroInfo.level || 1,
      star: heroInfo.star || 1,
      power: heroInfo.power || 0,
      color: heroInfo.color || 1,
    };
  });
});

// Total hero squad power
const totalSquadPower = computed(() => {
  return squadHeroes.value.reduce((sum, h) => sum + (Number(h.power) || 0), 0);
});

// Troop unit type mappings
const TROOP_TYPE_INFO: Record<number, { name: string; icon: string; badgeClass: string }> = {
  0: { name: 'Infantry', icon: '🛡️', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  1: { name: 'Spearmen', icon: '🗡️', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
  2: { name: 'Marksmen', icon: '🏹', badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' },
};

// Troop units breakdown
const squadTroops = computed(() => {
  const m = activeMarch.value;
  if (!m) return [];

  let rawUnits: Array<{ unitId: number; count: number; survived?: number; wounded?: number }> = [];

  const teamUnits = normalizeArray(m?.team?.units);
  const rallyUnits = normalizeArray(m?.rally?.team?.units);

  if (teamUnits.length > 0) {
    rawUnits = teamUnits.map((u: any) => ({
      unitId: Number(u?.id ?? u?.unitId),
      count: Number(u?.count ?? u?.state?.survived ?? 0),
    }));
  } else if (rallyUnits.length > 0) {
    rawUnits = rallyUnits.map((u: any) => ({
      unitId: Number(u?.id ?? u?.unitId),
      count: Number(u?.count ?? u?.state?.survived ?? 0),
    }));
  } else if (m?.squadId && cache.value) {
    const rawSquads =
      cache.value['getUnitSummary:unit']?.data?.squads ||
      cache.value.inventoryGet?.data?.unit?.squads ||
      cache.value['user_getUnitSummary']?.data?.squads;
    const squads = normalizeArray(rawSquads);
    const matchedSquad = squads.find((s: any) => s?.id === m.squadId);
    if (matchedSquad) {
      const units = normalizeArray(matchedSquad.units);
      rawUnits = units.map((u: any) => ({
        unitId: Number(u?.id ?? u?.unitId),
        count: Number(u?.state?.survived ?? u?.count ?? 0),
      }));
    }
  }

  return rawUnits
    .filter((u) => u.count > 0 && Number.isFinite(u.unitId))
    .map((u) => {
      const typeInfo = getTroopType(u.unitId);
      const meta = typeInfo ? TROOP_TYPE_INFO[typeInfo.type] : { name: 'Unit', icon: '⚔️', badgeClass: 'bg-slate-100 text-slate-700' };
      const level = typeInfo?.level ?? (u.unitId % 10);
      return {
        unitId: u.unitId,
        typeName: meta.name,
        icon: meta.icon,
        badgeClass: meta.badgeClass,
        level,
        count: u.count,
      };
    })
    .sort((a, b) => b.level - a.level || a.typeName.localeCompare(b.typeName));
});

const totalTroopsCount = computed(() => {
  return squadTroops.value.reduce((sum, u) => sum + u.count, 0);
});

// March status and timing
const marchTiming = computed(() => {
  const item = activeItem.value;
  const m = activeMarch.value;
  if (!item || !m) return null;

  const isReturning = m.kind === 'return' || m.stage === 'returnToOutpost';
  const arrival = m.targetArrivalAt ?? m.rally?.arrivalAt;
  const waiting = m.stage === 'waitingForRallyStart' || (m.rally?.waitUntil > now.value);
  const fighting = !isReturning && !waiting && (['battle', 'battleInRally'].includes(m.stage) ||
    (['monster', 'raid'].includes(item.category) && Number.isFinite(arrival) && arrival <= now.value));

  const end = isReturning ? m.endsAt ?? m.returnAt ?? m.rally?.returnAt
    : waiting ? m.rally?.waitUntil ?? m.endsAt
    : m.targetArrivalAt ?? m.endsAt;

  const remainingMs = Number.isFinite(end) ? Math.max(0, end - now.value) : null;
  const durationText = remainingMs !== null ? formatMarchDuration(remainingMs) : item.timerText;

  return {
    isReturning,
    isWaiting: waiting,
    isFighting: fighting,
    end,
    remainingMs,
    durationText,
  };
});

// Recall capability
const isRecalling = ref(false);
const recallFeedback = ref<string | null>(null);

const recallability = computed<{ canRecall: boolean; reason: string }>(() => {
  const m = activeMarch.value;
  const item = activeItem.value;
  if (!m || !item) return { canRecall: false, reason: 'No active march' };

  if (marchTiming.value?.isReturning) {
    return { canRecall: false, reason: 'March is already returning to outpost' };
  }
  if (marchTiming.value?.isFighting) {
    return { canRecall: false, reason: 'Squad is currently engaged in combat' };
  }

  // Gathering can be recalled via stopMineGathering
  if (item.category === 'gather' || Boolean(m.mineId)) {
    return { canRecall: true, reason: 'Recall gathering squad back to outpost' };
  }

  // Rally leader can cancel rally during preparation
  if (item.category === 'raid' && m.rally) {
    const isLeader =
      (m.rally.leader?.userId && currentAccountId.value && String(m.rally.leader.userId) === String(currentAccountId.value)) ||
      (m.rally.leaderName && cache.value.userGetInfo?.data?.name === m.rally.leaderName);
    if (isLeader && marchTiming.value?.isWaiting) {
      return { canRecall: true, reason: 'Cancel prepared rally before departure' };
    }
    return { canRecall: false, reason: 'Only the rally leader can cancel before departure' };
  }

  return { canRecall: false, reason: 'This march cannot be recalled' };
});

async function handleRecall() {
  const m = activeMarch.value;
  const item = activeItem.value;
  if (!m || !recallability.value.canRecall || isRecalling.value) return;

  isRecalling.value = true;
  recallFeedback.value = null;

  try {
    if (item?.category === 'gather' || Boolean(m.mineId)) {
      const squadId = m.squadId || m.id;
      if (!squadId) throw new Error('Missing squadId for recall');
      const res = await dispatchRpc([
        { name: 'stopMineGathering', feature: 'mine', args: { squadId } },
        { name: 'getMarches', feature: 'march' },
      ]);
      if (res?.ok === false) {
        recallFeedback.value = `Recall failed: ${res.error || 'Server rejected call'}`;
      } else {
        recallFeedback.value = 'Squad recalled successfully! Returning to outpost.';
      }
    } else if (item?.category === 'raid' && m.rally?.id) {
      const res = await dispatchRpc([
        { name: 'cancelRally', feature: 'rally', args: { rallyId: m.rally.id } },
        { name: 'getMarches', feature: 'march' },
      ]);
      if (res?.ok === false) {
        recallFeedback.value = `Cancel rally failed: ${res.error || 'Server rejected call'}`;
      } else {
        recallFeedback.value = 'Rally cancelled successfully.';
      }
    }
  } catch (err: any) {
    recallFeedback.value = `Error: ${err?.message || String(err)}`;
  } finally {
    isRecalling.value = false;
  }
}

// Quick action to open dedicated automation modal
function openAutomationModal() {
  const item = activeItem.value;
  if (!item) return;
  if (item.category === 'raid') openModal('raid');
  else if (item.category === 'gather') openModal('gathering');
  else if (item.category === 'monster') openModal('monster');
}
</script>

<template>
  <ModalDialog
    id="march-detail-dialog"
    :model-value="modelValue"
    title="March Details"
    icon="🚩"
    max-width="max-w-3xl"
    modal-name="marchDetail"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-4 p-4 text-slate-800 dark:text-slate-100 max-h-[75vh] overflow-y-auto">
      <!-- 1. Top March Tabs / Pills Switcher -->
      <div id="march-detail-tabs" class="flex flex-col gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
          <span>Active Squad Marches ({{ marchesList.length }})</span>
          <span class="text-[11px]">Select a march to view details</span>
        </div>

        <div v-if="marchesList.length === 0" class="py-6 text-center text-xs text-slate-400">
          No active squad marches outside city. All squads are stationed at base.
        </div>

        <!-- Marches Pill Container -->
        <div v-else class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            v-for="m in marchesList"
            :key="m.id"
            type="button"
            class="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer"
            :class="
              String(m.id) === String(selectedId)
                ? 'bg-blue-50 text-blue-700 border-blue-400 ring-2 ring-blue-400/30 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
            "
            @click="selectedId = String(m.id)"
          >
            <span class="text-base">{{ m.icon }}</span>
            <div class="flex flex-col text-left max-w-[120px]">
              <span class="truncate font-bold">{{ m.target || m.title }}</span>
              <span class="text-[10px] font-mono font-normal opacity-80 tabular-nums">
                {{ m.timerText }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- 2. Main Content for Selected March -->
      <div v-if="activeItem && activeMarch" id="march-detail-content" class="flex flex-col gap-4">
        <!-- March Status & Overview Card -->
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 flex flex-col gap-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                {{ activeItem.icon }}
              </span>
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <h4 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {{ activeItem.target }}
                  </h4>
                  <span
                    id="march-detail-status"
                    class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase"
                    :class="
                      marchTiming?.isFighting
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                        : marchTiming?.isReturning
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          : marchTiming?.isWaiting
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                            : activeItem.category === 'gather'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                    "
                  >
                    {{ activeItem.stage }}
                  </span>
                </div>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {{ activeItem.title }} · Squad ID: {{ activeMarch.squadId || activeMarch.id || 'N/A' }}
                </span>
              </div>
            </div>

            <!-- Timer Badge -->
            <div id="march-detail-timer" class="text-right flex flex-col items-end">
              <span class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs tabular-nums">
                ⏱️ {{ marchTiming?.durationText || activeItem.timerText }}
              </span>
              <span v-if="marchTiming?.end" class="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                Ends: {{ new Date(marchTiming.end).toLocaleTimeString() }}
              </span>
            </div>
          </div>

          <!-- Gathering Progress Bar (if gathering) -->
          <div v-if="activeItem.gathering && activeItem.gathering.progress != null" class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span class="font-medium flex items-center gap-1">
                <span>{{ RESOURCE_THEMES[activeItem.gathering.type]?.icon || '⛏️' }}</span>
                Resource Harvested
              </span>
              <span class="font-mono tabular-nums font-semibold">
                {{ formatNumber(activeItem.gathering.collected || 0) }} / {{ formatNumber(activeItem.gathering.total || 0) }}
                ({{ activeItem.gathering.progress }}%)
              </span>
            </div>
            <div
              class="w-full h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700"
              role="progressbar"
              :aria-valuenow="activeItem.gathering.progress"
              :aria-valuemin="0"
              :aria-valuemax="100"
            >
              <div
                class="h-full transition-all duration-300"
                :class="
                  activeItem.gathering.type === 'food'
                    ? 'bg-lime-500'
                    : activeItem.gathering.type === 'wood'
                      ? 'bg-emerald-500'
                      : activeItem.gathering.type === 'stone'
                        ? 'bg-slate-400'
                        : activeItem.gathering.type === 'iron'
                          ? 'bg-cyan-500'
                          : 'bg-teal-500'
                "
                :style="{ width: `${Math.min(100, Math.max(0, activeItem.gathering.progress))}%` }"
              />
            </div>
          </div>
        </div>

        <!-- 3. Deployed Heroes Section -->
        <div id="march-detail-heroes" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h5 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
              <span>👥</span> Squad Heroes ({{ squadHeroes.length }}/5)
            </h5>
            <span v-if="totalSquadPower > 0" class="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
              ⚡ Power: {{ formatNumber(totalSquadPower) }}
            </span>
          </div>

          <div v-if="squadHeroes.length === 0" class="text-xs text-slate-400 italic py-2">
            No hero data associated with this march snapshot.
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div
              v-for="h in squadHeroes"
              :key="h.id"
              class="flex flex-col items-center p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-center shadow-2xs"
            >
              <div class="relative size-12 mb-1.5 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                <img
                  v-if="h.avatar"
                  :src="h.avatar"
                  :alt="h.name"
                  class="size-full object-cover"
                />
                <span v-else class="size-full flex items-center justify-center text-xl">👤</span>
                <span class="absolute bottom-0 right-0 px-1 text-[9px] font-bold font-mono bg-slate-900/80 text-white rounded-tl">
                  {{ h.level }}
                </span>
              </div>
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate w-full" :title="h.name">
                {{ h.name }}
              </span>
              <span class="text-[10px] text-amber-500 font-medium">
                {{ '★'.repeat(Math.min(6, h.star)) }}
              </span>
              <span class="text-[10px] font-mono text-slate-400 tabular-nums">
                {{ formatNumber(h.power) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 4. Troops Breakdown Section -->
        <div id="march-detail-troops" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h5 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
              <span>🛡️</span> Troop Composition
            </h5>
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
              Total Troops: <strong class="text-blue-600 dark:text-blue-400">{{ formatNumber(totalTroopsCount) }}</strong>
            </span>
          </div>

          <div v-if="squadTroops.length === 0" class="text-xs text-slate-400 italic py-2">
            No troop units deployed in this squad.
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div
              v-for="troop in squadTroops"
              :key="troop.unitId"
              class="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-2xs"
            >
              <div class="flex items-center gap-2">
                <span class="text-lg p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  {{ troop.icon }}
                </span>
                <div class="flex flex-col">
                  <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {{ troop.typeName }}
                  </span>
                  <span class="text-[10px] font-semibold text-slate-400">
                    Tier {{ troop.level }} (ID: {{ troop.unitId }})
                  </span>
                </div>
              </div>

              <div class="text-right">
                <span class="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {{ formatNumber(troop.count) }}
                </span>
                <span class="block text-[9px] text-slate-400 tabular-nums">
                  {{ totalTroopsCount > 0 ? Math.round(troop.count / totalTroopsCount * 100) : 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Recall / Cancel Action Section -->
        <div class="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                id="march-recall-btn"
                type="button"
                class="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                :class="
                  recallability.canRecall
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer hover:shadow-md'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-75'
                "
                :disabled="!recallability.canRecall || isRecalling"
                @click="handleRecall"
              >
                <span v-if="isRecalling" class="animate-spin">🔄</span>
                <span v-else>↩️</span>
                {{ isRecalling ? 'Processing...' : activeItem.category === 'gather' ? 'Recall Gathering Squad' : 'Cancel March' }}
              </button>

              <button
                type="button"
                class="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                @click="openAutomationModal"
              >
                ⚙️ Open {{ activeItem.category === 'raid' ? 'Raid' : activeItem.category === 'gather' ? 'Gathering' : 'Monster' }} Dialog
              </button>
            </div>

            <span class="text-xs text-slate-400 dark:text-slate-500 italic max-w-xs text-right">
              {{ recallability.reason }}
            </span>
          </div>

          <!-- Feedback Toast/Message -->
          <div
            v-if="recallFeedback"
            class="text-xs p-2.5 rounded-lg border font-medium"
            :class="
              recallFeedback.includes('failed') || recallFeedback.includes('Error')
                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
            "
          >
            {{ recallFeedback }}
          </div>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
