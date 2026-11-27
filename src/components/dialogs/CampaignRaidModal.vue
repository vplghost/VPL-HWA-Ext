<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import RecipeTreeNode from './RecipeTreeNode.vue';
import CampaignMissionPicker from './CampaignMissionPicker.vue';
import MissionDropTooltip from './MissionDropTooltip.vue';
import pickerData from '@/src/data/campaign-picker.json';
import { useCampaignMissionHistory } from '@/src/composables/useCampaignMissionHistory';
import { useStoredFavorites } from '@/src/composables/useStoredFavorites';
import { registerAutopilotDialogRunner } from '@/src/composables/useAutopilotDialogBridge';
import {
  planFavoriteSoulStoneSweep,
  clampReserveEnergy,
  DEFAULT_SOUL_SWEEP_RESERVE_ENERGY,
  SOUL_SWEEP_RESERVE_STORAGE_KEY,
} from '@/src/services/heroSoulSweepService';
import {
  findRecipeNode,
  recipeMissions,
  recipeFarmCategory,
  aggregateHeroLeafEquipment,
  extractDropsFromRaidResponse,
  type HeroLeafResource,
  type HeroLeafEquipmentSummary
} from '@/src/utils/recipeTree';
import { waitForCampaignRaidResult } from '@/src/utils/dialogRpc';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  useModals,
  isTopModal,
  registerModalOpen,
  registerModalClose,
  getModalStackLevel,
} from '@/src/composables/useModals';
import {
  buildGearRecipeTree,
  findFirstUnfulfilledNode,
  getItemName,
  getHeroSoulProgress,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { getEnergy } from '@/src/utils/resourceData';
import { getMissionCosts } from '@/src/data/missionCostData';
import {
  campaignMissions,
  getHighestRaidableMission,
  getMissionTries,
  getHeroSoulMissions,
  isMissionRaidable,
} from '@/src/data/campaignData';
import { heroMetadata } from '@/src/data/heroMetadata';

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

const favoriteHeroes =
  typeof useStoredFavorites === 'function'
    ? useStoredFavorites('favoriteHeroes')
    : ref(new Set<string>());
const soulSweepReserve = ref(
  typeof DEFAULT_SOUL_SWEEP_RESERVE_ENERGY === 'number' ? DEFAULT_SOUL_SWEEP_RESERVE_ENERGY : 30
);
const isSweepingSouls = ref(false);

if (typeof chrome !== 'undefined' && chrome.storage?.local?.get && typeof SOUL_SWEEP_RESERVE_STORAGE_KEY === 'string') {
  chrome.storage.local.get(SOUL_SWEEP_RESERVE_STORAGE_KEY).then((res: any) => {
    if (res?.[SOUL_SWEEP_RESERVE_STORAGE_KEY] != null && typeof clampReserveEnergy === 'function') {
      soulSweepReserve.value = clampReserveEnergy(res[SOUL_SWEEP_RESERVE_STORAGE_KEY]);
    }
  }).catch(() => {});
}

async function saveSoulSweepReserve() {
  if (typeof clampReserveEnergy === 'function') {
    soulSweepReserve.value = clampReserveEnergy(soulSweepReserve.value);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set && typeof SOUL_SWEEP_RESERVE_STORAGE_KEY === 'string') {
    try {
      await chrome.storage.local.set({ [SOUL_SWEEP_RESERVE_STORAGE_KEY]: soulSweepReserve.value });
    } catch (_) {}
  }
}

const soulSweepPlan = computed(() =>
  typeof planFavoriteSoulStoneSweep === 'function'
    ? planFavoriteSoulStoneSweep(cache.value, Array.from(favoriteHeroes.value), {
        reserveEnergy: soulSweepReserve.value,
        disabledMissionIds: disabledMissionsToday.value,
      })
    : {
        eligibleHeroCount: 0,
        totalMissions: 0,
        totalAvailableRaids: 0,
        totalAvailableEnergy: 0,
        plannedRaids: 0,
        plannedEnergy: 0,
        currentEnergy: 0,
        reserveEnergy: soulSweepReserve.value,
        missions: [],
        skippedReason: null,
      }
);

async function runFavoriteSoulSweep() {
  if (isRaidRunning.value || isSweepingSouls.value) return;
  const plan = soulSweepPlan.value;
  if (plan.plannedRaids <= 0) {
    loopStatusMsg.value = plan.skippedReason || 'No eligible favorite Heroic missions to sweep.';
    return;
  }
  isRaidRunning.value = true;
  isSweepingSouls.value = true;
  abortCampaignRaidLoop.value = false;
  let totalDone = 0;
  try {
    for (const m of plan.missions) {
      if (abortCampaignRaidLoop.value) break;
      if (m.plannedRaids <= 0) continue;
      missionId.value = m.missionId;
      loopStatusMsg.value = `Sweeping ${m.heroName} (Mission #${m.missionId}, ${m.plannedRaids}x)…`;
      const res = await executeRaidCall(m.plannedRaids);
      if (!res?.ok) {
        loopStatusMsg.value = res?.error || `Stopped on Mission #${m.missionId}.`;
        break;
      }
      totalDone += m.plannedRaids;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!abortCampaignRaidLoop.value && totalDone > 0) {
      loopStatusMsg.value = `✓ Favorite Soul-Stone Sweep complete (${totalDone} raids).`;
    }
  } finally {
    isSweepingSouls.value = false;
    isRaidRunning.value = false;
    abortCampaignRaidLoop.value = false;
  }
}

const unregisterSoulSweepRunner =
  typeof registerAutopilotDialogRunner === 'function'
    ? registerAutopilotDialogRunner({
        stepId: 'soul-sweep',
        modalName: 'campaign',
        async run({ isAborted }) {
          await loadDisabledMissions();
          const plan = soulSweepPlan.value;
          if (plan.plannedRaids <= 0) {
            return {
              status: 'skipped',
              detail: plan.skippedReason || 'No eligible favorite Heroic missions.',
            };
          }
          await runFavoriteSoulSweep();
          return {
            status: isAborted() ? 'skipped' : 'done',
            detail: loopStatusMsg.value || `Swept ${plan.plannedRaids} Heroic raids (${plan.plannedEnergy}⚡)`,
          };
        },
        stop() {
          abortCampaignRaidLoop.value = true;
        },
      })
    : () => {};

onUnmounted(() => {
  unregisterSoulSweepRunner();
});

const resolveMissionTries = (numId: any, missionData: any) => {
  return getMissionTries(numId, missionData);
};

const resolveHighestRaidableMission = (ids: any, missionData: any, options?: any) => {
  return getHighestRaidableMission(ids, missionData, options);
};
const campaignRaidSequential = ref(false);
const localRaidResult = ref<any>(null);

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const missionHistory = useCampaignMissionHistory(accountId);
const recentMissions = computed(() => {
  const dict = campaignMissions;
  return missionHistory.recent.value.filter(id => Boolean(dict?.[id]));
});
function missionName(id: number) {
  return (pickerData.missions as Record<string, { name: string }>)[id]?.name || `Mission #${id}`;
}

const selectedGearId = ref<number | string | null>(null);
const selectedRecipeNodeId = ref<string | null>(null);
const selectedHeroId = ref<string | null>(null);
const farmMode = ref<'mission' | 'gear' | 'hero' | 'soul'>('mission');
const selectedLeafKey = ref<string | null>(null);

const heroSoulMissions = computed(() => {
  if (!selectedHeroId.value) return [];
  return getHeroSoulMissions(selectedHeroId.value, pickerData?.missions);
});

const heroSoulProgress = computed(() => {
  if (!selectedHeroId.value) return null;
  const hero =
    cache.value?.heroes?.data?.[selectedHeroId.value] ||
    cache.value?.userGetInfo?.data?.heroes?.[selectedHeroId.value];
  return getHeroSoulProgress(selectedHeroId.value, hero, cache.value?.inventoryGet?.data);
});

const heroSoulName = computed(() => {
  if (!selectedHeroId.value) return '';
  return (
    heroLeafSummary.value?.heroName ||
    heroMetadata[selectedHeroId.value]?.name ||
    getItemName('fragmentHero', selectedHeroId.value)?.replace(/ fragment$/i, '') ||
    `Hero #${selectedHeroId.value}`
  );
});

const raidableSoulMissions = computed(() => {
  return heroSoulMissions.value.filter((m) => {
    return isMissionRaidable(m.id, cache.value?.missionGetAll?.data, {
      disabledIds: disabledMissionsToday.value,
    });
  });
});

const totalRaidableSoulTries = computed(() => {
  let count = 0;
  for (const m of raidableSoulMissions.value) {
    const tries = getTriesInfo(m.id);
    if (!tries.isExhausted) {
      count += tries.isHeroic ? tries.triesLeft : 3;
    }
  }
  return count;
});

const canEvolveSoul = computed(() => {
  const p = heroSoulProgress.value;
  if (!p || p.needed === 'Max' || p.needed == null || p.owned == null) return false;
  return Number(p.owned) >= Number(p.needed);
});

const remainingNeededSoul = computed(() => {
  const p = heroSoulProgress.value;
  if (!p || p.needed === 'Max' || p.needed == null || p.owned == null) return 0;
  return Math.max(0, Number(p.needed) - Number(p.owned));
});

const heroLeafSummary = computed<HeroLeafEquipmentSummary | null>(() => {
  const hId = selectedHeroId.value;
  if (!hId) return null;
  return aggregateHeroLeafEquipment(hId, cache.value);
});

const heroLeafResources = computed<HeroLeafResource[]>(() => {
  return heroLeafSummary.value?.leafResources || [];
});

const selectedLeafResource = computed<HeroLeafResource | null>(() => {
  if (farmMode.value !== 'hero') return null;
  if (!selectedLeafKey.value) {
    const firstUnfulfilled = heroLeafResources.value.find((l) => !l.isFulfilled);
    return firstUnfulfilled || heroLeafResources.value[0] || null;
  }
  return heroLeafResources.value.find((l) => `${l.category}:${l.id}` === selectedLeafKey.value) || null;
});

function selectLeafResource(leaf: HeroLeafResource) {
  if (isRaidRunning.value) return;
  selectedLeafKey.value = `${leaf.category}:${leaf.id}`;
  const candidates = leaf.missions || [];
  const highest = resolveHighestRaidableMission(
    candidates.map((m: any) => m.id),
    cache.value?.missionGetAll?.data,
    { disabledIds: disabledMissionsToday.value }
  );
  if (highest) {
    missionId.value = highest;
  }
}

function selectHeroGear(gearId: number | string) {
  selectedGearId.value = gearId;
  const tree = buildGearRecipeTree(gearId, cache.value);
  const unfulfilled = findFirstUnfulfilledNode(tree);
  selectedRecipeNodeId.value = unfulfilled?.key ?? tree?.key ?? null;

  if (selectedRecipeNodeId.value) {
    const candidates = recipeMissions(findRecipeNode(tree, selectedRecipeNodeId.value));
    const highest = resolveHighestRaidableMission(
      candidates.map((m: any) => m.id),
      cache.value?.missionGetAll?.data,
      { disabledIds: disabledMissionsToday.value }
    );
    if (highest) {
      missionId.value = highest;
    }
  }
}

function viewGearRecipeTree(gearId: number | string) {
  farmMode.value = 'gear';
  selectHeroGear(gearId);
}

function clearFarmTarget() {
  if (isRaidRunning.value) return;
  selectedGearId.value = null;
  selectedHeroId.value = null;
  selectedRecipeNodeId.value = null;
  selectedLeafKey.value = null;
  modalContext.selectedCampaignGearId = null;
  modalContext.selectedCampaignHeroId = null;
  modalContext.campaignFarmMode = 'mission';
  farmMode.value = 'mission';
}

function switchFarmMode(mode: 'mission' | 'gear' | 'hero' | 'soul') {
  farmMode.value = mode;
  if (mode === 'soul') {
    const soulCandidates = heroSoulMissions.value;
    const lowestRaidable = soulCandidates.find((m) =>
      isMissionRaidable(m.id, cache.value?.missionGetAll?.data, {
        disabledIds: disabledMissionsToday.value,
      })
    );
    if (lowestRaidable) {
      missionId.value = lowestRaidable.id;
    } else if (soulCandidates.length > 0) {
      missionId.value = soulCandidates[0].id;
    }
  } else if (mode === 'hero') {
    if (selectedLeafResource.value) {
      selectLeafResource(selectedLeafResource.value);
    } else if (heroLeafResources.value.length > 0) {
      const first = heroLeafResources.value.find((l) => !l.isFulfilled) || heroLeafResources.value[0];
      if (first) selectLeafResource(first);
    }
  } else if (mode === 'gear') {
    if (!selectedGearId.value && heroLeafSummary.value?.missingGears?.length) {
      const targetGearId = selectedLeafResource.value?.sourceGears?.[0]?.gearId || heroLeafSummary.value.missingGears[0].gearId;
      selectHeroGear(targetGearId);
    } else if (selectedRecipeNode.value) {
      selectRecipeNode(selectedRecipeNode.value);
    }
  }
}

const disabledMissionsToday = ref<Set<number>>(new Set());

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDisabledMissions() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get('campaign_disabled_missions');
      const val = stored.campaign_disabled_missions as { date?: string; missionIds?: unknown[] } | undefined;
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
  const dict = campaignMissions;
  return Boolean(dict?.[String(id)]?.isHeroic);
}

function getTriesInfo(id: number | string) {
  const numId = Number(id);
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
  const tries = resolveMissionTries(numId, cache.value?.missionGetAll?.data) || {
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
  [
    () => modalContext.selectedCampaignGearId,
    () => modalContext.selectedCampaignHeroId,
    () => modalContext.campaignFarmMode,
    () => props.modelValue,
  ],
  () => {
    if (props.modelValue) {
      loadDisabledMissions();
    }
    if (modalContext.selectedCampaignGearId != null) {
      selectedGearId.value = modalContext.selectedCampaignGearId;
      selectedHeroId.value = null;
      farmMode.value = 'gear';
      const tree = buildGearRecipeTree(selectedGearId.value, cache.value);
      const unfulfilled = findFirstUnfulfilledNode(tree);
      selectedRecipeNodeId.value = unfulfilled?.key ?? tree?.key ?? null;

      if (selectedRecipeNodeId.value) {
        const candidates = recipeMissions(findRecipeNode(tree, selectedRecipeNodeId.value));
        const highest = resolveHighestRaidableMission(
          candidates.map((m: any) => m.id),
          cache.value?.missionGetAll?.data,
          { disabledIds: disabledMissionsToday.value }
        );
        if (highest) {
          missionId.value = highest;
        }
      }
    } else if (modalContext.selectedCampaignHeroId != null) {
      selectedHeroId.value = String(modalContext.selectedCampaignHeroId);
      selectedGearId.value = null;
      if (modalContext.campaignFarmMode === 'soul') {
        farmMode.value = 'soul';
        const soulCandidates = heroSoulMissions.value;
        const lowestRaidable = soulCandidates.find((m) =>
          isMissionRaidable(m.id, cache.value?.missionGetAll?.data, {
            disabledIds: disabledMissionsToday.value,
          })
        );
        if (lowestRaidable) {
          missionId.value = lowestRaidable.id;
        } else if (soulCandidates.length > 0) {
          missionId.value = soulCandidates[0].id;
        }
      } else {
        farmMode.value = 'hero';
        selectedLeafKey.value = null;
        if (selectedLeafResource.value) {
          selectLeafResource(selectedLeafResource.value);
        }
      }
    } else {
      selectedGearId.value = null;
      selectedHeroId.value = null;
      selectedRecipeNodeId.value = null;
      selectedLeafKey.value = null;
      farmMode.value = 'mission';
    }
  },
  { immediate: true }
);

const energyStatus = computed(() => cache.value?.energyStatus?.data || {});
const currentEnergy = computed(() => {
  const e = getEnergy(cache.value, now.value);
  return Number.isFinite(e) ? Number(e) : '—';
});
const maxEnergy = computed(() => {
  const m = energyStatus.value.max ?? cache.value?.['resource:energy']?.data?.cap;
  return Number.isFinite(m) ? Number(m) : '—';
});

const missionCost = computed(() => {
  if (typeof getMissionCosts === 'function') {
    const pair = getMissionCosts(missionId.value);
    return pair ? (Number(pair[0]) + Number(pair[1])) : 6;
  }
  return 6;
});

const maxPossibleTimes = computed(() => {
  const cur = typeof currentEnergy.value === 'number' ? currentEnergy.value : 0;
  return Math.max(1, Math.floor(cur / missionCost.value));
});

const stackLevel = computed(() => getModalStackLevel('campaign'));

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (!isTopModal('campaign')) return;
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
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
      if (!stored.socketRefreshMode) updates.socketRefreshMode = 'direct';
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      socketRefreshMode.value = (stored.socketRefreshMode as any) || 'direct';
    } catch (_) {}
  }
}

async function switchToDirectMode() {
  socketRefreshMode.value = 'direct';
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ socketRefreshMode: 'direct', popupRpcEnabled: true });
  }
}

const now = ref(Date.now());
let nowTimer: any = null;

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      now.value = Date.now();
      if (!nowTimer) {
        nowTimer = setInterval(() => {
          now.value = Date.now();
        }, 1000);
      }
      registerModalOpen('campaign');
      document.addEventListener('keydown', handleKeydown);
      ensureRpcEnabled();
    } else {
      if (nowTimer) {
        clearInterval(nowTimer);
        nowTimer = null;
      }
      registerModalClose('campaign');
      document.removeEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
  registerModalClose('campaign');
  document.removeEventListener('keydown', handleKeydown);
});

// Recipe Tree
const recipeTree = computed(() => {
  if (!selectedGearId.value) return null;
  return buildGearRecipeTree(selectedGearId.value, cache.value);
});

const selectedRecipeNode = computed(() => selectedRecipeNodeId.value
  ? findRecipeNode(recipeTree.value, selectedRecipeNodeId.value) : recipeTree.value);

// Candidate missions for selected recipe node, selected hero leaf resource, or soul stones
const candidateMissions = computed(() => {
  if (farmMode.value === 'soul') {
    return heroSoulMissions.value;
  }
  if (farmMode.value === 'hero') {
    return selectedLeafResource.value?.missions || [];
  }
  return recipeMissions(selectedRecipeNode.value);
});

const canFarmSelectedTarget = computed(() => {
  if (farmMode.value === 'mission' && !selectedGearId.value && !selectedHeroId.value) {
    return true;
  }
  if (farmMode.value === 'soul') {
    return heroSoulMissions.value.some((m) => Number(m.id) === Number(missionId.value));
  }
  if (farmMode.value === 'hero') {
    if (!selectedLeafResource.value) return true;
    return candidateMissions.value.some((mission: any) => Number(mission.id) === Number(missionId.value));
  }
  return !selectedGearId.value ||
    candidateMissions.value.some((mission: any) => Number(mission.id) === Number(missionId.value));
});

function selectRecipeNode(node: any) {
  if (isRaidRunning.value) return;
  selectedRecipeNodeId.value = node.key;
  const candidates = recipeMissions(node);
  const highest = resolveHighestRaidableMission(
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
  if (isCrafting.value || isRaidRunning.value || !node.canCraft) return;
  isCrafting.value = true;
  try {
    const kind = node.fragment ? 'craft-fragment' : 'craft-recipe';
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
          args: { type: node.category, libId: Number(node.id), amount: 1 },
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
  return findRecipeNode(node, targetId);
}

function isNodeRequirementMet(node: any): boolean {
  if (!node) return false;
  if (node.isFulfilled) return true;
  if (node.fragment) {
    return Number(node.fragment.owned) >= Number(node.fragment.required);
  }
  return Number(node.owned) >= Number(node.requiredCount ?? 1);
}

function mergeDropsIntoAccumulator(acc: any, rawDrops: any) {
  if (!rawDrops) return;
  const drops = extractDropsFromRaidResponse(rawDrops);
  acc.gold = (acc.gold || 0) + (drops.gold || 0);
  acc.experience = (acc.experience || 0) + (drops.experience || 0);
  for (const cat of ['fragmentGear', 'fragmentScroll', 'gear', 'scroll', 'consumable', 'fragmentHero']) {
    if (drops[cat]) {
      acc[cat] = acc[cat] || {};
      for (const [id, count] of Object.entries(drops[cat])) {
        acc[cat][id] = (acc[cat][id] || 0) + Number(count);
      }
    }
  }
}

function mergeDropsToInventory(rawDrops: any) {
  if (!rawDrops) return;
  const drops = extractDropsFromRaidResponse(rawDrops);
  if (typeof updateCacheLocally === 'function') {
    updateCacheLocally((draft) => {
      if (!draft.inventoryGet?.data) return;
      const inv = draft.inventoryGet.data;
      for (const cat of ['fragmentGear', 'fragmentScroll', 'gear', 'scroll', 'consumable', 'fragmentHero']) {
        if (drops[cat]) {
          inv[cat] = { ...(inv[cat] || {}) };
          for (const [id, count] of Object.entries(drops[cat])) {
            inv[cat][id] = (Number(inv[cat][id]) || 0) + Number(count);
          }
        }
      }
    });
  }
}

async function waitForRaidResult(prevUpdatedAt?: string, timeoutMs = 3500) {
  return waitForCampaignRaidResult(
    () => cache.value?.lastCampaignRaidResult,
    prevUpdatedAt,
    timeoutMs,
    undefined,
    undefined,
    Number(missionId.value)
  );
}

async function executeRaidCall(times: number): Promise<{ ok: boolean; pending?: boolean; drops?: any; error?: string }> {
  const raidMission = Number(missionId.value), raidAccount = accountId.value;
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
  // Sends multiple calls with times: 1 in one RPC request
  try {
    const numCalls = Math.max(1, Math.min(100, Number(times) || 1));
    const calls: Array<{ name: string; args?: any; feature?: string; ident?: string }> = [];
    const raidCallIdents = new Set<string>();
    for (let k = 0; k < numCalls; k++) {
      const ident = `mraid_${k}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      raidCallIdents.add(ident);
      calls.push({
        name: 'missionRaid',
        args: { id: Number(missionId.value), times: 1 },
        ident,
      });
    }
    calls.push({ name: 'playable_getAvailable', ident: `play_${Date.now()}` });
    calls.push({ name: 'worldStars_getAvailable', ident: `stars_${Date.now()}` });
    calls.push({ name: 'inventoryGet', ident: `inv_${Date.now()}` });
    calls.push({ name: 'userGetInfo', ident: `user_${Date.now()}` });

    const resp: any = await dispatchRpc(calls);
    if (resp && resp.ok === false) {
      disableMissionToday(missionId.value);
      return { ok: false, error: resp.error || 'Raid RPC rejected' };
    }
    if (resp?.queued) {
      loopStatusMsg.value = 'Notice: RPC queued in piggyback mode. Switch to Direct mode for instant execution.';
    }

    // Fast-path: Check if direct RPC response contains raid results
    if (Array.isArray(resp?.results)) {
      // Find results strictly matching missionRaid calls by ident or name
      const raidResults = resp.results.filter(
        (r: any) => raidCallIdents.has(r?.ident) || (r?.name === 'missionRaid' && r?.result?.response)
      );
      const effectiveResults = raidResults.length > 0 ? raidResults : resp.results.slice(0, numCalls);

      const errResult = effectiveResults.find((r: any) => r?.error || r?.result?.error);
      const err = errResult?.error || errResult?.result?.error;
      if (err) {
        disableMissionToday(missionId.value);
        return { ok: false, error: typeof err === 'string' ? err : err.message || 'Raid rejected by server' };
      }

      // ONLY extract responses for the missionRaid calls
      // Exclude secondary synchronization calls (inventoryGet, userGetInfo, etc.) to prevent drops multiplication
      const missionResponses = effectiveResults
        .filter((r: any) => r?.result?.response)
        .map((r: any) => r.result.response);

      if (missionResponses.length > 0) {
        await missionHistory.record(raidMission, raidAccount);
        const drops = extractDropsFromRaidResponse(missionResponses);
        const costs = getMissionCosts(raidMission);
        const fallbackPerRaid = Array.isArray(costs) ? (costs[0] + costs[1]) : 6;
        const nowIso = new Date().toISOString();
        const utcDay = nowIso.slice(0, 10);
        const callEntries = effectiveResults
          .filter((r: any) => r?.result?.response)
          .map((r: any, idx: number) => {
            const respObj = r.result.response;
            const expVal = Number(respObj?.[0]?.experience);
            const energy = Number.isFinite(expVal) && expVal > 0 ? expVal : fallbackPerRaid;
            const ident = String(r?.ident || `${nowIso}:${idx}:missionRaid`);
            return { ident, energy };
          });
        const totalEnergySpent = callEntries.reduce((sum: number, item: { energy: number }) => sum + item.energy, 0);
        if (typeof updateCacheLocally === 'function') {
          void updateCacheLocally((draft) => {
            draft.lastCampaignRaidResult = {
              updatedAt: nowIso,
              data: {
                missionId: raidMission,
                times: callEntries.length,
                energySpent: totalEnergySpent,
                ident: callEntries.map((c: { ident: string }) => c.ident).join(','),
                drops,
                currentDrops: drops
              }
            };
            const prevSummary = draft.campaignDailySummary?.data || {};
            const recentIdents: string[] = Array.isArray(prevSummary.recentIdents) ? [...prevSummary.recentIdents] : [];
            const days: Record<string, { count: number; energy: number }> = { ...(prevSummary.days || {}) };
            const existingDay = days[utcDay] || { count: 0, energy: 0 };
            let addedCount = 0;
            let addedEnergy = 0;
            for (const item of callEntries) {
              if (!recentIdents.includes(item.ident)) {
                recentIdents.push(item.ident);
                addedCount += 1;
                addedEnergy += item.energy;
              }
            }
            if (addedCount > 0) {
              days[utcDay] = {
                count: (Number(existingDay.count) || 0) + addedCount,
                energy: (Number(existingDay.energy) || 0) + addedEnergy,
              };
              const sortedDays = Object.keys(days).sort();
              while (sortedDays.length > 7) {
                const oldest = sortedDays.shift();
                if (oldest) delete days[oldest];
              }
              if (recentIdents.length > 30) recentIdents.splice(0, recentIdents.length - 30);
              draft.campaignDailySummary = {
                key: 'campaignDailySummary',
                method: 'missionRaid',
                feature: null,
                group: 'internal',
                data: { days, recentIdents },
                updatedAt: nowIso,
              };
            }
          });
        }
        return { ok: true, drops };
      }
    }

    const raidRes = await waitForRaidResult(prevUpdatedAt);
    if (!raidRes.ok) {
      if (!raidRes.pending) disableMissionToday(missionId.value);
      return { ok: false, pending: raidRes.pending, error: raidRes.error || 'Raid rejected by server' };
    }
    await missionHistory.record(raidMission, raidAccount);
    const drops = extractDropsFromRaidResponse(raidRes.drops);
    return { ok: true, drops };
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
        await missionHistory.record(raidMission, raidAccount);
        const drops = extractDropsFromRaidResponse(raidRes.drops);
        return { ok: true, drops };
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
    while (completed < totalTimes) {
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
      const cost = Number(missionCost.value) || 6;
      if (Number.isFinite(curEnergy) && curEnergy < cost) {
        loopStatusMsg.value = `Out of Energy (${curEnergy}/${cost}) at raid ${completed}/${totalTimes}`;
        break;
      }

      // 1. Calculate how many items are still needed
      let itemsNeeded = Infinity;
      if (farmMode.value === 'hero' && selectedLeafResource.value) {
        const targetLeaf = selectedLeafResource.value;
        const freshStock = Number(cache.value?.inventoryGet?.data?.[targetLeaf.category]?.[targetLeaf.id] || 0);
        itemsNeeded = Math.max(0, targetLeaf.requiredCount - freshStock);
        if (itemsNeeded <= 0) {
          loopStatusMsg.value = `Target requirement reached (${targetLeaf.name}: ${freshStock}/${targetLeaf.requiredCount})! Stopped automatically at ${completed}/${totalTimes}.`;
          break;
        }
      } else if (targetId && !wasInitiallyFulfilled && selectedGearId.value) {
        const freshTree = buildGearRecipeTree(selectedGearId.value, cache.value);
        const freshNode = findNodeInTree(freshTree, targetId);
        if (freshNode && isNodeRequirementMet(freshNode)) {
          loopStatusMsg.value = `Target requirement reached (${freshNode.name})! Stopped automatically at ${completed}/${totalTimes}.`;
          break;
        }
        if (freshNode) {
          const isFrag = Boolean(freshNode.fragment);
          const owned = isFrag ? Number(freshNode.fragment.owned) : Number(freshNode.owned);
          const required = isFrag ? Number(freshNode.fragment.required) : Number(freshNode.requiredCount ?? 1);
          itemsNeeded = Math.max(0, required - owned);
        }
      }

      // 2. Calculate raids possible in this step based on energy, tries, and remaining count
      const remainingTimes = totalTimes - completed;
      const energyPossible = Number.isFinite(curEnergy) && cost > 0 ? Math.floor(curEnergy / cost) : remainingTimes;
      const triesPossible = tries.isHeroic ? tries.triesLeft : remainingTimes;
      const raidsPossible = Math.min(remainingTimes, energyPossible, triesPossible);

      if (raidsPossible <= 0) break;

      // 3. Batch size = min(items needed, raids possible)
      // Guarantees 1 RPC call raids multiple times without overshooting items needed
      const batchSize = Number.isFinite(itemsNeeded) && itemsNeeded > 0
        ? Math.min(itemsNeeded, raidsPossible)
        : Math.min(10, raidsPossible);

      if (batchSize <= 0) break;

      loopStatusMsg.value = batchSize > 1
        ? `Raiding ${completed + 1}..${completed + batchSize}/${totalTimes} (batch of ${batchSize})...`
        : `Raiding ${completed + 1}/${totalTimes}...`;

      const res = await executeRaidCall(batchSize);
      if (!res.ok) {
        loopStatusMsg.value = `❌ Raid stopped at ${completed}/${totalTimes}: ${res.error}`;
        if (!res.pending) disableMissionToday(missionId.value);
        break;
      }

      completed += batchSize;

      if (res.drops) {
        mergeDropsIntoAccumulator(accumulatedDrops, res.drops);
        localRaidResult.value = {
          missionId: missionId.value,
          times: completed,
          drops: accumulatedDrops,
        };
      }

      // 4. Check auto-stop condition again after fresh cache updates:
      if (farmMode.value === 'hero' && selectedLeafResource.value) {
        const targetLeaf = selectedLeafResource.value;
        const freshStock = Number(cache.value?.inventoryGet?.data?.[targetLeaf.category]?.[targetLeaf.id] || 0);
        if (freshStock >= targetLeaf.requiredCount) {
          loopStatusMsg.value = `Target requirement reached (${targetLeaf.name}: ${freshStock}/${targetLeaf.requiredCount})! Stopped automatically at ${completed}/${totalTimes}.`;
          break;
        }
      } else if (targetId && !wasInitiallyFulfilled && selectedGearId.value) {
        const freshTree = buildGearRecipeTree(selectedGearId.value, cache.value);
        const freshNode = findNodeInTree(freshTree, targetId);
        if (freshNode && isNodeRequirementMet(freshNode)) {
          loopStatusMsg.value = `Target requirement reached (${freshNode.name})! Stopped automatically at ${completed}/${totalTimes}.`;
          break;
        }
      }

      if (completed < totalTimes && !abortCampaignRaidLoop.value) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  } finally {
    isRaidRunning.value = false;
    abortCampaignRaidLoop.value = false;
    dispatchRpc([{ name: 'inventoryGet' }]).catch(() => {});
  }
}

async function startRaid(times: number) {
  if (isRaidRunning.value || isCrafting.value) return;
  loopStatusMsg.value = '';
  if (!canFarmSelectedTarget.value) {
    loopStatusMsg.value = 'Select a component and a mission that drops it before farming.';
    return;
  }

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

  await executeSequentialLoop(effectiveTimes);
}

async function executeRaidAllSoulMissions() {
  if (isRaidRunning.value || isCrafting.value) return;
  loopStatusMsg.value = '';

  const missions = heroSoulMissions.value;
  if (!missions.length) {
    loopStatusMsg.value = 'No campaign missions available for this hero\'s soul stones.';
    return;
  }

  isRaidRunning.value = true;
  abortCampaignRaidLoop.value = false;

  const accumulatedDrops: any = {
    fragmentGear: {},
    fragmentScroll: {},
    gear: {},
    scroll: {},
    consumable: {},
    fragmentHero: {},
    gold: 0,
    experience: 0,
  };

  let totalRaidsDone = 0;
  let missionsRaidedCount = 0;

  try {
    for (const m of missions) {
      if (abortCampaignRaidLoop.value) {
        loopStatusMsg.value = `Raid loop stopped by user. Completed ${totalRaidsDone} raids across ${missionsRaidedCount} missions.`;
        break;
      }

      const raidable = isMissionRaidable(m.id, cache.value?.missionGetAll?.data, {
        disabledIds: disabledMissionsToday.value,
      });
      if (!raidable) continue;

      const tries = getTriesInfo(m.id);
      if (tries.isExhausted || (tries.isHeroic && tries.triesLeft <= 0)) continue;

      const curEnergy = Number(currentEnergy.value);
      const missionPair = getMissionCosts(m.id);
      const cost = missionPair ? (Number(missionPair[0]) + Number(missionPair[1])) : (m.cost || 6);

      if (!Number.isFinite(curEnergy) || curEnergy < cost) {
        loopStatusMsg.value = `Out of Energy (${curEnergy} < ${cost}) while preparing Mission #${m.id}. Completed ${totalRaidsDone} raids.`;
        break;
      }

      const maxTriesForThisMission = tries.isHeroic ? tries.triesLeft : 3;
      const energyPossible = Math.floor(curEnergy / cost);
      const raidsPossible = Math.min(maxTriesForThisMission, energyPossible);

      if (raidsPossible <= 0) continue;

      missionId.value = m.id;
      loopStatusMsg.value = `Raiding Mission #${m.id} (${missionName(m.id)}) x${raidsPossible}...`;

      const res = await executeRaidCall(raidsPossible);
      if (!res.ok) {
        loopStatusMsg.value = `❌ Raid stopped at Mission #${m.id}: ${res.error}`;
        if (!res.pending) disableMissionToday(m.id);
        break;
      }

      totalRaidsDone += raidsPossible;
      missionsRaidedCount++;

      if (res.drops) {
        mergeDropsIntoAccumulator(accumulatedDrops, res.drops);
        localRaidResult.value = {
          missionId: m.id,
          times: totalRaidsDone,
          drops: accumulatedDrops,
        };
      }

      if (!abortCampaignRaidLoop.value) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }

    if (!abortCampaignRaidLoop.value && totalRaidsDone > 0) {
      loopStatusMsg.value = `✅ Finished raiding soul stone missions! Completed ${totalRaidsDone} raids across ${missionsRaidedCount} missions.`;
    } else if (totalRaidsDone === 0 && !abortCampaignRaidLoop.value) {
      loopStatusMsg.value = `No raidable missions found (daily limit reached, lack of energy, or 3★ required).`;
    }
  } finally {
    isRaidRunning.value = false;
    abortCampaignRaidLoop.value = false;
    dispatchRpc([{ name: 'inventoryGet' }]).catch(() => {});
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
  const required = isFrag ? Number(node.fragment.required) : Number(node.requiredCount ?? 1);
  return {
    id: node.id,
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
  const node = selectedRecipeNode.value;
  return node ? Number(d[recipeFarmCategory(node)]?.[node.id] || 0) : 0;
});

const hasDropItems = computed(() => {
  const d = latestRaidResult.value?.drops;
  if (!d) return false;
  return Boolean(
    (d.fragmentGear && Object.keys(d.fragmentGear).length > 0) ||
    (d.fragmentScroll && Object.keys(d.fragmentScroll).length > 0) ||
    (d.gear && Object.keys(d.gear).length > 0) ||
    (d.scroll && Object.keys(d.scroll).length > 0) ||
    (d.consumable && Object.keys(d.consumable).length > 0) ||
    (d.fragmentHero && Object.keys(d.fragmentHero).length > 0)
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
      :style="{ zIndex: stackLevel }"
      class="fixed inset-0 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"

    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="farmMode !== 'mission' && (selectedHeroId || selectedGearId)"
              id="btn-campaign-free-mission"
              type="button"
              :disabled="isRaidRunning"
              class="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-2xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Clear target and switch to Free Mission Raid"
              @click="clearFarmTarget"
            >
              🗺️ Free Mission
            </button>

            <div
              id="campaign-header-energy"
              class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-bold text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
              title="Current Energy"
            >
              <span aria-hidden="true">⚡</span>
              <span class="font-extrabold">{{ currentEnergy }}</span>
              <span v-if="maxEnergy !== '—'" class="text-amber-500">/ {{ maxEnergy }}</span>
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
        </div>

        <!-- Body -->
        <div id="campaign-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)] text-xs">
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

          <!-- Farm Mode Switcher Tabs (Only shown when a hero is selected; hidden in item farm mode) -->
          <div v-if="selectedHeroId" class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 flex-wrap gap-2">
            <div class="flex items-center gap-1.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
              <button
                type="button"
                id="tab-mode-soul"
                class="px-3 py-1.5 rounded-md cursor-pointer transition-all flex items-center gap-1.5"
                :class="farmMode === 'soul' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
                @click="switchFarmMode('soul')"
              >
                <span>✨</span> Soul Stones
              </button>
              <button
                type="button"
                id="tab-mode-hero"
                class="px-3 py-1.5 rounded-md cursor-pointer transition-all flex items-center gap-1.5"
                :class="farmMode === 'hero' ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
                @click="switchFarmMode('hero')"
              >
                <span>🎯</span> Hero Farm
              </button>
              <button
                type="button"
                id="tab-mode-gear"
                class="px-3 py-1.5 rounded-md cursor-pointer transition-all flex items-center gap-1.5"
                :class="farmMode === 'gear' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
                @click="switchFarmMode('gear')"
              >
                <span>🛠️</span> Equipment Recipe Tree
              </button>
            </div>
          </div>

          <!-- Hero Soul Stone Farm Section -->
          <div v-if="farmMode === 'soul'" class="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20 p-3.5 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  <span>✨</span>
                  <span>Soul Stones for: <strong class="text-amber-600 dark:text-amber-400">{{ heroSoulName }}</strong></span>
                </div>
                <div v-if="heroSoulProgress" class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span>Current: <strong>{{ heroSoulProgress.owned ?? 0 }}</strong> / {{ heroSoulProgress.needed ?? '—' }}</span>
                  <span v-if="canEvolveSoul" class="text-emerald-600 dark:text-emerald-400 font-bold">✨ Ready to Evolve</span>
                  <span v-else-if="heroSoulProgress.needed !== 'Max' && remainingNeededSoul > 0">• Need {{ remainingNeededSoul }} more</span>
                </div>
              </div>

              <!-- Raid All Soul Missions Button -->
              <button
                type="button"
                id="btn-raid-all-soul-missions"
                :disabled="isRaidRunning || !raidableSoulMissions.length || (typeof currentEnergy === 'number' && currentEnergy < 5)"
                class="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-colors"
                title="Raid all missions dropping this hero's soul stone from lowest to highest ID"
                @click="executeRaidAllSoulMissions"
              >
                <span>⚡</span>
                <span>{{ isRaidRunning ? 'Raiding in progress...' : `Raid All Soul Missions (${totalRaidableSoulTries} raids)` }}</span>
              </button>
            </div>

            <!-- Progress Bar -->
            <div v-if="heroSoulProgress" class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="heroSoulProgress.needed === 'Max' ? 'bg-amber-400' : canEvolveSoul ? 'bg-emerald-500' : 'bg-amber-500'"
                :style="{
                  width: `${heroSoulProgress.needed === 'Max' ? 100 : Math.min(100, Math.round(((Number(heroSoulProgress.owned) || 0) / (Number(heroSoulProgress.needed) || 1)) * 100))}%`
                }"
              ></div>
            </div>

            <!-- Soul Missions List (Sorted Ascending) -->
            <div v-if="heroSoulMissions.length" class="space-y-1.5">
              <div class="text-2xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Story Campaign Missions with Soul Stones (Ascending Priority):</span>
                <span>{{ raidableSoulMissions.length }} / {{ heroSoulMissions.length }} raidable</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="m in heroSoulMissions"
                  :key="m.id"
                  class="flex items-center justify-between p-2 rounded-lg border text-2xs cursor-pointer transition-all"
                  :class="[
                    missionId === m.id
                      ? 'border-amber-500 bg-amber-100/70 dark:bg-amber-900/40 ring-1 ring-amber-500 shadow-xs'
                      : isMissionRaidable(m.id, cache?.missionGetAll?.data, { disabledIds: disabledMissionsToday })
                      ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 hover:border-amber-400'
                      : 'border-slate-200/60 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40 opacity-60'
                  ]"
                  @click="missionId = m.id"
                >
                  <div class="min-w-0 pr-2">
                    <div class="font-bold truncate text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      <span>🦸</span>
                      <span class="truncate">{{ missionName(m.id) }}</span>
                    </div>
                    <div class="text-3xs text-slate-400 dark:text-slate-500">
                      ⚡ {{ getMissionCosts(m.id)?.[0] ?? m.cost ?? 6 }} energy
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <span
                      class="px-1.5 py-0.5 rounded text-3xs font-bold"
                      :class="getTriesInfo(m.id).isExhausted ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'"
                    >
                      {{ getTriesBadge(m.id) || `${getTriesInfo(m.id).triesLeft} left` }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="p-3 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-dashed border-amber-200 dark:border-amber-900/40">
              No campaign story missions drop soul stones for this hero.
            </div>
          </div>

          <!-- Hero Equipment Farm Section -->
          <div v-if="farmMode === 'hero' && heroLeafSummary" class="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 p-3.5 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                  <span>🎯</span>
                  <span>Leaf resources needed for: <strong class="text-purple-600 dark:text-purple-400">{{ heroLeafSummary.heroName }}</strong> (Rank {{ heroLeafSummary.color }})</span>
                </div>
                <div class="text-2xs text-slate-500 dark:text-slate-400">
                  {{ heroLeafSummary.missingSlotsCount }} unequipped slots • {{ heroLeafResources.filter(r => !r.isFulfilled).length }} missing resource types
                </div>
              </div>

              <!-- Missing slot tags -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  v-for="g in heroLeafSummary.missingGears"
                  :key="g.slotNum"
                  type="button"
                  class="rounded bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-900/80 px-2 py-0.5 text-3xs font-semibold text-purple-800 dark:text-purple-200 cursor-pointer transition-colors"
                  title="View recipe tree for this equipment"
                  @click="viewGearRecipeTree(g.gearId)"
                >
                  Slot {{ g.slotNum }}: {{ g.name }} ↗
                </button>
              </div>
            </div>

            <!-- Flat Leaf Resources Table/List -->
            <div id="hero-leaf-resources-list" class="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              <div
                v-for="leaf in heroLeafResources"
                :key="`${leaf.category}:${leaf.id}`"
                :data-leaf-key="`${leaf.category}:${leaf.id}`"
                class="flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all"
                :class="[
                  selectedLeafKey === `${leaf.category}:${leaf.id}`
                    ? 'border-purple-500 bg-purple-100/70 dark:bg-purple-900/40 ring-1 ring-purple-500 shadow-xs'
                    : leaf.isFulfilled
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/10 hover:border-emerald-300'
                    : 'border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-800/80 hover:border-purple-300'
                ]"
                @click="selectLeafResource(leaf)"
              >
                <!-- Left: Icon, Name, Category -->
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="text-base shrink-0">{{ leaf.category.includes('fragment') ? '🧩' : '🛡️' }}</span>
                  <div class="min-w-0">
                    <div class="font-bold truncate text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <span>{{ leaf.name }}</span>
                      <span class="text-3xs px-1.5 py-0.2 rounded font-normal bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {{ leaf.category }}
                      </span>
                    </div>
                    <div class="text-3xs text-slate-400 dark:text-slate-500 truncate">
                      Needed for: {{ leaf.sourceGears.map(g => g.name).join(', ') }}
                    </div>
                  </div>
                </div>

                <!-- Right: Progress, Count, Badge -->
                <div class="flex items-center gap-3 shrink-0">
                  <div class="text-right">
                    <div class="font-bold">
                      <span :class="leaf.isFulfilled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                        {{ leaf.ownedCount }}
                      </span>
                      <span class="text-slate-400"> / {{ leaf.requiredCount }}</span>
                    </div>
                    <div v-if="!leaf.isFulfilled" class="text-3xs text-amber-600 dark:text-amber-400 font-semibold">
                      Need {{ leaf.remainingCount }}
                    </div>
                    <div v-else class="text-3xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      Fulfilled
                    </div>
                  </div>

                  <span
                    class="rounded-full px-2 py-0.5 text-3xs font-bold shrink-0"
                    :class="leaf.isFulfilled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'"
                  >
                    {{ leaf.missions.length }} missions
                  </span>
                </div>
              </div>
            </div>

            <!-- Active Leaf Selection Notice -->
            <div v-if="selectedLeafResource" class="p-2 rounded-lg bg-purple-100/60 dark:bg-purple-900/30 text-2xs flex items-center justify-between text-purple-900 dark:text-purple-200">
              <span class="flex items-center gap-1.5">
                <span>🎯</span>
                <span>Targeting: <strong>{{ selectedLeafResource.name }}</strong> (Need {{ selectedLeafResource.remainingCount }} more / {{ selectedLeafResource.requiredCount }})</span>
              </span>
              <span class="text-3xs text-slate-500 dark:text-slate-400">Select a mission below to start raid</span>
            </div>
          </div>

          <!-- Recipe Tree Hierarchy Section (if farming a gear) -->
          <div v-if="farmMode === 'gear' && recipeTree" class="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
            <!-- Slot Selector when inspecting gear under Hero -->
            <div v-if="selectedHeroId && heroLeafSummary?.missingGears?.length" id="hero-recipe-slot-picker" class="flex items-center gap-1.5 flex-wrap pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
              <span class="text-2xs font-semibold text-slate-600 dark:text-slate-300">Equipment Slots:</span>
              <button
                v-for="g in heroLeafSummary.missingGears"
                :key="g.slotNum"
                type="button"
                class="px-2.5 py-1 rounded-md text-2xs font-bold cursor-pointer transition-all border"
                :class="selectedGearId == g.gearId ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'"
                @click="selectHeroGear(g.gearId)"
              >
                Slot {{ g.slotNum }}: {{ g.name }}
              </button>
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                <span>🛠️</span> Crafting Recipe Tree: <strong class="text-indigo-600 dark:text-indigo-400">{{ recipeTree.name }}</strong>
              </div>
              <button
                v-if="recipeTree.canCraft"
                type="button"
                :disabled="isCrafting || isRaidRunning"
                class="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-2xs cursor-pointer shadow-xs disabled:opacity-50"
                @click="craftNode(recipeTree)"
              >
                {{ isCrafting ? '...' : 'Craft Item' }}
              </button>
            </div>

            <div role="tree" aria-label="Equipment recipe">
              <RecipeTreeNode :node="recipeTree" :selected-key="selectedRecipeNodeId" :is-crafting="isCrafting" :is-running="isRaidRunning"
                @select="selectRecipeNode" @craft="craftNode" />
            </div>
          </div>

          <div v-else-if="farmMode === 'gear' && !recipeTree" class="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/60 p-4 text-center text-xs text-slate-500">
            No equipment selected or all hero equipment slots are already equipped.
          </div>

          <!-- Mission Setup & Raid Controls -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs">
            <template v-if="farmMode === 'mission'">
              <div class="font-bold text-slate-800 dark:text-slate-200 text-xs">Target Campaign Mission</div>
              <CampaignMissionPicker v-model="missionId" :disabled="isRaidRunning" :is-mission-disabled="isMissionDisabled" :mission-status="getMissionTooltip" />
              <div class="space-y-1.5">
                <div class="text-2xs font-medium text-slate-400">Recently farmed missions</div>
                <div v-if="recentMissions.length" class="flex flex-wrap gap-1.5">
                  <MissionDropTooltip v-for="id in recentMissions" :key="id" :mission-id="id" :status="getMissionTooltip(id)">
                    <button type="button" :disabled="isRaidRunning" :aria-disabled="isMissionDisabled(id)" class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-colors inline-flex items-center gap-1.5" :class="[isMissionDisabled(id) ? 'opacity-50 border-dashed line-through' : '', missionId === id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300']" @click="!isMissionDisabled(id) && (missionId = id)">
                      <span v-if="isHeroic(id)" aria-hidden="true">🦸</span>
                      <span>{{ missionName(id) }}</span>
                      <span v-if="isHeroic(id)" class="text-3xs">{{ getTriesBadge(id) }}</span>
                    </button>
                  </MissionDropTooltip>
                </div>
                <p v-else class="text-xs text-slate-500">No farmed missions yet. Successfully raided missions will appear here.</p>
              </div>
            </template>

            <template v-else-if="farmMode === 'hero' || farmMode === 'gear'">
              <div class="space-y-1.5">
                <div class="text-2xs font-medium text-slate-400">Missions dropping this item:</div>
                <div v-if="candidateMissions.length" class="flex flex-wrap gap-1.5">
                  <MissionDropTooltip v-for="id in candidateMissions.map((m: any) => Number(m.id))" :key="id" :mission-id="id" :status="getMissionTooltip(id)">
                    <button type="button" :disabled="isRaidRunning" :aria-disabled="isMissionDisabled(id)" class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-colors inline-flex items-center gap-1.5" :class="[isMissionDisabled(id) ? 'opacity-50 border-dashed line-through' : '', missionId === id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300']" @click="!isMissionDisabled(id) && (missionId = id)">
                      <span v-if="isHeroic(id)" aria-hidden="true">🦸</span>
                      <span>{{ missionName(id) }}</span>
                      <span v-if="isHeroic(id)" class="text-3xs">{{ getTriesBadge(id) }}</span>
                    </button>
                  </MissionDropTooltip>
                </div>
                <p v-else class="text-xs text-slate-500 dark:text-slate-400">
                  This item has no direct campaign drops. Select a component below it to farm, or craft it when the ingredients are ready.
                </p>
              </div>
            </template>

            <div v-else class="flex items-center justify-between gap-2 text-xs">
              <span class="font-bold text-slate-700 dark:text-slate-200">
                Selected Mission: <span class="text-amber-600 dark:text-amber-400">{{ missionName(missionId) }}</span>
              </span>
              <span v-if="isHeroic(missionId)" class="text-2xs font-semibold text-slate-500 dark:text-slate-400">
                🦸 {{ getTriesBadge(missionId) }}
              </span>
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

            <!-- Favorite Heroes Daily Soul-Stone Sweeper -->
            <div
              id="campaign-soul-sweep-panel"
              class="flex items-center justify-between flex-wrap gap-2 p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-2xs"
            >
              <div class="flex items-center flex-wrap gap-2">
                <span class="font-bold text-amber-800 dark:text-amber-300">⭐ Favorite Soul Stones</span>
                <span class="text-slate-600 dark:text-slate-300">
                  <template v-if="soulSweepPlan.totalMissions > 0">
                    {{ soulSweepPlan.eligibleHeroCount }} heroes · {{ soulSweepPlan.totalMissions }} missions ({{ soulSweepPlan.totalAvailableRaids }} tries)
                  </template>
                  <template v-else>
                    {{ soulSweepPlan.skippedReason || 'No eligible missions' }}
                  </template>
                </span>
              </div>
              <div class="flex items-center gap-2">
                <label class="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium" title="Keep at least this much Campaign Energy reserved (never spends Emeralds)">
                  <span>Reserve:</span>
                  <input
                    id="campaign-soul-reserve-input"
                    v-model.number="soulSweepReserve"
                    type="number"
                    min="0"
                    max="200"
                    :disabled="isRaidRunning"
                    class="w-12 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-center font-mono text-2xs font-bold"
                    @change="saveSoulSweepReserve"
                  />
                  <span>⚡</span>
                </label>
                <button
                  id="campaign-soul-sweep-btn"
                  type="button"
                  :disabled="isRaidRunning || soulSweepPlan.plannedRaids <= 0"
                  class="cursor-pointer px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-2xs transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                  @click="runFavoriteSoulSweep"
                >
                  {{ isSweepingSouls ? 'Sweeping…' : `Sweep All (${soulSweepPlan.plannedRaids} raids · ${soulSweepPlan.plannedEnergy}⚡)` }}
                </button>
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
                  :disabled="isRaidRunning || isCrafting || !canFarmSelectedTarget || isMissionDisabled(missionId)"
                  class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="isMissionDisabled(missionId) ? 'Mission daily limit reached' : 'Raid 1x'"
                  @click="startRaid(1)"
                >
                  ⚔️ Raid 1x
                </button>
                <button
                  id="campaign-raid-10"
                  type="button"
                  :disabled="isRaidRunning || isCrafting || !canFarmSelectedTarget || isMissionDisabled(missionId)"
                  class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="isMissionDisabled(missionId) ? 'Mission daily limit reached' : 'Raid 10x'"
                  @click="startRaid(10)"
                >
                  ⚔️ Raid 10x
                </button>
                <button
                  id="campaign-raid-max"
                  type="button"
                  :disabled="isRaidRunning || isCrafting || !canFarmSelectedTarget || maxPossibleTimes < 1 || isMissionDisabled(missionId)"
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

              <!-- Hero Soul Stones -->
              <span
                v-for="(count, hId) in (latestRaidResult.drops?.fragmentHero || {})"
                :key="`fh-${hId}`"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-amber-700 border border-amber-200 shadow-2xs dark:bg-slate-800 dark:text-amber-300 dark:border-amber-800"
              >
                <span>✨ {{ getItemName('fragmentHero', hId) || `Hero #${hId} Soul Stone` }}</span>
                <span class="bg-amber-100 text-amber-800 px-1 rounded text-2xs dark:bg-amber-900 dark:text-amber-200">+{{ count }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
