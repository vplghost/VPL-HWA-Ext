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
  onChanged({ captureSettings: { newValue: { interceptEnabled: true } } }, 'local');
  assert.equal(messages.at(-1).interceptEnabled, true);
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
  assert.equal(sentMessages[0]?.kind, 'open-tab');
});
