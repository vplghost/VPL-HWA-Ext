import { DRILL_GROUND_BUILDING_IDS, DRILL_GROUND_LIMIT_BY_LEVEL } from './troopLimitData.ts';
import type { TroopTrainSettings } from '../types/index.ts';

export function getTroopType(unitId: number | string): { type: 0 | 1 | 2; level: number } | null {
  const id = Number(unitId);
  if (id >= 1 && id <= 10) return { type: 0, level: id };
  if (id >= 11 && id <= 20) return { type: 1, level: id - 10 };
  if (id >= 21 && id <= 30) return { type: 2, level: id - 20 };
  return null;
}

export function normalizeArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

export const TROOP_DEFS = [
  { type: 0 as const, label: 'Infantry', icon: '🛡️', badgeCls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  { type: 1 as const, label: 'Spearmen', icon: '🔱', badgeCls: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
  { type: 2 as const, label: 'Marksmen', icon: '🏹', badgeCls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
];

export const CAMP_BUILDING_IDS: Record<number, number> = {
  0: 40, // Infantry Camp
  1: 42, // Spearmen Camp
  2: 41, // Marksmen Camp
};

export function extractBuildingQueues(cache: any): any[] {
  if (!cache || typeof cache !== 'object') return [];
  const raw =
    cache?.buildingStatus?.data?.queues ??
    cache?.buildingStatus?.data?.queue ??
    cache?.buildingStatus?.queues ??
    cache?.buildingStatus?.queue ??
    cache?.['getSummary:building']?.data?.queues ??
    cache?.['getSummary:building']?.data?.queue ??
    cache?.['getSummary:building']?.queues ??
    cache?.building_getSummary?.data?.queues ??
    cache?.building_getSummary?.queues ??
    cache?.building_getQueue?.data?.queues ??
    cache?.building_getQueue?.data ??
    cache?.buildingSummary?.data?.queues ??
    cache?.clan_getSummary?.data?.queues ??
    cache?.getSummary?.data?.queues ??
    (Array.isArray(cache?.buildingStatus?.data) ? cache.buildingStatus.data : null);

  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.queues)) return raw.queues;
    if (
      Number.isFinite(raw.buildingId) ||
      Number.isFinite(raw.id) ||
      Number.isFinite(raw.startDate) ||
      Number.isFinite(raw.startTime)
    ) {
      return [raw];
    }
    return Object.values(raw).filter((item) => item && typeof item === 'object');
  }
  return [];
}

export function extractBuildingsRaw(cache: any): any {
  if (!cache || typeof cache !== 'object') return null;
  return (
    cache?.buildingStatus?.data?.buildings ??
    cache?.buildingStatus?.buildings ??
    cache?.['getSummary:building']?.data?.buildings ??
    cache?.['getSummary:building']?.buildings ??
    cache?.building_getSummary?.data?.buildings ??
    cache?.building_getSummary?.buildings ??
    cache?.clan_getSummary?.data?.buildings ??
    cache?.getSummary?.data?.buildings ??
    cache?.buildingSummary?.data?.buildings ??
    null
  );
}

/**
 * Checks whether the camp building corresponding to the troop type is currently upgrading.
 */
export function isCampBuildingUpgrading(type: number, cache: any): boolean {
  if (!Number.isInteger(type) || type < 0 || type > 2) return false;
  const targetBuildingId = CAMP_BUILDING_IDS[type];
  if (!targetBuildingId) return false;

  const queues = extractBuildingQueues(cache);
  return queues.some((q: any) => {
    const bId = Number(q?.buildingId ?? q?.id);
    return bId === targetBuildingId;
  });
}

/**
 * Cumulative permanent training capacity granted by Camp building levels 1–25.
 * Extracted from game configs (levels 1=17, 2=22, 3=26, 4=30, ..., 25=167).
 */
export const CAMP_TRAINING_CAPACITY_BY_LEVEL = [
  0, 17, 22, 26, 30, 35, 39, 43, 48, 52, 56, 61, 65, 69, 76, 84, 92, 101, 109, 117, 126, 134, 142, 151, 159, 167
] as const;

/**
 * Resolve training capacity for corresponding camp building (Camps 41, 42, 40).
 */
export function getBuildingTrainingCapacity(type: number, cache: any): number {
  if (!Number.isInteger(type) || type < 0 || type > 2) return 26;
  const targetBuildingId = CAMP_BUILDING_IDS[type];
  const raw = extractBuildingsRaw(cache);
  if (!raw || typeof raw !== 'object') return 26;

  for (const [key, value] of Object.entries(raw)) {
    const b: any = value;
    const id = Number(b?.buildingId ?? b?.id ?? (!Array.isArray(raw) ? key : NaN));
    if (id !== targetBuildingId) continue;
    const rawLevel = typeof b === 'number' ? b : b?.level;
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level <= 0) return 17;
    if (level >= CAMP_TRAINING_CAPACITY_BY_LEVEL.length) {
      return CAMP_TRAINING_CAPACITY_BY_LEVEL[CAMP_TRAINING_CAPACITY_BY_LEVEL.length - 1];
    }
    return CAMP_TRAINING_CAPACITY_BY_LEVEL[level];
  }
  return 26;
}

/**
 * Get unlocked troop levels for a given type, restricted to player's unlocked tiers.
 */
export function getUnlockedTroopLevels(type: number, cache: any, savedLevel?: number): number[] {
  if (!Number.isInteger(type) || type < 0 || type > 2) return [1];
  const levels = new Set<number>();
  const unitSummary = cache?.['getUnitSummary:unit']?.data ?? cache?.getUnitSummary?.data;

  // 1. Available troops
  for (const item of normalizeArray(unitSummary?.available)) {
    const info = getTroopType(item?.unitId);
    if (info && info.type === type && info.level >= 1 && info.level <= 10) {
      levels.add(info.level);
    }
  }

  // 2. Squads
  for (const sq of normalizeArray(unitSummary?.squads)) {
    for (const u of normalizeArray(sq?.units)) {
      const info = getTroopType(u?.id ?? u?.unitId);
      if (info && info.type === type && info.level >= 1 && info.level <= 10) {
        levels.add(info.level);
      }
    }
  }

  // 3. Hospital
  const healing = cache?.['getHealing:unit']?.data ?? cache?.getHealing?.data;
  for (const item of normalizeArray(healing?.injuredUnits)) {
    const info = getTroopType(item?.unitId);
    if (info && info.type === type && info.level >= 1 && info.level <= 10) {
      levels.add(info.level);
    }
  }

  // 4. Training queues
  const trainings = cache?.['getTrainings:unit']?.data ?? cache?.getTrainings?.data;
  for (const q of normalizeArray(trainings?.trainingQueues)) {
    const info = getTroopType(q?.unitId);
    if (info && info.type === type && info.level >= 1 && info.level <= 10) {
      levels.add(info.level);
    }
  }
  for (const q of normalizeArray(trainings?.upgradeQueues)) {
    for (const uId of [q?.targetUnitId, q?.sourceUnitId, q?.unitId]) {
      const info = getTroopType(uId);
      if (info && info.type === type && info.level >= 1 && info.level <= 10) {
        levels.add(info.level);
      }
    }
  }

  let maxLvl = levels.size > 0 ? Math.max(...levels) : 1;
  if (typeof savedLevel === 'number' && savedLevel >= 1 && savedLevel <= 10 && savedLevel > maxLvl) {
    maxLvl = savedLevel;
  }
  maxLvl = Math.max(1, Math.min(10, maxLvl));

  const result: number[] = [];
  for (let lvl = 1; lvl <= maxLvl; lvl++) {
    result.push(lvl);
  }
  return result;
}

/** Progress against the true cap, never against an inflated current-stock denominator. */
export function troopStockProgress(
  stock: { readyCount: number; hospitalCount: number; trainingCount: number; maxTroops: number | null },
  trainingCapacity: number = 26
) {
  const amounts = [stock.readyCount, stock.hospitalCount, stock.trainingCount].map(value =>
    Number.isFinite(value) ? Math.max(0, value) : 0);
  const currentTotal = amounts.reduce((sum, value) => sum + value, 0);
  const maxTarget = stock.maxTroops;
  const limitKnown = typeof maxTarget === 'number' && Number.isSafeInteger(maxTarget) && maxTarget >= 0;
  const remaining = limitKnown ? Math.max(0, maxTarget - currentTotal) : 0;
  const overLimit = limitKnown ? Math.max(0, currentTotal - maxTarget) : 0;
  const occupancyPct = !limitKnown ? null : maxTarget > 0 ? currentTotal / maxTarget * 100 : currentTotal === 0 ? 0 : null;
  let availablePct = 100;
  const segments = amounts.map(amount => {
    const raw = !limitKnown ? 0 : maxTarget > 0 ? amount / maxTarget * 100 : amount > 0 ? 100 : 0;
    const width = Math.max(0, Math.min(availablePct, raw));
    availablePct -= width;
    return width;
  });
  return {
    currentTotal, maxTarget, limitKnown, remaining, overLimit, occupancyPct,
    filledPct: segments.reduce((sum, value) => sum + value, 0),
    readyPct: segments[0], hospitalPct: segments[1], trainingPct: segments[2],
    canTrain: limitKnown && remaining > 0,
    unitsToTrain: Math.min(trainingCapacity, remaining)
  };
}

/** Stock limit, distinct from per-march capacity and per-batch trainingCapacity. */
export function calculateTroopMax(type: number, cache: any, _currentTotal = 0): number | null {
  if (!Number.isInteger(type) || type < 0 || type > 2) return null;
  const raw = extractBuildingsRaw(cache);
  if (raw == null) {
    const unitSummary = cache?.['getUnitSummary:unit']?.data ?? cache?.getUnitSummary?.data;
    const direct = unitSummary?.limits?.[type];
    return Number.isSafeInteger(direct) && direct >= 0 ? direct : null;
  }
  if (typeof raw !== 'object') return null;
  const confirmed = new Map<number, number>();
  for (const [key, value] of Object.entries(raw)) {
    const building: any = value;
    const id = Number(building?.buildingId ?? building?.id ?? (!Array.isArray(raw) ? key : NaN));
    const rawLevel = typeof building === 'number' ? building : building?.level;
    const level = rawLevel == null ? NaN : Number(rawLevel);
    if (!(DRILL_GROUND_BUILDING_IDS as readonly number[]).includes(id)) continue;
    if (!Number.isInteger(level) || level < 0) return null;
    confirmed.set(id, level);
  }
  let limit = 0;
  for (const id of DRILL_GROUND_BUILDING_IDS) {
    const level = confirmed.get(id) ?? 0;
    const value = DRILL_GROUND_LIMIT_BY_LEVEL[level];
    if (value == null) return null; // Never extrapolate unsupported building levels.
    limit += value;
  }
  return limit;
}

export interface AutoTrainCallPlan {
  calls: Array<{ name: string; args?: any; feature?: string }>;
  actions: Array<{ type: number; action: 'collect' | 'train'; unitId: number; count?: number }>;
}

/**
 * Builds atomic RPC calls for Auto Troop Training.
 * For each troop type:
 * - Collects finished training queue if completed.
 * - If idle and below stock limit, starts training with count = min(remaining, buildingCapacity).
 * - Level is constrained to player's unlocked troop levels.
 */
export function buildAutoTrainCalls(cache: any, settings: TroopTrainSettings, now = Date.now()): AutoTrainCallPlan {
  const result: AutoTrainCallPlan = { calls: [], actions: [] };
  if (!settings?.autoTrainEnabled) return result;

  const trainings = cache?.['getTrainings:unit']?.data ?? cache?.getTrainings?.data;
  const allQueues = [
    ...normalizeArray(trainings?.trainingQueues),
    ...normalizeArray(trainings?.upgradeQueues),
  ];

  for (const def of TROOP_DEFS) {
    const type = def.type;
    const queuesForType = allQueues.filter((q: any) => {
      const info = getTroopType(q?.targetUnitId ?? q?.sourceUnitId ?? q?.unitId);
      return info && info.type === type;
    });

    // Check if there is an active queue
    const activeQueue = queuesForType.find((q: any) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.duration) && q.startDate + q.duration > now
    );
    if (activeQueue) {
      continue;
    }

    // Check if there is a completed queue that needs collecting
    const completedQueue = queuesForType.find((q: any) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.duration) && q.startDate + q.duration <= now
    );
    if (completedQueue) {
      const targetUnitId = Number(completedQueue.targetUnitId ?? completedQueue.unitId);
      result.calls.push({
        name: 'completeTraining',
        args: { unitId: targetUnitId },
        feature: 'unit',
      });
      result.actions.push({
        type,
        action: 'collect',
        unitId: targetUnitId,
      });
    }

    // If camp building is currently upgrading, cannot start training new troops
    if (isCampBuildingUpgrading(type, cache)) {
      continue;
    }

    // Check stock limit
    const maxTroops = calculateTroopMax(type, cache);
    if (maxTroops == null) continue; // Unknown limit, do not train

    let readyCount = 0;
    let hospitalCount = 0;
    let trainingCount = 0;

    const unitSummary = cache?.['getUnitSummary:unit']?.data ?? cache?.getUnitSummary?.data;
    for (const item of normalizeArray(unitSummary?.available)) {
      const info = getTroopType(item?.unitId);
      if (info && info.type === type) readyCount += Number(item?.count) || 0;
    }
    for (const sq of normalizeArray(unitSummary?.squads)) {
      for (const u of normalizeArray(sq?.units)) {
        const info = getTroopType(u?.id ?? u?.unitId);
        if (info && info.type === type) readyCount += Number(u?.state?.survived) || 0;
      }
    }
    const healing = cache?.['getHealing:unit']?.data ?? cache?.getHealing?.data;
    for (const item of normalizeArray(healing?.injuredUnits)) {
      const info = getTroopType(item?.unitId);
      if (info && info.type === type) hospitalCount += Number(item?.count) || 0;
    }
    for (const q of queuesForType) {
      trainingCount += Number(q?.unitCount) || 0;
    }

    const currentTotal = readyCount + hospitalCount + trainingCount;
    const remaining = maxTroops - currentTotal;
    if (remaining <= 0) continue; // Max reached

    const buildingCap = getBuildingTrainingCapacity(type, cache);
    const count = Math.min(buildingCap, remaining);
    if (count <= 0) continue;

    // Determine chosen level restricted to unlocked levels
    const unlocked = getUnlockedTroopLevels(type, cache, settings.trainLevels?.[type]);
    const configuredLevel = settings.trainLevels?.[type];
    const chosenLevel = (typeof configuredLevel === 'number' && unlocked.includes(configuredLevel))
      ? configuredLevel
      : unlocked[unlocked.length - 1];

    const targetUnitId = type === 0 ? chosenLevel : (type === 1 ? 10 + chosenLevel : 20 + chosenLevel);
    const duration = Math.max(10000, Math.round(count * 46342));
    const startDate = now;

    result.calls.push({
      name: 'startTraining',
      args: { unitId: targetUnitId, count, startDate, duration },
      feature: 'unit',
    });
    result.actions.push({
      type,
      action: 'train',
      unitId: targetUnitId,
      count,
    });
  }

  if (result.calls.length > 0) {
    result.calls.push({ name: 'getTrainings', feature: 'unit' });
    result.calls.push({ name: 'getUnitSummary', feature: 'unit' });
  }

  return result;
}
