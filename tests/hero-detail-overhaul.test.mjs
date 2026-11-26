import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  HERO_XP_POTIONS,
  HERO_RESOURCE_IDS,
  getHeroEvolveStatus,
  planHeroXpPotions,
  buildXpPotionInventoryUseCalls,
  getHeroSparkStatus,
  getArtifactEvolveStatus,
  extractHeroGlyphsAndTalisman,
} from '../src/services/heroUpgradeService.ts';
import { formatCompactMillion } from '../src/utils/formatters.ts';

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

test('planHeroXpPotions uses verified libIds 9..12, clamps to Team Level cap, and builds inventory_use calls', () => {
  assert.deepEqual(
    HERO_XP_POTIONS.map((p) => [p.libId, p.xp]),
    [[12, 7500], [11, 1500], [10, 300], [9, 50]]
  );
  assert.equal(HERO_RESOURCE_IDS.RUNE_STONE_COIN_ID, '40077');
  assert.equal(HERO_RESOURCE_IDS.SPARK_OF_POWER_CONSUMABLE_ID, '24');

  const inv = { '12': 10, '11': 20, '10': 50, '9': 100 };
  const plan = planHeroXpPotions(50, 120, 60, inv);
  assert.equal(plan.targetLevel, 60, 'Must clamp to teamLevelCap');
  assert.equal(plan.levelsToGain, 10);
  assert.equal(plan.canReachTarget, true);
  assert.ok(plan.potionsToUse.length > 0);

  const rpcCalls = buildXpPotionInventoryUseCalls(29, plan);
  assert.ok(rpcCalls.length > 0);
  assert.equal(rpcCalls[0].name, 'inventory_use');
  assert.equal(rpcCalls[0].args.params.unitId, 29);
  assert.ok([9, 10, 11, 12].includes(rpcCalls[0].args.libId));

  // Insufficient potions reports canReachTarget: false
  const poor = planHeroXpPotions(50, 60, 120, { '9': 1 });
  assert.equal(poor.canReachTarget, false);
});

test('getArtifactEvolveStatus, extractHeroGlyphsAndTalisman (rune_getAll), and getHeroSparkStatus work accurately', () => {
  assert.equal(getArtifactEvolveStatus(3, 30).canEvolve, true);
  assert.equal(getArtifactEvolveStatus(3, 29).canEvolve, false);
  assert.equal(getArtifactEvolveStatus(6, 999).isMax, true);

  // Real rune_getAll.heroesRunes overrides stale hero.runes [0,0,0,0,0]
  const info = extractHeroGlyphsAndTalisman(
    { id: 29, runes: [0, 0, 0, 0, 0], titanGiftLevel: 12 },
    {
      rune_getAll: {
        data: {
          heroesRunes: [
            {
              heroId: 29,
              runes: [
                { tier: 0, level: 40 },
                { tier: 1, level: 20 },
                { tier: 2, level: 15 },
                { tier: 3, level: 10 },
                { tier: 4, level: 0 },
              ],
            },
          ],
        },
      },
      talisman_getAll: { data: [{ id: 1, heroId: 29, level: 50 }] },
    }
  );
  assert.equal(info.glyphs.length, 5);
  assert.equal(info.glyphs[0].tier, 0);
  assert.equal(info.glyphs[0].level, 40);
  assert.equal(info.glyphs[0].isMax, true);
  assert.equal(info.glyphs[1].level, 20);
  assert.equal(info.glyphs[4].level, 0);
  assert.equal(info.talismans.length, 1);

  const spark = getHeroSparkStatus({ titanGiftLevel: 12 }, { '24': 500 }, 100_000);
  assert.equal(spark.level, 12);
  assert.equal(spark.maxLevel, 30);
  assert.equal(spark.canUpgrade, true);
  assert.equal(getHeroSparkStatus({ titanGiftLevel: 30 }, { '24': 500 }, 100_000).isMax, true);
});

test('HeroDetailModal wires 1-click heroEvolve, artifact_evolve, XP level-up, Glyphs (rune_upgradeHeroRune), and Spark of Power', async () => {
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="btn-hero-evolve"'));
  assert.ok(modalSrc.includes("name: 'heroEvolve'"));
  assert.ok(modalSrc.includes("name: 'artifact_evolve'"));
  assert.ok(modalSrc.includes('id="btn-hero-prev"'));
  assert.ok(modalSrc.includes('id="btn-hero-next"'));
  assert.ok(modalSrc.includes('id="hero-detail-subtabs"'));
  assert.ok(modalSrc.includes('id="hero-level-xp-bar"'));
  assert.ok(modalSrc.includes('id="btn-hero-level-1"'));
  assert.ok(modalSrc.includes('id="btn-hero-level-max"'));
  assert.ok(modalSrc.includes('btn-glyph-upgrade-'));
  assert.ok(modalSrc.includes("name: 'rune_upgradeHeroRune'"));
  assert.ok(modalSrc.includes('alternatePrice: false'));
  assert.ok(modalSrc.includes('id="btn-hero-spark-up"'));
  assert.ok(modalSrc.includes("name: 'heroTitanGiftLevelUp'"));
  // P2-16: 2-tab unified Upgrades layout & icon+count resource bars
  assert.ok(modalSrc.includes("ref<'core' | 'upgrades'>('core')"));
  assert.ok(modalSrc.includes('id="hero-artifacts-resource-bar"'));
  assert.ok(modalSrc.includes('id="hero-glyphs-resource-bar"'));
  const upgradesTabMatches = modalSrc.match(/v-show="activeSubTab === 'upgrades'"/g) || [];
  assert.equal(upgradesTabMatches.length, 3, 'Artifacts, Skins, and Glyphs/Sparks must all render inside the unified Upgrades tab');
  // P2-18: redundant Artifact Next pill removed & compact million+ resource counts in Glyphs/Artifacts/Skins
  assert.ok(!modalSrc.includes('Compact Next-Level Material Cost Pill'), 'Redundant Artifact Next pill must be removed');
  assert.ok(modalSrc.includes('formatCompactMillion(ownedRuneStones)'));
  assert.ok(modalSrc.includes('formatCompactMillion(ownedSparksOfPower)'));
  assert.ok(modalSrc.includes('formatCompactMillion(currentGold)'));
});

test('formatCompactMillion preserves exact numbers below 1M and compacts >= 1M into M/B notation', () => {
  assert.equal(formatCompactMillion(0), '0');
  assert.equal(formatCompactMillion(450), '450');
  assert.equal(formatCompactMillion(999_999), (999_999).toLocaleString());
  assert.equal(formatCompactMillion(1_000_000), '1M');
  assert.equal(formatCompactMillion(1_250_000), '1.3M');
  assert.equal(formatCompactMillion(125_430_200), '125.4M');
  assert.equal(formatCompactMillion(2_000_000_000), '2B');
});
