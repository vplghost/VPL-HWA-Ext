import type { BasicResourceType } from './march.ts';

export interface AutoGatherSettings {
  enabled: boolean;
  smartEnabled: boolean;
  maxMarches: number;
  mineLevel: number | 'nearest';
  mineType: 'rotate' | BasicResourceType | string;
  lastAutoMineType?: BasicResourceType | string | null;
  selectedTeam?: string;
  optimizeTeam?: boolean;
  [key: string]: any;
}

export interface AutoGatherPlanResult {
  action: 'idle' | 'wait' | 'refresh' | 'recall' | 'search' | 'gather' | 'target' | 'probe';
  reason?: string;
  calls?: any[];
  call?: any;
  mineType?: string;
  mineLevel?: number | string;
  mineId?: string | number;
  pending?: any;
  nextLastAutoMineType?: string;
  activeCount?: number;
  maxMarches?: number;
  nearest?: any;
  rows?: any[];
  march?: any;
  [key: string]: any;
}

export interface SmartGatherNearestCandidate {
  mineId: string | number;
  coordinates: { x: number; y: number };
  configId: number | string;
  checkedAt?: number;
  estimatedSeconds?: number;
}

export interface SmartGatherNearestState {
  mapId: number | string;
  center: { x: number; y: number };
  type: string;
  levels: number[];
  candidates: SmartGatherNearestCandidate[];
  startedAt: number;
  selected?: SmartGatherNearestCandidate | null;
  exhaustedAt?: number;
}

export interface SmartGatherInterruptedMine {
  mineId: string | number;
  mapId: number | string;
  configId: number | string;
  [key: string]: any;
}

export interface SmartGatherDailyRow {
  type: string;
  target: number;
  progress: number;
  estimated: number;
  done: boolean;
  squads: any[];
}

export interface SmartGatherState {
  accountId?: string | number;
  interrupted?: SmartGatherInterruptedMine[];
  rejectedMines?: Array<{ mineId: string | number; expiresAt: number; reason: string }>;
  nearest?: SmartGatherNearestState | null;
  resumeCandidate?: { mineId: string | number; checkedAt: number } | null;
  dailyBaseline?: { dayStart: number; resources: Record<string, { progress: number; since: number }> };
  pending?: any;
  error?: string;
  notice?: { at: number; expiresAt?: number; message: string };
  lastAutoMineType?: string;
  reservation?: any;
  readTimeout?: { key: string; attempts: number };
  marchLimitBackoffUntil?: number;
  [key: string]: any;
}
