import test from 'node:test';
import assert from 'node:assert/strict';

import {
  heroMetadata,
  heroGlyphs,
  skinStats,
  gearCraftData,
  scrollCraftData,
  getHeroMetadata,
  getHeroName,
  getHeroRole,
  getHeroClass,
  getHeroFaction,
  getHeroAvatar,
  getHeroGlyphs,
  getSkinStat,
  getHeroEquipment,
} from '../src/data/heroMetadata.ts';

import {
  titanMetadata,
  titanArtifactEvolveCost,
  titanArtifactLevelCosts,
  getTitanMetadata,
  getTitanName,
  getTitanRole,
  getTitanElement,
  getTitanAvatar,
  getTitanArtifactEvolveCost,
  getTitanArtifactLevelCost,
} from '../src/data/titanMetadata.ts';

import { resolveHeroName } from '../src/utils/marchTooltip.ts';

test('heroMetadata exports complete typed data and helpers with 100% parity', () => {
  assert.equal(Object.keys(heroMetadata).length, 83, 'Should contain 83 heroes');
  assert.equal(Object.keys(heroGlyphs).length, 117, 'Should contain 117 hero glyph definitions');
  assert.equal(Object.keys(skinStats).length, 553, 'Should contain 553 skin stat definitions');
  assert.ok(Object.keys(gearCraftData).length > 0, 'Should contain gear craft recipes');
  assert.ok(Object.keys(scrollCraftData).length > 0, 'Should contain scroll craft recipes');

  // Aurora (Hero ID 1)
  const aurora = getHeroMetadata(1);
  assert.ok(aurora);
  assert.equal(aurora.name, 'Aurora');
  assert.equal(aurora.role, 'Front');
  assert.equal(aurora.class, 'Tank');
  assert.equal(aurora.faction, 'Way of Nature');
  assert.equal(aurora.hasAvatar, true);
  assert.equal(aurora.avatarFile, 'assets/heroes/1.png');

  // Helper pure getters
  assert.equal(getHeroName(1), 'Aurora');
  assert.equal(getHeroRole(1), 'Front');
  assert.equal(getHeroClass(1), 'Tank');
  assert.equal(getHeroFaction(1), 'Way of Nature');
  assert.equal(getHeroAvatar(1), 'assets/heroes/1.png');
  assert.deepEqual(getHeroGlyphs(1), ['MA', 'HP', 'MP', 'Ddg', 'Str']);
  assert.equal(getSkinStat(58), 'Ddg');

  // Hero Equipment
  const auroraEquipColor1 = getHeroEquipment(1, 1);
  assert.deepEqual(auroraEquipColor1, [1, 7, 6, 2, 13, 4]);

  // Fallbacks
  assert.equal(getHeroName(99999), 'Hero #99999');
  assert.equal(getHeroRole(99999), 'Unknown');
  assert.deepEqual(getHeroGlyphs(99999), ['PA', 'Arm', 'HP', 'MD', 'Str']);
  assert.equal(getSkinStat(99999), null);

  // Typed data objects
  assert.ok(heroMetadata);
  assert.equal(heroMetadata['1'].name, 'Aurora');
  assert.ok(heroGlyphs);
  assert.ok(skinStats);
  assert.ok(gearCraftData);
  assert.ok(scrollCraftData);
});

test('titanMetadata exports complete typed data and helpers with 100% parity', () => {
  assert.equal(Object.keys(titanMetadata).length, 30, 'Should contain 30 titans');
  assert.equal(Object.keys(titanArtifactEvolveCost).length, 6, 'Should contain 6 evolve cost tiers');
  assert.equal(titanArtifactLevelCosts.length, 121, 'Should contain 121 level cost tiers');

  // Sigurd (Titan ID 4000)
  const sigurd = getTitanMetadata(4000);
  assert.ok(sigurd);
  assert.equal(sigurd.name, 'Sigurd');
  assert.equal(sigurd.role, 'Tank');
  assert.equal(sigurd.element, 'Water');
  assert.equal(sigurd.hasAvatar, true);
  assert.equal(sigurd.avatarFile, 'assets/titans/4000.png');

  // Helper pure getters
  assert.equal(getTitanName(4000), 'Sigurd');
  assert.equal(getTitanRole(4000), 'Tank');
  assert.equal(getTitanElement(4000), 'Water');
  assert.equal(getTitanAvatar(4000), 'assets/titans/4000.png');
  assert.equal(getTitanArtifactEvolveCost(1), 15);
  assert.equal(getTitanArtifactEvolveCost(6), 15000);
  assert.deepEqual(getTitanArtifactLevelCost(2), [25, 20000]);

  // Fallbacks
  assert.equal(getTitanName(99999), 'Titan #99999');
  assert.equal(getTitanRole(99999), 'Unknown');
  assert.equal(getTitanElement(99999), 'Unknown');
  assert.equal(getTitanArtifactEvolveCost(99), 0);
  assert.equal(getTitanArtifactLevelCost(999), null);

  // Typed data objects
  assert.ok(titanMetadata);
  assert.equal(titanMetadata['4000'].name, 'Sigurd');
  assert.ok(titanArtifactEvolveCost);
  assert.ok(titanArtifactLevelCosts);
});

test('marchTooltip resolveHeroName resolves correctly using typed data', () => {
  assert.equal(resolveHeroName(1), 'Aurora');
  assert.equal(resolveHeroName(99999), 'Hero #99999');
});
