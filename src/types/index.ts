export interface TroopTrainSettings {
  autoTrainEnabled?: boolean;
  maxTargets?: Record<string | number, number>;
  trainLevels?: Record<string | number, number>;
}

export interface TroopHealSettings {
  autoHealEnabled: boolean;
  /** 0 = Auto (1 strongest 5-hero team / 3 per troop type); >0 = manual cap per troop type (100..50000) */
  batchPerType: number;
  /** Prioritize healing troop types that are below (maxMarches + 1 defense) team target */
  prioritizeTeamDemand: boolean;
  /** Minimum wounded troops in infirmary before starting an auto-heal batch (ignored when shortfall > 0) */
  minInjuredToStart: number;
  /** When true, stop auto-healing once (maxMarches + 1) ready target is met */
  onlyHealTeamShortfall: boolean;
  /** Optional max duration per batch in minutes (0 = no duration cap) */
  maxBatchDurationMin?: number;
}

export interface AutoHealState {
  status?: string;
  lastAction?: string;
  lastError?: string | null;
  lastRunAt?: number;
  nextWakeAt?: number | null;
  nextRetryAt?: number | null;
  updatedAt?: number;
  queued?: boolean;
}

export interface TroopUnitState {
  type: 0 | 1 | 2; // 0: Infantry, 1: Spearmen, 2: Marksmen
  label: string;
  icon: string;
  badgeCls: string;
  readyByLevel: Map<number, number>;
  readyCount: number;
  hospitalCount: number;
  healingActiveCount: number;
  healingEndsAt: number | null;
  trainingCount: number;
  trainingEndsAt: number | null;
  promotingCount?: number;
  isPromoting?: boolean;
  maxTroops: number | null;
}

export interface RpcCache {
  getUnitSummary?: { data?: any };
  'getUnitSummary:unit'?: { data?: any };
  getHealing?: { data?: any };
  'getHealing:unit'?: { data?: any };
  getTrainings?: { data?: any };
  'getTrainings:unit'?: { data?: any };
  inventoryGet?: { data?: any };
  clan_getSummary?: { data?: any };
  accountStatus?: { data?: any };
  heroGetAll?: { data?: any };
  titanGetAll?: { data?: any };
  dungeonGetInfo?: { data?: any };
  towerGetInfo?: { data?: any };
  quest_getAll?: { data?: any };
  building_getQueue?: { data?: any };
  research_getQueue?: { data?: any };
  cinemaGetCounters?: { data?: import('./game/cinema').CinemaCountersData; updatedAt?: string };
  cinemaGiveRewardStatus?: { data?: import('./game/cinema').CinemaGiveRewardResult; updatedAt?: string };
  eternalStoryStatus?: { data?: import('./game/frontier').FrontierState; updatedAt?: string };
  eternalStoryChestStatus?: { data?: import('./game/frontier').FrontierChestData; updatedAt?: string };
  eternalStoryDailyProgress?: { data?: import('./game/frontier').FrontierDailyProgress; updatedAt?: string };
  eternalStoryTeam?: { data?: { units: number[][] }; updatedAt?: string };
  registrationTime?: number;
  [key: string]: any;
}

export interface AutoGatherSettings {
  enabled: boolean;
  maxMarches: number;
  mineLevel: number;
  mineType: 'rotate' | 'gold' | 'food' | 'wood' | 'stone' | 'iron';
  lastAutoMineType: string | null;
  selectedTeam?: string;
  optimizeTeam?: boolean;
}

export interface TabConfigItem {
  id: string;
  label: string;
  visible: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export * from './game/building';
export * from './game/research';
export * from './game/hero';
export * from './game/titan';
export * from './game/campaign';
export * from './game/item';
export * from './game/cinema';
export * from './game/quest';
export * from './game/tower';
export * from './game/refillable';
export * from './game/speedup';
export * from './game/clanVersus';
export * from './game/march';
export * from './game/tracking';
export * from './game/freeAlchemy';
export * from './game/mineDefense';
export * from './game/mail';
export * from './game/worldRead';
export * from './game/buildingQueue';
export * from './game/researchQueue';
export * from './game/raidQueue';
export * from './game/monsterQueue';
export * from './game/raidEnergyAuto';
export * from './game/gatherQueue';
export * from './game/towerAutomation';
export * from './game/dungeonAutomation';
export * from './game/attentionBonus';
export * from './game/frontier';
export * from './game/rpcCache';

