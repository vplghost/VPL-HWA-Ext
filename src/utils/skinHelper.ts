import { heroGlyphs, skinStats, getHeroMetadata } from '../data/heroMetadata.ts';
import { nameData } from '../data/nameData.ts';

export type HeroMainStat = 'strength' | 'agility' | 'intelligence';
export type SkinType = 'default' | 'champion' | 'winter' | 'other';

export interface SkinStoneInfo {
  coinId: number;
  name: string;
  shortName: string;
  mainStat: HeroMainStat;
  choiceIndex: number;
  icon: string;
  colorClass: string;
}

export interface ChestPlanItem {
  libId: number;
  name: string;
  amount: number;
  choiceIndex: number;
  yieldPerChest: number;
}

export interface SkinSubPlan {
  canAfford: boolean;
  cost: number;
  openChests: ChestPlanItem[];
  totalChestsToOpen: number;
  openLargeCount: number;
  openSmallCount: number;
  choiceIndex: number;
}

export interface SkinUpgradePlan {
  targetSingle: number;
  costSingle: number;
  costOne: number;
  canUpgradeOneDirect: boolean;
  canUpgradeOneWithChests: boolean;
  chestsForOne: number;
  openChestsPlanOne: ChestPlanItem[];
  singlePlan: SkinSubPlan;

  targetNextTen: number;
  deltaNextTen: number;
  costNextTen: number;
  canUpgradeNextTenDirect: boolean;
  canUpgradeNextTenWithChests: boolean;
  chestsForNextTen: number;
  openChestsPlanNextTen: ChestPlanItem[];
  nextTenPlan: SkinSubPlan;

  targetNextTenPlus10: number;
  deltaNextTenPlus10: number;
  costNextTenPlus10: number;
  canUpgradeNextTenPlus10Direct: boolean;
  canUpgradeNextTenPlus10WithChests: boolean;
  chestsForNextTenPlus10: number;
  openChestsPlanNextTenPlus10: ChestPlanItem[];
  nextTenPlus10Plan: SkinSubPlan;

  isMax: boolean;
}

export interface HeroSkinItem {
  id: number;
  skinId: number;
  name: string;
  level: number;
  maxLevel: number;
  statKey: string;
  statLabel: string;
  isCurrent: boolean;
  isDefault: boolean;
  skinType: SkinType;
  plan: SkinUpgradePlan;
}

export type HeroSkinDetailedItem = HeroSkinItem;

export const STAT_LABELS: Record<string, string> = {
  PA: 'Physical Attack',
  MA: 'Magic Attack',
  Arm: 'Armor',
  MD: 'Magic Defense',
  HP: 'Health',
  Crit: 'Crit Hit Chance',
  MCrit: 'Magic Crit Chance',
  Ddg: 'Dodge',
  AP: 'Armor Penetration',
  MP: 'Magic Penetration',
  MAIN: 'Main Stat',
  Str: 'Strength',
  Agi: 'Agility',
  Int: 'Intelligence',
};

// Bracketed costs for skins in Hero Wars Alliance:
// Default Skins: 30,825 total to level 60
export const DEFAULT_SKIN_COSTS_BY_BRACKET: [number, number][] = [
  [5, 35],
  [10, 55],
  [15, 130],
  [20, 150],
  [25, 345],
  [30, 395],
  [35, 525],
  [40, 580],
  [45, 700],
  [50, 850],
  [55, 1050],
  [60, 1350],
];

// Other / Secondary Skins: 55,410 total (5000 unlock + 50,410 upgrades)
export const OTHER_SKIN_COSTS_BY_BRACKET: [number, number][] = [
  [5, 65],
  [10, 105],
  [15, 255],
  [20, 300],
  [25, 700],
  [30, 790],
  [35, 1050],
  [40, 1160],
  [45, 1270],
  [50, 1370],
  [55, 1460],
  [60, 1570],
];

// Champion Skins: 54,330 total
export const CHAMPION_SKIN_COSTS_BY_BRACKET: [number, number][] = [
  [5, 70],
  [10, 115],
  [15, 275],
  [20, 320],
  [25, 750],
  [30, 850],
  [35, 1140],
  [40, 1250],
  [45, 1370],
  [50, 1475],
  [55, 1575],
  [60, 1690],
];

// Winter Skins: 53,412 total
export const WINTER_SKIN_COSTS_BY_BRACKET: [number, number][] = [
  [5, 78],
  [10, 91],
  [15, 282],
  [20, 323],
  [25, 732],
  [30, 837],
  [35, 1108],
  [40, 1235],
  [45, 1330],
  [50, 1447],
  [55, 1559],
  [60, 1676],
];

/**
 * Returns the stone cost to upgrade a skin from currentLevel to currentLevel + 1.
 */
export function getSkinUpgradeCost(currentLevel: number, skinType: SkinType = 'other'): number {
  if (currentLevel >= 60 || currentLevel < 0) return 0;
  const target = currentLevel + 1;
  const table =
    skinType === 'default'
      ? DEFAULT_SKIN_COSTS_BY_BRACKET
      : skinType === 'champion'
      ? CHAMPION_SKIN_COSTS_BY_BRACKET
      : skinType === 'winter'
      ? WINTER_SKIN_COSTS_BY_BRACKET
      : OTHER_SKIN_COSTS_BY_BRACKET;

  for (const [maxLvl, cost] of table) {
    if (target <= maxLvl) return cost;
  }
  return table[table.length - 1][1];
}

/**
 * Returns the cumulative stone cost to upgrade a skin from fromLevel to toLevel.
 */
export function getSkinRangeCost(fromLevel: number, toLevel: number, skinType: SkinType = 'other'): number {
  if (fromLevel >= toLevel || fromLevel >= 60) return 0;
  const end = Math.min(60, toLevel);
  let total = 0;
  for (let l = fromLevel; l < end; l++) {
    total += getSkinUpgradeCost(l, skinType);
  }
  return total;
}

/**
 * Returns the next multiple of 10 milestone (10, 20, 30, 40, 50, 60).
 * E.g.: level 1 -> 10, level 10 -> 20, level 14 -> 20, level 20 -> 30, etc.
 */
export function getNextTenMilestone(currentLevel: number): number {
  if (currentLevel >= 60) return 60;
  return Math.min(60, Math.floor(currentLevel / 10) * 10 + 10);
}

/**
 * Returns the subsequent multiple of 10 milestone (e.g. if nextTen is 20, returns 30).
 */
export function getNextTenPlus10Milestone(currentLevel: number): number {
  const nextTen = getNextTenMilestone(currentLevel);
  if (nextTen >= 60) return 60;
  return Math.min(60, nextTen + 10);
}

/**
 * Identifies the main stat of a hero based on glyphs or metadata.
 */
export function getHeroMainStat(heroId: number | string): HeroMainStat {
  const meta = getHeroMetadata(heroId);
  const glyphs = heroGlyphs[String(heroId)] || heroGlyphs[Number(heroId)];
  const rawGlyph = glyphs?.[4];
  if (rawGlyph === 'Str') return 'strength';
  if (rawGlyph === 'Agi') return 'agility';
  if (rawGlyph === 'Int') return 'intelligence';

  if (meta?.role === 'Tank' || meta?.class === 'Warrior') return 'strength';
  if (meta?.class === 'Marksman') return 'agility';
  return 'intelligence';
}

/**
 * Resolves the skin stone metadata for a given hero primary stat.
 */
export function getSkinStoneInfo(mainStat: HeroMainStat): SkinStoneInfo {
  if (mainStat === 'strength') {
    return {
      coinId: 9,
      name: 'Strength Skin Stone',
      shortName: 'Strength Stone',
      mainStat: 'strength',
      choiceIndex: 1,
      icon: 'assets/items/coin/9.png',
      colorClass: 'text-rose-600 dark:text-rose-400',
    };
  }
  if (mainStat === 'agility') {
    return {
      coinId: 10,
      name: 'Agility Skin Stone',
      shortName: 'Agility Stone',
      mainStat: 'agility',
      choiceIndex: 2,
      icon: 'assets/items/coin/10.png',
      colorClass: 'text-sky-600 dark:text-sky-400',
    };
  }
  return {
    coinId: 8,
    name: 'Intelligence Skin Stone',
    shortName: 'Intelligence Stone',
    mainStat: 'intelligence',
    choiceIndex: 0,
    icon: 'assets/items/coin/8.png',
    colorClass: 'text-purple-600 dark:text-purple-400',
  };
}

/**
 * Builds an optimal chest-opening plan to bridge a skin stone deficit.
 * Large Skin Stone Chest (65) yields 150 stones, Skin Stone Chest (51) yields 10 stones.
 */
export function buildChestOpenPlan(
  neededStones: number,
  choiceIndex: number,
  largeChests: number,
  smallChests: number
): { plan: ChestPlanItem[]; canFulfill: boolean; totalYield: number } {
  if (neededStones <= 0) return { plan: [], canFulfill: true, totalYield: 0 };
  const plan: ChestPlanItem[] = [];
  let remaining = neededStones;

  // 1. Large Skin Stone Chests (libId: 65, yields 150)
  if (largeChests > 0 && remaining > 0) {
    const needChests = Math.ceil(remaining / 150);
    const useLarge = Math.min(largeChests, needChests);
    plan.push({
      libId: 65,
      name: 'Large Skin Stone Chest',
      amount: useLarge,
      choiceIndex,
      yieldPerChest: 150,
    });
    remaining = Math.max(0, remaining - useLarge * 150);
  }

  // 2. Small Skin Stone Chests (libId: 51, yields 10)
  if (smallChests > 0 && remaining > 0) {
    const needChests = Math.ceil(remaining / 10);
    const useSmall = Math.min(smallChests, needChests);
    plan.push({
      libId: 51,
      name: 'Skin Stone Chest',
      amount: useSmall,
      choiceIndex,
      yieldPerChest: 10,
    });
    remaining = Math.max(0, remaining - useSmall * 10);
  }

  const totalYield = plan.reduce((sum, item) => sum + item.amount * item.yieldPerChest, 0);
  return {
    plan,
    canFulfill: remaining === 0,
    totalYield,
  };
}

/**
 * Resolves the human-readable skin name.
 */
export function getSkinName(skinId: number | string, baseSkinId?: number | string): string {
  const numId = Number(skinId);
  if (baseSkinId != null && numId === Number(baseSkinId)) {
    return 'Default Skin';
  }
  const customName = (nameData as any)?.names?.skin?.[String(numId)];
  if (customName) return customName;

  const stat = skinStats[String(numId)];
  if (stat) {
    const label = STAT_LABELS[stat] || stat;
    return `${label} Skin`;
  }
  return `Skin #${numId}`;
}

/**
 * Generates the full detailed list of skins with upgrade plans and chest calculations for a hero.
 */
export function getHeroSkinsDetailed(
  heroId: number | string,
  heroData: any,
  inventoryCoins: Record<string | number, number> = {},
  inventoryConsumables: Record<string | number, number> = {}
): HeroSkinItem[] {
  if (!heroData) return [];
  const mainStat = getHeroMainStat(heroId);
  const stoneInfo = getSkinStoneInfo(mainStat);
  const ownedStones = Number(inventoryCoins[stoneInfo.coinId] || inventoryCoins[String(stoneInfo.coinId)]) || 0;
  const largeChests = Number(inventoryConsumables[65] || inventoryConsumables['65']) || 0;
  const smallChests = Number(inventoryConsumables[51] || inventoryConsumables['51']) || 0;

  const skinsObj = heroData.skins || {};
  const baseSkinId = heroData.baseSkinId ?? Number(heroId);
  const currentSkinId = Number(heroData.currentSkin) || baseSkinId;

  const entries = Object.entries(skinsObj)
    .map(([idStr, lvl]) => ({
      skinId: Number(idStr),
      level: Number(lvl) || 1,
    }))
    .sort((a, b) => a.skinId - b.skinId);

  return entries.map(({ skinId, level }) => {
    const isDefault = skinId === Number(baseSkinId) || (baseSkinId == null && skinId === Number(heroId));
    let skinType: SkinType = isDefault ? 'default' : 'other';
    const name = getSkinName(skinId, baseSkinId);
    if (/champion/i.test(name)) skinType = 'champion';
    else if (/winter/i.test(name)) skinType = 'winter';

    const statKey = skinStats[String(skinId)] || (isDefault ? (mainStat === 'strength' ? 'Str' : mainStat === 'agility' ? 'Agi' : 'Int') : 'Skin');
    const statLabel = STAT_LABELS[statKey] || statKey;
    const isCurrent = skinId === currentSkinId;
    const isMax = level >= 60;

    // Plan for +1
    const costOne = isMax ? 0 : getSkinUpgradeCost(level, skinType);
    const canUpgradeOneDirect = !isMax && ownedStones >= costOne;
    const deficitOne = Math.max(0, costOne - ownedStones);
    const chestPlanOne = isMax ? { plan: [], canFulfill: false, totalYield: 0 } : buildChestOpenPlan(deficitOne, stoneInfo.choiceIndex, largeChests, smallChests);
    const canUpgradeOneWithChests = !isMax && (canUpgradeOneDirect || chestPlanOne.canFulfill);
    const chestsForOne = chestPlanOne.plan.reduce((s, p) => s + p.amount, 0);

    // Plan for nextTen (e.g. -> 10, -> 20, -> 30, -> 40, -> 50, -> 60)
    const targetNextTen = getNextTenMilestone(level);
    const deltaNextTen = Math.max(0, targetNextTen - level);
    const costNextTen = isMax || deltaNextTen === 0 ? 0 : getSkinRangeCost(level, targetNextTen, skinType);
    const canUpgradeNextTenDirect = !isMax && deltaNextTen > 0 && ownedStones >= costNextTen;
    const deficitNextTen = Math.max(0, costNextTen - ownedStones);
    const chestPlanNextTen = isMax || deltaNextTen === 0 ? { plan: [], canFulfill: false, totalYield: 0 } : buildChestOpenPlan(deficitNextTen, stoneInfo.choiceIndex, largeChests, smallChests);
    const canUpgradeNextTenWithChests = !isMax && deltaNextTen > 0 && (canUpgradeNextTenDirect || chestPlanNextTen.canFulfill);
    const chestsForNextTen = chestPlanNextTen.plan.reduce((s, p) => s + p.amount, 0);

    // Plan for nextTenPlus10 (e.g. next +10 milestone if targetNextTen < 60)
    const targetNextTenPlus10 = getNextTenPlus10Milestone(level);
    const deltaNextTenPlus10 = Math.max(0, targetNextTenPlus10 - level);
    const costNextTenPlus10 = isMax || deltaNextTenPlus10 === deltaNextTen ? 0 : getSkinRangeCost(level, targetNextTenPlus10, skinType);
    const canUpgradeNextTenPlus10Direct = !isMax && deltaNextTenPlus10 > deltaNextTen && ownedStones >= costNextTenPlus10;
    const deficitNextTenPlus10 = Math.max(0, costNextTenPlus10 - ownedStones);
    const chestPlanNextTenPlus10 = isMax || deltaNextTenPlus10 === deltaNextTen ? { plan: [], canFulfill: false, totalYield: 0 } : buildChestOpenPlan(deficitNextTenPlus10, stoneInfo.choiceIndex, largeChests, smallChests);
    const canUpgradeNextTenPlus10WithChests = !isMax && deltaNextTenPlus10 > deltaNextTen && (canUpgradeNextTenPlus10Direct || chestPlanNextTenPlus10.canFulfill);
    const chestsForNextTenPlus10 = chestPlanNextTenPlus10.plan.reduce((s, p) => s + p.amount, 0);

    const targetSingle = isMax ? level : level + 1;
    const costSingle = costOne;

    const largeOne = chestPlanOne.plan.filter(p => p.libId === 65).reduce((s, p) => s + p.amount, 0);
    const smallOne = chestPlanOne.plan.filter(p => p.libId === 51).reduce((s, p) => s + p.amount, 0);
    const singlePlan: SkinSubPlan = {
      canAfford: canUpgradeOneWithChests,
      cost: costOne,
      openChests: chestPlanOne.plan,
      totalChestsToOpen: chestsForOne,
      openLargeCount: largeOne,
      openSmallCount: smallOne,
      choiceIndex: stoneInfo.choiceIndex,
    };

    const largeNextTen = chestPlanNextTen.plan.filter(p => p.libId === 65).reduce((s, p) => s + p.amount, 0);
    const smallNextTen = chestPlanNextTen.plan.filter(p => p.libId === 51).reduce((s, p) => s + p.amount, 0);
    const nextTenPlan: SkinSubPlan = {
      canAfford: canUpgradeNextTenWithChests,
      cost: costNextTen,
      openChests: chestPlanNextTen.plan,
      totalChestsToOpen: chestsForNextTen,
      openLargeCount: largeNextTen,
      openSmallCount: smallNextTen,
      choiceIndex: stoneInfo.choiceIndex,
    };

    const largeNextTenPlus10 = chestPlanNextTenPlus10.plan.filter(p => p.libId === 65).reduce((s, p) => s + p.amount, 0);
    const smallNextTenPlus10 = chestPlanNextTenPlus10.plan.filter(p => p.libId === 51).reduce((s, p) => s + p.amount, 0);
    const nextTenPlus10Plan: SkinSubPlan = {
      canAfford: canUpgradeNextTenPlus10WithChests,
      cost: costNextTenPlus10,
      openChests: chestPlanNextTenPlus10.plan,
      totalChestsToOpen: chestsForNextTenPlus10,
      openLargeCount: largeNextTenPlus10,
      openSmallCount: smallNextTenPlus10,
      choiceIndex: stoneInfo.choiceIndex,
    };

    return {
      id: skinId,
      skinId,
      name,
      level,
      maxLevel: 60,
      statKey,
      statLabel,
      isCurrent,
      isDefault,
      skinType,
      plan: {
        targetSingle,
        costSingle,
        costOne,
        canUpgradeOneDirect,
        canUpgradeOneWithChests,
        chestsForOne,
        openChestsPlanOne: chestPlanOne.plan,
        singlePlan,

        targetNextTen,
        deltaNextTen,
        costNextTen,
        canUpgradeNextTenDirect,
        canUpgradeNextTenWithChests,
        chestsForNextTen,
        openChestsPlanNextTen: chestPlanNextTen.plan,
        nextTenPlan,

        targetNextTenPlus10,
        deltaNextTenPlus10,
        costNextTenPlus10,
        canUpgradeNextTenPlus10Direct,
        canUpgradeNextTenPlus10WithChests,
        chestsForNextTenPlus10,
        openChestsPlanNextTenPlus10: chestPlanNextTenPlus10.plan,
        nextTenPlus10Plan,

        isMax,
      },
    };
  });
}
