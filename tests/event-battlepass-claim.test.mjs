import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveClaimableEventQuests,
  resolveClaimableBattlePassRewards,
  countClaimableEvents,
  countClaimableEventQuests,
  countClaimableBattlePass,
} from '../src/utils/eventClaimHelper.ts';

import {
  getPendingClaims,
  buildAutoClaimCalls,
  normalizeAutoClaim,
} from '../src/utils/popupData.ts';

import { defaultBattlepassLevels } from '../src/data/battlepassCatalog.ts';

test('resolveClaimableEventQuests detects ready quests and threshold-met quests', () => {
  const cache = {
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 100275,
            groups: [
              {
                id: 1078,
                localeKey: 'LIB_SPECIAL_QUEST_EVENT_NAME_9',
                quests: [
                  { id: 11308, progress: 5, completionCount: 1, state: 'completed' }, // Completed
                  { id: 11309, progress: 5, completionCount: 1, state: 'completed' }, // Completed
                  { id: 11310, progress: 5, completionCount: 1, state: 'completed' }, // Completed
                  { id: 11311, progress: 7, completionCount: 0, state: 'inProgress' }, // Ready! (Target = 7)
                  { id: 11312, progress: 5, completionCount: 0, state: 'inProgress' }, // Not ready (Target = 10)
                ],
              },
            ],
          },
          {
            id: 100309,
            groups: [
              {
                id: 1200,
                localeKey: 'LIB_TEST_BP_DAILY_QUESTS',
                quests: [
                  { id: 13439, progress: 80, completionCount: 0, state: 'ready' }, // Explicit ready
                ],
              },
            ],
          },
        ],
      },
    },
  };

  const claimable = resolveClaimableEventQuests(cache);
  assert.equal(claimable.length, 2);
  assert.equal(claimable[0].questId, 11311);
  assert.equal(claimable[1].questId, 13439);
  assert.equal(countClaimableEventQuests(cache), 2);
});

test('resolveClaimableBattlePassRewards computes unlocked unclaimed level/track pairs', () => {
  // Battlepass 1017 (Hero\'s Way)
  const bp1017 = {
    battlepassId: 1017,
    points: 23800, // Level 459 is at 23800 points
    activatedTrackIds: [48],
    // All levels up to 458 claimed
    claimedRewards: defaultBattlepassLevels[1017]
      .filter((l) => l.id < 459)
      .map((l) => ({ levelId: l.id, trackId: 48 })),
  };

  // Battlepass 1037 (Draft Pass)
  const bp1037 = {
    battlepassId: 1037,
    points: 1550, // Levels up to 986 unlocked
    activatedTrackIds: [107],
    // Levels up to 984 claimed, 985 and 986 ready
    claimedRewards: defaultBattlepassLevels[1037]
      .filter((l) => l.id <= 984)
      .map((l) => ({ levelId: l.id, trackId: 107 })),
  };

  const cache = {
    battlepassLiveStatus: {
      data: {
        battlepasses: [bp1017, bp1037],
      },
    },
  };

  const claimable = resolveClaimableBattlePassRewards(cache);
  assert.equal(claimable.length, 2);

  // 1017 has level 459 with track 48
  assert.equal(claimable[0].battlepassId, 1017);
  assert.deepEqual(claimable[0].levelIdAndTrackIdToClaim, [[459, 48]]);
  assert.equal(claimable[0].count, 1);

  // 1037 has levels 985 and 986 with track 107
  assert.equal(claimable[1].battlepassId, 1037);
  assert.deepEqual(claimable[1].levelIdAndTrackIdToClaim, [
    [985, 107],
    [986, 107],
  ]);
  assert.equal(claimable[1].count, 2);

  assert.equal(countClaimableBattlePass(cache), 3);
  assert.equal(countClaimableEvents(cache), 3);
});

test('buildAutoClaimCalls packages eventQuests and battlePass with post-claim sync RPCs', () => {
  const cache = {
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 100309,
            groups: [
              {
                id: 1200,
                quests: [
                  { id: 13439, progress: 80, completionCount: 0, state: 'ready' },
                ],
              },
            ],
          },
        ],
      },
    },
    battlepassLiveStatus: {
      data: {
        battlepasses: [
          {
            battlepassId: 1017,
            points: 23800,
            activatedTrackIds: [48],
            claimedRewards: defaultBattlepassLevels[1017]
              .filter((l) => l.id < 459)
              .map((l) => ({ levelId: l.id, trackId: 48 })),
          },
        ],
      },
    },
  };

  const pending = getPendingClaims(cache);
  assert.equal(pending.eventQuests.length, 1);
  assert.equal(pending.battlePassRewards.length, 1);
  // Freebies totalCount excludes dynamic event quests and battle pass
  assert.equal(pending.totalCount, 0);

  const { calls } = buildAutoClaimCalls(cache, {
    eventQuests: true,
    battlePass: true,
  });

  const names = calls.map((c) => c.name);
  assert.ok(names.includes('completeQuest'));
  assert.ok(names.includes('claimBattlepassRewardAll'));
  assert.ok(names.includes('getDailyQuests'));
  assert.ok(names.includes('getSpecialQuestState'));
  assert.ok(names.includes('getBattlepassState'));
  assert.ok(names.includes('userGetInfo'));
  assert.ok(names.includes('inventoryGet'));
  assert.ok(names.includes('refillableGetAll'));
});

test('normalizeAutoClaim excludes eventQuests and battlePass to prevent Dashboard quick action merging', () => {
  const defaults = normalizeAutoClaim();
  assert.equal('eventQuests' in defaults, false);
  assert.equal('battlePass' in defaults, false);
  assert.equal(defaults.mail, true);
  assert.equal(defaults.dailyBonus, true);
  assert.equal(defaults.airshipGift, true);
});

test('resolveClaimableEventQuests does not falsely identify unverified inProgress quests as claimable in real log', async () => {
  const { readFile } = await import('node:fs/promises');
  const logRaw = await readFile(new URL('../temp/tracking-data/hwa-game-record-202611181054_events.json', import.meta.url), 'utf8');
  const logData = JSON.parse(logRaw);
  const res27 = JSON.parse(logData.timeline[27].responseBody);
  const sQuest = res27.results.find((r) => r.result?.response?.events)?.result?.response;

  const claimable = resolveClaimableEventQuests({
    specialQuestStatus: { data: sQuest },
  });

  // Must be 0 instead of the previous 49 false positives
  assert.equal(claimable.length, 0, 'No unverified inProgress quests should be falsely marked claimable');
});

test('buildAutoClaimCalls dispatches subscriptionFarm and zeppelinGiftFarm for airship gifts', () => {
  const cache = {
    zeppelinGiftGet: {
      data: {
        available: true,
        reward: {
          consumable: { '45': 1 },
        },
      },
    },
  };

  const pending = getPendingClaims(cache);
  assert.equal(pending.hasAirshipGift, true);

  const { calls } = buildAutoClaimCalls(cache, {
    airshipGift: true,
  });

  const names = calls.map((c) => c.name);
  assert.ok(names.includes('subscriptionFarm'), 'Must call subscriptionFarm');
  assert.ok(names.includes('zeppelinGiftFarm'), 'Must call zeppelinGiftFarm');
  assert.ok(names.includes('zeppelinGiftGet'), 'Must sync zeppelinGiftGet');
  assert.ok(names.includes('subscriptionGetInfo'), 'Must sync subscriptionGetInfo');
  assert.ok(names.includes('inventoryGet'), 'Must sync inventoryGet');
  assert.ok(names.includes('userGetInfo'), 'Must sync userGetInfo');
});

test('Header.vue contains account-level badge and EXP tooltip', async () => {
  const { readFile } = await import('node:fs/promises');
  const headerContent = await readFile(new URL('../src/components/common/Header.vue', import.meta.url), 'utf8');

  assert.ok(headerContent.includes('id="account-level"'), 'Header.vue must include account-level badge');
  assert.ok(headerContent.includes('accountLevel'), 'Header.vue must compute accountLevel');
  assert.ok(headerContent.includes('accountExp'), 'Header.vue must compute accountExp');
  assert.ok(headerContent.includes('levelTooltip'), 'Header.vue must compute levelTooltip');
  assert.ok(headerContent.includes('Lv. {{ accountLevel }}'), 'Header.vue must render Lv. {{ accountLevel }}');
});

test('rpcCache extracts exp and maxLevel from userGetInfo and clears zeppelinGiftGet availability on zeppelinGiftFarm', async () => {
  const { merge } = await import('../src/core/cache/rpcCache.ts');

  const initialCache = {};
  const recordUserGetInfo = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-18T10:00:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'userGetInfo', ident: 'u1' }] }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'u1',
          result: {
            response: {
              name: 'VplGhost',
              level: 89,
              experience: 695,
              maxLevel: 120,
              id: 1216438103,
            },
          },
        },
      ],
    }),
  };

  const { cache: cacheAfterUser } = merge(initialCache, [recordUserGetInfo]);
  assert.equal(cacheAfterUser.accountStatus?.data?.name, 'VplGhost');
  assert.equal(cacheAfterUser.accountStatus?.data?.level, 89);
  assert.equal(cacheAfterUser.accountStatus?.data?.exp, 695);
  assert.equal(cacheAfterUser.accountStatus?.data?.maxLevel, 120);

  // Set initial zeppelinGiftGet with available: true
  cacheAfterUser.zeppelinGiftGet = {
    data: { available: true },
    updatedAt: '2026-11-18T10:00:00.000Z',
  };

  const recordZeppelinFarm = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-18T10:05:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'zeppelinGiftFarm', ident: 'z1' }] }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'z1',
          result: {
            response: {
              reward: { consumable: { '45': 1 } },
            },
          },
        },
      ],
    }),
  };

  const { cache: cacheAfterFarm } = merge(cacheAfterUser, [recordZeppelinFarm]);
  assert.equal(cacheAfterFarm.zeppelinGiftGet?.data?.available, false);
});
