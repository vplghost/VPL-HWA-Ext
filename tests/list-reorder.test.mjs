import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { moveItemToFirst, moveItemToIndex, computeQueueMoveTarget } from '../src/utils/listReorder.ts';

const root = resolve(process.cwd());

test('moveItemToFirst moves target element to index 0 immutably and handles edge bounds safely', () => {
  const input = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItemToFirst(input, 2), ['c', 'a', 'b', 'd']);
  assert.deepEqual(input, ['a', 'b', 'c', 'd'], 'Must not mutate original array');
  assert.deepEqual(moveItemToFirst(input, 3), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItemToFirst(input, 0), ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveItemToFirst(input, -1), ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveItemToFirst(input, 99), ['a', 'b', 'c', 'd']);
});

test('moveItemToIndex reorders elements immutably for drag-and-drop and handles invalid bounds', () => {
  const input = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItemToIndex(input, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveItemToIndex(input, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(input, ['a', 'b', 'c', 'd'], 'Must not mutate original array');
  assert.deepEqual(moveItemToIndex(input, 1, 1), ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveItemToIndex(input, -1, 2), ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveItemToIndex(input, 1, 99), ['a', 'b', 'c', 'd']);
});

test('computeQueueMoveTarget supports up, down, and first directions accurately', () => {
  assert.equal(computeQueueMoveTarget(3, 5, 'first'), 0);
  assert.equal(computeQueueMoveTarget(0, 5, 'first'), 0);
  assert.equal(computeQueueMoveTarget(3, 5, 'up'), 2);
  assert.equal(computeQueueMoveTarget(0, 5, 'up'), 0);
  assert.equal(computeQueueMoveTarget(3, 5, 'down'), 4);
  assert.equal(computeQueueMoveTarget(4, 4, 'down'), 4);
});

test('Reorderable Vue lists expose Move to first buttons, SettingsTab uses draggable pills, and backgroundRuntime supports direction=first', async () => {
  const checks = [
    ['src/components/dialogs/BuildingModal.vue', 'building-queue-move-first-'],
    ['src/components/dialogs/ResearchModal.vue', 'research-queue-move-first-'],
    ['src/components/dialogs/DungeonModal.vue', 'dungeon-pool-move-first-'],
    ['src/components/dialogs/TowerModal.vue', 'tower-buff-move-first-'],
  ];

  for (const [relPath, idPrefix] of checks) {
    const src = await readFile(resolve(root, relPath), 'utf8');
    assert.ok(src.includes(idPrefix), `${relPath} must render #${idPrefix}* button`);
    assert.ok(src.includes('title="Move to first"'), `${relPath} must have English Move to first tooltip`);
  }

  const settingsSrc = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.ok(settingsSrc.includes('id="settings-tab-pills"'), 'SettingsTab must render #settings-tab-pills container');
  assert.ok(settingsSrc.includes('draggable="true"'), 'SettingsTab tab pills must support drag-and-drop');
  assert.ok(settingsSrc.includes('moveItemToIndex'), 'SettingsTab must use moveItemToIndex for drag reordering');
  assert.ok(settingsSrc.includes('items-stretch'), 'SettingsTab 2-column rows must use items-stretch for balanced heights');

  const bgSrc = await readFile(resolve(root, 'src/background/backgroundRuntime.ts'), 'utf8');
  assert.ok(bgSrc.includes('computeQueueMoveTarget'), 'backgroundRuntime must use computeQueueMoveTarget for queue move actions');
});
