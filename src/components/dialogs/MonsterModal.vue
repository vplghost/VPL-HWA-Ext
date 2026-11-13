<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useSquadTeams } from '@/src/composables/useSquadTeams';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import { formatNumber } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import {
  soloMonsterConfigIds,
  soloMonsterLevel,
} from '@/src/utils/experimentalData';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache } = useRpcCache();

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
} = useSquadTeams('monsterPreferences', 'teamId');

const mobLevel = ref(1);
const mobCount = ref(2);
const isRunning = ref(false);
const queueStatusText = ref('Idle');

const selectedMobId = ref<string>('');
const isSearchingMonsters = ref(false);
const statusMessage = ref<string>('');

// Monster targets found from map search
const searchData = computed(() => cache.value.experimentalSoloSearch?.data);

const matchingMonsterConfigs = computed(() => {
  const cfgs = soloMonsterConfigIds(mobLevel.value) || [mobLevel.value];
  const mobCfgs = normalizeArray(searchData.value?.mobConfigIds);
  return cfgs.length === mobCfgs.length && cfgs.every((c: any, i: number) => c === mobCfgs[i]);
});

const foundMonsters = computed(() => {
  if (!matchingMonsterConfigs.value || !Array.isArray(searchData.value?.mobs)) return [];
  return searchData.value.mobs;
});

watch(mobLevel, () => {
  selectedMobId.value = '';
});

watch(
  foundMonsters,
  (monsters) => {
    if (monsters.length > 0 && (!selectedMobId.value || !monsters.some((m: any) => m.mobId === selectedMobId.value))) {
      selectedMobId.value = monsters[0].mobId;
    }
  },
  { immediate: true }
);

const now = ref(Date.now());
let timer: number | null = null;

const activeAttacks = computed(() => {
  const marches = normalizeArray(cache.value?.marchStatus?.data?.marches);
  return marches.filter(
    (m: any) =>
      (m.kind === 'attack' || Boolean(m.mobConfigId)) &&
      !(Number.isFinite(m.endsAt) && now.value >= m.endsAt)
  );
});

const currentMonsterAttack = computed(() => {
  if (activeAttacks.value.length === 0) return null;
  const march = activeAttacks.value[0];
  const isReturning = march.kind === 'return' || march.stage === 'returnToOutpost';
  const stageName = isReturning ? 'Returning' : (march.stage === 'moveToTarget' ? 'Attacking' : 'In combat');
  const stageIcon = isReturning ? '↩️' : '⚔️';
  const countdown = march.endsAt && march.endsAt > now.value ? Math.max(0, Math.ceil((march.endsAt - now.value) / 1000)) : null;
  return {
    march,
    stageName,
    stageIcon,
    countdown,
    endsAt: march.endsAt,
  };
});

onMounted(async () => {
  await loadSquadData();

  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['monsterPreferences', 'monsterQueue', 'popupRpcEnabled', 'socketRefreshMode']);
      if (stored.monsterPreferences) {
        if (stored.monsterPreferences.mobLevel) mobLevel.value = stored.monsterPreferences.mobLevel;
        if (stored.monsterPreferences.teamId) selectedTeamId.value = stored.monsterPreferences.teamId;
        if (stored.monsterPreferences.targetMobId) selectedMobId.value = stored.monsterPreferences.targetMobId;
      }
      if (stored.popupRpcEnabled !== true) {
        await chrome.storage.local.set({ popupRpcEnabled: true });
      }
      if (stored.monsterQueue) {
        isRunning.value = stored.monsterQueue.running || false;
        queueStatusText.value = stored.monsterQueue.phase || 'Idle';
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.monsterQueue) {
        const q = changes.monsterQueue.newValue;
        isRunning.value = q?.running || false;
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
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode']);
    const updates: Record<string, any> = {};
    if (stored.popupRpcEnabled !== true) updates.popupRpcEnabled = true;
    if (!stored.socketRefreshMode) updates.socketRefreshMode = 'piggyback';
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  }
}

async function savePreferences() {
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      monsterPreferences: {
        mobLevel: mobLevel.value,
        teamId: selectedTeamId.value,
        targetMobId: selectedMobId.value,
      },
    });
  }
}

const isLocatingMap = ref(false);

async function refreshMapCoordinates() {
  isLocatingMap.value = true;
  statusMessage.value = 'Locating coordinates from game...';
  try {
    await dispatchRpc([
      { name: 'getMarches' },
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

async function findMonsters() {
  await ensureRpcEnabled();
  const mapId = mapContext.value?.mapId;
  const center = mapCenter.value;

  if (!mapId || !center) {
    statusMessage.value = '⚠️ World map not captured yet. Open the world map in game to locate coordinates.';
    return;
  }

  const configs = soloMonsterConfigIds(mobLevel.value);
  if (!configs) {
    statusMessage.value = '⚠️ Invalid monster level (must be 1–30).';
    return;
  }

  isSearchingMonsters.value = true;
  statusMessage.value = `Searching for Level ${mobLevel.value} monsters on world map...`;

  const call = {
    name: 'searchMob',
    feature: 'mob',
    args: {
      mapId,
      center,
      mobType: 'solo',
      mobConfigIds: configs,
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
          ? 'Monster search queued for next game RPC. Results will appear shortly.'
          : 'Monster search sent. Checking map...';
      }
    }
  } catch (err: any) {
    statusMessage.value = `Error searching monsters: ${err?.message || err}`;
  } finally {
    isSearchingMonsters.value = false;
  }
}

async function startMonsterQueue(count = mobCount.value) {
  await ensureRpcEnabled();
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
    statusMessage.value = '⚠️ Select a complete 5-hero lineup first.';
    return;
  }

  // Refresh troop roster if missing
  if (!cache.value.heroGetAll?.data || !cache.value['getUnitSummary:unit']?.data) {
    statusMessage.value = 'Refreshing troops and roster data...';
    await refreshTroops();
  }

  let firstMobId = selectedMobId.value;
  const isTargetInFound = foundMonsters.value.some((m: any) => m.mobId === firstMobId);
  if (!isTargetInFound) {
    if (foundMonsters.value.length > 0) {
      firstMobId = foundMonsters.value[0].mobId;
      selectedMobId.value = firstMobId;
    } else {
      statusMessage.value = `⚠️ Searching for Level ${mobLevel.value} monsters on world map...`;
      await findMonsters();
      return;
    }
  }

  isRunning.value = true;
  queueStatusText.value = 'Starting...';
  statusMessage.value = 'Dispatching monster attack to game...';

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const res = await chrome.runtime.sendMessage({
      kind: 'monster-queue-start',
      options: {
        mapId,
        center,
        firstMobId,
        level: mobLevel.value,
        count,
        heroIds,
        teamId,
        maxTroops,
      },
    }).catch((err) => ({ error: String(err) }));

    if (res?.ok) {
      queueStatusText.value = res.queued ? 'Queued' : 'Attacking';
      statusMessage.value = res.queued
        ? 'Attack queued for next game interaction.'
        : `Attack dispatched against monster! Queue rounds: ${count}.`;
    } else {
      isRunning.value = false;
      queueStatusText.value = 'Idle';
      statusMessage.value = res?.error || 'Could not start monster attack.';
    }
  }
}

async function stopMonsterQueue() {
  isRunning.value = false;
  queueStatusText.value = 'Stopped';
  statusMessage.value = 'Monster queue stopped.';
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'monster-queue-stop' });
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    id="monster-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="monster-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    @click.self="close"
  >
    <div
      class="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-amber-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-amber-900/50 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        id="monster-dialog-header"
        class="sticky top-0 z-10 flex items-center justify-between border-b border-amber-200 bg-amber-50/80 px-4 py-3 backdrop-blur dark:border-amber-900/60 dark:bg-amber-950/50 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span id="monster-dialog-icon" class="text-xl shrink-0" aria-hidden="true">{{ currentMonsterAttack?.stageIcon || (isRunning ? '⏱️' : '👾') }}</span>
          <h2 id="monster-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Monster attack
          </h2>
          <div id="monster-dialog-status" class="flex items-center gap-2 truncate">
            <span
              v-if="currentMonsterAttack"
              class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60 shrink-0"
            >
              <span>{{ currentMonsterAttack.stageIcon }}</span>
              <span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span>Monster: {{ currentMonsterAttack.stageName }}</span>
              <span
                v-if="currentMonsterAttack.countdown !== null"
                id="monster-dialog-timer"
                :data-experimental-until="currentMonsterAttack.endsAt ? String(currentMonsterAttack.endsAt) : undefined"
                class="font-mono"
              >
                · {{ currentMonsterAttack.countdown }}s
              </span>
            </span>
            <span
              v-if="isRunning || !currentMonsterAttack"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0"
              :class="
                isRunning
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60'
              "
            >
              <span class="size-1.5 rounded-full" :class="isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"></span>
              <span>{{ isRunning ? `Queue: ${queueStatusText}` : queueStatusText }}</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close Monster dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="monster-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
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
            <label for="monster-team-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Select Lineup
            </label>
            <select
              id="monster-team-select"
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

          <!-- Selected Team Lineup Preview -->
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
            ⚠️ No complete 5-hero squad selected. Please select or configure a lineup.
          </div>

          <!-- Troop Allocation Summary -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span class="font-semibold">
                Troops: <strong class="text-slate-800 dark:text-slate-200">{{ formatNumber(totalAllocatedTroops) }}</strong> / {{ formatNumber(squadCapacity) }} · World Energy: 10 per attack
              </span>
              <button
                type="button"
                :disabled="isRefreshingTroops"
                class="cursor-pointer text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 text-xs"
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

        <!-- Section 2: Monster Search & Attack Parameters -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>⚙️</span> Monster Search & Attack Parameters
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <!-- Monster Level with Find Button -->
            <div>
              <label for="monster-mob-level" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Monster Level
              </label>
              <div class="flex items-stretch overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                <select
                  id="monster-mob-level"
                  v-model.number="mobLevel"
                  class="flex-1 min-w-0 border-0 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  @change="savePreferences"
                >
                  <option
                    v-for="lvl in 30"
                    :key="lvl"
                    :value="lvl"
                    class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  >
                    Monster level {{ lvl }}
                  </option>
                </select>

                <button
                  type="button"
                  :disabled="isSearchingMonsters"
                  class="cursor-pointer px-3.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50"
                  title="Search map for wild monsters at this level"
                  @click="findMonsters"
                >
                  <span>{{ isSearchingMonsters ? 'Searching...' : 'Find' }}</span>
                </button>
              </div>
            </div>

            <!-- Target Monster Select -->
            <div>
              <label for="monster-target-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Target ({{ matchingMonsterConfigs ? `${foundMonsters.length} target(s) found` : 'Search level first' }})
              </label>
              <select
                id="monster-target-select"
                v-model="selectedMobId"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option v-if="foundMonsters.length === 0" value="" class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                  No targets found (Click "Find")
                </option>
                <option
                  v-for="(target, idx) in foundMonsters"
                  :key="target.mobId || idx"
                  :value="target.mobId"
                  class="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  Monster {{ idx + 1 }} · ({{ target.coordinates?.x ?? '?' }}, {{ target.coordinates?.y ?? '?' }})
                </option>
              </select>
            </div>

            <!-- Attack Count -->
            <div class="sm:col-span-2">
              <label for="monster-queue-count" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Attack Count (for queue)
              </label>
              <input
                id="monster-queue-count"
                v-model.number="mobCount"
                type="number"
                min="1"
                max="100"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>

          <p class="text-2xs text-slate-400 dark:text-slate-500 italic">
            Dispatches individual squad attacks against wild monsters sequentially, automatically halting on a loss.
          </p>
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
        <div v-if="statusMessage" class="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          {{ statusMessage }}
        </div>

        <!-- Section 3: Actions & Queue Controls -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            :disabled="isRunning || isSearchingMonsters"
            class="cursor-pointer px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
            @click="startMonsterQueue(1)"
          >
            👾 Attack Once
          </button>

          <button
            v-if="!isRunning"
            type="button"
            :disabled="isSearchingMonsters"
            class="cursor-pointer px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50"
            @click="startMonsterQueue(mobCount)"
          >
            👾 Start Monster Queue ({{ mobCount }} Attacks)
          </button>

          <button
            v-else
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-colors animate-pulse"
            @click="stopMonsterQueue"
          >
            ⏹ Stop Monster Queue
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
