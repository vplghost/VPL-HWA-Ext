import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
for (const file of ['data-names.js', 'name-map.js']) {
  runInNewContext(await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'), context);
}

test('verified locale maps hero, titan, and item categories', () => {
  const { hero, item } = context.hwaHelperNameMap;
  assert.equal(hero(1), 'Aurora');
  assert.equal(hero(4000), 'Sigurd');
  assert.equal(item('fragmentTitan', 4000), 'Mảnh Sigurd');
  assert.equal(item('fragmentHero', 1), 'Mảnh Aurora');
  assert.equal(item('fragmentArtifact', 1001), "Mảnh Selias' Legacy");
});

test('missing and unresolved locale entries retain the popup fallback', () => {
  const { hero, item } = context.hwaHelperNameMap;
  assert.equal(hero(5041), null);
  assert.equal(hero(999999), null);
  assert.equal(item('border', 1), null);
  assert.equal(item('gear', 999999), null);
});
