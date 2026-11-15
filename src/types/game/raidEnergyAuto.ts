import type { RaidQueueOptions } from './raidQueue.ts';

export interface RaidEnergyRefillSource {
  amount: number;
  lastRefillAt: number;
  refillEveryMs: number;
  refillAmount: number;
  cap: number;
  [key: string]: any;
}

export interface RaidEnergyAutoConfig {
  enabled: boolean;
  accountId?: string | number;
  threshold?: number;
  options?: RaidQueueOptions;
  [key: string]: any;
}

export interface RaidEnergyAutoObservationState {
  key: string;
  accountId: string;
  tabId: number;
  sessionId: string;
  at: number;
  amount: number | null;
  source: RaidEnergyRefillSource | null;
}

export interface RaidEnergyAutoObservationResult {
  state: RaidEnergyAutoObservationState;
  trigger: boolean;
}
