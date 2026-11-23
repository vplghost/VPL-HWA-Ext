import test from 'node:test';
import assert from 'node:assert/strict';
import * as resources from '../src/utils/resourceData.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

test('World Energy refills at verified interval, caps, and accepts newer API baseline', () => {
  const entry = { data: { amount: 44, lastRefillAt: 1000000, refillEveryMs: 300000,
    refillAmount: 1, cap: 200 } };
  assert.equal(resources.amountAt(entry, 1000000 + 299999), 44);
  assert.equal(resources.amountAt(entry, 1000000 + 300000), 45);
  assert.equal(resources.amountAt(entry, 1000000 + 300000 * 200), 200);
  assert.equal(resources.amountAt({ data: { amount: 37 } }, 999999999), 37);
  assert.equal(resources.amountAt({ data: { ...entry.data, amount: 250 } }, 1000000 + 300000), 250);
  assert.equal(resources.nextRefillSeconds(entry, 1000000), 300);
  assert.equal(resources.nextRefillSeconds(entry, 1000000 + 299000), 1);
  assert.equal(resources.amountAt({ data: { ...entry.data, amount: 10, lastRefillAt: 2000000 } },
    2000000), 10);
});

test('building and research queues show nearest remaining hours and minutes', () => {
  const entry = { data: { queues: [
    { startDate: 1000000, durationMs: 3661000 },
    { startDate: 1000000, durationMs: 8000000 }
  ] } };
  assert.equal(resources.hoursMinutes(resources.remainingMinutes(entry, 1000000)), '01:02');
  assert.equal(resources.remainingMinutes(entry, 1000000 + 8000000), null);
  assert.equal(resources.hoursMinutes(null), '—');
});

test('resource amounts use M and B notation from each threshold', () => {
  assert.equal(resources.formatAmount(999999), '999,999');
  assert.equal(resources.formatAmount(1000000), '1.0M');
  assert.equal(resources.formatAmount(1250000), '1.3M');
  assert.equal(resources.formatAmount(999950000), '1.0B');
  assert.equal(resources.formatAmount(1000000000), '1.0B');
  assert.equal(resources.formatAmount(2500000000), '2.5B');
  assert.equal(resources.formatAmount(1000000000000), '1,000.0B');
  assert.equal(resources.formatAmount(null), '—');
});

test('renewable tooltip shows per-minute rate or next refill countdown', () => {
  const fast = { data: { amount: 5, lastRefillAt: 1000000,
    refillEveryMs: 30000, refillAmount: 1, cap: 20 } };
  const slow = { data: { amount: 5, lastRefillAt: 1000000,
    refillEveryMs: 300000, refillAmount: 1, cap: 20 } };
  assert.equal(resources.refillDescription(fast, 1000000), '+2/min');
  assert.equal(resources.refillDescription(slow, 1000000 + 60000), 'Next +1 in 04 min');
  assert.equal(resources.tooltipTime(3599), '59 min');
  assert.equal(resources.tooltipTime(3600), '01:00');
  assert.equal(resources.tooltipTime(7261), '02:01');
  assert.equal(resources.tooltipTime(30), '01 min');
  assert.equal(resources.refillDescription({ data: { ...slow.data, amount: 20 } }, 1000000),
    'Full; refill resumes after spending');
  assert.equal(resources.refillDescription({ data: { amount: 100 } }, 1000000), null);
});

test('getSkillPoints calculates live regenerated skill points up to cap 10 and falls back to userGetInfo', () => {
  const baseTime = 1000000;
  // 1. From resource:refillable:2
  const cacheWithResource = {
    'resource:refillable:2': {
      data: {
        amount: 5,
        lastRefillAt: baseTime,
        refillEveryMs: 300000,
        refillAmount: 1,
        cap: 10,
        renewable: true
      }
    }
  };
  assert.equal(resources.getSkillPoints(cacheWithResource, baseTime + 299999), 5);
  assert.equal(resources.getSkillPoints(cacheWithResource, baseTime + 300000), 6);
  assert.equal(resources.getSkillPoints(cacheWithResource, baseTime + 300000 * 20), 10, 'Must cap at 10');

  // 2. Fallback to userGetInfo.data.refillable[id: 2] (uses soft cap 20)
  const cacheWithUser = {
    userGetInfo: {
      data: {
        refillable: [
          { id: 1, amount: 60 },
          { id: 2, amount: 3, lastRefill: baseTime / 1000 }
        ]
      }
    }
  };
  assert.equal(resources.getSkillPoints(cacheWithUser, baseTime + 300000), 4);
  assert.equal(resources.getSkillPoints(cacheWithUser, baseTime + 300000 * 10), 13);
  assert.equal(resources.getSkillPoints(cacheWithUser, baseTime + 300000 * 30), 20, 'Must cap at 20');
  assert.equal(resources.getSkillPointsCap({}), 20);
  assert.equal(resources.getSkillPointsCap({ 'resource:refillable:2': { data: { cap: 10 } } }), 10);
  assert.equal(resources.getSkillPointsCap({ 'resource:refillable:2': { data: { cap: 20 } } }), 20);

  // 3. Fallback when userGetInfo has no lastRefill
  const cacheWithUserStatic = {
    userGetInfo: {
      data: {
        refillable: [{ id: 2, amount: 7 }]
      }
    }
  };
  assert.equal(resources.getSkillPoints(cacheWithUserStatic, baseTime + 9999999), 7);

  // 4. Empty cache
  assert.equal(resources.getSkillPoints({}), 0);
  assert.equal(resources.getSkillPoints(null), 0);
});

test('getGold, getStarMoney, getEnergy, and getWorldEnergy provide canonical sources of truth with robust fallbacks', () => {
  // Gold prioritization: resource:gold.data.amount > resource:gold.value > userGetInfo.user.gold > userGetInfo.gold > coin['1']
  assert.equal(resources.getGold({ 'resource:gold': { data: { amount: 50000 } } }), 50000);
  assert.equal(resources.getGold({ 'resource:gold': { value: 40000 } }), 40000);
  assert.equal(resources.getGold({ userGetInfo: { data: { user: { gold: 30000 } } } }), 30000);
  assert.equal(resources.getGold({ userGetInfo: { data: { gold: 20000 } } }), 20000);
  assert.equal(resources.getGold({ inventoryGet: { data: { coin: { '1': 10000 } } } }), 10000);
  assert.equal(resources.getGold({}), 0);

  // StarMoney prioritization: resource:starMoney > resource:diamond > userGetInfo.user.starMoney > userGetInfo.starMoney
  assert.equal(resources.getStarMoney({ 'resource:starMoney': { data: { amount: 500 } } }), 500);
  assert.equal(resources.getStarMoney({ 'resource:diamond': { data: { amount: 400 } } }), 400);
  assert.equal(resources.getStarMoney({ userGetInfo: { data: { user: { starMoney: 300 } } } }), 300);
  assert.equal(resources.getStarMoney({ userGetInfo: { data: { starMoney: 200 } } }), 200);
  assert.equal(resources.getStarMoney({}), 0);

  // Energy & World Energy
  const t0 = 1000000;
  const energyCache = {
    'resource:energy': {
      data: { amount: 50, lastRefillAt: t0, refillEveryMs: 360000, refillAmount: 1, cap: 120 }
    }
  };
  assert.equal(resources.getEnergy(energyCache, t0 + 360000), 51);
  assert.equal(resources.getEnergy({ energyStatus: { data: { energy: 75 } } }), 75);
  assert.equal(resources.getEnergy({ userGetInfo: { data: { refillable: [{ id: 1, amount: 80 }] } } }), 80);
  assert.equal(resources.getEnergy({}), null);

  const worldCache = {
    'resource:world-energy': {
      data: { amount: 100, lastRefillAt: t0, refillEveryMs: 300000, refillAmount: 1, cap: 200 }
    }
  };
  assert.equal(resources.getWorldEnergy(worldCache, t0 + 300000), 101);
  assert.equal(resources.getWorldEnergy({ worldEnergyStatus: { data: { energy: 150 } } }), 150);
  assert.equal(resources.getWorldEnergy({}), null);
});

test('rpcCache reducer never overwrites userGetInfo skill points when world energy changes', () => {
  const initialCache = {
    userGetInfo: {
      key: 'userGetInfo',
      method: 'userGetInfo',
      feature: null,
      group: 'user',
      data: {
        id: 12345,
        gold: 1000000,
        starMoney: 5000,
        refillable: [
          { id: 1, amount: 60 },
          { id: 2, amount: 7, lastRefill: Math.floor(Date.now() / 1000) }
        ]
      },
      updatedAt: new Date().toISOString()
    },
    'resource:refillable:2': {
      key: 'resource:refillable:2',
      method: 'userGetInfo',
      feature: null,
      group: 'resources',
      data: {
        amount: 7,
        lastRefillAt: Date.now(),
        refillEveryMs: 300000,
        refillAmount: 1,
        cap: 10,
        renewable: true
      },
      updatedAt: new Date().toISOString()
    }
  };

  // Dispatch a refillableGetAll call updating World Energy (refillableId: 2) to 150
  const mergeResult = rpcCacheService.merge(initialCache, [{
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date().toISOString(),
    requestBody: JSON.stringify({
      calls: [{ name: 'refillableGetAll', feature: 'refillable', ident: 'call_1' }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'call_1',
        result: {
          response: {
            refillables: [
              { refillableId: 1, amount: 95 },
              { refillableId: 2, amount: 150, lastRefillAt: Date.now() }
            ]
          }
        }
      }]
    })
  }]);

  const updatedCache = mergeResult.cache;

  // World energy is updated to 150
  assert.equal(resources.getWorldEnergy(updatedCache), 150);
  assert.equal(updatedCache['resource:world-energy']?.data?.amount, 150);

  // Skill points MUST NOT be overwritten by world energy 150!
  const userSkillPointEntry = updatedCache.userGetInfo?.data?.refillable?.find((r) => r.id === 2);
  assert.equal(userSkillPointEntry?.amount, 7, 'userGetInfo refillable ID 2 must remain Skill Points (7), not World Energy (150)');
  assert.equal(resources.getSkillPoints(updatedCache), 7, 'Canonical skillPoints must remain 7');
});
