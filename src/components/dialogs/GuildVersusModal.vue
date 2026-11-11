<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';

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

const clan = computed(() => battle.value.clan || { name: 'Guild', server: '—' });
const enemyClan = computed(() => battle.value.enemyClan || { name: 'Opponent', server: '—' });

const league = computed(() => {
  const l = battle.value.league || (info.value.league ? `League #${info.value.league}` : 'Bronze');
  return l.charAt(0).toUpperCase() + l.slice(1);
});

const battleNumber = computed(() => info.value.battleNumber ?? 1);
const roundNumber = computed(() => info.value.roundNumber ?? 1);

const clanRoundPoints = computed(() => battle.value.clanRoundPoints ?? 0);
const enemyRoundPoints = computed(() => battle.value.enemyClanRoundPoints ?? 0);
const totalPoints = computed(() => clanRoundPoints.value + enemyRoundPoints.value || 1);
const clanPct = computed(() => Math.round((clanRoundPoints.value / totalPoints.value) * 100));
const enemyPct = computed(() => 100 - clanPct.value);

const personalRoundPoints = computed(() => vsStatus.value.score ?? rewards.value.userRoundPoints ?? 0);
const personalBattlePoints = computed(() => rewards.value.userBattlePoints ?? personalRoundPoints.value);
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
  8: { energy: 600, 'coin:40077': 750, 'consumable:40229': 1, 'consumable:40231': 1, 'material:12': 100, 'speedUpResearch:2': 10 },
  9: { 'patron:1': 2, energy: 800, 'consumable:40232': 5, 'consumable:40229': 2, 'consumable:40231': 2, 'material:12': 200, 'speedUpResearch:2': 25 },
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

const claimedChests = computed<number[]>(() => vsStatus.value.chestNumbers || []);
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
              <span class="font-semibold text-emerald-700 dark:text-emerald-400">Theme: Guild Contest</span>
            </div>

            <div class="grid grid-cols-5 items-center gap-2 mb-3">
              <div class="col-span-2 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{{ clan.name }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Server {{ clan.server || '—' }}</div>
                <div class="text-emerald-700 dark:text-emerald-400 font-black text-base sm:text-lg tabular-nums mt-0.5">{{ formatNumber(clanRoundPoints) }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">Score: <strong class="text-slate-800 dark:text-slate-200">{{ battle.clanBattleScore ?? 0 }}</strong></div>
              </div>

              <div class="col-span-1 text-center">
                <span class="inline-flex rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-black text-slate-700 dark:text-slate-300">VS</span>
              </div>

              <div class="col-span-2 min-w-0 text-right">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">{{ enemyClan.name }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Server {{ enemyClan.server || '—' }}</div>
                <div class="text-rose-700 dark:text-rose-400 font-black text-base sm:text-lg tabular-nums mt-0.5">{{ formatNumber(enemyRoundPoints) }}</div>
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
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(personalRoundPoints) }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">Current round</div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Battle Points</div>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">{{ formatNumber(personalBattlePoints) }}</div>
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
                <span>Target: <strong class="text-amber-800 dark:text-amber-300">Chest {{ targetChestNum }}</strong> ({{ formatNumber(thresholds[targetChestNum] || 0) }} pts)</span>
                <span class="font-bold text-slate-900 dark:text-slate-100">
                  {{ Math.min(100, Math.round((personalRoundPoints / (thresholds[targetChestNum] || 1)) * 100)) }}%
                  ({{ formatNumber(personalRoundPoints) }} / {{ formatNumber(thresholds[targetChestNum] || 0) }})
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
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                v-for="c in 9"
                :key="`ribbon-${c}`"
                type="button"
                class="px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                :class="
                  activeChestNum === c
                    ? 'ring-2 ring-amber-400 font-bold bg-amber-50/70 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700'
                    : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                "
                @click="activeChestNum = c"
              >
                <span class="font-mono">№ {{ c }}</span>
                <span class="text-[10px]">
                  {{ claimedChests.includes(c) ? '✓' : personalRoundPoints >= thresholds[c] ? '★' : c === targetChestNum ? '🎯' : '🔒' }}
                </span>
              </button>
            </div>

            <!-- Stacked Deck View -->
            <div v-if="isStackMode" class="relative pt-1 pb-2">
              <div
                class="rounded-2xl border-2 p-4 flex flex-col justify-between text-xs transition-all relative"
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
                  <span class="tabular-nums font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    {{ formatNumber(thresholds[activeChestNum] || 0) }} pts
                  </span>
                </div>

                <!-- Progress Bar -->
                <div class="mt-2 space-y-1">
                  <div class="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                    <span>Progress</span>
                    <span class="tabular-nums font-bold">
                      {{ Math.min(100, Math.round((personalRoundPoints / (thresholds[activeChestNum] || 1)) * 100)) }}%
                      ({{ formatNumber(personalRoundPoints) }} / {{ formatNumber(thresholds[activeChestNum] || 0) }})
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
                    {{ formatNumber(thresholds[c]) }} pts
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
        </div>
      </div>
    </div>
  </Teleport>
</template>
