<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();

const isRunning = ref(false);

const dungeon = computed(() => cache.value.dungeonStatus?.data || cache.value.dungeonGetInfo?.data);

const floorNumber = computed(() => dungeon.value?.floorNumber ?? 1);
const activityPoints = computed(() => dungeon.value?.dungeonActivity ?? 0);
const cardSummary = computed(() => dungeon.value?.cards || []);

async function toggleDungeonRun() {
  if (isRunning.value) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ kind: 'dungeon-run-stop' });
    }
    isRunning.value = false;
  } else {
    isRunning.value = true;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ kind: 'dungeon-run-start' });
    }
  }
}

async function refreshDungeon() {
  await dispatchRpc([{ name: 'dungeonGetInfo' }]);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Status & Automation Banner -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🏰</span>
          <div>
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Guild Dungeon Automation
            </h3>
            <p class="text-xs text-slate-400">
              Current Floor: <strong class="text-slate-700 dark:text-slate-200 font-mono">{{ floorNumber }}</strong> · Activity Points: <strong class="text-indigo-600 dark:text-indigo-400 font-mono">{{ formatNumber(activityPoints) }}</strong>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
            @click="refreshDungeon"
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            class="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5"
            :class="
              isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            "
            @click="toggleDungeonRun"
          >
            <span>{{ isRunning ? '⏹ Stop Dungeon Run' : '▶ Start Auto Dungeon' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Titan Health & Door Recommendations -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>🚪</span> Floor Doors & Titan Squads
      </h4>

      <div v-if="!dungeon" class="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
        No active dungeon snapshot recorded. Open Dungeon in the game to inspect floors.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">Recommended Door</div>
          <div class="text-slate-500 dark:text-slate-400">
            Automatically picks the safest Titan element matchup or highest reward branch.
          </div>
        </div>

        <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">Titan Protection</div>
          <div class="text-slate-500 dark:text-slate-400">
            Halts automation if any key Titan drops below critical health threshold.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

