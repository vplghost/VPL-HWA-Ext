import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruneStorageData,
  executeStoragePrune,
  LEGACY_PRUNE_KEYS,
} from '../src/utils/dataBackup.ts';

test('pruneStorageData removes interaction logs and legacy keys without touching user config', () => {
  const sampleStorage = {
    // User configuration & queues (must be preserved)
    theme: 'dark',
    tabConfig: { visibleTabs: ['dashboard'] },
    customTeams: [{ id: 1, name: 'Main Team' }],
    buildingQueue: { active: ['b1'] },
    researchQueue: { active: ['r1'] },
    resourceSelection: { target: 'gold' },
    squadPreference_100: { gatherTeam: 1 },

    // Interaction logs (must be removed)
    'interaction:0': { timestamp: '2026-11-20T10:00:00Z', target: 'canvas' },
    'interaction:1': { timestamp: '2026-11-20T10:00:01Z', target: 'button' },
    'interaction:999': { timestamp: '2026-11-20T10:05:00Z', target: 'div' },

    // Legacy / obsolete keys (must be removed)
    apiRecords: [{ id: 'old1' }],
    claimRpcStatus: { state: 'complete' },
    claimAllRpcStatus: { state: 'complete' },
    frontierClaimStatus: { state: 'idle' },
    _claimRpcStatus: { state: 'idle' },
    hwa_last_rpc_headers: '{"x-application-version":"1.290.0"}',
    hwa_game_version: '1.290.0',
  };

  const result = pruneStorageData(sampleStorage);

  // Check removed keys
  assert.equal(result.summary.removedInteractions, 3);
  assert.equal(result.summary.removedLegacyKeys, 7);
  assert.ok(result.keysToRemove.includes('interaction:0'));
  assert.ok(result.keysToRemove.includes('interaction:1'));
  assert.ok(result.keysToRemove.includes('interaction:999'));
  assert.ok(result.keysToRemove.includes('apiRecords'));
  assert.ok(result.keysToRemove.includes('claimRpcStatus'));
  assert.ok(result.keysToRemove.includes('claimAllRpcStatus'));
  assert.ok(result.keysToRemove.includes('frontierClaimStatus'));
  assert.ok(result.keysToRemove.includes('_claimRpcStatus'));
  assert.ok(result.keysToRemove.includes('hwa_last_rpc_headers'));
  assert.ok(result.keysToRemove.includes('hwa_game_version'));

  // Ensure configs were not targeted for removal or updates
  assert.ok(!result.keysToRemove.includes('theme'));
  assert.ok(!result.keysToRemove.includes('tabConfig'));
  assert.ok(!result.keysToRemove.includes('customTeams'));
  assert.ok(!result.keysToRemove.includes('buildingQueue'));
  assert.ok(!result.keysToRemove.includes('researchQueue'));
  assert.ok(!result.keysToRemove.includes('resourceSelection'));
  assert.ok(!result.keysToRemove.includes('squadPreference_100'));
});

test('pruneStorageData trims oversized queue logs, activity history, and dungeon battles', () => {
  const overBuildingLogs = Array.from({ length: 80 }, (_, i) => ({ id: `b-${i}` }));
  const overResearchLogs = Array.from({ length: 65 }, (_, i) => ({ id: `r-${i}` }));
  const overDailyHistory = Array.from({ length: 45 }, (_, i) => ({ date: `2026-10-${i}` }));
  const overDungeonRecords = Array.from({ length: 70 }, (_, i) => ({ id: `d-${i}` }));

  const sampleStorage = {
    buildingQueueLogs: overBuildingLogs,
    researchQueueLogs: overResearchLogs,
    dailyActivityHistory: overDailyHistory,
    dungeonBattleHistory: {
      'enc:1_vs_2': overDungeonRecords,
      'enc:3_vs_4': [{ id: 'small-1' }],
    },
  };

  const result = pruneStorageData(sampleStorage);

  assert.equal(result.updatesToSet.buildingQueueLogs.length, 50);
  assert.equal(result.updatesToSet.buildingQueueLogs[0].id, 'b-0'); // keeps newest 50
  assert.equal(result.updatesToSet.researchQueueLogs.length, 50);
  assert.equal(result.updatesToSet.researchQueueLogs[0].id, 'r-0'); // keeps newest 50
  assert.equal(result.updatesToSet.dailyActivityHistory.length, 30);
  assert.equal(result.updatesToSet.dailyActivityHistory[29].date, '2026-10-44'); // keeps latest 30

  // Dungeon history encounter trimmed
  assert.equal(result.updatesToSet.dungeonBattleHistory['enc:1_vs_2'].length, 50);
  assert.equal(result.updatesToSet.dungeonBattleHistory['enc:3_vs_4'].length, 1);
  assert.equal(result.summary.trimmedLogEntries, (80 - 50) + (65 - 50) + (45 - 30) + (70 - 50));
});

test('pruneStorageData returns empty actions when storage has no bloated or obsolete items', () => {
  const cleanStorage = {
    theme: 'dark',
    customTeams: [],
    buildingQueueLogs: [{ id: '1' }],
    researchQueueLogs: [{ id: '2' }],
    dailyActivityHistory: [{ date: '2026-11-21' }],
    dungeonBattleHistory: { 'enc:1_vs_2': [{ id: '1' }] },
  };

  const result = pruneStorageData(cleanStorage);
  assert.equal(result.keysToRemove.length, 0);
  assert.equal(Object.keys(result.updatesToSet).length, 0);
  assert.equal(result.summary.totalPrunedKeys, 0);
});

test('executeStoragePrune removes and updates keys in storage mock', async () => {
  let stored = {
    theme: 'dark',
    'interaction:0': { data: 1 },
    'interaction:1': { data: 2 },
    apiRecords: [1, 2, 3],
    buildingQueueLogs: Array.from({ length: 60 }, (_, i) => ({ id: i })),
  };

  const removedKeys = [];
  const setPayloads = [];

  const mockStorage = {
    async get(keys) {
      if (keys === null) return { ...stored };
      const res = {};
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) {
        if (k in stored) res[k] = stored[k];
      }
      return res;
    },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      removedKeys.push(...arr);
      for (const k of arr) {
        delete stored[k];
      }
    },
    async set(items) {
      setPayloads.push(items);
      Object.assign(stored, items);
    },
  };

  const summary = await executeStoragePrune(mockStorage);
  assert.equal(summary.removedInteractions, 2);
  assert.equal(summary.removedLegacyKeys, 1);
  assert.equal(summary.trimmedLogEntries, 10);
  assert.ok(removedKeys.includes('interaction:0'));
  assert.ok(removedKeys.includes('interaction:1'));
  assert.ok(removedKeys.includes('apiRecords'));
  assert.equal(stored.buildingQueueLogs.length, 50);
  assert.equal(stored.theme, 'dark'); // preserved
});
