export interface AttentionBonusItem {
  id: number;
  endTime: number;
  refreshTime: number;
  collected: boolean;
}

export interface AttentionBonusStatusData {
  bonuses: Record<number, AttentionBonusItem>;
}

export interface AttentionBonusCollectResult {
  token: string;
  id?: number;
  success: boolean;
  error?: string | null;
  bonuses?: AttentionBonusItem[];
}

export interface AttentionBonusAvailability {
  ready: boolean;
  availableCount: number;
  readyBonusIds: number[];
  nextRefreshSeconds: number | null;
}
