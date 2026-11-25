/**
 * Grand Arena Service & 3-Team Best-of-3 Optimizer (`grandArenaService.ts`).
 * Verified against live Grand Arena RPC traffic (`grandFindEnemies`,
 * `customArena_startBattle` / `customArena_endBattle` with `type: 'GrandArena'`).
 *
 * Key mechanics:
 * - `grandFindEnemies` returns 3 opponents; hidden teams are omitted from the tail of `heroes`.
 * - `enemy.power` is the sum of ALL 3 teams including hidden teams, so when `hiddenCount === 1`
 *   we can compute the exact `hiddenTeamPower = totalPower - sum(visibleTeamPowers)`.
 * - `customArena_startBattle` deducts `refillable: 21` immediately, so pre-simulation MUST run
 *   locally via `buildSyntheticArenaBattle()` before dispatching `customArena_startBattle`.
 */
import { extractArenaEnemyList } from './arenaService.ts';
import { buildSyntheticArenaBattle, normalizeBattleHero, type PvpHeroSnapshot } from './pvpTeamOptimizer.ts';

export const GRAND_ARENA_INTEL_STORAGE_KEY = 'grandArenaIntelCache';
export const GRAND_ARENA_INTEL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const PERMUTATIONS_3: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export interface GrandArenaHeroSnapshot {
  id: number;
  level: number;
  color: number;
  star: number;
  power: number;
}

export interface GrandArenaEnemy {
  userId: string;
  name: string;
  level: number;
  clanTitle: string;
  serverId: string;
  place: number;
  totalPower: number;
  visibleTeams: GrandArenaHeroSnapshot[][];
  visibleTeamPowers: number[];
  hiddenCount: number;
  hiddenTeamPower: number;
}

export interface GrandArenaOverview {
  place: number | null;
  freeBattlesLeft: number | null;
  defenders: GrandArenaHeroSnapshot[][];
  enemies: GrandArenaEnemy[];
}

export type GrandArenaHiddenPolicy =
  | 'visible2-and-sacrifice'
  | 'visible2-only'
  | 'skip-hidden';

export interface GrandArenaStrategyOptions {
  minMatchWinRatePct?: number;       // default: 80
  minBo3WinRatePct?: number;         // default: 80
  hiddenPolicy?: GrandArenaHiddenPolicy; // default: 'visible2-and-sacrifice'
  maxHiddenPowerRatioPct?: number;   // default: 80 (hiddenTeamPower <= 80% of our hidden-slot team)
  skipTwoHidden?: boolean;           // default: true
}

export interface GrandArenaPermutationResult {
  order: [number, number, number];
  orderedTeams: number[][];
  bo3WinRatePct: number;
  matchWinRates: [number | null, number | null, number | null];
  strategy: 'full-3x3' | 'visible-2-lock' | 'hidden-power-sacrifice' | 'manual-only';
  recommended: boolean;
  reason: string;
  hiddenSlotTeamPower?: number;
  hiddenPowerRatioPct?: number;
}

export interface GrandArenaIntelEntry {
  userId: string;
  teams: number[][];
  teamPowers: number[];
  updatedAt: number;
}

function normalizeHeroList(rawTeam: any): GrandArenaHeroSnapshot[] {
  if (!Array.isArray(rawTeam)) return [];
  return rawTeam
    .map((h: any) => ({
      id: Number(h?.id) || 0,
      level: Number(h?.level) || 0,
      color: Number(h?.color) || 0,
      star: Number(h?.star) || 0,
      power: Number(h?.power) || 0,
    }))
    .filter((h) => h.id > 0);
}

/**
 * Normalizes a raw opponent object from `grandFindEnemies` or `customArena_endBattle`.
 * Handles string `place`/`power`, trailing hidden teams, and computes exact `hiddenTeamPower`
 * when `hiddenCount === 1`.
 */
export function normalizeGrandArenaEnemy(raw: any): GrandArenaEnemy | null {
  if (!raw || typeof raw !== 'object') return null;
  const userId = String(raw.userId ?? raw.user?.id ?? '').trim();
  if (!userId) return null;

  const rawTeams = Array.isArray(raw.heroes) ? raw.heroes : [];
  const visibleTeams = rawTeams
    .map(normalizeHeroList)
    .filter((team) => team.length > 0)
    .slice(0, 3);

  const visibleTeamPowers = visibleTeams.map((team) =>
    team.reduce((sum, h) => sum + h.power, 0)
  );
  const visiblePowerSum = visibleTeamPowers.reduce((a, b) => a + b, 0);
  const totalPower = Math.max(visiblePowerSum, Number(raw.power) || 0);
  const hiddenCount = Math.max(0, 3 - visibleTeams.length);
  const hiddenTeamPower =
    hiddenCount === 1 ? Math.max(0, totalPower - visiblePowerSum) : 0;

  return {
    userId,
    name: String(raw.user?.name || `Player #${userId}`),
    level: Number(raw.user?.level) || 0,
    clanTitle: String(raw.user?.clanTitle || ''),
    serverId: String(raw.user?.serverId || ''),
    place: Number(raw.place) || 0,
    totalPower,
    visibleTeams,
    visibleTeamPowers,
    hiddenCount,
    hiddenTeamPower,
  };
}

export function extractGrandArenaOverview(
  cache: Record<string, any> | null | undefined
): GrandArenaOverview {
  const c = cache || {};
  const arenaAll = c.arenaGetAll?.data || {};
  const grandState = c.grandArenaState?.data || {};
  const grandEnemies = c.grandArenaEnemies?.data || {};
  const freeEntry = c['resource:refillable:21']?.data;

  const rawEnemies = extractArenaEnemyList(grandEnemies);
  const enemies = rawEnemies
    .map(normalizeGrandArenaEnemy)
    .filter((e): e is GrandArenaEnemy => e !== null);

  const defenders = (Array.isArray(grandState.defenders) ? grandState.defenders : [])
    .map(normalizeHeroList)
    .filter((t) => t.length > 0);

  const freeBattlesLeft =
    freeEntry && Number.isInteger(freeEntry.amount) && freeEntry.amount >= 0
      ? Number(freeEntry.amount)
      : null;

  const rawPlace = grandState.place ?? arenaAll.grandPlace ?? null;
  const place = rawPlace !== null && Number.isFinite(Number(rawPlace)) ? Number(rawPlace) : null;

  return {
    place,
    freeBattlesLeft,
    defenders,
    enemies,
  };
}

/**
 * Exact probability of winning at least 2 out of 3 independent matches.
 */
export function computeBo3WinProbability(p0: number, p1: number, p2: number): number {
  const c0 = Math.max(0, Math.min(1, p0));
  const c1 = Math.max(0, Math.min(1, p1));
  const c2 = Math.max(0, Math.min(1, p2));
  return (
    c0 * c1 * c2 +
    c0 * c1 * (1 - c2) +
    c0 * (1 - c1) * c2 +
    (1 - c0) * c1 * c2
  );
}

/**
 * Computes the pairwise win-rate matrix (`3 × enemy.visibleTeams.length`) using local
 * Unity WASM simulation (`buildSyntheticArenaBattle`), spending ZERO server battles.
 */
export async function computePairwiseWinMatrix(
  attackTeams: number[][],
  enemy: GrandArenaEnemy,
  heroPoolMap: Record<string, PvpHeroSnapshot> | Map<number, PvpHeroSnapshot>,
  simulateFn: (battle: any, seed: number) => Promise<any>,
  options: {
    roundsPerPair?: number;
    baseSeed?: number;
    onProgress?: (done: number, total: number) => void;
    shouldAbort?: () => boolean;
  } = {}
): Promise<number[][]> {
  const rounds = Math.max(1, Math.min(15, Math.floor(Number(options.roundsPerPair) || 6)));
  const baseSeed = (Number(options.baseSeed) >>> 0) || 133742069;
  const visCount = enemy.visibleTeams.length;
  const totalPairs = attackTeams.length * visCount;
  const matrix: number[][] = attackTeams.map(() => new Array(visCount).fill(0));

  const mapObj: Record<string, PvpHeroSnapshot> = {};
  if (heroPoolMap instanceof Map) {
    for (const [k, v] of heroPoolMap.entries()) mapObj[String(k)] = v;
  } else if (heroPoolMap && typeof heroPoolMap === 'object') {
    Object.assign(mapObj, heroPoolMap);
  }

  let donePairs = 0;
  for (let i = 0; i < attackTeams.length; i++) {
    for (let j = 0; j < visCount; j++) {
      if (options.shouldAbort?.()) return matrix;
      const defTeam = enemy.visibleTeams[j];
      const defPool: Record<string, PvpHeroSnapshot> = {};
      const defIds: number[] = [];
      for (const h of defTeam) {
        defIds.push(h.id);
        defPool[String(h.id)] = {
          id: h.id,
          level: h.level || 90,
          color: h.color || 9,
          star: h.star || 5,
          power: h.power || 30000,
        };
      }
      const mergedPool = { ...defPool, ...mapObj };
      const battle = buildSyntheticArenaBattle(
        attackTeams[i],
        defIds,
        mergedPool,
        (baseSeed + Math.imul(i * 7 + j + 1, 2654435761)) >>> 0
      );
      // Replace defender entries with actual enemy hero snapshots keyed by 1-indexed slot ("1".."5")
      const defMap: Record<string, any> = {};
      for (let dIdx = 0; dIdx < defTeam.length; dIdx++) {
        const h = defTeam[dIdx];
        defMap[String(dIdx + 1)] = normalizeBattleHero(h.id, undefined, {
          id: h.id,
          level: h.level || 90,
          color: h.color || 9,
          star: h.star || 5,
          power: h.power || 30000,
        });
      }
      battle.defenders = [defMap];

      let wins = 0;
      for (let r = 0; r < rounds; r++) {
        if (options.shouldAbort?.()) break;
        const seed = (battle.seed + Math.imul(r, 2654435761)) >>> 0;
        const out = await simulateFn(battle, seed);
        if (out?.win) wins++;
      }
      matrix[i][j] = wins / rounds;
      donePairs++;
      options.onProgress?.(donePairs, totalPairs);
    }
  }

  return matrix;
}

/**
 * Evaluates all 6 permutations of `attackTeams` against `enemy` using the pre-computed
 * `winMatrix` (`3 × enemy.visibleTeams.length`) and selects the optimal permutation
 * respecting Top-50 (1 hidden team) and Top-20 (2 hidden teams) strategies.
 */
export function findBestGrandArenaPermutation(
  attackTeams: number[][],
  attackTeamPowers: number[],
  enemy: GrandArenaEnemy,
  winMatrix: number[][],
  opts: GrandArenaStrategyOptions = {}
): GrandArenaPermutationResult {
  const minMatchPct = Math.max(1, Math.min(100, Number(opts.minMatchWinRatePct) || 80));
  const minBo3Pct = Math.max(1, Math.min(100, Number(opts.minBo3WinRatePct) || 80));
  const minMatchProb = minMatchPct / 100;
  const minBo3Prob = minBo3Pct / 100;
  const hiddenPolicy: GrandArenaHiddenPolicy = opts.hiddenPolicy || 'visible2-and-sacrifice';
  const maxHiddenRatioPct = Math.max(20, Math.min(150, Number(opts.maxHiddenPowerRatioPct) || 80));
  const skipTwoHidden = opts.skipTwoHidden !== false;

  // Case 1: Full 3x3 intel (0 hidden teams)
  if (enemy.hiddenCount === 0) {
    let best: GrandArenaPermutationResult | null = null;
    for (const order of PERMUTATIONS_3) {
      const p0 = winMatrix[order[0]]?.[0] ?? 0;
      const p1 = winMatrix[order[1]]?.[1] ?? 0;
      const p2 = winMatrix[order[2]]?.[2] ?? 0;
      const bo3 = computeBo3WinProbability(p0, p1, p2);
      const bo3Pct = Math.round(bo3 * 100);
      const candidate: GrandArenaPermutationResult = {
        order,
        orderedTeams: [attackTeams[order[0]], attackTeams[order[1]], attackTeams[order[2]]],
        bo3WinRatePct: bo3Pct,
        matchWinRates: [Math.round(p0 * 100), Math.round(p1 * 100), Math.round(p2 * 100)],
        strategy: 'full-3x3',
        recommended: bo3 >= minBo3Prob,
        reason: `3x3 Bo3 win probability ${bo3Pct}% (${Math.round(p0 * 100)}% / ${Math.round(p1 * 100)}% / ${Math.round(p2 * 100)}%)`,
      };
      if (!best || candidate.bo3WinRatePct > best.bo3WinRatePct) {
        best = candidate;
      }
    }
    return best!;
  }

  // Case 2: 1 hidden team (Top 50 / Top 100 — 2 visible teams + exact hiddenTeamPower)
  if (enemy.hiddenCount === 1) {
    // Strategy A: Visible-2 Lock (guaranteed Bo3 win regardless of hidden team)
    let bestVis2: GrandArenaPermutationResult | null = null;
    let bestVis2Floor = -1;
    let bestVis2HiddenPower = -1;

    for (const order of PERMUTATIONS_3) {
      const p0 = winMatrix[order[0]]?.[0] ?? 0;
      const p1 = winMatrix[order[1]]?.[1] ?? 0;
      const floor = p0 * p1;
      const hiddenSlotPower = Number(attackTeamPowers[order[2]]) || 0;
      const qualifies =
        hiddenPolicy !== 'skip-hidden' &&
        p0 >= minMatchProb &&
        p1 >= minMatchProb &&
        floor >= minBo3Prob;

      if (qualifies) {
        if (
          floor > bestVis2Floor + 1e-6 ||
          (Math.abs(floor - bestVis2Floor) <= 1e-6 && hiddenSlotPower > bestVis2HiddenPower)
        ) {
          bestVis2Floor = floor;
          bestVis2HiddenPower = hiddenSlotPower;
          const pct = Math.round(floor * 100);
          bestVis2 = {
            order,
            orderedTeams: [attackTeams[order[0]], attackTeams[order[1]], attackTeams[order[2]]],
            bo3WinRatePct: pct,
            matchWinRates: [Math.round(p0 * 100), Math.round(p1 * 100), null],
            strategy: 'visible-2-lock',
            recommended: true,
            reason: `Visible-2 Lock: guaranteed ${pct}% (${Math.round(p0 * 100)}% & ${Math.round(p1 * 100)}% vs visible teams; strongest spare ${Math.round(hiddenSlotPower / 1000)}k on hidden slot)`,
            hiddenSlotTeamPower: hiddenSlotPower,
            hiddenPowerRatioPct: hiddenSlotPower > 0 ? Math.round((enemy.hiddenTeamPower / hiddenSlotPower) * 100) : undefined,
          };
        }
      }
    }

    if (bestVis2) return bestVis2;

    // Strategy B: Hidden-Power Sacrifice (win 1 visible team + overpower weak hidden team + sacrifice weakest into strong visible team)
    if (hiddenPolicy === 'visible2-and-sacrifice' && enemy.hiddenTeamPower > 0) {
      let bestSacrifice: GrandArenaPermutationResult | null = null;
      let bestScore = -1;
      for (const order of PERMUTATIONS_3) {
        const p0 = winMatrix[order[0]]?.[0] ?? 0;
        const p1 = winMatrix[order[1]]?.[1] ?? 0;
        const hiddenSlotPower = Number(attackTeamPowers[order[2]]) || 0;
        if (hiddenSlotPower <= 0) continue;
        const ratioPct = Math.round((enemy.hiddenTeamPower / hiddenSlotPower) * 100);
        const hiddenDominant = ratioPct <= maxHiddenRatioPct;
        const bestVisProb = Math.max(p0, p1);
        if (bestVisProb >= minMatchProb && hiddenDominant) {
          // Score favors higher visible win rate and stronger power advantage over hidden team
          const score = bestVisProb * 100 + (maxHiddenRatioPct - ratioPct) * 0.5;
          if (score > bestScore) {
            bestScore = score;
            const estBo3Pct = Math.round(bestVisProb * 100);
            bestSacrifice = {
              order,
              orderedTeams: [attackTeams[order[0]], attackTeams[order[1]], attackTeams[order[2]]],
              bo3WinRatePct: estBo3Pct,
              matchWinRates: [Math.round(p0 * 100), Math.round(p1 * 100), null],
              strategy: 'hidden-power-sacrifice',
              recommended: true,
              reason: `Hidden-Power Sacrifice: ${Math.round(bestVisProb * 100)}% on visible match + hidden team ~${Math.round(enemy.hiddenTeamPower / 1000)}k vs your ${Math.round(hiddenSlotPower / 1000)}k (${ratioPct}% ≤ ${maxHiddenRatioPct}%)`,
              hiddenSlotTeamPower: hiddenSlotPower,
              hiddenPowerRatioPct: ratioPct,
            };
          }
        }
      }
      if (bestSacrifice) return bestSacrifice;
    }

    // Fallback: best available ordering marked not recommended for auto
    let bestFallback: GrandArenaPermutationResult | null = null;
    let bestFallbackScore = -1;
    for (const order of PERMUTATIONS_3) {
      const p0 = winMatrix[order[0]]?.[0] ?? 0;
      const p1 = winMatrix[order[1]]?.[1] ?? 0;
      const score = p0 + p1;
      if (score > bestFallbackScore) {
        bestFallbackScore = score;
        const hiddenSlotPower = Number(attackTeamPowers[order[2]]) || 0;
        bestFallback = {
          order,
          orderedTeams: [attackTeams[order[0]], attackTeams[order[1]], attackTeams[order[2]]],
          bo3WinRatePct: Math.round(p0 * p1 * 100),
          matchWinRates: [Math.round(p0 * 100), Math.round(p1 * 100), null],
          strategy: 'manual-only',
          recommended: false,
          reason:
            hiddenPolicy === 'skip-hidden'
              ? 'Skipped by policy (1 hidden team)'
              : `Visible-2 floor ${Math.round(p0 * p1 * 100)}% below threshold (${minBo3Pct}%) and hidden team (~${Math.round(enemy.hiddenTeamPower / 1000)}k) not safely overpowered`,
          hiddenSlotTeamPower: hiddenSlotPower,
          hiddenPowerRatioPct: hiddenSlotPower > 0 ? Math.round((enemy.hiddenTeamPower / hiddenSlotPower) * 100) : undefined,
        };
      }
    }
    return bestFallback!;
  }

  // Case 3: >= 2 hidden teams (Top 20 — 1 visible team)
  let bestTop20: GrandArenaPermutationResult | null = null;
  let bestP0 = -1;
  let bestHiddenPowerSum = -1;
  for (const order of PERMUTATIONS_3) {
    const p0 = winMatrix[order[0]]?.[0] ?? 0;
    const hiddenSum = (Number(attackTeamPowers[order[1]]) || 0) + (Number(attackTeamPowers[order[2]]) || 0);
    if (p0 > bestP0 + 1e-6 || (Math.abs(p0 - bestP0) <= 1e-6 && hiddenSum > bestHiddenPowerSum)) {
      bestP0 = p0;
      bestHiddenPowerSum = hiddenSum;
      bestTop20 = {
        order,
        orderedTeams: [attackTeams[order[0]], attackTeams[order[1]], attackTeams[order[2]]],
        bo3WinRatePct: Math.round(p0 * 100),
        matchWinRates: [Math.round(p0 * 100), null, null],
        strategy: 'manual-only',
        recommended: !skipTwoHidden && p0 >= minMatchProb,
        reason: skipTwoHidden
          ? `Skipped: opponent has ${enemy.hiddenCount} hidden teams (Top 20)`
          : `Manual assist: ${Math.round(p0 * 100)}% vs visible Team 1`,
      };
    }
  }
  return bestTop20!;
}

/**
 * Builds the exact `customArena_endBattle` RPC arguments for Grand Arena (3 battles).
 */
export function buildGrandArenaEndBattleArgs(outcomes: any[]): Record<string, any> {
  const list = Array.isArray(outcomes) ? outcomes.slice(0, 3) : [];
  return {
    type: 'GrandArena',
    result: list.map((o) => ({
      win: Boolean(o?.win),
      stars: Number(o?.stars) || 0,
    })),
    progress: list.map((o) => [o?.progress || o?.endArgs?.progress?.[0] || null]),
  };
}

/**
 * Extracts all 3 enemy defense teams revealed inside `customArena_startBattle` response
 * so they can be cached for 24h in `grandArenaIntelCache`.
 */
export function extractDefendersFromStartBattles(
  userId: string,
  battles: any[],
  now: number = Date.now()
): GrandArenaIntelEntry | null {
  if (!userId || !Array.isArray(battles) || battles.length === 0) return null;
  const teams: number[][] = [];
  const teamPowers: number[] = [];
  for (const b of battles.slice(0, 3)) {
    const defMap = Array.isArray(b?.defenders) ? b.defenders[0] : b?.defenders;
    const heroes = defMap && typeof defMap === 'object' ? Object.values(defMap) : [];
    const ids = heroes.map((h: any) => Number(h?.id)).filter((id) => Number.isInteger(id) && id > 0);
    const power = heroes.reduce((sum: number, h: any) => sum + (Number(h?.power) || 0), 0);
    teams.push(ids);
    teamPowers.push(power);
  }
  return { userId: String(userId), teams, teamPowers, updatedAt: now };
}

export function pruneGrandArenaIntelCache(
  cache: Record<string, GrandArenaIntelEntry> | null | undefined,
  now: number = Date.now()
): Record<string, GrandArenaIntelEntry> {
  const out: Record<string, GrandArenaIntelEntry> = {};
  if (!cache || typeof cache !== 'object') return out;
  for (const [uid, entry] of Object.entries(cache)) {
    if (entry && Number.isFinite(entry.updatedAt) && now - entry.updatedAt <= GRAND_ARENA_INTEL_TTL_MS) {
      out[uid] = entry;
    }
  }
  return out;
}

export type GrandArenaUnitsValidationResult =
  | { ok: true; units: [number[], number[], number[]] }
  | { ok: false; reason: string };

/**
 * Strictly validates a Grand Arena `units` payload before dispatching `customArena_startBattle`.
 * Guarantees a 2D array of exactly 3 teams x 5 unique positive-integer owned hero IDs
 * so a flat 1D array or duplicate/invalid squad can never corrupt server `teamGetAll.grand`.
 */
export function validateGrandArenaUnitsPayload(
  units: unknown,
  ownedHeroIds?: Set<number> | null
): GrandArenaUnitsValidationResult {
  if (!Array.isArray(units)) {
    return { ok: false, reason: 'Grand Arena units must be a 2D array of 3 teams.' };
  }
  if (units.length !== 3) {
    return {
      ok: false,
      reason: `Grand Arena units must contain exactly 3 teams (received ${units.length}).`,
    };
  }
  const seen = new Set<number>();
  const normalized: number[][] = [];
  for (let t = 0; t < 3; t++) {
    const team = units[t];
    if (!Array.isArray(team)) {
      return {
        ok: false,
        reason: `Grand Arena team #${t + 1} must be an array of hero IDs (received ${typeof team}).`,
      };
    }
    if (team.length !== 5) {
      return {
        ok: false,
        reason: `Grand Arena team #${t + 1} must have exactly 5 heroes (received ${team.length}).`,
      };
    }
    const cleanTeam: number[] = [];
    for (const rawId of team) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        return {
          ok: false,
          reason: `Grand Arena team #${t + 1} contains invalid hero ID (${String(rawId)}).`,
        };
      }
      if (seen.has(id)) {
        return {
          ok: false,
          reason: `Hero #${id} is duplicated across Grand Arena teams.`,
        };
      }
      if (ownedHeroIds && ownedHeroIds.size > 0 && !ownedHeroIds.has(id)) {
        return {
          ok: false,
          reason: `Hero #${id} in team #${t + 1} is not in your owned hero roster.`,
        };
      }
      seen.add(id);
      cleanTeam.push(id);
    }
    normalized.push(cleanTeam);
  }
  return {
    ok: true,
    units: [normalized[0]!, normalized[1]!, normalized[2]!],
  };
}

export interface GrandTeamIntegrityStatus {
  valid: boolean;
  issue?: string;
  teams?: [number[], number[], number[]];
}

/**
 * Inspects cached `teamGetAll.grand` to detect malformed shapes (e.g. flat 1D array
 * or partial teams) so GrandArenaModal can warn the user and avoid copying broken state.
 */
export function inspectServerGrandTeamIntegrity(
  rawTeamGetAll: any,
  ownedHeroIds?: Set<number> | null
): GrandTeamIntegrityStatus {
  if (!rawTeamGetAll || typeof rawTeamGetAll !== 'object' || !Object.prototype.hasOwnProperty.call(rawTeamGetAll, 'grand')) {
    return { valid: true };
  }
  const grand = rawTeamGetAll.grand;
  if (grand === null || grand === undefined) {
    return { valid: true };
  }
  if (!Array.isArray(grand)) {
    return {
      valid: false,
      issue: `Server teamGetAll.grand is a ${typeof grand} instead of a 2D array of 3 teams.`,
    };
  }
  if (grand.length === 0) {
    return { valid: true };
  }
  if (grand.some((el: any) => !Array.isArray(el))) {
    return {
      valid: false,
      issue: 'Server teamGetAll.grand is a flat 1D array or contains non-array entries instead of 3 sub-teams.',
    };
  }
  if (grand.length !== 3) {
    return {
      valid: false,
      issue: `Server teamGetAll.grand has ${grand.length} team(s) instead of 3.`,
    };
  }
  const check = validateGrandArenaUnitsPayload(grand, ownedHeroIds);
  if (!check.ok) {
    return { valid: false, issue: check.reason };
  }
  return { valid: true, teams: check.units };
}
