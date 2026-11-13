import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateExtension } from '../scripts/validate-extension.mjs';

test('artifact validator rejects missing worker dependencies and legacy popup', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'hwa-artifact-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'chunks'));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'HWA Helper', background: { service_worker: 'background.js' },
    action: { default_popup: 'popup.html' }, content_scripts: [{ js: ['bridge.js'], css: ['page.css'] }],
  }));
  for (const file of ['bridge.js', 'page.css', 'chunks/popup.js']) await writeFile(join(dir, file), '');
  await writeFile(join(dir, 'background.js'), "importScripts('rpc-cache.js');");
  await writeFile(join(dir, 'popup.html'), '<script type="module" src="/chunks/popup.js"></script>');
  await assert.rejects(validateExtension(dir), /rpc-cache/);
  await writeFile(join(dir, 'rpc-cache.js'), '');
  assert.equal((await validateExtension(dir)).manifest_version, 3);
  await writeFile(join(dir, 'rpc-cache.js'), 'chrome.alarms.get("queue");');
  await assert.rejects(validateExtension(dir), /Missing alarms permission/);
  await writeFile(join(dir, 'rpc-cache.js'), '');
  await writeFile(join(dir, 'popup.html'), '<script src="popup.js"></script>');
  await assert.rejects(validateExtension(dir), /Legacy popup/);
});
