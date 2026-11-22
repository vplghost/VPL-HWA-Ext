import type { ResearchQueueItem } from './research.ts';

export type { ResearchQueueItem };

export interface ResearchQueueState {
  enabled?: boolean;
  items: ResearchQueueItem[];
  wakeAt?: number | null;
}

export interface ResearchQueueTimeline {
  items: ResearchQueueItem[];
  totalDurationMs: number;
  allDoneAt: number;
  researcherFreeAt: number;
}

export interface ResearchQueuePlanResult {
  action: 'wait' | 'start' | 'complete-only' | 'idle';
  wakeAt: number | null;
  calls: any[];
  skippedItems: any[];
  remainingItemsAfterSkip: ResearchQueueItem[];
  startedItem?: ResearchQueueItem;
  remainingItems?: ResearchQueueItem[];
  reason?: string;
}
