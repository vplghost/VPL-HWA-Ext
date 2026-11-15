export interface ResearchLevelMeta {
  d: number; // base duration in seconds
  b?: number; // Research Center min building level
  c?: Record<string | number, number>; // costs by material id
  r?: [number, number][]; // prerequisite researches: [researchId, minLevel]
}

export interface ResearchTechMeta {
  t?: 'growth' | 'heroes' | 'economy' | 'battle' | 'growth_pro' | 'economy_pro' | 'tactical_classes' | string;
  [level: string]: ResearchLevelMeta | string | undefined;
}

export type ResearchDataDict = Record<string | number, ResearchTechMeta>;

export type MissingResearchRequirement =
  | { type: 'unknownResearch'; researchId: number }
  | { type: 'maxLevel'; researchId: number; current: number; max: number }
  | { type: 'notFound'; researchId: number; level: number }
  | { type: 'research'; researchId: number; required: number; current: number }
  | { type: 'building'; buildingId: number; required: number; current: number };

export interface MissingResearchCost {
  materialId: number;
  required: number;
  current: number;
  deficit: number;
}

export interface ResearchQueueItem {
  researchId: number;
  currentLevel: number;
  nextLevel: number;
  durationMs: number;
  estStart?: number;
  estFinish?: number;
}
