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
import { getTitanRole, titanMetadata } from '@/src/data/titanMetadata';
import { normalizeArray } from '@/src/utils/troops';
import { formatNumber } from '@/src/utils/formatters';
import { moveItemToFirst } from '@/src/utils/listReorder';
import { resolvePersonalTitaniteToday } from '@/src/utils/activityStats';
import { getEffectiveTitanStates } from '@/src/services/queues/dungeonAutomation';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { executeDungeonAutomationStep } from '@/src/services/queues/dungeonAutomationRunner';
import { DUNGEON_SAVED_LINEUPS_KEY, isTitanEligibleForDoor } from '@/src/utils/dungeonBattleSim';
import {
  DEFAULT_DUNGEON_AUTO_SETTINGS,
  DEFAULT_ORDERED_TITAN_POOLS,
  DEFAULT_SIM_ROUNDS,
  DEFAULT_SIM_ROUNDS_KEY,
  DUNGEON_AUTO_SETTINGS_KEY,
  DUNGEON_CLEARED_ROOMS_KEY,
  clampSimRounds,
  mergeClearedRoomEntry,
  formatDungeonElementName,
  type DungeonAutoSettings,
  type DungeonClearedRoomEntry,
  type DungeonElementKey,
} from '@/src/services/dungeonPlanner';

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

const todayTitanite = computed(() => resolvePersonalTitaniteToday(cache.value));

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
      hasKnownMaxHp: state.hasKnownMaxHp !== false,
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

function handleSimBattleSubmitted(entry?: DungeonClearedRoomEntry) {
  if (entry) {
    clearedRooms.value = mergeClearedRoomEntry(clearedRooms.value, entry);
    void saveClearedRooms();
  }
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
      hoveredLogEntry.value = null;
      registerModalClose('dungeon');
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

  onMounted(() => {
    void loadDungeonAutoSettings();
    void loadClearedRooms();
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

const activeAccountId = computed<string | number | undefined>(
  () => cache.value?.accountStatus?.data?.id ?? cache.value?.userGetInfo?.data?.id
);
const { customTeams } = useAccountTeams(activeAccountId);
const isAutomating = ref(false);
const autoStopRequested = ref(false);
const autoStatusMessage = ref<string | null>(null);
const autoFloorCount = ref(0);
const autoCheckpointsClaimed = ref(0);
const autoCheckpointGold = ref(0);
const showPoolConfig = ref(false);
const activePoolTab = ref<DungeonElementKey>('water');
const clearedRooms = ref<DungeonClearedRoomEntry[]>([]);
const hoveredLogEntry = ref<DungeonClearedRoomEntry | null>(null);
const hoverCardStyle = ref<Record<string, string>>({});

function showLogHoverCard(room: DungeonClearedRoomEntry, event?: Event) {
  hoveredLogEntry.value = room;
  const target = event?.currentTarget as HTMLElement | null;
  if (!target || typeof target.getBoundingClientRect !== 'function' || typeof window === 'undefined') {
    hoverCardStyle.value = { top: '16px', left: '16px' };
    return;
  }
  const rect = target.getBoundingClientRect();
  const cardWidth = Math.min(340, window.innerWidth - 24);
  const estHeight = 140;
  let left = rect.left + rect.width / 2 - cardWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12));
  const showAbove = rect.bottom + estHeight + 12 > window.innerHeight && rect.top > estHeight + 12;
  const top = showAbove ? Math.max(12, rect.top - estHeight - 8) : Math.min(window.innerHeight - estHeight - 12, rect.bottom + 8);
  hoverCardStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(cardWidth)}px`,
  };
}

function hideLogHoverCard() {
  hoveredLogEntry.value = null;
}

const POOL_TABS: Array<{ key: DungeonElementKey; label: string }> = [
  { key: 'water', label: 'Water' },
  { key: 'fire', label: 'Fire' },
  { key: 'earth', label: 'Earth' },
  { key: 'neutral', label: 'Neutral' },
];

const autoSettings = ref<DungeonAutoSettings>({
  ...DEFAULT_DUNGEON_AUTO_SETTINGS,
  orderedPools: {
    water: [...DEFAULT_ORDERED_TITAN_POOLS.water],
    earth: [...DEFAULT_ORDERED_TITAN_POOLS.earth],
    fire: [...DEFAULT_ORDERED_TITAN_POOLS.fire],
    neutral: [...DEFAULT_ORDERED_TITAN_POOLS.neutral],
  },
});

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadClearedRooms() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const res = await chrome.storage.local.get(DUNGEON_CLEARED_ROOMS_KEY);
      const saved = res?.[DUNGEON_CLEARED_ROOMS_KEY] as { dateKey?: string; rooms?: unknown[] } | undefined;
      if (saved && saved.dateKey === getTodayDateKey() && Array.isArray(saved.rooms)) {
        clearedRooms.value = saved.rooms
          .filter((r): r is DungeonClearedRoomEntry => Boolean(r && typeof r === 'object'))
          .map((r) => ({
            ...r,
            fallenTitans: Array.isArray(r.fallenTitans) ? r.fallenTitans.map(String) : [],
            teamIds: Array.isArray(r.teamIds) ? r.teamIds : undefined,
          }));
      } else {
        clearedRooms.value = [];
      }
    } catch (_) {}
  }
}

async function saveClearedRooms() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      await chrome.storage.local.set({
        [DUNGEON_CLEARED_ROOMS_KEY]: {
          dateKey: getTodayDateKey(),
          rooms: clearedRooms.value.slice(-100),
        },
      });
    } catch (_) {}
  }
}

const mergedCombatLogRooms = computed<DungeonClearedRoomEntry[]>(() => {
  let list: DungeonClearedRoomEntry[] = [...clearedRooms.value];
  for (const c of casualtiesList.value) {
    const floor = Number(c?.floor) || 0;
    const door = Number(c?.door) || 1;
    if (floor <= 0) continue;
    const fallen = Array.isArray(c?.fallen) ? c.fallen.map(String) : [];
    list = mergeClearedRoomEntry(list, {
      id: `casualty_${floor}_${door}`,
      floor,
      door,
      element: formatDungeonElementName(c?.element || c?.attackerType || 'neutral'),
      source: 'manual',
      win: true,
      stars: Math.max(1, 3 - fallen.length),
      casualties: fallen.length || 1,
      fallenTitans: fallen,
      timestamp: c?.time || 'Today',
    });
  }
  return list.sort((a, b) => a.floor - b.floor || a.door - b.door);
});

const totalCasualtyCount = computed(() => {
  return mergedCombatLogRooms.value.reduce((sum, r) => sum + (r.casualties > 0 ? 1 : 0), 0);
});

function getOrderedPoolIds(elemKey: DungeonElementKey): number[] {
  const configured = autoSettings.value.orderedPools?.[elemKey];
  const base = Array.isArray(configured) && configured.length > 0
    ? configured.map(Number)
    : [...DEFAULT_ORDERED_TITAN_POOLS[elemKey]];

  const states = effectiveTitanStates.value;
  const allEligibleIds = new Set<number>();
  for (const id of base) {
    if (isTitanEligibleForDoor(id, elemKey, titanMetadata[String(id)])) {
      allEligibleIds.add(id);
    }
  }
  for (const idStr of Object.keys(states)) {
    const id = Number(idStr);
    if (Number.isInteger(id) && id > 0 && isTitanEligibleForDoor(id, elemKey, titanMetadata[String(id)])) {
      allEligibleIds.add(id);
    }
  }
  return [...allEligibleIds];
}

const activePoolTitans = computed(() => {
  const elemKey = activePoolTab.value;
  const ids = getOrderedPoolIds(elemKey);
  const states = effectiveTitanStates.value;
  return ids.map((id, idx) => {
    const meta = getTitanMetadata(id);
    const st = states[String(id)];
    const maxHp = st?.maxHp || 1;
    const hp = st ? Math.max(0, st.hp || 0) : maxHp;
    const hpPct = st ? Math.min(100, Math.round((hp / maxHp) * 100)) : 100;
    const isDead = st ? (st.isDead === true || hp <= 0) : false;
    return {
      id,
      index: idx,
      name: meta?.name || `Titan ${id}`,
      element: meta?.element || '',
      role: getTitanRole(id),
      isTank: getTitanRole(id) === 'Tank',
      hpPct,
      isDead,
    };
  });
});

function movePoolTitan(titanId: number, delta: -1 | 1) {
  const elemKey = activePoolTab.value;
  const list = [...getOrderedPoolIds(elemKey)];
  const idx = list.indexOf(titanId);
  const targetIdx = idx + delta;
  if (idx === -1 || targetIdx < 0 || targetIdx >= list.length) return;
  const tmp = list[idx]!;
  list[idx] = list[targetIdx]!;
  list[targetIdx] = tmp;
  autoSettings.value = {
    ...autoSettings.value,
    orderedPools: {
      ...(autoSettings.value.orderedPools || {}),
      [elemKey]: list,
    },
  };
  void saveDungeonAutoSettings();
}

function movePoolTitanFirst(titanId: number) {
  const elemKey = activePoolTab.value;
  const list = getOrderedPoolIds(elemKey);
  const idx = list.indexOf(titanId);
  if (idx <= 0) return;
  autoSettings.value = {
    ...autoSettings.value,
    orderedPools: {
      ...(autoSettings.value.orderedPools || {}),
      [elemKey]: moveItemToFirst(list, idx),
    },
  };
  void saveDungeonAutoSettings();
}

function resetPoolOrder() {
  const elemKey = activePoolTab.value;
  autoSettings.value = {
    ...autoSettings.value,
    orderedPools: {
      ...(autoSettings.value.orderedPools || {}),
      [elemKey]: [...DEFAULT_ORDERED_TITAN_POOLS[elemKey]],
    },
  };
  void saveDungeonAutoSettings();
}

function getElementCardClasses(element: string, casualties: number): string {
  const norm = element.toLowerCase();
  if (casualties > 0) {
    return 'border-rose-300 bg-rose-50/80 text-rose-900 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-200';
  }
  if (norm === 'water') {
    return 'border-sky-200 bg-sky-50/80 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200';
  }
  if (norm === 'fire') {
    return 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (norm === 'earth') {
    return 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  return 'border-purple-200 bg-purple-50/80 text-purple-900 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-200';
}

function getElementShortTag(element: string): string {
  const norm = element.toLowerCase();
  if (norm === 'water') return 'W';
  if (norm === 'fire') return 'F';
  if (norm === 'earth') return 'E';
  return 'N';
}

function formatLogTime(ts: string): string {
  if (!ts) return '';
  if (/^\d{2}:\d{2}/.test(ts) || ts === 'Today') return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadDungeonAutoSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const res = await chrome.storage.local.get([DUNGEON_AUTO_SETTINGS_KEY, DEFAULT_SIM_ROUNDS_KEY]);
      const globalDefaultRounds = clampSimRounds(res?.[DEFAULT_SIM_ROUNDS_KEY], DEFAULT_SIM_ROUNDS);
      if (res?.[DUNGEON_AUTO_SETTINGS_KEY]) {
        const stored = res[DUNGEON_AUTO_SETTINGS_KEY];
        autoSettings.value = {
          ...DEFAULT_DUNGEON_AUTO_SETTINGS,
          ...stored,
          simRounds: clampSimRounds(stored.simRounds, globalDefaultRounds),
          orderedPools: {
            water: [...DEFAULT_ORDERED_TITAN_POOLS.water],
            earth: [...DEFAULT_ORDERED_TITAN_POOLS.earth],
            fire: [...DEFAULT_ORDERED_TITAN_POOLS.fire],
            neutral: [...DEFAULT_ORDERED_TITAN_POOLS.neutral],
            ...(stored.orderedPools || {}),
          },
        };
      } else {
        autoSettings.value = {
          ...autoSettings.value,
          simRounds: globalDefaultRounds,
        };
      }
    } catch (_) {}
  }
}

async function saveDungeonAutoSettings() {
  autoSettings.value.simRounds = clampSimRounds(autoSettings.value.simRounds, DEFAULT_SIM_ROUNDS);
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      await chrome.storage.local.set({ [DUNGEON_AUTO_SETTINGS_KEY]: { ...autoSettings.value } });
    } catch (_) {}
  }
}

async function startAutomation() {
  if (isAutomating.value) return;
  isAutomating.value = true;
  autoStopRequested.value = false;
  autoStatusMessage.value = 'Automation started. Evaluating floor...';
  autoFloorCount.value = 0;
  autoCheckpointsClaimed.value = 0;
  autoCheckpointGold.value = 0;

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
        orderedPools: autoSettings.value.orderedPools,
        safetyThresholdPct: autoSettings.value.safetyThresholdPct,
        tankSwitchHpPct: autoSettings.value.tankSwitchHpPct,
        targetTitanite: autoSettings.value.targetTitanite,
        todayTitanite: todayTitanite.value,
        singleDoorBestOf10: autoSettings.value.singleDoorBestOf10,
        simRounds: clampSimRounds(autoSettings.value.simRounds, DEFAULT_SIM_ROUNDS),
        allowCasualtyOnDepletedPool: autoSettings.value.allowCasualtyOnDepletedPool,
        shouldStop: () => autoStopRequested.value,
      });

      if (step.checkpointClaimed) {
        autoCheckpointsClaimed.value++;
        autoCheckpointGold.value += Number(step.checkpointGold) || 0;
      }

      if (step.clearedRoomEntry) {
        clearedRooms.value = mergeClearedRoomEntry(clearedRooms.value, step.clearedRoomEntry);
        void saveClearedRooms();
      }

      if (step.stopped) {
        autoStatusMessage.value = step.stopReason || 'Automation stopped.';
        const reasonLower = String(step.stopReason || '').toLowerCase();
        if (reasonLower.includes('no winnable') || reasonLower.includes('no surviving')) {
          void updateCacheLocally((draft) => {
            if (draft.dungeonStatus?.data) {
              draft.dungeonStatus.data.unwinnableFloor = floorNumber.value;
              draft.dungeonStatus.data.unwinnableDate = getTodayDateKey();
            }
          });
        }
        break;
      }

      autoFloorCount.value++;
      if (step.doorIdx != null) {
        const chosen = step.chosenEvaluation;
        const tankLoss = chosen?.tankLossPct != null ? chosen.tankLossPct.toFixed(1) : '0';
        const teamLoss = chosen?.teamLossPct != null ? chosen.teamLossPct.toFixed(1) : '0';
        const tankSwitchNote =
          step.switchedTankFrom && step.switchedTankTo
            ? ` · Switched tank: ${getTitanName(step.switchedTankFrom)} -> ${getTitanName(step.switchedTankTo)}`
            : '';
        const forceNote = step.forceMajeureUsed
          ? ` · Last-resort win (${step.casualties || 0} casualties)`
          : '';
        const best10Note = step.bestOfTenReport
          ? ` · Best-of-${step.bestOfTenReport.roundsRun} (#${step.bestOfTenReport.bestIndex + 1}/${step.bestOfTenReport.roundsRun}, ${step.bestOfTenReport.wins}/${step.bestOfTenReport.roundsRun} wins)`
          : '';
        const cpNote = step.checkpointClaimed
          ? ` · 5-floor reward claimed${step.checkpointGold ? ` (+${formatNumber(step.checkpointGold)} Gold)` : ''}`
          : '';
        autoStatusMessage.value = `Floor ${step.floorPassed} cleared via Door ${(step.doorIdx ?? 0) + 1} (${step.doorElement}). Tank loss: ${tankLoss}%, Team loss: ${teamLoss}%${tankSwitchNote}${forceNote}${best10Note}${cpNote}.`;
      } else {
        autoStatusMessage.value = step.stopReason || `Checkpoint reward claimed at Floor ${step.floorPassed}.`;
      }

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
        <div id="dungeon-modal-body" class="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          <!-- SECTION 1: FIXED DAILY OVERVIEW STATS -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Current Floor</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">Floor {{ floorNumber }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">In progress</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Personal Titanite</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(todayTitanite) }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Earned today</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Checkpoint</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">Floor {{ dungeonData.respawnFloor || 0 }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Respawn point</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Guild Activity</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(dungeonData.dungeonActivity ?? 0) }} pts</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Dungeon score</div>
            </div>
          </div>

          <!-- SECTION 2: COMPACT 1-LINE ELEMENT AFFINITIES (FIXED DAILY) -->
          <div
            id="dungeon-element-affinities"
            class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 flex items-center justify-between flex-wrap gap-2 dark:border-slate-800 dark:bg-slate-800/60"
          >
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Element Affinities
            </span>
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Prime:</span>
                <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60">
                  🌟 {{ primeElement }}
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Non-Prime:</span>
                <span class="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:border dark:border-slate-600">
                  {{ nonPrimeElements }}
                </span>
              </div>
            </div>
          </div>

          <!-- SECTION 3: AUTO ATTACK CONFIG & LINEUP -->
          <div
            id="dungeon-auto-config-bar"
            class="space-y-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[11px]"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                  <span>Target Titanite:</span>
                  <select
                    id="dungeon-target-titanite-select"
                    v-model.number="autoSettings.targetTitanite"
                    :disabled="isAutomating"
                    class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold"
                    @change="saveDungeonAutoSettings"
                  >
                    <option :value="75">75</option>
                    <option :value="150">150</option>
                    <option :value="300">300</option>
                    <option :value="0">Unlimited</option>
                  </select>
                </label>

                <label class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                  <span>Min HP:</span>
                  <select
                    id="dungeon-min-hp-select"
                    v-model.number="autoSettings.safetyThresholdPct"
                    :disabled="isAutomating"
                    class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold"
                    @change="saveDungeonAutoSettings"
                  >
                    <option :value="15">15%</option>
                    <option :value="20">20%</option>
                    <option :value="25">25%</option>
                    <option :value="35">35%</option>
                  </select>
                </label>

                <label
                  class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium"
                  title="Automatically rotate to the next healthy Tank in the room pool when the current Tank HP drops to or below this threshold"
                >
                  <span>Tank Switch:</span>
                  <select
                    id="dungeon-tank-switch-select"
                    v-model.number="autoSettings.tankSwitchHpPct"
                    :disabled="isAutomating"
                    class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold"
                    @change="saveDungeonAutoSettings"
                  >
                    <option :value="20">20%</option>
                    <option :value="30">30%</option>
                    <option :value="35">35%</option>
                    <option :value="45">45%</option>
                    <option :value="50">50%</option>
                  </select>
                </label>

                <label
                  class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium"
                  title="Number of Unity WASM simulation rounds per depleted/single-door evaluation (1-20)"
                >
                  <span>Sim Rounds:</span>
                  <input
                    id="dungeon-sim-rounds-input"
                    v-model.number="autoSettings.simRounds"
                    type="number"
                    min="1"
                    max="20"
                    :disabled="isAutomating"
                    class="w-12 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-center tabular-nums"
                    @change="saveDungeonAutoSettings"
                  />
                </label>
              </div>

              <button
                id="dungeon-pool-config-toggle"
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                @click="showPoolConfig = !showPoolConfig"
              >
                <span>📋 Pool Order</span>
                <span class="text-[9px]">{{ showPoolConfig ? '▲' : '▼' }}</span>
              </button>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
              <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300 font-medium">
                  <input
                    id="dungeon-best10-checkbox"
                    v-model="autoSettings.singleDoorBestOf10"
                    type="checkbox"
                    :disabled="isAutomating"
                    class="rounded border-slate-300 text-indigo-600"
                    @change="saveDungeonAutoSettings"
                  />
                  <span>Best-of-{{ autoSettings.simRounds || 5 }} (Single Door &le;5)</span>
                </label>

                <label
                  class="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300 font-medium"
                  title="When all available doors have <=5 alive titans, allow winning with minimum casualties instead of stopping; halt only if no door can win"
                >
                  <input
                    id="dungeon-force-majeure-checkbox"
                    v-model="autoSettings.allowCasualtyOnDepletedPool"
                    type="checkbox"
                    :disabled="isAutomating"
                    class="rounded border-slate-300 text-amber-600"
                    @change="saveDungeonAutoSettings"
                  />
                  <span>Allow Casualties if Pool &le;5</span>
                </label>
              </div>
              <span class="text-[10px] text-slate-400">Auto-claims 5-floor reward</span>
            </div>

            <!-- Collapsible Ordered Titan Pool Panel -->
            <div
              v-if="showPoolConfig"
              id="dungeon-pool-config-panel"
              class="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2"
            >
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-1">
                  <button
                    v-for="tab in POOL_TABS"
                    :key="tab.key"
                    :id="`dungeon-pool-tab-${tab.key}`"
                    type="button"
                    class="cursor-pointer px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors"
                    :class="
                      activePoolTab === tab.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    "
                    @click="activePoolTab = tab.key"
                  >
                    {{ tab.label }}
                  </button>
                </div>

                <button
                  id="dungeon-pool-reset-btn"
                  type="button"
                  :disabled="isAutomating"
                  class="cursor-pointer text-[10px] font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 disabled:opacity-50"
                  @click="resetPoolOrder"
                >
                  Reset Default
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="(pt, pIdx) in activePoolTitans"
                  :key="pt.id"
                  class="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 bg-white dark:bg-slate-900/70"
                  :class="
                    pt.isDead
                      ? 'border-rose-200/70 dark:border-rose-900/60 opacity-60'
                      : 'border-slate-200 dark:border-slate-700/80'
                  "
                >
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-4 text-[10px] font-mono font-bold text-slate-400">{{ pIdx + 1 }}.</span>
                    <img
                      :src="`assets/titans/${pt.id}.png`"
                      class="size-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      alt=""
                      @error="handleImgError"
                    />
                    <span class="font-semibold text-slate-800 dark:text-slate-100 truncate">{{ pt.name }}</span>
                    <span
                      v-if="pt.isTank"
                      class="px-1 rounded text-[9px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300"
                    >
                      Tank
                    </span>
                    <span
                      class="text-[10px] font-mono"
                      :class="pt.isDead ? 'text-rose-600 font-bold' : pt.hpPct <= autoSettings.tankSwitchHpPct ? 'text-amber-600' : 'text-emerald-600'"
                    >
                      {{ pt.isDead ? 'Fallen' : `${pt.hpPct}%` }}
                    </span>
                  </div>

                  <div class="flex items-center gap-0.5 shrink-0">
                    <button
                      :id="`dungeon-pool-move-first-${pt.id}`"
                      type="button"
                      :disabled="isAutomating || pIdx === 0"
                      class="cursor-pointer px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold"
                      title="Move to first"
                      aria-label="Move to first"
                      @click="movePoolTitanFirst(pt.id)"
                    >
                      ⤒
                    </button>
                    <button
                      :id="`dungeon-pool-move-up-${pt.id}`"
                      type="button"
                      :disabled="isAutomating || pIdx === 0"
                      class="cursor-pointer px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold"
                      title="Move up"
                      @click="movePoolTitan(pt.id, -1)"
                    >
                      ↑
                    </button>
                    <button
                      :id="`dungeon-pool-move-down-${pt.id}`"
                      type="button"
                      :disabled="isAutomating || pIdx === activePoolTitans.length - 1"
                      class="cursor-pointer px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold"
                      title="Move down"
                      @click="movePoolTitan(pt.id, 1)"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 4: BATTLE STATUS, ACTIVE TEAM & AUTOMATION OUTCOME SLOT -->
          <div id="dungeon-battle-status-slot" class="space-y-2">
            <!-- Active Battle Banner -->
            <div
              v-if="activeBattle"
              class="rounded-xl border border-blue-400 bg-blue-50/90 px-3 py-2.5 space-y-2 dark:border-blue-600 dark:bg-blue-950/50 shadow-sm"
            >
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="relative flex size-2.5">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full size-2.5 bg-blue-600"></span>
                  </span>
                  <span class="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">
                    ⚔️ Battle In Progress · Floor {{ floorNumber }} · Door {{ activeDoorIdx }}
                  </span>
                </div>
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

              <div v-if="activeHeroes.length > 0" class="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-blue-200/80 dark:border-blue-800/60">
                <span
                  v-for="hId in activeHeroes"
                  :key="hId"
                  class="inline-flex items-center gap-1 rounded-lg bg-white/95 border border-blue-200 px-2 py-0.5 text-[11px] text-slate-800 shadow-2xs dark:bg-slate-900 dark:border-blue-800 dark:text-slate-200"
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
              class="rounded-xl border px-3 py-2 flex items-center justify-between text-xs shadow-2xs"
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

            <!-- Inline Automation Status Strip -->
            <div
              v-if="autoStatusMessage"
              id="dungeon-auto-status-strip"
              class="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
              :class="
                isAutomating
                  ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : autoStatusMessage.includes('stopped') || autoStatusMessage.includes('threshold') || autoStatusMessage.includes('below') || autoStatusMessage.includes('No winnable')
                  ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-blue-200 bg-blue-50/80 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/40 dark:text-blue-200'
              "
            >
              <span class="font-medium leading-snug">{{ autoStatusMessage }}</span>
              <button
                v-if="!isAutomating"
                type="button"
                class="cursor-pointer shrink-0 text-[10px] opacity-70 hover:opacity-100"
                @click="autoStatusMessage = null"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- SECTION 5: CURRENT FLOOR DOORS -->
          <div id="dungeon-doors-section">
            <div v-if="doors.length > 0" class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
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
          </div>

          <!-- SECTION 6: UNIFIED COMBAT LOG (BELOW DOORS, FLOATING HOVER CARD DETAILS) -->
          <div id="dungeon-combat-log-section" class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>⚔️</span>
                  <span>Combat Log</span>
                </h3>
                <span
                  v-if="isAutomating"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                >
                  <span class="size-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>Auto Running</span>
                </span>
                <span
                  v-if="autoFloorCount > 0"
                  class="rounded bg-slate-100 dark:bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200"
                >
                  +{{ autoFloorCount }} floors
                </span>
                <span
                  v-if="autoCheckpointsClaimed > 0"
                  class="rounded bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-mono font-semibold"
                >
                  {{ autoCheckpointsClaimed }} CP{{ autoCheckpointGold > 0 ? ` (+${formatNumber(autoCheckpointGold)}g)` : '' }}
                </span>
              </div>

              <div class="flex items-center gap-1.5 text-[11px]">
                <span class="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Flawless: <strong id="dungeon-flawless-count" class="tabular-nums">{{ flawlessBattles }}</strong>
                </span>
                <span
                  v-if="totalCasualtyCount > 0 || casualtiesList.length > 0"
                  class="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  Casualties: <strong class="tabular-nums">{{ Math.max(totalCasualtyCount, casualtiesList.length) }}</strong>
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  Total: <strong id="dungeon-total-battles" class="tabular-nums">{{ Math.max(totalBattles, mergedCombatLogRooms.length) }}</strong>
                </span>
              </div>
            </div>

            <!-- Compact 4-5 Column Cleared Room Cards Grid -->
            <div v-if="mergedCombatLogRooms.length > 0">
              <div
                id="dungeon-combat-log-grid"
                class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-1.5"
              >
                <button
                  v-for="room in mergedCombatLogRooms"
                  :key="`${room.floor}-${room.door}`"
                  :id="`dungeon-log-card-${room.floor}-${room.door}`"
                  type="button"
                  class="group relative flex flex-col justify-between rounded-lg border px-2 py-1.5 text-left transition-all hover:shadow-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  :class="getElementCardClasses(room.element, room.casualties)"
                  :aria-label="`Floor ${room.floor} Door ${room.door} ${room.element} (${room.source === 'auto' ? 'Auto' : 'Manual'})`"
                  @mouseenter="showLogHoverCard(room, $event)"
                  @mouseleave="hideLogHoverCard"
                  @focus="showLogHoverCard(room, $event)"
                  @blur="hideLogHoverCard"
                >
                  <div class="flex items-center justify-between gap-1 w-full">
                    <span class="font-mono font-bold text-[11px] leading-none">F{{ room.floor }}</span>
                    <span
                      class="text-[10px] leading-none opacity-80"
                      :title="room.source === 'auto' ? 'Auto Attack' : 'Manual Battle'"
                    >
                      {{ room.source === 'auto' ? '⚡' : '👤' }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-1 mt-1 w-full">
                    <span class="text-[9px] font-bold uppercase tracking-wide opacity-85">
                      {{ getElementShortTag(room.element) }} · D{{ room.door }}
                    </span>
                    <span
                      v-if="room.casualties > 0"
                      class="inline-flex items-center gap-0.5 rounded bg-rose-600/90 px-1 py-0.2 text-[9px] font-bold text-white"
                      :title="Array.isArray(room.fallenTitans) && room.fallenTitans.length ? `Fallen: ${room.fallenTitans.join(', ')}` : `${room.casualties} casualty`"
                    >
                      💀{{ room.casualties }}{{ room.forceMajeure ? '!' : '' }}
                    </span>
                    <span
                      v-else-if="room.forceMajeure"
                      class="rounded bg-amber-500/90 px-1 py-0.2 text-[9px] font-bold text-white"
                      title="Last-resort win"
                    >
                      !
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div v-else class="text-center p-2.5 text-slate-400 bg-slate-50/50 dark:bg-slate-800/40 rounded-lg text-xs">
              No rooms cleared yet today. Start Auto Attack or Simulate a door to record combat history.
            </div>
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
                        {{
                          t.hasKnownMaxHp
                            ? `${formatNumber(t.hp)} / ${formatNumber(t.maxHp)} (${t.hpPct}%)`
                            : t.isDead
                              ? '0 (0%)'
                              : `Full (${t.hpPct}%)`
                        }}
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

    <!-- Floating Combat Log Hover Card (zero layout shift) -->
    <div
      v-if="hoveredLogEntry"
      id="dungeon-log-card-tooltip"
      :style="hoverCardStyle"
      class="fixed z-[120] pointer-events-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-3 text-[11px] space-y-1.5 shadow-xl"
    >
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <span>Floor {{ hoveredLogEntry.floor }} · Door {{ hoveredLogEntry.door }} ({{ hoveredLogEntry.element }})</span>
          <span class="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-semibold">
            {{ hoveredLogEntry.source === 'auto' ? '⚡ Auto' : '👤 Manual' }}
          </span>
        </div>
        <span v-if="hoveredLogEntry.timestamp" class="text-[10px] font-mono text-slate-400">
          {{ formatLogTime(hoveredLogEntry.timestamp) }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300">
        <span v-if="hoveredLogEntry.casualties === 0" class="text-emerald-600 dark:text-emerald-400 font-semibold">
          Flawless ({{ hoveredLogEntry.stars }}★)
        </span>
        <span v-else class="text-rose-600 dark:text-rose-400 font-semibold">
          Casualties ({{ hoveredLogEntry.casualties }}): {{ (Array.isArray(hoveredLogEntry.fallenTitans) ? hoveredLogEntry.fallenTitans.join(', ') : '') || 'Fallen Titan' }}
        </span>
        <span v-if="hoveredLogEntry.tankLossPct != null || hoveredLogEntry.teamLossPct != null" class="font-mono text-[10px]">
          Tank -{{ hoveredLogEntry.tankLossPct ?? 0 }}% · Team -{{ hoveredLogEntry.teamLossPct ?? 0 }}%
        </span>
        <span v-if="hoveredLogEntry.switchedTankFrom && hoveredLogEntry.switchedTankTo" class="text-amber-600 dark:text-amber-400 font-medium">
          Tank switched: {{ hoveredLogEntry.switchedTankFrom }} → {{ hoveredLogEntry.switchedTankTo }}
        </span>
        <span v-if="hoveredLogEntry.forceMajeure" class="text-amber-600 dark:text-amber-400 font-semibold">
          Last-resort win (Pool ≤5)
        </span>
        <span v-if="hoveredLogEntry.bestOfTenNote" class="text-indigo-600 dark:text-indigo-400 font-mono text-[10px]">
          Sim {{ hoveredLogEntry.bestOfTenNote }}
        </span>
        <span v-if="hoveredLogEntry.checkpointGold" class="text-amber-600 dark:text-amber-300 font-mono text-[10px]">
          +{{ formatNumber(hoveredLogEntry.checkpointGold) }} Gold
        </span>
      </div>

      <div v-if="Array.isArray(hoveredLogEntry.teamIds) && hoveredLogEntry.teamIds.length > 0" class="text-[10px] text-slate-500 dark:text-slate-400">
        Squad: {{ hoveredLogEntry.teamIds.map((id) => getTitanName(id)).join(', ') }}
      </div>
    </div>

    <!-- Interactive Battle Simulation Modal (Model A) -->
    <DungeonSimModal
      v-model="isSimModalOpen"
      :door="activeSimDoor"
      :door-idx="activeSimDoorIdx"
      :doors-count="doors.length"
      :floor-number="floorNumber"
      :titan-states="effectiveTitanStates"
      :auto-settings="autoSettings"
      @battle-submitted="handleSimBattleSubmitted"
    />
  </Teleport>
</template>
