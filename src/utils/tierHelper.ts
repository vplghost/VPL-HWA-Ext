/**
 * Tier Helper for Event Viewer & Milestones.
 * Resolves detailed tier information including:
 * - Công việc phải thực hiện (Task/Objective description)
 * - Đơn vị tính (Unit of measurement)
 * - Mức của từng tier (Requirement target/threshold)
 * - Tiến độ so với mức yêu cầu và tỷ lệ %
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
  13427: 5, 13428: 10, 13429: 90, 13430: 9, 13431: 18, 13432: 6, 13433: 8
};

// Definitions for event groups / chains
const groupDefinitions: Record<string, GroupTierMeta> = {
  QUEST_TAB_NAME_LOGIN: {
    task: 'Đăng nhập hàng ngày',
    taskEn: 'Daily Sign In',
    unit: 'ngày',
    unitEn: 'days',
    category: 'Activities',
    ladder: [1, 2, 3, 4, 5, 6, 7]
  },
  QUEST_TAB_NAME_GET_VIP: {
    task: 'Tích lũy điểm VIP',
    taskEn: 'Obtain VIP Points',
    unit: 'điểm VIP',
    unitEn: 'VIP points',
    category: 'Activities',
    ladder: [100, 300, 1000, 2500, 4500, 7000, 9000]
  },
  LIB_PSEUDO_STARMONEY: {
    task: 'Chi tiêu Emeralds',
    taskEn: 'Spend Emeralds',
    unit: 'Emeralds',
    unitEn: 'Emeralds',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2500, 5000, 8000, 12000, 18000, 25000, 35000, 50000, 65000, 80000, 100000, 120000]
  },
  LIB_PSEUDO_STAMINA: {
    task: 'Tiêu hao Năng lượng',
    taskEn: 'Spend Energy',
    unit: 'Energy',
    unitEn: 'Energy',
    category: 'Resources',
    ladder: [100, 300, 500, 1000, 1500, 2500, 4000, 6000, 8000, 10000, 13000, 16000]
  },
  UI_FEATURE_HUB_ARENA_TITLE: {
    task: 'Chiến đấu trong Arena',
    taskEn: 'Fight in Arena',
    unit: 'trận',
    unitEn: 'battles',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 15, 20, 25]
  },
  QUEST_TAB_NAME_HYDRA: {
    task: 'Tấn công đầu Boss Hydra',
    taskEn: 'Fight Hydra Heads',
    unit: 'lượt',
    unitEn: 'attacks',
    category: 'Activities',
    ladder: [1, 3, 6, 9, 12, 15, 18]
  },
  STRATEGIC_GLOBAL_MAP_RALLY_POPUP_TITLE: {
    task: 'Tiêu diệt Boss bản đồ thế giới',
    taskEn: 'Defeat World Map Bosses',
    unit: 'Boss',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 12, 15]
  },
  UI_DIALOG_BOSS_TITLE: {
    task: 'Tiêu diệt Boss bản đồ thế giới',
    taskEn: 'Defeat World Map Bosses',
    unit: 'Boss',
    unitEn: 'bosses',
    category: 'Activities',
    ladder: [1, 3, 5, 7, 10, 12, 15]
  },
  QUEST_TAB_NAME_TOWER_CHESTS: {
    task: 'Mở rương Tháp Tower',
    taskEn: 'Open Tower Chests',
    unit: 'rương',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 3, 5, 10, 20, 35, 50]
  },
  UI_DIALOG_ARTIFACT_CHEST_DROP_PACK1: {
    task: 'Mở rương Artifact',
    taskEn: 'Open Artifact Chests',
    unit: 'rương',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 3, 5, 10, 20, 35, 50]
  },
  UI_HEROIC_CHEST_MAIN_TITLE: {
    task: 'Mở rương Heroic Chest',
    taskEn: 'Open Heroic Chests',
    unit: 'rương',
    unitEn: 'chests',
    category: 'Activities',
    ladder: [1, 2, 5, 10, 20, 30, 50]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_143: {
    task: 'Vượt tầng Tháp Tower',
    taskEn: 'Tower Floor Progress',
    unit: 'tầng',
    unitEn: 'floors',
    category: 'Activities',
    ladder: [5, 10, 15, 20, 30, 40, 50]
  },
  STRATEGIC_BASE_INTERFACE_BUTTON_SPEEDUPS: {
    task: 'Sử dụng thẻ tăng tốc trong Thành',
    taskEn: 'Use Speedups in City',
    unit: 'phút',
    unitEn: 'minutes',
    category: 'Resources',
    ladder: [60, 180, 360, 720, 1440, 2880, 4320]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_SPEEDUP: {
    task: 'Sử dụng thẻ tăng tốc huấn luyện',
    taskEn: 'Use Training Speedups',
    unit: 'phút',
    unitEn: 'minutes',
    category: 'Resources',
    ladder: [60, 180, 360, 720, 1440, 2880, 4320]
  },
  STRATEGIC_BASE_INTERFACE_TROOPS_TRAIN: {
    task: 'Huấn luyện quân đội tại Trại lính',
    taskEn: 'Train Troops in Barracks',
    unit: 'lính',
    unitEn: 'troops',
    category: 'Activities',
    ladder: [50, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_TROOPS: {
    task: 'Huấn luyện quân đội tại Trại lính',
    taskEn: 'Train Troops in Barracks',
    unit: 'lính',
    unitEn: 'troops',
    category: 'Activities',
    ladder: [50, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  UI_CLANBOSS_MENU_ALTAR: {
    task: 'Cầu nguyện tại Bàn thờ Altar',
    taskEn: 'Pray at Clan Altar',
    unit: 'lần',
    unitEn: 'prayers',
    category: 'Activities',
    ladder: [1, 3, 5, 8, 12, 16, 20, 25, 30]
  },
  UI_DIALOG_RATING_TAB_CLAN: {
    task: 'Tích lũy điểm hoạt động Guild',
    taskEn: 'Earn Guild Activity Points',
    unit: 'điểm',
    unitEn: 'points',
    category: 'Guild',
    ladder: [200, 400, 800, 1200, 1600, 2000, 2500, 3000, 3500, 4000, 4500]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_48: {
    task: 'Tích lũy điểm hoạt động Guild',
    taskEn: 'Clan Clash Activity Points',
    unit: 'điểm',
    unitEn: 'points',
    category: 'Guild',
    ladder: [200, 400, 800, 1200, 1600, 2000, 2500, 3000, 3500, 4000, 4500]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_64: {
    task: 'Khai thác Titanite trong Dungeon',
    taskEn: 'Collect Titanite in Dungeon',
    unit: 'Titanite',
    unitEn: 'Titanite',
    category: 'Guild',
    ladder: [65, 130, 190, 250, 350, 450, 600, 750, 1000, 1250]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_9: {
    task: 'Chiến đấu Clash of Worlds',
    taskEn: 'Clash of Worlds Battles',
    unit: 'trận',
    unitEn: 'battles',
    category: 'Guild',
    ladder: [1, 3, 5, 7, 10, 15]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_763: {
    task: 'Tấn công Boss Titan / Clan Boss',
    taskEn: 'Titan Power & Boss Attacks',
    unit: 'lượt',
    unitEn: 'attacks',
    category: 'Guild',
    ladder: [1, 3, 5, 7, 9, 12, 15, 18]
  },
  LIB_COIN_NAME_18: {
    task: 'Thu thập Fairy Dust',
    taskEn: 'Collect Fairy Dust',
    unit: 'Fairy Dust',
    unitEn: 'Fairy Dust',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]
  },
  LIB_CONSUMABLE_NAME_20: {
    task: 'Tiêu hao Titan Potion',
    taskEn: 'Spend Titan Potion',
    unit: 'Titan Potion',
    unitEn: 'Titan Potion',
    category: 'Resources',
    ladder: [500, 1500, 3000, 6000, 12000, 25000, 50000, 75000, 100000, 150000]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_969: {
    task: 'Cường hóa Rune Stones',
    taskEn: 'Upgrade Rune Stones',
    unit: 'viên',
    unitEn: 'stones',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 13000, 16000, 20000, 25000, 30000, 36000, 42000, 49000, 56000, 64000]
  },
  EVENT_GLORY_NAME_QUEST_1: {
    task: 'Tích lũy điểm Rising Legend Glory',
    taskEn: 'Earn Glory Points',
    unit: 'điểm',
    unitEn: 'points',
    category: 'Activities',
    ladder: [5, 10, 15, 20, 25, 35, 50, 75, 100, 130, 170, 220, 280, 350, 430, 520, 620]
  },
  EVENT_GLORY_NAME_QUEST_2: {
    task: 'Tham gia trận Trial of Legends',
    taskEn: 'Trial of Legends Battles',
    unit: 'trận',
    unitEn: 'battles',
    category: 'Activities',
    ladder: [1, 2, 3, 5, 7, 10, 13, 16, 20, 25, 30, 36, 43, 50, 60]
  },
  QUEST_TAB_NAME_ARTLEVEL: {
    task: 'Nâng cấp cấp độ Hero Artifact',
    taskEn: 'Level Up Hero Artifacts',
    unit: 'cấp',
    unitEn: 'levels',
    category: 'Hero Growth',
    ladder: [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]
  },
  UI_DIALOG_HERO_ARTIFACTS_ARTIFACT_EVOLUTION: {
    task: 'Tiến hóa sao Artifact',
    taskEn: 'Evolve Hero Artifacts',
    unit: 'sao',
    unitEn: 'stars',
    category: 'Hero Growth',
    ladder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  },
  QUEST_TAB_NAME_HERO_RANK: {
    task: 'Thăng bậc phẩm chất Hero',
    taskEn: 'Promote Hero Rank',
    unit: 'bậc',
    unitEn: 'ranks',
    category: 'Hero Growth',
    ladder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
  },
  QUEST_TAB_HERO_LEVEL: {
    task: 'Tăng cấp độ level Hero',
    taskEn: 'Level Up Heroes',
    unit: 'cấp',
    unitEn: 'levels',
    category: 'Hero Growth',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
  },
  RECOMMENDATION_RUNES_NEW: {
    task: 'Nâng cấp các loại Rune',
    taskEn: 'Upgrade Runes',
    unit: 'cấp Rune',
    unitEn: 'runes',
    category: 'Hero Growth',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
  },
  LIB_SPECIAL_QUEST_EVENT_NAME_38: {
    task: 'Thăng bậc quà Titan (Gift of Elements)',
    taskEn: 'Level Up Titan Gift',
    unit: 'bậc',
    unitEn: 'tiers',
    category: 'Hero Growth',
    ladder: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]
  },
  QUEST_TAB_NAME_SKINSTONES_SPEND: {
    task: 'Tiêu hao Hero Skin Stones',
    taskEn: 'Spend Hero Skin Stones',
    unit: 'đá Skin',
    unitEn: 'skin stones',
    category: 'Resources',
    ladder: [100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 25000]
  },
  QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND: {
    task: 'Tiêu hao Titan Skin Stones',
    taskEn: 'Spend Titan Skin Stones',
    unit: 'đá Skin Titan',
    unitEn: 'titan skin stones',
    category: 'Resources',
    ladder: [15, 50, 100, 250, 500, 1000, 2000, 3500, 5000]
  },
  STRATEGIC_RESOURCE_12_NAME: {
    task: 'Khai thác mỏ Sắt/Quặng trên bản đồ',
    taskEn: 'Gather Iron / Ore on Map',
    unit: 'Sắt',
    unitEn: 'iron',
    category: 'Resources',
    ladder: [10000, 25000, 50000, 100000, 250000, 500000, 1000000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_PVPKILLUNITS: {
    task: 'Tiêu diệt quân địch trong trận PvP',
    taskEn: 'Defeat Enemy Units in PvP',
    unit: 'lính',
    unitEn: 'units',
    category: 'Activities',
    ladder: [50, 150, 350, 750, 1500, 3000, 5000, 8000, 12000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_LOSEUNITS: {
    task: 'Tham gia giao chiến PvP',
    taskEn: 'PvP Unit Battles',
    unit: 'lính',
    unitEn: 'units',
    category: 'Activities',
    ladder: [50, 150, 350, 750, 1500, 3000, 5000, 8000, 12000]
  },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TEST_WENDYGIFT: {
    task: 'Nhận quà hàng ngày của Wendy',
    taskEn: "Wendy's Daily Gift",
    unit: 'quà',
    unitEn: 'gifts',
    category: 'Activities',
    ladder: [350, 600, 900, 1500, 3000, 6000, 10000, 17000, 25000, 35000, 45000, 60000, 75000, 90000]
  },
  UI_HERO78_TITLE: {
    task: 'Hoàn thành nhiệm vụ sự kiện tướng',
    taskEn: 'Complete Hero Event Quests',
    unit: 'nhiệm vụ',
    unitEn: 'quests',
    category: 'Activities',
    ladder: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  },
  LIB_TEST_BP_DAILY_QUESTS: {
    task: 'Nhiệm vụ hàng ngày Battle Pass',
    taskEn: 'Battle Pass Daily Quests',
    unit: 'nhiệm vụ',
    unitEn: 'quests',
    category: 'Activities',
    ladder: [1, 2, 3, 5, 7, 9, 11]
  },
  LIB_TEST_BP_SINGLE_QUESTS: {
    task: 'Mốc thử thách Battle Pass',
    taskEn: 'Battle Pass Milestones',
    unit: 'mốc',
    unitEn: 'milestones',
    category: 'Activities',
    ladder: [1, 2, 3, 5, 7, 10, 12]
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
    task: fallbackTitle || 'Nhiệm vụ sự kiện',
    taskEn: fallbackTitle || 'Special Quest',
    unit: 'lần',
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
  if (quest?.id && knownQuestTargets[quest.id]) {
    return knownQuestTargets[quest.id];
  }

  // 3. Chain definition ladder
  const meta = getGroupMeta(group?.localeKey, group?.title);
  if (meta.ladder && Array.isArray(meta.ladder) && meta.ladder.length > 0) {
    const idx = tierIndex - 1;
    if (idx < meta.ladder.length) {
      return meta.ladder[idx];
    }
    const last = meta.ladder[meta.ladder.length - 1];
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
  const isReady = quest?.state === 2 || quest?.state === 'ready' || qAllEntry?.state === 2;
  const isCompleted =
    quest?.state === 'completed' ||
    quest?.state === 3 ||
    qAllEntry?.state === 3 ||
    (quest?.completionCount && quest.completionCount > 0);

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
