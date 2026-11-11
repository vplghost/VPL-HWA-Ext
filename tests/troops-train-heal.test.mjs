import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this._textContent = undefined;
    this.attributes = {};
    this.hidden = false;
    this.disabled = false;
    this.className = '';
  }
  get id() { return this.attributes.id || ''; }
  set id(v) { this.attributes.id = v; }
  get textContent() {
    if (this._textContent !== undefined) return this._textContent;
    if (this.children.length > 0) return this.children.map((c) => c.textContent).join(' ');
    return '';
  }
  set textContent(val) {
    this._textContent = val;
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML || this.children.map((c) => `<${c.tagName}>${c.textContent}</${c.tagName}>`).join('');
  }
  set innerHTML(val) {
    this._innerHTML = val;
    this._textContent = String(val).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  append(...children) {
    for (const c of children) {
      if (c) {
        c.parent = this;
        this.children.push(c);
      }
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const res = c.querySelector?.(sel);
        if (res) return res;
      }
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.className.includes(cls)) return this;
      for (const c of this.children) {
        const res = c.querySelector?.(sel);
        if (res) return res;
      }
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.className.includes(cls)) results.push(this);
      for (const c of this.children) {
        if (c.querySelectorAll) results.push(...c.querySelectorAll(sel));
      }
    }
    return results;
  }
}

test('rpc-cache merges startTrainingAction, completeTrainingAction, and startHealingAction', async () => {
  const rpcCacheCode = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
  const context = vm.createContext({ globalThis: {}, TextEncoder });
  vm.runInContext(rpcCacheCode, context);
  const cacheHelper = context.globalThis.hwaHelperRpcCache;

  const initialCache = {
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 7, count: 100 },
          { unitId: 17, count: 200 },
          { unitId: 27, count: 300 }
        ]
      }
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          { unitId: 27, unitCount: 26, startDate: 1794300000000, duration: 1200000 }
        ]
      }
    },
    'getHealing:unit': {
      data: {
        injuredUnits: [
          { unitId: 7, count: 12 },
          { unitId: 17, count: 12 },
          { unitId: 27, count: 12 }
        ],
        healing: null
      }
    }
  };

  // 1. completeTraining for unitId 27: removes queue and adds 26 to available (300 -> 326)
  const completeRecord = {
    transport: 'http',
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-10T14:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'completeTraining', args: { unitId: 27 }, ident: 'call-comp-27', feature: 'unit' }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'call-comp-27', result: { response: {} } }]
    })
  };

  const afterComplete = cacheHelper.merge(initialCache, [completeRecord]);
  assert.ok(afterComplete.changed, 'Cache must change on completeTraining');
  const queuesAfterComp = afterComplete.cache['getTrainings:unit'].data.trainingQueues;
  assert.equal(queuesAfterComp.length, 0, 'Completed queue should be removed');
  const avail27 = afterComplete.cache['getUnitSummary:unit'].data.available.find((u) => u.unitId === 27);
  assert.equal(avail27.count, 326, 'Available count for unitId 27 must increase by 26');

  // 2. startTraining for unitId 7 with count 26
  const startTrainRecord = {
    transport: 'http',
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-10T14:05:00.000Z',
    requestBody: JSON.stringify({
      calls: [{
        name: 'startTraining',
        args: { unitId: 7, count: 26, startDate: 1794317780000, duration: 1204892 },
        ident: 'call-train-7',
        feature: 'unit'
      }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'call-train-7', result: { response: {} } }]
    })
  };

  const afterTrain = cacheHelper.merge(afterComplete.cache, [startTrainRecord]);
  assert.ok(afterTrain.changed, 'Cache must change on startTraining');
  const queuesAfterTrain = afterTrain.cache['getTrainings:unit'].data.trainingQueues;
  assert.equal(queuesAfterTrain.length, 1);
  assert.equal(queuesAfterTrain[0].unitId, 7);
  assert.equal(queuesAfterTrain[0].unitCount, 26);

  // 3. startHealing for 36 units
  const startHealRecord = {
    transport: 'http',
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-10T14:10:00.000Z',
    requestBody: JSON.stringify({
      calls: [{
        name: 'startHealing',
        args: {
          startDate: 1794317786000,
          duration: 288000,
          units: [{ unitId: 27, count: 12 }, { unitId: 17, count: 12 }, { unitId: 7, count: 12 }]
        },
        ident: 'call-heal',
        feature: 'unit'
      }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'call-heal', result: { response: {} } }]
    })
  };

  const afterHeal = cacheHelper.merge(afterTrain.cache, [startHealRecord]);
  assert.ok(afterHeal.changed, 'Cache must change on startHealing');
  const healingObj = afterHeal.cache['getHealing:unit'].data.healing;
  assert.ok(healingObj, 'Healing object must be set');
  assert.equal(healingObj.duration, 288000);
  assert.equal(healingObj.units.length, 3);
});

test('renderDashboardTroops renders ready, train, and heal action buttons and handles interactions', async () => {
  const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

  let sentMessages = [];
  const mockChrome = {
    runtime: {
      getManifest: () => ({ version: '0.9.240' }),
      sendMessage: (msg, cb) => {
        sentMessages.push(msg);
        if (typeof cb === 'function') cb({ ok: true });
      }
    },
    storage: { local: { set: async () => {}, get: async () => ({}) } }
  };

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    querySelector: () => null
  };

  const context = vm.createContext({
    document: mockDoc,
    chrome: mockChrome,
    setTimeout,
    clearTimeout,
    Date,
    Number,
    Array,
    String,
    Math,
    globalThis: {}
  });

  // Extract variables and function
  const declStart = popupCode.indexOf('let currentTroopTrainSettings =');
  const declEnd = popupCode.indexOf(';', declStart) + 1;
  vm.runInContext(popupCode.slice(declStart, declEnd), context);

  const fnStart = popupCode.indexOf('function renderDashboardTroops(');
  const fnEnd = popupCode.indexOf('\nfunction renderEvents(', fnStart);
  const fnCode = popupCode.slice(fnStart, fnEnd);
  vm.runInContext(fnCode, context);

  const container = new MockElement('div');
  // Sibling element in dashboard that must NEVER be wiped when training or healing
  const otherDashboardSection = new MockElement('div');
  otherDashboardSection.id = 'dashboard-hero-section';
  otherDashboardSection.textContent = 'Hero Roster Section';
  container.append(otherDashboardSection);

  const now = 1794100000000;

  // Training queue for Marksmen is finished (startDate + duration <= now)
  // Spearmen has no active training (idle, total = 5000 + 12 = 5012, default max = 10000)
  // Hospital has 36 injured units and no active healing
  const mockCache = {
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 7, count: 5000 },
          { unitId: 17, count: 5000 },
          { unitId: 27, count: 5000 }
        ]
      }
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          { unitId: 7, unitCount: 26, startDate: now - 1500000, duration: 1200000 } // Finished
        ]
      }
    },
    'getHealing:unit': {
      data: {
        injuredUnits: [
          { unitId: 7, count: 12 },
          { unitId: 17, count: 12 },
          { unitId: 27, count: 12 }
        ],
        healing: null
      }
    }
  };

  context.renderDashboardTroops(mockCache, container, now);

  const section = container.querySelector('#dashboard-troops-section');
  assert.ok(section, 'Troops section must exist in container');
  assert.ok(container.querySelector('#dashboard-hero-section'), 'Other dashboard sections must be preserved');

  // 1. Heal All button
  const healAllBtn = section.querySelector('#dashboard-troops-heal-all-btn');
  assert.ok(healAllBtn, 'Heal All button must be rendered when injured units exist');
  assert.ok(healAllBtn.textContent.includes('Heal All (36)'));

  healAllBtn.listeners.click();
  const healMsg = sentMessages.find((m) => m.calls?.some((c) => c.name === 'startHealing'));
  assert.ok(healMsg, 'startHealing RPC must be sent');
  assert.equal(healMsg.calls[0].args.units.length, 3);
  assert.ok(container.querySelector('#dashboard-hero-section'), 'Hero section must not be wiped after healing');

  // 2. Ready / Collect button on Marksmen card (card 0)
  const actionHosts = section.querySelectorAll('.troop-card-action');
  assert.equal(actionHosts.length, 3, 'Must have 3 card action hosts');

  const collectBtn = actionHosts[0].children[0];
  assert.ok(collectBtn, 'Collect button must exist on completed card');
  assert.ok(collectBtn.textContent.includes('Ready / Collect'));

  sentMessages = [];
  collectBtn.listeners.click();
  const collectMsg = sentMessages.find((m) => m.calls?.some((c) => c.name === 'completeTraining'));
  assert.ok(collectMsg, 'completeTraining RPC must be sent');
  assert.equal(collectMsg.calls[0].args.unitId, 7);
  assert.ok(container.querySelector('#dashboard-hero-section'), 'Hero section must not be wiped after collecting');

  // 3. Train button and level select on Spearmen card (card 1)
  const controlsWrap = actionHosts[1].children[0];
  assert.ok(controlsWrap, 'Controls wrap must exist on idle card');

  const levelSelect = controlsWrap.querySelector('.troop-level-select');
  assert.ok(levelSelect, 'Level selector must exist on idle card');
  // Select Lv.5 for Spearmen (type 1 => unitId 10 + 5 = 15)
  levelSelect.value = '5';
  levelSelect.listeners.change?.({ target: { value: '5' } });

  const trainBtn = controlsWrap.children[1];
  assert.ok(trainBtn, 'Train button must exist on idle card');
  assert.ok(trainBtn.textContent.includes('Train (26)'));

  sentMessages = [];
  trainBtn.listeners.click();
  const trainMsg = sentMessages.find((m) => m.calls?.some((c) => c.name === 'startTraining'));
  assert.ok(trainMsg, 'startTraining RPC must be sent');
  assert.equal(trainMsg.calls[0].args.unitId, 15, 'Selected level 5 must result in unitId 15 for spearmen');
  assert.equal(trainMsg.calls[0].args.count, 26);
  assert.ok(container.querySelector('#dashboard-hero-section'), 'Hero section must not be wiped after training');
});

test('renderDashboardTroops respects max threshold and clamps unitsToTrain or disables button', async () => {
  const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

  const mockChrome = {
    runtime: { sendMessage: () => {} },
    storage: { local: { set: async () => {}, get: async () => ({}) } }
  };

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    querySelector: () => null
  };

  const context = vm.createContext({
    document: mockDoc,
    chrome: mockChrome,
    setTimeout,
    clearTimeout,
    Date,
    Number,
    Array,
    String,
    Math,
    globalThis: {}
  });

  const declStart = popupCode.indexOf('let currentTroopTrainSettings =');
  const declEnd = popupCode.indexOf(';', declStart) + 1;
  vm.runInContext(popupCode.slice(declStart, declEnd), context);

  const fnStart = popupCode.indexOf('function renderDashboardTroops(');
  const fnEnd = popupCode.indexOf('\nfunction renderEvents(', fnStart);
  const fnCode = popupCode.slice(fnStart, fnEnd);
  vm.runInContext(fnCode, context);

  const container = new MockElement('div');
  const now = 1794100000000;

  // Spearmen has total: 5000 available + 12 hospital = 5012.
  // Set configured maxTarget for Spearmen (type 1) to 5022 (remaining = 10 < 26)
  context.currentTroopTrainSettings = {
    maxTargets: { 1: 5022 },
    trainLevels: { 1: 7 }
  };
  context.globalThis.currentTroopTrainSettings = context.currentTroopTrainSettings;

  const mockCache = {
    'getUnitSummary:unit': {
      data: {
        available: [{ unitId: 17, count: 5000 }]
      }
    },
    'getTrainings:unit': {
      data: { trainingQueues: [] }
    },
    'getHealing:unit': {
      data: {
        injuredUnits: [{ unitId: 17, count: 12 }],
        healing: null
      }
    }
  };

  context.renderDashboardTroops(mockCache, container, now);
  let section = container.querySelector('#dashboard-troops-section');
  let actionHosts = section.querySelectorAll('.troop-card-action');
  let trainBtn = actionHosts[1].children[0].children[1];

  // Train button must clamp to remaining (10)
  assert.ok(trainBtn.textContent.includes('Train (10)'), 'Should train exactly remaining 10 units up to max 5022');
  assert.equal(trainBtn.disabled, false);

  // Now set maxTarget to 5012 (total count 5012 reached max)
  context.currentTroopTrainSettings.maxTargets[1] = 5012;
  context.globalThis.currentTroopTrainSettings.maxTargets[1] = 5012;
  context.renderDashboardTroops(mockCache, container, now);

  section = container.querySelector('#dashboard-troops-section');
  actionHosts = section.querySelectorAll('.troop-card-action');
  trainBtn = actionHosts[1].children[0].children[1];

  // Train button must be disabled and display "Maxed"
  assert.equal(trainBtn.disabled, true);
  assert.ok(trainBtn.textContent.includes('Maxed'), 'Train button must say Maxed when threshold reached');
});
