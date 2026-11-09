import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this._textContent = undefined;
    this.attributes = {};
    this.open = false;
  }
  get textContent() {
    if (this._textContent !== undefined) return this._textContent;
    if (this.children.length > 0) return this.children.map((c) => c.textContent).join(' ');
    return '';
  }
  set textContent(val) {
    this._textContent = val;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name, event = {}) {
    await this.listeners[name]?.({
      currentTarget: this,
      target: this,
      stopPropagation: () => {},
      preventDefault: () => {},
      ...event
    });
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  all(tag) {
    return this.children.flatMap((c) => [
      ...(c.tagName === tag ? [c] : []),
      ...(typeof c.all === 'function' ? c.all(tag) : [])
    ]);
  }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.attributes?.id === id || this.id === id) return this;
      for (const c of this.children) {
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    return null;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    this.textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.children.map((c) => c.innerHTML).join(' ') || this.textContent;
  }
}

test('popup.html includes #quest-detail-dialog with title and body', async () => {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  assert.match(html, /<dialog\s+id="quest-detail-dialog"/);
  assert.match(html, /id="quest-detail-dialog-title"/);
  assert.match(html, /id="quest-detail-dialog-status"/);
  assert.match(html, /id="quest-detail-dialog-body"/);
});

test('renderDashboard presents activities, quests, and gifts in a 2-column grid and quest cards are interactive', async () => {
  const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const questCode = await readFile(new URL('../extension/quest-data.js', import.meta.url), 'utf8');
  const dashCode = await readFile(new URL('../extension/dashboard-data.js', import.meta.url), 'utf8');
  const nameMapCode = await readFile(new URL('../extension/name-map.js', import.meta.url), 'utf8');

  const elements = new Map();
  const getEl = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new MockElement(sel.startsWith('#') ? 'div' : sel));
    return elements.get(sel);
  };

  const statusEl = new MockElement('p');
  const viewEl = new MockElement('div');
  const dialogEl = new MockElement('dialog');
  dialogEl.id = 'quest-detail-dialog';
  elements.set('#quest-detail-dialog', dialogEl);
  elements.set('#quest-detail-dialog-body', new MockElement('div'));
  elements.set('#quest-detail-dialog-status', new MockElement('div'));

  const context = {
    Date, Number, Array, Math, Set, Map, String, console,
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => getEl(sel)
    },
    status: statusEl,
    view: viewEl,
    globalThis: {}
  };

  vm.runInNewContext(nameMapCode, context);
  vm.runInNewContext(questCode, context);
  vm.runInNewContext(dashCode, context);

  // Run popup up to end of renderDashboard
  const renderDashboardSrc = popupCode.slice(
    popupCode.indexOf('function renderDashboard('),
    popupCode.indexOf('\nfunction renderEvents(')
  );

  let openedDialogType = null;
  context.openQuestDetailDialog = (type) => { openedDialogType = type; };

  vm.runInNewContext(renderDashboardSrc, context);

  const sampleCache = {
    towerStatus: { data: { isCleared: false, floorNumber: 10 }, updatedAt: new Date().toISOString() },
    'resource:refillable:6': { data: { amount: 5 }, updatedAt: new Date().toISOString() },
    'getDailyQuests:quest': { data: { quests: [{ id: 346, state: 'inProgress' }, { id: 356, state: 'completed' }] }, updatedAt: new Date().toISOString() },
    questGetAll: { data: [{ id: 346, state: 2, name: 'Building upgrade', reward: { gold: 5000 } }], updatedAt: new Date().toISOString() },
    dailyBonusGetInfo: { data: { availableToday: true }, updatedAt: new Date().toISOString() }
  };

  context.renderDashboard(sampleCache);

  // Check structure: container -> intro + sections
  const container = viewEl.children[0];
  assert.ok(container);
  const sections = container.children.filter((c) => c.tagName === 'section');
  assert.equal(sections.length, 3); // Activities, Daily Quests, Free Gifts

  // Every section must contain a 2-column grid container
  for (const sec of sections) {
    const grid = sec.children.find((c) => c.className?.includes('grid-cols-'));
    assert.ok(grid, 'Section should have a grid container');
    assert.ok(grid.className.includes('grid-cols-1') && grid.className.includes('grid-cols-2'),
      'Grid should be responsive 2-column layout');
  }

  // Find the Quest section cards
  const questSection = sections[1];
  const questGrid = questSection.children.find((c) => c.className?.includes('grid-cols-'));
  assert.ok(questGrid.children.length >= 1);
  const dailyQuestCard = questGrid.children[0];

  assert.equal(dailyQuestCard.getAttribute('role'), 'button');
  assert.equal(dailyQuestCard.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(dailyQuestCard.getAttribute('aria-controls'), 'quest-detail-dialog');
  assert.ok(dailyQuestCard.className.includes('cursor-pointer'));

  // Trigger click on quest card
  await dailyQuestCard.fire('click');
  assert.equal(openedDialogType, 'daily-quests');
});

test('getDetailedQuests aggregates daily quests and event quests with correct states and rewards', async () => {
  const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const questCode = await readFile(new URL('../extension/quest-data.js', import.meta.url), 'utf8');
  const dashCode = await readFile(new URL('../extension/dashboard-data.js', import.meta.url), 'utf8');
  const nameMapCode = await readFile(new URL('../extension/name-map.js', import.meta.url), 'utf8');

  const context = {
    Date, Number, Array, Math, Set, Map, String, console,
    document: { createElement: (tag) => new MockElement(tag), querySelector: () => null },
    globalThis: {}
  };

  vm.runInNewContext(nameMapCode, context);
  vm.runInNewContext(questCode, context);
  vm.runInNewContext(dashCode, context);

  // Extract towerRewardText, getDetailedQuests, openQuestDetailDialog, renderQuestDetailDialog
  const questDetailsSrc = popupCode.slice(
    popupCode.indexOf('function towerRewardText('),
    popupCode.indexOf('\nfunction setupBuildingAndResearchDialogs(')
  );

  vm.runInNewContext(questDetailsSrc, context);

  const sampleCache = {
    'getDailyQuests:quest': {
      data: {
        quests: [
          { id: 346, state: 'inProgress', progress: 0 },
          { id: 356, state: 'completed', progress: 10000 }
        ]
      },
      updatedAt: new Date().toISOString()
    },
    questGetAll: {
      data: [
        { id: 346, state: 2, reward: { gold: 10000, stamina: 50 }, progress: 1 }
      ]
    },
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 1001, viewId: 65, start: 0, end: Date.now() + 86400000,
            groups: [
              {
                id: 1, localeKey: 'QUEST_TAB_NAME_TOWER_CHESTS', repeatType: 'daily',
                quests: [
                  { id: 101, state: 'inProgress', progress: 3, reward: { consumable: { 51: 10 } } }
                ]
              }
            ]
          }
        ]
      },
      updatedAt: new Date().toISOString()
    }
  };

  const detailed = context.getDetailedQuests(sampleCache);
  assert.ok(detailed.length >= 3);

  // Quest 346 should be ready (state 2 in questGetAll)
  const q346 = detailed.find((q) => q.id === 346);
  assert.ok(q346);
  assert.equal(q346.state, 'ready');
  assert.equal(q346.category, 'daily');
  assert.equal(q346.title, 'Complete a building upgrade');
  assert.deepEqual(q346.reward, { gold: 10000, stamina: 50 });

  // Event quest 101
  const q101 = detailed.find((q) => q.id === 101);
  assert.ok(q101);
  assert.equal(q101.state, 'inProgress');
  assert.equal(q101.category, 'event');
  assert.equal(q101.eventName, 'Clan Clash Event');
});

test('renderQuestDetailDialog renders filter tabs, search input, status badge, and cards', async () => {
  const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const questCode = await readFile(new URL('../extension/quest-data.js', import.meta.url), 'utf8');
  const dashCode = await readFile(new URL('../extension/dashboard-data.js', import.meta.url), 'utf8');
  const nameMapCode = await readFile(new URL('../extension/name-map.js', import.meta.url), 'utf8');

  const elements = new Map();
  const getEl = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new MockElement(sel.startsWith('#') ? 'div' : sel));
    return elements.get(sel);
  };

  const bodyEl = new MockElement('div');
  bodyEl.id = 'quest-detail-dialog-body';
  const statusEl = new MockElement('div');
  statusEl.id = 'quest-detail-dialog-status';
  const dialogEl = new MockElement('dialog');
  dialogEl.id = 'quest-detail-dialog';

  elements.set('#quest-detail-dialog-body', bodyEl);
  elements.set('#quest-detail-dialog-status', statusEl);
  elements.set('#quest-detail-dialog', dialogEl);

  const context = {
    Date, Number, Array, Math, Set, Map, String, console,
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => getEl(sel)
    },
    globalThis: {}
  };

  vm.runInNewContext(nameMapCode, context);
  vm.runInNewContext(questCode, context);
  vm.runInNewContext(dashCode, context);

  const questDetailsSrc = popupCode.slice(
    popupCode.indexOf('function towerRewardText('),
    popupCode.indexOf('\nfunction setupBuildingAndResearchDialogs(')
  );

  vm.runInNewContext(questDetailsSrc, context);

  const sampleCache = {
    'getDailyQuests:quest': {
      data: {
        quests: [
          { id: 346, state: 'inProgress', progress: 0 },
          { id: 356, state: 'completed', progress: 10000 }
        ]
      },
      updatedAt: new Date().toISOString()
    },
    questGetAll: {
      data: [
        { id: 346, state: 2, reward: { gold: 10000 }, progress: 1 }
      ]
    }
  };

  context.renderQuestDetailDialog('all', sampleCache);

  // Status should contain Ready count badge
  assert.ok(statusEl.textContent.includes('Ready to Claim'));

  // Body should contain toolbar (tabs + search) and cards container
  assert.ok(bodyEl.children.length >= 2);
  const toolbar = bodyEl.children[0];
  const tabs = toolbar.all('button');
  assert.equal(tabs.length, 4); // All, Daily, Event, Ready

  const searchInput = toolbar.children.find((c) => c.tagName === 'input');
  assert.ok(searchInput);

  const cardsContainer = bodyEl.children[1];
  const grid = cardsContainer.children[0];
  assert.ok(grid);
  assert.ok(grid.children.length >= 2);

  // Test tab click filtering to 'ready'
  const readyTab = tabs.find((t) => t.textContent.includes('Ready'));
  assert.ok(readyTab);
  await readyTab.fire('click');
  assert.equal(context.globalThis.currentQuestFilter, 'ready');
});
