<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import {
  buildGearRecipeTree,
  findFirstUnfulfilledNode,
  getItemName,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc, updateCacheLocally } = useRpcCache();
const { modalContext } = useModals();

const missionId = ref(135);
const isRaidRunning = ref(false);
const abortCampaignRaidLoop = ref(false);
const loopStatusMsg = ref('');
const campaignRaidSequential = ref(false);
const localRaidResult = ref<any>(null);

const quickMissions = [135, 10, 20, 50, 80, 100, 120, 150];

const selectedGearId = ref<number | string | null>(null);
const selectedRecipeNodeId = ref<string | null>(null);

const disabledMissionsToday = ref<Set<number>>(new Set());

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDisabledMissions() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get('campaign_disabled_missions');
      const val = stored.campaign_disabled_missions;
      if (val && val.date === getTodayKey() && Array.isArray(val.missionIds)) {
        disabledMissionsToday.value = new Set(val.missionIds.map(Number));
      } else {
        disabledMissionsToday.value = new Set();
      }
    } catch (_) {}
  }
}

function disableMissionToday(id: number | string) {
  const numId = Number(id);
  if (!numId) return;
  disabledMissionsToday.value.add(numId);
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    chrome.storage.local.set({
      campaign_disabled_missions: {
        date: getTodayKey(),
        missionIds: Array.from(disabledMissionsToday.value),
      },
    }).catch(() => {});
  }
}

function isHeroic(id: number | string): boolean {
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  return Boolean(cMissions?.missions?.[String(id)]?.isHeroic);
}

function getTriesInfo(id: number | string) {
  const numId = Number(id);
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  const isHero = isHeroic(numId);
  if (!isHero) {
    const disabled = disabledMissionsToday.value.has(numId);
    return {
      isHeroic: false,
      maxTries: Infinity,
      triesSpent: 0,
      triesLeft: Infinity,
      isExhausted: disabled,
    };
  }
  const tries = cMissions?.getMissionTries?.(numId, cache.value?.missionGetAll?.data) || {
    isHeroic: true,
    maxTries: 3,
    triesSpent: 0,
    triesLeft: 3,
  };
  const disabled = disabledMissionsToday.value.has(numId) || tries.triesLeft <= 0;
  return {
    ...tries,
    isExhausted: disabled,
  };
}

function isMissionDisabled(id: number | string): boolean {
  return getTriesInfo(id).isExhausted;
}

function getTriesBadge(id: number | string): string {
  const info = getTriesInfo(id);
  if (!info.isHeroic) return '';
  if (info.isExhausted) return '0/3 left';
  return `${info.triesLeft}/${info.maxTries} left`;
}

function getMissionTooltip(id: number | string): string {
  const info = getTriesInfo(id);
  if (!info.isHeroic) {
    return info.isExhausted ? `Mission #${id} temporarily disabled for today due to error` : `Mission #${id}`;
  }
  if (info.isExhausted) {
    return `Hero Mission #${id} - Daily attempt limit reached (0/${info.maxTries} left today)`;
  }
  return `Hero Mission #${id} - ${info.triesLeft}/${info.maxTries} attempts remaining today`;
}

onMounted(async () => {
  await loadDisabledMissions();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get('campaignRaidSequential');
      if (typeof stored.campaignRaidSequential === 'boolean') {
        campaignRaidSequential.value = stored.campaignRaidSequential;
      }
    } catch (_) {}
  }
});

function toggleSequential(val: boolean) {
  campaignRaidSequential.value = val;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    chrome.storage.local.set({ campaignRaidSequential: val }).catch(() => {});
  }
}

watch(
  [() => modalContext.selectedCampaignGearId, () => props.modelValue],
  () => {
    if (props.modelValue) {
      loadDisabledMissions();
    }
    if (modalContext.selectedCampaignGearId != null) {
      selectedGearId.value = modalContext.selectedCampaignGearId;
      const tree = buildGearRecipeTree(selectedGearId.value, cache.value);
      const unfulfilled = findFirstUnfulfilledNode(tree);
      selectedRecipeNodeId.value = unfulfilled ? unfulfilled.id : (tree ? tree.id : null);

      if (selectedRecipeNodeId.value) {
        const cMissions = (globalThis as any).hwaHelperCampaignMissions;
        const candidates = cMissions?.getMissionsForItem?.(selectedRecipeNodeId.value) || [];
        const highest = cMissions?.getHighestRaidableMission?.(
          candidates.map((m: any) => m.id),
          cache.value?.missionGetAll?.data,
          { disabledIds: disabledMissionsToday.value }
        );
        if (highest) {
          missionId.value = highest;
        }
      }
    }
  },
  { immediate: true }
);

const energyStatus = computed(() => cache.value?.energyStatus?.data || {});
const currentEnergy = computed(() => {
  const e = energyStatus.value.energy ?? cache.value?.['resource:energy']?.data?.amount;
  return Number.isFinite(e) ? Number(e) : '—';
});
const maxEnergy = computed(() => {
  const m = energyStatus.value.max ?? cache.value?.['resource:energy']?.data?.cap;
  return Number.isFinite(m) ? Number(m) : '—';
});

const missionCost = computed(() => {
  const cMissions = (globalThis as any).hwaHelperMissionCosts;
  const pair = cMissions?.[missionId.value];
  return pair ? (Number(pair[0]) + Number(pair[1])) : 6;
});

const maxPossibleTimes = computed(() => {
  const cur = typeof currentEnergy.value === 'number' ? currentEnergy.value : 0;
  return Math.max(1, Math.floor(cur / missionCost.value));
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

const socketRefreshMode = ref<'direct' | 'piggyback'>('direct');

async function ensureRpcEnabled() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode']);
      const updates: Record<string, any> = {};
      if (stored.popupRpcEnabled !== true) updates.popupRpcEnabled = true;
      if (!stored.socketRefreshMode) updates.socketRefreshMode = 'piggyback';
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      socketRefreshMode.value = (stored.socketRefreshMode as any) || 'piggyback';
    } catch (_) {}
  }
}

async function switchToDirectMode() {
  socketRefreshMode.value = 'direct';
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ socketRefreshMode: 'direct', popupRpcEnabled: true });
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
      ensureRpcEnabled();
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// Recipe Tree
const recipeTree = computed(() => {
  if (!selectedGearId.value) return null;
  return buildGearRecipeTree(selectedGearId.value, cache.value);
});

// Candidate missions for selected recipe node
const candidateMissions = computed(() => {
  const targetId = selectedRecipeNodeId.value || selectedGearId.value;
  if (!targetId) return [];
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  return cMissions?.getMissionsForItem?.(targetId) || [];
});

function selectRecipeNode(node: any) {
  selectedRecipeNodeId.value = node.id;
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  const candidates = cMissions?.getMissionsForItem?.(node.id) || [];
  const highest = cMissions?.getHighestRaidableMission?.(
    candidates.map((m: any) => m.id),
    cache.value?.missionGetAll?.data,
    { disabledIds: disabledMissionsToday.value }
  );
  if (highest) {
    missionId.value = highest;
  }
}

const isCrafting = ref(false);

async function craftNode(node: any) {
  isCrafting.value = true;
  try {
    const kind = node.fragment || node.isScroll ? 'craft-fragment' : 'craft-recipe';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { kind, type: node.isScroll ? 'scroll' : 'gear', libId: Number(node.id), amount: 1 },
        () => {
          setTimeout(() => {
            dispatchRpc([{ name: 'inventoryGet' }]);
            isCrafting.value = false;
          }, 500);
        }
      );
    } else {
      await dispatchRpc([
        {
          name: kind === 'craft-fragment' ? 'inventoryCraftFragments' : 'inventoryCraftRecipe',
          args: { libId: Number(node.id), amount: 1 },
        },
        { name: 'inventoryGet' },
      ]);
      isCrafting.value = false;
    }
  } catch (_) {
    isCrafting.value = false;
  }
}

function findNodeInTree(node: any, targetId: string | number): any {
  if (!node) return null;
  if (String(node.id) === String(targetId)) return node;
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      const found = findNodeInTree(c, targetId);
      if (found) return found;
    }
  }
  return null;
}

function isNodeRequirementMet(node: any): boolean {
  if (!node) return false;
  if (node.fragment) {
    return Number(node.fragment.owned) >= Number(node.fragment.required);
  }
  return Number(node.owned) >= Number(node.requiredCount || 1);
}

function mergeDropsIntoAccumulator(acc: any, drops: any) {
  if (!drops) return;
  acc.gold = (acc.gold || 0) + (drops.gold || 0);
  acc.experience = (acc.experience || 0) + (drops.experience || 0);
  for (const cat of ['fragmentGear', 'fragmentScroll', 'gear', 'scroll', 'consumable']) {
    if (drops[cat]) {
      acc[cat] = acc[cat] || {};
      for (const [id, count] of Object.entries(drops[cat])) {
        acc[cat][id] = (acc[cat][id] || 0) + Number(count);
      }
    }
  }
}

function mergeDropsToInventory(drops: any) {
  if (!drops) return;
  updateCacheLocally((draft) => {
    if (!draft.inventoryGet?.data) return;
    const inv = draft.inventoryGet.data;
    for (const cat of ['fragmentGear', 'fragmentScroll', 'gear', 'scroll', 'consumable']) {
      if (drops[cat]) {
        inv[cat] = { ...(inv[cat] || {}) };
        for (const [id, count] of Object.entries(drops[cat])) {
          inv[cat][id] = (Number(inv[cat][id]) || 0) + Number(count);
        }
      }
    }
  });
}

async function waitForRaidResult(prevUpdatedAt?: string, timeoutMs = 3500): Promise<{ ok: boolean; drops?: any; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cur = cache.value?.lastCampaignRaidResult;
    if (cur && cur.updatedAt !== prevUpdatedAt) {
      if (cur.data?.failed) {
        return { ok: false, error: cur.data?.error || 'Raid failed' };
      }
      return { ok: true, drops: cur.data?.currentDrops || cur.data?.drops };
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  const cur = cache.value?.lastCampaignRaidResult;
  if (cur?.data?.failed) {
    return { ok: false, error: cur.data?.error || 'Raid failed' };
  }
  return { ok: true, drops: cur?.data?.currentDrops || cur?.data?.drops };
}

async function executeRaidCall(times: number): Promise<{ ok: boolean; drops?: any; error?: string }> {
  await ensureRpcEnabled();

  const tries = getTriesInfo(missionId.value);
  if (tries.isExhausted) {
    disableMissionToday(missionId.value);
    return {
      ok: false,
      error: `Mission #${missionId.value} daily limit reached (0/${tries.maxTries} left today).`,
    };
  }

  const prevUpdatedAt = cache.value?.lastCampaignRaidResult?.updatedAt;

  // Primary: Direct RPC with game parity calls
  try {
    const resp: any = await dispatchRpc([
      {
        name: 'missionRaid',
        args: { id: Number(missionId.value), times: Number(times) },
      },
      { name: 'playable_getAvailable' },
      { name: 'worldStars_getAvailable' },
    ]);
    if (resp && resp.ok === false) {
      disableMissionToday(missionId.value);
      return { ok: false, error: resp.error || 'Raid RPC rejected' };
    }
    if (resp?.queued) {
      loopStatusMsg.value = 'Notice: RPC queued in piggyback mode. Switch to Direct mode for instant execution.';
    }

    const raidRes = await waitForRaidResult(prevUpdatedAt);
    if (!raidRes.ok) {
      disableMissionToday(missionId.value);
      return { ok: false, error: raidRes.error || 'Raid rejected by server' };
    }
    return { ok: true, drops: raidRes.drops };
  } catch (err: any) {
    // Secondary fallback via background message
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { kind: 'campaign-raid', missionId: Number(missionId.value), times: Number(times) },
          (r) => {
            if (chrome.runtime?.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(r || { ok: true });
            }
          }
        );
      });
      if (res?.ok) {
        const raidRes = await waitForRaidResult(prevUpdatedAt);
        if (!raidRes.ok) {
          disableMissionToday(missionId.value);
          return { ok: false, error: raidRes.error };
        }
        return { ok: true, drops: raidRes.drops };
      }
      if (res?.error) {
        disableMissionToday(missionId.value);
        return { ok: false, error: res.error };
      }
    }
    disableMissionToday(missionId.value);
    return { ok: false, error: err?.message || 'Raid RPC failed' };
  }
}

async function executeSequentialLoop(totalTimes: number) {
  isRaidRunning.value = true;
  abortCampaignRaidLoop.value = false;
  let completed = 0;

  // Determine target requirement state BEFORE starting the loop
  const targetId = selectedRecipeNodeId.value || selectedGearId.value;
  let wasInitiallyFulfilled = false;
  if (targetId && recipeTree.value) {
    const targetNode = findNodeInTree(recipeTree.value, targetId);
    wasInitiallyFulfilled = isNodeRequirementMet(targetNode);
  }

  const accumulatedDrops: any = {
    fragmentGear: {},
    fragmentScroll: {},
    gear: {},
    scroll: {},
    consumable: {},
    gold: 0,
    experience: 0,
  };

  try {
    for (let i = 1; i <= totalTimes; i++) {
      if (abortCampaignRaidLoop.value) {
        loopStatusMsg.value = `Raid loop stopped by user at ${completed}/${totalTimes}`;
        break;
      }

      const tries = getTriesInfo(missionId.value);
      if (tries.isExhausted) {
        loopStatusMsg.value = `Daily limit reached for Mission #${missionId.value} (${tries.triesSpent}/${tries.maxTries} attempts used). Loop stopped.`;
        disableMissionToday(missionId.value);
        break;
      }

      const curEnergy = Number(currentEnergy.value);
      if (Number.isFinite(curEnergy) && curEnergy < missionCost.value) {
        loopStatusMsg.value = `Out of Energy (${curEnergy}/${missionCost.value}) at raid ${completed}/${totalTimes}`;
        break;
      }

      loopStatusMsg.value = `Raiding ${i}/${totalTimes}...`;

      const res = await executeRaidCall(1);
      if (!res.ok) {
        loopStatusMsg.value = `❌ Raid stopped at ${i}/${totalTimes}: ${res.error}`;
        disableMissionToday(missionId.value);
        break;
      }

      completed++;

      if (res.drops) {
        mergeDropsIntoAccumulator(accumulatedDrops, res.drops);
        localRaidResult.value = {
          missionId: missionId.value,
          times: completed,
          drops: accumulatedDrops,
        };
      }

      // Check auto-stop condition for target item:
      if (targetId && !wasInitiallyFulfilled && selectedGearId.value) {
        const freshTree = buildGearRecipeTree(selectedGearId.value, cache.value);
        const freshNode = findNodeInTree(freshTree, targetId);
        if (freshNode && isNodeRequirementMet(freshNode)) {
          loopStatusMsg.value = `Target requirement reached (${freshNode.name})! Stopped raid loop automatically at ${completed}/${totalTimes}.`;
          break;
        }
      }

      if (i < totalTimes && !abortCampaignRaidLoop.value) {
        await new Promise((r) => setTimeout(r, 650));
      }
    }
  } finally {
    isRaidRunning.value = false;
    abortCampaignRaidLoop.value = false;
    dispatchRpc([{ name: 'inventoryGet' }]).catch(() => {});
  }
}

async function startRaid(times: number) {
  loopStatusMsg.value = '';

  const tries = getTriesInfo(missionId.value);
  if (tries.isExhausted) {
    loopStatusMsg.value = `Mission #${missionId.value} daily limit reached (${tries.triesSpent}/${tries.maxTries} attempts used).`;
    disableMissionToday(missionId.value);
    return;
  }

  const effectiveTimes = tries.isHeroic ? Math.min(times, tries.triesLeft) : times;
  if (effectiveTimes <= 0) {
    loopStatusMsg.value = `No attempts remaining today for Mission #${missionId.value}.`;
    disableMissionToday(missionId.value);
    return;
  }

  if (campaignRaidSequential.value && effectiveTimes > 1) {
    await executeSequentialLoop(effectiveTimes);
  } else {
    isRaidRunning.value = true;
    try {
      const res = await executeRaidCall(effectiveTimes);
      if (res.ok) {
        if (res.drops) {
          localRaidResult.value = {
            missionId: missionId.value,
            times: effectiveTimes,
            drops: res.drops,
          };
        }
      } else {
        const errLower = String(res.error || '').toLowerCase();
        if (errLower.includes('vip') || errLower.includes('notenough')) {
          loopStatusMsg.value = 'VIP limit detected, switching to sequential loop...';
          toggleSequential(true);
          await executeSequentialLoop(effectiveTimes);
          return;
        }
        loopStatusMsg.value = res.error || 'Raid failed';
        disableMissionToday(missionId.value);
      }
    } finally {
      isRaidRunning.value = false;
      dispatchRpc([{ name: 'inventoryGet' }]).catch(() => {});
    }
  }
}

const latestRaidResult = computed(() => {
  return localRaidResult.value || cache.value?.lastCampaignRaidResult?.data || null;
});

const targetItemProgress = computed(() => {
  const targetId = selectedRecipeNodeId.value || selectedGearId.value;
  if (!targetId || !recipeTree.value) return null;
  const node = findNodeInTree(recipeTree.value, targetId);
  if (!node) return null;
  const isFrag = Boolean(node.fragment);
  const owned = isFrag ? Number(node.fragment.owned) : Number(node.owned);
  const required = isFrag ? Number(node.fragment.required) : Number(node.requiredCount || 1);
  return {
    id: String(targetId),
    name: node.name,
    isFragment: isFrag,
    owned,
    required,
    isFulfilled: owned >= required,
  };
});

const sessionFarmedCount = computed(() => {
  const d = latestRaidResult.value?.drops;
  const targetId = selectedRecipeNodeId.value || selectedGearId.value;
  if (!d || !targetId) return 0;
  const strId = String(targetId);
  const fg = Number(d.fragmentGear?.[strId] || 0);
  const fs = Number(d.fragmentScroll?.[strId] || 0);
  const g = Number(d.gear?.[strId] || 0);
  const s = Number(d.scroll?.[strId] || 0);
  return fg + fs + g + s;
});

const hasDropItems = computed(() => {
  const d = latestRaidResult.value?.drops;
  if (!d) return false;
  return Boolean(
    (d.fragmentGear && Object.keys(d.fragmentGear).length > 0) ||
    (d.fragmentScroll && Object.keys(d.fragmentScroll).length > 0) ||
    (d.gear && Object.keys(d.gear).length > 0) ||
    (d.scroll && Object.keys(d.scroll).length > 0) ||
    (d.consumable && Object.keys(d.consumable).length > 0)
  );
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="campaign-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-dialog-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="close"
    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0" aria-hidden="true">⚔️</span>
            <h2 id="campaign-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
              Campaign Raid & Equipment Farm
            </h2>
            <div id="campaign-dialog-status" class="flex items-center gap-2 truncate">
              <span class="text-xs text-slate-500 dark:text-slate-400">
                Story mission progression & item drops
              </span>
            </div>
          </div>

          <button
            type="button"
            class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close Campaign Farm dialog"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div id="campaign-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)] text-xs">
          <!-- Energy & Status Banner -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
            <div class="space-y-0.5">
              <div class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>⚡</span> Campaign Mission Raid
              </div>
              <div class="text-2xs text-slate-500 dark:text-slate-400">
                Raid campaign missions to farm equipment, fragments, and gold
              </div>
            </div>

            <div class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-bold text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
              <span>⚡ Energy:</span>
              <span class="text-sm font-extrabold">{{ currentEnergy }}</span>
              <span v-if="maxEnergy !== '—'" class="text-amber-500">/ {{ maxEnergy }}</span>
            </div>
          </div>

          <!-- Dispatch Mode Warning Banner (if piggyback mode active) -->
          <div
            v-if="socketRefreshMode === 'piggyback'"
            class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <span>⚠️</span>
              <span class="truncate">Piggyback mode is active. Automatic raid loops require Direct mode for synchronous execution.</span>
            </div>
            <button
              type="button"
              class="cursor-pointer shrink-0 px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 font-bold transition-colors"
              @click="switchToDirectMode"
            >
              Switch to Direct
            </button>
          </div>

          <!-- Recipe Tree Hierarchy Section (if farming a gear) -->
          <div v-if="recipeTree" class="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                <span>🛠️</span> Crafting Recipe Tree: <strong class="text-indigo-600 dark:text-indigo-400">{{ recipeTree.name }}</strong>
              </div>
              <button
                v-if="recipeTree.canCraft"
                type="button"
                :disabled="isCrafting"
                class="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-2xs cursor-pointer shadow-xs disabled:opacity-50"
                @click="craftNode(recipeTree)"
              >
                {{ isCrafting ? '...' : 'Craft Item' }}
              </button>
            </div>

            <!-- Root & Children Nodes -->
            <div class="space-y-1.5">
              <div
                class="p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors"
                :class="
                  selectedRecipeNodeId === recipeTree.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                "
                @click="selectRecipeNode(recipeTree)"
              >
                <div class="flex items-center gap-2">
                  <span>🛡️</span>
                  <span class="font-bold">{{ recipeTree.name }}</span>
                  <span class="text-slate-400 text-2xs">Owned: {{ recipeTree.owned }}</span>
                </div>

                <div class="flex items-center gap-1.5">
                  <span
                    v-if="recipeTree.fragment"
                    class="text-2xs font-semibold px-1.5 py-0.5 rounded"
                    :class="
                      recipeTree.fragment.isFulfilled
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    "
                  >
                    Fragments: {{ recipeTree.fragment.owned }}/{{ recipeTree.fragment.required }}
                  </span>
                  <span
                    v-if="recipeTree.isFulfilled"
                    class="text-2xs font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    ✓ Ready
                  </span>
                </div>
              </div>

              <!-- Children Components -->
              <div v-if="recipeTree.children?.length > 0" class="pl-4 space-y-1 border-l-2 border-indigo-200 dark:border-indigo-800">
                <div
                  v-for="c in recipeTree.children"
                  :key="c.id"
                  class="p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors"
                  :class="
                    selectedRecipeNodeId === c.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 dark:border-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  "
                  @click="selectRecipeNode(c)"
                >
                  <div class="flex items-center gap-2">
                    <span>{{ c.isScroll ? '📜' : '🧩' }}</span>
                    <span class="font-medium">{{ c.name }}</span>
                    <span class="text-slate-400 text-2xs">Req: {{ c.requiredCount }} · Owned: {{ c.owned }}</span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <span
                      v-if="c.fragment"
                      class="text-2xs font-semibold px-1.5 py-0.5 rounded"
                      :class="
                        c.fragment.isFulfilled
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      "
                    >
                      Frags: {{ c.fragment.owned }}/{{ c.fragment.required }}
                    </span>
                    <button
                      v-if="c.canCraft"
                      type="button"
                      :disabled="isCrafting"
                      class="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-3xs cursor-pointer shadow-xs disabled:opacity-50"
                      @click.stop="craftNode(c)"
                    >
                      Craft
                    </button>
                    <span
                      v-else-if="c.isFulfilled"
                      class="text-2xs font-bold text-emerald-600 dark:text-emerald-400"
                    >
                      ✓
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Mission Setup & Candidate Chips -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs">
            <div class="flex items-center justify-between gap-2">
              <label class="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Target Campaign Mission
              </label>
              <div class="flex items-center gap-1.5">
                <span class="text-2xs text-slate-400">Mission ID:</span>
                <input
                  id="campaign-mission-input"
                  v-model.number="missionId"
                  type="number"
                  min="1"
                  max="300"
                  class="w-20 rounded border border-slate-300 px-2 py-1 text-center font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus:outline-hidden"
                />
              </div>
            </div>

            <!-- Candidate Missions Chips (from item drop data) -->
            <div v-if="candidateMissions.length > 0" class="space-y-1">
              <div class="text-2xs font-medium text-slate-400">Recommended missions dropping this item:</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="m in candidateMissions"
                  :key="m.id"
                  type="button"
                  :disabled="isMissionDisabled(m.id)"
                  class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-all inline-flex items-center gap-1.5"
                  :class="[
                    isMissionDisabled(m.id)
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-dashed border-slate-300 dark:bg-slate-800/40 dark:border-slate-700 line-through'
                      : missionId === m.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-indigo-400'
                  ]"
                  :title="getMissionTooltip(m.id)"
                  @click="!isMissionDisabled(m.id) && (missionId = m.id)"
                >
                  <span v-if="m.isHeroic" title="Hero Mission (Daily Limit)">🦸</span>
                  <span>Mission #{{ m.id }} (Ch.{{ m.chapter }}-{{ m.index }})</span>
                  <span
                    v-if="m.isHeroic"
                    class="text-3xs px-1 py-0.5 rounded font-bold"
                    :class="missionId === m.id ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'"
                  >
                    {{ getTriesBadge(m.id) }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Quick Jump Chips -->
            <div v-else class="flex flex-wrap gap-1.5">
              <button
                v-for="qId in quickMissions"
                :key="qId"
                type="button"
                :disabled="isMissionDisabled(qId)"
                class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-all inline-flex items-center gap-1.5"
                :class="[
                  isMissionDisabled(qId)
                    ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-dashed border-slate-300 dark:bg-slate-800/40 dark:border-slate-700 line-through'
                    : missionId === qId
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-indigo-400'
                ]"
                :title="getMissionTooltip(qId)"
                @click="!isMissionDisabled(qId) && (missionId = qId)"
              >
                <span v-if="isHeroic(qId)" title="Hero Mission (Daily Limit)">🦸</span>
                <span>Mission #{{ qId }}</span>
                <span
                  v-if="isHeroic(qId)"
                  class="text-3xs px-1 py-0.5 rounded font-bold"
                  :class="missionId === qId ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'"
                >
                  {{ getTriesBadge(qId) }}
                </span>
              </button>
            </div>

            <!-- Warning if Selected Mission is Exhausted or Disabled -->
            <div
              v-if="isMissionDisabled(missionId)"
              class="rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2"
            >
              <span>⛔</span>
              <span>
                Mission #{{ missionId }} has reached its daily attempt limit (0/{{ getTriesInfo(missionId).maxTries }} left today) or was disabled due to an error. Please select another mission above.
              </span>
            </div>

            <!-- Target Progress & Farmed Count Indicator -->
            <div
              v-if="targetItemProgress"
              class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-2xs flex-wrap"
            >
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-600 dark:text-slate-400">Target Item:</span>
                <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ targetItemProgress.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="px-1.5 py-0.5 rounded font-bold"
                  :class="targetItemProgress.isFulfilled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'"
                >
                  Total Owned: {{ targetItemProgress.owned }}/{{ targetItemProgress.required }}
                </span>
                <span
                  v-if="sessionFarmedCount > 0"
                  class="px-1.5 py-0.5 rounded bg-emerald-500 text-white font-extrabold shadow-2xs"
                >
                  +{{ sessionFarmedCount }} Farmed
                </span>
              </div>
            </div>

            <!-- Sequential Loop Option -->
            <div class="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label class="inline-flex items-center gap-1.5 text-2xs cursor-pointer select-none text-slate-600 dark:text-slate-300 font-medium">
                <input
                  id="campaign-raid-sequential"
                  type="checkbox"
                  :checked="campaignRaidSequential"
                  class="rounded border-slate-300 text-indigo-600 dark:border-slate-700 dark:bg-slate-800 focus:ring-indigo-500"
                  @change="toggleSequential(($event.target as HTMLInputElement).checked)"
                />
                <span>Sequential 1x loop (VIP 0 / F2P friendly)</span>
              </label>

              <span class="text-2xs text-slate-500 dark:text-slate-400">
                Cost: ~{{ missionCost }} Energy/raid
              </span>
            </div>

            <!-- Status message / Loop status -->
            <div v-if="loopStatusMsg" class="rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 p-2 text-2xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center justify-between gap-2">
              <span>{{ loopStatusMsg }}</span>
              <span v-if="isRaidRunning" class="animate-spin text-sm">⏳</span>
            </div>

            <!-- Raid Controls -->
            <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <!-- Stop button when loop is actively running -->
              <button
                v-if="isRaidRunning && campaignRaidSequential"
                id="campaign-raid-stop"
                type="button"
                class="cursor-pointer flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
                @click="abortCampaignRaidLoop = true"
              >
                <span>🛑</span> <span>Stop Raid Loop</span>
              </button>

              <template v-else>
                <button
                  id="campaign-raid-1"
                  type="button"
                  :disabled="isRaidRunning || isMissionDisabled(missionId)"
                  class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="isMissionDisabled(missionId) ? 'Mission daily limit reached' : 'Raid 1x'"
                  @click="startRaid(1)"
                >
                  ⚔️ Raid 1x
                </button>
                <button
                  id="campaign-raid-10"
                  type="button"
                  :disabled="isRaidRunning || isMissionDisabled(missionId)"
                  class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="isMissionDisabled(missionId) ? 'Mission daily limit reached' : 'Raid 10x'"
                  @click="startRaid(10)"
                >
                  ⚔️ Raid 10x
                </button>
                <button
                  id="campaign-raid-max"
                  type="button"
                  :disabled="isRaidRunning || maxPossibleTimes < 1 || isMissionDisabled(missionId)"
                  class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-800 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="isMissionDisabled(missionId) ? 'Mission daily limit reached' : `Raid maximum possible times (${maxPossibleTimes}x) based on energy`"
                  @click="startRaid(maxPossibleTimes)"
                >
                  ⚔️ Max ({{ maxPossibleTimes }}x)
                </button>
              </template>
            </div>
          </div>

          <!-- Last Raid Results Drops Card (Matching HTML version) -->
          <div
            v-if="latestRaidResult"
            id="campaign-raid-results"
            class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2.5"
          >
            <div class="flex items-center justify-between text-xs pb-1.5 border-b border-emerald-200/80 dark:border-emerald-800 flex-wrap gap-1">
              <span class="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <span>🎉</span> Raid Results: Mission #{{ latestRaidResult.missionId }} ({{ latestRaidResult.times }} {{ latestRaidResult.times > 1 ? 'raids' : 'raid' }})
              </span>
              <span class="text-2xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 flex-wrap">
                <span v-if="sessionFarmedCount > 0" class="font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                  +{{ sessionFarmedCount }} Target {{ targetItemProgress?.isFragment ? 'Fragments' : 'Items' }}
                </span>
                <span>💰 +{{ formatNumber(latestRaidResult.drops?.gold || 0) }} Gold</span>
                <span>🧪 +{{ latestRaidResult.drops?.experience || 0 }} EXP</span>
              </span>
            </div>

            <div v-if="hasDropItems" class="flex flex-wrap gap-2">
              <!-- Fragment Gear -->
              <span
                v-for="(count, gId) in (latestRaidResult.drops?.fragmentGear || {})"
                :key="`fg-${gId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200 shadow-2xs dark:bg-slate-800 dark:text-indigo-300 dark:border-indigo-800"
              >
                <span>🧩 {{ getItemName('gear', gId) || getItemName('scroll', gId) || `#${gId}` }} Fragment</span>
                <span class="bg-indigo-100 text-indigo-800 px-1 rounded text-2xs dark:bg-indigo-900 dark:text-indigo-200">+{{ count }}</span>
              </span>

              <!-- Fragment Scroll -->
              <span
                v-for="(count, sId) in (latestRaidResult.drops?.fragmentScroll || {})"
                :key="`fs-${sId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200 shadow-2xs dark:bg-slate-800 dark:text-indigo-300 dark:border-indigo-800"
              >
                <span>📜 {{ getItemName('scroll', sId) || getItemName('gear', sId) || `#${sId}` }} Fragment</span>
                <span class="bg-indigo-100 text-indigo-800 px-1 rounded text-2xs dark:bg-indigo-900 dark:text-indigo-200">+{{ count }}</span>
              </span>

              <!-- Whole Gear -->
              <span
                v-for="(count, gId) in (latestRaidResult.drops?.gear || {})"
                :key="`g-${gId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs dark:bg-slate-800 dark:text-emerald-300 dark:border-emerald-800"
              >
                <span>🛡️ {{ getItemName('gear', gId) || `Gear #${gId}` }}</span>
                <span class="bg-emerald-100 text-emerald-800 px-1 rounded text-2xs dark:bg-emerald-900 dark:text-emerald-200">+{{ count }}</span>
              </span>

              <!-- Whole Scroll -->
              <span
                v-for="(count, sId) in (latestRaidResult.drops?.scroll || {})"
                :key="`s-${sId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs dark:bg-slate-800 dark:text-emerald-300 dark:border-emerald-800"
              >
                <span>📜 {{ getItemName('scroll', sId) || `Scroll #${sId}` }}</span>
                <span class="bg-emerald-100 text-emerald-800 px-1 rounded text-2xs dark:bg-emerald-900 dark:text-emerald-200">+{{ count }}</span>
              </span>

              <!-- Consumables -->
              <span
                v-for="(count, cId) in (latestRaidResult.drops?.consumable || {})"
                :key="`c-${cId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              >
                <span>📦 {{ getItemName('consumable', cId) || `Item #${cId}` }}</span>
                <span class="bg-slate-100 text-slate-700 px-1 rounded text-2xs dark:bg-slate-700 dark:text-slate-300">+{{ count }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
