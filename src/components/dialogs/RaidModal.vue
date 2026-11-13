<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useSquadTeams } from '@/src/composables/useSquadTeams';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import { formatNumber } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import {
  bossConfigId,
  bossLevel as getBossLevel,
  rallyWaitOptions,
} from '@/src/utils/experimentalData';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const {
  selectedTeamId,
  selectedTeam,
  teams,
  squadCapacity,
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
} = useSquadTeams('raidPreferences', 'rallyTeam');

const bossLevel = ref(1);
const waitSeconds = ref(300);
const minMembers = ref(4);
const raidCount = ref(2);
const autoCancel = ref(true);
const autoEnergyRaid = ref(false);
const energyThreshold = ref(200);
const autoEnergyMessage = ref('');
const autoConfigLoaded = ref(false);
const isRunning = ref(false);
const queueStatusText = ref('Idle');

const selectedMobId = ref<string>('');
const isSearchingBosses = ref(false);
const statusMessage = ref<string>('');

// Boss targets found from map search
const searchData = computed(() => cache.value.experimentalRallySearch?.data);

const matchingBossConfig = computed(() => {
  const configId = bossConfigId(bossLevel.value);
  const mobCfgs = searchData.value?.mobConfigIds;
  if (!configId || !mobCfgs) return false;
  if (Array.isArray(mobCfgs)) return mobCfgs.includes(configId);
  if (typeof mobCfgs === 'object') return Object.values(mobCfgs).includes(configId) || String(configId) in mobCfgs;
  return false;
});

const foundBosses = computed(() => {
  if (!matchingBossConfig.value || !Array.isArray(searchData.value?.mobs)) return [];
  return searchData.value.mobs;
});

watch(bossLevel, () => {
  selectedMobId.value = '';
});

watch(
  foundBosses,
  (bosses) => {
    if (bosses.length > 0 && (!selectedMobId.value || !bosses.some((b: any) => b.mobId === selectedMobId.value))) {
      selectedMobId.value = bosses[0].mobId;
    }
  },
  { immediate: true }
);

const now = ref(Date.now());
let timer: number | null = null;
const raidQueueState = ref<any>(null);

const activeRallies = computed(() => {
  const marches = normalizeArray(cache.value?.marchStatus?.data?.marches);
  return marches.filter(
    (m: any) => m.rally && !(Number.isFinite(m.endsAt) && now.value >= m.endsAt)
  );
});

const currentRaidPhase = computed(() => {
  if (activeRallies.value.length === 0) return null;
  const march = activeRallies.value[0];
  const expData = (globalThis as any).hwaHelperExperimentalData;
  return expData?.rallyPhase ? expData.rallyPhase(march, now.value) : null;
});

const currentRaidCountdown = computed(() => {
  if (!currentRaidPhase.value?.until) return null;
  return Math.max(0, Math.ceil((currentRaidPhase.value.until - now.value) / 1000));
});

const currentRaidStageIcon = computed(() => {
  if (currentRaidPhase.value) {
    const p = currentRaidPhase.value.phase;
    if (p === 'Waiting') return '⏳';
    if (p === 'Traveling to boss') return '🏹';
    if (p === 'Battle / awaiting result') return '💥';
    if (p === 'Returning' || p === 'Battle complete') return '↩️';
  }
  if (isRunning.value) return '⏱️';
  return '⚔️';
});

const remainRaidCount = computed(() => {
  if (!isRunning.value || !raidQueueState.value) return null;
  return raidQueueState.value.bossQueue?.remain_raid_count ?? null;
});

const queueStatusLabel = computed(() => {
  if (queueStatusText.value === 'waiting_rally') return 'Waiting for active raid to attack';
  if (queueStatusText.value === 'refreshing') return 'Refreshing roster';
  if (queueStatusText.value === 'searching') return 'Searching boss';
  if (queueStatusText.value === 'creating') return 'Creating rally';
  if (queueStatusText.value === 'active') return 'Active';
  if (queueStatusText.value === 'cancelling') return 'Cancelling';
  return queueStatusText.value;
});

onMounted(async () => {
  await loadSquadData();
  const autoStored: any = await chrome.storage.local.get(['raidEnergyAuto', 'raidEnergyAutoStatus', 'raidPreferences']);
  raidCount.value = autoStored.raidPreferences?.raidCount || 2;
  if (String(autoStored.raidEnergyAuto?.accountId) === String(cache.value.accountStatus?.data?.id)) {
    autoEnergyRaid.value = autoStored.raidEnergyAuto?.enabled === true;
    energyThreshold.value = autoStored.raidEnergyAuto?.threshold || 200;
  }
  autoEnergyMessage.value = autoStored.raidEnergyAutoStatus?.message || '';
  autoConfigLoaded.value = true;

  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get<{ popupRpcEnabled?: boolean; socketRefreshMode?: string; raidPreferences?: {bossLevel?: number; waitSeconds?: number; minMembers?: number; autoCancel?: boolean; rallyTeam?: string; targetMobId?: string}; raidQueue?: {phase: string; [key: string]: unknown} }>(['raidPreferences', 'raidQueue', 'popupRpcEnabled', 'socketRefreshMode']);
      if (stored.raidPreferences) {
        if (stored.raidPreferences.bossLevel) bossLevel.value = stored.raidPreferences.bossLevel;
        if (stored.raidPreferences.waitSeconds) waitSeconds.value = stored.raidPreferences.waitSeconds;
        if (stored.raidPreferences.minMembers) minMembers.value = stored.raidPreferences.minMembers;
        if (stored.raidPreferences.autoCancel !== undefined) autoCancel.value = stored.raidPreferences.autoCancel;
        // Team restoration is owned by useSquadTeams and its account-specific storage.
        if (stored.raidPreferences.targetMobId) selectedMobId.value = stored.raidPreferences.targetMobId;
      }
      if (stored.raidQueue) {
        raidQueueState.value = stored.raidQueue;
        isRunning.value = !['stopped', 'complete'].includes(stored.raidQueue.phase);
        queueStatusText.value = stored.raidQueue.phase || 'Idle';
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.raidEnergyAutoStatus) autoEnergyMessage.value = (changes.raidEnergyAutoStatus.newValue as any)?.message || '';
      if (area === 'local' && changes.raidQueue) {
        const q = changes.raidQueue.newValue as { phase?: string } | undefined;
        raidQueueState.value = q;
        isRunning.value = q ? !['stopped', 'complete'].includes(q.phase || 'stopped') : false;
        queueStatusText.value = q?.phase || 'Idle';
      }
    });
  }
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      now.value = Date.now();
      document.addEventListener('keydown', handleKeydown);
      loadSquadData();
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('keydown', handleKeydown);
});

async function ensureRpcEnabled() {
  const stored: any = await chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode', 'captureSettings']);
  if (stored.popupRpcEnabled !== true ||
      (stored.socketRefreshMode !== 'direct' && stored.captureSettings?.interceptEnabled === false)) {
    statusMessage.value = 'Enable RPC in Settings, and Monitor API for Piggyback mode.';
    return false;
  }
  return true;
}

function raidOptions(count = raidCount.value) {
  return { mapId: mapContext.value?.mapId, center: mapCenter.value, firstMobId: selectedMobId.value,
    level: bossLevel.value, waitSeconds: waitSeconds.value, minMembers: minMembers.value, count,
    autoCancel: autoCancel.value, heroIds: normalizeArray(selectedTeam.value?.heroIds),
    teamId: selectedTeam.value?.id || '', maxTroops: selectedTeam.value?.maxTroops };
}
async function saveAutoRaid() {
  const config = { enabled: autoEnergyRaid.value, threshold: energyThreshold.value,
    accountId: cache.value.accountStatus?.data?.id, options: raidOptions() };
  const response = await chrome.runtime.sendMessage({ kind: 'raid-energy-config', config }).catch(error => ({ error: String(error) }));
  if (!response?.ok) {
    autoEnergyMessage.value = response?.error || 'Auto raid settings could not be saved.';
    if (autoEnergyRaid.value) {
      autoEnergyRaid.value = false;
      await chrome.runtime.sendMessage({ kind: 'raid-energy-config', config: { enabled: false } }).catch(() => {});
    }
  } else autoEnergyMessage.value = autoEnergyRaid.value
    ? 'Watching natural World Energy regeneration with these raid options.'
    : 'Automatic energy raid is off.';
}
watch(selectedTeamId, () => {
  if (autoConfigLoaded.value && autoEnergyRaid.value) void saveAutoRaid();
});
watch(() => cache.value.accountStatus?.data?.id, () => {
  autoEnergyRaid.value = false;
  autoEnergyMessage.value = 'Account changed. Enable auto raid again for this account.';
});

async function savePreferences() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      raidPreferences: {
        accountId: cache.value.accountStatus?.data?.id,
        raidCount: raidCount.value,
        bossLevel: bossLevel.value,
        waitSeconds: waitSeconds.value,
        minMembers: minMembers.value,
        autoCancel: autoCancel.value,
        rallyTeam: selectedTeamId.value,
        targetMobId: selectedMobId.value,
      },
    });
  }
}

watch([bossLevel, waitSeconds, minMembers, raidCount, autoCancel], () => {
  if (autoConfigLoaded.value && autoEnergyRaid.value) void saveAutoRaid();
});

const isLocatingMap = ref(false);

async function refreshMapCoordinates() {
  isLocatingMap.value = true;
  statusMessage.value = 'Locating coordinates from game...';
  try {
    await dispatchRpc([
      { name: 'getMarches', feature: 'march' },
      { name: 'clan_getSummary' },
      { name: 'getPage', feature: 'report', args: { limit: 10, cursor: null } },
    ]);
    if (mapContext.value?.mapId && mapCenter.value) {
      statusMessage.value = '✓ World map coordinates located successfully.';
    } else {
      statusMessage.value = '⚠️ Coordinates not found in marches. Please open World Map or Guild Rally once in game.';
    }
  } catch (err: any) {
    statusMessage.value = 'Failed to locate coordinates: ' + (err?.message || 'RPC error');
  } finally {
    isLocatingMap.value = false;
  }
}

async function findBosses() {
  if (!await ensureRpcEnabled()) return;
  const mapId = mapContext.value?.mapId;
  const center = mapCenter.value;

  if (!mapId || !center) {
    statusMessage.value = '⚠️ World map not captured yet. Open the world map in game to locate coordinates.';
    return;
  }

  const configId = bossConfigId(bossLevel.value);
  if (!configId) {
    statusMessage.value = '⚠️ Invalid boss level (must be 1–30).';
    return;
  }

  isSearchingBosses.value = true;
  statusMessage.value = `Searching for Level ${bossLevel.value} Boss targets on world map...`;

  const call = {
    name: 'searchMob',
    feature: 'mob',
    args: {
      mapId,
      center,
      mobType: 'rally',
      mobConfigIds: [configId],
    },
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({
        kind: 'experimental-rpc',
        calls: [call],
      });
      if (res?.error) {
        statusMessage.value = `Search error: ${res.error}`;
      } else {
        statusMessage.value = res?.queued
          ? 'Boss search queued for next game RPC. Results will appear shortly.'
          : 'Boss search sent. Checking map...';
      }
    }
  } catch (err: any) {
    statusMessage.value = `Error searching: ${err?.message || err}`;
  } finally {
    isSearchingBosses.value = false;
  }
}

async function startRaidQueue(count = raidCount.value) {
  if (!await ensureRpcEnabled()) return;
  await savePreferences();

  const heroIds = normalizeArray(selectedTeam.value?.heroIds);
  const teamId = selectedTeam.value?.id || '';
  const maxTroops = selectedTeam.value?.maxTroops;
  const mapId = mapContext.value?.mapId;
  const center = mapCenter.value;

  if (!mapId || !center) {
    statusMessage.value = '⚠️ World map not captured yet. Open the world map in game first.';
    return;
  }

  if (heroIds.length !== 5) {
    statusMessage.value = '⚠️ Select a complete 5-hero team first.';
    return;
  }

  // Refresh troop roster if missing
  if (!cache.value.heroGetAll?.data || !cache.value['getUnitSummary:unit']?.data) {
    statusMessage.value = 'Refreshing troops and roster data...';
    await refreshTroops();
  }

  const firstMobId = selectedMobId.value;
  // The background controller searches and continues if this target is missing or stale.
  isRunning.value = true;
  queueStatusText.value = 'Starting...';
  statusMessage.value = 'Dispatching rally raid to game...';

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const res = await chrome.runtime.sendMessage({
      kind: 'raid-queue-start',
      options: {
        mapId,
        center,
        firstMobId,
        level: bossLevel.value,
        waitSeconds: waitSeconds.value,
        minMembers: minMembers.value,
        count,
        autoCancel: autoCancel.value,
        heroIds,
        teamId,
        maxTroops,
      },
    }).catch((err) => ({ error: String(err) }));

    if (res?.ok) {
      queueStatusText.value = res.phase || (res.queued ? 'Queued' : 'Active');
      statusMessage.value = res.phase === 'waiting_rally'
        ? 'Active guild raid in progress. Queue created — will start automatically once current raid attacks.'
        : (res.queued
          ? 'Rally queued for next game interaction.'
          : `Raid started against boss! Active rounds: ${count}.`);
    } else {
      isRunning.value = false;
      queueStatusText.value = 'Idle';
      statusMessage.value = res?.error || 'Could not start rally raid.';
    }
  }
}

async function stopRaidQueue() {
  isRunning.value = false;
  queueStatusText.value = 'Stopped';
  statusMessage.value = 'Raid queue stopped.';
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'raid-queue-stop' });
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    id="raid-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="raid-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"

  >
    <div
      class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-indigo-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-indigo-900/50 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        id="raid-dialog-header"
        class="sticky top-0 z-10 flex items-center justify-between border-b border-indigo-200 bg-indigo-50/80 px-4 py-3 backdrop-blur dark:border-indigo-900/60 dark:bg-indigo-950/50 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span id="raid-dialog-icon" class="text-xl shrink-0" aria-hidden="true">{{ currentRaidStageIcon }}</span>
          <h2 id="raid-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Rally raid
          </h2>
          <div id="raid-dialog-status" class="flex items-center gap-2 truncate">
            <span
              v-if="currentRaidPhase"
              class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-2xs sm:text-xs font-semibold text-indigo-900 border border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800/60 shrink-0"
            >
              <span>{{ currentRaidStageIcon }}</span>
              <span class="size-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <span>
                {{ activeRallies[0]?.rally?.target || 'Rally' }}: {{ currentRaidPhase.phase }}<template v-if="currentRaidPhase.result"> ({{ currentRaidPhase.result }})</template>
              </span>
              <span
                v-if="currentRaidCountdown !== null"
                id="raid-dialog-timer"
                :data-experimental-until="currentRaidPhase?.until ? String(currentRaidPhase.until) : undefined"
                class="font-mono"
              >
                · {{ currentRaidCountdown }}s
              </span>
            </span>
            <span
              v-if="isRunning || !currentRaidPhase"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0"
              :class="
                isRunning
                  ? (queueStatusText === 'waiting_rally'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60')
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60'
              "
            >
              <span class="size-1.5 rounded-full" :class="isRunning ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'"></span>
              <span>{{ isRunning ? `Queue: ${queueStatusLabel}${remainRaidCount != null ? ` (${remainRaidCount} left)` : ''}` : queueStatusText }}</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close Raid dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="raid-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Section 1: Team & Troop Deployment -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>👥</span> Battle Squad & Troop Deployment
            </h3>
            <span
              class="text-2xs font-mono font-medium px-2 py-0.5 rounded border inline-flex items-center gap-1"
              :class="
                mapContext?.mapId
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
              "
              :title="mapContext?.mapId ? `Current World Map ID: ${mapContext.mapId}` : 'World Map not captured yet. Open map in game or click Locate on Map.'"
            >
              <span>🗺️</span>
              <span>Map: {{ mapContext?.mapId || 'Not detected' }}</span>
            </span>
          </div>

          <!-- Team Selector -->
          <div>
            <label for="raid-team-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Select Team
            </label>
            <select
              id="raid-team-select"
              v-model="selectedTeamId"
              class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
              @change="handleTeamChange(selectedTeamId)"
            >
              <option
                v-for="t in teams"
                :key="t.id"
                :value="t.id"
                class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                {{ t.label }} ({{ t.heroIds.length }}/5)
              </option>
            </select>
          </div>

          <!-- Selected Team Preview -->
          <div v-if="selectedTeam && selectedTeam.heroIds.length > 0" class="space-y-1.5">
            <div class="text-xs font-medium text-slate-600 dark:text-slate-400">
              Active March Heroes ({{ selectedTeam.heroIds.length }}/5):
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-for="hid in selectedTeam.heroIds"
                :key="hid"
                class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs"
              >
                <!-- Avatar with Star Glow Aura -->
                <span
                  class="relative size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
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

                <span class="font-medium truncate max-w-[110px]">{{ getHeroName(hid) }}</span>

                <!-- Hover Card -->
                <HeroHoverCard
                  :hero-id="hid"
                  :hero="getHeroSnapshot(hid)"
                  :inventory="cache.inventoryGet?.data"
                />
              </span>
            </div>
          </div>
          <div v-else class="text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠️ No complete 5-hero team selected. Please select or configure a team.
          </div>

          <!-- Troop Allocation Summary -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span class="font-semibold">
                Troops: <strong class="text-slate-800 dark:text-slate-200">{{ formatNumber(totalAllocatedTroops) }}</strong> / {{ formatNumber(squadCapacity) }}
              </span>
              <button
                type="button"
                :disabled="isRefreshingTroops"
                class="cursor-pointer text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 text-xs"
                title="Refresh available troops"
                @click="refreshTroops"
              >
                <span :class="{ 'inline-block animate-spin': isRefreshingTroops }">↻</span>
                <span>Refresh troops</span>
              </button>
            </div>

            <!-- 3 Troop Type Cards -->
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div
                v-for="b in troopTypeSummaries"
                :key="b.type"
                class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
              >
                <div class="font-semibold text-slate-800 dark:text-slate-200">
                  {{ b.label }}: {{ formatNumber(b.total) }}
                </div>
                <div class="text-[10px] text-slate-400 mt-1 truncate" :title="b.tiersText">
                  {{ b.tiersText }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 2: Target & Raid Settings -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>⚙️</span> Boss Search & Raid Parameters
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <!-- Boss Level with Find Button -->
            <div>
              <label for="raid-boss-level" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Boss Level
              </label>
              <div class="flex items-stretch overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                <select
                  id="raid-boss-level"
                  v-model.number="bossLevel"
                  class="flex-1 min-w-0 border-0 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  @change="savePreferences"
                >
                  <option
                    v-for="lvl in 30"
                    :key="lvl"
                    :value="lvl"
                    class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  >
                    Boss level {{ lvl }}
                  </option>
                </select>

                <button
                  type="button"
                  :disabled="isSearchingBosses"
                  class="cursor-pointer px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50"
                  title="Search map for bosses at this level"
                  @click="findBosses"
                >
                  <span>{{ isSearchingBosses ? 'Searching...' : 'Find' }}</span>
                </button>
              </div>
            </div>

            <!-- Target Boss Select -->
            <div>
              <label for="raid-target-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Target ({{ matchingBossConfig ? `${foundBosses.length} target(s) found` : 'Search level first' }})
              </label>
              <select
                id="raid-target-select"
                v-model="selectedMobId"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option v-if="foundBosses.length === 0" value="" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                  No targets found (Click "Find")
                </option>
                <option
                  v-for="(target, idx) in foundBosses"
                  :key="target.mobId || idx"
                  :value="target.mobId"
                  class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  Boss {{ Number(idx) + 1 }} · ({{ target.coordinates?.x ?? '?' }}, {{ target.coordinates?.y ?? '?' }})
                </option>
              </select>
            </div>

            <!-- Rally Wait Seconds -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Rally Wait Time
              </label>
              <select
                v-model.number="waitSeconds"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option :value="60" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">1 minute (60s)</option>
                <option :value="300" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">5 minutes (300s)</option>
                <option :value="900" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">15 minutes (900s)</option>
                <option :value="1800" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">30 minutes (1800s)</option>
              </select>
            </div>

            <!-- Auto-cancel and member threshold -->
            <div>
              <label for="raid-min-members" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Minimum Members
              </label>
              <div class="flex items-stretch overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                <label class="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300" title="Cancel the rally in the last 10 seconds if members are below this minimum">
                  <input
                    id="raid-auto-cancel"
                    v-model="autoCancel"
                    type="checkbox"
                    class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 shrink-0"
                    @change="savePreferences"
                  />
                  <span>Auto-cancel · last 10s</span>
                </label>
                <input
                  id="raid-min-members"
                  v-model.number="minMembers"
                  type="number"
                  min="1"
                  max="6"
                  class="w-16 shrink-0 border-0 border-l border-slate-300 dark:border-slate-700 bg-transparent px-2 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  @change="savePreferences"
                />
              </div>
            </div>
          </div>

          <!-- Raid Count -->
          <div>
            <label for="raid-queue-count" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Rounds / Attack Count (for queue)
            </label>
            <input
              id="raid-queue-count"
              v-model.number="raidCount"
              type="number"
              min="1"
              max="100"
              class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
            />
          </div>

          <div class="rounded-lg border border-indigo-200 dark:border-indigo-900 p-3 space-y-2">
            <label class="flex items-center gap-2 text-xs font-semibold">
              <input id="raid-auto-energy" v-model="autoEnergyRaid" type="checkbox" @change="saveAutoRaid" />
              Auto raid when World Energy naturally reaches
              <input id="raid-energy-threshold" v-model.number="energyThreshold" type="number" min="25" max="200" aria-label="World Energy threshold" class="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1" @change="saveAutoRaid" />
            </label>
            <p class="text-xs text-slate-500">Uses the team, boss level, raid count and rally settings above. Triggers only from below to exactly the threshold through natural regeneration; skips startup, item gains and energy already above the threshold.</p>
            <p v-if="autoEnergyMessage" role="status" class="text-xs text-indigo-600 dark:text-indigo-300">{{ autoEnergyMessage }}</p>
          </div>

        </section>

        <!-- Map Missing Warning & Locate Action -->
        <div
          v-if="!mapContext?.mapId || !mapCenter"
          class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span>⚠️</span>
            <span class="truncate">World map not captured yet. Open world map in game or locate coordinates.</span>
          </div>
          <button
            type="button"
            :disabled="isLocatingMap"
            class="cursor-pointer shrink-0 px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 font-bold transition-colors disabled:opacity-50"
            @click="refreshMapCoordinates"
          >
            {{ isLocatingMap ? 'Locating...' : 'Locate on Map' }}
          </button>
        </div>

        <!-- Status Message Banner -->
        <div v-if="statusMessage" class="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200">
          {{ statusMessage }}
        </div>

        <!-- Section 3: Actions & Queue Controls -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            :disabled="isRunning || isSearchingBosses"
            class="cursor-pointer px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
            @click="startRaidQueue(1)"
          >
            ⚔️ Attack Once
          </button>

          <button
            v-if="!isRunning"
            type="button"
            :disabled="isSearchingBosses"
            class="cursor-pointer px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50"
            @click="startRaidQueue(raidCount)"
          >
            ⚔️ Start Raid Queue ({{ raidCount }} Rounds)
          </button>

          <button
            v-else
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-colors animate-pulse"
            @click="stopRaidQueue"
          >
            ⏹ Stop Raid Queue
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
