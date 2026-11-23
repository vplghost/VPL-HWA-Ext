<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { formatNumber } from '@/src/utils/formatters';
import { getHeroAvatar } from '@/src/data/heroMetadata';
import { getHeroName } from '@/src/data/nameData';
import {
  calculateStageEnemyPower,
  getFrontierChestInfo,
  buildFrontierBattlePayload,
  simulateFrontierBattle,
  executeFrontierAutoFight,
  saveFrontierTeam,
  collectFrontierChest,
  refreshFrontierState,
} from '@/src/services/frontierService';
import type { FrontierDefender } from '@/src/types/game/frontier';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const accountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);
const { customTeams } = useAccountTeams(accountId);

// Tab navigation: 'stage' (Lineup & Stage) vs 'automation' (Automation & Simulation)
const activeTab = ref<'stage' | 'automation'>('stage');

// Automation run state
const isRunning = ref(false);
const isPaused = ref(false);
const autoStatusMsg = ref('');
const singleFightLoading = ref(false);
const isSavingTeam = ref(false);
const isCollectingChest = ref(false);
const isRefreshing = ref(false);

// Automation options
const maxStages = ref<number>(10);
const delayMs = ref<number>(1000);
const useWasmSim = ref<boolean>(true);
const stopOnDefeat = ref<boolean>(true);
const maxDefeats = ref<number>(1); // 1, 5, 10
const rotateTeams = ref<boolean>(false);
const selectedRotateTeamIds = ref<string[]>([]);

// Live combat log
interface CombatLogEntry {
  id: string;
  time: string;
  stage: number;
  simResult?: { win: boolean; message?: string };
  serverResult?: { win: boolean; reward?: any; error?: string };
  status: 'win' | 'defeat' | 'sim-aborted' | 'error';
  detail: string;
}
const combatLogs = ref<CombatLogEntry[]>([]);

// State data from cache
const statusData = computed(() => cache.value.eternalStoryStatus?.data);
const mission = computed(() => statusData.value?.mission);
const currentStage = computed(() => mission.value?.position ?? 1);
const world = computed(() => mission.value?.world ?? 1);
const defenders = computed<FrontierDefender[]>(() => mission.value?.defender_packs?.[0] || []);
const enemyPower = computed(() => calculateStageEnemyPower(defenders.value));

const chestData = computed(() => cache.value.eternalStoryChestStatus?.data);
const chestInfo = computed(() => getFrontierChestInfo(chestData.value));

// Owned heroes from heroGetAll
const ownedHeroes = computed(() => {
  const data = cache.value.heroGetAll?.data || {};
  return Object.entries(data).map(([id, h]: [string, any]) => ({
    id: Number(id),
    name: getHeroName(id),
    level: Number(h.level) || 1,
    color: Number(h.color) || 1,
    star: Number(h.star) || 1,
    power: Number(h.power) || 0,
    skills: h.skills || {},
    artifacts: h.artifacts || [],
    talisman: h.talisman,
    skins: h.skins,
    currentSkin: h.currentSkin,
  })).sort((a, b) => b.power - a.power);
});

// Filter hero-only custom teams (exclude titans)
const heroCustomTeams = computed(() => {
  return customTeams.value.filter(t => t.type !== 'titan' && !t.heroIds.some(id => Number(id) >= 4000));
});

// Available preset teams (Custom Teams + Server-saved Teams)
interface PresetTeamOption {
  id: string;
  name: string;
  heroIds: number[];
  source: 'custom' | 'server';
}
const availablePresetTeams = computed<PresetTeamOption[]>(() => {
  const list: PresetTeamOption[] = [];

  // 1. Custom Teams
  for (const ct of heroCustomTeams.value) {
    if (ct.heroIds && ct.heroIds.length > 0) {
      list.push({
        id: `custom_${ct.id}`,
        name: ct.name || `Custom Team #${ct.id}`,
        heroIds: ct.heroIds.map(Number),
        source: 'custom',
      });
    }
  }

  // 2. Server Teams from teamGetAll
  const serverData = cache.value.teamGetAll?.data || {};
  const serverLabels: Record<string, string> = {
    eternalStory: 'Frontier Team (Saved)',
    arena: 'Arena Defense',
    magicTower: 'Tower Team',
    bossFight: 'Guild Boss / Raid',
    dungeon: 'Dungeon Team',
    globalMapCamp: 'Brigand Camp',
  };

  for (const [key, val] of Object.entries(serverData)) {
    if (!val) continue;
    let ids: number[] = [];
    if (Array.isArray(val)) {
      if (val.length > 0 && Array.isArray(val[0])) ids = val[0].map(Number);
      else ids = val.map(Number);
    }
    if (ids.length > 0 && !ids.some(id => id >= 4000)) {
      const label = serverLabels[key] || `Server ${key}`;
      list.push({
        id: `server_${key}`,
        name: label,
        heroIds: ids.slice(0, 5),
        source: 'server',
      });
    }
  }

  return list;
});

// Auto-select initial rotate teams if empty
watch(
  availablePresetTeams,
  (teams) => {
    if (selectedRotateTeamIds.value.length === 0 && teams.length > 0) {
      selectedRotateTeamIds.value = teams.slice(0, 3).map(t => t.id);
    }
  },
  { immediate: true }
);

// Selected squad for Frontier (5 hero IDs)
const selectedSquad = ref<number[]>([]);

// Initialize squad from cache or highest power heroes
function initSquad() {
  const cachedTeam = cache.value.eternalStoryTeam?.data?.units?.[0]
    || cache.value.teamGetAll?.data?.eternalStory;
  if (Array.isArray(cachedTeam) && cachedTeam.length > 0) {
    selectedSquad.value = cachedTeam.map(Number).slice(0, 5);
  } else if (ownedHeroes.value.length > 0) {
    selectedSquad.value = ownedHeroes.value.slice(0, 5).map(h => h.id);
  }
}

watch(
  () => [props.modelValue, cache.value.eternalStoryTeam, cache.value.teamGetAll],
  () => {
    if (selectedSquad.value.length === 0) {
      initSquad();
    }
  },
  { immediate: true }
);

// Squad power calculation
const playerSquadHeroes = computed(() => {
  const map = new Map(ownedHeroes.value.map(h => [h.id, h]));
  return selectedSquad.value.map(id => map.get(id)).filter(Boolean) as any[];
});
const playerSquadPower = computed(() => {
  return playerSquadHeroes.value.reduce((sum, h) => sum + (h.power || 0), 0);
});
const powerDelta = computed(() => {
  return playerSquadPower.value - enemyPower.value;
});

// Handle loading a team preset
function onSelectPresetTeam(teamId: string) {
  if (!teamId) return;
  const target = availablePresetTeams.value.find(t => t.id === teamId);
  if (target && target.heroIds.length > 0) {
    selectedSquad.value = [...target.heroIds.slice(0, 5)];
    autoStatusMsg.value = `Loaded preset: "${target.name}" (${selectedSquad.value.length} heroes)`;
    setTimeout(() => { if (autoStatusMsg.value.includes('Loaded preset')) autoStatusMsg.value = ''; }, 3000);
  }
}

// Hero Picker Dialog sub-state
const heroPickerSlot = ref<number | null>(null);
function openHeroPicker(slotIdx: number) {
  heroPickerSlot.value = slotIdx;
}
function selectHeroForSlot(heroId: number) {
  if (heroPickerSlot.value === null) return;
  const newSquad = [...selectedSquad.value];
  const existingIdx = newSquad.indexOf(heroId);
  if (existingIdx !== -1) {
    const temp = newSquad[heroPickerSlot.value];
    newSquad[heroPickerSlot.value] = heroId;
    if (temp != null) newSquad[existingIdx] = temp;
  } else {
    newSquad[heroPickerSlot.value] = heroId;
  }
  selectedSquad.value = newSquad.filter(Boolean).slice(0, 5);
  heroPickerSlot.value = null;
}

// Save team to server
async function handleSaveTeam() {
  if (selectedSquad.value.length === 0 || isSavingTeam.value) return;
  isSavingTeam.value = true;
  autoStatusMsg.value = 'Saving lineup to game server...';
  try {
    const res = await saveFrontierTeam(dispatchRpc, selectedSquad.value);
    if (res?.ok) {
      autoStatusMsg.value = 'Lineup saved successfully!';
    } else {
      autoStatusMsg.value = res?.error || 'Failed to save lineup.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'RPC communication error.';
  } finally {
    isSavingTeam.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('successfully')) autoStatusMsg.value = ''; }, 3000);
  }
}

// Collect AFK chest
async function handleCollectChest() {
  if (isCollectingChest.value) return;
  isCollectingChest.value = true;
  autoStatusMsg.value = 'Collecting AFK chest...';
  try {
    const res = await collectFrontierChest(dispatchRpc);
    if (res?.ok) {
      autoStatusMsg.value = 'AFK chest collected successfully!';
    } else {
      autoStatusMsg.value = res?.error || 'Failed to collect AFK chest.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'Error collecting chest.';
  } finally {
    isCollectingChest.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('successfully')) autoStatusMsg.value = ''; }, 3000);
  }
}

// Refresh state
async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  autoStatusMsg.value = 'Refreshing Frontier status...';
  try {
    const res = await refreshFrontierState(dispatchRpc, selectedSquad.value);
    if (res?.ok) {
      autoStatusMsg.value = 'Frontier refreshed!';
    } else {
      autoStatusMsg.value = res?.error || 'Failed to refresh.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'RPC connection error.';
  } finally {
    isRefreshing.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('refreshed')) autoStatusMsg.value = ''; }, 2500);
  }
}

// Single Fight (Manual execution for 1 stage)
async function handleSingleFight() {
  if (isRunning.value || singleFightLoading.value || selectedSquad.value.length === 0) return;
  singleFightLoading.value = true;
  autoStatusMsg.value = `Attacking Stage ${currentStage.value}...`;

  const stageNum = currentStage.value;
  const timeStr = new Date().toLocaleTimeString();

  try {
    // 1. WASM simulation check if enabled
    if (useWasmSim.value) {
      autoStatusMsg.value = `Simulating Stage ${stageNum} with Unity WASM...`;
      try {
        const battlePayload = buildFrontierBattlePayload(
          playerSquadHeroes.value,
          defenders.value,
          stageNum
        );
        const simRes = await simulateFrontierBattle(battlePayload);
        const win = Boolean(simRes?.victory || (simRes as any)?.win || (simRes?.stars && simRes.stars > 0));
        if (!win) {
          combatLogs.value.unshift({
            id: String(Date.now()),
            time: timeStr,
            stage: stageNum,
            simResult: { win: false, message: 'WASM simulation predicted defeat' },
            status: 'sim-aborted',
            detail: 'Simulation predicted defeat. Battle aborted to prevent loss record on server.',
          });
          autoStatusMsg.value = `Stage ${stageNum}: Simulation predicted defeat. Battle safely aborted.`;
          return;
        }
      } catch (simErr: any) {
        autoStatusMsg.value = `Simulation warning: ${simErr?.message || 'Unity engine unreachable'}. Sending directly...`;
      }
    }

    // 2. Execute autoFight on server
    autoStatusMsg.value = `Dispatching auto fight for Stage ${stageNum}...`;
    const res = await executeFrontierAutoFight(dispatchRpc, selectedSquad.value);
    const respData = res?.results?.[0]?.result?.response || res?.results?.[0]?.response;

    if (respData) {
      const isWin = !respData.lost_battle;
      combatLogs.value.unshift({
        id: String(Date.now()),
        time: timeStr,
        stage: stageNum,
        serverResult: { win: isWin, reward: respData.reward },
        status: isWin ? 'win' : 'defeat',
        detail: isWin
          ? `Victory! Reward: ${respData.reward?.coin?.['23'] || 1000} Frontier Coins.`
          : 'Defeat at this stage.',
      });
      autoStatusMsg.value = isWin
        ? `Stage ${stageNum}: Victory! Advanced to Stage ${respData.state?.mission?.position || stageNum + 1}`
        : `Stage ${stageNum}: Defeat.`;
    } else {
      const errMsg = res?.results?.[0]?.error?.description || res?.error || 'No response from server.';
      combatLogs.value.unshift({
        id: String(Date.now()),
        time: timeStr,
        stage: stageNum,
        status: 'error',
        detail: `Error: ${errMsg}`,
      });
      autoStatusMsg.value = `Error: ${errMsg}`;
    }
  } catch (err: any) {
    autoStatusMsg.value = `Error: ${err?.message || String(err)}`;
  } finally {
    singleFightLoading.value = false;
  }
}

// Auto Battle Loop
let abortController: AbortController | null = null;

// Get active rotation pool of teams
const activeRotationPool = computed(() => {
  if (!rotateTeams.value) return [];
  const selectedSet = new Set(selectedRotateTeamIds.value);
  return availablePresetTeams.value.filter(t => selectedSet.has(t.id));
});

function toggleRotateTeamSelection(teamId: string) {
  const idx = selectedRotateTeamIds.value.indexOf(teamId);
  if (idx !== -1) {
    selectedRotateTeamIds.value.splice(idx, 1);
  } else {
    selectedRotateTeamIds.value.push(teamId);
  }
}

function selectAllRotateTeams() {
  selectedRotateTeamIds.value = availablePresetTeams.value.map(t => t.id);
}

function deselectAllRotateTeams() {
  selectedRotateTeamIds.value = [];
}

async function startAutoFight() {
  if (isRunning.value || selectedSquad.value.length === 0) return;
  if (rotateTeams.value && activeRotationPool.value.length === 0) {
    autoStatusMsg.value = 'Please select at least 1 team to rotate before starting.';
    return;
  }

  isRunning.value = true;
  isPaused.value = false;
  abortController = new AbortController();
  const signal = abortController.signal;

  let clearedInRun = 0;
  let consecutiveDefeats = 0;
  let rotationIndex = 0;

  autoStatusMsg.value = 'Auto Battle started...';

  try {
    while (!signal.aborted && isRunning.value) {
      if (isPaused.value) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (maxStages.value > 0 && clearedInRun >= maxStages.value) {
        autoStatusMsg.value = `Reached configured maximum of ${maxStages.value} stages. Completed.`;
        break;
      }

      const stageNum = currentStage.value;
      const timeStr = new Date().toLocaleTimeString();

      // 1. WASM Simulation if enabled
      if (useWasmSim.value) {
        autoStatusMsg.value = `[Stage ${stageNum}] Running WASM simulation...`;
        try {
          const battlePayload = buildFrontierBattlePayload(
            playerSquadHeroes.value,
            defenders.value,
            stageNum
          );
          const simRes = await simulateFrontierBattle(battlePayload);
          const win = Boolean(simRes?.victory || (simRes as any)?.win || (simRes?.stars && simRes.stars > 0));
          if (!win) {
            consecutiveDefeats++;
            combatLogs.value.unshift({
              id: String(Date.now()),
              time: timeStr,
              stage: stageNum,
              simResult: { win: false },
              status: 'sim-aborted',
              detail: `WASM predicted defeat (${consecutiveDefeats}/${maxDefeats.value}).`,
            });

            // Rotate team on simulated loss if enabled
            if (rotateTeams.value && activeRotationPool.value.length > 0) {
              rotationIndex = (rotationIndex + 1) % activeRotationPool.value.length;
              const nextTeam = activeRotationPool.value[rotationIndex];
              selectedSquad.value = [...nextTeam.heroIds.slice(0, 5)];
              combatLogs.value.unshift({
                id: String(Date.now() + 1),
                time: timeStr,
                stage: stageNum,
                status: 'sim-aborted',
                detail: `Rotated to team "${nextTeam.name}" for next attempt.`,
              });
            }

            if (stopOnDefeat.value && consecutiveDefeats >= maxDefeats.value) {
              autoStatusMsg.value = `[Stage ${stageNum}] Reached defeat limit (${consecutiveDefeats}/${maxDefeats.value}). Stopped safely.`;
              break;
            }

            if (delayMs.value > 0) {
              await new Promise(r => setTimeout(r, delayMs.value));
            }
            continue;
          }
        } catch (simErr: any) {
          // If simulation is not available, proceed to server
        }
      }

      // 2. Dispatch server fight
      autoStatusMsg.value = `[Stage ${stageNum}] Fighting on server...`;
      const res = await executeFrontierAutoFight(dispatchRpc, selectedSquad.value);
      if (signal.aborted) break;

      const respData = res?.results?.[0]?.result?.response || res?.results?.[0]?.response;
      if (respData) {
        const isWin = !respData.lost_battle;
        if (isWin) {
          clearedInRun++;
          consecutiveDefeats = 0; // Reset consecutive defeats on win
          combatLogs.value.unshift({
            id: String(Date.now()),
            time: timeStr,
            stage: stageNum,
            serverResult: { win: true, reward: respData.reward },
            status: 'win',
            detail: `Cleared Stage ${stageNum}! Earned ${respData.reward?.coin?.['23'] || 1000} Coins.`,
          });
          autoStatusMsg.value = `[Stage ${stageNum}] Victory! Total cleared: ${clearedInRun} stages.`;
        } else {
          consecutiveDefeats++;
          combatLogs.value.unshift({
            id: String(Date.now()),
            time: timeStr,
            stage: stageNum,
            serverResult: { win: false },
            status: 'defeat',
            detail: `Defeat at Stage ${stageNum} (Defeat count: ${consecutiveDefeats}/${maxDefeats.value}).`,
          });

          // Rotate team on defeat if enabled
          if (rotateTeams.value && activeRotationPool.value.length > 0) {
            rotationIndex = (rotationIndex + 1) % activeRotationPool.value.length;
            const nextTeam = activeRotationPool.value[rotationIndex];
            selectedSquad.value = [...nextTeam.heroIds.slice(0, 5)];
            combatLogs.value.unshift({
              id: String(Date.now() + 1),
              time: timeStr,
              stage: stageNum,
              status: 'defeat',
              detail: `Rotated to team "${nextTeam.name}" for attempt ${consecutiveDefeats + 1}.`,
            });
          }

          if (stopOnDefeat.value && consecutiveDefeats >= maxDefeats.value) {
            autoStatusMsg.value = `[Stage ${stageNum}] Defeat limit reached (${consecutiveDefeats}/${maxDefeats.value}). Stopped.`;
            break;
          }
        }
      } else {
        const errMsg = res?.results?.[0]?.error?.description || res?.error || 'Server error';
        combatLogs.value.unshift({
          id: String(Date.now()),
          time: timeStr,
          stage: stageNum,
          status: 'error',
          detail: `RPC error: ${errMsg}`,
        });
        autoStatusMsg.value = `Stopped due to error: ${errMsg}`;
        break;
      }

      // Delay between stages
      if (delayMs.value > 0) {
        await new Promise(r => setTimeout(r, delayMs.value));
      }
    }
  } catch (err: any) {
    autoStatusMsg.value = `Stopped due to error: ${err?.message || String(err)}`;
  } finally {
    isRunning.value = false;
    isPaused.value = false;
    abortController = null;
  }
}

function stopAutoFight() {
  if (abortController) {
    abortController.abort();
  }
  isRunning.value = false;
  isPaused.value = false;
  autoStatusMsg.value = 'Auto Battle stopped.';
}

function togglePauseAutoFight() {
  isPaused.value = !isPaused.value;
  autoStatusMsg.value = isPaused.value ? 'Auto Battle paused.' : 'Resuming Auto Battle...';
}

function clearCombatLogs() {
  combatLogs.value = [];
}

onUnmounted(() => {
  stopAutoFight();
});
</script>

<template>
  <ModalDialog
    v-model="props.modelValue"
    title="Frontier"
    icon="🧭"
    max-width="max-w-4xl"
    modal-name="frontier"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Top Action & Navigation Bar -->
      <div class="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <!-- Tabs -->
        <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg">
          <button
            type="button"
            class="px-3 py-1.5 font-semibold rounded-md transition-all flex items-center gap-1.5"
            :class="
              activeTab === 'stage'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            "
            @click="activeTab = 'stage'"
          >
            <span>⚔️</span>
            <span>Lineup & Stage</span>
          </button>
          <button
            type="button"
            class="px-3 py-1.5 font-semibold rounded-md transition-all flex items-center gap-1.5"
            :class="
              activeTab === 'automation'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            "
            @click="activeTab = 'automation'"
          >
            <span>⚡</span>
            <span>Automation & Simulation</span>
            <span v-if="isRunning" class="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
          </button>
        </div>

        <!-- AFK Chest Summary & Collect Button -->
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800">
            <span>🎁</span>
            <span class="text-slate-600 dark:text-slate-300 font-medium">AFK Chest:</span>
            <strong class="text-amber-600 dark:text-amber-400">{{ chestInfo.coins.toLocaleString() }}</strong>
            <span class="text-violet-500">({{ chestInfo.percent }}%)</span>
          </div>

          <button
            type="button"
            :disabled="isCollectingChest || !chestInfo.hasReward"
            class="px-3 py-1 rounded-lg font-semibold transition-all shadow-2xs"
            :class="
              chestInfo.hasReward
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            "
            @click="handleCollectChest"
          >
            <span v-if="isCollectingChest" class="animate-spin inline-block mr-1">⏳</span>
            <span>Collect Chest</span>
          </button>

          <button
            type="button"
            :disabled="isRefreshing"
            class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Refresh Frontier state from game"
            @click="handleRefresh"
          >
            <span :class="{ 'animate-spin inline-block': isRefreshing }">🔄</span>
          </button>
        </div>
      </div>

      <!-- Global Status Notification Banner -->
      <div
        v-if="autoStatusMsg"
        role="status"
        class="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200 font-medium flex items-center justify-between"
      >
        <span>{{ autoStatusMsg }}</span>
        <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" @click="autoStatusMsg = ''">✕</button>
      </div>

      <!-- TAB 1: LINEUP & STAGE -->
      <div v-if="activeTab === 'stage'" class="space-y-4">
        <!-- Stage Overview Header -->
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-base font-bold text-slate-800 dark:text-slate-100">
                Stage {{ currentStage }}
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                World {{ world }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">Defeat the defending team to claim Frontier Coins and advance to the next stage.</p>
          </div>

          <div class="flex items-center gap-4 text-center">
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Enemy Power</div>
              <div class="text-sm font-bold text-amber-600 dark:text-amber-400">
                ⚡ {{ formatNumber(enemyPower) }}
              </div>
            </div>
            <div class="text-slate-300 dark:text-slate-700 font-bold text-base">VS</div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Your Squad Power</div>
              <div class="text-sm font-bold text-sky-600 dark:text-sky-400">
                🛡️ {{ formatNumber(playerSquadPower) }}
              </div>
            </div>
            <div class="border-l border-slate-200 dark:border-slate-800 pl-3 text-left">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Difference</div>
              <div
                class="text-xs font-bold"
                :class="powerDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                {{ powerDelta >= 0 ? `+${formatNumber(powerDelta)}` : formatNumber(powerDelta) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Enemy Defenders Lineup -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>👹</span>
              <span>Defending Lineup ({{ defenders.length }} heroes):</span>
            </h4>
            <span class="text-[11px] text-slate-400">Total Power: {{ formatNumber(enemyPower) }}</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div
              v-for="d in defenders"
              :key="d.id"
              class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center relative"
            >
              <img
                v-if="getHeroAvatar(d.id)"
                :src="getHeroAvatar(d.id)!"
                :alt="getHeroName(d.id)"
                class="w-12 h-12 rounded-lg object-cover border-2 border-slate-300 dark:border-slate-600 shadow-2xs mb-1"
                loading="lazy"
              />
              <div v-else class="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs mb-1">
                {{ d.id }}
              </div>
              <span class="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-full">
                {{ getHeroName(d.id) }}
              </span>
              <span class="text-[10px] text-slate-400">Lv.{{ d.level || 120 }} · Rank {{ d.color || 11 }}</span>
              <span class="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                ⚡ {{ formatNumber(d.power) }}
              </span>

              <!-- Star badge -->
              <span class="absolute top-1 right-1 text-[9px] bg-amber-500 text-slate-950 font-bold px-1 rounded shadow-2xs">
                ⭐{{ d.star || 5 }}
              </span>
            </div>
          </div>
        </div>

        <!-- Player Squad Lineup with Team Preset Picker -->
        <div class="space-y-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h4 class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Your Lineup (5 heroes):</span>
            </h4>

            <!-- Team Preset Picker & Save Team -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Preset Picker Dropdown -->
              <div class="flex items-center gap-1.5">
                <label for="frontier-preset-picker" class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Load Preset:
                </label>
                <select
                  id="frontier-preset-picker"
                  class="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 max-w-44 truncate"
                  @change="onSelectPresetTeam(($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled selected>-- Select Team Preset --</option>
                  <optgroup v-if="heroCustomTeams.length > 0" label="Custom Teams">
                    <option v-for="t in heroCustomTeams" :key="t.id" :value="`custom_${t.id}`">
                      {{ t.name }}
                    </option>
                  </optgroup>
                  <optgroup label="Server Teams">
                    <option v-for="t in availablePresetTeams.filter(t => t.source === 'server')" :key="t.id" :value="t.id">
                      {{ t.name }}
                    </option>
                  </optgroup>
                </select>
              </div>

              <span class="text-[11px] text-slate-400">Power: {{ formatNumber(playerSquadPower) }}</span>
              <button
                type="button"
                :disabled="isSavingTeam || selectedSquad.length === 0"
                class="px-2.5 py-1 rounded text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-all shadow-2xs"
                title="Save this lineup as default for Frontier on server"
                @click="handleSaveTeam"
              >
                {{ isSavingTeam ? 'Saving...' : 'Save Lineup' }}
              </button>
            </div>
          </div>

          <!-- 5 Squad Slots -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div
              v-for="(slotHero, idx) in playerSquadHeroes"
              :key="slotHero ? slotHero.id : `empty-${idx}`"
              class="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex flex-col items-center text-center relative group cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-all"
              title="Click to replace hero"
              @click="openHeroPicker(idx)"
            >
              <img
                v-if="getHeroAvatar(slotHero.id)"
                :src="getHeroAvatar(slotHero.id)!"
                :alt="slotHero.name"
                class="w-12 h-12 rounded-lg object-cover border-2 border-violet-400/80 dark:border-violet-500/80 shadow-2xs mb-1"
                loading="lazy"
              />
              <div v-else class="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs mb-1">
                {{ slotHero.id }}
              </div>
              <span class="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-full">
                {{ slotHero.name }}
              </span>
              <span class="text-[10px] text-slate-400">Lv.{{ slotHero.level }} · ⭐{{ slotHero.star }}</span>
              <span class="text-[11px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                ⚡ {{ formatNumber(slotHero.power) }}
              </span>
              <span class="text-[9px] text-violet-500 dark:text-violet-400 underline mt-0.5 group-hover:text-violet-600">
                Change Hero
              </span>
            </div>

            <!-- Empty slots fill up to 5 -->
            <div
              v-for="emptyIdx in Math.max(0, 5 - playerSquadHeroes.length)"
              :key="`unfilled-${emptyIdx}`"
              class="p-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center cursor-pointer hover:border-violet-400 transition-all min-h-28"
              @click="openHeroPicker(playerSquadHeroes.length + emptyIdx - 1)"
            >
              <span class="text-xl text-slate-400 mb-1">+</span>
              <span class="text-[11px] text-slate-400 font-medium">Select Hero</span>
            </div>
          </div>
        </div>

        <!-- Quick Single Fight Button -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            :disabled="singleFightLoading || isRunning || selectedSquad.length === 0"
            class="px-4 py-2 font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-all shadow-sm flex items-center gap-1.5"
            @click="handleSingleFight"
          >
            <span v-if="singleFightLoading" class="animate-spin inline-block">⏳</span>
            <span>Single Battle (Stage {{ currentStage }})</span>
          </button>
        </div>
      </div>

      <!-- TAB 2: AUTOMATION & SIMULATION -->
      <div v-else class="space-y-4">
        <!-- Settings & Automation Panel -->
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>🤖</span>
                <span>Automation Settings</span>
              </h4>
              <p class="text-[11px] text-slate-400">Push stages automatically with safe WASM simulation and smart team rotation</p>
            </div>

            <!-- Auto Fight Main Actions -->
            <div class="flex items-center gap-2">
              <button
                v-if="!isRunning"
                type="button"
                :disabled="selectedSquad.length === 0 || (rotateTeams && activeRotationPool.length === 0)"
                class="px-4 py-2 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center gap-1.5"
                @click="startAutoFight"
              >
                <span>▶ Start Auto Battle</span>
              </button>

              <template v-else>
                <button
                  type="button"
                  class="px-3 py-2 font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 transition-all shadow-sm"
                  @click="togglePauseAutoFight"
                >
                  {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
                </button>
                <button
                  type="button"
                  class="px-3 py-2 font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm"
                  @click="stopAutoFight"
                >
                  ⏹ Stop
                </button>
              </template>
            </div>
          </div>

          <!-- Primary Options Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <!-- Max Stages -->
            <div>
              <label for="frontier-max-stages" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Max Stages:
              </label>
              <select
                id="frontier-max-stages"
                v-model.number="maxStages"
                :disabled="isRunning"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option :value="1">1 Stage</option>
                <option :value="5">5 Stages</option>
                <option :value="10">10 Stages</option>
                <option :value="25">25 Stages</option>
                <option :value="50">50 Stages</option>
                <option :value="0">Unlimited</option>
              </select>
            </div>

            <!-- Delay Between Battles -->
            <div>
              <label for="frontier-delay-ms" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Delay Between Battles:
              </label>
              <select
                id="frontier-delay-ms"
                v-model.number="delayMs"
                :disabled="isRunning"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option :value="500">0.5 seconds</option>
                <option :value="1000">1.0 second</option>
                <option :value="1500">1.5 seconds</option>
                <option :value="2000">2.0 seconds</option>
              </select>
            </div>

            <!-- Use WASM Simulation -->
            <div class="flex items-center gap-2 pt-5">
              <input
                id="frontier-opt-wasm"
                v-model="useWasmSim"
                type="checkbox"
                :disabled="isRunning"
                class="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label for="frontier-opt-wasm" class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                WASM Pre-Battle Sim
              </label>
            </div>

            <!-- Stop On Defeat -->
            <div class="flex items-center gap-2 pt-5">
              <input
                id="frontier-opt-stop-defeat"
                v-model="stopOnDefeat"
                type="checkbox"
                :disabled="isRunning"
                class="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label for="frontier-opt-stop-defeat" class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                Stop on Defeat
              </label>
            </div>
          </div>

          <!-- Secondary Defeat & Rotation Controls (Active when Stop on Defeat is checked) -->
          <div
            v-if="stopOnDefeat"
            class="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div class="flex items-center justify-between flex-wrap gap-3">
              <!-- Defeats Before Stopping Dropdown -->
              <div class="flex items-center gap-2">
                <label for="frontier-max-defeats" class="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  Max Defeats Before Stopping:
                </label>
                <select
                  id="frontier-max-defeats"
                  v-model.number="maxDefeats"
                  :disabled="isRunning"
                  class="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                >
                  <option :value="1">1 Defeat</option>
                  <option :value="5">5 Defeats</option>
                  <option :value="10">10 Defeats</option>
                </select>
              </div>

              <!-- Rotate Teams Checkbox -->
              <div class="flex items-center gap-2">
                <input
                  id="frontier-opt-rotate-teams"
                  v-model="rotateTeams"
                  type="checkbox"
                  :disabled="isRunning"
                  class="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <label for="frontier-opt-rotate-teams" class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  Rotate Teams on Defeat
                </label>
              </div>
            </div>

            <!-- Team Rotation Selection Frame -->
            <div v-if="rotateTeams" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Select Custom Teams for Rotation ({{ selectedRotateTeamIds.length }} selected):
                </span>
                <div class="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    :disabled="isRunning"
                    class="text-violet-600 dark:text-violet-400 hover:underline"
                    @click="selectAllRotateTeams"
                  >
                    Select All
                  </button>
                  <span class="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    :disabled="isRunning"
                    class="text-slate-400 hover:underline"
                    @click="deselectAllRotateTeams"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <!-- Warning if no teams selected -->
              <div
                v-if="selectedRotateTeamIds.length === 0"
                class="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px]"
              >
                ⚠️ Please select at least 1 team to rotate.
              </div>

              <!-- Teams Checkbox Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                <label
                  v-for="team in availablePresetTeams"
                  :key="team.id"
                  class="p-2 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-all"
                  :class="
                    selectedRotateTeamIds.includes(team.id)
                      ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-950/40 text-violet-950 dark:text-violet-100 ring-1 ring-violet-500/50'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  "
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      :checked="selectedRotateTeamIds.includes(team.id)"
                      :disabled="isRunning"
                      class="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      @change="toggleRotateTeamSelection(team.id)"
                    />
                    <div class="min-w-0">
                      <div class="font-semibold truncate">{{ team.name }}</div>
                      <div class="text-[10px] text-slate-400">{{ team.heroIds.length }} heroes</div>
                    </div>
                  </div>
                  <span class="text-[9px] px-1 py-0.5 rounded uppercase font-bold text-slate-400 bg-slate-200 dark:bg-slate-700">
                    {{ team.source }}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Live Combat History & Logs -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>📜</span>
              <span>Combat Logs ({{ combatLogs.length }} battles):</span>
            </h4>
            <button
              v-if="combatLogs.length > 0"
              type="button"
              class="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              @click="clearCombatLogs"
            >
              Clear Logs
            </button>
          </div>

          <div class="max-h-64 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div v-if="combatLogs.length === 0" class="text-center py-6 text-slate-400 text-xs">
              No battle records yet. Click "Single Battle" or "Start Auto Battle" to begin.
            </div>

            <div
              v-for="log in combatLogs"
              :key="log.id"
              class="p-2 rounded-lg flex items-center justify-between text-xs border"
              :class="{
                'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200': log.status === 'win',
                'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200': log.status === 'defeat',
                'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200': log.status === 'sim-aborted',
                'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300': log.status === 'error',
              }"
            >
              <div class="flex items-center gap-2">
                <span class="font-bold text-[11px] px-1.5 py-0.5 rounded bg-white/70 dark:bg-slate-800/80">
                  Stage {{ log.stage }}
                </span>
                <span class="text-[10px] text-slate-400">[{{ log.time }}]</span>
                <span>{{ log.detail }}</span>
              </div>

              <span
                class="font-bold text-[10px] uppercase px-1.5 py-0.5 rounded"
                :class="{
                  'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200': log.status === 'win',
                  'bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200': log.status === 'defeat',
                  'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200': log.status === 'sim-aborted',
                  'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200': log.status === 'error',
                }"
              >
                {{ log.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hero Picker Popup Overlay -->
      <div
        v-if="heroPickerSlot !== null"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        @click.self="heroPickerSlot = null"
      >
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 max-w-xl w-full p-4 space-y-3 shadow-xl max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 class="font-bold text-slate-800 dark:text-slate-100">
              Select Hero for Slot #{{ (heroPickerSlot ?? 0) + 1 }}
            </h4>
            <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" @click="heroPickerSlot = null">✕</button>
          </div>

          <div class="overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 p-1">
            <div
              v-for="h in ownedHeroes"
              :key="h.id"
              class="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-violet-400 dark:hover:border-violet-500 bg-slate-50 dark:bg-slate-800/60 cursor-pointer flex items-center gap-2 transition-all"
              :class="{ 'ring-2 ring-violet-500 bg-violet-50/50 dark:bg-violet-950/40': selectedSquad.includes(h.id) }"
              @click="selectHeroForSlot(h.id)"
            >
              <img
                v-if="getHeroAvatar(h.id)"
                :src="getHeroAvatar(h.id)!"
                :alt="h.name"
                class="w-10 h-10 rounded-lg object-cover"
                loading="lazy"
              />
              <div class="min-w-0">
                <div class="font-semibold text-slate-800 dark:text-slate-200 truncate">{{ h.name }}</div>
                <div class="text-[10px] text-slate-400">Lv.{{ h.level }} · ⭐{{ h.star }}</div>
                <div class="text-[10px] font-bold text-amber-600 dark:text-amber-400">⚡ {{ formatNumber(h.power) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
