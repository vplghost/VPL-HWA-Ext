import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { rpcCacheService } from '../src/core/cache/index.ts';
function setupCache() {
  return rpcCacheService;
}

test('cinemaGetCounters extracts and caches placementViewed and placementRewards', () => {
  const rpcCache = setupCache();
  const record = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-15T10:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'cinemaGetCounters', args: {}, ident: 'ident-counters' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-counters',
        result: {
          response: {
            viewed: 2,
            available: 3,
            placementViewed: 2,
            placementAvailable: 3,
            placementRewards: [
              { boxNum: 0, reward: { stamina: 20 } },
              { boxNum: 1, reward: { gold: 15000 } },
              { boxNum: 2, reward: { coin: { '3': 24 } } }
            ]
          }
        }
      }]
    })
  };

  const { cache } = rpcCache.merge({}, [record]);
  assert.ok(cache.cinemaGetCounters, 'cinemaGetCounters should be stored in cache');
  assert.equal(cache.cinemaGetCounters.data.placementViewed, 2);
  assert.equal(cache.cinemaGetCounters.data.placementAvailable, 3);
  assert.equal(cache.cinemaGetCounters.data.placementRewards.length, 3);
});

test('cinemaGiveReward updates status, increments placementViewed, and decrements placementAvailable', () => {
  const rpcCache = setupCache();
  const initialCache = {
    cinemaGetCounters: {
      key: 'cinemaGetCounters',
      method: 'cinemaGetCounters',
      group: 'other',
      data: {
        placementViewed: 2,
        placementAvailable: 3,
        placementRewards: [
          { boxNum: 0, reward: { stamina: 20 } },
          { boxNum: 1, reward: { gold: 15000 } }
        ]
      },
      updatedAt: '2026-11-15T10:00:00.000Z'
    }
  };

  const rewardRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-15T10:01:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'cinemaGiveReward', args: { type: 'firstPlacement', boxNum: 1 }, ident: 'ident-reward-1' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-reward-1',
        result: {
          response: {
            gold: 15000
          }
        }
      }]
    })
  };

  const { cache } = rpcCache.merge(initialCache, [rewardRecord]);
  assert.ok(cache.cinemaGiveRewardStatus, 'cinemaGiveRewardStatus must be set');
  assert.equal(cache.cinemaGiveRewardStatus.data.success, true);
  assert.equal(cache.cinemaGiveRewardStatus.data.boxNum, 1);
  assert.equal(cache.cinemaGiveRewardStatus.data.reward.gold, 15000);

  // Counter check: placementViewed incremented from 2 to 3, placementAvailable decremented from 3 to 2
  assert.equal(cache.cinemaGetCounters.data.placementViewed, 3);
  assert.equal(cache.cinemaGetCounters.data.placementAvailable, 2);

  // Receipts check
  assert.ok(cache.cinemaGiveRewardReceipts);
  assert.equal(cache.cinemaGiveRewardReceipts.data.length, 1);
  assert.equal(cache.cinemaGiveRewardReceipts.data[0].token, 'ident-reward-1');
});

test('account change clears cinema counters and reward status', () => {
  const rpcCache = setupCache();
  const initialCache = {
    accountStatus: { data: { id: 100 }, updatedAt: '2026-11-15T09:00:00.000Z' },
    cinemaGetCounters: { data: { placementViewed: 5 }, updatedAt: '2026-11-15T09:00:00.000Z' },
    cinemaGiveRewardStatus: { data: { success: true }, updatedAt: '2026-11-15T09:00:00.000Z' },
    cinemaGiveRewardReceipts: { data: [{ token: 'abc' }], updatedAt: '2026-11-15T09:00:00.000Z' }
  };

  const newAccountRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-15T10:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'userGetInfo', args: {}, ident: 'ident-user' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-user',
        result: {
          response: { id: 200, name: 'NewUser' }
        }
      }]
    })
  };

  const { cache } = rpcCache.merge(initialCache, [newAccountRecord]);
  assert.equal(cache.accountStatus.data.id, 200);
  assert.equal(cache.cinemaGetCounters, undefined, 'cinemaGetCounters must be cleared on account change');
  assert.equal(cache.cinemaGiveRewardStatus, undefined, 'cinemaGiveRewardStatus must be cleared on account change');
  assert.equal(cache.cinemaGiveRewardReceipts, undefined, 'cinemaGiveRewardReceipts must be cleared on account change');
});

test('FreeBoxButton SFC component exists and has expected button ID and tooltip copy', () => {
  const sfcContent = readFileSync('src/components/dashboard/FreeBoxButton.vue', 'utf8');
  assert.ok(sfcContent.includes('id="dashboard-free-video-boxes"'), 'Button must have ID dashboard-free-video-boxes');
  assert.ok(sfcContent.includes('Free Video Boxes'), 'Tooltip and labels must reference Free Video Boxes in English');
  assert.ok(sfcContent.includes("name: 'cinemaGiveReward'"), 'Must dispatch cinemaGiveReward');
  assert.ok(sfcContent.includes("name: 'cinemaGetCounters'"), 'Must dispatch cinemaGetCounters');
});
