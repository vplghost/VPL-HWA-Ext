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
    const childText = this.children.map(c => (c ? c.textContent : '')).join(' ');
    if (this._textContent && childText) {
      return `${this._textContent} ${childText}`;
    }
    return this._textContent || childText;
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
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  dispatchEvent(event) {
    const list = this.eventListeners[event] || [];
    for (const h of list) h({ stopPropagation: () => {}, target: this });
  }
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean); }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const results = [];
    const check = (node) => {
      if (sel.startsWith('.') && node.className?.includes(sel.slice(1))) results.push(node);
      else if (sel.startsWith('#') && (node.attributes?.id === sel.slice(1) || node.id === sel.slice(1))) results.push(node);
      else if (node.tagName?.toLowerCase() === sel.toLowerCase()) results.push(node);
      for (const c of node.children) check(c);
    };
    check(this);
    return results;
  }
}

async function createCampaignContext() {
  const elements = {};
  function getEl(sel) {
    if (!elements[sel]) {
      const tag = sel.startsWith('input') ? 'input' : (sel.startsWith('button') ? 'button' : (sel.startsWith('dialog') ? 'dialog' : 'div'));
      const el = new MockElement(tag);
      if (sel.startsWith('#')) el.attributes.id = sel.slice(1);
      elements[sel] = el;
    }
    return elements[sel];
  }

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (_, tag) => new MockElement(tag),
    querySelector: (sel) => getEl(sel),
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
    formatRemainingHms: () => '00:00:00',
    starGlowClass: () => '',
    createInitialsBadge: (name) => {
      const el = new MockElement('span');
      el.textContent = name;
      return el;
    },
    starIcons: () => new MockElement('span'),
    hwaHelperProductionData: { ratePerMinute: () => 0 },
    hwaHelperResourceData: { formatAmount: (n) => String(n) },
    chrome: {
      storage: {
        local: { get: async () => ({ popupRpcEnabled: true, socketRefreshMode: 'direct' }), set: async () => {} },
        session: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        getManifest: () => ({ version: '0.9.0' }),
        sendMessage: async () => ({ ok: true })
      }
    },
    console
  });

  const resourceDataSrc = await readFile('extension/resource-data.js', 'utf8');
  const heroMetaSrc = await readFile('extension/hero-metadata.js', 'utf8');
  const popupDataSrc = await readFile('extension/popup-data.js', 'utf8');
  const dashboardDataSrc = await readFile('extension/dashboard-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');
  const rpcCacheSrc = await readFile('extension/rpc-cache.js', 'utf8');

  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(heroMetaSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(dashboardDataSrc, context);
  vm.runInContext(popupSrc, context);
  vm.runInContext(rpcCacheSrc, context);

  context.hwaHelperNameMap = {
    hero: (id) => context.hwaHelperHeroMetadata?.[id]?.name || `Hero #${id}`,
    building: (id) => `Building #${id}`
  };

  return context;
}

test('rpc-cache extracts lastCampaignRaidResult with drops and consumable ticket data', async () => {
  const context = await createCampaignContext();

  const rec = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({
      calls: [
        { ident: 'test1', name: 'missionRaid', args: { id: 135, times: 2 } }
      ]
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'test1',
          result: {
            response: {
              '0': { fragmentGear: { '57': 1 }, gold: 1521, experience: 8 },
              '1': { gear: { '9': 1 }, consumable: { '10': 1 }, gold: 1521, experience: 8 },
              raid: { consumable: { '9': 2 } }
            }
          }
        }
      ]
    })
  };

  const entries = context.hwaHelperRpcCache.extract(rec);
  assert.ok(Array.isArray(entries));
  const raidEntry = entries.find(e => e.key === 'lastCampaignRaidResult');
  assert.ok(raidEntry, 'Should extract lastCampaignRaidResult entry');
  assert.equal(raidEntry.data.missionId, 135);
  assert.equal(raidEntry.data.times, 2);
  assert.equal(raidEntry.data.drops.gold, 3042);
  assert.equal(raidEntry.data.drops.experience, 16);
  assert.equal(raidEntry.data.drops.fragmentGear['57'], 1);
  assert.equal(raidEntry.data.drops.gear['9'], 1);
  assert.equal(raidEntry.data.drops.consumable['10'], 1);
  assert.equal(raidEntry.data.drops.consumable['9'], 2);
});

test('renderCampaignDialog displays energy, mission selector, last raid drops, and crafting rows', async () => {
  const context = await createCampaignContext();
  const target = new MockElement('div');

  const cache = {
    energyStatus: { data: { energy: 120, max: 150 } },
    lastCampaignRaidResult: {
      data: {
        missionId: 135,
        times: 5,
        drops: {
          gold: 7605,
          experience: 40,
          fragmentGear: { '57': 3 },
          gear: { '9': 1 },
          consumable: { '10': 2 }
        }
      }
    },
    inventoryGet: {
      data: {
        fragmentGear: { '57': 14, '169': 5 }
      }
    }
  };

  context.renderCampaignDialog(cache, target);

  const text = target.textContent;
  assert.match(text, /Chiến dịch \(Campaign Mission Raid\)/);
  assert.match(text, /120/);
  assert.match(text, /Ải Chiến Dịch/);
  assert.match(text, /Kết quả Raid Ải #135 \(5 lượt\)/);
  assert.match(text, /7,?605 Gold/);
  assert.match(text, /Mảnh #57/);
  assert.match(text, /Gear #9/);
  assert.match(text, /Mảnh #57\s*\(14 mảnh\)/);
  assert.match(text, /Mảnh #169\s*\(5 mảnh\)/);

  // Check buttons exist
  const buttons = target.querySelectorAll('button');
  const raidBtn = target.querySelector('#campaign-raid-submit');
  assert.ok(raidBtn, 'Raid action button should exist');
  const craftBtn = buttons.find(b => b.textContent === 'Ghép');
  assert.ok(craftBtn, 'Craft fragment button should exist');
});

test('renderHeroDialog renders 6 equipment slots and quick farm trigger', async () => {
  const context = await createCampaignContext();
  const host = new MockElement('div');
  context.document.querySelector = (sel) => {
    if (sel === '#hero-dialog-body') return host;
    if (sel.startsWith('#')) {
      const el = new MockElement('div');
      el.attributes.id = sel.slice(1);
      return el;
    }
    return new MockElement('div');
  };

  const cache = {
    heroGetAll: {
      data: {
        '1': {
          id: 1,
          level: 80,
          color: 7,
          power: 45000,
          star: 4,
          slots: { '1': 1, '2': 1, '3': 0, '4': 0, '5': 0, '6': 0 },
          skills: { '1': 80, '2': 80, '3': 60, '4': 40 }
        }
      }
    },
    inventoryGet: { data: {} }
  };

  context.renderHeroDialog('1', cache);

  const text = host.textContent;
  assert.match(text, /Equipment Slots \(Trang bị\)/);
  assert.match(text, /Slot 1/);
  assert.match(text, /Slot 6/);
  assert.match(text, /Farm Trang Bị/);
});
