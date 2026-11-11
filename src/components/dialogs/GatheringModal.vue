<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber, formatDuration } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

interface AutoGatherSettings {
  enabled: boolean;
  maxMarches: number;
  mineLevel: number;
  mineType: string;
  lastAutoMineType: string | null;
}

const autoSettings = ref<AutoGatherSettings>({
  enabled: false,
  maxMarches: 3,
  mineLevel: 5,
  mineType: 'rotate',
  lastAutoMineType: null,
});

const selectedLineup = ref<string>('weakest');
const customTeams = ref<Array<{ id: string; name: string; heroIds: number[] }>>([]);

// Manual search
const manualMineType = ref('food');
const manualMineLevel = ref(5);
const isSearching = ref(false);
const searchResult = ref<any>(null);

const now = ref(Date.now());
let timer: number | null = null;

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['autoGatherSettings', 'customTeams']);
      if (stored.autoGatherSettings) {
        autoSettings.value = { ...autoSettings.value, ...stored.autoGatherSettings };
      }
      const accountId = cache.value.accountStatus?.data?.id;
      if (stored.customTeams && accountId) {
        customTeams.value = stored.customTeams[String(accountId)] || [];
      }
    } catch (_) {}
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

async function saveAutoSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: autoSettings.value });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: autoSettings.value.enabled ? 'auto-gather-start' : 'auto-gather-stop',
      settings: autoSettings.value,
    });
  }
}

function toggleAutoGather() {
  autoSettings.value.enabled = !autoSettings.value.enabled;
  saveAutoSettings();
}

// Next target mine type in rotation
const nextTargetType = computed(() => {
  if (autoSettings.value.mineType !== 'rotate') return autoSettings.value.mineType;
  const types = ['food', 'wood', 'stone', 'iron'];
  const last = autoSettings.value.lastAutoMineType;
  if (!last || !types.includes(last)) return 'food';
  const idx = types.indexOf(last);
  return types[(idx + 1) % types.length];
});

// Active gathering marches
const gatheringMarches = computed(() => {
  const marches = cache.value.marchStatus?.data?.marches || [];
  return marches
    .filter((m: any) => {
      const isMine =
        Boolean(m.mineId) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.kind) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.previousKind);
      return isMine && (!m.endsAt || m.endsAt > now.value);
    })
    .map((m: any) => {
      const remainingSec = m.endsAt ? Math.max(0, Math.ceil((m.endsAt - now.value) / 1000)) : 0;
      return {
        id: m.id || m.squadId,
        kind: m.kind,
        stage: m.stage || (m.kind === 'return' ? 'Returning' : 'Gathering'),
        remainingSec,
        timerText: m.endsAt ? formatDuration(remainingSec) : 'In progress',
      };
    });
});

async function handleManualSearch() {
  isSearching.value = true;
  searchResult.value = null;
  try {
    await dispatchRpc([
      {
        name: 'findResourceMines',
        args: { type: manualMineType.value, level: manualMineLevel.value },
        feature: 'world',
      },
    ]);
    searchResult.value = {
      type: manualMineType.value,
      level: manualMineLevel.value,
      status: 'Search packet sent. Check game tab for target destination.',
    };
  } finally {
    isSearching.value = false;
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Gathering & Resource Automation"
    max-width="max-w-3xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Section 1: Lineup & Squad Parameters -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>👥</span> Lineup & Troop Capacity
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Gathering Squad Lineup
            <select
              v-model="selectedLineup"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="weakest">⭐ Weakest 5 available heroes (Default)</option>
              <option
                v-for="team in customTeams"
                :key="team.id"
                :value="team.id"
              >
                {{ team.name }} ({{ team.heroIds.length }}/5 heroes)
              </option>
            </select>
          </label>

          <div>
            <span class="block font-medium text-slate-700 dark:text-slate-300">Troop Allocation</span>
            <div class="mt-1 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono text-[11px]">
                Automatic balanced troops
              </span>
              <span class="text-[11px]">Fills to maximum hero capacity</span>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-slate-400">
          Note: Default lineup selects the 5 available heroes with lowest power to preserve top heroes for combat.
        </p>
      </section>

      <!-- Section 2: Auto-Gather Automation Settings -->
      <section class="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-3.5 shadow-xs">
        <div class="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/40 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">⚙️</span>
            <div>
              <h3 class="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                Auto-Gather Automation
              </h3>
              <p class="text-[11px] text-emerald-700 dark:text-emerald-300">
                Automatically search and dispatch squads when marches return to outpost
              </p>
            </div>
          </div>

          <label class="flex items-center gap-2 cursor-pointer font-bold text-emerald-800 dark:text-emerald-200">
            <input
              type="checkbox"
              :checked="autoSettings.enabled"
              class="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              @change="toggleAutoGather"
            />
            <span>{{ autoSettings.enabled ? 'ACTIVE' : 'PAUSED' }}</span>
          </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Mine Target Type
            <select
              v-model="autoSettings.mineType"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option value="rotate">🔄 Auto Rotate (Food → Wood → Stone → Iron)</option>
              <option value="food">🍞 Food Only</option>
              <option value="wood">🌲 Wood Only</option>
              <option value="stone">◆ Stone Only</option>
              <option value="iron">⚙ Iron Only</option>
            </select>
          </label>

          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Preferred Mine Level
            <select
              v-model.number="autoSettings.mineLevel"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            >
              <option :value="5">Level 5 (Highest Yield)</option>
              <option :value="4">Level 4</option>
              <option :value="3">Level 3</option>
              <option :value="2">Level 2</option>
              <option :value="1">Level 1</option>
            </select>
          </label>

          <label class="block font-medium text-slate-700 dark:text-slate-300">
            Max Gathering Marches
            <input
              v-model.number="autoSettings.maxMarches"
              type="number"
              min="1"
              max="5"
              class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              @change="saveAutoSettings"
            />
          </label>
        </div>

        <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2.5 text-[11px] text-slate-600 dark:text-slate-400">
          <template v-if="autoSettings.enabled">
            <span>Dispatches automatically on game load or when marches return to base if active marches &lt; {{ autoSettings.maxMarches }}. </span>
            <span v-if="autoSettings.mineType === 'rotate'">
              Cycling: Next target is <strong>{{ nextTargetType.toUpperCase() }}</strong>.
            </span>
            <span v-else>
              Target: <strong>{{ autoSettings.mineType.toUpperCase() }}</strong>.
            </span>
          </template>
          <template v-else>
            Auto-gathering is currently paused. Check the box above to automatically search and send teams.
          </template>
        </div>
      </section>

      <!-- Section 3: Manual Search & Dispatch -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>🔍</span> Manual Mine Search
        </h3>

        <div class="flex flex-wrap items-center gap-2.5">
          <select
            v-model="manualMineType"
            class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="food">🍞 Food Mine</option>
            <option value="wood">🌲 Wood Mine</option>
            <option value="stone">◆ Stone Mine</option>
            <option value="iron">⚙ Iron Mine</option>
          </select>

          <select
            v-model.number="manualMineLevel"
            class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
          >
            <option :value="5">Level 5</option>
            <option :value="4">Level 4</option>
            <option :value="3">Level 3</option>
            <option :value="2">Level 2</option>
            <option :value="1">Level 1</option>
          </select>

          <button
            type="button"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            :disabled="isSearching"
            @click="handleManualSearch"
          >
            <span>{{ isSearching ? 'Searching...' : 'Find Mine' }}</span>
          </button>
        </div>

        <div v-if="searchResult" class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px]">
          {{ searchResult.status }}
        </div>
      </section>

      <!-- Section 4: Active Gathering Marches -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
          <span class="flex items-center gap-2"><span>⛏️</span> Active Gathering Marches</span>
          <span class="text-xs font-normal text-slate-400">{{ gatheringMarches.length }} active</span>
        </h3>

        <div v-if="gatheringMarches.length === 0" class="p-4 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
          No gathering marches currently active.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="march in gatheringMarches"
            :key="march.id"
            class="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">⛏️</span>
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">Squad #{{ march.id }}</span>
                <span class="text-[11px] text-slate-400 ml-2">{{ march.stage }}</span>
              </div>
            </div>

            <span class="font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
              {{ march.timerText }}
            </span>
          </div>
        </div>
      </section>
    </div>
  </ModalDialog>
</template>
