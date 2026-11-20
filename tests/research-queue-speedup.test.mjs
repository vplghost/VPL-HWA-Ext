import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

test('speedup action matches target even when row IDs or levels are string variants in cache', () => {
  const now = 1795180000000;
  const isoNow = new Date(now).toISOString();
  // Queue in cache with string researchId and string level (frequent in raw API responses)
  const initialCache = {
    accountStatus: { data: { id: 1 } },
    researchStatus: {
      method: 'startResearch',
      updatedAt: new Date(now - 60000).toISOString(),
      data: {
        queues: [
          { researchId: '122', level: '4', startDate: now - 30000, durationMs: 180000, queueNumber: 0 }
        ]
      }
    },
    speedupInventory: {
      updatedAt: isoNow,
      data: {
        accountId: '1',
        items: [{ type: 'speedUpResearch', id: 1, quantity: 5 }]
      }
    }
  };

  // Game sends speedUpResearchWithResources where researchId is number and nextLevel is number
  const record = {
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    timestamp: isoNow,
    requestBody: JSON.stringify({
      calls: [{
        name: 'speedUpResearchWithResources',
        feature: 'personalResearch',
        ident: 'abc123',
        args: {
          researchId: 122,
          nextLevel: 4,
          speedUpDate: now,
          resourcesToSpend: [{ type: 'speedUpResearch', id: 1, amount: 2 }],
          resourcesToReward: []
        }
      }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'abc123', result: { response: {} } }]
    })
  };

  const result = rpcCacheService.merge(initialCache, [record]);
  assert.ok(result.changed, 'Cache should change');
  const updatedStatus = result.cache.researchStatus;
  assert.equal(updatedStatus.updatedAt, isoNow, 'Updated timestamp must match speedup record');
  assert.equal(updatedStatus.data.queues[0].durationMs, 60000, 'Duration should decrease by 120000 (2 * 60s)');
  assert.ok(result.cache.speedupStatus?.data?.appliedTimer, 'Timer should be applied despite string IDs in cache');

  // Second speedup reduces duration to 0
  const record2 = {
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    timestamp: new Date(now + 1000).toISOString(),
    requestBody: JSON.stringify({
      calls: [{
        name: 'speedUpResearchWithResources',
        feature: 'personalResearch',
        ident: 'abc456',
        args: {
          researchId: 122,
          nextLevel: 4,
          speedUpDate: now + 1000,
          resourcesToSpend: [{ type: 'speedUpResearch', id: 1, amount: 1 }],
          resourcesToReward: []
        }
      }]
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'abc456', result: { response: {} } }]
    })
  };

  const result2 = rpcCacheService.merge(result.cache, [record2]);
  assert.equal(result2.cache.researchStatus.data.queues[0].durationMs, 0, 'Duration should decrease by 60000 to 0');
});

test('research queue does not get stuck in verify when research is in progress or completed via speedup', async () => {
  const clock = { now: 1795181761737 };
  const sentMessages = [];
  const local = {};

  const chromeMock = {
    storage: {
      local: {
        get: async (keys) => {
          const res = {};
          const kArray = Array.isArray(keys) ? keys : [keys];
          for (const k of kArray) if (k in local) res[k] = local[k];
          return res;
        },
        set: async (obj) => Object.assign(local, obj)
      }
    },
    alarms: {
      create: () => {},
      get: (_, cb) => cb?.(null)
    },
    tabs: {
      query: (_, cb) => setTimeout(() => cb([{ id: 10, url: 'https://www.hero-wars-alliance.com/' }]), 0),
      reload: async () => {},
      sendMessage: async (tabId, msg) => {
        sentMessages.push({ tabId, msg });
        return { ok: true };
      }
    }
  };

  const origNow = Date.now;
  Date.now = () => clock.now;

  try {
    const bg = setupBackgroundRuntime({ chrome: chromeMock });

    // Scenario 1: Active research in progress (2 hours remaining), recently shortened by speedup
    // Method may be 'startResearch' or 'getSummary' and updatedAt is fresh (within 60s)
    local.popupRpcEnabled = true;
    local.socketRefreshMode = 'piggyback';
    local.researchQueue = {
      enabled: true,
      items: [{ researchId: 125, nextLevel: 2, durationMs: 100000 }]
    };
    local.rpcCache = {
      accountStatus: { data: { id: 1 } },
      researchStatus: {
        method: 'startResearch',
        updatedAt: new Date(clock.now - 5000).toISOString(), // 5 seconds ago
        data: {
          queues: [
            { researchId: 122, level: 4, startDate: clock.now - 60000, durationMs: 7200000, queueNumber: 0 } // Ends in ~119 mins
          ]
        }
      }
    };

    // Run city queue for research
    await bg.advanceResearchQueue(10);

    // Queue must recognize in-progress research and wait without verify
    const verifyLogs = (local.researchQueueLogs || []).filter(l => l.action === 'verify');
    assert.equal(verifyLogs.length, 0, 'Must NOT trigger verify while an active research is in progress with fresh status');
    const waitLogs = (local.researchQueueLogs || []).filter(l => l.action === 'wait');
    assert.equal(waitLogs.length, 1, 'Must plan wait for ongoing research');

    // Scenario 2: Research just finished via speedup (durationMs = 0), updatedAt is current
    local.researchQueueLogs = [];
    local.rpcCache.researchStatus = {
      method: 'startResearch', // previous method before speedup
      updatedAt: new Date(clock.now).toISOString(),
      data: {
        queues: [
          { researchId: 122, level: 4, startDate: clock.now - 600000, durationMs: 0, queueNumber: 0 }
        ]
      }
    };

    await bg.advanceResearchQueue(10);

    // Check sent message: must dispatch completeResearch + startResearch immediately!
    const queueDispatches = sentMessages.filter(s => s.msg.group === 'research-queue');
    assert.ok(queueDispatches.length > 0, 'Must dispatch next research step');
    const calls = queueDispatches[0].msg.calls;
    assert.equal(calls[0].name, 'completeResearch', 'First call should be completeResearch');
    assert.equal(calls[0].args.researchId, 122);
    assert.equal(calls[1].name, 'startResearch', 'Second call should be startResearch');
    assert.equal(calls[1].args.researchId, 125);

    // Verify logs must NOT contain stale cache error
    const staleVerifyLogs = (local.researchQueueLogs || []).filter(
      l => l.action === 'verify' && l.message?.includes('Cached occupancy is missing')
    );
    assert.equal(staleVerifyLogs.length, 0, 'Must NOT log Cached occupancy is missing after speedup completion');
  } finally {
    Date.now = origNow;
  }
});
