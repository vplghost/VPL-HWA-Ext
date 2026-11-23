<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { frontierActivityState } from '@/src/composables/activityState';
import { useNow } from '@/src/composables/useNow';
import { formatNumber } from '@/src/utils/formatters';
import { getHeroAvatar } from '@/src/data/heroMetadata';
import { getHeroName } from '@/src/data/nameData';
import { collectFrontierChest, refreshFrontierState } from '@/src/services/frontierService';

const { cache, dispatchRpc } = useRpcCache();
const { openModal } = useModals();
const now = useNow();

const isCollecting = ref(false);
const isRefreshing = ref(false);
const actionMsg = ref('');

const frontierState = computed(() => frontierActivityState(cache.value, now.value));
const mission = computed(() => cache.value.eternalStoryStatus?.data?.mission);
const defenders = computed(() => mission.value?.defender_packs?.[0] || []);

const currentStage = computed(() => mission.value?.position ?? frontierState.value.currentStage ?? null);
const world = computed(() => mission.value?.world ?? frontierState.value.world ?? null);
const enemyPower = computed(() => frontierState.value.enemyPower ?? 0);
const todayCleared = computed(() => frontierState.value.todayCleared ?? 0);
const chestPercent = computed(() => frontierState.value.chestPercent ?? 0);
const chestCoins = computed(() => frontierState.value.chestCoins ?? 0);

async function handleCollectChest() {
  if (isCollecting.value) return;
  isCollecting.value = true;
  actionMsg.value = 'Collecting AFK chest...';
  try {
    const res = await collectFrontierChest(dispatchRpc);
    if (res?.ok) {
      actionMsg.value = 'Chest collected successfully!';
    } else {
      actionMsg.value = res?.error || 'Failed to collect chest.';
    }
  } catch (err: any) {
    actionMsg.value = err?.message || 'RPC communication error.';
  } finally {
    isCollecting.value = false;
    setTimeout(() => { actionMsg.value = ''; }, 3000);
  }
}

async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  actionMsg.value = 'Refreshing Frontier status...';
  try {
    const res = await refreshFrontierState(dispatchRpc);
    if (res?.ok) {
      actionMsg.value = 'Frontier refreshed!';
    } else {
      actionMsg.value = res?.error || 'Failed to refresh.';
    }
  } catch (err: any) {
    actionMsg.value = err?.message || 'Error sending refresh RPC.';
  } finally {
    isRefreshing.value = false;
    setTimeout(() => { actionMsg.value = ''; }, 2500);
  }
}

function handleOpenModal() {
  openModal('frontier');
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3.5 space-y-3 shadow-2xs">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xl">🧭</span>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">Frontier</h3>
            <span
              v-if="currentStage"
              class="px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300"
            >
              Stage {{ currentStage }}<span v-if="world"> · World {{ world }}</span>
            </span>
          </div>
          <p class="text-[11px] text-slate-400">Campaign Battles & Auto Progression</p>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          :disabled="isRefreshing"
          class="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Refresh Frontier data from game"
          @click="handleRefresh"
        >
          <span :class="{ 'animate-spin inline-block': isRefreshing }">🔄</span>
        </button>
        <button
          type="button"
          class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-all shadow-2xs flex items-center gap-1"
          @click="handleOpenModal"
        >
          <span>Details & Auto Battle</span>
          <span>↗</span>
        </button>
      </div>
    </div>

    <!-- Feedback Message Banner -->
    <p v-if="actionMsg" role="status" class="text-xs text-violet-600 dark:text-violet-400 animate-pulse font-medium">
      {{ actionMsg }}
    </p>

    <!-- Key Metrics Grid -->
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Target Stage</div>
        <div class="text-sm font-bold text-slate-800 dark:text-slate-100">
          {{ currentStage ? `Stage ${currentStage}` : 'Waiting' }}
        </div>
      </div>
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Enemy Power</div>
        <div class="text-sm font-bold text-amber-600 dark:text-amber-400">
          ⚡ {{ formatNumber(enemyPower) }}
        </div>
      </div>
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Cleared Today</div>
        <div class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
          🏆 {{ todayCleared }} stages
        </div>
      </div>
    </div>

    <!-- Enemy Team Preview -->
    <div v-if="defenders.length" class="space-y-1">
      <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>Defending Lineup:</span>
        <span class="text-[10px] text-slate-400">{{ defenders.length }} heroes</span>
      </div>
      <div class="flex items-center gap-1.5 overflow-x-auto py-1">
        <div
          v-for="d in defenders"
          :key="d.id"
          class="relative group shrink-0 flex flex-col items-center p-1 rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 w-12"
          :title="`${getHeroName(d.id)} (Lv.${d.level || 120}) - Power: ${formatNumber(d.power)}`"
        >
          <img
            v-if="getHeroAvatar(d.id)"
            :src="getHeroAvatar(d.id)!"
            :alt="getHeroName(d.id)"
            class="w-8 h-8 rounded object-cover border border-slate-300 dark:border-slate-600"
            loading="lazy"
          />
          <div v-else class="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
            {{ d.id }}
          </div>
          <span class="text-[9px] text-slate-600 dark:text-slate-300 font-medium truncate max-w-full mt-0.5">
            {{ formatNumber(d.power) }}
          </span>
          <span class="absolute -top-1 -right-1 text-[9px] bg-amber-500 text-slate-950 font-bold px-1 rounded-full shadow-2xs">
            ⭐{{ d.star || 5 }}
          </span>
        </div>
      </div>
    </div>

    <!-- AFK Chest Section -->
    <div class="p-2.5 rounded-lg bg-violet-50/50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 flex items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xl">🎁</span>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <span>AFK Chest</span>
            <span class="text-[10px] text-violet-600 dark:text-violet-400">({{ chestPercent }}%)</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Accumulated: <strong class="text-amber-600 dark:text-amber-400 font-bold">{{ chestCoins.toLocaleString() }}</strong> Frontier Coins
          </div>
          <!-- Progress bar -->
          <div class="w-32 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              class="bg-violet-600 h-full rounded-full transition-all duration-300"
              :style="{ width: `${Math.min(100, Math.max(0, chestPercent))}%` }"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        :disabled="isCollecting || (chestPercent === 0 && chestCoins === 0)"
        class="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
        :class="
          chestPercent > 0 || chestCoins > 0
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs hover:shadow-xs active:scale-95'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
        "
        @click="handleCollectChest"
      >
        <span v-if="isCollecting" class="animate-spin inline-block mr-1">⏳</span>
        <span>Collect</span>
      </button>
    </div>
  </div>
</template>
