<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';
import {
  getTodayIncome,
  getDailyIncomeTrend,
  getUtcDayOffset,
  formatCompactNumber,
  INCOME_SOURCES,
  SOURCE_COLORS,
  getTodayActivityStats,
  getActivityStatsForDay,
  loadDailyActivityHistory,
  persistDailyActivityStats,
  type DayIncomeSummary,
  type DailyActivityStats,
} from '@/src/utils/resourceIncome';

const { cache } = useRpcCache();

// -------------------------------------------------------------
// GOLD ANALYTICS & IN-PLACE VIEW SWITCHER
// -------------------------------------------------------------

// View mode in Column 1: 'today' (donut chart) | 'trend' (multi-day bar chart)
const goldViewMode = ref<'today' | 'trend'>('today');

function toggleGoldViewMode() {
  goldViewMode.value = goldViewMode.value === 'today' ? 'trend' : 'today';
}

// Preset range for gold multi-day trend: '7d' | '14d' | '30d'
const activePreset = ref<'7d' | '14d' | '30d'>('7d');
const fromDate = ref(getUtcDayOffset(Date.now(), -7));
const toDate = ref(getUtcDayOffset(Date.now(), -1));

function applyPreset(preset: '7d' | '14d' | '30d') {
  activePreset.value = preset;
  const now = Date.now();
  toDate.value = getUtcDayOffset(now, -1);
  if (preset === '7d') fromDate.value = getUtcDayOffset(now, -7);
  else if (preset === '14d') fromDate.value = getUtcDayOffset(now, -14);
  else if (preset === '30d') fromDate.value = getUtcDayOffset(now, -30);
}

// Hover states for gold chart
const hoveredDay = ref<DayIncomeSummary | null>(null);
const hoveredIndex = ref<number | null>(null);
const hoveredSlice = ref<string | null>(null);

// Today's gold summary
const todaySummary = computed(() => getTodayIncome(cache?.value || {}));
const todayTotal = computed(() => todaySummary.value.gold);

const todayBreakdown = computed(() => {
  const bySource = todaySummary.value.goldBySource;
  const total = todayTotal.value;
  return Object.entries(bySource)
    .filter(([, amount]) => amount > 0)
    .map(([sourceKey, amount]) => {
      const fallbackMeta = { label: 'Other Sources', icon: '📦' };
      const meta = INCOME_SOURCES[sourceKey] ?? INCOME_SOURCES['other'] ?? fallbackMeta;
      const colorMeta = SOURCE_COLORS[sourceKey] ?? SOURCE_COLORS['other'] ?? { stroke: '#64748b', bg: 'bg-slate-500', text: 'text-slate-500' };
      const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
      return {
        key: sourceKey,
        label: meta.label,
        icon: meta.icon,
        amount,
        percent,
        color: colorMeta.stroke,
        bgClass: colorMeta.bg,
        textClass: colorMeta.text,
      };
    })
    .sort((a, b) => b.amount - a.amount);
});

// Donut Chart calculations (SVG)
const donutRadius = 52;
const donutCircumference = 2 * Math.PI * donutRadius; // ~326.72

const donutSlices = computed(() => {
  const total = todayTotal.value;
  let currentOffset = 0;
  return todayBreakdown.value.map((item) => {
    const fraction = total > 0 ? item.amount / total : 0;
    const length = Math.max(1, fraction * donutCircumference);
    const offset = currentOffset;
    currentOffset += length;
    return {
      ...item,
      length,
      offset,
      circumference: donutCircumference,
    };
  });
});

const activeHoveredDonutItem = computed(() => {
  if (!hoveredSlice.value) return null;
  return todayBreakdown.value.find((b) => b.key === hoveredSlice.value) || null;
});

// Daily gold trend dataset
const dailyTrend = computed(() => {
  return getDailyIncomeTrend(cache?.value || {}, {
    fromDate: fromDate.value,
    toDate: toDate.value,
  });
});

// Gold Daily Bar Chart Dimensions
const chartWidth = 500;
const chartHeight = 130;
const chartPadding = { top: 15, bottom: 25, left: 45, right: 15 };
const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

const chartMax = computed(() => {
  const max = Math.max(...dailyTrend.value.map((d) => d.gold), 0);
  return max > 0 ? max : 1000;
});

const barWidth = computed(() => {
  const count = dailyTrend.value.length || 1;
  const available = plotWidth / count;
  return Math.max(6, Math.min(28, available * 0.65));
});

function getBarX(index: number): number {
  const count = dailyTrend.value.length || 1;
  const step = plotWidth / count;
  return chartPadding.left + index * step + (step - barWidth.value) / 2;
}

function getBarHeight(goldAmount: number): number {
  if (goldAmount <= 0) return 2;
  return Math.max(2, (goldAmount / chartMax.value) * plotHeight);
}

function getBarY(goldAmount: number): number {
  return chartPadding.top + plotHeight - getBarHeight(goldAmount);
}

function formatDayLabel(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return '';
  return dateStr.slice(5).replace('-', '/'); // "MM/DD"
}

// -------------------------------------------------------------
// DAILY PROGRESS & AUTOMATION (30-DAY PERSISTENCE & NAVIGATOR)
// -------------------------------------------------------------

// 0 = Today, -1 = Yesterday, ..., -29 = 30 days ago
const selectedDayOffset = ref(0);
const storedHistory = ref<Record<string, DailyActivityStats>>({});

// Compute today's live activity stats
const liveTodayStats = computed<DailyActivityStats>(() => {
  return getTodayActivityStats(cache?.value || {});
});

// Selected date string (YYYY-MM-DD, UTC)
const selectedDate = computed(() => {
  return getUtcDayOffset(Date.now(), selectedDayOffset.value);
});

// Stats for the currently selected date
const activityStats = computed<DailyActivityStats>(() => {
  return getActivityStatsForDay(cache?.value || {}, selectedDate.value, storedHistory.value);
});

const maxDaysBack = 30;

function changeDay(delta: number) {
  const next = selectedDayOffset.value + delta;
  if (next <= 0 && next >= -(maxDaysBack - 1)) {
    selectedDayOffset.value = next;
  }
}

function jumpToToday() {
  selectedDayOffset.value = 0;
}

onMounted(async () => {
  try {
    const loaded = await loadDailyActivityHistory();
    storedHistory.value = loaded;
    if (liveTodayStats.value) {
      const updated = await persistDailyActivityStats(liveTodayStats.value);
      storedHistory.value = updated;
    }
  } catch {}
});

// Automatically persist live updates for today
watch(
  liveTodayStats,
  async (newVal) => {
    if (newVal) {
      try {
        const updated = await persistDailyActivityStats(newVal);
        storedHistory.value = updated;
      } catch {}
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3 shadow-2xs">
    <!-- 2 Column Overview (Gold & Progress / Automation, 1:2 ratio) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <!-- Column 1: Gold Diagram / In-Place View Switcher (1 col) -->
      <div class="lg:col-span-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between">
        <!-- Gold Header with In-Place Switch Button -->
        <div class="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-sm">🪙</span>
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
              {{ goldViewMode === 'today' ? 'Gold Today' : 'Gold Trend' }}
            </span>
            <span class="text-[10px] text-slate-400 font-mono">
              ({{ goldViewMode === 'today' ? todaySummary.date : activePreset }})
            </span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <!-- If today view, show total -->
            <div v-if="goldViewMode === 'today'" class="text-xs font-extrabold tabular-nums text-amber-500">
              +{{ formatCompactNumber(todayTotal) }}
            </div>

            <!-- If trend view, show 7d/14d/30d presets -->
            <div v-else class="inline-flex rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 p-0.5 text-3xs font-semibold">
              <button
                type="button"
                class="px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                :class="activePreset === '7d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
                @click="applyPreset('7d')"
              >
                7d
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                :class="activePreset === '14d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
                @click="applyPreset('14d')"
              >
                14d
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                :class="activePreset === '30d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'"
                @click="applyPreset('30d')"
              >
                30d
              </button>
            </div>

            <!-- In-place View Switcher Button -->
            <button
              type="button"
              class="size-6 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-xs transition-colors shadow-2xs cursor-pointer ml-0.5"
              :title="goldViewMode === 'today' ? 'Switch to Multi-Day Gold Trend' : 'Switch to Today\'s Gold Breakdown'"
              :aria-label="goldViewMode === 'today' ? 'Switch to Multi-Day Gold Trend' : 'Switch to Today\'s Gold Breakdown'"
              @click="toggleGoldViewMode"
            >
              <span v-if="goldViewMode === 'today'">📊</span>
              <span v-else>🍩</span>
            </button>
          </div>
        </div>

        <!-- View 1: Today's Donut Diagram (Square, compact) -->
        <div v-if="goldViewMode === 'today'" class="flex-1 flex flex-col items-center justify-center p-2 relative min-h-[150px]">
          <div v-if="todayBreakdown.length > 0" class="relative w-32 h-32 flex items-center justify-center">
            <svg viewBox="0 0 150 150" class="w-full h-full transform -rotate-90 select-none">
              <!-- Base track circle -->
              <circle
                cx="75"
                cy="75"
                :r="donutRadius"
                fill="transparent"
                stroke-width="18"
                class="stroke-slate-200/70 dark:stroke-slate-700/50"
              />

              <!-- Donut slices -->
              <circle
                v-for="slice in donutSlices"
                :key="slice.key"
                cx="75"
                cy="75"
                :r="donutRadius"
                fill="transparent"
                :stroke="slice.color"
                :stroke-width="hoveredSlice === slice.key ? 22 : 18"
                :stroke-dasharray="`${slice.length} ${slice.circumference}`"
                :stroke-dashoffset="-slice.offset"
                class="transition-all duration-200 cursor-pointer"
                :class="hoveredSlice === slice.key ? 'filter drop-shadow-md' : 'opacity-95 hover:opacity-100'"
                @mouseenter="hoveredSlice = slice.key"
                @mouseleave="hoveredSlice = null"
              />
            </svg>

            <!-- Donut Center Label -->
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
              <template v-if="activeHoveredDonutItem">
                <span class="text-sm">{{ activeHoveredDonutItem.icon }}</span>
                <span class="text-xs font-black text-slate-800 dark:text-slate-100 tabular-nums">
                  +{{ formatCompactNumber(activeHoveredDonutItem.amount) }}
                </span>
                <span class="text-[9px] font-bold text-amber-500 tabular-nums">
                  {{ activeHoveredDonutItem.percent }}%
                </span>
              </template>
              <template v-else>
                <span class="text-xs font-black text-amber-500 tabular-nums">
                  +{{ formatCompactNumber(todayTotal) }}
                </span>
                <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total
                </span>
              </template>
            </div>
          </div>

          <div v-else class="flex-1 flex items-center justify-center py-8 text-xs text-slate-400">
            No gold recorded for today yet.
          </div>
          <span v-if="todayBreakdown.length > 0" class="text-[10px] text-slate-400 mt-1 italic">Hover slice to view source</span>
        </div>

        <!-- View 2: Multi-Day Gold Bar Chart (In-Place) -->
        <div v-else class="flex-1 flex flex-col justify-center relative min-h-[150px] pt-1">
          <svg
            class="w-full h-32 overflow-visible select-none"
            :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
            preserveAspectRatio="none"
          >
            <!-- Grid Lines and Y-Axis Ticks -->
            <g class="text-[9px] fill-slate-400 font-mono">
              <line
                :x1="chartPadding.left"
                :y1="chartPadding.top"
                :x2="chartWidth - chartPadding.right"
                :y2="chartPadding.top"
                class="stroke-slate-200 dark:stroke-slate-800"
                stroke-dasharray="3,3"
              />
              <text :x="chartPadding.left - 6" :y="chartPadding.top + 3" text-anchor="end">
                {{ formatCompactNumber(chartMax) }}
              </text>

              <line
                :x1="chartPadding.left"
                :y1="chartPadding.top + plotHeight / 2"
                :x2="chartWidth - chartPadding.right"
                :y2="chartPadding.top + plotHeight / 2"
                class="stroke-slate-200 dark:stroke-slate-800"
                stroke-dasharray="3,3"
              />
              <text :x="chartPadding.left - 6" :y="chartPadding.top + plotHeight / 2 + 3" text-anchor="end">
                {{ formatCompactNumber(chartMax / 2) }}
              </text>

              <line
                :x1="chartPadding.left"
                :y1="chartPadding.top + plotHeight"
                :x2="chartWidth - chartPadding.right"
                :y2="chartPadding.top + plotHeight"
                class="stroke-slate-200 dark:stroke-slate-700"
              />
              <text :x="chartPadding.left - 6" :y="chartPadding.top + plotHeight + 3" text-anchor="end">
                0
              </text>
            </g>

            <!-- Bars for Each Day -->
            <g>
              <g
                v-for="(day, idx) in dailyTrend"
                :key="day.date"
                class="cursor-pointer group"
                @mouseenter="hoveredDay = day; hoveredIndex = idx"
                @mouseleave="hoveredDay = null; hoveredIndex = null"
              >
                <rect
                  :x="getBarX(idx) - 2"
                  :y="chartPadding.top"
                  :width="barWidth + 4"
                  :height="plotHeight"
                  fill="transparent"
                />

                <rect
                  :x="getBarX(idx)"
                  :y="getBarY(day.gold)"
                  :width="barWidth"
                  :height="getBarHeight(day.gold)"
                  rx="3"
                  class="transition-all duration-150"
                  :class="
                    hoveredIndex === idx
                      ? 'fill-amber-400 dark:fill-amber-300'
                      : 'fill-amber-500/80 hover:fill-amber-400'
                  "
                />

                <text
                  :x="getBarX(idx) + barWidth / 2"
                  :y="chartPadding.top + plotHeight + 14"
                  text-anchor="middle"
                  class="text-[9px] fill-slate-400 font-mono"
                  :class="hoveredIndex === idx ? 'font-bold fill-slate-800 dark:fill-slate-100' : ''"
                >
                  {{ formatDayLabel(day.date) }}
                </text>
              </g>
            </g>
          </svg>

          <!-- Hover Tooltip Box -->
          <div
            v-if="hoveredDay"
            class="absolute bottom-2 left-2 right-2 sm:right-auto sm:left-14 z-10 p-2 rounded-lg bg-slate-900/95 text-white text-2xs shadow-lg border border-slate-700 backdrop-blur-xs pointer-events-none"
          >
            <div class="flex items-center justify-between gap-4 font-bold border-b border-slate-700 pb-1 mb-1">
              <span>{{ hoveredDay.date }}</span>
              <span class="text-amber-400">
                +{{ hoveredDay.gold.toLocaleString('en-US') }} Gold
              </span>
            </div>
            <div class="space-y-0.5">
              <div
                v-for="(amt, srcKey) in hoveredDay.goldBySource"
                :key="srcKey"
                class="flex items-center justify-between gap-3 text-slate-300"
              >
                <span>{{ INCOME_SOURCES[srcKey]?.label || srcKey }}:</span>
                <span class="font-mono text-slate-100">+{{ Number(amt).toLocaleString('en-US') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Column 2: Daily Progress & Automation Performance (Span 2 cols in 1:2 ratio) -->
      <div class="lg:col-span-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between">
        <!-- Progress Header with Anti-Jitter Date Navigator -->
        <div class="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <div class="flex items-center gap-1.5">
            <span class="text-sm">⚡</span>
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Daily Progress & Automation</span>
          </div>

          <!-- Fixed-width Date Navigator (Zero Jitter) -->
          <div class="flex items-center gap-1">
            <!-- Prev Day Button -->
            <button
              type="button"
              class="size-5 rounded flex items-center justify-center text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              :disabled="selectedDayOffset <= -29"
              title="Previous Day (up to 30 days)"
              aria-label="Previous day"
              @click="changeDay(-1)"
            >
              ◀
            </button>

            <!-- Fixed-width Date Text Container (w-24 text-center font-mono tabular-nums) -->
            <div class="w-24 text-center font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums select-none">
              {{ selectedDate }}
            </div>

            <!-- Next Day Button -->
            <button
              type="button"
              class="size-5 rounded flex items-center justify-center text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              :disabled="selectedDayOffset >= 0"
              title="Next Day"
              aria-label="Next day"
              @click="changeDay(1)"
            >
              ▶
            </button>

            <!-- Fixed-width Tag/Button container (w-12) to prevent jitter when switching between Today tag and Jump button -->
            <div class="w-12 flex items-center justify-center">
              <span
                v-if="selectedDayOffset === 0"
                class="text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              >
                Today
              </span>
              <button
                v-else
                type="button"
                class="text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                title="Jump to Today"
                aria-label="Jump to today"
                @click="jumpToToday"
              >
                Today ↺
              </button>
            </div>
          </div>
        </div>

        <!-- Activity Metrics Grid (5 Cards) -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 my-2 flex-1 items-stretch">
          <!-- 1. Raid Auto-Join (Automation highlight) -->
          <div
            class="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between shadow-2xs group relative"
            title="Raid auto-joins: Extension auto-recalls gatherers to free squad slots vs. native in-game auto-join"
          >
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <span>⚔️</span> Auto-Join
              </span>
            </div>
            <div class="my-1 flex items-baseline gap-1.5 flex-wrap">
              <span class="text-xs font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                {{ activityStats.extAutoJoinCount }} <span class="text-[9px] font-semibold text-slate-400">Ext</span>
              </span>
              <span class="text-[10px] text-slate-300 dark:text-slate-600">/</span>
              <span class="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                {{ activityStats.gameAutoJoinCount }} <span class="text-[9px] font-semibold text-slate-400">Game</span>
              </span>
            </div>
            <div class="text-[9px] text-slate-400 truncate" title="Extension auto-recalls gathering squads vs in-game auto join">
              Auto-recall & join
            </div>
          </div>

          <!-- 2. Campaign Raids -->
          <div class="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>🗺️</span> Campaign
            </span>
            <div class="my-1 text-sm font-black text-sky-600 dark:text-sky-400 tabular-nums">
              {{ formatNumber(activityStats.campaignCount) }}
            </div>
            <div class="text-[9px] text-slate-400 truncate">
              Raids completed
            </div>
          </div>

          <!-- 3. Rallies Led (Organized) -->
          <div class="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>🚩</span> Rallies Led
            </span>
            <div class="my-1 text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">
              {{ formatNumber(activityStats.organizedRalliesCount) }}
            </div>
            <div class="text-[9px] text-slate-400 truncate">
              Organized
            </div>
          </div>

          <!-- 4. Solo Monsters -->
          <div class="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>👹</span> Monsters
            </span>
            <div class="my-1 text-sm font-black text-orange-600 dark:text-orange-400 tabular-nums">
              {{ formatNumber(activityStats.monstersCount) }}
            </div>
            <div class="text-[9px] text-slate-400 truncate">
              Solo hunted
            </div>
          </div>

          <!-- 5. Brigand Camps -->
          <div class="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>⛺</span> Camps
            </span>
            <div class="my-1 text-sm font-black text-teal-600 dark:text-teal-400 tabular-nums">
              {{ formatNumber(activityStats.brigandCampsCount) }}
            </div>
            <div class="text-[9px] text-slate-400 truncate">
              Brigands cleared
            </div>
          </div>
        </div>

        <!-- Unified Total Energy Consumed Bar (Bottom) -->
        <div class="rounded-lg bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div class="flex items-center gap-2">
            <span class="text-sm">⚡</span>
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-semibold block leading-tight">Total Energy Consumed</span>
              <span class="text-xs font-black text-amber-500 dark:text-amber-400 tabular-nums">
                {{ formatNumber(activityStats.totalEnergySpent) }}
                <span class="text-[10px] font-medium text-slate-400">pts</span>
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 text-2xs">
            <div class="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
              <span class="text-slate-400">Campaign:</span>
              <span class="font-bold text-sky-600 dark:text-sky-400 tabular-nums">{{ formatNumber(activityStats.campaignEnergySpent) }} ⚡</span>
            </div>
            <div class="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
              <span class="text-slate-400">World:</span>
              <span class="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{{ formatNumber(activityStats.worldEnergySpent) }} 🌐</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
