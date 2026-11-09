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
    this.hidden = false;
    this.disabled = false;
    this.className = '';
  }
  get id() { return this.attributes.id || ''; }
  set id(v) { this.attributes.id = v; }
  get textContent() {
    if (this._textContent !== undefined) return this._textContent;
    if (this.children.length > 0) return this.children.map((c) => c.textContent).join(' ');
    return '';
  }
  set textContent(val) {
    this._textContent = val;
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML || this.children.map((c) => `<${c.tagName}>${c.textContent}</${c.tagName}>`).join('');
  }
  set innerHTML(val) {
    this._innerHTML = val;
    this._textContent = String(val).replace(/<[^>]*>/g, '');
  }
  append(...children) {
    for (const c of children) {
      if (c) this.children.push(c);
    }
  }
  replaceChildren(...children) { this.children = [...children]; }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }
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
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.className.includes(cls)) return this;
      for (const c of this.children) {
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    return null;
  }
}

const popupCode = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

function setupTestContext(initialStatus = null, onSendMessage = null) {
  let lastMessage = null;
  const mockChrome = {
    runtime: {
      getManifest: () => ({ version: '0.9.169' }),
      sendMessage: (msg, callback) => {
        lastMessage = msg;
        if (typeof onSendMessage === 'function') {
          onSendMessage(msg, callback);
        } else if (msg.kind === 'get-game-tab-status') {
          callback?.(initialStatus || { ok: true, hasGameTab: false, gameEngineStatus: null });
        } else if (msg.kind === 'reload-game-tab') {
          callback?.({ ok: true });
        }
      }
    },
    storage: {
      local: {
        get: async () => ({})
      }
    }
  };

  const actionsEl = new MockElement('div');
  actionsEl.id = 'dashboard-actions';
  const raidBtn = new MockElement('button');
  raidBtn.textContent = 'Raid';
  const gatherBtn = new MockElement('button');
  gatherBtn.textContent = 'Gathering';
  const monsterBtn = new MockElement('button');
  monsterBtn.textContent = 'Monster';
  actionsEl.append(raidBtn, gatherBtn, monsterBtn);

  const alertEl = new MockElement('div');
  alertEl.id = 'dashboard-game-status-alert';
  alertEl.hidden = true;

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === '#dashboard-actions') return actionsEl;
      if (sel === '#dashboard-game-status-alert') return alertEl;
      return null;
    }
  };

  const context = vm.createContext({
    document: mockDoc,
    chrome: mockChrome,
    setTimeout,
    clearTimeout,
    globalThis: {}
  });

  // Extract updateDashboardGameStatus function from popup.js
  const fnStart = popupCode.indexOf('function updateDashboardGameStatus(');
  const fnEnd = popupCode.indexOf('\nfunction renderDashboard(', fnStart);
  const fnCode = popupCode.slice(fnStart, fnEnd);
  vm.runInContext(fnCode, context);

  return { context, actionsEl, alertEl, getLastMessage: () => lastMessage };
}

test('updateDashboardGameStatus displays warning banner when no game window is open and omits Refresh browser button', () => {
  const { context, actionsEl, alertEl } = setupTestContext({
    ok: true,
    hasGameTab: false,
    gameEngineStatus: null
  });

  context.updateDashboardGameStatus(actionsEl, alertEl);

  assert.equal(alertEl.hidden, false, 'Alert banner must be visible');
  assert.ok(alertEl.textContent.includes('No Game Window Detected'), 'Must indicate no game window is detected');
  assert.equal(actionsEl.querySelector('#btn-refresh-browser'), null, 'Refresh browser button must not be rendered when no game tab');
});

test('updateDashboardGameStatus displays Refresh browser button and recommendation when game window is open but not hooked', () => {
  const { context, actionsEl, alertEl } = setupTestContext({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: false, hasCanvas: false, hasRpcHeaders: false }
  });

  context.updateDashboardGameStatus(actionsEl, alertEl);

  assert.equal(alertEl.hidden, false, 'Alert banner must be visible');
  assert.ok(alertEl.textContent.includes('Refresh Recommended'), 'Must recommend refresh');
  assert.ok(alertEl.textContent.includes('hooks are not yet connected'), 'Must indicate hooks not connected');

  const refreshBtn = actionsEl.querySelector('#btn-refresh-browser');
  assert.ok(refreshBtn, 'Refresh browser button must be added to actions');
  assert.ok(refreshBtn.textContent.includes('Refresh browser'));
});

test('updateDashboardGameStatus displays Refresh browser button when extension version changes', () => {
  const { context, actionsEl, alertEl } = setupTestContext({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.168' }
  });

  context.updateDashboardGameStatus(actionsEl, alertEl);

  assert.equal(alertEl.hidden, false);
  assert.ok(alertEl.textContent.includes('Extension updated to v0.9.169'), 'Must mention new version');

  const refreshBtn = actionsEl.querySelector('#btn-refresh-browser');
  assert.ok(refreshBtn, 'Refresh browser button must be present');
});

test('updateDashboardGameStatus displays Refresh browser button when engine requests refresh', () => {
  const { context, actionsEl, alertEl } = setupTestContext({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.169', refreshRequired: true }
  });

  context.updateDashboardGameStatus(actionsEl, alertEl);

  assert.equal(alertEl.hidden, false);
  assert.ok(alertEl.textContent.includes('requested a refresh'), 'Must mention engine requested refresh');

  const refreshBtn = actionsEl.querySelector('#btn-refresh-browser');
  assert.ok(refreshBtn, 'Refresh browser button must be present');
});

test('clicking Refresh browser button dispatches reload-game-tab message', async () => {
  let dispatched = null;
  const { context, actionsEl, alertEl } = setupTestContext(
    { ok: true, hasGameTab: true, gameEngineStatus: { ready: false } },
    (msg, cb) => {
      if (msg.kind === 'reload-game-tab') {
        dispatched = msg;
        cb?.({ ok: true });
      } else if (msg.kind === 'get-game-tab-status') {
        cb?.({ ok: true, hasGameTab: true, gameEngineStatus: { ready: false } });
      }
    }
  );

  context.updateDashboardGameStatus(actionsEl, alertEl);
  const refreshBtn = actionsEl.querySelector('#btn-refresh-browser');
  assert.ok(refreshBtn);

  await refreshBtn.fire('click');
  assert.ok(dispatched, 'Must dispatch reload-game-tab message');
  assert.equal(dispatched.kind, 'reload-game-tab');
});

test('updateDashboardGameStatus hides warning and removes button when game window is healthy and hooked', () => {
  const { context, actionsEl, alertEl } = setupTestContext({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.169' }
  });

  context.updateDashboardGameStatus(actionsEl, alertEl);

  assert.equal(alertEl.hidden, true, 'Alert must be hidden for healthy connected game');
  assert.equal(actionsEl.querySelector('#btn-refresh-browser'), null, 'Refresh browser button must be omitted when healthy');
});
