<script setup lang="ts">
import { computed } from 'vue';
import { useNow } from '@/src/composables/useNow';
import '@/src/utils/metadata';
import { towerActivityState, arenaActivityState, dungeonActivityState, observedToday, readyQuestCount } from '@/src/composables/activityState';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';

const { cache } = useRpcCache();
const now = useNow();
const { openModal } = useModals();

interface ActivityRow {
  id: string;
  title: string;
  icon: string;
  state: 'pending' | 'done' | 'info' | 'unknown';
  detail: string;
  isInteractive?: boolean;
}

const activities = computed<ActivityRow[]>(() => {
  const rows: ActivityRow[] = [];
  const unknown = 'Waiting for game data';

  // Tower
  const towerState = towerActivityState(cache.value, now.value);
  rows.push({
    id: 'tower',
    title: 'Tower',
    icon: '🗼',
    ...towerState,
    isInteractive: true,
  });

  // Arena counters are independent; missing or stale counters are unknown.
  rows.push({ id: 'arena', title: 'Arena', icon: '⚔️',
    ...arenaActivityState(cache.value, false, now.value) });
  rows.push({ id: 'grand-arena', title: 'Grand Arena', icon: '🛡️',
    ...arenaActivityState(cache.value, true, now.value) });

  rows.push({ id: 'dungeon', title: 'Guild Dungeon', icon: '🏰',
    ...dungeonActivityState(cache.value, now.value), isInteractive: true });

  // Hydra
  const hydraEntry = cache.value.clanBoss_getAll;
  const hydra = observedToday(hydraEntry, now.value, cache.value.questResetStatus?.data?.nextDayAt) ? hydraEntry.data : null;
  const knownTries = hydra && Number.isInteger(hydra.tries) && hydra.tries >= 0 &&
    Number.isInteger(hydra.superTries) && hydra.superTries >= 0;
  const tries = knownTries ? hydra.tries + hydra.superTries : null;
  rows.push({
    id: 'hydra',
    title: 'Hydra',
    icon: '🐉',
    state: tries === null ? 'unknown' : tries > 0 ? 'pending' : 'done',
    detail: !knownTries ? unknown : `${hydra.tries ?? 0} regular · ${hydra.superTries ?? 0} super tries left`,
  });

  // Daily Quests
  const questEntry = cache.value.questGetAll ?? cache.value.quest_getAll;
  const questsKnown = observedToday(questEntry, now.value, cache.value.questResetStatus?.data?.nextDayAt);
  const pendingQuests = questsKnown ? readyQuestCount(cache.value) : 0;
  const dailies = (globalThis as any).hwaHelperQuestData?.dailyQuests(cache.value, now.value);
  const remainingDailies = dailies?.filter((quest: any) => quest.state === 'inProgress').length;
  rows.push({
    id: 'quests',
    title: 'Daily Quests',
    icon: '📜',
    state: pendingQuests > 0 || remainingDailies > 0 ? 'pending' : questsKnown ? 'info' : 'unknown',
    detail: !questsKnown && !dailies ? unknown : `${remainingDailies != null ? `${remainingDailies} daily quests remaining · ` : ''}${questsKnown ? pendingQuests : '—'} quest rewards ready to claim`,
    isInteractive: true,
  });

  return rows;
});

function handleActivityClick(act: ActivityRow) {
  if (act.id === 'tower') openModal('tower');
  else if (act.id === 'dungeon') openModal('dungeon');
  else if (act.id === 'quests') openModal('questDetail');
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2.5 shadow-2xs">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>🎯</span> Daily Activities & Progress
      </h4>
      <span class="text-[10px] text-slate-400">Tracked from game packets</span>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="act in activities"
        :key="act.id"
        class="p-2 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between text-xs transition-all"
        :class="
          act.isInteractive
            ? 'cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 dark:hover:border-violet-500/60 dark:hover:bg-slate-800 shadow-2xs hover:shadow-xs'
            : ''
        "
        :title="act.isInteractive ? `Click to open ${act.title}` : undefined"
        @click="act.isInteractive && handleActivityClick(act)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">{{ act.icon }}</span>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
              <span>{{ act.title }}</span>
              <span v-if="act.isInteractive" class="text-[10px] text-violet-500 font-normal">↗</span>
            </div>
            <div class="text-[10px] text-slate-400 truncate">{{ act.detail }}</div>
          </div>
        </div>

        <span
          class="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
          :class="{
            'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300': act.state === 'done',
            'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse': act.state === 'pending',
            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400': act.state === 'info',
            'bg-slate-50 dark:bg-slate-900 text-slate-400': act.state === 'unknown',
          }"
        >
          {{ act.state }}
        </span>
      </div>
    </div>
  </div>
</template>
