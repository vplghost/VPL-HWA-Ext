import { nameMap } from '../../data/nameData.ts';

export const RPC_CACHE_DEFINITIONS: Record<string, string> = {
  heroGetAll: 'heroes',
  artifact_getAll: 'heroes',
  skin_getAll: 'heroes',
  rune_getAll: 'heroes',
  heroStatsBonus_getAll: 'heroes',
  inventoryGet: 'items',
  'getInventory:inventory': 'items',
  shopGetMany: 'items',
  offerGetAll: 'items',
  titanGetAll: 'titans',
  titan_artifactGetCounters: 'titans',
  teamGetAll: 'teams',
  'getUnitSummary:unit': 'teams',
  'getTrainings:unit': 'teams',
  'getHealing:unit': 'teams',
  getUnitSummary: 'teams',
  getTrainings: 'teams',
  getHealing: 'teams',
  'startTraining:unit': 'teams',
  'completeTraining:unit': 'teams',
  'startHealing:unit': 'teams',
  'completeHealing:unit': 'teams',
  startTraining: 'teams',
  completeTraining: 'teams',
  startHealing: 'teams',
  completeHealing: 'teams',
  questGetAll: 'other',
  cinemaGetCounters: 'other',
  user_getClanInfo: 'other',
  'getUserClanMembersOutposts:globalMap': 'other',
  arenaGetAll: 'other',
  expeditionGet: 'other',
  dailyBonusGetInfo: 'other',
  zeppelinGiftGet: 'other',
  missionGetAll: 'other',
  'getDailyQuests:quest': 'events',
  'getSpecialQuestState:quest': 'events',
  clanBoss_getAll: 'other',
  clanWarGetBriefInfo: 'other',
  'getLeaderboardPowerSummary:leaderboardPower': 'other',
  getLeaderboardPowerSummary: 'other',
  'getInfo:clanVersus': 'events',
  'getCurrentBattle:clanVersus': 'events',
  'getUserProgress:clanVersus': 'events',
  'getRewardList:clanVersus': 'events',
  questGetEvents: 'events',
  clanWarChampInfo_getBriefInfo: 'events',
  'getEventInfo:fortress': 'events',
  clanClash_getCurrentState: 'events',
  clanClash_claimReward: 'events',
  refillable_alchemyUseVideo: 'header',
  brawl_getAll: 'events',
  heroEvolve: 'heroes',
  titanEvolve: 'titans',
  'attackMine:mine': 'header',
  'stopMineGathering:mine': 'header',
  'searchMine:mine': 'other',
  'getMineSummary:mine': 'header',
  'getChunks:globalMap': 'other',
  'getRoutesByIds:globalMap': 'other',
  'getPage:report': 'header',
  'readAndClaimAll:report': 'header',
  'claimReward:report': 'header',
  mailGetAll: 'header',
  mailFarm: 'header',
  quest_multiFarm: 'other',
  quest_farm: 'other',
  questFarm: 'other',
  dailyQuestFarm: 'other',
  dungeonGetInfo: 'events',
  dungeonEndBattle: 'events',
  dungeonSaveProgress: 'events',
  dungeonStartBattle: 'events',
  magicTower_briefInfo: 'other',
  magicTower_getAll: 'other',
  openLootboxChanced: 'items',
  inventory_use: 'items'
};

export const definitions = RPC_CACHE_DEFINITIONS;


export const RESOURCE_TYPES = new Set([
  'material',
  'coin',
  'scroll',
  'consumable',
  'speedUpUnitTraining',
  'speedUpUniversal',
  'speedUpUnitHealing',
  'speedUpConstruction',
  'speedUpResearch',
  'teleporter',
  'lootboxChanced',
  'patron'
]);

export const WORLD_MATERIAL_NAMES: Record<number, string> = {
  1: 'Elarite Shards',
  2: 'Iron',
  3: 'Stone',
  4: 'Wood',
  5: 'Food',
  12: 'Honor Marks'
};

export const PRODUCED_MATERIAL_IDS = new Set([1, 2, 3, 4, 5]);

export const TYPE_NAMES: Record<string, string> = {
  speedUpUnitTraining: 'Training Speedup',
  speedUpUniversal: 'Universal Speedup',
  speedUpUnitHealing: 'Healing Speedup',
  speedUpConstruction: 'Construction Speedup',
  speedUpResearch: 'Research Speedup',
  teleporter: 'Teleporter',
  lootboxChanced: 'Chance Lootbox',
  patron: 'Relic Shard'
};

export const SKILL_LEVEL_COSTS: readonly number[] = [
  0, 0, 100, 550, 1000, 1450, 1900, 2350, 2800, 3250, 3700, 4150, 4600, 5050, 5500, 5950,
  6400, 6850, 7300, 7750, 8200, 8650, 9200, 9750, 10300, 10850, 11400, 11950, 12500, 13050, 13600,
  14150, 14700, 15250, 15800, 16350, 16900, 17450, 18000, 18550, 19100, 19650, 20200, 21200, 22200, 23200,
  24200, 25200, 26200, 27200, 28200, 29200, 30200, 31200, 32200, 33200, 34200, 35200, 36200, 37200, 38200,
  39200, 40200, 41200, 42200, 43200, 44200, 45200, 46200, 47200, 48200, 49200, 50200, 51300, 52400, 53500,
  54600, 55700, 56800, 57900, 59000, 60100, 61200, 62300, 63400, 64500, 65600, 66700, 67800, 68900, 70000,
  71000, 72000, 73000, 74000, 75000, 76000, 77000, 78000, 79000, 80000, 81000, 82000, 83000, 84000, 85000,
  86000, 87000, 88000, 89000, 90000, 91000, 92000, 93000, 94000, 95000, 96000, 97000, 98000, 99000, 100000
];

export function getSkillUpgradeGoldCost(targetLevel: number): number {
  if (!Number.isFinite(targetLevel) || targetLevel <= 1) return 0;
  if (targetLevel < SKILL_LEVEL_COSTS.length) return SKILL_LEVEL_COSTS[targetLevel] ?? 0;
  const lastCost = SKILL_LEVEL_COSTS[SKILL_LEVEL_COSTS.length - 1] ?? 100000;
  return lastCost + (targetLevel - (SKILL_LEVEL_COSTS.length - 1)) * 1000;
}

export function resolveResourceLabel(key: string): string {
  if (key === 'energy') return 'Energy';
  if (key === 'world-energy') return 'World Energy';
  if (key === 'gold') return 'Gold';
  if (key === 'starMoney') return 'Emeralds';
  const parts = key.split(':');
  const type = parts[0] || '';
  const idStr = parts[1] || '0';
  const id = Number(idStr);
  if (type === 'material' && WORLD_MATERIAL_NAMES[id]) return WORLD_MATERIAL_NAMES[id]!;
  if (type === 'speedUpResearch' && id === 2) return '5m Research Speedup';
  if (type === 'patron' && id === 1) return 'Relic Shard';
  if (nameMap && typeof nameMap.item === 'function') {
    const found = nameMap.item(type, id);
    if (found) return found;
  }
  return `${TYPE_NAMES[type] || type} #${id}`;
}
