import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from './useRpcCache';
import { getTroopType, TROOP_DEFS, normalizeArray, calculateTroopMax, CAMP_BUILDING_IDS } from '@/src/utils/troops';
import type { TroopTrainSettings, TroopUnitState } from '@/src/types';

export { getTroopType, TROOP_DEFS, normalizeArray, calculateTroopMax, CAMP_BUILDING_IDS };

export function useTroopTraining() {
  const { cache, updateCacheLocally, dispatchRpc } = useRpcCache();
  const trainSettings = ref<TroopTrainSettings>({ maxTargets: {}, trainLevels: {} });
  const isRefreshing = ref(false);
  const isSyncLoading = ref(false);
  const isHealLoading = ref(false);
  const now = ref(Date.now());
  let timerInterval: any = null;

  async function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get('troopTrainSettings');
        if (stored.troopTrainSettings) {
          trainSettings.value = stored.troopTrainSettings;
        }
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

  onMounted(() => {
    loadSettings();
    timerInterval = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  const unitSummary = computed(() => cache.value['getUnitSummary:unit']?.data || cache.value.getUnitSummary?.data);
  const healing = computed(() => cache.value['getHealing:unit']?.data || cache.value.getHealing?.data);
  const trainings = computed(() => cache.value['getTrainings:unit']?.data || cache.value.getTrainings?.data);

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
    const stats: TroopUnitState[] = TROOP_DEFS.map((def) => ({
      ...def,
      readyByLevel: new Map<number, number>(),
      readyCount: 0,
      hospitalCount: 0,
      healingActiveCount: 0,
      healingEndsAt: null,
      trainingCount: 0,
      trainingEndsAt: null,
      maxTroops: 0,
    }));

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
    if (healingUnits.length > 0 && Number.isFinite(healing.value?.healing?.startDate) && Number.isFinite(healing.value?.healing?.duration)) {
      const endsAt = healing.value.healing.startDate + healing.value.healing.duration;
      for (const item of healingUnits) {
        const info = getTroopType(item?.unitId);
        const count = Number(item?.count) || 0;
        if (info && count > 0) {
          stats[info.type].healingActiveCount += count;
          stats[info.type].healingEndsAt = endsAt;
          if (stats[info.type].hospitalCount < count) {
            stats[info.type].hospitalCount = count;
          }
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

    // Calculate maxTroops per type dynamically from Drill Grounds / Camps and researches
    for (const t of stats) {
      const currentTotal = t.readyCount + t.hospitalCount + t.trainingCount;
      t.maxTroops = calculateTroopMax(t.type, cache.value, currentTotal);
    }

    return stats;
  });

  async function refreshTroops() {
    isRefreshing.value = true;
    try {
      await dispatchRpc([
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
    const qUnitId = Number(completedQueue.unitId);
    const qCount = Number(completedQueue.unitCount) || 0;

    await updateCacheLocally((draft) => {
      const trainKey = draft['getTrainings:unit'] ? 'getTrainings:unit' : (draft.getTrainings ? 'getTrainings' : 'getTrainings:unit');
      if (draft[trainKey]?.data?.trainingQueues) {
        const queues = normalizeArray(draft[trainKey].data.trainingQueues);
        draft[trainKey].data.trainingQueues = queues.filter((q: any) => q !== completedQueue);
      }
      const sumKey = draft['getUnitSummary:unit'] ? 'getUnitSummary:unit' : (draft.getUnitSummary ? 'getUnitSummary' : 'getUnitSummary:unit');
      if (draft[sumKey]?.data?.available) {
        const avail = normalizeArray(draft[sumKey].data.available);
        const match = avail.find((item: any) => Number(item.unitId) === qUnitId);
        if (match) {
          match.count = (Number(match.count) || 0) + qCount;
        } else {
          avail.push({ unitId: qUnitId, count: qCount });
        }
        draft[sumKey].data.available = avail;
      }
    });

    await dispatchRpc([
      { name: 'completeTraining', args: { unitId: qUnitId }, feature: 'unit' },
      { name: 'getUnitSummary', feature: 'unit' },
      { name: 'getTrainings', feature: 'unit' },
    ]);
  }

  async function startTrain(type: 0 | 1 | 2, chosenLevel: number) {
    const t = troopStats.value[type];
    const currentTotal = t.readyCount + t.hospitalCount + t.trainingCount;
    const remaining = t.maxTroops - currentTotal;
    if (remaining <= 0) return;

    const count = Math.min(26, Math.max(0, remaining));
    if (count <= 0) return;

    const targetUnitId = type === 0 ? chosenLevel : (type === 1 ? 10 + chosenLevel : 20 + chosenLevel);
    const duration = Math.max(10000, Math.round(count * 46342));
    const startDate = Date.now();

    await updateCacheLocally((draft) => {
      const trainKey = draft['getTrainings:unit'] ? 'getTrainings:unit' : (draft.getTrainings ? 'getTrainings' : 'getTrainings:unit');
      if (draft[trainKey]?.data) {
        const queues = [...normalizeArray(draft[trainKey].data.trainingQueues)];
        queues.push({ unitId: targetUnitId, unitCount: count, startDate, duration });
        draft[trainKey].data.trainingQueues = queues;
      }
    });

    await dispatchRpc([
      {
        name: 'startTraining',
        args: { unitId: targetUnitId, count, startDate, duration },
        feature: 'unit',
      },
      { name: 'getTrainings', feature: 'unit' },
    ]);
  }

  async function healAll() {
    if (isHealLoading.value) return;
    const injuredList = normalizeArray(healing.value?.injuredUnits);
    const unitsToHeal = injuredList
      .filter((u: any) => Number(u?.count) > 0)
      .map((u: any) => ({ unitId: Number(u.unitId), count: Number(u.count) }));
    if (unitsToHeal.length === 0) return;

    isHealLoading.value = true;
    try {
      const countSum = unitsToHeal.reduce((s: number, u: any) => s + u.count, 0);
      const duration = Math.max(60000, countSum * 8000);
      const startDate = Date.now();

      await updateCacheLocally((draft) => {
        const healKey = draft['getHealing:unit'] ? 'getHealing:unit' : (draft.getHealing ? 'getHealing' : 'getHealing:unit');
        if (draft[healKey]?.data) {
          draft[healKey].data = {
            ...draft[healKey].data,
            healing: { startDate, duration, units: unitsToHeal },
          };
        }
      });

      await dispatchRpc([
        {
          name: 'startHealing',
          args: { startDate, duration, units: unitsToHeal },
          feature: 'unit',
        },
        { name: 'getHealing', feature: 'unit' },
      ]);
    } finally {
      isHealLoading.value = false;
    }
  }

  async function syncHealed() {
    if (isSyncLoading.value) return;
    isSyncLoading.value = true;
    try {
      await updateCacheLocally((draft) => {
        const healKey = draft['getHealing:unit'] ? 'getHealing:unit' : (draft.getHealing ? 'getHealing' : 'getHealing:unit');
        if (draft[healKey]?.data) {
          draft[healKey].data = { ...draft[healKey].data, healing: null };
        }
      });

      await dispatchRpc([
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' },
      ]);
    } finally {
      isSyncLoading.value = false;
    }
  }

  return {
    troopStats,
    trainSettings,
    totalInjured,
    isHealingActive,
    isHealingReady,
    isRefreshing,
    isSyncLoading,
    isHealLoading,
    now,
    trainings,
    setMaxTarget,
    setTrainLevel,
    refreshTroops,
    collectTraining,
    startTrain,
    healAll,
    syncHealed,
  };
}

