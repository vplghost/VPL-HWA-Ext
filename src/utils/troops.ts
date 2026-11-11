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

export const CAMP_EXPANSION_RESEARCH_IDS = [3, 50, 59, 81, 90, 115, 125, 149, 158, 180, 189, 214, 224, 492];

export function calculateTroopMax(
  type: number,
  cache: any,
  currentTotal = 0
): number {
  const campId = CAMP_BUILDING_IDS[type];
  const buildings = normalizeArray(
    cache?.buildingStatus?.data?.buildings ||
    cache?.clan_getSummary?.data?.buildings ||
    cache?.['buildingStatus']?.data?.buildings
  );
  const camp = buildings.find((b: any) => Number(b?.buildingId) === campId);
  const campLevel = camp ? Number(camp.level) || 0 : 0;

  // Direct capacity from building object if present
  if (camp && typeof camp.capacity === 'number' && camp.capacity > 0) {
    return Math.max(camp.capacity, currentTotal);
  }

  // Direct limits from unit summary if present
  const unitSummary = cache?.['getUnitSummary:unit']?.data || cache?.getUnitSummary?.data;
  if (unitSummary?.limits && typeof unitSummary.limits[type] === 'number' && unitSummary.limits[type] > 0) {
    return Math.max(unitSummary.limits[type], currentTotal);
  }

  const researches = normalizeArray(
    cache?.researchStatus?.data?.completedResearches ||
    cache?.researchStatus?.data?.researches ||
    cache?.clan_getSummary?.data?.completedResearches ||
    cache?.clan_getSummary?.data?.researches ||
    cache?.['researchStatus']?.data?.completedResearches ||
    cache?.['researchStatus']?.data?.researches
  );

  let expansionBonus = 0;
  for (const r of researches) {
    const rId = Number(r?.researchId);
    if (CAMP_EXPANSION_RESEARCH_IDS.includes(rId)) {
      const lvl = Number(r?.level) || 0;
      expansionBonus += lvl * 500;
    }
  }

  if (campLevel > 0) {
    const baseCapacity = 5000 + (campLevel * 1500) + expansionBonus;
    return Math.max(baseCapacity, currentTotal);
  }

  return Math.max(10000, currentTotal);
}
