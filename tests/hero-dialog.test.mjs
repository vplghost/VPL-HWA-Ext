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
    this.style = {};
    this.listeners = {};
    this.value = '';
    this.open = false;
    this.disabled = false;
    this._textContent = '';
    this._innerHTML = '';
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }
  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.children.map(c => c.innerHTML).join(' ') || this.textContent;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    this.textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
  replaceChildren(...nodes) {
    this.children = nodes.filter(Boolean);
    this._textContent = '';
    this._innerHTML = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
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
  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.attributes?.id === id || this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector?.(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className?.includes(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector?.(selector);
        if (found) return found;
      }
    } else {
      const tag = selector.toUpperCase();
      if (this.tagName === tag) return this;
      for (const c of this.children) {
        const found = c.querySelector?.(selector);
        if (found) return found;
      }
    }
    return null;
  }
  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      if (selector.startsWith('.')) {
        if (el.className?.includes(selector.slice(1))) results.push(el);
      } else if (selector.startsWith('#')) {
        if (el.attributes?.id === selector.slice(1) || el.id === selector.slice(1)) results.push(el);
      } else if (el.tagName === selector.toUpperCase()) {
        results.push(el);
      }
      for (const child of el.children || []) check(child);
    };
    check(this);
    return results;
  }
}

const popupHtml = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const heroMetaJs = await readFile(new URL('../extension/hero-metadata.js', import.meta.url), 'utf8');
const popupDataJs = await readFile(new URL('../extension/popup-data.js', import.meta.url), 'utf8');

test('popup.html defines hero-dialog with title, status, and body', () => {
  assert.match(popupHtml, /<dialog id="hero-dialog"[\s\S]*id="hero-dialog-title"[\s\S]*id="hero-dialog-status"[\s\S]*id="hero-dialog-body"[\s\S]*<\/dialog>/);
});

function createTestContext(elements = {}, sentMessages = []) {
  const context = {
    document: {
      createElement: (tag) => new MockElement(tag),
      createElementNS: (_, tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null,
      querySelectorAll: (sel) => []
    },
    chrome: {
      runtime: {
        sendMessage: (msg, callback) => {
          sentMessages.push(msg);
          if (callback) callback({ ok: true });
        }
      }
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    formatNumber: (v) => typeof v === 'number' ? v.toLocaleString('en-US') : '—',
    starIcons: (count) => {
      const el = new MockElement('div');
      el.textContent = '★'.repeat(count);
      return el;
    },
    starGlowClass: (count, lg) => lg ? `avatar-star-lg-${count || 'default'}` : `avatar-star-${count || 'default'}`,
    createInitialsBadge: (name) => {
      const el = new MockElement('div');
      el.textContent = name.slice(0, 2);
      return el;
    },
    globalThis: {}
  };

  vm.runInNewContext(heroMetaJs, context);
  vm.runInNewContext(popupDataJs, context);

  // Extract renderHeroDialog and openHeroDialog functions from popupJs
  const heroDialogCode = popupJs.slice(
    popupJs.indexOf('let currentHeroDialogId = null;'),
    popupJs.indexOf('function setupBuildingAndResearchDialogs()')
  );
  vm.runInNewContext(heroDialogCode, context);

  return context;
}

test('renderHeroDialog renders hero profile, stats, skills and upgrade buttons', async () => {
  const dialogEl = new MockElement('dialog');
  const titleEl = new MockElement('h2');
  const statusEl = new MockElement('div');
  const bodyEl = new MockElement('div');

  const elements = {
    '#hero-dialog': dialogEl,
    '#hero-dialog-title': titleEl,
    '#hero-dialog-status': statusEl,
    '#hero-dialog-body': bodyEl
  };

  const sentMessages = [];
  const ctx = createTestContext(elements, sentMessages);

  const mockCache = {
    heroGetAll: {
      data: {
        '502': {
          id: 502,
          level: 71,
          color: 6, // Blue +2
          star: 4,
          power: 7163,
          skills: {
            '10226': 10,
            '10227': 5,
            '11014': 26
          },
          artifacts: [
            { artifactType: 'weapon', level: 12, star: 2 },
            { artifactType: 'book', level: 8, star: 1 }
          ]
        },
        '1': {
          id: 1,
          level: 80,
          color: 8,
          star: 5,
          power: 15000
        }
      }
    },
    inventoryGet: { data: {} }
  };

  ctx.renderHeroDialog(502, mockCache);

  // Verify Dialog Title & Status
  assert.equal(titleEl.textContent, 'Morrigan');
  assert.match(statusEl.textContent, /#502/);
  assert.match(statusEl.textContent, /7,163/);

  // Verify Profile details
  assert.match(bodyEl.textContent, /Level:\s*71/);
  assert.match(bodyEl.textContent, /Power:\s*⚔️\s*7,163/);
  assert.match(bodyEl.textContent, /Blue\+\+/);

  // Verify Skills section
  // Slot 1 (White): Lv 10 / 71 -> upgrade button exists
  // Slot 2 (Green): Lv 5 / 71 -> upgrade button exists
  // Slot 3 (Blue): Lv 26 / 51 -> upgrade button exists
  // Slot 4 (Violet): Locked (since hero color is 6 < 7)
  const skillButtons = bodyEl.querySelectorAll('.btn-upgrade-skill');
  assert.equal(skillButtons.length, 3, 'Should have 3 upgrade buttons for unlocked skills below max level');

  // Verify skill names are displayed instead of raw skill IDs
  assert.match(bodyEl.textContent, /Army of Graven/);
  assert.match(bodyEl.textContent, /Bone Armor/);
  assert.match(bodyEl.textContent, /Moonlight/);
  assert.match(bodyEl.textContent, /Necromancy/);
  assert.doesNotMatch(bodyEl.textContent, /#10226/);
  assert.doesNotMatch(bodyEl.textContent, /#11014/);

  // Verify compact button sizing and 2-column layout
  const skillsContainer = bodyEl.children[1]?.children[1];
  assert.match(skillsContainer?.className || '', /grid-cols-1 sm:grid-cols-2/);
  assert.match(skillButtons[0].className, /size-6/);

  assert.match(bodyEl.textContent, /🔒 Unlocks at rank Violet/);

  // Test clicking ➕ button on Skill 3 (Blue)
  const skill3Btn = skillButtons[2];
  await skill3Btn.fire('click');

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sentMessages[0])), {
    kind: 'refresh-rpc',
    calls: [
      {
        name: 'heroUpgradeSkill',
        args: {
          heroId: 502,
          skill: 3
        }
      },
      {
        name: 'heroGetAll',
        args: {}
      }
    ]
  });

  // Verify optimistic update
  assert.equal(mockCache.heroGetAll.data['502'].skills['11014'], 27);
});

test('renderHeroDialog shows MAX badge and no upgrade button when skill is maxed', () => {
  const dialogEl = new MockElement('dialog');
  const titleEl = new MockElement('h2');
  const statusEl = new MockElement('div');
  const bodyEl = new MockElement('div');

  const elements = {
    '#hero-dialog': dialogEl,
    '#hero-dialog-title': titleEl,
    '#hero-dialog-status': statusEl,
    '#hero-dialog-body': bodyEl
  };

  const sentMessages = [];
  const ctx = createTestContext(elements, sentMessages);

  const mockCache = {
    heroGetAll: {
      data: {
        '10': {
          id: 10,
          level: 30,
          color: 4, // Blue
          star: 3,
          power: 4500,
          skills: {
            '1': 30, // Max for white (30 / 30)
            '2': 30, // Max for green (30 / 30)
            '3': 30  // Max for blue (raw 30 - 20 = 10 / 10)
          }
        }
      }
    }
  };

  ctx.renderHeroDialog(10, mockCache);

  const skillButtons = bodyEl.querySelectorAll('.btn-upgrade-skill');
  assert.equal(skillButtons.length, 0, 'No upgrade buttons when all unlocked skills are at MAX');
  assert.match(bodyEl.textContent, /MAX/);
});

test('openHeroDialog opens the modal and renders hero data', () => {
  const dialogEl = new MockElement('dialog');
  const titleEl = new MockElement('h2');
  const statusEl = new MockElement('div');
  const bodyEl = new MockElement('div');

  const elements = {
    '#hero-dialog': dialogEl,
    '#hero-dialog-title': titleEl,
    '#hero-dialog-status': statusEl,
    '#hero-dialog-body': bodyEl
  };

  const ctx = createTestContext(elements);
  const mockCache = {
    heroGetAll: {
      data: {
        '1': { id: 1, level: 50, color: 5, power: 8000, skills: { '1': 20 } }
      }
    }
  };

  assert.equal(dialogEl.open, false);
  ctx.openHeroDialog(1, mockCache);
  assert.equal(dialogEl.open, true, 'dialog should be open after openHeroDialog');
  assert.equal(titleEl.textContent, 'Aurora');
});

test('renderHeroDialog handles unknown hero gracefully', () => {
  const dialogEl = new MockElement('dialog');
  const titleEl = new MockElement('h2');
  const statusEl = new MockElement('div');
  const bodyEl = new MockElement('div');

  const elements = {
    '#hero-dialog': dialogEl,
    '#hero-dialog-title': titleEl,
    '#hero-dialog-status': statusEl,
    '#hero-dialog-body': bodyEl
  };

  const ctx = createTestContext(elements);
  ctx.renderHeroDialog(9999, { heroGetAll: { data: {} } });

  assert.match(bodyEl.textContent, /Hero not found/);
});
