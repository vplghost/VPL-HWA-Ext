<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  getTodayIncome,
  getDailyIncomeTrend,
  getDefaultPrevious7DaysRange,
  getUtcDayOffset,
  formatCompactNumber,
  INCOME_SOURCES,
  SOURCE_COLORS,
  getCurrentEmeraldAmount,
  getTodayEmeraldSummary,
  getTodayEmeraldFluctuations,
  getDailyEmeraldTrend,
  type DayIncomeSummary,
  type EmeraldDailySummary,
  type EmeraldFluctuation,
} from '@/src/utils/resourceIncome';

const { cache } = useRpcCache();

// Active resource view tab: 'gold' | 'emerald'
const activeResource = ref<'gold' | 'emerald'>('gold');

// Date range selection state
const defaultRange = getDefaultPrevious7DaysRange();
const fromDate = ref(defaultRange.fromDate);
const toDate = ref(defaultRange.toDate);
const activePreset = ref<'7d' | '14d' | '30d' | 'custom'>('7d');

// Hover states for tooltips
const hoveredDay = ref<DayIncomeSummary | null>(null);
const hoveredIndex = ref<number | null>(null);
const hoveredSlice = ref<string | null>(null);

const hoveredEmeraldDay = ref<EmeraldDailySummary | null>(null);
const hoveredEmeraldIndex = ref<number | null>(null);
const hoveredFluctuation = ref<EmeraldFluctuation | null>(null);

function applyPreset(preset: '7d' | '14d' | '30d') {
  activePreset.value = preset;
  const now = Date.now();
  toDate.value = getUtcDayOffset(now, -1); // Excludes today
  if (preset === '7d') fromDate.value = getUtcDayOffset(now, -7);
  else if (preset === '14d') fromDate.value = getUtcDayOffset(now, -14);
  else if (preset === '30d') fromDate.value = getUtcDayOffset(now, -30);
}

function onCustomDateChange() {
  activePreset.value = 'custom';
}

// -------------------------------------------------------------
// GOLD ANALYTICS
// -------------------------------------------------------------

// Today's summary for gold
const todaySummary = computed(() => getTodayIncome(cache?.value || {}));

const todayTotal = computed(() => {
  return activeResource.value === 'gold' ? todaySummary.value.gold : todaySummary.value.emerald;
});

const todayBreakdown = computed(() => {
  const bySource = activeResource.value === 'gold'
    ? todaySummary.value.goldBySource
    : todaySummary.value.emeraldBySource;

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

// -------------------------------------------------------------
// EMERALD ANALYTICS (FLUCTUATION & DAILY AGGREGATES)
// -------------------------------------------------------------

const currentEmeraldBalance = computed(() => {
  return getCurrentEmeraldAmount(cache?.value || {}) ?? todayEmeraldSummary.value.endAmount;
});

const todayEmeraldSummary = computed(() => {
  return getTodayEmeraldSummary(cache?.value || {});
});

const todayEmeraldFluctuations = computed(() => {
  return getTodayEmeraldFluctuations(cache?.value || {});
});

// Daily Emerald Trend
const dailyEmeraldTrend = computed(() => {
  return getDailyEmeraldTrend(cache?.value || {}, {
    fromDate: fromDate.value,
    toDate: toDate.value,
  });
});

// Emerald Intraday Chart calculations
const intradayPoints = computed(() => {
  const flucs = todayEmeraldFluctuations.value;
  if (!flucs || flucs.length === 0) return [];

  // Build sequential timeline points: start point + each fluctuation point
  const points = [
    {
      id: 'start',
      time: flucs[0].time || '00:00:00',
      balance: flucs[0].prevAmount,
      delta: 0,
      prevAmount: flucs[0].prevAmount,
      isStart: true,
    },
    ...flucs.map((f) => ({
      id: f.id,
      time: f.time,
      balance: f.newAmount,
      delta: f.delta,
      prevAmount: f.prevAmount,
      isStart: false,
    })),
  ];
  return points;
});

const intradayBalanceRange = computed(() => {
  const pts = intradayPoints.value;
  if (pts.length === 0) {
    const cur = currentEmeraldBalance.value || 0;
    return { min: Math.max(0, cur - 100), max: cur + 100 };
  }
  const balances = pts.map((p) => p.balance);
  let min = Math.min(...balances);
  let max = Math.max(...balances);
  if (min === max) {
    min = Math.max(0, min - 50);
    max = max + 50;
  } else {
    const pad = (max - min) * 0.15;
    min = Math.max(0, Math.floor(min - pad));
    max = Math.ceil(max + pad);
  }
  return { min, max };
});

function getIntradayX(index: number): number {
  const count = intradayPoints.value.length;
  if (count <= 1) return chartPadding.left + plotWidth / 2;
  return chartPadding.left + (index / (count - 1)) * plotWidth;
}

function getIntradayY(balance: number): number {
  const { min, max } = intradayBalanceRange.value;
  const range = max - min || 1;
  const ratio = (balance - min) / range;
  return chartPadding.top + plotHeight - ratio * plotHeight;
}

const intradayPolylinePoints = computed(() => {
  return intradayPoints.value
    .map((p, idx) => `${getIntradayX(idx).toFixed(1)},${getIntradayY(p.balance).toFixed(1)}`)
    .join(' ');
});

// Daily Emerald Date-Range Chart Calculations (Diverging bar chart)
const emeraldMaxAbs = computed(() => {
  const vals = dailyEmeraldTrend.value.map((d) => Math.max(d.totalGain, d.totalSpend, Math.abs(d.netDelta)));
  const max = Math.max(...vals, 0);
  return max > 0 ? max : 100;
});

const emeraldZeroY = computed(() => {
  return chartPadding.top + plotHeight / 2;
});

function getEmeraldBarY(day: EmeraldDailySummary): number {
  const max = emeraldMaxAbs.value;
  const halfPlot = plotHeight / 2;
  if (day.netDelta >= 0) {
    const h = (day.netDelta / max) * (halfPlot - 4);
    return emeraldZeroY.value - Math.max(2, h);
  } else {
    return emeraldZeroY.value;
  }
}

function getEmeraldBarHeight(day: EmeraldDailySummary): number {
  const max = emeraldMaxAbs.value;
  const halfPlot = plotHeight / 2;
  const abs = Math.abs(day.netDelta);
  if (abs <= 0) return 2;
  return Math.max(2, (abs / max) * (halfPlot - 4));
}

function formatDayLabel(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return '';
  return dateStr.slice(5).replace('-', '/'); // "MM/DD"
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3 shadow-2xs">
    <!-- 2 Column Diagrams (Gold & Emeralds) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <!-- Column 1: Gold Diagram -->
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between">
        <!-- Gold Header -->
        <div class="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <div class="flex items-center gap-1.5">
            <span class="text-sm">🪙</span>
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Gold Income Today</span>
            <span class="text-[10px] text-slate-400 font-mono">({{ todaySummary.date }})</span>
          </div>
          <div class="text-xs font-extrabold tabular-nums text-amber-500">
            +{{ formatCompactNumber(todayTotal) }}
            <span class="text-[10px] font-semibold text-slate-400 ml-0.5">
              ({{ todayTotal.toLocaleString('en-US') }})
            </span>
          </div>
        </div>

        <!-- Gold Donut Diagram (No separate legend column) -->
        <div v-if="todayBreakdown.length > 0" class="flex-1 flex flex-col items-center justify-center p-2 relative min-h-[160px]">
          <div class="relative w-36 h-36 flex items-center justify-center">
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
          <span class="text-[10px] text-slate-400 mt-1 italic">Hover slice to view source</span>
        </div>

        <div v-else class="flex-1 flex items-center justify-center py-8 text-xs text-slate-400">
          No gold recorded for today yet.
        </div>
      </div>

      <!-- Column 2: Emerald Diagram (No fluctuation log below) -->
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between">
        <!-- Emerald Header -->
        <div class="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <div class="flex items-center gap-1.5">
            <span class="text-sm">💎</span>
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Emeralds Today</span>
            <span class="text-[10px] text-slate-400 font-mono">({{ todayEmeraldSummary.date }})</span>
          </div>

          <div class="flex items-center gap-1.5 text-xs">
            <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60">
              <span class="text-[10px] text-slate-400">Bal:</span>
              <span class="font-extrabold text-emerald-500 tabular-nums text-xs">💎 {{ formatCompactNumber(currentEmeraldBalance) }}</span>
            </div>
            <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60">
              <span class="text-[10px] text-slate-400">Net:</span>
              <span
                class="font-extrabold tabular-nums text-xs"
                :class="
                  todayEmeraldSummary.netDelta > 0
                    ? 'text-emerald-500'
                    : todayEmeraldSummary.netDelta < 0
                      ? 'text-rose-500'
                      : 'text-slate-500'
                "
              >
                {{ todayEmeraldSummary.netDelta > 0 ? '+' : '' }}{{ todayEmeraldSummary.netDelta.toLocaleString('en-US') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Emerald Timeline Diagram -->
        <div v-if="todayEmeraldFluctuations.length > 0" class="flex-1 flex flex-col justify-center pt-2 relative min-h-[160px]">
          <div class="relative w-full rounded-lg bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 p-2">
            <svg
              class="w-full h-32 overflow-visible select-none"
              :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
              preserveAspectRatio="none"
            >
              <!-- Grid lines & Y-axis labels -->
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
                  {{ formatCompactNumber(intradayBalanceRange.max) }}
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
                  {{ formatCompactNumber((intradayBalanceRange.max + intradayBalanceRange.min) / 2) }}
                </text>

                <line
                  :x1="chartPadding.left"
                  :y1="chartPadding.top + plotHeight"
                  :x2="chartWidth - chartPadding.right"
                  :y2="chartPadding.top + plotHeight"
                  class="stroke-slate-200 dark:stroke-slate-700"
                />
                <text :x="chartPadding.left - 6" :y="chartPadding.top + plotHeight + 3" text-anchor="end">
                  {{ formatCompactNumber(intradayBalanceRange.min) }}
                </text>
              </g>

              <!-- Polyline connection for emerald balance progression -->
              <polyline
                fill="none"
                class="stroke-emerald-500/80 dark:stroke-emerald-400"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                :points="intradayPolylinePoints"
              />

              <!-- Points for each fluctuation event -->
              <g v-for="(p, idx) in intradayPoints" :key="p.id">
                <circle
                  :cx="getIntradayX(idx)"
                  :cy="getIntradayY(p.balance)"
                  r="10"
                  fill="transparent"
                  class="cursor-pointer"
                  @mouseenter="hoveredFluctuation = (p.isStart ? null : todayEmeraldFluctuations[idx - 1])"
                  @mouseleave="hoveredFluctuation = null"
                />

                <circle
                  :cx="getIntradayX(idx)"
                  :cy="getIntradayY(p.balance)"
                  :r="p.isStart ? 3 : 4.5"
                  :class="
                    p.isStart
                      ? 'fill-slate-400'
                      : p.delta > 0
                        ? 'fill-emerald-500 stroke-2 stroke-white dark:stroke-slate-900'
                        : 'fill-rose-500 stroke-2 stroke-white dark:stroke-slate-900'
                  "
                />

                <text
                  :x="getIntradayX(idx)"
                  :y="chartPadding.top + plotHeight + 14"
                  text-anchor="middle"
                  class="text-[8px] fill-slate-400 font-mono"
                >
                  {{ p.time.slice(0, 5) }}
                </text>
              </g>
            </svg>

            <!-- Tooltip for hovered fluctuation point -->
            <div
              v-if="hoveredFluctuation"
              class="absolute bottom-2 left-2 right-2 sm:right-auto sm:left-14 z-10 p-2 rounded-lg bg-slate-900/95 text-white text-2xs shadow-lg border border-slate-700 backdrop-blur-xs pointer-events-none"
            >
              <div class="flex items-center justify-between gap-4 font-bold border-b border-slate-700 pb-1 mb-1">
                <span>{{ hoveredFluctuation.time }}</span>
                <span :class="hoveredFluctuation.delta > 0 ? 'text-emerald-400' : 'text-rose-400'">
                  {{ hoveredFluctuation.delta > 0 ? '+' : '' }}{{ hoveredFluctuation.delta.toLocaleString('en-US') }} 💎
                </span>
              </div>
              <div class="text-slate-300">
                Balance: {{ hoveredFluctuation.prevAmount.toLocaleString('en-US') }} ➔
                <span class="font-bold text-white">{{ hoveredFluctuation.newAmount.toLocaleString('en-US') }} 💎</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex-1 flex flex-col items-center justify-center py-8 px-2 text-center space-y-1 bg-white/50 dark:bg-slate-900/50 rounded-lg min-h-[160px]">
          <div class="text-lg">💎</div>
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-200">
            No emerald fluctuations today.
          </p>
          <p class="text-[10px] text-slate-400">
            Balance: <span class="font-bold text-emerald-500 tabular-nums">💎 {{ formatCompactNumber(currentEmeraldBalance) }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- Collapsible Multi-Day History Section -->
    <details class="group rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
      <summary class="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between hover:bg-slate-100/60 dark:hover:bg-slate-800/40 select-none">
        <span class="flex items-center gap-1.5">
          <span>📅</span>
          <span>Multi-Day Historical Trends</span>
          <span class="text-[10px] text-slate-400 font-normal font-mono">({{ activePreset }})</span>
        </span>
        <span class="text-xs text-slate-400 group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div class="p-3 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4">
        <!-- Resource Toggle for Multi-day trend -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <div class="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              class="cursor-pointer px-2.5 py-1 rounded-md transition-all flex items-center gap-1"
              :class="activeResource === 'gold' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
              @click="activeResource = 'gold'"
            >
              <span>🪙</span>
              <span>Gold Trend</span>
            </button>
            <button
              type="button"
              class="cursor-pointer px-2.5 py-1 rounded-md transition-all flex items-center gap-1"
              :class="activeResource === 'emerald' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
              @click="activeResource = 'emerald'"
            >
              <span>💎</span>
              <span>Emerald Trend</span>
            </button>
          </div>

          <!-- Preset and Date filters -->
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <div class="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 text-2xs font-semibold">
              <button
                type="button"
                class="cursor-pointer px-2 py-0.5 rounded transition-all"
                :class="activePreset === '7d' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
                @click="applyPreset('7d')"
              >
                7 Days
              </button>
              <button
                type="button"
                class="cursor-pointer px-2 py-0.5 rounded transition-all"
                :class="activePreset === '14d' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
                @click="applyPreset('14d')"
              >
                14 Days
              </button>
              <button
                type="button"
                class="cursor-pointer px-2 py-0.5 rounded transition-all"
                :class="activePreset === '30d' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
                @click="applyPreset('30d')"
              >
                30 Days
              </button>
            </div>

            <div class="inline-flex items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
              <input
                v-model="fromDate"
                type="date"
                class="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-2xs text-slate-700 dark:text-slate-200"
                @change="onCustomDateChange"
              />
              <span>–</span>
              <input
                v-model="toDate"
                type="date"
                class="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-2xs text-slate-700 dark:text-slate-200"
                @change="onCustomDateChange"
              />
            </div>
          </div>
        </div>

        <!-- Gold Daily Bar Chart -->
        <div v-if="activeResource === 'gold'" class="relative w-full rounded-lg bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 p-2">
          <svg
            class="w-full h-36 overflow-visible select-none"
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

        <!-- Emerald Daily Bar Chart -->
        <div v-else class="relative w-full rounded-lg bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 p-2">
          <svg
            class="w-full h-36 overflow-visible select-none"
            :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
            preserveAspectRatio="none"
          >
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
                +{{ formatCompactNumber(emeraldMaxAbs) }}
              </text>

              <line
                :x1="chartPadding.left"
                :y1="emeraldZeroY"
                :x2="chartWidth - chartPadding.right"
                :y2="emeraldZeroY"
                class="stroke-slate-300 dark:stroke-slate-700"
                stroke-width="1.5"
              />
              <text :x="chartPadding.left - 6" :y="emeraldZeroY + 3" text-anchor="end" class="font-bold">
                0
              </text>

              <line
                :x1="chartPadding.left"
                :y1="chartPadding.top + plotHeight"
                :x2="chartWidth - chartPadding.right"
                :y2="chartPadding.top + plotHeight"
                class="stroke-slate-200 dark:stroke-slate-800"
                stroke-dasharray="3,3"
              />
              <text :x="chartPadding.left - 6" :y="chartPadding.top + plotHeight + 3" text-anchor="end">
                -{{ formatCompactNumber(emeraldMaxAbs) }}
              </text>
            </g>

            <g>
              <g
                v-for="(day, idx) in dailyEmeraldTrend"
                :key="day.date"
                class="cursor-pointer group"
                @mouseenter="hoveredEmeraldDay = day; hoveredEmeraldIndex = idx"
                @mouseleave="hoveredEmeraldDay = null; hoveredEmeraldIndex = null"
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
                  :y="getEmeraldBarY(day)"
                  :width="barWidth"
                  :height="getEmeraldBarHeight(day)"
                  rx="2"
                  class="transition-all duration-150"
                  :class="
                    day.netDelta >= 0
                      ? hoveredEmeraldIndex === idx
                        ? 'fill-emerald-400 dark:fill-emerald-300'
                        : 'fill-emerald-500/80 hover:fill-emerald-400'
                      : hoveredEmeraldIndex === idx
                        ? 'fill-rose-400 dark:fill-rose-300'
                        : 'fill-rose-500/80 hover:fill-rose-400'
                  "
                />

                <text
                  :x="getBarX(idx) + barWidth / 2"
                  :y="chartPadding.top + plotHeight + 14"
                  text-anchor="middle"
                  class="text-[9px] fill-slate-400 font-mono"
                  :class="hoveredEmeraldIndex === idx ? 'font-bold fill-slate-800 dark:fill-slate-100' : ''"
                >
                  {{ formatDayLabel(day.date) }}
                </text>
              </g>
            </g>
          </svg>

          <!-- Hover Tooltip Box -->
          <div
            v-if="hoveredEmeraldDay"
            class="absolute bottom-2 left-2 right-2 sm:right-auto sm:left-14 z-10 p-2.5 rounded-lg bg-slate-900/95 text-white text-2xs shadow-lg border border-slate-700 backdrop-blur-xs pointer-events-none"
          >
            <div class="flex items-center justify-between gap-4 font-bold border-b border-slate-700 pb-1 mb-1.5">
              <span>{{ hoveredEmeraldDay.date }}</span>
              <span :class="hoveredEmeraldDay.netDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                Net: {{ hoveredEmeraldDay.netDelta >= 0 ? '+' : '' }}{{ hoveredEmeraldDay.netDelta.toLocaleString('en-US') }} 💎
              </span>
            </div>
            <div class="space-y-1 text-slate-300">
              <div class="flex items-center justify-between gap-3">
                <span class="text-emerald-400">Total Gained:</span>
                <span class="font-mono text-emerald-300">+{{ hoveredEmeraldDay.totalGain.toLocaleString('en-US') }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-rose-400">Total Spent:</span>
                <span class="font-mono text-rose-300">-{{ hoveredEmeraldDay.totalSpend.toLocaleString('en-US') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>
