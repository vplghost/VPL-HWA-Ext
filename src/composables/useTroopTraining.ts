import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRpcCache } from './useRpcCache.ts';
import {
  getTroopType,
  TROOP_DEFS,
  normalizeArray,
  calculateTroopMax,
  CAMP_BUILDING_IDS,
  CAMP_TRAINING_CAPACITY_BY_LEVEL,
  getBuildingTrainingCapacity,
  getUnlockedTroopLevels,
  isCampBuildingUpgrading,
  buildAutoTrainCalls,
  calculateHealingDurationMs,
  calculateTrainingDurationMs,
} from '../utils/troops.ts';
import type { TroopHealSettings, TroopTrainSettings, TroopUnitState } from '@/src/types';
import {
  DEFAULT_TROOP_HEAL_SETTINGS,
  buildSmartHealBatch,
  computeMarchDefenseDemand,
  normalizeTroopHealSettings,
} from '../services/troopHealService.ts';

export {
  getTroopType,
  TROOP_DEFS,
  normalizeArray,
  calculateTroopMax,
  CAMP_BUILDING_IDS,
  CAMP_TRAINING_CAPACITY_BY_LEVEL,
  getBuildingTrainingCapacity,
  getUnlockedTroopLevels,
  isCampBuildingUpgrading,
  buildAutoTrainCalls,
};

export function useTroopTraining() {
  const { cache, dispatchRpc } = useRpcCache();
  const trainSettings = ref<TroopTrainSettings>({ autoTrainEnabled: false, maxTargets: {}, trainLevels: {} });
  const defaultHealSettings: TroopHealSettings =
    typeof DEFAULT_TROOP_HEAL_SETTINGS !== 'undefined'
      ? { ...DEFAULT_TROOP_HEAL_SETTINGS }
      : {
          autoHealEnabled: false,
          batchPerType: 0,
          prioritizeTeamDemand: true,
          minInjuredToStart: 100,
          onlyHealTeamShortfall: false,
          maxBatchDurationMin: 0,
        };
  const healSettings = ref<TroopHealSettings>(defaultHealSettings);
  const storedCapacitySnapshot = ref<Record<string, any>>({});
  const isRefreshing = ref(false);
  const isSyncLoading = ref(false);
  const isHealLoading = ref(false);
  const isAutoTraining = ref(false);
  const healStatus = ref('');
  const now = ref(Date.now());
  let timerInterval: any = null;

  async function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get([
          'troopTrainSettings',
          'troopHealSettings',
          'troopCapacitySettings',
          'capacityObservations',
        ]);
        if (stored.troopTrainSettings) {
          trainSettings.value = {
            autoTrainEnabled: stored.troopTrainSettings.autoTrainEnabled === true,
            maxTargets: stored.troopTrainSettings.maxTargets || {},
            trainLevels: stored.troopTrainSettings.trainLevels || {},
          };
        }
        if (stored.troopHealSettings) {
          healSettings.value =
            typeof normalizeTroopHealSettings === 'function'
              ? normalizeTroopHealSettings(stored.troopHealSettings)
              : { ...defaultHealSettings, ...stored.troopHealSettings };
        }
        storedCapacitySnapshot.value = {
          troopCapacitySettings: stored.troopCapacitySettings,
          capacityObservations: stored.capacityObservations,
        };
      } catch (_) {}
    }
  }

  async function saveSettings(next: TroopTrainSettings) {
    trainSettings.value = next;
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        await chrome.storage.local.set({ troopTrainSettings: next });
      } catch (_) {}
    }
  }

  function setAutoTrain(enabled: boolean) {
    const next = {
      ...trainSettings.value,
      autoTrainEnabled: enabled,
    };
    saveSettings(next);
    if (enabled) {
      checkAndExecuteAutoTrain();
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ kind: 'auto-train-tick' }).catch(() => {});
      }
    }
  }

  function setMaxTarget(type: number, max: number) {
    const next = {
      ...trainSettings.value,
      maxTargets: { ...(trainSettings.value.maxTargets || {}), [type]: max },
    };
    saveSettings(next);
  }

  function setTrainLevel(type: number, level: number) {
    const next = {
      ...trainSettings.value,
      trainLevels: { ...(trainSettings.value.trainLevels || {}), [type]: level },
    };
    saveSettings(next);
  }

  async function checkAndExecuteAutoTrain() {
    if (!trainSettings.value?.autoTrainEnabled || isAutoTraining.value || isRefreshing.value) return;
    const plan = buildAutoTrainCalls(cache.value, trainSettings.value, now.value);
    if (!plan.calls.length) return;

    isAutoTraining.value = true;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ kind: 'auto-train-tick' });
      } else {
        await dispatchRpc(plan.calls);
      }
    } catch (_) {
    } finally {
      isAutoTraining.value = false;
    }
  }

  function handleStorageChanged(changes: any, area: string) {
    if (area !== 'local') return;
    if (changes?.troopTrainSettings?.newValue) {
      const next = changes.troopTrainSettings.newValue;
      trainSettings.value = {
        autoTrainEnabled: next.autoTrainEnabled === true,
        maxTargets: next.maxTargets || {},
        trainLevels: next.trainLevels || {},
      };
    }
    if (changes?.troopHealSettings?.newValue) {
      healSettings.value =
        typeof normalizeTroopHealSettings === 'function'
          ? normalizeTroopHealSettings(changes.troopHealSettings.newValue)
          : { ...defaultHealSettings, ...changes.troopHealSettings.newValue };
    }
    if (changes?.troopCapacitySettings || changes?.capacityObservations) {
      storedCapacitySnapshot.value = {
        ...storedCapacitySnapshot.value,
        ...(changes?.troopCapacitySettings ? { troopCapacitySettings: changes.troopCapacitySettings.newValue } : {}),
        ...(changes?.capacityObservations ? { capacityObservations: changes.capacityObservations.newValue } : {}),
      };
    }
  }

  onMounted(() => {
    loadSettings();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener(handleStorageChanged);
    }
    timerInterval = setInterval(() => {
      now.value = Date.now();
      if (trainSettings.value?.autoTrainEnabled) {
        checkAndExecuteAutoTrain();
      }
    }, 2000);
  });

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    }
  });

  const unitSummary = computed(() => cache.value['getUnitSummary:unit']?.data || cache.value.getUnitSummary?.data);
  const healing = computed(() => cache.value['getHealing:unit']?.data || cache.value.getHealing?.data);
  const trainings = computed(() => cache.value['getTrainings:unit']?.data || cache.value.getTrainings?.data);
  watch(() => healing.value?.healing, () => { healStatus.value = ''; });

  const totalInjured = computed(() => {
    const list = normalizeArray(healing.value?.injuredUnits);
    return list.reduce((sum: number, u: any) => sum + (Number(u?.count) || 0), 0);
  });

  const isHealingActive = computed(() => {
    const h = healing.value?.healing;
    return Boolean(
      h &&
      Number.isFinite(h.startDate) &&
      Number.isFinite(h.duration) &&
      (h.startDate + h.duration > now.value)
    );
  });

  const isHealingReady = computed(() => {
    const h = healing.value?.healing;
    return Boolean(
      h &&
      Number.isFinite(h.startDate) &&
      Number.isFinite(h.duration) &&
      (h.startDate + h.duration <= now.value)
    );
  });

  const troopStats = computed<TroopUnitState[]>(() => {
    const stats = TROOP_DEFS.map((def) => ({
      ...def,
      readyByLevel: new Map<number, number>(),
      readyCount: 0,
      hospitalCount: 0,
      healingActiveCount: 0,
      healingEndsAt: null,
      trainingCount: 0,
      trainingEndsAt: null,
      promotingCount: 0,
      isPromoting: false,
      maxTroops: 0,
    })) as [TroopUnitState, TroopUnitState, TroopUnitState];

    // 1. Available troops
    const availableList = normalizeArray(unitSummary.value?.available);
    for (const item of availableList) {
      const info = getTroopType(item?.unitId);
      const count = Number(item?.count) || 0;
      if (info && count > 0) {
        const cur = stats[info.type].readyByLevel.get(info.level) || 0;
        stats[info.type].readyByLevel.set(info.level, cur + count);
        stats[info.type].readyCount += count;
      }
    }

    // 2. Troops in squads
    const squadList = normalizeArray(unitSummary.value?.squads);
    for (const sq of squadList) {
      const squadUnits = normalizeArray(sq?.units);
      for (const u of squadUnits) {
        const info = getTroopType(u?.id);
        const count = Number(u?.state?.survived) || 0;
        if (info && count > 0) {
          const cur = stats[info.type].readyByLevel.get(info.level) || 0;
          stats[info.type].readyByLevel.set(info.level, cur + count);
          stats[info.type].readyCount += count;
        }
      }
    }

    // 3. Hospital / Injured units
    const injuredList = normalizeArray(healing.value?.injuredUnits);
    for (const item of injuredList) {
      const info = getTroopType(item?.unitId);
      const count = Number(item?.count) || 0;
      if (info && count > 0) {
        stats[info.type].hospitalCount += count;
      }
    }

    // 4. Healing active & timer
    const healingUnits = normalizeArray(healing.value?.healing?.units);
    const hasHealingTimer = Number.isFinite(healing.value?.healing?.startDate) && Number.isFinite(healing.value?.healing?.duration);
    const endsAt = hasHealingTimer ? healing.value.healing.startDate + healing.value.healing.duration : null;
    for (const item of healingUnits) {
      const info = getTroopType(item?.unitId);
      const count = Number(item?.count) || 0;
      if (info && count > 0) {
        stats[info.type].healingActiveCount += count;
        if (endsAt) {
          stats[info.type].healingEndsAt = endsAt;
        }
        // injuredUnits already includes all wounded troops in infirmary (both waiting and healing).
        // If hospitalCount is somehow less than active healing troops, clamp to healingActiveCount.
        if (stats[info.type].hospitalCount < stats[info.type].healingActiveCount) {
          stats[info.type].hospitalCount = stats[info.type].healingActiveCount;
        }
      }
    }

    // 5. Training queues & timer
    const queueList = normalizeArray(trainings.value?.trainingQueues);
    for (const q of queueList) {
      const info = getTroopType(q?.unitId);
      const count = Number(q?.unitCount) || 0;
      if (info && count > 0) {
        stats[info.type].trainingCount += count;
        if (Number.isFinite(q.startDate) && Number.isFinite(q.duration)) {
          const endsAt = q.startDate + q.duration;
          if (!stats[info.type].trainingEndsAt || endsAt < stats[info.type].trainingEndsAt!) {
            stats[info.type].trainingEndsAt = endsAt;
          }
        }
      }
    }

    // 6. Upgrade / Promoting queues & timer
    const upgradeQueueList = normalizeArray(trainings.value?.upgradeQueues);
    for (const q of upgradeQueueList) {
      const unitId = q?.targetUnitId ?? q?.sourceUnitId ?? q?.unitId;
      const info = getTroopType(unitId);
      const count = Number(q?.unitCount) || 0;
      if (info && count > 0) {
        stats[info.type].trainingCount += count;
        stats[info.type].promotingCount = (stats[info.type].promotingCount || 0) + count;
        stats[info.type].isPromoting = true;
        if (Number.isFinite(q.startDate) && Number.isFinite(q.duration)) {
          const endsAt = q.startDate + q.duration;
          if (!stats[info.type].trainingEndsAt || endsAt < stats[info.type].trainingEndsAt!) {
            stats[info.type].trainingEndsAt = endsAt;
          }
        }
      }
    }

    // Latest game stock capacity comes only from completed Drill Grounds levels.
    for (const t of stats) {
      t.maxTroops = calculateTroopMax(t.type, cache.value);
    }

    return stats;
  });

  async function refreshTroops() {
    isRefreshing.value = true;
    try {
      await dispatchRpc([
        { name: 'getSummary', feature: 'building' },
        { name: 'getSummary', feature: 'personalResearch' },
        { name: 'getSummary', feature: 'bonus' },
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getTrainings', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' },
      ]);
    } finally {
      setTimeout(() => {
        isRefreshing.value = false;
      }, 500);
    }
  }

  async function collectTraining(completedQueue: any) {
    const qUnitId = Number(completedQueue.targetUnitId ?? completedQueue.unitId);
    // Wait for the background reducer's actual game response before updating UI.
    await dispatchRpc([
      { name: 'completeTraining', args: { unitId: qUnitId }, feature: 'unit' },
      { name: 'getUnitSummary', feature: 'unit' },
      { name: 'getTrainings', feature: 'unit' },
    ]);
  }

  async function startTrain(type: 0 | 1 | 2, chosenLevel: number) {
    if (isCampBuildingUpgrading(type, cache.value)) return;
    const t = troopStats.value[type];
    if (!t || t.maxTroops == null) return;
    const currentTotal = t.readyCount + t.hospitalCount + t.trainingCount;
    const remaining = t.maxTroops - currentTotal;
    if (remaining <= 0) return;

    const buildingCap = typeof getBuildingTrainingCapacity === 'function'
      ? getBuildingTrainingCapacity(type, cache.value)
      : 26;
    const count = Math.min(buildingCap, Math.max(0, remaining));
    if (count <= 0) return;

    const targetUnitId = type === 0 ? chosenLevel : (type === 1 ? 10 + chosenLevel : 20 + chosenLevel);
    const duration = typeof calculateTrainingDurationMs === 'function'
      ? calculateTrainingDurationMs(targetUnitId, count, cache.value)
      : Math.max(10000, Math.round(count * 46342));
    const startDate = Date.now();

    await dispatchRpc([
      {
        name: 'startTraining',
        args: { unitId: targetUnitId, count, startDate, duration },
        feature: 'unit',
      },
      { name: 'getTrainings', feature: 'unit' },
      { name: 'getUnitSummary', feature: 'unit' },
    ]);
  }

  const smartHealPreview = computed(() => {
    if (typeof computeMarchDefenseDemand !== 'function' || typeof buildSmartHealBatch !== 'function') {
      return {
        demand: {
          topTeamCapacity: 3000,
          topTeamHeroIds: [],
          autoBatchPerType: 1000,
          maxMarches: 3,
          requiredTeams: 4,
          targetPerType: 4000,
          readyByType: [0, 0, 0] as [number, number, number],
          shortfallByType: [0, 0, 0] as [number, number, number],
          totalShortfall: 0,
        },
        batch: {
          units: [],
          totalCount: 0,
          perTypeCounts: [0, 0, 0] as [number, number, number],
          effectiveBatchPerType: 1000,
          estimatedDurationMs: 0,
          reason: 'no_injured' as const,
        },
      };
    }
    const demand = computeMarchDefenseDemand(cache.value, storedCapacitySnapshot.value);
    const batch = buildSmartHealBatch(healing.value, healSettings.value, demand);
    return { demand, batch };
  });

  async function dispatchHealingUnits(unitsToHeal: Array<{ unitId: number; count: number }>) {
    if (isHealLoading.value || isSyncLoading.value) return;
    if (isHealingActive.value || isHealingReady.value) {
      healStatus.value = isHealingReady.value ? 'Sync healed troops before starting another heal.' : 'Healing is already in progress.';
      return;
    }
    if (!unitsToHeal.length) return;

    isHealLoading.value = true;
    healStatus.value = '';
    try {
      const duration = calculateHealingDurationMs(unitsToHeal);
      const result = await dispatchRpc([
        { name: 'startHealing', feature: 'unit',
          args: { startDate: Date.now(), duration, units: unitsToHeal } },
        { name: 'getHealing', feature: 'unit' },
      ]);
      const rpcError = Array.isArray(result?.results)
        ? result.results
            .map((r: any) => r?.error || r?.result?.response?.errorCode || r?.result?.response?.error)
            .find(Boolean)
        : null;
      healStatus.value = !result?.ok ? result?.error || 'Could not start healing.'
        : rpcError ? `Healing failed: ${typeof rpcError === 'string' ? rpcError : JSON.stringify(rpcError)}`
        : result.queued ? 'Queued. Waiting for the game to start healing.'
        : 'Healing requested. Waiting for game data.';
    } catch (error) {
      healStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      isHealLoading.value = false;
    }
  }

  async function healAll() {
    const unitsToHeal = normalizeArray(healing.value?.injuredUnits)
      .filter((u: any) => Number.isInteger(Number(u?.unitId)) && Number(u?.count) > 0)
      .map((u: any) => ({ unitId: Number(u.unitId), count: Number(u.count) }));
    await dispatchHealingUnits(unitsToHeal);
  }

  async function healBatch() {
    const batch = smartHealPreview.value.batch;
    if (!batch.units.length) {
      healStatus.value = batch.reason === 'demand_met'
        ? 'All march + defense teams already have enough ready troops.'
        : 'No wounded troops available for batch healing.';
      return;
    }
    await dispatchHealingUnits(batch.units);
  }

  async function syncHealed() {
    if (isSyncLoading.value || isHealLoading.value || !isHealingReady.value) return;
    isSyncLoading.value = true;
    healStatus.value = '';
    try {
      const result = await dispatchRpc([
        { name: 'completeHealing', args: { completeDate: Date.now() }, feature: 'unit' },
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' },
      ]);
      healStatus.value = !result?.ok ? result?.error || 'Could not sync healed troops.'
        : result.queued ? 'Queued. Waiting for the game to collect healed troops.'
        : 'Healing completion requested. Waiting for game data.';
    } catch (error) {
      healStatus.value = error instanceof Error ? error.message : String(error);
    } finally {
      isSyncLoading.value = false;
    }
  }

  return {
    troopStats,
    trainSettings,
    healSettings,
    smartHealPreview,
    totalInjured,
    isHealingActive,
    isHealingReady,
    isRefreshing,
    isSyncLoading,
    isHealLoading,
    isAutoTraining,
    healStatus,
    now,
    trainings,
    setAutoTrain,
    setMaxTarget,
    setTrainLevel,
    refreshTroops,
    collectTraining,
    startTrain,
    healAll,
    healBatch,
    syncHealed,
    checkAndExecuteAutoTrain,
  };
}

