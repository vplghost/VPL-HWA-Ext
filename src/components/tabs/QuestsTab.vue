<script setup lang="ts">
import { computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { cache, dispatchRpc } = useRpcCache();

interface QuestItem {
  id: string | number;
  title: string;
  progress: number;
  target: number;
  state: number; // 1: in progress, 2: ready to claim, 3: claimed
}

const quests = computed<QuestItem[]>(() => {
  const list = cache.value.quest_getAll?.data || cache.value.questGetAll?.data || [];
  if (!Array.isArray(list)) return [];
  return list.map((q: any) => ({
    id: q.id,
    title: q.name || `Quest #${q.id}`,
    progress: Number(q.progress) || 0,
    target: Number(q.target) || 1,
    state: Number(q.state) || 1,
  }));
});

const readyQuests = computed(() => quests.value.filter((q) => q.state === 2));
const inProgressQuests = computed(() => quests.value.filter((q) => q.state === 1));

async function claimQuest(questId: string | number) {
  await dispatchRpc([
    { name: 'quest_claim', args: { questId }, feature: 'quest' },
    { name: 'quest_getAll', feature: 'quest' },
  ]);
}

async function claimAll() {
  const calls = readyQuests.value.map((q) => ({
    name: 'quest_claim',
    args: { questId: q.id },
    feature: 'quest',
  }));
  calls.push({ name: 'quest_getAll', feature: 'quest' });
  await dispatchRpc(calls);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header Summary -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between shadow-2xs">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl">📜</span>
        <div>
          <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
            Daily & Event Quests
          </h3>
          <p class="text-xs text-slate-400">
            <strong class="text-emerald-600 dark:text-emerald-400 font-semibold">{{ readyQuests.length }} ready to claim</strong> · {{ inProgressQuests.length }} in progress
          </p>
        </div>
      </div>

      <button
        v-if="readyQuests.length > 0"
        type="button"
        class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-2xs transition-all"
        @click="claimAll"
      >
        Claim All ({{ readyQuests.length }})
      </button>
    </div>

    <!-- Ready to Claim List -->
    <div v-if="readyQuests.length > 0" class="space-y-2">
      <h4 class="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
        <span>✓</span> Ready to Claim
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="q in readyQuests"
          :key="q.id"
          class="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between text-xs"
        >
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-100">{{ q.title }}</div>
            <div class="text-[10px] text-emerald-600 dark:text-emerald-400">Completed</div>
          </div>
          <button
            type="button"
            class="cursor-pointer px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            @click="claimQuest(q.id)"
          >
            Claim
          </button>
        </div>
      </div>
    </div>

    <!-- In Progress List -->
    <div class="space-y-2">
      <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400">
        In Progress ({{ inProgressQuests.length }})
      </h4>
      <div v-if="inProgressQuests.length === 0" class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        No active quests in progress.
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="q in inProgressQuests"
          :key="q.id"
          class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1.5 text-xs shadow-2xs"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-800 dark:text-slate-200 truncate">{{ q.title }}</span>
            <span class="text-slate-400 font-mono text-[11px]">{{ q.progress }} / {{ q.target }}</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full bg-indigo-500 transition-all duration-300"
              :style="{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

