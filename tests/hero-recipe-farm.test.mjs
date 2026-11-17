import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregateHeroLeafEquipment } from '../src/utils/recipeTree.ts';
import { heroMetadata, gearCraftData, scrollCraftData } from '../src/data/heroMetadata.ts';
import { nameData } from '../src/data/nameData.ts';

globalThis.hwaHelperNameData = nameData;
globalThis.hwaHelperHeroMetadata = heroMetadata;

test('aggregateHeroLeafEquipment returns null for invalid hero', () => {
  assert.equal(aggregateHeroLeafEquipment(null, {}), null);
  assert.equal(aggregateHeroLeafEquipment(undefined, {}), null);
});

test('aggregateHeroLeafEquipment extracts deepest leaf resources for unequipped slots', () => {
  // Hero 1 (Galahad) at color 8: equipment [ 60, 73, 90, 91, 98, 126 ]
  // Slots 0, 1, 2 are equipped; slots 3, 4, 5 are unequipped
  const hero = {
    id: 1,
    color: 8,
    slots: [true, true, true, null, null, null]
  };

  const emptyCache = { inventoryGet: { data: {} } };
  const summary = aggregateHeroLeafEquipment(hero, emptyCache);

  assert.ok(summary, 'Must return summary');
  assert.equal(summary.heroId, '1');
  assert.equal(summary.color, 8);
  assert.equal(summary.missingSlotsCount, 3);
  assert.equal(summary.missingGears.length, 3);
  assert.deepEqual(summary.missingGears.map(g => g.slotNum), [4, 5, 6]);

  // Leaf resources must be a flat list
  assert.ok(Array.isArray(summary.leafResources));
  assert.ok(summary.leafResources.length > 0, 'Must have leaf resources');

  for (const leaf of summary.leafResources) {
    assert.ok(leaf.id, 'Leaf must have id');
    assert.ok(['fragmentGear', 'fragmentScroll', 'gear', 'scroll'].includes(leaf.category), 'Leaf must have valid category');
    assert.ok(leaf.requiredCount > 0, 'Leaf must have requiredCount > 0');
    assert.equal(leaf.ownedCount, 0);
    assert.equal(leaf.remainingCount, leaf.requiredCount);
    assert.equal(leaf.isFulfilled, false);
    assert.ok(Array.isArray(leaf.missions), 'Leaf must have missions array');
    assert.ok(Array.isArray(leaf.sourceGears) && leaf.sourceGears.length > 0, 'Leaf must have sourceGears');
  }
});

test('shared inventory allocates once and aggregates duplicate leaf resources across slots', () => {
  // Synthetic craft data:
  // Gear 910 needs 20 fragments of 911
  // Gear 920 needs 20 fragments of 911 + 10 fragments of 921
  const customCraft = {
    910: { fragmentCount: 20 },
    920: { recipe: { 910: 1 }, scroll: { 922: 1 } },
    922: { fragmentCount: 10 }
  };

  // Mock hero needing gear 910 and gear 920
  const mockHero = {
    id: 999,
    color: 1,
    slots: [null, null]
  };

  // Override hero metadata for mockHero
  globalThis.hwaHelperHeroMetadata[999] = {
    name: 'Mock Hero',
    equipment: {
      '1': [910, 920]
    }
  };

  // Case A: Inventory has 15 fragments of 910
  // Slot 1 (gear 910) needs 20 frags of 910
  // Slot 2 (gear 920) needs gear 910 (20 frags of 910) + scroll 922 (10 frags of 922)
  // Total frags of 910 needed = 20 + 20 = 40
  const cacheWith15Frags = {
    inventoryGet: {
      data: {
        fragmentGear: { 910: 15 },
        fragmentScroll: { 922: 10 }
      }
    }
  };

  const summaryA = aggregateHeroLeafEquipment(mockHero, cacheWith15Frags, customCraft);
  assert.ok(summaryA);

  const leaf910 = summaryA.leafResources.find(l => l.id === '910' && l.category === 'fragmentGear');
  assert.ok(leaf910, 'Must aggregate fragmentGear 910');
  assert.equal(leaf910.requiredCount, 40, 'Total required 910 must be 40 (20 + 20)');
  assert.equal(leaf910.ownedCount, 15, 'Owned must be 15');
  assert.equal(leaf910.remainingCount, 25, 'Remaining must be 25');
  assert.equal(leaf910.isFulfilled, false);
  assert.equal(leaf910.sourceGears.length, 2, 'Must cite both root gears');

  const leaf922 = summaryA.leafResources.find(l => l.id === '922' && l.category === 'fragmentScroll');
  assert.ok(leaf922, 'Must aggregate fragmentScroll 922');
  assert.equal(leaf922.requiredCount, 10);
  assert.equal(leaf922.ownedCount, 10);
  assert.equal(leaf922.remainingCount, 0);
  assert.equal(leaf922.isFulfilled, true);

  // Case B: Fully owned parent gear skips descendant requirements
  const cacheWithCompletedGear = {
    inventoryGet: {
      data: {
        gear: { 910: 1 }, // Already own 1 gear 910
        fragmentGear: { 910: 20 },
        fragmentScroll: { 922: 10 }
      }
    }
  };

  const summaryB = aggregateHeroLeafEquipment(mockHero, cacheWithCompletedGear, customCraft);
  assert.ok(summaryB);

  const leaf910B = summaryB.leafResources.find(l => l.id === '910' && l.category === 'fragmentGear');
  // Slot 1 uses the 1 owned gear 910. Slot 2 needs 1 gear 910 (which needs 20 frags of 910).
  // Total required 910 is now only 20!
  assert.equal(leaf910B.requiredCount, 20);
  assert.equal(leaf910B.ownedCount, 20);
  assert.equal(leaf910B.isFulfilled, true);
});

test('HeroDetailModal has #hero-farm-all-btn button and transfers selectedCampaignHeroId', async () => {
  const source = await readFile(new URL('../src/components/dialogs/HeroDetailModal.vue', import.meta.url), 'utf8');
  assert.match(source, /id="hero-farm-all-btn"/, 'Must contain #hero-farm-all-btn');
  assert.match(source, /Farm theo Hero/, 'Must contain Farm theo Hero label');
  assert.match(source, /openModal\('campaign',\s*\{\s*selectedCampaignHeroId/, 'Must pass selectedCampaignHeroId to openModal');
});

test('CampaignRaidModal contains Hero Farm UI components, tabs, and flat list', async () => {
  const source = await readFile(new URL('../src/components/dialogs/CampaignRaidModal.vue', import.meta.url), 'utf8');
  assert.match(source, /id="tab-mode-hero"/, 'Must contain #tab-mode-hero');
  assert.match(source, /id="tab-mode-gear"/, 'Must contain #tab-mode-gear');
  assert.match(source, /id="campaign-hero-select"/, 'Must contain #campaign-hero-select');
  assert.match(source, /id="hero-leaf-resources-list"/, 'Must contain #hero-leaf-resources-list');
  assert.match(source, /aggregateHeroLeafEquipment/, 'Must import and use aggregateHeroLeafEquipment');
  assert.match(source, /selectedLeafResource/, 'Must compute selectedLeafResource');
});
