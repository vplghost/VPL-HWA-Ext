<script setup lang="ts">
import { computed } from 'vue';
import { useTroopTraining, getTroopType, normalizeArray } from '@/src/composables/useTroopTraining';
import { formatDuration, formatNumber } from '@/src/utils/formatters';

const {
  troopStats,
  trainSettings,
  totalInjured,
  isHealingActive,
  isHealingReady,
  isRefreshing,
  isSyncLoading,
  isHealLoading,
  healStatus,
  now,
  trainings,
  setTrainLevel,
  refreshTroops,
  collectTraining,
  startTrain,
  healAll,
  syncHealed,
} = useTroopTraining();

function handleLevelChange(type: number, event: Event) {
  const target = event.target as HTMLSelectElement;
  const val = parseInt(target.value, 10);
  if (!isNaN(val) && val >= 1 && val <= 9) {
    setTrainLevel(type, val);
  }
}

function getCardState(t: any) {
  const currentTotal = t.readyCount + t.hospitalCount + t.trainingCount;
  const maxTarget = t.maxTroops;
  const limitKnown = Number.isSafeInteger(maxTarget) && maxTarget >= 0;
  const remaining = limitKnown ? Math.max(0, maxTarget - currentTotal) : 0;
  const canTrain = limitKnown && remaining > 0;
  const unitsToTrain = Math.min(26, Math.max(0, remaining));

  const queuesForType = normalizeArray(trainings.value?.trainingQueues).filter((q: any) => {
    const info = getTroopType(q?.unitId);
    return info && info.type === t.type;
  });

  const completedQueue = queuesForType.find(
    (q: any) => Number.isFinite(q.startDate) && Number.isFinite(q.duration) && q.startDate + q.duration <= now.value
  );
  const activeQueue = queuesForType.find(
    (q: any) => Number.isFinite(q.startDate) && Number.isFinite(q.duration) && q.startDate + q.duration > now.value
  );

  const levelsSorted = (t?.readyByLevel instanceof Map)
    ? [...t.readyByLevel.entries()].sort((a: any, b: any) => a[0] - b[0])
    : [];
  const levelStr =
    levelsSorted.length > 0
      ? levelsSorted.map(([lvl, cnt]: [number, number]) => `Lv.${lvl}: ${formatNumber(cnt)}`).join(' · ')
      : '0';

  const savedLevel = trainSettings.value?.trainLevels?.[t.type];
  const highestReadyLevel = levelsSorted.length > 0 ? levelsSorted[levelsSorted.length - 1][0] : 7;
  const selectedLevel = typeof savedLevel === 'number' && savedLevel >= 1 && savedLevel <= 9 ? savedLevel : highestReadyLevel;

  const maxForBar = Math.max(limitKnown ? maxTarget : 0, currentTotal);
  const readyPct = maxForBar > 0 ? (t.readyCount / maxForBar) * 100 : 0;
  const hospitalPct = maxForBar > 0 ? (t.hospitalCount / maxForBar) * 100 : 0;
  const trainingPct = maxForBar > 0 ? (t.trainingCount / maxForBar) * 100 : 0;

  const healingSec = t.healingEndsAt ? Math.max(0, Math.ceil((t.healingEndsAt - now.value) / 1000)) : null;
  const healingTimerText = healingSec !== null && healingSec > 0 ? formatDuration(healingSec) : healingSec !== null ? 'Ready' : null;

  const trainingSec = t.trainingEndsAt ? Math.max(0, Math.ceil((t.trainingEndsAt - now.value) / 1000)) : null;
  const trainingTimerText = trainingSec !== null && trainingSec > 0 ? formatDuration(trainingSec) : trainingSec !== null ? 'Ready' : null;

  return {
    currentTotal,
    maxTarget,
    limitKnown,
    remaining,
    canTrain,
    unitsToTrain,
    completedQueue,
    activeQueue,
    levelStr,
    selectedLevel,
    readyPct,
    hospitalPct,
    trainingPct,
    healingTimerText,
    trainingTimerText,
  };
}

const troopCards = computed(() => {
  return troopStats.value.map((t) => ({
    t,
    st: getCardState(t),
  }));
});
</script>

<template>
  <section id="dashboard-troops-section" class="space-y-2">
    <p v-if="healStatus" role="status" class="text-xs text-slate-500 dark:text-slate-400">{{ healStatus }}</p>
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span>🪖</span> Troops
        </h3>
        <span class="text-xs text-slate-400 dark:text-slate-500 font-normal">· Forces & Hospital</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Sync Healed Button -->
        <button
          v-if="isHealingReady"
          id="dashboard-troops-heal-sync-btn"
          type="button"
          :disabled="isSyncLoading"
          class="cursor-pointer inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-60"
          @click="syncHealed"
        >
          <span :class="{ 'animate-spin': isSyncLoading }">{{ isSyncLoading ? '↻' : '✓' }}</span>
          <span>{{ isSyncLoading ? 'Syncing...' : 'Sync Healed' }}</span>
        </button>

        <!-- Heal All Button -->
        <button
          v-else-if="totalInjured > 0 && !isHealingActive"
          id="dashboard-troops-heal-all-btn"
          type="button"
          :disabled="isHealLoading"
          class="cursor-pointer inline-flex items-center gap-1 rounded bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-60"
          @click="healAll"
        >
          <span :class="{ 'animate-spin': isHealLoading }">{{ isHealLoading ? '↻' : '🏥' }}</span>
          <span>{{ isHealLoading ? 'Healing...' : `Heal All (${formatNumber(totalInjured)})` }}</span>
        </button>

        <!-- Refresh Button -->
        <button
          id="dashboard-troops-refresh-btn"
          type="button"
          title="Refresh troops, hospital, and training status"
          :disabled="isRefreshing"
          class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors disabled:opacity-50"
          @click="refreshTroops"
        >
          <span class="text-sm" :class="{ 'inline-block animate-spin': isRefreshing }">↻</span>
          <span class="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>

    <!-- Troop Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
      <div
        v-for="{ t, st } in troopCards"
        :key="t.type"
        class="rounded-xl border border-slate-200 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs"
      >
        <!-- Card Header -->
          <div class="flex items-center justify-between gap-1.5">
            <span
              class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-current/10"
              :class="t.badgeCls"
            >
              <span>{{ t.icon }}</span> <span>{{ t.label }}</span>
            </span>

            <div class="flex items-center gap-1.5 text-xs">
              <span
                class="text-[11px] text-slate-500 dark:text-slate-400 font-medium"
                title="Troop stock limit from confirmed Drill Grounds and Camp levels"
              >
                Cap: <strong class="text-slate-700 dark:text-slate-200 font-bold tabular-nums">{{ st.limitKnown ? formatNumber(st.maxTarget) : 'Unknown' }}</strong>
              </span>
              <span class="text-slate-300 dark:text-slate-600">·</span>
              <span class="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {{ formatNumber(st.currentTotal) }}
              </span>
            </div>
          </div>

          <!-- Stats Row -->
          <div class="grid grid-cols-3 text-center text-xs gap-1 py-1 bg-slate-50/70 dark:bg-slate-900/40 rounded-lg">
            <div>
              <div class="text-[10px] text-slate-400 uppercase tracking-wider">Ready</div>
              <div class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {{ formatNumber(t.readyCount) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase tracking-wider">Hospital</div>
              <div class="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {{ formatNumber(t.hospitalCount) }}
              </div>
              <div v-if="st.healingTimerText" class="text-[9px] text-rose-500 font-mono">
                {{ st.healingTimerText }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase tracking-wider">Training</div>
              <div class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {{ formatNumber(t.trainingCount) }}
              </div>
              <div v-if="st.trainingTimerText" class="text-[9px] text-indigo-500 font-mono">
                {{ st.trainingTimerText }}
              </div>
            </div>
          </div>

          <!-- Segmented Visual Bar -->
          <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex">
            <div
              class="h-full bg-emerald-500 transition-all duration-300"
              :style="{ width: `${st.readyPct}%` }"
              title="Ready Troops"
            ></div>
            <div
              class="h-full bg-rose-500 transition-all duration-300"
              :style="{ width: `${st.hospitalPct}%` }"
              title="Injured Troops"
            ></div>
            <div
              class="h-full bg-indigo-500 transition-all duration-300"
              :style="{ width: `${st.trainingPct}%` }"
              title="In Training"
            ></div>
          </div>

          <!-- Level Breakdown -->
          <div class="text-[10px] text-slate-400 truncate" :title="st.levelStr">
            {{ st.levelStr }}
          </div>

          <!-- Card Action Row -->
          <div class="pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs gap-1">
            <!-- Status Text -->
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
              <span v-if="st.completedQueue" class="text-emerald-600 dark:text-emerald-400 font-semibold">
                Training finished
              </span>
              <span v-else-if="st.activeQueue" class="text-indigo-600 dark:text-indigo-400 font-medium">
                In training
              </span>
              <span v-else-if="!st.limitKnown" class="text-amber-600 dark:text-amber-400">Sync building levels to determine the limit</span>
              <span v-else-if="!st.canTrain" class="text-amber-600 dark:text-amber-400 font-medium">
                Max reached ({{ formatNumber(st.currentTotal) }})
              </span>
              <span v-else>
                Idle · Cap: <strong class="text-slate-700 dark:text-slate-200 tabular-nums">{{ formatNumber(st.remaining) }}</strong>
              </span>
            </span>

            <!-- Actions -->
            <div class="troop-card-action shrink-0">
              <!-- Collect Button -->
              <button
                v-if="st.completedQueue"
                type="button"
                class="cursor-pointer inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors"
                @click="collectTraining(st.completedQueue)"
              >
                <span>✓</span> <span>Ready / Collect</span>
              </button>

              <!-- Train Controls -->
              <div v-else-if="!st.activeQueue" class="flex items-center gap-1">
                <!-- Level select -->
                <select
                  class="troop-level-select rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-hidden"
                  :value="st.selectedLevel"
                  title="Select troop tier/level to train"
                  @change="handleLevelChange(t.type, $event)"
                >
                  <option v-for="lvl in 9" :key="lvl" :value="lvl">
                    Lv.{{ lvl }}
                  </option>
                </select>

                <!-- Train button -->
                <button
                  type="button"
                  :disabled="!st.canTrain || st.unitsToTrain <= 0"
                  class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors"
                  :class="
                    st.canTrain && st.unitsToTrain > 0
                      ? 'cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'cursor-not-allowed bg-slate-200 dark:bg-slate-700 text-slate-400 opacity-60'
                  "
                  :title="
                    st.canTrain && st.unitsToTrain > 0
                      ? `Train ${st.unitsToTrain} units (up to max ${formatNumber(st.maxTarget)})`
                      : st.limitKnown ? `Cannot train: total units (${formatNumber(st.currentTotal)}) reached max threshold (${formatNumber(st.maxTarget)})` : 'Sync building levels before training'
                  "
                  @click="startTrain(t.type, st.selectedLevel)"
                >
                  <span>⚔️</span>
                  <span>{{ st.canTrain && st.unitsToTrain > 0 ? `Train (${st.unitsToTrain})` : st.limitKnown ? 'Maxed' : 'Unknown limit' }}</span>
                </button>
              </div>

              <!-- In Progress Badge -->
              <span v-else class="text-[10px] text-slate-400 dark:text-slate-500">
                {{ st.trainingTimerText ? `Ends in ${st.trainingTimerText}` : 'Training' }}
              </span>
            </div>
          </div>
      </div>
    </div>
  </section>
</template>

