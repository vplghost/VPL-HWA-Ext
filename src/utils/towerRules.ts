import { towerRules } from '../data/towerData.ts';

// Shared generated splitlib configuration is also loaded by the classic worker.
export const TOWER_FLOOR_COUNT: number = towerRules.floorCount ?? 23;
