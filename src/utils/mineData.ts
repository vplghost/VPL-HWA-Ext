/**
 * Mine & Gathering Utilities for Hero Wars: Alliance
 * Provides typed definitions and algorithms for:
 * - Mine configurations (Levels 1 to 10 for Wood, Food/Gold, Stone, Iron)
 * - Resource cargo weights and troop cargo capacities
 * - Optimized gathering team formation and march/search RPC calls
 */

import {
  unitInfo,
  normalizeCapacitySettings,
  heroCapacity,
  allocateTroops,
} from './squadCapacity.ts';

function asArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val) as T[];
  return [];
}

// Hero Wars: Alliance 1.294.0 (client 1.294.1020) globalMapMine remote config 8e714674: levels 1–10.
export const mineConfigs: Record<string, number[]> = {
  wood: [12, 20, 21, 22, 23, 24, 55, 56, 57, 58],
  food: [27, 28, 29, 30, 31, 32, 65, 66, 67, 68],
  stone: [35, 36, 37, 38, 39, 40, 75, 76, 77, 78],
  iron: [43, 44, 45, 46, 47, 48, 85, 86, 87, 88],
};

export function getMineConfigId(type: string, level: number): number | null {
  const mappedType = type === 'gold' ? 'food' : type;
  const lvl = Math.max(1, Math.min(10, Math.floor(level)));
  return mineConfigs[mappedType]?.[lvl - 1] ?? null;
}

export function getMineTypeLevel(configId: number): { type: string; level: number } | null {
  const id = Number(configId);
  for (const [type, ids] of Object.entries(mineConfigs)) {
    const idx = ids.indexOf(id);
    if (idx >= 0) return { type, level: idx + 1 };
  }
  return null;
}

export const mineConfigId = getMineConfigId;
export const mineTypeLevel = getMineTypeLevel;

export function buildMineSearchCall(mapId: string, center: { x: number; y: number }, type: string, level: number) {
  const configId = getMineConfigId(type, level);
  if (!mapId || !Number.isFinite(center?.x) || !Number.isFinite(center?.y) || !configId) return null;
  return {
    name: 'searchMine',
    feature: 'mine',
    args: {
      mapId,
      mineConfigIds: [configId],
      fullOnly: true,
      center: { x: center.x, y: center.y },
    },
  };
}

export function buildGatherCall(mapId: string, mineId: string, squad: any) {
  if (!mapId || !mineId || !squad) return null;
  return {
    name: 'attackMine',
    feature: 'mine',
    args: {
      mapId,
      mineId,
      battleType: 'pve',
      squad,
    },
  };
}

export const RESOURCE_CARGO_WEIGHT: Record<string, number> = {
  food: 1,
  wood: 1,
  stone: 5,
  iron: 20,
};

export const MINE_LEVEL_TOTAL_CARGO: Record<number, number> = {
  1: 70000,
  2: 150000,
  3: 300000,
  4: 600000,
  5: 1200000,
  6: 3000000,
  7: 5000000,
  8: 7500000,
  9: 10500000,
  10: 14000000,
};

export const TROOP_CARGO_CAPACITY_BY_LEVEL: Record<number, number> = {
  1: 240,
  2: 260,
  3: 280,
  4: 440,
  5: 800,
  6: 1200,
  7: 1900,
  8: 3000,
  9: 6000,
  10: 10000,
};

export function calculateMineCargo(
  mineType: string,
  mineLevel: number,
  resourcesAmount?: number
): number {
  const normType = (mineType || 'food').toLowerCase();
  const weight = RESOURCE_CARGO_WEIGHT[normType] ?? 1;
  const num = Number(resourcesAmount);
  if (Number.isFinite(num) && num > 0) {
    return Math.ceil(num * weight);
  }
  const lvl = Math.min(10, Math.max(1, Math.floor(mineLevel) || 1));
  return MINE_LEVEL_TOTAL_CARGO[lvl] ?? 70000;
}

export function calculateRequiredTroopsForCargo(cargo: number, unitSummary?: any): number {
  if (!Number.isFinite(cargo) || cargo <= 0) return 0;
  const avail = asArray(unitSummary?.available || unitSummary?.units);
  const stacks: Array<{ level: number; count: number }> = [];
  for (const item of avail) {
    const id = Number(item?.unitId);
    const count = Number(item?.count);
    if (Number.isSafeInteger(id) && Number.isSafeInteger(count) && count > 0) {
      const info = unitInfo(id);
      const level = info?.level || (id % 10) || 1;
      stacks.push({ level, count });
    }
  }
  stacks.sort((a, b) => b.level - a.level);

  let cargoRemaining = cargo;
  let troopsNeeded = 0;
  for (const stack of stacks) {
    if (cargoRemaining <= 0) break;
    const troopCap = TROOP_CARGO_CAPACITY_BY_LEVEL[stack.level] ?? 240;
    const stackCargo = stack.count * troopCap;
    if (stackCargo <= cargoRemaining) {
      troopsNeeded += stack.count;
      cargoRemaining -= stackCargo;
    } else {
      troopsNeeded += Math.ceil(cargoRemaining / troopCap);
      cargoRemaining = 0;
      break;
    }
  }

  if (cargoRemaining > 0) {
    const bestLevel = stacks[0]?.level || 7;
    const troopCap = TROOP_CARGO_CAPACITY_BY_LEVEL[bestLevel] ?? 1900;
    troopsNeeded += Math.ceil(cargoRemaining / troopCap);
  }

  return Math.max(1, troopsNeeded);
}

export interface OptimizedGatheringTeamParams {
  heroes: Record<string | number, any>;
  availableHeroIds: number[];
  unitSummary?: any;
  mineType?: string;
  mineLevel?: number;
  resourcesAmount?: number;
  resourceAmount?: number;
  remainingAmount?: number;
  targetMine?: any;
  mine?: any;
  capacitySettings?: any;
  accountId?: any;
}

export interface OptimizedGatheringTeamResult {
  heroIds: number[];
  requiredCargo: number;
  requiredTroops: number;
  squadCapacity: number;
  allocatedTroops: Array<{ unitId: number; count: number }>;
}

export function buildOptimizedGatheringTeam(
  params: OptimizedGatheringTeamParams
): OptimizedGatheringTeamResult {
  const target = params.targetMine || params.mine;
  const {
    heroes = {},
    availableHeroIds = [],
    unitSummary,
    mineType = target?.mineType || target?.type || 'food',
    mineLevel = target?.level || 10,
    capacitySettings,
  } = params;

  const rawAmount =
    params.resourcesAmount ??
    params.resourceAmount ??
    params.remainingAmount ??
    target?.resourceAmount ??
    target?.resourcesAmount ??
    target?.amount ??
    target?.remainingAmount ??
    target?.remainingResourceAmount;

  const numAmount = Number(rawAmount);
  const resourcesAmount = Number.isFinite(numAmount) && numAmount > 0 ? numAmount : undefined;

  const requiredCargo = calculateMineCargo(mineType, mineLevel, resourcesAmount);
  const requiredTroops = calculateRequiredTroopsForCargo(requiredCargo, unitSummary);

  const sortedHeroIds = [...availableHeroIds]
    .filter((id) => heroes[String(id)])
    .sort((a, b) => {
      const pa = Number(heroes[String(a)]?.power) || 0;
      const pb = Number(heroes[String(b)]?.power) || 0;
      if (pa !== pb) return pa - pb;
      return Number(a) - Number(b);
    });

  const normSettings = normalizeCapacitySettings(capacitySettings);
  const baseCapacity = normSettings.base;

  const selectedHeroIds: number[] = [];
  let currentSquadCapacity = baseCapacity;

  for (const heroId of sortedHeroIds) {
    selectedHeroIds.push(heroId);
    const heroCap = heroCapacity(heroId, heroes[String(heroId)], null, normSettings.defaultHero);
    currentSquadCapacity += heroCap;

    if (currentSquadCapacity >= requiredTroops || selectedHeroIds.length >= 5) {
      break;
    }
  }

  const targetTroops = Math.min(currentSquadCapacity, requiredTroops);
  const allocatedTroops = allocateTroops(unitSummary, targetTroops);

  return {
    heroIds: selectedHeroIds,
    requiredCargo,
    requiredTroops,
    squadCapacity: currentSquadCapacity,
    allocatedTroops,
  };
}
