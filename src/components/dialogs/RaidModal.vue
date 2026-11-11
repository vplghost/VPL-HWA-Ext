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

const bossLevel = ref(1);
const waitSeconds = ref(300);
const minMembers = ref(4);
const raidCount = ref(2);
const autoCancel = ref(true);
const isRunning = ref(false);
const queueStatusText = ref('Idle');

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['raidPreferences', 'raidQueue']);
      if (stored.raidPreferences) {
        if (stored.raidPreferences.bossLevel) bossLevel.value = stored.raidPreferences.bossLevel;
        if (stored.raidPreferences.waitSeconds) waitSeconds.value = stored.raidPreferences.waitSeconds;
        if (stored.raidPreferences.minMembers) minMembers.value = stored.raidPreferences.minMembers;
      }
      if (stored.raidQueue) {
        isRunning.value = stored.raidQueue.running || false;
        queueStatusText.value = stored.raidQueue.phase || 'Idle';
      }
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.raidQueue) {
        const q = changes.raidQueue.newValue;
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
      raidPreferences: {
        bossLevel: bossLevel.value,
        waitSeconds: waitSeconds.value,
        minMembers: minMembers.value,
      },
    });
  }
}

async function startRaidQueue() {
  isRunning.value = true;
  queueStatusText.value = 'Searching...';
  await savePreferences();
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'raid-queue-start',
      options: {
        level: bossLevel.value,
        waitSeconds: waitSeconds.value,
        minMembers: minMembers.value,
        count: raidCount.value,
        autoCancel: autoCancel.value,
      },
    });
  }
}

async function stopRaidQueue() {
  isRunning.value = false;
  queueStatusText.value = 'Stopped';
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'raid-queue-stop' });
  }
}

const totalReadyTroops = computed(() => {
  return troopStats.value.reduce((sum, t) => sum + (t.readyCount || 0), 0);
});
</script>

<template>
  <div
    v-if="modelValue"
    id="raid-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="raid-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    @click.self="close"
  >
    <div
      class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-indigo-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-indigo-900/50 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        id="raid-dialog-header"
        class="sticky top-0 z-10 flex items-center justify-between border-b border-indigo-200 bg-indigo-50/80 px-4 py-3 backdrop-blur dark:border-indigo-900/60 dark:bg-indigo-950/50 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span id="raid-dialog-icon" class="text-xl shrink-0" aria-hidden="true">⚔️</span>
          <h2 id="raid-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            Rally raid
          </h2>
          <div id="raid-dialog-status" class="flex items-center gap-2 truncate">
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
          aria-label="Close Raid dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="raid-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
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

        <!-- Section 2: Raid Settings -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>⚙️</span> Raid Parameters
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Boss Level (1-30) -->
            <div>
              <label for="raid-boss-level" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Boss Level
              </label>
              <select
                id="raid-boss-level"
                v-model.number="bossLevel"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option v-for="lvl in 30" :key="lvl" :value="lvl">
                  Boss level {{ lvl }}
                </option>
              </select>
            </div>

            <!-- Raid Count -->
            <div>
              <label for="raid-queue-count" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Raid Count
              </label>
              <input
                id="raid-queue-count"
                v-model.number="raidCount"
                type="number"
                min="1"
                max="50"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>

            <!-- Rally Wait Seconds -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Rally Wait Time
              </label>
              <select
                v-model.number="waitSeconds"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              >
                <option :value="60">1 minute (60s)</option>
                <option :value="300">5 minutes (300s)</option>
                <option :value="600">10 minutes (600s)</option>
              </select>
            </div>

            <!-- Minimum Members -->
            <div>
              <label for="raid-min-members" class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Minimum Members
              </label>
              <input
                id="raid-min-members"
                v-model.number="minMembers"
                type="number"
                min="1"
                max="6"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden"
                @change="savePreferences"
              />
            </div>
          </div>

          <!-- Auto Cancel Checkbox -->
          <label class="flex items-center gap-2 cursor-pointer pt-1">
            <input
              v-model="autoCancel"
              type="checkbox"
              class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">
              Auto-cancel rally in last 10 seconds if squad members &lt; {{ minMembers }}
            </span>
          </label>
        </section>

        <!-- Section 3: Queue Controls -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            v-if="!isRunning"
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-colors"
            @click="startRaidQueue"
          >
            ⚔️ Start Raid Queue ({{ raidCount }} Rounds)
          </button>
          <button
            v-else
            type="button"
            class="cursor-pointer px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-colors animate-pulse"
            @click="stopRaidQueue"
          >
            ⏹ Stop Raid Queue
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
