import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayActivityStats } from '../src/utils/activityStats.ts';

const testNow = Date.parse('2026-11-18T10:00:00Z');

test('getTodayActivityStats returns zeroes on empty cache', () => {
  const stats = getTodayActivityStats({}, testNow);
  assert.equal(stats.date, '2026-11-18');
  assert.equal(stats.extAutoJoinCount, 0);
  assert.equal(stats.gameAutoJoinCount, 0);
  assert.equal(stats.totalAutoJoinCount, 0);
  assert.equal(stats.autoJoinLosses, 0);
  assert.equal(stats.campaignCount, 0);
  assert.equal(stats.campaignLosses, 0);
  assert.equal(stats.organizedRalliesCount, 0);
  assert.equal(stats.rallyLosses, 0);
  assert.equal(stats.monstersCount, 0);
  assert.equal(stats.monsterLosses, 0);
  assert.equal(stats.brigandCampsCount, 0);
  assert.equal(stats.campLosses, 0);
  assert.equal(stats.campaignEnergySpent, 0);
  assert.equal(stats.worldEnergySpent, 0);
  assert.equal(stats.totalEnergySpent, 0);
});

test('getTodayActivityStats aggregates extension vs game auto joins, campaign, rallies, monsters, and energy', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    priorityAutoJoinedRallies: {
      data: ['rally-1', 'rally-2', 'rally-3'],
    },
    marchStatus: {
      data: {
        marches: [
          // Organized rally
          { rally: { rallyId: 'rally-org', isLeader: true } },
          // Extension auto-join (in list already)
          { rally: { rallyId: 'rally-1', autoJoinSource: 'extension', isHelperAutoJoin: true } },
          // Game auto-join
          { rally: { rallyId: 'rally-game', autoJoinSource: 'game', isAutoJoin: true } },
          // Active monster hunt
          { mob: { mobId: 'mob-1' } },
        ],
      },
    },
    campaignRaidReceipts: {
      data: [
        { at: '2026-11-18T05:00:00Z', times: 10, missionId: 135 },
        { at: '2026-11-18T08:30:00Z', times: 5, missionId: 140 },
        { at: '2026-11-17T08:30:00Z', times: 20, missionId: 140 }, // Yesterday, should be ignored
      ],
    },
    battleReportSummary: {
      data: {
        days: {
          '2026-11-18': {
            types: {
              rallyMobAttackResult: 6, // 1 organized + 3 ext + 2 game
              soloMobAttackResult: 4,  // 4 monsters
              campBattleResult: 2,     // 2 brigand camps
            },
          },
        },
      },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.date, '2026-11-18');
  assert.equal(stats.extAutoJoinCount, 3);
  assert.equal(stats.gameAutoJoinCount, 2); // 6 total - 1 org - 3 ext = 2 game auto joins
  assert.equal(stats.totalAutoJoinCount, 5);
  assert.equal(stats.campaignCount, 15);    // 10 + 5
  assert.equal(stats.organizedRalliesCount, 1);
  assert.equal(stats.monstersCount, 4);
  assert.equal(stats.brigandCampsCount, 2);

  // Campaign Energy: 15 * 6 = 90
  assert.equal(stats.campaignEnergySpent, 90);

  // World Energy: Only organized rallies (1 * 25) + monsters (4 * 10) + camps (2 * 10) = 25 + 40 + 20 = 85
  // (Joining rallies costs 0 World Energy)
  assert.equal(stats.worldEnergySpent, 85);

  // Total Energy: 90 + 85 = 175
  assert.equal(stats.totalEnergySpent, 175);
});

test('getTodayActivityStats extracts rally, monster, and campaign losses from reports', () => {
  const cache = {
    mailStatus: {
      data: {
        reports: [
          // Rally loss as leader
          { id: 'rep-1', type: 'rallyMobAttackResult', createdAt: testNow - 1000, result: 'defeat', isLeader: true },
          // Rally loss as auto-join participant
          { id: 'rep-2', type: 'rallyMobAttackResult', createdAt: testNow - 2000, result: 'lose', isLeader: false },
          // Solo monster loss
          { id: 'rep-3', type: 'soloMobAttackResult', createdAt: testNow - 3000, payload: { result: 'defeat' } },
          // Solo monster win
          { id: 'rep-4', type: 'soloMobAttackResult', createdAt: testNow - 4000, payload: { result: 'win' } },
        ],
      },
    },
    lastCampaignRaidResult: {
      updatedAt: '2026-11-18T09:00:00Z',
      data: { success: false },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.organizedRalliesCount, 1);
  assert.equal(stats.rallyLosses, 1);
  assert.equal(stats.autoJoinLosses, 1);
  assert.equal(stats.monsterLosses, 1);
  assert.equal(stats.campaignLosses, 1);
  assert.equal(stats.campLosses, 0);
});

test('getTodayActivityStats tracks rallies led from createdRalliesHistory and computes World Energy', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    createdRalliesHistory: {
      data: [
        { rallyId: 'rally-lead-1', timestamp: testNow - 60000, mobId: 'mob-1' },
        { rallyId: 'rally-lead-2', timestamp: testNow - 120000, mobId: 'mob-2' },
        { rallyId: 'rally-old', timestamp: testNow - 86400000 * 2, mobId: 'mob-old' }, // 2 days ago
      ],
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.organizedRalliesCount, 2);
  // 2 rallies led * 25 energy = 50 World Energy
  assert.equal(stats.worldEnergySpent, 50);
});

test('getTodayActivityStats tracks rallies led from raidQueue immediately upon start/dispatch', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    raidQueue: {
      phase: 'active',
      started: 3,
      completed: 2,
      createdRallyIds: ['rally-q-1', 'rally-q-2', 'rally-q-3'],
      current: { rallyId: 'rally-q-3' },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.organizedRalliesCount, 3);
  assert.equal(stats.worldEnergySpent, 75);
});

test('getTodayActivityStats tracks rallies led from battle reports without misattributing to game auto-joins', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    mailStatus: {
      data: {
        reports: [
          // Won rally hosted by player
          {
            id: 'rep-lead-win',
            type: 'rallyMobAttackResult',
            createdAt: testNow - 5000,
            result: 'win',
            isLeader: true,
            payload: { rallyId: 'rally-won-1', isLeader: true },
          },
          // Lost rally hosted by player
          {
            id: 'rep-lead-loss',
            type: 'rallyMobAttackResult',
            createdAt: testNow - 10000,
            result: 'defeat',
            isLeader: true,
            payload: { rallyId: 'rally-loss-1', isLeader: true },
          },
          // Extension auto-joined rally
          {
            id: 'rep-ext-join',
            type: 'rallyMobAttackResult',
            createdAt: testNow - 15000,
            result: 'win',
            isLeader: false,
            payload: { rallyId: 'rally-ext-1', isLeader: false },
          },
        ],
      },
    },
    priorityAutoJoinedRallies: {
      data: ['rally-ext-1'],
    },
    battleReportSummary: {
      data: {
        days: {
          '2026-11-18': {
            types: {
              rallyMobAttackResult: 3, // 2 led + 1 ext
            },
          },
        },
      },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.organizedRalliesCount, 2);
  assert.equal(stats.rallyLosses, 1);
  assert.equal(stats.extAutoJoinCount, 1);
  // Total 3 reports - 2 led - 1 ext = 0 unassigned, NOT falsely counted as game auto joins!
  assert.equal(stats.gameAutoJoinCount, 0);
  assert.equal(stats.worldEnergySpent, 50); // 2 led * 25
});
