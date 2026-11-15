export interface BuildingLevelMeta {
  d: number; // base duration in seconds
  c?: Record<string | number, number>; // costs by material id (e.g. 2: stone, 3: iron, 4: wood, 5: food)
  r?: [number, number][]; // requirements: [buildingId, minLevel]
}

export type BuildingLevelsDict = Record<string | number, Record<string | number, BuildingLevelMeta>>;

export interface MissingBuildingRequirement {
  buildingId: number;
  requiredLevel: number;
  currentLevel: number;
}

export interface MissingBuildingCost {
  materialId: number;
  required: number;
  current: number;
}

export interface BuildingQueueItem {
  buildingId: number;
  currentLevel: number;
  nextLevel: number;
  durationMs: number;
  addedAt?: number;
  estStart?: number;
  estFinish?: number;
  [key: string]: any;
}
