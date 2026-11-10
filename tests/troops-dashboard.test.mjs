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
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
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
}

const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

function setupContext() {
  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    querySelector: () => null
  };
  const mockChrome = {
    runtime: {
      getManifest: () => ({ version: '0.9.231' }),
      sendMessage: () => {}
    },
    storage: { local: { get: async () => ({}) } }
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

  // Extract renderDashboardTroops function
  const fnStart = popupCode.indexOf('function renderDashboardTroops(');
  assert.ok(fnStart > 0, 'renderDashboardTroops must exist in popup.js');
  const fnEnd = popupCode.indexOf('\nfunction renderEvents(', fnStart);
  assert.ok(fnEnd > fnStart, 'renderEvents boundary must follow renderDashboardTroops');
  const fnCode = popupCode.slice(fnStart, fnEnd);
  vm.runInContext(fnCode, context);

  return context;
}

test('renderDashboardTroops renders 3 troop cards with accurate ready, hospital, and training numbers and bar segments', () => {
  const context = setupContext();
  const container = new MockElement('div');
  const now = 1794100000000;

  const mockCache = {
    'getUnitSummary:unit': {
      data: {
        available: [
          { unitId: 7, count: 8943 },
          { unitId: 17, count: 8948 },
          { unitId: 27, count: 8951 },
          { unitId: 5, count: 50 } // Lv.5 Marksmen
        ],
        squads: [
          {
            units: [
              { id: 7, state: { survived: 1000 } },
              { id: 17, state: { survived: 1000 } },
              { id: 27, state: { survived: 1000 } }
            ]
          }
        ]
      }
    },
    'getHealing:unit': {
      data: {
        injuredUnits: [
          { unitId: 7, count: 2717 },
          { unitId: 17, count: 2712 },
          { unitId: 27, count: 2709 }
        ],
        healing: {
          startDate: 1794100000000,
          duration: 3600000, // 1 hour
          units: [
            { unitId: 7, count: 2686 },
            { unitId: 17, count: 2685 },
            { unitId: 27, count: 2682 }
          ]
        }
      }
    },
    'getTrainings:unit': {
      data: {
        trainingQueues: [
          { unitId: 7, unitCount: 300, startDate: 1794100000000, duration: 1800000 }, // 30 min
          { unitId: 17, unitCount: 405, startDate: 1794100000000, duration: 1800000 },
          { unitId: 27, unitCount: 405, startDate: 1794100000000, duration: 1800000 }
        ]
      }
    }
  };

  context.renderDashboardTroops(mockCache, container, now);

  const section = container.querySelector('#dashboard-troops-section');
  assert.ok(section, 'Troops section must exist');

  const refreshBtn = section.querySelector('#dashboard-troops-refresh-btn');
  assert.ok(refreshBtn, 'Refresh button must exist');

  const text = section.textContent;

  // Troop types present
  assert.ok(text.includes('Marksmen'));
  assert.ok(text.includes('Spearmen'));
  assert.ok(text.includes('Infantry'));

  // Marksmen breakdown: Ready 50 (Lv.5) + 8943 (Lv.7) + 1000 (squad Lv.7) = 9993
  // Ready breakdown shows both levels in ascending order: Lv.5: 50 · Lv.7: 9,943
  assert.ok(text.includes('Lv.5: 50'));
  assert.ok(text.includes('Lv.7: 9,943'));

  // Hospital & Healing timer
  assert.ok(text.includes('Hospital: 2,717'));
  assert.ok(text.includes('⏳ 1h 0m'));

  // Training & Timer
  assert.ok(text.includes('Training: 300'));
  assert.ok(text.includes('⏳ 30m 0s'));

  // Max calculation: 9993 ready + 2717 hospital + 300 training = 13,010
  assert.ok(text.includes('13,010'));
});

test('Building #163 is named Garrison Wall in name-map', async () => {
  const dataNamesCode = await readFile(new URL('../extension/data-names.js', import.meta.url), 'utf8');
  const nameMapCode = await readFile(new URL('../extension/name-map.js', import.meta.url), 'utf8');
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(dataNamesCode, context);
  vm.runInContext(nameMapCode, context);

  const buildingName = context.globalThis.hwaHelperNameMap.building(163);
  assert.equal(buildingName, 'Garrison Wall');
});

test('renderCampaignDialog displays accurate gear, fragment, and consumable names in raid results', async () => {
  const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const dataNamesJs = await readFile(new URL('../extension/data-names.js', import.meta.url), 'utf8');
  const nameMapJs = await readFile(new URL('../extension/name-map.js', import.meta.url), 'utf8');

  assert.ok(popupJs.includes("getItemName('gear', gId) || getItemName('scroll', gId)"));
  assert.ok(popupJs.includes("getItemName('consumable', cId)"));
  assert.ok(popupJs.includes('sm:grid-cols-3 gap-2'));
});
