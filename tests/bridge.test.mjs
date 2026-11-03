import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');

test('bridge sends persisted intercept setting and applies changes without page reload', async () => {
  const listeners = [];
  const messages = [];
  let onChanged;
  const window = {
    addEventListener: (name, handler) => { if (name === 'message') listeners.push(handler); },
    postMessage: (data, origin) => { messages.push(data); for (const handler of listeners) {
      handler({ source: window, origin, data });
    } }
  };
  const chrome = {
    runtime: { sendMessage: async () => ({ saved: true }) },
    storage: {
      local: { get: async () => ({ captureSettings: { interceptEnabled: false } }) },
      onChanged: { addListener: (handler) => { onChanged = handler; } }
    }
  };
  runInNewContext(source, { window, chrome, location: { origin: 'https://www.hero-wars-alliance.com' } });
  await Promise.resolve();
  window.postMessage({ source: 'hwa-helper-api', kind: 'ready' },
    'https://www.hero-wars-alliance.com');
  assert.equal(messages.at(-1).interceptEnabled, false);
  assert.equal(messages.at(-1).popupRpcEnabled, false);
  onChanged({ captureSettings: { newValue: { interceptEnabled: true } } }, 'local');
  assert.equal(messages.at(-1).interceptEnabled, true);
  onChanged({ popupRpcEnabled: { newValue: true } }, 'local');
  assert.equal(messages.at(-1).popupRpcEnabled, true);
});

test('bridge injects helper button when document is available and sends open-tab message on click', async () => {
  const sentMessages = [];
  const elements = new Map();
  const document = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        attributes: {},
        listeners: {},
        style: {},
        hidden: false,
        setAttribute: (k, v) => { el.attributes[k] = v; },
        addEventListener: (event, handler) => { el.listeners[event] = handler; },
        click: () => { el.listeners.click?.(); }
      };
      return el;
    },
    body: {
      appendChild: (child) => {
        if (child.id) elements.set(child.id, child);
      }
    }
  };
  const chrome = {
    runtime: {
      sendMessage: async (msg) => { sentMessages.push(msg); }
    },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: () => {} }
    }
  };
  const window = {
    addEventListener: () => {},
    postMessage: () => {}
  };

  runInNewContext(source, {
    window,
    document,
    chrome,
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  const btn = elements.get('hwa-helper-btn');
  assert.ok(btn, 'Button should be injected');
  assert.equal(btn.attributes['aria-label'], 'Open HWA Helper in new tab');
  btn.click();
  assert.ok(sentMessages.some((m) => m.kind === 'open-tab'));

  const recordBtn = elements.get('hwa-record-btn');
  assert.ok(recordBtn, 'Record button should be injected');
  const exportBtn = elements.get('hwa-export-btn');
  assert.ok(exportBtn, 'Export button should be injected');
  assert.equal(exportBtn.hidden, true, 'Export button should be hidden when empty');
  const clearBtn = elements.get('hwa-clear-btn');
  assert.ok(clearBtn, 'Clear button should be injected');
  assert.equal(clearBtn.hidden, true, 'Clear button should be hidden when empty');
});

test('bridge helper button click safely handles extension context invalidated error', async () => {
  let alertedMessage = null;
  const elements = new Map();
  const document = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        attributes: {},
        listeners: {},
        style: {},
        hidden: false,
        setAttribute: (k, v) => { el.attributes[k] = v; },
        addEventListener: (event, handler) => { el.listeners[event] = handler; },
        click: () => { el.listeners.click?.(); }
      };
      return el;
    },
    body: {
      appendChild: (child) => {
        if (child.id) elements.set(child.id, child);
      }
    }
  };
  const chrome = {
    runtime: {
      sendMessage: () => {
        throw new Error('Extension context invalidated.');
      }
    },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: () => {} }
    }
  };
  const window = {
    addEventListener: () => {},
    postMessage: () => {},
    alert: (msg) => { alertedMessage = msg; }
  };

  runInNewContext(source, {
    window,
    document,
    chrome,
    alert: (msg) => { alertedMessage = msg; },
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  const btn = elements.get('hwa-helper-btn');
  assert.ok(btn);
  assert.doesNotThrow(() => {
    btn.click();
  });
  assert.match(alertedMessage, /reloaded|updated|refresh/);
});

test('bridge window message safely handles extension context invalidated without uncaught error', async () => {
  let messageHandler = null;
  const window = {
    addEventListener: (event, handler) => {
      if (event === 'message') messageHandler = handler;
    },
    postMessage: () => {}
  };
  const chrome = {
    runtime: {
      get id() { return undefined; },
      sendMessage: () => {
        throw new Error('Extension context invalidated.');
      }
    },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: () => {} }
    }
  };

  runInNewContext(source, {
    window,
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'hwa-helper-btn' ? {} : null),
      createElement: () => ({ setAttribute: () => {}, addEventListener: () => {} })
    },
    chrome,
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  assert.ok(messageHandler, 'Message listener should be registered');
  assert.doesNotThrow(() => {
    messageHandler({
      source: window,
      origin: 'https://www.hero-wars-alliance.com',
      data: {
        source: 'hwa-helper-api',
        kind: 'api-record',
        record: { endpoint: 'api/rpc', durationMs: 100 }
      }
    });
  });
});


test('bridge handles engine-status message and forwards engine commands', async () => {
  let storedData = {};
  const windowMessages = [];
  let runtimeListener = null;
  const listeners = [];
  const window = {
    addEventListener: (name, handler) => { if (name === 'message') listeners.push(handler); },
    postMessage: (data, origin) => {
      windowMessages.push(data);
      for (const h of listeners) h({ source: window, origin, data });
    }
  };
  const chrome = {
    runtime: {
      id: 'test-ext',
      sendMessage: async () => ({}),
      onMessage: {
        addListener: (handler) => { runtimeListener = handler; }
      }
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (val) => { Object.assign(storedData, val); }
      },
      onChanged: { addListener: () => {} }
    }
  };

  runInNewContext(source, {
    window,
    chrome,
    document: { readyState: 'complete', getElementById: () => ({}) },
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  window.postMessage({
    source: 'hwa-helper-api',
    kind: 'engine-status',
    status: { ready: true, hasSendMessage: true }
  }, 'https://www.hero-wars-alliance.com');

  assert.deepEqual(storedData.gameEngineStatus, { ready: true, hasSendMessage: true });

  assert.ok(runtimeListener);
  let reply = null;
  runtimeListener({ kind: 'engine-ping' }, {}, (r) => { reply = r; });
  assert.equal(reply.ok, true);
  assert.ok(windowMessages.some((m) => m.kind === 'engine-ping'));

  runtimeListener({
    kind: 'engine-send-message',
    objectName: 'UI',
    methodName: 'Claim',
    param: 'all'
  }, {}, (r) => { reply = r; });
  assert.equal(reply.ok, true);
  const sentCall = windowMessages.find((m) => m.kind === 'engine-send-message');
  assert.ok(sentCall);
  assert.equal(sentCall.objectName, 'UI');
  assert.equal(sentCall.methodName, 'Claim');
  assert.equal(sentCall.param, 'all');
});
