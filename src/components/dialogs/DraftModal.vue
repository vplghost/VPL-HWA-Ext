<script setup lang="ts">
import UnitStars from '@/src/components/common/UnitStars.vue';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const isRegistering = ref(false);
const now = ref(Date.now());
let timer: number | null = null;

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('keydown', handleKeydown);
});

const draftStatus = computed(() => cache.value.legendDraftStatus?.data || {});
const stageId = computed(() => (Number.isInteger(draftStatus.value.stageId) ? draftStatus.value.stageId : 0));

const stageDescription = computed(() => {
  const sId = stageId.value;
  const stages: Record<number, string> = {
    0: 'Not Registered',
    1: 'Searching Match',
    2: 'Defense Draft (Round 1)',
    3: 'Defense Draft (Round 2)',
    4: 'Attack Draft',
    5: 'Battle Ready',
    6: 'In Combat',
    7: 'Match Finished',
  };
  return stages[sId] || 'Draft Active';
});

const matchId = computed(() => draftStatus.value.matchId ?? draftStatus.value.lastResult?.matchId ?? null);
const draftChips = computed(() => cache.value['resource:consumable:40103']?.data?.amount ?? 0);

const stageFinishTs = computed(() => Number(draftStatus.value.stageFinishTs) || 0);

const countdownSeconds = computed(() => {
  if (!stageFinishTs.value || stageId.value === 0 || stageId.value === 7) return 0;
  return Math.max(0, Math.floor(stageFinishTs.value - now.value / 1000));
});

const formattedCountdown = computed(() => {
  const secs = countdownSeconds.value;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

const enemyUser = computed(() => draftStatus.value.enemyUser || null);
const rating = computed(() => draftStatus.value.rating || null);

const draftViewMode = ref<'defense' | 'attack'>('defense');

watch(
  stageId,
  (newStage) => {
    if (newStage === 4) {
      draftViewMode.value = 'attack';
    } else if (newStage === 2 || newStage === 3) {
      draftViewMode.value = 'defense';
    }
  },
  { immediate: true }
);

const defenceHeroes = computed<number[]>(() => {
  const raw = draftStatus.value.defenceHeroes || draftStatus.value.lastResult?.defenceHeroes || [];
  return Array.isArray(raw) ? raw : [];
});

const attackHeroes = computed<number[]>(() => {
  const raw = draftStatus.value.attackHeroes || draftStatus.value.lastResult?.attackHeroes || [];
  return Array.isArray(raw) ? raw : [];
});

const enemyDefenceHeroes = computed<number[]>(() => {
  const raw = draftStatus.value.enemyDefenceHeroes || [];
  return Array.isArray(raw) ? raw : [];
});

const enemyAttackHeroes = computed<number[]>(() => {
  const raw = draftStatus.value.enemyAttackHeroes || [];
  return Array.isArray(raw) ? raw : [];
});

const currentLineupHeroes = computed(() => {
  return draftViewMode.value === 'attack' ? attackHeroes.value : defenceHeroes.value;
});

function getHeroStar(mode: 'defense' | 'attack' | 'enemyDefence' | 'enemyAttack', heroId: number | string): number | null {
  const starsKey = mode === 'defense' ? 'defenceStars' : `${mode}Stars`;
  const starsObj = (draftStatus.value as any)[starsKey];
  const star = starsObj?.[heroId];
  return Number.isInteger(star) ? star : null;
}

const observedChoices = computed(() => {
  if (!matchId.value) return null;
  return (globalThis as any).hwaHelperPopupData?.observedDraftChoices?.(matchId.value) || null;
});

const poolCandidates = computed<number[]>(() => {
  const raw = (cache.value as any).legendDraft?.candidates;
  return Array.isArray(raw) ? raw : [];
});

const lastError = computed(() => draftStatus.value.lastError || null);
const lastErrorCode = computed(() => draftStatus.value.lastErrorCode || null);
const lastErrorAction = computed(() => draftStatus.value.lastErrorAction || null);

const isRefreshing = ref(false);

async function refreshDraft() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'randomDraft_getInfo' }]);
  } finally {
    isRefreshing.value = false;
  }
}

const lastResult = computed(() => draftStatus.value.lastResult || null);
const isWin = computed(() => {
  if (!lastResult.value) return false;
  return lastResult.value.result === 0 || lastResult.value.win === true;
});
const ratingDelta = computed(() => lastResult.value?.rating?.userDifRating ?? null);
const userRating = computed(() => lastResult.value?.rating?.userRating ?? null);
const bpExpReward = computed(() => lastResult.value?.reward?.draftBpExp ?? null);

function getEnemyAvatar(avatarId?: number): string {
  const idStr = String(avatarId || 1).padStart(2, '0');
  return `assets/heroes/hero_00${idStr}.png`;
}

function getHeroAvatar(heroId: number | string): string | null {
  const meta = getHeroMetadata(heroId);
  return meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${heroId}.webp` : null);
}

function getStarGlow(star?: number | null): string {
  if (!star || star < 3) return '';
  if (star === 3) return 'ring-1 ring-blue-400 shadow-blue-500/20';
  if (star === 4) return 'ring-2 ring-violet-400 shadow-violet-500/30';
  if (star === 5) return 'ring-2 ring-amber-400 shadow-amber-500/40';
  return 'ring-2 ring-rose-500 shadow-rose-500/50';
}

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

async function registerDraft() {
  isRegistering.value = true;
  try {
    await dispatchRpc([
      { name: 'randomDraft_register' },
      { name: 'randomDraft_getInfo' },
    ]);
  } finally {
    isRegistering.value = false;
  }
}

function getHeroName(id: number | string): string {
  const meta = getHeroMetadata(id);
  return meta?.name || `Hero #${id}`;
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target) target.style.display = 'none';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="draft-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-modal-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"

    >
      <div
        class="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h2 id="draft-modal-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
              Legend Draft
            </h2>
            <span
              id="draft-modal-stage-badge"
              class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300 dark:border dark:border-red-700/50"
            >
              {{ stageDescription }}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              id="draft-refresh-btn"
              type="button"
              class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              :class="{ 'animate-spin': isRefreshing }"
              title="Refresh Draft info"
              aria-label="Refresh Draft info"
              @click="refreshDraft"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>

            <button
              id="draft-modal-close"
              type="button"
              class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close dialog"
              @click="close"
            >
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div id="draft-modal-body" class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <!-- Overview Status Banner -->
          <div class="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20 flex items-center justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <div class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>⚔️</span>
                <span>Legend Draft Arena</span>
                <span v-if="matchId" class="text-xs font-mono font-normal text-slate-500">
                  Match #{{ matchId }}
                </span>
              </div>
              <div class="text-[11px] text-slate-600 dark:text-slate-400">
                Draft counter heroes, lock teams, and battle players in real-time draft matches.
              </div>
              <div v-if="countdownSeconds > 0" id="draft-countdown-row" class="flex items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Time remaining:</span>
                <span id="draft-countdown" class="font-mono font-bold text-red-600 dark:text-red-400 text-sm">
                  {{ formattedCountdown }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-bold text-xs text-slate-800 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <span>🎟️ Draft Chips:</span>
                <span class="font-extrabold text-red-600 dark:text-red-400">{{ formatNumber(draftChips) }}</span>
              </div>

              <button
                v-if="stageId === 0 || stageId === 7"
                type="button"
                :disabled="isRegistering"
                class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold shadow-xs transition-colors disabled:opacity-50"
                @click="registerDraft"
              >
                {{ isRegistering ? 'Registering...' : 'Register (1 Chip)' }}
              </button>
            </div>
          </div>

          <!-- Opponent Profile Card -->
          <div
            v-if="enemyUser"
            id="draft-opponent-card"
            class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/80 flex items-center justify-between gap-3 flex-wrap shadow-2xs"
          >
            <div class="flex items-center gap-3">
              <div class="relative size-11 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-700 shrink-0">
                <img
                  :src="getEnemyAvatar(enemyUser.avatarId)"
                  :alt="enemyUser.name || 'Opponent'"
                  class="size-full object-cover"
                  @error="handleImgError"
                />
              </div>
              <div class="space-y-0.5">
                <div class="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{{ enemyUser.name || 'Opponent' }}</span>
                  <span v-if="enemyUser.level" class="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-normal">
                    Lv.{{ enemyUser.level }}
                  </span>
                </div>
                <div v-if="enemyUser.clanTitle" class="text-[11px] text-slate-500 dark:text-slate-400">
                  Guild: {{ enemyUser.clanTitle }}
                </div>
              </div>
            </div>

            <div v-if="rating" class="text-right text-xs">
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Match Ratings</div>
              <div class="font-mono font-bold text-slate-800 dark:text-slate-200">
                You {{ rating.userRating ?? '—' }} <span class="text-slate-400 font-normal">vs</span> Opponent {{ rating.enemyRating ?? '—' }}
              </div>
            </div>
          </div>

          <!-- Last Result -->
          <div
            v-if="lastResult"
            id="draft-result-box"
            class="rounded-xl border p-3 flex items-center justify-between text-xs shadow-2xs flex-wrap gap-2"
            :class="
              isWin
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
            "
          >
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm">{{ isWin ? '🏆 Victory' : '⚔️ Defeat / Finished' }}</span>
              <span v-if="userRating != null" class="font-mono font-semibold">
                Rating: {{ userRating }}
                <span v-if="ratingDelta != null" :class="ratingDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
                  ({{ ratingDelta >= 0 ? '+' : '' }}{{ ratingDelta }})
                </span>
              </span>
            </div>
            <div v-if="bpExpReward" class="font-bold text-amber-600 dark:text-amber-400">
              +{{ bpExpReward }} BP EXP
            </div>
          </div>

          <!-- Server Error Alert -->
          <div
            v-if="lastError"
            id="draft-server-error"
            class="rounded-xl border border-red-300 bg-red-50/90 p-3 text-xs text-red-900 flex items-start gap-2.5 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 shadow-2xs"
          >
            <span class="text-base leading-none">❌</span>
            <div class="space-y-0.5">
              <div class="font-bold">Server reported error: "{{ lastError }}"{{ lastErrorCode ? ` (Code: ${lastErrorCode})` : '' }}</div>
              <div v-if="lastErrorAction" class="text-[11px] text-red-700 dark:text-red-300">Action: {{ lastErrorAction }}</div>
            </div>
          </div>

          <!-- Team Mode Switcher -->
          <div
            v-if="stageId !== 0"
            id="draft-mode-switcher"
            class="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                id="draft-tab-defense"
                type="button"
                class="px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                :class="
                  draftViewMode === 'defense'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                "
                @click="draftViewMode = 'defense'"
              >
                <span>🛡️ Defense Draft</span>
                <span
                  class="px-1.5 py-0.2 rounded-full text-[10px]"
                  :class="draftViewMode === 'defense' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'"
                >
                  {{ defenceHeroes.length }}/5
                </span>
              </button>

              <button
                id="draft-tab-attack"
                type="button"
                class="px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                :class="
                  draftViewMode === 'attack'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                "
                @click="draftViewMode = 'attack'"
              >
                <span>⚔️ Attack Draft</span>
                <span
                  class="px-1.5 py-0.2 rounded-full text-[10px]"
                  :class="draftViewMode === 'attack' ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'"
                >
                  {{ attackHeroes.length }}/5
                </span>
              </button>
            </div>

            <span class="text-xs text-slate-500 dark:text-slate-400 font-medium px-2">
              {{ draftViewMode === 'attack' ? 'Viewing Attack Draft team & Opponent Defense counter' : 'Viewing Defense Draft team & Opponent Attack' }}
            </span>
          </div>

          <!-- Opponent Counter Team -->
          <div
            v-if="draftViewMode === 'attack' && enemyDefenceHeroes.length > 0"
            id="draft-enemy-counter-card"
            class="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:border-amber-900/40 dark:bg-amber-950/20"
          >
            <div class="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <span>🛡️ Opponent Defense Team (5 heroes to counter):</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="hId in enemyDefenceHeroes"
                :key="'enemy-def-' + hId"
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white shadow-2xs dark:border-amber-800/60 dark:bg-slate-800"
              >
                <div class="size-7 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0">
                  <img
                    v-if="getHeroAvatar(hId)"
                    :src="getHeroAvatar(hId)!"
                    :alt="getHeroName(hId)"
                    class="size-full object-cover"
                    @error="handleImgError"
                  />
                  <div v-else class="size-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                    {{ getHeroName(hId).charAt(0) }}
                  </div>
                </div>
                <div class="flex flex-col">
                  <span class="font-bold text-[11px] text-slate-800 dark:text-slate-200">{{ getHeroName(hId) }}</span>
                  <span v-if="getHeroStar('enemyDefence', hId)" class="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    <UnitStars :count="getHeroStar('enemyDefence', hId)" compact="prefix" />
                  </span>
                </div>
              </div>
            </div>

            <!-- Observed enemy pick sequence if present -->
            <div
              v-if="observedChoices?.enemyDefence"
              id="draft-observed-picks"
              class="flex flex-wrap gap-1.5 pt-1 text-[11px] text-amber-900 dark:text-amber-300"
            >
              <span
                v-for="(choices, stepIdx) in observedChoices.enemyDefence"
                :key="'obs-def-' + stepIdx"
                class="rounded border border-amber-200 bg-white px-2 py-0.5 text-[10px] dark:border-amber-800/60 dark:bg-slate-800"
              >
                Step {{ Number(stepIdx) + 1 }}: {{ getHeroName(choices.find((id: any) => Number.isInteger(id)) || 0) }}
              </span>
            </div>
          </div>

          <div
            v-else-if="draftViewMode === 'defense' && enemyAttackHeroes.length > 0"
            id="draft-enemy-counter-card"
            class="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2 dark:border-red-900/40 dark:bg-red-950/20"
          >
            <div class="text-xs font-bold text-red-900 dark:text-red-200 flex items-center gap-1.5">
              <span>⚔️ Opponent Attack Team (5 heroes deployed against your defense):</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="hId in enemyAttackHeroes"
                :key="'enemy-atk-' + hId"
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white shadow-2xs dark:border-red-800/60 dark:bg-slate-800"
              >
                <div class="size-7 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0">
                  <img
                    v-if="getHeroAvatar(hId)"
                    :src="getHeroAvatar(hId)!"
                    :alt="getHeroName(hId)"
                    class="size-full object-cover"
                    @error="handleImgError"
                  />
                  <div v-else class="size-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                    {{ getHeroName(hId).charAt(0) }}
                  </div>
                </div>
                <div class="flex flex-col">
                  <span class="font-bold text-[11px] text-slate-800 dark:text-slate-200">{{ getHeroName(hId) }}</span>
                  <span v-if="getHeroStar('enemyAttack', hId)" class="text-[9px] font-bold text-red-600 dark:text-red-400">
                    <UnitStars :count="getHeroStar('enemyAttack', hId)" compact="prefix" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- User Team Display (5 Slots) -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>{{ draftViewMode === 'attack' ? '⚔️' : '🛡️' }}</span>
                <span>{{ draftViewMode === 'attack' ? 'Your Attack Team' : 'Your Defense Team' }}</span>
              </h3>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                {{ currentLineupHeroes.length === 5 ? '✓ 5/5 Heroes Locked' : (currentLineupHeroes.length > 0 ? `${currentLineupHeroes.length}/5 Heroes Selected` : 'No heroes recorded yet') }}
              </span>
            </div>

            <div v-if="stageId === 0" class="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
              No active draft match. Click Register above or enter Legend Draft in game to start drafting.
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div
                v-for="i in 5"
                :key="'slot-' + i"
                class="flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all text-center min-h-[120px]"
                :class="
                  (currentLineupHeroes[i - 1] ?? 0)
                    ? 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/80 shadow-2xs'
                    : 'border-dashed border-slate-200 bg-slate-50/30 text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/20'
                "
              >
                <div class="w-full flex items-center justify-between">
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Hero {{ i }}
                  </span>
                  <span v-if="(currentLineupHeroes[i - 1] ?? 0)" class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Locked
                  </span>
                </div>

                <template v-if="(currentLineupHeroes[i - 1] ?? 0)">
                  <div
                    class="relative size-12 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 my-1 shrink-0"
                    :class="getStarGlow(getHeroStar(draftViewMode === 'attack' ? 'attack' : 'defense', (currentLineupHeroes[i - 1] ?? 0)))"
                  >
                    <img
                      v-if="getHeroAvatar((currentLineupHeroes[i - 1] ?? 0))"
                      :src="getHeroAvatar((currentLineupHeroes[i - 1] ?? 0))!"
                      :alt="getHeroName((currentLineupHeroes[i - 1] ?? 0))"
                      class="size-full object-cover"
                      @error="handleImgError"
                    />
                    <div v-else class="size-full flex items-center justify-center text-xs font-bold text-slate-500">
                      {{ getHeroName((currentLineupHeroes[i - 1] ?? 0)).charAt(0) }}
                    </div>
                  </div>

                  <div class="space-y-0.5">
                    <div class="font-bold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[100px]">
                      {{ getHeroName((currentLineupHeroes[i - 1] ?? 0)) }}
                    </div>
                    <div
                      v-if="getHeroStar(draftViewMode === 'attack' ? 'attack' : 'defense', (currentLineupHeroes[i - 1] ?? 0))"
                      class="text-[10px] font-bold text-amber-600 dark:text-amber-400"
                    >
                      <UnitStars :count="getHeroStar(draftViewMode === 'attack' ? 'attack' : 'defense', (currentLineupHeroes[i - 1] ?? 0))" compact="prefix" />
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="flex flex-col items-center justify-center my-auto text-slate-400 dark:text-slate-500">
                    <span class="text-xl font-bold leading-none">+</span>
                    <span class="text-[10px] mt-1">Empty Slot</span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Candidate Hero Pool -->
          <div
            v-if="poolCandidates.length > 0"
            id="draft-candidate-pool"
            class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🏊</span> Candidate Hero Pool
              </h3>
              <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {{ poolCandidates.length }} heroes
              </span>
            </div>

            <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              <div
                v-for="cId in poolCandidates"
                :key="'candidate-' + cId"
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800 text-xs shadow-2xs"
              >
                <div class="size-6 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0">
                  <img
                    v-if="getHeroAvatar(cId)"
                    :src="getHeroAvatar(cId)!"
                    :alt="getHeroName(cId)"
                    class="size-full object-cover"
                    @error="handleImgError"
                  />
                  <div v-else class="size-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                    {{ getHeroName(cId).charAt(0) }}
                  </div>
                </div>
                <span class="font-medium text-slate-800 dark:text-slate-200">{{ getHeroName(cId) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
