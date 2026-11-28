import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createControlPanelServer } from '../HWA-ControlPanel/src/app.mjs';

test('CP-03: HWA Control Panel serves mobile Tailwind WebView with QR pre-fill, on-demand Refresh, task-only WS, and 2-step Emergency Recall', async () => {
  const html = await readFile(resolve('HWA-ControlPanel/public/index.html'), 'utf8');
  const js = await readFile(resolve('HWA-ControlPanel/public/app.js'), 'utf8');

  assert.match(html, /HWA Control Panel/);
  assert.match(html, /max-w-md/);
  assert.match(html, /id="cp-login-view"/);
  assert.match(html, /id="cp-guid-input"/);
  assert.match(html, /id="cp-otp-input"/);
  assert.match(html, /id="cp-refresh-btn"/);
  assert.match(html, /id="cp-monitor-cards"/);
  assert.match(html, /id="cp-emergency-actions"/);
  assert.match(html, /id="cp-btn-recall-all"/);
  assert.match(html, /id="cp-task-status"/);

  // Pre-fills GUID from QR query string
  assert.match(js, /params\.get\('guid'\)/);
  // Checks persistent 1-year cookie session on load
  assert.match(js, /fetch\('\/api\/web\/session'/);
  // Task-only WebSocket (opens inside waitForCommandCompletion and closes on settle)
  assert.match(js, /function waitForCommandCompletion/);
  assert.match(js, /ws\.close\(1000/);
  // 2-step emergency recall confirmation
  assert.match(js, /recallConfirmUntil/);

  // Verify Express serves / and /app.js
  const server = createControlPanelServer({ dataDir: ':memory:' });
  const addr = await server.start(0, '127.0.0.1');
  try {
    const resHtml = await fetch(`http://127.0.0.1:${addr.port}/`);
    assert.equal(resHtml.status, 200);
    assert.match(await resHtml.text(), /HWA Control Panel/);
    const resJs = await fetch(`http://127.0.0.1:${addr.port}/app.js`);
    assert.equal(resJs.status, 200);
    assert.match(await resJs.text(), /waitForCommandCompletion/);
  } finally {
    await server.close();
  }
});
