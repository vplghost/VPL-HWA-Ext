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

export function heroCapacity(id: number | string, hero: any, saved?: any, fallback = 600): number {
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
  if (!Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5 || !Number.isSafeInteger(base) || base < 0) {
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

  const rows = (observations || []).filter(
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
    const found = matrix.findIndex((row, idx) => idx >= pivot && Math.abs(row[column]) > 1e-7);
    if (found < 0) continue;
    [matrix[pivot], matrix[found]] = [matrix[found], matrix[pivot]];
    const factor = matrix[pivot][column];
    matrix[pivot] = matrix[pivot].map((val) => val / factor);
    for (let idx = 0; idx < matrix.length; idx++) {
      if (idx !== pivot) {
        const scale = matrix[idx][column];
        matrix[idx] = matrix[idx].map((val, col) => val - scale * matrix[pivot][col]);
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
        inferred[unknown[columns[0]]] = Math.floor((row.at(-1) as number) + 1e-7);
      }
    }
  }

  const counts = (ids || []).map(
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
    ids?.length === 5 && new Set(ids).size === 5
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
    ? { type, level, label: labels[type] }
    : null;
}

export function allocateTroops(summary: any, capacity: number): Array<{ unitId: number; count: number }> {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) return [];
  const stocks = new Map<number, number>();
  for (const item of summary?.available || []) {
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
      .filter(({ count, type }) => count < totals[type]);
    if (!open.length) break;
    const step = Math.max(1, Math.floor(left / open.length));
    for (const { type } of open) {
      const amount = Math.min(step, totals[type] - quotas[type], left);
      quotas[type] += amount;
      left -= amount;
    }
  }

  const units: Array<{ unitId: number; count: number }> = [];
  for (let type = 0; type < 3; type++) {
    let remaining = quotas[type];
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

// Hero Wars: Alliance 1.292.0 globalMapMine remote config 8e714674: levels 1–10.
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

export function availableHeroIds(
  heroes: Record<string | number, any> = {},
  summary: any,
  marches: any[] = []
): number[] {
  const busy = new Set<number>(
    (summary?.squads || []).flatMap((squad: any) =>
      (squad.heroes || []).map((h: any) => Number(h.id ?? h.heroId ?? h))
    )
  );
  for (const march of marches) {
    for (const id of march.team?.heroIds || []) busy.add(Number(id));
  }
  return Object.keys(heroes || {})
    .map(Number)
    .filter((id) => !busy.has(id));
}

export function normalizeCustomTeam(team: any, heroes: Record<string | number, any>) {
  const name = typeof team?.name === 'string' ? team.name.trim().slice(0, 80) : '';
  const heroIds = [...new Set(team?.heroIds || [])];
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
  const options = (customTeams || [])
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
  const ids = [...new Set(heroIds)].filter(Number.isInteger).slice(0, 5);
  const troops = (units || []).filter(
    (unit) => Number.isInteger(unit.unitId) && unit.unitId > 0 && Number.isInteger(unit.count) && unit.count > 0
  );
  if (ids.length !== 5 || !troops.length) return null;
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

// Global hookup for backwards compatibility
if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperExperimentalData = {
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
    teamTroopCapacity,
    buildSquad,
    buildRallyCall,
    buildGatherCall,
    buildMineSearchCall,
  };
}
