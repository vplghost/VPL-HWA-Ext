import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const researchDataJs = await readFile(new URL('../extension/research-data.js', import.meta.url), 'utf8');
const researchQueueJs = await readFile(new URL('../extension/research-queue.js', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

const rContext = {
  Date,
  globalThis: {}
};
vm.runInNewContext(researchDataJs, rContext);
vm.runInNewContext(researchQueueJs, rContext);
const researchData = rContext.globalThis.hwaHelperResearchData;
const queueHelper = rContext.globalThis.hwaHelperResearchQueue;

test('research-queue getSimulatedLevels calculates max level from completed, active queue and automation queue', () => {
  const researchMap = new Map([
    [501, { id: 501, level: 3 }],
    [502, { id: 502, level: 1 }],
    [503, { id: 503, level: 5 }]
  ]);

  const rawQueues = [
    { researchId: 501, level: 4, startDate: Date.now() - 1000, durationMs: 60000 }
  ];

  const queueItems = [
    { researchId: 501, currentLevel: 4, nextLevel: 5 },
    { researchId: 502, currentLevel: 1, nextLevel: 2 },
    { researchId: 502, currentLevel: 2, nextLevel: 3 }
  ];

  const simulated = queueHelper.getSimulatedLevels(researchMap, rawQueues, queueItems);
  assert.equal(simulated.get(501), 5, 'Tech 501 should be simulated to level 5');
  assert.equal(simulated.get(502), 3, 'Tech 502 should be simulated to level 3');
  assert.equal(simulated.get(503), 5, 'Tech 503 should remain at level 5');
});

test('research-queue calculateQueueTimeline chains estimated start and finish times', () => {
  const now = 1000000;
  // In-progress research finishes at 1050000
  const rawQueues = [
    { researchId: 501, level: 2, startDate: now - 10000, durationMs: 60000 }
  ];

  const queueItems = [
    { researchId: 502, currentLevel: 1, nextLevel: 2, durationMs: 30000 },
    { researchId: 503, currentLevel: 2, nextLevel: 3, durationMs: 40000 }
  ];

  const timeline = queueHelper.calculateQueueTimeline(rawQueues, queueItems, now);
  assert.equal(timeline.items.length, 2);
  assert.equal(timeline.researcherFreeAt, now + 50000);
  assert.equal(timeline.items[0].estStart, now + 50000);
  assert.equal(timeline.items[0].estFinish, now + 80000);
  assert.equal(timeline.items[1].estStart, now + 80000);
  assert.equal(timeline.items[1].estFinish, now + 120000);
  assert.equal(timeline.totalDurationMs, 70000);
  assert.equal(timeline.allDoneAt, now + 120000);
});

test('research-queue planNextStep handles wait, complete, start, and idle actions', () => {
  const now = 2000000;

  // 1. In-progress research -> wait
  const cacheInProgress = {
    researchStatus: {
      data: {
        queues: [{ researchId: 501, level: 2, startDate: now - 5000, durationMs: 20000 }]
      }
    }
  };
  const waitPlan = queueHelper.planNextStep({ enabled: true, items: [{ researchId: 502, nextLevel: 1 }] }, cacheInProgress, now);
  assert.equal(waitPlan.action, 'wait');
  assert.equal(waitPlan.wakeAt, now + 15000 + 1000);
  assert.equal(waitPlan.calls.length, 0);

  // 2. Finished research -> complete
  const cacheFinished = {
    researchStatus: {
      data: {
        queues: [{ researchId: 501, level: 2, startDate: now - 30000, durationMs: 20000 }]
      }
    }
  };
  const completePlan = queueHelper.planNextStep({ enabled: true, items: [] }, cacheFinished, now);
  assert.equal(completePlan.action, 'complete-only');
  assert.equal(completePlan.calls.length, 2);
  assert.equal(completePlan.calls[0].name, 'completeResearch');
  assert.equal(completePlan.calls[0].feature, 'personalResearch');
  assert.equal(completePlan.calls[0].args.researchId, 501);

  // 3. Idle academy with queued items -> start
  const cacheIdle = {
    researchStatus: {
      data: { queues: [] }
    }
  };
  const startPlan = queueHelper.planNextStep({
    enabled: true,
    items: [
      { researchId: 505, currentLevel: 1, nextLevel: 2, durationMs: 60000 },
      { researchId: 506, currentLevel: 2, nextLevel: 3, durationMs: 60000 }
    ]
  }, cacheIdle, now);
  assert.equal(startPlan.action, 'start');
  assert.equal(startPlan.startedItem.researchId, 505);
  assert.equal(startPlan.remainingItems.length, 1);
  assert.equal(startPlan.calls.length, 2);
  assert.equal(startPlan.calls[0].name, 'startResearch');
  assert.equal(startPlan.calls[0].feature, 'personalResearch');
  assert.equal(startPlan.calls[0].args.researchId, 505);
  assert.equal(startPlan.calls[0].args.level, 2);

  // 4. Idle academy with empty queue -> idle
  const idlePlan = queueHelper.planNextStep({ enabled: true, items: [] }, cacheIdle, now);
  assert.equal(idlePlan.action, 'idle');
  assert.equal(idlePlan.calls.length, 0);

  // 5. Finished research using nextLevel fallback and personalResearch_getQueue data
  const cacheFlexible = {
    personalResearch_getQueue: {
      data: [{ researchId: 507, nextLevel: 4, finishTime: now - 1000 }]
    }
  };
  const flexPlan = queueHelper.planNextStep({
    enabled: true,
    items: [{ researchId: 508, nextLevel: 2, durationMs: 15000 }]
  }, cacheFlexible, now);
  assert.equal(flexPlan.action, 'start');
  assert.equal(flexPlan.calls[0].name, 'completeResearch');
  assert.equal(flexPlan.calls[0].args.researchId, 507);
  assert.equal(flexPlan.calls[0].args.level, 4);
  assert.equal(flexPlan.calls[1].name, 'startResearch');
  assert.equal(flexPlan.calls[1].args.researchId, 508);
});

test('research-queue queue mutations addToQueue, removeFromQueue, reorderQueue, and clearQueue', () => {
  let state = { enabled: true, items: [] };

  state = queueHelper.addToQueue(state, { researchId: 501, currentLevel: 1, nextLevel: 2, durationMs: 10000 });
  state = queueHelper.addToQueue(state, { researchId: 502, currentLevel: 2, nextLevel: 3, durationMs: 20000 });
  state = queueHelper.addToQueue(state, { researchId: 503, currentLevel: 3, nextLevel: 4, durationMs: 30000 });
  assert.equal(state.items.length, 3);
  assert.equal(state.items[0].researchId, 501);
  assert.equal(state.items[1].researchId, 502);

  // Reorder index 1 down to index 2
  state = queueHelper.reorderQueue(state, 1, 2);
  assert.equal(state.items[1].researchId, 503);
  assert.equal(state.items[2].researchId, 502);

  // Remove index 0
  state = queueHelper.removeFromQueue(state, 0);
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].researchId, 503);

  // Clear queue
  state = queueHelper.clearQueue(state);
  assert.equal(state.items.length, 0);
});

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.listeners = {};
    this._value = '';
    this._checked = false;
    this._disabled = false;
    this._textContent = '';
    this._innerHTML = '';
  }
  get value() { return this._value; }
  set value(val) { this._value = String(val); }
  get checked() { return this._checked; }
  set checked(val) { this._checked = Boolean(val); }
  get disabled() { return this._disabled; }
  set disabled(val) { this._disabled = Boolean(val); }
  get innerHTML() {
    const childHtml = this.children.map((c) => c.innerHTML || c.textContent || '').join(' ');
    return [this._innerHTML, childHtml].filter(Boolean).join(' ');
  }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]+>/g, '');
    this.children = [];
  }
  get textContent() {
    const childText = this.children.map((c) => c.textContent || '').join(' ');
    return [this._textContent, childText].filter(Boolean).join(' ');
  }
  set textContent(val) {
    this._textContent = String(val);
    this._innerHTML = String(val);
    this.children = [];
  }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('#text');
        textNode.textContent = node;
        this.children.push(textNode);
      } else if (node) {
        this.children.push(node);
      }
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) { this.attributes = this.attributes || {}; this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes?.[k]; }
  addEventListener(type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  }
  click() {
    (this.listeners['click'] || []).forEach((fn) => fn({ target: this, stopPropagation: () => {} }));
  }
  querySelector(sel) {
    for (const child of this.children) {
      if (child.id === sel.replace(/^#/, '')) return child;
      const found = child.querySelector?.(sel);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    const res = [];
    for (const child of this.children) {
      if (child.tagName === sel.toUpperCase() || child.className.includes(sel.replace(/^\./, ''))) {
        res.push(child);
      }
      if (child.querySelectorAll) res.push(...child.querySelectorAll(sel));
    }
    return res;
  }
}

test('renderResearchDialog renders active queue, auto-research queue, and candidate action buttons', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');
  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  let dispatchedMessages = [];
  const mockChrome = {
    runtime: {
      sendMessage: (msg, callback) => {
        dispatchedMessages.push(msg);
        if (typeof callback === 'function') callback({ ok: true });
      }
    },
    storage: {
      local: {
        set: (data, callback) => { if (typeof callback === 'function') callback(); }
      }
    }
  };

  const context = vm.createContext({
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    chrome: mockChrome,
    globalThis: {
      hwaHelperResearchQueue: queueHelper
    },
    hwaHelperNameMap: {
      research: (id) => `Research ${id}`
    },
    hwaHelperNameData: {
      names: {
        research: {
          '512': 'Armor-Piercing',
          '513': 'Barrier Breaker'
        }
      }
    },
    popupRpcEnabled: true,
    formatRemainingHms: (ms) => '01:00'
  });

  const setupCode = popupJs.slice(
    popupJs.indexOf("let buildingSearchQuery = '';"),
    popupJs.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // Render with finished research (ID 510) and candidate (ID 512)
  const now = Date.now();
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 5 }]
      }
    },
    researchStatus: {
      data: {
        queues: [
          { researchId: 510, level: 2, startDate: now - 30000, durationMs: 20000, queueNumber: 0 }
        ],
        completedResearches: [
          { researchId: 510, level: 1 },
          { researchId: 512, level: 2 }
        ]
      }
    }
  });

  // Verify finished research card has Finish button
  const fullHtml = researchBody.innerHTML;
  assert.ok(fullHtml.includes('Ready to finish') || fullHtml.includes('Finish'), 'Must display finish button for completed research');

  // Verify auto-research queue section exists
  assert.ok(fullHtml.includes('Auto-Research Queue'), 'Must include Auto-Research Queue subsection');
  assert.ok(fullHtml.includes('Auto-advance'), 'Must include Auto-advance toggle');

  // Verify Next Candidates grid includes candidate card with Queue and Research buttons
  assert.ok(fullHtml.includes('Next Research Candidates'), 'Must include Next Research Candidates');
  assert.ok(fullHtml.includes('Queue'), 'Must include Queue action button');
  assert.ok(fullHtml.includes('Research'), 'Must include direct Research action button');
  assert.ok(!fullHtml.includes('Academy busy'), 'Must not display Academy busy clutter');
});

test('renderResearchDialog hides Research button without Academy busy when queue is occupied', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');
  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  const context = vm.createContext({
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    chrome: {
      runtime: { sendMessage: () => {} },
      storage: { local: { set: () => {} } }
    },
    globalThis: {
      hwaHelperResearchQueue: queueHelper
    },
    hwaHelperNameMap: {
      research: (id) => `Research ${id}`
    },
    hwaHelperNameData: {
      names: {
        research: {
          '512': 'Armor-Piercing',
          '513': 'Barrier Breaker'
        }
      }
    },
    popupRpcEnabled: true,
    formatRemainingHms: () => '01:00'
  });

  const setupCode = popupJs.slice(
    popupJs.indexOf("let buildingSearchQuery = '';"),
    popupJs.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // Active queue is in progress (durationMs not yet elapsed)
  const now = Date.now();
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 5 }]
      }
    },
    researchStatus: {
      data: {
        queues: [
          { researchId: 510, level: 2, startDate: now, durationMs: 100000, queueNumber: 0 }
        ],
        completedResearches: [
          { researchId: 510, level: 1 },
          { researchId: 512, level: 2 }
        ]
      }
    }
  });

  const nextSection = researchBody.children[1];
  const nextHtml = nextSection.innerHTML;

  assert.ok(nextHtml.includes('Queue'), 'Queue button should be available');
  assert.ok(!nextHtml.includes('🔬'), 'Direct research button (🔬) must be hidden when queue is busy');
  assert.ok(!nextHtml.includes('Academy busy'), 'Must not display Academy busy clutter text');
});

test('research-data.js provides accurate tech tree metadata, max levels, and requirements', () => {
  assert.ok(researchData, 'hwaHelperResearchData must exist');

  // Max levels
  assert.equal(researchData.getMaxLevel(52), 3, 'Aimed Shots I (52) max level must be 3');
  assert.equal(researchData.getMaxLevel(83), 3, 'Aimed Shots II (83) max level must be 3');
  assert.equal(researchData.getMaxLevel(118), 4, 'Aimed Shots III (118) max level must be 4');
  assert.equal(researchData.getMaxLevel(151), 5, 'Aimed Shots IV (151) max level must be 5');

  // Aimed Shots III Lv. 4 requirements
  const l4 = researchData.getResearchLevelData(118, 4);
  assert.equal(l4.b, 20, 'Aimed Shots III Lv. 4 requires Research Center level 20');
  assert.equal(l4.r[0][0], 115, 'Aimed Shots III Lv. 4 requires research 115');
  assert.equal(l4.r[0][1], 4, 'Aimed Shots III Lv. 4 requires research 115 >= 4');

  // Check missing requirements with Research Center 19
  const currentLevels = new Map([[118, 3], [115, 4]]);
  const missingRc19 = researchData.getMissingRequirements(118, 4, currentLevels, 19);
  assert.equal(missingRc19.length, 1);
  assert.equal(missingRc19[0].type, 'building');
  assert.equal(missingRc19[0].required, 20);
  assert.equal(missingRc19[0].current, 19);
  assert.equal(researchData.isAvailable(118, 4, currentLevels, 19), false);

  // Check requirements satisfied with Research Center 20
  const missingRc20 = researchData.getMissingRequirements(118, 4, currentLevels, 20);
  assert.equal(missingRc20.length, 0);
  assert.equal(researchData.isAvailable(118, 4, currentLevels, 20), true);

  // Check max level rejection: Aimed Shots I (52) cannot be upgraded to Lv. 4
  const missing52 = researchData.getMissingRequirements(52, 4, new Map([[52, 3]]), 30);
  assert.equal(missing52.length, 1);
  assert.equal(missing52[0].type, 'maxLevel');
  assert.equal(missing52[0].max, 3);
  assert.equal(researchData.isAvailable(52, 4, new Map([[52, 3]]), 30), false);
});

test('startResearch and completeResearch RPC calls use exact in-game payload structures', () => {
  const now = 1794218000000;
  const cacheFinished = {
    researchStatus: {
      data: {
        queues: [{ researchId: 139, level: 1, startDate: now - 30000, durationMs: 20000, queueNumber: 0 }]
      }
    }
  };

  const plan = queueHelper.planNextStep({
    enabled: true,
    items: [
      { researchId: 143, currentLevel: 0, nextLevel: 1, durationMs: 28544000 }
    ]
  }, cacheFinished, now);

  assert.equal(plan.action, 'start');
  assert.equal(plan.calls.length, 3);

  // 1. completeResearch
  const completeCall = plan.calls[0];
  assert.equal(completeCall.name, 'completeResearch');
  assert.equal(completeCall.feature, 'personalResearch');
  assert.equal(completeCall.args.researchId, 139);
  assert.equal(completeCall.args.level, 1);
  assert.equal(completeCall.args.completeDate, now);

  // 2. startResearch
  const startCall = plan.calls[1];
  assert.equal(startCall.name, 'startResearch');
  assert.equal(startCall.feature, 'personalResearch');
  assert.equal(startCall.args.researchId, 143);
  assert.equal(startCall.args.nextLevel, 1);
  assert.equal(startCall.args.level, 1);
  assert.equal(startCall.args.startDate, now);
  assert.equal(startCall.args.durationMs, 28544000);
  assert.equal(startCall.args.queueNumber, 0);

  // 3. getSummary
  const summaryCall = plan.calls[2];
  assert.equal(summaryCall.name, 'getSummary');
  assert.equal(summaryCall.feature, 'personalResearch');
});

test('renderResearchDialog filters candidates using researchData max level and Research Center requirements', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');

  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  const names = {
    '52': 'Aimed Shots I',
    '83': 'Aimed Shots II',
    '118': 'Aimed Shots III'
  };

  const nameMap = {
    research: (id) => names[String(id)] || `Research ${id}`
  };

  const context = vm.createContext({
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    globalThis: {
      hwaHelperNameMap: nameMap,
      hwaHelperResearchData: researchData,
      hwaHelperResearchQueue: queueHelper
    },
    hwaHelperResearchData: researchData,
    hwaHelperResearchQueue: queueHelper,
    hwaHelperNameMap: nameMap,
    hwaHelperNameData: {
      names: {
        research: names
      }
    }
  });

  const setupCode = popupJs.slice(
    popupJs.indexOf("let buildingSearchQuery = '';"),
    popupJs.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // Case A: Research Center is 19.
  // 52 is at Lv. 3 -> Max level 3 reached -> FILTERED OUT from candidates
  // 118 is at Lv. 3 -> Lv. 4 requires RC 20 -> RC 19 is insufficient -> FILTERED OUT from candidates
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 19 }]
      }
    },
    researchStatus: {
      data: {
        queues: [],
        completedResearches: [
          { researchId: 52, level: 3 },
          { researchId: 115, level: 4 },
          { researchId: 118, level: 3 }
        ]
      }
    }
  });

  const candidateHtmlA = researchBody.children[1].innerHTML;
  assert.ok(!candidateHtmlA.includes('#52'), 'Aimed Shots I (#52) is at max level 3 and must be filtered out of candidates');
  assert.ok(!candidateHtmlA.includes('#118'), 'Aimed Shots III (#118) Lv. 4 requires RC 20, should be filtered out of candidates with RC 19');

  // Case B: Research Center is 20.
  // 118 is at Lv. 3 -> Lv. 4 requires RC 20 -> RC 20 is sufficient -> CANDIDATE AVAILABLE!
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 20 }]
      }
    },
    researchStatus: {
      data: {
        queues: [],
        completedResearches: [
          { researchId: 52, level: 3 },
          { researchId: 115, level: 4 },
          { researchId: 118, level: 3 }
        ]
      }
    }
  });

  const candidateHtmlB = researchBody.children[1].innerHTML;
  assert.ok(!candidateHtmlB.includes('#52'), 'Aimed Shots I (#52) is still at max level 3 and must not appear in candidates');
  assert.ok(candidateHtmlB.includes('#118'), 'Aimed Shots III (#118) Lv. 4 should now appear as candidate with RC 20');
  assert.ok(candidateHtmlB.includes('Aimed Shots III'), 'Candidate card should display Aimed Shots III');
  assert.ok(candidateHtmlB.includes('Lv. 3 ➔ 4 / 4'), 'Must display target level with max level badge');
});

test('renderResearchDialog includes eligible unresearched tech (0 -> 1) such as Iron Formation VI when requirements are met', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');

  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  const names = {
    '486': 'Iron Formation VI'
  };

  const nameMap = {
    research: (id) => names[String(id)] || `Research ${id}`
  };

  const context = vm.createContext({
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    globalThis: {
      hwaHelperNameMap: nameMap,
      hwaHelperResearchData: researchData,
      hwaHelperResearchQueue: queueHelper
    },
    hwaHelperResearchData: researchData,
    hwaHelperResearchQueue: queueHelper,
    hwaHelperNameMap: nameMap,
    hwaHelperNameData: {
      names: {
        research: names
      }
    }
  });

  const setupCode = popupJs.slice(
    popupJs.indexOf("let buildingSearchQuery = '';"),
    popupJs.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // 1. With Research Center 14 (below required 15): Iron Formation VI (486) must be excluded
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 14 }]
      }
    },
    researchStatus: {
      data: {
        queues: [],
        completedResearches: []
      }
    }
  });

  const htmlRc14 = researchBody.children[1].innerHTML;
  assert.ok(!htmlRc14.includes('#486'), 'Iron Formation VI (#486) requires RC 15 and must be excluded with RC 14');

  // 2. With Research Center 15: Iron Formation VI (486) must be included as 0 -> 1 candidate!
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [{ buildingId: 43, level: 15 }]
      }
    },
    researchStatus: {
      data: {
        queues: [],
        completedResearches: []
      }
    }
  });

  const htmlRc15 = researchBody.children[1].innerHTML;
  assert.ok(htmlRc15.includes('#486'), 'Iron Formation VI (#486) must be included as candidate when RC 15 requirement is satisfied');
  assert.ok(htmlRc15.includes('Iron Formation VI'), 'Must display research name Iron Formation VI');
  assert.ok(htmlRc15.includes('Research Lv. 1 / 10'), 'Must display Research Lv. 1 / 10 for unresearched level 0 candidate');
  assert.ok(htmlRc15.includes('🎖️'), 'Iron Formation VI (#486) must display 🎖️ icon indicating non-basic resource (Honor medal) requirement');
  const medalIcons = researchBody.querySelectorAll('.special-resource-icon');
  assert.ok(medalIcons.length > 0, 'Must have element with special-resource-icon class for styling');
});

