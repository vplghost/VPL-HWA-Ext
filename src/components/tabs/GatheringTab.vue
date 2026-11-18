<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import type { AutoGatherSettings } from '@/src/types';
import { formatDuration } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import { isMarchExpired, getMarchBadgeInfo, resolveMarchResourceType, RESOURCE_THEMES } from '@/src/utils/resourceData';
import { calculateAccountMaxMarches } from '@/src/utils/dashboardState';

const { cache, dispatchRpc } = useRpcCache();
const accountMaxMarches = computed(() => calculateAccountMaxMarches(cache.value));

const settings = ref<AutoGatherSettings>({
  enabled: false,
  maxMarches: 3,
  mineLevel: 5,
  mineType: 'rotate',
  lastAutoMineType: null,
});

const now = ref(Date.now());
let timer: any = null;

onMounted(async () => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get('autoGatherSettings');
      if (stored.autoGatherSettings) {
        settings.value = { ...settings.value, ...stored.autoGatherSettings };
      }
    } catch (_) {}
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

async function saveSettings() {
  const maxLimit = accountMaxMarches.value;
  settings.value.maxMarches = Math.max(1, Math.min(maxLimit, settings.value.maxMarches || 1));
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ autoGatherSettings: settings.value });
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: settings.value.enabled ? 'auto-gather-start' : 'auto-gather-stop',
      settings: settings.value,
    });
  }
}

function toggleEnabled() {
  settings.value.enabled = !settings.value.enabled;
  saveSettings();
}

const activeMarches = computed(() => {
  const list = normalizeArray(cache.value.marchStatus?.data?.marches);
  return list
    .filter((m: any) => {
      if (isMarchExpired(m, now.value)) return false;
      const badge = getMarchBadgeInfo(m, now.value);
      if (badge.category === 'gather') return true;
      const isMine =
        Boolean(m.mineId) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.kind) ||
        ['food', 'wood', 'stone', 'iron', 'mine'].includes(m.previousKind);
      return isMine;
    })
    .map((m: any) => {
      const isReturning = m.kind === 'return' || m.stage === 'returnToOutpost';
      const isMoving =
        m.stage === 'moveToTargetInSolo' ||
        (Number.isFinite(m.targetArrivalAt) && now.value < m.targetArrivalAt) ||
        (Number.isFinite(m.endsAt) && now.value < m.endsAt && m.stage !== 'gathering');
      const targetTime = isReturning
        ? (m.endsAt || m.returnAt)
        : isMoving
        ? (m.targetArrivalAt || m.endsAt)
        : null;
      const remainingSec = targetTime && targetTime > now.value
        ? Math.max(0, Math.ceil((targetTime - now.value) / 1000))
        : 0;

      let stageLabel = 'Gathering at mine';
      if (isReturning) {
        stageLabel = 'Returning';
      } else if (isMoving && remainingSec > 0) {
        stageLabel = 'Marching to mine';
      }

      const resType = resolveMarchResourceType(m, cache.value);
      const theme = resType ? RESOURCE_THEMES[resType] : null;

      return {
        id: m.id || m.marchId || m.squadId,
        type: stageLabel,
        target: m.targetName || (m.mineId ? `Mine #${m.mineId}` : 'Resource Mine'),
        remainingSec,
        timerText: remainingSec > 0 ? formatDuration(remainingSec) : 'In progress',
        resType,
        icon: isReturning ? '↩️' : isMoving && remainingSec > 0 ? '🚶‍♂️' : (theme ? theme.icon : '⛏️'),
      };
    });
});

async function triggerManualSearch() {
  await dispatchRpc([
    {
      name: 'findResourceMines',
      args: { type: settings.value.mineType === 'rotate' ? 'food' : settings.value.mineType, level: settings.value.mineLevel },
      feature: 'world',
    },
  ]);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Auto-Gather Settings Card -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 shadow-2xs">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">⛏️</span>
          <div>
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Auto-Gather Automation
            </h3>
            <p class="text-xs text-slate-400">
              Automatically deploys squads to gather resource mines when idle
            </p>
          </div>
        </div>

        <!-- Toggle Switch -->
        <button
          type="button"
          class="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition-all"
          :class="
            settings.enabled
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
          "
          @click="toggleEnabled"
        >
          <span class="size-2 rounded-full" :class="settings.enabled ? 'bg-white animate-pulse' : 'bg-slate-400'"></span>
          <span>{{ settings.enabled ? 'Enabled' : 'Disabled' }}</span>
        </button>
      </div>

      <!-- Controls Form -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <!-- Resource Type -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Resource Type
          </label>
          <select
            v-model="settings.mineType"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
            @change="saveSettings"
          >
            <option value="rotate">🔄 Rotate All Resources</option>
            <option value="gold">🪙 Gold Mine</option>
            <option value="food">🌾 Food Farm</option>
            <option value="wood">🪵 Lumber Mill</option>
            <option value="stone">🪨 Stone Quarry</option>
            <option value="iron">⚙️ Iron Mine</option>
          </select>
        </div>

        <!-- Target Level -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Target Mine Level
          </label>
          <select
            v-model="settings.mineLevel"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
            @change="saveSettings"
          >
            <option v-for="lvl in 8" :key="lvl" :value="lvl">
              Level {{ lvl }}
            </option>
          </select>
        </div>

        <!-- Max Marches -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Max Active Marches
          </label>
          <select
            v-model.number="settings.maxMarches"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
            @change="saveSettings"
          >
            <option v-for="m in accountMaxMarches" :key="m" :value="m">
              {{ m }} squad{{ m > 1 ? 's' : '' }}{{ m === accountMaxMarches ? ' (Max)' : '' }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Active Marches List -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>🚩</span> Active Marches ({{ activeMarches.length }} / {{ settings.maxMarches }})
        </h4>
        <button
          type="button"
          class="cursor-pointer text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          @click="triggerManualSearch"
        >
          <span>🔍</span> <span>Search Mines</span>
        </button>
      </div>

      <div v-if="activeMarches.length === 0" class="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
        No active gathering marches. All squads are stationed in city.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="m in activeMarches"
          :key="m.id"
          class="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-lg">{{ m.icon }}</span>
            <div>
              <div class="font-semibold text-slate-800 dark:text-slate-200">{{ m.target }}</div>
              <div class="text-[10px] text-slate-400">{{ m.type }}</div>
            </div>
          </div>
          <span
            class="px-2.5 py-1 rounded-md font-mono font-bold text-xs"
            :class="
              m.resType === 'food'
                ? 'bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300'
                : m.resType === 'wood'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : m.resType === 'stone'
                    ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                    : m.resType === 'iron'
                      ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
                      : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
            "
          >
            {{ m.timerText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

