/**
 * Titan Dungeon Planner (`dungeonPlanner.ts`).
 * Single source of truth for:
 * - 5-floor checkpoint reward detection (`dungeonSaveProgress`)
 * - Deterministic outcome scoring (`win > 0 casualties > tank/team HP & energy preservation`)
 * - Single-Door Best-of-10 WASM simulation when available alive roster <= 5
 * - Multi-door evaluation ranking
 */

export const SINGLE_DOOR_SIM_ROUNDS = 10;
export const DUNGEON_AUTO_SETTINGS_KEY = 'dungeonAutoSettings';

export interface DungeonAutoSettings {
  targetTitanite: number;     // 75 | 150 | 300 | 0 (Unlimited)
  safetyThresholdPct: number; // default: 20
  singleDoorBestOf10: boolean; // default: true
}

export const DEFAULT_DUNGEON_AUTO_SETTINGS: DungeonAutoSettings = {
  targetTitanite: 150,
  safetyThresholdPct: 20,
  singleDoorBestOf10: true,
};

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
