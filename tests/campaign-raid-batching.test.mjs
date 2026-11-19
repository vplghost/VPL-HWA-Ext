import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { rpcCacheService } from '../src/core/cache/index.ts';

const root = resolve(import.meta.dirname, '..');

test('rpcCache accumulates multiple missionRaid results within the same response batch', () => {
  const initialCache = {
    missionGetAll: {
      data: [
        { id: 101, triesSpent: 0 }
      ]
    },
    inventoryGet: {
      data: {
        fragmentGear: { '50': 2 },
        gear: {}
      }
    },
    'resource:energy': {
      data: { amount: 100 }
    }
  };

  const timestamp = new Date().toISOString();
  // Simulate 3 missionRaid calls in a single batch response
  const batchRecords = [
    {
      method: 'POST',
      status: 200,
      transport: 'fetch',
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      timestamp,
      requestBody: JSON.stringify({
        calls: [
          { name: 'missionRaid', args: { id: 101, times: 1 }, ident: 'call_1' },
          { name: 'missionRaid', args: { id: 101, times: 1 }, ident: 'call_2' },
          { name: 'missionRaid', args: { id: 101, times: 1 }, ident: 'call_3' }
        ]
      }),
      responseBody: JSON.stringify({
        results: [
          {
            ident: 'call_1',
            result: {
              response: {
                '0': {
                  gold: 500,
                  experience: 6,
                  fragmentGear: { '50': 1 }
                }
              }
            }
          },
          {
            ident: 'call_2',
            result: {
              response: {
                '0': {
                  gold: 500,
                  experience: 6,
                  fragmentGear: { '50': 1 }
                }
              }
            }
          },
          {
            ident: 'call_3',
            result: {
              response: {
                '0': {
                  gold: 500,
                  experience: 6
                  // no fragment dropped in 3rd run
                }
              }
            }
          }
        ]
      })
    }
  ];

  const merged = rpcCacheService.merge(initialCache, batchRecords);
  const cache = merged.cache;

  // 1. lastCampaignRaidResult should accumulate all 3 raids
  const lastRaid = cache.lastCampaignRaidResult?.data;
  assert.ok(lastRaid, 'lastCampaignRaidResult must exist');
  assert.equal(lastRaid.times, 3, 'Total times should be 3');
  assert.equal(lastRaid.drops.gold, 1500, 'Gold should be accumulated (500 * 3 = 1500)');
  assert.equal(lastRaid.drops.fragmentGear['50'], 2, 'Dropped 2 fragments across the 3 runs');

  // 2. inventoryGet should include initial (2) + newly dropped (2) = 4
  assert.equal(cache.inventoryGet.data.fragmentGear['50'], 4, 'Inventory should have 4 fragments');

  // 3. mission triesSpent should be incremented by 3
  const mission = cache.missionGetAll.data.find(m => m.id === 101);
  assert.equal(mission.triesSpent, 3, 'Tries spent should be incremented by 3');
});

test('CampaignRaidModal builds multi-call batches capped by min(itemsNeeded, raidsPossible)', async () => {
  const modalPath = join(root, 'src/components/dialogs/CampaignRaidModal.vue');
  const content = await readFile(modalPath, 'utf8');

  // Verify multi-call generation in executeRaidCall
  assert.match(content, /for\s*\(\s*let\s+k\s*=\s*0;\s*k\s*<\s*numCalls;\s*k\+\+\s*\)/,
    'executeRaidCall must build multiple missionRaid calls with times: 1');
  assert.match(content, /times:\s*1/, 'Each call in the batch must have times: 1');

  // Verify batch size formula: min(items needed, raids possible)
  assert.match(content, /Math\.min\(\s*itemsNeeded\s*,\s*raidsPossible\s*\)/,
    'Batch size must be calculated as min(itemsNeeded, raidsPossible)');

  // Verify auto-stop condition checks in executeSequentialLoop
  assert.match(content, /freshStock\s*>=\s*targetLeaf\.requiredCount/,
    'Must auto-stop when targetLeaf requirement is met');
  assert.match(content, /isNodeRequirementMet\(freshNode\)/,
    'Must auto-stop when recipe node requirement is met');
});
