export interface TroopTrainSettings {
  maxTargets?: Record<string, number>;
  trainLevels?: Record<string, number>;
}

export interface TroopUnitState {
  type: 0 | 1 | 2; // 0: Marksmen, 1: Spearmen, 2: Infantry
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
  registrationTime?: number;
  [key: string]: any;
}

export interface AutoGatherSettings {
  enabled: boolean;
  maxMarches: number;
  mineLevel: number;
  mineType: 'rotate' | 'gold' | 'food' | 'wood' | 'stone' | 'iron';
  lastAutoMineType: string | null;
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

