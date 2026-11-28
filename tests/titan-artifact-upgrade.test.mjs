import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { computeTitanArtifactLevelPlan } from '../src/utils/titanArtifactChestHelper.ts';
import { getTitanArtifactLevelCost } from '../src/data/titanMetadata.ts';

test('P2-51: computeTitanArtifactLevelPlan computes exact next-multiple-of-10 milestone and cumulative Dust/Gold cost', () => {
  // 1. Lv.1 with Titan Lv.120 -> next 10 is Lv.10 (+9)
  const p1 = computeTitanArtifactLevelPlan(1, 120, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(p1.milestoneTarget, 10);
  assert.equal(p1.milestoneDelta, 9);
  assert.equal(p1.canLevelUp1, true);
  assert.equal(p1.canLevelToMilestone, true);

  let expectedDust = 0;
  let expectedGold = 0;
  for (let l = 2; l <= 10; l++) {
    const c = getTitanArtifactLevelCost(l);
    expectedDust += c[0];
    expectedGold += c[1];
  }
  assert.equal(p1.milestoneDustCost, expectedDust);
  assert.equal(p1.milestoneGoldCost, expectedGold);

  // 2. Lv.10 -> next 10 is Lv.20 (+10)
  const p10 = computeTitanArtifactLevelPlan(10, 120, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(p10.milestoneTarget, 20);
  assert.equal(p10.milestoneDelta, 10);

  // 3. Lv.23 -> next 10 is Lv.30 (+7)
  const p23 = computeTitanArtifactLevelPlan(23, 120, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(p23.milestoneTarget, 30);
  assert.equal(p23.milestoneDelta, 7);

  // 4. Lv.29 -> next 10 is Lv.30 (delta = 1 -> milestone button suppressed so it doesn't duplicate +1)
  const p29 = computeTitanArtifactLevelPlan(29, 120, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(p29.milestoneTarget, 30);
  assert.equal(p29.milestoneDelta, 1);
  assert.equal(p29.canLevelToMilestone, false);
  assert.equal(p29.canLevelUp1, true);

  // 5. Clamped to titanLevel (Titan Lv.25, Artifact Lv.23 -> target 25, +2)
  const clamped = computeTitanArtifactLevelPlan(23, 25, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(clamped.milestoneTarget, 25);
  assert.equal(clamped.milestoneDelta, 2);
  assert.equal(clamped.canLevelToMilestone, true);

  // 6. Insufficient Dust gates milestone while +1 may still be affordable
  const cost2 = getTitanArtifactLevelCost(2);
  const tight = computeTitanArtifactLevelPlan(1, 120, cost2[0], 100_000_000, getTitanArtifactLevelCost);
  assert.equal(tight.canLevelUp1, true);
  assert.equal(tight.canLevelToMilestone, false);

  // 7. Maxed at Lv.120
  const maxed = computeTitanArtifactLevelPlan(120, 120, 1_000_000, 100_000_000, getTitanArtifactLevelCost);
  assert.equal(maxed.isMaxed, true);
  assert.equal(maxed.canLevelUp1, false);
  assert.equal(maxed.canLevelToMilestone, false);
});

test('P2-51: TitanDetailModal removes "+1 Level" wording and renders +1 and next-10 artifact buttons', async () => {
  const src = await readFile(resolve('src/components/dialogs/TitanDetailModal.vue'), 'utf8');
  assert.doesNotMatch(src, /\+1 Level/, 'TitanDetailModal must remove redundant "Level" word from +1 buttons');
  assert.match(src, /btn-titan-art-lvl-/);
  assert.match(src, /btn-titan-art-lvl-ten-/);
  assert.match(src, /computeTitanArtifactLevelPlan/);
});
