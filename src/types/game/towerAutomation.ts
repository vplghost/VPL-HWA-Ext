export interface TowerAutomationPlanResult {
  kind: 'complete' | 'need-snapshot' | 'rpc' | 'battle' | 'stop';
  call?: any;
  floor?: number;
  room?: number;
  team?: number[];
  skipState?: any;
  reason?: string;
  [key: string]: any;
}

export type TowerRunnerPhase =
  | 'planning'
  | 'acting'
  | 'starting-battle'
  | 'ending-battle'
  | 'waiting-battle'
  | 'complete'
  | 'stopped';

export interface TowerRunnerState {
  id: string;
  tabId: number;
  accountId: string | number;
  phase: TowerRunnerPhase;
  buffPriority: number[];
  heroes: number[];
  startedAt: number;
  sentAt?: number;
  wakeAt?: number | null;
  expected?: any;
  floor?: number;
  room?: number;
  reason?: string;
  [key: string]: any;
}

export interface TowerRunnerStepResult {
  state: TowerRunnerState;
  calls?: any[];
  expiresAt?: number;
}
