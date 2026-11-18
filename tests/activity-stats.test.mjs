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
  assert.equal(stats.campaignCount, 0);
  assert.equal(stats.organizedRalliesCount, 0);
  assert.equal(stats.monstersCount, 0);
  assert.equal(stats.brigandCampsCount, 0);
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
