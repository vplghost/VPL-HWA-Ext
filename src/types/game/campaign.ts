export interface CampaignMissionDrops {
  gear: number[];
  fragmentGear: number[];
  scroll: number[];
  fragmentScroll: number[];
}

export interface CampaignMission {
  id: number;
  chapter: number;
  index: number;
  isHeroic: boolean;
  cost: number;
  drops: CampaignMissionDrops;
}

export type CampaignMissionsDict = Record<string, CampaignMission>;
export type ItemDropsDict = Record<string, number[]>;

export interface MissionProgress {
  id?: number | string;
  stars?: number;
  todayTries?: number;
  resetToday?: number;
  triesSpent?: number;
  [key: string]: any;
}

export interface MissionTriesInfo {
  isHeroic: boolean;
  maxTries: number;
  triesSpent: number;
  triesLeft: number;
}

export interface MissionRaidOptions {
  disabledIds?: Set<number> | number[] | { has: (id: number) => boolean };
  maxCost?: number;
  [key: string]: any;
}

export type MissionCostPair = [startCost: number, totalWinCost: number];

export type MissionCostsMap = Record<string, MissionCostPair>;

