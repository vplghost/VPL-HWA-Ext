import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createControlPayload,
  createBridgeTimeoutManager
} from '../entrypoints/bridge.content.ts';

test('createControlPayload constructs valid control messages', () => {
  assert.equal(createControlPayload(null, true, 'direct', false), null);

  const payload = createControlPayload({ interceptEnabled: true }, true, 'piggyback', true);
  assert.deepEqual(payload, {
    source: 'hwa-helper-config',
    kind: 'control',
    interceptEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'piggyback',
    recordingActive: true,
    sanitizeTeamEnabled: true
  });

  const disabledPayload = createControlPayload({ interceptEnabled: false }, false, 'disabled', false);
  assert.equal(disabledPayload.interceptEnabled, false);
  assert.equal(disabledPayload.popupRpcEnabled, false);
});

test('createBridgeTimeoutManager tracks and cancels active timers', () => {
  const manager = createBridgeTimeoutManager();
  assert.equal(manager.timers.size, 0);

  let executed = false;
  const id = manager.bridgeTimeout(() => { executed = true; }, 100);
  assert.ok(id);
  assert.equal(manager.timers.size, 1);

  manager.clearBridgeTimeout(id);
  assert.equal(manager.timers.size, 0);

  // Invalidate stops further callbacks and clears active timers
  const id2 = manager.bridgeTimeout(() => { executed = true; }, 500);
  assert.equal(manager.timers.size, 1);
  manager.invalidate();
  assert.equal(manager.timers.size, 0);
  assert.equal(manager.isInvalidated(), true);
  assert.equal(manager.bridgeTimeout(() => {}, 100), null);
});

test('entrypoints/bridge.content.ts defines WXT defineContentScript entrypoint', async () => {
  const content = await readFile(new URL('../entrypoints/bridge.content.ts', import.meta.url), 'utf8');
  assert.ok(content.includes('defineContentScript('), 'Must use WXT defineContentScript entrypoint');
  assert.ok(content.includes('https://www.hero-wars-alliance.com/*'), 'Must match game domain');
  assert.ok(content.includes('document_start'), 'Must run at document_start');
});
