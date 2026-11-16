import test from 'node:test';
import assert from 'node:assert/strict';
import { nameMap } from '../src/data/nameData.ts';

test('verified locale maps hero, titan, and item categories', () => {
  const { hero, item } = nameMap;
  assert.equal(hero(1), 'Aurora');
  assert.equal(hero(4000), 'Sigurd');
  assert.equal(item('fragmentTitan', 4000), 'Sigurd fragment');
  assert.equal(item('fragmentHero', 1), 'Aurora fragment');
  assert.equal(item('fragmentArtifact', 1001), "Selias' Legacy fragment");
  assert.equal(hero(5016), 'Golem');
  assert.equal(item('consumable', 2001), "Captain's Coin");
  assert.equal(item('coin', 40094), 'Ancient Coin');
});

test('missing and unresolved locale entries retain the popup fallback', () => {
  const { hero, item } = nameMap;
  assert.equal(hero(5041), null);
  assert.equal(hero(999999), null);
  assert.equal(item('border', 999999), null);
  assert.equal(item('gear', 999999), null);
});
