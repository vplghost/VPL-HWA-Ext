import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const artifactDir = join(root, 'extension/assets/items/artifact');
const fragmentDir = join(root, 'extension/assets/items/fragmentArtifact');

test('artifact and fragmentArtifact assets exist and contain all 143 items', async () => {
  const artifactFiles = (await readdir(artifactDir)).filter(f => f.endsWith('.png'));
  const fragmentFiles = (await readdir(fragmentDir)).filter(f => f.endsWith('.png'));

  assert.equal(artifactFiles.length, 143, 'Should have exactly 143 artifact icons');
  assert.equal(fragmentFiles.length, 143, 'Should have exactly 143 fragment artifact icons');

  // Verify sample artifacts across types: weapon, book, ring, titanWeapon, titanCrown, titanSeal
  const sampleIds = ['1001', '1002', '2001', '3001', '11001', '12001', '13001'];
  for (const id of sampleIds) {
    const artPath = join(artifactDir, `${id}.png`);
    const fragPath = join(fragmentDir, `${id}.png`);

    const artStat = await stat(artPath);
    const fragStat = await stat(fragPath);

    assert.ok(artStat.size > 0, `Artifact ${id}.png should not be empty`);
    assert.ok(fragStat.size > 0, `Fragment ${id}.png should not be empty`);

    const artBuf = await readFile(artPath);
    const fragBuf = await readFile(fragPath);

    // PNG signature: 89 50 4e 47 0d 0a 1a 0a
    assert.equal(artBuf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Artifact ${id} must be valid PNG`);
    assert.equal(fragBuf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Fragment ${id} must be valid PNG`);
  }
});

test('renderItemsTab maps fragmentArtifact and artifact to asset image paths', async () => {
  const popupSrc = await readFile(join(root, 'extension/popup.js'), 'utf8');

  // Verify popup.js handles fragmentArtifact and artifact
  assert.ok(popupSrc.includes("item.category === 'fragmentArtifact'"), 'popup.js should handle fragmentArtifact image path');
  assert.ok(popupSrc.includes("assets/items/fragmentArtifact/${item.id}.png"), 'popup.js should point to fragmentArtifact asset path');
  assert.ok(popupSrc.includes("assets/items/artifact/${item.id}.png"), 'popup.js should point to artifact asset path');
});
