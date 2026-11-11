<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue';
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

const claimedChests = computed<number[]>(() => vsStatus.value.chestNumbers || []);
const claimedCount = computed(() => claimedChests.value.length);

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
            </div>

            <!-- Chests list (1 to 9) -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div
                v-for="c in 9"
                :key="c"
                class="p-2.5 rounded-lg border flex items-center justify-between"
                :class="
                  claimedChests.includes(c)
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : personalRoundPoints >= thresholds[c]
                    ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/30'
                    : 'border-slate-200 bg-slate-50/40 dark:border-slate-700/50 dark:bg-slate-800/40'
                "
              >
                <div>
                  <div class="font-bold text-slate-800 dark:text-slate-200">Chest #{{ c }}</div>
                  <div class="text-[10px] text-slate-400 font-mono">{{ formatNumber(thresholds[c]) }} pts</div>
                </div>

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
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
