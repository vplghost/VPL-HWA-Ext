import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getHeroSoulMissions,
  heroSoulMissionDrops,
  campaignMissions,
  isMissionRaidable,
  getMissionTries,
} from '../src/data/campaignData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('campaign soul stone missions: heroSoulMissionDrops contains valid heroic missions sorted ascending', () => {
  // Test known heroes
  const galahadMissions = getHeroSoulMissions(7);
  assert.ok(galahadMissions.length > 0, 'Hero 7 (Galahad) should have soul stone missions');
  assert.deepEqual(
    galahadMissions.map((m) => m.id),
    [1, 55, 95],
    'Hero 7 soul missions should be [1, 55, 95] in ascending order'
  );

  const auroraMissions = getHeroSoulMissions(1);
  assert.ok(auroraMissions.length > 0, 'Hero 1 (Aurora) should have soul stone missions');
  assert.deepEqual(
    auroraMissions.map((m) => m.id),
    [25, 61, 116],
    'Hero 1 soul missions should be [25, 61, 116] in ascending order'
  );

  const phobosMissions = getHeroSoulMissions(4);
  assert.deepEqual(
    phobosMissions.map((m) => m.id),
    [11, 20, 65, 91],
    'Hero 4 soul missions should be [11, 20, 65, 91] in ascending order'
  );

  // Every mission in heroSoulMissionDrops must exist and be heroic
  for (const [heroId, missionIds] of Object.entries(heroSoulMissionDrops)) {
    assert.ok(Array.isArray(missionIds) && missionIds.length > 0, `Hero ${heroId} should have missions`);
    // Verify ascending order
    for (let i = 1; i < missionIds.length; i++) {
      assert.ok(
        missionIds[i] > missionIds[i - 1],
        `Missions for hero ${heroId} must be in ascending order: ${missionIds.join(', ')}`
      );
    }
    for (const mId of missionIds) {
      const m = campaignMissions[String(mId)];
      assert.ok(m, `Mission #${mId} must exist in campaignMissions`);
      assert.equal(m.isHeroic, true, `Mission #${mId} must be heroic`);
    }
  }

  // Non-existent or heroes without drops return empty array
  assert.deepEqual(getHeroSoulMissions(99999), []);
  assert.deepEqual(getHeroSoulMissions(''), []);
});

test('campaign soul stone missions: isMissionRaidable and getMissionTries evaluate heroic rules', () => {
  // Mission 1 is heroic
  const missionProgressMap = {
    '1': { id: 1, stars: 3, triesSpent: 1, resetToday: 0 },
    '55': { id: 55, stars: 2, triesSpent: 0, resetToday: 0 }, // not 3 stars
    '95': { id: 95, stars: 3, triesSpent: 3, resetToday: 0 }, // daily tries exhausted
  };

  // Mission 1: 3 stars, 1 spent -> 2 left -> raidable
  const tries1 = getMissionTries(1, missionProgressMap);
  assert.equal(tries1.isHeroic, true);
  assert.equal(tries1.maxTries, 3);
  assert.equal(tries1.triesLeft, 2);
  assert.equal(isMissionRaidable(1, missionProgressMap), true);

  // Mission 55: only 2 stars -> not raidable
  assert.equal(isMissionRaidable(55, missionProgressMap), false);

  // Mission 95: 3 stars but 0 tries left -> not raidable
  const tries95 = getMissionTries(95, missionProgressMap);
  assert.equal(tries95.triesLeft, 0);
  assert.equal(isMissionRaidable(95, missionProgressMap), false);

  // Disabled missions today
  const disabledIds = new Set([1]);
  assert.equal(isMissionRaidable(1, missionProgressMap, { disabledIds }), false);
});

test('HeroDetailModal template includes Soul Stone Farm add button conditionally when farmable', () => {
  const filePath = path.resolve(__dirname, '../src/components/dialogs/HeroDetailModal.vue');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify button exists with correct ID and conditional check
  assert.ok(
    content.includes('id="btn-farm-soul-stone"'),
    'HeroDetailModal should contain #btn-farm-soul-stone'
  );
  assert.ok(
    content.includes('v-if="canFarmSoulStones"'),
    'HeroDetailModal should conditionally show #btn-farm-soul-stone with v-if="canFarmSoulStones"'
  );
  assert.ok(
    content.includes('canFarmSoulStones = computed('),
    'HeroDetailModal should define canFarmSoulStones computed property'
  );
  assert.ok(
    content.includes('handleSoulStoneFarm'),
    'HeroDetailModal should contain handleSoulStoneFarm handler'
  );
  assert.ok(
    content.includes("campaignFarmMode: 'soul'"),
    "HeroDetailModal should pass campaignFarmMode: 'soul' to openModal"
  );
  assert.ok(
    content.includes("emit('openCampaignSoul'"),
    'HeroDetailModal should emit openCampaignSoul event'
  );

  // Verify getHeroSoulMissions correctly identifies farmable vs non-farmable heroes
  const pickerData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/campaign-picker.json'), 'utf8'));
  const farmableHero = getHeroSoulMissions(1, pickerData.missions);
  assert.ok(Array.isArray(farmableHero) && farmableHero.length > 0, 'Hero 1 should have farmable missions');

  const nonFarmableHero = getHeroSoulMissions(99999, pickerData.missions);
  assert.ok(Array.isArray(nonFarmableHero) && nonFarmableHero.length === 0, 'Hero 99999 should not have farmable missions');
});

test('CampaignRaidModal template includes Soul Stones mode tab, Raid All button, and fragmentHero drops', () => {
  const filePath = path.resolve(__dirname, '../src/components/dialogs/CampaignRaidModal.vue');
  const content = fs.readFileSync(filePath, 'utf8');

  // Mode switcher tab
  assert.ok(
    content.includes('id="tab-mode-soul"'),
    'CampaignRaidModal should contain tab-mode-soul button'
  );
  assert.ok(
    content.includes("switchFarmMode('soul')"),
    "CampaignRaidModal should call switchFarmMode('soul')"
  );

  // Soul Stone farm section and Raid All button
  assert.ok(
    content.includes('id="btn-raid-all-soul-missions"'),
    'CampaignRaidModal should contain #btn-raid-all-soul-missions'
  );
  assert.ok(
    content.includes('executeRaidAllSoulMissions'),
    'CampaignRaidModal should contain executeRaidAllSoulMissions method'
  );

  // fragmentHero drops handling
  assert.ok(
    content.includes('fragmentHero'),
    'CampaignRaidModal should handle fragmentHero category in drops'
  );
  assert.ok(
    content.includes("latestRaidResult.drops?.fragmentHero"),
    'CampaignRaidModal should display fragmentHero drops'
  );
});

test('useModals composable supports campaignFarmMode and selectedCampaignSoulHeroId', () => {
  const filePath = path.resolve(__dirname, '../src/composables/useModals.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    content.includes("campaignFarmMode?: 'gear' | 'hero' | 'soul'"),
    'useModals should type campaignFarmMode in modalContext'
  );
  assert.ok(
    content.includes('selectedCampaignSoulHeroId'),
    'useModals should support selectedCampaignSoulHeroId in openModal'
  );
});
