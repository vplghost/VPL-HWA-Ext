import { normalizeArray } from './troops.ts';

export const metric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export const displayMetric = (value: unknown): string => metric(value)?.toLocaleString() ?? '—';
const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
export function metricPercent(value: unknown, total: unknown): number | null {
  const current = metric(value), target = metric(total);
  return current != null && target != null && target > 0 ? Math.min(100, Math.round(current / target * 100)) : null;
}

/** Separate reported state from static rule metadata; absent values never imply eligibility. */
export function guildVersusView(cache: any, now = Date.now()) {
  const status = cache.clanVersusStatus?.data || {}, battle = status.battle || {}, info = status.info || {}, rewards = status.rewards || {};
  const observed = Date.parse(cache.clanVersusStatus?.updatedAt);
  const stale = Number.isFinite(observed) && new Date(observed).toDateString() !== new Date(now).toDateString();
  const claimedRaw = status.chestNumbers;
  const claimsKnown = !stale && claimedRaw != null && typeof claimedRaw === 'object';
  const claimed = claimsKnown ? (Array.isArray(claimedRaw) ? claimedRaw : Object.keys(claimedRaw)).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 9) : [];
  const clanPoints = metric(battle.clanRoundPoints), enemyPoints = metric(battle.enemyClanRoundPoints);
  const total = clanPoints != null && enemyPoints != null ? clanPoints + enemyPoints : null;
  const clanPct = total === 0 ? 0 : metricPercent(clanPoints, total);
  const enemyPct = total === 0 ? 0 : clanPct == null ? null : 100 - clanPct;
  const league = battle.league ?? info.league;
  return {
    clan: battle.clan || {}, enemyClan: battle.enemyClan || {},
    league: typeof league === 'string' && league.trim() ? league.charAt(0).toUpperCase() + league.slice(1) : metric(league) != null ? String(league) : '—',
    battleNumber: metric(info.battleNumber), roundNumber: metric(info.roundNumber),
    clanPoints, enemyPoints, clanPct, enemyPct, stale,
    personalRoundPoints: stale ? null : metric(status.score ?? rewards.userRoundPoints),
    personalBattlePoints: stale ? null : metric(rewards.userBattlePoints), personalSeasonPoints: metric(rewards.userSeasonPoints),
    currentUsers: metric(info.currentNumActiveUsers), requiredUsers: metric(info.numActiveUsers), weeklyActivity: metric(info.weeklyUserActivity),
    personalEligible: flag(info.personalRequirementsIsSatisfied), guildEligible: flag(info.guildRequirementsIsSatisfied),
    claimed, claimsKnown, claimedCount: claimsKnown ? new Set(claimed).size : null,
    targetChest: claimsKnown ? Array.from({ length: 9 }, (_, i) => i + 1).find(n => !claimed.includes(n)) ?? 9 : 0,
    rounds: normalizeArray(battle.rounds), challenges: info.challenges == null ? null : normalizeArray(info.challenges),
  };
}

export function challengeConvertedPoints(ch: any, points: Record<string, number>, steps: Record<string, number>): number | null {
  const progress = metric(ch?.progress), step = metric(steps[ch?.id]), perStep = metric(points[ch?.id]);
  return progress != null && step != null && step > 0 && perStep != null ? Math.floor(progress / step) * perStep : null;
}
