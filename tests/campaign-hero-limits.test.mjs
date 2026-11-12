import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

async function createCampaignContext() {
  const content = await readFile(join(root, 'extension/campaign-missions.js'), 'utf8');
  const context = {
    globalThis: {}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(content, context);
  return context;
}

test('campaign-missions correctly distinguishes heroic missions from normal missions', async () => {
  const context = await createCampaignContext();
  const cMissions = context.globalThis.hwaHelperCampaignMissions;

  assert.ok(cMissions, 'hwaHelperCampaignMissions should be defined');
  assert.ok(cMissions.missions['11']?.isHeroic, 'Mission 11 should be heroic');
  assert.ok(cMissions.missions['20']?.isHeroic, 'Mission 20 should be heroic');
  assert.ok(cMissions.missions['65']?.isHeroic, 'Mission 65 should be heroic');
  assert.ok(!cMissions.missions['163']?.isHeroic, 'Mission 163 should NOT be heroic');
  assert.ok(!cMissions.missions['135']?.isHeroic, 'Mission 135 should NOT be heroic');
});

test('getMissionTries calculates remaining attempts accurately with Array and Object progress shapes', async () => {
  const context = await createCampaignContext();
  const cMissions = context.globalThis.hwaHelperCampaignMissions;

  // Normal mission has infinite attempts
  const normTries = cMissions.getMissionTries(135, []);
  assert.equal(normTries.isHeroic, false);
  assert.equal(normTries.triesLeft, Infinity);

  // Array progress shape (modern game server format)
  const arrayProgress = [
    { id: 11, stars: 3, triesSpent: 1, resetToday: 0 },
    { id: 20, stars: 3, triesSpent: 3, resetToday: 0 },
    { id: 65, stars: 3, triesSpent: 4, resetToday: 1 } // Reset once: (1 + 1)*3 = 6 max, 4 spent => 2 left
  ];

  const m11 = cMissions.getMissionTries(11, arrayProgress);
  assert.equal(m11.isHeroic, true);
  assert.equal(m11.maxTries, 3);
  assert.equal(m11.triesSpent, 1);
  assert.equal(m11.triesLeft, 2);

  const m20 = cMissions.getMissionTries(20, arrayProgress);
  assert.equal(m20.isHeroic, true);
  assert.equal(m20.maxTries, 3);
  assert.equal(m20.triesSpent, 3);
  assert.equal(m20.triesLeft, 0);

  const m65 = cMissions.getMissionTries(65, arrayProgress);
  assert.equal(m65.isHeroic, true);
  assert.equal(m65.maxTries, 6);
  assert.equal(m65.triesSpent, 4);
  assert.equal(m65.triesLeft, 2);

  // Object progress shape (legacy cache format)
  const objectProgress = {
    '11': { id: 11, stars: 3, triesSpent: 3, resetToday: 0 }
  };
  const m11Obj = cMissions.getMissionTries(11, objectProgress);
  assert.equal(m11Obj.triesLeft, 0);
});

test('getHighestRaidableMission skips exhausted hero missions and falls back to available candidate', async () => {
  const context = await createCampaignContext();
  const cMissions = context.globalThis.hwaHelperCampaignMissions;

  // Candidates: [65, 20, 11] (all heroic)
  // Mission 65 has 0 tries left (3/3 spent)
  // Mission 20 has 1 try left (2/3 spent)
  // Mission 11 has 3 tries left (0/3 spent)
  const progress = [
    { id: 65, stars: 3, triesSpent: 3, resetToday: 0 },
    { id: 20, stars: 3, triesSpent: 2, resetToday: 0 },
    { id: 11, stars: 3, triesSpent: 0, resetToday: 0 }
  ];

  // Should skip 65 because it has 0 tries left, and choose 20
  const chosen = cMissions.getHighestRaidableMission([65, 20, 11], progress);
  assert.equal(chosen, 20, 'Should select mission 20 because 65 is exhausted');

  // If 20 is also disabled today via options.disabledIds
  const chosenDisabled = cMissions.getHighestRaidableMission([65, 20, 11], progress, {
    disabledIds: new Set([20])
  });
  assert.equal(chosenDisabled, 11, 'Should skip both 65 (exhausted) and 20 (disabled), picking 11');
});

test('rpc-cache handles missionRaid failure by creating failed lastCampaignRaidResult', async () => {
  const rpcCacheModule = await import('../extension/rpc-cache.js');
  const cache = globalThis.hwaHelperRpcCache;

  assert.ok(cache, 'hwaHelperRpcCache should exist');

  const failedRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-12T12:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'missionRaid', args: { id: 20, times: 1 }, ident: 'call-fail' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'call-fail',
        error: { name: 'LimitExceeded', message: 'Mission daily attempt limit reached' }
      }]
    })
  };

  const actions = cache.extract(failedRecord);
  const raidAction = actions.find((a) => a.key === 'lastCampaignRaidResult');
  assert.ok(raidAction, 'Should create lastCampaignRaidResult for failed raid');
  assert.equal(raidAction.data?.failed, true);
  assert.match(raidAction.data?.error, /limit reached/i);

  const merged = cache.merge({}, [raidAction]);
  assert.equal(merged.cache?.lastCampaignRaidResult?.data?.failed, true);
  assert.match(merged.cache?.lastCampaignRaidResult?.data?.error, /limit reached/i);
});

test('rpc-cache increments triesSpent in missionGetAll when missionRaid succeeds', async () => {
  const cache = globalThis.hwaHelperRpcCache;

  const initial = {
    missionGetAll: {
      key: 'missionGetAll',
      data: [
        { id: 11, stars: 3, triesSpent: 1, resetToday: 0 },
        { id: 20, stars: 3, triesSpent: 0, resetToday: 0 }
      ],
      updatedAt: '2026-11-12T11:00:00.000Z'
    }
  };

  const successAction = {
    key: 'lastCampaignRaidResult',
    method: 'missionRaid',
    feature: null,
    group: 'internal',
    data: {
      missionId: 11,
      times: 1,
      drops: { gold: 500, fragmentGear: { 21: 1 } },
      currentDrops: { gold: 500, fragmentGear: { 21: 1 } }
    },
    updatedAt: '2026-11-12T12:01:00.000Z'
  };

  const merged = cache.merge(initial, [successAction]);
  const m11 = merged.cache.missionGetAll.data.find((m) => m.id === 11);
  assert.equal(m11.triesSpent, 2, 'triesSpent should increment from 1 to 2');
});

test('CampaignRaidModal template contains hero icon, disabled styling, and target progress', async () => {
  const modalContent = await readFile(join(root, 'src/components/dialogs/CampaignRaidModal.vue'), 'utf8');

  // Hero icon and tries badge
  assert.match(modalContent, /🦸/, 'Must render hero icon for heroic missions');
  assert.match(modalContent, /getTriesBadge/, 'Must call getTriesBadge for mission attempt counts');

  // Disabled mission handling
  assert.match(modalContent, /isMissionDisabled/, 'Must evaluate isMissionDisabled');
  assert.match(modalContent, /line-through/, 'Must display line-through for exhausted missions');
  assert.match(modalContent, /disableMissionToday/, 'Must have disableMissionToday function');

  // Fragment progress tracking
  assert.match(modalContent, /targetItemProgress/, 'Must calculate targetItemProgress');
  assert.match(modalContent, /sessionFarmedCount/, 'Must calculate sessionFarmedCount');
  assert.match(modalContent, /\+.*Farmed/, 'Must display farmed fragment count');
});
