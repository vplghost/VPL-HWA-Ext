<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { cache, dispatchRpc } = useRpcCache();

const isRunning = ref(false);

const tower = computed(() => cache.value.towerStatus?.data || cache.value.towerGetInfo?.data);
const isCleared = computed(() => Boolean(
  tower.value?.isCleared ||
  tower.value?.state === 'win' ||
  tower.value?.state === 'completed' ||
  cache.value.towerSession?.data?.completed ||
  (cache.value as any)?.magicTower_briefInfo?.data?.state === 'win' ||
  (cache.value as any)?.['magicTower_briefInfo']?.state === 'win'
));
const floorNumber = computed(() => tower.value?.floorNumber ?? 1);

async function toggleTowerRun() {
  if (isRunning.value) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ kind: 'tower-run-stop' });
    }
    isRunning.value = false;
  } else {
    isRunning.value = true;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ kind: 'tower-run-start' });
    }
  }
}

async function refreshTower() {
  await dispatchRpc([{ name: 'towerGetInfo' }]);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Status & Automation Banner -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🗼</span>
          <div>
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Tower Auto-Climb
            </h3>
            <p class="text-xs text-slate-400">
              Status:
              <strong v-if="isCleared" class="text-emerald-600 dark:text-emerald-400">Cleared Today ✓</strong>
              <strong v-else class="text-indigo-600 dark:text-indigo-400 font-mono">Floor {{ floorNumber }} / 25</strong>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
            @click="refreshTower"
          >
            ↻ Refresh
          </button>

          <!-- Tower Cleared Badge (Hides Start Auto when cleared) -->
          <div
            v-if="isCleared && !isRunning"
            id="tower-tab-cleared-badge"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          >
            <span>✅</span>
            <span>Tower Cleared Today</span>
          </div>

          <button
            v-else
            type="button"
            class="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            "
            @click="toggleTowerRun"
          >
            <span>{{ isRunning ? '⏹ Stop Tower Run' : '▶ Start Auto Tower' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Strategy & Priority -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>⚙️</span> Tower Strategy & Buff Priorities
      </h4>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">Buff Priority Selection</div>
          <div class="text-slate-500 dark:text-slate-400">
            Automatically purchases Armor, Magic Defense, and Physical/Magic Attack boosts with Skull Coins.
          </div>
        </div>

        <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">Chest Opening Policy</div>
          <div class="text-slate-500 dark:text-slate-400">
            Opens the guaranteed 1 free chest per chest floor. Never consumes emeralds.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

