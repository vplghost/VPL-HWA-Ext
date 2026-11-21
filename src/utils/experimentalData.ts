/**
 * Experimental Data Helpers for Hero Wars: Alliance
 * Provides typed definitions and algorithms for:
 * - Mine configurations (Levels 1 to 10 for Wood, Food/Gold, Stone, Iron)
 * - Boss configurations and levels (Levels 1 to 30)
 * - Solo Monster configurations and levels (Levels 1 to 30)
 * - Troop Capacity calculation & allocation across Marksmen, Spearmen, Infantry
 * - Squad formation and march/rally call builders
 */

export const rallyWaitOptions = [60, 300, 900, 1800] as const;

function asArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val) as T[];
  return [];
}

export const capacityExamples: Record<number, [number, number, number]> = {
  16: [80, 3, 799],
  67: [70, 4, 740],
  14: [30, 2, 685],
  33: [2, 1, 623],
  38: [1, 1, 622],
};

export interface CapacitySettings {
  defaultHero: number;
  base: number;
}

export function normalizeCapacitySettings(settings?: Partial<CapacitySettings> | null): CapacitySettings {
  return {
    defaultHero:
      Number.isSafeInteger(settings?.defaultHero) &&
      (settings!.defaultHero as number) > 0 &&
      (settings!.defaultHero as number) <= 1000000
        ? (settings!.defaultHero as number)
        : 600,
    base:
      Number.isSafeInteger(settings?.base) &&
      (settings!.base as number) >= 0 &&
      (settings!.base as number) <= 1000000
        ? (settings!.base as number)
        : 950,
  };
}

export function capacitySignature(hero: any): string {
  return JSON.stringify([hero?.level, hero?.star, hero?.power]);
}

export function estimateHeroTroopCapacity(power?: number | null): number | null {
  if (!Number.isFinite(power) || (power as number) < 1000) return null;
  const p = power as number;
  let troop: number;
  if (p < 9000) {
    troop = Math.max(623, Math.floor(469.5 + p / 39.0));
  } else if (p < 30000) {
    troop = Math.floor(578.4 + 1.24 * Math.sqrt(p));
  } else {
    troop = Math.floor(695.0 + p / 315.0);
  }
  return Math.max(1, troop - 2);
}

export function heroCapacity(id: number | string, hero: any, saved: any, fallback: null): number | null;
export function heroCapacity(id: number | string, hero: any, saved?: any, fallback?: number): number;
export function heroCapacity(id: number | string, hero: any, saved?: any, fallback: number | null = 600): number | null {
  if (Number.isSafeInteger(hero?.troopCapacity) && hero.troopCapacity > 0) return hero.troopCapacity;
  if (saved?.signature === capacitySignature(hero) && Number.isSafeInteger(saved.count) && saved.count > 0) {
    return saved.count;
  }
  const example = capacityExamples[Number(id)];
  if (example && hero?.level === example[0] && hero?.star === example[1]) return example[2];
  if (fallback != null) {
    const estimated = estimateHeroTroopCapacity(hero?.power);
    if (estimated != null) return estimated;
  }
  return fallback;
}

export function squadCapacity(
  ids: number[],
  heroes: Record<string | number, any>,
  capacities?: Record<string | number, any>,
  base = 950,
  defaultHero = 600
): number | null {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length || !Number.isSafeInteger(base) || base < 0) {
    return null;
  }
  return base + ids.reduce((sum, id) => sum + heroCapacity(id, heroes[id], capacities?.[id], defaultHero), 0);
}

export function capacityModel(
  ids: number[],
  heroes: Record<string | number, any> = {},
  observations: any[] = [],
  rawSettings?: any,
  accountId?: any
) {
  const settings = normalizeCapacitySettings(rawSettings);
  const known = Object.fromEntries(
    Object.entries(heroes || {})
      .map(([id, hero]) => [id, heroCapacity(id, hero, null, null)])
      .filter(([, value]) => value != null)
  );

  const rows = asArray(observations).filter(
    (row) =>
      accountId != null &&
      String(row.accountId) === String(accountId) &&
      Number.isSafeInteger(row.total) &&
      row.total > 0 &&
      row.profiles?.length === 5 &&
      new Set(row.profiles.map((p: any) => p.id)).size === 5 &&
      row.profiles.every(
        (p: any) => Number.isInteger(p.id) && heroes[p.id] && p.signature === capacitySignature(heroes[p.id])
      )
  );

  const unknown = [
    ...new Set(
      rows
        .flatMap((row) => row.profiles.map((p: any) => p.id))
        .filter((id) => (known as Record<string, any>)[id] == null)
    ),
  ];

  const matrix = rows
    .map((row) => {
      const members = row.profiles.map((p: any) => p.id);
      return [
        ...unknown.map((id) => (members.includes(id) ? 1 : 0)),
        row.total - settings.base - members.reduce((sum: number, id: number) => sum + ((known as Record<string, any>)[id] || 0), 0),
      ];
    })
    .filter(
      (row) =>
        row.slice(0, -1).some((val) => val) &&
        (row.at(-1) as number) >= row.slice(0, -1).reduce((a, b) => a + b, 0) * settings.defaultHero
    );

  let pivot = 0;
  for (let column = 0; column < unknown.length && pivot < matrix.length; column++) {
    const found = matrix.findIndex((row, idx) => idx >= pivot && Math.abs(row[column] ?? 0) > 1e-7);
    const pivotRow = matrix[pivot];
    const foundRow = matrix[found];
    if (found < 0 || !pivotRow || !foundRow) continue;
    matrix[found] = pivotRow;
    const factor = foundRow[column];
    if (factor == null || factor === 0) continue;
    const normalized = foundRow.map((val) => val / factor);
    matrix[pivot] = normalized;
    for (let idx = 0; idx < matrix.length; idx++) {
      const row = matrix[idx];
      if (idx !== pivot && row) {
        const scale = row[column] ?? 0;
        matrix[idx] = row.map((val, col) => val - scale * (normalized[col] ?? 0));
      }
    }
    pivot++;
  }

  const inferred: Record<string | number, number> = {};
  const inconsistent = matrix.some(
    (row) => row.slice(0, -1).every((val) => Math.abs(val) < 1e-7) && Math.abs(row.at(-1) as number) > 1e-7
  );
  if (!inconsistent) {
    for (const row of matrix) {
      const columns = row
        .slice(0, -1)
        .map((val, idx) => (Math.abs(val) > 1e-7 ? idx : -1))
        .filter((idx) => idx >= 0);
      if (
        columns.length === 1 &&
        (row.at(-1) as number) >= settings.defaultHero &&
        (row.at(-1) as number) <= 1000000
      ) {
        const column = columns[0];
        const heroId = column == null ? undefined : unknown[column];
        if (heroId != null) inferred[heroId] = Math.floor((row.at(-1) as number) + 1e-7);
      }
    }
  }

  const counts = asArray(ids).map(
    (id) =>
      (known as Record<string, any>)[id] ??
      inferred[id] ??
      estimateHeroTroopCapacity(heroes?.[id]?.power) ??
      settings.defaultHero
  );
  const observed = Math.max(
    0,
    ...rows
      .filter((row) => row.profiles.every((p: any) => ids?.includes(p.id)))
      .map((row) => row.total)
  );
  const total =
    ids?.length >= 1 && ids?.length <= 5 && new Set(ids).size === ids.length
      ? Math.max(observed, settings.base + counts.reduce((a, b) => a + b, 0))
      : null;

  return { total, observed, inferred, counts, settings };
}

export interface UnitInfo {
  type: number; // 0: Marksmen, 1: Spearmen, 2: Infantry
  level: number; // 1-9
  label: string;
}

export function unitInfo(id: number): UnitInfo | null {
  const level = id % 10;
  const type = Math.floor(id / 10);
  const labels = ['Marksmen', 'Spearmen', 'Infantry'];
  return Number.isInteger(id) && level >= 1 && level <= 9 && type >= 0 && type <= 2
    ? { type, level, label: labels[type] ?? 'Unknown' }
    : null;
}

export function allocateTroops(summary: any, capacity: number): Array<{ unitId: number; count: number }> {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) return [];
  const stocks = new Map<number, number>();
  for (const item of asArray(summary?.available)) {
    const id = Number(item.unitId);
    if (unitInfo(id) && Number.isSafeInteger(item.count) && item.count > 0) {
      stocks.set(id, Math.max(stocks.get(id) || 0, item.count));
    }
  }

  const totals = [0, 1, 2].map((type) =>
    [...stocks]
      .filter(([id]) => Math.floor((id - 1) / 10) === type)
      .reduce((sum, [, count]) => sum + count, 0)
  );

  const quotas = [0, 0, 0];
  let left = Math.min(capacity, totals.reduce((a, b) => a + b, 0));
  while (left > 0) {
    const open = quotas
      .map((count, type) => ({ count, type }))
      .filter(({ count, type }) => count < (totals[type] ?? 0));
    if (!open.length) break;
    const step = Math.max(1, Math.floor(left / open.length));
    for (const { type } of open) {
      const amount = Math.min(step, (totals[type] ?? 0) - (quotas[type] ?? 0), left);
      quotas[type] = (quotas[type] ?? 0) + amount;
      left -= amount;
    }
  }

  const units: Array<{ unitId: number; count: number }> = [];
  for (let type = 0; type < 3; type++) {
    let remaining = quotas[type] ?? 0;
    for (let tier = 9; tier >= 1 && remaining > 0; tier--) {
      const unitId = type * 10 + tier;
      const count = Math.min(remaining, stocks.get(unitId) || 0);
      if (count > 0) {
        units.push({ unitId, count });
      }
      remaining -= count;
    }
  }
  return units;
}

export function bossConfigId(level: number): number | null {
  return Number.isInteger(level) && level >= 1 && level <= 30 ? 59 + level : null;
}

export function bossLevel(configId: number): number | null {
  if (!Number.isInteger(configId)) return null;
  if (configId >= 60 && configId <= 89) return configId - 59;
  return null;
}

export function soloMonsterConfigIds(level: number): number[] | null {
  return Number.isInteger(level) && level >= 1 && level <= 30
    ? [22 + level, (level <= 15 ? 52 : 58) + level]
    : null;
}

export function soloMonsterLevel(configId: number): number | null {
  const id = Number(configId);
  if (id >= 23 && id <= 52) return id - 22;
  if (id >= 53 && id <= 67) return id - 52;
  if (id >= 74 && id <= 88) return id - 58;
  return null;
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

export function availableHeroIds(
  heroes: Record<string | number, any> = {},
  summary: any,
  marches: any = []
): number[] {
  const busy = new Set<number>(
    asArray(summary?.squads).flatMap((squad: any) =>
      asArray(squad?.heroes).map((h: any) => Number(h?.id ?? h?.heroId ?? h))
    )
  );
  for (const march of asArray(marches)) {
    for (const id of asArray(march?.team?.heroIds)) busy.add(Number(id));
  }
  return Object.keys(heroes || {})
    .map(Number)
    .filter((id) => !busy.has(id));
}

export function normalizeCustomTeam(team: any, heroes: Record<string | number, any>) {
  const name = typeof team?.name === 'string' ? team.name.trim().slice(0, 80) : '';
  const heroIds = [...new Set(asArray(team?.heroIds))];
  const maxTroops = team?.maxTroops;
  if (maxTroops != null && (!Number.isSafeInteger(maxTroops) || maxTroops <= 0)) return null;
  return name && heroIds.length === 5 && heroIds.every((id: any) => Number.isInteger(id) && heroes?.[id])
    ? { id: team.id, name, heroIds, ...(maxTroops != null ? { maxTroops } : {}) }
    : null;
}

export function lowestPowerHeroes(heroes: Record<string | number, any> = {}, availableIds?: number[]): number[] {
  const ids = availableIds || Object.keys(heroes).map(Number);
  return Object.entries(heroes)
    .filter(([id, hero]) => Number.isInteger(Number(id)) && ids.includes(Number(id)) && Number.isFinite(hero?.power))
    .sort((a, b) => a[1].power - b[1].power || Number(a[0]) - Number(b[0]))
    .slice(0, 5)
    .map(([id]) => Number(id));
}

export function highestPowerHeroes(heroes: Record<string | number, any> = {}, availableIds?: number[]): number[] {
  const ids = availableIds || Object.keys(heroes).map(Number);
  return Object.entries(heroes)
    .filter(([id, hero]) => Number.isInteger(Number(id)) && ids.includes(Number(id)) && Number.isFinite(hero?.power))
    .sort((a, b) => b[1].power - a[1].power || Number(a[0]) - Number(b[0]))
    .slice(0, 5)
    .map(([id]) => Number(id));
}

export function teamOptions(
  teams: Record<string, any> = {},
  heroes: Record<string | number, any> = {},
  customTeams: any[] = [],
  availableIds?: number[]
) {
  const options: Array<{ id: string; label: string; heroIds: number[]; maxTroops?: number }> = asArray(customTeams)
    .map((team) => normalizeCustomTeam(team, heroes))
    .filter(Boolean)
    .map((team: any) => ({
      id: `custom:${team.id}`,
      label: `Custom · ${team.name}`,
      heroIds: team.heroIds,
      maxTroops: team.maxTroops,
    }));

  options.push({
    id: 'weakest',
    label: '5 lowest power heroes',
    heroIds: lowestPowerHeroes(heroes, availableIds),
  });

  for (const [mode, members] of Object.entries(teams || {})) {
    if (!Array.isArray(members)) continue;
    const groups = members.some(Array.isArray) ? members : [members];
    groups.forEach((group: any, idx: number) => {
      const heroIds = (Array.isArray(group) ? group : []).filter(
        (id: any) => Number.isInteger(id) && heroes?.[id]
      ).slice(0, 5);
      if (heroIds.length) {
        options.push({
          id: `${mode}:${idx}`,
          label: `${mode}${groups.length > 1 ? ` #${idx + 1}` : ''}`,
          heroIds,
        });
      }
    });
  }
  return options;
}

export function teamTroopCapacity(automatic: number, maxTroops?: number): number {
  return Number.isSafeInteger(maxTroops) && (maxTroops as number) > 0 ? (maxTroops as number) : automatic;
}

export function buildSquad(heroIds: number[], units: Array<{ unitId: number; count: number }>) {
  const ids = [...new Set(asArray(heroIds))].filter(Number.isInteger).slice(0, 5);
  const troops = asArray(units).filter(
    (unit) => Number.isInteger(unit?.unitId) && unit.unitId > 0 && Number.isInteger(unit?.count) && unit.count > 0
  );
  if (ids.length < 1 || ids.length > 5 || !troops.length) return null;
  return { heroes: ids.map((heroId) => ({ heroId })), units: troops };
}

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

export interface RallyPhaseInfo {
  phase: 'Returning' | 'Battle complete' | 'Waiting' | 'Traveling to boss' | 'Battle / awaiting result';
  until: number | null;
  result: string | null;
}

export function rallyPhase(march: any, now: number = Date.now()): RallyPhaseInfo | null {
  const rally = march?.rally;
  if (!rally) return null;
  if (march.stage === 'returnToOutpost') return { phase: 'Returning', until: rally.returnAt || march.endsAt, result: march.result || null };
  if (march.result) return { phase: 'Battle complete', until: rally.returnAt, result: march.result };
  if (Number.isFinite(rally.waitUntil) && now < rally.waitUntil) return {
    phase: 'Waiting', until: rally.waitUntil, result: null };
  const arrivalAt = rally.arrivalAt ||
    (march.stage === 'moveToTargetInRally' && Number.isFinite(march.endsAt) ? march.endsAt : null) ||
    (Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ?
      rally.waitUntil + rally.outboundMs : null);
  if (Number.isFinite(arrivalAt) && now < arrivalAt) return {
    phase: 'Traveling to boss', until: arrivalAt, result: null };
  return { phase: 'Battle / awaiting result', until: null, result: null };
}

export function buildRallyCall(mapId: string, mobId: string, squad: any, waitSeconds: number) {
  if (
    !mapId ||
    !mobId ||
    !squad ||
    !Number.isInteger(waitSeconds) ||
    !(rallyWaitOptions as readonly number[]).includes(waitSeconds)
  ) {
    return null;
  }
  return {
    name: 'createRally',
    feature: 'mob',
    args: {
      mapId,
      mobId,
      squad,
      startDelay: waitSeconds * 1000,
    },
  };
}

export function rallyMembers(rally: any): { count: number; total: number } | null {
  if (!rally?.leader || !Array.isArray(rally.members) || !Number.isInteger(rally.membersCapacityLeft)) return null;
  const ids = new Set([rally.leader, ...rally.members].map((member: any) => member?.userId).filter((id: any) => id != null).map(String));
  if (!ids.size) return null;
  return { count: ids.size, total: ids.size + rally.membersCapacityLeft };
}

export function buildJoinRallyCall(mapId: string | null | undefined, rallyId: string, squad: any): any {
  if (!rallyId || !squad) return null;
  const args: any = { rallyId, squad };
  if (mapId) args.mapId = mapId;
  return { name: 'joinRally', feature: 'rally', args };
}

export function autoJoinTeamOptions(teams: any, heroes: any, customTeams: any[] = [], availableIds?: any[]): any[] {
  const list: any[] = [
    { id: 'highest', label: '⭐ Top 5 highest power heroes (Default)', heroIds: highestPowerHeroes(heroes, availableIds) }
  ];
  list.push(...asArray(customTeams).map((team) => normalizeCustomTeam(team, heroes)).filter(Boolean)
    .map((team: any) => ({ id: `custom:${team.id}`, label: `Custom · ${team.name}`, heroIds: team.heroIds, maxTroops: team.maxTroops })));
  for (const [mode, members] of Object.entries(teams || {})) {
    if (!Array.isArray(members)) continue;
    const groups = (members as any[]).some(Array.isArray) ? (members as any[]) : [members];
    groups.forEach((group: any, index: number) => {
      const heroIds = (Array.isArray(group) ? group : []).filter((id: any) =>
        Number.isInteger(id) && heroes?.[id]).slice(0, 5);
      if (heroIds.length) list.push({ id: `${mode}:${index}`,
        label: `${mode}${groups.length > 1 ? ` #${index + 1}` : ''}`, heroIds });
    });
  }
  list.push({ id: 'weakest', label: '5 lowest power heroes', heroIds: lowestPowerHeroes(heroes, availableIds) });
  return list;
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

export const experimentalDataHelper = {
  rallyWaitOptions,
  capacitySignature,
  heroCapacity,
  estimateHeroTroopCapacity,
  squadCapacity,
  normalizeCapacitySettings,
  capacityModel,
  unitInfo,
  allocateTroops,
  bossConfigId,
  bossLevel,
  soloMonsterConfigIds,
  soloMonsterLevel,
  mineConfigs,
  mineConfigId: getMineConfigId,
  mineTypeLevel: getMineTypeLevel,
  availableHeroIds,
  normalizeCustomTeam,
  lowestPowerHeroes,
  highestPowerHeroes,
  teamOptions,
  autoJoinTeamOptions,
  teamTroopCapacity,
  buildSquad,
  buildRallyCall,
  buildJoinRallyCall,
  buildGatherCall,
  buildMineSearchCall,
  rallyMembers,
  rallyPhase,
  RESOURCE_CARGO_WEIGHT,
  MINE_LEVEL_TOTAL_CARGO,
  TROOP_CARGO_CAPACITY_BY_LEVEL,
  calculateMineCargo,
  calculateRequiredTroopsForCargo,
  buildOptimizedGatheringTeam,
};

export default experimentalDataHelper;
