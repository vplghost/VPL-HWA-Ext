export interface MonsterQueueOptions {
  mapId: number | string;
  center: { x: number; y: number };
  level: number;
  count: number;
  heroIds: number[];
  teamId?: string;
  firstMobId?: string | number;
  autoHealAfterQueue?: boolean;
  maxTroops?: number | null;
  capacitySettings?: any;
  [key: string]: any;
}

export type MonsterQueuePhase =
  | 'refreshing'
  | 'searching'
  | 'attacking'
  | 'active'
  | 'complete'
  | 'stopped';

export interface MonsterCurrentTarget {
  mobId: string | number;
  mobConfigId?: string | number | null;
  mapId: number | string;
  squadId?: string | number;
  routeId?: string | number;
  arrivalAt?: number | null;
  returnAt?: number | null;
  result?: string;
  resultAt?: number;
  returned?: boolean;
  [key: string]: any;
}

export interface MonsterQueueState {
  id: string;
  tabId: number;
  accountId: string | number;
  options: MonsterQueueOptions;
  started: number;
  completed: number;
  phase: MonsterQueuePhase;
  current: MonsterCurrentTarget | null;
  targets: any[];
  attackedMobIds: Array<string | number>;
  recentResults: any[];
  sentAt?: number;
  wakeAt?: number | null;
  expected?: any[];
  squad?: any;
  roster?: any;
  reason?: string;
  [key: string]: any;
}

export interface MonsterQueueStepResult {
  state: MonsterQueueState;
  calls?: any[];
  expiresAt?: number;
}
