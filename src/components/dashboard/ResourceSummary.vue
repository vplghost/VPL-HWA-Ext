<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatResourceAmount, getAmountAt, getNextRefillSeconds } from '@/src/utils/resourceData';
import { formatDuration } from '@/src/utils/formatters';

const { cache } = useRpcCache();
const now = ref(Date.now());
let timer: any = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const energyEntry = computed(() => cache.value['resource:energy']);
const worldEnergyEntry = computed(() => cache.value['resource:world-energy']);
const goldEntry = computed(() => cache.value['resource:gold']);
const starMoneyEntry = computed(() => cache.value['resource:starMoney'] || cache.value['resource:diamond']);

const energyVal = computed(() => getAmountAt(energyEntry.value, now.value) ?? cache.value.energyStatus?.data?.energy ?? 0);
const energyCap = computed(() => energyEntry.value?.data?.cap ?? 0);
const energyRefillSec = computed(() => getNextRefillSeconds(energyEntry.value, now.value));

const worldEnergyVal = computed(() => getAmountAt(worldEnergyEntry.value, now.value) ?? cache.value.worldEnergyStatus?.data?.energy ?? 0);
const worldEnergyCap = computed(() => worldEnergyEntry.value?.data?.cap ?? 200);
const worldEnergyRefillSec = computed(() => getNextRefillSeconds(worldEnergyEntry.value, now.value));

const goldVal = computed(
  () =>
    goldEntry.value?.data?.amount ??
    cache.value.userGetInfo?.data?.user?.gold ??
    cache.value.userGetInfo?.data?.gold ??
    0
);
const diamondVal = computed(
  () =>
    starMoneyEntry.value?.data?.amount ??
    cache.value.userGetInfo?.data?.user?.starMoney ??
    cache.value.userGetInfo?.data?.starMoney ??
    0
);

// Basic resources: 5 = Food, 4 = Wood, 3 = Stone, 2 = Iron
const foodVal = computed(
  () =>
    cache.value['resource:material:5']?.data?.amount ??
    cache.value.inventoryGet?.data?.material?.['5'] ??
    cache.value['resource:food']?.data?.amount ??
    0
);
const woodVal = computed(
  () =>
    cache.value['resource:material:4']?.data?.amount ??
    cache.value.inventoryGet?.data?.material?.['4'] ??
    cache.value['resource:wood']?.data?.amount ??
    0
);
const stoneVal = computed(
  () =>
    cache.value['resource:material:3']?.data?.amount ??
    cache.value.inventoryGet?.data?.material?.['3'] ??
    cache.value['resource:stone']?.data?.amount ??
    0
);
const ironVal = computed(
  () =>
    cache.value['resource:material:2']?.data?.amount ??
    cache.value.inventoryGet?.data?.material?.['2'] ??
    cache.value['resource:iron']?.data?.amount ??
    0
);
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
    <!-- Gold Card -->
    <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs flex items-center justify-between">
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Gold</div>
        <div class="text-sm font-bold text-amber-500 tabular-nums">
          {{ formatResourceAmount(goldVal) }}
        </div>
      </div>
      <span class="text-xl">🪙</span>
    </div>

    <!-- Emeralds Card -->
    <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs flex items-center justify-between">
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold">Emeralds</div>
        <div class="text-sm font-bold text-emerald-500 tabular-nums">
          {{ formatResourceAmount(diamondVal) }}
        </div>
      </div>
      <span class="text-xl">💎</span>
    </div>

    <!-- Energy Card -->
    <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs flex items-center justify-between">
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
          <span>Energy</span>
          <span v-if="energyRefillSec" class="text-[9px] font-mono text-amber-600 dark:text-amber-400">
            +1 in {{ formatDuration(energyRefillSec) }}
          </span>
        </div>
        <div class="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
          {{ energyVal }} <span class="text-slate-400 text-xs font-normal">/ {{ energyCap }}</span>
        </div>
      </div>
      <span class="text-xl">⚡</span>
    </div>

    <!-- World Energy Card -->
    <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs flex items-center justify-between">
      <div>
        <div class="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
          <span>World Energy</span>
          <span v-if="worldEnergyRefillSec" class="text-[9px] font-mono text-sky-600 dark:text-sky-400">
            +1 in {{ formatDuration(worldEnergyRefillSec) }}
          </span>
        </div>
        <div class="text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums">
          {{ worldEnergyVal }} <span class="text-slate-400 text-xs font-normal">/ {{ worldEnergyCap }}</span>
        </div>
      </div>
      <span class="text-xl">🌐</span>
    </div>
  </div>

  <!-- City Resources Bar -->
  <div class="grid grid-cols-4 gap-2 text-center text-xs p-1.5 rounded-lg bg-slate-100/70 dark:bg-slate-900/40">
    <div class="flex items-center justify-center gap-1">
      <span>🌾</span>
      <span class="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Food:</span>
      <span class="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{{ formatResourceAmount(foodVal) }}</span>
    </div>
    <div class="flex items-center justify-center gap-1">
      <span>🪵</span>
      <span class="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Wood:</span>
      <span class="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{{ formatResourceAmount(woodVal) }}</span>
    </div>
    <div class="flex items-center justify-center gap-1">
      <span>🪨</span>
      <span class="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Stone:</span>
      <span class="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{{ formatResourceAmount(stoneVal) }}</span>
    </div>
    <div class="flex items-center justify-center gap-1">
      <span>⚙️</span>
      <span class="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Iron:</span>
      <span class="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{{ formatResourceAmount(ironVal) }}</span>
    </div>
  </div>
</template>

