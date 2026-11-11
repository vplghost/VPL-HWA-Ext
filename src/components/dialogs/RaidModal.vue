<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useSquadTeams } from '@/src/composables/useSquadTeams';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import { formatNumber } from '@/src/utils/formatters';
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
} = useSquadTeams('raidPreferences', 'rallyTeam');

const bossLevel = ref(1);
const waitSeconds = ref(300);
const minMembers = ref(4);
const raidCount = ref(2);
const autoCancel = ref(true);
const isRunning = ref(false);
const queueStatusText = ref('Idle');

const selectedMobId = ref<string>('');
const isSearchingBosses = ref(false);
const statusMessage = ref<string>('');

// Boss targets found from map search
const searchData = computed(() => cache.value.experimentalRallySearch?.data);

const matchingBossConfig = computed(() => {
  const configId = bossConfigId(bossLevel.value);
  return Boolean(configId && searchData.value?.mobConfigIds?.includes(configId));
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

onMounted(async () => {
  await loadSquadData();

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['raidPreferences', 'raidQueue', 'popupRpcEnabled', 'socketRefreshMode']);
      if (stored.raidPreferences) {
        if (stored.raidPreferences.bossLevel) bossLevel.value = stored.raidPreferences.bossLevel;
        if (stored.raidPreferences.waitSeconds) waitSeconds.value = stored.raidPreferences.waitSeconds;
        if (stored.raidPreferences.minMembers) minMembers.value = stored.raidPreferences.minMembers;
        if (stored.raidPreferences.autoCancel !== undefined) autoCancel.value = stored.raidPreferences.autoCancel;
        if (stored.raidPreferences.rallyTeam) selectedTeamId.value = stored.raidPreferences.rallyTeam;
        if (stored.raidPreferences.targetMobId) selectedMobId.value = stored.raidPreferences.targetMobId;
      }
      if (stored.popupRpcEnabled !== true) {
        await chrome.storage.local.set({ popupRpcEnabled: true });
      }
      if (stored.raidQueue) {
        isRunning.value = stored.raidQueue.running || false;
        queueStatusText.value = stored.raidQueue.phase || 'Idle';
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.raidQueue) {
        const q = changes.raidQueue.newValue;
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
      document.addEventListener('keydown', handleKeydown);
      loadSquadData();
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
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

async function savePreferences() {
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      raidPreferences: {
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

async function findBosses() {
  await ensureRpcEnabled();
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
  await ensureRpcEnabled();
  await savePreferences();

  const heroIds = selectedTeam.value?.heroIds || [];
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
  const isTargetInFound = foundBosses.value.some((b: any) => b.mobId === firstMobId);
  if (!isTargetInFound) {
    if (foundBosses.value.length > 0) {
      firstMobId = foundBosses.value[0].mobId;
      selectedMobId.value = firstMobId;
    } else {
      statusMessage.value = `⚠️ Searching for Level ${bossLevel.value} Boss targets on world map...`;
      await findBosses();
      return;
    }
  }

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
      queueStatusText.value = res.queued ? 'Queued' : 'Active';
      statusMessage.value = res.queued
        ? 'Rally queued for next game interaction.'
        : `Raid started against boss! Active rounds: ${count}.`;
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
    @click.self="close"
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
          <span id="raid-dialog-icon" class="text-xl shrink-0" aria-hidden="true">⚔️</span>
          <h2 id="raid-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Rally raid
          </h2>
          <div id="raid-dialog-status" class="flex items-center gap-2 truncate">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
              :class="
                isRunning
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              "
            >
              <span class="size-1.5 rounded-full" :class="isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"></span>
              {{ queueStatusText }}
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
            <span v-if="selectedTeam" class="text-2xs font-mono text-slate-400">
              ID: {{ selectedTeam.id }}
            </span>
          </div>

          <!-- Team Selector -->
          <div>
            <label for="raid-team-select" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Select Lineup
            </label>
            <select
              id="raid-team-select"
              v-model="selectedTeamId"
              class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
              @change="handleTeamChange(selectedTeamId)"
            >
              <option v-for="t in teams" :key="t.id" :value="t.id">
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
                  class="flex-1 min-w-0 border-0 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  @change="savePreferences"
                >
                  <option v-for="lvl in 30" :key="lvl" :value="lvl">
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
                <option v-if="foundBosses.length === 0" value="">
                  No targets found (Click "Find")
                </option>
                <option
                  v-for="(target, idx) in foundBosses"
                  :key="target.mobId || idx"
                  :value="target.mobId"
                >
                  Boss {{ idx + 1 }} · ({{ target.coordinates?.x ?? '?' }}, {{ target.coordinates?.y ?? '?' }})
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
                <option :value="60">1 minute (60s)</option>
                <option :value="300">5 minutes (300s)</option>
                <option :value="900">15 minutes (900s)</option>
                <option :value="1800">30 minutes (1800s)</option>
              </select>
            </div>

            <!-- Minimum Members -->
            <div>
              <label for="raid-min-members" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Minimum Members
              </label>
              <input
                id="raid-min-members"
                v-model.number="minMembers"
                type="number"
                min="1"
                max="6"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              />
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

          <!-- Auto Cancel Checkbox -->
          <label class="flex items-center gap-2 cursor-pointer pt-1">
            <input
              v-model="autoCancel"
              type="checkbox"
              class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              @change="savePreferences"
            />
            <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">
              Auto-cancel rally in last 10 seconds if squad members &lt; {{ minMembers }}
            </span>
          </label>
        </section>

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
