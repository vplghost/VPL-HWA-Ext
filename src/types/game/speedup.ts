export type SpeedupType = 'speedUpConstruction' | 'speedUpResearch' | 'speedUpUnitHealing';

export type SpeedupKind = 'building' | 'research' | 'healing';

export interface SpeedupSourceMeta {
  url: string;
  md5: string;
}

export interface SpeedupDataStructure {
  sources: Record<SpeedupType, SpeedupSourceMeta>;
  durations: Record<SpeedupType, Record<string, number>>;
}

export interface SpeedupKindDef {
  method: string;
  feature: string;
  type: SpeedupType;
  id: string | null;
  status: string;
}

export interface SpeedupTargetInfo {
  kind: SpeedupKind;
  targetId: number | string;
  startDate: number;
  durationMs: number;
  level: number | null;
  endsAt: number;
  updatedAt?: string;
}

export interface SpeedupQuote extends SpeedupTargetInfo {
  accountId: string;
  itemId: number;
  amount: number;
  itemMs: number;
  totalMs: number;
  available: number;
}

export interface SpeedupValidationResult {
  kind: SpeedupKind;
  method: string;
  feature: string;
  type: SpeedupType;
  id: string | null;
  status: string;
  totalMs: number;
  item: {
    amount: number;
    id: number;
    type: string;
  };
}
