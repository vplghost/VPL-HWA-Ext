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

export interface MineDefensePlan {
  action: 'refresh' | 'wait' | 'recall';
  reason: string;
  attack?: MineAttackItem;
  march?: any;
  wakeAt?: number;
  call?: any;
  mine?: any;
  room?: HospitalRoomInfo | null;
  count?: number;
  [key: string]: any;
}

export interface MineDefenseData {
  sources?: Record<string, { url: string; md5: string }>;
  capacities: Record<string | number, Record<string | number, number>>;
}
