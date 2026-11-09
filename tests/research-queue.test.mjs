import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const researchQueueJs = await readFile(new URL('../extension/research-queue.js', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

const rContext = {
  Date,
  globalThis: {}
};
vm.runInNewContext(researchQueueJs, rContext);
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
});
