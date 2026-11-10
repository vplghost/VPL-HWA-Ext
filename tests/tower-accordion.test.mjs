import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set((element.className || '').split(/\s+/).filter(Boolean));
  }
  add(...names) {
    names.forEach((n) => this.classes.add(n));
    this.element.className = Array.from(this.classes).join(' ');
  }
  remove(...names) {
    names.forEach((n) => this.classes.delete(n));
    this.element.className = Array.from(this.classes).join(' ');
  }
  contains(name) {
    return this.classes.has(name);
  }
}

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this._textContent = '';
    this._innerHTML = '';
    this.classList = new MockClassList(this);
    this.listeners = {};
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]+>/g, '');
  }
  get textContent() {
    const childText = this.children.map((c) => c.textContent).join(' ');
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
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  dispatch(event, data = {}) {
    for (const fn of this.listeners[event] || []) {
      fn({ target: this, ...data });
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const results = [];
    const check = (node) => {
      let match = false;
      if (sel.startsWith('#') && (node.attributes?.id === sel.slice(1) || node.id === sel.slice(1))) match = true;
      else if (sel.startsWith('.') && node.className?.includes(sel.slice(1))) match = true;
      else if (sel.startsWith('[') && sel.endsWith(']')) {
        const attr = sel.slice(1, -1);
        if (attr.includes('=')) {
          const [k, v] = attr.split('=').map((s) => s.replace(/["']/g, ''));
          if (node.getAttribute(k) === v || node.dataset?.[k] === v) match = true;
        } else {
          if (node.attributes[attr] !== undefined || node.dataset?.[attr] !== undefined) match = true;
        }
      } else if (node.tagName?.toLowerCase() === sel.toLowerCase()) match = true;
      if (match) results.push(node);
      for (const c of node.children) check(c);
    };
    for (const c of this.children) check(c);
    return results;
  }
}

const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const towerBuffsJs = await readFile(new URL('../extension/tower-buffs.js', import.meta.url), 'utf8');

const mockDoc = {
  elementsById: new Map(),
  querySelector(sel) {
    if (sel.startsWith('#')) return this.elementsById.get(sel.slice(1)) || null;
    return null;
  },
  createElement(tag) {
    return new MockElement(tag);
  }
};

const body = new MockElement('div');
const badge = new MockElement('span');
mockDoc.elementsById.set('tower-modal-body', body);
mockDoc.elementsById.set('tower-modal-badge', badge);

const context = {
  document: mockDoc,
  window: { addEventListener: () => {} },
  setInterval: () => {},
  currentCache: {},
  towerAutomationSettings: { accountId: null, buffPriority: [] },
  towerRunState: null,
  towerAutomationMessage: '',
  popupRpcEnabled: true,
  globalThis: {},
  Date
};

vm.createContext(context);
vm.runInContext(towerBuffsJs, context);

// Run the relevant portion of popupJs containing renderTowerModal
const towerStart = popupJs.indexOf('let expandedTowerFloor = null;');
const towerEnd = popupJs.indexOf('function setupFabDial()');
vm.runInContext(popupJs.slice(towerStart, towerEnd), context);

test('Tower progress UI groups traversed floors into an accordion with single-floor expansion', () => {
  const history = [
    { action: 'endBattle', floor: 1, room: 1, win: true, stars: 3, reward: { gold: 10000 }, enemyIds: [1, 2] },
    { action: 'activateBuff', floor: 1, room: 2, buffId: 3, options: [3, 5, 8] },
    { action: 'openChest', floor: 1, room: 3, number: 1, reward: { starmoney: 50 }, options: { 1: null } },
    { action: 'endBattle', floor: 2, room: 3, win: true, stars: 2, reward: { gold: 20000 }, enemyIds: [4, 5] },
    { action: 'activateBuff', floor: 2, room: 4, buffId: 17, options: [17, 18] },
    { action: 'openChest', floor: 2, room: 5, number: 2, reward: { gold: 30000 }, options: { 2: null } }
  ];

  context.renderTowerModal({
    towerSession: {
      data: {
        floorNumber: 3,
        roomNumber: 1,
        completed: false,
        history
      }
    }
  });

  const accordionItems = body.querySelectorAll('[data-tower-floor]');
  assert.equal(accordionItems.length, 2, 'Should render 2 floor cards in the accordion');

  const floor1Card = accordionItems.find((item) => item.getAttribute('data-tower-floor') === '1');
  const floor2Card = accordionItems.find((item) => item.getAttribute('data-tower-floor') === '2');
  assert.ok(floor1Card && floor2Card, 'Both floor 1 and floor 2 cards must exist');

  // Verify compact header summaries
  assert.match(floor1Card.textContent, /Floor 1/);
  assert.match(floor1Card.textContent, /Room 1 \(Victory\)/);
  assert.match(floor1Card.textContent, /Hypno-Staff/);

  // Both detail panels collapsed initially
  const detail1 = floor1Card.querySelector('#tower-floor-detail-1');
  const detail2 = floor2Card.querySelector('#tower-floor-detail-2');
  assert.ok(detail1.className.includes('hidden'), 'Floor 1 detail should be collapsed initially');
  assert.ok(detail2.className.includes('hidden'), 'Floor 2 detail should be collapsed initially');

  // Click Floor 1 header to expand
  const btn1 = floor1Card.querySelector('button');
  btn1.dispatch('click');

  // Floor 1 detail is now expanded, Floor 2 remains collapsed
  const updatedItems1 = body.querySelectorAll('[data-tower-floor]');
  const updatedDetail1 = updatedItems1[0].querySelector('#tower-floor-detail-1');
  const updatedDetail2 = updatedItems1[1].querySelector('#tower-floor-detail-2');
  assert.ok(!updatedDetail1.className.includes('hidden'), 'Floor 1 detail should be expanded');
  assert.ok(updatedDetail2.className.includes('hidden'), 'Floor 2 detail should remain collapsed');

  // Click Floor 2 header: Accordion should expand Floor 2 and collapse Floor 1 (single-floor active)
  const btn2 = updatedItems1[1].querySelector('button');
  btn2.dispatch('click');

  const updatedItems2 = body.querySelectorAll('[data-tower-floor]');
  const reDetail1 = updatedItems2[0].querySelector('#tower-floor-detail-1');
  const reDetail2 = updatedItems2[1].querySelector('#tower-floor-detail-2');
  assert.ok(reDetail1.className.includes('hidden'), 'Floor 1 detail should collapse when Floor 2 is opened');
  assert.ok(!reDetail2.className.includes('hidden'), 'Floor 2 detail should be expanded');

  // Click Floor 2 header again: Toggles closed
  const reBtn2 = updatedItems2[1].querySelector('button');
  reBtn2.dispatch('click');

  const updatedItems3 = body.querySelectorAll('[data-tower-floor]');
  const finalDetail1 = updatedItems3[0].querySelector('#tower-floor-detail-1');
  const finalDetail2 = updatedItems3[1].querySelector('#tower-floor-detail-2');
  assert.ok(finalDetail1.className.includes('hidden'), 'Floor 1 detail should be collapsed');
  assert.ok(finalDetail2.className.includes('hidden'), 'Floor 2 detail should be collapsed');
});
