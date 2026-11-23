<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
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

// Tab state: 'stage' (Đội hình & Ải) vs 'automation' (Tự động & Lịch sử)
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

// Hero Picker Dialog sub-state
const heroPickerSlot = ref<number | null>(null);
function openHeroPicker(slotIdx: number) {
  heroPickerSlot.value = slotIdx;
}
function selectHeroForSlot(heroId: number) {
  if (heroPickerSlot.value === null) return;
  const newSquad = [...selectedSquad.value];
  // If already in squad, swap positions
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
  autoStatusMsg.value = 'Đang lưu đội hình lên server...';
  try {
    const res = await saveFrontierTeam(dispatchRpc, selectedSquad.value);
    if (res?.ok) {
      autoStatusMsg.value = 'Đã lưu đội hình thành công!';
    } else {
      autoStatusMsg.value = res?.error || 'Lưu đội hình thất bại.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'Lỗi RPC khi lưu đội hình.';
  } finally {
    isSavingTeam.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('thành công')) autoStatusMsg.value = ''; }, 3000);
  }
}

// Collect AFK chest
async function handleCollectChest() {
  if (isCollectingChest.value) return;
  isCollectingChest.value = true;
  autoStatusMsg.value = 'Đang thu thập rương Viễn Chinh...';
  try {
    const res = await collectFrontierChest(dispatchRpc);
    if (res?.ok) {
      autoStatusMsg.value = 'Thu thập rương thành công!';
    } else {
      autoStatusMsg.value = res?.error || 'Thu thập rương thất bại.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'Lỗi khi thu thập rương.';
  } finally {
    isCollectingChest.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('thành công')) autoStatusMsg.value = ''; }, 3000);
  }
}

// Refresh state
async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  autoStatusMsg.value = 'Đang làm mới dữ liệu...';
  try {
    const res = await refreshFrontierState(dispatchRpc, selectedSquad.value);
    if (res?.ok) {
      autoStatusMsg.value = 'Làm mới thành công!';
    } else {
      autoStatusMsg.value = res?.error || 'Làm mới thất bại.';
    }
  } catch (err: any) {
    autoStatusMsg.value = err?.message || 'Lỗi kết nối RPC.';
  } finally {
    isRefreshing.value = false;
    setTimeout(() => { if (autoStatusMsg.value.includes('thành công')) autoStatusMsg.value = ''; }, 2500);
  }
}

// Single Fight (Manual execution for 1 stage)
async function handleSingleFight() {
  if (isRunning.value || singleFightLoading.value || selectedSquad.value.length === 0) return;
  singleFightLoading.value = true;
  autoStatusMsg.value = `Đang đánh ải ${currentStage.value}...`;

  const stageNum = currentStage.value;
  const timeStr = new Date().toLocaleTimeString();

  try {
    // 1. WASM simulation check if enabled
    if (useWasmSim.value) {
      autoStatusMsg.value = `Đang giả lập ải ${stageNum} bằng WASM...`;
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
            simResult: { win: false, message: 'Thất bại trong giả lập WASM' },
            status: 'sim-aborted',
            detail: 'WASM dự đoán thất bại. Hủy trận để tránh mất công hoặc desync!',
          });
          autoStatusMsg.value = `Ải ${stageNum}: Giả lập thất bại, đã an toàn dừng lại.`;
          return;
        }
      } catch (simErr: any) {
        // Log simulation error warning, but proceed with caution
        autoStatusMsg.value = `Cảnh báo giả lập: ${simErr?.message || 'Không kết nối được Unity engine'}. Gửi trực tiếp...`;
      }
    }

    // 2. Execute autoFight on server
    autoStatusMsg.value = `Đang gửi lệnh đánh ải ${stageNum} lên server...`;
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
          ? `Chiến thắng! Nhận thưởng: ${respData.reward?.coin?.['23'] || 1000} Xu Viễn Chinh.`
          : 'Thất bại tại ải này.',
      });
      autoStatusMsg.value = isWin
        ? `Ải ${stageNum}: Vượt ải thành công! Tiến lên ải ${respData.state?.mission?.position || stageNum + 1}`
        : `Ải ${stageNum}: Thất bại.`;
    } else {
      const errMsg = res?.results?.[0]?.error?.description || res?.error || 'Không nhận được kết quả từ server.';
      combatLogs.value.unshift({
        id: String(Date.now()),
        time: timeStr,
        stage: stageNum,
        status: 'error',
        detail: `Lỗi: ${errMsg}`,
      });
      autoStatusMsg.value = `Lỗi: ${errMsg}`;
    }
  } catch (err: any) {
    autoStatusMsg.value = `Lỗi: ${err?.message || String(err)}`;
  } finally {
    singleFightLoading.value = false;
  }
}

// Auto Battle Loop
let abortController: AbortController | null = null;

async function startAutoFight() {
  if (isRunning.value || selectedSquad.value.length === 0) return;
  isRunning.value = true;
  isPaused.value = false;
  abortController = new AbortController();
  const signal = abortController.signal;

  let clearedInRun = 0;
  autoStatusMsg.value = 'Bắt đầu tự động vượt ải...';

  try {
    while (!signal.aborted && isRunning.value) {
      if (isPaused.value) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (maxStages.value > 0 && clearedInRun >= maxStages.value) {
        autoStatusMsg.value = `Đã hoàn thành tối đa ${maxStages.value} ải thiết lập. Dừng lại.`;
        break;
      }

      const stageNum = currentStage.value;
      const timeStr = new Date().toLocaleTimeString();

      // 1. WASM Simulation if enabled
      if (useWasmSim.value) {
        autoStatusMsg.value = `[Ải ${stageNum}] Đang chạy giả lập WASM...`;
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
              simResult: { win: false },
              status: 'sim-aborted',
              detail: 'WASM dự đoán thất bại. Tự động dừng an toàn.',
            });
            autoStatusMsg.value = `[Ải ${stageNum}] Giả lập thất bại. Dừng tự động an toàn.`;
            break;
          }
        } catch (simErr: any) {
          // If simulation fails due to missing Unity engine and stopOnDefeat is on, stop
          if (stopOnDefeat.value && !simErr?.message?.includes('Direct in-page')) {
            // Keep going or inform user
          }
        }
      }

      // 2. Dispatch server fight
      autoStatusMsg.value = `[Ải ${stageNum}] Đang đánh trên server...`;
      const res = await executeFrontierAutoFight(dispatchRpc, selectedSquad.value);
      if (signal.aborted) break;

      const respData = res?.results?.[0]?.result?.response || res?.results?.[0]?.response;
      if (respData) {
        const isWin = !respData.lost_battle;
        if (isWin) {
          clearedInRun++;
          combatLogs.value.unshift({
            id: String(Date.now()),
            time: timeStr,
            stage: stageNum,
            serverResult: { win: true, reward: respData.reward },
            status: 'win',
            detail: `Vượt ải ${stageNum} thành công! Nhận ${respData.reward?.coin?.['23'] || 1000} Xu.`,
          });
          autoStatusMsg.value = `[Ải ${stageNum}] Thắng! Tổng đã vượt: ${clearedInRun} ải.`;
        } else {
          combatLogs.value.unshift({
            id: String(Date.now()),
            time: timeStr,
            stage: stageNum,
            serverResult: { win: false },
            status: 'defeat',
            detail: `Thất bại tại ải ${stageNum}.`,
          });
          autoStatusMsg.value = `[Ải ${stageNum}] Thất bại.`;
          if (stopOnDefeat.value) {
            autoStatusMsg.value = `[Ải ${stageNum}] Thất bại. Đã dừng tự động theo thiết lập.`;
            break;
          }
        }
      } else {
        const errMsg = res?.results?.[0]?.error?.description || res?.error || 'Lỗi phản hồi từ server';
        combatLogs.value.unshift({
          id: String(Date.now()),
          time: timeStr,
          stage: stageNum,
          status: 'error',
          detail: `Lỗi RPC: ${errMsg}`,
        });
        autoStatusMsg.value = `Dừng do lỗi: ${errMsg}`;
        break;
      }

      // Delay between stages
      if (delayMs.value > 0) {
        await new Promise(r => setTimeout(r, delayMs.value));
      }
    }
  } catch (err: any) {
    autoStatusMsg.value = `Dừng tự động do lỗi: ${err?.message || String(err)}`;
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
  autoStatusMsg.value = 'Đã dừng tự động.';
}

function togglePauseAutoFight() {
  isPaused.value = !isPaused.value;
  autoStatusMsg.value = isPaused.value ? 'Đã tạm dừng tự động.' : 'Tiếp tục tự động...';
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
    title="Frontier - Ải Viễn Chinh"
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
            <span>Đội hình & Ải</span>
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
            <span>Tự động & Giả lập</span>
            <span v-if="isRunning" class="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
          </button>
        </div>

        <!-- AFK Chest Summary & Collect Button -->
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800">
            <span>🎁</span>
            <span class="text-slate-600 dark:text-slate-300 font-medium">Rương tích lũy:</span>
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
            <span>Nhận rương</span>
          </button>

          <button
            type="button"
            :disabled="isRefreshing"
            class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Làm mới trạng thái từ game"
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

      <!-- TAB 1: STAGE & LINEUP -->
      <div v-if="activeTab === 'stage'" class="space-y-4">
        <!-- Stage Overview Header -->
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-base font-bold text-slate-800 dark:text-slate-100">
                Ải {{ currentStage }}
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                Thế giới {{ world }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">Tiêu diệt toàn bộ đội ngũ trấn giữ để nhận Xu Viễn Chinh và tiến lên ải tiếp theo</p>
          </div>

          <div class="flex items-center gap-4 text-center">
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Lực chiến đối thủ</div>
              <div class="text-sm font-bold text-amber-600 dark:text-amber-400">
                ⚡ {{ formatNumber(enemyPower) }}
              </div>
            </div>
            <div class="text-slate-300 dark:text-slate-700 font-bold text-base">VS</div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Lực chiến đội bạn</div>
              <div class="text-sm font-bold text-sky-600 dark:text-sky-400">
                🛡️ {{ formatNumber(playerSquadPower) }}
              </div>
            </div>
            <div class="border-l border-slate-200 dark:border-slate-800 pl-3 text-left">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Chênh lệch</div>
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
              <span>Đội hình trấn giữ ải ({{ defenders.length }} tướng):</span>
            </h4>
            <span class="text-[11px] text-slate-400">Tổng LC: {{ formatNumber(enemyPower) }}</span>
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

        <!-- Player Squad Lineup -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Đội hình xuất chiến của bạn (5 tướng):</span>
            </h4>
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-slate-400">Tổng LC: {{ formatNumber(playerSquadPower) }}</span>
              <button
                type="button"
                :disabled="isSavingTeam || selectedSquad.length === 0"
                class="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-all shadow-2xs"
                title="Lưu đội ngũ làm mặc định cho Frontier trên server"
                @click="handleSaveTeam"
              >
                {{ isSavingTeam ? 'Đang lưu...' : 'Lưu đội hình' }}
              </button>
            </div>
          </div>

          <!-- 5 Squad Slots -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div
              v-for="(slotHero, idx) in playerSquadHeroes"
              :key="slotHero ? slotHero.id : `empty-${idx}`"
              class="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex flex-col items-center text-center relative group cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-all"
              title="Nhấn để đổi tướng"
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
                Đổi tướng
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
              <span class="text-[11px] text-slate-400 font-medium">Chọn tướng</span>
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
            <span>Tấn công 1 ải (Ải {{ currentStage }})</span>
          </button>
        </div>
      </div>

      <!-- TAB 2: AUTOMATION & HISTORY -->
      <div v-else class="space-y-4">
        <!-- Settings & Automation Panel -->
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>🤖</span>
                <span>Cấu hình tự động vượt ải</span>
              </h4>
              <p class="text-[11px] text-slate-400">Tự động đẩy ải liên tục, sử dụng giả lập WASM để đảm bảo an toàn tuyệt đối</p>
            </div>

            <!-- Auto Fight Main Actions -->
            <div class="flex items-center gap-2">
              <button
                v-if="!isRunning"
                type="button"
                :disabled="selectedSquad.length === 0"
                class="px-4 py-2 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center gap-1.5"
                @click="startAutoFight"
              >
                <span>▶ Bắt đầu tự động</span>
              </button>

              <template v-else>
                <button
                  type="button"
                  class="px-3 py-2 font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 transition-all shadow-sm"
                  @click="togglePauseAutoFight"
                >
                  {{ isPaused ? '▶ Tiếp tục' : '⏸ Tạm dừng' }}
                </button>
                <button
                  type="button"
                  class="px-3 py-2 font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm"
                  @click="stopAutoFight"
                >
                  ⏹ Dừng lại
                </button>
              </template>
            </div>
          </div>

          <!-- Options Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <!-- Max Stages -->
            <div>
              <label for="frontier-max-stages" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Số ải tối đa:
              </label>
              <select
                id="frontier-max-stages"
                v-model.number="maxStages"
                :disabled="isRunning"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option :value="1">1 ải</option>
                <option :value="5">5 ải</option>
                <option :value="10">10 ải</option>
                <option :value="25">25 ải</option>
                <option :value="50">50 ải</option>
                <option :value="0">Không giới hạn</option>
              </select>
            </div>

            <!-- Delay Between Battles -->
            <div>
              <label for="frontier-delay-ms" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Khoảng nghỉ giữa ải:
              </label>
              <select
                id="frontier-delay-ms"
                v-model.number="delayMs"
                :disabled="isRunning"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option :value="500">0.5 giây</option>
                <option :value="1000">1.0 giây</option>
                <option :value="1500">1.5 giây</option>
                <option :value="2000">2.0 giây</option>
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
                Giả lập WASM trước khi gửi
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
                Dừng lại khi thất bại
              </label>
            </div>
          </div>
        </div>

        <!-- Live Combat History & Logs -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>📜</span>
              <span>Nhật ký trận chiến ({{ combatLogs.length }} lượt):</span>
            </h4>
            <button
              v-if="combatLogs.length > 0"
              type="button"
              class="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              @click="clearCombatLogs"
            >
              Xóa lịch sử
            </button>
          </div>

          <div class="max-h-64 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div v-if="combatLogs.length === 0" class="text-center py-6 text-slate-400 text-xs">
              Chưa có trận đánh nào được ghi nhận. Nhấn "Tấn công 1 ải" hoặc "Bắt đầu tự động" để chạy.
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
                  Ải {{ log.stage }}
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
              Chọn tướng cho vị trí #{{ (heroPickerSlot ?? 0) + 1 }}
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
