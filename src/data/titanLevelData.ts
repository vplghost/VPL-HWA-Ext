// Titan level, experience, and evolution thresholds
import { splitlibTitanLevels } from './splitlibTitanLevels.ts';

export const titanEvolutionCosts: Record<number, { fragments: number; gold: number }> = {
  2: { fragments: 50, gold: 75000 },
  3: { fragments: 150, gold: 300000 },
  4: { fragments: 500, gold: 750000 },
  5: { fragments: 900, gold: 1250000 },
  6: { fragments: 1500, gold: 2500000 },
};

/** Cumulative XP required for each Titan level from 1 to 120 (0-indexed: index 0 = lvl 1 = 0 XP) */
export const titanCumulativeExp: number[] = splitlibTitanLevels;

/** Returns XP needed to advance from level to level + 1 */
export function getTitanExpForNextLevel(currentLevel: number): number {
  if (currentLevel < 1 || currentLevel >= 120) return 0;
  const curExp = titanCumulativeExp[currentLevel - 1] ?? 0;
  const nextExp = titanCumulativeExp[currentLevel] ?? curExp;
  return Math.max(0, nextExp - curExp);
}

/** Returns total XP needed to advance from fromLevel to targetLevel */
export function getTitanTotalExpToLevel(fromLevel: number, targetLevel: number): number {
  const start = Math.max(1, Math.min(120, fromLevel));
  const end = Math.max(1, Math.min(120, targetLevel));
  if (end <= start) return 0;
  const startExp = titanCumulativeExp[start - 1] ?? 0;
  const endExp = titanCumulativeExp[end - 1] ?? 0;
  return Math.max(0, endExp - startExp);
}

/** Calculate level and XP progress from cumulative XP */
export function getTitanLevelFromExp(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelExpNeeded: number;
  totalExp: number;
} {
  const xp = Math.max(0, Number(totalXp) || 0);
  let lvl = 1;
  for (let i = 0; i < titanCumulativeExp.length; i++) {
    if (xp >= titanCumulativeExp[i]) {
      lvl = i + 1;
    } else {
      break;
    }
  }
  lvl = Math.min(120, lvl);
  const base = titanCumulativeExp[lvl - 1] || 0;
  const next = lvl >= 120 ? base : (titanCumulativeExp[lvl] ?? base);
  return {
    level: lvl,
    currentLevelXp: xp - base,
    nextLevelExpNeeded: Math.max(0, next - base),
    totalExp: xp,
  };
}

/**
 * Calculates how many levels can be upgraded with available potions,
 * and the exact potion cost to reach that level.
 * Handles currentXp being either total cumulative XP or progress within level.
 */
export function calculateTitanLevelUpPlan(
  currentLevel: number,
  currentXp: number,
  availablePotions: number,
  targetDelta = 1,
  maxLevel = 120
): { targetLevel: number; potionsNeeded: number; canLevelUp: boolean } {
  const lvl = Math.max(1, Math.min(maxLevel, currentLevel));
  if (lvl >= maxLevel) {
    return { targetLevel: maxLevel, potionsNeeded: 0, canLevelUp: false };
  }

  // Determine current cumulative XP
  const baseForCurrent = titanCumulativeExp[lvl - 1] ?? 0;
  const nextForCurrent = titanCumulativeExp[lvl] ?? baseForCurrent;
  let totalCurExp: number;
  if (currentXp >= baseForCurrent) {
    totalCurExp = currentXp;
  } else {
    totalCurExp = baseForCurrent + Math.max(0, currentXp);
  }

  if (targetDelta === 1) {
    const needed = Math.max(0, nextForCurrent - totalCurExp);
    return {
      targetLevel: lvl + 1,
      potionsNeeded: needed,
      canLevelUp: availablePotions >= needed && needed > 0,
    };
  }

  if (targetDelta >= 120) {
    // Max level upgrade calculation based on available potions
    let target = lvl;
    let needed = 0;
    for (let testLvl = lvl + 1; testLvl <= maxLevel; testLvl++) {
      const targetExp = titanCumulativeExp[testLvl - 1] ?? 0;
      const testNeeded = Math.max(0, targetExp - totalCurExp);
      if (testNeeded <= availablePotions) {
        target = testLvl;
        needed = testNeeded;
      } else {
        break;
      }
    }

    if (target > lvl) {
      return {
        targetLevel: target,
        potionsNeeded: needed,
        canLevelUp: true,
      };
    }

    const neededForOne = Math.max(0, nextForCurrent - totalCurExp);
    return {
      targetLevel: lvl + 1,
      potionsNeeded: neededForOne,
      canLevelUp: false,
    };
  }

  // Target specific delta (e.g. +10)
  const goalLevel = Math.min(maxLevel, lvl + targetDelta);
  const targetExp = titanCumulativeExp[goalLevel - 1] ?? 0;
  const needed = Math.max(0, targetExp - totalCurExp);

  return {
    targetLevel: goalLevel,
    potionsNeeded: needed,
    canLevelUp: availablePotions >= needed && needed > 0,
  };
}
