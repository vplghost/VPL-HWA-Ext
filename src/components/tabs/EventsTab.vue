<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();
const { openModal } = useModals();

const search = ref('');
const isRefreshing = ref(false);

interface EventCard {
  id: string;
  type: string;
  title: string;
  searchStr: string;
  featured?: boolean;
  data: any;
  action?: () => void;
}

const eventCards = computed<EventCard[]>(() => {
  const cards: EventCard[] = [];

  // 1. Guild Versus (clanVersusStatus)
  const vsStatus = cache.value?.clanVersusStatus?.data;
  if (vsStatus && (vsStatus.battle || vsStatus.info || vsStatus.rewards || vsStatus.chestNumbers || vsStatus.score)) {
    const battle = vsStatus.battle || {};
    const info = vsStatus.info || {};
    const rewards = vsStatus.rewards || {};
    const clanName = battle.clan?.name || 'Our Guild';
    const enemyClanName = battle.enemyClan?.name || 'Opponent Guild';
    const clanServer = battle.clan?.server ? `S${battle.clan.server}` : '';
    const enemyServer = battle.enemyClan?.server ? `S${battle.enemyClan.server}` : '';
    const league = battle.league || (info.league ? `League #${info.league}` : 'Bronze');
    const leagueLabel = league.charAt(0).toUpperCase() + league.slice(1);
    const roundNumber = info.roundNumber || 1;
    const currentRound = (battle.rounds || []).find((r: any) => r.status === 'inProgress') || battle.rounds?.[0] || {};
    const theme = currentRound.theme || 'Radar Training';
    const roundPoints = formatNumber(battle.clanRoundPoints ?? currentRound.points ?? 0);
    const enemyRoundPoints = formatNumber(battle.enemyClanRoundPoints ?? currentRound.enemyPoints ?? 0);
    const isStaleVersusDay =
      cache.value?.clanVersusStatus?.updatedAt &&
      new Date(cache.value.clanVersusStatus.updatedAt).toDateString() !== new Date().toDateString();
    const personalScore = isStaleVersusDay ? 0 : (vsStatus.score ?? rewards.userRoundPoints ?? 0);
    const claimedCount = isStaleVersusDay ? 0 : (vsStatus.chestNumbers || []).length;

    cards.push({
      id: 'clanVersus',
      type: 'guild_versus',
      title: '⚔️ Guild Versus',
      searchStr: `guild versus gvs ${clanName} ${enemyClanName} ${theme} ${league}`.toLowerCase(),
      featured: true,
      data: {
        clanName,
        enemyClanName,
        clanServer,
        enemyServer,
        leagueLabel,
        roundNumber,
        theme,
        roundPoints,
        enemyRoundPoints,
        personalScore,
        claimedCount,
        battleScore: `${battle.clanBattleScore ?? 0} : ${battle.enemyClanBattleScore ?? 0}`,
      },
      action: () => openModal('guildVersus'),
    });
  }

  // 2. Titan Dungeon (dungeonStatus)
  const dungeonStatus = cache.value?.dungeonStatus?.data;
  if (dungeonStatus && (dungeonStatus.floorNumber || dungeonStatus.maxFloorPassed)) {
    const floor = dungeonStatus.floorNumber || (dungeonStatus.maxFloorPassed + 1);
    const activity = dungeonStatus.dungeonActivity ?? 0;
    const prime = dungeonStatus.elements?.prime
      ? dungeonStatus.elements.prime.charAt(0).toUpperCase() + dungeonStatus.elements.prime.slice(1)
      : 'Earth';
    const respawn = dungeonStatus.respawnFloor || 0;

    cards.push({
      id: 'titanDungeon',
      type: 'dungeon',
      title: '🏰 Titan Dungeon',
      searchStr: `titan dungeon floor ${floor} checkpoint ${respawn} ${prime}`.toLowerCase(),
      featured: true,
      data: {
        floor,
        activity,
        prime,
        respawn,
        maxPassed: dungeonStatus.maxFloorPassed || 0,
      },
      action: () => openModal('dungeon'),
    });
  }

  // 3. Guild War Championship (clanWarChampStatus)
  const gwStatus = cache.value?.clanWarChampStatus?.data;
  if (gwStatus) {
    const current = gwStatus.seasonStatus?.current;
    const stageLabel = (current?.stageType || 'REGULAR_STAGE').replace(/_/g, ' ');
    const hours =
      current?.startHour != null && current?.endHour != null
        ? `${String(current.startHour).padStart(2, '0')}:00 - ${String(current.endHour).padStart(2, '0')}:00`
        : 'Active';

    cards.push({
      id: 'clanWarChamp',
      type: 'guild_war',
      title: '🏆 Guild War Championship',
      searchStr: `guild war championship season ${gwStatus.seasonId || ''} ${current?.stageType || ''}`.toLowerCase(),
      data: {
        seasonId: gwStatus.seasonId || '58',
        stageLabel,
        hours,
        tries: gwStatus.tries ?? 0,
      },
    });
  }

  // 4. Guild Clash (clanClashStatus)
  const clashStatus = cache.value?.clanClashStatus?.data?.clashEvent;
  if (clashStatus) {
    const lanesCount = clashStatus.lanes?.length || 0;
    cards.push({
      id: 'clanClash',
      type: 'clash',
      title: '🛡️ Guild Clash',
      searchStr: `guild clash cycle ${clashStatus.cycleId || ''}`.toLowerCase(),
      data: {
        cycleId: clashStatus.cycleId || 1,
        lanesCount,
      },
    });
  }

  // 5. Hero Brawl (brawlStatus)
  const brawls = cache.value?.brawlStatus?.data?.brawls;
  if (Array.isArray(brawls) && brawls.length > 0) {
    const brawl = brawls[0];
    cards.push({
      id: 'brawl',
      type: 'brawl',
      title: '🥊 Hero Brawl',
      searchStr: `hero brawl #${brawl.brawlId || ''}`.toLowerCase(),
      data: {
        brawlId: brawl.brawlId,
        wins: brawl.wins ?? 0,
        power: formatNumber(Number(brawl.power) || 0),
      },
    });
  }

  // 6. Special Quest Events
  const questData = (globalThis as any).hwaHelperQuestData;
  if (questData?.visibleMetadata) {
    const questEvents = questData.visibleMetadata(cache.value);
    if (Array.isArray(questEvents)) {
      for (const qe of questEvents) {
        const titleMap: Record<string, string> = {
          ADVENTURE_HERO62_TITLE_EVENT_UPGRADE: 'Soleil Upgrade Event',
          DAEMONSKIN22_UI_TITLE: 'Demon Skin Festival',
        };
        const title = titleMap[qe.name_localeKey] || qe.name_localeKey?.replace(/_/g, ' ') || `Special Event #${qe.id}`;
        cards.push({
          id: `questEvent:${qe.id}`,
          type: 'special_event',
          title: `✨ ${title}`,
          searchStr: `special quest event ${title}`.toLowerCase(),
          data: {
            id: qe.id,
            title,
          },
          action: () => openModal('questDetail', { selectedQuestFilter: title }),
        });
      }
    }
  }

  if (questData?.visibleEvents) {
    for (const event of questData.visibleEvents(cache.value) || []) {
      const title = questData.title(event);
      const open = event.groups.reduce(
        (sum: number, group: any) =>
          sum + group.quests.filter((quest: any) => quest.state === 'inProgress').length,
        0
      );
      const daily = event.groups.filter(
        (group: any) =>
          group.repeatType === 'daily' && group.quests.some((quest: any) => quest.state === 'inProgress')
      ).length;

      cards.push({
        id: `specialQuest:${event.id}`,
        type: 'special_event',
        title: `✨ ${title}`,
        searchStr: `special quest ${title}`.toLowerCase(),
        data: {
          id: event.id,
          title,
          open,
          daily,
          endDate: new Date(event.end).toLocaleString(),
        },
        action: () => openModal('questDetail', { selectedQuestFilter: title }),
      });
    }
  }

  // 7. Fortress Event (fortressEventStatus)
  const fortress = cache.value?.fortressEventStatus?.data;
  if (fortress?.id) {
    cards.push({
      id: 'fortress',
      type: 'fortress',
      title: '🏰 Fortress Event',
      searchStr: `fortress event #${fortress.id}`.toLowerCase(),
      data: {
        id: fortress.id,
      },
    });
  }

  // 8. Hydra Boss (clanBoss_getAll)
  const clanBoss = cache.value?.clanBoss_getAll?.data;
  if (clanBoss && Array.isArray(clanBoss.heads)) {
    const deadCount = clanBoss.heads.filter((h: any) => h.state?.isDead).length;
    const totalCount = clanBoss.heads.length;
    cards.push({
      id: 'clanBoss',
      type: 'boss',
      title: '🐉 Hydra Boss',
      searchStr: 'hydra clan boss heads'.toLowerCase(),
      data: {
        deadCount,
        totalCount,
        tries: clanBoss.tries ?? 0,
        superTries: clanBoss.superTries ?? 0,
      },
    });
  }

  return cards;
});

const filteredCards = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return eventCards.value;
  return eventCards.value.filter((c) => c.title.toLowerCase().includes(q) || c.searchStr.includes(q));
});

async function refreshEvents() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([
      { name: 'clanVersus_getInfo' },
      { name: 'dungeonGetInfo' },
      { name: 'quest_getAll' },
    ]);
  } finally {
    isRefreshing.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header Controls -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl shrink-0">🎪</span>
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Active Events & Competitions
            </h3>
            <span
              v-if="eventCards.length > 0"
              class="rounded-full bg-emerald-600 px-2 py-0.5 text-3xs font-bold text-white uppercase tracking-wider"
            >
              Live ({{ eventCards.length }})
            </span>
          </div>
          <p class="text-xs text-slate-400">
            Guild tournaments, special challenges, and daily activities
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full sm:w-auto">
        <div class="relative flex-1 sm:w-64">
          <input
            v-model="search"
            type="search"
            placeholder="Search events, themes, or leagues..."
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>
        <button
          type="button"
          :disabled="isRefreshing"
          class="cursor-pointer shrink-0 text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors disabled:opacity-50 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 sm:border-0"
          @click="refreshEvents"
        >
          <span :class="{ 'inline-block animate-spin': isRefreshing }">↻</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredCards.length === 0"
      class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500"
    >
      No active events match current search or captured game state.
    </div>

    <!-- Event Cards Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <div
        v-for="c in filteredCards"
        :key="c.id"
        class="rounded-xl border transition-all"
        :class="[
          c.type === 'guild_versus'
            ? 'border-emerald-300 bg-emerald-50/50 p-4 shadow-sm hover:border-emerald-400 cursor-pointer dark:border-emerald-900/60 dark:bg-emerald-950/20'
            : c.type === 'dungeon'
            ? 'border-blue-300 bg-blue-50/50 p-4 shadow-sm hover:border-blue-400 cursor-pointer dark:border-blue-800/60 dark:bg-blue-950/30'
            : 'border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900',
          c.action ? 'cursor-pointer hover:shadow-md' : '',
        ]"
        @click="c.action?.()"
      >
        <!-- 1. Guild Versus Card -->
        <template v-if="c.type === 'guild_versus'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2.5">
            <div class="flex items-center gap-2">
              <span class="inline-flex size-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">Guild Versus</span>
              <span class="rounded-full bg-amber-100 px-2 py-0.5 text-3xs font-semibold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                {{ c.data.leagueLabel }} League
              </span>
            </div>
            <span class="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              Round {{ c.data.roundNumber }} of 6 • {{ c.data.theme }}
            </span>
          </div>

          <div class="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800/90 border border-emerald-100 dark:border-emerald-900/40 p-3 text-xs mb-2.5">
            <div class="min-w-0">
              <div class="font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ c.data.clanName }} <span class="text-slate-400 font-normal text-2xs">{{ c.data.clanServer }}</span>
              </div>
              <div class="text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                {{ c.data.roundPoints }} <span class="text-3xs font-normal text-slate-500">pts</span>
              </div>
            </div>
            <div class="shrink-0 px-2 text-center">
              <span class="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-3xs font-bold text-slate-600 dark:text-slate-300">VS</span>
              <div class="text-3xs text-slate-400 mt-0.5">{{ c.data.battleScore }}</div>
            </div>
            <div class="min-w-0 text-right">
              <div class="font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ c.data.enemyClanName }} <span class="text-slate-400 font-normal text-2xs">{{ c.data.enemyServer }}</span>
              </div>
              <div class="text-rose-700 dark:text-rose-400 font-bold text-sm">
                {{ c.data.enemyRoundPoints }} <span class="text-3xs font-normal text-slate-500">pts</span>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium">Personal: <strong class="text-slate-900 dark:text-slate-100">{{ formatNumber(c.data.personalScore) }}</strong> pts</span>
              <span class="text-slate-300 dark:text-slate-700">•</span>
              <span class="font-medium">Chests: <strong class="text-slate-900 dark:text-slate-100">{{ c.data.claimedCount }}/9</strong> claimed</span>
            </div>
            <span class="font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 text-2xs">
              View Details →
            </span>
          </div>
        </template>

        <!-- 2. Titan Dungeon Card -->
        <template v-else-if="c.type === 'dungeon'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2.5">
            <div class="flex items-center gap-2">
              <span class="inline-flex size-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">Titan Dungeon</span>
              <span class="rounded-full bg-blue-100 px-2 py-0.5 text-3xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                Floor {{ c.data.floor }}
              </span>
            </div>
            <span class="text-xs font-semibold text-blue-800 dark:text-blue-300">
              Prime Element: {{ c.data.prime }}
            </span>
          </div>

          <div class="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800/90 border border-blue-100 dark:border-blue-900/50 p-3 text-xs mb-2.5">
            <div class="min-w-0">
              <div class="text-slate-500 dark:text-slate-400 text-2xs">Progress</div>
              <div class="text-blue-900 dark:text-blue-300 font-bold text-sm">Cleared {{ c.data.maxPassed }} Floors</div>
            </div>
            <div class="text-center">
              <div class="text-slate-500 dark:text-slate-400 text-2xs">Checkpoint</div>
              <div class="text-slate-800 dark:text-slate-200 font-bold text-sm">Floor {{ c.data.respawn }}</div>
            </div>
            <div class="text-right">
              <div class="text-slate-500 dark:text-slate-400 text-2xs">Guild Activity</div>
              <div class="text-emerald-700 dark:text-emerald-400 font-bold text-sm">{{ formatNumber(c.data.activity) }} pts</div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
            <span class="text-2xs text-slate-400">Click to view floor doors & titan health status</span>
            <span class="font-semibold text-blue-700 dark:text-blue-400 inline-flex items-center gap-1 text-2xs">
              View Details →
            </span>
          </div>
        </template>

        <!-- 3. Guild War Championship -->
        <template v-else-if="c.type === 'guild_war'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
              <span class="rounded bg-blue-100 px-1.5 py-0.5 text-3xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Season {{ c.data.seasonId }}
              </span>
            </div>
            <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-2xs font-medium text-slate-700 dark:text-slate-300">
              {{ c.data.stageLabel }}
            </span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mt-2">
            <span>Daily War Window: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.hours }}</strong></span>
            <span>Tries: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.tries }}</strong></span>
          </div>
        </template>

        <!-- 4. Guild Clash -->
        <template v-else-if="c.type === 'clash'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
              <span class="rounded bg-indigo-100 px-1.5 py-0.5 text-3xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                Cycle {{ c.data.cycleId }}
              </span>
            </div>
            <span class="text-xs text-slate-500">{{ c.data.lanesCount }} Lanes Contested</span>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">
            Current stage in progress with lane attacks & defense stationed.
          </div>
        </template>

        <!-- 5. Hero Brawl -->
        <template v-else-if="c.type === 'brawl'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
            <span class="rounded bg-amber-100 px-1.5 py-0.5 text-3xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Brawl #{{ c.data.brawlId }}
            </span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Wins: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.wins }}</strong></span>
            <span>Defense Power: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.power }}</strong></span>
          </div>
        </template>

        <!-- 6. Special Quest Events -->
        <template v-else-if="c.type === 'special_event'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
            <span class="rounded bg-purple-100 px-1.5 py-0.5 text-3xs font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              Special Event
            </span>
          </div>
          <div v-if="c.data.open !== undefined" class="text-xs text-slate-500 dark:text-slate-400">
            {{ c.data.open }} open milestones · {{ c.data.daily }} daily groups · Ends {{ c.data.endDate }}
          </div>
          <div v-else class="text-xs text-slate-500 dark:text-slate-400">
            Event ID: {{ c.data.id }} • Active Special Quests & Rewards
          </div>
          <div class="mt-2 text-right">
            <span class="text-indigo-600 dark:text-indigo-400 font-semibold text-2xs">View Quests →</span>
          </div>
        </template>

        <!-- 7. Fortress Event -->
        <template v-else-if="c.type === 'fortress'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
            <span class="rounded bg-cyan-100 px-1.5 py-0.5 text-3xs font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
              Event #{{ c.data.id }}
            </span>
          </div>
          <div class="text-xs text-slate-500">World Map Fortress conquests active</div>
        </template>

        <!-- 8. Hydra Boss -->
        <template v-else-if="c.type === 'boss'">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">{{ c.title }}</span>
            <span class="rounded bg-rose-100 px-1.5 py-0.5 text-3xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Daily Clan Boss
            </span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Heads Defeated: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.deadCount }} / {{ c.data.totalCount }}</strong></span>
            <span>Tries: <strong class="text-slate-800 dark:text-slate-200">{{ c.data.tries }} regular, {{ c.data.superTries }} super</strong></span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
