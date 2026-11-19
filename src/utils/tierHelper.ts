/**
 * Tier Helper for Event Viewer & Milestones.
 * Resolves detailed tier information including:
 * - Task/Objective description
 * - Unit of measurement
 * - Requirement target/threshold per tier
 * - Progress vs target and completion %
 */

import { formatNumber } from './formatters.ts';
import { parseRewards, type FormattedReward } from './rewardHelper.ts';

export interface GroupTierMeta {
  task: string;
  taskEn: string;
  unit: string;
  unitEn: string;
  category: 'Activities' | 'Resources' | 'Hero Growth' | 'Guild';
  ladder?: number[];
  defaultStep?: number;
}

export interface TierResolution {
  id: number | string;
  index: number;
  task: string;
  taskEn: string;
  unit: string;
  unitEn: string;
  category: string;
  target: number;
  progress: number;
  percent: number;
  state: 'completed' | 'ready' | 'inProgress';
  targetDisplay: string;
  progressDisplay: string;
  completionCount: number;
  rewards: FormattedReward[];
  raw: any;
}

// Known targets from CDN game configurations
export const knownQuestTargets: Record<number | string, number> = {
  // Event 100275 (viewId 65): Clan Clash Event
  11308: 1, 11309: 3, 11310: 5, 11311: 7, 11312: 10, 11313: 15,
  11314: 200, 11315: 400, 11316: 800, 11317: 1200, 11318: 1600, 11319: 2000, 11320: 2500, 11321: 3000, 11322: 3500, 11323: 4000, 11324: 4500,
  11325: 1, 11326: 3, 11327: 5, 11328: 7, 11329: 9, 11330: 12, 11331: 15, 11332: 18,
  11333: 65, 11334: 130, 11335: 190, 11336: 250, 11337: 350, 11338: 450, 11339: 600, 11340: 750, 11341: 1000, 11342: 1250,

  // Event 100292 (viewId 94): Hero Upgrade Event
  11770: 3, 11771: 3, 11772: 3, 11773: 3, 11774: 3, 11775: 3, 11776: 3, 11777: 3, 11778: 3, 11779: 3,
  11780: 3, 11781: 3, 11782: 3, 11783: 3, 11784: 3, 11785: 3, 11786: 3, 11787: 3, 11788: 3, 11789: 3,
  11790: 1, 11791: 2, 11792: 3, 11793: 4, 11794: 5, 11795: 6, 11796: 7, 11797: 8, 11798: 9, 11799: 10,
  11800: 11, 11801: 12, 11802: 13, 11803: 14, 11804: 15, 11805: 16, 11806: 17, 11807: 18,
  11808: 1, 11809: 1, 11810: 1, 11811: 1, 11812: 1, 11813: 1, 11814: 1, 11815: 1, 11816: 1, 11817: 1, 11818: 1, 11819: 1, 11820: 1, 11821: 1,
  11822: 10, 11823: 20, 11824: 30, 11825: 40, 11826: 50, 11827: 60, 11828: 70, 11829: 80, 11830: 90, 11831: 100, 11832: 110, 11833: 120,
  11834: 10, 11835: 20, 11836: 30, 11837: 40, 11838: 50, 11839: 60, 11840: 70, 11841: 80, 11842: 90, 11843: 100,
  11844: 110, 11845: 120, 11846: 130, 11847: 140, 11848: 150, 11849: 160, 11850: 170, 11851: 180, 11852: 190, 11853: 200,
  11854: 3, 11855: 6, 11856: 9, 11857: 12, 11858: 15, 11859: 18, 11860: 21, 11861: 24, 11862: 27, 11863: 30,
  11864: 10, 11865: 20, 11866: 30, 11867: 40, 11868: 50, 11869: 60, 11870: 70, 11871: 80, 11872: 90, 11873: 100,

  // Event 100296 (viewId 30): Wendy's Special Gift
  11934: 350, 11935: 600, 11936: 900, 11937: 1500, 11938: 3000, 11939: 6000, 11940: 10000,
  11941: 17000, 11942: 25000, 11943: 35000, 11944: 45000, 11945: 60000, 11946: 75000, 11947: 90000,

  // Event 100309 (viewId 99): Hero's Way Pass
  13427: 5, 13428: 10, 13429: 90, 13430: 9, 13431: 18, 13432: 6, 13433: 8,

  // Event 100382 (viewId 137): Trial of Legends & Arena Glory
  14820: 5, 14821: 10, 14822: 15, 14823: 20, 14824: 25, 14825: 30, 14826: 33,
  14827: 35, 14828: 40, 14829: 45, 14830: 50, 14831: 55, 14832: 60, 14833: 65, 14834: 70,

  // Daily 4X & Chained Quests (Brigand Camps, Troops, Gathering, Bosses)
  346: 1,
  348: 10, 351: 30,
  349: 10, 352: 30,
  350: 10, 353: 30,
  354: 50000, 358: 250000,
  355: 50000, 359: 250000,
  356: 10000, 360: 50000,
  357: 3000, 361: 15000,
  362: 1, 363: 5, 364: 10,
  365: 1, 366: 2, 367: 4,
  368: 1, 369: 2, 370: 3,
  2413: 1
};

// Definitions for event groups / chains
const groupDefinitions: Record<string, GroupTierMeta> = {
  QUEST_TAB_NAME_LOGIN: {
    task: 'Daily Sign In',
    taskEn: 'Daily Sign In',
    unit: 'days',
    unitEn: 'days',
    category: 'Activities',
    ladder: [1, 2, 3, 4, 5, 6, 7]
  },
  QUEST_TAB_NAME_GET_VIP: {
    task: 'Obtain VIP Points',
    taskEn: 'Obtain VIP Points',
    unit: 'VIP points',
    unitEn: 'VIP points',
    category: 'Activities',
    ladder: [100, 300, 1000, 2500, 4500, 7000, 9000]
  },
  LIB_PSEUDO_STARMONEY: {
    task: 'Spend Emeralds',
    taskEn: 'Spend Emeralds',
    unit: 'Emeralds',
    unitEn: 'Emeralds',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2500, 5000, 8000, 12000, 18000, 25000, 35000, 50000, 65000, 80000, 100000, 120000]
  },
  LIB_PSEUDO_STAMINA: {
    task: 'Spend Energy',
    taskEn: 'Spend Energy',
    unit: 'Energy',
    unitEn: 'Energy',
    category: 'Resources',
    ladder: [100, 300, 500, 1000, 1500, 2500, 4000, 6000, 8000, 10000, 13000, 16000]
  },
  UI_FEATURE_HUB_ARENA_TITLE: {
    task: 'Fight in Arena',
    taskEn: 'Fight in Arena',
    unit: 'battles',
    unitEn: 'battles',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 15, 20, 25]
  },
  QUEST_TAB_NAME_HYDRA: {
    task: 'Fight Hydra Heads',
    taskEn: 'Fight Hydra Heads',
    unit: 'attacks',
    unitEn: 'attacks',
    category: 'Activities',
    ladder: [1, 3, 6, 9, 12, 15, 18]
  },
  STRATEGIC_GLOBAL_MAP_RALLY_POPUP_TITLE: {
    task: 'Defeat World Map Bosses',
    taskEn: 'Defeat World Map Bosses',
    unit: 'bosses',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 12, 15]
  },
  UI_DIALOG_BOSS_TITLE: {
    task: 'Defeat World Map Bosses',
    taskEn: 'Defeat World Map Bosses',
    unit: 'bosses',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 12, 15]
  },
  QUEST_TAB_NAME_TOWER_CHESTS: {
    task: 'Open Tower Chests',
    taskEn: 'Open Tower Chests',
    unit: 'chests',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 3, 5, 10, 20, 35, 50]
  },
  UI_DIALOG_ARTIFACT_CHEST_DROP_PACK1: {
    task: 'Open Artifact Chests',
    taskEn: 'Open Artifact Chests',
    unit: 'chests',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 3, 5, 10, 20, 35, 50]
  },
  UI_HEROIC_CHEST_MAIN_TITLE: {
    task: 'Open Heroic Chests',
    taskEn: 'Open Heroic Chests',
    unit: 'chests',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 2, 5, 10, 20, 30, 50]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_143: {
    task: 'Tower Floor Progress',
    taskEn: 'Tower Floor Progress',
    unit: 'floors',
    unitEn: 'floors',
    category: 'Activities',
    ladder: [5, 10, 15, 20, 30, 40, 50]
  },
  STRATEGIC_BASE_INTERFACE_BUTTON_SPEEDUPS: {
    task: 'Use Speedups in City',
    taskEn: 'Use Speedups in City',
    unit: 'minutes',
    unitEn: 'minutes',
    category: 'Resources',
    ladder: [60, 180, 360, 720, 1440, 2880, 4320]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_SPEEDUP: {
    task: 'Use Training Speedups',
    taskEn: 'Use Training Speedups',
    unit: 'minutes',
    unitEn: 'minutes',
    category: 'Resources',
    ladder: [60, 180, 360, 720, 1440, 2880, 4320]
  },
  STRATEGIC_BASE_INTERFACE_TROOPS_TRAIN: {
    task: 'Train Troops in Barracks',
    taskEn: 'Train Troops in Barracks',
    unit: 'troops',
    unitEn: 'troops',
    category: 'Activities',
    ladder: [50, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_TROOPS: {
    task: 'Train Troops in Barracks',
    taskEn: 'Train Troops in Barracks',
    unit: 'troops',
    unitEn: 'troops',
    category: 'Activities',
    ladder: [50, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  UI_CLANBOSS_MENU_ALTAR: {
    task: 'Pray at Clan Altar',
    taskEn: 'Pray at Clan Altar',
    unit: 'prayers',
    unitEn: 'prayers',
    category: 'Activities',
    ladder: [1, 3, 5, 8, 12, 16, 20, 25, 30]
  },
  UI_DIALOG_RATING_TAB_CLAN: {
    task: 'Earn Guild Activity Points',
    taskEn: 'Earn Guild Activity Points',
    unit: 'points',
    unitEn: 'points',
    category: 'Guild',
    ladder: [200, 400, 800, 1200, 1600, 2000, 2500, 3000, 3500, 4000, 4500]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_48: {
    task: 'Clan Clash Activity Points',
    taskEn: 'Clan Clash Activity Points',
    unit: 'points',
    unitEn: 'points',
    category: 'Guild',
    ladder: [200, 400, 800, 1200, 1600, 2000, 2500, 3000, 3500, 4000, 4500]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_64: {
    task: 'Collect Titanite in Dungeon',
    taskEn: 'Collect Titanite in Dungeon',
    unit: 'Titanite',
    unitEn: 'Titanite',
    category: 'Guild',
    ladder: [65, 130, 190, 250, 350, 450, 600, 750, 1000, 1250]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_9: {
    task: 'Clash of Worlds Battles',
    taskEn: 'Clash of Worlds Battles',
    unit: 'battles',
    unitEn: 'battles',
    category: 'Guild',
    ladder: [1, 3, 5, 7, 10, 15]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_763: {
    task: 'Titan Power & Boss Attacks',
    taskEn: 'Titan Power & Boss Attacks',
    unit: 'attacks',
    unitEn: 'attacks',
    category: 'Guild',
    ladder: [1, 3, 5, 7, 9, 12, 15, 18]
  },
  LIB_COIN_NAME_18: {
    task: 'Collect Fairy Dust',
    taskEn: 'Collect Fairy Dust',
    unit: 'Fairy Dust',
    unitEn: 'Fairy Dust',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  LIB_CONSUMABLE_NAME_20: {
    task: 'Spend Titan Potion',
    taskEn: 'Spend Titan Potion',
    unit: 'Titan Potion',
    unitEn: 'Titan Potion',
    category: 'Resources',
    ladder: [500, 1500, 3000, 6000, 12000, 25000, 50000, 75000, 100000, 150000]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_969: {
    task: 'Upgrade Rune Stones',
    taskEn: 'Upgrade Rune Stones',
    unit: 'stones',
    unitEn: 'stones',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 13000, 16000, 20000, 25000, 30000, 36000, 42000, 49000, 56000, 64000]
  },
  EVENT_GLORY_NAME_QUEST_1: {
    task: 'Earn Glory Points',
    taskEn: 'Earn Glory Points',
    unit: 'points',
    unitEn: 'points',
    category: 'Activities',
    ladder: [5, 10, 15, 20, 25, 35, 50, 75, 100, 130, 170, 220, 280, 350, 430, 520, 620]
  },
  EVENT_GLORY_NAME_QUEST_2: {
    task: 'Trial of Legends Battles',
    taskEn: 'Trial of Legends Battles',
    unit: 'battles',
    unitEn: 'battles',
    category: 'Activities',
    ladder: [5, 10, 15, 20, 25, 30, 33, 35, 40, 45, 50, 55, 60, 65, 70]
  },
  QUEST_TAB_NAME_ARTLEVEL: {
    task: 'Level Up Hero Artifacts',
    taskEn: 'Level Up Hero Artifacts',
    unit: 'levels',
    unitEn: 'levels',
    category: 'Hero Growth',
    ladder: [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]
  },
  UI_DIALOG_HERO_ARTIFACTS_ARTIFACT_EVOLUTION: {
    task: 'Evolve Hero Artifacts',
    taskEn: 'Evolve Hero Artifacts',
    unit: 'stars',
    unitEn: 'stars',
    category: 'Hero Growth',
    ladder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  },
  QUEST_TAB_NAME_HERO_RANK: {
    task: 'Promote Hero Rank',
    taskEn: 'Promote Hero Rank',
    unit: 'ranks',
    unitEn: 'ranks',
    category: 'Hero Growth',
    ladder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
  },
  QUEST_TAB_HERO_LEVEL: {
    task: 'Level Up Heroes',
    taskEn: 'Level Up Heroes',
    unit: 'levels',
    unitEn: 'levels',
    category: 'Hero Growth',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
  },
  RECOMMENDATION_RUNES_NEW: {
    task: 'Upgrade Runes',
    taskEn: 'Upgrade Runes',
    unit: 'runes',
    unitEn: 'runes',
    category: 'Hero Growth',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_38: {
    task: 'Level Up Titan Gift',
    taskEn: 'Level Up Titan Gift',
    unit: 'tiers',
    unitEn: 'tiers',
    category: 'Hero Growth',
    ladder: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]
  },
  QUEST_TAB_NAME_SKINSTONES_SPEND: {
    task: 'Spend Hero Skin Stones',
    taskEn: 'Spend Hero Skin Stones',
    unit: 'skin stones',
    unitEn: 'skin stones',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 25000]
  },
  QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND: {
    task: 'Spend Titan Skin Stones',
    taskEn: 'Spend Titan Skin Stones',
    unit: 'titan skin stones',
    unitEn: 'titan skin stones',
    category: 'Resources',
    ladder: [15, 50, 100, 250, 500, 1000, 2000, 3500, 5000]
  },
  STRATEGIC_RESOURCE_12_NAME: {
    task: 'Gather Iron / Ore on Map',
    taskEn: 'Gather Iron / Ore on Map',
    unit: 'iron',
    unitEn: 'iron',
    category: 'Resources',
    ladder: [10000, 25000, 50000, 100000, 250000, 500000, 1000000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_PVPKILLUNITS: {
    task: 'Defeat Enemy Units in PvP',
    taskEn: 'Defeat Enemy Units in PvP',
    unit: 'units',
    unitEn: 'units',
    category: 'Activities',
    ladder: [50, 150, 350, 750, 1500, 3000, 5000, 8000, 12000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_LOSEUNITS: {
    task: 'PvP Unit Battles',
    taskEn: 'PvP Unit Battles',
    unit: 'units',
    unitEn: 'units',
    category: 'Activities',
    ladder: [50, 150, 350, 750, 1500, 3000, 5000, 8000, 12000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TEST_WENDYGIFT: {
    task: "Wendy's Daily Gift",
    taskEn: "Wendy's Daily Gift",
    unit: 'gifts',
    unitEn: 'gifts',
    category: 'Activities',
    ladder: [350, 600, 900, 1500, 3000, 6000, 10000, 17000, 25000, 35000, 45000, 60000, 75000, 90000]
  },
  UI_HERO78_TITLE: {
    task: 'Complete Hero Event Quests',
    taskEn: 'Complete Hero Event Quests',
    unit: 'quests',
    unitEn: 'quests',
    category: 'Activities',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  },
  LIB_TEST_BP_DAILY_QUESTS: {
    task: 'Battle Pass Daily Quests',
    taskEn: 'Battle Pass Daily Quests',
    unit: 'quests',
    unitEn: 'quests',
    category: 'Activities',
    ladder: [1, 2, 3, 5, 7, 9, 11]
  },
  LIB_TEST_BP_SINGLE_QUESTS: {
    task: 'Battle Pass Milestones',
    taskEn: 'Battle Pass Milestones',
    unit: 'milestones',
    unitEn: 'milestones',
    category: 'Activities',
    ladder: [1, 2, 3, 5, 7, 10, 12]
  },
  LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES: {
    task: 'Clear Brigand Camp',
    taskEn: 'Clear Brigand Camp',
    unit: 'camps',
    unitEn: 'camps',
    category: 'Activities',
    ladder: [1, 5, 10]
  },
  QUEST_CHAIN_135: {
    task: 'Clear Brigand Camp',
    taskEn: 'Clear Brigand Camp',
    unit: 'camps',
    unitEn: 'camps',
    category: 'Activities',
    ladder: [1, 5, 10]
  },
  LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCEGATHERINGCOUNT: {
    task: 'Gather Resources on Map',
    taskEn: 'Gather Resources on Map',
    unit: 'times',
    unitEn: 'times',
    category: 'Activities',
    ladder: [1, 2, 4]
  },
  QUEST_CHAIN_136: {
    task: 'Gather Resources on Map',
    taskEn: 'Gather Resources on Map',
    unit: 'times',
    unitEn: 'times',
    category: 'Activities',
    ladder: [1, 2, 4]
  },
  LIB_QUEST_TRANSLATE_GLOBALMAPMOBRALLYKILLS: {
    task: 'Defeat World Map Boss',
    taskEn: 'Defeat World Map Boss',
    unit: 'bosses',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 2, 3]
  },
  QUEST_CHAIN_137: {
    task: 'Defeat World Map Boss',
    taskEn: 'Defeat World Map Boss',
    unit: 'bosses',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 2, 3]
  },
  LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED: {
    task: 'Collect Resources on Map',
    taskEn: 'Collect Resources on Map',
    unit: 'units',
    unitEn: 'units',
    category: 'Resources',
    ladder: [10000, 50000, 250000]
  },
  LIB_QUEST_TRANSLATE_UNITSTRAINED: {
    task: 'Train Troops in Barracks',
    taskEn: 'Train Troops in Barracks',
    unit: 'troops',
    unitEn: 'troops',
    category: 'Activities',
    ladder: [10, 30]
  },
  LIB_QUEST_TRANSLATE_BUILDINGLEVELANY: {
    task: 'Upgrade Building',
    taskEn: 'Upgrade Building',
    unit: 'buildings',
    unitEn: 'buildings',
    category: 'Activities',
    ladder: [1]
  },
  LIB_QUEST_TRANSLATE_PERSONALRESEARCHSTARTANY: {
    task: 'Start Research',
    taskEn: 'Start Research',
    unit: 'researches',
    unitEn: 'researches',
    category: 'Activities',
    ladder: [1]
  }
};

/**
 * Get metadata for a group by localeKey.
 */
export function getGroupMeta(localeKey?: string | null, fallbackTitle: string = 'Special Quest'): GroupTierMeta {
  if (localeKey && groupDefinitions[localeKey]) {
    return groupDefinitions[localeKey];
  }
  return {
    task: fallbackTitle || 'Special Quest',
    taskEn: fallbackTitle || 'Special Quest',
    unit: 'times',
    unitEn: 'times',
    category: 'Activities',
    defaultStep: 1
  };
}

/**
 * Calculate the target requirement for a specific tier.
 */
export function resolveTierTarget(quest: any, group: any, tierIndex: number, qAllEntry?: any): number {
  // 1. Direct explicit target in quest or qAllEntry
  const explicit = Number(
    quest?.condition?.target ??
    quest?.target ??
    qAllEntry?.condition?.target ??
    qAllEntry?.target
  );
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  // 2. Known CDN quest target
  if (quest?.id && knownQuestTargets[quest.id] != null) {
    return knownQuestTargets[quest.id]!;
  }

  // 3. Chain definition ladder
  const meta = getGroupMeta(group?.localeKey, group?.title);
  if (meta.ladder && Array.isArray(meta.ladder) && meta.ladder.length > 0) {
    const idx = tierIndex - 1;
    if (idx < meta.ladder.length && meta.ladder[idx] != null) {
      return meta.ladder[idx]!;
    }
    const last = meta.ladder[meta.ladder.length - 1] ?? 1;
    const prev = meta.ladder[meta.ladder.length - 2] || 0;
    const step = Math.max(1, last - prev);
    return last + step * (idx - meta.ladder.length + 1);
  }

  // 4. Default: tierIndex * step
  return tierIndex * (meta.defaultStep || 1);
}

/**
 * Resolve full tier details for rendering.
 */
export function resolveTierDetail(
  quest: any,
  group: any,
  tierIndex: number,
  qAllEntry?: any
): TierResolution {
  const meta = getGroupMeta(group?.localeKey, group?.title);
  const target = resolveTierTarget(quest, group, tierIndex, qAllEntry);
  const progress = Number(qAllEntry?.progress ?? quest?.progress) || 0;

  // Determine completion state
  const isCompleted =
    quest?.state === 'completed' ||
    quest?.state === 3 ||
    qAllEntry?.state === 3 ||
    (Number(quest?.completionCount) || 0) > 0;

  const isReady =
    !isCompleted &&
    (quest?.state === 2 ||
      quest?.state === 'ready' ||
      qAllEntry?.state === 2 ||
      (target > 0 && progress >= target));

  const state: 'completed' | 'ready' | 'inProgress' = isReady
    ? 'ready'
    : isCompleted
    ? 'completed'
    : 'inProgress';

  // Calculate percentage: if completed, 100%; otherwise clamped progress / target
  let percent = 0;
  if (isCompleted || isReady) {
    percent = 100;
  } else if (target > 0) {
    percent = Math.min(100, Math.max(0, Math.round((progress / target) * 100)));
  }

  const rawReward = qAllEntry?.reward || quest?.reward || null;
  const rewards = parseRewards(rawReward);

  const targetDisplay = `${formatNumber(target)} ${meta.unit}`;
  const progressDisplay = isCompleted
    ? `${formatNumber(target)} / ${targetDisplay} (100%)`
    : `${formatNumber(Math.min(progress, target))} / ${targetDisplay} (${percent}%)`;

  return {
    id: quest?.id ?? tierIndex,
    index: tierIndex,
    task: meta.task,
    taskEn: meta.taskEn,
    unit: meta.unit,
    unitEn: meta.unitEn,
    category: meta.category,
    target,
    progress,
    percent,
    state,
    targetDisplay,
    progressDisplay,
    completionCount: quest?.completionCount || 0,
    rewards,
    raw: quest
  };
}
