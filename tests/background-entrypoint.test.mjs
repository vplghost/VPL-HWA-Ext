import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isGameUrl, RECORD_STATE_KEY } from '../entrypoints/background.ts';

test('isGameUrl correctly validates game origins and subpaths', () => {
  assert.equal(isGameUrl('https://www.hero-wars-alliance.com/'), true);
  assert.equal(isGameUrl('https://www.hero-wars-alliance.com/game'), true);
  assert.equal(isGameUrl('https://hero-wars-alliance.com/'), true);
  assert.equal(isGameUrl('https://hero-wars-alliance.com/play'), true);
  assert.equal(isGameUrl('https://other-site.com/'), false);
  assert.equal(isGameUrl(null), false);
  assert.equal(isGameUrl(undefined), false);
  assert.equal(isGameUrl(''), false);
});

test('entrypoints/background.ts defines WXT defineBackground and runs background orchestrator', async () => {
  const content = await readFile(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  assert.ok(content.includes('defineBackground('), 'Must use WXT defineBackground entrypoint');
  assert.ok(content.includes('setupBackgroundRuntime()'), 'Must run setupBackgroundRuntime orchestrator');
  assert.ok(content.includes('recordingState'), 'Must support recordingState');
  assert.equal(content.includes('(globalThis as any).hwaHelper'), false, 'Must not rely on globalThis.hwaHelper registrations');
});
