import test from 'node:test';
import assert from 'node:assert/strict';
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
import { getPendingClaims, buildAutoClaimCalls, normalizeAutoClaim } from '../src/utils/popupData.ts';
import { runFrontierRewardsClaim } from '../src/background/backgroundRuntime.ts';

test('eternalStory_getChest and eternalStory_getState extract into rpcCache events group', () => {
  const getChestRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-21T09:26:28.044Z',
    requestBody: JSON.stringify({ calls: [{ name: 'eternalStory_getChest', args: {}, ident: 'chest-1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'chest-1',
        result: {
          response: {
            reward: { coin: { '23': 4983 } },
            filled_in_percents: 71,
            collected_at: 1795191677
          }
        }
      }]
    })
  };

  const extracted = reducer.extract(getChestRecord);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].key, 'eternalStoryChestStatus');
  assert.equal(extracted[0].group, 'events');
  assert.equal(extracted[0].data.filled_in_percents, 71);
  assert.equal(extracted[0].data.reward.coin['23'], 4983);

  const merged = reducer.merge({}, [getChestRecord]);
  assert.equal(merged.changed, true);
  assert.equal(merged.cache.eternalStoryChestStatus?.data?.filled_in_percents, 71);
});

test('eternalStory_collectChest applies explicit coin rewards, records receipt, and resets chest status', () => {
  const initial = {
    inventoryGet: { data: { coin: { 23: 100 } } },
    'resource:coin:23': { data: { amount: 100 }, updatedAt: '2026-11-21T09:20:00Z' },
    eternalStoryChestStatus: {
      data: {
        reward: { coin: { '23': 4983 } },
        filled_in_percents: 71,
        collected_at: 1795191677
      },
      updatedAt: '2026-11-21T09:26:28.044Z'
    }
  };

  const collectRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-21T09:26:29.708Z',
    requestBody: JSON.stringify({ calls: [{ name: 'eternalStory_collectChest', args: {}, ident: 'collect-1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'collect-1',
        result: {
          response: {
            reward: { coin: { '23': 4983 } },
            collected_from: 1795191677,
            collected_to: 1795253189
          },
          quests: [{ id: 10093, state: 2, progress: 1, multiplier: 0, reward: { coin: { '23': 1000 } } }]
        }
      }]
    })
  };

  const merged = reducer.merge(initial, [collectRecord]);
  assert.equal(merged.changed, true);

  // Coin 23 should be incremented by 4983: 100 + 4983 = 5083
  assert.equal(merged.cache['resource:coin:23'].data.amount, 5083);
  assert.equal(merged.cache.inventoryGet.data.coin[23], 5083);

  // Receipt in eternalStoryClaimStatus
  const receipt = merged.cache.eternalStoryClaimStatus?.data?.claims?.[0];
  assert.equal(receipt.token, 'collect-1');
  assert.equal(receipt.needsSync, true);
  assert.equal(receipt.collectedTo, 1795253189);

  // Chest status reset
  assert.equal(merged.cache.eternalStoryChestStatus?.data?.filled_in_percents, 0);
  assert.deepEqual(merged.cache.eternalStoryChestStatus?.data?.reward, {});
  assert.equal(merged.cache.eternalStoryChestStatus?.data?.collected_at, 1795253189);

  // Deduplication: replaying the same collectRecord produces no changes
  const replay = reducer.merge(merged.cache, [collectRecord]);
  assert.equal(replay.changed, false);
  assert.equal(replay.cache['resource:coin:23'].data.amount, 5083);
});

test('getPendingClaims and buildAutoClaimCalls recognize and claim frontier rewards', () => {
  const cacheWithRewards = {
    eternalStoryChestStatus: {
      data: {
        reward: { coin: { '23': 1500 } },
        filled_in_percents: 45,
        collected_at: 1795100000
      }
    }
  };

  const pending = getPendingClaims(cacheWithRewards);
  assert.equal(pending.hasFrontierRewards, true);
  assert.ok(pending.totalCount >= 1);

  const autoClaimCalls = buildAutoClaimCalls(cacheWithRewards, { frontierRewards: true });
  assert.ok(autoClaimCalls.calls.some(c => c.name === 'eternalStory_collectChest'));
  assert.ok(autoClaimCalls.calls.some(c => c.name === 'eternalStory_getChest'));

  // When disabled in options, no calls are built
  const disabledCalls = buildAutoClaimCalls(cacheWithRewards, { frontierRewards: false });
  assert.ok(!disabledCalls.calls.some(c => c.name === 'eternalStory_collectChest'));
});

test('runFrontierRewardsClaim enforces hourly cooldown, alarm scheduling, and settings guards', async () => {
  const alarms = new Map();
  const sentMessages = [];
  const storageState = {
    autoFrontierRewardsEnabled: true,
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: {
      accountStatus: { data: { id: 'acc-123' } }
    },
    autoFrontierRewardsState: null
  };

  const mockChrome = {
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const res = {};
            for (const k of keys) res[k] = storageState[k];
            return res;
          }
          return storageState;
        },
        set: async (items) => {
          Object.assign(storageState, items);
        }
      }
    },
    alarms: {
      create: (name, info) => {
        alarms.set(name, info);
      },
      get: (name, cb) => {
        cb(alarms.get(name) || null);
      }
    },
    tabs: {
      query: (filter, cb) => {
        cb([{ id: 77, url: 'https://hero-wars-alliance.com/game' }]);
      },
      sendMessage: async (tabId, msg) => {
        sentMessages.push({ tabId, msg });
        return { ok: true };
      }
    }
  };

  // 1. First claim: should succeed and schedule alarm for 1 hour later
  const res1 = await runFrontierRewardsClaim(false, mockChrome);
  assert.equal(res1.ok, true);
  assert.equal(res1.claimed, true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].tabId, 77);
  assert.ok(sentMessages[0].msg.calls.some(c => c.name === 'eternalStory_collectChest'));
  assert.ok(alarms.has('hwa-auto-frontier-rewards'));

  // 2. Immediate second automatic claim: should be throttled by 1-hour cooldown
  const res2 = await runFrontierRewardsClaim(false, mockChrome);
  assert.equal(res2.ok, true);
  assert.equal(res2.scheduled, true);
  // No second message dispatched
  assert.equal(sentMessages.length, 1);

  // 3. Manual override: can bypass cooldown
  const res3 = await runFrontierRewardsClaim(true, mockChrome);
  assert.equal(res3.ok, true);
  assert.equal(res3.claimed, true);
  assert.equal(sentMessages.length, 2);

  // 4. When disabled in settings: automatic run returns error
  storageState.autoFrontierRewardsEnabled = false;
  const res4 = await runFrontierRewardsClaim(false, mockChrome);
  assert.equal(res4.ok, false);
  assert.match(res4.error, /disabled/i);
});

test('clanClash_claimReward from recording 202611211627 is cleanly processed without inventing rewards', () => {
  const clashClaimRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-21T09:26:38.770Z',
    requestBody: JSON.stringify({
      calls: [
        { name: 'topGet', args: { type: 'clanClash', selfOnly: false }, ident: '4c56d45b1ac44bdcb252fdc56b570c68' },
        { name: 'clanClash_claimReward', args: { ClashEventId: 1, ClaimedTypes: [1] }, ident: 'a3b081e4b4d249c787ff1387fd789deb' }
      ]
    }),
    responseBody: JSON.stringify({
      results: [
        { ident: '4c56d45b1ac44bdcb252fdc56b570c68', result: { response: { top: [], count: 124869 } } },
        { ident: 'a3b081e4b4d249c787ff1387fd789deb', result: { response: {} } }
      ],
      date: 1795253198.767202
    })
  };

  const extracted = reducer.extract(clashClaimRecord);
  assert.ok(extracted.some(e => e.key === 'clanClashClaimAction'));

  const merged = reducer.merge({}, [clashClaimRecord]);
  assert.equal(merged.changed, true);
  const claimReceipt = merged.cache.clanClashClaimStatus?.data?.claims?.[0];
  assert.equal(claimReceipt.token, 'a3b081e4b4d249c787ff1387fd789deb');
  assert.equal(claimReceipt.eventId, 1);
  assert.deepEqual([...claimReceipt.claimedTypes], [1]);
  assert.equal(claimReceipt.needsSync, true);
});
