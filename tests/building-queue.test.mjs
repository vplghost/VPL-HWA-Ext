import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const queueJs = await readFile(new URL('../extension/building-queue.js', import.meta.url), 'utf8');
const buildingDataJs = await readFile(new URL('../extension/building-data.js', import.meta.url), 'utf8');

function createContext() {
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(buildingDataJs, context);
  vm.runInContext(queueJs, context);
  return context.globalThis;
}

test('getSimulatedLevels calculates projected levels across current buildings, active queues, and queued items', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();

  const currentBuildings = [
    { buildingId: 20, level: 19 },
    { buildingId: 21, level: 5 }
  ];
  const rawQueues = [
    { buildingId: 20, level: 20, startDate: Date.now(), durationMs: 10000 }
  ];
  const queueItems = [
    { buildingId: 21, nextLevel: 6 },
    { buildingId: 21, nextLevel: 7 }
  ];

  const simulated = qHelper.getSimulatedLevels(currentBuildings, rawQueues, queueItems);
  assert.equal(simulated.get(20), 20, 'Hall of Heroes should project to level 20');
  assert.equal(simulated.get(21), 7, 'House 1 should project to level 7 (highest queued)');
});

test('virtual prerequisite projection allows adding dependent buildings when prerequisite is queued', () => {
  const { hwaHelperBuildingQueue: qHelper, hwaHelperBuildingData: bHelper } = createContext();

  // Initially: Hall 20 is level 19. Archery Barracks (#43) is 19.
  // Infirmary (#162) requires Hall 20.
  const currentBuildings = [
    { id: 20, level: 19, isBuilt: true },
    { id: 43, level: 19, isBuilt: true },
    { id: 162, level: 19, isBuilt: true }
  ];

  // 1. Without Hall 20 in queue: Infirmary (#162) cannot be upgraded to 20
  const initialSim = qHelper.getSimulatedLevels(currentBuildings, [], []);
  const initialCandidates = qHelper.getEligibleCandidates(currentBuildings, initialSim, bHelper);
  assert.ok(!initialCandidates.some((c) => c.id === 162), 'Infirmary should not be eligible before Hall 20 is queued');

  // 2. Queue Hall 20 -> 20
  const queuedItems = [{ buildingId: 20, nextLevel: 20, durationMs: 12240000 }];
  const projectedSim = qHelper.getSimulatedLevels(currentBuildings, [], queuedItems);
  const projectedCandidates = qHelper.getEligibleCandidates(currentBuildings, projectedSim, bHelper);

  // Now Infirmary (#162) must be eligible!
  const infirmary = projectedCandidates.find((c) => c.id === 162);
  assert.ok(infirmary, 'Infirmary must become eligible after Hall 20 is added to queue');
  assert.equal(infirmary.nextLevel, 20);
});

test('calculateQueueTimeline calculates cumulative start and finish times', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  const rawQueues = [
    { buildingId: 20, level: 20, startDate: now - 5000, durationMs: 15000 } // finishes at now + 10000
  ];
  const queueItems = [
    { buildingId: 162, nextLevel: 20, durationMs: 20000 },
    { buildingId: 40, nextLevel: 20, durationMs: 30000 }
  ];

  const timeline = qHelper.calculateQueueTimeline(rawQueues, queueItems, now);
  assert.equal(timeline.builderFreeAt, now + 10000);
  assert.equal(timeline.items[0].estStart, now + 10000);
  assert.equal(timeline.items[0].estFinish, now + 30000);
  assert.equal(timeline.items[1].estStart, now + 30000);
  assert.equal(timeline.items[1].estFinish, now + 60000);
  assert.equal(timeline.totalDurationMs, 50000);
  assert.equal(timeline.allDoneAt, now + 60000);
});

test('planNextStep waits while active construction is in progress', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  const cache = {
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 20, level: 20, startDate: now, durationMs: 50000 }
        ]
      }
    }
  };
  const queueState = { enabled: true, items: [{ buildingId: 21, nextLevel: 6, durationMs: 10000 }] };

  const step = qHelper.planNextStep(queueState, cache, now);
  assert.equal(step.action, 'wait');
  assert.equal(step.wakeAt, now + 50000 + 1000);
  assert.equal(step.calls.length, 0);
});

test('planNextStep auto-completes finished building and starts next queued building in one batch', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  // Building 170 has finished countdown (startDate 900000, duration 50000 -> finished at 950000 < now)
  const cache = {
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 170, level: 13, startDate: 900000, durationMs: 50000 }
        ]
      }
    }
  };
  const queueState = {
    enabled: true,
    items: [
      { buildingId: 31, nextLevel: 19, durationMs: 5498400 }
    ]
  };

  const step = qHelper.planNextStep(queueState, cache, now);
  assert.equal(step.action, 'start');
  assert.equal(step.calls.length, 3);

  // Call 1: completeConstruction for finished building 170
  assert.equal(step.calls[0].name, 'completeConstruction');
  assert.equal(step.calls[0].args.buildingId, 170);
  assert.equal(step.calls[0].args.nextLevel, 13);

  // Call 2: startConstruction for next building 31
  assert.equal(step.calls[1].name, 'startConstruction');
  assert.equal(step.calls[1].args.buildingId, 31);
  assert.equal(step.calls[1].args.nextLevel, 19);

  // Call 3: getSummary
  assert.equal(step.calls[2].name, 'getSummary');

  assert.equal(step.remainingItems.length, 0);
  assert.equal(step.wakeAt, now + 5498400 + 1000);
});

test('addToQueue, removeFromQueue, reorderQueue, and clearQueue manage state immutably', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();

  let state = qHelper.addToQueue(null, { buildingId: 20, nextLevel: 20, durationMs: 5000 });
  assert.equal(state.enabled, true);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].buildingId, 20);

  state = qHelper.addToQueue(state, { buildingId: 21, nextLevel: 6, durationMs: 2000 });
  assert.equal(state.items.length, 2);

  state = qHelper.reorderQueue(state, 1, 0);
  assert.equal(state.items[0].buildingId, 21);
  assert.equal(state.items[1].buildingId, 20);

  state = qHelper.removeFromQueue(state, 0);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].buildingId, 20);

  state = qHelper.clearQueue(state);
  assert.equal(state.items.length, 0);
});

test('planNextStep handles nextLevel fallback, flexible queues structure, and finishTime', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 2000000;

  // Case 1: Finished building with nextLevel instead of level, and under building_getQueue fallback
  const cache1 = {
    building_getQueue: {
      data: [
        { buildingId: 40, nextLevel: 15, finishTime: now - 5000 }
      ]
    }
  };
  const queueState1 = {
    enabled: true,
    items: [{ buildingId: 42, nextLevel: 16, durationMs: 120000 }]
  };
  const step1 = qHelper.planNextStep(queueState1, cache1, now);
  assert.equal(step1.action, 'start');
  assert.equal(step1.calls[0].name, 'completeConstruction');
  assert.equal(step1.calls[0].args.buildingId, 40);
  assert.equal(step1.calls[0].args.nextLevel, 15);
  assert.equal(step1.calls[1].name, 'startConstruction');
  assert.equal(step1.calls[1].args.buildingId, 42);
  assert.equal(step1.calls[1].args.nextLevel, 16);

  // Case 2: In-progress building with startTime and duration in seconds
  const epochNow = 1794200000000;
  const cache2 = {
    buildingStatus: {
      data: {
        queue: {
          buildingId: 20,
          nextLevel: 21,
          startTime: (epochNow / 1000) - 10,
          duration: 100
        }
      }
    }
  };
  const step2 = qHelper.planNextStep(queueState1, cache2, epochNow);
  assert.equal(step2.action, 'wait');
  assert.ok(step2.wakeAt > epochNow);
});

test('planNextStep skips already-completed buildings and starts next uncompleted item', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  // Cache shows building 20 is already at level 15, and building 21 is at level 5
  const cache = {
    buildingStatus: {
      data: {
        queues: [],
        buildings: [
          { buildingId: 20, level: 15 },
          { buildingId: 21, level: 5 }
        ]
      }
    }
  };

  const queueState = {
    enabled: true,
    items: [
      { buildingId: 20, nextLevel: 15, durationMs: 60000 }, // ALREADY COMPLETED (level 15 >= 15)
      { buildingId: 21, nextLevel: 6, durationMs: 120000 }   // PENDING (level 5 < 6)
    ]
  };

  const step = qHelper.planNextStep(queueState, cache, now);
  assert.equal(step.action, 'start');
  assert.equal(step.skippedItems.length, 1);
  assert.equal(step.skippedItems[0].buildingId, 20);
  assert.equal(step.skippedItems[0].currentLevel, 15);

  // Started item should be building 21
  assert.equal(step.startedItem.buildingId, 21);
  assert.equal(step.startedItem.nextLevel, 6);
  assert.equal(step.calls[0].args.buildingId, 21);
  assert.equal(step.calls[0].args.nextLevel, 6);
});
