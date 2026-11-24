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
 * Base healing duration per single unit (in milliseconds) for troop levels 1–10.
 * Extracted from game remote config `unitHealing` (7bb1bceb5515df43ecf378d584c94e21.json):
 * Lv.1=1s, Lv.2=2s, Lv.3=2s, Lv.4=3s, Lv.5=4s, Lv.6=6s, Lv.7=8s, Lv.8=11s, Lv.9=13s, Lv.10=15s.
 */
export const UNIT_HEALING_DURATION_MS_BY_LEVEL = [
  0, 1000, 2000, 2000, 3000, 4000, 6000, 8000, 11000, 13000, 15000
] as const;

/**
 * Calculates total healing duration (ms) for a list of injured units based on each unit's tier/level.
 */
export function calculateHealingDurationMs(units: Array<{ unitId: number | string; count: number }>): number {
  let totalMs = 0;
  for (const u of units || []) {
    const count = Number(u?.count) || 0;
    if (count <= 0) continue;
    const info = getTroopType(u?.unitId);
    const level = info?.level ?? 7;
    const perUnitMs = UNIT_HEALING_DURATION_MS_BY_LEVEL[level] ?? 8000;
    totalMs += count * perUnitMs;
  }
  return totalMs;
}

/**
 * Cumulative permanent `trainingCapacity` bonuses granted by Personal Researches
 * ("Camp Expansion I–VII" / "Расширение лагеря I–VII"), extracted from
 * `personalResearchLevel` + `bonus` game configs.
 */
export const RESEARCH_TRAINING_CAPACITY_BY_ID: Record<number, readonly number[]> = {
  3: [0, 2, 4, 7],                                   // Camp Expansion I (+2, +2, +3)
  59: [0, 4, 9, 15],                                 // Camp Expansion II (+4, +5, +6)
  90: [0, 7, 14, 23],                                // Camp Expansion III (+7, +7, +9)
  125: [0, 9, 18, 30],                               // Camp Expansion IV (+9, +9, +12)
  158: [0, 11, 22, 37],                              // Camp Expansion V (+11, +11, +15)
  189: [0, 14, 28, 46],                              // Camp Expansion VI (+14, +14, +18)
  492: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],      // Camp Expansion VII (+2 x 10)
};

export function extractCompletedResearches(cache: any): any[] {
  if (!cache || typeof cache !== 'object') return [];
  const raw =
    cache?.researchStatus?.data?.completedResearches ??
    cache?.researchStatus?.data?.researches ??
    cache?.['getSummary:personalResearch']?.data?.completedResearches ??
    cache?.personalResearch_getSummary?.data?.completedResearches ??
    cache?.clan_getSummary?.data?.completedResearches ??
    null;
  return normalizeArray(raw);
}

/**
 * Sums permanent training batch capacity bonuses from completed Personal Researches.
 */
export function getResearchTrainingCapacityBonus(cache: any): number {
  const completed = extractCompletedResearches(cache);
  if (!completed.length) return 0;

  let bonus = 0;
  const maxByResearch = new Map<number, number>();
  for (const item of completed) {
    const rId = Number(item?.researchId ?? item?.id);
    const level = Number(item?.level);
    if (!Number.isInteger(rId) || !Number.isInteger(level) || level <= 0) continue;
    const table = RESEARCH_TRAINING_CAPACITY_BY_ID[rId];
    if (!table) continue;
    const clamped = Math.min(level, table.length - 1);
    const val = table[clamped] || 0;
    const prev = maxByResearch.get(rId) || 0;
    if (val > prev) maxByResearch.set(rId, val);
  }
  for (const val of maxByResearch.values()) {
    bonus += val;
  }
  return bonus;
}

/**
 * Resolve total training batch capacity for corresponding camp building (Camps 40, 41, 42)
 * plus permanent bonuses from completed Personal Researches.
 */
export function getBuildingTrainingCapacity(type: number, cache: any): number {
  const researchBonus = getResearchTrainingCapacityBonus(cache);
  if (!Number.isInteger(type) || type < 0 || type > 2) return 26 + researchBonus;
  const targetBuildingId = CAMP_BUILDING_IDS[type];
  const raw = extractBuildingsRaw(cache);
  if (!raw || typeof raw !== 'object') return 26 + researchBonus;

  for (const [key, value] of Object.entries(raw)) {
    const b: any = value;
    const id = Number(b?.buildingId ?? b?.id ?? (!Array.isArray(raw) ? key : NaN));
    if (id !== targetBuildingId) continue;
    const rawLevel = typeof b === 'number' ? b : b?.level;
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level <= 0) return 17 + researchBonus;
    if (level >= CAMP_TRAINING_CAPACITY_BY_LEVEL.length) {
      return CAMP_TRAINING_CAPACITY_BY_LEVEL[CAMP_TRAINING_CAPACITY_BY_LEVEL.length - 1] + researchBonus;
    }
    return CAMP_TRAINING_CAPACITY_BY_LEVEL[level] + researchBonus;
  }
  return 26 + researchBonus;
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

/**
 * Computes the earliest future timestamp when an active training queue, upgrade queue,
 * or camp building upgrade will finish so the background scheduler can wake up on time.
 */
export function getNextTroopTrainWakeAt(cache: any, now = Date.now()): number | null {
  if (!cache || typeof cache !== 'object') return null;
  let earliest: number | null = null;
  const consider = (ts: number) => {
    if (Number.isFinite(ts) && ts > now && (earliest === null || ts < earliest)) {
      earliest = ts;
    }
  };

  const trainings = cache?.['getTrainings:unit']?.data ?? cache?.getTrainings?.data;
  const allQueues = [
    ...normalizeArray(trainings?.trainingQueues),
    ...normalizeArray(trainings?.upgradeQueues),
  ];
  for (const q of allQueues) {
    if (Number.isFinite(q?.startDate) && Number.isFinite(q?.duration)) {
      consider(q.startDate + q.duration);
    }
  }

  const campIds = new Set(Object.values(CAMP_BUILDING_IDS));
  for (const bq of extractBuildingQueues(cache)) {
    const bId = Number(bq?.buildingId ?? bq?.id);
    if (!campIds.has(bId)) continue;
    const start = Number(bq?.startDate ?? bq?.startTime);
    const dur = Number(bq?.durationMs ?? bq?.duration);
    if (Number.isFinite(start) && Number.isFinite(dur)) {
      consider(start + dur);
    }
  }

  return earliest;
}

/**
 * Determines whether the background Auto Troop Training runner should refresh
 * building/unit/training snapshots before deciding that nothing can be trained.
 */
export function needsTroopTrainingRefresh(cache: any, now = Date.now(), staleMs = 5 * 60 * 1000): boolean {
  if (!cache || typeof cache !== 'object') return true;

  const unitSummaryEntry = cache['getUnitSummary:unit'] ?? cache.getUnitSummary;
  const trainingsEntry = cache['getTrainings:unit'] ?? cache.getTrainings;
  const buildingsRaw = extractBuildingsRaw(cache);

  if (!unitSummaryEntry?.data || !trainingsEntry?.data) return true;
  if (buildingsRaw == null && !unitSummaryEntry.data?.limits) return true;

  // If a camp building upgrade queue has already elapsed, buildingStatus is likely stale
  const campIds = new Set(Object.values(CAMP_BUILDING_IDS));
  for (const bq of extractBuildingQueues(cache)) {
    const bId = Number(bq?.buildingId ?? bq?.id);
    if (!campIds.has(bId)) continue;
    const start = Number(bq?.startDate ?? bq?.startTime);
    const dur = Number(bq?.durationMs ?? bq?.duration);
    if (Number.isFinite(start) && Number.isFinite(dur) && start + dur <= now) {
      return true;
    }
  }

  // If trainings cache is stale and no active future training is known, refresh
  const trainingsUpdatedAt = Date.parse(trainingsEntry.updatedAt || '');
  if (Number.isFinite(trainingsUpdatedAt) && now - trainingsUpdatedAt > staleMs) {
    const nextWake = getNextTroopTrainWakeAt(cache, now);
    if (nextWake === null) return true;
  }

  return false;
}
