<script setup lang="ts">
import { computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useTheme } from '@/src/composables/useTheme';
import { formatDuration } from '@/src/utils/formatters';

const { cache, rpcQueueCount } = useRpcCache();
const { theme, applyTheme } = useTheme();

const accountName = computed(() => {
  return (
    cache.value.accountStatus?.data?.name ||
    cache.value.user_getUnitSummary?.data?.name ||
    'Player'
  );
});

function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}
</script>

<template>
  <header class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 shadow-xs transition-colors">
    <div class="flex items-center justify-between gap-3">
      <!-- Title & Account -->
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-xl">⚔️</span>
        <h1 class="truncate text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          HWA Helper
        </h1>
        <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
          v0.9.244
        </span>
        <span
          class="max-w-36 truncate text-xs font-semibold text-slate-600 dark:text-slate-300"
          :title="`Account: ${accountName}`"
        >
          {{ accountName }}
        </span>
      </div>

      <!-- Quick Status Badges -->
      <div class="flex items-center gap-2 text-xs">
        <!-- RPC Queue Badge -->
        <span
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60"
          title="RPC calls queued for game synchronization"
        >
          <span>RPC:</span>
          <span class="tabular-nums font-bold text-indigo-600 dark:text-indigo-400">{{ rpcQueueCount }}</span>
        </span>

        <!-- Theme Toggle -->
        <button
          type="button"
          class="cursor-pointer inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
          @click="toggleTheme"
        >
          <span v-if="theme === 'dark'">☀️</span>
          <span v-else>🌙</span>
        </button>
      </div>
    </div>
  </header>
</template>

