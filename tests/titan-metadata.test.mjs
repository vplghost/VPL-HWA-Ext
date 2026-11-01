import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(await readFile(new URL('../extension/titan-metadata.js', import.meta.url), 'utf8'), context);
const metadata = context.hwaHelperTitanMetadata;

test('titan metadata includes all 29 playable titans with role, element, and avatar', () => {
  assert.ok(metadata);
  assert.equal(Object.keys(metadata).length, 29);

  const allowedRoles = new Set(['Tank', 'Marksman', 'Support', 'Supertitan', 'Summoner']);
  const allowedElements = new Set(['Water', 'Fire', 'Earth', 'Darkness', 'Light', 'Spirit']);

  for (const [id, titan] of Object.entries(metadata)) {
    assert.ok(titan.name, `Titan ${id} should have a name`);
    assert.ok(allowedRoles.has(titan.role), `Titan ${id} role ${titan.role} should be valid`);
    assert.ok(allowedElements.has(titan.element), `Titan ${id} element ${titan.element} should be valid`);
    assert.equal(titan.hasAvatar, true);
    assert.ok(titan.avatarFile);
  }
});

test('all 29 titan avatar PNGs exist on disk and are non-empty', async () => {
  for (const [id, titan] of Object.entries(metadata)) {
    const imgUrl = new URL(`../extension/${titan.avatarFile}`, import.meta.url);
    const fileStat = await stat(imgUrl);
    assert.ok(fileStat.size > 500, `Avatar for titan ${id} should be at least 500 bytes`);
  }
});

test('sigurd, hyperion, araji, and eden have verified metadata', () => {
  const sigurd = metadata['4000'];
  assert.equal(sigurd.name, 'Sigurd');
  assert.equal(sigurd.role, 'Tank');
  assert.equal(sigurd.element, 'Water');

  const hyperion = metadata['4003'];
  assert.equal(hyperion.name, 'Hyperion');
  assert.equal(hyperion.role, 'Supertitan');
  assert.equal(hyperion.element, 'Water');

  const araji = metadata['4013'];
  assert.equal(araji.name, 'Araji');
  assert.equal(araji.role, 'Supertitan');
  assert.equal(araji.element, 'Fire');

  const eden = metadata['4023'];
  assert.equal(eden.name, 'Eden');
  assert.equal(eden.role, 'Supertitan');
  assert.equal(eden.element, 'Earth');
});
