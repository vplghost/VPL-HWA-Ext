export interface FrontierDefender {
  id: number;
  level: number;
  color: number;
  star: number;
  power: number;
  skinData?: {
    id: number;
    rank?: number;
    color?: number;
  };
  talisman?: {
    id: number;
    level?: number;
    traitIds?: number[];
  };
}

export interface FrontierMission {
  position: number;
  preset_id?: number;
  defender_packs?: FrontierDefender[][];
  reward?: {
    coin?: Record<string, number>;
  };
  world?: number;
}

export interface FrontierState {
  mission: FrontierMission;
  skip?: any;
}

export interface FrontierChestData {
  reward?: {
    coin?: Record<string, number>;
  };
  filled_in_percents?: number;
  collected_at?: number;
}

export interface FrontierFightResult {
  win: boolean;
  reward?: any;
  lostBattle?: any;
  heroPacks?: number[][];
  stage?: number;
}

export interface FrontierDailyProgress {
  date: string;
  clearedCount: number;
  clearedStages: number[];
  coinsEarned?: number;
}

export interface FrontierActivityState {
  state: 'pending' | 'done' | 'info' | 'unknown';
  detail: string;
  isInteractive?: boolean;
  currentStage?: number;
  world?: number;
  enemyPower?: number;
  todayCleared?: number;
  chestPercent?: number;
  chestCoins?: number;
}
