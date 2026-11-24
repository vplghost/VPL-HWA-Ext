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
  PVP_OPTIMIZER_POOL_CONFIG_KEY,
  type PvpPoolMode,
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
const poolMode = ref<PvpPoolMode>('auto-power');
const seedHeroIds = ref<number[]>([]);
const customPoolHeroIds = ref<number[]>([]);
const customPoolSearch = ref('');
const lockedHeroIds = ref<number[]>([]);
const topN = ref<number>(15);
const minPowerPctOfMax = ref<number>(55);
const minPowerPctOfSeedMin = ref<number>(70);
const minTeamPowerPctOfSeed = ref<number>(85);
const searchMode = ref<PvpSearchMode>('one-swap');
const symmetricMatch = ref<boolean>(true);
const earlyExit = ref<boolean>(true);
const maxMatchups = ref<number>(80);

const effectiveSeedHeroIds = computed<number[]>(() =>
  poolMode.value === 'custom-pool' ? customPoolHeroIds.value.slice(0, 5) : seedHeroIds.value
);

const filteredCustomPickerHeroes = computed(() => {
  const q = customPoolSearch.value.trim().toLowerCase();
  const list = pickerHeroes.value;
  if (!q) return list;
  return list.filter((h) => getHeroName(h.id).toLowerCase().includes(q) || String(h.id) === q);
});

async function persistPoolConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  const key = accountId.value ? `${PVP_OPTIMIZER_POOL_CONFIG_KEY}:${accountId.value}` : PVP_OPTIMIZER_POOL_CONFIG_KEY;
  await chrome.storage.local.set({
    [key]: { poolMode: poolMode.value, customPoolHeroIds: [...customPoolHeroIds.value] },
  }).catch(() => {});
}

async function loadPoolConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  const key = accountId.value ? `${PVP_OPTIMIZER_POOL_CONFIG_KEY}:${accountId.value}` : PVP_OPTIMIZER_POOL_CONFIG_KEY;
  try {
    const res = await chrome.storage.local.get(key);
    const cfg = res?.[key];
    if (cfg?.poolMode === 'custom-pool' || cfg?.poolMode === 'auto-power') {
      poolMode.value = cfg.poolMode;
    }
    if (Array.isArray(cfg?.customPoolHeroIds)) {
      customPoolHeroIds.value = cfg.customPoolHeroIds.map(Number).filter((id: number) => id > 0);
    }
  } catch (_) {}
}

function setPoolMode(mode: PvpPoolMode) {
  if (isRunning.value) return;
  poolMode.value = mode;
  if (mode === 'custom-pool' && customPoolHeroIds.value.length === 0 && seedHeroIds.value.length === 5) {
    customPoolHeroIds.value = [...seedHeroIds.value];
  }
  void persistPoolConfig();
}

function toggleCustomPoolHero(id: number) {
  if (isRunning.value) return;
  const idx = customPoolHeroIds.value.indexOf(id);
  if (idx >= 0) {
    customPoolHeroIds.value.splice(idx, 1);
    const lockIdx = lockedHeroIds.value.indexOf(id);
    if (lockIdx >= 0) lockedHeroIds.value.splice(lockIdx, 1);
  } else {
    customPoolHeroIds.value.push(id);
  }
  void persistPoolConfig();
}

function addTopHeroesToCustomPool(count: number) {
  if (isRunning.value) return;
  const existing = new Set(customPoolHeroIds.value);
  for (const h of pickerHeroes.value) {
    if (customPoolHeroIds.value.length >= count) break;
    if (!existing.has(h.id)) {
      customPoolHeroIds.value.push(h.id);
      existing.add(h.id);
    }
  }
  void persistPoolConfig();
}

function loadPresetAsCustomSeed(heroIds: number[]) {
  if (isRunning.value || heroIds.length !== 5) return;
  const rest = customPoolHeroIds.value.filter((id) => !heroIds.includes(id));
  customPoolHeroIds.value = [...heroIds, ...rest];
  void persistPoolConfig();
}

function clearCustomPool() {
  if (isRunning.value) return;
  customPoolHeroIds.value = [];
  lockedHeroIds.value = [];
  void persistPoolConfig();
}

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
  pruneHeroPool(rawHeroes.value, effectiveSeedHeroIds.value, {
    poolMode: poolMode.value,
    customPoolHeroIds: customPoolHeroIds.value,
    topN: topN.value,
    minPowerPctOfMax: minPowerPctOfMax.value,
    minPowerPctOfSeedMin: minPowerPctOfSeedMin.value,
    lockedHeroIds: lockedHeroIds.value,
  })
);

const estimatedGen1Matchups = computed(() => {
  if (effectiveSeedHeroIds.value.length !== 5) return 0;
  const seedPower = calcTeamPower(effectiveSeedHeroIds.value, heroPoolMap.value);
  const cands = generateOneSwapCandidates(
    effectiveSeedHeroIds.value,
    prunedPool.value.map((h) => h.id),
    heroPoolMap.value,
    {
      lockedHeroIds: lockedHeroIds.value,
      minTeamPower: poolMode.value === 'custom-pool' ? 0 : seedPower * (minTeamPowerPctOfSeed.value / 100),
    }
  );
  return poolMode.value === 'custom-pool' ? cands.length : Math.min(maxMatchups.value, cands.length);
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
  if (poolMode.value === 'custom-pool') {
    if (customPoolHeroIds.value.length < 6) {
      errorMessage.value = 'Select at least 6 heroes in Custom Pool mode (first 5 = Seed Team, remaining = Bench).';
      return;
    }
  } else if (seedHeroIds.value.length !== 5) {
    errorMessage.value = 'Please select exactly 5 heroes for the Seed Team.';
    return;
  }

  isRunning.value = true;
  stopRequested.value = false;
  errorMessage.value = '';
  statusMessage.value = 'Starting local Unity WASM tournament...';
  progress.value = null;
  addLog(
    `Started PvP Optimizer (${searchMode.value}, mode=${poolMode.value}, pool=${prunedPool.value.length}, ${symmetricMatch.value ? '5+5 symmetric' : '10 atk'})`,
    'info'
  );

  try {
    const result = await runPvpOptimizationSession({
      rawHeroes: rawHeroes.value,
      seedHeroIds: effectiveSeedHeroIds.value,
      simulateFn: simulateBattleWithUnity,
      searchMode: searchMode.value,
      filterOptions: {
        poolMode: poolMode.value,
        customPoolHeroIds: customPoolHeroIds.value,
        ensureFullPoolCoverage: poolMode.value === 'custom-pool',
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
      void loadPoolConfig();
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
      <!-- Seed Team & Pool Selection -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="font-bold text-slate-900 dark:text-slate-100">
              1. {{ poolMode === 'custom-pool' ? 'Custom Hero Pool (First 5 = Seed Team)' : 'Seed Team (Your Benchmark 5-Hero Squad)' }}
            </h4>
            <p class="text-[11px] text-slate-500">
              {{
                poolMode === 'custom-pool'
                  ? 'Pick your exact hero pool in order. Heroes #1–#5 form the Seed Team; all remaining picked heroes (#6–#N) are guaranteed to be tested.'
                  : 'Pick your current strongest PvP squad. Candidates fight 10 local Unity WASM rounds (0 RPCs).'
              }}
            </p>
          </div>
          <div id="pvp-pool-mode-toggle" class="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-[11px] font-semibold">
            <button
              id="btn-pvp-mode-auto"
              type="button"
              :disabled="isRunning"
              class="cursor-pointer px-2.5 py-1 transition"
              :class="poolMode === 'auto-power' ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              @click="setPoolMode('auto-power')"
            >
              ⚡ Auto Pool
            </button>
            <button
              id="btn-pvp-mode-custom"
              type="button"
              :disabled="isRunning"
              class="cursor-pointer px-2.5 py-1 transition"
              :class="poolMode === 'custom-pool' ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              @click="setPoolMode('custom-pool')"
            >
              🎯 Custom Pool
            </button>
          </div>
        </div>

        <div v-if="effectiveSeedHeroIds.length === 5" class="flex items-center gap-1 flex-wrap">
          <span class="text-[10px] text-slate-500 mr-1">Lock Core:</span>
          <button
            v-for="id in effectiveSeedHeroIds"
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

        <HeroTeamPicker
          v-if="poolMode === 'auto-power'"
          v-model="seedHeroIds"
          :heroes="pickerHeroes"
          :saved-teams="savedTeamPresets"
          :disabled="isRunning"
        />

        <!-- Custom Pool Picker (Pick Order: #1..#5 Seed, #6..#N Bench) -->
        <div v-else id="pvp-custom-pool-picker" class="space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                :disabled="isRunning"
                class="cursor-pointer px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-semibold"
                @click="addTopHeroesToCustomPool(10)"
              >
                + Top 10
              </button>
              <button
                type="button"
                :disabled="isRunning"
                class="cursor-pointer px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-semibold"
                @click="addTopHeroesToCustomPool(15)"
              >
                + Top 15
              </button>
              <button
                v-for="preset in savedTeamPresets.slice(0, 2)"
                :key="preset.id"
                type="button"
                :disabled="isRunning"
                class="cursor-pointer px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold"
                @click="loadPresetAsCustomSeed(preset.heroIds)"
              >
                🌱 Seed: {{ preset.label }}
              </button>
              <button
                type="button"
                :disabled="isRunning || customPoolHeroIds.length === 0"
                class="cursor-pointer px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 text-[11px] font-semibold disabled:opacity-40"
                @click="clearCustomPool"
              >
                Clear
              </button>
            </div>
            <input
              v-model="customPoolSearch"
              type="text"
              placeholder="Filter heroes..."
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs w-36"
            />
          </div>

          <!-- Ordered Selected Chips -->
          <div v-if="customPoolHeroIds.length > 0" class="flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              v-for="(hid, idx) in customPoolHeroIds"
              :key="'picked-' + hid"
              type="button"
              :disabled="isRunning"
              class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition"
              :class="idx < 5 ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'"
              :title="idx < 5 ? 'Seed Team slot #' + (idx + 1) + ' (click to remove)' : 'Bench Hero #' + (idx + 1) + ' (click to remove)'"
              @click="toggleCustomPoolHero(hid)"
            >
              <span>{{ idx < 5 ? `🌱 #${idx + 1}` : `#${idx + 1}` }}</span>
              <span>{{ getHeroName(hid) }}</span>
              <span class="opacity-60">✕</span>
            </button>
          </div>
          <p v-else class="text-[11px] text-slate-400 italic">
            Click heroes below to build your pool. The first 5 picked heroes become your Seed Team; pick at least 6 heroes total.
          </p>

          <!-- Hero Selection Grid -->
          <div class="grid grid-cols-5 sm:grid-cols-8 gap-1.5 max-h-44 overflow-y-auto pr-1">
            <button
              v-for="hero in filteredCustomPickerHeroes"
              :key="'cp-' + hero.id"
              type="button"
              :disabled="isRunning"
              class="cursor-pointer relative flex flex-col items-center p-1 rounded-lg border text-[10px] transition"
              :class="
                customPoolHeroIds.indexOf(hero.id) >= 0 && customPoolHeroIds.indexOf(hero.id) < 5
                  ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/40'
                  : customPoolHeroIds.includes(hero.id)
                    ? 'bg-indigo-500/15 border-indigo-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-400'
              "
              @click="toggleCustomPoolHero(hero.id)"
            >
              <span
                v-if="customPoolHeroIds.includes(hero.id)"
                class="absolute top-0.5 right-0.5 px-1 rounded text-[9px] font-bold text-white"
                :class="customPoolHeroIds.indexOf(hero.id) < 5 ? 'bg-emerald-600' : 'bg-indigo-600'"
              >
                {{ customPoolHeroIds.indexOf(hero.id) + 1 }}
              </span>
              <div class="w-8 h-8 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-0.5">
                <img v-if="getHeroAvatar(hero.id)" :src="getHeroAvatar(hero.id)" :alt="getHeroName(hero.id)" class="w-full h-full object-cover" loading="lazy" />
                <span v-else class="font-bold text-slate-400">#{{ hero.id }}</span>
              </div>
              <span class="font-semibold truncate w-full text-center text-slate-700 dark:text-slate-200">{{ getHeroName(hero.id) }}</span>
              <span class="text-[9px] text-slate-400">{{ Math.round(hero.power / 1000) }}k</span>
            </button>
          </div>
        </div>
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
          <label class="flex flex-col gap-1" :class="poolMode === 'custom-pool' ? 'opacity-50' : ''">
            <span class="text-[11px] text-slate-500">Top N Heroes</span>
            <select v-model.number="topN" :disabled="isRunning || poolMode === 'custom-pool'" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <option :value="10">Top 10 (Fastest)</option>
              <option :value="15">Top 15 (Recommended)</option>
              <option :value="20">Top 20</option>
              <option :value="25">Top 25 (Deep)</option>
            </select>
          </label>

          <label class="flex flex-col gap-1" :class="poolMode === 'custom-pool' ? 'opacity-50' : ''">
            <span class="text-[11px] text-slate-500">Min Power (% of #1 Hero)</span>
            <select v-model.number="minPowerPctOfMax" :disabled="isRunning || poolMode === 'custom-pool'" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
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
