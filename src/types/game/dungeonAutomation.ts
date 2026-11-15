export interface DungeonDoorEvaluation {
  teamNum: number;
  door: any;
  attackerType: string;
  defenderType: string;
  enemyPower: number;
  heroes: number[];
  pool: number[];
  deadCount: number;
  aliveCount: number;
  isPrime: boolean;
  intactness: {
    isIntact: boolean;
    casualties: boolean;
    aliveCount: number;
    totalCount: number;
    deadTitans: number[];
    aliveTitans: number[];
  };
  canAttack: boolean;
  priorityRank: number;
  disqualificationReason: string | null;
}

export interface DungeonDoorSelectionResult {
  chosen: DungeonDoorEvaluation | null;
  canAttack: boolean;
  reason: string;
  evaluations: DungeonDoorEvaluation[];
}

export interface DungeonPlanResult {
  kind: 'complete' | 'need-snapshot' | 'busy' | 'stop' | 'battle';
  teamNum?: number;
  heroes?: number[];
  attackerType?: string;
  door?: any;
  floorNumber?: number;
  call?: any;
  selection?: DungeonDoorSelectionResult;
  reason?: string;
  activeBattle?: any;
  evaluations?: DungeonDoorEvaluation[];
  [key: string]: any;
}

export type DungeonRunnerPhase =
  | 'planning'
  | 'acting'
  | 'starting-battle'
  | 'ending-battle'
  | 'waiting-battle'
  | 'complete'
  | 'stopped';

export interface DungeonRunnerState {
  id: string;
  tabId: number;
  accountId: string | number;
  phase: DungeonRunnerPhase;
  options?: any;
  statusText?: string;
  reason?: string;
  casualty?: any;
  wakeAt?: number | null;
  sentAt?: number;
  expected?: any;
  startedAt?: number;
  floorNumber?: number;
  teamNum?: number;
  heroes?: number[];
  attackerType?: string;
  door?: any;
  [key: string]: any;
}

export interface DungeonRunnerStepResult {
  state: DungeonRunnerState;
  calls?: any[];
  expiresAt?: number;
}
