export interface CinemaPlacementReward {
  boxNum: number;
  reward?: {
    gold?: number;
    stamina?: number;
    coin?: Record<string, number>;
    fragmentHero?: Record<string, number>;
    consumable?: Record<string, number | string>;
    [key: string]: any;
  };
}

export interface CinemaCountersData {
  viewed?: number;
  available?: number;
  placementViewed?: number;
  placementAvailable?: number;
  placementRewards?: CinemaPlacementReward[];
  resetTime?: number;
  consolationPrize?: boolean;
  boxyResetTime?: number;
  [key: string]: any;
}

export interface CinemaGiveRewardResult {
  token: string;
  success: boolean;
  error?: string | null;
  boxNum?: number;
  type?: string;
  reward?: Record<string, any> | null;
  quests?: any[];
}
