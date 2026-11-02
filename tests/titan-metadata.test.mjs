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

test('titan metadata includes 3 artifact IDs, evolution costs, and level costs', () => {
  const sigurd = metadata['4000'];
  assert.deepEqual([...sigurd.artifacts], [11001, 12003, 13003]);

  const araji = metadata['4013'];
  assert.deepEqual([...araji.artifacts], [11008, 12001, 13001]);

  const evolveCost = context.hwaHelperTitanArtifactEvolveCost;
  assert.ok(evolveCost);
  assert.equal(evolveCost[1], 15);
  assert.equal(evolveCost[2], 300);
  assert.equal(evolveCost[3], 900);
  assert.equal(evolveCost[4], 1500);
  assert.equal(evolveCost[5], 4500);
  assert.equal(evolveCost[6], 15000);

  const levelCosts = context.hwaHelperTitanArtifactLevelCosts;
  assert.ok(Array.isArray(levelCosts));
  assert.equal(levelCosts.length, 121);
  assert.deepEqual([...levelCosts[2]], [25, 20000]);
  assert.deepEqual([...levelCosts[20]], [120, 53900]);
  assert.deepEqual([...levelCosts[120]], [11000, 10000000]);
});
