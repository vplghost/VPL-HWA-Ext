<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useDraft } from '@/src/composables/useDraft';
import { buildCandidateMatrix, buildDraftHeroCandidate, formatDraftPhase } from '@/src/utils/draftHelper';
import type { DraftHeroCandidate } from '@/src/types/game/draft';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { draftSession } = useDraft();

const now = ref(Math.floor(Date.now() / 1000));
let countdownTimer: any = null;
const showDiagnostics = ref(false);
const copiedDiagnostics = ref(false);

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

// Current picked hero IDs according to stage (Defense or Attack)
const activePickedIds = computed<number[]>(() => {
  if (draftSession.stageId === 4 || draftSession.phase === 'attack') {
    return draftSession.chosenAttackHeroes.length > 0
      ? draftSession.chosenAttackHeroes
      : draftSession.chosenDefenceHeroes;
  }
  return draftSession.chosenDefenceHeroes;
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
  cipherLength: draftSession.rawCiphertext?.length || 0,
  cipherSample: draftSession.rawCiphertext ? draftSession.rawCiphertext.slice(0, 120) : null,
  error: draftSession.error || null,
  errorDetail: draftSession.errorDetail || null,
  rawDecryptedSample: draftSession.rawDecrypted ? draftSession.rawDecrypted.slice(0, 400) : null,
  updatedAt: draftSession.updatedAt ? new Date(draftSession.updatedAt).toISOString() : null,
}));

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
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-300">Legends Draft Diagnostics Snapshot</span>
          <button
            type="button"
            class="cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
            @click="copyDiagnostics"
          >
            {{ copiedDiagnostics ? '✓ Copied JSON' : 'Copy JSON' }}
          </button>
        </div>
        <pre class="overflow-auto max-h-56 whitespace-pre-wrap break-all">{{ JSON.stringify(diagnosticReport, null, 2) }}</pre>
      </div>

      <!-- Main 15 Candidates Matrix: 5 Pick Columns x 3 Candidate Rows -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>🃏 15 Candidate Heroes (5 Pick Rounds × 3 Cards)</span>
          </h3>
          <span class="text-xs text-slate-400 dark:text-slate-500">
            {{ candidateColumns.length > 0 ? `Loaded ${totalCandidateCount} candidates${swapCandidates.length > 0 ? ` (${swapCandidates.length} swap)` : ''}` : 'Waiting for draft payload...' }}
          </span>
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

                    <!-- Role/Class Badge -->
                    <span
                      v-if="hero.role || hero.class"
                      class="text-[10px] text-slate-400 truncate"
                    >
                      {{ hero.role || hero.class }}
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
