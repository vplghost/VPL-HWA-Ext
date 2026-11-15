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

test('entrypoints/background.ts defines WXT defineBackground and registers typed services', async () => {
  const content = await readFile(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  assert.ok(content.includes('defineBackground('), 'Must use WXT defineBackground entrypoint');
  assert.ok(content.includes('hwaHelperRpcCache'), 'Must register typed RPC cache fallback');
  assert.ok(content.includes('hwaHelperBuildingQueue'), 'Must register typed Building Queue fallback');
  assert.ok(content.includes('hwaHelperResearchQueue'), 'Must register typed Research Queue fallback');
  assert.ok(content.includes('hwaHelperRaidQueue'), 'Must register typed Raid Queue fallback');
  assert.ok(content.includes('hwaHelperAutoGather'), 'Must register typed Auto Gather fallback');
  assert.ok(content.includes('hwaHelperSmartGather'), 'Must register typed Smart Gather fallback');
  assert.ok(content.includes('hwaHelperTowerAutomation'), 'Must register typed Tower Automation fallback');
  assert.ok(content.includes('hwaHelperDungeonAutomation'), 'Must register typed Dungeon Automation fallback');
  assert.ok(content.includes('recordingState'), 'Must support recordingState');
});
