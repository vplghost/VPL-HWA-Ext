<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import AutomationLogPanel, { type AutomationLogEntry } from '@/src/components/common/AutomationLogPanel.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata, getHeroName } from '@/src/utils/metadata';
import { simulateBattleWithUnity } from '@/src/utils/dungeonBattleSim';
import { extractArenaEnemyList } from '@/src/services/arenaService';
import {
  extractGrandArenaOverview,
  normalizeGrandArenaEnemy,
  computePairwiseWinMatrix,
  findBestGrandArenaPermutation,
  buildGrandArenaEndBattleArgs,
  extractDefendersFromStartBattles,
  pruneGrandArenaIntelCache,
  validateGrandArenaUnitsPayload,
  inspectServerGrandTeamIntegrity,
  GRAND_ARENA_INTEL_STORAGE_KEY,
  type GrandArenaEnemy,
  type GrandArenaHiddenPolicy,
  type GrandArenaPermutationResult,
  type GrandArenaIntelEntry,
} from '@/src/services/grandArenaService';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const overview = computed(() => extractGrandArenaOverview(cache.value));

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

const heroPowerMap = computed(() => new Map(ownedHeroes.value.map((h) => [h.id, h.power])));
const ownedHeroIdSet = computed(() => new Set(ownedHeroes.value.map((h) => h.id)));
const serverGrandTeamIntegrity = computed(() =>
  inspectServerGrandTeamIntegrity(cache.value?.teamGetAll?.data, ownedHeroIdSet.value)
);

// 3 Attack Teams (15 unique heroes)
const attackTeams = ref<[number[], number[], number[]]>([[], [], []]);
const activeTeamTab = ref<0 | 1 | 2>(0);

const liveEnemies = ref<GrandArenaEnemy[]>([]);
const selectedEnemyId = ref<string>('');
const intelCache = ref<Record<string, GrandArenaIntelEntry>>({});

// Automation settings
const maxTotalPowerRatioPct = ref(95);
const simRoundsPerPair = ref(6);
const minWinRatePct = ref(80);
const hiddenPolicy = ref<GrandArenaHiddenPolicy>('visible2-and-sacrifice');
const maxHiddenPowerRatioPct = ref(80);
const skipTwoHidden = ref(true);
const maxRefreshPerBattle = ref(8);

const isLoading = ref(false);
const isSimulating = ref(false);
const isAutoRunning = ref(false);
const stopRequested = ref(false);
const statusMessage = ref('');
const errorMessage = ref('');
const simProgressText = ref('');
const lastPlan = ref<GrandArenaPermutationResult | null>(null);
const logs = ref<AutomationLogEntry[]>([]);

const displayEnemies = computed<GrandArenaEnemy[]>(() =>
  liveEnemies.value.length > 0 ? liveEnemies.value : overview.value.enemies
);

const selectedEnemy = computed<GrandArenaEnemy | null>(() => {
  if (!displayEnemies.value.length) return null;
  return (
    displayEnemies.value.find((e) => e.userId === selectedEnemyId.value) ||
    displayEnemies.value[0]
  );
});

const attackTeamPowers = computed<[number, number, number]>(() => [
  attackTeams.value[0].reduce((s, id) => s + (heroPowerMap.value.get(id) || 0), 0),
  attackTeams.value[1].reduce((s, id) => s + (heroPowerMap.value.get(id) || 0), 0),
  attackTeams.value[2].reduce((s, id) => s + (heroPowerMap.value.get(id) || 0), 0),
]);

const totalAttackPower = computed(() =>
  attackTeamPowers.value[0] + attackTeamPowers.value[1] + attackTeamPowers.value[2]
);

const allTeamsComplete = computed(
  () =>
    attackTeams.value[0].length === 5 &&
    attackTeams.value[1].length === 5 &&
    attackTeams.value[2].length === 5
);

const usedInOtherTeams = computed(() => {
  const set = new Set<number>();
  for (let t = 0; t < 3; t++) {
    if (t === activeTeamTab.value) continue;
    for (const id of attackTeams.value[t]) set.add(id);
  }
  return set;
});

function addLog(text: string, tone: AutomationLogEntry['tone'] = 'info') {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  logs.value.unshift({ time, text, tone });
  if (logs.value.length > 60) logs.value.pop();
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

function initDefaultTeams() {
  if (allTeamsComplete.value) return;
  if (serverGrandTeamIntegrity.value.valid && serverGrandTeamIntegrity.value.teams) {
    attackTeams.value = [
      [...serverGrandTeamIntegrity.value.teams[0]],
      [...serverGrandTeamIntegrity.value.teams[1]],
      [...serverGrandTeamIntegrity.value.teams[2]],
    ];
    return;
  }
  const defs = overview.value.defenders;
  if (defs.length === 3 && defs.every((t) => t.length === 5)) {
    const candidate = [
      defs[0].map((h) => h.id),
      defs[1].map((h) => h.id),
      defs[2].map((h) => h.id),
    ];
    const valid = validateGrandArenaUnitsPayload(candidate, ownedHeroIdSet.value);
    if (valid.ok) {
      attackTeams.value = valid.units;
      return;
    }
  }
  if (ownedHeroes.value.length >= 15) {
    const top15 = ownedHeroes.value.slice(0, 15).map((h) => h.id);
    attackTeams.value = [top15.slice(0, 5), top15.slice(5, 10), top15.slice(10, 15)];
  }
}

function toggleHero(id: number) {
  if (isAutoRunning.value || usedInOtherTeams.value.has(id)) return;
  const team = attackTeams.value[activeTeamTab.value];
  const idx = team.indexOf(id);
  if (idx !== -1) {
    team.splice(idx, 1);
  } else if (team.length < 5) {
    team.push(id);
  }
}

async function loadIntelCache() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const stored: any = await chrome.storage.local.get([GRAND_ARENA_INTEL_STORAGE_KEY]).catch(() => ({}));
    intelCache.value = pruneGrandArenaIntelCache(stored?.[GRAND_ARENA_INTEL_STORAGE_KEY]);
  }
}

async function saveIntelEntry(entry: GrandArenaIntelEntry | null) {
  if (!entry) return;
  const next = pruneGrandArenaIntelCache({ ...intelCache.value, [entry.userId]: entry });
  intelCache.value = next;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [GRAND_ARENA_INTEL_STORAGE_KEY]: next }).catch(() => {});
  }
}

async function refreshGrandArena() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await dispatchRpc([
      { name: 'arenaGetAll', args: {} },
      { name: 'grandFindEnemies', args: {} },
    ]);
    const findResp = res?.results?.find((r: any) => Array.isArray(r?.result?.response?.enemies))?.result?.response;
    const list = extractArenaEnemyList(findResp)
      .map(normalizeGrandArenaEnemy)
      .filter((e): e is GrandArenaEnemy => e !== null);
    if (list.length > 0) {
      liveEnemies.value = list;
      selectedEnemyId.value = list[0].userId;
      lastPlan.value = null;
    }
    initDefaultTeams();
    statusMessage.value = 'Grand Arena opponents refreshed.';
    addLog(`Fetched ${list.length} Grand Arena opponents.`, 'info');
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Refresh failed: ${errorMessage.value}`, 'err');
  } finally {
    isLoading.value = false;
  }
}

async function findNextOpponents(): Promise<GrandArenaEnemy[]> {
  const res = await dispatchRpc([{ name: 'grandFindEnemies', args: {} }]);
  const resp = res?.results?.[0]?.result?.response;
  const list = extractArenaEnemyList(resp)
    .map(normalizeGrandArenaEnemy)
    .filter((e): e is GrandArenaEnemy => e !== null);
  if (list.length > 0) {
    liveEnemies.value = list;
    selectedEnemyId.value = list[0].userId;
    lastPlan.value = null;
  }
  return list;
}

async function evaluateEnemyPlan(enemy: GrandArenaEnemy): Promise<GrandArenaPermutationResult> {
  const rawHeroPool = cache.value?.heroGetAll?.data || {};
  const matrix = await computePairwiseWinMatrix(
    attackTeams.value,
    enemy,
    rawHeroPool,
    (b, s) => simulateBattleWithUnity(b, s),
    {
      roundsPerPair: simRoundsPerPair.value,
      onProgress: (done, total) => {
        simProgressText.value = `Pre-sim vs ${enemy.name} (#${enemy.place}): ${done}/${total} pairs...`;
      },
      shouldAbort: () => stopRequested.value,
    }
  );
  const plan = findBestGrandArenaPermutation(
    attackTeams.value,
    attackTeamPowers.value,
    enemy,
    matrix,
    {
      minMatchWinRatePct: minWinRatePct.value,
      minBo3WinRatePct: minWinRatePct.value,
      hiddenPolicy: hiddenPolicy.value,
      maxHiddenPowerRatioPct: maxHiddenPowerRatioPct.value,
      skipTwoHidden: skipTwoHidden.value,
    }
  );
  lastPlan.value = plan;
  return plan;
}

async function executeGrandArenaBattle(
  enemy: GrandArenaEnemy,
  plan: GrandArenaPermutationResult
): Promise<'won' | 'lost'> {
  const payloadCheck = validateGrandArenaUnitsPayload(plan?.orderedTeams, ownedHeroIdSet.value);
  if (!payloadCheck.ok) {
    stopRequested.value = true;
    throw new Error(`Blocked malformed Grand Arena payload: ${payloadCheck.reason}`);
  }

  simProgressText.value = `Starting Grand Arena battle vs ${enemy.name}...`;
  const startRes = await dispatchRpc([
    {
      name: 'customArena_startBattle',
      args: {
        type: 'GrandArena',
        userId: enemy.userId,
        units: payloadCheck.units,
      },
    },
  ]);
  const startResp = startRes?.results?.[0]?.result?.response;
  const battles = Array.isArray(startResp?.battles) ? startResp.battles : [];
  if (battles.length !== 3) {
    const errDesc =
      startRes?.results?.[0]?.result?.error?.description ||
      startResp?.error ||
      'customArena_startBattle did not return 3 Grand Arena battles';
    throw new Error(String(errDesc));
  }

  // Save revealed 3 defense teams to 24h intel cache
  await saveIntelEntry(extractDefendersFromStartBattles(enemy.userId, battles));

  const outcomes: any[] = [];
  for (let i = 0; i < 3; i++) {
    simProgressText.value = `Running canonical Unity WASM battle ${i + 1}/3...`;
    const seed = (Number(battles[i]?.seed) >>> 0) || (Date.now() >>> 0);
    const out = await simulateBattleWithUnity(battles[i], seed);
    outcomes.push(out);
  }

  const winsCount = outcomes.filter((o) => Boolean(o?.win)).length;
  const endArgs = buildGrandArenaEndBattleArgs(outcomes);
  const endRes = await dispatchRpc([{ name: 'customArena_endBattle', args: endArgs }]);
  const endResp = endRes?.results?.[0]?.result?.response;
  if (endResp?.error || endRes?.results?.[0]?.result?.error || endResp?.valid === false) {
    throw new Error(
      String(endResp?.error || endRes?.results?.[0]?.result?.error?.description || 'Grand Arena battle rejected by server')
    );
  }

  const nextList = extractArenaEnemyList(endResp?.enemies)
    .map(normalizeGrandArenaEnemy)
    .filter((e): e is GrandArenaEnemy => e !== null);
  liveEnemies.value = nextList;
  selectedEnemyId.value = nextList[0]?.userId || '';

  if (winsCount >= 2) {
    addLog(
      `Victory ${winsCount}-1 vs ${enemy.name} (#${enemy.place})! New Rank: #${endResp?.state?.place ?? overview.value.place ?? '—'}.`,
      'ok'
    );
    return 'won';
  }
  addLog(`Defeat ${winsCount}-${3 - winsCount} vs ${enemy.name} (#${enemy.place}).`, 'err');
  return 'lost';
}

async function handleManualPreSim() {
  if (!selectedEnemy.value || !allTeamsComplete.value || isSimulating.value || isAutoRunning.value) return;
  isSimulating.value = true;
  errorMessage.value = '';
  try {
    const plan = await evaluateEnemyPlan(selectedEnemy.value);
    addLog(`Pre-sim vs ${selectedEnemy.value.name}: ${plan.reason}`, plan.recommended ? 'ok' : 'warn');
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Pre-sim error: ${errorMessage.value}`, 'err');
  } finally {
    isSimulating.value = false;
    simProgressText.value = '';
  }
}

async function handleManualFight() {
  if (!selectedEnemy.value || !allTeamsComplete.value || isSimulating.value || isAutoRunning.value) return;
  isSimulating.value = true;
  errorMessage.value = '';
  try {
    const plan = lastPlan.value || (await evaluateEnemyPlan(selectedEnemy.value));
    await executeGrandArenaBattle(selectedEnemy.value, plan);
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    addLog(`Battle error: ${errorMessage.value}`, 'err');
  } finally {
    isSimulating.value = false;
    simProgressText.value = '';
  }
}

async function startAutoGrandArena() {
  if (isAutoRunning.value || !allTeamsComplete.value) return;
  const initialCheck = validateGrandArenaUnitsPayload(attackTeams.value, ownedHeroIdSet.value);
  if (!initialCheck.ok) {
    errorMessage.value = `Cannot start Auto Grand Arena: ${initialCheck.reason}`;
    addLog(errorMessage.value, 'err');
    return;
  }
  attackTeams.value = initialCheck.units;
  isAutoRunning.value = true;
  stopRequested.value = false;
  errorMessage.value = '';
  addLog(
    `Auto Grand Arena started (Max Power: ${maxTotalPowerRatioPct.value}%, Min Win Rate: ${minWinRatePct.value}%, Hidden Policy: ${hiddenPolicy.value}).`,
    'info'
  );

  try {
    while (!stopRequested.value) {
      const freeLeft = overview.value.freeBattlesLeft;
      if (freeLeft !== null && freeLeft <= 0) {
        statusMessage.value = 'Stopped: 0 free Grand Arena battles remaining.';
        addLog('Stopped: 0 free Grand Arena battles remaining.', 'ok');
        break;
      }

      let candidates = displayEnemies.value.length > 0 ? displayEnemies.value : await findNextOpponents();
      let matchedEnemy: GrandArenaEnemy | null = null;
      let matchedPlan: GrandArenaPermutationResult | null = null;

      for (let refreshAttempt = 0; refreshAttempt <= maxRefreshPerBattle.value && !stopRequested.value; refreshAttempt++) {
        // Sort by best rank (lowest place) among power-eligible enemies
        const eligible = candidates
          .filter((e) => {
            if (e.hiddenCount >= 2 && skipTwoHidden.value) return false;
            if (totalAttackPower.value > 0 && e.totalPower > totalAttackPower.value * (maxTotalPowerRatioPct.value / 100)) {
              return false;
            }
            return true;
          })
          .sort((a, b) => a.place - b.place);

        for (const enemy of eligible) {
          if (stopRequested.value) break;
          selectedEnemyId.value = enemy.userId;
          const plan = await evaluateEnemyPlan(enemy);
          addLog(`Evaluated ${enemy.name} (#${enemy.place}): ${plan.reason}`, plan.recommended ? 'ok' : 'warn');
          if (plan.recommended) {
            matchedEnemy = enemy;
            matchedPlan = plan;
            break;
          }
        }

        if (matchedEnemy || stopRequested.value) break;
        if (refreshAttempt < maxRefreshPerBattle.value) {
          addLog(`No suitable opponent found. Refreshing opponents (${refreshAttempt + 1}/${maxRefreshPerBattle.value})...`, 'info');
          candidates = await findNextOpponents();
        }
      }

      if (!matchedEnemy || !matchedPlan || stopRequested.value) {
        if (!stopRequested.value) {
          statusMessage.value = 'Stopped: No suitable Grand Arena opponent found within settings.';
          addLog('Stopped: No suitable opponent found.', 'warn');
        }
        break;
      }

      const outcome = await executeGrandArenaBattle(matchedEnemy, matchedPlan);
      if (outcome === 'lost') {
        statusMessage.value = 'Stopped: Grand Arena battle lost.';
        addLog('Auto Grand Arena stopped after a defeat.', 'err');
        break;
      }
    }
  } catch (err: any) {
    errorMessage.value = err?.message || String(err);
    statusMessage.value = `Stopped due to error: ${errorMessage.value}`;
    addLog(`Auto Grand Arena stopped with error: ${errorMessage.value}`, 'err');
  } finally {
    isAutoRunning.value = false;
    stopRequested.value = false;
    simProgressText.value = '';
  }
}

function stopAutoGrandArena() {
  stopRequested.value = true;
  statusMessage.value = 'Stopping Auto Grand Arena...';
  addLog('Stop requested by user.', 'warn');
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      initDefaultTeams();
      void loadIntelCache();
      if (displayEnemies.value.length === 0) {
        void refreshGrandArena();
      }
    }
  }
);
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Grand Arena (3-Team Bo3)"
    icon="🛡️"
    max-width="max-w-5xl"
    modal-name="grandArena"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div id="grand-arena-dialog-content" class="flex flex-col gap-4 text-xs sm:text-sm">
      <!-- Overview Banner -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold">
            🏆 Rank: #{{ overview.place ?? '—' }}
          </span>
          <span
            id="grand-arena-free-battles-badge"
            class="px-2.5 py-1 rounded-lg border font-semibold"
            :class="(overview.freeBattlesLeft ?? 0) > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'"
          >
            🛡️ Free Battles: {{ overview.freeBattlesLeft ?? '—' }}
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold">
            ⚡ 3-Team Power: {{ totalAttackPower.toLocaleString() }}
          </span>
        </div>

        <button
          id="btn-grand-arena-refresh"
          type="button"
          :disabled="isLoading || isAutoRunning"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs disabled:opacity-50 transition"
          @click="refreshGrandArena"
        >
          {{ isLoading ? 'Refreshing...' : '↻ Refresh Grand Arena' }}
        </button>
      </div>

      <!-- Server Grand Team Integrity Warning -->
      <div
        v-if="!serverGrandTeamIntegrity.valid"
        id="grand-arena-integrity-warning"
        class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium"
      >
        ⚠️ Server Grand Arena team data looks malformed ({{ serverGrandTeamIntegrity.issue }}). Run a validated 3-team battle or save your formation in-game to repair it.
      </div>

      <!-- Error / Progress Banner -->
      <div v-if="errorMessage" class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
        ⚠️ {{ errorMessage }}
      </div>
      <div v-else-if="simProgressText || statusMessage" class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
        {{ simProgressText || statusMessage }}
      </div>

      <!-- 2-Column Layout: 3 Attack Teams + 3 Opponents & Permutation Plan -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- 3 Attack Teams Builder -->
        <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your 3 Attack Teams
            </h3>
            <div class="flex items-center gap-1">
              <button
                v-for="idx in ([0, 1, 2] as const)"
                :key="idx"
                type="button"
                class="cursor-pointer px-2 py-1 rounded text-[11px] font-semibold border transition"
                :class="activeTeamTab === idx ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'"
                @click="activeTeamTab = idx"
              >
                T{{ idx + 1 }} ({{ attackTeams[idx].length }}/5 · {{ Math.round(attackTeamPowers[idx] / 1000) }}k)
              </button>
            </div>
          </div>

          <div class="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1">
            <button
              v-for="hero in ownedHeroes.slice(0, 30)"
              :key="hero.id"
              type="button"
              :disabled="isAutoRunning || usedInOtherTeams.has(hero.id)"
              class="cursor-pointer flex flex-col items-center p-1 rounded-lg border text-[10px] transition disabled:opacity-35"
              :class="
                attackTeams[activeTeamTab].includes(hero.id)
                  ? 'bg-indigo-500/15 border-indigo-500 ring-1 ring-indigo-500/40'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-400'
              "
              @click="toggleHero(hero.id)"
            >
              <div class="w-8 h-8 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-0.5">
                <img v-if="hero.avatarFile" :src="getAvatarUrl(hero.avatarFile)" :alt="hero.name" class="w-full h-full object-cover" loading="lazy" />
                <span v-else class="font-bold text-slate-400">#{{ hero.id }}</span>
              </div>
              <span class="font-semibold truncate w-full text-center text-slate-700 dark:text-slate-200">{{ hero.name }}</span>
              <span class="text-[9px] text-slate-400">{{ Math.round(hero.power / 1000) }}k</span>
            </button>
          </div>
        </div>

        <!-- Opponents & 3-Team Matchup Preview -->
        <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Opponents ({{ displayEnemies.length }})
            </h3>
            <button
              id="btn-grand-arena-find"
              type="button"
              :disabled="isLoading || isAutoRunning || isSimulating"
              class="cursor-pointer px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-50 transition"
              @click="findNextOpponents"
            >
              🔄 Refresh Opponents
            </button>
          </div>

          <div v-if="displayEnemies.length > 0" class="flex flex-col gap-2">
            <!-- 3 Opponent Selector Pills -->
            <div class="grid grid-cols-3 gap-1.5">
              <button
                v-for="e in displayEnemies"
                :key="e.userId"
                type="button"
                class="cursor-pointer p-2 rounded-lg border text-left transition"
                :class="selectedEnemy?.userId === e.userId ? 'bg-indigo-500/15 border-indigo-500' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'"
                @click="selectedEnemyId = e.userId; lastPlan = null"
              >
                <div class="font-bold text-[11px] truncate text-slate-800 dark:text-slate-100">#{{ e.place }} {{ e.name }}</div>
                <div class="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">⚡ {{ Math.round(e.totalPower / 1000) }}k</div>
                <div v-if="e.hiddenCount > 0" class="text-[9px] text-amber-600 dark:text-amber-400">
                  🔒 {{ e.hiddenCount }} hidden {{ e.hiddenCount === 1 ? `(~${Math.round(e.hiddenTeamPower / 1000)}k)` : '' }}
                </div>
              </button>
            </div>

            <!-- Selected Opponent Teams -->
            <div v-if="selectedEnemy" class="space-y-1.5">
              <div
                v-for="(team, ti) in selectedEnemy.visibleTeams"
                :key="ti"
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px]"
              >
                <span class="font-bold text-slate-500 w-12">Def {{ ti + 1 }}</span>
                <div class="flex items-center gap-1 flex-1 overflow-hidden">
                  <span v-for="h in team" :key="h.id" class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 truncate">
                    {{ heroMeta(h.id).name }}
                  </span>
                </div>
                <span class="font-semibold text-rose-500 shrink-0">{{ Math.round(selectedEnemy.visibleTeamPowers[ti] / 1000) }}k</span>
              </div>

              <div
                v-for="hi in selectedEnemy.hiddenCount"
                :key="'h-' + hi"
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-300"
              >
                <span class="font-bold">🔒 Hidden Team {{ selectedEnemy.visibleTeams.length + hi }}</span>
                <span v-if="selectedEnemy.hiddenCount === 1" class="font-semibold">
                  Est. Power: {{ selectedEnemy.hiddenTeamPower.toLocaleString() }}
                </span>
                <span v-else class="font-semibold">Hidden (Top 20)</span>
              </div>
            </div>

            <!-- Optimal Permutation Result -->
            <div
              v-if="lastPlan"
              id="grand-arena-plan-card"
              class="p-2.5 rounded-lg border text-xs space-y-1"
              :class="lastPlan.recommended ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'"
            >
              <div class="font-bold">
                Best Order: T{{ lastPlan.order[0] + 1 }} · T{{ lastPlan.order[1] + 1 }} · T{{ lastPlan.order[2] + 1 }} ({{ lastPlan.strategy }})
              </div>
              <div class="text-[11px]">{{ lastPlan.reason }}</div>
            </div>

          </div>

          <div v-else class="py-8 text-center text-slate-400 text-xs">
            No opponents loaded yet. Click "Refresh Grand Arena".
          </div>
        </div>
      </div>

      <!-- Automation Panel -->
      <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            🤖 Auto Grand Arena (3-Team WASM Optimizer)
          </h3>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Max Power (%)</span>
            <input
              id="grand-arena-max-power"
              v-model.number="maxTotalPowerRatioPct"
              type="number"
              min="20"
              max="200"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Pre-Sim Rounds</span>
            <input
              id="grand-arena-sim-rounds"
              v-model.number="simRoundsPerPair"
              type="number"
              min="1"
              max="15"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Min Win Rate (%)</span>
            <input
              id="grand-arena-min-win"
              v-model.number="minWinRatePct"
              type="number"
              min="1"
              max="100"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Hidden Policy</span>
            <select
              id="grand-arena-hidden-policy"
              v-model="hiddenPolicy"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="visible2-and-sacrifice">Visible-2 + Sacrifice</option>
              <option value="visible2-only">Strict Visible-2 Only</option>
              <option value="skip-hidden">Skip All Hidden</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Max Hidden (%)</span>
            <input
              id="grand-arena-max-hidden-ratio"
              v-model.number="maxHiddenPowerRatioPct"
              type="number"
              min="20"
              max="120"
              :disabled="isAutoRunning"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input id="grand-arena-skip-two-hidden" v-model="skipTwoHidden" type="checkbox" :disabled="isAutoRunning" />
          <span>Skip opponents with ≥ 2 hidden teams (Top 20)</span>
        </label>

        <AutomationLogPanel :entries="logs" empty-text="No Grand Arena automation events yet." @clear="logs = []" />
      </div>
    </div>

    <template #footer>
      <div id="grand-arena-dialog-footer" class="w-full flex flex-wrap items-center justify-end gap-2">
        <button
          id="btn-grand-arena-presim"
          type="button"
          :disabled="!selectedEnemy || isSimulating || isAutoRunning || !allTeamsComplete"
          class="cursor-pointer px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs disabled:opacity-50 transition"
          @click="handleManualPreSim"
        >
          🧪 Pre-Sim (0 Cost)
        </button>
        <button
          id="btn-grand-arena-fight"
          type="button"
          :disabled="!selectedEnemy || isSimulating || isAutoRunning || !allTeamsComplete"
          class="cursor-pointer px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 transition"
          @click="handleManualFight"
        >
          ⚔️ Fight Best Order
        </button>
        <button
          v-if="!isAutoRunning"
          id="btn-grand-arena-auto-start"
          type="button"
          :disabled="isSimulating || !allTeamsComplete"
          class="cursor-pointer px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs disabled:opacity-50 transition"
          @click="startAutoGrandArena"
        >
          ▶ Start Auto Grand Arena
        </button>
        <button
          v-else
          id="btn-grand-arena-auto-stop"
          type="button"
          class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
          @click="stopAutoGrandArena"
        >
          ⏹ Stop Auto
        </button>
      </div>
    </template>
  </ModalDialog>
</template>
