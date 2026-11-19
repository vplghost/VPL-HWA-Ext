import test from 'node:test';
import assert from 'node:assert/strict';
import { rpcCacheService as cache } from '../src/core/cache/index.ts';
import { getPendingClaims } from '../src/utils/popupData.ts';
import { resolveClaimableEventQuests } from '../src/utils/eventClaimHelper.ts';
import { getAttentionBonusAvailability } from '../src/utils/freeChestHelper.ts';

function makeRecord(calls, results, timestamp = '2026-11-19T10:00:00.000Z') {
  return {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls }),
    responseBody: JSON.stringify({ results }),
    timestamp,
    requestBodyTruncated: false,
    responseBodyTruncated: false
  };
}

test('in-game completeQuest packet synchronizes questGetAll, dailyQuests, and specialQuestStatus', () => {
  const initialCache = {
    questGetAll: {
      key: 'questGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: [
        { id: 101, state: 2, progress: 1, reward: { coin: { 1: 50 } } },
        { id: 102, state: 1, progress: 0 }
      ]
    },
    specialQuestStatus: {
      key: 'specialQuestStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        events: [
          {
            id: 1,
            groups: [
              {
                id: 10,
                quests: [
                  { id: 101, state: 'ready', completionCount: 0, requiredCount: 1 }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  // Verify before: quest 101 is claimable
  assert.equal(initialCache.questGetAll.data[0].state, 2);
  const claimableBefore = resolveClaimableEventQuests(initialCache);
  assert.equal(claimableBefore.length, 1);
  assert.equal(claimableBefore[0].questId, 101);

  // In-game completeQuest packet arrives
  const snap = makeRecord(
    [{ name: 'completeQuest', feature: 'quest', args: { questId: 101 }, ident: 'cq-1' }],
    [{ ident: 'cq-1', result: { response: {} } }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;

  // After: quest 101 state in questGetAll is 3 (completed/claimed)
  const q101 = nextState.questGetAll.data.find((q) => q.id === 101);
  assert.equal(q101.state, 3);

  // After: specialQuestStatus marked completed
  const sq101 = nextState.specialQuestStatus.data.events[0].groups[0].quests[0];
  assert.equal(sq101.state, 'completed');
  assert.equal(sq101.completionCount, 1);

  // No longer in claimable event quests
  const claimableAfter = resolveClaimableEventQuests(nextState);
  assert.equal(claimableAfter.length, 0);
});

test('in-game quest_multiFarm packet synchronizes all claimed quest IDs in questGetAll', () => {
  const initialCache = {
    questGetAll: {
      key: 'questGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: [
        { id: 201, state: 2, progress: 10 },
        { id: 202, state: 2, progress: 5 },
        { id: 203, state: 1, progress: 1 }
      ]
    }
  };

  const pendingBefore = getPendingClaims(initialCache);
  assert.deepEqual(pendingBefore.questIds, [201, 202]);

  // In-game quest_multiFarm packet arrives
  const snap = makeRecord(
    [{ name: 'quest_multiFarm', args: { questIds: [201, 202] }, ident: 'qmf-1' }],
    [{ ident: 'qmf-1', result: { response: { gold: 10000 } } }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;

  const pendingAfter = getPendingClaims(nextState);
  assert.deepEqual(pendingAfter.questIds, []);

  assert.equal(nextState.questGetAll.data.find((q) => q.id === 201).state, 3);
  assert.equal(nextState.questGetAll.data.find((q) => q.id === 202).state, 3);
  assert.equal(nextState.questGetAll.data.find((q) => q.id === 203).state, 1);
});

test('in-game questFarm packet updates claimed quest and merges next quest', () => {
  const initialCache = {
    questGetAll: {
      key: 'questGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: [
        { id: 357, state: 2, progress: 800 }
      ]
    }
  };

  const snap = makeRecord(
    [{ name: 'questFarm', args: { questId: 357 }, ident: 'qf-1' }],
    [{
      ident: 'qf-1',
      result: {
        response: { coin: { 13: 2 } },
        quests: [{ id: 358, state: 1, progress: 800 }],
        newQuests: [{ id: 358, state: 1, progress: 0 }]
      }
    }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  assert.equal(nextState.questGetAll.data.find((q) => q.id === 357).state, 3);
  assert.equal(nextState.questGetAll.data.find((q) => q.id === 358).state, 1);
});

test('in-game mailFarm packet marks letters claimed and decrements unclaimedLettersCount', () => {
  const initialCache = {
    accountStatus: {
      key: 'accountStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: { id: 12345 }
    },
    mailStatus: {
      key: 'mailStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        accountId: '12345',
        unclaimedLettersCount: 2,
        unclaimedReportsCount: 0,
        totalUnclaimed: 2,
        hasUnclaimed: true,
        letters: [
          { id: '3439106120', reward: { coin: { 40077: 1000 } }, claimed: false },
          { id: '3439098134', reward: { coin: { 13: 2 } }, claimed: false }
        ],
        reports: []
      }
    },
    mailGetAll: {
      key: 'mailGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        letters: [
          { id: '3439106120', reward: { coin: { 40077: 1000 } }, claimed: false },
          { id: '3439098134', reward: { coin: { 13: 2 } }, claimed: false }
        ]
      }
    }
  };

  assert.equal(getPendingClaims(initialCache).letterIds.length, 2);

  // In-game mailFarm packet arrives
  const snap = makeRecord(
    [{ name: 'mailFarm', args: { letterIds: [3439106120, 3439098134] }, ident: 'mf-1' }],
    [{
      ident: 'mf-1',
      result: {
        response: {
          '3439106120': { coin: { 40077: 1000 } },
          '3439098134': { coin: { 13: 2 } }
        }
      }
    }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  const mailData = nextState.mailStatus.data;

  assert.equal(mailData.unclaimedLettersCount, 0);
  assert.equal(mailData.totalUnclaimed, 0);
  assert.equal(mailData.hasUnclaimed, false);
  assert.equal(mailData.letters[0].claimed, true);
  assert.equal(mailData.letters[1].claimed, true);

  // Synchronized in mailGetAll too
  assert.equal(nextState.mailGetAll.data.letters[0].claimed, true);
  assert.equal(nextState.mailGetAll.data.letters[1].claimed, true);

  assert.equal(getPendingClaims(nextState).letterIds.length, 0);
  assert.equal(getPendingClaims(nextState).hasReports, false);
});

test('in-game readAndClaimAll and deleteAllRead synchronize battle reports', () => {
  const initialCache = {
    accountStatus: {
      key: 'accountStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: { id: 12345 }
    },
    mailStatus: {
      key: 'mailStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        accountId: '12345',
        unclaimedLettersCount: 0,
        unclaimedReportsCount: 2,
        totalUnclaimed: 2,
        hasUnclaimed: true,
        reports: [
          { id: 'rep-1', type: 'rallyMobAttackResult', claimedReward: false, read: false },
          { id: 'rep-2', type: 'mineGatheringResult', claimedReward: false, read: false }
        ],
        letters: []
      }
    }
  };

  // 1. In-game readAndClaimAll claims reports
  const claimSnap = makeRecord(
    [{ name: 'readAndClaimAll', feature: 'report', args: { types: ['rallyMobAttackResult', 'mineGatheringResult'] }, ident: 'raca-1' }],
    [{ ident: 'raca-1', result: { response: { readReports: ['rep-1', 'rep-2'] } } }]
  );

  const claimedState = cache.merge(initialCache, [claimSnap]).cache;
  assert.equal(claimedState.mailStatus.data.unclaimedReportsCount, 0);
  assert.equal(claimedState.mailStatus.data.totalUnclaimed, 0);
  assert.equal(claimedState.mailStatus.data.hasUnclaimed, false);

  // 2. In-game deleteAllRead deletes read reports
  const stateWithUnread = {
    ...claimedState,
    mailStatus: {
      ...claimedState.mailStatus,
      data: {
        ...claimedState.mailStatus.data,
        reports: [
          { id: 'rep-del', type: 'rallyMobAttackResult', read: true, claimedReward: true },
          { id: 'rep-keep', type: 'mineGatheringResult', read: false, claimedReward: false }
        ],
        unclaimedReportsCount: 1,
        totalUnclaimed: 1,
        hasUnclaimed: true
      }
    }
  };

  const delSnap = makeRecord(
    [{ name: 'deleteAllRead', feature: 'report', args: { types: ['rallyMobAttackResult'] }, ident: 'dar-1' }],
    [{ ident: 'dar-1', result: { response: { deletedReportIds: ['rep-del'] } } }]
  );

  const deletedState = cache.merge(stateWithUnread, [delSnap]).cache;
  assert.ok(!deletedState.mailStatus.data.reports.some((r) => r.id === 'rep-del'));
  assert.ok(deletedState.mailStatus.data.reports.some((r) => r.id === 'rep-keep'));
});

test('in-game zeppelinGiftFarm packet marks Valkyrie airship gift collected', () => {
  const initialCache = {
    zeppelinGiftGet: {
      key: 'zeppelinGiftGet',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: { available: true }
    }
  };

  assert.equal(getPendingClaims(initialCache).hasAirshipGift, true);

  const snap = makeRecord(
    [{ name: 'zeppelinGiftFarm', args: {}, ident: 'zg-1' }],
    [{ ident: 'zg-1', result: { response: { reward: { consumable: { 45: 1 } } } } }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  assert.equal(nextState.zeppelinGiftGet.data.available, false);
  assert.equal(getPendingClaims(nextState).hasAirshipGift, false);
});

test('in-game offerFarmReward packet marks free shop offer collected', () => {
  const initialCache = {
    offerGetAll: {
      key: 'offerGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: [
        { id: 1000016955, isActive: true, offerType: 'dailyReward', freeRewardObtained: false, reward: { gold: 15000 } }
      ]
    },
    billingGetAll: {
      key: 'billingGetAll',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        offers: [
          { id: 1000016955, isActive: true, offerType: 'dailyReward', freeRewardObtained: false, reward: { gold: 15000 } }
        ]
      }
    }
  };

  assert.equal(getPendingClaims(initialCache).freeOfferIds.length, 1);

  const snap = makeRecord(
    [{ name: 'offerFarmReward', args: { offerId: 1000016955 }, ident: 'ofr-1' }],
    [{ ident: 'ofr-1', result: { response: { gold: 15000 }, billingsUpdate: { billings: [] } } }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  assert.equal(nextState.offerGetAll.data[0].freeRewardObtained, true);
  assert.equal(nextState.billingGetAll.data.offers[0].freeRewardObtained, true);
  assert.equal(getPendingClaims(nextState).freeOfferIds.length, 0);
});

test('in-game cinemaGiveReward packet records placementRewards and avoids duplicate claim count', () => {
  const initialCache = {
    cinemaGetCounters: {
      key: 'cinemaGetCounters',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        placementViewed: 0,
        placementAvailable: 5,
        placementRewards: []
      }
    }
  };

  assert.equal(getPendingClaims(initialCache).videoBoxNums.length, 5);

  const snap = makeRecord(
    [{ name: 'cinemaGiveReward', args: { type: 'video', boxNum: 1 }, ident: 'cg-1' }],
    [{ ident: 'cg-1', result: { response: { gold: 500 } } }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  const counters = nextState.cinemaGetCounters.data;
  assert.equal(counters.placementViewed, 1);
  assert.ok(counters.placementRewards.some((r) => r.boxNum === 1));

  // Box 1 is no longer in pending claims
  const pendingBoxes = getPendingClaims(nextState).videoBoxNums;
  assert.ok(!pendingBoxes.includes(1));
});

test('in-game attentionBonus_collectReward packet updates collected state and cooldown', () => {
  const initialCache = {
    attentionBonusStatus: {
      key: 'attentionBonusStatus',
      updatedAt: '2026-11-19T09:00:00.000Z',
      data: {
        bonuses: {
          4: { id: 4, collected: false, endTime: 2071015200, refreshTime: 0 }
        }
      }
    }
  };

  const availBefore = getAttentionBonusAvailability(initialCache.attentionBonusStatus.data.bonuses, 1794970000000);
  assert.equal(availBefore.ready, true);
  assert.equal(availBefore.availableCount, 1);

  const snap = makeRecord(
    [{ name: 'attentionBonus_collectReward', args: { id: 4 }, ident: 'ab-1' }],
    [{
      ident: 'ab-1',
      result: {
        response: null,
        liveOps_UPDATE_ATTENTION_BONUS: [
          { id: 4, endTime: 2071015200, refreshTime: 1795053600, collected: true }
        ]
      }
    }]
  );

  const nextState = cache.merge(initialCache, [snap]).cache;
  const bonus = nextState.attentionBonusStatus.data.bonuses[4];
  assert.equal(bonus.collected, true);

  const availAfter = getAttentionBonusAvailability(nextState.attentionBonusStatus.data.bonuses, 1794970000000);
  assert.equal(availAfter.ready, false);
  assert.equal(availAfter.availableCount, 0);
});
