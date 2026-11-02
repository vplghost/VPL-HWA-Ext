import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this.parentElement = null;
    this.listeners = {};
    this.checked = false;
    this.disabled = false;
  }
  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  async dispatch(event, e = {}) {
    for (const fn of this.listeners[event] || []) {
      await fn({ currentTarget: this, target: this, ...e });
    }
  }
  append(...kids) {
    kids.forEach((k) => {
      k.parentElement = this;
      this.children.push(k);
    });
  }
  replaceChildren(...kids) {
    this.children = [];
    this.append(...kids);
  }
  insertBefore(newNode, refNode) {
    const existingIdx = this.children.indexOf(newNode);
    if (existingIdx !== -1) {
      this.children.splice(existingIdx, 1);
    }
    const targetIdx = refNode ? this.children.indexOf(refNode) : -1;
    if (targetIdx !== -1) {
      newNode.parentElement = this;
      this.children.splice(targetIdx, 0, newNode);
    } else {
      this.append(newNode);
    }
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const matches = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (sel.startsWith('[data-tab="') && sel.endsWith('"]')) {
          const tabId = sel.slice('[data-tab="'.length, -2);
          if (child.dataset?.tab === tabId) matches.push(child);
        } else if (sel.startsWith('[data-tab-id="') && sel.endsWith('"]')) {
          const tabId = sel.slice('[data-tab-id="'.length, -2);
          if (child.dataset?.tabId === tabId) matches.push(child);
        } else if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          if (child.className?.split(/\s+/).includes(cls)) matches.push(child);
        } else if (sel.startsWith('#')) {
          const id = sel.slice(1);
          if (child.attributes?.id === id) matches.push(child);
        } else if (child.tagName.toLowerCase() === sel.toLowerCase()) {
          matches.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
}

async function loadTabConfigHelper(customDoc = null, customActiveTab = 'heroes') {
  const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

  // Extract from DEFAULT_TAB_CONFIG to globalThis.hwaHelperTabConfig
  const startIdx = popupJs.indexOf('const DEFAULT_TAB_CONFIG =');
  const endMarker = 'globalThis.hwaHelperTabConfig = {';
  const endIdx = popupJs.indexOf(endMarker);
  const closingBraceIdx = popupJs.indexOf('};', endIdx) + 2;
  const snippet = popupJs.slice(startIdx, closingBraceIdx);

  const context = {
    globalThis: {},
    Set,
    Array,
    Object,
    String,
    document: customDoc || {
      createElement: (tag) => new MockElement(tag),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    activeTab: customActiveTab,
    chrome: {
      storage: {
        local: {
          set: async () => {},
          get: async () => ({})
        }
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(snippet, context);
  return { helper: context.globalThis.hwaHelperTabConfig, context };
}

test('normalizeTabConfig handles defaults, reordering, missing items, and visibility', async () => {
  const { helper } = await loadTabConfigHelper();
  const { DEFAULT_TAB_CONFIG, normalizeTabConfig } = helper;

  assert.equal(DEFAULT_TAB_CONFIG.length, 9);

  // 1. Empty/null input returns all defaults with visible: true
  const fromNull = normalizeTabConfig(null);
  assert.equal(fromNull.length, 9);
  assert.ok(fromNull.every((t) => t.visible === true));

  // 2. Custom order preserved
  const customOrder = [
    { id: 'titans', visible: true },
    { id: 'heroes', visible: false },
    { id: 'log', visible: true }
  ];
  const fromCustom = normalizeTabConfig(customOrder);
  assert.equal(fromCustom[0].id, 'titans');
  assert.equal(fromCustom[0].visible, true);
  assert.equal(fromCustom[1].id, 'heroes');
  assert.equal(fromCustom[1].visible, false);
  assert.equal(fromCustom[2].id, 'log');
  // Missing tabs are appended
  assert.equal(fromCustom.length, 9);
  assert.ok(fromCustom.some((t) => t.id === 'draft' && t.visible === true));

  // 3. All hidden guard ensures at least one visible
  const allHidden = DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: false }));
  const fromAllHidden = normalizeTabConfig(allHidden);
  assert.ok(fromAllHidden.some((t) => t.visible === true));
  assert.equal(fromAllHidden[0].visible, true);
});

test('applyTabConfig reorders DOM tabs, hides disabled tabs, and updates activeTab', async () => {
  const nav = new MockElement('nav');
  nav.setAttribute('id', 'tabs');

  ['heroes', 'draft', 'items', 'resources', 'titans', 'teams', 'events', 'goals', 'log'].forEach((id) => {
    const btn = new MockElement('button');
    btn.dataset.tab = id;
    btn.setAttribute('data-tab', id);
    nav.append(btn);
  });

  const configBtn = new MockElement('button');
  configBtn.dataset.tab = 'config';
  configBtn.setAttribute('data-tab', 'config');
  nav.append(configBtn);

  const mockDoc = {
    querySelector: (sel) => {
      if (sel === '#tabs') return nav;
      return null;
    }
  };

  const { helper, context } = await loadTabConfigHelper(mockDoc, 'heroes');

  // Reorder so titans is first, and heroes is hidden
  const testConfig = [
    { id: 'titans', visible: true },
    { id: 'draft', visible: true },
    { id: 'heroes', visible: false },
    { id: 'items', visible: true },
    { id: 'resources', visible: true },
    { id: 'teams', visible: true },
    { id: 'events', visible: true },
    { id: 'goals', visible: true },
    { id: 'log', visible: true }
  ];

  helper.applyTabConfig(testConfig);

  // Check DOM order of nav children
  assert.equal(nav.children[0].dataset.tab, 'titans');
  assert.equal(nav.children[1].dataset.tab, 'draft');
  assert.equal(nav.children[2].dataset.tab, 'heroes');
  assert.equal(nav.children[nav.children.length - 1].dataset.tab, 'config');

  // Check heroes is hidden
  const heroesBtn = nav.children.find((c) => c.dataset.tab === 'heroes');
  assert.equal(heroesBtn.hidden, true);

  // Since activeTab was heroes (now hidden), it switched to first visible (titans)
  assert.equal(context.activeTab, 'titans');
});

test('renderConfigTabs renders rows with up/down buttons and visibility toggle', async () => {
  const tabsList = new MockElement('div');
  tabsList.setAttribute('id', 'config-tabs-list');

  const nav = new MockElement('nav');
  nav.setAttribute('id', 'tabs');

  ['heroes', 'draft', 'items', 'resources', 'titans', 'teams', 'events', 'goals', 'log'].forEach((id) => {
    const btn = new MockElement('button');
    btn.dataset.tab = id;
    nav.append(btn);
  });
  const configBtn = new MockElement('button');
  configBtn.dataset.tab = 'config';
  nav.append(configBtn);

  let savedConfig = null;
  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === '#config-tabs-list') return tabsList;
      if (sel === '#tabs') return nav;
      return null;
    }
  };

  const { helper, context } = await loadTabConfigHelper(mockDoc, 'heroes');
  context.chrome.storage.local.set = async (obj) => { savedConfig = obj.tabConfig; };

  helper.renderConfigTabs();

  // 9 rows rendered
  assert.equal(tabsList.children.length, 9);

  // First row is Heroes
  const firstRow = tabsList.children[0];
  const firstCheckbox = firstRow.querySelector('.tab-visibility-toggle');
  assert.ok(firstCheckbox);
  assert.equal(firstCheckbox.checked, true);

  const firstUpBtn = firstRow.querySelector('.tab-move-up-btn');
  const firstDownBtn = firstRow.querySelector('.tab-move-down-btn');
  assert.equal(firstUpBtn.disabled, true); // First item cannot move up
  assert.equal(firstDownBtn.disabled, false);

  // Click Move Down on first item (Heroes)
  await firstDownBtn.dispatch('click');
  // First item is now Draft, second is Heroes
  assert.equal(helper.currentTabConfig[0].id, 'draft');
  assert.equal(helper.currentTabConfig[1].id, 'heroes');
  assert.ok(savedConfig);

  // Toggle visibility off on Heroes
  const heroesRow = tabsList.children[1];
  const heroesCheckbox = heroesRow.querySelector('.tab-visibility-toggle');
  heroesCheckbox.checked = false;
  await heroesCheckbox.dispatch('change');
  assert.equal(helper.currentTabConfig[1].visible, false);

  // Try to hide all other tabs until 1 left
  for (let i = 0; i < helper.currentTabConfig.length; i++) {
    helper.currentTabConfig[i].visible = false;
  }
  // Leave only 1 visible: Draft
  helper.currentTabConfig[0].visible = true;
  helper.renderConfigTabs();

  const draftCheckbox = tabsList.children[0].querySelector('.tab-visibility-toggle');
  draftCheckbox.checked = false; // Try to uncheck the only remaining tab
  await draftCheckbox.dispatch('change');
  // Guard keeps it true!
  assert.equal(draftCheckbox.checked, true);
  assert.equal(helper.currentTabConfig[0].visible, true);
});
