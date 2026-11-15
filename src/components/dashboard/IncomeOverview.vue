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
  type DayIncomeSummary,
} from '@/src/utils/resourceIncome';

const { cache } = useRpcCache();

// Active resource view tab: 'gold' | 'emerald'
const activeResource = ref<'gold' | 'emerald'>('gold');

// Date range selection state
const defaultRange = getDefaultPrevious7DaysRange();
const fromDate = ref(defaultRange.fromDate);
const toDate = ref(defaultRange.toDate);
const activePreset = ref<'7d' | '14d' | '30d' | 'custom'>('7d');

// Hovered bar state for chart tooltip
const hoveredDay = ref<DayIncomeSummary | null>(null);
const hoveredIndex = ref<number | null>(null);

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

// Today's summary
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
      const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
      return {
        key: sourceKey,
        label: meta.label,
        icon: meta.icon,
        amount,
        percent,
      };
    })
    .sort((a, b) => b.amount - a.amount);
});

// Daily trend dataset based on selected date range
const dailyTrend = computed(() => {
  return getDailyIncomeTrend(cache?.value || {}, {
    fromDate: fromDate.value,
    toDate: toDate.value,
  });
});

// Chart calculations
const chartMax = computed(() => {
  const max = Math.max(
    ...dailyTrend.value.map((d) => (activeResource.value === 'gold' ? d.gold : d.emerald)),
    0
  );
  return max > 0 ? max : 1000;
});

const chartWidth = 500;
const chartHeight = 130;
const chartPadding = { top: 15, bottom: 25, left: 45, right: 15 };
const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

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

function getBarHeight(day: DayIncomeSummary): number {
  const val = activeResource.value === 'gold' ? day.gold : day.emerald;
  if (val <= 0) return 2; // subtle sliver to show day exists
  return Math.max(2, (val / chartMax.value) * plotHeight);
}

function getBarY(day: DayIncomeSummary): number {
  return chartPadding.top + plotHeight - getBarHeight(day);
}

function formatDayLabel(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return '';
  return dateStr.slice(5).replace('-', '/'); // "MM/DD"
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-4 shadow-2xs">
    <!-- Header with Resource View Switcher -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
      <div class="flex items-center gap-2">
        <span class="text-lg">📈</span>
        <div>
          <h3 class="font-bold text-xs text-slate-800 dark:text-slate-100">Income Analytics</h3>
          <p class="text-[10px] text-slate-400">Track daily resource earnings and source distributions</p>
        </div>
      </div>

      <!-- Resource Switcher (Gold vs Emeralds) -->
      <div class="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
        <button
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-md transition-all flex items-center gap-1"
          :class="
            activeResource === 'gold'
              ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="activeResource = 'gold'"
        >
          <span>🪙</span>
          <span>Gold</span>
        </button>
        <button
          type="button"
          class="cursor-pointer px-2.5 py-1 rounded-md transition-all flex items-center gap-1"
          :class="
            activeResource === 'emerald'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="activeResource = 'emerald'"
        >
          <span>💎</span>
          <span>Emeralds</span>
        </button>
      </div>
    </div>

    <!-- Section 1: Today's Income Card -->
    <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Today's {{ activeResource === 'gold' ? 'Gold' : 'Emerald' }} Income</span>
          <span class="text-[10px] text-slate-400 font-mono">({{ todaySummary.date }})</span>
        </div>
        <div class="text-sm font-extrabold tabular-nums" :class="activeResource === 'gold' ? 'text-amber-500' : 'text-emerald-500'">
          +{{ formatCompactNumber(todayTotal) }}
          <span class="text-xs font-semibold text-slate-400 ml-0.5">
            ({{ todayTotal.toLocaleString('en-US') }})
          </span>
        </div>
      </div>

      <!-- Breakdown by Source List -->
      <div v-if="todayBreakdown.length > 0" class="space-y-1.5 mt-2">
        <div
          v-for="item in todayBreakdown"
          :key="item.key"
          class="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-sm shrink-0">{{ item.icon }}</span>
            <span class="font-medium text-slate-700 dark:text-slate-300 truncate">{{ item.label }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden hidden sm:block">
              <div
                class="h-full rounded-full transition-all"
                :class="activeResource === 'gold' ? 'bg-amber-500' : 'bg-emerald-500'"
                :style="{ width: `${item.percent}%` }"
              ></div>
            </div>
            <span class="text-[10px] text-slate-400 w-8 text-right tabular-nums">{{ item.percent }}%</span>
            <span class="font-bold tabular-nums" :class="activeResource === 'gold' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">
              +{{ formatCompactNumber(item.amount) }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-2 text-xs text-slate-400">
        No {{ activeResource === 'gold' ? 'gold' : 'emerald' }} recorded for today yet.
      </div>
    </div>

    <!-- Section 2: Daily Income Trend Chart (Default: Previous 7 Days, Excludes Today) -->
    <div class="space-y-2">
      <!-- Chart Controls Bar -->
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-1">
          <span class="font-bold text-slate-700 dark:text-slate-200">Daily Trend</span>
          <span class="text-[10px] text-slate-400">(Excludes today)</span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <!-- Preset Range Buttons -->
          <div class="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 text-2xs font-semibold">
            <button
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded transition-all"
              :class="activePreset === '7d' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
              @click="applyPreset('7d')"
            >
              Last 7 Days
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

          <!-- Date Inputs -->
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

      <!-- SVG Chart Container -->
      <div class="relative w-full rounded-lg bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 p-2">
        <svg
          class="w-full h-36 overflow-visible select-none"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          preserveAspectRatio="none"
        >
          <!-- Grid Lines and Y-Axis Ticks -->
          <g class="text-[9px] fill-slate-400 font-mono">
            <!-- Top tick -->
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

            <!-- Mid tick -->
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

            <!-- Base tick (0) -->
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
              <!-- Transparent Hover Hitbox -->
              <rect
                :x="getBarX(idx) - 2"
                :y="chartPadding.top"
                :width="barWidth + 4"
                :height="plotHeight"
                fill="transparent"
              />

              <!-- Actual Value Bar -->
              <rect
                :x="getBarX(idx)"
                :y="getBarY(day)"
                :width="barWidth"
                :height="getBarHeight(day)"
                rx="3"
                class="transition-all duration-150"
                :class="
                  activeResource === 'gold'
                    ? hoveredIndex === idx
                      ? 'fill-amber-400 dark:fill-amber-300'
                      : 'fill-amber-500/80 hover:fill-amber-400'
                    : hoveredIndex === idx
                      ? 'fill-emerald-400 dark:fill-emerald-300'
                      : 'fill-emerald-500/80 hover:fill-emerald-400'
                "
              />

              <!-- X-Axis Date Label -->
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
            <span :class="activeResource === 'gold' ? 'text-amber-400' : 'text-emerald-400'">
              +{{ (activeResource === 'gold' ? hoveredDay.gold : hoveredDay.emerald).toLocaleString('en-US') }} {{ activeResource === 'gold' ? 'Gold' : 'Emeralds' }}
            </span>
          </div>
          <!-- Sources list in tooltip -->
          <div class="space-y-0.5">
            <div
              v-for="(amt, srcKey) in (activeResource === 'gold' ? hoveredDay.goldBySource : hoveredDay.emeraldBySource)"
              :key="srcKey"
              class="flex items-center justify-between gap-3 text-slate-300"
            >
              <span>{{ INCOME_SOURCES[srcKey]?.label || srcKey }}:</span>
              <span class="font-mono text-slate-100">+{{ Number(amt).toLocaleString('en-US') }}</span>
            </div>
            <div
              v-if="Object.keys(activeResource === 'gold' ? hoveredDay.goldBySource : hoveredDay.emeraldBySource).length === 0"
              class="text-slate-400 italic"
            >
              No earnings on this date.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
