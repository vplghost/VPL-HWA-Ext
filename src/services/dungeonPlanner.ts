/**
 * Titan Dungeon Planner (`dungeonPlanner.ts`).
 * Single source of truth for:
 * - 5-floor checkpoint reward detection (`dungeonSaveProgress`)
 * - Deterministic outcome scoring (`win > 0 casualties > tank/team HP & energy preservation`)
 * - Single-Door Best-of-10 WASM simulation when available alive roster <= 5
 * - Multi-door evaluation ranking
 */

export const DEFAULT_SIM_ROUNDS = 5;
export const DEFAULT_SIM_ROUNDS_KEY = 'defaultSimRounds';
export const SINGLE_DOOR_SIM_ROUNDS = DEFAULT_SIM_ROUNDS;
export const DUNGEON_AUTO_SETTINGS_KEY = 'dungeonAutoSettings';
export const DUNGEON_CLEARED_ROOMS_KEY = 'dungeonClearedRoomsLog';

export function clampSimRounds(value: unknown, fallback = DEFAULT_SIM_ROUNDS): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return Math.max(1, Math.min(20, Math.floor(fallback) || DEFAULT_SIM_ROUNDS));
  return Math.max(1, Math.min(20, n));
}

export type DungeonElementKey = 'water' | 'fire' | 'earth' | 'neutral';
export type DungeonElementName = 'Water' | 'Fire' | 'Earth' | 'Neutral';
export type DungeonOrderedPools = Record<DungeonElementKey, number[]>;

export const DEFAULT_ORDERED_TITAN_POOLS: DungeonOrderedPools = {
  water: [4000, 4001, 4052, 4004, 4002, 4003],
  earth: [4020, 4050, 4022, 4024, 4023, 4021],
  fire: [4010, 4011, 4013, 4012, 4014, 4051],
  neutral: [
    4000, 4030, 4040, 4020, 4050, 4010,
    4003, 4004, 4042, 4043, 4052, 4053,
    4013, 4023, 4033, 4001, 4002, 4022,
    4024, 4021, 4011, 4012, 4014, 4031,
    4032, 4034, 4041, 4044, 4051, 4054,
  ],
};

export interface DungeonAutoSettings {
  targetTitanite: number;               // 75 | 150 | 300 | 0 (Unlimited)
  safetyThresholdPct: number;           // default: 20
  tankSwitchHpPct: number;              // default: 35
  singleDoorBestOf10: boolean;          // default: true
  simRounds?: number;                   // default: 5 (1..20)
  allowCasualtyOnDepletedPool: boolean; // default: false (force-majeure when all doors <= 5 alive)
  orderedPools?: Partial<DungeonOrderedPools>;
}

export const DEFAULT_DUNGEON_AUTO_SETTINGS: DungeonAutoSettings = {
  targetTitanite: 150,
  safetyThresholdPct: 20,
  tankSwitchHpPct: 35,
  singleDoorBestOf10: true,
  simRounds: SINGLE_DOOR_SIM_ROUNDS,
  allowCasualtyOnDepletedPool: false,
  orderedPools: {
    water: [...DEFAULT_ORDERED_TITAN_POOLS.water],
    earth: [...DEFAULT_ORDERED_TITAN_POOLS.earth],
    fire: [...DEFAULT_ORDERED_TITAN_POOLS.fire],
    neutral: [...DEFAULT_ORDERED_TITAN_POOLS.neutral],
  },
};

export interface DungeonClearedRoomEntry {
  id: string;
  floor: number;
  door: number; // 1-based door index
  element: DungeonElementName;
  source: 'auto' | 'manual';
  win: boolean;
  stars: number;
  casualties: number;
  fallenTitans: string[];
  teamIds?: number[];
  tankLossPct?: number;
  teamLossPct?: number;
  switchedTankFrom?: string | null;
  switchedTankTo?: string | null;
  forceMajeure?: boolean;
  bestOfTenNote?: string | null;
  checkpointGold?: number;
  timestamp: string;
}

export function normalizeDungeonElementKey(raw: string | null | undefined): DungeonElementKey {
  const str = String(raw || '').toLowerCase().trim();
  if (str.includes('water')) return 'water';
  if (str.includes('fire')) return 'fire';
  if (str.includes('earth')) return 'earth';
  return 'neutral';
}

export function formatDungeonElementName(raw: string | null | undefined): DungeonElementName {
  const key = normalizeDungeonElementKey(raw);
  if (key === 'water') return 'Water';
  if (key === 'fire') return 'Fire';
  if (key === 'earth') return 'Earth';
  return 'Neutral';
}

/**
 * Returns true when every available door on the current floor has a depleted
 * alive eligible pool (<= 5 titans remaining, at least 1 alive).
 */
export function areAllDoorsPoolDepleted(aliveCounts: number[]): boolean {
  if (!Array.isArray(aliveCounts) || aliveCounts.length === 0) return false;
  return aliveCounts.every((count) => Number(count) > 0 && Number(count) <= 5);
}

/**
 * Merges a cleared room entry into the daily combat log list, deduplicating by (floor, door)
 * while preserving richer automation/simulation metadata.
 */
export function mergeClearedRoomEntry(
  list: DungeonClearedRoomEntry[],
  entry: DungeonClearedRoomEntry
): DungeonClearedRoomEntry[] {
  const next = Array.isArray(list) ? [...list] : [];
  const existingIdx = next.findIndex((item) => item.floor === entry.floor && item.door === entry.door);

  if (existingIdx === -1) {
    next.push({ ...entry, fallenTitans: [...(entry.fallenTitans || [])] });
    return next;
  }

  const prev = next[existingIdx]!;
  next[existingIdx] = {
    ...prev,
    ...entry,
    source: entry.source === 'auto' || prev.source === 'auto' ? (entry.source || prev.source) : 'manual',
    fallenTitans:
      entry.fallenTitans && entry.fallenTitans.length > 0
        ? [...entry.fallenTitans]
        : [...(prev.fallenTitans || [])],
    teamIds: entry.teamIds && entry.teamIds.length > 0 ? [...entry.teamIds] : prev.teamIds,
    tankLossPct: entry.tankLossPct ?? prev.tankLossPct,
    teamLossPct: entry.teamLossPct ?? prev.teamLossPct,
    switchedTankFrom: entry.switchedTankFrom ?? prev.switchedTankFrom ?? null,
    switchedTankTo: entry.switchedTankTo ?? prev.switchedTankTo ?? null,
    forceMajeure: entry.forceMajeure ?? prev.forceMajeure ?? false,
    bestOfTenNote: entry.bestOfTenNote ?? prev.bestOfTenNote ?? null,
    checkpointGold: Math.max(Number(entry.checkpointGold) || 0, Number(prev.checkpointGold) || 0) || undefined,
  };
  return next;
}

export interface DungeonOutcomeScore {
  win: boolean;
  stars: number;
  casualties: number;
  tankHpEndPct: number;
  minHpEndPct: number;
  avgHpEndPct: number;
  avgHpDeltaPct: number;
  avgEnergyEndPct: number;
  score: number;
}

export interface BestOfTenRoundSummary {
  round: number;
  seed: number;
  score: DungeonOutcomeScore;
}

export interface BestOfTenReport {
  triggered: boolean;
  roundsRun: number;
  wins: number;
  zeroCasualtyWins: number;
  bestIndex: number; // 0-based
  bestSeed: number;
  bestScore: DungeonOutcomeScore;
  bestOutcome: any;
  allScores: BestOfTenRoundSummary[];
}

/**
 * Determines whether the game requires `dungeonSaveProgress({})` to claim the
 * every-5-floors checkpoint gold reward and unlock floor N+1.
 * Confirmed from live tracking logs (floors 580, 585):
 * - On every 5th floor, `dungeonEndBattle` returns `dungeon: null` (only `reward`, `states`, `dungeonActivity`).
 * - Calling `dungeonSaveProgress({})` returns `{ reward: { gold }, dungeon: { floorNumber: N+1, floorType: 'battle', ... } }`.
 */
export function needsFiveFloorCheckpointClaim(params: {
  floorNumber?: number;
  floorType?: string | null;
  doorsCount?: number;
  endBattleResponse?: any;
  respawnFloor?: number;
  saveFloor?: number;
  readyToSave?: boolean;
}): boolean {
  const floorNum = Number(params.floorNumber) || 0;
  const respawn = Number(params.respawnFloor) || 0;
  const saveFloor = Number(params.saveFloor) || 0;
  const floorType = String(params.floorType || '').toLowerCase();

  if (params.readyToSave === true) return true;
  if (saveFloor > 0 && saveFloor > respawn) return true;
  if (floorType === 'save' || floorType === 'reward' || floorType === 'checkpoint') return true;

  // Post-battle check: when dungeonEndBattle returns a valid response WITHOUT a `dungeon` object,
  // the player just cleared a 5-floor milestone and MUST claim `dungeonSaveProgress`.
  if (params.endBattleResponse && typeof params.endBattleResponse === 'object') {
    if (!params.endBattleResponse.dungeon) {
      return true;
    }
    const endDungeon = params.endBattleResponse.dungeon;
    if (endDungeon.readyToSave === true) return true;
    const endFloorType = String(endDungeon.floorType || '').toLowerCase();
    if (endFloorType === 'save' || endFloorType === 'reward' || endFloorType === 'checkpoint') return true;
  }

  // Every 5th floor (e.g., 580, 585, 590...) when past respawnFloor
  if (floorNum > 0 && floorNum % 5 === 0 && floorNum > respawn) {
    return true;
  }

  // Pre-battle check: floor has 0 doors (waiting on checkpoint lever)
  if (params.doorsCount === 0 && floorNum > 0 && floorNum > respawn) {
    return true;
  }

  return false;
}

/**
 * Returns true when current floor is a single-door room AND the alive roster
 * eligible for this door has <= 5 members (no alternative squad or door choice).
 */
export function shouldUseBestOfTen(doors: any[] | number, aliveRoster: any[] | number): boolean {
  const doorCount = Array.isArray(doors) ? doors.length : Number(doors) || 0;
  const aliveCount = Array.isArray(aliveRoster) ? aliveRoster.length : Number(aliveRoster) || 0;
  return doorCount === 1 && aliveCount > 0 && aliveCount <= 5;
}

/**
 * Generates `count` deterministic uint32 candidate seeds starting with `canonicalSeed`.
 */
export function deriveCandidateSeeds(canonicalSeed: number, count: number = SINGLE_DOOR_SIM_ROUNDS): number[] {
  const base = (Number(canonicalSeed) >>> 0) || 1;
  const seeds: number[] = [base];
  let cur = base;
  for (let i = 1; i < count; i++) {
    // Weyl-sequence / xorshift step for well-distributed uint32 seeds
    cur = (cur + 0x9e3779b9) >>> 0;
    let s = cur;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s = s >>> 0;
    if (s === 0) s = (base + i * 7919) >>> 0;
    seeds.push(s);
  }
  return seeds;
}

/**
 * Computes a comprehensive preservation score for a Unity WASM simulation outcome.
 * Higher score is better.
 */
export function scoreDungeonOutcome(
  outcome: any,
  frontlineId?: number | string | null,
  minHpThresholdPct: number = 20
): DungeonOutcomeScore {
  const win = Boolean(outcome?.win);
  const stars = Number(outcome?.stars ?? (win ? 3 : 0));
  const attackers = outcome?.attackers || {};
  const entries = Object.entries(attackers) as Array<[string, any]>;

  if (entries.length === 0) {
    return {
      win,
      stars,
      casualties: win ? 0 : 1,
      tankHpEndPct: win ? 100 : 0,
      minHpEndPct: win ? 100 : 0,
      avgHpEndPct: win ? 100 : 0,
      avgHpDeltaPct: 0,
      avgEnergyEndPct: 0,
      score: win ? 500 : -1000,
    };
  }

  let casualties = 0;
  let minHpEndPct = 100;
  let sumHpEndPct = 0;
  let sumHpDeltaPct = 0;
  let sumEnergyEndPct = 0;
  let tankHpEndPct = 100;
  const frontStr = frontlineId != null ? String(frontlineId) : entries[0][0];

  for (const [idStr, att] of entries) {
    const maxHp = Math.max(1, Number(att?.maxHp) || 1000000);
    const finalHp = Math.max(0, Number(att?.hp) || 0);
    const isDead = att?.isDead === true || finalHp <= 0;
    if (isDead) casualties++;

    const endPct = isDead ? 0 : Math.min(100, (finalHp / maxHp) * 100);
    const hpDelta = Number(att?.hpDelta) || 0;
    const deltaPct = (hpDelta / maxHp) * 100;
    const energyPct = Math.min(100, Math.max(0, (Number(att?.energy) || 0) / 10));

    if (endPct < minHpEndPct) minHpEndPct = endPct;
    sumHpEndPct += endPct;
    sumHpDeltaPct += deltaPct;
    sumEnergyEndPct += energyPct;
    if (idStr === frontStr) tankHpEndPct = endPct;
  }

  const n = entries.length;
  const avgHpEndPct = sumHpEndPct / n;
  const avgHpDeltaPct = sumHpDeltaPct / n;
  const avgEnergyEndPct = sumEnergyEndPct / n;

  let score =
    1000
    - Math.max(0, 100 - tankHpEndPct) * 2.5
    - Math.max(0, 100 - avgHpEndPct) * 1.5
    + avgHpDeltaPct * 1.2
    + avgEnergyEndPct * 0.4
    - (minHpEndPct < minHpThresholdPct ? (minHpThresholdPct - minHpEndPct) * 4 : 0);

  if (!win) score -= 5000;
  score -= casualties * 1000;

  return {
    win,
    stars,
    casualties,
    tankHpEndPct: Math.round(tankHpEndPct * 10) / 10,
    minHpEndPct: Math.round(minHpEndPct * 10) / 10,
    avgHpEndPct: Math.round(avgHpEndPct * 10) / 10,
    avgHpDeltaPct: Math.round(avgHpDeltaPct * 10) / 10,
    avgEnergyEndPct: Math.round(avgEnergyEndPct * 10) / 10,
    score: Math.round(score * 10) / 10,
  };
}

/**
 * Comparator for sorting outcomes from BEST to WORST:
 * 1. win === true beats win === false
 * 2. fewer casualties wins
 * 3. higher preservation score wins
 */
export function compareDungeonOutcomes(a: DungeonOutcomeScore, b: DungeonOutcomeScore): number {
  if (a.win !== b.win) return a.win ? -1 : 1;
  if (a.casualties !== b.casualties) return a.casualties - b.casualties;
  return b.score - a.score;
}

/**
 * Runs 10 Unity WASM simulations for a single-door room (when alive roster <= 5)
 * and selects the single best outcome.
 */
export async function runSingleDoorBestOfTen(
  rawBattle: any,
  simulateFn: (battlePayload: any, seed: number) => Promise<any>,
  options: {
    frontlineId?: number | string | null;
    minHpThresholdPct?: number;
    rounds?: number;
  } = {}
): Promise<BestOfTenReport> {
  const rounds = Math.max(1, Math.floor(Number(options.rounds) || SINGLE_DOOR_SIM_ROUNDS));
  const canonicalSeed = Number(rawBattle?.seed) || Math.floor(Math.random() * 1_000_000_000);
  const seeds = deriveCandidateSeeds(canonicalSeed, rounds);
  const minHpThresholdPct = options.minHpThresholdPct ?? 20;

  const allScores: BestOfTenRoundSummary[] = [];
  let bestIndex = 0;
  let bestSeed = seeds[0];
  let bestOutcome: any = null;
  let bestScore: DungeonOutcomeScore | null = null;
  let wins = 0;
  let zeroCasualtyWins = 0;

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const outcome = await simulateFn({ ...rawBattle, seed }, seed);
    const sc = scoreDungeonOutcome(outcome, options.frontlineId, minHpThresholdPct);
    allScores.push({ round: i + 1, seed, score: sc });
    if (sc.win) {
      wins++;
      if (sc.casualties === 0) zeroCasualtyWins++;
    }
    if (!bestScore || compareDungeonOutcomes(sc, bestScore) < 0) {
      bestScore = sc;
      bestOutcome = outcome;
      bestIndex = i;
      bestSeed = seed;
    }
  }

  return {
    triggered: true,
    roundsRun: seeds.length,
    wins,
    zeroCasualtyWins,
    bestIndex,
    bestSeed,
    bestScore: bestScore!,
    bestOutcome,
    allScores,
  };
}
