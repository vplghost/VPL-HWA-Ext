<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata, getHeroName } from '@/src/utils/metadata';
import { simulateBattleWithUnity } from '@/src/utils/dungeonBattleSim';
import {
  extractArenaOverview,
  extractArenaEnemyList,
  isEnemyWithinPowerRatio,
  buildArenaEndBattleArgs,
  runArenaMonteCarloSim,
  normalizeArenaEnemy,
  type ArenaEnemy,
  type ArenaMonteCarloResult,
} from '@/src/services/arenaService';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const overview = computed(() => extractArenaOverview(cache.value));

// Owned heroes sorted by power descending
const ownedHeroes = computed(() => {
  const raw = cache.value?.heroGetAll?.data;
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw)
    .filter((h: any) => h && Number(h.id) > 0)
    .map((h: any) => {
      const id = Number(h.id);
      const meta = getHeroMetadata(id);
      return {
        id,
        name: meta?.name || getHeroName(id) || `Hero #${id}`,
        avatarFile: meta?.avatarFile,
        level: Number(h.level) || 1,
        star: Number(h.star) || 1,
        power: Number(h.power) || 0,
      };
    })
    .sort((a, b) => b.power - a.power);
});

const selectedHeroIds = ref<number[]>([]);
const maxPowerRatioPct = ref(90);
const simRounds = ref(5);
const minWinRatePct = ref(80);
const maxRefreshPerBattle = ref(10);

const isLoading = ref(false);
const isSimulating = ref(false);
const isAutoRunning = ref(false);
const stopRequested = ref(false);
const statusMessage = ref('');
const errorMessage = ref('');
const simProgressText = ref('');
const lastSimResult = ref<ArenaMonteCarloResult | null>(null);
const liveEnemy = ref<ArenaEnemy | null>(null);
const logs = ref<Array<{ time: string; text: string; tone?: 'info' | 'ok' | 'warn' | 'err' }>>([]);

const activeEnemy = computed<ArenaEnemy | null>(() => liveEnemy.value || overview.value.enemies[0] || null);

const playerAttackPower = computed(() => {
  if (selectedHeroIds.value.length > 0) {
    const heroMap = new Map(ownedHeroes.value.map((h) => [h.id, h.power]));
    const sum = selectedHeroIds.value.reduce((acc, id) => acc + (heroMap.get(id) || 0), 0);
    if (sum > 0) return sum;
  }
  return overview.value.power || 0;
});

const enemyPowerRatioPct = computed<number | null>(() => {
  const enemy = activeEnemy.value;
  const mine = playerAttackPower.value;
  if (!enemy || !enemy.power || !mine) return null;
  return Math.round((enemy.power / mine) * 100);
});

function addLog(text: string, tone: 'info' | 'ok' | 'warn' | 'err' = 'info') {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  logs.value.unshift({ time, text, tone });
  if (logs.value.length > 50) logs.value.pop();
}

function getAvatarUrl(file: string | undefined): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

function heroMeta(id: number) {
  const meta = getHeroMetadata(id);
  return {
    name: meta?.name || getHeroName(id) || `Hero #${id}`,
    avatarFile: meta?.avatarFile,
  };
}

function initDefaultTeam() {
  if (selectedHeroIds.value.length === 5) return;
  const savedDefenders = overview.value.defenders.map((d) => d.id).filter((id) => id > 0);
  if (savedDefenders.length === 5) {
    selectedHeroIds.value = savedDefenders.slice(0, 5);
    return;
  }
  if (ownedHeroes.value.length >= 5) {
    selectedHeroIds.value = ownedHeroes.value.slice(0, 5).map((h) => h.id);
  }
}

function toggleHero(id: number) {
  if (isAutoRunning.value) return;
  const idx = selectedHeroIds.value.indexOf(id);
  if (idx !== -1) {
    selectedHeroIds.value.splice(idx, 1);
  } else if (selectedHeroIds.value.length < 5) {
    selectedHeroIds.value.push(id);
  }
}

async function refreshArenaData() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await dispatchRpc([
      { name: 'arenaGetAll', args: {} },
      { name: 'League_getInfo', args: { type: 'ratingArena' } },
      { name: 'arenaFindEnemies', args: {} },
      { name: 'battleGetByType', args: { type: 'arena', limit: 10, offset: 0 } },
      { name: 'refillableGetAll', args: {}, feature: 'refillable' },
    ]);
    const enemyRes = res?.results?.find((r: any) => Array.isArray(r?.result?.response?.enemies))?.result?.response;
    if (enemyRes?.enemies?.[0]) {
      liveEnemy.value = normalizeArenaEnemy(enemyRes.enemies[0]);
    }
    initDefaultTeam();
    statusMessage.value = 'Arena data refreshed.';
    addLog('Refreshed Arena status, opponents, league info, and free battles.', 'info');
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Refresh failed: ${errorMessage.value}`, 'err');
  } finally {
    isLoading.value = false;
  }
}

async function findNextEnemy(excludeId?: string): Promise<ArenaEnemy | null> {
  const args = excludeId ? { enemies: [excludeId] } : {};
  const res = await dispatchRpc([{ name: 'arenaFindEnemies', args }]);
  const resp = res?.results?.[0]?.result?.response;
  const next = resp?.enemies?.[0] ? normalizeArenaEnemy(resp.enemies[0]) : null;
  if (next) {
    liveEnemy.value = next;
    lastSimResult.value = null;
  }
  return next;
}

async function handleRefreshEnemy() {
  if (isLoading.value || isAutoRunning.value) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const next = await findNextEnemy(activeEnemy.value?.userId);
    if (next) {
      addLog(`Found opponent ${next.name} (Power: ${next.power.toLocaleString()}).`, 'info');
    } else {
      addLog('No opponent returned by arenaFindEnemies.', 'warn');
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Find opponent failed: ${errorMessage.value}`, 'err');
  } finally {
    isLoading.value = false;
  }
}

async function simulateAndOptionallyFight(enemy: ArenaEnemy): Promise<'won' | 'lost' | 'skipped'> {
  if (selectedHeroIds.value.length !== 5) {
    throw new Error('Select exactly 5 heroes for your Arena attack team.');
  }

  isSimulating.value = true;
  simProgressText.value = 'Starting battle context...';
  lastSimResult.value = null;

  try {
    const startRes = await dispatchRpc([
      {
        name: 'customArena_startBattle',
        args: {
          type: overview.value.arenaType || 'NormalArena',
          userId: enemy.userId,
          units: [...selectedHeroIds.value],
        },
      },
    ]);
    const startResp = startRes?.results?.[0]?.result?.response;
    const rawBattle = startResp?.battles?.[0];
    if (!rawBattle) {
      const errDesc = startRes?.results?.[0]?.result?.error?.description || startResp?.error || 'customArena_startBattle did not return battle data';
      throw new Error(String(errDesc));
    }

    const rounds = Math.max(1, Math.min(20, Math.floor(Number(simRounds.value) || 5)));
    simProgressText.value = `Simulating 0/${rounds} rounds via Unity Engine...`;

    const mc = await runArenaMonteCarloSim(
      rawBattle,
      (b, s) => simulateBattleWithUnity(b, s),
      rounds,
      (done, total, wins) => {
        const pct = Math.round((wins / done) * 100);
        simProgressText.value = `Simulating ${done}/${total} · Wins: ${wins} (${pct}%)`;
      }
    );
    lastSimResult.value = mc;

    const threshold = Math.max(1, Math.min(100, Number(minWinRatePct.value) || 80));
    addLog(
      `Sim vs ${enemy.name}: ${mc.wins}/${mc.total} wins (${mc.winRatePct}%, threshold ${threshold}%).`,
      mc.winRatePct >= threshold ? 'ok' : 'warn'
    );

    if (mc.winRatePct < threshold || !mc.canonicalOutcome?.win) {
      addLog(
        `Skipped fight vs ${enemy.name} (win rate ${mc.winRatePct}% < ${threshold}% or canonical seed lost).`,
        'warn'
      );
      return 'skipped';
    }

    const endArgs = buildArenaEndBattleArgs(mc.canonicalOutcome, overview.value.arenaType || 'NormalArena');
    const endRes = await dispatchRpc([{ name: 'customArena_endBattle', args: endArgs }]);
    const endResp = endRes?.results?.[0]?.result?.response;
    if (endResp?.error || endRes?.results?.[0]?.result?.error || endResp?.valid === false) {
      throw new Error(String(endResp?.error || endRes?.results?.[0]?.result?.error?.description || 'Arena battle rejected by server'));
    }

    const nextRawEnemies = extractArenaEnemyList(endResp?.enemies);
    const nextEnemy = nextRawEnemies.length > 0 ? normalizeArenaEnemy(nextRawEnemies[0]) : null;
    liveEnemy.value = nextEnemy && nextEnemy.userId !== enemy.userId ? nextEnemy : null;

    if (mc.canonicalOutcome.win) {
      addLog(`Victory vs ${enemy.name}! New Rank: #${endResp?.state?.place ?? overview.value.place ?? '—'}.`, 'ok');
      return 'won';
    }
    addLog(`Defeat vs ${enemy.name}.`, 'err');
    return 'lost';
  } finally {
    isSimulating.value = false;
    simProgressText.value = '';
  }
}

async function handleManualSimAndFight() {
  if (!activeEnemy.value || isSimulating.value || isAutoRunning.value) return;
  errorMessage.value = '';
  try {
    await simulateAndOptionallyFight(activeEnemy.value);
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Battle error: ${errorMessage.value}`, 'err');
  }
}

async function startAutoArena() {
  if (isAutoRunning.value) return;
  if (selectedHeroIds.value.length !== 5) {
    errorMessage.value = 'Please select 5 heroes before starting Auto Arena.';
    return;
  }

  isAutoRunning.value = true;
  stopRequested.value = false;
  errorMessage.value = '';
  addLog(
    `Auto Arena started (Max Power Ratio: ${maxPowerRatioPct.value}%, Sim: ${simRounds.value} rounds, Min Win Rate: ${minWinRatePct.value}%).`,
    'info'
  );

  try {
    let lastFoughtUserId: string | undefined;
    while (!stopRequested.value) {
      const freeLeft = overview.value.freeBattlesLeft;
      if (freeLeft !== null && freeLeft <= 0) {
        statusMessage.value = 'Stopped: No free Arena battles remaining.';
        addLog('Stopped: 0 free Arena battles remaining.', 'ok');
        break;
      }

      let enemy = activeEnemy.value;
      if (!enemy || (lastFoughtUserId && enemy.userId === lastFoughtUserId)) {
        enemy = await findNextEnemy(lastFoughtUserId);
      }
      if (!enemy) {
        statusMessage.value = 'Stopped: Could not find an Arena opponent.';
        addLog('Stopped: No opponent returned.', 'warn');
        break;
      }

      // Refresh opponent if enemy power exceeds configured player power ratio
      let refreshes = 0;
      const maxRefreshes = Math.max(1, Math.min(30, Math.floor(Number(maxRefreshPerBattle.value) || 10)));
      while (!stopRequested.value && !isEnemyWithinPowerRatio(enemy.power, playerAttackPower.value, maxPowerRatioPct.value)) {
        if (refreshes >= maxRefreshes) {
          addLog(`Reached max ${maxRefreshes} refreshes without finding an opponent <= ${maxPowerRatioPct.value}% power.`, 'warn');
          enemy = null;
          break;
        }
        refreshes++;
        const ratio = playerAttackPower.value > 0 ? Math.round((enemy.power / playerAttackPower.value) * 100) : 0;
        addLog(`Skipping ${enemy.name} (${enemy.power.toLocaleString()} power, ${ratio}% > ${maxPowerRatioPct.value}%). Refreshing (${refreshes}/${maxRefreshes})...`, 'info');
        enemy = await findNextEnemy(enemy.userId);
        if (!enemy) break;
      }

      if (!enemy || stopRequested.value) {
        if (!stopRequested.value) statusMessage.value = 'Stopped: No suitable opponent found within power limit.';
        break;
      }

      const outcome = await simulateAndOptionallyFight(enemy);
      if (outcome === 'lost') {
        statusMessage.value = 'Stopped: Arena battle lost.';
        addLog('Auto Arena stopped after a defeat.', 'err');
        break;
      }
      if (outcome === 'skipped') {
        // Win rate below threshold — refresh opponent and try again
        await findNextEnemy(enemy.userId);
        continue;
      }

      lastFoughtUserId = enemy.userId;
      // Refresh free battles counter after victory
      await dispatchRpc([{ name: 'refillableGetAll', args: {}, feature: 'refillable' }]);
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    statusMessage.value = `Stopped due to error: ${errorMessage.value}`;
    addLog(`Auto Arena stopped with error: ${errorMessage.value}`, 'err');
  } finally {
    isAutoRunning.value = false;
    stopRequested.value = false;
  }
}

function stopAutoArena() {
  stopRequested.value = true;
  statusMessage.value = 'Stopping Auto Arena...';
  addLog('Stop requested by user.', 'warn');
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      initDefaultTeam();
      if (!activeEnemy.value) {
        void refreshArenaData();
      }
    }
  }
);
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Arena"
    icon="⚔️"
    max-width="max-w-5xl"
    modal-name="arena"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div id="arena-dialog-content" class="flex flex-col gap-4 text-xs sm:text-sm">
      <!-- Overview Banner -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold">
            🏆 Rank: #{{ overview.place ?? '—' }}
          </span>
          <span v-if="overview.bestPlace != null" class="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
            Best: #{{ overview.bestPlace }}
          </span>
          <span v-if="overview.leagueId != null" class="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-medium">
            League #{{ overview.leagueId }}
          </span>
          <span
            id="arena-free-battles-badge"
            class="px-2.5 py-1 rounded-lg border font-semibold"
            :class="(overview.freeBattlesLeft ?? 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'"
          >
            ⚔️ Free Battles: {{ overview.freeBattlesLeft ?? '—' }}
          </span>
          <span v-if="overview.numBattles > 0" class="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Record: {{ overview.numWins }}W / {{ overview.numBattles }}B
          </span>
          <span v-if="overview.winStreak > 0" class="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
            🔥 Streak: {{ overview.winStreak }}
          </span>
        </div>

        <button
          id="btn-arena-refresh"
          type="button"
          :disabled="isLoading || isAutoRunning"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs disabled:opacity-50 transition"
          @click="refreshArenaData"
        >
          {{ isLoading ? 'Refreshing...' : '↻ Refresh Arena' }}
        </button>
      </div>

      <!-- Error / Status Alert -->
      <div v-if="errorMessage" class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
        ⚠️ {{ errorMessage }}
      </div>
      <div v-else-if="statusMessage || simProgressText" class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
        {{ simProgressText || statusMessage }}
      </div>

      <!-- Main 2-Column Layout: Attack Team + Opponent & Simulation -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Attack Team Selection -->
        <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your Attack Team ({{ selectedHeroIds.length }}/5)
            </h3>
            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              ⚡ Power: {{ playerAttackPower.toLocaleString() }}
            </span>
          </div>

          <div class="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
            <button
              v-for="hero in ownedHeroes.slice(0, 20)"
              :key="hero.id"
              type="button"
              :disabled="isAutoRunning"
              class="cursor-pointer flex flex-col items-center p-1.5 rounded-lg border text-[10px] transition"
              :class="
                selectedHeroIds.includes(hero.id)
                  ? 'bg-indigo-500/15 border-indigo-500 ring-1 ring-indigo-500/40'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-400'
              "
              @click="toggleHero(hero.id)"
            >
              <div class="w-9 h-9 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-1">
                <img v-if="hero.avatarFile" :src="getAvatarUrl(hero.avatarFile)" :alt="hero.name" class="w-full h-full object-cover" loading="lazy" />
                <span v-else class="font-bold text-slate-400">#{{ hero.id }}</span>
              </div>
              <span class="font-semibold truncate w-full text-center text-slate-700 dark:text-slate-200">{{ hero.name }}</span>
              <span class="text-[9px] text-slate-400">{{ Math.round(hero.power / 1000) }}k</span>
            </button>
          </div>
        </div>

        <!-- Current Opponent & 10-Round Sim -->
        <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current Opponent
            </h3>
            <button
              id="btn-arena-find-enemy"
              type="button"
              :disabled="isLoading || isAutoRunning || isSimulating"
              class="cursor-pointer px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-50 transition"
              @click="handleRefreshEnemy"
            >
              🔄 Next Opponent
            </button>
          </div>

          <div v-if="activeEnemy" class="flex flex-col gap-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <div class="font-bold text-slate-800 dark:text-slate-100">
                  {{ activeEnemy.name }}
                  <span v-if="activeEnemy.level" class="text-xs font-normal text-slate-400">Lv.{{ activeEnemy.level }}</span>
                  <span v-if="activeEnemy.clanTitle" class="text-xs font-normal text-slate-400"> [{{ activeEnemy.clanTitle }}]</span>
                </div>
                <div class="text-[11px] text-slate-500">
                  Rating: {{ activeEnemy.rating }}
                  <span v-if="activeEnemy.rewards?.win != null"> · Win: +{{ activeEnemy.rewards.win }} / Lose: {{ activeEnemy.rewards.lose }}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="font-bold text-rose-600 dark:text-rose-400">
                  ⚡ {{ activeEnemy.power.toLocaleString() }}
                </div>
                <div
                  v-if="enemyPowerRatioPct != null"
                  class="text-[11px] font-semibold"
                  :class="enemyPowerRatioPct <= maxPowerRatioPct ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
                >
                  {{ enemyPowerRatioPct }}% of your power
                </div>
              </div>
            </div>

            <!-- 5 Enemy Heroes -->
            <div class="grid grid-cols-5 gap-2">
              <div
                v-for="eh in activeEnemy.heroes"
                :key="eh.id"
                class="flex flex-col items-center p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px]"
              >
                <div class="w-9 h-9 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-1">
                  <img v-if="heroMeta(eh.id).avatarFile" :src="getAvatarUrl(heroMeta(eh.id).avatarFile)" :alt="heroMeta(eh.id).name" class="w-full h-full object-cover" loading="lazy" />
                  <span v-else class="font-bold text-slate-400">#{{ eh.id }}</span>
                </div>
                <span class="font-semibold truncate w-full text-center text-slate-700 dark:text-slate-200">{{ heroMeta(eh.id).name }}</span>
                <span class="text-[9px] text-slate-400">Lv.{{ eh.level }} · {{ Math.round(eh.power / 1000) }}k</span>
              </div>
            </div>

            <!-- Last Simulation Result Summary -->
            <div
              v-if="lastSimResult"
              class="flex items-center justify-between p-2 rounded-lg border text-xs font-semibold"
              :class="lastSimResult.winRatePct >= minWinRatePct ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'"
            >
              <span>Unity Sim Result: {{ lastSimResult.wins }}/{{ lastSimResult.total }} Wins ({{ lastSimResult.winRatePct }}%)</span>
              <span>Canonical Seed: {{ lastSimResult.canonicalOutcome?.win ? 'WIN' : 'LOSS' }}</span>
            </div>

          </div>

          <div v-else class="py-8 text-center text-slate-400 text-xs">
            No opponent loaded yet. Click "Refresh Arena" to fetch opponents.
          </div>
        </div>
      </div>

      <!-- Automation Panel -->
      <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            🤖 Arena Automation (Unity WASM Monte Carlo)
          </h3>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Max Enemy Power (%)</span>
            <input
              id="arena-max-power-ratio"
              v-model.number="maxPowerRatioPct"
              type="number"
              min="10"
              max="200"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Sim Rounds</span>
            <input
              id="arena-sim-rounds"
              v-model.number="simRounds"
              type="number"
              min="1"
              max="20"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Min Win Rate (%)</span>
            <input
              id="arena-min-win-rate"
              v-model.number="minWinRatePct"
              type="number"
              min="1"
              max="100"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Max Refreshes / Battle</span>
            <input
              id="arena-max-refreshes"
              v-model.number="maxRefreshPerBattle"
              type="number"
              min="1"
              max="30"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Automatically refreshes opponents exceeding {{ maxPowerRatioPct }}% of your attack power, runs {{ simRounds }} Unity WASM simulations, fights when win rate ≥ {{ minWinRatePct }}%, and stops when free battles reach 0 or on defeat.
        </p>

        <!-- Automation Log -->
        <div v-if="logs.length > 0" class="max-h-36 overflow-y-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] space-y-1">
          <div
            v-for="(entry, i) in logs"
            :key="i"
            :class="{
              'text-emerald-400': entry.tone === 'ok',
              'text-amber-400': entry.tone === 'warn',
              'text-rose-400': entry.tone === 'err',
              'text-slate-300': !entry.tone || entry.tone === 'info',
            }"
          >
            [{{ entry.time }}] {{ entry.text }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div id="arena-dialog-footer" class="w-full flex flex-wrap items-center justify-end gap-2">
        <button
          id="btn-arena-sim-fight"
          type="button"
          :disabled="!currentOpponent || isSimulating || isAutoRunning || selectedHeroIds.length !== 5"
          class="cursor-pointer px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 transition"
          @click="handleManualSimAndFight"
        >
          {{ isSimulating ? (simProgressText || 'Simulating...') : `🧪 Simulate ${simRounds}x & Fight (if ≥ ${minWinRatePct}%)` }}
        </button>
        <button
          v-if="!isAutoRunning"
          id="btn-arena-auto-start"
          type="button"
          :disabled="isSimulating || selectedHeroIds.length !== 5"
          class="cursor-pointer px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs disabled:opacity-50 transition"
          @click="startAutoArena"
        >
          ▶ Start Auto Arena
        </button>
        <button
          v-else
          id="btn-arena-auto-stop"
          type="button"
          class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
          @click="stopAutoArena"
        >
          ⏹ Stop Auto
        </button>
      </div>
    </template>
  </ModalDialog>
</template>
