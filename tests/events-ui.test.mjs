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
          if (node.getAttribute(k) === v || node.dataset?.[k.replace('data-', '')] === v) match = true;
        } else {
          const k = attr.replace('data-', '');
          if (node.attributes[attr] !== undefined || node.dataset?.[k] !== undefined) match = true;
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

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag),
  elementsById: new Map([
    ['table-export-btn', tableExportBtn],
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
    ['header-resources', headerResources]
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
  setResourceTooltip: () => {},
  resourceTooltip: () => '',
  marchTooltip: () => ''
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(clanVersusRulesJs, context);
vm.runInContext(resourceDataJs, context);
vm.runInContext(titanMetadataJs, context);
vm.runInContext(popupDataJs, context);
context.resourceData = context.globalThis.hwaHelperResourceData;
context.globalThis.hwaHelperNameMap = { building: () => '', research: () => '' };

// Extract renderEvents, openGuildVersusModal, setupGuildVersusModal from popupJs
const eventsStart = popupJs.indexOf('function openGuildVersusModal(');
const eventsEnd = popupJs.indexOf('function renderGuildChat(');
vm.runInContext(popupJs.slice(eventsStart, eventsEnd), context);

// Extract refreshTimed
const refreshStart = popupJs.indexOf('function refreshTimed(');
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
        { id: 27, progress: 0 },
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

  // Challenges (with converted points)
  assert.ok(bodyText.includes('Daily Challenges'));
  assert.ok(bodyText.includes('Total: 92,000 pts'));
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
