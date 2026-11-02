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
    this._textContent = '';
    this._innerHTML = '';
    this.eventListeners = {};
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]+>/g, '');
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => c.textContent).join('');
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
  appendChild(node) {
    this.append(node);
    return node;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  dispatchEvent(event) {
    const list = this.eventListeners[event] || [];
    for (const h of list) h({ stopPropagation: () => {} });
  }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const results = [];
    const check = (node) => {
      if (sel.startsWith('.') && node.className?.includes(sel.slice(1))) results.push(node);
      else if (sel.startsWith('#') && node.attributes?.id === sel.slice(1)) results.push(node);
      else if (node.tagName?.toLowerCase() === sel.toLowerCase()) results.push(node);
      for (const c of node.children) check(c);
    };
    check(this);
    return results;
  }
}

async function createDraftContext(viewEl, statusEl, searchEl) {
  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (_, tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === '#view') return viewEl;
      if (sel === '#status') return statusEl;
      if (sel === '#search') return searchEl;
      return new MockElement('div');
    },
    querySelectorAll: () => []
  };

  const context = vm.createContext({
    document: mockDoc,
    window: { location: { search: '' }, addEventListener: () => {} },
    location: { search: '' },
    URLSearchParams,
    setInterval: () => {},
    clearInterval: () => {},
    setTimeout: () => {},
    clearTimeout: () => {},
    formatNumber: (n) => String(n),
    hwaHelperProductionData: { ratePerMinute: () => 0 },
    hwaHelperResourceData: { formatAmount: (n) => String(n) },
    chrome: {
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        getManifest: () => ({ version: '0.9.0' }),
        sendMessage: async () => ({})
      }
    },
    console
  });

  const resourceDataSrc = await readFile('extension/resource-data.js', 'utf8');
  const heroMetaSrc = await readFile('extension/hero-metadata.js', 'utf8');
  const popupDataSrc = await readFile('extension/popup-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');

  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(heroMetaSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(popupSrc, context);

  context.hwaHelperNameMap = {
    hero: (id) => context.hwaHelperHeroMetadata?.[id]?.name || `Hero #${id}`
  };

  return context;
}

test('Legend Draft UI renders 5 steps, 3 candidate cards per step, and lock button validation', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const sampleCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2, // Defense draft
        matchId: 358200026,
        stageFinishTs: Math.floor(Date.now() / 1000) + 90,
        enemyUser: {
          id: '1216843033',
          name: 'Ieon1973',
          level: 72,
          clanTitle: 'Champions'
        },
        defenceHeroes: []
      }
    },
    heroGetAll: {
      data: {
        4: { star: 3, power: 174445 },
        24: { star: 6, power: 188853 },
        38: { star: 4, power: 165000 }
      }
    }
  };

  // Run renderDraft in context
  context.renderDraft(sampleCache);

  assert.ok(viewEl.children.length > 0, 'Should render content into #view');
  const mainContainer = viewEl.children[0];
  assert.ok(mainContainer, 'Main container should exist');

  // Verify status contains step count during active defense drafting
  assert.match(statusEl.textContent, /Selected 0\/5 steps/);

  // Check that all 15 heroes across 5 columns x 3 rows are rendered at once
  assert.match(viewEl.textContent, /15 Candidate Heroes Matrix/);
  assert.match(viewEl.textContent, /Step 1/);
  assert.match(viewEl.textContent, /Step 5/);
  assert.match(viewEl.textContent, /Wodryn/);  // Step 1 choice
  assert.match(viewEl.textContent, /Crow/);    // Step 2 choice
  assert.match(viewEl.textContent, /Ishmael/); // Step 3 choice
  assert.match(viewEl.textContent, /Jhu/);     // Step 4 choice
  assert.match(viewEl.textContent, /Guus/);    // Step 5 choice

  // Check candidates helper returns 5 steps of 3 choices
  const defaultCandidates = context.hwaHelperPopupData.defaultDraftCandidates('defense');
  assert.equal(defaultCandidates.length, 5);
  assert.equal(defaultCandidates[0].length, 3);

  // Test in-game pick sync: when defenceHeroes has 5 heroes, it renders locked UI and hides candidate matrix
  sampleCache.legendDraftStatus.data.defenceHeroes = [78, 76, 25, 37, 69];
  context.renderDraft(sampleCache);
  assert.match(statusEl.textContent, /Defense lineup locked/);
  assert.match(viewEl.textContent, /Lineup successfully locked/);
  assert.doesNotMatch(viewEl.textContent, /15 Candidate Heroes Matrix/);
});

test('Legend Draft UI renders enemy lineup when in Attack Stage 4', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const attackCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 4, // Attack draft
        matchId: 358200026,
        stageFinishTs: Math.floor(Date.now() / 1000) + 85,
        enemyUser: {
          id: '1216843033',
          name: 'Ieon1973',
          level: 72,
          clanTitle: 'Champions'
        },
        enemyDefenceHeroes: [24, 44, 35, 4, 56],
        defenceHeroes: [78, 76, 25, 37, 69],
        attackHeroes: []
      }
    },
    heroGetAll: { data: {} }
  };

  context.renderDraft(attackCache);

  assert.match(viewEl.textContent, /Opponent Defense Lineup/);
  assert.match(viewEl.textContent, /Cleaver/);
  assert.match(viewEl.textContent, /Attack Draft/);
  // While actively drafting attack, candidate matrix is shown
  assert.match(viewEl.textContent, /15 Candidate Heroes Matrix/);
});

test('Legend Draft UI supports defense/attack review and hides pick slots after match completion', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const completedCache = {
    legendDraftStatus: {
      data: {
        active: false,
        stageId: 7, // Match Completed
        matchId: 358350840,
        enemyUser: {
          id: '1216843033',
          name: 'Ieon1973',
          level: 72,
          clanTitle: 'Champions'
        },
        defenceHeroes: [78, 76, 25, 37, 69],
        enemyDefenceHeroes: [27, 32, 40, 53, 502],
        attackHeroes: [28, 73, 17, 4, 78],
        enemyAttackHeroes: [11, 36, 46, 70, 74],
        lastResult: {
          result: 1, // Defeat
          resultDetails: 5,
          rating: {
            userRating: 1105,
            userDifRating: -10,
            enemyRating: 1125
          },
          reward: {
            draftBpExp: 50
          },
          defenceHeroes: [78, 76, 25, 37, 69],
          attackHeroes: [28, 73, 17, 4, 78]
        }
      }
    },
    heroGetAll: { data: {} }
  };

  context.renderDraft(completedCache);

  // Status must reflect Match Completed
  assert.match(statusEl.textContent, /Match Completed/);

  // 15 candidate matrix must NOT be rendered when draft is not active
  assert.doesNotMatch(viewEl.textContent, /15 Candidate Heroes Matrix/);

  // Match result banner must be visible
  assert.match(viewEl.textContent, /Defeat/);
  assert.match(viewEl.textContent, /1105/);
  assert.match(viewEl.textContent, /-10/);
  assert.match(viewEl.textContent, /50 BP EXP/);

  // Switcher buttons must be present
  assert.match(viewEl.textContent, /Defense Draft/);
  assert.match(viewEl.textContent, /Attack Draft/);

  // Defense heroes should be visible
  assert.match(viewEl.textContent, /Wodryn/);
  assert.match(viewEl.textContent, /Crow/);
  assert.match(viewEl.textContent, /Guus/);

  // Find the Attack Draft button and click it to switch view
  const buttons = viewEl.querySelectorAll('button');
  const attackBtn = buttons.find(b => b.textContent.includes('Attack Draft'));
  assert.ok(attackBtn, 'Attack Draft switcher button should exist');
  attackBtn.dispatchEvent('click');
  context.renderDraft(completedCache);

  // Verify view switched to attack lineup
  assert.match(viewEl.textContent, /Your Attack Lineup/);
  assert.match(viewEl.textContent, /Qing Mao/);
  assert.match(viewEl.textContent, /Drayne/);
  assert.match(viewEl.textContent, /Opponent Defense Lineup/);
  // Pick slots matrix must still be omitted
  assert.doesNotMatch(viewEl.textContent, /15 Candidate Heroes Matrix/);
});
