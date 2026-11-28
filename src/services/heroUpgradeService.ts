/**
 * Hero Detail Upgrade Service (`heroUpgradeService.ts`).
 *
 * Pure, testable helpers for:
 * - 1-click Hero Star Evolution (`heroEvolve` — verified RPC: `{ heroId }`)
 * - Hero XP Potion inventory & level-up planner (`planHeroXpPotions`, capped to Team Level)
 * - Artifact Star Evolution (`artifact_evolve` — verified RPC: `{ heroId, slotId }`)
 * - Glyphs & Talisman summary extraction
 */

import { HERO_GLYPH_TYPES, GLYPH_TYPE_META, GLYPH_LEVEL_COSTS } from '../data/glyphData.ts';

export const HERO_EVOLVE_GOLD_COST: Record<number, number> = {
  1: 20_000,
  2: 50_000,
  3: 150_000,
  4: 500_000,
  5: 1_500_000,
};

export interface HeroEvolveStatus {
  canEvolve: boolean;
  isMax: boolean;
  currentStar: number;
  targetStar: number;
  goldCost: number;
  hasEnoughSouls: boolean;
  hasEnoughGold: boolean;
  reason?: string;
}

export function getHeroEvolveStatus(params: {
  star: number;
  soulOwned: number;
  soulNeeded: number | 'Max' | null | undefined;
  userGold?: number | null;
}): HeroEvolveStatus {
  const currentStar = Math.max(1, Math.min(6, Math.floor(Number(params.star) || 1)));
  if (currentStar >= 6 || params.soulNeeded === 'Max') {
    return {
      canEvolve: false,
      isMax: true,
      currentStar: 6,
      targetStar: 6,
      goldCost: 0,
      hasEnoughSouls: true,
      hasEnoughGold: true,
      reason: 'Maximum Evolution (6★)',
    };
  }

  const targetStar = currentStar + 1;
  const goldCost = HERO_EVOLVE_GOLD_COST[currentStar] ?? 0;
  const needed = Number(params.soulNeeded) || 0;
  const owned = Number(params.soulOwned) || 0;
  const hasEnoughSouls = needed > 0 && owned >= needed;
  const goldKnown = params.userGold !== null && params.userGold !== undefined && Number.isFinite(Number(params.userGold));
  const hasEnoughGold = !goldKnown || Number(params.userGold) >= goldCost;

  let reason: string | undefined;
  if (!hasEnoughSouls) {
    reason = `Need ${Math.max(0, needed - owned)} more Soul Stones`;
  } else if (!hasEnoughGold) {
    reason = `Need ${goldCost.toLocaleString('en-US')} Gold`;
  }

  return {
    canEvolve: hasEnoughSouls && hasEnoughGold,
    isMax: false,
    currentStar,
    targetStar,
    goldCost,
    hasEnoughSouls,
    hasEnoughGold,
    reason,
  };
}

export const HERO_RESOURCE_IDS = {
  RUNE_STONE_COIN_ID: '40077',
  RUNE_SPHERE_COIN_ID: '40078',
  SPARK_OF_POWER_CONSUMABLE_ID: '24',
} as const;

export interface XpPotionDef {
  id: string;
  libId: number;
  name: string;
  xp: number;
}

/**
 * Verified EXP Potion consumable IDs & XP values from live `inventory_use` RPCs:
 * - libId 9:  Tiny EXP Potion  = 50 XP
 * - libId 10: Small EXP Potion = 300 XP
 * - libId 11: Big EXP Potion   = 1,500 XP
 * - libId 12: Huge EXP Potion  = 7,500 XP
 */
export const HERO_XP_POTIONS: XpPotionDef[] = [
  { id: '12', libId: 12, name: 'Huge EXP Potion', xp: 7500 },
  { id: '11', libId: 11, name: 'Big EXP Potion', xp: 1500 },
  { id: '10', libId: 10, name: 'Small EXP Potion', xp: 300 },
  { id: '9', libId: 9, name: 'Tiny EXP Potion', xp: 50 },
];

export interface XpPotionPlan {
  currentLevel: number;
  targetLevel: number;
  teamLevelCap: number;
  levelsToGain: number;
  xpNeeded: number;
  totalAvailableXp: number;
  canReachTarget: boolean;
  potionsToUse: Array<{ id: string; name: string; count: number; xpEach: number }>;
  totalPotionsCount: number;
}

/**
 * Estimates cumulative XP required to advance from `fromLevel` to `toLevel`.
 * Uses a smooth HWA-aligned quadratic curve (Lv 1->2 ~ 60 XP, Lv 60->61 ~ 12k XP, Lv 119->120 ~ 48k XP).
 */
export function estimateXpForLevelRange(fromLevel: number, toLevel: number): number {
  const start = Math.max(1, Math.floor(fromLevel));
  const end = Math.min(120, Math.floor(toLevel));
  if (end <= start) return 0;
  let total = 0;
  for (let lv = start; lv < end; lv++) {
    total += Math.round(50 + lv * lv * 3.4);
  }
  return total;
}

export function getHeroXpPotionInventory(consumables: Record<string, any> | null | undefined) {
  const map = consumables && typeof consumables === 'object' ? consumables : {};
  let totalAvailableXp = 0;
  let totalPotions = 0;
  const counts: Record<string, number> = {};
  for (const def of HERO_XP_POTIONS) {
    const qty = Math.max(0, Math.floor(Number(map[def.id] ?? 0) || 0));
    counts[def.id] = qty;
    totalPotions += qty;
    totalAvailableXp += qty * def.xp;
  }
  return { counts, totalPotions, totalAvailableXp };
}

/**
 * Plans an optimal XP Potion combination (Huge -> Big -> Small -> Tiny) to reach
 * `requestedTargetLevel`, strictly clamped to `teamLevelCap` and Lv. 120.
 */
export function planHeroXpPotions(
  currentLevel: number,
  requestedTargetLevel: number,
  teamLevelCap: number,
  consumables: Record<string, any> | null | undefined
): XpPotionPlan {
  const cur = Math.max(1, Math.min(120, Math.floor(Number(currentLevel) || 1)));
  const cap = Math.max(cur, Math.min(120, Math.floor(Number(teamLevelCap) || 120)));
  const target = Math.max(cur, Math.min(cap, Math.floor(Number(requestedTargetLevel) || cur)));
  const levelsToGain = Math.max(0, target - cur);
  const xpNeeded = estimateXpForLevelRange(cur, target);
  const inv = getHeroXpPotionInventory(consumables);

  if (levelsToGain === 0 || xpNeeded === 0) {
    return {
      currentLevel: cur,
      targetLevel: cur,
      teamLevelCap: cap,
      levelsToGain: 0,
      xpNeeded: 0,
      totalAvailableXp: inv.totalAvailableXp,
      canReachTarget: true,
      potionsToUse: [],
      totalPotionsCount: 0,
    };
  }

  let remainingXp = xpNeeded;
  const potionsToUse: Array<{ id: string; name: string; count: number; xpEach: number }> = [];

  for (const def of HERO_XP_POTIONS) {
    const owned = inv.counts[def.id] || 0;
    if (owned <= 0 || remainingXp <= 0) continue;
    const take = Math.min(owned, Math.floor(remainingXp / def.xp));
    if (take > 0) {
      potionsToUse.push({ id: def.id, name: def.name, count: take, xpEach: def.xp });
      remainingXp -= take * def.xp;
    }
  }

  // Top up remainder with smallest available potion to minimize XP waste
  if (remainingXp > 0) {
    for (let i = HERO_XP_POTIONS.length - 1; i >= 0 && remainingXp > 0; i--) {
      const def = HERO_XP_POTIONS[i]!;
      const alreadyUsed = potionsToUse.find((p) => p.id === def.id)?.count || 0;
      const left = (inv.counts[def.id] || 0) - alreadyUsed;
      if (left <= 0) continue;
      const take = Math.min(left, Math.ceil(remainingXp / def.xp));
      if (take > 0) {
        const existing = potionsToUse.find((p) => p.id === def.id);
        if (existing) existing.count += take;
        else potionsToUse.push({ id: def.id, name: def.name, count: take, xpEach: def.xp });
        remainingXp -= take * def.xp;
      }
    }
  }

  const totalPotionsCount = potionsToUse.reduce((s, p) => s + p.count, 0);
  return {
    currentLevel: cur,
    targetLevel: target,
    teamLevelCap: cap,
    levelsToGain,
    xpNeeded,
    totalAvailableXp: inv.totalAvailableXp,
    canReachTarget: remainingXp <= 0,
    potionsToUse,
    totalPotionsCount,
  };
}

export const ARTIFACT_EVOLVE_FRAGMENTS: Record<number, number> = {
  1: 5,
  2: 15,
  3: 30,
  4: 50,
  5: 150,
};

export interface ArtifactEvolveStatus {
  canEvolve: boolean;
  isMax: boolean;
  targetStar: number;
  fragmentsOwned: number;
  fragmentsNeeded: number;
}

export function getArtifactEvolveStatus(
  star: number,
  fragmentsOwned: number
): ArtifactEvolveStatus {
  const s = Math.max(1, Math.min(6, Math.floor(Number(star) || 1)));
  if (s >= 6) {
    return { canEvolve: false, isMax: true, targetStar: 6, fragmentsOwned: Number(fragmentsOwned) || 0, fragmentsNeeded: 0 };
  }
  const needed = ARTIFACT_EVOLVE_FRAGMENTS[s] ?? 150;
  const owned = Math.max(0, Math.floor(Number(fragmentsOwned) || 0));
  return {
    canEvolve: owned >= needed,
    isMax: false,
    targetStar: s + 1,
    fragmentsOwned: owned,
    fragmentsNeeded: needed,
  };
}

export interface GlyphUpgradeCost {
  steps: number;
  runeStones: number;
  runeSpheres: number;
  requiredHeroLevel: number;
}

export interface HeroGlyphItem {
  tier: number;
  slot: number;
  runeTypeId: number | null;
  statLabel: string;
  statAbbr: string;
  statIcon: string;
  currentValue: number;
  nextValue: number;
  level: number;
  maxLevel: number;
  isMax: boolean;
  cost1: GlyphUpgradeCost;
  cost5: GlyphUpgradeCost;
  steps5Count: number;
  maxAffordableSteps: number;
  canUpgrade1: boolean;
  canUpgrade5: boolean;
}

export function computeGlyphUpgradeCost(
  currentLevel: number,
  steps: number,
  maxLevel = 40
): GlyphUpgradeCost {
  const start = Math.max(0, Math.floor(Number(currentLevel) || 0));
  const cap = Math.max(start, Math.floor(Number(maxLevel) || 40));
  const actualSteps = Math.max(0, Math.min(Math.floor(Number(steps) || 0), cap - start));
  let runeStones = 0;
  let runeSpheres = 0;
  let requiredHeroLevel = 1;
  for (let i = 1; i <= actualSteps; i++) {
    const lv = start + i;
    const entry = GLYPH_LEVEL_COSTS[lv];
    if (entry) {
      runeStones += entry.runeStones;
      runeSpheres += entry.runeSpheres;
      if (entry.heroLevel > requiredHeroLevel) requiredHeroLevel = entry.heroLevel;
    }
  }
  return { steps: actualSteps, runeStones, runeSpheres, requiredHeroLevel };
}

export function computeMaxAffordableGlyphSteps(
  currentLevel: number,
  maxLevel: number,
  ownedRuneStones: number,
  ownedRuneSpheres = 0,
  heroLevel?: number | null
): number {
  const start = Math.max(0, Math.floor(Number(currentLevel) || 0));
  const cap = Math.max(start, Math.floor(Number(maxLevel) || 40));
  let remStones = Math.max(0, Math.floor(Number(ownedRuneStones) || 0));
  let remSpheres = Math.max(0, Math.floor(Number(ownedRuneSpheres) || 0));
  const hLv = heroLevel != null && Number.isFinite(Number(heroLevel)) ? Number(heroLevel) : null;
  let count = 0;
  for (let lv = start + 1; lv <= cap; lv++) {
    const entry = GLYPH_LEVEL_COSTS[lv];
    if (!entry) break;
    if (hLv !== null && hLv < entry.heroLevel) break;
    if (remStones < entry.runeStones || remSpheres < entry.runeSpheres) break;
    remStones -= entry.runeStones;
    remSpheres -= entry.runeSpheres;
    count++;
  }
  return count;
}

export interface HeroSparkStatus {
  level: number;
  maxLevel: number;
  isMax: boolean;
  sparksOwned: number;
  canUpgrade: boolean;
}

export function buildXpPotionInventoryUseCalls(
  heroId: number | string,
  plan: XpPotionPlan
): Array<{ name: string; args: { libId: number; amount: number; params: { unitId: number } } }> {
  const unitId = Number(heroId);
  if (!Number.isInteger(unitId) || unitId <= 0 || !plan?.potionsToUse?.length) return [];
  return plan.potionsToUse
    .filter((p) => p.count > 0 && Number(p.id) > 0)
    .map((p) => ({
      name: 'inventory_use',
      args: {
        libId: Number(p.id),
        amount: p.count,
        params: { unitId },
      },
    }));
}

export function getHeroSparkStatus(
  hero: any,
  consumables: Record<string, any> | null | undefined,
  userGold?: number | null
): HeroSparkStatus {
  const maxLevel = 30;
  const level = Math.max(0, Math.min(maxLevel, Math.floor(Number(hero?.titanGiftLevel ?? 0) || 0)));
  const isMax = level >= maxLevel;
  const sparksOwned = Math.max(
    0,
    Math.floor(Number(consumables?.[HERO_RESOURCE_IDS.SPARK_OF_POWER_CONSUMABLE_ID] ?? 0) || 0)
  );
  const goldOk = userGold === null || userGold === undefined || Number(userGold) > 0;
  return {
    level,
    maxLevel,
    isMax,
    sparksOwned,
    canUpgrade: !isMax && sparksOwned > 0 && goldOk,
  };
}

export function extractHeroGlyphsAndTalisman(hero: any, cache: Record<string, any> | null | undefined) {
  const heroId = String(hero?.id ?? '');

  // Primary source: verified `rune_getAll.heroesRunes` (tier 0..4)
  const heroesRunes = cache?.rune_getAll?.data?.heroesRunes;
  const matchedRuneEntry = Array.isArray(heroesRunes)
    ? heroesRunes.find((entry: any) => entry && String(entry.heroId ?? '') === heroId)
    : null;

  const tierLevels = new Map<number, number>();
  if (matchedRuneEntry && Array.isArray(matchedRuneEntry.runes)) {
    for (const r of matchedRuneEntry.runes) {
      const t = Number(r?.tier);
      if (Number.isInteger(t) && t >= 0 && t < 5) {
        tierLevels.set(t, Math.max(0, Math.floor(Number(r?.level ?? 0) || 0)));
      }
    }
  } else {
    // Fallback to hero.runes if rune_getAll has not been captured yet
    const rawRunes = Array.isArray(hero?.runes)
      ? hero.runes
      : (hero?.runes && typeof hero.runes === 'object' ? Object.values(hero.runes) : []);
    for (let i = 0; i < Math.min(5, rawRunes.length); i++) {
      tierLevels.set(i, Math.max(0, Math.floor(Number(rawRunes[i] ?? 0) || 0)));
    }
  }

  const numHeroId = Number(heroId);
  const heroTypes = Number.isInteger(numHeroId) ? HERO_GLYPH_TYPES[numHeroId] : undefined;
  const invCoins = cache?.inventoryGet?.data?.coin || {};
  const ownedRuneStones = Math.max(
    0,
    Math.floor(
      Number(
        cache?.[`resource:coin:${HERO_RESOURCE_IDS.RUNE_STONE_COIN_ID}`]?.data?.amount ??
        invCoins[HERO_RESOURCE_IDS.RUNE_STONE_COIN_ID] ??
        0
      ) || 0
    )
  );
  const ownedRuneSpheres = Math.max(
    0,
    Math.floor(
      Number(
        cache?.[`resource:coin:${HERO_RESOURCE_IDS.RUNE_SPHERE_COIN_ID}`]?.data?.amount ??
        invCoins[HERO_RESOURCE_IDS.RUNE_SPHERE_COIN_ID] ??
        0
      ) || 0
    )
  );
  const heroLevel = Number(hero?.level);
  const effectiveHeroLevel = Number.isFinite(heroLevel) && heroLevel > 0 ? heroLevel : null;

  const glyphs: HeroGlyphItem[] = [];
  if (matchedRuneEntry || tierLevels.size > 0) {
    for (let tier = 0; tier < 5; tier++) {
      const level = tierLevels.get(tier) ?? 0;
      const maxLevel = level > 40 ? 80 : 40;
      const isMax = level >= maxLevel;
      const runeTypeId = heroTypes?.[tier] ?? null;
      const typeMeta = runeTypeId != null ? GLYPH_TYPE_META[runeTypeId] : undefined;
      const currentValue = typeMeta?.values?.[Math.min(level, (typeMeta.values.length || 1) - 1)] ?? 0;
      const nextValue = !isMax
        ? (typeMeta?.values?.[Math.min(level + 1, (typeMeta.values.length || 1) - 1)] ?? currentValue)
        : currentValue;
      const steps5Count = isMax ? 0 : Math.min(5, maxLevel - level);
      const cost1 = computeGlyphUpgradeCost(level, 1, maxLevel);
      const cost5 = computeGlyphUpgradeCost(level, steps5Count, maxLevel);
      const maxAffordableSteps = isMax
        ? 0
        : computeMaxAffordableGlyphSteps(level, maxLevel, ownedRuneStones, ownedRuneSpheres, effectiveHeroLevel);
      glyphs.push({
        tier,
        slot: tier + 1,
        runeTypeId,
        statLabel: typeMeta?.label || `Glyph ${tier + 1}`,
        statAbbr: typeMeta?.abbr || `G${tier + 1}`,
        statIcon: typeMeta?.icon || '✨',
        currentValue,
        nextValue,
        level,
        maxLevel,
        isMax,
        cost1,
        cost5,
        steps5Count,
        maxAffordableSteps,
        canUpgrade1: !isMax && maxAffordableSteps >= 1,
        canUpgrade5: !isMax && steps5Count >= 2 && maxAffordableSteps >= steps5Count,
      });
    }
  }

  const allTalismans = cache?.talisman_getAll?.data;
  const heroTalismans: any[] = [];
  if (allTalismans && typeof allTalismans === 'object') {
    const list = Array.isArray(allTalismans) ? allTalismans : Object.values(allTalismans);
    for (const t of list) {
      if (t && String(t.heroId ?? '') === heroId) {
        heroTalismans.push(t);
      }
    }
  }
  return { glyphs, talismans: heroTalismans };
}
