<script setup lang="ts">
import { computed } from 'vue';
import { expeditionActivity } from '@/src/utils/expeditions';
import { useNow } from '@/src/composables/useNow';
import '@/src/utils/metadata';
import { towerActivityState, arenaActivityState, dungeonActivityState, guildVersusActivityState, frontierActivityState, observedToday, readyQuestCount } from '@/src/composables/activityState';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { dailyQuests } from '@/src/data/questData';
import { useDailyAutopilot } from '@/src/composables/useDailyAutopilot';
import { mergeActivityWithAutopilotState, type ExtendedActivityState } from '@/src/services/dailyAutopilotService';
import FreeGiftsStrip from './FreeGiftsStrip.vue';

const props = withDefaults(defineProps<{ hasGameTab?: boolean }>(), {
  hasGameTab: true,
});

const { cache, dispatchRpc } = useRpcCache();
const now = useNow();
const { openModal } = useModals();
const autopilot = typeof useDailyAutopilot === 'function'
  ? useDailyAutopilot(cache, dispatchRpc, now)
  : null;

interface ActivityRow {
  id: string;
  title: string;
  icon: string;
  state: ExtendedActivityState;
  detail: string;
  isInteractive?: boolean;
  progress?: number;
  skipReason?: string;
  errorReason?: string;
  statusTooltip?: string;
}

const activities = computed<ActivityRow[]>(() => {
  const rows: ActivityRow[] = [];
  const unknown = 'Waiting for game data';

  // Tower
  const towerState = towerActivityState(cache.value, now.value);
  const towerFloorMatch = towerState.detail.match(/Floor\s+(\d+)\s*\/\s*(\d+)/i);
  const towerProgress = towerState.state === 'done'
    ? 100
    : towerFloorMatch
      ? Math.min(100, Math.round((Number(towerFloorMatch[1]) / Math.max(1, Number(towerFloorMatch[2]))) * 100))
      : undefined;
  rows.push({
    id: 'tower',
    title: 'Tower',
    icon: '🗼',
    ...towerState,
    ...(towerProgress != null ? { progress: towerProgress } : {}),
    isInteractive: true,
  });

  // Arena counters are independent; missing or stale counters are unknown.
  rows.push({ id: 'arena', title: 'Arena', icon: '⚔️',
    ...arenaActivityState(cache.value, false, now.value), isInteractive: true });
  rows.push({ id: 'grand-arena', title: 'Grand Arena', icon: '🛡️',
    ...arenaActivityState(cache.value, true, now.value), isInteractive: true });

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
    isInteractive: true,
  });

  // Guild Versus
  rows.push({
    id: 'guildVersus',
    title: 'Guild Versus',
    icon: '🏆',
    ...guildVersusActivityState(cache.value, now.value),
    isInteractive: true,
  });

  // Daily Quests
  const questEntry = cache.value.questGetAll ?? cache.value.quest_getAll;
  const questsKnown = observedToday(questEntry, now.value, cache.value.questResetStatus?.data?.nextDayAt);
  const pendingQuests = questsKnown ? readyQuestCount(cache.value) : 0;
  const dailies = typeof dailyQuests === 'function' ? dailyQuests(cache.value, now.value) : null;
  const remainingDailies = dailies ? dailies.filter((quest: any) => quest.state === 'inProgress').length : undefined;
  rows.push({
    id: 'quests',
    title: 'Daily Quests',
    icon: '📜',
    state: pendingQuests > 0 || (remainingDailies ?? 0) > 0 ? 'pending' : questsKnown ? 'info' : 'unknown',
    detail: !questsKnown && !dailies ? unknown : `${remainingDailies != null ? `${remainingDailies} daily quests remaining · ` : ''}${questsKnown ? pendingQuests : '—'} quest rewards ready to claim`,
    isInteractive: true,
  });

  rows.push(expeditionActivity(cache.value, now.value));

  // Frontier (Eternal Story)
  rows.push({
    id: 'frontier',
    title: 'Frontier',
    icon: '🧭',
    ...frontierActivityState(cache.value, now.value),
    isInteractive: true,
  });

  if (autopilot && typeof mergeActivityWithAutopilotState === 'function') {
    const steps = autopilot.runtimeState.steps || {};
    return rows.map((row) => mergeActivityWithAutopilotState(row, (steps as any)[row.id]));
  }

  return rows;
});

function toggleAutopilot() {
  if (!autopilot) return;
  if (autopilot.runtimeState.running) {
    autopilot.stopAutopilot();
  } else {
    void autopilot.startAutopilot();
  }
}

const AUTOPILOT_STEP_IDS = new Set([
  'freebies',
  'expeditions',
  'frontier',
  'quests',
  'tower',
  'hydra',
  'arena',
  'grand-arena',
  'dungeon',
]);

function canRetryActivity(act: ActivityRow): boolean {
  return Boolean(
    autopilot &&
    typeof autopilot.runSingleStep === 'function' &&
    props.hasGameTab &&
    !autopilot.runtimeState.running &&
    (act.state === 'skipped' || act.state === 'error') &&
    AUTOPILOT_STEP_IDS.has(act.id)
  );
}

function runSingleActivity(id: string) {
  if (!autopilot || typeof autopilot.runSingleStep !== 'function') return;
  void autopilot.runSingleStep(id as any);
}

function handleActivityClick(act: ActivityRow) {
  if (act.id === 'tower') openModal('tower');
  else if (act.id === 'arena') openModal('arena');
  else if (act.id === 'grand-arena') openModal('grandArena');
  else if (act.id === 'hydra') openModal('hydra');
  else if (act.id === 'dungeon') openModal('dungeon');
  else if (act.id === 'expeditions') openModal('expeditions');
  else if (act.id === 'quests') openModal('questDetail');
  else if (act.id === 'guildVersus') openModal('guildVersus');
  else if (act.id === 'frontier') openModal('frontier');
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2.5 shadow-2xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>🎯</span> Daily Activities & Progress
      </h4>

      <div class="flex items-center gap-2">
        <span
          v-if="autopilot"
          id="daily-autopilot-status"
          class="text-[10px] font-medium"
          :class="autopilot.runtimeState.running ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400'"
        >
          {{ autopilot.statusSummary.value }}
        </span>
        <span v-else class="text-[10px] text-slate-400">Tracked from game packets</span>

        <button
          v-if="autopilot"
          id="btn-daily-autopilot-toggle"
          type="button"
          :disabled="!props.hasGameTab && !autopilot.runtimeState.running"
          class="cursor-pointer px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          :class="
            autopilot.runtimeState.running
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          "
          :title="autopilot.runtimeState.running ? 'Stop Daily Autopilot' : 'Start Daily Routine Autopilot'"
          @click="toggleAutopilot"
        >
          {{ autopilot.runtimeState.running ? '⏹ Stop' : '▶ Autopilot' }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="act in activities"
        :key="act.id"
        :id="`activity-card-${act.id}`"
        class="p-2 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2 text-xs transition-all"
        :class="
          act.isInteractive
            ? 'cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 dark:hover:border-violet-500/60 dark:hover:bg-slate-800 shadow-2xs hover:shadow-xs'
            : ''
        "
        :title="act.statusTooltip || (act.isInteractive ? `Click to open ${act.title}` : undefined)"
        @click="act.isInteractive && handleActivityClick(act)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">{{ act.icon }}</span>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
              <span>{{ act.title }}</span>
              <span v-if="act.isInteractive" class="text-[10px] text-violet-500 font-normal">↗</span>
            </div>
            <div class="text-[10px] text-slate-400 truncate" :title="act.detail">{{ act.detail }}</div>
            <progress v-if="act.progress != null" :value="act.progress" max="100" class="h-1.5 w-full min-w-32 accent-violet-600" :aria-label="`${act.title} progress`" />
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <button
            v-if="canRetryActivity(act)"
            :id="`btn-activity-retry-${act.id}`"
            type="button"
            class="cursor-pointer size-5 rounded flex items-center justify-center text-[10px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 dark:text-indigo-300 transition-colors"
            :title="`Run ${act.title} now${act.skipReason ? ` (${act.skipReason})` : ''}`"
            :aria-label="`Run ${act.title} now`"
            @click.stop="runSingleActivity(act.id)"
          >
            ↻
          </button>

          <span
            :id="`activity-status-${act.id}`"
            class="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
            :title="act.statusTooltip || act.detail"
            :class="{
              'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300': act.state === 'done',
              'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse': act.state === 'pending',
              'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 animate-pulse': act.state === 'running',
              'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300': act.state === 'waiting',
              'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300': act.state === 'error',
              'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400': act.state === 'skipped',
              'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400': act.state === 'info',
              'bg-slate-50 dark:bg-slate-900 text-slate-400': act.state === 'unknown',
            }"
          >
            {{ act.state }}
          </span>
        </div>
      </div>
    </div>

    <!-- Unified Per-Group Free Gifts / Video / Spin Strip -->
    <FreeGiftsStrip :has-game-tab="props.hasGameTab" />
  </div>
</template>
