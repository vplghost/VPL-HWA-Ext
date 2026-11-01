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
  addEventListener() {}
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

test('Legend Draft UI renders 5 steps, 3 candidate cards per step, and lock button validation', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');

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

  // Load scripts into vm
  const resourceDataSrc = await readFile('extension/resource-data.js', 'utf8');
  const popupDataSrc = await readFile('extension/popup-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');

  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(popupSrc, context);

  // Set up mock metadata
  context.hwaHelperHeroMetadata = {
    4: { name: 'Astaroth', faction: 'Chaos', role: 'Tank', hasAvatar: true },
    12: { name: 'Arachne', faction: 'Mystery', role: 'Control', hasAvatar: true },
    16: { name: 'Dante', faction: 'Eternity', role: 'Marksman', hasAvatar: true },
    24: { name: 'Cleaver', faction: 'Chaos', role: 'Tank', hasAvatar: true },
    38: { name: 'Corvus', faction: 'Eternity', role: 'Tank', hasAvatar: true },
    47: { name: 'Andvari', faction: 'Nature', role: 'Tank', hasAvatar: true },
    49: { name: 'Yasmine', faction: 'Nature', role: 'Warrior', hasAvatar: true },
    51: { name: "Xe'Sha", faction: 'Chaos', role: 'Mage', hasAvatar: true },
    55: { name: 'Mushy and Shroom', faction: 'Nature', role: 'Mage', hasAvatar: true },
    56: { name: 'Fafnir', faction: 'Honor', role: 'Support', hasAvatar: true },
    68: { name: 'Peech', faction: 'Mystery', role: 'Mage', hasAvatar: true },
    502: { name: 'Morrigan', faction: 'Eternity', role: 'Support', hasAvatar: true },
    503: { name: 'Alvanor', faction: 'Nature', role: 'Support', hasAvatar: true }
  };
  context.hwaHelperNameMap = {
    hero: (id) => context.hwaHelperHeroMetadata[id]?.name || `Hero #${id}`
  };

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

  // Verify status contains step count
  assert.match(statusEl.textContent, /Đã chọn 0\/5 bước/);

  // Check candidates helper
  const defaultCandidates = context.hwaHelperPopupData.defaultDraftCandidates();
  assert.equal(defaultCandidates.length, 5);
  assert.equal(defaultCandidates[0].length, 3);

  // Test in-game pick sync: when defenceHeroes has 5 heroes, it renders locked UI
  sampleCache.legendDraftStatus.data.defenceHeroes = [24, 12, 47, 68, 51];
  context.renderDraft(sampleCache);
  assert.match(statusEl.textContent, /Đã chọn 5\/5 bước/);
  assert.match(viewEl.textContent, /Đã khóa đội hình/);
});

test('Legend Draft UI renders enemy lineup when in Attack Stage 4', async () => {
  const viewEl = new MockElement('div');
  const statusEl = new MockElement('div');
  const searchEl = new MockElement('input');

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
  const popupDataSrc = await readFile('extension/popup-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');

  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(popupSrc, context);

  context.hwaHelperHeroMetadata = {
    24: { name: 'Cleaver', faction: 'Chaos', role: 'Tank', hasAvatar: true },
    6: { name: 'Astrid and Lucas', faction: 'Honor', role: 'Marksman', hasAvatar: true },
    36: { name: 'Jorgen', faction: 'Mystery', role: 'Control', hasAvatar: true },
    4: { name: 'Astaroth', faction: 'Chaos', role: 'Tank', hasAvatar: true },
    56: { name: 'Fafnir', faction: 'Honor', role: 'Support', hasAvatar: true }
  };
  context.hwaHelperNameMap = {
    hero: (id) => context.hwaHelperHeroMetadata[id]?.name || `Hero #${id}`
  };

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
        enemyDefenceHeroes: [24, 6, 36, 4, 56],
        defenceHeroes: [24, 12, 47, 68, 51],
        attackHeroes: []
      }
    },
    heroGetAll: { data: {} }
  };

  context.renderDraft(attackCache);

  assert.match(viewEl.textContent, /Đội hình Thủ của Đối thủ/);
  assert.match(viewEl.textContent, /Cleaver/);
  assert.match(viewEl.textContent, /Lượt chọn Đội hình Công/);
});
