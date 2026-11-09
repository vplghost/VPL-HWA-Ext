import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const coinDir = join(root, 'extension/assets/items/coin');

test('coin assets exist and contain valid PNG files', async () => {
  const coinFiles = (await readdir(coinDir)).filter((f) => f.endsWith('.png'));

  // Should have at least 280 coin icons
  assert.ok(coinFiles.length >= 280, `Expected at least 280 coin icons, found ${coinFiles.length}`);

  // Critical in-game coins that must exist
  const coreCoinIds = [
    '1',     // Arena Coin
    '2',     // Grand Arena Coin
    '3',     // Tower Coin
    '4',     // Outland Coin
    '5',     // Soulstone Coin
    '8',     // Skin Stone (Int)
    '9',     // Skin Stone (Str)
    '10',    // Skin Stone (Agi)
    '14',    // Guild War Trophy (Gold)
    '18',    // Elemental Tournament Coin
    '20',    // Titan Skin Stone
    '21',    // Pet Potion
    '105',   // Chaos Particle
    '1000',  // Guild Activity Points
    '40077'  // Hydras Coin
  ];

  for (const id of coreCoinIds) {
    const coinPath = join(coinDir, `${id}.png`);
    const fileStat = await stat(coinPath);
    assert.ok(fileStat.size > 0, `Coin ${id}.png should not be empty`);

    const buf = await readFile(coinPath);
    // PNG signature: 89 50 4e 47 0d 0a 1a 0a
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Coin ${id} must be a valid PNG`);
  }
});

test('popup.js maps coin category to assets/items/coin/${item.id}.png', async () => {
  const popupSrc = await readFile(join(root, 'extension/popup.js'), 'utf8');

  assert.ok(popupSrc.includes("item.category === 'coin'"), "popup.js should check item.category === 'coin'");
  assert.ok(popupSrc.includes("assets/items/coin/${item.id}.png"), 'popup.js should map coin to assets/items/coin/${item.id}.png');
});
