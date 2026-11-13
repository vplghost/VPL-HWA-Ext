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
  isUnavailable?: boolean;
}

const isTowerCleared = computed(() => Boolean(
  cache.value?.towerStatus?.data?.isCleared ||
  cache.value?.towerStatus?.data?.state === 'win' ||
  cache.value?.towerStatus?.data?.state === 'completed' ||
  cache.value?.towerSession?.data?.completed ||
  (cache.value as any)?.magicTower_briefInfo?.data?.state === 'win' ||
  (cache.value as any)?.['magicTower_briefInfo']?.state === 'win'
));

function isTowerChestQuest(id: string | number, title?: string): boolean {
  const tid = Number(id);
  if ([365, 10019, 10082, 10083, 10084, 10085, 10107].includes(tid)) return true;
  if (typeof title === 'string' && /tower/i.test(title) && /chest/i.test(title)) return true;
  return false;
}

const quests = computed<QuestItem[]>(() => {
  const list = cache.value.quest_getAll?.data || cache.value.questGetAll?.data || [];
  if (!Array.isArray(list)) return [];
  return list.map((q: any) => {
    const isChest = isTowerChestQuest(q.id, q.name);
    const isUnavailable = Number(q.state) === 1 && isChest && isTowerCleared.value;
    return {
      id: q.id,
      title: q.name || `Quest #${q.id}`,
      progress: Number(q.progress) || 0,
      target: Number(q.target) || 1,
      state: Number(q.state) || 1,
      isUnavailable,
    };
  });
});

const readyQuests = computed(() => quests.value.filter((q) => q.state === 2));
const inProgressQuests = computed(() => quests.value.filter((q) => q.state === 1 && !q.isUnavailable));
const unfulfillableQuests = computed(() => quests.value.filter((q) => q.isUnavailable));

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
            <strong class="text-emerald-600 dark:text-emerald-400 font-semibold">{{ readyQuests.length }} ready to claim</strong> · {{ inProgressQuests.length }} in progress<span v-if="unfulfillableQuests.length > 0"> · {{ unfulfillableQuests.length }} cannot perform</span>
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

    <!-- Cannot Perform / Tower Cleared List -->
    <div v-if="unfulfillableQuests.length > 0" class="space-y-2">
      <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <span>🔒</span> Cannot Perform Today (Tower Cleared) ({{ unfulfillableQuests.length }})
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="q in unfulfillableQuests"
          :key="q.id"
          class="p-3 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 opacity-75 space-y-1.5 text-xs shadow-2xs"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-600 dark:text-slate-400 truncate">{{ q.title }}</span>
            <span class="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              Tower Cleared
            </span>
          </div>
          <div class="text-[11px] text-slate-400 dark:text-slate-500">
            Progress: {{ q.progress }} / {{ q.target }} · No more tower chests available today
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

