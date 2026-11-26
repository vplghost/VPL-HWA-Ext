<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';
import { extractEventGoals } from '@/src/utils/popupData';

const { cache, dispatchRpc } = useRpcCache();

const search = ref('');
const activeFilter = ref<'all' | 'activities' | 'resources' | 'synergies' | 'ready' | 'unavailable'>('all');
const showUnavailable = ref(false);
const isRefreshing = ref(false);

const goalsData = computed(() => {
  return extractEventGoals(cache.value);
});

function matchSearch(g: any): boolean {
  const q = search.value.trim().toLowerCase();
  if (!q) return true;
  const inTitle = g.title.toLowerCase().includes(q);
  const inCat = g.category.toLowerCase().includes(q);
  const inEvents = (g.events || []).some((e: any) => e.name.toLowerCase().includes(q));
  const inReason = String(g.unavailableReason || g.hint || '').toLowerCase().includes(q);
  return inTitle || inCat || inEvents || inReason;
}

function matchActionableGoal(g: any): boolean {
  if (activeFilter.value === 'unavailable') return false;
  if (activeFilter.value === 'activities' && g.category !== 'Activities') return false;
  if (activeFilter.value === 'resources' && g.category !== 'Resources') return false;
  if (activeFilter.value === 'synergies' && g.overlapCount <= 1) return false;
  if (
    activeFilter.value === 'ready' &&
    !(g.category === 'Resources' ? g.inStock : g.isLimited && !g.isUnavailable && !g.isCompleted)
  )
    return false;

  return matchSearch(g);
}

const visibleActionableActivities = computed(() => {
  const list = goalsData.value.actionableActivities ||
    (goalsData.value.activities || []).filter((g: any) => !g.isUnavailable && !g.isCompleted);
  return list.filter(matchActionableGoal);
});

const visibleResources = computed(() => {
  return (goalsData.value.resources || []).filter(matchActionableGoal);
});

const visibleUnavailable = computed(() => {
  if (activeFilter.value === 'resources' || activeFilter.value === 'ready') return [];
  const list = goalsData.value.unavailable ||
    (goalsData.value.all || []).filter((g: any) => g.isUnavailable || g.isCompleted);
  return list.filter((g: any) => {
    if (activeFilter.value === 'synergies' && g.overlapCount <= 1) return false;
    return matchSearch(g);
  });
});

const isUnavailableExpanded = computed(() => {
  return activeFilter.value === 'unavailable' || showUnavailable.value || search.value.trim().length > 0;
});

async function refreshGoals() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await dispatchRpc([
      { name: 'getInfo', feature: 'clanVersus', args: {} },
      { name: 'questGetAll' },
      { name: 'inventoryGet' },
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
        <span class="text-2xl shrink-0">🎯</span>
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Cross-Event Goals & Synergies
            </h3>
            <span class="rounded-full bg-indigo-100 dark:bg-indigo-950/80 px-2 py-0.5 text-3xs font-bold text-indigo-700 dark:text-indigo-300">
              {{ goalsData.metrics.totalGoals }} Goals
            </span>
          </div>
          <p class="text-xs text-slate-400">
            {{ goalsData.metrics.totalGoals }} actionable • {{ goalsData.metrics.synergiesCount }} synergies • {{ goalsData.metrics.readyCount }} ready
            <template v-if="goalsData.metrics.unavailableCount > 0">
              • {{ goalsData.metrics.unavailableCount }} done / unavailable
            </template>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full sm:w-auto">
        <div class="relative flex-1 sm:w-64">
          <input
            v-model="search"
            type="search"
            placeholder="Search goals, activities, or resources..."
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        </div>
        <button
          type="button"
          :disabled="isRefreshing"
          class="cursor-pointer shrink-0 text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors disabled:opacity-50 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 sm:border-0"
          @click="refreshGoals"
        >
          <span :class="{ 'inline-block animate-spin': isRefreshing }">↻</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Empty State if no data at all -->
    <div
      v-if="goalsData.all.length === 0"
      class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500"
    >
      No active event goals or challenges detected in current cache.
    </div>

    <template v-else>
      <!-- 1. KPI Stats Cards Bar -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <!-- Active Goals -->
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Active Goals</span>
            <span>🎯</span>
          </div>
          <div class="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
            {{ goalsData.metrics.totalGoals }}
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5">Across current events</div>
        </div>

        <!-- Synergies -->
        <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <div class="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 mb-1">
            <span class="font-semibold">Synergies</span>
            <span>🔥</span>
          </div>
          <div class="text-xl font-black text-amber-900 dark:text-amber-200 tabular-nums">
            {{ goalsData.metrics.synergiesCount }}
          </div>
          <div class="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">Completes 2+ events at once</div>
        </div>

        <!-- Ready / Stocked -->
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div class="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 mb-1">
            <span class="font-semibold">Ready / Stocked</span>
            <span>✓</span>
          </div>
          <div class="text-xl font-black text-emerald-900 dark:text-emerald-200 tabular-nums">
            {{ goalsData.metrics.readyCount }}
          </div>
          <div class="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">In-stock & daily-limited</div>
        </div>
      </div>

      <!-- 2. Filter Pills Bar -->
      <div class="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1">
        <button
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'all'"
        >
          All ({{ goalsData.metrics.totalGoals }})
        </button>

        <button
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'activities'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'activities'"
        >
          ⚡ Activities ({{ goalsData.actionableActivities.length }})
        </button>

        <button
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'resources'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'resources'"
        >
          💎 Resources ({{ goalsData.resources.length }})
        </button>

        <button
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'synergies'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'synergies'"
        >
          🔥 Synergies ({{ goalsData.metrics.synergiesCount }})
        </button>

        <button
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'ready'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'ready'"
        >
          ✓ Ready ({{ goalsData.metrics.readyCount }})
        </button>

        <button
          v-if="goalsData.metrics.unavailableCount > 0"
          id="goals-filter-unavailable-btn"
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="
            activeFilter === 'unavailable'
              ? 'bg-slate-700 text-white shadow-xs dark:bg-slate-200 dark:text-slate-900'
              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="activeFilter = 'unavailable'"
        >
          🔒 Completed / Unavailable ({{ goalsData.metrics.unavailableCount }})
        </button>
      </div>

      <!-- No Filter Results -->
      <div
        v-if="visibleActionableActivities.length === 0 && visibleResources.length === 0 && visibleUnavailable.length === 0"
        class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500"
      >
        No event goals match current filter or search criteria.
      </div>

      <!-- 3. Actionable Activities Group -->
      <div v-if="visibleActionableActivities.length > 0" id="goals-actionable-activities" class="space-y-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>⚡</span> Activities & Quests ({{ visibleActionableActivities.length }})
          </h3>
          <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            Actionable Today
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <div
            v-for="act in visibleActionableActivities"
            :key="act.key"
            class="rounded-xl border p-3 text-xs space-y-2 transition-colors"
            :class="[
              act.overlapCount > 1
                ? 'border-amber-300 bg-amber-50/40 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20'
                : act.isLimited
                ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/20'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between gap-1.5 flex-wrap">
              <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 truncate">
                <span class="shrink-0 text-sm">{{ act.icon }}</span>
                <span class="truncate" :title="act.title">{{ act.title }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="act.overlapCount > 1"
                  class="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 border border-amber-300 dark:border-amber-700"
                >
                  🔥 {{ act.overlapCount }}x Synergy
                </span>
                <span
                  v-if="act.isLimited"
                  class="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 text-[10px] font-semibold px-2 py-0.5 border border-blue-200 dark:border-blue-800"
                >
                  ⚡ Daily Limited
                </span>
              </div>
            </div>

            <!-- Events Pills -->
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(ev, eIdx) in act.events"
                :key="eIdx"
                class="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium border border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs"
              >
                <strong class="text-slate-900 dark:text-slate-100 mr-1">{{ ev.name }}:</strong>
                {{ ev.amount ? `${formatNumber(ev.amount)} ${ev.unit || ''}` : '' }}
                <span v-if="ev.points > 0" class="ml-1 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                  (+{{ formatNumber(ev.points) }} pts)
                </span>
              </span>
            </div>

            <!-- Footer & Hint -->
            <div class="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-1">
              <span class="text-slate-600 dark:text-slate-300 font-medium">
                {{
                  act.overlapCount > 1
                    ? `💡 Priority Route: Progresses ${act.overlapCount} events simultaneously.`
                    : act.isLimited
                    ? '💡 Daily task: Complete before reset to optimize score.'
                    : act.hint
                    ? `💡 ${act.hint}`
                    : ''
                }}
              </span>
              <span v-if="act.totalPoints > 0" class="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                +{{ formatNumber(act.totalPoints) }} total pts
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Resources Group -->
      <div v-if="visibleResources.length > 0" id="goals-resources" class="space-y-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>💎</span> Resources to Spend ({{ visibleResources.length }})
          </h3>
          <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            Stock & Spending Targets
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <div
            v-for="res in visibleResources"
            :key="res.key"
            class="rounded-xl border p-3 text-xs space-y-2 transition-colors"
            :class="[
              res.overlapCount > 1
                ? 'border-amber-300 bg-amber-50/40 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20'
                : res.inStock
                ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                : 'border-rose-200 bg-rose-50/20 dark:border-rose-900/40 dark:bg-rose-950/20',
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between gap-1.5 flex-wrap">
              <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 truncate">
                <span class="shrink-0 text-sm">{{ res.icon }}</span>
                <span class="truncate" :title="res.title">{{ res.title }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="res.overlapCount > 1"
                  class="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 border border-amber-300 dark:border-amber-700"
                >
                  🔥 {{ res.overlapCount }}x Synergy
                </span>
                <span
                  v-if="res.inStock"
                  class="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-300 dark:border-emerald-800"
                >
                  ✓ In Stock
                </span>
                <span
                  v-else
                  class="rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold px-2 py-0.5 border border-rose-300 dark:border-rose-800"
                >
                  ⚠️ Shortage
                </span>
              </div>
            </div>

            <!-- Stock Comparison Bar -->
            <div class="flex items-center justify-between text-xs bg-white dark:bg-slate-800/80 rounded-lg p-2 border border-slate-200/80 dark:border-slate-700">
              <div>Stock: <strong class="text-slate-900 dark:text-slate-100 tabular-nums">{{ formatNumber(res.stock || 0) }}</strong> owned</div>
              <div class="text-slate-400">•</div>
              <div>Target: <strong class="text-slate-900 dark:text-slate-100 tabular-nums">{{ formatNumber(res.needed) }}</strong> per step</div>
              <div class="text-slate-400">•</div>
              <div
                class="font-bold tabular-nums"
                :class="res.inStock ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'"
              >
                {{ res.needed > 0 ? Math.floor((res.stock || 0) / res.needed) : 0 }} step(s) ready
              </div>
            </div>

            <!-- Events Pills -->
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(ev, eIdx) in res.events"
                :key="eIdx"
                class="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium border border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs"
              >
                <strong class="text-slate-900 dark:text-slate-100 mr-1">{{ ev.name }}:</strong>
                {{ ev.amount ? `${formatNumber(ev.amount)} ${ev.unit || ''}` : '' }}
                <span v-if="ev.points > 0" class="ml-1 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                  (+{{ formatNumber(ev.points) }} pts)
                </span>
              </span>
            </div>

            <!-- Footer -->
            <div class="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-1">
              <span class="text-slate-600 dark:text-slate-300 font-medium">
                {{ res.overlapCount > 1 ? `💡 Highest Value: Synergizes across ${res.overlapCount} active events.` : '💡 Spending counts directly towards event goals.' }}
              </span>
              <span v-if="res.totalPoints > 0" class="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                +{{ formatNumber(res.totalPoints) }} total pts
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Completed / Unavailable Today (Bottom Section) -->
      <div v-if="visibleUnavailable.length > 0" id="goals-unavailable-section" class="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>🔒</span> Completed / Unavailable Today ({{ visibleUnavailable.length }})
          </h3>
          <button
            id="goals-toggle-unavailable-btn"
            type="button"
            class="cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            @click="showUnavailable = !showUnavailable"
          >
            {{ isUnavailableExpanded ? 'Hide' : 'Show' }} ({{ visibleUnavailable.length }})
          </button>
        </div>

        <div v-if="isUnavailableExpanded" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <div
            v-for="item in visibleUnavailable"
            :key="item.key"
            class="rounded-xl border border-slate-200 bg-slate-50/70 opacity-75 dark:border-slate-800 dark:bg-slate-900/50 p-3 text-xs space-y-2"
          >
            <div class="flex items-center justify-between gap-1.5 flex-wrap">
              <div class="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300 truncate">
                <span class="shrink-0 text-sm">{{ item.icon }}</span>
                <span class="truncate" :title="item.title">{{ item.title }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span
                  class="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold px-2 py-0.5 border border-slate-300 dark:border-slate-700"
                >
                  🔒 {{ item.unavailableBadge || 'Cleared Today' }}
                </span>
              </div>
            </div>

            <div class="flex flex-wrap gap-1">
              <span
                v-for="(ev, eIdx) in item.events"
                :key="eIdx"
                class="inline-flex items-center rounded-md bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400"
              >
                <strong class="text-slate-700 dark:text-slate-300 mr-1">{{ ev.name }}:</strong>
                {{ ev.amount ? `${formatNumber(ev.amount)} ${ev.unit || ''}` : '' }}
                <span v-if="ev.points > 0" class="ml-1 text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
                  (+{{ formatNumber(ev.points) }} pts)
                </span>
              </span>
            </div>

            <div class="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between flex-wrap gap-1">
              <span>{{ item.unavailableReason || item.hint || 'Unavailable until daily reset' }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
