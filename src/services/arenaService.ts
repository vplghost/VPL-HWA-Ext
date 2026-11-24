export interface ArenaEnemyHero {
  id: number;
  level: number;
  color: number;
  star: number;
  power: number;
}

export interface ArenaEnemy {
  userId: string;
  name: string;
  level: number;
  clanTitle: string;
  serverId: string;
  power: number;
  rating: number;
  rewards?: { win?: number; lose?: number };
  heroes: ArenaEnemyHero[];
}

export interface ArenaOverview {
  place: number | null;
  bestPlace: number | null;
  rating: number | null;
  bestRating: number | null;
  leagueId: number | null;
  freeBattlesLeft: number | null;
  winStreak: number;
  dayStreak: number;
  numBattles: number;
  numWins: number;
  power: number;
  defenders: ArenaEnemyHero[];
  enemies: ArenaEnemy[];
  replays: any[];
  leagueRewards: any[];
  arenaType: string;
}

export interface ArenaSimRun {
  round: number;
  seed: number;
  win: boolean;
  stars: number;
  duration: number;
}

export interface ArenaMonteCarloResult {
  wins: number;
  losses: number;
  total: number;
  winRatePct: number;
  canonicalOutcome: any;
  runs: ArenaSimRun[];
}

/**
 * Extracts a raw Arena enemy list from either a flat array (`Enemy[]`) or a wrapped
 * response object (`{ type, useCustomArenaMode, enemies: Enemy[] }`), as returned by
 * `arenaFindEnemies` and `customArena_endBattle`.
 */
export function extractArenaEnemyList(source: any): any[] {
  if (Array.isArray(source)) return source;
  if (source && typeof source === 'object' && Array.isArray(source.enemies)) {
    return source.enemies;
  }
  return [];
}

export function normalizeArenaEnemy(raw: any): ArenaEnemy | null {
  if (!raw || typeof raw !== 'object') return null;
  const userId = String(raw.userId ?? raw.user?.id ?? '').trim();
  if (!userId) return null;
  const heroes: ArenaEnemyHero[] = (Array.isArray(raw.heroes) ? raw.heroes : [])
    .map((h: any) => ({
      id: Number(h?.id) || 0,
      level: Number(h?.level) || 0,
      color: Number(h?.color) || 0,
      star: Number(h?.star) || 0,
      power: Number(h?.power) || 0,
    }))
    .filter((h) => h.id > 0);
  const computedPower = heroes.reduce((sum, h) => sum + h.power, 0);
  return {
    userId,
    name: String(raw.user?.name || `Player #${userId}`),
    level: Number(raw.user?.level) || 0,
    clanTitle: String(raw.user?.clanTitle || ''),
    serverId: String(raw.user?.serverId || ''),
    power: Number(raw.power) || computedPower,
    rating: Number(raw.rating) || 0,
    rewards: raw.rewards && typeof raw.rewards === 'object' ? raw.rewards : undefined,
    heroes,
  };
}

export function extractArenaOverview(cache: Record<string, any> | null | undefined): ArenaOverview {
  const c = cache || {};
  const arenaAll = c.arenaGetAll?.data || {};
  const arenaState = c.arenaState?.data || {};
  const arenaEnemies = c.arenaEnemies?.data || {};
  const arenaLeague = c.arenaLeague?.data || {};
  const arenaReplays = c.arenaReplays?.data || {};
  const freeEntry = c['resource:refillable:6']?.data;

  const fromArenaEnemies = extractArenaEnemyList(arenaEnemies);
  const fromArenaState = extractArenaEnemyList(arenaState.enemies);
  const rawEnemies = fromArenaEnemies.length > 0 ? fromArenaEnemies : fromArenaState;

  const enemies = rawEnemies
    .map(normalizeArenaEnemy)
    .filter((e: ArenaEnemy | null): e is ArenaEnemy => e !== null);

  const defenders: ArenaEnemyHero[] = (Array.isArray(arenaState.defenders) ? arenaState.defenders : [])
    .map((h: any) => ({
      id: Number(h?.id) || 0,
      level: Number(h?.level) || 0,
      color: Number(h?.color) || 0,
      star: Number(h?.star) || 0,
      power: Number(h?.power) || 0,
    }))
    .filter((h: ArenaEnemyHero) => h.id > 0);

  const freeAmount = freeEntry && Number.isInteger(freeEntry.amount) && freeEntry.amount >= 0
    ? Number(freeEntry.amount)
    : null;

  return {
    place: arenaState.place ?? arenaAll.arenaPlace ?? null,
    bestPlace: arenaState.bestPlace ?? arenaAll.arenaBestPlace ?? null,
    rating: arenaState.rating ?? arenaAll.arenaRating ?? null,
    bestRating: arenaState.bestRating ?? null,
    leagueId: arenaLeague.league ?? null,
    freeBattlesLeft: freeAmount,
    winStreak: Number(arenaState.winStreak) || 0,
    dayStreak: Number(arenaState.dayStreak) || 0,
    numBattles: Number(arenaState.numBattles) || 0,
    numWins: Number(arenaState.numWins) || 0,
    power: Number(arenaState.power) || defenders.reduce((s, h) => s + h.power, 0),
    defenders,
    enemies,
    replays: Array.isArray(arenaReplays.replays) ? arenaReplays.replays : [],
    leagueRewards: Array.isArray(arenaLeague.rewards) ? arenaLeague.rewards : [],
    arenaType: String(arenaState.arenaType || 'NormalArena'),
  };
}

/**
 * Returns true if enemy power is within the allowed percentage of player power (e.g. <= 90%).
 */
export function isEnemyWithinPowerRatio(
  enemyPower: number,
  playerPower: number,
  maxRatioPct: number = 90
): boolean {
  if (!Number.isFinite(enemyPower) || enemyPower <= 0) return true;
  if (!Number.isFinite(playerPower) || playerPower <= 0) return true;
  const ratio = Math.max(10, Math.min(300, Number(maxRatioPct) || 90));
  return enemyPower <= playerPower * (ratio / 100);
}

/**
 * Builds the exact `customArena_endBattle` RPC arguments matching live game traffic.
 */
export function buildArenaEndBattleArgs(
  simOutcome: any,
  arenaType: string = 'NormalArena'
): Record<string, any> {
  const progressObj =
    simOutcome?.progress ||
    simOutcome?.endArgs?.progress?.[0] ||
    null;
  return {
    type: arenaType || 'NormalArena',
    result: [
      {
        win: Boolean(simOutcome?.win),
        stars: Number(simOutcome?.stars) || 0,
      },
    ],
    progress: [[progressObj]],
    auto: true,
  };
}

/**
 * Runs N Unity WASM simulations (round 0 uses the exact server seed, rounds 1..N-1 use derived seeds)
 * to compute a Monte Carlo win-rate estimate.
 */
export async function runArenaMonteCarloSim(
  rawBattle: any,
  simulateFn: (battle: any, seed: number) => Promise<any>,
  rounds: number = 10,
  onProgress?: (completed: number, total: number, wins: number) => void
): Promise<ArenaMonteCarloResult> {
  const total = Math.max(1, Math.min(30, Math.floor(Number(rounds) || 10)));
  const baseSeed = (Number(rawBattle?.seed) >>> 0) || (Math.floor(Math.random() * 0xffffffff) >>> 0);
  const seeds: number[] = [];
  for (let i = 0; i < total; i++) {
    seeds.push(i === 0 ? baseSeed : ((baseSeed + Math.imul(i, 2654435761)) >>> 0));
  }

  const runs: ArenaSimRun[] = [];
  let canonicalOutcome: any = null;
  let wins = 0;

  // Run round 0 first (canonical server seed), then remaining rounds in parallel batches of 3
  const firstOutcome = await simulateFn(rawBattle, seeds[0]);
  canonicalOutcome = firstOutcome;
  if (firstOutcome?.win) wins++;
  runs.push({
    round: 1,
    seed: seeds[0],
    win: Boolean(firstOutcome?.win),
    stars: Number(firstOutcome?.stars) || 0,
    duration: Number(firstOutcome?.duration) || 0,
  });
  onProgress?.(runs.length, total, wins);

  const batchSize = 3;
  for (let start = 1; start < total; start += batchSize) {
    const slice = seeds.slice(start, start + batchSize);
    const batchOutcomes = await Promise.all(
      slice.map((s, idx) =>
        simulateFn(rawBattle, s).then((res) => ({
          round: start + idx + 1,
          seed: s,
          res,
        }))
      )
    );
    for (const item of batchOutcomes) {
      const won = Boolean(item.res?.win);
      if (won) wins++;
      runs.push({
        round: item.round,
        seed: item.seed,
        win: won,
        stars: Number(item.res?.stars) || 0,
        duration: Number(item.res?.duration) || 0,
      });
    }
    onProgress?.(runs.length, total, wins);
  }

  const losses = total - wins;
  const winRatePct = Math.round((wins / total) * 100);
  return {
    wins,
    losses,
    total,
    winRatePct,
    canonicalOutcome,
    runs,
  };
}
