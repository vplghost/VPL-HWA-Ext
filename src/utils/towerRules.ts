import '../../extension/tower-rules.js';

// Shared generated splitlib configuration is also loaded by the classic worker.
export const TOWER_FLOOR_COUNT: number = (globalThis as any).hwaHelperTowerRules.floorCount;
