import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSimulatedLevels as getSimulatedBuildingLevels,
  getEligibleCandidates,
  extractQueues as extractBuildingQueues,
  getQueueEnd as getBuildingQueueEnd,
  calculateQueueTimeline as calculateBuildingQueueTimeline,
  planNextStep as planBuildingNextStep,
  addToQueue as addBuildingToQueue,
  removeFromQueue as removeBuildingFromQueue,
  reorderQueue as reorderBuildingQueue,
  clearQueue as clearBuildingQueue,
  buildingQueueService,
} from '../src/services/queues/buildingQueue.ts';

import {
  getSimulatedLevels as getSimulatedResearchLevels,
  extractQueues as extractResearchQueues,
  getQueueEnd as getResearchQueueEnd,
  calculateQueueTimeline as calculateResearchQueueTimeline,
  extractResearchLevels,
  planNextStep as planResearchNextStep,
  addToQueue as addResearchToQueue,
  removeFromQueue as removeResearchFromQueue,
  reorderQueue as reorderResearchQueue,
  clearQueue as clearResearchQueue,
  researchQueueService,
} from '../src/services/queues/researchQueue.ts';

test('buildingQueueService - simulation and eligible candidates', () => {
  const buildingMap = new Map([
    { id: 20, level: 19 },
    { id: 43, level: 19 },
    { id: 162, level: 19 },
  ].map((b) => [b.id, b]));
  const rawQueues = [{ buildingId: 20, level: 20 }];
  const queueItems = [{ buildingId: 43, nextLevel: 20 }];

  const simulated = getSimulatedBuildingLevels(buildingMap, rawQueues, queueItems);
  assert.equal(simulated.get(20), 20);
  assert.equal(simulated.get(43), 20);
  assert.equal(simulated.get(162), 19);

  // Eligible candidates
  const allBuildings = [
    { id: 20, isBuilt: true, level: 19 },
    { id: 43, isBuilt: true, level: 19 },
    { id: 162, isBuilt: true, level: 19 },
    { id: 44, isBuilt: true, level: 1 }, // System landmark - should be excluded
  ];

  const candidates = getEligibleCandidates(allBuildings, simulated);
  assert.ok(candidates.length > 0);
  assert.ok(!candidates.some((c) => c.id === 44), 'Landmarks must be excluded');
  assert.ok(candidates.some((c) => c.id === 162), 'Infirmary should be eligible when Hall 20 is simulated');
});

test('buildingQueueService - queue mutations, timeline, and planning', () => {
  let state = { enabled: true, items: [] };

  state = addBuildingToQueue(state, { buildingId: 1, nextLevel: 2, durationMs: 5000 });
  state = addBuildingToQueue(state, { buildingId: 2, nextLevel: 3, durationMs: 10000 });
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].buildingId, 1);
  assert.equal(state.items[1].buildingId, 2);

  state = reorderBuildingQueue(state, 0, 1);
  assert.equal(state.items[0].buildingId, 2);
  assert.equal(state.items[1].buildingId, 1);

  state = removeBuildingFromQueue(state, 0);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].buildingId, 1);

  const now = 100000;
  const timeline = calculateBuildingQueueTimeline([], state.items, now);
  assert.equal(timeline.items.length, 1);
  assert.equal(timeline.totalDurationMs, 5000);
  assert.equal(timeline.allDoneAt, now + 5000);

  // Plan next step - idle queue with item -> start
  const planStart = planBuildingNextStep(state, { buildingStatus: { data: { queues: [] } } }, now);
  assert.equal(planStart.action, 'start');
  assert.equal(planStart.startedItem?.buildingId, 1);
  assert.ok(planStart.calls.some((c) => c.name === 'startConstruction'));

  // Plan next step - queue with active building -> wait
  const activeQueues = [{ buildingId: 3, finishTime: now + 20000 }];
  const planWait = planBuildingNextStep(state, { buildingStatus: { data: { queues: activeQueues } } }, now);
  assert.equal(planWait.action, 'wait');
  assert.equal(planWait.wakeAt, now + 20000 + 1000);

  // Clear queue
  state = clearBuildingQueue(state);
  assert.equal(state.items.length, 0);
});

test('researchQueueService - simulation and level extraction', () => {
  const researchMap = new Map([
    [1, { level: 2 }],
    [2, { level: 1 }],
  ]);
  const rawQueues = [{ researchId: 1, level: 3 }];
  const queueItems = [{ researchId: 2, nextLevel: 2 }];

  const simulated = getSimulatedResearchLevels(researchMap, rawQueues, queueItems);
  assert.equal(simulated.get(1), 3);
  assert.equal(simulated.get(2), 2);

  const cache = {
    personalResearch_getSummary: {
      data: {
        completedResearches: [
          { researchId: 1, level: 3 },
          { researchId: 2, level: 2 },
        ],
      },
    },
  };
  const extracted = extractResearchLevels(cache);
  assert.equal(extracted.get(1), 3);
  assert.equal(extracted.get(2), 2);
});

test('researchQueueService - queue mutations, timeline, and planning', () => {
  let state = { enabled: true, items: [] };

  state = addResearchToQueue(state, { researchId: 10, nextLevel: 2, durationMs: 4000 });
  state = addResearchToQueue(state, { researchId: 20, nextLevel: 1, durationMs: 8000 });
  assert.equal(state.items.length, 2);

  state = reorderResearchQueue(state, 0, 1);
  assert.equal(state.items[0].researchId, 20);
  assert.equal(state.items[1].researchId, 10);

  state = removeResearchFromQueue(state, 1);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].researchId, 20);

  const now = 200000;
  const timeline = calculateResearchQueueTimeline([], state.items, now);
  assert.equal(timeline.items.length, 1);
  assert.equal(timeline.totalDurationMs, 8000);
  assert.equal(timeline.allDoneAt, now + 8000);

  // Plan next step - idle -> start
  const planStart = planResearchNextStep(state, { personalResearch_getQueue: { data: [] } }, now);
  assert.equal(planStart.action, 'start');
  assert.equal(planStart.startedItem?.researchId, 20);
  assert.ok(planStart.calls.some((c) => c.name === 'startResearch'));

  // Plan next step - wait
  const activeQueues = [{ researchId: 5, finishTime: now + 15000 }];
  const planWait = planResearchNextStep(
    state,
    { personalResearch_getQueue: { data: { queues: activeQueues } } },
    now
  );
  assert.equal(planWait.action, 'wait');
  assert.equal(planWait.wakeAt, now + 15000 + 1000);

  // Plan next step - already completed skip
  const completedCache = {
    personalResearch_getSummary: {
      data: {
        completedResearches: [{ researchId: 20, level: 1 }],
      },
    },
    personalResearch_getQueue: { data: [] },
  };
  const planSkip = planResearchNextStep(state, completedCache, now);
  assert.equal(planSkip.skippedItems.length, 1);
  assert.equal(planSkip.skippedItems[0].researchId, 20);
  assert.equal(planSkip.action, 'idle');

  // Clear queue
  state = clearResearchQueue(state);
  assert.equal(state.items.length, 0);
});
