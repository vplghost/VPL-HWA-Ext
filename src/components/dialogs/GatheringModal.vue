<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useSquadTeams } from '@/src/composables/useSquadTeams';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import GatheringProgress from '@/src/components/common/GatheringProgress.vue';
import { formatNumber, formatDuration } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import { isMarchExpired, getMarchBadgeInfo, RESOURCE_THEMES, formatResourceAmount } from '@/src/utils/resourceData';
import { gatheringProgress } from '@/src/utils/gatheringProgress';
import { calculateAccountMaxMarches } from '@/src/utils/dashboardState';
import {
  getMineConfigId,
  buildGatherCall,
  buildMineSearchCall,
  buildOptimizedGatheringTeam,
} from '@/src/utils/mineData';
import { buildSquad } from '@/src/utils/squadCapacity';
import { normalizeTroopReserve, hasTroopReserve } from '@/src/services/queues/autoGather';
import type { GatherTroopReserve } from '@/src/types/game/gatherQueue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
watch(() => props.modelValue, open => {
  if (open) void dispatchRpc([{ name: 'getMineSummary', feature: 'mine' }, { name: 'getMarches', feature: 'march' }]);
}, { immediate: true });

const {
  selectedTeamId,
  selectedTeam,
  teams,
  squadCapacity,
  allocatedTroops,
  totalAllocatedTroops,
  troopTypeSummaries,
  isRefreshingTroops,
  mapContext,
  mapCenter,
  loadSquadData,
  refreshTroops,
  handleTeamChange,
  getHeroSnapshot,
  getHeroName,
  getHeroAvatarUrl,
  getHeroGlow,
  availableHeroIds,
  setGatherContext,
} = useSquadTeams('autoGatherSettings', 'selectedTeam');

interface AutoGatherSettings {
  enabled: boolean;
  smartEnabled: boolean;
  maxMarches: number;
  mineLevel: number | 'nearest';
  mineType: string;
  lastAutoMineType: string | null;
  defenseRecallEnabled: boolean;
  defenseInfirmaryThreshold: number;
  interceptTeamId: string;
  selectedTeam?: string;
  optimizeTeam?: boolean;
  reserveTroops: GatherTroopReserve;
}

const autoSettings = ref<AutoGatherSettings>({
  enabled: false,
  smartEnabled: true,
  maxMarches: 3,
  mineLevel: 10,
  mineType: 'rotate',
  lastAutoMineType: null,
  defenseRecallEnabled: true,
  defenseInfirmaryThreshold: 50,
  interceptTeamId: '',
  selectedTeam: '',
  optimizeTeam: false,
  reserveTroops: { infantry: 0, spearmen: 0, marksmen: 0 },
});

const showReserveConfig = ref(false);

// Manual search
const manualMineType = ref<'food' | 'wood' | 'stone' | 'iron'>('food');
const manualMineLevel = ref<number>(10);
const isSearching = ref(false);
const searchStatus = ref<string>('');
const isDispatching = ref<string | null>(null);

const smartStatus = ref('');
const waitingForTroopsReason = ref('');
const defenseStatus = ref('');
const defenseActive = ref(false);
const accountMaxMarches = computed(() => calculateAccountMaxMarches(cache.value));

const hasReserve = computed(() => hasTroopReserve(autoSettings.value.reserveTroops));
const reserveSummaryLabel = computed(() => {
  const r = normalizeTroopReserve(autoSettings.value.reserveTroops);
  return `${r.infantry}/${r.spearmen}/${r.marksmen}`;
});

function applySmartStateSnapshot(state: any) {
  smartStatus.value = state?.status || '';
  waitingForTroopsReason.value = state?.waitingForTroops?.reason || '';
  defenseStatus.value = state?.defense?.status || '';
  defenseActive.value = Boolean(state?.defense?.pending || state?.defense?.intercept);
}

function mergeStoredSettings(storedSettings: any) {
  if (!storedSettings || typeof storedSettings !== 'object') return;
  autoSettings.value = {
    ...autoSettings.value,
    ...storedSettings,
    defenseRecallEnabled: storedSettings.defenseRecallEnabled !== false,
    defenseInfirmaryThreshold: Number.isFinite(storedSettings.defenseInfirmaryThreshold)
      ? Number(storedSettings.defenseInfirmaryThreshold)
      : 50,
    interceptTeamId: typeof storedSettings.interceptTeamId === 'string' ? storedSettings.interceptTeamId : '',
    reserveTroops: normalizeTroopReserve(storedSettings.reserveTroops),
  };
}

function onGatherStorage(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area !== 'local') return;
  if (changes.smartGatherState) applySmartStateSnapshot(changes.smartGatherState.newValue);
  if (changes.autoGatherSettings?.newValue) mergeStoredSettings(changes.autoGatherSettings.newValue);
}

const now = ref(Date.now());
let timer: number | null = null;

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(onGatherStorage);
  await loadSquadData();

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['autoGatherSettings', 'popupRpcEnabled', 'socketRefreshMode', 'smartGatherState']);
      applySmartStateSnapshot(stored.smartGatherState);
      if (stored.autoGatherSettings) mergeStoredSettings(stored.autoGatherSettings);
    } catch (_) {}
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        kind: 'experimental-rpc',
        calls: [{ name: 'getMarches', feature: 'march' }],
      });
    }
  } catch (_) {}
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(onGatherStorage);
});

async function ensureRpcEnabled() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode']);
    const updates: Record<string, any> = {};
    if (stored.popupRpcEnabled !== true) updates.popupRpcEnabled = true;
    if (!stored.socketRefreshMode) updates.socketRefreshMode = 'direct';
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  }
}

function buildPersistableSettings(): AutoGatherSettings {
  const maxLimit = accountMaxMarches.value;
  autoSettings.value.maxMarches = Math.max(1, Math.min(maxLimit, autoSettings.value.maxMarches || 1));
  autoSettings.value.selectedTeam = selectedTeamId.value;
  autoSettings.value.optimizeTeam = selectedTeamId.value === 'optimized';
  autoSettings.value.smartEnabled = autoSettings.value.enabled ? true : autoSettings.value.smartEnabled;
  autoSettings.value.defenseInfirmaryThreshold = Math.max(
    1,
    Math.min(100, Number(autoSettings.value.defenseInfirmaryThreshold) || 50)
  );
  autoSettings.value.reserveTroops = normalizeTroopReserve(autoSettings.value.reserveTroops);
  return {
    ...autoSettings.value,
    reserveTroops: { ...autoSettings.value.reserveTroops },
  };
}

async function saveAutoSettings() {
  const payload = buildPersistableSettings();
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: payload });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: payload.enabled ? 'auto-gather-start' : 'auto-gather-stop',
      settings: payload,
    });
  }
}

function toggleAutoGather() {
  autoSettings.value.enabled = !autoSettings.value.enabled;
  if (autoSettings.value.enabled) {
    autoSettings.value.smartEnabled = true;
  }
  void saveAutoSettings();
}

async function saveDefenseSettings() {
  const payload = buildPersistableSettings();
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: payload });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: payload.defenseRecallEnabled ? 'mine-defense-update' : 'mine-defense-stop',
      settings: payload,
    });
  }
}

async function saveReserveSettings() {
  const payload = buildPersistableSettings();
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: payload });
  }
  if (payload.enabled && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'auto-gather-start',
      settings: payload,
    });
  }
}

function resetReserveTroops() {
  autoSettings.value.reserveTroops = { infantry: 0, spearmen: 0, marksmen: 0 };
  void saveReserveSettings();
}

async function refreshAll() {
  await refreshTroops();
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'experimental-rpc',
      calls: [{ name: 'getMarches', feature: 'march' }],
    }).catch(() => {});
    if (autoSettings.value.enabled) {
      chrome.runtime.sendMessage({ kind: 'auto-gather-start', settings: buildPersistableSettings() }).catch(() => {});
    }
  }
}

// Next target mine type in rotation
const nextTargetType = computed(() => {
  if (autoSettings.value.mineType !== 'rotate') return autoSettings.value.mineType;
  const types = ['food', 'iron', 'stone', 'wood'];
  const last = autoSettings.value.lastAutoMineType;
  if (!last || !types.includes(last)) return 'food';
  const idx = types.indexOf(last);
  return types[(Number(idx) + 1) % types.length];
});

// Active gathering marches
const gatheringMarches = computed(() => {
  const marches = normalizeArray(cache.value.marchStatus?.data?.marches);
  return marches
    .filter((m: any) => {
      if (isMarchExpired(m, now.value)) return false;
      const badge = getMarchBadgeInfo(m, now.value);
      if (badge.category === 'gather') return true;
      const isMine =
        Boolean(m.mineId) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.kind) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.previousKind);
      return isMine;
    })
    .map((m: any) => {
      const progress = gatheringProgress(m, now.value, cache.value);
      return {
        ...m,
        id: m.id || m.squadId,
        squadId: m.squadId || m.id,
        progress,
        stage: progress.phase,
        timerText:
          progress.remainingSeconds == null
            ? 'In progress'
            : progress.remainingSeconds > 0
              ? formatDuration(progress.remainingSeconds)
              : 'Awaiting update',
      };
    });
});

const gatheringOverall = computed(() => {
  const rows = gatheringMarches.value.map(march => march.progress);
  if (!rows.length || rows.some(row => row.total == null || row.collected == null)) return null;
  const total = rows.reduce((sum, row) => sum + row.total!, 0);
  const collected = rows.reduce((sum, row) => sum + row.collected!, 0);
  return total > 0 ? { total, collected, progress: Math.round(collected / total * 1000) / 10 } : null;
});

// Found full mines matching search criteria (declared before immediate watcher)
const foundMines = computed(() => {
  const search = cache.value.experimentalMineSearch?.data;
  if (!search || !Array.isArray(search.mines)) return [];
  const expectedConfig = getMineConfigId(manualMineType.value, manualMineLevel.value);
  if (expectedConfig && search.mineConfigId !== expectedConfig) return [];
  return search.mines;
});

watch(
  [() => autoSettings.value.mineType, () => autoSettings.value.mineLevel, () => foundMines.value],
  ([type, level, mines]) => {
    const normType = type === 'rotate' ? 'food' : type;
    const normLevel = level === 'nearest' ? 10 : Number(level) || 10;
    const firstMine = Array.isArray(mines) && mines.length > 0 ? mines[0] : null;
    const remaining =
      firstMine?.resourceAmount ??
      firstMine?.resourcesAmount ??
      firstMine?.amount ??
      cache.value.mineMap?.[firstMine?.mineId]?.resourceAmount ??
      cache.value.mineMap?.[firstMine?.mineId]?.resourcesAmount;

    setGatherContext({
      mineType: normType,
      mineLevel: normLevel,
      resourceAmount: remaining,
      resourcesAmount: remaining,
      targetMine: firstMine,
    });
  },
  { immediate: true }
);

async function handleManualSearch() {
  await ensureRpcEnabled();
  isSearching.value = true;
  searchStatus.value = 'Searching for full resource mines on world map...';

  const mapId = mapContext.value?.mapId;
  const center = mapCenter.value;

  if (!mapId || !center) {
    isSearching.value = false;
    searchStatus.value = '⚠️ World map not loaded yet. Open map in-game once to capture coordinates.';
    return;
  }

  const configId = getMineConfigId(manualMineType.value, manualMineLevel.value);
  if (!configId) {
    isSearching.value = false;
    searchStatus.value = '⚠️ Invalid mine level or type.';
    return;
  }

  const call = buildMineSearchCall(mapId, center, manualMineType.value, manualMineLevel.value) || {
    name: 'searchMine',
    feature: 'mine',
    args: {
      mapId,
      mineConfigIds: [configId],
      fullOnly: true,
      center: { x: center.x, y: center.y },
    },
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({
        kind: 'experimental-rpc',
        calls: [call],
      });
      if (res?.error) {
        searchStatus.value = `Error: ${res.error}`;
      } else {
        searchStatus.value = res?.queued
          ? 'Search packet queued for next game RPC. Results will appear shortly.'
          : 'Search packet sent. Checking map results...';
      }
    }
  } catch (err: any) {
    searchStatus.value = `Error sending search: ${err?.message || err}`;
  } finally {
    isSearching.value = false;
  }
}

async function dispatchSquadToMine(mine: any) {
  await ensureRpcEnabled();
  const isOptimized = selectedTeamId.value === 'optimized';
  let heroIds: number[] = [];
  let troops: Array<{ unitId: number; count: number }> = [];

  if (isOptimized) {
    const remainingAmount =
      mine?.resourceAmount ??
      mine?.resourcesAmount ??
      mine?.amount ??
      cache.value.mineMap?.[mine?.mineId]?.resourceAmount ??
      cache.value.mineMap?.[mine?.mineId]?.resourcesAmount;

    const opt = buildOptimizedGatheringTeam({
      heroes: cache.value.heroGetAll?.data || {},
      availableHeroIds: availableHeroIds.value,
      unitSummary: cache.value['getUnitSummary:unit']?.data || cache.value.inventoryGet?.data?.unit || {},
      mineType: mine?.mineType || mine?.type || manualMineType.value,
      mineLevel: mine?.level || manualMineLevel.value,
      resourcesAmount: remainingAmount,
      resourceAmount: remainingAmount,
      targetMine: mine,
      capacitySettings: cache.value.troopCapacitySettings,
      accountId: cache.value.accountStatus?.data?.id,
    });
    heroIds = opt.heroIds;
    troops = opt.allocatedTroops;
    if (!heroIds.length || !troops.length) {
      searchStatus.value = '⚠️ No available heroes or troops for optimized squad.';
      return;
    }
  } else {
    const team = selectedTeam.value;
    if (!team || team.heroIds.length < 1) {
      searchStatus.value = '⚠️ Please select a team first.';
      return;
    }
    heroIds = team.heroIds;
    troops = allocatedTroops.value;
  }

  const squad = buildSquad(heroIds, troops) || {
    heroes: heroIds.map((heroId) => ({ heroId })),
    units: troops,
  };

  const mapId = mapContext.value?.mapId;
  if (!mapId || !mine?.mineId) {
    searchStatus.value = '⚠️ Missing map ID or mine ID.';
    return;
  }

  const call = buildGatherCall(mapId, mine.mineId, squad) || {
    name: 'attackMine',
    feature: 'mine',
    args: { mapId, mineId: mine.mineId, battleType: 'pve', squad },
  };

  isDispatching.value = mine.mineId;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({
        kind: 'experimental-rpc',
        calls: [call],
      });
      if (res?.error) {
        searchStatus.value = `Dispatch error: ${res.error}`;
      } else {
        searchStatus.value = res?.queued
          ? 'Gathering march queued for next game RPC.'
          : 'Gathering march dispatched! March will appear in active list.';
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            kind: 'experimental-rpc',
            calls: [{ name: 'getMarches', feature: 'march' }],
          }).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    searchStatus.value = `Failed to send gathering march: ${err?.message || err}`;
  } finally {
    isDispatching.value = null;
  }
}

async function recallMarch(march: any) {
  await ensureRpcEnabled();
  const squadId = march.squadId || march.id;
  if (!squadId) return;

  const call = {
    name: 'stopMineGathering',
    feature: 'mine',
    args: { squadId },
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    await chrome.runtime.sendMessage({
      kind: 'experimental-rpc',
      calls: [call],
    });
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Gathering & Resource Automation"
    icon="⛏️"
    max-width="max-w-3xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header-status>
      <span
        id="gather-header-marches-pill"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
      >
        <span>⛏️</span>
        <span>{{ gatheringMarches.length }}/{{ autoSettings.maxMarches }}</span>
        <span v-if="gatheringOverall" class="text-teal-600 dark:text-teal-400 font-mono">· {{ gatheringOverall.progress }}%</span>
      </span>

      <span
        id="gather-header-status-pill"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border"
        :class="
          autoSettings.enabled
            ? waitingForTroopsReason
              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
        "
      >
        <span
          class="size-1.5 rounded-full"
          :class="
            autoSettings.enabled
              ? waitingForTroopsReason
                ? 'bg-amber-500'
                : 'bg-emerald-500 animate-pulse'
              : 'bg-slate-400'
          "
        />
        <span>{{ autoSettings.enabled ? (waitingForTroopsReason ? 'Waiting for troops' : 'Smart Auto') : 'Manual' }}</span>
      </span>

      <span
        id="gather-header-defense-pill"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border"
        :class="
          defenseActive
            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 animate-pulse'
            : autoSettings.defenseRecallEnabled
              ? 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/60'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
        "
      >
        <span>{{ defenseActive ? '⚠️' : '🛡️' }}</span>
        <span>{{ defenseActive ? 'Defense Active' : autoSettings.defenseRecallEnabled ? 'Protected' : 'Defense Off' }}</span>
      </span>
    </template>

    <template #header-actions>
      <label
        class="inline-flex items-center gap-1.5 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold border transition-colors select-none"
        :class="
          autoSettings.enabled
            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'
            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
        "
        title="Enable or pause Smart Auto-Gather (daily priorities & activity coordination)"
      >
        <input
          id="gather-auto-toggle"
          type="checkbox"
          :checked="autoSettings.enabled"
          class="size-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          @change="toggleAutoGather"
        />
        <span>Auto</span>
      </label>

      <button
        id="gather-header-refresh-btn"
        type="button"
        :disabled="isRefreshingTroops"
        title="Refresh troops & marches"
        aria-label="Refresh troops and marches"
        class="cursor-pointer size-7 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        @click="refreshAll"
      >
        <span :class="{ 'inline-block animate-spin': isRefreshingTroops }">↻</span>
      </button>
    </template>

    <div class="space-y-3 text-xs">
      <!-- Section 1: Team & Squad Parameters -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 shadow-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="gather-team-select" class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>👥</span> Gathering Team & Troop Capacity
          </label>
          <span v-if="selectedTeam" class="text-[10px] font-mono text-slate-400">
            ID: {{ selectedTeam.id }}
          </span>
        </div>

        <select
          id="gather-team-select"
          v-model="selectedTeamId"
          class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
          @change="handleTeamChange(selectedTeamId)"
        >
          <option v-for="t in teams" :key="t.id" :value="t.id">
            {{ t.label }} ({{ t.heroIds.length }}/5)
          </option>
        </select>

        <!-- Optimize Team Information Badge -->
        <div v-if="selectedTeamId === 'optimized'" class="px-2.5 py-1.5 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 text-teal-800 dark:text-teal-200 text-[11px]">
          ⚡ <strong>Optimized Squad:</strong> Picks lowest-power heroes up to mine capacity (Food:1 · Wood:1 · Stone:5 · Iron:20).
        </div>

        <!-- Team Chips Preview -->
        <div v-if="selectedTeam && selectedTeam.heroIds.length > 0" class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="hid in selectedTeam.heroIds"
            :key="hid"
            class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          >
            <span
              class="relative size-4 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
              :class="getHeroGlow(hid)"
            >
              <img
                v-if="getHeroAvatarUrl(hid)"
                :src="getHeroAvatarUrl(hid)"
                :alt="getHeroName(hid)"
                class="size-full object-cover"
                loading="lazy"
              />
              <span v-else class="text-[9px]">👤</span>
            </span>
            <span class="font-medium truncate max-w-[100px]">{{ getHeroName(hid) }}</span>
            <HeroHoverCard
              :hero-id="hid"
              :hero="getHeroSnapshot(hid)"
              :inventory="cache.inventoryGet?.data"
            />
          </span>
        </div>

        <!-- Troop Allocation Summary + Collapsible Troop Reserve Toggle -->
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div class="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span class="font-semibold">
              Troops: <strong class="text-slate-800 dark:text-slate-200">{{ formatNumber(totalAllocatedTroops) }}</strong> / {{ formatNumber(squadCapacity) }}
            </span>

            <button
              id="gather-reserve-toggle-btn"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors"
              :class="
                showReserveConfig || hasReserve
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-300'
              "
              title="Configure reserved troops per type kept in city for Auto-Join and Rallies"
              :aria-expanded="showReserveConfig"
              @click="showReserveConfig = !showReserveConfig"
            >
              <span>🪖</span>
              <span v-if="hasReserve" class="font-mono">{{ reserveSummaryLabel }}</span>
              <span v-else>Reserve</span>
            </button>
          </div>

          <!-- Collapsible Troop Reserve Panel (collapsed by default) -->
          <div
            v-if="showReserveConfig"
            id="gather-reserve-panel"
            class="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200">
                Keep highest-tier troops in city for Auto-Join &amp; Rallies
              </span>
              <button
                v-if="hasReserve"
                type="button"
                class="cursor-pointer text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                @click="resetReserveTroops"
              >
                Reset
              </button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <label class="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Infantry
                <input
                  id="gather-reserve-infantry"
                  v-model.number="autoSettings.reserveTroops.infantry"
                  type="number"
                  min="0"
                  step="50"
                  class="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono"
                  @change="saveReserveSettings"
                />
              </label>
              <label class="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Spearmen
                <input
                  id="gather-reserve-spearmen"
                  v-model.number="autoSettings.reserveTroops.spearmen"
                  type="number"
                  min="0"
                  step="50"
                  class="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono"
                  @change="saveReserveSettings"
                />
              </label>
              <label class="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Marksmen
                <input
                  id="gather-reserve-marksmen"
                  v-model.number="autoSettings.reserveTroops.marksmen"
                  type="number"
                  min="0"
                  step="50"
                  class="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono"
                  @change="saveReserveSettings"
                />
              </label>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            <div
              v-for="b in troopTypeSummaries"
              :key="b.type"
              class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
            >
              <div class="font-semibold text-slate-800 dark:text-slate-200">
                {{ b.label }}: {{ formatNumber(b.total) }}
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5 truncate" :title="b.tiersText">
                {{ b.tiersText }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Smart Auto-Gather Settings (shown only when Auto is active) -->
      <section
        v-if="autoSettings.enabled"
        id="gather-auto-section"
        class="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-3 space-y-2.5 shadow-xs"
      >
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Mine Target Type
            <select
              v-model="autoSettings.mineType"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option value="rotate">Smart balance (Daily quests → Lowest weighted stock)</option>
              <option value="food">🍞 Food Only</option>
              <option value="wood">🌲 Wood Only</option>
              <option value="stone">◆ Stone Only</option>
              <option value="iron">⚙ Iron Only</option>
            </select>
          </label>

          <!-- Mine Level (1 to 10 + Nearest) -->
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Preferred Mine Level
            <select
              v-model="autoSettings.mineLevel"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option value="nearest">Nearest · estimated &gt;1h</option>
              <option v-for="lvl in 10" :key="lvl" :value="11 - lvl">
                Level {{ 11 - lvl }}{{ lvl === 1 ? ' (Highest Yield)' : '' }}
              </option>
            </select>
          </label>

          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Max Gathering Marches
            <select
              v-model.number="autoSettings.maxMarches"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option v-for="m in accountMaxMarches" :key="m" :value="m">
                {{ m }} squad{{ m > 1 ? 's' : '' }}{{ m === accountMaxMarches ? ' (Account Max)' : '' }}
              </option>
            </select>
          </label>
        </div>

        <div
          class="rounded-lg px-2.5 py-1.5 text-[11px]"
          role="status"
          :class="
            waitingForTroopsReason
              ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              : 'bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400'
          "
        >
          <template v-if="waitingForTroopsReason">
            ⏳ {{ waitingForTroopsReason }}
          </template>
          <template v-else-if="smartStatus">
            {{ smartStatus }}
          </template>
          <template v-else-if="autoSettings.mineType === 'rotate'">
            Daily priority rotation · Next target: <strong>{{ (nextTargetType || 'food').toUpperCase() }}</strong>.
          </template>
          <template v-else>
            Target: <strong>{{ autoSettings.mineType.toUpperCase() }}</strong> (Lv.{{ autoSettings.mineLevel }}).
          </template>
        </div>
      </section>

      <!-- Section 3: Manual Search & Dispatch (shown only when Auto is paused) -->
      <section
        v-else
        id="gather-manual-section"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 shadow-xs"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <span>🔍</span> Manual Mine Search &amp; Dispatch
          </h3>

          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="manualMineType"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="food">🌾 Food Farm</option>
              <option value="wood">🪵 Lumber Mill</option>
              <option value="stone">🪨 Stone Quarry</option>
              <option value="iron">⚙️ Iron Mine</option>
            </select>

            <!-- Mine Level 1 to 10 -->
            <select
              v-model.number="manualMineLevel"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
            >
              <option v-for="lvl in 10" :key="lvl" :value="11 - lvl">
                Level {{ 11 - lvl }}{{ lvl === 1 ? ' (Max)' : '' }}
              </option>
            </select>

            <button
              type="button"
              class="cursor-pointer px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              :disabled="isSearching"
              @click="handleManualSearch"
            >
              <span>{{ isSearching ? 'Searching...' : 'Find Full Mines' }}</span>
            </button>
          </div>
        </div>

        <div v-if="searchStatus" class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px]">
          {{ searchStatus }}
        </div>

        <!-- Found Mines List -->
        <div v-if="foundMines.length > 0" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div class="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Available Targets ({{ foundMines.length }} full mines found):
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="(mine, idx) in foundMines"
              :key="mine.mineId || idx"
              class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
            >
              <div>
                <div class="font-bold text-slate-800 dark:text-slate-200">
                  Mine #{{ Number(idx) + 1 }} · ({{ mine.coordinates?.x ?? '?' }}, {{ mine.coordinates?.y ?? '?' }})
                </div>
                <div class="text-[11px] font-medium" :class="RESOURCE_THEMES[manualMineType]?.textClass || 'text-slate-400'">
                  <span>{{ RESOURCE_THEMES[manualMineType]?.icon }} </span>
                  {{ manualMineType.charAt(0).toUpperCase() + manualMineType.slice(1) }} · Lv.{{ manualMineLevel }}
                  <span
                    v-if="mine.resourceAmount || mine.resourcesAmount || cache.mineMap?.[mine.mineId]?.resourceAmount"
                    class="ml-1 text-slate-500 font-normal"
                  >
                    ({{ formatResourceAmount(mine.resourceAmount || mine.resourcesAmount || cache.mineMap?.[mine.mineId]?.resourceAmount) }} left)
                  </span>
                </div>
              </div>

              <button
                type="button"
                :disabled="isDispatching === mine.mineId"
                class="cursor-pointer px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                @click="dispatchSquadToMine(mine)"
              >
                {{ isDispatching === mine.mineId ? 'Sending...' : 'Send Squad' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: Independent Mine Defense -->
      <section
        id="gather-defense-section"
        class="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2 shadow-xs"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer">
            <input
              id="gather-defense-toggle"
              v-model="autoSettings.defenseRecallEnabled"
              type="checkbox"
              class="size-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              @change="saveDefenseSettings"
            />
            <span>🛡️ Mine Defense · Return or Intercept Under Attack</span>
          </label>
          <span class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Independent
          </span>
        </div>

        <div v-if="autoSettings.defenseRecallEnabled" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Infirmary Threshold (%)
            <input
              v-model.number="autoSettings.defenseInfirmaryThreshold"
              type="number"
              min="1"
              max="100"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
              @change="saveDefenseSettings"
            />
          </label>

          <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Intercept Team (Optional)
            <select
              v-model="autoSettings.interceptTeamId"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
              @change="saveDefenseSettings"
            >
              <option value="">None (Recall only)</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.label }}
              </option>
            </select>
          </label>
        </div>

        <p v-if="autoSettings.defenseRecallEnabled" class="text-[11px] text-slate-500 dark:text-slate-400">
          <span v-if="defenseStatus" class="font-medium text-amber-800 dark:text-amber-300">{{ defenseStatus }} · </span>
          <span v-if="autoSettings.interceptTeamId">
            Swaps threatened gatherer with intercept team immediately; recalls in final 10s if wounded exceed {{ autoSettings.defenseInfirmaryThreshold || 50 }}%.
          </span>
          <span v-else>
            Recalls threatened gathering squads in final 10s when wounded troops exceed {{ autoSettings.defenseInfirmaryThreshold || 50 }}% infirmary capacity.
          </span>
        </p>
      </section>

      <!-- Section 5: Active Gathering Marches -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 shadow-xs">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span class="flex items-center gap-1.5"><span>⛏️</span> Active Gathering Marches</span>
          <span class="text-xs font-normal text-slate-400">{{ gatheringMarches.length }} active</span>
        </h3>

        <div v-if="gatheringOverall" class="text-xs text-teal-700 dark:text-teal-300 flex items-center justify-between">
          <span>Overall collection progress</span><span class="font-mono font-semibold">{{ gatheringOverall.progress }}%</span>
        </div>
        <div v-if="gatheringMarches.length === 0" class="p-3 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
          No gathering marches currently active.
        </div>

        <div v-else class="space-y-1.5">
          <div
            v-for="march in gatheringMarches"
            :key="march.id"
            class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">{{ march.progress?.type && RESOURCE_THEMES[march.progress.type]?.icon ? RESOURCE_THEMES[march.progress.type].icon : '⛏️' }}</span>
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">{{ march.progress.target }}</span>
                <span class="text-[11px] text-slate-400 ml-2">{{ march.stage }}</span>
                <GatheringProgress :progress="march.progress" />
              </div>
            </div>

            <div class="flex items-center gap-2">
              <span
                class="font-mono text-xs font-semibold px-2 py-0.5 rounded"
                :class="
                  march.progress?.type === 'food'
                    ? 'bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300'
                    : march.progress?.type === 'wood'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : march.progress?.type === 'stone'
                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        : march.progress?.type === 'iron'
                          ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
                          : 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                "
              >
                {{ march.timerText }}
              </span>
              <button
                type="button"
                class="cursor-pointer px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-300 text-xs font-medium transition-colors"
                title="Recall this gathering squad back to outpost"
                @click="recallMarch(march)"
              >
                Recall
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </ModalDialog>
</template>
