<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache } = useRpcCache();

const vsStatus = computed(() => cache.value.clanVersusStatus?.data || {});
const battle = computed(() => vsStatus.value.battle || {});
const info = computed(() => vsStatus.value.info || {});
const rewards = computed(() => vsStatus.value.rewards || {});

const clan = computed(() => battle.value.clan || { name: '4-LEAF CLOVER', server: '—' });
const enemyClan = computed(() => battle.value.enemyClan || { name: 'Opponent', server: '—' });

const league = computed(() => {
  const l = battle.value.league || (info.value.league ? `League #${info.value.league}` : 'Bronze');
  return l.charAt(0).toUpperCase() + l.slice(1);
});

const battleNumber = computed(() => info.value.battleNumber ?? 4);
const roundNumber = computed(() => info.value.roundNumber ?? 1);

const clanRoundPoints = computed(() => battle.value.clanRoundPoints ?? 0);
const enemyRoundPoints = computed(() => battle.value.enemyClanRoundPoints ?? 0);
const totalPoints = computed(() => clanRoundPoints.value + enemyRoundPoints.value || 1);
const clanPct = computed(() => Math.round((clanRoundPoints.value / totalPoints.value) * 100));
const enemyPct = computed(() => 100 - clanPct.value);

const isStaleVersusDay = computed(() => {
  return (
    Boolean(cache.value?.clanVersusStatus?.updatedAt) &&
    new Date(cache.value.clanVersusStatus.updatedAt).toDateString() !== new Date().toDateString()
  );
});

const personalRoundPoints = computed(() => (isStaleVersusDay.value ? 0 : (vsStatus.value.score ?? rewards.value.userRoundPoints ?? 0)));
const personalBattlePoints = computed(() => (isStaleVersusDay.value ? 0 : (rewards.value.userBattlePoints ?? personalRoundPoints.value)));
const personalSeasonPoints = computed(() => rewards.value.userSeasonPoints ?? 0);
const clanRank = computed(() => (rewards.value.userClanRank ? `#${rewards.value.userClanRank}` : '—'));
const seasonRank = computed(() => (rewards.value.seasonClanRank ? `#${rewards.value.seasonClanRank}` : '—'));

const thresholds: Record<number, number> = {
  1: 25000,
  2: 100000,
  3: 400000,
  4: 600000,
  5: 1000000,
  6: 1500000,
  7: 2000000,
  8: 3000000,
  9: 4500000,
};

const defaultChestRewards: Record<number, Record<string, number>> = {
  1: { energy: 50, gold: 30000, 'consumable:20': 250, 'consumable:40228': 1, 'consumable:40230': 1 },
  2: { energy: 100, gold: 60000, 'consumable:20': 500, 'consumable:40228': 2, 'consumable:40230': 2 },
  3: { 'patron:1': 1, energy: 200, 'consumable:20': 1250, 'consumable:40228': 3, 'consumable:40230': 3, 'material:12': 50 },
  4: { energy: 200, 'coin:40077': 250, 'consumable:40228': 3, 'consumable:40230': 3, 'speedUpResearch:2': 3 },
  5: { energy: 300, 'coin:40077': 350, 'consumable:40228': 4, 'consumable:40230': 4, 'speedUpResearch:2': 6 },
  6: { 'patron:1': 1, energy: 400, 'consumable:40232': 2, 'consumable:40228': 5, 'consumable:40230': 5, 'material:12': 100, 'speedUpResearch:2': 15 },
  7: { energy: 400, 'coin:40077': 550, 'consumable:40228': 5, 'consumable:40230': 5, 'material:12': 50, 'speedUpResearch:2': 8 },
  8: { energy: 600, 'coin:40077': 750, 'consumable:40228': 7, 'consumable:40230': 7, 'material:12': 100, 'speedUpResearch:2': 15 },
  9: { 'patron:1': 2, energy: 1000, 'consumable:40232': 5, 'consumable:40228': 5, 'consumable:40230': 5, 'material:12': 200, 'speedUpResearch:2': 25 },
};

const chestRewardsMap = computed(() => {
  return (globalThis as any).hwaHelperClanVersusRewards || defaultChestRewards;
});

function formatRewardItem(key: string, amount: number) {
  if (key === 'energy') return `+${amount.toLocaleString()} Energy`;
  if (key === 'gold') return `+${amount.toLocaleString()} Gold`;
  if (key === 'patron:1') return `+${amount} Relic Shard${amount > 1 ? 's' : ''}`;
  if (key === 'consumable:20') return `+${amount.toLocaleString()} Titan Potion`;
  if (key === 'consumable:40228') return `+${amount} Heroes Trove${amount > 1 ? 's' : ''}`;
  if (key === 'consumable:40230') return `+${amount} Titans Trove${amount > 1 ? 's' : ''}`;
  if (key === 'consumable:40232') return `+${amount} Relic Casket${amount > 1 ? 's' : ''}`;
  if (key === 'consumable:40229') return `+${amount} Large Heroes Trove${amount > 1 ? 's' : ''}`;
  if (key === 'consumable:40231') return `+${amount} Large Titans Trove${amount > 1 ? 's' : ''}`;
  if (key === 'material:12') return `+${amount} Honor Marks`;
  if (key === 'coin:40077') return `+${amount.toLocaleString()} Rune Stone`;
  if (key === 'speedUpResearch:2') return `+${amount}x 5m Research Speedup`;
  return `+${amount} ${key}`;
}

const claimedChests = computed<number[]>(() => {
  if (isStaleVersusDay.value) return [];
  const raw = vsStatus.value.chestNumbers;
  if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);
  if (raw && typeof raw === 'object') {
    return Object.keys(raw).map(Number).filter(Number.isFinite);
  }
  return [];
});
const claimedCount = computed(() => claimedChests.value.length);

const targetChestNum = computed(() => {
  const set = new Set(claimedChests.value);
  for (let c = 1; c <= 9; c++) {
    if (!set.has(c)) return c;
  }
  return 9;
});

const isStackMode = ref(true);
const activeChestNum = ref(1);

watch(
  () => targetChestNum.value,
  (tgt) => {
    activeChestNum.value = tgt;
  },
  { immediate: true }
);

// --- Sections 4, 5, 6 Data ---
const roundQuestsMap = computed(() => {
  return (globalThis as any).hwaHelperClanVersusRoundQuests || {};
});

const currentRound = computed(() => {
  const rounds = normalizeArray(battle.value.rounds);
  return rounds.find((r: any) => r.status === 'inProgress') || rounds[0] || {};
});

const currentTheme = computed(() => {
  return currentRound.value?.theme || roundQuestsMap.value[roundNumber.value]?.theme || 'Radar Training';
});

const roundsList = computed(() => {
  const raw = normalizeArray(battle.value?.rounds);
  if (raw.length > 0) return raw;
  return [
    { index: 1, theme: 'Radar Training & Titan Power', score: 1, points: clanRoundPoints.value, enemyPoints: enemyRoundPoints.value, status: 'inProgress' },
    { index: 2, theme: 'City Development & Gathering', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 3, theme: 'Research & Wilderness', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 4, theme: 'Hero Advancement & Equipment', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 5, theme: 'Military Training & Outland', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 6, theme: 'Grand Finale & PvP Clash', score: 4, points: 0, enemyPoints: 0, status: 'soon' },
  ];
});

function getResourceStock(target: string | number): number | null {
  const pData = (globalThis as any).hwaHelperPopupData;
  return pData?.getChallengeResourceStock?.(cache.value, target) ?? null;
}

function getQuestDisplayName(q: { label: string }): string {
  const stock = getResourceStock(q.label);
  const cleanLabel = q.label.replace(/\s*\(\d+[\d,]*\)$/, '');
  return stock != null ? `${cleanLabel} (${stock.toLocaleString()})` : cleanLabel;
}

// Section 5: Guild Requirements
const curUsers = computed(() => info.value?.currentNumActiveUsers ?? 28);
const minUsers = computed(() => info.value?.numActiveUsers ?? 5);
const weeklyAct = computed(() => info.value?.weeklyUserActivity ?? 2450);
const personalSat = computed(() => info.value?.personalRequirementsIsSatisfied ?? true);
const guildSat = computed(() => info.value?.guildRequirementsIsSatisfied ?? true);

// Section 6: Daily Challenges
const challengeNames = computed(() => (globalThis as any).hwaHelperClanVersusChallengeNames || {});
const challengePoints = computed(() => (globalThis as any).hwaHelperClanVersusChallengePoints || {});
const challengeSteps = computed(() => (globalThis as any).hwaHelperClanVersusChallengeSteps || {});

const challenges = computed(() => normalizeArray(info.value?.challenges));

const totalChallengePts = computed(() => {
  let total = 0;
  for (const ch of challenges.value) {
    const progress = Number(ch.progress || 0);
    const step = Number(challengeSteps.value[ch.id] || 1);
    const ptsPerStep = Number(challengePoints.value[ch.id] || 0);
    total += Math.floor(progress / step) * ptsPerStep;
  }
  return total;
});

function getChallengeDisplayName(ch: any): string {
  const name = challengeNames.value[ch.id] || `Daily Challenge #${ch.id}`;
  const stock = getResourceStock(ch.id);
  const cleanName = name.replace(/\s*\(\d+[\d,]*\)$/, '');
  return stock != null ? `${cleanName} (${stock.toLocaleString()})` : cleanName;
}

function getChallengeConvertedPts(ch: any): number {
  const progress = Number(ch.progress || 0);
  const step = Number(challengeSteps.value[ch.id] || 1);
  const ptsPerStep = Number(challengePoints.value[ch.id] || 0);
  return Math.floor(progress / step) * ptsPerStep;
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
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="guild-versus-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gvs-modal-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="close"
    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 id="gvs-modal-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
              Guild Versus
            </h2>
            <span
              id="gvs-league-badge"
              class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border dark:border-amber-700/50"
            >
              {{ league }} League
            </span>
          </div>

          <button
            id="gvs-modal-close"
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

        <!-- Body -->
        <div id="gvs-modal-body" class="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          <!-- Section 1: Matchup Banner -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
              <span>Battle #{{ battleNumber }} • Round {{ roundNumber }} of 6</span>
              <span class="font-semibold text-emerald-700 dark:text-emerald-400">Theme: {{ currentTheme }}</span>
            </div>

            <div class="grid grid-cols-5 items-center gap-2 mb-3">
              <div class="col-span-2 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{{ clan.name }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Server {{ clan.server || '—' }}</div>
                <div class="text-emerald-700 dark:text-emerald-400 font-black text-base sm:text-lg tabular-nums mt-0.5">{{ clanRoundPoints.toLocaleString() }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">Score: <strong class="text-slate-800 dark:text-slate-200">{{ battle.clanBattleScore ?? 0 }}</strong></div>
              </div>

              <div class="col-span-1 text-center">
                <span class="inline-flex rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-black text-slate-700 dark:text-slate-300">VS</span>
              </div>

              <div class="col-span-2 min-w-0 text-right">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{{ enemyClan.name }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Server {{ enemyClan.server || '—' }}</div>
                <div class="text-rose-700 dark:text-rose-400 font-black text-base sm:text-lg tabular-nums mt-0.5">{{ enemyRoundPoints.toLocaleString() }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">Score: <strong class="text-slate-800 dark:text-slate-200">{{ battle.enemyClanBattleScore ?? 0 }}</strong></div>
              </div>
            </div>

            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden flex">
              <div class="bg-emerald-500 h-2.5" :style="{ width: `${clanPct}%` }"></div>
              <div class="bg-rose-500 h-2.5" :style="{ width: `${enemyPct}%` }"></div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              <span>{{ clanPct }}%</span>
              <span>{{ enemyPct }}%</span>
            </div>
          </div>

          <!-- Section 2: Personal Points & Standings -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Round Points</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ personalRoundPoints.toLocaleString() }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">{{ isStaleVersusDay ? 'New round starting' : 'Current round' }}</div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Battle Points</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ personalBattlePoints.toLocaleString() }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">This battle</div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Season Points</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(personalSeasonPoints) }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Season Rank {{ seasonRank }}</div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Clan Rank</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ clanRank }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Among guild members</div>
            </div>
          </div>

          <!-- Section 3: Milestone Chests -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🎁 Milestone Chests</h3>
                <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50">
                  {{ claimedCount }} / 9 Claimed
                </span>
              </div>

              <!-- View Switcher -->
              <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-medium select-none dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
                  :class="isStackMode ? 'bg-white text-slate-900 font-bold shadow-2xs dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'"
                  @click="isStackMode = true"
                >
                  🎴 Stacked Deck
                </button>
                <button
                  type="button"
                  class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
                  :class="!isStackMode ? 'bg-white text-slate-900 font-bold shadow-2xs dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'"
                  @click="isStackMode = false"
                >
                  🃏 Grid View
                </button>
              </div>
            </div>

            <!-- Target progress banner -->
            <div class="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
              <div class="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                <span>Target: <strong class="text-amber-800 dark:text-amber-300">Chest {{ targetChestNum }}</strong> ({{ (thresholds[targetChestNum] || 0).toLocaleString() }} pts)</span>
                <span class="font-bold text-slate-900 dark:text-slate-100">
                  {{ Math.min(100, Math.round((personalRoundPoints / (thresholds[targetChestNum] || 1)) * 100)) }}%
                  ({{ personalRoundPoints.toLocaleString() }} / {{ (thresholds[targetChestNum] || 0).toLocaleString() }})
                </span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  class="bg-amber-500 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, Math.round((personalRoundPoints / (thresholds[targetChestNum] || 1)) * 100))}%` }"
                ></div>
              </div>
            </div>

            <!-- Quick Jump Ribbon -->
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                v-for="c in 9"
                :key="`ribbon-${c}`"
                type="button"
                class="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                :class="
                  activeChestNum === c && isStackMode
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100' + (c === targetChestNum ? ' ring-2 ring-amber-400' : '')
                    : claimedChests.includes(c)
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
                    : personalRoundPoints >= thresholds[c]
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
                    : c === targetChestNum
                    ? 'bg-indigo-50 text-indigo-900 border-indigo-300 ring-2 ring-amber-400 font-bold hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700'
                "
                :title="`Chest ${c} (${(thresholds[c] || 0).toLocaleString()} pts)${c === targetChestNum ? ' - Target' : ''}`"
                @click="activeChestNum = c"
              >
                <span class="font-mono">№ {{ c }}</span>
                <span class="text-[10px]">
                  {{ claimedChests.includes(c) ? '✓' : personalRoundPoints >= thresholds[c] ? '★' : c === targetChestNum ? '🎯' : '🔒' }}
                </span>
              </button>
            </div>

            <!-- Stacked Deck View -->
            <div v-if="isStackMode" class="relative pt-1 pb-3 flex flex-col justify-center">
              <!-- 3D Underlay Layers -->
              <div class="absolute inset-x-4 top-3 bottom-1 rounded-2xl bg-slate-200/70 border border-slate-300 shadow-2xs -z-20 pointer-events-none dark:bg-slate-800/50 dark:border-slate-700/60"></div>
              <div class="absolute inset-x-2 top-2 bottom-2 rounded-2xl bg-slate-100/80 border border-slate-300 shadow-xs -z-10 pointer-events-none dark:bg-slate-800/80 dark:border-slate-700/80"></div>

              <div
                class="rounded-2xl border-2 p-3.5 sm:p-4 flex flex-col justify-between text-xs transition-all relative z-10 shadow-xl"
                :class="
                  claimedChests.includes(activeChestNum)
                    ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-100/50 shadow-sm dark:border-emerald-600/60 dark:from-emerald-950/40 dark:via-slate-800/90 dark:to-emerald-950/30'
                    : personalRoundPoints >= thresholds[activeChestNum]
                    ? 'border-amber-400 bg-gradient-to-br from-amber-50/80 via-white to-amber-100/60 shadow-md dark:border-amber-500/70 dark:from-amber-950/40 dark:via-slate-800/90 dark:to-amber-950/30'
                    : activeChestNum === targetChestNum
                    ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/60 via-white to-amber-50/40 shadow-md ring-2 ring-indigo-200 dark:border-indigo-500/70 dark:ring-indigo-900/50 dark:from-indigo-950/40 dark:via-slate-800/90 dark:to-slate-800'
                    : 'border-slate-200 bg-gradient-to-br from-slate-50/70 via-white to-slate-100/60 text-slate-700 shadow-2xs dark:border-slate-700/80 dark:from-slate-800/80 dark:via-slate-800/95 dark:to-slate-900 dark:text-slate-300'
                "
              >
                <!-- Card Header -->
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-black text-xs px-2 py-0.5 rounded bg-black/5 border border-black/10 dark:bg-white/10 dark:border-white/10 dark:text-slate-200">
                      № {{ activeChestNum }}
                    </span>
                    <span class="text-sm">🎁</span>
                    <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      Chest {{ activeChestNum }}
                    </span>
                  </div>
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="
                      claimedChests.includes(activeChestNum)
                        ? 'bg-emerald-600 text-white'
                        : personalRoundPoints >= thresholds[activeChestNum]
                        ? 'bg-amber-500 text-white animate-pulse'
                        : activeChestNum === targetChestNum
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    "
                  >
                    {{ claimedChests.includes(activeChestNum) ? '✓ Claimed' : personalRoundPoints >= thresholds[activeChestNum] ? '★ Ready to Claim' : activeChestNum === targetChestNum ? '🎯 Target Chest' : '🔒 Locked' }}
                  </span>
                </div>

                <!-- Milestone Requirement -->
                <div class="flex items-baseline justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Milestone Requirement</span>
                  <span
                    class="tabular-nums font-extrabold text-sm"
                    :class="
                      claimedChests.includes(activeChestNum)
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : personalRoundPoints >= thresholds[activeChestNum]
                        ? 'text-amber-800 dark:text-amber-400'
                        : activeChestNum === targetChestNum
                        ? 'text-indigo-900 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300'
                    "
                  >
                    {{ (thresholds[activeChestNum] || 0).toLocaleString() }} pts
                  </span>
                </div>

                <!-- Progress Bar -->
                <div class="mt-2 space-y-1">
                  <div class="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                    <span>Progress</span>
                    <span
                      class="tabular-nums font-bold"
                      :class="claimedChests.includes(activeChestNum) || personalRoundPoints >= thresholds[activeChestNum] ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'"
                    >
                      {{ Math.min(100, Math.round((personalRoundPoints / (thresholds[activeChestNum] || 1)) * 100)) }}%
                      ({{ personalRoundPoints.toLocaleString() }} / {{ (thresholds[activeChestNum] || 0).toLocaleString() }})
                    </span>
                  </div>
                  <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      class="h-1.5 rounded-full transition-all duration-300"
                      :class="claimedChests.includes(activeChestNum) ? 'bg-emerald-500' : personalRoundPoints >= thresholds[activeChestNum] ? 'bg-amber-500' : 'bg-indigo-500'"
                      :style="{ width: `${Math.min(100, Math.round((personalRoundPoints / (thresholds[activeChestNum] || 1)) * 100))}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Rewards List Itemized -->
                <div class="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div class="font-semibold text-slate-600 dark:text-slate-400 mb-1">Guaranteed Rewards:</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div
                      v-for="(amt, rKey) in chestRewardsMap[activeChestNum] || {}"
                      :key="String(rKey)"
                      class="flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 border border-slate-200/70 shadow-2xs font-medium truncate dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-200"
                    >
                      {{ formatRewardItem(String(rKey), Number(amt)) }}
                    </div>
                  </div>
                </div>

                <!-- Prev / Next Navigation -->
                <div class="flex items-center justify-between pt-2.5 mt-3 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <button
                    type="button"
                    :disabled="activeChestNum <= 1"
                    class="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200"
                    @click="activeChestNum--"
                  >
                    ‹ Prev
                  </button>

                  <span class="text-slate-500 dark:text-slate-400 font-medium">
                    Chest {{ activeChestNum }} of 9
                    <strong v-if="activeChestNum === targetChestNum" class="text-amber-600 dark:text-amber-400 ml-1">(Target)</strong>
                  </span>

                  <button
                    type="button"
                    :disabled="activeChestNum >= 9"
                    class="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200"
                    @click="activeChestNum++"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </div>

            <!-- Grid View -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                v-for="c in 9"
                :key="`grid-chest-${c}`"
                class="rounded-xl border p-3 flex flex-col justify-between text-xs transition-colors"
                :class="
                  claimedChests.includes(c)
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : personalRoundPoints >= thresholds[c]
                    ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/30'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60'
                "
              >
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="font-bold text-slate-800 dark:text-slate-200">Chest #{{ c }}</span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[9px] font-bold"
                      :class="
                        claimedChests.includes(c)
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                          : personalRoundPoints >= thresholds[c]
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      "
                    >
                      {{ claimedChests.includes(c) ? 'Claimed' : personalRoundPoints >= thresholds[c] ? 'Ready' : 'Locked' }}
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mb-2">
                    {{ (thresholds[c] || 0).toLocaleString() }} pts
                  </div>

                  <!-- Reward snippet -->
                  <div class="space-y-1 text-[10px] text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60 pt-1.5">
                    <div
                      v-for="(amt, rKey) in chestRewardsMap[c] || {}"
                      :key="String(rKey)"
                      class="truncate"
                    >
                      {{ formatRewardItem(String(rKey), Number(amt)) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: 6-Round Battle Schedule & Quests -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🗓️ 6-Round Battle Schedule & Quests</h3>
              <span class="text-xs text-slate-500 dark:text-slate-400">Click round to view point-earning quests</span>
            </div>

            <div class="space-y-2">
              <details
                v-for="r in roundsList"
                :key="`round-${r.index}`"
                :open="r.status === 'inProgress'"
                class="group rounded-lg border text-xs overflow-hidden transition-colors"
                :class="
                  r.status === 'inProgress'
                    ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/60 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50'
                "
              >
                <summary class="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-100/60 dark:hover:bg-slate-700/40 list-none">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="size-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                      :class="r.status === 'inProgress' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'"
                    >
                      {{ r.index }}
                    </span>
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {{ roundQuestsMap[r.index]?.theme || r.theme || `Round ${r.index}` }}
                      </div>
                      <div class="text-[10px] text-slate-500 dark:text-slate-400">
                        Reward: {{ r.score || roundQuestsMap[r.index]?.battlePoints || 1 }} Battle Point{{ (r.score || roundQuestsMap[r.index]?.battlePoints || 1) > 1 ? 's' : '' }} • {{ (roundQuestsMap[r.index]?.quests || []).length }} Quests
                      </div>
                    </div>
                  </div>

                  <div class="text-right shrink-0 ml-2">
                    <div v-if="r.status === 'inProgress'">
                      <div class="font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
                        {{ formatNumber(r.points || 0) }} vs {{ formatNumber(r.enemyPoints || 0) }}
                      </div>
                      <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        <span class="size-1.5 rounded-full bg-emerald-500 animate-ping"></span>In Progress
                      </span>
                    </div>
                    <div v-else-if="r.status === 'finished'">
                      <div class="font-bold text-slate-700 dark:text-slate-300">
                        {{ formatNumber(r.points || 0) }} vs {{ formatNumber(r.enemyPoints || 0) }}
                      </div>
                      <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Finished</span>
                    </div>
                    <span v-else class="rounded bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                      Upcoming
                    </span>
                  </div>
                </summary>

                <!-- Quests List inside round -->
                <div class="p-3 border-t border-slate-200/80 bg-white/70 space-y-2 dark:border-slate-700/80 dark:bg-slate-800/70">
                  <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <span>🎯 Quests to Earn Points:</span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Day {{ r.index }}</span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div
                      v-for="q in roundQuestsMap[r.index]?.quests || []"
                      :key="q.label"
                      class="flex items-center justify-between rounded bg-white border border-slate-200/80 px-2 py-1 text-[11px] dark:bg-slate-800/90 dark:border-slate-700"
                    >
                      <span
                        class="text-slate-800 dark:text-slate-200 font-medium truncate mr-1.5"
                        :title="getQuestDisplayName(q)"
                      >
                        {{ getQuestDisplayName(q) }}
                      </span>
                      <span class="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.2 font-bold tabular-nums shrink-0 border border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60">
                        +{{ q.points.toLocaleString() }} pts
                      </span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>

          <!-- Section 5: Guild Participation & Requirements -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">👥 Guild Participation & Requirements</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
                <div class="text-slate-500 dark:text-slate-400 text-[11px]">Active Members</div>
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{{ curUsers }} / {{ minUsers }} req</div>
                <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Satisfied</span>
              </div>

              <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
                <div class="text-slate-500 dark:text-slate-400 text-[11px]">Weekly Activity</div>
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{{ weeklyAct.toLocaleString() }}</div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500">Total guild score</span>
              </div>

              <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
                <div class="text-slate-500 dark:text-slate-400 text-[11px]">Personal Status</div>
                <div
                  class="font-bold text-sm mt-0.5"
                  :class="personalSat ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'"
                >
                  {{ personalSat ? 'Eligible' : 'Pending' }}
                </div>
                <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {{ personalSat ? '✓ Qualified' : 'Action needed' }}
                </span>
              </div>

              <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
                <div class="text-slate-500 dark:text-slate-400 text-[11px]">Guild Status</div>
                <div
                  class="font-bold text-sm mt-0.5"
                  :class="guildSat ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'"
                >
                  {{ guildSat ? 'Eligible' : 'Pending' }}
                </div>
                <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {{ guildSat ? '✓ Qualified' : 'Action needed' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Section 6: Daily Challenges -->
          <div
            v-if="challenges.length > 0"
            class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div class="flex items-center justify-between flex-wrap gap-1">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                🎯 Daily Challenges ({{ challenges.length }})
              </h3>
              <span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60">
                Total: {{ totalChallengePts.toLocaleString() }} pts
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                v-for="ch in challenges"
                :key="ch.id"
                class="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs dark:border-slate-700/60 dark:bg-slate-800/70"
              >
                <div class="flex flex-col min-w-0 mr-2">
                  <span
                    class="font-medium text-slate-800 dark:text-slate-200 truncate"
                    :title="getChallengeDisplayName(ch)"
                  >
                    {{ getChallengeDisplayName(ch) }}
                  </span>
                  <span
                    v-if="challengePoints[ch.id] > 0"
                    class="text-[10px] text-slate-500 dark:text-slate-400 font-mono"
                  >
                    +{{ Number(challengePoints[ch.id] || 0).toLocaleString() }} pts / {{ Number(challengeSteps[ch.id] || 1).toLocaleString() }} {{ (challengeSteps[ch.id] || 1) > 1 ? 'units' : 'action' }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    class="rounded bg-white px-2 py-0.5 font-bold text-slate-900 border border-slate-200 tabular-nums dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                    :title="`Progress: ${Number(ch.progress || 0).toLocaleString()}`"
                  >
                    {{ Number(ch.progress || 0).toLocaleString() }}
                  </span>
                  <span
                    class="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                    :class="
                      getChallengeConvertedPts(ch) > 0
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700'
                    "
                    :title="challengePoints[ch.id] > 0 ? `${Number(challengePoints[ch.id]).toLocaleString()} pts per ${Number(challengeSteps[ch.id]) === 1 ? 'completion' : `${Number(challengeSteps[ch.id]).toLocaleString()} units`}` : ''"
                  >
                    {{ getChallengeConvertedPts(ch).toLocaleString() }} pts
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
