import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  calculateTitanLevelUpPlan,
  getTitanLevelFromExp,
  getTitanExpForNextLevel,
  titanCumulativeExp,
  titanEvolutionCosts,
} from '../src/data/titanLevelData.ts';
import {
  getTitanMetadata,
  getTitanArtifactLevelCost,
  getTitanArtifactEvolveCost,
} from '../src/data/titanMetadata.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

const root = resolve(import.meta.dirname, '..');

test('titanLevelData computes accurate level progression, thresholds, and level-up plans', () => {
  // 1. Next level XP delta
  assert.equal(getTitanExpForNextLevel(1), 100);
  assert.equal(getTitanExpForNextLevel(2), 110);
  assert.equal(getTitanExpForNextLevel(45), 1140);
  assert.equal(getTitanExpForNextLevel(120), 0);

  // 2. Cumulative XP to Level mapping
  assert.deepEqual(getTitanLevelFromExp(0), {
    level: 1,
    currentLevelXp: 0,
    nextLevelExpNeeded: 100,
    totalExp: 0,
  });
  assert.deepEqual(getTitanLevelFromExp(100), {
    level: 2,
    currentLevelXp: 0,
    nextLevelExpNeeded: 110,
    totalExp: 100,
  });
  assert.deepEqual(getTitanLevelFromExp(18060), {
    level: 45,
    currentLevelXp: 0,
    nextLevelExpNeeded: 1140,
    totalExp: 18060,
  });
  // 18060 + 1890 = 19950 -> Level 46 (which starts at 19200) with 750 / 1190 progress
  assert.deepEqual(getTitanLevelFromExp(19950), {
    level: 46,
    currentLevelXp: 750,
    nextLevelExpNeeded: 1190,
    totalExp: 19950,
  });

  // 3. Level-up plans (+1, +10, Max)
  const plan1 = calculateTitanLevelUpPlan(45, 18060, 2000, 1);
  assert.equal(plan1.targetLevel, 46);
  assert.equal(plan1.potionsNeeded, 1140);
  assert.equal(plan1.canLevelUp, true);

  const plan10 = calculateTitanLevelUpPlan(45, 18060, 20000, 10);
  assert.equal(plan10.targetLevel, 55);
  assert.equal(plan10.potionsNeeded, 14150);
  assert.equal(plan10.canLevelUp, true);

  const planMax = calculateTitanLevelUpPlan(45, 18060, 1890, 120);
  assert.equal(planMax.targetLevel, 46);
  assert.equal(planMax.potionsNeeded, 1140);
  assert.equal(planMax.canLevelUp, true);
});

test('titanMetadata provides correct artifact costs, element, and metadata', () => {
  const sigurd = getTitanMetadata(4000);
  assert.ok(sigurd);
  assert.equal(sigurd.name, 'Sigurd');
  assert.equal(sigurd.role, 'Tank');
  assert.equal(sigurd.element, 'Water');
  assert.deepEqual(sigurd.artifacts, [11001, 12003, 13003]);

  // Artifact Level Cost: Level 2 -> [25 dust, 20000 gold]
  const cost2 = getTitanArtifactLevelCost(2);
  assert.deepEqual(cost2, [25, 20000]);

  // Artifact Evolve Cost: 2★ -> 300 fragments
  const evolve2 = getTitanArtifactEvolveCost(2);
  assert.equal(evolve2, 300);
});

test('rpcCache accurately extracts and merges titan level-up, artifact leveling, artifact evolve, and skin upgrade', () => {
  const initialCache = {
    titanGetAll: {
      data: {
        '4050': {
          id: 4050,
          level: 45,
          xp: 18060,
          star: 3,
          skills: { '4050': 45 },
          power: 8000,
          artifacts: [
            { level: 10, star: 1 },
            { level: 5, star: 1 },
            { level: 1, star: 1 },
          ],
          skins: { '10062': 10 },
          currentSkin: 10062,
        },
      },
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
    inventoryGet: {
      data: {
        consumable: {
          '20': 2000, // 2000 titan potions
        },
        coin: {
          '18': 1000, // 1000 fairy dust
          '1': 5000000, // gold
        },
        fragmentArtifact: {
          '12006': 500, // Pallant Crown fragments
          '13007': 1000, // Pallant Seal fragments
        },
      },
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
    userGetInfo: {
      data: {
        gold: 5000000,
      },
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
  };

  // 1. inventory_use with libId: 20 (Titan Potion) -> updates titan xp, level, and skills, deducts potions
  const records = [
    {
      transport: 'fetch',
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      method: 'POST',
      status: 200,
      timestamp: '2026-11-20T10:00:01.000Z',
      requestBody: JSON.stringify({
        calls: [
          {
            name: 'inventory_use',
            args: { libId: 20, amount: 1890, params: { unitId: 4050 } },
            ident: 'test-use-potion',
          },
        ],
      }),
      responseBody: JSON.stringify({
        results: [
          {
            ident: 'test-use-potion',
            result: { response: { titanXp: { '4050': 1890 } } },
          },
        ],
      }),
    },
    // 2. skin_upgrade -> increments skin level
    {
      transport: 'fetch',
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      method: 'POST',
      status: 200,
      timestamp: '2026-11-20T10:00:02.000Z',
      requestBody: JSON.stringify({
        calls: [
          {
            name: 'skin_upgrade',
            args: { unitId: 4050, skinId: 10062 },
            ident: 'test-skin-upgrade',
          },
        ],
      }),
      responseBody: JSON.stringify({
        results: [
          {
            ident: 'test-skin-upgrade',
            result: { response: { reward: {} } },
          },
        ],
      }),
    },
    // 3. artifact_LevelUpCost -> upgrades titan artifact slot 2 (13003) level from 1 to 2
    {
      transport: 'fetch',
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      method: 'POST',
      status: 200,
      timestamp: '2026-11-20T10:00:03.000Z',
      requestBody: JSON.stringify({
        calls: [
          {
            name: 'artifact_LevelUpCost',
            args: { unitId: 4050, artifactId: 13003 },
            ident: 'test-art-lvl',
          },
        ],
      }),
      responseBody: JSON.stringify({
        results: [
          {
            ident: 'test-art-lvl',
            result: { response: { reward: {} } },
          },
        ],
      }),
    },
    // 4. artifact_evolve -> evolves titan artifact slot 1 (Crown) from 1★ to 2★
    {
      transport: 'fetch',
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      method: 'POST',
      status: 200,
      timestamp: '2026-11-20T10:00:04.000Z',
      requestBody: JSON.stringify({
        calls: [
          {
            name: 'artifact_evolve',
            args: { heroId: 4050, slotId: 1 },
            ident: 'test-art-evolve',
          },
        ],
      }),
      responseBody: JSON.stringify({
        results: [
          {
            ident: 'test-art-evolve',
            result: { response: { reward: {} } },
          },
        ],
      }),
    },
  ];

  const merged = rpcCacheService.merge(initialCache, records);
  const cache = merged.cache;

  const titan = cache.titanGetAll.data['4050'];
  assert.ok(titan);

  // Titan level & XP check
  assert.equal(titan.xp, 18060 + 1890); // 19950
  assert.equal(titan.level, 46); // Advance from 45 to 46
  assert.equal(titan.skills['4050'], 46);
  assert.equal(cache.inventoryGet.data.consumable['20'], 2000 - 1890); // 110 remaining

  // Skin upgrade check
  assert.equal(titan.skins['10062'], 11);

  // Artifact level up check (slot 2: Seal)
  assert.equal(titan.artifacts[2].level, 2);
  assert.equal(cache.inventoryGet.data.coin['18'], 1000 - 25); // 975 dust remaining
  assert.equal(cache.userGetInfo.data.gold, 5000000 - 20000); // 4980000 gold remaining

  // Artifact evolve check (slot 1: Crown)
  assert.equal(titan.artifacts[1].star, 2);
  assert.equal(cache.inventoryGet.data.fragmentArtifact['12006'], 500 - 300); // 200 frags remaining
});

test('TitanDetailModal.vue and TitansTab.vue integrate complete UI and handlers', async () => {
  const modalContent = await readFile(resolve(root, 'src/components/dialogs/TitanDetailModal.vue'), 'utf8');

  // Verify IDs and structure
  assert.ok(modalContent.includes('id="titan-dialog"'), 'TitanDetailModal must have id="titan-dialog"');
  assert.ok(modalContent.includes('id="titan-dialog-header"'), 'TitanDetailModal must have id="titan-dialog-header"');
  assert.ok(modalContent.includes('id="titan-dialog-body"'), 'TitanDetailModal must have id="titan-dialog-body"');
  assert.ok(modalContent.includes('id="titan-dialog-switcher"'), 'TitanDetailModal must have id="titan-dialog-switcher"');
  assert.ok(modalContent.includes('id="btn-titan-evolve-star"'), 'TitanDetailModal must have #btn-titan-evolve-star');
  assert.ok(modalContent.includes('id="btn-titan-levelup-1"'), 'TitanDetailModal must have #btn-titan-levelup-1');
  assert.ok(modalContent.includes('id="btn-titan-levelup-10"'), 'TitanDetailModal must have #btn-titan-levelup-10');
  assert.ok(modalContent.includes('id="btn-titan-levelup-max"'), 'TitanDetailModal must have #btn-titan-levelup-max');

  // Verify RPC dispatches
  assert.ok(modalContent.includes("name: 'titanEvolve'"), 'Must dispatch titanEvolve');
  assert.ok(modalContent.includes("name: 'inventory_use'"), 'Must dispatch inventory_use');
  assert.ok(modalContent.includes("name: 'artifact_LevelUpCost'"), 'Must dispatch artifact_LevelUpCost');
  assert.ok(modalContent.includes("name: 'artifact_evolve'"), 'Must dispatch artifact_evolve');
  assert.ok(modalContent.includes("name: 'skin_upgrade'"), 'Must dispatch skin_upgrade');

  // Verify TitansTab.vue imports and uses TitanDetailModal
  const tabContent = await readFile(resolve(root, 'src/components/tabs/TitansTab.vue'), 'utf8');
  assert.ok(tabContent.includes('import TitanDetailModal'), 'TitansTab must import TitanDetailModal');
  assert.ok(tabContent.includes('<TitanDetailModal'), 'TitansTab must mount TitanDetailModal');
  assert.ok(tabContent.includes('v-model="showTitanModal"'), 'TitansTab must bind showTitanModal');
  assert.ok(tabContent.includes('openTitanModal'), 'TitansTab must have openTitanModal function');
});
