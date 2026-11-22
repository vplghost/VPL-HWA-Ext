import type { BuildingQueueItem } from './building.ts';

export type { BuildingQueueItem };

export interface BuildingQueueState {
  enabled?: boolean;
  maxSlots?: number;
  items: BuildingQueueItem[];
  wakeAt?: number | null;
}

export interface BuildingQueueCandidate {
  id: number;
  currentLevel: number;
  nextLevel: number;
  isBuilt: boolean;
  durationMs: number;
}

export interface BuildingQueueTimeline {
  items: BuildingQueueItem[];
  totalDurationMs: number;
  allDoneAt: number;
  builderFreeAt: number;
}

export interface BuildingQueuePlanResult {
  action: 'wait' | 'start' | 'complete-only' | 'idle';
  wakeAt: number | null;
  calls: any[];
  skippedItems: any[];
  remainingItemsAfterSkip: BuildingQueueItem[];
  startedItem?: BuildingQueueItem;
  remainingItems?: BuildingQueueItem[];
}
