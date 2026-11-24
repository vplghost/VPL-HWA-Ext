<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import HeroTeamPicker, { type PickerHeroItem, type SavedTeamPreset } from '@/src/components/common/HeroTeamPicker.vue';
import AutomationLogPanel, { type AutomationLogEntry } from '@/src/components/common/AutomationLogPanel.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { getHeroMetadata } from '@/src/utils/metadata';
import { simulateBattleWithUnity } from '@/src/utils/dungeonBattleSim';
import {
  pruneHeroPool,
  generateOneSwapCandidates,
  buildHeroPoolMap,
  calcTeamPower,
  runPvpOptimizationSession,
  PVP_OPTIMIZER_STORAGE_KEY,
  type PvpSearchMode,
  type PvpLeaderboardEntry,
  type PvpOptimizationProgress,
  type PvpOptimizationSessionResult,
} from '@/src/services/pvpTeamOptimizer';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache } = useRpcCache();
const accountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);
const { customTeams, saveTeams } = useAccountTeams(accountId);

const rawHeroes = computed(() => cache.value.heroGetAll?.data || {});
const hydratedHeroStats = computed<Record<string, any>>(() => cache.value.battleHeroStatsCache?.data || {});
const battleTemplate = computed(() => cache.value.battleEnvelopeTemplate?.data || undefined);
const heroPoolMap = computed(() => buildHeroPoolMap(rawHeroes.value));

const hydrationCoverage = computed(() => {
  const pool = prunedPool.value;
  const hydrated = hydratedHeroStats.value;
  let count = 0;
  for (const h of pool) {
    if (hydrated[String(h.id)] && Number.isFinite(Number(hydrated[String(h.id)]?.hp))) count++;
  }
  return { hydratedCount: count, total: pool.length };
});

const pickerHeroes = computed<PickerHeroItem[]>(() =>
  Array.from(heroPoolMap.value.values()).map((h) => ({
    id: h.id,
    power: h.power,
    level: h.level,
    star: h.star,
  }))
);

const savedTeamPresets = computed<SavedTeamPreset[]>(() => {
  const presets: SavedTeamPreset[] = [];
  const arenaDef = cache.value.arenaState?.data?.defenders;
  if (Array.isArray(arenaDef) && arenaDef.length > 0) {
    presets.push({
      id: 'server:arena',
      label: 'Arena Defense',
      heroIds: arenaDef.map((h: any) => Number(h?.id ?? h)).filter((id: number) => id > 0).slice(0, 5),
    });
  }
  const serverArena = cache.value.teamGetAll?.data?.arena;
  if (Array.isArray(serverArena) && serverArena.length > 0 && presets.length === 0) {
    presets.push({
      id: 'server:teamGetAll:arena',
      label: 'Server Arena Team',
      heroIds: serverArena.map(Number).filter((id) => id > 0).slice(0, 5),
    });
  }
  const trainingChallenges = cache.value.clanTrainingsCache?.data?.challenges;
  if (Array.isArray(trainingChallenges) && trainingChallenges.length > 0) {
    const ch = trainingChallenges[0];
    const chHeroes = Array.isArray(ch?.data?.defenders?.heroes)
      ? ch.data.defenders.heroes.map((h: any) => Number(h?.id ?? h)).filter((id: number) => id > 0).slice(0, 5)
      : [];
    if (chHeroes.length === 5) {
      presets.push({
        id: `training:${ch.id || 'latest'}`,
        label: ch.data?.description ? `Training: ${ch.data.description}` : 'Guild Training Team',
        heroIds: chHeroes,
      });
    }
  }
  for (const t of customTeams.value) {
    if (t.type === 'titan') continue;
    if (Array.isArray(t.heroIds) && t.heroIds.length === 5) {
      presets.push({ id: `custom:${t.id}`, label: t.name, heroIds: t.heroIds });
    }
  }
  return presets;
});

// Seed team & options
const seedHeroIds = ref<number[]>([]);
const lockedHeroIds = ref<number[]>([]);
const topN = ref<number>(15);
const minPowerPctOfMax = ref<number>(55);
const minPowerPctOfSeedMin = ref<number>(70);
const minTeamPowerPctOfSeed = ref<number>(85);
const searchMode = ref<PvpSearchMode>('one-swap');
const symmetricMatch = ref<boolean>(true);
const earlyExit = ref<boolean>(true);
const maxMatchups = ref<number>(80);

// Run state
const isRunning = ref(false);
const stopRequested = ref(false);
const progress = ref<PvpOptimizationProgress | null>(null);
const lastResult = ref<PvpOptimizationSessionResult | null>(null);
const expandedTeamKey = ref<string | null>(null);
const statusMessage = ref('');
const errorMessage = ref('');
const logs = ref<AutomationLogEntry[]>([]);

function addLog(text: string, level: 'info' | 'warn' | 'error' = 'info') {
  const ts = new Date().toTimeString().slice(0, 8);
  logs.value = [...logs.value.slice(-99), { ts, level, text }];
}

function initDefaultSeed() {
  if (seedHeroIds.value.length === 5) return;
  if (savedTeamPresets.value.length > 0) {
    seedHeroIds.value = [...savedTeamPresets.value[0].heroIds];
    return;
  }
  seedHeroIds.value = Array.from(heroPoolMap.value.values())
    .sort((a, b) => b.power - a.power)
    .slice(0, 5)
    .map((h) => h.id);
}

async function loadSavedResult() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  try {
    const res = await chrome.storage.local.get(PVP_OPTIMIZER_STORAGE_KEY);
    if (res?.[PVP_OPTIMIZER_STORAGE_KEY]?.leaderboard) {
      lastResult.value = res[PVP_OPTIMIZER_STORAGE_KEY];
    }
  } catch (_) {}
}

const prunedPool = computed(() =>
  pruneHeroPool(rawHeroes.value, seedHeroIds.value, {
    topN: topN.value,
    minPowerPctOfMax: minPowerPctOfMax.value,
    minPowerPctOfSeedMin: minPowerPctOfSeedMin.value,
    lockedHeroIds: lockedHeroIds.value,
  })
);

const estimatedGen1Matchups = computed(() => {
  if (seedHeroIds.value.length !== 5) return 0;
  const seedPower = calcTeamPower(seedHeroIds.value, heroPoolMap.value);
  const cands = generateOneSwapCandidates(
    seedHeroIds.value,
    prunedPool.value.map((h) => h.id),
    heroPoolMap.value,
    {
      lockedHeroIds: lockedHeroIds.value,
      minTeamPower: seedPower * (minTeamPowerPctOfSeed.value / 100),
    }
  );
  return Math.min(maxMatchups.value, cands.length);
});

function toggleLockHero(id: number) {
  const idx = lockedHeroIds.value.indexOf(id);
  if (idx >= 0) {
    lockedHeroIds.value.splice(idx, 1);
  } else if (lockedHeroIds.value.length < 4) {
    lockedHeroIds.value.push(id);
  }
}

async function startOptimization() {
  if (isRunning.value) return;
  if (seedHeroIds.value.length !== 5) {
    errorMessage.value = 'Please select exactly 5 heroes for the Seed Team.';
    return;
  }

  isRunning.value = true;
  stopRequested.value = false;
  errorMessage.value = '';
  statusMessage.value = 'Starting local Unity WASM tournament...';
  progress.value = null;
  addLog(
    `Started PvP Optimizer (${searchMode.value}, pool=${prunedPool.value.length}, ${symmetricMatch.value ? '5+5 symmetric' : '10 atk'})`,
    'info'
  );

  try {
    const result = await runPvpOptimizationSession({
      rawHeroes: rawHeroes.value,
      seedHeroIds: seedHeroIds.value,
      simulateFn: simulateBattleWithUnity,
      searchMode: searchMode.value,
      filterOptions: {
        topN: topN.value,
        minPowerPctOfMax: minPowerPctOfMax.value,
        minPowerPctOfSeedMin: minPowerPctOfSeedMin.value,
        lockedHeroIds: lockedHeroIds.value,
        minTeamPowerPctOfSeed: minTeamPowerPctOfSeed.value,
      },
      matchOptions: {
        rounds: 10,
        symmetric: symmetricMatch.value,
        earlyExit: earlyExit.value,
        hydratedHeroStats: hydratedHeroStats.value,
        battleTemplate: battleTemplate.value,
        userId: accountId.value,
      },
      maxMatchups: maxMatchups.value,
      shouldStop: () => stopRequested.value,
      onProgress: (p) => {
        progress.value = p;
        statusMessage.value = `Phase: ${p.phase} · Matchups: ${p.completedMatchups}/${Math.max(p.totalMatchups, p.completedMatchups)}`;
      },
    });

    lastResult.value = result;
    const top = result.leaderboard[0];
    statusMessage.value = result.aborted
      ? `Stopped after ${result.totalMatchups} matchups.`
      : `Done (${result.totalMatchups} matchups). #1 Elo: ${top?.elo ?? 1500} (${top?.winRateVsSeedPct ?? 50}% vs Seed).`;
    addLog(statusMessage.value, 'info');

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ [PVP_OPTIMIZER_STORAGE_KEY]: result }).catch(() => {});
    }
  } catch (err: any) {
    const phase = err?.detail?.phase ? ` [${err.detail.phase}]` : '';
    errorMessage.value = `${err?.message || String(err)}${phase}`;
    statusMessage.value = 'Optimization failed.';
    addLog(`Error${phase}: ${err?.message || String(err)}`, 'error');
  } finally {
    isRunning.value = false;
  }
}

function stopOptimization() {
  stopRequested.value = true;
  statusMessage.value = 'Stopping after current matchup...';
  addLog('Stop requested by user.', 'warn');
}

async function saveEntryAsCustomTeam(entry: PvpLeaderboardEntry, rank: number) {
  const newTeam = {
    id: `pvp_opt_${Date.now()}_${rank}`,
    name: `PvP #${rank} (Elo ${entry.elo})`,
    type: 'hero' as const,
    heroIds: [...entry.heroIds],
  };
  await saveTeams([...customTeams.value, newTeam]);
  addLog(`Saved Rank #${rank} as custom team "${newTeam.name}".`, 'info');
}

function getHeroAvatar(id: number): string {
  const meta = getHeroMetadata(id);
  const file = meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${id}.png` : '');
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(file);
  return file;
}

function getHeroName(id: number): string {
  return getHeroMetadata(id)?.name || `Hero #${id}`;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      initDefaultSeed();
      void loadSavedResult();
    }
  }
);
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="PvP Team Optimizer & WASM Leaderboard"
    icon="🏆"
    max-width="max-w-5xl"
    modal-name="pvpOptimizer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div id="pvp-optimizer-modal" class="space-y-4 text-xs">
      <!-- Seed Team Selection -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="font-bold text-slate-900 dark:text-slate-100">1. Seed Team (Your Benchmark 5-Hero Squad)</h4>
            <p class="text-[11px] text-slate-500">Pick your current strongest PvP squad. Candidates fight 10 local Unity WASM rounds (0 RPCs).</p>
          </div>
          <div v-if="seedHeroIds.length === 5" class="flex items-center gap-1 flex-wrap">
            <span class="text-[10px] text-slate-500 mr-1">Lock Core:</span>
            <button
              v-for="id in seedHeroIds"
              :key="'lock-' + id"
              type="button"
              :disabled="isRunning"
              class="cursor-pointer px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors"
              :class="
                lockedHeroIds.includes(id)
                  ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300'
                  : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
              "
              @click="toggleLockHero(id)"
            >
              {{ lockedHeroIds.includes(id) ? '🔒' : '🔓' }} {{ getHeroName(id) }}
            </button>
          </div>
        </div>

        <HeroTeamPicker
          v-model="seedHeroIds"
          :heroes="pickerHeroes"
          :saved-teams="savedTeamPresets"
          :disabled="isRunning"
        />
      </section>

      <!-- Pool Pruning & Search Options -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-bold text-slate-900 dark:text-slate-100">2. Pool Pruning & Tournament Settings</h4>
          <div class="flex flex-wrap items-center gap-2">
            <span id="pvp-optimizer-estimate" class="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
              Pruned Pool: {{ prunedPool.length }} heroes · Est. Gen-1: ~{{ estimatedGen1Matchups }} matchups
            </span>
            <span
              id="pvp-optimizer-hydration-badge"
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
              :class="hydrationCoverage.hydratedCount === hydrationCoverage.total && hydrationCoverage.total > 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'"
            >
              Stats: {{ hydrationCoverage.hydratedCount }}/{{ hydrationCoverage.total }} server-hydrated
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Top N Heroes</span>
            <select v-model.number="topN" :disabled="isRunning" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <option :value="10">Top 10 (Fastest)</option>
              <option :value="15">Top 15 (Recommended)</option>
              <option :value="20">Top 20</option>
              <option :value="25">Top 25 (Deep)</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Min Power (% of #1 Hero)</span>
            <select v-model.number="minPowerPctOfMax" :disabled="isRunning" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <option :value="40">40%</option>
              <option :value="55">55% (Default)</option>
              <option :value="70">70%</option>
              <option :value="80">80%</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Search Mode</span>
            <select id="pvp-search-mode-select" v-model="searchMode" :disabled="isRunning" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <option value="one-swap">1-Swap Fast</option>
              <option value="beam-search">Beam Search (2-Gen)</option>
              <option value="top-k-round-robin">Beam + Top-6 Round-Robin</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Max Matchups</span>
            <select v-model.number="maxMatchups" :disabled="isRunning" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <option :value="40">40</option>
              <option :value="80">80</option>
              <option :value="150">150</option>
            </select>
          </label>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="symmetricMatch" type="checkbox" :disabled="isRunning" />
              <span>5+5 Symmetric (Atk + Def)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="earlyExit" type="checkbox" :disabled="isRunning" />
              <span>Early-Exit Lost Screenings</span>
            </label>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="!isRunning"
              id="btn-start-pvp-optimizer"
              type="button"
              :disabled="seedHeroIds.length !== 5"
              class="cursor-pointer rounded-lg px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
              @click="startOptimization"
            >
              ⚡ Start Optimization
            </button>
            <button
              v-else
              id="btn-stop-pvp-optimizer"
              type="button"
              class="cursor-pointer rounded-lg px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              @click="stopOptimization"
            >
              ⏹ Stop
            </button>
          </div>
        </div>

        <div v-if="statusMessage || errorMessage" class="text-[11px] font-mono">
          <div v-if="errorMessage" class="text-rose-600 dark:text-rose-400">⚠️ {{ errorMessage }}</div>
          <div v-else class="text-slate-600 dark:text-slate-300">{{ statusMessage }}</div>
        </div>
      </section>

      <!-- Ranked Leaderboard Table -->
      <section
        v-if="lastResult && lastResult.leaderboard.length > 0"
        id="pvp-optimizer-leaderboard"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <h4 class="font-bold text-slate-900 dark:text-slate-100">
            3. PvP Team Leaderboard (Top {{ Math.min(12, lastResult.leaderboard.length) }} of {{ lastResult.leaderboard.length }})
          </h4>
          <span class="text-[11px] text-slate-500 font-mono">
            {{ lastResult.totalMatchups }} matchups · Pool {{ lastResult.poolSize }}
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 bg-slate-50/50 dark:bg-slate-900">
                <th class="py-2 px-2.5">#</th>
                <th class="py-2 px-2.5">Squad</th>
                <th class="py-2 px-2.5">Power</th>
                <th class="py-2 px-2.5">Elo</th>
                <th class="py-2 px-2.5">vs Seed</th>
                <th class="py-2 px-2.5">Overall</th>
                <th class="py-2 px-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(entry, idx) in lastResult.leaderboard.slice(0, 12)"
                :key="entry.key"
                class="border-b border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                :class="entry.isSeed ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''"
              >
                <td class="py-2 px-2.5 font-mono font-bold">
                  <span v-if="idx === 0">👑</span>
                  <span v-else>#{{ idx + 1 }}</span>
                </td>
                <td class="py-2 px-2.5">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <div class="flex items-center gap-1">
                      <img
                        v-for="hid in entry.heroIds"
                        :key="hid"
                        :src="getHeroAvatar(hid)"
                        :title="getHeroName(hid)"
                        :alt="getHeroName(hid)"
                        class="size-7 rounded-md object-cover border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <span v-if="entry.isSeed" class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 text-[10px] font-semibold">
                      Seed
                    </span>
                    <span v-if="entry.isGiantKiller" class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-semibold">
                      ⚡ Giant Killer
                    </span>
                  </div>
                </td>
                <td class="py-2 px-2.5 font-mono text-[11px]">
                  <div>{{ entry.power.toLocaleString() }}</div>
                  <div
                    v-if="!entry.isSeed"
                    class="text-[10px]"
                    :class="entry.powerDeltaVsSeed >= 0 ? 'text-emerald-600' : 'text-amber-600'"
                  >
                    {{ entry.powerDeltaVsSeed >= 0 ? '+' : '' }}{{ entry.powerDeltaVsSeed.toLocaleString() }}
                  </div>
                </td>
                <td class="py-2 px-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">{{ entry.elo }}</td>
                <td class="py-2 px-2.5 font-mono font-semibold">
                  <span v-if="entry.isSeed" class="text-slate-400">—</span>
                  <span
                    v-else-if="entry.winRateVsSeedPct != null"
                    :class="entry.winRateVsSeedPct > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'"
                  >
                    {{ entry.winRateVsSeedPct }}%
                  </span>
                  <span v-else class="text-slate-400">N/A</span>
                </td>
                <td class="py-2 px-2.5 font-mono text-[11px]">
                  {{ entry.overallWinRatePct }}% ({{ entry.totalWins }}/{{ entry.totalRounds }})
                </td>
                <td class="py-2 px-2.5 text-right">
                  <button
                    type="button"
                    class="cursor-pointer px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
                    @click="saveEntryAsCustomTeam(entry, idx + 1)"
                  >
                    Save Team
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <AutomationLogPanel
        v-if="logs.length > 0"
        :entries="logs"
        title="Optimizer Log"
        @clear="logs = []"
      />
    </div>
  </ModalDialog>
</template>
