<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const isRunning = ref(false);
const towerSettings = ref<any>({ buffPriority: [], heroes: [] });

const session = computed(() => cache.value.towerSession?.data || {});
const status = computed(() => cache.value.towerStatus?.data || {});
const isComplete = computed(() => Boolean(session.value?.completed || status.value?.isCleared || status.value?.state === 'win'));
const floorNumber = computed(() => session.value?.floorNumber || (isComplete.value ? 25 : status.value?.floorNumber) || 1);

const heroEntries = computed(() => {
  return Object.entries(cache.value.heroGetAll?.data || {})
    .map(([id, h]: [string, any]) => {
      const meta = getHeroMetadata(id);
      return {
        id: Number(id),
        name: meta?.name || `Hero #${id}`,
        power: Number(h.power) || 0,
        level: Number(h.level) || 1,
      };
    })
    .sort((a, b) => b.power - a.power);
});

// Selected Tower Team
const selectedHeroIds = ref<number[]>([]);

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['towerAutomationSettings', 'towerRun']);
      if (stored.towerAutomationSettings) {
        towerSettings.value = stored.towerAutomationSettings;
        if (Array.isArray(stored.towerAutomationSettings.heroes) && stored.towerAutomationSettings.heroes.length === 5) {
          selectedHeroIds.value = [...stored.towerAutomationSettings.heroes];
        }
      }
      if (stored.towerRun && !['stopped', 'complete'].includes(stored.towerRun.phase)) {
        isRunning.value = true;
      }
    } catch (_) {}
  }

  // Fallback to top 5 heroes if none selected
  if (selectedHeroIds.value.length === 0 && heroEntries.value.length >= 5) {
    selectedHeroIds.value = heroEntries.value.slice(0, 5).map((h) => h.id);
  }
});

async function saveTowerTeam() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    towerSettings.value.heroes = [...selectedHeroIds.value];
    await chrome.storage.local.set({ towerAutomationSettings: towerSettings.value });
  }
}

function autoFillTop5() {
  selectedHeroIds.value = heroEntries.value.slice(0, 5).map((h) => h.id);
  saveTowerTeam();
}

async function toggleTowerRun() {
  if (isRunning.value) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ kind: 'tower-run-stop' });
    }
    isRunning.value = false;
  } else {
    isRunning.value = true;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        kind: 'tower-run-start',
        team: selectedHeroIds.value,
      });
    }
  }
}

async function refreshTower() {
  await dispatchRpc([{ name: 'towerGetInfo' }]);
}

const buffCategories = [
  { label: 'Physical', ids: [8, 14, 26, 30], color: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800' },
  { label: 'Magic', ids: [9, 15, 27, 33, 45], color: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800' },
  { label: 'Critical', ids: [2, 7, 13, 28, 29], color: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800' },
  { label: 'Vampirism', ids: [11, 16], color: 'bg-pink-100 text-pink-900 border-pink-300 dark:bg-pink-950/60 dark:text-pink-200 dark:border-pink-800' },
  { label: 'Control', ids: [3, 5, 18, 31, 32], color: 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800' },
  { label: 'Health & Energy', ids: [17, 34, 35, 37, 6, 25, 38], color: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800' },
];
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Tower Automation"
    max-width="max-w-3xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Status & Automation Banner -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="text-3xl">🗼</span>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Magic Tower Auto-Climb</h3>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="
                  isComplete
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                "
              >
                {{ isComplete ? 'Completed ✓' : `Floor ${floorNumber} / 25` }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Automates door selection, skull buff purchases, and 1 free chest per chest floor.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            @click="refreshTower"
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            :disabled="isComplete"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            "
            @click="toggleTowerRun"
          >
            <span>{{ isComplete ? 'Tower Cleared' : isRunning ? '⏹ Stop Tower Run' : '▶ Start Auto Tower' }}</span>
          </button>
        </div>
      </section>

      <!-- Tower Team Lineup -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>🦸</span> Magic Tower Combat Team (5 Heroes)
          </h3>
          <button
            type="button"
            class="cursor-pointer text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            @click="autoFillTop5"
          >
            ⚡ Auto-fill Top 5 Power
          </button>
        </div>

        <div class="grid grid-cols-5 gap-2">
          <div
            v-for="(id, idx) in selectedHeroIds"
            :key="idx"
            class="h-14 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-950/30 flex flex-col items-center justify-center p-1 text-center"
          >
            <span class="truncate w-full text-[11px] font-bold text-violet-900 dark:text-violet-200">
              {{ getHeroMetadata(String(id))?.name || `Hero #${id}` }}
            </span>
            <span class="text-[10px] text-slate-400 font-mono">
              {{ formatNumber(heroEntries.find((h) => h.id === id)?.power || 0) }}
            </span>
          </div>
        </div>
      </section>

      <!-- Buff Strategy & Priorities -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>✨</span> Buff Priority & Door Route Strategy
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Routes prioritize doors offering highest-priority buffs. First offered buff matching priority is auto-purchased.
          </p>
        </div>

        <!-- Legend / Category pills -->
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="cat in buffCategories"
            :key="cat.label"
            class="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
            :class="cat.color"
          >
            {{ cat.label }}
          </span>
        </div>

        <!-- Automation Policy Notes -->
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
          <div>• <strong>Chest Policy:</strong> Opens the single free chest per chest floor. Emerald chests are never touched.</div>
          <div>• <strong>Battle Runner:</strong> Automatically completes floor combat and executes buff/chest actions until completion or loss.</div>
        </div>
      </section>
    </div>
  </ModalDialog>
</template>
