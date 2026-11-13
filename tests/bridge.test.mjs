import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');

test('energy auto heartbeat runs with popup closed, stops on disable and resets document identity on reload', async () => {
  const run = async () => {
    const timers = new Map(), sent = []; let timerId = 0; const listeners = [];
    const window = { addEventListener() {}, postMessage() {} };
    const chrome = { runtime: { sendMessage: async message => { sent.push(message); return {}; },
      onMessage: { addListener() {} } }, storage: { local: { get: async () => ({ raidEnergyAuto: { enabled: true } }) },
      onChanged: { addListener: listener => listeners.push(listener) } } };
    runInNewContext(source, { window, chrome, Date, location: { origin: 'https://www.hero-wars-alliance.com' },
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: id => timers.delete(id) });
    await Promise.resolve(); await Promise.resolve();
    const tick = () => sent.filter(message => message.kind === 'raid-energy-tick');
    assert.equal(tick().length, 1);
    const session = tick()[0].sessionId;
    const timer = [...timers.values()].find(timer => timer.delay === 30000);
    assert.ok(timer);
    timers.clear(); timer.callback();
    await Promise.resolve();
    assert.equal(tick().length, 2);
    assert.equal(tick()[1].sessionId, session);
    for (const listener of listeners) listener({ raidEnergyAuto: { newValue: { enabled: false } } }, 'local');
    assert.equal(timers.size, 0);
    return session;
  };
  assert.notEqual(await run(), await run(), 'Reload must create a new baseline session');
});

test('persisted raid timer wakes worker without popup and forwards RPC deadlines and queue ownership', async () => {
  const timers = new Map(); let timerId = 0; let onChanged; let onMessage;
  const sent = [], posted = [];
  let state = { phase: 'active', wakeAt: Date.now() + 5000 };
  const window = { addEventListener: () => {}, postMessage: (message) => posted.push(message) };
  const chrome = { runtime: { sendMessage: async (message) => { sent.push(message); return { watch: false }; },
    onMessage: { addListener: (callback) => { onMessage = callback; } } },
    storage: { local: { get: async () => ({ raidQueue: state }) },
      onChanged: { addListener: (callback) => { onChanged = callback; } } } };
  runInNewContext(source, { window, chrome, Date, location: { origin: 'https://www.hero-wars-alliance.com' },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id) });
  await Promise.resolve();
  assert.equal(timers.size, 1); assert.ok([...timers.values()][0].delay <= 5000);
  const timer = [...timers.values()][0]; timers.clear(); timer.callback();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(sent.filter((message) => message.kind === 'raid-queue-tick').length, 1);
  assert.equal(timers.size, 0, 'a non-owning tab must not enter a wake loop');
  onMessage({ kind: 'queue-rpc', group: 'queue-id', expiresAt: 12345,
    calls: [{ name: 'cancelRally', feature: 'rally', args: { rallyId: 'id' } }] }, {}, () => {});
  assert.equal(posted.at(-1).group, 'queue-id'); assert.equal(posted.at(-1).expiresAt, 12345);
  state = { phase: 'active', wakeAt: Date.now() + 1000 };
  onChanged({ raidQueue: { newValue: state } }, 'local'); assert.equal(timers.size, 1);
  onChanged({ raidQueue: { newValue: { phase: 'stopped' } } }, 'local'); assert.equal(timers.size, 0);
});

test('bridge forwards queue counts without RPC payloads and rejects invalid counts', async () => {
  const listeners = []; const sent = [];
  const window = { addEventListener: (name, handler) => { if (name === 'message') listeners.push(handler); }, postMessage: () => {} };
  const chrome = { runtime: { id: 'test', sendMessage: async (message) => { sent.push(message); return {}; } },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => {} } } };
  runInNewContext(source, { window, chrome, location: { origin: 'https://www.hero-wars-alliance.com' } });
  for (const count of [7, -1, 65, '4']) for (const listener of listeners) listener({
    source: window, origin: 'https://www.hero-wars-alliance.com',
    data: { source: 'hwa-helper-api', kind: 'rpc-queue-status', count, calls: [{ secret: 'ignored' }] }
  });
  const reports = sent.filter((message) => message.kind === 'rpc-queue-status');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].count, 7);
  assert.deepEqual(Object.keys(reports[0]), ['kind', 'count']);
});

test('bridge records canvas pointers while active and ignores typed keys and helper controls', async () => {
  const listeners = {};
  const sent = [];
  let onChanged;
  const document = {
    readyState: 'loading',
    addEventListener: (name, handler) => { listeners[name] = handler; },
    getElementById: () => null
  };
  const chrome = {
    runtime: { id: 'test', sendMessage: async (message) => { sent.push(message); return { saved: true }; } },
    storage: {
      local: { get: async () => ({ captureSettings: {} }) },
      session: { get: async () => ({ recordingState: { active: false } }) },
      onChanged: { addListener: (handler) => { onChanged = handler; } }
    }
  };
  const window = { addEventListener: () => {}, postMessage: () => {} };
  runInNewContext(source, { window, document, chrome, Date,
    location: { origin: 'https://www.hero-wars-alliance.com' } });
  await Promise.resolve();
  onChanged({ gameRecordingActive: { newValue: true } }, 'local');
  const canvas = { tagName: 'CANVAS', id: 'unity-canvas', width: 800, height: 600,
    closest: () => null, getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }) };
  listeners.pointerdown({ type: 'pointerdown', target: canvas, clientX: 210, clientY: 170, button: 0 });
  listeners.keydown({ type: 'keydown', target: canvas, key: 's' });
  listeners.keydown({ type: 'keydown', target: { closest: () => true }, key: 'Enter' });
  const interactions = () => sent.filter((message) => message.kind === 'record-interaction');
  assert.equal(interactions().length, 1);
  assert.equal(interactions()[0].entry.canvasX, 400);
  assert.equal(interactions()[0].entry.canvasY, 300);
  onChanged({ gameRecordingActive: { newValue: false } }, 'local');
  listeners.pointerdown({ type: 'pointerdown', target: canvas, clientX: 210, clientY: 170, button: 0 });
  assert.equal(interactions().length, 1);
});

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
  onChanged({ socketRefreshMode: { newValue: 'mqtt-piggyback' } }, 'local');
  assert.equal(messages.at(-1).socketRefreshMode, 'mqtt-piggyback');
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
  window.postMessage({ source: 'hwa-helper-api', kind: 'claim-rpc-result', ok: true },
    'https://www.hero-wars-alliance.com');
  assert.equal(storedData.claimRpcStatus.state, 'complete');

  assert.ok(runtimeListener);
  let reply = null;
  runtimeListener({ kind: 'engine-ping' }, {}, (r) => { reply = r; });
  assert.equal(reply.ok, true);
  assert.ok(windowMessages.some((m) => m.kind === 'engine-ping'));
  runtimeListener({ kind: 'queue-claim', calls: [{ name: 'mailFarm' }] }, {},
    (r) => { reply = r; });
  assert.equal(reply.ok, true);
  assert.ok(windowMessages.some((m) => m.kind === 'queue-claim'));

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

test('bridge export includes extension and game version at the beginning of the log', async () => {
  const elements = new Map();
  let createdBlobContent = null;
  class MockBlob {
    constructor(parts) {
      createdBlobContent = parts[0];
    }
  }
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
      getManifest: () => ({ version: '0.9.117' }),
      sendMessage: async (msg) => {
        if (msg.kind === 'record-export') {
          return {
            records: [{ kind: 'api', transport: 'fetch', endpoint: '/api/rpc', timestamp: '2026-11-08T12:00:00.000Z' }],
            interactions: []
          };
        }
        return {};
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
    sessionStorage: {
      getItem: (k) => k === 'hwa_game_version' ? '1.293.101' : null
    }
  };
  const mockUrl = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {}
  };

  runInNewContext(source, {
    window,
    document,
    chrome,
    Blob: MockBlob,
    URL: mockUrl,
    Date,
    location: { origin: 'https://www.hero-wars-alliance.com' }
  });

  const exportBtn = elements.get('hwa-export-btn');
  assert.ok(exportBtn);
  exportBtn.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(createdBlobContent, 'Blob content should be generated');
  const parsed = JSON.parse(createdBlobContent);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.extensionVersion, '0.9.117');
  assert.equal(parsed.gameVersion, '1.293.101');
  assert.ok(parsed.exportedAt);
  assert.equal(parsed.timeline.length, 1);
});
