<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useTroopTraining } from '@/src/composables/useTroopTraining';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { troopStats, isRefreshing, refreshTroops } = useTroopTraining();

const mobLevel = ref(1);
const mobCount = ref(2);
const isRunning = ref(false);
const queueStatusText = ref('Idle');

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['monsterPreferences', 'monsterQueue']);
      if (stored.monsterPreferences) {
        if (stored.monsterPreferences.mobLevel) mobLevel.value = stored.monsterPreferences.mobLevel;
      }
      if (stored.monsterQueue) {
        isRunning.value = stored.monsterQueue.running || false;
        queueStatusText.value = stored.monsterQueue.phase || 'Idle';
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.monsterQueue) {
        const q = changes.monsterQueue.newValue;
        isRunning.value = q?.running || false;
        queueStatusText.value = q?.phase || 'Idle';
      }
    });
  }
});

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

async function savePreferences() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      monsterPreferences: {
        mobLevel: mobLevel.value,
      },
    });
  }
}

async function startMonsterQueue() {
  isRunning.value = true;
  queueStatusText.value = 'Searching...';
  await savePreferences();
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'monster-queue-start',
      options: {
        level: mobLevel.value,
        count: mobCount.value,
      },
    });
  }
}

async function stopMonsterQueue() {
  isRunning.value = false;
  queueStatusText.value = 'Stopped';
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'monster-queue-stop' });
  }
}

const totalReadyTroops = computed(() => {
  return troopStats.value.reduce((sum, t) => sum + (t.readyCount || 0), 0);
});
</script>

<template>
  <div
    v-if="modelValue"
    id="monster-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="monster-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    @click.self="close"
  >
    <div
      class="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-amber-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-amber-900/50 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        id="monster-dialog-header"
        class="sticky top-0 z-10 flex items-center justify-between border-b border-amber-200 bg-amber-50/80 px-4 py-3 backdrop-blur dark:border-amber-900/60 dark:bg-amber-950/50 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span id="monster-dialog-icon" class="text-xl shrink-0" aria-hidden="true">👾</span>
          <h2 id="monster-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Monster attack
          </h2>
          <div id="monster-dialog-status" class="flex items-center gap-2 truncate">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
              :class="
                isRunning
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              "
            >
              <span class="size-1.5 rounded-full" :class="isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"></span>
              {{ queueStatusText }}
            </span>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close Monster dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="monster-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Section 1: Troop Allocation Overview -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-2.5">
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span class="font-semibold">
              Available Forces: <strong class="text-slate-800 dark:text-slate-200">{{ formatNumber(totalReadyTroops) }}</strong> ready troops
            </span>
            <button
              type="button"
              :disabled="isRefreshing"
              class="cursor-pointer text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 text-xs"
              title="Refresh available troops"
              @click="refreshTroops"
            >
              <span :class="{ 'inline-block animate-spin': isRefreshing }">↻</span>
              <span>Refresh troops</span>
            </button>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            <div
              v-for="t in troopStats"
              :key="t.type"
              class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
            >
              <div class="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span>{{ t.icon }}</span> <span>{{ t.label }}</span>
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5">
                Ready: <strong class="text-emerald-600 dark:text-emerald-400">{{ formatNumber(t.readyCount) }}</strong>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 2: Attack Parameters -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>⚙️</span> Monster Parameters
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Monster Level (1-30) -->
            <div>
              <label for="monster-mob-level" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Monster Level
              </label>
              <select
                id="monster-mob-level"
                v-model.number="mobLevel"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option v-for="lvl in 30" :key="lvl" :value="lvl">
                  Monster level {{ lvl }}
                </option>
              </select>
            </div>

            <!-- Attack Count -->
            <div>
              <label for="monster-queue-count" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Attack Count
              </label>
              <input
                id="monster-queue-count"
                v-model.number="mobCount"
                type="number"
                min="1"
                max="50"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>

          <p class="text-2xs text-slate-400 dark:text-slate-500 italic">
            Dispatches individual squad attacks against wild monsters sequentially, automatically halting on a loss.
          </p>
        </section>

        <!-- Section 3: Queue Controls -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            v-if="!isRunning"
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-xs transition-colors"
            @click="startMonsterQueue"
          >
            👾 Start Monster Queue ({{ mobCount }} Attacks)
          </button>
          <button
            v-else
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-colors animate-pulse"
            @click="stopMonsterQueue"
          >
            ⏹ Stop Monster Queue
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
