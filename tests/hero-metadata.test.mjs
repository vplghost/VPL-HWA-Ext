import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(await readFile(new URL('../extension/hero-metadata.js', import.meta.url), 'utf8'), context);
const metadata = context.hwaHelperHeroMetadata;

test('hero metadata includes all playable heroes with role, class, and faction', () => {
  assert.ok(metadata);
  assert.ok(Object.keys(metadata).length >= 80);

  const allowedRoles = new Set(['Front', 'Middle', 'Back']);
  const allowedClasses = new Set(['Tank', 'Warrior', 'Marksman', 'Mage', 'Healer', 'Support', 'Control']);
  const allowedFactions = new Set([
    'Way of Eternity',
    'Way of Nature',
    'Way of Honor',
    'Way of Chaos',
    'Way of Progress',
    'Way of Mystery'
  ]);

  for (const [id, hero] of Object.entries(metadata)) {
    assert.ok(hero.name, `Hero ${id} should have a name`);
    assert.ok(allowedRoles.has(hero.role), `Hero ${id} role ${hero.role} should be valid`);
    assert.ok(allowedClasses.has(hero.class), `Hero ${id} class ${hero.class} should be valid`);
    assert.ok(allowedFactions.has(hero.faction), `Hero ${id} faction ${hero.faction} should be valid`);
    assert.equal(typeof hero.hasAvatar, 'boolean');
  }
});

test('aurora, galahad, keira, and astaroth have verified metadata and avatars', async () => {
  const aurora = metadata['1'];
  assert.equal(aurora.name, 'Aurora');
  assert.equal(aurora.role, 'Front');
  assert.equal(aurora.class, 'Tank');
  assert.equal(aurora.faction, 'Way of Nature');
  assert.equal(aurora.hasAvatar, true);

  const galahad = metadata['2'];
  assert.equal(galahad.name, 'Galahad');
  assert.equal(galahad.role, 'Front');
  assert.equal(galahad.class, 'Warrior');
  assert.equal(galahad.faction, 'Way of Honor');

  const keira = metadata['3'];
  assert.equal(keira.name, 'Keira');
  assert.equal(keira.role, 'Middle');
  assert.equal(keira.class, 'Marksman');
  assert.equal(keira.faction, 'Way of Eternity');

  const astaroth = metadata['4'];
  assert.equal(astaroth.name, 'Astaroth');
  assert.equal(astaroth.role, 'Front');
  assert.equal(astaroth.class, 'Tank');
  assert.equal(astaroth.faction, 'Way of Chaos');
});

test('all heroes flagged with hasAvatar have a non-empty image file on disk', async () => {
  let verifiedCount = 0;
  for (const [id, hero] of Object.entries(metadata)) {
    if (hero.hasAvatar) {
      assert.ok(hero.avatarFile, `Hero ${id} should have avatarFile`);
      const imgPath = new URL(`../extension/${hero.avatarFile}`, import.meta.url);
      const fileStat = await stat(imgPath);
      assert.ok(fileStat.size > 500, `Avatar for hero ${id} should be at least 500 bytes`);
      verifiedCount++;
    }
  }
  assert.equal(verifiedCount, 82);
  assert.equal(metadata['78'].hasAvatar, false, 'Hero 78 (Wodryn) has no standalone avatar');
  assert.equal(metadata['65'].hasAvatar, true, 'Hero 65 (Tempus) has converted PNG avatar');
  assert.equal(metadata['65'].avatarFile, 'assets/heroes/65.png');
});
