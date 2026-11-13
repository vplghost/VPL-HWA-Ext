<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { questRefreshCalls, sendQuestClaim } from '@/src/utils/dialogRpc';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { normalizeArray } from '@/src/utils/troops';

const props = defineProps<{
  modelValue: boolean;
  initialFilter?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const currentFilter = ref<'all' | 'daily' | 'event' | 'ready'>('all');
const searchQuery = ref('');
const isRefreshing = ref(false);
const isClaiming = ref(false);
const claimMessage = ref('');

watch(
  () => props.initialFilter,
  (val) => {
    if (val === 'daily' || val === 'event' || val === 'ready') {
      currentFilter.value = val;
    } else {
      currentFilter.value = 'all';
    }
  },
  { immediate: true }
);

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

interface QuestCardItem {
  id: string | number;
  category: 'daily' | 'event' | 'story';
  categoryLabel: string;
  eventName?: string;
  title: string;
  subtitle: string;
  tierInfo?: string;
  progress: number;
  reward: any;
  state: 'ready' | 'inProgress' | 'done' | 'cannotPerform';
  isUnavailable?: boolean;
}

function isTowerChestQuest(id: string | number, title?: string): boolean {
  const tid = Number(id);
  if ([365, 10019, 10082, 10083, 10084, 10085, 10107].includes(tid)) return true;
  if (typeof title === 'string' && /tower/i.test(title) && /chest/i.test(title)) return true;
  return false;
}

function parseRewardText(reward: any): string {
  if (!reward || typeof reward !== 'object') return '—';
  const parts: string[] = [];
  for (const [kind, value] of Object.entries(reward)) {
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
      const labelMap: Record<string, string> = {
        gold: 'Gold',
        starmoney: 'Emeralds',
        experience: 'XP',
        stamina: 'Energy',
        drafts_chip: 'Draft Chips',
      };
      const label = labelMap[kind] || kind;
      parts.push(`${Number(value).toLocaleString()} ${label}`);
    } else if (value && typeof value === 'object') {
      for (const [id, amount] of Object.entries(value)) {
        const itemLabel = (globalThis as any).hwaHelperNameMap?.item?.(kind, id) || `${kind} #${id}`;
        parts.push(`${Number(amount).toLocaleString()} × ${itemLabel}`);
      }
    }
  }
  return parts.join(', ') || '—';
}

const allItems = computed<QuestCardItem[]>(() => {
  const c = cache.value;
  const questData = (globalThis as any).hwaHelperQuestData;
  const items: QuestCardItem[] = [];
  const seenIds = new Set<string>();

  const nextResetTime = questData?.nextReset?.(c, Date.now());
  const resetText = nextResetTime
    ? `Resets ${new Date(nextResetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Daily reset';

  const isTowerCleared = Boolean(
    c?.towerStatus?.data?.isCleared ||
    c?.towerStatus?.data?.state === 'win' ||
    c?.towerStatus?.data?.state === 'completed' ||
    c?.towerSession?.data?.completed ||
    c?.magicTower_briefInfo?.data?.state === 'win' ||
    c?.['magicTower_briefInfo']?.state === 'win'
  );

  const rawQAll = c?.questGetAll?.data ?? c?.quest_getAll?.data;
  const qAll = normalizeArray(rawQAll);

  const qAllMap = new Map<string, any>();
  for (const q of qAll) {
    if (q && q.id != null) qAllMap.set(String(q.id), q);
  }

  // 1. Daily Quests
  const dailyList = normalizeArray(questData?.dailyQuests?.(c, Date.now()));
  for (const dq of dailyList) {
    if (!dq || dq.id == null) continue;
    const qIdStr = String(dq.id);
    seenIds.add(qIdStr);
    const qAllEntry = qAllMap.get(qIdStr);

    const title = questData?.dailyTitle?.(dq) || qAllEntry?.name || `Daily Quest #${dq.id}`;
    const reward = qAllEntry?.reward || dq.reward || null;
    const progress = Number(qAllEntry?.progress ?? dq.progress) || 0;

    const isReady = qAllEntry?.state === 2 || dq.state === 2;
    const isDone = dq.state === 'completed' || dq.state === 3 || qAllEntry?.state === 3;
    const isTowerChest = isTowerChestQuest(dq.id, title);
    const isUnavailable = !isReady && !isDone && isTowerChest && isTowerCleared;
    const state = isReady ? 'ready' : isDone ? 'done' : isUnavailable ? 'cannotPerform' : 'inProgress';

    items.push({
      id: dq.id,
      category: 'daily',
      categoryLabel: 'Daily Quest',
      title,
      state,
      isUnavailable,
      progress,
      reward,
      subtitle: isUnavailable ? '🔒 Tower cleared today • Cannot perform' : resetText,
    });
  }

  // 2. Visible Event Quests
  const events = normalizeArray(questData?.visibleEvents?.(c, Date.now()));
  for (const ev of events) {
    const evTitle = questData?.title?.(ev) || `Event #${ev.id}`;
    const evEndText = ev.end
      ? `Ends ${new Date(ev.end).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : '';

    for (const group of normalizeArray(ev.groups)) {
      const groupQuests = Array.isArray(group.quests) ? group.quests : [];
      if (groupQuests.length === 0) continue;

      const activeQ = groupQuests.find((q: any) => q.state === 'inProgress' || q.state === 2);
      const completedCount = groupQuests.filter((q: any) => q.state === 'completed' || q.state === 3).length;
      const currentQ = activeQ || groupQuests[groupQuests.length - 1];

      const qIdStr = String(currentQ.id);
      seenIds.add(qIdStr);
      const qAllEntry = qAllMap.get(qIdStr);

      const repeatLabel = group.repeatType === 'daily' ? 'Event Daily' : 'Event Chain';
      const questLocMap = (globalThis as any).hwaHelperPopupData?.questLocaleMap || {};
      const groupTitle = questData?.groupTitle
        ? questData.groupTitle(group.localeKey)
        : group.localeKey
        ? questLocMap[group.localeKey]?.title ||
          group.localeKey
            .replace(/^(LIB_SPECIAL_QUEST_EVENT_|LIB_SEASONAL_EVENT_NAME_|QUEST_TAB_|UI_)/, '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Special Quest';

      const isReady = currentQ.state === 2 || qAllEntry?.state === 2;
      const isDone = !activeQ && completedCount === groupQuests.length;
      const isTowerChest = isTowerChestQuest(currentQ.id, groupTitle);
      const isUnavailable = !isReady && !isDone && isTowerChest && isTowerCleared;
      const state = isReady ? 'ready' : isDone ? 'done' : isUnavailable ? 'cannotPerform' : 'inProgress';

      const tierText = `Tier ${completedCount + (activeQ ? 1 : 0)} of ${groupQuests.length}`;
      const progress = Number(currentQ.progress ?? qAllEntry?.progress) || 0;
      const reward = currentQ.reward || qAllEntry?.reward || null;

      items.push({
        id: currentQ.id,
        category: 'event',
        categoryLabel: repeatLabel,
        eventName: evTitle,
        title: groupTitle,
        tierInfo: tierText,
        state,
        isUnavailable,
        progress,
        reward,
        subtitle: isUnavailable
          ? '🔒 Tower cleared today • Cannot perform'
          : `${evTitle}${evEndText ? ' · ' + evEndText : ''}`,
      });
    }
  }

  // 3. Fallback / QuestGetAll
  for (const q of qAll) {
    if (!q || q.id == null || seenIds.has(String(q.id))) continue;
    if (q.state === 3) continue;

    const isReady = q.state === 2;
    const recognizedDaily = questData?.dailyTitles?.[q.id];
    const recognizedTemplate = questData?.questTemplateTitle?.(q.id);
    const hasKnownName = Boolean(q.name || recognizedDaily || recognizedTemplate);

    if (!isReady && !hasKnownName) continue;

    const title = q.name || recognizedDaily || recognizedTemplate || (isReady ? `Claimable Reward #${q.id}` : `Quest #${q.id}`);
    const isTowerChest = isTowerChestQuest(q.id, title);
    const isUnavailable = !isReady && isTowerChest && isTowerCleared;
    const category = recognizedDaily || recognizedTemplate ? 'daily' : 'story';
    const categoryLabel = isReady ? 'Claimable Reward' : (recognizedDaily || recognizedTemplate ? 'Daily Quest' : 'Quest');
    const state = isReady ? 'ready' : isUnavailable ? 'cannotPerform' : 'inProgress';

    items.push({
      id: q.id,
      category,
      categoryLabel,
      title,
      state,
      isUnavailable,
      progress: Number(q.progress) || 0,
      reward: q.reward || null,
      subtitle: isUnavailable
        ? '🔒 Tower cleared today • Cannot perform'
        : isReady
        ? '🎁 Reward ready to claim in game'
        : (recognizedDaily || recognizedTemplate ? 'Daily Task' : 'General Quest'),
    });
  }

  return items;
});

const readyCount = computed(() => allItems.value.filter((i) => i.state === 'ready').length);
const inProgressCount = computed(() => allItems.value.filter((i) => i.state === 'inProgress').length);
const dailyCount = computed(() => allItems.value.filter((i) => i.category === 'daily').length);
const eventCount = computed(() => allItems.value.filter((i) => i.category === 'event').length);

const filteredQuests = computed(() => {
  let list = allItems.value;
  if (currentFilter.value === 'daily') list = list.filter((i) => i.category === 'daily');
  else if (currentFilter.value === 'event') list = list.filter((i) => i.category === 'event');
  else if (currentFilter.value === 'ready') list = list.filter((i) => i.state === 'ready');

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      (i.eventName && i.eventName.toLowerCase().includes(q)) ||
      (i.categoryLabel && i.categoryLabel.toLowerCase().includes(q)) ||
      String(i.id).includes(q)
    );
  }

  const statePriority: Record<string, number> = { ready: 0, inProgress: 1, done: 2, cannotPerform: 3 };
  return [...normalizeArray(list)].sort((a, b) => (statePriority[a.state] ?? 9) - (statePriority[b.state] ?? 9));
});

async function refreshQuests() {
  isRefreshing.value = true;
  try {
    await dispatchRpc(questRefreshCalls());
  } finally {
    setTimeout(() => {
      isRefreshing.value = false;
    }, 600);
  }
}

function exportCatalog() {
  try {
    const questData = (globalThis as any).hwaHelperQuestData;
    const json = questData?.exportCatalogJson?.() || JSON.stringify(allItems.value, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quest-catalog.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {}
}

async function claimQuest(qId: string | number) {
  if (isClaiming.value) return;
  isClaiming.value = true;
  try {
    const result = await sendQuestClaim(qId);
    claimMessage.value = result.ok
      ? result.queued ? 'Reward claim queued for the next game RPC.' : 'Reward claim sent. Waiting for game sync.'
      : result.error || 'Reward claim failed.';
  } finally { isClaiming.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="quest-detail-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-detail-dialog-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="close"
    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Dialog Header -->
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0" aria-hidden="true">📜</span>
            <h2 id="quest-detail-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
              Quest Details
            </h2>
            <div id="quest-detail-dialog-status" class="flex items-center gap-2 truncate">
              <span
                v-if="readyCount > 0"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50"
              >
                🎁 {{ readyCount }} Ready to Claim
              </span>
              <span class="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                {{ inProgressCount }} in progress · {{ allItems.length }} total
              </span>
            </div>
          </div>

          <button
            type="button"
            class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close Quest Details dialog"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Dialog Body -->
        <div id="quest-detail-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)] text-xs">
          <p v-if="claimMessage" role="status" class="text-xs text-slate-600 dark:text-slate-300">{{ claimMessage }}</p>
          <!-- Toolbar -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
            <!-- Filter Tabs -->
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  currentFilter === 'all'
                    ? 'bg-violet-600 text-white dark:bg-violet-600 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                "
                @click="currentFilter = 'all'"
              >
                All ({{ allItems.length }})
              </button>

              <button
                type="button"
                class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  currentFilter === 'daily'
                    ? 'bg-violet-600 text-white dark:bg-violet-600 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                "
                @click="currentFilter = 'daily'"
              >
                Daily ({{ dailyCount }})
              </button>

              <button
                type="button"
                class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  currentFilter === 'event'
                    ? 'bg-violet-600 text-white dark:bg-violet-600 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                "
                @click="currentFilter = 'event'"
              >
                Event ({{ eventCount }})
              </button>

              <button
                type="button"
                class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                :class="
                  currentFilter === 'ready'
                    ? 'bg-violet-600 text-white dark:bg-violet-600 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                "
                @click="currentFilter = 'ready'"
              >
                Ready ({{ readyCount }})
              </button>
            </div>

            <!-- Search & Action buttons -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <input
                id="quest-detail-search"
                v-model="searchQuery"
                type="text"
                placeholder="Search quests..."
                class="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 w-full sm:w-44"
              />

              <button
                id="quest-detail-refresh"
                type="button"
                title="Refresh quests from game server (RPC)"
                class="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0 disabled:opacity-50"
                :disabled="isRefreshing"
                @click="refreshQuests"
              >
                <span>{{ isRefreshing ? '⏳' : '🔄' }}</span>
                <span>{{ isRefreshing ? 'Updating...' : 'Refresh' }}</span>
              </button>

              <button
                id="quest-detail-export"
                type="button"
                title="Export quest definitions JSON file"
                class="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                @click="exportCatalog"
              >
                <span>📥</span>
                <span>Export JSON</span>
              </button>
            </div>
          </div>

          <!-- Cards Container -->
          <div id="quest-cards-container">
            <div
              v-if="filteredQuests.length === 0"
              class="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500"
            >
              {{ searchQuery ? 'No quests match your search query.' : 'No quests found for the selected filter.' }}
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div
                v-for="item in filteredQuests"
                :key="item.id"
                class="flex flex-col justify-between rounded-xl border p-3 shadow-2xs transition-all"
                :class="
                  item.state === 'ready'
                    ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                    : item.state === 'inProgress'
                    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/80'
                    : 'border-slate-200/60 bg-slate-50/50 opacity-70 dark:border-slate-800/50 dark:bg-slate-900/40'
                "
              >
                <!-- Card Header -->
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span
                        class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        :class="
                          item.category === 'daily'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/50'
                            : item.category === 'event'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 dark:border dark:border-violet-800/50'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        "
                      >
                        {{ item.categoryLabel }}
                      </span>
                      <span class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {{ item.subtitle }}
                      </span>
                    </div>

                    <h4 class="mt-1 font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug">
                      {{ item.title }}
                    </h4>
                  </div>

                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    :class="
                      item.state === 'ready'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50'
                        : item.state === 'done'
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        : item.state === 'cannotPerform'
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50'
                    "
                  >
                    {{ item.state === 'ready' ? 'Ready to Claim' : item.state === 'done' ? 'Completed' : item.state === 'cannotPerform' ? 'Cannot Perform' : 'In Progress' }}
                  </span>
                </div>

                <!-- Card Middle: Progress & Tier -->
                <div
                  v-if="item.tierInfo || item.progress > 0"
                  class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/40 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 font-medium"
                >
                  <span v-if="item.tierInfo">{{ item.tierInfo }}</span>
                  <span v-if="item.progress > 0">Progress: {{ item.progress.toLocaleString() }}</span>
                </div>

                <!-- Card Footer: Rewards & Claim -->
                <div
                  v-if="item.reward"
                  class="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/40 flex items-center justify-between gap-2"
                >
                  <div class="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <span class="shrink-0" aria-hidden="true">🎁</span>
                    <span class="truncate">{{ parseRewardText(item.reward) }}</span>
                  </div>

                  <button
                    v-if="item.state === 'ready'"
                    type="button"
                    class="cursor-pointer px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-2xs transition-colors shrink-0"
                    :disabled="isClaiming"
                    @click="claimQuest(item.id)"
                  >
                    Claim
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
