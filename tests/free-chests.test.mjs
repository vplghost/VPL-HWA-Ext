import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rpcCacheService } from '../src/core/cache/index.ts';
import { getAttentionBonusAvailability, formatCooldownTimer } from '../src/utils/freeChestHelper.ts';

function setupCache() {
  return rpcCacheService;
}

test('getAttentionBonusAvailability calculates ready bonuses, available count, and nearest cooldown', () => {
  const nowMs = 1794968500 * 1000; // Reference timestamp in ms

  // Case 1: 2 ready bonuses, 2 in future cooldown
  const bonuses = {
    1: { id: 1, endTime: 2071015200, refreshTime: 1795053600, collected: true }, // Cooldown: 1795053600 - 1794968500 = 85100s
    4: { id: 4, endTime: 2071015200, refreshTime: 1794968000, collected: false }, // Ready (not collected)
    13: { id: 13, endTime: 2071954800, refreshTime: 1794968400, collected: true }, // Ready (refreshTime in past)
    15: { id: 15, endTime: 1794960000, refreshTime: 1794968000, collected: false } // Expired (endTime in past)
  };

  const avail = getAttentionBonusAvailability(bonuses, nowMs);
  assert.equal(avail.ready, true);
  assert.equal(avail.availableCount, 2);
  assert.deepEqual(avail.readyBonusIds, [4, 13]);
  assert.equal(avail.nextRefreshSeconds, 85100);

  // Case 2: All claimed, only future cooldowns
  const allClaimedBonuses = [
    { id: 1, endTime: 2071015200, refreshTime: 1794968500 + 3600, collected: true },
    { id: 4, endTime: 2071015200, refreshTime: 1794968500 + 7200, collected: true }
  ];
  const allClaimedAvail = getAttentionBonusAvailability(allClaimedBonuses, nowMs);
  assert.equal(allClaimedAvail.ready, false);
  assert.equal(allClaimedAvail.availableCount, 0);
  assert.equal(allClaimedAvail.nextRefreshSeconds, 3600);

  // Case 3: Empty / undefined
  const emptyAvail = getAttentionBonusAvailability(undefined, nowMs);
  assert.equal(emptyAvail.ready, false);
  assert.equal(emptyAvail.availableCount, 0);
  assert.equal(emptyAvail.nextRefreshSeconds, null);
});

test('formatCooldownTimer formats hours, minutes, and seconds properly', () => {
  assert.equal(formatCooldownTimer(3665), '1h 1m');
  assert.equal(formatCooldownTimer(7200), '2h 0m');
  assert.equal(formatCooldownTimer(125), '2m 5s');
  assert.equal(formatCooldownTimer(45), '0m 45s');
  assert.equal(formatCooldownTimer(0), '00:00');
  assert.equal(formatCooldownTimer(-10), '00:00');
});

test('rpcCache extracts and merges liveOps_refresh and attentionBonus_collectReward', () => {
  const rpcCache = setupCache();

  // 1. Initial liveOps_refresh response populating attentionBonusStatus
  const refreshRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-18T02:20:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'liveOps_refresh', args: {}, ident: 'ident-refresh' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-refresh',
        result: {
          response: null,
          liveOps_UPDATE_ATTENTION_BONUS: [
            { id: 1, endTime: 2071015200, refreshTime: 1794968500, collected: false },
            { id: 4, endTime: 2071015200, refreshTime: 1794968500, collected: false },
            { id: 13, endTime: 2071954800, refreshTime: 1794968500, collected: false },
            { id: 15, endTime: 2071015200, refreshTime: 1794968500, collected: false }
          ]
        }
      }]
    })
  };

  const { cache: afterRefresh } = rpcCache.merge({}, [refreshRecord]);
  assert.ok(afterRefresh.attentionBonusStatus, 'attentionBonusStatus must be populated');
  assert.equal(Object.keys(afterRefresh.attentionBonusStatus.data.bonuses).length, 4);
  assert.equal(afterRefresh.attentionBonusStatus.data.bonuses[4].collected, false);

  // 2. Claiming bonus ID 4
  const claimRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-18T02:23:16.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'attentionBonus_collectReward', args: { id: 4 }, ident: 'ident-claim-4' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-claim-4',
        result: {
          response: null,
          liveOps_UPDATE_ATTENTION_BONUS: [
            { id: 4, endTime: 2071015200, refreshTime: 1795053600, collected: true }
          ]
        }
      }]
    })
  };

  const { cache: afterClaim } = rpcCache.merge(afterRefresh, [claimRecord]);
  assert.ok(afterClaim.attentionBonusCollectStatus, 'attentionBonusCollectStatus must be set');
  assert.equal(afterClaim.attentionBonusCollectStatus.data.success, true);
  assert.equal(afterClaim.attentionBonusCollectStatus.data.id, 4);

  // Verify ID 4 was updated to collected: true, while others remain intact
  assert.equal(afterClaim.attentionBonusStatus.data.bonuses[4].collected, true);
  assert.equal(afterClaim.attentionBonusStatus.data.bonuses[4].refreshTime, 1795053600);
  assert.equal(afterClaim.attentionBonusStatus.data.bonuses[1].collected, false);

  // Verify receipts recorded
  assert.ok(afterClaim.attentionBonusCollectReceipts);
  assert.equal(afterClaim.attentionBonusCollectReceipts.data.length, 1);
  assert.equal(afterClaim.attentionBonusCollectReceipts.data[0].token, 'ident-claim-4');
});

test('account switch clears attention bonus status and receipts', () => {
  const rpcCache = setupCache();
  const initialCache = {
    accountStatus: { data: { id: 100 }, updatedAt: '2026-11-18T01:00:00.000Z' },
    attentionBonusStatus: {
      data: { bonuses: { 4: { id: 4, collected: true } } },
      updatedAt: '2026-11-18T01:00:00.000Z'
    },
    attentionBonusCollectStatus: { data: { success: true, id: 4 }, updatedAt: '2026-11-18T01:00:00.000Z' },
    attentionBonusCollectReceipts: { data: [{ token: 'tok-1', id: 4 }], updatedAt: '2026-11-18T01:00:00.000Z' }
  };

  const newAccountRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-18T02:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'userGetInfo', args: {}, ident: 'ident-user-switch' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ident-user-switch',
        result: {
          response: { id: 200, name: 'DifferentUser' }
        }
      }]
    })
  };

  const { cache } = rpcCache.merge(initialCache, [newAccountRecord]);
  assert.equal(cache.accountStatus.data.id, 200);
  assert.equal(cache.attentionBonusStatus, undefined, 'attentionBonusStatus must be cleared on account change');
  assert.equal(cache.attentionBonusCollectStatus, undefined, 'attentionBonusCollectStatus must be cleared');
  assert.equal(cache.attentionBonusCollectReceipts, undefined, 'attentionBonusCollectReceipts must be cleared');
});

test('FreeChestButton and DashboardTab template include proper button ID and RPC dispatches', () => {
  const sfcContent = readFileSync('src/components/dashboard/FreeChestButton.vue', 'utf8');
  assert.ok(sfcContent.includes('id="dashboard-free-chests"'), 'FreeChestButton must feature id="dashboard-free-chests"');
  assert.ok(sfcContent.includes('Free Gifts'), 'Must reference Free Gifts in English');
  assert.ok(sfcContent.includes("name: 'attentionBonus_collectReward'"), 'Must dispatch attentionBonus_collectReward');
  assert.ok(sfcContent.includes("name: 'liveOps_refresh'"), 'Must dispatch liveOps_refresh');
  assert.ok(sfcContent.includes("name: 'userGetInfo'"), 'Must dispatch userGetInfo for Energy sync');
  assert.ok(sfcContent.includes("name: 'refillableGetAll'"), 'Must dispatch refillableGetAll for World Energy sync');
  assert.ok(sfcContent.includes("name: 'inventoryGet'"), 'Must dispatch inventoryGet for inventory sync');

  const activityGoalsContent = readFileSync('src/components/dashboard/ActivityGoals.vue', 'utf8');
  assert.ok(activityGoalsContent.includes('FreeGiftsStrip'), 'ActivityGoals must mount unified FreeGiftsStrip');
  const stripContent = readFileSync('src/components/dashboard/FreeGiftsStrip.vue', 'utf8');
  assert.ok(stripContent.includes('free-gift-chip-'), 'FreeGiftsStrip must render per-group free gift icon chips');
});
