<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { questData } from '@/src/data/questData';
import { formatNumber } from '@/src/utils/formatters';
import { parseRewards, type FormattedReward } from '@/src/utils/rewardHelper';
import { defaultBattlepassLevels, getBattlePassName } from '@/src/data/battlepassCatalog';
import { exportEventsAsJson, copyEventsToClipboard } from '@/src/utils/eventExport';

const props = defineProps<{
  modelValue: boolean;
  initialPassId?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const selectedPassId = ref<number | string | null>(null);
const currentFilter = ref<'all' | 'ready' | 'unlocked' | 'locked'>('all');
const searchQuery = ref('');
const isRefreshing = ref(false);
const isClaiming = ref(false);
const claimStatus = ref('');
const dynamicCatalog = ref<any>(null);

// Sync initialPassId
watch(
  () => props.initialPassId,
  (val) => {
    if (val != null) {
      const cleanId = String(val).replace(/^bp:/, '');
      selectedPassId.value = Number(cleanId) || cleanId;
    }
  },
  { immediate: true }
);

// Load dynamic catalog from storage
async function loadDynamicCatalog() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      const res = await chrome.storage.local.get(['dynamicEventCatalog']);
      if (res?.dynamicEventCatalog) {
        dynamicCatalog.value = res.dynamicEventCatalog;
      }
    }
  } catch (_) {}
}

onMounted(() => {
  loadDynamicCatalog();
});

watch(
  () => props.modelValue,
  (val) => {
    if (val) loadDynamicCatalog();
  }
);

interface ActivePassInfo {
  id: number;
  title: string;
  points: number;
  hasGoldenPass: boolean;
  activatedTrackIds: number[];
  claimedRewards: { levelId: number; trackId: number }[];
  expiresAt?: string;
  endTime?: number;
  startedAt?: string;
}

// Active passes computed from battlepassLiveStatus and fallback battlepassStatus
const availablePasses = computed<ActivePassInfo[]>(() => {
  const passes: ActivePassInfo[] = [];
  const seenIds = new Set<number>();

  // 1. Live Ops Battle Passes (battlepassLiveStatus or getBattlepassState)
  const rawLive =
    cache.value?.battlepassLiveStatus?.data?.battlepasses ||
    cache.value?.['getBattlepassState:battlepass']?.data?.battlepasses ||
    [];

  for (const bp of Array.isArray(rawLive) ? rawLive : []) {
    const id = Number(bp.battlepassId);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const activatedTrackIds = Array.isArray(bp.activatedTrackIds) ? bp.activatedTrackIds.map(Number) : [];
    const hasGoldenPass = activatedTrackIds.length > 1;
    const title = getBattlePassName(bp, dynamicCatalog.value);
    const claimedRewards = Array.isArray(bp.claimedRewards)
      ? bp.claimedRewards.map((r: any) => ({ levelId: Number(r.levelId), trackId: Number(r.trackId) }))
      : [];

    passes.push({
      id,
      title,
      points: Number(bp.points) || 0,
      hasGoldenPass,
      activatedTrackIds,
      claimedRewards,
      expiresAt: bp.expiresAt,
      startedAt: bp.startedAt,
    });
  }

  // 2. Legacy Passes (battlepassStatus)
  const legacyPasses = (questData as any).getBattlePassState ? (questData as any).getBattlePassState(cache.value) : [];
  for (const bp of legacyPasses) {
    const id = Number(bp.id);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const title = getBattlePassName(bp, dynamicCatalog.value);
    passes.push({
      id,
      title,
      points: Number(bp.exp) || 0,
      hasGoldenPass: bp.hasGoldenPass === true,
      activatedTrackIds: bp.hasGoldenPass ? [1, 2] : [1],
      claimedRewards: [],
      endTime: bp.endTime,
    });
  }

  return passes;
});

// Auto-select valid pass ID
watch(
  availablePasses,
  (list) => {
    if (list.length === 0) return;
    if (selectedPassId.value == null) {
      selectedPassId.value = list[0].id;
    } else {
      const exists = list.some((p) => String(p.id) === String(selectedPassId.value));
      if (!exists) {
        selectedPassId.value = list[0].id;
      }
    }
  },
  { immediate: true }
);

const currentPass = computed<ActivePassInfo | null>(() => {
  if (selectedPassId.value == null) return availablePasses.value[0] || null;
  return availablePasses.value.find((p) => String(p.id) === String(selectedPassId.value)) || availablePasses.value[0] || null;
});

// Format remaining time
function formatRemaining(expiresAt?: string, endTime?: number): string {
  let endMs = 0;
  if (expiresAt) {
    endMs = Date.parse(expiresAt);
  } else if (endTime) {
    endMs = endTime * 1000;
  }
  if (!endMs || !Number.isFinite(endMs)) return 'Active Season';

  const diff = endMs - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

// Milestone Level Detail
export interface BattlePassMilestoneTier {
  levelId: number;
  level: number;
  points: number;
  isUnlocked: boolean;
  freeReward: FormattedReward[];
  goldenReward: FormattedReward[];
  freeTrackId: number | null;
  goldenTrackId: number | null;
  freeClaimed: boolean;
  goldenClaimed: boolean;
  freeReady: boolean;
  goldenReady: boolean;
  status: 'completed' | 'ready' | 'locked';
}

const milestoneTiers = computed<BattlePassMilestoneTier[]>(() => {
  const pass = currentPass.value;
  if (!pass) return [];

  const bpId = pass.id;
  const points = pass.points;
  const activatedTracks = new Set(pass.activatedTrackIds);
  const claimedSet = new Set(pass.claimedRewards.map((r) => `${r.levelId}:${r.trackId}`));

  // 1. Resolve level definitions
  const rawLevels =
    dynamicCatalog.value?.battlepass?.levels?.filter((l: any) => Number(l.battlepassId) === bpId) ||
    defaultBattlepassLevels[bpId] ||
    [];

  const levels = (Array.isArray(rawLevels) ? rawLevels : Object.values(rawLevels))
    .map((l: any) => ({
      id: Number(l.id),
      level: Number(l.level),
      points: Number(l.points),
      battlepassId: Number(l.battlepassId || bpId),
    }))
    .sort((a, b) => a.level - b.level);

  // 2. Resolve tracks for this pass
  const rawTracks =
    dynamicCatalog.value?.battlepass?.tracks?.filter((t: any) => Number(t.battlepassId) === bpId) || [];
  const tracksList = Array.isArray(rawTracks) ? rawTracks : Object.values(rawTracks);

  const freeTrack = tracksList.find((t: any) => String(t.type).toLowerCase() === 'free') || tracksList[0] || null;
  const goldenTrack = tracksList.find((t: any) => String(t.type).toLowerCase() === 'paid' || String(t.type).toLowerCase() === 'premium') || (tracksList.length > 1 ? tracksList[1] : null);

  const freeTrackId = freeTrack ? Number(freeTrack.id) : (pass.activatedTrackIds[0] ?? null);
  const goldenTrackId = goldenTrack ? Number(goldenTrack.id) : (pass.activatedTrackIds.length > 1 ? pass.activatedTrackIds[1] : null);

  // 3. Resolve rewards map (keyed by levelId:trackId)
  const rawRewards = dynamicCatalog.value?.battlepass?.rewards || [];
  const rewardMap = new Map<string, any>();
  for (const r of Array.isArray(rawRewards) ? rawRewards : Object.values(rawRewards)) {
    if (r && r.battlepassLevelId != null && r.battlepassTrackId != null) {
      rewardMap.set(`${r.battlepassLevelId}:${r.battlepassTrackId}`, r.reward);
    }
  }

  // 4. Build Milestone Tiers
  return levels.map((lvl) => {
    const isUnlocked = points >= lvl.points;

    const rawFreeReward = freeTrackId ? rewardMap.get(`${lvl.id}:${freeTrackId}`) : null;
    const rawGoldenReward = goldenTrackId ? rewardMap.get(`${lvl.id}:${goldenTrackId}`) : null;

    const freeReward = rawFreeReward ? parseRewards(rawFreeReward) : [];
    const goldenReward = rawGoldenReward ? parseRewards(rawGoldenReward) : [];

    const freeClaimed = freeTrackId != null && claimedSet.has(`${lvl.id}:${freeTrackId}`);
    const goldenClaimed = goldenTrackId != null && claimedSet.has(`${lvl.id}:${goldenTrackId}`);

    const isFreeActive = freeTrackId != null && activatedTracks.has(freeTrackId);
    const isGoldenActive = goldenTrackId != null && activatedTracks.has(goldenTrackId);

    const freeReady = isUnlocked && !freeClaimed && isFreeActive;
    const goldenReady = isUnlocked && !goldenClaimed && isGoldenActive;

    let status: 'completed' | 'ready' | 'locked' = 'locked';
    if (freeReady || goldenReady) {
      status = 'ready';
    } else if (isUnlocked && (freeClaimed || !isFreeActive) && (goldenClaimed || !isGoldenActive)) {
      status = 'completed';
    }

    return {
      levelId: lvl.id,
      level: lvl.level,
      points: lvl.points,
      isUnlocked,
      freeReward,
      goldenReward,
      freeTrackId,
      goldenTrackId,
      freeClaimed,
      goldenClaimed,
      freeReady,
      goldenReady,
      status,
    };
  });
});

// Filtered Milestone Tiers
const filteredTiers = computed(() => {
  let list = milestoneTiers.value;

  if (currentFilter.value === 'ready') {
    list = list.filter((t) => t.status === 'ready');
  } else if (currentFilter.value === 'unlocked') {
    list = list.filter((t) => t.isUnlocked);
  } else if (currentFilter.value === 'locked') {
    list = list.filter((t) => !t.isUnlocked);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter((t) => {
      const matchLvl = `level ${t.level}`.includes(query) || `tier ${t.level}`.includes(query);
      const matchFree = t.freeReward.some((r) => r.label.toLowerCase().includes(query));
      const matchGolden = t.goldenReward.some((r) => r.label.toLowerCase().includes(query));
      return matchLvl || matchFree || matchGolden;
    });
  }

  return list;
});

// Ready to claim count
const readyCount = computed(() => {
  let count = 0;
  for (const t of milestoneTiers.value) {
    if (t.freeReady) count++;
    if (t.goldenReady) count++;
  }
  return count;
});

// Highest unlocked level & total levels
const totalLevels = computed(() => milestoneTiers.value.length);
const completedLevels = computed(() => milestoneTiers.value.filter((t) => t.status === 'completed').length);
const highestUnlockedLevel = computed(() => {
  const unlocked = milestoneTiers.value.filter((t) => t.isUnlocked);
  return unlocked.length > 0 ? unlocked[unlocked.length - 1].level : 0;
});
const progressPercent = computed(() => {
  if (totalLevels.value === 0) return 0;
  return Math.min(100, Math.round((highestUnlockedLevel.value / totalLevels.value) * 100));
});

// RPC Claim actions
async function claimTierReward(tier: BattlePassMilestoneTier) {
  if (isClaiming.value || !currentPass.value) return;

  const pairs: [number, number][] = [];
  if (tier.freeReady && tier.freeTrackId != null) pairs.push([tier.levelId, tier.freeTrackId]);
  if (tier.goldenReady && tier.goldenTrackId != null) pairs.push([tier.levelId, tier.goldenTrackId]);

  if (pairs.length === 0) return;

  isClaiming.value = true;
  claimStatus.value = `Claiming Level ${tier.level} rewards...`;
  try {
    const res = await dispatchRpc([
      {
        name: 'claimBattlepassRewardAll',
        args: {
          battlepassId: currentPass.value.id,
          levelIdAndTrackIdToClaim: pairs,
          claimedAt: new Date().toISOString(),
        },
        feature: 'battlepass',
      },
      { name: 'userGetInfo', args: {} },
      { name: 'inventoryGet', args: {} },
      { name: 'getBattlepassState', feature: 'battlepass', args: {} },
    ]);

    if (res?.ok !== false) {
      claimStatus.value = `Level ${tier.level} claimed!`;
      await refreshData();
    } else {
      claimStatus.value = res?.error || 'Failed to claim reward';
    }
  } catch (err: any) {
    claimStatus.value = err?.message || 'Error claiming reward';
  } finally {
    isClaiming.value = false;
    setTimeout(() => {
      claimStatus.value = '';
    }, 3000);
  }
}

async function claimAllReady() {
  if (isClaiming.value || readyCount.value === 0 || !currentPass.value) return;

  const pairs: [number, number][] = [];
  for (const t of milestoneTiers.value) {
    if (t.freeReady && t.freeTrackId != null) pairs.push([t.levelId, t.freeTrackId]);
    if (t.goldenReady && t.goldenTrackId != null) pairs.push([t.levelId, t.goldenTrackId]);
  }

  if (pairs.length === 0) return;

  isClaiming.value = true;
  claimStatus.value = `Claiming ${pairs.length} rewards...`;
  try {
    const res = await dispatchRpc([
      {
        name: 'claimBattlepassRewardAll',
        args: {
          battlepassId: currentPass.value.id,
          levelIdAndTrackIdToClaim: pairs,
          claimedAt: new Date().toISOString(),
        },
        feature: 'battlepass',
      },
      { name: 'userGetInfo', args: {} },
      { name: 'inventoryGet', args: {} },
      { name: 'getBattlepassState', feature: 'battlepass', args: {} },
    ]);

    if (res?.ok !== false) {
      claimStatus.value = `Successfully claimed ${pairs.length} rewards!`;
      await refreshData();
    } else {
      claimStatus.value = res?.error || 'Failed to claim rewards';
    }
  } catch (err: any) {
    claimStatus.value = err?.message || 'Error claiming rewards';
  } finally {
    isClaiming.value = false;
    setTimeout(() => {
      claimStatus.value = '';
    }, 3000);
  }
}

async function refreshData() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await dispatchRpc([
      { name: 'getBattlepassState', feature: 'battlepass', args: {} },
      { name: 'userGetInfo', args: {} },
    ]);
    await loadDynamicCatalog();
  } finally {
    isRefreshing.value = false;
  }
}

function exportCurrentPassData() {
  exportEventsAsJson(cache.value, dynamicCatalog.value, {
    selectedPassId: selectedPassId.value,
    currentPass: currentPass.value,
  }, `hwa-battlepass-${selectedPassId.value || 'data'}`);
  claimStatus.value = 'Exported JSON!';
  setTimeout(() => { claimStatus.value = ''; }, 3000);
}

async function copyCurrentPassData() {
  const ok = await copyEventsToClipboard(cache.value, dynamicCatalog.value, {
    selectedPassId: selectedPassId.value,
    currentPass: currentPass.value,
  });
  claimStatus.value = ok ? 'Copied JSON to clipboard!' : 'Failed to copy';
  setTimeout(() => { claimStatus.value = ''; }, 3000);
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Battle Pass & Season Milestones"
    icon="🎖️"
    max-width="max-w-4xl"
    modal-name="battlePass"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="space-y-3.5">
      <!-- 1. Battle Pass Switcher Horizontal Tabs -->
      <div v-if="availablePasses.length > 0" class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        <button
          v-for="bp in availablePasses"
          :key="bp.id"
          type="button"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          :class="
            String(selectedPassId) === String(bp.id)
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          "
          @click="selectedPassId = bp.id"
        >
          <span>🎖️ {{ bp.title }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-3xs font-bold"
            :class="
              String(selectedPassId) === String(bp.id)
                ? 'bg-amber-800/60 text-amber-100'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            "
          >
            {{ formatNumber(bp.points) }} EXP
          </span>
        </button>
      </div>

      <!-- 2. Current Battle Pass Header Banner -->
      <div
        v-if="currentPass"
        class="rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white dark:from-amber-950/40 dark:via-orange-950/30 dark:to-slate-900 p-3.5"
      >
        <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-3 rounded-full bg-amber-500 animate-pulse"></span>
            <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {{ currentPass.title }} (#{{ currentPass.id }})
            </h4>
            <span
              class="rounded-full px-2 py-0.5 text-3xs font-semibold"
              :class="
                currentPass.hasGoldenPass
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700/60'
                  : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
              "
            >
              {{ currentPass.hasGoldenPass ? '⭐ Golden Pass Active' : 'Free Track Active' }}
            </span>
          </div>
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300">
            ⏳ {{ formatRemaining(currentPass.expiresAt, currentPass.endTime) }}
          </span>
        </div>

        <!-- Progress Overview -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>
              Pass Progress:
              <strong class="text-amber-700 dark:text-amber-300 font-bold">
                Level {{ highestUnlockedLevel }} / {{ totalLevels }}
              </strong>
              ({{ completedLevels }} claimed)
            </span>
            <span class="font-bold text-amber-600 dark:text-amber-400">
              {{ formatNumber(currentPass.points) }} EXP ({{ progressPercent }}%)
            </span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              class="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- 3. Toolbar: Filter Buttons & Search -->
      <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div class="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'all'
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/80 dark:text-amber-100 dark:border-amber-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'all'"
          >
            All Levels ({{ milestoneTiers.length }})
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'ready'
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/80 dark:text-emerald-100 dark:border-emerald-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'ready'"
          >
            Claim Ready ({{ readyCount }})
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'unlocked'
                ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/80 dark:text-blue-100 dark:border-blue-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'unlocked'"
          >
            Unlocked
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border"
            :class="
              currentFilter === 'locked'
                ? 'bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 font-semibold shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            "
            @click="currentFilter = 'locked'"
          >
            Locked
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search level or reward..."
            class="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-36 sm:w-48"
          />
          <button
            id="bp-export-json"
            type="button"
            class="px-2 py-1 rounded text-2xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
            title="Export Battle Pass data as JSON"
            @click="exportCurrentPassData"
          >
            <span>📥</span>
            <span>Export</span>
          </button>
          <button
            id="bp-copy-json"
            type="button"
            class="px-1.5 py-1 rounded text-2xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
            title="Copy Battle Pass JSON to clipboard"
            @click="copyCurrentPassData"
          >
            <span>📋</span>
          </button>
        </div>
      </div>

      <!-- 4. Milestone Tiers Ladder -->
      <div class="space-y-2">
        <div
          v-for="tier in filteredTiers"
          :key="tier.levelId"
          class="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors"
          :class="
            tier.status === 'completed'
              ? 'bg-slate-50/80 dark:bg-slate-850/60 border-slate-200 dark:border-slate-700/80'
              : tier.status === 'ready'
              ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 shadow-xs'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          "
        >
          <!-- Level & Points requirement -->
          <div class="flex items-center gap-3 min-w-0">
            <span
              class="size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border"
              :class="
                tier.status === 'completed'
                  ? 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/60 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                  : tier.status === 'ready'
                  ? 'bg-amber-500 border-amber-500 text-white font-extrabold animate-pulse'
                  : 'bg-slate-100 border-slate-300 dark:bg-slate-700 dark:border-slate-600 text-slate-700 dark:text-slate-300'
              "
            >
              {{ tier.status === 'completed' ? '✓' : `#${tier.level}` }}
            </span>

            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  Level {{ tier.level }}
                </span>
                <span class="rounded px-1.5 py-0.2 text-3xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                  🎯 Target: {{ formatNumber(tier.points) }} EXP
                </span>
                <span
                  v-if="tier.status === 'ready'"
                  class="rounded-full bg-emerald-500 text-white px-2 py-0.2 text-3xs font-bold animate-pulse"
                >
                  🎉 Unlocked!
                </span>
                <span
                  v-else-if="!tier.isUnlocked"
                  class="text-3xs text-slate-400 dark:text-slate-500"
                >
                  Need {{ formatNumber(tier.points - (currentPass?.points || 0)) }} more EXP
                </span>
              </div>

              <!-- Unlocked Status Info -->
              <div class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span v-if="tier.status === 'completed'" class="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ All rewards claimed
                </span>
                <span v-else-if="tier.status === 'ready'" class="text-amber-700 dark:text-amber-300 font-semibold">
                  🎁 Ready to claim: {{ [tier.freeReady ? 'Free Reward' : null, tier.goldenReady ? 'Golden Reward' : null].filter(Boolean).join(' & ') }}
                </span>
                <span v-else class="text-slate-400 dark:text-slate-400">
                  🔒 Locked until {{ formatNumber(tier.points) }} EXP
                </span>
              </div>
            </div>
          </div>

          <!-- Rewards Breakdown & Action -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <!-- Free Track Reward -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Free:
              </span>
              <div v-if="tier.freeReward.length > 0" class="flex items-center gap-1 flex-wrap">
                <span
                  v-for="(r, idx) in tier.freeReward"
                  :key="idx"
                  class="rounded px-1.5 py-0.5 text-2xs font-semibold"
                  :class="r.badgeClass"
                >
                  {{ r.amount.toLocaleString() }} × {{ r.label }}
                </span>
              </div>
              <span v-else class="text-2xs text-slate-400 italic">None</span>
              <span v-if="tier.freeClaimed" class="text-3xs text-emerald-600 dark:text-emerald-400 font-bold">
                ✓
              </span>
            </div>

            <!-- Golden / Premium Track Reward -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-3xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                ⭐ Golden:
              </span>
              <div v-if="tier.goldenReward.length > 0" class="flex items-center gap-1 flex-wrap">
                <span
                  v-for="(r, idx) in tier.goldenReward"
                  :key="idx"
                  class="rounded px-1.5 py-0.5 text-2xs font-semibold border"
                  :class="
                    currentPass?.hasGoldenPass
                      ? r.badgeClass
                      : 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 opacity-60'
                  "
                >
                  {{ r.amount.toLocaleString() }} × {{ r.label }}
                </span>
              </div>
              <span v-else class="text-2xs text-slate-400 italic">None</span>
              <span v-if="tier.goldenClaimed" class="text-3xs text-emerald-600 dark:text-emerald-400 font-bold">
                ✓
              </span>
              <span v-else-if="!currentPass?.hasGoldenPass && tier.goldenReward.length > 0" class="text-3xs text-slate-400">
                (Pass req)
              </span>
            </div>

            <!-- Single Claim Button -->
            <button
              v-if="tier.status === 'ready'"
              type="button"
              class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xs cursor-pointer shadow-xs transition-colors shrink-0 animate-pulse"
              :disabled="isClaiming"
              @click="claimTierReward(tier)"
            >
              Claim
            </button>
          </div>
        </div>

        <div v-if="filteredTiers.length === 0" class="text-center py-8 text-slate-500 dark:text-slate-400 text-xs">
          No milestone tiers match the selected filter.
        </div>
      </div>
    </div>

    <!-- Modal Footer Actions -->
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <div class="text-2xs font-medium text-slate-600 dark:text-slate-300">
          <span v-if="claimStatus" class="font-bold text-amber-600 dark:text-amber-400 animate-pulse">
            {{ claimStatus }}
          </span>
          <span v-else-if="readyCount > 0" class="text-emerald-600 dark:text-emerald-400 font-bold">
            🎉 {{ readyCount }} battle pass rewards ready to claim!
          </span>
          <span v-else>
            Battle pass progress synchronized with game server
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="readyCount > 0"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1"
            :disabled="isClaiming"
            @click="claimAllReady"
          >
            <span>🎁 Claim All ({{ readyCount }})</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs cursor-pointer transition-colors flex items-center gap-1"
            :disabled="isRefreshing"
            @click="refreshData"
          >
            <span :class="{ 'animate-spin': isRefreshing }">🔄</span>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs cursor-pointer transition-colors"
            @click="$emit('update:modelValue', false)"
          >
            Close
          </button>
        </div>
      </div>
    </template>
  </ModalDialog>
</template>
