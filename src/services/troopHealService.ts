/**
 * Smart Batch Auto-Heal Service (`troopHealService.ts`).
 *
 * Prevents locking the Infirmary for tens of hours when wounded counts are huge:
 * - Batch baseline: computed directly from the account's strongest 5-hero team
 *   (`highestPowerHeroes` + `capacityModel`/`squadCapacity`), NOT from `customTeams`.
 *   Default `batchPerType = 0` uses `ceil(topTeamCapacity / 3)` per troop type,
 *   or the user can override with a fixed per-type batch (e.g. 1000).
 * - Shortfall target: `(calculateAccountMaxMarches(cache) + 1)` teams
 *   (enough ready troops for all marches + 1 full defense team).
 * - Tier priority: always heals highest troop level first (`Lv.10 -> Lv.1`).
 * - Zero-Emerald safety: only dispatches standard `startHealing` / `completeHealing`.
 */
import {
  calculateHealingDurationMs,
  getTroopType,
  normalizeArray,
  UNIT_HEALING_DURATION_MS_BY_LEVEL,
} from '../utils/troops.ts';
import {
  capacityModel,
  highestPowerHeroes,
  normalizeCapacitySettings,
  squadCapacity,
} from '../utils/squadCapacity.ts';
import { calculateAccountMaxMarches } from '../utils/dashboardState.ts';
import type { TroopHealSettings } from '../types/index.ts';

export const DEFAULT_TROOP_HEAL_SETTINGS: TroopHealSettings = {
  autoHealEnabled: false,
  batchPerType: 0, // 0 = Auto (1 strongest team / 3 per type)
  prioritizeTeamDemand: true,
  minInjuredToStart: 100,
  onlyHealTeamShortfall: false,
  maxBatchDurationMin: 0,
};

export const AUTO_HEAL_ERROR_BACKOFF_MS = 15 * 60 * 1000;
export const AUTO_HEAL_WAKE_BUFFER_MS = 2000;
export const FALLBACK_TOP_TEAM_CAPACITY = 3000;

export interface MarchDefenseDemand {
  topTeamCapacity: number;
  topTeamHeroIds: number[];
  autoBatchPerType: number;
  maxMarches: number;
  requiredTeams: number;
  targetPerType: number;
  readyByType: [number, number, number];
  shortfallByType: [number, number, number];
  totalShortfall: number;
}

export interface SmartHealBatchResult {
  units: Array<{ unitId: number; count: number }>;
  totalCount: number;
  perTypeCounts: [number, number, number];
  effectiveBatchPerType: number;
  estimatedDurationMs: number;
  reason: 'batch_selected' | 'shortfall_priority' | 'demand_met' | 'no_injured';
}

export interface AutoHealPlan {
  action: 'heal' | 'complete' | 'waiting' | 'below_threshold' | 'demand_met' | 'no_injured' | 'backoff';
  calls: Array<{ name: string; feature?: string; args?: Record<string, any> }>;
  nextWakeAt: number | null;
  batch?: SmartHealBatchResult;
  demand: MarchDefenseDemand;
  totalInjured: number;
}

export function normalizeTroopHealSettings(raw?: Partial<TroopHealSettings> | null): TroopHealSettings {
  const rawBatch = Number(raw?.batchPerType);
  const batchPerType =
    Number.isFinite(rawBatch) && rawBatch > 0
      ? Math.max(100, Math.min(50000, Math.floor(rawBatch)))
      : 0;

  const rawMin = Number(raw?.minInjuredToStart);
  const minInjuredToStart =
    Number.isFinite(rawMin) && rawMin >= 0
      ? Math.min(50000, Math.floor(rawMin))
      : DEFAULT_TROOP_HEAL_SETTINGS.minInjuredToStart;

  const rawMaxDur = Number(raw?.maxBatchDurationMin);
  const maxBatchDurationMin =
    Number.isFinite(rawMaxDur) && rawMaxDur > 0
      ? Math.min(1440, Math.floor(rawMaxDur))
      : 0;

  return {
    autoHealEnabled: raw?.autoHealEnabled === true,
    batchPerType,
    prioritizeTeamDemand: raw?.prioritizeTeamDemand !== false,
    minInjuredToStart,
    onlyHealTeamShortfall: raw?.onlyHealTeamShortfall === true,
    maxBatchDurationMin,
  };
}

/**
 * Counts ready troops (available in city + currently deployed in squads) per troop type [Infantry, Spearmen, Marksmen].
 */
export function countReadyTroopsByType(unitSummary: any): [number, number, number] {
  const ready: [number, number, number] = [0, 0, 0];
  if (!unitSummary || typeof unitSummary !== 'object') return ready;

  for (const item of normalizeArray(unitSummary.available)) {
    const info = getTroopType(item?.unitId);
    const count = Math.max(0, Math.floor(Number(item?.count) || 0));
    if (info && count > 0) {
      ready[info.type] += count;
    }
  }

  for (const sq of normalizeArray(unitSummary.squads)) {
    for (const u of normalizeArray(sq?.units)) {
      const info = getTroopType(u?.id ?? u?.unitId);
      const count = Math.max(0, Math.floor(Number(u?.state?.survived ?? u?.count) || 0));
      if (info && count > 0) {
        ready[info.type] += count;
      }
    }
  }

  return ready;
}

/**
 * Computes the batch baseline from the strongest 5-hero team (by total power, ignoring customTeams)
 * and the ready-troop shortfall for `(maxMarches + 1)` teams (all marches + 1 defense team).
 */
export function computeMarchDefenseDemand(
  cache: Record<string, any> | null | undefined,
  stored?: Record<string, any> | null
): MarchDefenseDemand {
  const safeCache = cache && typeof cache === 'object' ? cache : {};
  const heroes = safeCache.heroGetAll?.data && typeof safeCache.heroGetAll.data === 'object'
    ? safeCache.heroGetAll.data
    : {};
  const accountId = safeCache.accountStatus?.data?.id;
  const capacitySettings = normalizeCapacitySettings(stored?.troopCapacitySettings);
  const observations = Array.isArray(stored?.capacityObservations) ? stored.capacityObservations : [];

  const topTeamHeroIds = highestPowerHeroes(heroes);
  let topTeamCapacity = FALLBACK_TOP_TEAM_CAPACITY;

  if (topTeamHeroIds.length > 0) {
    const modeled = capacityModel(topTeamHeroIds, heroes, observations, capacitySettings, accountId);
    if (Number.isFinite(modeled?.total) && (modeled.total as number) > 0) {
      topTeamCapacity = Math.floor(modeled.total as number);
    } else {
      const direct = squadCapacity(
        topTeamHeroIds,
        heroes,
        undefined,
        capacitySettings.base,
        capacitySettings.defaultHero
      );
      if (Number.isFinite(direct) && (direct as number) > 0) {
        topTeamCapacity = Math.floor(direct as number);
      }
    }
  }

  const autoBatchPerType = Math.max(1, Math.ceil(topTeamCapacity / 3));
  const maxMarches = calculateAccountMaxMarches(safeCache);
  const requiredTeams = maxMarches + 1;
  const targetPerType = Math.ceil((topTeamCapacity * requiredTeams) / 3);

  const unitSummary = safeCache['getUnitSummary:unit']?.data || safeCache.getUnitSummary?.data;
  const readyByType = countReadyTroopsByType(unitSummary);
  const shortfallByType: [number, number, number] = [
    Math.max(0, targetPerType - readyByType[0]),
    Math.max(0, targetPerType - readyByType[1]),
    Math.max(0, targetPerType - readyByType[2]),
  ];
  const totalShortfall = shortfallByType[0] + shortfallByType[1] + shortfallByType[2];

  return {
    topTeamCapacity,
    topTeamHeroIds,
    autoBatchPerType,
    maxMarches,
    requiredTeams,
    targetPerType,
    readyByType,
    shortfallByType,
    totalShortfall,
  };
}

function selectHighestTierUnitsForType(
  injuredForType: Array<{ unitId: number; level: number; count: number }>,
  quota: number
): Array<{ unitId: number; count: number }> {
  if (quota <= 0 || injuredForType.length === 0) return [];
  const sorted = [...injuredForType].sort((a, b) => b.level - a.level || b.unitId - a.unitId);
  const picked: Array<{ unitId: number; count: number }> = [];
  let remaining = quota;
  for (const item of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, item.count);
    if (take > 0) {
      picked.push({ unitId: item.unitId, count: take });
      remaining -= take;
    }
  }
  return picked;
}

function trimBatchToMaxDuration(
  units: Array<{ unitId: number; count: number }>,
  maxDurationMs: number
): Array<{ unitId: number; count: number }> {
  if (maxDurationMs <= 0 || units.length === 0) return units;
  if (calculateHealingDurationMs(units) <= maxDurationMs) return units;

  // Keep highest-tier units first across types, trimming lower tiers first.
  const enriched = units
    .map((u) => {
      const info = getTroopType(u.unitId);
      const level = info?.level ?? 7;
      const perUnitMs = UNIT_HEALING_DURATION_MS_BY_LEVEL[level] ?? 8000;
      return { unitId: u.unitId, type: info?.type ?? 0, level, count: u.count, perUnitMs };
    })
    .sort((a, b) => b.level - a.level || a.type - b.type);

  const kept: Array<{ unitId: number; count: number }> = [];
  let usedMs = 0;

  for (const entry of enriched) {
    const budgetMs = maxDurationMs - usedMs;
    if (budgetMs < entry.perUnitMs) continue;
    const maxCount = Math.floor(budgetMs / entry.perUnitMs);
    const take = Math.min(entry.count, maxCount);
    if (take > 0) {
      kept.push({ unitId: entry.unitId, count: take });
      usedMs += take * entry.perUnitMs;
    }
  }

  // Ensure at least 1 highest-tier troop if cap is tighter than 1 unit's duration
  if (kept.length === 0 && enriched.length > 0) {
    kept.push({ unitId: enriched[0].unitId, count: 1 });
  }
  return kept;
}

/**
 * Selects the next optimal healing batch from `healingData.injuredUnits`:
 * - Uses `effectiveBatchPerType = settings.batchPerType > 0 ? settings.batchPerType : demand.autoBatchPerType`.
 * - When `prioritizeTeamDemand` is true and any troop type is below `(maxMarches + 1)` target,
 *   heals only the deficient troop types first (capped by `effectiveBatchPerType`).
 * - Always picks highest troop levels first (`Lv.10 -> Lv.1`).
 */
export function buildSmartHealBatch(
  healingData: any,
  rawSettings?: Partial<TroopHealSettings> | null,
  demand?: MarchDefenseDemand | null
): SmartHealBatchResult {
  const settings = normalizeTroopHealSettings(rawSettings);
  const safeDemand: MarchDefenseDemand = demand || {
    topTeamCapacity: FALLBACK_TOP_TEAM_CAPACITY,
    topTeamHeroIds: [],
    autoBatchPerType: Math.ceil(FALLBACK_TOP_TEAM_CAPACITY / 3),
    maxMarches: 3,
    requiredTeams: 4,
    targetPerType: Math.ceil((FALLBACK_TOP_TEAM_CAPACITY * 4) / 3),
    readyByType: [0, 0, 0],
    shortfallByType: [0, 0, 0],
    totalShortfall: 0,
  };

  const effectiveBatchPerType =
    settings.batchPerType > 0 ? settings.batchPerType : safeDemand.autoBatchPerType;

  // Aggregate injured units by troop type & unitId
  const byType: [
    Map<number, { unitId: number; level: number; count: number }>,
    Map<number, { unitId: number; level: number; count: number }>,
    Map<number, { unitId: number; level: number; count: number }>,
  ] = [new Map(), new Map(), new Map()];

  let totalInjured = 0;
  for (const item of normalizeArray(healingData?.injuredUnits)) {
    const unitId = Number(item?.unitId);
    const count = Math.floor(Number(item?.count) || 0);
    const info = getTroopType(unitId);
    if (!info || !Number.isInteger(unitId) || count <= 0) continue;
    totalInjured += count;
    const prev = byType[info.type].get(unitId);
    byType[info.type].set(unitId, {
      unitId,
      level: info.level,
      count: (prev?.count || 0) + count,
    });
  }

  if (totalInjured <= 0) {
    return {
      units: [],
      totalCount: 0,
      perTypeCounts: [0, 0, 0],
      effectiveBatchPerType,
      estimatedDurationMs: 0,
      reason: 'no_injured',
    };
  }

  const hasShortfall = safeDemand.totalShortfall > 0;
  if (settings.onlyHealTeamShortfall && !hasShortfall) {
    return {
      units: [],
      totalCount: 0,
      perTypeCounts: [0, 0, 0],
      effectiveBatchPerType,
      estimatedDurationMs: 0,
      reason: 'demand_met',
    };
  }

  // Determine per-type quotas
  let reason: SmartHealBatchResult['reason'] = 'batch_selected';
  const quotas: [number, number, number] = [0, 0, 0];

  const hasInjuredInShortfallType =
    settings.prioritizeTeamDemand &&
    hasShortfall &&
    ([0, 1, 2] as const).some((t) => safeDemand.shortfallByType[t] > 0 && byType[t].size > 0);

  if (hasInjuredInShortfallType) {
    reason = 'shortfall_priority';
    for (const t of [0, 1, 2] as const) {
      if (safeDemand.shortfallByType[t] > 0 && byType[t].size > 0) {
        quotas[t] = Math.min(safeDemand.shortfallByType[t], effectiveBatchPerType);
      }
    }
  } else if (settings.onlyHealTeamShortfall) {
    return {
      units: [],
      totalCount: 0,
      perTypeCounts: [0, 0, 0],
      effectiveBatchPerType,
      estimatedDurationMs: 0,
      reason: 'demand_met',
    };
  } else {
    quotas[0] = effectiveBatchPerType;
    quotas[1] = effectiveBatchPerType;
    quotas[2] = effectiveBatchPerType;
  }

  let selected: Array<{ unitId: number; count: number }> = [];
  for (const t of [0, 1, 2] as const) {
    const list = [...byType[t].values()];
    selected.push(...selectHighestTierUnitsForType(list, quotas[t]));
  }

  if ((settings.maxBatchDurationMin || 0) > 0) {
    selected = trimBatchToMaxDuration(selected, (settings.maxBatchDurationMin || 0) * 60_000);
  }

  const perTypeCounts: [number, number, number] = [0, 0, 0];
  let totalCount = 0;
  for (const u of selected) {
    const info = getTroopType(u.unitId);
    if (info) perTypeCounts[info.type] += u.count;
    totalCount += u.count;
  }

  return {
    units: selected,
    totalCount,
    perTypeCounts,
    effectiveBatchPerType,
    estimatedDurationMs: calculateHealingDurationMs(selected),
    reason: totalCount > 0 ? reason : 'no_injured',
  };
}

export function needsTroopHealRefresh(cache: Record<string, any> | null | undefined, now = Date.now()): boolean {
  const entry = cache?.['getHealing:unit'] || cache?.getHealing;
  if (!entry?.data) return true;
  const updatedAt = entry.updatedAt ? Date.parse(entry.updatedAt) : 0;
  return !Number.isFinite(updatedAt) || now - updatedAt > 5 * 60 * 1000;
}

/**
 * Pure alarm-driven planner for background Auto Batch Healing:
 * - Active healing -> wait until `endsAt + 2s`
 * - Finished healing -> dispatch `completeHealing` + `getUnitSummary` + `getHealing`
 * - Idle infirmary -> evaluate threshold & build smart batch -> dispatch `startHealing` + `getHealing`
 */
export function buildAutoHealCalls(
  cache: Record<string, any> | null | undefined,
  stored: Record<string, any> | null | undefined,
  rawSettings?: Partial<TroopHealSettings> | null,
  now = Date.now()
): AutoHealPlan {
  const settings = normalizeTroopHealSettings(rawSettings);
  const demand = computeMarchDefenseDemand(cache, stored);
  const healingData = cache?.['getHealing:unit']?.data || cache?.getHealing?.data;

  const injuredList = normalizeArray(healingData?.injuredUnits);
  const totalInjured = injuredList.reduce((sum: number, u: any) => sum + Math.max(0, Number(u?.count) || 0), 0);

  const activeHealing = healingData?.healing;
  const healingUnits = normalizeArray(activeHealing?.units);
  const startDate = Number(activeHealing?.startDate);
  const duration = Number(activeHealing?.duration);
  const hasHealingBatch = healingUnits.length > 0 && Number.isFinite(startDate) && Number.isFinite(duration);

  if (hasHealingBatch) {
    const endsAt = startDate + duration;
    if (endsAt > now) {
      return {
        action: 'waiting',
        calls: [],
        nextWakeAt: endsAt + AUTO_HEAL_WAKE_BUFFER_MS,
        demand,
        totalInjured,
      };
    }
    return {
      action: 'complete',
      calls: [
        { name: 'completeHealing', args: { completeDate: now }, feature: 'unit' },
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' },
      ],
      nextWakeAt: null,
      demand,
      totalInjured,
    };
  }

  if (totalInjured <= 0) {
    return {
      action: 'no_injured',
      calls: [],
      nextWakeAt: null,
      demand,
      totalInjured: 0,
    };
  }

  // Respect error backoff if a previous startHealing failed (e.g. insufficient resources)
  const nextRetryAt = Number(stored?.autoHealState?.nextRetryAt);
  if (Number.isFinite(nextRetryAt) && nextRetryAt > now) {
    return {
      action: 'backoff',
      calls: [],
      nextWakeAt: nextRetryAt,
      demand,
      totalInjured,
    };
  }

  // Skip tiny batches unless we have an active march/defense shortfall
  if (totalInjured < settings.minInjuredToStart && demand.totalShortfall <= 0) {
    return {
      action: 'below_threshold',
      calls: [],
      nextWakeAt: null,
      demand,
      totalInjured,
    };
  }

  const batch = buildSmartHealBatch(healingData, settings, demand);
  if (batch.units.length === 0) {
    return {
      action: batch.reason === 'demand_met' ? 'demand_met' : 'no_injured',
      calls: [],
      nextWakeAt: null,
      batch,
      demand,
      totalInjured,
    };
  }

  return {
    action: 'heal',
    calls: [
      {
        name: 'startHealing',
        feature: 'unit',
        args: {
          startDate: now,
          duration: batch.estimatedDurationMs,
          units: batch.units,
        },
      },
      { name: 'getHealing', feature: 'unit' },
    ],
    nextWakeAt: now + batch.estimatedDurationMs + AUTO_HEAL_WAKE_BUFFER_MS,
    batch,
    demand,
    totalInjured,
  };
}
