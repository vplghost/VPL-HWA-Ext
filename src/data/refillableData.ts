import type { RefillableRule } from '@/src/types/game/refillable';

export const refillableRules: Record<number, RefillableRule> = {
  1: { label: 'Energy', interval: 360000, capFromTeamLevel: true },
  2: { label: 'Skill Points', interval: 300000, cap: 10 },
  3: { label: 'Bronze Free Chest', interval: 600000, cap: 1 },
  4: { label: 'Gold Free Chest', interval: 129600000, cap: 1 },
  21: { label: 'Grand Arena Battles', interval: 0, cap: 5 },
  23: { label: 'Chrono Gold Trial', interval: 0, cap: 2 },
  25: { label: 'Chrono EXP Trial', interval: 0, cap: 2 },
  27: { label: 'Physical Trial', interval: 0, cap: 5 },
  29: { label: 'Magic Trial', interval: 0, cap: 5 },
  31: { label: 'Perk Trial', interval: 0, cap: 5 },
  34: { label: 'Guild Tribute', interval: 0, cap: 3 },
  35: { label: 'Diamond Free Chest', interval: 259200000, cap: 1 },
  36: { label: 'Boss Battles', interval: 0, cap: 5 },
  40: { label: 'Blue Egg Chest', interval: 600000, cap: 1 },
  41: { label: 'Purple Egg Chest', interval: 14400000, cap: 1 },
  42: { label: 'Golden Egg Chest', interval: 0, cap: 1 },
  43: { label: 'Blue Easter Chest', interval: 600000, cap: 1 },
  44: { label: 'Purple Easter Chest', interval: 7200000, cap: 1 },
  45: { label: 'Golden Easter Chest', interval: 0, cap: 1 },
  50: { label: 'Brigand Battles', interval: 0, cap: 5 },
  52: { label: 'Raid Battles', interval: 0, cap: 3 },
  53: { label: 'Video Alchemy', interval: 0, cap: 1 },
  55: { label: 'Video Skill Points', interval: 0, cap: 1 },
  56: { label: 'Video Mission Rewards', interval: 0, cap: 8 },
  58: { label: 'Sky Arena Fuel', interval: 900000, cap: 200 },
  59: { label: 'Adventure Energy', interval: 3600000, cap: 50 },
  60: { label: 'Draft Chips', interval: 10800000, cap: 5 },
  61: { label: 'Astral Energy', interval: 3600000, cap: 100 },
  65: { label: 'Available Reroll Coins', interval: 0, cap: 10 },
  68: { label: 'Event Boss Battles', interval: 1800000, cap: 5 },
  78: { label: 'Event Picker', interval: 0, cap: 1 }
};

for (const id of [64, 66, 67, 69, 70, 71, 72, 75, 76, 77, 79, 80, 81, 82,
  83, 84, 85, 86, 87, 506, 507, 508, 509, 510, 511, 512]) {
  refillableRules[id] = { label: `Event Energy #${id}`, interval: 3600000, cap: 200 };
}

export function getRefillableRule(id: number | string): RefillableRule | undefined {
  const num = typeof id === 'string' ? parseInt(id, 10) : id;
  return refillableRules[num];
}
