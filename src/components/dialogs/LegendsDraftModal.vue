<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useDraft } from '@/src/composables/useDraft';
import { buildCandidateMatrix, buildDraftHeroCandidate, formatDraftPhase, normalizeDraftHeroIdList } from '@/src/utils/draftHelper';
import {
  recommendTop3DraftTeams,
  shortFactionName,
  getFactionBadgeClass,
  getClassBadgeClass,
  type DraftTeamRecommendation,
} from '@/src/services/draftRecommendationService';
import { buildSyntheticArenaBattle, type PvpHeroSnapshot } from '@/src/services/pvpTeamOptimizer';
import { simulateBattleWithUnity } from '@/src/utils/dungeonBattleSim';
import type { DraftHeroCandidate } from '@/src/types/game/draft';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { draftSession, retryDecrypt } = useDraft();

const now = ref(Math.floor(Date.now() / 1000));
let countdownTimer: any = null;
const showDiagnostics = ref(false);
const showFullRawJson = ref(false);
const copiedDiagnostics = ref(false);
const retryingDecrypt = ref(false);

function handleRetryDecrypt() {
  retryingDecrypt.value = true;
  retryDecrypt();
  setTimeout(() => {
    retryingDecrypt.value = false;
  }, 1500);
}

onMounted(() => {
  countdownTimer = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

// Format remaining time in seconds
const remainingSeconds = computed(() => {
  if (!draftSession.stageFinishTs) return null;
  return Math.max(0, draftSession.stageFinishTs - now.value);
});

// Format phase information
const phaseInfo = computed(() => {
  return formatDraftPhase(draftSession.stageId);
});

// Normalized Defense & Attack hero ID lists (resilient to Array or indexed Object shapes)
const normalizedDefenceHeroIds = computed<number[]>(() =>
  normalizeDraftHeroIdList(draftSession.chosenDefenceHeroes)
);
const normalizedAttackHeroIds = computed<number[]>(() =>
  normalizeDraftHeroIdList(draftSession.chosenAttackHeroes)
);

// Current picked hero IDs according to stage (Defense or Attack)
const activePickedIds = computed<number[]>(() => {
  const isAttackOrLater =
    (draftSession.stageId != null && draftSession.stageId >= 4) ||
    draftSession.phase === 'attack' ||
    draftSession.phase === 'battle' ||
    draftSession.phase === 'result';
  if (isAttackOrLater) {
    return normalizedAttackHeroIds.value.length > 0
      ? normalizedAttackHeroIds.value
      : normalizedDefenceHeroIds.value;
  }
  return normalizedDefenceHeroIds.value;
});

// Matrix of candidate heroes: columns (rounds) x choices
const candidateColumns = computed<DraftHeroCandidate[][]>(() => {
  if (!draftSession.heroSteps || draftSession.heroSteps.length === 0) {
    return [];
  }
  return buildCandidateMatrix(draftSession.heroSteps, activePickedIds.value, draftSession.heroDetails);
});

const swapCandidates = computed<DraftHeroCandidate[]>(() => {
  if (!Array.isArray(draftSession.swapHeroIds) || draftSession.swapHeroIds.length === 0) {
    return [];
  }
  const pickedSet = new Set(activePickedIds.value.filter((id) => Number.isFinite(id) && id > 0));
  return draftSession.swapHeroIds.map((id) => buildDraftHeroCandidate(id, pickedSet, draftSession.heroDetails));
});

const enemyCandidates = computed<DraftHeroCandidate[]>(() => {
  if (!Array.isArray(draftSession.enemyHeroes) || draftSession.enemyHeroes.length === 0) {
    return [];
  }
  const detailsMap: Record<number, any> = {};
  for (const h of draftSession.enemyHeroes) {
    if (h?.id) detailsMap[h.id] = h;
  }
  return draftSession.enemyHeroes
    .filter((h) => Number.isFinite(h?.id) && h.id > 0)
    .map((h) => buildDraftHeroCandidate(h.id, new Set(), detailsMap));
});

const enemyCandidateColumns = computed<DraftHeroCandidate[][]>(() => {
  if (enemyCandidates.value.length !== 15) return [];
  const cols: DraftHeroCandidate[][] = [];
  for (let i = 0; i < enemyCandidates.value.length; i += 3) {
    cols.push(enemyCandidates.value.slice(i, i + 3));
  }
  return cols;
});

const playerDefenseTeam = computed<DraftHeroCandidate[]>(() => {
  const ids = normalizedDefenceHeroIds.value;
  const pickedSet = new Set(ids);
  return ids.map((id) => buildDraftHeroCandidate(id, pickedSet, draftSession.heroDetails));
});

const playerAttackTeam = computed<DraftHeroCandidate[]>(() => {
  const ids = normalizedAttackHeroIds.value;
  const pickedSet = new Set(ids);
  return ids.map((id) => buildDraftHeroCandidate(id, pickedSet, draftSession.heroDetails));
});

const playerDefensePower = computed(() =>
  playerDefenseTeam.value.reduce((sum, h) => sum + (h.power || 0), 0)
);
const playerAttackPower = computed(() =>
  playerAttackTeam.value.reduce((sum, h) => sum + (h.power || 0), 0)
);

// Phase 2: Instant Top-3 Team Recommendations (Defense & Attack, 0 WASM calls)
const recommendationMode = computed<'defense' | 'attack'>(() =>
  draftSession.stageId === 4 || draftSession.phase === 'attack' ? 'attack' : 'defense'
);

const recommendedTeams = computed<DraftTeamRecommendation[]>(() => {
  if (!draftSession.heroSteps || draftSession.heroSteps.length === 0) return [];
  return recommendTop3DraftTeams(
    draftSession.heroSteps,
    draftSession.heroDetails,
    recommendationMode.value,
    enemyCandidates.value
  );
});

const highlightedTeamKey = ref<string | null>(null);
const highlightedHeroIdSet = computed<Set<number>>(() => {
  if (!highlightedTeamKey.value) return new Set();
  const team = recommendedTeams.value.find((t) => t.key === highlightedTeamKey.value);
  return new Set(team ? team.heroIds : []);
});

const canSimulateAttackRecommendations = computed(
  () => recommendationMode.value === 'attack' && enemyCandidates.value.length === 5
);

interface DraftSimResult {
  wins: number;
  total: number;
  winRatePct: number;
  error?: string;
}

const simResults = ref<Record<string, DraftSimResult>>({});
const simulatingTeamKey = ref<string | null>(null);
const simProgressText = ref<string>('');
const SIM_ROUNDS = 5;

function simCacheKey(team: DraftTeamRecommendation): string {
  const enemyKey = enemyCandidates.value.map((e) => e.id).join('-');
  return `${draftSession.matchId ?? 'x'}:${team.key}:vs:${enemyKey}`;
}

function getSimResult(team: DraftTeamRecommendation): DraftSimResult | null {
  return simResults.value[simCacheKey(team)] || null;
}

async function simulateRecommendedTeam(team: DraftTeamRecommendation) {
  if (!canSimulateAttackRecommendations.value || simulatingTeamKey.value) return;
  const cacheKey = simCacheKey(team);
  simulatingTeamKey.value = team.key;
  simProgressText.value = `0/${SIM_ROUNDS}`;

  try {
    const heroMap = new Map<number, PvpHeroSnapshot>();
    for (const h of [...team.heroes, ...enemyCandidates.value]) {
      heroMap.set(h.id, {
        id: h.id,
        level: h.level ?? 120,
        color: h.color ?? 16,
        star: h.star ?? 4,
        power: h.power ?? 180000,
      });
    }
    const enemyIds = enemyCandidates.value.map((e) => e.id);
    let wins = 0;
    const baseSeed = Date.now() >>> 0;

    for (let i = 0; i < SIM_ROUNDS; i++) {
      simProgressText.value = `${i + 1}/${SIM_ROUNDS}`;
      const seed = (baseSeed + i * 7919) >>> 0;
      const payload = buildSyntheticArenaBattle(team.heroIds, enemyIds, heroMap, seed);
      const outcome = await simulateBattleWithUnity(payload, seed);
      if (outcome?.win) wins++;
    }

    simResults.value = {
      ...simResults.value,
      [cacheKey]: {
        wins,
        total: SIM_ROUNDS,
        winRatePct: Math.round((wins / SIM_ROUNDS) * 100),
      },
    };
  } catch (err: any) {
    simResults.value = {
      ...simResults.value,
      [cacheKey]: {
        wins: 0,
        total: 0,
        winRatePct: 0,
        error: err?.message || String(err),
      },
    };
  } finally {
    simulatingTeamKey.value = null;
    simProgressText.value = '';
  }
}

const poolHeadingLabel = computed(() => {
  if (draftSession.stageId === 2) {
    return 'Your Defense Pool — 15 Candidate Heroes (5 Pick Rounds × 3 Cards)';
  }
  if (draftSession.stageId === 4) {
    return 'Your Attack Pool — 15 Candidate Heroes (5 Pick Rounds × 3 Cards)';
  }
  return 'Your 15 Candidate Heroes (5 Pick Rounds × 3 Cards)';
});

const totalCandidateCount = computed(() =>
  candidateColumns.value.reduce((sum, col) => sum + col.length, 0) + swapCandidates.value.length
);

function formatHeroPower(power: number | undefined): string {
  if (!power || power <= 0) return '';
  if (power >= 1000) return `${Math.round(power / 1000)}K`;
  return String(power);
}

const diagnosticReport = computed(() => ({
  timestamp: new Date().toISOString(),
  matchId: draftSession.matchId,
  stageId: draftSession.stageId,
  phase: draftSession.phase,
  candidateCount: totalCandidateCount.value,
  enemyHeroCount: enemyCandidates.value.length,
  heroSteps: draftSession.heroSteps || [],
  swapHeroIds: draftSession.swapHeroIds || [],
  enemyHeroIds: (draftSession.enemyHeroes || []).map((h) => h.id),
  chosenDefenceHeroes: draftSession.chosenDefenceHeroes || [],
  chosenAttackHeroes: draftSession.chosenAttackHeroes || [],
  decryptMethod: draftSession.decryptMethod || null,
  cipherLength: draftSession.rawCiphertext?.length || 0,
  enemyCipherLength: draftSession.rawEnemyCiphertext?.length || 0,
  rawDecryptedLength: draftSession.rawDecrypted?.length || 0,
  rawEnemyDecryptedLength: draftSession.rawEnemyDecrypted?.length || 0,
  error: draftSession.error || null,
  errorDetail: draftSession.errorDetail || null,
  rawDecrypted: draftSession.rawDecrypted || null,
  rawEnemyDecrypted: draftSession.rawEnemyDecrypted || null,
  updatedAt: draftSession.updatedAt ? new Date(draftSession.updatedAt).toISOString() : null,
}));

const diagnosticDisplayReport = computed(() => {
  if (showFullRawJson.value) return diagnosticReport.value;
  const full = diagnosticReport.value;
  return {
    ...full,
    rawDecrypted: full.rawDecrypted
      ? (full.rawDecrypted.length > 400
          ? `${full.rawDecrypted.slice(0, 400)}... (${full.rawDecrypted.length} chars — click Copy JSON for full payload)`
          : full.rawDecrypted)
      : null,
    rawEnemyDecrypted: full.rawEnemyDecrypted
      ? (full.rawEnemyDecrypted.length > 400
          ? `${full.rawEnemyDecrypted.slice(0, 400)}... (${full.rawEnemyDecrypted.length} chars — click Copy JSON for full payload)`
          : full.rawEnemyDecrypted)
      : null,
  };
});

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnosticReport.value, null, 2));
    copiedDiagnostics.value = true;
    setTimeout(() => {
      copiedDiagnostics.value = false;
    }, 2000);
  } catch (_) {}
}

function getAvatarUrl(file: string | undefined): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

function getMainStatColor(stat: string | undefined): string {
  switch (stat?.toLowerCase()) {
    case 'strength':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'agility':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'intelligence':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  }
}

function getMainStatAbbr(stat: string | undefined): string {
  switch (stat?.toLowerCase()) {
    case 'strength':
      return 'STR';
    case 'agility':
      return 'AGI';
    case 'intelligence':
      return 'INT';
    default:
      return 'STAT';
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Legends Draft — Candidate Pool & Match Tracker"
    icon="🏆"
    max-width="max-w-6xl"
    modal-name="legendsDraft"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-4 text-xs sm:text-sm">
      <!-- Top Status Banner -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <!-- Match & Phase Details -->
        <div class="flex flex-wrap items-center gap-2.5">
          <span
            class="px-2.5 py-1 text-xs font-semibold rounded-lg border flex items-center gap-1.5 shadow-sm"
            :class="phaseInfo.badgeCls"
          >
            <span>{{ phaseInfo.icon }}</span>
            <span>{{ phaseInfo.label }}</span>
          </span>

          <span
            v-if="draftSession.matchId"
            class="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
          >
            Match #{{ draftSession.matchId }}
          </span>

          <span
            v-if="draftSession.userRating != null"
            class="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20"
          >
            ⭐ Rating: {{ draftSession.userRating }}
            <span v-if="draftSession.enemyRating"> vs {{ draftSession.enemyRating }}</span>
          </span>
        </div>

        <!-- Opponent & Countdown -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Opponent Info -->
          <div
            v-if="draftSession.enemyUser"
            class="flex items-center gap-2 px-3 py-1 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-medium"
          >
            <span class="text-slate-400 dark:text-slate-500 font-normal">Opponent:</span>
            <span class="font-bold">{{ draftSession.enemyUser.name || 'Unknown Opponent' }}</span>
            <span v-if="draftSession.enemyUser.level" class="text-xs opacity-75">Lv.{{ draftSession.enemyUser.level }}</span>
            <span v-if="draftSession.enemyUser.clanTitle" class="text-xs opacity-75">[{{ draftSession.enemyUser.clanTitle }}]</span>
          </div>

          <!-- Countdown -->
          <div
            v-if="remainingSeconds != null"
            class="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-mono font-bold"
            :class="remainingSeconds <= 15 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'"
          >
            <span>⏱️ Remaining:</span>
            <span>{{ remainingSeconds }}s</span>
          </div>
        </div>
      </div>

      <!-- Decoding Error Alert (if any) -->
      <div
        v-if="draftSession.error"
        id="draft-error-alert"
        class="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex flex-col gap-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 font-semibold">
          <div class="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Draft Decryption Error:</span>
            <span>{{ draftSession.error }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              id="btn-copy-draft-diagnostics"
              type="button"
              class="cursor-pointer px-2.5 py-1 text-xs font-semibold rounded bg-red-600/20 hover:bg-red-600/30 text-red-700 dark:text-red-300 transition"
              @click="copyDiagnostics"
            >
              {{ copiedDiagnostics ? '✓ Copied' : 'Copy Diagnostics' }}
            </button>
            <button
              type="button"
              class="cursor-pointer text-xs underline hover:opacity-80"
              @click="showDiagnostics = !showDiagnostics"
            >
              {{ showDiagnostics ? 'Hide Technical Details' : 'Show Technical Details' }}
            </button>
          </div>
        </div>
        <p v-if="draftSession.errorDetail" class="text-xs opacity-90 font-mono break-all">
          {{ draftSession.errorDetail }}
        </p>
      </div>

      <!-- Collapsible Technical Diagnostics Panel -->
      <div
        v-if="showDiagnostics"
        id="draft-diagnostics-panel"
        class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] flex flex-col gap-2"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-slate-300">Legends Draft Diagnostics Snapshot</span>
          <div class="flex items-center gap-2">
            <button
              id="btn-toggle-draft-full-raw"
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
              @click="showFullRawJson = !showFullRawJson"
            >
              {{ showFullRawJson ? 'Compact Preview' : 'Show Full Raw JSON' }}
            </button>
            <button
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
              @click="copyDiagnostics"
            >
              {{ copiedDiagnostics ? '✓ Copied Full JSON' : 'Copy Full JSON' }}
            </button>
          </div>
        </div>
        <pre class="overflow-auto max-h-64 whitespace-pre-wrap break-all">{{ JSON.stringify(diagnosticDisplayReport, null, 2) }}</pre>
      </div>

      <!-- Main 15 Candidates Matrix: 5 Pick Columns x 3 Candidate Rows -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>🃏 {{ poolHeadingLabel }}</span>
          </h3>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ candidateColumns.length > 0 ? `Loaded ${totalCandidateCount} candidates${swapCandidates.length > 0 ? ` (${swapCandidates.length} swap)` : ''}` : 'Waiting for draft payload...' }}
            </span>
            <button
              v-if="draftSession.rawCiphertext && candidateColumns.length === 0"
              id="draft-retry-decrypt-btn"
              type="button"
              :disabled="retryingDecrypt"
              class="cursor-pointer px-2 py-0.5 text-[11px] font-semibold rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 transition disabled:opacity-50"
              @click="handleRetryDecrypt"
            >
              {{ retryingDecrypt ? 'Retrying...' : '↻ Retry Decrypt' }}
            </button>
          </div>
        </div>

        <!-- 5 Columns Grid -->
        <div
          v-if="candidateColumns.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3"
        >
          <div
            v-for="(col, colIdx) in candidateColumns"
            :key="colIdx"
            class="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
          >
            <!-- Column Step Header -->
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Round {{ colIdx + 1 }}
              </span>
              <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                Pick #{{ colIdx + 1 }}
              </span>
            </div>

            <!-- 3 Candidate Cards in this Pick Step -->
            <div class="flex flex-col gap-2">
              <div
                v-for="hero in col"
                :key="hero.id"
                class="relative flex items-center gap-2.5 p-2 rounded-lg border transition-all"
                :class="
                  hero.picked
                    ? 'bg-amber-500/10 border-amber-500/60 dark:border-amber-400/60 shadow-sm ring-1 ring-amber-500/30'
                    : highlightedHeroIdSet.has(hero.id)
                      ? 'bg-emerald-500/10 border-emerald-500 dark:border-emerald-400 shadow-sm ring-2 ring-emerald-500/40'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                "
              >
                <!-- Picked Ribbon Badge -->
                <div
                  v-if="hero.picked"
                  class="absolute -top-1.5 -right-1 px-1.5 py-0.2 text-[9px] font-bold tracking-tight bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full shadow-xs"
                >
                  ✓ PICKED
                </div>

                <!-- Hero Avatar -->
                <div class="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    v-if="hero.avatarFile"
                    :src="getAvatarUrl(hero.avatarFile)"
                    :alt="hero.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-xs font-bold text-slate-400">
                    #{{ hero.id }}
                  </span>
                </div>

                <!-- Hero Info -->
                <div class="flex flex-col min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                      {{ hero.name }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1 mt-0.5 flex-wrap">
                    <!-- Main Stat Badge -->
                    <span
                      v-if="hero.mainStat"
                      class="px-1 py-0.2 text-[9px] font-bold rounded border uppercase"
                      :class="getMainStatColor(hero.mainStat)"
                    >
                      {{ getMainStatAbbr(hero.mainStat) }}
                    </span>

                    <!-- Class & Position Role Badge -->
                    <span
                      v-if="hero.class || hero.role"
                      class="px-1 py-0.2 text-[9px] font-semibold rounded border"
                      :class="getClassBadgeClass(hero.class)"
                    >
                      {{ hero.class ? (hero.role ? `${hero.class} · ${hero.role}` : hero.class) : hero.role }}
                    </span>

                    <!-- Faction Badge -->
                    <span
                      v-if="hero.faction"
                      class="px-1 py-0.2 text-[9px] font-semibold rounded border"
                      :class="getFactionBadgeClass(hero.faction)"
                    >
                      {{ shortFactionName(hero.faction) }}
                    </span>

                    <!-- Star & Power from decrypted snapshot -->
                    <span
                      v-if="hero.star"
                      class="text-[10px] font-semibold text-amber-500"
                    >
                      ★{{ hero.star }}
                    </span>
                    <span
                      v-if="hero.power"
                      class="text-[10px] font-mono text-slate-500 dark:text-slate-400"
                    >
                      {{ formatHeroPower(hero.power) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Placeholder when no match / waiting -->
        <div
          v-else
          class="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center bg-slate-50 dark:bg-slate-900/30 text-slate-400"
        >
          <span class="text-3xl mb-2">🃏</span>
          <p class="font-semibold text-slate-700 dark:text-slate-200">
            No Legends Draft candidate data yet
          </p>
          <p class="text-xs text-slate-500 max-w-md mt-1">
            Start a Legends Draft match in game to automatically capture RPC/MQTT packets, decrypt the 15-hero candidate pool via DraftsXORCipher, and display all 5 pick rounds here.
          </p>
        </div>

        <!-- Phase 2: Instant Top-3 Team Recommendations (Defense & Attack; on-demand WASM simulation in Attack only) -->
        <div
          v-if="recommendedTeams.length > 0"
          id="draft-recommendations"
          class="mt-2 flex flex-col gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
        >
          <div class="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-emerald-500/20">
            <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              ✨ Top 3 Recommended {{ recommendationMode === 'attack' ? 'Attack' : 'Defense' }} Teams (Role + Faction Synergy)
            </span>
            <span class="text-[10px] text-slate-400">
              Click a team to highlight its 5 picks across Rounds 1–5
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div
              v-for="(team, tIdx) in recommendedTeams"
              :key="team.key"
              class="flex flex-col gap-2 p-2.5 rounded-xl border transition-all cursor-pointer"
              :class="
                highlightedTeamKey === team.key
                  ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/40'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-400'
              "
              @mouseenter="highlightedTeamKey = team.key"
              @click="highlightedTeamKey = highlightedTeamKey === team.key ? null : team.key"
            >
              <div class="flex items-center justify-between gap-1.5">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  #{{ team.rank }} {{ team.archetypeLabel }}
                </span>
                <span class="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {{ team.score }} pts
                </span>
              </div>

              <div class="flex items-center gap-1">
                <div
                  v-for="h in team.heroes"
                  :key="team.key + '-' + h.id"
                  class="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"
                  :title="`${h.name} (${h.class || h.role || ''} · ${shortFactionName(h.faction)})`"
                >
                  <img
                    v-if="h.avatarFile"
                    :src="getAvatarUrl(h.avatarFile)"
                    :alt="h.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[9px] font-bold text-slate-400">#{{ h.id }}</span>
                </div>
              </div>

              <div class="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                <div class="truncate font-medium text-slate-600 dark:text-slate-300">{{ team.roleSummary }}</div>
                <div class="flex items-center justify-between gap-1">
                  <span class="truncate">{{ team.factionSummary }}</span>
                  <span v-if="team.totalPower > 0" class="font-mono shrink-0">⚡ {{ formatHeroPower(team.totalPower) }}</span>
                </div>
              </div>

              <!-- On-demand WASM Simulate button (Attack Phase only, manual click required) -->
              <div
                v-if="canSimulateAttackRecommendations"
                class="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                @click.stop
              >
                <button
                  :id="`btn-draft-sim-team-${tIdx}`"
                  type="button"
                  :disabled="simulatingTeamKey !== null"
                  class="cursor-pointer px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                  @click="simulateRecommendedTeam(team)"
                >
                  {{ simulatingTeamKey === team.key ? `⏳ Sim ${simProgressText}` : '▶ Simulate' }}
                </button>

                <span
                  v-if="getSimResult(team)"
                  class="text-[11px] font-bold font-mono"
                  :class="
                    getSimResult(team)?.error
                      ? 'text-rose-500'
                      : (getSimResult(team)?.winRatePct ?? 0) >= 60
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                  "
                >
                  {{
                    getSimResult(team)?.error
                      ? 'Sim Error'
                      : `${getSimResult(team)!.winRatePct}% Win (${getSimResult(team)!.wins}/${getSimResult(team)!.total})`
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Swap Pool (when decrypted payload includes { swap: { ... } }) -->
        <div
          v-if="swapCandidates.length > 0"
          id="draft-swap-pool"
          class="mt-2 flex flex-col gap-2 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
        >
          <div class="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              🔄 Swap Pool ({{ swapCandidates.length }})
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <div
              v-for="hero in swapCandidates"
              :key="'swap-' + hero.id"
              class="relative flex items-center gap-2 p-2 rounded-lg border bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            >
              <div class="relative w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <img
                  v-if="hero.avatarFile"
                  :src="getAvatarUrl(hero.avatarFile)"
                  :alt="hero.name"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <span v-else class="text-xs font-bold text-slate-400">#{{ hero.id }}</span>
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <span class="font-bold text-xs truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                  {{ hero.name }}
                </span>
                <div class="flex items-center gap-1 text-[10px] text-slate-400">
                  <span v-if="hero.star" class="font-semibold text-amber-500">★{{ hero.star }}</span>
                  <span v-if="hero.power" class="font-mono">{{ formatHeroPower(hero.power) }}</span>
                  <span v-else-if="hero.class" class="truncate">{{ hero.class }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Your Selected Teams (Defense & Attack picks) -->
        <div
          v-if="playerDefenseTeam.length > 0 || playerAttackTeam.length > 0"
          id="draft-player-teams"
          class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div
            v-if="playerDefenseTeam.length > 0"
            class="flex flex-col gap-2 p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20"
          >
            <div class="flex items-center justify-between pb-1 border-b border-blue-500/20">
              <span class="text-xs font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                🛡️ Your Defense Team ({{ playerDefenseTeam.length }}/5)
              </span>
              <span v-if="playerDefensePower > 0" class="text-[11px] font-mono font-semibold text-blue-500/80 dark:text-blue-300/80">
                ⚡ {{ formatHeroPower(playerDefensePower) }}
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <div
                v-for="hero in playerDefenseTeam"
                :key="'my-def-' + hero.id"
                class="flex items-center gap-1.5 p-1.5 rounded-lg border bg-white dark:bg-slate-950 border-blue-500/25"
              >
                <div class="w-8 h-8 shrink-0 rounded-md overflow-hidden border border-blue-500/30 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    v-if="hero.avatarFile"
                    :src="getAvatarUrl(hero.avatarFile)"
                    :alt="hero.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[10px] font-bold text-slate-400">#{{ hero.id }}</span>
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="font-bold text-[11px] truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                    {{ hero.name }}
                  </span>
                  <span v-if="hero.power" class="text-[10px] font-mono text-slate-400">
                    {{ formatHeroPower(hero.power) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="playerAttackTeam.length > 0 || (draftSession.stageId != null && draftSession.stageId >= 4)"
            class="flex flex-col gap-2 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
          >
            <div class="flex items-center justify-between pb-1 border-b border-emerald-500/20">
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                ⚔️ Your Attack Team ({{ playerAttackTeam.length }}/5)
              </span>
              <span v-if="playerAttackPower > 0" class="text-[11px] font-mono font-semibold text-emerald-500/80 dark:text-emerald-300/80">
                ⚡ {{ formatHeroPower(playerAttackPower) }}
              </span>
            </div>
            <div v-if="playerAttackTeam.length === 0" class="text-[11px] text-slate-400 italic py-2 text-center">
              Picking Attack Team (0/5)...
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <div
                v-for="hero in playerAttackTeam"
                :key="'my-atk-' + hero.id"
                class="flex items-center gap-1.5 p-1.5 rounded-lg border bg-white dark:bg-slate-950 border-emerald-500/25"
              >
                <div class="w-8 h-8 shrink-0 rounded-md overflow-hidden border border-emerald-500/30 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    v-if="hero.avatarFile"
                    :src="getAvatarUrl(hero.avatarFile)"
                    :alt="hero.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[10px] font-bold text-slate-400">#{{ hero.id }}</span>
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="font-bold text-[11px] truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                    {{ hero.name }}
                  </span>
                  <span v-if="hero.power" class="text-[10px] font-mono text-slate-400">
                    {{ formatHeroPower(hero.power) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Enemy Team / Pool (decrypted from draftEnemy in Stage 2 / Stage 4) -->
        <div
          v-if="enemyCandidates.length > 0"
          id="draft-enemy-team"
          class="mt-2 flex flex-col gap-2 p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/20"
        >
          <div class="flex items-center justify-between pb-1 border-b border-rose-500/20">
            <span class="text-xs font-bold uppercase tracking-wider text-rose-400">
              {{
                enemyCandidateColumns.length === 5
                  ? '⚔️ Enemy Attack Candidate Pool (5 Pick Rounds × 3 Cards)'
                  : (draftSession.stageId === 4 ? `🛡️ Enemy Defense Team (${enemyCandidates.length})` : `🛡️ Enemy Heroes (${enemyCandidates.length})`)
              }}
            </span>
          </div>

          <!-- Stage 2: Enemy 15-hero Attack Pool in exact 5x3 round columns -->
          <div
            v-if="enemyCandidateColumns.length === 5"
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5"
          >
            <div
              v-for="(col, colIdx) in enemyCandidateColumns"
              :key="'enemy-col-' + colIdx"
              class="flex flex-col gap-1.5 p-2 rounded-lg bg-rose-500/5 border border-rose-500/15"
            >
              <div class="flex items-center justify-between pb-1 border-b border-rose-500/15">
                <span class="text-[11px] font-bold text-rose-400">Round {{ colIdx + 1 }}</span>
                <span class="text-[10px] text-rose-300/80">Enemy #{{ colIdx + 1 }}</span>
              </div>
              <div
                v-for="hero in col"
                :key="'enemy-' + hero.id"
                class="relative flex items-center gap-2 p-1.5 rounded-lg border bg-white dark:bg-slate-950 border-rose-500/25"
              >
                <div class="relative w-8 h-8 shrink-0 rounded-md overflow-hidden border border-rose-500/30 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    v-if="hero.avatarFile"
                    :src="getAvatarUrl(hero.avatarFile)"
                    :alt="hero.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[10px] font-bold text-slate-400">#{{ hero.id }}</span>
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="font-bold text-xs truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                    {{ hero.name }}
                  </span>
                  <div class="flex items-center gap-1 text-[10px] text-slate-400">
                    <span v-if="hero.star" class="font-semibold text-amber-500">★{{ hero.star }}</span>
                    <span v-if="hero.power" class="font-mono">{{ formatHeroPower(hero.power) }}</span>
                    <span v-else-if="hero.class" class="truncate">{{ hero.class }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Stage 4: Enemy 5-hero Defense Team -->
          <div
            v-else
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2"
          >
            <div
              v-for="hero in enemyCandidates"
              :key="'enemy-' + hero.id"
              class="relative flex items-center gap-2 p-2 rounded-lg border bg-white dark:bg-slate-950 border-rose-500/25"
            >
              <div class="relative w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-rose-500/30 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <img
                  v-if="hero.avatarFile"
                  :src="getAvatarUrl(hero.avatarFile)"
                  :alt="hero.name"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <span v-else class="text-xs font-bold text-slate-400">#{{ hero.id }}</span>
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <span class="font-bold text-xs truncate text-slate-800 dark:text-slate-100" :title="hero.name">
                  {{ hero.name }}
                </span>
                <div class="flex items-center gap-1 text-[10px] text-slate-400">
                  <span v-if="hero.star" class="font-semibold text-amber-500">★{{ hero.star }}</span>
                  <span v-if="hero.power" class="font-mono">{{ formatHeroPower(hero.power) }}</span>
                  <span v-else-if="hero.class" class="truncate">{{ hero.class }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer & Controls -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 mt-2">
        <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full" :class="draftSession.error ? 'bg-red-500' : 'bg-emerald-500'"></span>
            <span>Decoder: DraftsXORCipher (WASM Heap + Session Key)</span>
          </span>
          <button
            type="button"
            class="cursor-pointer text-xs underline text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            @click="showDiagnostics = !showDiagnostics"
          >
            {{ showDiagnostics ? 'Hide Diagnostics' : 'Diagnostics' }}
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            @click="close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
