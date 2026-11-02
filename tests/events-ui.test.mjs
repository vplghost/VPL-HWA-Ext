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
    names.forEach(n => this.classes.add(n));
    this.element.className = Array.from(this.classes).join(' ');
  }
  remove(...names) {
    names.forEach(n => this.classes.delete(n));
    this.element.className = Array.from(this.classes).join(' ');
  }
  toggle(name, force) {
    const shouldAdd = force !== undefined ? Boolean(force) : !this.classes.has(name);
    if (shouldAdd) this.classes.add(name);
    else this.classes.delete(name);
    this.element.className = Array.from(this.classes).join(' ');
    return shouldAdd;
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
    this.value = '';
    this.hidden = false;
    this.classList = new MockClassList(this);
    this.parentElement = null;
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
    const childText = this.children.map(c => c.textContent).join(' ');
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
        textNode.parentElement = this;
        this.children.push(textNode);
      } else if (node) {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }
  appendChild(node) {
    this.append(node);
    return node;
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
      if (sel.startsWith('#') && node.attributes?.id === sel.slice(1)) match = true;
      else if (sel.startsWith('.') && node.className?.includes(sel.slice(1))) match = true;
      else if (sel.startsWith('[') && sel.endsWith(']')) {
        const attr = sel.slice(1, -1);
        if (attr.includes('=')) {
          const [k, v] = attr.split('=').map(s => s.replace(/["']/g, ''));
          const camelK = k.replace(/^data-/, '').replace(/-([a-z])/g, (_, g) => g.toUpperCase());
          if (node.getAttribute(k) === v || node.dataset?.[k.replace('data-', '')] === v || node.dataset?.[camelK] === v) match = true;
        } else {
          const k = attr.replace('data-', '');
          const camelK = k.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
          if (node.attributes[attr] !== undefined || node.dataset?.[k] !== undefined || node.dataset?.[camelK] !== undefined) match = true;
        }
      } else if (node.tagName?.toLowerCase() === sel.toLowerCase()) match = true;
      if (match) results.push(node);
      for (const c of node.children) check(c);
    };
    for (const c of this.children) check(c);
    return results;
  }
}

const view = new MockElement('div');
const status = new MockElement('p');
const search = new MockElement('input');
const modal = new MockElement('div');
modal.setAttribute('id', 'guild-versus-modal');
modal.hidden = true;
const modalBody = new MockElement('div');
modalBody.setAttribute('id', 'gvs-modal-body');
const modalClose = new MockElement('button');
modalClose.setAttribute('id', 'gvs-modal-close');
const leagueBadge = new MockElement('span');
leagueBadge.setAttribute('id', 'gvs-league-badge');
const energyBadge = new MockElement('span');
energyBadge.setAttribute('id', 'energy-badge');
const energyVal = new MockElement('span');
energyVal.setAttribute('id', 'energy-value');
const energyMax = new MockElement('span');
energyMax.setAttribute('id', 'energy-max');
const worldEnergyBadge = new MockElement('span');
worldEnergyBadge.setAttribute('id', 'world-energy-badge');
const worldEnergyVal = new MockElement('span');
worldEnergyVal.setAttribute('id', 'world-energy-value');
const eventsBadge = new MockElement('span');
eventsBadge.setAttribute('id', 'events-tab-badge');
const buildingBadge = new MockElement('span');
buildingBadge.setAttribute('id', 'building-badge');
const buildingTime = new MockElement('span');
buildingTime.setAttribute('id', 'building-time');
const researchBadge = new MockElement('span');
researchBadge.setAttribute('id', 'research-badge');
const researchTime = new MockElement('span');
researchTime.setAttribute('id', 'research-time');
const marchesWrap = new MockElement('div');
marchesWrap.setAttribute('id', 'marches');
const headerResources = new MockElement('div');
headerResources.setAttribute('id', 'header-resources');
const mailBadge = new MockElement('span');
mailBadge.setAttribute('id', 'mail-badge');
mailBadge.hidden = true;
const heroesBadge = new MockElement('span');
heroesBadge.setAttribute('id', 'heroes-tab-badge');
heroesBadge.hidden = true;
const titansBadge = new MockElement('span');
titansBadge.setAttribute('id', 'titans-tab-badge');
titansBadge.hidden = true;
const btnRefreshAll = new MockElement('button');
btnRefreshAll.setAttribute('id', 'btn-refresh-all');
const btnRefreshCore = new MockElement('button');
btnRefreshCore.setAttribute('id', 'btn-refresh-core');
const btnRefreshRoster = new MockElement('button');
btnRefreshRoster.setAttribute('id', 'btn-refresh-roster');
const btnRefreshQuests = new MockElement('button');
btnRefreshQuests.setAttribute('id', 'btn-refresh-quests');
const btnRefreshMail = new MockElement('button');
btnRefreshMail.setAttribute('id', 'btn-refresh-mail');
const configRefreshStatus = new MockElement('span');
configRefreshStatus.setAttribute('id', 'config-refresh-status');
const clearCacheBtn = new MockElement('button');
clearCacheBtn.setAttribute('id', 'clear-cache');
const dungeonModal = new MockElement('div');
dungeonModal.setAttribute('id', 'dungeon-modal');
dungeonModal.hidden = true;
const dungeonModalBody = new MockElement('div');
dungeonModalBody.setAttribute('id', 'dungeon-modal-body');
const dungeonModalClose = new MockElement('button');
dungeonModalClose.setAttribute('id', 'dungeon-modal-close');
const dungeonFloorBadge = new MockElement('span');
dungeonFloorBadge.setAttribute('id', 'dungeon-floor-badge');
const tableExportBtn = new MockElement('button');
tableExportBtn.setAttribute('id', 'table-export-btn');
tableExportBtn.hidden = true;
const resourceFilterToggle = new MockElement('button');
resourceFilterToggle.setAttribute('id', 'resource-filter-toggle');
const resourceFilterToggleText = new MockElement('span');
resourceFilterToggleText.setAttribute('id', 'resource-filter-toggle-text');

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag),
  elementsById: new Map([
    ['table-export-btn', tableExportBtn],
    ['resource-filter-toggle', resourceFilterToggle],
    ['resource-filter-toggle-text', resourceFilterToggleText],
    ['view', view],
    ['status', status],
    ['search', search],
    ['guild-versus-modal', modal],
    ['gvs-modal-body', modalBody],
    ['gvs-modal-close', modalClose],
    ['gvs-league-badge', leagueBadge],
    ['dungeon-modal', dungeonModal],
    ['dungeon-modal-body', dungeonModalBody],
    ['dungeon-modal-close', dungeonModalClose],
    ['dungeon-floor-badge', dungeonFloorBadge],
    ['energy-badge', energyBadge],
    ['energy-value', energyVal],
    ['energy-max', energyMax],
    ['world-energy-badge', worldEnergyBadge],
    ['world-energy-value', worldEnergyVal],
    ['events-tab-badge', eventsBadge],
    ['building-badge', buildingBadge],
    ['building-time', buildingTime],
    ['research-badge', researchBadge],
    ['research-time', researchTime],
    ['marches', marchesWrap],
    ['header-resources', headerResources],
    ['mail-badge', mailBadge],
    ['heroes-tab-badge', heroesBadge],
    ['titans-tab-badge', titansBadge],
    ['btn-refresh-all', btnRefreshAll],
    ['btn-refresh-core', btnRefreshCore],
    ['btn-refresh-roster', btnRefreshRoster],
    ['btn-refresh-quests', btnRefreshQuests],
    ['btn-refresh-mail', btnRefreshMail],
    ['config-refresh-status', configRefreshStatus],
    ['clear-cache', clearCacheBtn]
  ]),
  querySelector(sel) {
    if (sel.startsWith('#')) return this.elementsById.get(sel.slice(1)) || null;
    return view.querySelector(sel);
  },
  querySelectorAll(sel) {
    if (sel === '[data-resource-header="true"]') {
      return headerResources.querySelectorAll('[data-resource-header="true"]');
    }
    return view.querySelectorAll(sel);
  }
};

const clanVersusRulesJs = await readFile(new URL('../extension/clan-versus-rules.js', import.meta.url), 'utf8');
const resourceDataJs = await readFile(new URL('../extension/resource-data.js', import.meta.url), 'utf8');
const titanMetadataJs = await readFile(new URL('../extension/titan-metadata.js', import.meta.url), 'utf8');
const popupDataJs = await readFile(new URL('../extension/popup-data.js', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const popupCss = await readFile(new URL('../extension/popup.css', import.meta.url), 'utf8');

const context = {
  document: mockDoc,
  window: { addEventListener: () => {} },
  setInterval: () => {},
  view,
  status,
  search,
  currentCache: {},
  globalThis: {},
  showEmpty: (msg) => {
    const p = new MockElement('p');
    p.textContent = msg;
    view.append(p);
  },
  setResourceTooltip: (node, val) => { if (node && node.dataset) { node.dataset.resourceTooltip = val; node.setAttribute('data-resource-tooltip', val); } },
  resourceTooltip: () => '',
  isMarchExpired: (march, now) => context.hwaHelperPopupData.isMarchExpired(march, now),
  marchTooltip: () => ''
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(clanVersusRulesJs, context);
vm.runInContext(resourceDataJs, context);
vm.runInContext(titanMetadataJs, context);
vm.runInContext(popupDataJs, context);
context.Date = Date;
context.resourceData = context.globalThis.hwaHelperResourceData;
context.globalThis.hwaHelperNameMap = { building: () => '', research: () => '', item: () => null, hero: () => null };

// Extract renderEvents, openGuildVersusModal, setupGuildVersusModal from popupJs
const eventsStart = popupJs.indexOf('function openGuildVersusModal(');
const eventsEnd = popupJs.indexOf('function renderGuildChat(');
vm.runInContext(popupJs.slice(eventsStart, eventsEnd), context);

// Extract refreshTimed
const refreshStart = popupJs.indexOf('function isMarchExpired(');
const refreshEnd = popupJs.indexOf('function renderResources(');
vm.runInContext(popupJs.slice(refreshStart, refreshEnd), context);

// Extract showSnapshot
const snapStart = popupJs.indexOf('function showSnapshot(');
const snapEnd = popupJs.indexOf('function renderLog(');
context.tableExportBtn = tableExportBtn;
context.formatTime = (t) => t;
context.matches = () => true;
context.table = () => new MockElement('table');
vm.runInContext(popupJs.slice(snapStart, snapEnd), context);

// Extract refresh logic
const refreshLogicStart = popupJs.indexOf("const refreshGroups =");
const refreshLogicEnd = popupJs.indexOf("document.querySelector('#clear-cache')");
if (refreshLogicStart !== -1 && refreshLogicEnd !== -1) {
  vm.runInContext(popupJs.slice(refreshLogicStart, refreshLogicEnd), context);
}

// Extract resource helpers and renderResources
const resHelperStart = popupJs.indexOf('function resourceLabel(');
const resHelperEnd = popupJs.indexOf('function resourceEntries(');
vm.runInContext(popupJs.slice(resHelperStart, resHelperEnd), context);

const resStart = popupJs.indexOf('function renderResources(');
const resEnd = popupJs.indexOf('function starIcons(');
context.resourceSort = { value: 'name' };
context.resourceFilterToggle = resourceFilterToggle;
context.resourceFilterToggleText = resourceFilterToggleText;
context.showAllResources = false;
context.chrome = { storage: { local: { get: async () => ({ resourceSelection: [] }), set: async () => {} } } };
vm.runInContext(popupJs.slice(resStart, resEnd), context);

test('renderEvents renders Guild Versus and active event cards', () => {
  const cache = {
    clanVersusStatus: {
      data: {
        battle: {
          league: 'bronze',
          clan: { id: 305081, name: '4-LEAF CLOVER', server: '1431' },
          enemyClan: { id: 100752873, name: 'Black', server: '1410' },
          clanBattleScore: 0,
          enemyClanBattleScore: 0,
          clanRoundPoints: 10145150,
          enemyClanRoundPoints: 657950,
          rounds: [{ index: 1, theme: 'Radar Training', score: 1, points: 10145150, enemyPoints: 657950, status: 'inProgress' }]
        },
        info: { battleNumber: 4, roundNumber: 1, currentNumActiveUsers: 28 },
        rewards: { userRoundPoints: 123700, userClanRank: 14, seasonClanRank: 1 },
        score: 123700,
        chestNumbers: [1, 2]
      }
    },
    clanWarChampStatus: {
      data: { seasonId: 58, tries: 0, seasonStatus: { current: { stageType: 'REGULAR_STAGE', startHour: 7, endHour: 20 } } }
    },
    questEvents: {
      data: { events: [{ id: 90249, name_localeKey: 'ADVENTURE_HERO62_TITLE_EVENT_UPGRADE' }] }
    }
  };

  view.replaceChildren();
  search.value = '';
  context.renderEvents(cache);

  assert.ok(status.textContent.includes('active event'));
  assert.equal(view.children.length, 1);
  const container = view.children[0];
  assert.equal(container.children.length, 3); // 3 event cards

  const text = container.textContent;
  assert.ok(text.includes('Guild Versus'));
  assert.ok(text.includes('4-LEAF CLOVER'));
  assert.ok(text.includes('Black'));
  assert.ok(text.includes('10.1M'));
  assert.ok(text.includes('Guild War Championship'));
  assert.ok(text.includes('Soleil Upgrade Event'));
});

test('renderEvents filters cards according to search query', () => {
  const cache = {
    clanVersusStatus: {
      data: {
        battle: { clan: { name: '4-LEAF CLOVER' }, enemyClan: { name: 'Black' } },
        score: 1000
      }
    },
    clanWarChampStatus: {
      data: { seasonId: 58 }
    }
  };

  view.replaceChildren();
  search.value = 'War';
  context.renderEvents(cache);

  const container = view.children[0];
  assert.equal(container.children.length, 1);
  assert.ok(container.textContent.includes('Guild War Championship'));
  assert.equal(container.textContent.includes('Guild Versus'), false);
});

test('openGuildVersusModal populates all 6 sections and displays modal', () => {
  modal.hidden = true;
  modalBody.replaceChildren();

  const vsData = {
    battle: {
      league: 'bronze',
      clan: { id: 305081, name: '4-LEAF CLOVER', server: '1431' },
      enemyClan: { id: 100752873, name: 'Black', server: '1410' },
      clanBattleScore: 0,
      enemyClanBattleScore: 0,
      clanRoundPoints: 10145150,
      enemyClanRoundPoints: 657950,
      rounds: [
        { index: 1, theme: 'Radar Training', score: 1, points: 10145150, enemyPoints: 657950, status: 'inProgress' },
        { index: 2, theme: 'Radar Training', score: 2, points: 0, enemyPoints: 0, status: 'soon' }
      ]
    },
    info: {
      battleNumber: 4,
      roundNumber: 1,
      currentNumActiveUsers: 28,
      numActiveUsers: 5,
      weeklyUserActivity: 2450,
      personalRequirementsIsSatisfied: true,
      guildRequirementsIsSatisfied: true,
      challenges: [
        { id: 27, progress: 7 }, // step: 3, pts: 100 -> Math.floor(7/3)*100 = 200 pts
        { id: 31, progress: 11 },
        { id: 32, progress: 24 }
      ]
    },
    rewards: {
      userRoundPoints: 123700,
      userBattlePoints: 123700,
      userSeasonPoints: 15345899,
      userClanRank: 14,
      seasonClanRank: 1
    },
    score: 123700,
    chestNumbers: [1, 2]
  };

  context.openGuildVersusModal(vsData);

  assert.equal(modal.hidden, false);
  assert.equal(leagueBadge.textContent, 'Bronze League');

  // Verify sections populated inside modal body
  assert.ok(modalBody.children.length >= 5);
  const bodyText = modalBody.textContent;

  // Matchup
  assert.ok(bodyText.includes('4-LEAF CLOVER'));
  assert.ok(bodyText.includes('Black'));
  assert.ok(bodyText.includes('10,145,150'));

  // Personal Points & Ranks
  assert.ok(bodyText.includes('123,700'));
  assert.ok(bodyText.includes('15.3M'));
  assert.ok(bodyText.includes('#14'));

  // Milestone Chests (1 - 9)
  assert.ok(bodyText.includes('Milestone Chests'));
  assert.ok(bodyText.includes('2 / 9 Claimed'));
  assert.ok(bodyText.includes('Target: Chest 3'));
  assert.ok(bodyText.includes('Stacked Deck'));
  assert.ok(bodyText.includes('Grid View'));
  assert.ok(bodyText.includes('Chest 1'));
  assert.ok(bodyText.includes('Chest 3'));
  assert.ok(bodyText.includes('Chest 6'));
  assert.ok(bodyText.includes('Energy'));
  assert.ok(bodyText.includes('Titan Potion'));

  // Schedule
  assert.ok(bodyText.includes('6-Round Battle Schedule'));
  assert.ok(bodyText.includes('Radar Training'));

  // Requirements
  assert.ok(bodyText.includes('28 / 5 req'));
  assert.ok(bodyText.includes('2,450'));

  // Challenges (with converted points and denominator steps)
  assert.ok(bodyText.includes('Daily Challenges'));
  assert.ok(bodyText.includes('Total: 92,200 pts'));
  assert.ok(bodyText.includes('200 pts'));
  assert.ok(bodyText.includes('44,000 pts'));
  assert.ok(bodyText.includes('48,000 pts'));
  assert.ok(bodyText.includes('Titan Power'));
  assert.ok(bodyText.includes('Tower Chest'));
  assert.ok(bodyText.includes('Quests to Earn Points'));
});

test('header resource capped styling toggles classes when cap reached or exceeded', () => {
  energyBadge.className = 'inline-flex rounded-full';
  worldEnergyBadge.className = 'inline-flex rounded-full';

  // Under cap
  context.currentCache = {
    'resource:energy': { data: { amount: 80, cap: 140 } },
    'resource:world-energy': { data: { amount: 150, cap: 200 } }
  };
  context.refreshTimed();
  assert.equal(energyBadge.classList.contains('resource-capped-amber'), false);
  assert.equal(worldEnergyBadge.classList.contains('resource-capped-sky'), false);

  // Exactly at cap
  context.currentCache = {
    'resource:energy': { data: { amount: 140, cap: 140 } },
    'resource:world-energy': { data: { amount: 200, cap: 200 } }
  };
  context.refreshTimed();
  assert.equal(energyBadge.classList.contains('resource-capped-amber'), true);
  assert.equal(worldEnergyBadge.classList.contains('resource-capped-sky'), true);

  // Exceeding soft cap
  context.currentCache = {
    'resource:energy': { data: { amount: 250, cap: 140 } },
    'resource:world-energy': { data: { amount: 225, cap: 200 } }
  };
  context.refreshTimed();
  assert.equal(energyBadge.classList.contains('resource-capped-amber'), true);
  assert.equal(worldEnergyBadge.classList.contains('resource-capped-sky'), true);

  // CSS provides vibrant glow and pulse keyframe animations
  assert.ok(popupCss.includes('@keyframes resource-pulse-amber'));
  assert.ok(popupCss.includes('@keyframes resource-pulse-sky'));
  assert.ok(popupCss.includes('@keyframes resource-icon-bounce'));
  assert.ok(popupCss.includes('animation: resource-pulse-amber'));
  assert.ok(popupCss.includes('animation: resource-pulse-sky'));
  assert.ok(popupCss.includes('@media (prefers-reduced-motion: reduce)'));
});

test('renderEvents renders Titan Dungeon card and handles search filtering', () => {
  const cache = {
    dungeonStatus: {
      data: {
        floorNumber: 582,
        maxFloorPassed: 581,
        respawnFloor: 581,
        dungeonActivity: 750,
        elements: { prime: 'earth', nonprime: ['water', 'fire'] }
      }
    }
  };

  view.replaceChildren();
  search.value = '';
  context.renderEvents(cache);

  const container = view.children[0];
  assert.equal(container.children.length, 1);
  const cardText = container.textContent;
  assert.ok(cardText.includes('Titan Dungeon'));
  assert.ok(cardText.includes('Floor 582'));
  assert.ok(cardText.includes('Cleared 581 Floors'));
  assert.ok(cardText.includes('750 pts'));
  assert.ok(cardText.includes('Prime Element: Earth'));

  // Search filter matches dungeon
  view.replaceChildren();
  search.value = 'dungeon';
  context.renderEvents(cache);
  assert.equal(view.children[0].children.length, 1);

  // Search filter misses
  view.replaceChildren();
  search.value = 'nonexistent';
  context.renderEvents(cache);
  assert.equal(view.children.length, 1);
  assert.ok(view.children[0].textContent.includes('No events match'));
});

test('openDungeonModal populates overview, elements, doors, and titan states', () => {
  dungeonModal.hidden = true;
  dungeonModalBody.replaceChildren();

  const dungeonData = {
    floorNumber: 581,
    maxFloorPassed: 580,
    respawnFloor: 576,
    dungeonActivity: 738,
    elements: { prime: 'earth', nonprime: ['water', 'fire'] },
    currentFloorDoors: [
      {
        attackerType: 'fire',
        defenderType: 'earth',
        power: 10861,
        team: [
          { id: 4024, level: 58, star: 2 },
          { id: 4020, level: 49, star: 2 }
        ]
      },
      {
        attackerType: 'neutral',
        defenderType: 'neutral',
        power: 47586,
        team: [
          { id: 4000, level: 49, star: 4 }
        ]
      }
    ],
    states: {
      titans: {
        '4000': { isDead: false, hp: 856926, maxHp: 856926, energy: 600 },
        '4050': { isDead: true, hp: 0, maxHp: 795326, energy: 1000 }
      }
    }
  };

  context.openDungeonModal(dungeonData);

  assert.equal(dungeonModal.hidden, false);
  assert.equal(dungeonFloorBadge.textContent, 'Floor 581');

  // Verify sections populated inside modal body
  assert.ok(dungeonModalBody.children.length >= 4);
  const text = dungeonModalBody.textContent;

  // Overview stats
  assert.ok(text.includes('Floor 581'));
  assert.ok(text.includes('580'));
  assert.ok(text.includes('Floor 576'));
  assert.ok(text.includes('738 pts'));

  // Element affinities
  assert.ok(text.includes('Prime Element:'));
  assert.ok(text.includes('Earth'));
  assert.ok(text.includes('Water, Fire'));

  // Doors
  assert.ok(text.includes('Door 1'));
  assert.ok(text.includes('Door 2'));
  assert.ok(text.includes('10,861'));
  assert.ok(text.includes('Fire Titans'));
  assert.ok(text.includes('Earth'));
  assert.ok(text.includes('Verdoc (Lv.58 ★★)'));
  assert.ok(text.includes('Angus (Lv.49 ★★)'));
  assert.ok(text.includes('Sigurd (Lv.49 ★★★★)'));

  // Titan HP & Energy status
  assert.ok(text.includes('Titan Health & Energy'));
  assert.ok(text.includes('Sigurd'));
  assert.ok(text.includes('856,926 / 856,926 (100%)'));
  assert.ok(text.includes('600 / 1,000 (60%)'));
  assert.ok(text.includes('Alive'));

  assert.ok(text.includes('Pallant'));
  assert.ok(text.includes('0 / 795,326 (0%)'));
  assert.ok(text.includes('1,000 / 1,000 (100%)'));
  assert.ok(text.includes('Fallen'));
});

test('tableExportBtn is visible for snapshot tables with rows and hidden otherwise', () => {
  tableExportBtn.hidden = true;
  const snapshotData = {
    updatedAt: '2026-11-02T06:00:00.000Z',
    data: {
      '1': { name: 'Aurora', star: 3 },
      '2': { name: 'Galahad', star: 4 }
    }
  };
  context.showSnapshot(snapshotData, ['ID', 'Name'], (data) =>
    Object.entries(data).map(([id, h]) => [id, h.name]));
  assert.equal(tableExportBtn.hidden, false, 'tableExportBtn should be visible when rows exist');

  // Empty data hides button
  context.showSnapshot(null, ['ID', 'Name'], () => []);
  assert.equal(tableExportBtn.hidden, true, 'tableExportBtn should be hidden when no data');
});

test('openGuildVersusModal appends (num) in-stock inventory balance next to resource targets', () => {
  modal.hidden = true;
  modalBody.replaceChildren();

  const vsData = {
    battle: {
      league: 'bronze',
      rounds: [
        { index: 1, theme: 'Radar Training & Titan Power', status: 'inProgress' }
      ]
    },
    info: {
      roundNumber: 1,
      challenges: [
        { id: 54, progress: 30 }, // Spend 15 Titan Skin Stones (resource)
        { id: 29, progress: 2 },  // Open 1 Elemental Sphere (resource)
        { id: 40, progress: 200 },// Spend 100 Titan Potions (resource)
        { id: 27, progress: 6 }   // Increase Titan Power by 3 (activity - not resource)
      ]
    },
    rewards: {},
    chestNumbers: []
  };

  const cacheWithStock = {
    clanVersusStatus: { data: vsData },
    inventoryGet: {
      data: {
        coin: { '20': 2410 },
        consumable: { '46': 23, '20': 11650 }
      }
    }
  };

  context.openGuildVersusModal(vsData, cacheWithStock);
  const text = modalBody.textContent;

  // Daily challenges with stock balance
  assert.ok(text.includes('Spend 15 Titan Skin Stones (2,410)'));
  assert.ok(text.includes('Open 1 Elemental Sphere (23)'));
  assert.ok(text.includes('Spend 100 Titan Potions (11,650)'));

  // Activity challenge should not have stock suffix
  assert.ok(text.includes('Increase Titan Power by 3'));
  assert.equal(text.includes('Increase Titan Power by 3 ('), false);

  // Round 1 quests with stock balance
  assert.ok(text.includes('Spend 15 Titan Skin Stones (2,410)'));
  assert.ok(text.includes('Open 1 Elemental Sphere (23)'));
  assert.ok(text.includes('Spend 100 Titan Potions (11,650)'));
});

test('renderGoals renders Activities and Resources with KPI bar, synergy badges, and event pills', () => {
  search.value = '';
  view.replaceChildren();

  const testCache = {
    clanVersusStatus: {
      data: {
        battle: {
          rounds: [
            { index: 1, theme: 'Radar Training & Titan Power', status: 'inProgress' }
          ]
        },
        info: {
          roundNumber: 1,
          challenges: [
            { id: 54, progress: 30 }, // Titan Skin Stones (overlap)
            { id: 29, progress: 2 },  // Elemental Spheres (overlap)
            { id: 31, progress: 15 }, // Tower Chest (overlap)
            { id: 27, progress: 9 }   // Titan Power (overlap)
          ]
        }
      }
    },
    dungeonStatus: {
      data: {
        floorNumber: 581,
        maxFloorPassed: 580,
        elements: { prime: 'earth' }
      }
    },
    clanWarChampStatus: {
      data: {
        seasonId: 58,
        tries: 2
      }
    },
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 100347,
            groups: [
              {
                id: 101,
                localeKey: 'QUEST_TAB_NAME_TOWER_CHESTS',
                repeatType: 'chain',
                quests: [{ id: 1, state: 'inProgress', progress: 5 }]
              },
              {
                id: 102,
                localeKey: 'QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND',
                repeatType: 'chain',
                quests: [{ id: 2, state: 'inProgress', progress: 15 }]
              }
            ]
          }
        ]
      }
    },
    inventoryGet: {
      data: {
        coin: { '20': 2410 },
        consumable: { '46': 23, '20': 11650 }
      }
    }
  };

  context.renderGoals(testCache);
  const text = view.textContent;

  // View container should have padding class to prevent visual border overlap
  assert.equal(view.children[0].className.includes('p-4'), true);

  // Status & KPI Cards
  assert.ok(status.textContent.includes('active goals'));
  assert.ok(text.includes('Active Goals'));
  assert.ok(text.includes('Synergies'));
  assert.ok(text.includes('Ready / Stocked'));

  // Groups
  assert.ok(text.includes('Activities & Quests'));
  assert.ok(text.includes('Resources to Spend'));

  // Activities synergy badges and limited badges
  assert.ok(text.includes('Open 1 Tower Chest'));
  assert.ok(text.includes('Synergy'));
  assert.ok(text.includes('Daily Limited'));
  assert.ok(text.includes('Titan Dungeon Exploration'));
  assert.ok(text.includes('Guild War Championship Attacks'));

  // Resources cards with stock info
  assert.ok(text.includes('Spend 15 Titan Skin Stones'));
  assert.ok(text.includes('Open 1 Elemental Sphere'));
  assert.ok(text.includes('2,410 owned'));
  assert.ok(text.includes('23 owned'));
  assert.ok(text.includes('In Stock'));

  // Filter testing
  search.value = 'Tower';
  context.renderGoals(testCache);
  assert.ok(view.textContent.includes('Open 1 Tower Chest'));
  assert.equal(view.textContent.includes('Elemental Sphere'), false);
  search.value = '';
});

test('renderGoals displays Cleared Today badge on Tower Chest card when tower is cleared', () => {
  search.value = '';
  view.replaceChildren();

  const testCache = {
    clanVersusStatus: {
      data: {
        info: {
          challenges: [
            { id: 31, progress: 15 } // Tower Chest
          ]
        }
      }
    },
    towerStatus: {
      data: { isCleared: true, state: 'win' }
    }
  };

  context.renderGoals(testCache);
  const text = view.textContent;
  assert.ok(text.includes('Open 1 Tower Chest'));
  assert.ok(text.includes('Cleared Today'));
  assert.ok(!text.includes('Daily Limited'));
});

test('renderResources splits items into renewable and other groups and filters inactive items by default', () => {
  view.replaceChildren();
  context.showAllResources = false;
  context.search.value = '';

  const sampleEntries = [
    { key: 'resource:material:5', data: { label: 'Food', amount: 5000, renewable: true } },
    { key: 'resource:refillable:2', data: { label: 'Skill Points', amount: 10, renewable: true } },
    { key: 'resource:gold', data: { label: 'Gold', amount: 1000000 } },
    { key: 'resource:starMoney', data: { label: 'Emeralds', amount: 500 } },
    { key: 'resource:coin:1', data: { label: 'Arena coin', amount: 200 } },
    { key: 'resource:coin:1101', data: { label: 'Test Coin', amount: 5 } },
    { key: 'resource:refillable:10', data: { label: 'Refillable #10', amount: 0 } }
  ];

  context.renderResources(sampleEntries, ['resource:gold']);

  const text = view.textContent;
  assert.ok(text.includes('Renewable Resources'));
  assert.ok(text.includes('Other Resources'));
  assert.ok(text.includes('Food'));
  assert.ok(text.includes('Skill Points'));
  assert.ok(text.includes('Gold'));
  assert.ok(text.includes('Emeralds'));
  assert.ok(text.includes('Arena coin'));

  // Inactive/test items hidden by default
  assert.equal(text.includes('Test Coin'), false);
  assert.equal(text.includes('Refillable #10'), false);
  assert.ok(status.textContent.includes('5 resources (2 inactive hidden)'));
  assert.ok(resourceFilterToggleText.textContent.includes('Show All (2)'));

  // When toggle is active (showAllResources = true)
  view.replaceChildren();
  context.showAllResources = true;
  context.renderResources(sampleEntries, ['resource:gold']);

  const allText = view.textContent;
  assert.ok(allText.includes('Test Coin'));
  assert.ok(allText.includes('Refillable #10'));
  assert.ok(status.textContent.includes('7 resources'));
  assert.ok(resourceFilterToggleText.textContent.includes('Hide Inactive (2)'));
});

test("header march icon renders gathering and return badges and hides upon returnAt", () => {
  const marchesWrap = context.document.querySelector("#marches");
  const now = 1000000;

  const marchStyles = {
    wood: { icon: "🌲", classes: "bg-green-100 text-green-800" },
    return: { icon: "↩", classes: "bg-slate-100 text-slate-600" }
  };

  context.currentCache = {
    accountStatus: { data: { name: "Player1" } },
    marchStatus: {
      data: {
        marches: [
          {
            squadId: "squad-gather",
            kind: "wood",
            stage: "moveToTargetInSolo",
            targetArrivalAt: now + 30000,
            endsAt: now + 30000
          },
          {
            squadId: "squad-return",
            kind: "return",
            stage: "returnToOutpost",
            previousKind: "stone",
            returnAt: now + 45000,
            endsAt: now + 45000
          }
        ]
      }
    }
  };

  marchesWrap.replaceChildren();
  for (const [index, march] of context.currentCache.marchStatus.data.marches.entries()) {
    const style = marchStyles[march.kind] || { icon: "⚔", classes: "" };
    const badge = context.document.createElement("span");
    badge.className = `inline-flex size-6 shrink-0 items-center justify-center rounded-full ${style.classes}`;
    badge.dataset.marchIndex = String(index);
    badge.dataset.resourceTooltip = "";
    badge.tabIndex = 0;
    badge.textContent = style.icon;
    marchesWrap.append(badge);
  }

  assert.equal(marchesWrap.children.length, 2);
  const gatherBadge = marchesWrap.children[0];
  const returnBadge = marchesWrap.children[1];

  assert.equal(gatherBadge.textContent, "🌲");
  assert.equal(returnBadge.textContent, "↩");

  // Verify expiration evaluation via isMarchExpired
  assert.equal(context.isMarchExpired(context.currentCache.marchStatus.data.marches[0], now), false);
  assert.equal(context.isMarchExpired(context.currentCache.marchStatus.data.marches[0], now + 35000), false);
  assert.equal(context.isMarchExpired(context.currentCache.marchStatus.data.marches[1], now), false);
  assert.equal(context.isMarchExpired(context.currentCache.marchStatus.data.marches[1], now + 45000), true);

  // At now: both badges visible
  const origNow = Date.now;
  try {
    Date.now = () => now;
    context.refreshTimed();
    assert.equal(gatherBadge.hidden, false);
    assert.equal(returnBadge.hidden, false);
    assert.equal(marchesWrap.hidden, false);

    // At now + 50000: return march expired (returnAt 45000 reached)
    Date.now = () => now + 50000;
    context.refreshTimed();
    assert.equal(gatherBadge.hidden, false); // gathering march does not expire
    assert.equal(returnBadge.hidden, true);  // return march hidden immediately!
  } finally {
    Date.now = origNow;
  }
});

test('header mail badge, heroes/titans soul evolve badges, and config refresh buttons', async () => {
  // 1. Mail badge test
  assert.equal(mailBadge.hidden, true);
  context.currentCache.mailStatus = {
    key: 'mailStatus',
    data: { hasUnclaimed: true, unclaimedReportsCount: 2, totalUnclaimed: 2 }
  };
  context.refreshTimed();
  assert.equal(mailBadge.hidden, false);
  assert.equal(mailBadge.dataset.resourceTooltip, 'New mail / battle report with rewards (2)');

  context.currentCache.mailStatus.data = { hasUnclaimed: false, unclaimedReportsCount: 0, totalUnclaimed: 0 };
  context.refreshTimed();
  assert.equal(mailBadge.hidden, true);

  // 2. Tab badges test
  context.currentCache.heroGetAll = {
    data: {
      '1': { star: 3 } // needs 100
    }
  };
  context.currentCache.titanGetAll = {
    data: {
      '4000': { star: 2 } // needs 150
    }
  };
  context.currentCache.inventoryGet = {
    data: {
      fragmentHero: { 1: 120 }, // 120 >= 100 -> 1 hero
      fragmentTitan: { 4000: 164 } // 164 >= 150 -> 1 titan
    }
  };
  context.refreshTimed();
  assert.equal(heroesBadge.hidden, false);
  assert.equal(heroesBadge.textContent, '1');
  assert.equal(titansBadge.hidden, false);
  assert.equal(titansBadge.textContent, '1');

  // When no fragments, badges hide
  context.currentCache.inventoryGet.data = { fragmentHero: {}, fragmentTitan: {} };
  context.refreshTimed();
  assert.equal(heroesBadge.hidden, true);
  assert.equal(titansBadge.hidden, true);

  // 3. Refresh button trigger test
  let sentMessage = null;
  context.chrome.runtime = { sendMessage: (msg, cb) => {
    sentMessage = msg;
    if (cb) cb({ ok: true });
  } };
  const dummy = (msg, cb) => {
    sentMessage = msg;
    if (cb) cb({ ok: true });
  };
  btnRefreshAll.dispatch('click');
  assert.ok(sentMessage);
  assert.equal(sentMessage.kind, 'refresh-rpc');
  assert.ok(Array.isArray(sentMessage.calls));
  assert.ok(sentMessage.calls.some((c) => c.name === 'heroGetAll'));
  assert.ok(sentMessage.calls.some((c) => c.name === 'getPage' && c.feature === 'report'));
  assert.ok(configRefreshStatus.textContent.includes('Refreshed at'));
});
