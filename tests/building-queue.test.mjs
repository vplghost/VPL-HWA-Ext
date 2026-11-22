import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { buildingDataHelper } from '../src/data/buildingData.ts';
import { buildingQueueService } from '../src/services/queues/buildingQueue.ts';
import { dashboardQueues } from '../src/utils/dashboardState.ts';

function createContext() {
  return {
    hwaHelperBuildingQueue: buildingQueueService,
    hwaHelperBuildingData: buildingDataHelper,
  };
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

test('getEligibleCandidates unlocks unbuilt buildings when research or building prerequisites are satisfied', () => {
  const { hwaHelperBuildingQueue: qHelper, hwaHelperBuildingData: bHelper } = createContext();

  const allBuildings = [
    { id: 20, level: 20, isBuilt: true }, // Hall of Heroes Lv. 20
    { id: 162, level: 10, isBuilt: true }, // Infirmary 1 Lv. 10
    { id: 174, level: 0, isBuilt: false }, // Infirmary 2 (requires tech 633)
    { id: 175, level: 0, isBuilt: false }, // Infirmary 3 (requires tech 634)
    { id: 182, level: 0, isBuilt: false }, // Headquarters 1 (requires Hall 7)
    { id: 183, level: 0, isBuilt: false }, // Headquarters 2 (requires Hall 16)
    { id: 184, level: 0, isBuilt: false }, // Headquarters 3 (requires tech 635)
    { id: 23, level: 0, isBuilt: false },  // Bed (sub-structure, should NEVER be eligible)
    { id: 44, level: 0, isBuilt: false },  // Landmark (should NEVER be eligible)
  ];

  const simulated = qHelper.getSimulatedLevels(allBuildings, [], []);

  // Case 1: No research completed
  // Headquarters 1 (#182) and Headquarters 2 (#183) should be eligible because Hall is 20 (>= 7 and >= 16)
  // Infirmary 2 (#174), Infirmary 3 (#175), Headquarters 3 (#184) require research techs 633, 634, 635 -> NOT eligible
  const candidatesNoResearch = qHelper.getEligibleCandidates(allBuildings, simulated, bHelper, []);
  assert.ok(candidatesNoResearch.some((c) => c.id === 182 && c.nextLevel === 1), 'Headquarters 1 should be eligible (Hall >= 7)');
  assert.ok(candidatesNoResearch.some((c) => c.id === 183 && c.nextLevel === 1), 'Headquarters 2 should be eligible (Hall >= 16)');
  assert.ok(!candidatesNoResearch.some((c) => c.id === 174), 'Infirmary 2 should not be eligible without tech 633');
  assert.ok(!candidatesNoResearch.some((c) => c.id === 175), 'Infirmary 3 should not be eligible without tech 634');
  assert.ok(!candidatesNoResearch.some((c) => c.id === 184), 'Headquarters 3 should not be eligible without tech 635');
  assert.ok(!candidatesNoResearch.some((c) => c.id === 23), 'Bed (sub-structure) must never be eligible');
  assert.ok(!candidatesNoResearch.some((c) => c.id === 44), 'Landmark must never be eligible');

  // Case 2: Tech 634 (Additional Infirmary II) and Tech 635 (New Drill Ground I) completed
  const completedResearches = new Map([
    [634, 1], // Tech 634 unlocked
    [635, 1], // Tech 635 unlocked
  ]);
  const candidatesWithResearch = qHelper.getEligibleCandidates(allBuildings, simulated, bHelper, completedResearches);
  assert.ok(candidatesWithResearch.some((c) => c.id === 175 && c.nextLevel === 1), 'Infirmary 3 should be eligible when tech 634 is completed');
  assert.ok(candidatesWithResearch.some((c) => c.id === 184 && c.nextLevel === 1), 'Headquarters 3 should be eligible when tech 635 is completed');
  assert.ok(!candidatesWithResearch.some((c) => c.id === 174), 'Infirmary 2 remains locked since tech 633 is not completed');

  // Case 3: Once an unbuilt building is queued (e.g. Infirmary 3 -> Lv. 1), projected next level becomes 2
  const queueWithInfirmary3 = [
    { buildingId: 175, nextLevel: 1, durationMs: 2000 }
  ];
  const projectedSim = qHelper.getSimulatedLevels(allBuildings, [], queueWithInfirmary3);
  assert.equal(projectedSim.get(175), 1, 'Simulated level should reflect queued level 1');

  const candidatesAfterQueued = qHelper.getEligibleCandidates(allBuildings, projectedSim, bHelper, completedResearches);
  const nextInfirmary3 = candidatesAfterQueued.find((c) => c.id === 175);
  assert.ok(nextInfirmary3, 'Infirmary 3 should still be eligible');
  assert.equal(nextInfirmary3.currentLevel, 1, 'Current simulated level should be 1');
  assert.equal(nextInfirmary3.nextLevel, 2, 'Next level should advance to 2');
});

test('getEligibleCandidates with includeUnbuilt option discovers unbuilt standalone buildings from minimal building list', () => {
  const { hwaHelperBuildingQueue: qHelper, hwaHelperBuildingData: bHelper } = createContext();

  const minimalBuilt = [
    { id: 20, level: 25, isBuilt: true }
  ];
  const simulated = qHelper.getSimulatedLevels(minimalBuilt, [], []);
  const completedResearches = new Set([633, 634, 635]);

  const candidates = qHelper.getEligibleCandidates(
    minimalBuilt,
    simulated,
    bHelper,
    completedResearches,
    { includeUnbuilt: true }
  );

  assert.ok(candidates.some((c) => c.id === 174 && c.nextLevel === 1), 'Infirmary 2 discovered as unbuilt candidate');
  assert.ok(candidates.some((c) => c.id === 175 && c.nextLevel === 1), 'Infirmary 3 discovered as unbuilt candidate');
  assert.ok(candidates.some((c) => c.id === 182 && c.nextLevel === 1), 'Headquarters 1 discovered as unbuilt candidate');
  assert.ok(candidates.some((c) => c.id === 183 && c.nextLevel === 1), 'Headquarters 2 discovered as unbuilt candidate');
  assert.ok(candidates.some((c) => c.id === 184 && c.nextLevel === 1), 'Headquarters 3 discovered as unbuilt candidate');
  assert.ok(!candidates.some((c) => c.id === 23), 'Sub-structure Bed is never discovered');
});

test('multi-slot: planNextStep starts a parallel building when maxSlots is 2 and one slot is free', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  // Slot 1 is currently building #41 (starts at now, finishes at now + 50000)
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 20, level: 22 },
          { buildingId: 41, level: 21 },
          { buildingId: 29, level: 20 },
        ],
        queues: [
          { buildingId: 41, nextLevel: 22, startDate: now, durationMs: 50000 },
        ],
      },
    },
  };

  const queueState = {
    enabled: true,
    maxSlots: 2,
    items: [
      { buildingId: 29, nextLevel: 21, durationMs: 15000 },
    ],
  };

  const step = qHelper.planNextStep(queueState, cache, now);
  assert.equal(step.action, 'start');
  assert.equal(step.startedItem.buildingId, 29);
  assert.equal(step.startedItem.nextLevel, 21);
  assert.equal(step.calls.some((c) => c.name === 'startConstruction' && c.args.buildingId === 29), true);
});

test('multi-slot: planNextStep skips item whose prerequisite is currently being upgraded in parallel slot', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  // Hall of Heroes #20 is currently at level 21, and slot 1 is upgrading it to 22.
  // Item 0: Barracks #41 wants to go to level 22 (requires Hall 22, so it cannot be built now).
  // Item 1: Building #29 wants to go to level 21 (requires Hall 21, which is ALREADY met).
  const cache = {
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 20, level: 21 },
          { buildingId: 41, level: 21 },
          { buildingId: 29, level: 20 },
        ],
        queues: [
          { buildingId: 20, nextLevel: 22, startDate: now, durationMs: 60000 },
        ],
      },
    },
  };

  const queueState = {
    enabled: true,
    maxSlots: 2,
    items: [
      { buildingId: 41, nextLevel: 22, durationMs: 40000 }, // Bottlenecked by Hall 22 in slot 1 -> should SKIP
      { buildingId: 29, nextLevel: 21, durationMs: 15000 }, // Eligible now -> should START
    ],
  };

  const step = qHelper.planNextStep(queueState, cache, now);
  assert.equal(step.action, 'start');
  assert.equal(step.startedItem.buildingId, 29, 'Building 29 should start because Building 41 was skipped');
  assert.equal(step.startedItem.nextLevel, 21);
  // Skipped item 41 must still remain in remainingItems for future rounds!
  assert.equal(step.remainingItems.length, 1);
  assert.equal(step.remainingItems[0].buildingId, 41);
});

test('multi-slot: calculateQueueTimeline distributes items across 2 builders', () => {
  const { hwaHelperBuildingQueue: qHelper } = createContext();
  const now = 1000000;

  const rawQueues = [
    { buildingId: 41, level: 22, startDate: now, durationMs: 20000 }, // Builder 1 finishes at now + 20000
    { buildingId: 29, level: 21, startDate: now, durationMs: 10000 }, // Builder 2 finishes at now + 10000
  ];
  const queueItems = [
    { buildingId: 30, nextLevel: 21, durationMs: 15000 }, // Goes to Builder 2 (free at now + 10000 -> finishes 25000)
    { buildingId: 31, nextLevel: 21, durationMs: 10000 }, // Goes to Builder 1 (free at now + 20000 -> finishes 30000)
  ];

  const timeline = qHelper.calculateQueueTimeline(rawQueues, queueItems, now, { maxSlots: 2 });
  assert.equal(timeline.items[0].buildingId, 30);
  assert.equal(timeline.items[0].estStart, now + 10000);
  assert.equal(timeline.items[0].estFinish, now + 25000);

  assert.equal(timeline.items[1].buildingId, 31);
  assert.equal(timeline.items[1].estStart, now + 20000);
  assert.equal(timeline.items[1].estFinish, now + 30000);

  assert.equal(timeline.allDoneAt, now + 30000);
  assert.equal(timeline.builderFreeAt, now + 10000);
});

test('dashboardQueues returns 2 slots for building queue with idle placeholder when 1 slot is free', () => {
  const now = 1795332000000;
  const cache = {
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 41, level: 22, startDate: now - 5000, durationMs: 25000 },
        ],
      },
    },
  };

  const res = dashboardQueues(cache, 'building', now);
  assert.equal(res.state, 'active');
  assert.equal(res.rows.length, 1);
  assert.equal(res.slots.length, 2);

  // Slot 1 is active
  assert.equal(res.slots[0].slotIndex, 1);
  assert.equal(res.slots[0].isIdle, false);
  assert.equal(res.slots[0].entityId, 41);
  assert.equal(res.slots[0].state, 'active');
  assert.equal(res.slots[0].timerText, '20s');

  // Slot 2 is idle placeholder
  assert.equal(res.slots[1].slotIndex, 2);
  assert.equal(res.slots[1].isIdle, true);
  assert.equal(res.slots[1].state, 'idle');
  assert.equal(res.slots[1].timerText, 'Idle');
});
