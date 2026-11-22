<script setup lang="ts">
import UnitStars from '@/src/components/common/UnitStars.vue';
import DungeonSimModal from '@/src/components/dialogs/DungeonSimModal.vue';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  isTopModal,
  registerModalOpen,
  registerModalClose,
  getModalStackLevel,
} from '@/src/composables/useModals';
import { getTitanMetadata } from '@/src/utils/metadata';
import { normalizeArray } from '@/src/utils/troops';
import { formatNumber } from '@/src/utils/formatters';
import { getEffectiveTitanStates } from '@/src/services/queues/dungeonAutomation';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { executeDungeonAutomationStep } from '@/src/services/queues/dungeonAutomationRunner';
import { DUNGEON_SAVED_LINEUPS_KEY } from '@/src/utils/dungeonBattleSim';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc, updateCacheLocally } = useRpcCache();

const isRefreshing = ref(false);

const dungeonData = computed(() => {
  return cache.value.dungeonStatus?.data || cache.value.dungeonGetInfo?.data || {};
});

const floorNumber = computed(() => {
  const d = dungeonData.value;
  return d.floorNumber || (d.maxFloorPassed ? d.maxFloorPassed + 1 : 1);
});

const floorType = computed(() => dungeonData.value.floorType || '');

const todayTitanite = computed(() => {
  const d = dungeonData.value;
  if (Number.isFinite(d.todayTitanite)) return d.todayTitanite;
  if (Number.isFinite(d.dailyCombatLog?.todayTitanite)) return d.dailyCombatLog.todayTitanite;
  const quests = cache.value.questGetAll?.data;
  if (quests) {
    const q = (Array.isArray(quests) ? quests.find((item: any) => [10031, 10032, 10108].includes(Number(item?.id))) : null) ||
              quests[10031] || quests[10032] || quests[10108];
    if (q && Number.isFinite(Number(q.progress))) return Number(q.progress);
  }
  const dailyQuests = cache.value['getDailyQuests:quest']?.data?.events;
  if (dailyQuests) {
    const q = (Array.isArray(dailyQuests) ? dailyQuests.find((item: any) => [10031, 10032, 10108].includes(Number(item?.id))) : null) ||
              dailyQuests[10031] || dailyQuests[10032] || dailyQuests[10108];
    if (q && Number.isFinite(Number(q.progress))) return Number(q.progress);
  }
  return 0;
});

const activeBattle = computed(() => dungeonData.value.activeBattle || null);
const activeDoorIdx = computed(() => Number(activeBattle.value?.teamNum ?? 0) + 1);
const activeHeroes = computed<number[]>(() => {
  return Array.isArray(activeBattle.value?.heroes) ? activeBattle.value.heroes : [];
});

const lastBattleResult = computed(() => dungeonData.value.lastBattleResult || null);

const elements = computed(() => dungeonData.value.elements || {});
const primeElement = computed(() => {
  const p = elements.value.prime;
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'None';
});
const nonPrimeElements = computed(() => {
  const np = elements.value.nonprime;
  if (Array.isArray(np) && np.length > 0) {
    return np.map((e: string) => e.charAt(0).toUpperCase() + e.slice(1)).join(', ');
  }
  return 'None';
});

const combatLog = computed(() => {
  return dungeonData.value.dailyCombatLog || { flawlessCount: 0, totalBattles: 0, casualtyBattles: [] };
});
const totalBattles = computed(() => combatLog.value.totalBattles || 0);
const flawlessBattles = computed(() => combatLog.value.flawlessCount || 0);
const casualtiesList = computed<any[]>(() => {
  return Array.isArray(combatLog.value.casualtyBattles) ? combatLog.value.casualtyBattles : [];
});

const doors = computed<any[]>(() => {
  const rawDoors = dungeonData.value.currentFloorDoors || dungeonData.value.floor?.userData || [];
  return normalizeArray(rawDoors).filter((door: any) => door && typeof door === 'object')
    .map((door: any) => {
      const enemies = normalizeArray(door.team ?? door.enemies).map((unit: any) => {
        const rawId = unit && typeof unit === 'object' ? unit.id : unit;
        const id = typeof rawId === 'number' || typeof rawId === 'string' ? Number(rawId) : NaN;
        if (!Number.isInteger(id) || id <= 0) return null;
        const meta = getTitanMetadata(id);
        const level = unit?.level != null && Number.isInteger(Number(unit.level)) && Number(unit.level) >= 0
          ? Number(unit.level) : null;
        const star = unit?.star != null && Number.isInteger(Number(unit.star)) && Number(unit.star) >= 0
          ? Number(unit.star) : null;
        return { id, name: meta?.name || `Titan ${id}`, element: meta?.element || '',
          avatar: meta?.hasAvatar ? meta.avatarFile || `assets/titans/${id}.png` : null, level, star };
      }).filter(Boolean);

      return {
        ...door,
        enemies,
      };
    });
});

const effectiveTitanStates = computed(() => {
  return getEffectiveTitanStates(cache.value);
});

const titanEntries = computed(() => {
  const states = effectiveTitanStates.value;
  return Object.entries(states).map(([id, state]: [string, any]) => {
    const meta = getTitanMetadata(id);
    const maxHp = state.maxHp || 1;
    const hp = Math.max(0, state.hp || 0);
    const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));
    const energy = Math.max(0, state.energy || 0);
    const energyPct = Math.min(100, Math.round((energy / 1000) * 100));
    const isDead = state.isDead === true || hp <= 0;

    return {
      id,
      name: meta?.name || `Titan ${id}`,
      element: meta?.element || '',
      hp,
      maxHp,
      hpPct,
      energy,
      energyPct,
      isDead,
    };
  }).sort((a, b) => {
    if (a.isDead !== b.isDead) return a.isDead ? 1 : -1;
    return Number(a.id) - Number(b.id);
  });
});

const stackLevel = computed(() => getModalStackLevel('dungeon'));

// Interactive Simulation Dialog state
const isSimModalOpen = ref(false);
const activeSimDoor = ref<any>(null);
const activeSimDoorIdx = ref(0);

function openSimModal(door: any, idx: number) {
  activeSimDoor.value = door;
  activeSimDoorIdx.value = idx;
  isSimModalOpen.value = true;
}

function handleSimBattleSubmitted() {
  refreshDungeon();
}

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (!isTopModal('dungeon')) return;
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      registerModalOpen('dungeon');
      document.addEventListener('keydown', handleKeydown);
    } else {
      registerModalClose('dungeon');
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onMounted(() => {
  if (props.modelValue) {
    registerModalOpen('dungeon');
    document.addEventListener('keydown', handleKeydown);
  }
});

onUnmounted(() => {
  registerModalClose('dungeon');
  document.removeEventListener('keydown', handleKeydown);
});

async function refreshDungeon() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'dungeonGetInfo' }]);
  } finally {
    setTimeout(() => {
      isRefreshing.value = false;
    }, 500);
  }
}

async function resetActiveBattle() {
  // Clear the stale popup view only; the background owns persistent RPC state.
  await updateCacheLocally((draft) => {
    if (draft.dungeonStatus?.data) draft.dungeonStatus.data.activeBattle = null;
  });
  await refreshDungeon();
}

const { customTeams } = useAccountTeams();
const isAutomating = ref(false);
const autoStopRequested = ref(false);
const autoStatusMessage = ref<string | null>(null);
const autoFloorCount = ref(0);

async function startAutomation() {
  if (isAutomating.value) return;
  isAutomating.value = true;
  autoStopRequested.value = false;
  autoStatusMessage.value = 'Automation started. Simulating doors...';
  autoFloorCount.value = 0;

  // Load persistent saved lineups
  let savedLineups: Record<string, number[]> = {};
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const res = await chrome.storage.local.get(DUNGEON_SAVED_LINEUPS_KEY);
      if (res?.[DUNGEON_SAVED_LINEUPS_KEY]) {
        savedLineups = res[DUNGEON_SAVED_LINEUPS_KEY];
      }
    } catch (_) {}
  }

  try {
    while (isAutomating.value && !autoStopRequested.value) {
      const step = await executeDungeonAutomationStep({
        cache,
        dispatchRpc,
        savedLineups,
        customTeams: customTeams.value,
        safetyThresholdPct: 20,
      });

      if (step.stopped) {
        autoStatusMessage.value = step.stopReason || 'Automation stopped.';
        break;
      }

      autoFloorCount.value++;
      const chosen = step.chosenEvaluation;
      const tankLoss = chosen?.tankLossPct != null ? chosen.tankLossPct.toFixed(1) : '0';
      const teamLoss = chosen?.teamLossPct != null ? chosen.teamLossPct.toFixed(1) : '0';
      autoStatusMessage.value = `Floor ${step.floorPassed} cleared via Door ${(step.doorIdx ?? 0) + 1} (${step.doorElement}). Tank loss: ${tankLoss}%, Team loss: ${teamLoss}%.`;

      // Brief delay between floors to avoid rapid-fire RPC and give UI time to reflect state
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  } catch (err: any) {
    autoStatusMessage.value = `Automation error: ${err.message || String(err)}`;
  } finally {
    isAutomating.value = false;
  }
}

function stopAutomation() {
  autoStopRequested.value = true;
  isAutomating.value = false;
  autoStatusMessage.value = 'Automation stopped by user.';
}

function getTitanName(id: number | string): string {
  const meta = getTitanMetadata(id);
  return meta?.name || `Titan ${id}`;
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target) target.style.display = 'none';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="dungeon-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-modal-title"
      :style="{ zIndex: stackLevel }"
      class="fixed inset-0 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"

    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <h2 id="dungeon-modal-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
              Titan Dungeon
            </h2>
            <span
              id="dungeon-floor-badge"
              class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-700/50"
            >
              Floor {{ floorNumber }}{{ floorType ? ` · ${floorType}` : '' }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Automation Run/Stop Button -->
            <button
              v-if="!isAutomating"
              id="dungeon-auto-btn"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 active:scale-95 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-all"
              title="Start intelligent dungeon automation (picks safest door, stops if HP < 20%)"
              @click="startAutomation"
            >
              <span>⚡</span>
              <span class="dungeon-auto-label">Auto Attack</span>
            </button>
            <button
              v-else
              id="dungeon-stop-auto-btn"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-rose-500 bg-rose-600 hover:bg-rose-500 active:scale-95 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-all animate-pulse"
              title="Stop ongoing dungeon automation"
              @click="stopAutomation"
            >
              <span>🛑</span>
              <span>Stop Auto</span>
            </button>

            <!-- Refresh Button -->
            <button
              id="dungeon-refresh-btn"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 shadow-2xs"
              title="Refresh dungeon data from game (dungeonGetInfo)"
              @click="refreshDungeon"
            >
              <svg
                class="size-3.5 text-slate-500 dark:text-slate-400 shrink-0"
                :class="{ 'animate-spin': isRefreshing }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span class="dungeon-refresh-label">{{ isRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
            </button>

            <!-- Close Button -->
            <button
              id="dungeon-modal-close"
              type="button"
              class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close dialog"
              @click="close"
            >
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Modal Body -->
        <div id="dungeon-modal-body" class="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          <!-- Automation Status Banner -->
          <div
            v-if="autoStatusMessage"
            class="rounded-xl border p-3.5 space-y-1.5 transition-all text-xs"
            :class="
              isAutomating
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : autoStatusMessage.includes('stopped') || autoStatusMessage.includes('threshold') || autoStatusMessage.includes('below')
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
            "
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 font-bold">
                <span v-if="isAutomating" class="inline-flex size-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span>{{ isAutomating ? '⚡ Automation Running' : '🛑 Automation Info' }}</span>
                <span v-if="autoFloorCount > 0" class="rounded bg-white/70 dark:bg-slate-800/80 px-1.5 py-0.2 text-[10px] font-mono">
                  +{{ autoFloorCount }} floors passed
                </span>
              </div>
              <button
                v-if="!isAutomating"
                type="button"
                class="cursor-pointer text-[10px] opacity-70 hover:opacity-100"
                @click="autoStatusMessage = null"
              >
                ✕ Clear
              </button>
            </div>
            <p class="font-medium leading-relaxed">{{ autoStatusMessage }}</p>
          </div>

          <!-- Active Battle Banner -->
          <div
            v-if="activeBattle"
            class="rounded-xl border border-blue-400 bg-blue-50/90 p-4 space-y-2.5 dark:border-blue-600 dark:bg-blue-950/50 shadow-sm"
          >
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="relative flex size-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full size-3 bg-blue-600"></span>
                </span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">
                  ⚔️ Battle In Progress
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-blue-600 text-white px-2.5 py-0.5 text-xs font-bold shadow-xs">
                  Door {{ activeDoorIdx }}
                </span>
                <button
                  id="dungeon-clear-active-battle-btn"
                  type="button"
                  class="cursor-pointer inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:hover:bg-rose-900 transition-colors shadow-2xs"
                  title="Clear stuck battle and refresh dungeon from game"
                  @click="resetActiveBattle"
                >
                  Reset Battle
                </button>
              </div>
            </div>

            <div class="text-xs text-blue-800 dark:text-blue-200">
              Actively fighting on Floor {{ floorNumber }} · Door {{ activeDoorIdx }} with {{ activeHeroes.length }} titans deployed.
            </div>

            <div v-if="activeHeroes.length > 0" class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-blue-200/80 dark:border-blue-800/60">
              <span
                v-for="hId in activeHeroes"
                :key="hId"
                class="inline-flex items-center gap-1.5 rounded-lg bg-white/95 border border-blue-200 px-2 py-0.5 text-[11px] text-slate-800 shadow-2xs dark:bg-slate-900 dark:border-blue-800 dark:text-slate-200"
              >
                <img
                  :src="`assets/titans/${hId}.png`"
                  class="size-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  alt=""
                  @error="handleImgError"
                />
                <span>{{ getTitanName(hId) }}</span>
              </span>
            </div>
          </div>

          <!-- Last Battle Result -->
          <div
            v-else-if="lastBattleResult"
            class="rounded-xl border p-3 flex items-center justify-between text-xs shadow-2xs"
            :class="
              lastBattleResult.win !== false
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
            "
          >
            <div class="flex items-center gap-2">
              <span class="font-bold">{{ lastBattleResult.win !== false ? '🏆 Victory' : '❌ Defeat' }}</span>
              <span v-if="lastBattleResult.stars" class="text-amber-500 font-bold tracking-widest">
                {{ '★'.repeat(Math.min(3, lastBattleResult.stars)) }}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">Previous battle outcome</span>
            </div>
            <div class="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Floor {{ floorNumber }}
            </div>
          </div>

          <!-- SECTION 1: OVERVIEW STATS -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Current Floor</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">Floor {{ floorNumber }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">In progress</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Personal Titanite</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(todayTitanite) }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Earned today</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Checkpoint</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">Floor {{ dungeonData.respawnFloor || 0 }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Respawn point</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Guild Activity</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(dungeonData.dungeonActivity ?? 0) }} pts</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Dungeon score</div>
            </div>
          </div>

          <!-- SECTION 2: ELEMENT AFFINITIES -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
              Element Affinities
            </h3>
            <div class="flex items-center gap-4 flex-wrap text-sm">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Prime Element:</span>
                <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60">
                  🌟 {{ primeElement }}
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Non-Prime Elements:</span>
                <span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:border dark:border-slate-600">
                  {{ nonPrimeElements }}
                </span>
              </div>
            </div>
          </div>

          <!-- SECTION 3: DAILY COMBAT LOG & TITAN CASUALTY TRACKING -->
          <div id="dungeon-combat-log-section" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>⚔️</span>
                <span>Daily Combat Log</span>
              </h3>
              <div class="flex items-center gap-2 text-xs">
                <span class="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Flawless: <strong id="dungeon-flawless-count" class="tabular-nums">{{ flawlessBattles }}</strong>
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  Total: <strong id="dungeon-total-battles" class="tabular-nums">{{ totalBattles }}</strong>
                </span>
              </div>
            </div>

            <!-- Casualty list -->
            <div v-if="casualtiesList.length > 0" id="dungeon-casualty-list" class="space-y-2">
              <div class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Battles With Casualties ({{ casualtiesList.length }})
              </div>
              <div
                v-for="(c, cIdx) in casualtiesList"
                :key="cIdx"
                class="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 dark:border-rose-900/60 dark:bg-rose-950/20 text-xs space-y-1.5"
              >
                <div class="flex items-center justify-between">
                  <span class="font-bold text-rose-900 dark:text-rose-200">
                    Floor {{ c.floor }} · Door {{ c.door }}
                  </span>
                  <span class="text-[10px] text-slate-500 font-mono">
                    {{ c.time || 'Today' }}
                  </span>
                </div>
                <div v-if="c.fallen && c.fallen.length" class="text-rose-700 dark:text-rose-300">
                  Fallen Titans: <strong>{{ c.fallen.join(', ') }}</strong>
                </div>
              </div>
            </div>

            <div v-else class="text-center p-3 text-slate-400 bg-slate-50/50 dark:bg-slate-800/40 rounded-lg text-xs">
              No titan casualties recorded today. All victories flawless!
            </div>
          </div>

          <!-- SECTION 4: CURRENT FLOOR DOORS -->
          <div v-if="doors.length > 0" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🚪</span>
                <span>Floor {{ floorNumber }} Doors</span>
              </h3>

              <span class="text-xs text-slate-500 dark:text-slate-400">{{ doors.length }} choices</span>
            </div>

            <div id="dungeon-doors-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="(door, idx) in doors"
                :key="idx"
                class="rounded-xl border p-3.5 space-y-2.5"
                :class="
                  activeBattle && activeBattle.teamNum === idx
                    ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-400 dark:border-blue-600 dark:bg-blue-950/40'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-700/70 dark:bg-slate-800/70'
                "
              >
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-slate-800 dark:text-slate-100">
                    Door {{ idx + 1 }}
                  </span>
                  <span v-if="door.power" class="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                    Power: {{ formatNumber(door.power) }}
                  </span>
                </div>

                <div class="space-y-2">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Enemy Titans
                  </div>
                  <ul v-if="door.enemies.length" class="space-y-1.5" :aria-label="`Door ${Number(idx) + 1} enemy Titans`">
                    <li
                      v-for="(enemy, eIdx) in door.enemies"
                      :key="`${enemy.id}:${eIdx}`"
                      class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/60"
                    >
                      <img
                        v-if="enemy.avatar"
                        :src="enemy.avatar"
                        alt=""
                        class="size-8 shrink-0 rounded-full object-cover"
                        @error="handleImgError"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="text-xs font-semibold text-slate-800 dark:text-slate-100">{{ enemy.name }}</div>
                        <div class="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 dark:text-slate-400">
                          <span v-if="enemy.element">{{ enemy.element }}</span>
                          <span v-if="enemy.level != null">Lv. {{ enemy.level }}</span>
                          <UnitStars v-if="enemy.star != null" :count="enemy.star" compact="suffix" />
                          <span class="font-mono">#{{ enemy.id }}</span>
                        </div>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="text-[11px] text-slate-400 dark:text-slate-500">Enemy Titan data unavailable.</p>
                </div>

                <!-- Door Actions: Interactive Simulation -->
                <div class="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap">
                  <!-- Interactive Simulation Button -->
                  <button
                    :id="`btn-door-sim-${idx}`"
                    type="button"
                    class="dungeon-door-sim-btn cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-indigo-600/30 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 dark:border-indigo-800 px-2.5 py-1 text-xs font-semibold shadow-2xs transition-all active:scale-95"
                    :title="`Simulate battle for Door ${Number(idx) + 1}`"
                    @click="openSimModal(door, idx)"
                  >
                    <span>🧪</span>
                    <span>Simulate</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500"
          >
            Floor doors will update when a new dungeon floor is unlocked in game.
          </div>

          <!-- SECTION 5: TITAN HEALTH & ENERGY STATUS -->
          <div v-if="titanEntries.length > 0" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Titan Health & Energy</span>
              </h3>
              <span class="text-xs text-slate-500 dark:text-slate-400">{{ titanEntries.length }} deployed titans</span>
            </div>

            <div id="dungeon-titan-roster" class="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 gap-2">
              <div
                v-for="t in titanEntries"
                :key="t.id"
                class="rounded-xl border p-2.5 space-y-1.5"
                :class="
                  t.isDead
                    ? 'border-rose-200 bg-rose-50/40 opacity-70 dark:border-rose-900/60 dark:bg-rose-950/30'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-700/70 dark:bg-slate-800/70'
                "
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <img
                      :src="`assets/titans/${t.id}.png`"
                      class="size-7 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      alt=""
                      @error="handleImgError"
                    />
                    <div class="min-w-0">
                      <div class="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {{ t.name }}
                      </div>
                      <span v-if="t.element" class="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.2 text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                        {{ t.element }}
                      </span>
                    </div>
                  </div>

                  <span
                    class="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    :class="
                      t.isDead
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/60'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60'
                    "
                  >
                    {{ t.isDead ? 'Fallen' : 'Alive' }}
                  </span>
                </div>

                <div class="space-y-1">
                  <div>
                    <div class="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 mb-0.5">
                      <span>HP</span>
                      <span class="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {{ formatNumber(t.hp) }} / {{ formatNumber(t.maxHp) }} ({{ t.hpPct }}%)
                      </span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        class="h-1.5 rounded-full"
                        :class="t.isDead ? 'bg-rose-500' : 'bg-emerald-500'"
                        :style="{ width: `${t.hpPct}%` }"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div class="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 mb-0.5">
                      <span>Energy</span>
                      <span class="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {{ formatNumber(t.energy) }} / 1,000 ({{ t.energyPct }}%)
                      </span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div class="bg-amber-400 h-1.5 rounded-full" :style="{ width: `${t.energyPct}%` }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactive Battle Simulation Modal (Model A) -->
    <DungeonSimModal
      v-model="isSimModalOpen"
      :door="activeSimDoor"
      :door-idx="activeSimDoorIdx"
      :floor-number="floorNumber"
      :titan-states="effectiveTitanStates"
      @battle-submitted="handleSimBattleSubmitted"
    />
  </Teleport>
</template>
