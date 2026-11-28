import { CHOICE_CHEST_DEFINITIONS } from './chestHelper.ts';
import { getItemName } from '../data/nameData.ts';

export interface TitanArtifactChestOption {
  chestId: string;
  chestName: string;
  choiceIndex: number;
  amountPerChest: number;
  availableCount: number;
  countToOpen: number;
  fragsProvided: number;
}

export interface TitanArtifactEvolvePlan {
  artifactId: number;
  fragCost: number;
  ownedFrags: number;
  missingFrags: number;
  canEvolveDirectly: boolean;
  canEvolveWithChests: boolean;
  chestsPlan: TitanArtifactChestOption[];
  totalChestsToOpen: number;
  totalFragsFromChests: number;
  tooltipText: string;
  buttonLabel: string;
  primaryChestName?: string;
  chestsNeededTotal?: number;
  chestsOwnedTotal?: number;
}

const STANDARD_CHEST_PRIORITY = new Set(['273', '274', '275', '276', '40160', '40161']);

/**
 * Calculates chest opening plan for evolving a titan artifact when direct fragments are insufficient.
 */
export function calculateTitanArtifactEvolvePlan(
  artifactId: number,
  fragCost: number,
  ownedFrags: number,
  inventoryConsumable: Record<string, any> = {},
  targetStar = 2
): TitanArtifactEvolvePlan {
  const missingFrags = Math.max(0, fragCost - ownedFrags);

  if (fragCost <= 0) {
    return {
      artifactId,
      fragCost,
      ownedFrags,
      missingFrags: 0,
      canEvolveDirectly: false,
      canEvolveWithChests: false,
      chestsPlan: [],
      totalChestsToOpen: 0,
      totalFragsFromChests: 0,
      tooltipText: 'Max Star reached',
      buttonLabel: 'Max Star',
    };
  }

  if (missingFrags === 0) {
    return {
      artifactId,
      fragCost,
      ownedFrags,
      missingFrags: 0,
      canEvolveDirectly: true,
      canEvolveWithChests: true,
      chestsPlan: [],
      totalChestsToOpen: 0,
      totalFragsFromChests: 0,
      tooltipText: `Ready to evolve (${ownedFrags.toLocaleString()} / ${fragCost.toLocaleString()} fragments)`,
      buttonLabel: `⭐ Evolve to ${targetStar}★`,
    };
  }

  // Find candidate chests in CHOICE_CHEST_DEFINITIONS offering this artifact fragment
  interface Candidate {
    chestId: string;
    chestName: string;
    choiceIndex: number;
    amountPerChest: number;
    availableCount: number;
    isStandard: boolean;
  }

  const matchingChests: Candidate[] = [];

  for (const [chestId, choices] of Object.entries(CHOICE_CHEST_DEFINITIONS)) {
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      if (choice.reward?.type === 'fragmentArtifact' && Number(choice.reward.id) === Number(artifactId)) {
        const amountPerChest = Number(choice.reward.amount) || 25;
        const availableCount = Number(inventoryConsumable[String(chestId)]) || 0;
        const rawName = getItemName('consumable', chestId) || choice.label || `Chest #${chestId}`;
        matchingChests.push({
          chestId: String(chestId),
          chestName: rawName,
          choiceIndex: choice.choiceIndex,
          amountPerChest,
          availableCount,
          isStandard: STANDARD_CHEST_PRIORITY.has(String(chestId)),
        });
        break;
      }
    }
  }

  // Sort candidate chests: standard chests first, then chests with available stock first
  matchingChests.sort((a, b) => {
    if (a.isStandard !== b.isStandard) return a.isStandard ? -1 : 1;
    if ((a.availableCount > 0) !== (b.availableCount > 0)) return a.availableCount > 0 ? -1 : 1;
    return Number(a.chestId) - Number(b.chestId);
  });

  let remaining = missingFrags;
  const chestsPlan: TitanArtifactChestOption[] = [];

  for (const chest of matchingChests) {
    if (remaining <= 0) break;
    if (chest.availableCount <= 0) continue;

    const neededFromThis = Math.ceil(remaining / chest.amountPerChest);
    const countToOpen = Math.min(chest.availableCount, neededFromThis);

    if (countToOpen > 0) {
      const fragsProvided = countToOpen * chest.amountPerChest;
      remaining -= fragsProvided;
      chestsPlan.push({
        chestId: chest.chestId,
        chestName: chest.chestName,
        choiceIndex: chest.choiceIndex,
        amountPerChest: chest.amountPerChest,
        availableCount: chest.availableCount,
        countToOpen,
        fragsProvided,
      });
    }
  }

  const totalChestsToOpen = chestsPlan.reduce((sum, c) => sum + c.countToOpen, 0);
  const totalFragsFromChests = chestsPlan.reduce((sum, c) => sum + c.fragsProvided, 0);
  const canEvolveWithChests = remaining <= 0;

  const primaryChest = matchingChests[0];
  const primaryChestName = primaryChest?.chestName || 'Titan Artifact Chest';
  const chestsNeededTotal = Math.ceil(missingFrags / (primaryChest?.amountPerChest || 25));
  const chestsOwnedTotal = matchingChests.reduce((sum, c) => sum + c.availableCount, 0);

  let tooltipText = '';
  let buttonLabel = '';

  if (canEvolveWithChests) {
    const planDesc = chestsPlan.map((c) => `${c.countToOpen}x ${c.chestName} (+${c.fragsProvided} frags)`).join(', ');
    tooltipText = `Owned: ${ownedFrags.toLocaleString()} / ${fragCost.toLocaleString()} frags (need ${missingFrags.toLocaleString()} more).\nWill auto-open ${planDesc} to evolve to ${targetStar}★.`;
    buttonLabel = `⭐ Open ${totalChestsToOpen}x Chest & Evolve`;
  } else {
    tooltipText = `Not enough fragments: ${ownedFrags.toLocaleString()} / ${fragCost.toLocaleString()} (need ${missingFrags.toLocaleString()} more).\nRequires ${chestsNeededTotal}x ${primaryChestName} (owned in bag: ${chestsOwnedTotal}).`;
    buttonLabel = `⭐ Evolve to ${targetStar}★`;
  }

  return {
    artifactId,
    fragCost,
    ownedFrags,
    missingFrags,
    canEvolveDirectly: false,
    canEvolveWithChests,
    chestsPlan,
    totalChestsToOpen,
    totalFragsFromChests,
    tooltipText,
    buttonLabel,
    primaryChestName,
    chestsNeededTotal,
    chestsOwnedTotal,
  };
}

export interface TitanArtifactLevelPlan {
  capLevel: number;
  isMaxed: boolean;
  dustCost1: number;
  goldCost1: number;
  canLevelUp1: boolean;
  milestoneTarget: number;
  milestoneDelta: number;
  milestoneDustCost: number;
  milestoneGoldCost: number;
  canLevelToMilestone: boolean;
}

/**
 * Computes +1 and next-multiple-of-10 upgrade plan for a Titan Artifact,
 * clamped to `Math.min(120, titanLevel)` with exact cumulative Dust & Gold gating.
 */
export function computeTitanArtifactLevelPlan(
  level: number,
  titanLevel: number,
  fairyDust: number,
  gold: number,
  getLevelCost: (targetLevel: number) => [number, number] | readonly [number, number] | null | undefined
): TitanArtifactLevelPlan {
  const curLevel = Math.max(1, Math.floor(Number(level) || 1));
  const capLevel = Math.min(120, Math.max(1, Math.floor(Number(titanLevel) || 1)));
  const ownedDust = Math.max(0, Number(fairyDust) || 0);
  const ownedGold = Math.max(0, Number(gold) || 0);
  const isMaxed = curLevel >= 120;

  const cost1 = !isMaxed && curLevel + 1 <= 120 ? getLevelCost(curLevel + 1) : null;
  const dustCost1 = cost1 ? Number(cost1[0]) || 0 : 0;
  const goldCost1 = cost1 ? Number(cost1[1]) || 0 : 0;
  const canLevelUp1 =
    !isMaxed &&
    curLevel < capLevel &&
    dustCost1 > 0 &&
    ownedDust >= dustCost1 &&
    ownedGold >= goldCost1;

  const rawNextTen = Math.floor(curLevel / 10) * 10 + 10;
  const milestoneTarget = Math.min(capLevel, rawNextTen);
  const milestoneDelta = Math.max(0, milestoneTarget - curLevel);

  let milestoneDustCost = 0;
  let milestoneGoldCost = 0;
  let validAllSteps = milestoneDelta > 1;
  if (validAllSteps) {
    for (let lvl = curLevel + 1; lvl <= milestoneTarget; lvl++) {
      const c = getLevelCost(lvl);
      const d = c ? Number(c[0]) || 0 : 0;
      const g = c ? Number(c[1]) || 0 : 0;
      if (d <= 0) {
        validAllSteps = false;
        break;
      }
      milestoneDustCost += d;
      milestoneGoldCost += g;
    }
  }

  const canLevelToMilestone =
    validAllSteps &&
    !isMaxed &&
    ownedDust >= milestoneDustCost &&
    ownedGold >= milestoneGoldCost;

  return {
    capLevel,
    isMaxed,
    dustCost1,
    goldCost1,
    canLevelUp1,
    milestoneTarget,
    milestoneDelta,
    milestoneDustCost,
    milestoneGoldCost,
    canLevelToMilestone,
  };
}
