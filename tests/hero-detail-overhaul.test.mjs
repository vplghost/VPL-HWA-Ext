import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getHeroEvolveStatus,
  planHeroXpPotions,
  getArtifactEvolveStatus,
  extractHeroGlyphsAndTalisman,
} from '../src/services/heroUpgradeService.ts';

const root = resolve(process.cwd());

test('getHeroEvolveStatus validates soul stones, gold cost, and 6-star cap', () => {
  // 4★ -> 5★ requires 500k Gold
  const ready = getHeroEvolveStatus({ star: 4, soulOwned: 150, soulNeeded: 150, userGold: 1_000_000 });
  assert.equal(ready.canEvolve, true);
  assert.equal(ready.targetStar, 5);
  assert.equal(ready.goldCost, 500_000);

  // Insufficient gold blocks evolve
  const noGold = getHeroEvolveStatus({ star: 4, soulOwned: 150, soulNeeded: 150, userGold: 100_000 });
  assert.equal(noGold.canEvolve, false);
  assert.equal(noGold.hasEnoughGold, false);

  // Insufficient souls blocks evolve
  const noSouls = getHeroEvolveStatus({ star: 4, soulOwned: 80, soulNeeded: 150, userGold: 1_000_000 });
  assert.equal(noSouls.canEvolve, false);
  assert.equal(noSouls.hasEnoughSouls, false);

  // 6★ is max
  const maxed = getHeroEvolveStatus({ star: 6, soulOwned: 999, soulNeeded: 'Max', userGold: 9_999_999 });
  assert.equal(maxed.canEvolve, false);
  assert.equal(maxed.isMax, true);
});

test('planHeroXpPotions clamps target to Team Level cap and picks minimal-waste potion mix', () => {
  const inv = { '4': 10, '3': 20, '2': 50, '1': 100 };
  const plan = planHeroXpPotions(50, 120, 60, inv);
  assert.equal(plan.targetLevel, 60, 'Must clamp to teamLevelCap');
  assert.equal(plan.levelsToGain, 10);
  assert.equal(plan.canReachTarget, true);
  assert.ok(plan.potionsToUse.length > 0);

  // Insufficient potions reports canReachTarget: false
  const poor = planHeroXpPotions(50, 60, 120, { '1': 1 });
  assert.equal(poor.canReachTarget, false);
});

test('getArtifactEvolveStatus and extractHeroGlyphsAndTalisman work accurately', () => {
  assert.equal(getArtifactEvolveStatus(3, 30).canEvolve, true);
  assert.equal(getArtifactEvolveStatus(3, 29).canEvolve, false);
  assert.equal(getArtifactEvolveStatus(6, 999).isMax, true);

  const info = extractHeroGlyphsAndTalisman(
    { id: 55, runes: [40, 40, 35, 20, 40] },
    { talisman_getAll: { data: [{ id: 1, heroId: 55, level: 50 }] } }
  );
  assert.equal(info.glyphs.length, 5);
  assert.equal(info.glyphs[0].level, 40);
  assert.equal(info.talismans.length, 1);
});

test('HeroDetailModal wires 1-click heroEvolve, artifact_evolve, prev/next switcher, XP bar, and compact sub-tabs', async () => {
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="btn-hero-evolve"'));
  assert.ok(modalSrc.includes("name: 'heroEvolve'"));
  assert.ok(modalSrc.includes("name: 'artifact_evolve'"));
  assert.ok(modalSrc.includes('id="btn-hero-prev"'));
  assert.ok(modalSrc.includes('id="btn-hero-next"'));
  assert.ok(modalSrc.includes('id="hero-detail-subtabs"'));
  assert.ok(modalSrc.includes('id="hero-level-xp-bar"'));
});
