<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useTheme } from '@/src/composables/useTheme';
import { useModals } from '@/src/composables/useModals';
import { useResourceSelection } from '@/src/composables/useResourceSelection';
import {
  formatResourceAmount,
  getAmountAt,
  remainingMinutes,
  hoursMinutes,
  resourceAppearance,
  resourceLabel,
  isSelectableForHeader,
  getMarchBadgeInfo,
  isMarchExpired,
} from '@/src/utils/resourceData';
import {
  formatMarchTooltip,
  formatRaidQueueTooltip,
  formatMonsterQueueTooltip,
  formatAutoGatherTooltip,
} from '@/src/utils/marchTooltip';

const { cache, rpcQueueCount, dispatchRpc } = useRpcCache();
const { theme, applyTheme } = useTheme();
const { openModal } = useModals();
const { resourceSelection } = useResourceSelection();

// Current time refreshed every second for live countdowns
const now = ref(Date.now());
let timer: number | null = null;

// Storage state
const cachedGameVersion = ref<string>('');
const isTabOpenButtonVisible = ref(true);
const raidQueue = ref<any>(null);
const monsterQueue = ref<any>(null);
const autoGatherSettings = ref<any>(null);

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  // Check if opened as standalone tab
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'tab') {
      isTabOpenButtonVisible.value = false;
    }
  }

  if (typeof chrome !== 'undefined' && chrome.tabs?.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (tab) isTabOpenButtonVisible.value = false;
    });
  }

  // Load storage data
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get([
        'cachedGameVersion',
        'raidQueue',
        'monsterQueue',
        'autoGatherSettings',
      ]);
      if (stored.cachedGameVersion) cachedGameVersion.value = stored.cachedGameVersion;
      if (stored.raidQueue) raidQueue.value = stored.raidQueue;
      if (stored.monsterQueue) monsterQueue.value = stored.monsterQueue;
      if (stored.autoGatherSettings) autoGatherSettings.value = stored.autoGatherSettings;
    } catch (_) {}

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.cachedGameVersion) {
          cachedGameVersion.value = changes.cachedGameVersion.newValue || '';
        }
        if (changes.raidQueue) {
          raidQueue.value = changes.raidQueue.newValue || null;
        }
        if (changes.monsterQueue) {
          monsterQueue.value = changes.monsterQueue.newValue || null;
        }
        if (changes.autoGatherSettings) {
          autoGatherSettings.value = changes.autoGatherSettings.newValue || null;
        }
      }
    });
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// Extension Version
const extensionVersion = computed(() => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest()?.version || '0.9.250';
  }
  return '0.9.250';
});

// Account Name
const accountName = computed(() => {
  return (
    cache.value.accountStatus?.data?.name ||
    cache.value.user_getUnitSummary?.data?.name ||
    '—'
  );
});

// Open Popup in Tab
function openInTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') });
  }
}

// Active Marches
const activeMarches = computed(() => {
  const marches = cache.value.marchStatus?.data?.marches || [];
  return marches
    .map((m: any, idx: number) => ({ march: m, index: idx }))
    .filter(({ march }: { march: any }) => !isMarchExpired(march, now.value));
});

function handleMarchClick(march: any) {
  const info = getMarchBadgeInfo(march, now.value);
  if (info.category === 'raid') openModal('raid');
  else if (info.category === 'gather') openModal('gathering');
  else if (info.category === 'monster') openModal('monster');
}

const isRaidQueueRunning = computed(() => {
  const q = raidQueue.value;
  return Boolean(q && q.running && !['stopped', 'complete'].includes(q.phase));
});

const isMonsterQueueRunning = computed(() => {
  const q = monsterQueue.value;
  return Boolean(q && q.running && !['stopped', 'complete'].includes(q.phase));
});

const isAutoGatherEnabled = computed(() => {
  return Boolean(autoGatherSettings.value?.enabled);
});

const hasActiveRaidMarch = computed(() => {
  return activeMarches.value.some((item) => getMarchBadgeInfo(item.march, now.value).category === 'raid');
});

const hasActiveGatherMarch = computed(() => {
  return activeMarches.value.some((item) => getMarchBadgeInfo(item.march, now.value).category === 'gather');
});

const hasActiveMonsterMarch = computed(() => {
  return activeMarches.value.some((item) => getMarchBadgeInfo(item.march, now.value).category === 'monster');
});

// Building remaining time
const buildingRemaining = computed(() => {
  const minutes = remainingMinutes(cache.value.buildingStatus, now.value);
  return hoursMinutes(minutes);
});

// Research remaining time
const researchRemaining = computed(() => {
  const minutes = remainingMinutes(cache.value.researchStatus, now.value);
  return hoursMinutes(minutes);
});

// Legend Draft Alert
function draftStageDescription(stageId?: number | null): string {
  if (stageId === 1) return 'Matching...';
  if (stageId === 2 || stageId === 3) return 'Defense Draft';
  if (stageId === 4) return 'Attack Draft';
  if (stageId === 5) return 'Ready for Battle';
  if (stageId === 6) return 'Battle in Progress';
  if (stageId === 7) return 'Match Completed';
  return 'Not in match';
}

function formatDraftCountdown(finishTs?: number | null): string {
  if (!finishTs || typeof finishTs !== 'number' || !Number.isFinite(finishTs)) return '';
  const nowSec = Math.floor(now.value / 1000);
  const remaining = Math.max(0, finishTs - nowSec);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const isDraftActive = computed(() => {
  const draft = cache.value.legendDraftStatus?.data;
  if (!draft || draft.active === false) return false;
  const stageId = draft.stageId;
  // Stages 1 through 6 are active Legend Draft phases (parity with isDraftActive).
  return typeof stageId === 'number' && Number.isInteger(stageId) && stageId >= 1 && stageId <= 6;
});

const draftTooltip = computed(() => {
  const draft = cache.value.legendDraftStatus?.data;
  const stageDesc = draftStageDescription(draft?.stageId);
  const countdown = formatDraftCountdown(draft?.stageFinishTs);
  return `Legend Draft · ${stageDesc}${countdown ? ` · ${countdown}` : ''}`;
});

// Mail / Battle Reports Status
const mailStatus = computed(() => {
  const mail = cache.value.mailStatus?.data;

  // 1. Check letters with unclaimed rewards
  const letters = Array.isArray(mail?.letters)
    ? mail.letters
    : (Array.isArray(cache.value.mailGetAll?.data?.letters)
      ? cache.value.mailGetAll.data.letters
      : (Array.isArray(cache.value.mailGetAll?.letters) ? cache.value.mailGetAll.letters : []));

  const unclaimedLetters = letters.filter((l: any) =>
    l && !l.deleted && (l.reward || l.q_reward || l.items) &&
    !l.claimed && !l.rewardReceived && !l.rewardClaimed
  );

  // 2. Check battle reports with unclaimed rewards
  const reports = Array.isArray(mail?.reports) ? mail.reports : [];
  const unclaimedReports = reports.filter((r: any) => r && r.claimedReward === false);

  let letterCount = unclaimedLetters.length;
  if (letters.length === 0 && typeof mail?.unclaimedLettersCount === 'number') {
    letterCount = mail.unclaimedLettersCount;
  }

  let reportCount = 0;
  if (reports.length > 0) {
    reportCount = unclaimedReports.length;
  } else if (typeof mail?.unclaimedReportsCount === 'number') {
    reportCount = mail.unclaimedReportsCount;
  } else if (mail?.hasUnclaimed) {
    reportCount = Number(mail.totalUnclaimed) || 1;
  }

  const totalCount = letterCount + reportCount;
  const hasUnclaimed = totalCount > 0 && Boolean(
    mail?.hasUnclaimed ||
    (mail?.totalUnclaimed && mail.totalUnclaimed > 0) ||
    (mail?.unclaimedReportsCount && mail.unclaimedReportsCount > 0) ||
    (mail?.unclaimedLettersCount && mail.unclaimedLettersCount > 0) ||
    unclaimedLetters.length > 0 ||
    unclaimedReports.length > 0
  );

  return {
    hasUnclaimed,
    count: totalCount || (mail?.totalUnclaimed ?? mail?.unclaimedReportsCount ?? 0),
  };
});

async function refreshMail() {
  if (dispatchRpc) {
    await dispatchRpc([
      { name: 'getPage', feature: 'report', args: { limit: 10, cursor: null } },
      { name: 'mailGetAll' },
    ]);
  }
}

// Energy
const energyEntry = computed(() => cache.value['resource:energy']);
const energyValue = computed(() => {
  const val = getAmountAt(energyEntry.value, now.value) ?? cache.value.energyStatus?.data?.energy;
  return formatResourceAmount(val);
});
const energyCap = computed(() => {
  const cap = energyEntry.value?.data?.cap;
  return formatResourceAmount(cap);
});
const isEnergyCapped = computed(() => {
  const val = getAmountAt(energyEntry.value, now.value) ?? cache.value.energyStatus?.data?.energy;
  const cap = energyEntry.value?.data?.cap;
  return Number.isFinite(val) && Number.isFinite(cap) && (val as number) >= (cap as number);
});

// World Energy
const worldEnergyEntry = computed(() => cache.value['resource:world-energy']);
const worldEnergyValue = computed(() => {
  const val = getAmountAt(worldEnergyEntry.value, now.value) ?? cache.value.worldEnergyStatus?.data?.energy;
  return formatResourceAmount(val);
});
const isWorldEnergyCapped = computed(() => {
  const val = getAmountAt(worldEnergyEntry.value, now.value) ?? cache.value.worldEnergyStatus?.data?.energy;
  const cap = worldEnergyEntry.value?.data?.cap ?? 200;
  return Number.isFinite(val) && Number.isFinite(cap) && (val as number) >= cap;
});

// Header Resources Bar
const headerResourceEntries = computed(() => {
  const entries: any[] = [];
  for (const [k, v] of Object.entries(cache.value)) {
    if (k.startsWith('resource:') && v?.data && Number.isFinite(v.data.amount)) {
      const entry = { key: k, data: v.data };
      if (isSelectableForHeader(entry) && Array.isArray(resourceSelection.value) && resourceSelection.value.includes(k)) {
        const val = getAmountAt(entry, now.value);
        const cap = entry.data?.cap;
        const isCapped = Number.isFinite(val) && Number.isFinite(cap) && (val as number) >= cap!;
        entries.push({
          key: k,
          label: resourceLabel(entry),
          formattedAmount: formatResourceAmount(val),
          appearance: resourceAppearance(entry),
          isCapped,
        });
      }
    }
  }
  return entries;
});

function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}
</script>

<template>
  <header class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 shadow-sm transition-colors">
    <!-- Row 1: App identity & Global Status Badges -->
    <div class="flex items-center justify-between gap-3">
      <!-- Title & Account -->
      <div class="flex min-w-0 items-center gap-2">
        <h1 class="truncate text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          HWA Helper
        </h1>
        <span
          id="extension-header-version"
          class="text-xs font-normal text-slate-400 select-none font-mono"
        >
          v{{ extensionVersion }}
        </span>
        <span
          id="account-name"
          class="max-w-36 truncate text-xs font-semibold text-slate-600 dark:text-slate-300"
          :title="`Account: ${accountName}`"
        >
          {{ accountName }}
        </span>
        <!-- Open in New Tab Button -->
        <button
          v-if="isTabOpenButtonVisible"
          id="open-tab"
          type="button"
          title="Open HWA Helper in a new tab"
          aria-label="Open HWA Helper in a new tab"
          class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          @click="openInTab"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
            <path
              d="M14 4h6v6m0-6-9 9M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <!-- Right: Status Badges -->
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5" aria-label="Current status">
        <!-- Active Marches & Standing Queues -->
        <div id="marches" class="flex items-center gap-1" aria-label="Active marches and queues">
          <!-- Active March Badges with Full Tooltip -->
          <button
            v-for="item in activeMarches"
            :key="item.index"
            type="button"
            class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold ring-1 transition-transform hover:scale-110"
            :class="[
              getMarchBadgeInfo(item.march, now).classes,
              getMarchBadgeInfo(item.march, now).isPulse ? 'animate-pulse' : '',
            ]"
            :title="formatMarchTooltip(item.march, now, cache)"
            :aria-label="formatMarchTooltip(item.march, now, cache)"
            @click="handleMarchClick(item.march)"
          >
            {{ getMarchBadgeInfo(item.march, now).icon }}
          </button>

          <!-- Standing Raid Queue (Active between march waves) -->
          <button
            v-if="isRaidQueueRunning && !hasActiveRaidMarch"
            type="button"
            class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold ring-1 bg-indigo-100 text-indigo-900 ring-indigo-400 dark:bg-indigo-950/70 dark:text-indigo-200 dark:ring-indigo-700 animate-pulse transition-transform hover:scale-110"
            :title="formatRaidQueueTooltip(raidQueue)"
            :aria-label="formatRaidQueueTooltip(raidQueue)"
            @click="openModal('raid')"
          >
            🏹
          </button>

          <!-- Standing Monster Queue (Active between solo attacks) -->
          <button
            v-if="isMonsterQueueRunning && !hasActiveMonsterMarch"
            type="button"
            class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold ring-1 bg-amber-100 text-amber-900 ring-amber-400 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-700 animate-pulse transition-transform hover:scale-110"
            :title="formatMonsterQueueTooltip(monsterQueue)"
            :aria-label="formatMonsterQueueTooltip(monsterQueue)"
            @click="openModal('monster')"
          >
            👾
          </button>

          <!-- Standing Auto-Gather (Active when no active gather march) -->
          <button
            v-if="isAutoGatherEnabled && !hasActiveGatherMarch"
            type="button"
            class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold ring-1 bg-emerald-100 text-emerald-900 ring-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-700 transition-transform hover:scale-110"
            :title="formatAutoGatherTooltip(autoGatherSettings)"
            :aria-label="formatAutoGatherTooltip(autoGatherSettings)"
            @click="openModal('gathering')"
          >
            ⛏️
          </button>
        </div>

        <!-- Building Badge -->
        <span
          id="building-badge"
          tabindex="0"
          title="Building time remaining (Click to view City Buildings)"
          class="cursor-pointer inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          @click="openModal('building')"
        >
          <span>🏗</span>
          <span id="building-time" class="font-mono text-[11px]">{{ buildingRemaining }}</span>
        </span>

        <!-- Research Badge -->
        <span
          id="research-badge"
          tabindex="0"
          title="Research time remaining (Click to view Personal Research)"
          class="cursor-pointer inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          @click="openModal('research')"
        >
          <span>🔬</span>
          <span id="research-time" class="font-mono text-[11px]">{{ researchRemaining }}</span>
        </span>

        <!-- Legend Draft Alert -->
        <button
          v-if="isDraftActive"
          id="draft-alert"
          type="button"
          aria-label="Open Legend Draft"
          :title="draftTooltip"
          class="relative cursor-pointer inline-flex items-center justify-center size-6 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700/60 transition-colors"
          @click="openModal('draft')"
        >
          <span class="text-xs">⚔</span>
          <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500 animate-ping"></span>
          <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-600"></span>
        </button>

        <!-- Mail / Reports Badge -->
        <span
          v-if="mailStatus.hasUnclaimed"
          id="mail-badge"
          tabindex="0"
          :title="`New mail / battle report with reward${mailStatus.count > 1 ? `s (${mailStatus.count})` : ''} · Click to refresh mail`"
          aria-label="Mail and Reports"
          class="relative cursor-pointer inline-flex items-center justify-center size-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          @click="refreshMail"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500 animate-ping"></span>
          <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-600"></span>
        </span>

        <!-- Energy Badge -->
        <span
          id="energy-badge"
          tabindex="0"
          aria-label="Energy"
          title="Energy balance"
          class="relative inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 font-semibold text-amber-800 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-700/60 text-xs"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="m13 2-9 12h7l-1 8 10-13h-7V2Z" fill="currentColor" />
          </svg>
          <span id="energy-value">{{ energyValue }}</span>
          <span class="text-amber-500 font-normal">/</span>
          <span id="energy-max">{{ energyCap }}</span>
          <span v-if="isEnergyCapped" class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500 animate-ping"></span>
        </span>

        <!-- World Energy Badge -->
        <span
          id="world-energy-badge"
          tabindex="0"
          aria-label="World Energy"
          title="World Energy balance"
          class="relative inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 font-semibold text-sky-800 dark:text-sky-300 ring-1 ring-sky-200 dark:ring-sky-700/60 text-xs"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span id="world-energy-value">{{ worldEnergyValue }}</span>
          <span v-if="isWorldEnergyCapped" class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-sky-500 animate-ping"></span>
        </span>

        <!-- Theme Toggle -->
        <button
          type="button"
          class="cursor-pointer inline-flex size-6 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xs ml-1"
          :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
          @click="toggleTheme"
        >
          <span v-if="theme === 'dark'">☀️</span>
          <span v-else>🌙</span>
        </button>
      </div>
    </div>

    <!-- Row 2: Queue info & Selected Header Resources -->
    <div class="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 dark:border-slate-800/60 pt-1.5 text-xs">
      <div class="flex items-center gap-2">
        <span
          v-if="cachedGameVersion"
          id="game-header-version"
          class="text-xs font-normal text-slate-400 select-none font-mono"
          title="Game client version"
        >
          Client: {{ cachedGameVersion }}
        </span>
        <span
          id="rpc-queue-badge"
          title="RPC calls waiting for the next game request; excludes calls already sent"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700/60"
          role="status"
          aria-live="polite"
        >
          RPC queue:
          <span id="rpc-queue-count" class="font-bold text-indigo-600 dark:text-indigo-400">{{ rpcQueueCount }}</span>
        </span>
      </div>

      <!-- Header Selected Resources -->
      <div id="header-resources" class="flex flex-wrap justify-end gap-1.5" aria-label="Selected resources">
        <span
          v-for="res in headerResourceEntries"
          :key="res.key"
          tabindex="0"
          :aria-label="res.label"
          :title="res.label"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 transition-colors"
          :class="[res.appearance.classes, res.isCapped ? 'relative ring-2 ring-amber-400' : '']"
        >
          <span aria-hidden="true">{{ res.appearance.icon }}</span>
          <span>{{ res.formattedAmount }}</span>
          <span v-if="res.isCapped" class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-500 animate-ping"></span>
        </span>
      </div>
    </div>
  </header>
</template>
