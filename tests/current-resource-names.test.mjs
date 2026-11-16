import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractStrategicResourceNames } from '../scripts/lib/strategic-resource-names.mjs';
import { resourceLabel } from '../src/utils/resourceData.ts';
import { itemResources } from '../src/data/itemData.ts';
import { getItemName } from '../src/utils/metadata.ts';
import { nameMap, nameData } from '../src/data/nameData.ts';

test('generation refuses a stale default or mismatched cached bytes before replacing bundled data', async () => {
  const script = fileURLToPath(new URL('../scripts/generate-name-map.mjs', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixtures/current-name-index.json', import.meta.url));
  const before = await readFile(new URL('../src/data/nameData.ts', import.meta.url));
  const noCapture = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.notEqual(noCapture.status, 0);
  assert.match(noCapture.stderr, /current game export/);
  const badCache = spawnSync(process.execPath, [script, fixture, fixture], { encoding: 'utf8' });
  assert.notEqual(badCache.status, 0);
  assert.match(badCache.stderr, /does not match indexGet size\/hash/);
  assert.deepEqual(await readFile(new URL('../src/data/nameData.ts', import.meta.url)), before);
});

test('strategic name extraction uses exact category/ID keys and rejects unresolved keys', () => {
  const result = extractStrategicResourceNames({
    STRATEGIC_LOOTBOX_CHANCED_27_NAME: ' Tomes Casket ',
    STRATEGIC_LOOTBOX_CHANCED_27_DESC: 'Not a name',
    STRATEGIC_LOOTBOX_CHOICED_2_NAME: 'Materials Chest Lv.1',
    STRATEGIC_RESOURCE_9_NAME: 'Blueprints',
    STRATEGIC_SPEED_UP_RESEARCH_3_NAME: '1h Research Speedup',
    STRATEGIC_TELEPORTER_1_NAME: 'Advanced Teleport',
    STRATEGIC_LOOTBOX_CHANCED_999_NAME: 'STRATEGIC_LOOTBOX_CHANCED_999_NAME',
    STRATEGIC_RESOURCE_999_NAME: null,
    STRATEGIC_RESOURCE_998_NAME: ' ',
    STRATEGIC_RESOURCE_X_NAME: 'Invalid ID',
  });
  assert.deepEqual(result.lootboxChanced, { 27: 'Tomes Casket' });
  assert.equal(result.lootboxChoiced[2], 'Materials Chest Lv.1');
  assert.deepEqual(result.material, { 9: 'Blueprints' });
  assert.equal(result.speedUpResearch[3], '1h Research Speedup');
  assert.equal(result.teleporter[1], 'Advanced Teleport');
});

test('bundled names identify client1.293.1010 and the verified current locale revision', () => {
  const data = nameData;
  assert.equal(data.clientVersion, '1.293.1010');
  assert.equal(data.assetMd5, 'f640f200f4d58044949d6f982978ff47');
  assert.equal(data.assetSize, 683621);
  assert.match(data.assetUrl, /\/1\.293\.0\/v0065\//);
  for (const [category, count] of Object.entries({ lootboxChanced: 30, lootboxChoiced: 3,
    material: 10, speedUpConstruction: 5, speedUpResearch: 5, speedUpUniversal: 5,
    speedUpUnitTraining: 5, speedUpUnitHealing: 5, teleporter: 2, talisman: 163 })) {
    assert.equal(Object.keys(data.names[category]).length, count, category);
  }
});

test('Items and Resources resolve the same current names instead of cached type#ID placeholders', () => {
  for (const [category, id, expected] of [
    ['lootboxChanced', 27, 'Tomes Casket'], ['lootboxChoiced', 2, 'Materials Chest Lv.1'],
    ['material', 9, 'Blueprints'], ['speedUpConstruction', 3, '1h Construction Speedup'],
    ['speedUpResearch', 3, '1h Research Speedup'], ['speedUpUniversal', 3, '1h General Speedup'],
    ['speedUpUnitTraining', 3, '1h Training Speedup'], ['speedUpUnitHealing', 3, '1h Healing Speedup'],
    ['teleporter', 1, 'Advanced Teleport'], ['talisman', 1, 'Talisman of Research'],
  ]) {
    assert.equal(nameMap.item(category, id), expected);
    assert.equal(getItemName(category, id), expected);
    assert.equal(resourceLabel({ key: `resource:${category}:${id}`, data: { label: `${category} #${id}` } }), expected);
  }
});

test('unknown or untranslated IDs retain fallbacks and fragment aliases keep their semantics', () => {
  assert.equal(nameMap.item('lootboxChanced', 1), null);
  assert.equal(nameMap.item('lootboxChanced', 999999), null);
  assert.equal(getItemName('lootboxChanced', 999999), 'lootboxChanced #999999');
  assert.equal(nameMap.item('fragmentHero', 1), 'Aurora fragment');
  assert.equal(getItemName('fragmentGear', 1), nameData.names.gear[1] + ' Fragment');
});
