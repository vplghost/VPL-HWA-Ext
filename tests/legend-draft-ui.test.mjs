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
    return this.children.map(c => (c ? c.textContent : '')).join('');
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
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean); }
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
  const elements = {};
  function getEl(sel) {
    if (!elements[sel]) {
      const tag = sel.startsWith('input') ? 'input' : (sel.startsWith('button') ? 'button' : 'div');
      const el = new MockElement(tag);
      if (sel.startsWith('#')) el.attributes.id = sel.slice(1);
      elements[sel] = el;
    }
    return elements[sel];
  }

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (_, tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === '#view') return viewEl;
      if (sel === '#status') return statusEl;
      if (sel === '#search') return searchEl;
      return getEl(sel);
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
  const dashboardDataSrc = await readFile('extension/dashboard-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');

  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(heroMetaSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(dashboardDataSrc, context);
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

  // When draft candidates cannot be auto-probed, 15-hero planner matrix is NOT rendered
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);
  // Instead, error notification and step-by-step picker are shown
  assert.match(viewEl.textContent, /Offered heroes not found in game payload/);
  assert.match(viewEl.textContent, /Step 1/);
  assert.match(viewEl.textContent, /Step 5/);

  // Check candidates helper returns 5 steps of 3 choices
  const defaultCandidates = context.hwaHelperPopupData.defaultDraftCandidates('defense');
  assert.equal(defaultCandidates.length, 5);
  assert.equal(defaultCandidates[0].length, 3);

  // Test in-game pick sync: when defenceHeroes has 5 heroes and saveDefence was performed, it renders locked status
  sampleCache.legendDraftStatus.data.defenceHeroes = [78, 76, 25, 37, 69];
  sampleCache.legendDraftStatus.data.lastPickAction = 'saveDefence';
  context.renderDraft(sampleCache);
  assert.match(statusEl.textContent, /Defense lineup locked/);
  assert.match(viewEl.textContent, /Lineup successfully locked/);
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);
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
  // When candidates cannot be auto-probed, 15-hero planner is replaced by error notice
  assert.match(viewEl.textContent, /Offered heroes not found in game payload/);
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);
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
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);

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
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);
});

test('Legend Draft UI shows confirmed stars without account hero power', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const activeCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2,
        matchId: 358789279,
        defenceHeroes: [],
        defenceStars: { 4: 5 }
      }
    },
    heroGetAll: {
      data: {
        4: { star: 2, power: 120500 },
        78: { star: 5, power: 120500 },
        49: { star: 4, power: 95000 },
        44: { star: 3, power: 80000 }
      }
    }
  };

  context.renderDraft(activeCache);

  assert.match(viewEl.textContent, /Recorded Draft Choices/);
  assert.match(viewEl.textContent, /★5/);
  assert.doesNotMatch(viewEl.textContent, /120,500 pwr|Team Power/);

  const buttons = viewEl.querySelectorAll('button');
  const pickBtn = buttons.find(b => b.textContent === 'Pick');
  assert.ok(pickBtn, 'Pick button should exist on candidate card');
  pickBtn.dispatchEvent('click');

  context.renderDraft(activeCache);
  assert.doesNotMatch(viewEl.textContent, /120,500 pwr|Team Power/);
});

test('Legend Draft UI does NOT lock defense at match start and shows step picker when candidates cannot be auto-probed', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  // Cache state at start of stage 2 (defense draft)
  const freshDraftCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2, // Defense draft start
        matchId: 44556677,
        defenceHeroes: [],
        attackHeroes: [],
        enemyDefenceHeroes: [],
        enemyAttackHeroes: [],
        lastResult: null,
        lastPickAction: null,
        stageFinishTs: Math.floor(Date.now() / 1000) + 90
      }
    },
    heroGetAll: { data: {} }
  };

  context.renderDraft(freshDraftCache);

  // Defense MUST NOT be locked at the start of stage 2
  assert.doesNotMatch(viewEl.textContent, /Defense Lineup locked!/);
  assert.doesNotMatch(statusEl.textContent, /Defense lineup locked/);

  // 15 Candidate Heroes Matrix MUST NOT be rendered; warning and step picker are shown
  assert.doesNotMatch(viewEl.textContent, /Manual Candidate Planner/);
  assert.match(viewEl.textContent, /Offered heroes not found in game payload/);
  assert.match(viewEl.textContent, /Step 1/);
  assert.match(viewEl.textContent, /Step 5/);
});

test('Legend Draft dialog preserves tab content and status on open and refresh', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const activeCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2,
        matchId: 44556677,
        stageFinishTs: Math.floor(Date.now() / 1000) + 90,
        defenceHeroes: []
      }
    },
    heroGetAll: { data: {} }
  };

  const sentinel = new MockElement('p'); sentinel.textContent = 'Active tab content';
  viewEl.replaceChildren(sentinel);
  statusEl.textContent = 'Active tab status';
  context.openDraftModal(activeCache);
  assert.equal(viewEl.children[0], sentinel);
  assert.equal(statusEl.textContent, 'Active tab status');

  const draftModal = context.document.querySelector('#draft-modal');
  assert.equal(draftModal.hidden, false, 'Modal should be visible after openDraftModal');

  const draftModalBody = context.document.querySelector('#draft-modal-body');
  assert.ok(draftModalBody.children.length > 0, 'Modal body should contain rendered draft');
  assert.match(draftModalBody.textContent, /Offered heroes not found in game payload/);
  assert.doesNotMatch(draftModalBody.textContent, /Manual Candidate Planner/);
  context.renderDraft(activeCache, draftModalBody);
  assert.equal(viewEl.children[0], sentinel);
  assert.equal(statusEl.textContent, 'Active tab status');
  for (const stageId of [0, 1, 2, 3, 4, 5, 6, 7]) {
    context.renderDraftAlert({ legendDraftStatus: { data: { stageId } } });
    assert.equal(context.document.querySelector('#draft-alert').hidden, stageId === 0 || stageId === 7);
  }

  // Close button click hides modal
  const closeBtn = context.document.querySelector('#draft-modal-close');
  assert.ok(closeBtn, 'Close button should exist');
  closeBtn.dispatchEvent('click');
  assert.equal(draftModal.hidden, true, 'Modal should be hidden after clicking close');
});

test('recorded match review shows exact defense, attack, and opponent pick positions', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);
  const cache = { legendDraftStatus: { data: {
    matchId: 358789279, stageId: 0, active: false,
    defenceHeroes: [4, 19, 25, 70, 67],
    attackHeroes: [11, 24, 33, 57, 73],
    enemyDefenceHeroes: [10, 53, 69, 71, 75],
    defenceStars: { 4: 3 },
    lastResult: { result: 0, defenceHeroes: [4, 19, 25, 70, 67],
      attackHeroes: [11, 24, 33, 57, 73] }
  } } };
  context.renderDraft(cache);
  assert.match(viewEl.textContent, /Recorded Draft Choices/);
  assert.match(viewEl.textContent, /Sebastian/);
  assert.match(viewEl.textContent, /Polaris/);
  assert.match(viewEl.textContent, /★3/);
  const choices = context.hwaHelperPopupData.observedDraftChoices(358789279);
  assert.deepEqual(Array.from(choices.defense, (row) => row.length), [3, 3, 3, 3, 3]);
  assert.deepEqual(Array.from(choices.attack, (row) => row.length), [3, 3, 3, 3, 3]);

  const attackBtn = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Attack Draft'));
  assert.ok(attackBtn);
  attackBtn.dispatchEvent('click');
  context.renderDraft(cache);
  assert.match(viewEl.textContent, /Julius/);
  assert.match(viewEl.textContent, /Isaac/);
  assert.match(viewEl.textContent, /Step 1, choice 2: Guus/);
  assert.match(viewEl.textContent, /Step 5, choice 3: Electra von Grave/);
});

test('Legend Draft hero picking retains all 5 picks without wipe-out, auto-switches to attack stage 4, and shows RPC guidance', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const activeDraftCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2, // Defense stage
        matchId: 358999999,
        stageFinishTs: Math.floor(Date.now() / 1000) + 90,
        enemyUser: {
          id: '1216843033',
          name: 'EnemyPlayer',
          level: 80
        },
        defenceHeroes: []
      }
    }
  };

  // Initially render defense stage
  context.renderDraft(activeDraftCache);

  // By default, popupRpcEnabled is false in initial mock, so RPC alert should show
  assert.match(viewEl.textContent, /Popup RPC is currently disabled/);
  const enableRpcBtn = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Enable Popup RPC'));
  assert.ok(enableRpcBtn, 'Enable Popup RPC button should exist');
  enableRpcBtn.dispatchEvent('click');

  // Re-render after enabling RPC
  context.renderDraft(activeDraftCache);
  assert.doesNotMatch(viewEl.textContent, /Popup RPC is currently disabled/);
  // Now Direct RPC advisory shows because default mode is piggyback
  assert.match(viewEl.textContent, /Switch to Direct RPC/);
  const switchDirectBtn = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Switch to Direct RPC'));
  assert.ok(switchDirectBtn, 'Switch to Direct RPC button should exist');
  switchDirectBtn.dispatchEvent('click');

  // Re-render after switching direct mode
  context.renderDraft(activeDraftCache);
  assert.doesNotMatch(viewEl.textContent, /Switch to Direct RPC/);

  // Pick 5 heroes sequentially
  // Pick hero 4 (Astaroth)
  const heroButtons = viewEl.querySelectorAll('button');
  const pickHero4 = heroButtons.find((b) => b.textContent.includes('Astaroth'));
  assert.ok(pickHero4, 'Hero Astaroth button should exist in picker');
  pickHero4.dispatchEvent('click');
  context.renderDraft(activeDraftCache);
  assert.match(statusEl.textContent, /Selected 1\/5 steps/);

  // Pick hero 23 (Kayla)
  const pickHero23 = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Kayla'));
  assert.ok(pickHero23, 'Hero Kayla button should exist in picker');
  pickHero23.dispatchEvent('click');
  context.renderDraft(activeDraftCache);
  assert.match(statusEl.textContent, /Selected 2\/5 steps/);

  // Pick hero 24 (Keira)
  const pickHero24 = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Keira'));
  assert.ok(pickHero24, 'Hero Keira button should exist in picker');
  pickHero24.dispatchEvent('click');
  context.renderDraft(activeDraftCache);
  assert.match(statusEl.textContent, /Selected 3\/5 steps/);

  // Pick hero 33 (Maya)
  const pickHero33 = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Maya'));
  assert.ok(pickHero33, 'Hero Maya button should exist in picker');
  pickHero33.dispatchEvent('click');
  context.renderDraft(activeDraftCache);
  assert.match(statusEl.textContent, /Selected 4\/5 steps/);

  // Pick hero 57 (Tristan) - 5th hero!
  const pickHero57 = viewEl.querySelectorAll('button').find((b) => b.textContent.includes('Tristan'));
  assert.ok(pickHero57, 'Hero Tristan button should exist in picker');
  pickHero57.dispatchEvent('click');
  context.renderDraft(activeDraftCache);

  // Crucial check: all 5 picks must be retained and NOT wiped out on re-render
  assert.match(statusEl.textContent, /Selected 5\/5 steps/);
  assert.match(viewEl.textContent, /Lock Defense Lineup \(5 Heroes\)/);
  assert.match(viewEl.textContent, /Lock & Submit Defense Lineup \(5\/5 Heroes\)/);

  // Now simulate server advancing to Attack stage (stageId = 4)
  activeDraftCache.legendDraftStatus.data.stageId = 4;
  activeDraftCache.legendDraftStatus.data.defenceHeroes = [4, 23, 24, 33, 57];
  activeDraftCache.legendDraftStatus.data.enemyDefenceHeroes = [10, 25, 44, 49, 78];
  context.renderDraft(activeDraftCache);

  // View mode must have automatically switched to Attack Draft!
  assert.match(viewEl.textContent, /Your Attack Lineup/);
  assert.match(viewEl.textContent, /Opponent Defense Lineup/);
  assert.match(statusEl.textContent, /Attack Draft/);
});

test('Legend Draft displays server rejection error banner and keeps slots editable', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const errorCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2,
        matchId: 360413879,
        lastError: 'Invalid heroes list',
        lastErrorCode: 5,
        lastErrorAction: 'saveDefence',
        defenceHeroes: []
      }
    }
  };

  context.renderDraft(errorCache);
  assert.match(viewEl.textContent, /Server rejected lineup: "Invalid heroes list"/);
  assert.match(viewEl.textContent, /Error code: 5/);
  assert.doesNotMatch(viewEl.textContent, /Lineup successfully locked/);
  assert.match(viewEl.textContent, /Step 1/);
});

test('Legend Draft presents 3 candidate cards per step for match 360504765 and advances step on pick', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');
  const context = await createDraftContext(viewEl, statusEl, searchEl);

  const choices = context.hwaHelperPopupData.observedDraftChoices(360504765);
  assert.ok(choices, 'Match 360504765 choices should be defined');
  assert.equal(choices.defense.length, 5);
  assert.equal(choices.attack.length, 5);
  assert.deepEqual(Array.from(choices.defense[0]), [11, 2, 6]); // Chabba, Galahad, Phobos
  assert.deepEqual(Array.from(choices.defense[1]), [75, 54, 25]); // Peech, Iris, Krista
  assert.deepEqual(Array.from(choices.attack[0]), [55, 14, 62]); // Mushy and Shroom, Ginger, Amira

  const draftCache = {
    legendDraftStatus: {
      data: {
        active: true,
        stageId: 2, // Defense draft
        matchId: 360504765,
        stageFinishTs: Math.floor(Date.now() / 1000) + 90,
        defenceHeroes: []
      }
    },
    heroGetAll: { data: {} }
  };

  context.renderDraft(draftCache);

  // Should render 3 choices banner for Step 1
  assert.match(viewEl.textContent, /3 Choices for Step 1 \(Pick 1 of 3\)/);
  assert.match(viewEl.textContent, /Chabba/);
  assert.match(viewEl.textContent, /Galahad/);
  assert.match(viewEl.textContent, /Phobos/);

  // Pick Chabba (choice 1)
  const buttons = viewEl.querySelectorAll('button');
  const pickChabbaBtn = buttons.find(b => b.textContent === 'Pick this Hero' || b.textContent.includes('Chabba'));
  assert.ok(pickChabbaBtn, 'Pick button for candidate should exist');
  pickChabbaBtn.dispatchEvent('click');

  context.renderDraft(draftCache);

  // Step 1 should be selected, status updated to 1/5, and active step auto-advanced to Step 2
  assert.match(statusEl.textContent, /Selected 1\/5 steps/);
  assert.match(viewEl.textContent, /3 Choices for Step 2 \(Pick 1 of 3\)/);
  assert.match(viewEl.textContent, /Peech/);
  assert.match(viewEl.textContent, /Iris/);
  assert.match(viewEl.textContent, /Krista/);
});

test('DraftModal tracks match status, live timer, opponent profile, and match results from RPC', async () => {
  const modalPath = new URL('../src/components/dialogs/DraftModal.vue', import.meta.url);
  const code = await readFile(modalPath, 'utf8');

  // Match Status & Countdown Timer
  assert.match(code, /stageFinishTs/, 'Must track stageFinishTs from RPC');
  assert.match(code, /id="draft-countdown"/, 'Must have #draft-countdown element');

  // Opponent Profile Card
  assert.match(code, /id="draft-opponent-card"/, 'Must have #draft-opponent-card element');
  assert.match(code, /enemyUser\.name/, 'Must track opponent name');
  assert.match(code, /enemyUser\.clanTitle/, 'Must track opponent guild/clan title');
  assert.match(code, /rating\.userRating/, 'Must track user and opponent rating');

  // Match Result
  assert.match(code, /id="draft-result-box"/, 'Must have #draft-result-box element');
  assert.match(code, /userDifRating/, 'Must track userDifRating delta');
  assert.match(code, /draftBpExp/, 'Must track draftBpExp reward');

  // Defense & Attack Lineup Switcher
  assert.match(code, /id="draft-tab-defense"/, 'Must have #draft-tab-defense button');
  assert.match(code, /id="draft-tab-attack"/, 'Must have #draft-tab-attack button');

  // Lineup tracking
  assert.match(code, /defenceHeroes/, 'Must track defenceHeroes from RPC');
  assert.match(code, /attackHeroes/, 'Must track attackHeroes from RPC');
  assert.match(code, /enemyDefenceHeroes/, 'Must track enemyDefenceHeroes counter');
  assert.match(code, /enemyAttackHeroes/, 'Must track enemyAttackHeroes counter');
  assert.match(code, /getHeroStar/, 'Must extract hero stars');
  assert.match(code, /getHeroAvatar/, 'Must extract hero avatars');
});
