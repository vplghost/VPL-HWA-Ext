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
