export interface RaidQueueOptions {
  mapId: number | string;
  center: { x: number; y: number };
  level: number;
  waitSeconds: number;
  count: number;
  minMembers: number;
  autoCancel?: boolean;
  maxTroops?: number | null;
  heroIds: number[];
  teamId?: string;
  firstMobId?: string | number;
  capacitySettings?: any;
  [key: string]: any;
}

export interface RaidBossQueue {
  remain_raid_count: number;
  queue: Array<{ mobId: string | number; [key: string]: any }>;
}

export interface RaidCurrentTarget {
  mobId: string | number;
  mapId: number | string;
  rallyId?: string | number;
  squadId?: string | number;
  waitUntil?: number;
  members?: any;
  membersAt?: number;
  memberChecked?: boolean;
  rallyVersion?: number;
  arrivalAt?: number;
  departed?: boolean;
  result?: 'win' | 'lose' | 'loss' | 'defeat' | string;
  resultAt?: number;
  returned?: boolean;
  [key: string]: any;
}

export type RaidQueuePhase =
  | 'refreshing'
  | 'waiting_rally'
  | 'searching'
  | 'creating'
  | 'active'
  | 'cancelling'
  | 'complete'
  | 'stopped';

export interface RaidQueueState {
  id: string;
  tabId: number;
  accountId: string | number;
  options: RaidQueueOptions;
  started: number;
  completed: number;
  phase: RaidQueuePhase;
  current: RaidCurrentTarget | null;
  bossQueue: RaidBossQueue;
  failedBossIds: Array<string | number>;
  wonBossIds: Array<string | number>;
  sentAt?: number;
  wakeAt?: number | null;
  expected?: any[];
  searchedAt?: number;
  squad?: any;
  roster?: any;
  reason?: string;
  [key: string]: any;
}

export interface RaidQueueStepResult {
  state: RaidQueueState;
  calls?: any[];
  expiresAt?: number;
}
