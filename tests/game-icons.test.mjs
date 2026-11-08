import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const iconDir = new URL('../extension/assets/icons', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

test('game-icons inventory exists and contains only used icons with metadata', async () => {
  const invPath = join(iconDir, 'inventory.json');
  const invContent = await readFile(invPath, 'utf8');
  const inventory = JSON.parse(invContent);

  assert.equal(inventory.meta.source, 'https://game-icons.net');
  assert.ok(inventory.meta.license.includes('CC BY 3.0'));
  assert.ok(Array.isArray(inventory.meta.authors));

  // Must include justice-star
  assert.ok(inventory.icons['justice-star'], 'justice-star must be in inventory');
  assert.equal(inventory.icons['justice-star'].author, 'Lorc');
  assert.equal(inventory.icons['justice-star'].url, 'https://game-icons.net/1x1/lorc/justice-star.html');

  // Verify all entries in inventory have valid files and usage
  for (const [key, icon] of Object.entries(inventory.icons)) {
    assert.ok(icon.filename.endsWith('.svg'), `${key} filename must end in .svg`);
    assert.ok(icon.author, `${key} must have author attribution`);
    assert.ok(icon.url.startsWith('https://game-icons.net/'), `${key} url must reference game-icons.net`);
    assert.ok(icon.usage, `${key} must specify its usage in the extension`);

    const filePath = join(iconDir, icon.filename);
    const fileStat = await stat(filePath);
    assert.ok(fileStat.isFile() && fileStat.size > 0, `${icon.filename} must exist and be non-empty`);

    const svgContent = await readFile(filePath, 'utf8');
    assert.ok(svgContent.includes('<svg'), `${icon.filename} must contain <svg>`);
    assert.ok(svgContent.includes('viewBox="0 0 512 512"'), `${icon.filename} must have 512x512 viewBox`);
    assert.ok(svgContent.includes('fill="currentColor"'), `${icon.filename} must use fill="currentColor"`);
  }
});

test('justice-star SVG matches Lorc justice-star vector path', async () => {
  const svgPath = join(iconDir, 'justice-star.svg');
  const content = await readFile(svgPath, 'utf8');
  assert.ok(content.includes('m256.438 25.78'), 'Should match justice-star path start');
  assert.ok(content.includes('fill="currentColor"'), 'Should be currentColor');
});
