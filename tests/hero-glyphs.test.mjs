import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HERO_GLYPH_TYPES, GLYPH_TYPE_META, GLYPH_LEVEL_COSTS } from '../src/data/glyphData.ts';
import {
  computeGlyphUpgradeCost,
  computeMaxAffordableGlyphSteps,
  extractHeroGlyphsAndTalisman,
} from '../src/services/heroUpgradeService.ts';

test('P2-45: glyphData contains 117 heroes, 15 rune types (Lv.0..80), and 80 level costs', () => {
  assert.equal(Object.keys(HERO_GLYPH_TYPES).length, 117);
  assert.equal(Object.keys(GLYPH_TYPE_META).length, 15);
  assert.equal(Object.keys(GLYPH_LEVEL_COSTS).length, 80);
  // Aurora (Hero #1): Magic Attack, Health, Magic Pen, Dodge, Strength
  assert.deepEqual(HERO_GLYPH_TYPES[1], [6, 4, 11, 10, 1]);
  assert.equal(GLYPH_TYPE_META[4].label, 'Health');
  assert.equal(GLYPH_TYPE_META[4].values.length, 81);
  assert.equal(GLYPH_LEVEL_COSTS[1].runeStones, 150);
});

test('P2-45: computeGlyphUpgradeCost & computeMaxAffordableGlyphSteps accurately gate +1 and +5 upgrades', () => {
  // From Lv.0: Lv.1..5 each cost 150 Rune Stones -> +1 = 150, +5 = 750
  assert.equal(computeGlyphUpgradeCost(0, 1, 40).runeStones, 150);
  assert.equal(computeGlyphUpgradeCost(0, 5, 40).runeStones, 750);

  // With 300 Rune Stones at Lv.0: can afford 2 steps (+1 ok, +5 NOT ok)
  assert.equal(computeMaxAffordableGlyphSteps(0, 40, 300, 0, 120), 2);
  // With 100 Rune Stones at Lv.0: cannot even afford +1
  assert.equal(computeMaxAffordableGlyphSteps(0, 40, 100, 0, 120), 0);
  // Hero level < 20 cannot upgrade Glyphs
  assert.equal(computeMaxAffordableGlyphSteps(0, 40, 10000, 0, 15), 0);
  // Near cap (Lv.38 / 40): +5 clamps to 2 remaining levels
  const nearCap = computeGlyphUpgradeCost(38, 5, 40);
  assert.equal(nearCap.steps, 2);
  assert.equal(nearCap.runeStones, GLYPH_LEVEL_COSTS[39].runeStones + GLYPH_LEVEL_COSTS[40].runeStones);
});

test('P2-45: extractHeroGlyphsAndTalisman populates real stat labels and gates canUpgrade1 / canUpgrade5', () => {
  const hero = { id: 1, level: 120 };
  const cache = {
    rune_getAll: {
      data: {
        heroesRunes: [
          { heroId: 1, runes: [{ tier: 0, level: 0 }, { tier: 1, level: 38 }, { tier: 2, level: 40 }] },
        ],
      },
    },
    inventoryGet: { data: { coin: { '40077': 300 } } },
  };
  const { glyphs } = extractHeroGlyphsAndTalisman(hero, cache);
  assert.equal(glyphs.length, 5);
  assert.equal(glyphs[0].statLabel, 'Magic Attack');
  assert.equal(glyphs[0].canUpgrade1, true, '300 Rune Stones covers Lv.1 (150)');
  assert.equal(glyphs[0].canUpgrade5, false, '300 Rune Stones is not enough for +5 (750)');
  assert.equal(glyphs[1].statLabel, 'Health');
  assert.equal(glyphs[1].steps5Count, 2);
  assert.equal(glyphs[1].canUpgrade1, false, '300 Rune Stones is not enough for Lv.39');
  assert.equal(glyphs[2].statLabel, 'Magic Pen');
  assert.equal(glyphs[2].isMax, true);
});

test('P2-45: HeroDetailModal displays real glyph statLabel and gates +1/+5 buttons by canUpgrade1/canUpgrade5', async () => {
  const src = await readFile(resolve(process.cwd(), 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.match(src, /id="hero-glyphs-grid"/);
  assert.match(src, /g\.statLabel/);
  assert.doesNotMatch(src, />Glyph \{\{ g\.slot \}\}</);
  assert.match(src, /:disabled="upgradingGlyphTier !== null \|\| !g\.canUpgrade1"/);
  assert.match(src, /:disabled="upgradingGlyphTier !== null \|\| !g\.canUpgrade5"/);
});
