/**
 * Helper utilities for Hero Artifacts leveling, costs, and resource milestones.
 * In Hero Wars Alliance:
 * - 3 artifact slots (0-indexed in game RPC): Slot 0 (Weapon), Slot 1 (Book), Slot 2 (Ring).
 * - Maximum Level: 100.
 * - Resource Tiers & Transitions (milestones):
 *   - Lvl 1 - 25: White tier (Milestone 25)
 *     Weapon: 29 (Artifact Essence), Book: 34 (Artifact Scroll), Ring: 39 (Artifact Metal)
 *   - Lvl 26 - 50: Green tier (Milestone 50)
 *     Weapon: 30 (Greater Essence), Book: 35 (Greater Scroll), Ring: 40 (Greater Metal)
 *   - Lvl 51 - 70: Blue tier (Milestone 70)
 *     Weapon: 31 (Rare Essence), Book: 36 (Rare Scroll), Ring: 41 (Rare Metal)
 *   - Lvl 71 - 85: Purple tier (Milestone 85)
 *     Weapon: 32 (Flawless Essence), Book: 37 (Flawless Scroll), Ring: 42 (Flawless Metal)
 *   - Lvl 86 - 100: Orange tier (Milestone 100)
 *     Weapon: 33 (Radiant Essence), Book: 38 (Radiant Scroll), Ring: 43 (Radiant Metal)
 */

export type ArtifactSlotType = 'weapon' | 'book' | 'ring';
export type ArtifactTierColor = 'white' | 'green' | 'blue' | 'purple' | 'orange';

export interface ArtifactResourceInfo {
  consumableId: number;
  resourceName: string;
  shortName: string;
  tierColor: ArtifactTierColor;
  nextMilestone: number;
  icon: string;
}

export interface ArtifactUpgradePlan {
  slotId: number;
  artifactType: ArtifactSlotType;
  currentLevel: number;
  targetLevel: number;
  levelsDelta: number;
  costForNextOne: number;
  totalCost: number;
  canUpgradeOne: boolean;
  canUpgradeMilestone: boolean;
  affordableLevels: number;
  affordableCost: number;
  consumableId: number;
  resourceName: string;
  shortName: string;
  ownedAmount: number;
  tierColor: ArtifactTierColor;
  isMax: boolean;
}

export const ARTIFACT_MILESTONES = [25, 50, 70, 85, 100] as const;

export function getArtifactSlotId(slotOrType: number | string): number {
  if (slotOrType === 0 || slotOrType === '0' || slotOrType === 'weapon') return 0;
  if (slotOrType === 1 || slotOrType === '1' || slotOrType === 'book') return 1;
  if (slotOrType === 2 || slotOrType === '2' || slotOrType === 'ring' || slotOrType === 3 || slotOrType === '3') return 2;
  return 0;
}

export function getArtifactSlotType(slotOrType: number | string): ArtifactSlotType {
  const id = getArtifactSlotId(slotOrType);
  if (id === 0) return 'weapon';
  if (id === 1) return 'book';
  return 'ring';
}

export function getArtifactNextMilestone(currentLevel: number): number {
  if (currentLevel < 25) return 25;
  if (currentLevel < 50) return 50;
  if (currentLevel < 70) return 70;
  if (currentLevel < 85) return 85;
  return 100;
}

/**
 * Calculate the cost to level up an artifact from `currentLevel` to `currentLevel + 1`.
 */
export function getArtifactLevelUpCost(currentLevel: number): number {
  if (currentLevel >= 100 || currentLevel < 1) return 0;
  const target = currentLevel + 1;
  if (target <= 25) {
    return 2 * target - 1;
  }
  if (target <= 50) {
    return 30 + (target - 26);
  }
  if (target <= 70) {
    return 30 + (target - 51);
  }
  if (target <= 85) {
    return 30 + (target - 71);
  }
  if (target <= 100) {
    return 30 + (target - 86);
  }
  return 0;
}

const RESOURCE_MAP: Record<
  ArtifactSlotType,
  Record<
    ArtifactTierColor,
    { id: number; name: string; short: string; icon: string }
  >
> = {
  weapon: {
    white: { id: 29, name: 'Gray Artifact Essence', short: 'Essence', icon: 'essence_01.png' },
    green: { id: 30, name: 'Green Artifact Essence', short: 'Essence', icon: 'essence_02.png' },
    blue: { id: 31, name: 'Blue Artifact Essence', short: 'Essence', icon: 'essence_03.png' },
    purple: { id: 32, name: 'Violet Artifact Essence', short: 'Essence', icon: 'essence_04.png' },
    orange: { id: 33, name: 'Orange Artifact Essence', short: 'Essence', icon: 'essence_05.png' }
  },
  book: {
    white: { id: 34, name: 'Gray Artifact Scroll', short: 'Scroll', icon: 'roll_01.png' },
    green: { id: 35, name: 'Green Artifact Scroll', short: 'Scroll', icon: 'roll_02.png' },
    blue: { id: 36, name: 'Blue Artifact Scroll', short: 'Scroll', icon: 'roll_03.png' },
    purple: { id: 37, name: 'Violet Artifact Scroll', short: 'Scroll', icon: 'roll_04.png' },
    orange: { id: 38, name: 'Orange Artifact Scroll', short: 'Scroll', icon: 'roll_05.png' }
  },
  ring: {
    white: { id: 39, name: 'Gray Artifact Metal', short: 'Metal', icon: 'metall_01.png' },
    green: { id: 40, name: 'Green Artifact Metal', short: 'Metal', icon: 'metall_02.png' },
    blue: { id: 41, name: 'Blue Artifact Metal', short: 'Metal', icon: 'metall_03.png' },
    purple: { id: 42, name: 'Violet Artifact Metal', short: 'Metal', icon: 'metall_04.png' },
    orange: { id: 43, name: 'Orange Artifact Metal', short: 'Metal', icon: 'metall_05.png' }
  }
};

export function getArtifactTierColor(level: number): ArtifactTierColor {
  if (level <= 25) return 'white';
  if (level <= 50) return 'green';
  if (level <= 70) return 'blue';
  if (level <= 85) return 'purple';
  return 'orange';
}

/**
 * Get resource information for upgrading from `currentLevel` to next level/milestone.
 */
export function getArtifactResourceInfo(
  slotOrType: number | string,
  currentLevel: number
): ArtifactResourceInfo {
  const type = getArtifactSlotType(slotOrType);
  // Resource to use is based on the target level (currentLevel + 1)
  const targetForRes = Math.min(100, Math.max(1, currentLevel < 100 ? currentLevel + 1 : currentLevel));
  const tierColor = getArtifactTierColor(targetForRes);
  const nextMilestone = getArtifactNextMilestone(currentLevel);
  const res = RESOURCE_MAP[type][tierColor];

  return {
    consumableId: res.id,
    resourceName: res.name,
    shortName: res.short,
    tierColor,
    nextMilestone,
    icon: res.icon
  };
}

/**
 * Compute the complete upgrade plan including +1 and +## up to next resource milestone.
 */
export function getArtifactUpgradePlan(
  slotOrType: number | string,
  currentLevel: number,
  inventoryConsumables: Record<string | number, number> = {}
): ArtifactUpgradePlan {
  const slotId = getArtifactSlotId(slotOrType);
  const artifactType = getArtifactSlotType(slotOrType);
  const lvl = Math.max(1, Math.min(100, Number(currentLevel) || 1));
  const isMax = lvl >= 100;

  const resInfo = getArtifactResourceInfo(artifactType, lvl);
  const ownedAmount = Number(inventoryConsumables[resInfo.consumableId]) || 0;

  if (isMax) {
    return {
      slotId,
      artifactType,
      currentLevel: 100,
      targetLevel: 100,
      levelsDelta: 0,
      costForNextOne: 0,
      totalCost: 0,
      canUpgradeOne: false,
      canUpgradeMilestone: false,
      affordableLevels: 0,
      affordableCost: 0,
      consumableId: resInfo.consumableId,
      resourceName: resInfo.resourceName,
      shortName: resInfo.shortName,
      ownedAmount,
      tierColor: resInfo.tierColor,
      isMax: true
    };
  }

  const targetLevel = resInfo.nextMilestone;
  const levelsDelta = Math.max(1, targetLevel - lvl);
  const costForNextOne = getArtifactLevelUpCost(lvl);

  let totalCost = 0;
  for (let l = lvl; l < targetLevel; l++) {
    totalCost += getArtifactLevelUpCost(l);
  }

  // Calculate how many levels can be afforded within this milestone
  let affordableLevels = 0;
  let affordableCost = 0;
  let runningCost = 0;

  for (let l = lvl; l < targetLevel; l++) {
    const nextCost = getArtifactLevelUpCost(l);
    if (runningCost + nextCost <= ownedAmount) {
      runningCost += nextCost;
      affordableLevels++;
      affordableCost = runningCost;
    } else {
      break;
    }
  }

  const canUpgradeOne = ownedAmount >= costForNextOne;
  const canUpgradeMilestone = affordableLevels > 0;

  return {
    slotId,
    artifactType,
    currentLevel: lvl,
    targetLevel,
    levelsDelta,
    costForNextOne,
    totalCost,
    canUpgradeOne,
    canUpgradeMilestone,
    affordableLevels,
    affordableCost,
    consumableId: resInfo.consumableId,
    resourceName: resInfo.resourceName,
    shortName: resInfo.shortName,
    ownedAmount,
    tierColor: resInfo.tierColor,
    isMax: false
  };
}
