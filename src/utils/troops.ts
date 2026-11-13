import { DRILL_GROUND_BUILDING_IDS, DRILL_GROUND_LIMIT_BY_LEVEL } from './troopLimitData.ts';

export function getTroopType(unitId: number | string): { type: 0 | 1 | 2; level: number } | null {
  const id = Number(unitId);
  if (id >= 1 && id <= 9) return { type: 0, level: id };
  if (id >= 11 && id <= 19) return { type: 1, level: id - 10 };
  if (id >= 21 && id <= 29) return { type: 2, level: id - 20 };
  return null;
}

export function normalizeArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

export const TROOP_DEFS = [
  { type: 0 as const, label: 'Marksmen', icon: '🏹', badgeCls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { type: 1 as const, label: 'Spearmen', icon: '🔱', badgeCls: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
  { type: 2 as const, label: 'Infantry', icon: '🛡️', badgeCls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
];

export const CAMP_BUILDING_IDS: Record<number, number> = {
  0: 41, // Marksmen Camp
  1: 42, // Spearmen Camp
  2: 40, // Infantry Camp
};

/** Progress against the true cap, never against an inflated current-stock denominator. */
export function troopStockProgress(stock: { readyCount: number; hospitalCount: number; trainingCount: number; maxTroops: number | null }) {
  const amounts = [stock.readyCount, stock.hospitalCount, stock.trainingCount].map(value =>
    Number.isFinite(value) ? Math.max(0, value) : 0);
  const currentTotal = amounts.reduce((sum, value) => sum + value, 0);
  const maxTarget = stock.maxTroops;
  const limitKnown = typeof maxTarget === 'number' && Number.isSafeInteger(maxTarget) && maxTarget >= 0;
  const remaining = limitKnown ? Math.max(0, maxTarget - currentTotal) : 0;
  const overLimit = limitKnown ? Math.max(0, currentTotal - maxTarget) : 0;
  const occupancyPct = !limitKnown ? null : maxTarget > 0 ? currentTotal / maxTarget * 100 : currentTotal === 0 ? 0 : null;
  let availablePct = 100;
  const segments = amounts.map(amount => {
    const raw = !limitKnown ? 0 : maxTarget > 0 ? amount / maxTarget * 100 : amount > 0 ? 100 : 0;
    const width = Math.max(0, Math.min(availablePct, raw));
    availablePct -= width;
    return width;
  });
  return { currentTotal, maxTarget, limitKnown, remaining, overLimit, occupancyPct,
    filledPct: segments.reduce((sum, value) => sum + value, 0),
    readyPct: segments[0], hospitalPct: segments[1], trainingPct: segments[2],
    canTrain: limitKnown && remaining > 0, unitsToTrain: Math.min(26, remaining) };
}

/** Stock limit, distinct from per-march capacity and per-batch trainingCapacity. */
export function calculateTroopMax(type: number, cache: any, _currentTotal = 0): number | null {
  if (!Number.isInteger(type) || type < 0 || type > 2) return null;
  const raw = cache?.buildingStatus?.data?.buildings ?? cache?.['getSummary:building']?.data?.buildings;
  if (raw == null) {
    const unitSummary = cache?.['getUnitSummary:unit']?.data ?? cache?.getUnitSummary?.data;
    const direct = unitSummary?.limits?.[type];
    return Number.isSafeInteger(direct) && direct >= 0 ? direct : null;
  }
  if (typeof raw !== 'object') return null;
  const confirmed = new Map<number, number>();
  for (const [key, value] of Object.entries(raw)) {
    const building: any = value;
    const id = Number(building?.buildingId ?? building?.id ?? (!Array.isArray(raw) ? key : NaN));
    const rawLevel = typeof building === 'number' ? building : building?.level;
    const level = rawLevel == null ? NaN : Number(rawLevel);
    if (!(DRILL_GROUND_BUILDING_IDS as readonly number[]).includes(id)) continue;
    if (!Number.isInteger(level) || level < 0) return null;
    confirmed.set(id, level);
  }
  let limit = 0;
  for (const id of DRILL_GROUND_BUILDING_IDS) {
    const level = confirmed.get(id) ?? 0;
    const value = DRILL_GROUND_LIMIT_BY_LEVEL[level];
    if (value == null) return null; // Never extrapolate unsupported building levels.
    limit += value;
  }
  return limit;
}
