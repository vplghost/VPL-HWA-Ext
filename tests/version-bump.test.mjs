import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('version bump synchronizes package, lock, and manifest and rejects a downgrade', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hwa-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'extension'));
  await copyFile(new URL('../scripts/bump-version.mjs', import.meta.url), join(root, 'scripts', 'bump-version.mjs'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'hwa-helper', version: '0.9.33' }));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ version: '0.9.33', packages: { '': { version: '0.9.33' } } }));
  await writeFile(join(root, 'extension', 'manifest.json'), JSON.stringify({ version: '0.9.33' }));

  const { bumpVersion } = await import(pathToFileURL(join(root, 'scripts', 'bump-version.mjs')).href);
  assert.equal(await bumpVersion(), '0.9.34');
  for (const path of ['package.json', 'package-lock.json', 'extension/manifest.json']) {
    assert.equal(JSON.parse(await readFile(join(root, path), 'utf8')).version, '0.9.34');
  }
  assert.equal(JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages[''].version, '0.9.34');
  await assert.rejects(bumpVersion('0.9.34'), /greater than/);
  await assert.rejects(bumpVersion('0.9.32'), /greater than/);
  assert.equal(await bumpVersion('minor'), '0.10.0');
  assert.equal(await bumpVersion('major'), '1.0.0');
});
