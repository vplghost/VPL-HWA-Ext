/**
 * PvP Team Optimizer & 10-Round Unity WASM Arena Leaderboard (`pvpTeamOptimizer.ts`).
 * Builds a ranked leaderboard of strongest 5-hero PvP teams from the user's hero pool
 * starting from a user-selected Seed Team, using local Unity WASM simulation (`Presets_arena(0)`),
 * zero server RPCs, power-based hero pruning, early-exit screening, and Elo rating.
 */

import {
  DEFAULT_ARENA_BATTLE_FEATURES,
  DEFAULT_ARENA_BATTLE_EFFECTS,
} from '../data/arenaBattleEffects.ts';

export { DEFAULT_ARENA_BATTLE_FEATURES, DEFAULT_ARENA_BATTLE_EFFECTS };

export const PVP_OPTIMIZER_STORAGE_KEY = 'pvpOptimizerLastResult';
export const DEFAULT_PVP_MATCH_ROUNDS = 10;
export const BASE_ELO = 1500;
export const ELO_K_FACTOR = 32;

export interface BattleEnvelopeTemplate {
  userId?: string | number;
  battleFeatures?: string[];
  battleEffects?: Record<string, number>;
}

export type PvpSearchMode = 'one-swap' | 'beam-search' | 'top-k-round-robin';

export interface PvpHeroSnapshot {
  id: number;
  power: number;
  level?: number;
  color?: number;
  star?: number;
  [key: string]: any;
}

export interface PvpOptimizerFilterOptions {
  topN?: number;                 // default: 15
  minPower?: number;             // default: 0
  minPowerPctOfMax?: number;     // default: 55
  minPowerPctOfSeedMin?: number; // default: 70
  lockedHeroIds?: number[];      // 0..4 pinned heroes
  excludedHeroIds?: number[];    // blacklisted heroes
  minTeamPowerPctOfSeed?: number;// default: 85
}

export interface PvpMatchOptions {
  rounds?: number;       // default: 10
  symmetric?: boolean;   // default: true (5 atk + 5 def)
  earlyExit?: boolean;   // default: true during screening
  baseSeed?: number;
  hydratedHeroStats?: Record<string, any>;
  battleTemplate?: BattleEnvelopeTemplate;
  userId?: string | number;
}

export interface PvpMatchResult {
  teamAKey: string;
  teamBKey: string;
  teamAIds: number[];
  teamBIds: number[];
  winsA: number;
  winsB: number;
  roundsPlayed: number;
  earlyExited: boolean;
  winRateAPct: number;
  avgStarsA: number;
  avgDuration: number;
}

export interface PvpLeaderboardEntry {
  key: string;
  heroIds: number[];
  power: number;
  powerDeltaVsSeed: number;
  isSeed: boolean;
  isGiantKiller: boolean;
  elo: number;
  matchesPlayed: number;
  totalWins: number;
  totalRounds: number;
  overallWinRatePct: number;
  winRateVsSeedPct: number | null;
  avgStars: number;
  h2h: Record<string, { wins: number; rounds: number; winRatePct: number }>;
}

export interface PvpOptimizationProgress {
  phase: 'screening' | 'beam' | 'round-robin' | 'done';
  completedMatchups: number;
  totalMatchups: number;
  currentLeaderKey: string | null;
  currentLeaderWinRateVsSeed: number | null;
}

export interface PvpOptimizationSessionResult {
  seedKey: string;
  seedHeroIds: number[];
  searchMode: PvpSearchMode;
  poolSize: number;
  totalMatchups: number;
  aborted: boolean;
  leaderboard: PvpLeaderboardEntry[];
  generatedAt: string;
}

export function teamKey(heroIds: number[]): string {
  return [...heroIds].map(Number).filter((id) => id > 0).sort((a, b) => a - b).join(',');
}

export function calcTeamPower(heroIds: number[], heroMap: Map<number, PvpHeroSnapshot>): number {
  let sum = 0;
  for (const id of heroIds) {
    sum += Number(heroMap.get(Number(id))?.power) || 0;
  }
  return sum;
}

/**
 * Normalizes `heroGetAll.data` (object map or array) into a clean `Map<number, PvpHeroSnapshot>`.
 */
export function buildHeroPoolMap(rawHeroes: any): Map<number, PvpHeroSnapshot> {
  const map = new Map<number, PvpHeroSnapshot>();
  if (!rawHeroes || typeof rawHeroes !== 'object') return map;
  const entries = Array.isArray(rawHeroes)
    ? rawHeroes.map((h: any) => [Number(h?.id), h] as [number, any])
    : Object.entries(rawHeroes).map(([k, h]: [string, any]) => [Number(h?.id ?? k), h] as [number, any]);

  for (const [id, h] of entries) {
    if (!Number.isInteger(id) || id <= 0 || !h || typeof h !== 'object') continue;
    map.set(id, {
      ...h,
      id,
      power: Number(h.power) || 0,
      level: Number(h.level) || 1,
      color: Number(h.color) || 1,
      star: Number(h.star) || 1,
    });
  }
  return map;
}

/**
 * Prunes the player's hero pool based on power thresholds, topN cap, locks, and exclusions.
 * Seed team members are always retained so baseline comparisons remain valid.
 */
export function pruneHeroPool(
  rawHeroes: any,
  seedHeroIds: number[],
  options: PvpOptimizerFilterOptions = {}
): PvpHeroSnapshot[] {
  const heroMap = buildHeroPoolMap(rawHeroes);
  const all = Array.from(heroMap.values()).sort((a, b) => b.power - a.power);
  if (all.length === 0) return [];

  const seedSet = new Set(seedHeroIds.map(Number).filter((id) => id > 0));
  const lockedSet = new Set((options.lockedHeroIds || []).map(Number).filter((id) => id > 0));
  const excludedSet = new Set((options.excludedHeroIds || []).map(Number).filter((id) => id > 0));

  const maxPower = all[0].power || 0;
  const seedPowers = [...seedSet]
    .map((id) => heroMap.get(id)?.power || 0)
    .filter((p) => p > 0);
  const minSeedPower = seedPowers.length > 0 ? Math.min(...seedPowers) : 0;

  const topN = Math.max(5, Number(options.topN ?? 15));
  const minPower = Math.max(0, Number(options.minPower ?? 0));
  const minPowerPctOfMax = Math.max(0, Number(options.minPowerPctOfMax ?? 55));
  const minPowerPctOfSeedMin = Math.max(0, Number(options.minPowerPctOfSeedMin ?? 70));

  const maxThreshold = maxPower * (minPowerPctOfMax / 100);
  const seedThreshold = minSeedPower * (minPowerPctOfSeedMin / 100);
  const effectiveMinPower = Math.max(minPower, maxThreshold, seedThreshold);

  const kept: PvpHeroSnapshot[] = [];
  const keptIds = new Set<number>();

  // Always include seed & locked heroes first (unless explicitly absent from heroMap)
  for (const id of [...seedSet, ...lockedSet]) {
    const snap = heroMap.get(id);
    if (snap && !keptIds.has(id)) {
      kept.push(snap);
      keptIds.add(id);
    }
  }

  for (const h of all) {
    if (keptIds.has(h.id)) continue;
    if (excludedSet.has(h.id)) continue;
    if (h.power < effectiveMinPower) continue;
    if (kept.length >= topN) break;
    kept.push(h);
    keptIds.add(h.id);
  }

  return kept.sort((a, b) => b.power - a.power);
}

/**
 * Generates all 1-hero swap neighbors of `baseTeam` using `poolIds`,
 * preserving `lockedHeroIds`, avoiding `visitedKeys`, and enforcing `minTeamPower`.
 */
export function generateOneSwapCandidates(
  baseTeam: number[],
  poolIds: number[],
  heroMap: Map<number, PvpHeroSnapshot>,
  options: {
    lockedHeroIds?: number[];
    visitedKeys?: Set<string>;
    minTeamPower?: number;
  } = {}
): number[][] {
  const base = baseTeam.map(Number).filter((id) => id > 0);
  if (base.length !== 5) return [];

  const lockedSet = new Set((options.lockedHeroIds || []).map(Number));
  const visited = options.visitedKeys || new Set<string>();
  const minPower = Math.max(0, Number(options.minTeamPower) || 0);
  const baseSet = new Set(base);

  const candidates: number[][] = [];
  for (let slot = 0; slot < base.length; slot++) {
    const outId = base[slot];
    if (lockedSet.has(outId)) continue;

    for (const inId of poolIds) {
      if (baseSet.has(inId)) continue;
      const nextTeam = [...base];
      nextTeam[slot] = inId;
      const key = teamKey(nextTeam);
      if (visited.has(key)) continue;
      if (minPower > 0 && calcTeamPower(nextTeam, heroMap) < minPower) continue;
      visited.add(key);
      candidates.push(nextTeam);
    }
  }

  return candidates;
}

function lookupHero(
  heroMap: Map<number, PvpHeroSnapshot> | Record<string, PvpHeroSnapshot>,
  id: number
): PvpHeroSnapshot | undefined {
  if (heroMap instanceof Map) return heroMap.get(id);
  if (heroMap && typeof heroMap === 'object') return heroMap[String(id)];
  return undefined;
}

/**
 * Normalizes a hero object into the exact schema expected by Unity's `BattleInstantPlay`
 * constructor (`CONSTRUCT_BATTLE_PLAY`), preferring server-hydrated combat stats from
 * `battleHeroStatsCache` and safely filling all required C# fields when falling back to `heroGetAll`.
 */
export function normalizeBattleHero(
  heroId: number,
  hydratedHero?: any,
  rawHero?: PvpHeroSnapshot | any
): Record<string, any> {
  const id = Number(heroId);
  const src = hydratedHero && typeof hydratedHero === 'object' && Number.isFinite(Number(hydratedHero.hp))
    ? hydratedHero
    : (rawHero || {});

  const level = Math.max(1, Number(src.level ?? rawHero?.level) || 90);
  const color = Math.max(1, Number(src.color ?? rawHero?.color) || 9);
  const star = Math.max(1, Number(src.star ?? rawHero?.star) || 5);
  const power = Math.max(1000, Number(src.power ?? rawHero?.power) || 30000);

  // Normalize artifacts to exact `{ level, star, artifactType }[]` format
  const rawArts = Array.isArray(src.artifacts) ? src.artifacts : [];
  const artTypes = ['weapon', 'book', 'ring'];
  const artifacts = artTypes.map((artifactType, idx) => {
    const a = rawArts[idx] && typeof rawArts[idx] === 'object' ? rawArts[idx] : {};
    return {
      level: Math.max(1, Number(a.level) || 1),
      star: Math.max(1, Number(a.star) || 1),
      artifactType: typeof a.artifactType === 'string' ? a.artifactType : artifactType,
    };
  });

  const currentSkin = Number(src.currentSkin ?? src.skin ?? id) || id;
  const skinsObj =
    src.skins && typeof src.skins === 'object' && !Array.isArray(src.skins)
      ? src.skins
      : { [String(id)]: 1 };
  const slotsObj =
    src.slots && typeof src.slots === 'object' && !Array.isArray(src.slots)
      ? src.slots
      : {};
  const skillsObj =
    src.skills && typeof src.skills === 'object' && !Array.isArray(src.skills)
      ? src.skills
      : {};
  const heroRunes = Array.isArray(src.hero_runes)
    ? src.hero_runes
    : (Array.isArray(src.runes) && src.runes.length === 5 ? src.runes : [0, 0, 0, 0, 0]);

  // If server-hydrated stats exist, preserve them verbatim; otherwise derive safe non-zero combat stats
  const hasHydratedCombat = Number.isFinite(Number(src.hp)) && Number(src.hp) > 0;
  const estStat = Math.max(100, Math.round(power * 0.04));

  return {
    ...src,
    id,
    xp: Number(src.xp) || level * 10000,
    level,
    color,
    star,
    power,
    slots: slotsObj,
    skills: skillsObj,
    runes: Array.isArray(src.runes) ? src.runes : [0, 0, 0, 0, 0],
    hero_runes: heroRunes,
    skins: skinsObj,
    currentSkin,
    skin: Number(src.skin) || currentSkin,
    baseSkinId: Number(src.baseSkinId) || id,
    skinsInfo: Array.isArray(src.skinsInfo) ? src.skinsInfo : [],
    currentSkinRank: Number(src.currentSkinRank) || 0,
    skinRank: Number(src.skinRank) || 0,
    currentSkinColorId: Number(src.currentSkinColorId) || 0,
    titanGiftLevel: Number(src.titanGiftLevel) || 0,
    artifacts,
    patronLevel: Number(src.patronLevel) || 0,
    upgradedSkills: Array.isArray(src.upgradedSkills) ? src.upgradedSkills : [],
    GlobalAttack: Number(src.GlobalAttack) || 100,
    agility: hasHydratedCombat ? Number(src.agility) || estStat : estStat,
    strength: hasHydratedCombat ? Number(src.strength) || estStat : estStat,
    intelligence: hasHydratedCombat ? Number(src.intelligence) || estStat : estStat,
    hp: hasHydratedCombat ? Number(src.hp) : Math.max(5000, Math.round(power * 1.8)),
    armor: hasHydratedCombat ? Number(src.armor) || 500 : Math.max(300, Math.round(power * 0.06)),
    magicResist: hasHydratedCombat ? Number(src.magicResist) || 500 : Math.max(300, Math.round(power * 0.05)),
    physicalAttack: hasHydratedCombat ? Number(src.physicalAttack) || 1000 : Math.max(500, Math.round(power * 0.12)),
    magicPower: hasHydratedCombat ? Number(src.magicPower) || 1000 : Math.max(500, Math.round(power * 0.08)),
  };
}

/**
 * Builds a synthetic offline Arena `rawBattle` payload for Unity WASM (`Presets_arena(0)`).
 * Matches the live `customArena_startBattle` envelope (`effects: []`, `reward: []`,
 * `startTime`, `battleFeatures`, `battleEffects`) so `CONSTRUCT_BATTLE_PLAY` never throws.
 * Zero server RPCs required.
 */
export function buildSyntheticArenaBattle(
  attackerIds: number[],
  defenderIds: number[],
  heroMap: Map<number, PvpHeroSnapshot> | Record<string, PvpHeroSnapshot>,
  seed: number,
  opts: {
    hydratedHeroStats?: Record<string, any>;
    battleTemplate?: BattleEnvelopeTemplate;
    userId?: string | number;
  } = {}
): Record<string, any> {
  const hydrated = opts.hydratedHeroStats || {};
  const attackers: Record<string, any> = {};
  for (const id of attackerIds) {
    const nId = Number(id);
    attackers[String(nId)] = normalizeBattleHero(nId, hydrated[String(nId)], lookupHero(heroMap, nId));
  }
  const defenders: Record<string, any> = {};
  for (let idx = 0; idx < defenderIds.length; idx++) {
    const nId = Number(defenderIds[idx]);
    // Live customArena_startBattle keys defenders[0] by 1-indexed slot ("1".."5"), while hero.id holds the hero ID
    defenders[String(idx + 1)] = normalizeBattleHero(nId, hydrated[String(nId)], lookupHero(heroMap, nId));
  }
  const tpl = opts.battleTemplate;
  const tplEffects =
    tpl?.battleEffects && typeof tpl.battleEffects === 'object' && Object.keys(tpl.battleEffects).length > 0
      ? tpl.battleEffects
      : DEFAULT_ARENA_BATTLE_EFFECTS;
  return {
    userId: String(opts.userId ?? tpl?.userId ?? '1'),
    typeId: 1,
    type: 'arena',
    seed: (Number(seed) >>> 0) || 1,
    startTime: Math.floor(Date.now() / 1000),
    effects: [],
    reward: [],
    battleFeatures:
      Array.isArray(tpl?.battleFeatures) && tpl.battleFeatures.length > 0
        ? [...tpl.battleFeatures]
        : [...DEFAULT_ARENA_BATTLE_FEATURES],
    battleEffects: tplEffects,
    attackers,
    defenders: [defenders],
  };
}

function deriveMatchSeed(baseSeed: number, roundIdx: number): number {
  let s = ((baseSeed >>> 0) + Math.imul(roundIdx + 1, 2654435761)) >>> 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return (s >>> 0) || (roundIdx + 1);
}

/**
 * Runs a direct 10-round PvP matchup between Team A and Team B via Unity WASM.
 * Supports 5+5 symmetric mode (5 atk + 5 def) and early-exit pruning during screening.
 */
export async function runTenRoundPvpMatch(
  teamAIds: number[],
  teamBIds: number[],
  heroMap: Map<number, PvpHeroSnapshot>,
  simulateFn: (rawBattle: any, seed: number) => Promise<any>,
  options: PvpMatchOptions = {}
): Promise<PvpMatchResult> {
  const rounds = Math.max(2, Math.floor(Number(options.rounds ?? DEFAULT_PVP_MATCH_ROUNDS)));
  const symmetric = options.symmetric !== false;
  const earlyExit = options.earlyExit === true;
  const baseSeed = (Number(options.baseSeed) >>> 0) || 1337001;

  let winsA = 0;
  let winsB = 0;
  let totalStarsA = 0;
  let totalDuration = 0;
  let roundsPlayed = 0;
  let earlyExited = false;

  const atkRounds = symmetric ? Math.ceil(rounds / 2) : rounds;
  const majorityNeeded = Math.floor(rounds / 2) + 1;

  for (let i = 0; i < rounds; i++) {
    const aIsAttacker = i < atkRounds;
    const seed = deriveMatchSeed(baseSeed, i);
    const battleOpts = {
      hydratedHeroStats: options.hydratedHeroStats,
      battleTemplate: options.battleTemplate,
      userId: options.userId,
    };
    const battle = aIsAttacker
      ? buildSyntheticArenaBattle(teamAIds, teamBIds, heroMap, seed, battleOpts)
      : buildSyntheticArenaBattle(teamBIds, teamAIds, heroMap, seed, battleOpts);

    const outcome = await simulateFn(battle, seed);
    roundsPlayed++;
    totalDuration += Number(outcome?.duration) || 0;

    const aWon = aIsAttacker ? Boolean(outcome?.win) : !Boolean(outcome?.win);
    if (aWon) {
      winsA++;
      totalStarsA += aIsAttacker ? (Number(outcome?.stars) || 3) : 3;
    } else {
      winsB++;
    }

    // Early-exit screening: if Team A can no longer reach majority (>50%) and already has 0-1 wins after >=5 rounds
    if (earlyExit) {
      const remaining = rounds - roundsPlayed;
      if (winsA + remaining < majorityNeeded) {
        earlyExited = true;
        break;
      }
    }
  }

  return {
    teamAKey: teamKey(teamAIds),
    teamBKey: teamKey(teamBIds),
    teamAIds: [...teamAIds],
    teamBIds: [...teamBIds],
    winsA,
    winsB,
    roundsPlayed,
    earlyExited,
    winRateAPct: roundsPlayed > 0 ? Math.round((winsA / roundsPlayed) * 100) : 0,
    avgStarsA: winsA > 0 ? Math.round((totalStarsA / winsA) * 10) / 10 : 0,
    avgDuration: roundsPlayed > 0 ? Math.round((totalDuration / roundsPlayed) * 10) / 10 : 0,
  };
}

/**
 * Updates Elo ratings for two teams given a 10-round matchup result.
 */
export function updateEloPair(
  eloA: number,
  eloB: number,
  winsA: number,
  roundsPlayed: number,
  kFactor: number = ELO_K_FACTOR
): { nextEloA: number; nextEloB: number } {
  if (roundsPlayed <= 0) return { nextEloA: eloA, nextEloB: eloB };
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const actualA = winsA / roundsPlayed;
  const delta = Math.round(kFactor * (actualA - expectedA));
  return {
    nextEloA: eloA + delta,
    nextEloB: eloB - delta,
  };
}

/**
 * Executes a full Seed-Team guided PvP optimization session and builds the ranked Leaderboard.
 */
export async function runPvpOptimizationSession(params: {
  rawHeroes: any;
  seedHeroIds: number[];
  simulateFn: (rawBattle: any, seed: number) => Promise<any>;
  searchMode?: PvpSearchMode;
  filterOptions?: PvpOptimizerFilterOptions;
  matchOptions?: PvpMatchOptions;
  maxMatchups?: number;
  beamWidth?: number;
  roundRobinTopK?: number;
  shouldStop?: () => boolean;
  onProgress?: (progress: PvpOptimizationProgress) => void;
}): Promise<PvpOptimizationSessionResult> {
  const searchMode: PvpSearchMode = params.searchMode || 'one-swap';
  const heroMap = buildHeroPoolMap(params.rawHeroes);
  const seedIds = params.seedHeroIds.map(Number).filter((id) => id > 0).slice(0, 5);
  const seedK = teamKey(seedIds);
  const seedPower = calcTeamPower(seedIds, heroMap);

  const pool = pruneHeroPool(params.rawHeroes, seedIds, params.filterOptions);
  const poolIds = pool.map((h) => h.id);

  const minTeamPowerPct = Math.max(0, Number(params.filterOptions?.minTeamPowerPctOfSeed ?? 85));
  const minTeamPower = seedPower * (minTeamPowerPct / 100);
  const maxMatchups = Math.max(1, Number(params.maxMatchups ?? 120));
  const beamWidth = Math.max(1, Math.min(8, Number(params.beamWidth ?? 3)));
  const roundRobinTopK = Math.max(2, Math.min(10, Number(params.roundRobinTopK ?? 6)));

  const entries = new Map<string, PvpLeaderboardEntry>();
  const ensureEntry = (ids: number[]): PvpLeaderboardEntry => {
    const k = teamKey(ids);
    let e = entries.get(k);
    if (!e) {
      const pwr = calcTeamPower(ids, heroMap);
      e = {
        key: k,
        heroIds: [...ids],
        power: pwr,
        powerDeltaVsSeed: pwr - seedPower,
        isSeed: k === seedK,
        isGiantKiller: false,
        elo: BASE_ELO,
        matchesPlayed: 0,
        totalWins: 0,
        totalRounds: 0,
        overallWinRatePct: 0,
        winRateVsSeedPct: k === seedK ? 50 : null,
        avgStars: 0,
        h2h: {},
      };
      entries.set(k, e);
    }
    return e;
  };

  ensureEntry(seedIds);

  const visitedTeams = new Set<string>([seedK]);
  const playedPairs = new Set<string>();
  const pairKey = (k1: string, k2: string) => (k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`);

  let completedMatchups = 0;
  let aborted = false;

  const recordMatch = (res: PvpMatchResult) => {
    const eA = ensureEntry(res.teamAIds);
    const eB = ensureEntry(res.teamBIds);

    eA.matchesPlayed++;
    eA.totalWins += res.winsA;
    eA.totalRounds += res.roundsPlayed;
    eA.overallWinRatePct = Math.round((eA.totalWins / Math.max(1, eA.totalRounds)) * 100);
    eA.h2h[eB.key] = { wins: res.winsA, rounds: res.roundsPlayed, winRatePct: res.winRateAPct };
    if (res.avgStarsA > 0) eA.avgStars = res.avgStarsA;

    eB.matchesPlayed++;
    eB.totalWins += res.winsB;
    eB.totalRounds += res.roundsPlayed;
    eB.overallWinRatePct = Math.round((eB.totalWins / Math.max(1, eB.totalRounds)) * 100);
    eB.h2h[eA.key] = { wins: res.winsB, rounds: res.roundsPlayed, winRatePct: 100 - res.winRateAPct };

    if (eB.key === seedK) {
      eA.winRateVsSeedPct = res.winRateAPct;
      if (res.winRateAPct > 50 && eA.power < seedPower) {
        eA.isGiantKiller = true;
      }
    } else if (eA.key === seedK) {
      eB.winRateVsSeedPct = 100 - res.winRateAPct;
      if (eB.winRateVsSeedPct > 50 && eB.power < seedPower) {
        eB.isGiantKiller = true;
      }
    }

    const { nextEloA, nextEloB } = updateEloPair(eA.elo, eB.elo, res.winsA, res.roundsPlayed);
    eA.elo = nextEloA;
    eB.elo = nextEloB;
  };

  const sortLeaderboard = (): PvpLeaderboardEntry[] =>
    Array.from(entries.values()).sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      const wrA = a.winRateVsSeedPct ?? a.overallWinRatePct;
      const wrB = b.winRateVsSeedPct ?? b.overallWinRatePct;
      if (wrB !== wrA) return wrB - wrA;
      return b.overallWinRatePct - a.overallWinRatePct;
    });

  // Phase 1: 1-Swap Screening around Seed Team
  const gen1Candidates = generateOneSwapCandidates(seedIds, poolIds, heroMap, {
    lockedHeroIds: params.filterOptions?.lockedHeroIds,
    visitedKeys: visitedTeams,
    minTeamPower,
  });

  const plannedTotal = Math.min(maxMatchups, gen1Candidates.length);
  for (const cand of gen1Candidates) {
    if (params.shouldStop?.() || completedMatchups >= maxMatchups) {
      if (params.shouldStop?.()) aborted = true;
      break;
    }
    const pk = pairKey(teamKey(cand), seedK);
    if (playedPairs.has(pk)) continue;
    playedPairs.add(pk);

    const res = await runTenRoundPvpMatch(cand, seedIds, heroMap, params.simulateFn, {
      ...params.matchOptions,
      baseSeed: ((params.matchOptions?.baseSeed || 1337001) + completedMatchups * 97) >>> 0,
    });
    recordMatch(res);
    completedMatchups++;

    const leader = sortLeaderboard()[0];
    params.onProgress?.({
      phase: 'screening',
      completedMatchups,
      totalMatchups: plannedTotal,
      currentLeaderKey: leader?.key || null,
      currentLeaderWinRateVsSeed: leader?.winRateVsSeedPct ?? null,
    });
  }

  // Phase 2: Beam Search (Generation 2 around top challengers)
  if (!aborted && (searchMode === 'beam-search' || searchMode === 'top-k-round-robin') && completedMatchups < maxMatchups) {
    const topChallengers = sortLeaderboard()
      .filter((e) => !e.isSeed && (e.winRateVsSeedPct ?? 0) >= 50)
      .slice(0, beamWidth);

    const gen2Candidates: number[][] = [];
    for (const parent of topChallengers) {
      const nextList = generateOneSwapCandidates(parent.heroIds, poolIds, heroMap, {
        lockedHeroIds: params.filterOptions?.lockedHeroIds,
        visitedKeys: visitedTeams,
        minTeamPower,
      });
      gen2Candidates.push(...nextList);
    }

    for (const cand of gen2Candidates) {
      if (params.shouldStop?.() || completedMatchups >= maxMatchups) {
        if (params.shouldStop?.()) aborted = true;
        break;
      }
      const pk = pairKey(teamKey(cand), seedK);
      if (playedPairs.has(pk)) continue;
      playedPairs.add(pk);

      const res = await runTenRoundPvpMatch(cand, seedIds, heroMap, params.simulateFn, {
        ...params.matchOptions,
        baseSeed: ((params.matchOptions?.baseSeed || 1337001) + completedMatchups * 97) >>> 0,
      });
      recordMatch(res);
      completedMatchups++;

      const leader = sortLeaderboard()[0];
      params.onProgress?.({
        phase: 'beam',
        completedMatchups,
        totalMatchups: Math.min(maxMatchups, completedMatchups + gen2Candidates.length),
        currentLeaderKey: leader?.key || null,
        currentLeaderWinRateVsSeed: leader?.winRateVsSeedPct ?? null,
      });
    }
  }

  // Phase 3: Top-K Round-Robin (full 10/10 rounds, no early-exit, always includes Seed Team)
  if (!aborted && searchMode === 'top-k-round-robin' && completedMatchups < maxMatchups) {
    const topList = sortLeaderboard().slice(0, roundRobinTopK);
    if (!topList.some((e) => e.isSeed)) {
      const seedEntry = entries.get(seedK);
      if (seedEntry) topList[topList.length - 1] = seedEntry;
    }

    for (let i = 0; i < topList.length; i++) {
      for (let j = i + 1; j < topList.length; j++) {
        if (params.shouldStop?.() || completedMatchups >= maxMatchups) {
          if (params.shouldStop?.()) aborted = true;
          break;
        }
        const a = topList[i];
        const b = topList[j];
        const pk = pairKey(a.key, b.key);
        if (playedPairs.has(pk)) continue;
        playedPairs.add(pk);

        const res = await runTenRoundPvpMatch(a.heroIds, b.heroIds, heroMap, params.simulateFn, {
          ...params.matchOptions,
          earlyExit: false, // Exact 10/10 for Round-Robin Elo accuracy
          baseSeed: ((params.matchOptions?.baseSeed || 1337001) + completedMatchups * 131) >>> 0,
        });
        recordMatch(res);
        completedMatchups++;

        const leader = sortLeaderboard()[0];
        params.onProgress?.({
          phase: 'round-robin',
          completedMatchups,
          totalMatchups: completedMatchups,
          currentLeaderKey: leader?.key || null,
          currentLeaderWinRateVsSeed: leader?.winRateVsSeedPct ?? null,
        });
      }
      if (aborted || completedMatchups >= maxMatchups) break;
    }
  }

  const finalBoard = sortLeaderboard();
  params.onProgress?.({
    phase: 'done',
    completedMatchups,
    totalMatchups: completedMatchups,
    currentLeaderKey: finalBoard[0]?.key || null,
    currentLeaderWinRateVsSeed: finalBoard[0]?.winRateVsSeedPct ?? null,
  });

  return {
    seedKey: seedK,
    seedHeroIds: seedIds,
    searchMode,
    poolSize: pool.length,
    totalMatchups: completedMatchups,
    aborted,
    leaderboard: finalBoard,
    generatedAt: new Date().toISOString(),
  };
}
