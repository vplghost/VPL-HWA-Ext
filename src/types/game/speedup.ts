export type SpeedupType = 'speedUpConstruction' | 'speedUpResearch' | 'speedUpUnitHealing';

export interface SpeedupSourceMeta {
  url: string;
  md5: string;
}

export interface SpeedupDataStructure {
  sources: Record<SpeedupType, SpeedupSourceMeta>;
  durations: Record<SpeedupType, Record<string, number>>;
}
