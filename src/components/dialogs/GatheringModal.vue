<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useSquadTeams } from '@/src/composables/useSquadTeams';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import { formatNumber, formatDuration } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import { isMarchExpired, getMarchBadgeInfo } from '@/src/utils/resourceData';
import {
  getMineConfigId,
  buildSquad,
  buildGatherCall,
  buildMineSearchCall,
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
} = useSquadTeams('autoGatherSettings', 'selectedTeam');

interface AutoGatherSettings {
  enabled: boolean;
  maxMarches: number;
  mineLevel: number;
  mineType: string;
  lastAutoMineType: string | null;
}

const autoSettings = ref<AutoGatherSettings>({
  enabled: false,
  maxMarches: 3,
  mineLevel: 10,
  mineType: 'rotate',
  lastAutoMineType: null,
});

// Manual search
const manualMineType = ref<'food' | 'wood' | 'stone' | 'iron'>('food');
const manualMineLevel = ref<number>(10);
const isSearching = ref(false);
const searchStatus = ref<string>('');
const isDispatching = ref<string | null>(null);

const now = ref(Date.now());
let timer: number | null = null;

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  await loadSquadData();

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['autoGatherSettings', 'popupRpcEnabled', 'socketRefreshMode']);
      if (stored.autoGatherSettings) {
        autoSettings.value = { ...autoSettings.value, ...stored.autoGatherSettings };
      }
    } catch (_) {}
  }

  // Refresh marches to ensure active marches list is completely fresh
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

async function saveAutoSettings() {
  await ensureRpcEnabled();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: autoSettings.value });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: autoSettings.value.enabled ? 'auto-gather-start' : 'auto-gather-stop',
      settings: autoSettings.value,
    });
  }
}

function toggleAutoGather() {
  autoSettings.value.enabled = !autoSettings.value.enabled;
  saveAutoSettings();
}

// Next target mine type in rotation
const nextTargetType = computed(() => {
  if (autoSettings.value.mineType !== 'rotate') return autoSettings.value.mineType;
  const types = ['food', 'wood', 'stone', 'iron'];
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
      const isReturning = m.kind === 'return' || m.stage === 'returnToOutpost';
      const isMoving =
        m.stage === 'moveToTargetInSolo' ||
        (Number.isFinite(m.targetArrivalAt) && now.value < m.targetArrivalAt) ||
        (Number.isFinite(m.endsAt) && now.value < m.endsAt && m.stage !== 'gathering');
      const targetTime = isReturning
        ? (m.endsAt || m.returnAt)
        : isMoving
        ? (m.targetArrivalAt || m.endsAt)
        : null;
      const remainingSec = targetTime && targetTime > now.value
        ? Math.max(0, Math.ceil((targetTime - now.value) / 1000))
        : 0;

      let stageText = 'Gathering at mine';
      if (isReturning) {
        stageText = 'Returning';
      } else if (isMoving && remainingSec > 0) {
        stageText = 'Marching to mine';
      }

      return {
        id: m.id || m.squadId,
        squadId: m.squadId || m.id,
        kind: m.kind,
        stage: stageText,
        remainingSec,
        timerText: (isReturning || isMoving) && remainingSec > 0 ? formatDuration(remainingSec) : 'In progress',
      };
    });
});

// Found full mines matching search criteria
const foundMines = computed(() => {
  const search = cache.value.experimentalMineSearch?.data;
  if (!search || !Array.isArray(search.mines)) return [];
  const expectedConfig = getMineConfigId(manualMineType.value, manualMineLevel.value);
  if (expectedConfig && search.mineConfigId !== expectedConfig) return [];
  return search.mines;
});

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
  const team = selectedTeam.value;
  if (!team || team.heroIds.length !== 5) {
    searchStatus.value = '⚠️ Please select a complete 5-hero team first.';
    return;
  }

  const squad = buildSquad(team.heroIds, allocatedTroops.value) || {
    heroes: team.heroIds.map((heroId) => ({ heroId })),
    units: allocatedTroops.value,
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
    max-width="max-w-3xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Section 1: Team & Squad Parameters -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>👥</span> Gathering Team & Troop Capacity
          </h3>
          <span v-if="selectedTeam" class="text-2xs font-mono text-slate-400">
            ID: {{ selectedTeam.id }}
          </span>
        </div>

        <div>
          <label for="gather-team-select" class="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Select Team
          </label>
          <select
            id="gather-team-select"
            v-model="selectedTeamId"
            class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            @change="handleTeamChange(selectedTeamId)"
          >
            <option v-for="t in teams" :key="t.id" :value="t.id">
              {{ t.label }} ({{ t.heroIds.length }}/5)
            </option>
          </select>
        </div>

        <!-- Team Chips Preview -->
        <div v-if="selectedTeam && selectedTeam.heroIds.length > 0" class="flex flex-wrap items-center gap-2">
          <span
            v-for="hid in selectedTeam.heroIds"
            :key="hid"
            class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          >
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
            <HeroHoverCard
              :hero-id="hid"
              :hero="getHeroSnapshot(hid)"
              :inventory="cache.inventoryGet?.data"
            />
          </span>
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
              class="cursor-pointer text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 flex items-center gap-1 text-xs"
              title="Refresh available troops"
              @click="refreshTroops"
            >
              <span :class="{ 'inline-block animate-spin': isRefreshingTroops }">↻</span>
              <span>Refresh troops</span>
            </button>
          </div>

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

      <!-- Section 2: Auto-Gather Automation Settings -->
      <section class="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-3.5 shadow-xs">
        <div class="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/40 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">⚙️</span>
            <div>
              <h3 class="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                Auto-Gather Automation
              </h3>
              <p class="text-[11px] text-emerald-700 dark:text-emerald-300">
                Automatically search and dispatch squads when marches return to outpost
              </p>
            </div>
          </div>

          <label class="flex items-center gap-2 cursor-pointer font-bold text-emerald-800 dark:text-emerald-200">
            <input
              type="checkbox"
              :checked="autoSettings.enabled"
              class="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              @change="toggleAutoGather"
            />
            <span>{{ autoSettings.enabled ? 'ACTIVE' : 'PAUSED' }}</span>
          </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Mine Target Type
            <select
              v-model="autoSettings.mineType"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option value="rotate">🔄 Auto Rotate (Food → Wood → Stone → Iron)</option>
              <option value="food">🍞 Food Only</option>
              <option value="wood">🌲 Wood Only</option>
              <option value="stone">◆ Stone Only</option>
              <option value="iron">⚙ Iron Only</option>
            </select>
          </label>

          <!-- Mine Level (1 to 10) -->
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Preferred Mine Level (Max 10)
            <select
              v-model.number="autoSettings.mineLevel"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option v-for="lvl in 10" :key="lvl" :value="11 - lvl">
                Level {{ 11 - lvl }}{{ lvl === 1 ? ' (Highest Yield)' : '' }}
              </option>
            </select>
          </label>

          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Max Gathering Marches
            <input
              v-model.number="autoSettings.maxMarches"
              type="number"
              min="1"
              max="10"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            />
          </label>
        </div>

        <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2.5 text-[11px] text-slate-600 dark:text-slate-400">
          <template v-if="autoSettings.enabled">
            <span>Dispatches automatically on game load or when marches return to base if active marches &lt; {{ autoSettings.maxMarches }}. </span>
            <span v-if="autoSettings.mineType === 'rotate'">
              Cycling: Next target is <strong>{{ (nextTargetType || 'gold').toUpperCase() }} (Lv.{{ autoSettings.mineLevel }})</strong>.
            </span>
            <span v-else>
              Target: <strong>{{ autoSettings.mineType.toUpperCase() }} (Lv.{{ autoSettings.mineLevel }})</strong>.
            </span>
          </template>
          <template v-else>
            Auto-gathering is currently paused. Check the box above to automatically search and dispatch squads.
          </template>
        </div>
      </section>

      <!-- Section 3: Manual Search & Dispatch -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>🔍</span> Manual Mine Search & Dispatch
        </h3>

        <div class="flex flex-wrap items-center gap-2.5">
          <select
            v-model="manualMineType"
            class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="food">🍞 Food Mine</option>
            <option value="wood">🌲 Wood Mine</option>
            <option value="stone">◆ Stone Mine</option>
            <option value="iron">⚙ Iron Mine</option>
          </select>

          <!-- Mine Level 1 to 10 -->
          <select
            v-model.number="manualMineLevel"
            class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
          >
            <option v-for="lvl in 10" :key="lvl" :value="11 - lvl">
              Level {{ 11 - lvl }}{{ lvl === 1 ? ' (Max)' : '' }}
            </option>
          </select>

          <button
            type="button"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            :disabled="isSearching"
            @click="handleManualSearch"
          >
            <span>{{ isSearching ? 'Searching...' : 'Find Full Mines' }}</span>
          </button>
        </div>

        <div v-if="searchStatus" class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px]">
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
              class="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
            >
              <div>
                <div class="font-bold text-slate-800 dark:text-slate-200">
                  Mine #{{ Number(idx) + 1 }} · ({{ mine.coordinates?.x ?? '?' }}, {{ mine.coordinates?.y ?? '?' }})
                </div>
                <div class="text-[11px] text-slate-400">
                  Resource: {{ formatNumber(mine.resourceCount || mine.resAmount || 0) }}
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

      <!-- Section 4: Active Gathering Marches -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
          <span class="flex items-center gap-2"><span>⛏️</span> Active Gathering Marches</span>
          <span class="text-xs font-normal text-slate-400">{{ gatheringMarches.length }} active</span>
        </h3>

        <div v-if="gatheringMarches.length === 0" class="p-4 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
          No gathering marches currently active.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="march in gatheringMarches"
            :key="march.id"
            class="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">⛏️</span>
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">Squad #{{ march.id }}</span>
                <span class="text-[11px] text-slate-400 ml-2">{{ march.stage }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
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
