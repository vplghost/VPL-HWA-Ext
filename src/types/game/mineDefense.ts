export interface HospitalRoomInfo {
  capacity: number;
  wounded: number;
  free: number;
}

export interface MineAttackItem {
  mineId: number;
  impactAt: number;
  mapId: string;
  attackerId: string;
  routeId: string;
  [key: string]: any;
}

export interface ActiveIntercept {
  phase: 'clearing_slot' | 'swapping' | 'intercepting' | 'awaiting_switch' | 'switching_back';
  mineId: number;
  mapId: string;
  mineConfigId?: number;
  attackRouteId: string;
  impactAt: number;
  threatenedSquadId?: string;
  freedSquadId?: string;
  interceptSquadId?: string;
  farmingHeroIds?: number[];
  switchBackAt?: number;
  enemyAborted?: boolean;
  coordinates?: { x: number; y: number };
}

export interface MineDefensePlan {
  action: 'refresh' | 'wait' | 'recall' | 'clear_slot' | 'intercept' | 'switch_back';
  reason: string;
  attack?: MineAttackItem;
  march?: any;
  wakeAt?: number;
  call?: any;
  calls?: any[];
  mine?: any;
  room?: HospitalRoomInfo | null;
  count?: number;
  intercept?: ActiveIntercept;
  [key: string]: any;
}

export interface MineDefenseData {
  sources?: Record<string, { url: string; md5: string }>;
  capacities: Record<string | number, Record<string | number, number>>;
}
