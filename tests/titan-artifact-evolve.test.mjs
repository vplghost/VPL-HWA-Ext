import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTitanArtifactEvolvePlan } from '../src/utils/titanArtifactChestHelper.ts';

test('calculateTitanArtifactEvolvePlan handles direct evolve when fragments are sufficient', () => {
  const plan = calculateTitanArtifactEvolvePlan(11001, 300, 350, {}, 2);
  assert.equal(plan.canEvolveDirectly, true);
  assert.equal(plan.canEvolveWithChests, true);
  assert.equal(plan.chestsPlan.length, 0);
  assert.equal(plan.totalChestsToOpen, 0);
  assert.equal(plan.totalFragsFromChests, 0);
  assert.match(plan.tooltipText, /Ready to evolve/);
  assert.equal(plan.buttonLabel, '⭐ Evolve to 2★');
});

test('calculateTitanArtifactEvolvePlan auto-plans Water Titan Artifact Chest for Sigurd weapon and water crown', () => {
  // Sigurd weapon (11001): needs 300 frags, owns 200 (needs 100 more = 4 chests of 25)
  const invConsumable = { '273': 5 }; // owns 5x Water Titan Artifact Chest
  const plan = calculateTitanArtifactEvolvePlan(11001, 300, 200, invConsumable, 2);

  assert.equal(plan.canEvolveDirectly, false);
  assert.equal(plan.canEvolveWithChests, true);
  assert.equal(plan.missingFrags, 100);
  assert.equal(plan.totalChestsToOpen, 4);
  assert.equal(plan.totalFragsFromChests, 100);
  assert.equal(plan.chestsPlan.length, 1);
  assert.equal(plan.chestsPlan[0].chestId, '273');
  assert.equal(plan.chestsPlan[0].choiceIndex, 0); // Siungur's Aegis fragment
  assert.equal(plan.chestsPlan[0].countToOpen, 4);
  assert.match(plan.tooltipText, /Will auto-open 4x Water Titan Artifact Chest \(\+100 frags\)/);
  assert.equal(plan.buttonLabel, '⭐ Open 4x Chest & Evolve');

  // Water crown (12003): needs 900 frags (to 3★), owns 860 (needs 40 more = 2 chests of 25)
  const crownPlan = calculateTitanArtifactEvolvePlan(12003, 900, 860, invConsumable, 3);
  assert.equal(crownPlan.canEvolveWithChests, true);
  assert.equal(crownPlan.missingFrags, 40);
  assert.equal(crownPlan.totalChestsToOpen, 2);
  assert.equal(crownPlan.totalFragsFromChests, 50);
  assert.equal(crownPlan.chestsPlan[0].choiceIndex, 4); // Water Crown fragment
  assert.equal(crownPlan.chestsPlan[0].countToOpen, 2);
});

test('calculateTitanArtifactEvolvePlan auto-plans Chest of Seals for defense seal', () => {
  // Defense Seal (13003): needs 300 frags, owns 250 (needs 50 more = 2 chests of 25)
  const invConsumable = { '276': 10 };
  const plan = calculateTitanArtifactEvolvePlan(13003, 300, 250, invConsumable, 2);

  assert.equal(plan.canEvolveWithChests, true);
  assert.equal(plan.totalChestsToOpen, 2);
  assert.equal(plan.chestsPlan[0].chestId, '276');
  assert.equal(plan.chestsPlan[0].choiceIndex, 2); // Defense Seal
  assert.match(plan.tooltipText, /2x Chest of Seals/);
});

test('calculateTitanArtifactEvolvePlan marks canEvolveWithChests false when inventory chests are insufficient', () => {
  // Fire Crown (12001): needs 300 frags, owns 100 (needs 200 more = 8 chests). Inventory only has 3 chests.
  const invConsumable = { '274': 3 };
  const plan = calculateTitanArtifactEvolvePlan(12001, 300, 100, invConsumable, 2);

  assert.equal(plan.canEvolveDirectly, false);
  assert.equal(plan.canEvolveWithChests, false);
  assert.equal(plan.missingFrags, 200);
  assert.match(plan.tooltipText, /Not enough fragments/);
  assert.match(plan.tooltipText, /Requires 8x Fire Titan Artifact Chest \(owned in bag: 3\)/);
  assert.equal(plan.buttonLabel, '⭐ Evolve to 2★');
});
