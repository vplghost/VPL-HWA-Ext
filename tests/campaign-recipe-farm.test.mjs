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
    this.style = {};
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]+>/g, '');
  }
  get textContent() {
    const childText = this.children.map((c) => (c ? c.textContent : '')).join(' ');
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

async function createTestContext() {
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

  const dataNamesSrc = await readFile('extension/data-names.js', 'utf8');
  const nameMapSrc = await readFile('extension/name-map.js', 'utf8');
  const resourceDataSrc = await readFile('extension/resource-data.js', 'utf8');
  const heroMetaSrc = await readFile('extension/hero-metadata.js', 'utf8');
  const campaignMissionsSrc = await readFile('extension/campaign-missions.js', 'utf8');
  const popupDataSrc = await readFile('extension/popup-data.js', 'utf8');
  const dashboardDataSrc = await readFile('extension/dashboard-data.js', 'utf8');
  const popupSrc = await readFile('extension/popup.js', 'utf8');

  vm.runInContext(dataNamesSrc, context);
  vm.runInContext(nameMapSrc, context);
  vm.runInContext(resourceDataSrc, context);
  vm.runInContext(heroMetaSrc, context);
  vm.runInContext(campaignMissionsSrc, context);
  vm.runInContext(popupDataSrc, context);
  vm.runInContext(dashboardDataSrc, context);
  vm.runInContext(popupSrc, context);

  context.hwaHelperNameMap = {
    ...context.hwaHelperNameMap,
    hero: (id) => context.hwaHelperHeroMetadata?.[id]?.name || `Hero #${id}`,
    building: (id) => `Building #${id}`
  };

  return context;
}

test('buildGearRecipeTree builds hierarchy and marks fulfilled vs unfulfilled components', async () => {
  const context = await createTestContext();

  // Test item 102 (requires gear 62 x1, which requires 5 fragments)
  const cache1 = {
    inventoryGet: {
      data: {
        gear: { '102': 0, '62': 0 },
        fragmentGear: { '62': 2 }
      }
    }
  };

  const tree1 = context.buildGearRecipeTree(102, cache1);
  assert.ok(tree1, 'Tree should be created');
  assert.equal(tree1.id, '102');
  assert.equal(tree1.isFulfilled, false, 'Root should be unfulfilled');
  assert.equal(tree1.children.length, 1, 'Should have 1 child (gear 62)');

  const child1 = tree1.children[0];
  assert.equal(child1.id, '62');
  assert.equal(child1.isFulfilled, false, 'Child should be unfulfilled');
  assert.equal(child1.fragment.required, 5);
  assert.equal(child1.fragment.owned, 2);
  assert.equal(child1.fragment.isFulfilled, false);

  // When player has enough fragments for gear 62
  const cache2 = {
    inventoryGet: {
      data: {
        gear: { '102': 0, '62': 0 },
        fragmentGear: { '62': 5 }
      }
    }
  };
  const tree2 = context.buildGearRecipeTree(102, cache2);
  assert.equal(tree2.children[0].fragment.isFulfilled, true, 'Fragment should be fulfilled');
  assert.equal(tree2.children[0].canCraft, true, 'Child should be craftable');

  // When player already owns item 102
  const cache3 = {
    inventoryGet: {
      data: {
        gear: { '102': 1, '62': 0 },
        fragmentGear: { '62': 0 }
      }
    }
  };
  const tree3 = context.buildGearRecipeTree(102, cache3);
  assert.equal(tree3.isFulfilled, true, 'Root should be fulfilled when owned');
});

test('getMissionsForItem and getHighestRaidableMission returns highest 3-star mission', async () => {
  const context = await createTestContext();
  const campaignData = context.hwaHelperCampaignMissions;

  assert.ok(campaignData, 'hwaHelperCampaignMissions should exist');

  // Item 57 has drop missions [42, 46, 78, 103, 110, 135, 146, 163]
  const missions57 = campaignData.getMissionsForItem(57);
  assert.ok(missions57.length >= 7, 'Item 57 should have drop missions');
  const missionIds57 = missions57.map((m) => m.id);
  assert.ok(missionIds57.includes(135), 'Should include mission 135');
  assert.ok(missionIds57.includes(110), 'Should include mission 110');

  // Progress with 3 stars up to mission 135, and 1 star on 146
  const progress = {
    '42': { stars: 3 },
    '46': { stars: 3 },
    '78': { stars: 3 },
    '103': { stars: 3 },
    '110': { stars: 3 },
    '135': { stars: 3 },
    '146': { stars: 1 }
  };

  const highestRaidable = campaignData.getHighestRaidableMission(missionIds57, progress);
  assert.equal(highestRaidable, 135, 'Should select mission 135 because it is the highest with 3 stars');

  // When mission 163 also has 3 stars
  const progress2 = {
    ...progress,
    '163': { stars: 3 }
  };
  const highestRaidable2 = campaignData.getHighestRaidableMission(missionIds57, progress2);
  assert.equal(highestRaidable2, 163, 'Should select mission 163 when it has 3 stars');
});

test('openCampaignDialog with gearId renders recipe tree and auto-fills highest 3-star mission', async () => {
  const context = await createTestContext();
  const target = new MockElement('div');

  const cache = {
    energyStatus: { data: { energy: 100, max: 150 } },
    missionGetAll: {
      data: {
        '42': { stars: 3 },
        '46': { stars: 3 },
        '78': { stars: 3 },
        '103': { stars: 3 },
        '110': { stars: 3 },
        '135': { stars: 3 },
        '146': { stars: 2 }
      }
    },
    inventoryGet: {
      data: {
        gear: { '102': 0, '62': 0 },
        fragmentGear: { '62': 2 }
      }
    }
  };

  // Open with Gear 62
  context.openCampaignDialog({ gearId: 62 }, cache);
  context.renderCampaignDialog(cache, target);

  const text = target.textContent;
  assert.match(text, /Cây Công Thức Chế Tạo/);
  assert.match(text, /Thiếu 3 mảnh/);
  assert.match(text, /Đang chọn farm/);

  // Check auto-filled mission ID is the highest 3-star mission for gear 62
  // Candidate missions for gear 62: [48, 65, 84, 113, 142, 151, 168]
  // None of them are in progress above except let's test with progress containing mission 84 with 3 stars
  const cacheWith62 = {
    ...cache,
    missionGetAll: {
      data: {
        '48': { stars: 3 },
        '65': { stars: 3 },
        '84': { stars: 3 },
        '113': { stars: 1 }
      }
    }
  };

  context.openCampaignDialog({ gearId: 62 }, cacheWith62);
  context.renderCampaignDialog(cacheWith62, target);

  const missionInput = target.querySelector('#campaign-mission-input');
  assert.ok(missionInput, 'Mission input should exist');
  assert.equal(missionInput.value, '84', 'Mission input should be auto-filled to highest 3-star mission (84)');
  assert.equal(context.hwaHelperCampaignState.selectedCampaignMissionId, 84, 'selectedCampaignMissionId should be 84');
});

test('hero dialog equipment slot click passes gearId to openCampaignDialog', async () => {
  const context = await createTestContext();
  const host = context.document.querySelector('#hero-dialog-body');

  const cache = {
    heroGetAll: {
      data: {
        '1': {
          id: 1,
          color: 2,
          level: 40,
          power: 12000,
          star: 3,
          slots: [null, null, null, null, null, null] // all unequipped
        }
      }
    },
    inventoryGet: {
      data: {
        gear: {},
        fragmentGear: {}
      }
    }
  };

  let openedOptions = null;
  context.openCampaignDialog = (opts) => {
    openedOptions = opts;
  };

  context.renderHeroDialog(1, cache);

  // Click on the first slot box
  const slotsGrid = host.querySelectorAll('.cursor-pointer');
  assert.ok(slotsGrid.length > 0, 'Equipment slots should be rendered and clickable');

  // Find slot box with Slot 1
  const slot1 = slotsGrid.find((el) => el.textContent.includes('Slot 1'));
  assert.ok(slot1, 'Slot 1 element should exist');

  slot1.dispatchEvent('click');
  assert.ok(openedOptions, 'openCampaignDialog should be called');
  assert.ok(openedOptions.gearId != null, 'openCampaignDialog should receive gearId from slot');
});
