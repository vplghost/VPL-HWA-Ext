import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA_CONFIG_KEYS,
  extractGameDataConfigSubset,
  compileHeroRemoteMetadata,
  mergeNamesAdditiveSafe,
  mergeHeroMetadataAdditiveSafe,
  detectGameDataDrift,
  applyGameDataOverlay,
} from '../src/services/gameDataSync.ts';
import { getHeroName, setGameNameOverlay } from '../src/data/nameData.ts';
import { getHeroMetadata, setHeroMetadataOverlay } from '../src/data/heroMetadata.ts';

test('compileHeroRemoteMetadata maps hero, faction, role, class, and localization accurately', () => {
  const compiled = compileHeroRemoteMetadata({
    rawHero: [
      { id: 901, roleId: 1, classId: 2 },
      { id: 902, nameKey: 'HERO_902_CUSTOM', role: 'Back', class: 'Mage' },
    ],
    rawFaction: [{ id: 10, name: 'Way of Honor' }],
    rawFactionByHero: [{ heroId: 901, factionId: 10 }],
    rawRole: [{ id: 1, name: 'Front' }],
    rawClass: [{ id: 2, name: 'Tank' }],
    rawLocalization: {
      LIB_HERO_NAME_901: 'Sentinel Knight',
      HERO_902_CUSTOM: 'Astral Sage',
    },
  });

  assert.equal(compiled.heroNames['901'], 'Sentinel Knight');
  assert.equal(compiled.heroNames['902'], 'Astral Sage');
  assert.equal(compiled.heroMetadata['901'].role, 'Front');
  assert.equal(compiled.heroMetadata['901'].class, 'Tank');
  assert.equal(compiled.heroMetadata['901'].faction, 'Way of Honor');
});

test('mergeNamesAdditiveSafe and mergeHeroMetadataAdditiveSafe preserve 100% of existing custom overrides & curated fields', () => {
  const { merged: mergedNames, addedIds: addedNames } = mergeNamesAdditiveSafe(
    { '1': 'Aurora', '163': 'Garrison Wall' },
    { '1': 'Aurora Overwritten', '163': 'Wall', '901': 'Sentinel Knight' }
  );
  assert.equal(mergedNames['1'], 'Aurora', 'Existing hero name must not be overwritten');
  assert.equal(mergedNames['163'], 'Garrison Wall', 'Existing custom override must not be overwritten');
  assert.equal(mergedNames['901'], 'Sentinel Knight', 'New ID must be added');
  assert.deepEqual(addedNames, ['901']);

  const existingMeta = {
    '1': {
      name: 'Aurora',
      role: 'Front',
      class: 'Tank',
      faction: 'Way of Nature',
      hasAvatar: true,
      avatarFile: 'assets/heroes/1.png',
      skills: ['Crystal of Selias'],
    },
    '99': {
      name: 'Mystery Hero',
      role: 'Unknown',
      class: 'Unknown',
      faction: 'Unknown',
      hasAvatar: false,
    },
  };
  const { merged, addedIds, enrichedIds } = mergeHeroMetadataAdditiveSafe(existingMeta, {
    '1': { name: 'Wrong Name', role: 'Back', class: 'Mage', faction: 'Way of Chaos' },
    '99': { name: 'Mystery Hero', role: 'Middle', class: 'Support', faction: 'Way of Mystery' },
    '901': { name: 'Sentinel Knight', role: 'Front', class: 'Tank', faction: 'Way of Honor' },
  });

  assert.equal(merged['1'].name, 'Aurora');
  assert.equal(merged['1'].role, 'Front');
  assert.deepEqual(merged['1'].skills, ['Crystal of Selias']);
  assert.equal(merged['99'].role, 'Middle', 'Unknown role should be enriched');
  assert.equal(merged['99'].faction, 'Way of Mystery');
  assert.equal(merged['901'].name, 'Sentinel Knight');
  assert.deepEqual(addedIds, ['901']);
  assert.deepEqual(enrichedIds, ['99']);
});

test('detectGameDataDrift detects MD5 drift and unknown hero/titan/building/research IDs + runtime overlay resolves new heroes', () => {
  assert.ok(GAME_DATA_CONFIG_KEYS.includes('hero'));
  assert.ok(GAME_DATA_CONFIG_KEYS.includes('buildingLevel'));

  const subset = extractGameDataConfigSubset({
    hero: { url: 'https://cdn.example/config/hero/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json' },
    buildingLevel: { url: 'https://cdn.example/config/buildingLevel/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json' },
  });
  const drift = detectGameDataDrift({
    remoteConfigIndex: subset,
    manifest: {
      updatedAt: '2026-11-24T00:00:00.000Z',
      configs: {
        hero: { url: 'https://cdn.example/config/hero/11111111111111111111111111111111.json', md5: '11111111111111111111111111111111' },
      },
    },
    liveHeroIds: [1, 9999],
    liveTitanIds: [4001, 4999],
    knownHeroIds: new Set([1]),
    knownTitanIds: new Set([4001]),
  });

  assert.equal(drift.hasDrift, true);
  assert.ok(drift.changedConfigs.includes('hero'));
  assert.deepEqual(drift.unknownHeroIds, [9999]);
  assert.deepEqual(drift.unknownTitanIds, [4999]);

  // Verify runtime overlay resolves hotfixed hero without mutating static entries
  applyGameDataOverlay({
    updatedAt: new Date().toISOString(),
    manifest: { updatedAt: new Date().toISOString(), configs: {} },
    names: { hero: { '9999': 'Hotfix Hero' } },
    heroMetadata: { '9999': { name: 'Hotfix Hero', role: 'Front', class: 'Tank', faction: 'Way of Honor' } },
  });
  assert.equal(getHeroName(9999), 'Hotfix Hero');
  assert.equal(getHeroMetadata(9999)?.faction, 'Way of Honor');
  assert.equal(getHeroName(1), 'Aurora');

  // Cleanup overlay
  setGameNameOverlay(null);
  setHeroMetadataOverlay(null);
});
