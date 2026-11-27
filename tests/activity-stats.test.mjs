import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTodayActivityStats,
  getActivityStatsForDay,
  resolvePersonalTitaniteToday,
  recordPriorityAutoJoinDaily,
  persistDailyActivityStats,
} from '../src/utils/activityStats.ts';

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
  assert.equal(stats.dungeonBattlesToday, 0);
  assert.equal(stats.personalTitaniteToday, 0);
  assert.equal(stats.frontierStagesToday, 0);
  assert.equal(stats.frontierCoinsToday, 0);
  assert.equal(stats.campaignEnergySpent, 0);
  assert.equal(stats.worldEnergySpent, 0);
  assert.equal(stats.totalEnergySpent, 0);
});

test('getTodayActivityStats aggregates extension vs game auto joins, campaign, rallies, monsters, and energy', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    priorityAutoJoinedRallies: {
      data: ['rally-1', 'rally-2', 'rally-3'],
      dailyCounts: { '2026-11-18': 3 },
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

test('getTodayActivityStats tracks brigand camps from brigandCampHistory and brigandCampStatus', () => {
  const cache = {
    brigandCampHistory: {
      data: [
        { campId: 'camp-1', at: '2026-11-18T04:00:00Z', success: true },
        { campId: 'camp-2', at: '2026-11-18T06:00:00Z', success: true },
        { campId: 'camp-yesterday', at: '2026-11-17T06:00:00Z', success: true },
      ],
    },
    brigandCampStatus: {
      updatedAt: '2026-11-18T08:00:00Z',
      data: { success: true, campId: 'camp-3' },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.brigandCampsCount, 3);
  assert.equal(stats.worldEnergySpent, 30); // 3 camps * 10
});

test('getTodayActivityStats tracks dungeon battles and personal titanite progress', () => {
  const cache = {
    dungeonStatus: {
      updatedAt: '2026-11-18T08:00:00Z',
      data: {
        floorNumber: 52,
        dungeonActivity: 186,
        todayTitanite: 186,
        dailyCombatLog: {
          date: 'Wed Nov 18 2026',
          totalBattles: 14,
          flawlessCount: 12,
          casualtyBattles: [
            { floorNumber: 50, win: true, casualties: [101] },
            { floorNumber: 51, win: true, casualties: [102] },
          ],
        },
      },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.dungeonBattlesToday, 14);
  assert.equal(stats.personalTitaniteToday, 186);
});

test('getTodayActivityStats tracks frontier stages cleared and reward coins', () => {
  const cache = {
    eternalStoryDailyProgress: {
      updatedAt: '2026-11-18T09:00:00Z',
      data: {
        date: 'Wed Nov 18 2026',
        clearedCount: 4,
        clearedStages: [11, 12, 13, 14],
        coinsEarned: 4000,
      },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  assert.equal(stats.frontierStagesToday, 4);
  assert.equal(stats.frontierCoinsToday, 4000);
});

test('getTodayActivityStats attributes unassigned rally losses from summary to autoJoinLosses', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    battleReportSummary: {
      data: {
        days: {
          '2026-11-18': {
            losses: 2,
            types: {
              rallyMobAttackResult: 5,
            },
          },
        },
      },
    },
  };

  const stats = getTodayActivityStats(cache, testNow);
  // Summary had 2 losses during rallies with no leader loss specified -> assigned to autoJoinLosses
  assert.equal(stats.autoJoinLosses, 2);
  assert.equal(stats.rallyLosses, 0);
});

test('getTodayActivityStats & getActivityStatsForDay preserve actual campaign energy from campaignDailySummary', () => {
  const cache = {
    campaignDailySummary: {
      updatedAt: '2026-11-18T09:30:00Z',
      data: {
        days: {
          '2026-11-18': { count: 8, energy: 88 }, // 3x16 Heroic + 5x8 Normal = 88 (NOT 8*6 = 48)
          '2026-11-17': { count: 5, energy: 60 }, // 5x12 Heroic = 60
        },
        recentIdents: ['m1', 'm2'],
      },
    },
  };

  const live = getTodayActivityStats(cache, testNow);
  assert.equal(live.campaignCount, 8);
  assert.equal(live.campaignEnergySpent, 88);
  assert.equal(live.totalEnergySpent, 88);

  // Merging with older stored history must preserve actual 88 energy (not overwrite with 8*6=48)
  const mergedToday = getActivityStatsForDay(cache, '2026-11-18', {
    '2026-11-18': { ...live, campaignCount: 6, campaignEnergySpent: 64, totalEnergySpent: 64 },
  }, testNow);
  assert.equal(mergedToday.campaignCount, 8);
  assert.equal(mergedToday.campaignEnergySpent, 88);
  assert.equal(mergedToday.totalEnergySpent, 88);

  // Past day resolution also uses actual energy from summary
  const pastDay = getActivityStatsForDay(cache, '2026-11-17', {}, testNow);
  assert.equal(pastDay.campaignCount, 5);
  assert.equal(pastDay.campaignEnergySpent, 60);
});

test('resolvePersonalTitaniteToday uses uncapped guildStatus & max across Titanite quests even when dungeonStatus.todayTitanite is 0', () => {
  const cache = {
    accountStatus: { data: { id: 100 } },
    dungeonStatus: {
      updatedAt: '2026-11-18T08:00:00Z',
      data: {
        todayTitanite: 0, // Initialized to 0 by dungeonGetInfo
        dailyCombatLog: { date: '2026-11-18', todayTitanite: 0, totalBattles: 0 },
      },
    },
    questGetAll: {
      updatedAt: '2026-11-18T08:05:00Z',
      data: [
        { id: 10031, progress: 75 },  // Capped at 75
        { id: 10032, progress: 150 }, // Capped at 150
      ],
    },
    guildStatus: {
      updatedAt: '2026-11-18T08:10:00Z',
      data: {
        accountId: '100',
        members: {
          100: { stats: { todayDungeonActivity: 245 } }, // Uncapped personal titanite
        },
      },
    },
  };

  assert.equal(resolvePersonalTitaniteToday(cache, testNow), 245);
  assert.equal(getTodayActivityStats(cache, testNow).personalTitaniteToday, 245);

  // Without guildStatus, picks max across quests (150, not stuck at quest 10031's 75)
  const noGuild = { ...cache, guildStatus: undefined };
  assert.equal(resolvePersonalTitaniteToday(noGuild, testNow), 150);

  // Yesterday's guildStatus/quests are ignored on a new UTC day
  const staleCache = {
    ...cache,
    guildStatus: { ...cache.guildStatus, updatedAt: '2026-11-17T23:59:00Z' },
    questGetAll: { ...cache.questGetAll, updatedAt: '2026-11-17T23:59:00Z' },
  };
  assert.equal(resolvePersonalTitaniteToday(staleCache, testNow), 0);
});


test('P1-20: 200-cap priorityAutoJoinedRallies ring buffer never leaks into daily extAutoJoinCount and gameAutoJoinCount recovers', () => {
  const twoHundredIds = Array.from({ length: 200 }, (_, i) => `old-rally-${i + 1}`);
  const cacheWithDaily = {
    priorityAutoJoinedRallies: {
      data: twoHundredIds,
      dailyCounts: { '2026-11-17': 15, '2026-11-18': 4 },
    },
    battleReportSummary: {
      data: {
        days: {
          '2026-11-18': {
            types: { rallyMobAttackResult: 12 }, // 0 org + 4 ext + 8 game
          },
        },
      },
    },
  };

  const todayStats = getTodayActivityStats(cacheWithDaily, testNow);
  assert.equal(todayStats.extAutoJoinCount, 4, 'Must use today UTC dailyCounts instead of 200-cap data.length');
  assert.equal(todayStats.gameAutoJoinCount, 8, 'Must recover gameAutoJoinCount = 12 - 0 - 4 = 8');
  assert.equal(todayStats.autoJoinV2, true);

  // New UTC day rollover: no entry for 2026-11-19 -> extAutoJoinCount must be 0, not 200
  const nextDayNow = Date.parse('2026-11-19T01:00:00Z');
  const nextDayStats = getTodayActivityStats(cacheWithDaily, nextDayNow);
  assert.equal(nextDayStats.extAutoJoinCount, 0);
  assert.equal(nextDayStats.gameAutoJoinCount, 0);
});

test('P1-20: recordPriorityAutoJoinDaily deduplicates IDs, caps data at 200, prunes dailyCounts to 7 UTC days, and self-heals stale 200 history', async () => {
  let entry = null;
  for (let d = 1; d <= 9; d++) {
    const dayTs = Date.parse(`2026-11-0${d}T12:00:00Z`);
    entry = recordPriorityAutoJoinDaily(entry, `r-${d}-a`, dayTs);
    entry = recordPriorityAutoJoinDaily(entry, `r-${d}-a`, dayTs); // duplicate ignored
    entry = recordPriorityAutoJoinDaily(entry, `r-${d}-b`, dayTs);
  }
  assert.equal(Object.keys(entry.dailyCounts).length, 7, 'dailyCounts must be pruned to last 7 UTC days');
  assert.equal(entry.dailyCounts['2026-11-09'], 2, 'Duplicate rallyId must not double-increment');
  assert.equal(entry.dailyCounts['2026-11-01'], undefined);

  // Self-heal poisoned legacy dailyActivityHistory (missing autoJoinV2, stuck at 200 Ext / 1 Game)
  const poisonedHistory = {
    '2026-11-18': {
      date: '2026-11-18',
      extAutoJoinCount: 200,
      gameAutoJoinCount: 1,
      totalAutoJoinCount: 201,
      autoJoinLosses: 0,
      campaignCount: 5,
      campaignLosses: 0,
      organizedRalliesCount: 0,
      rallyLosses: 0,
      monstersCount: 0,
      monsterLosses: 0,
      brigandCampsCount: 0,
      campLosses: 0,
      dungeonBattlesToday: 0,
      personalTitaniteToday: 0,
      frontierStagesToday: 0,
      frontierCoinsToday: 0,
      campaignEnergySpent: 30,
      worldEnergySpent: 0,
      totalEnergySpent: 30,
    },
  };
  const liveCache = {
    priorityAutoJoinedRallies: { data: Array.from({ length: 200 }, (_, i) => `r-${i}`), dailyCounts: { '2026-11-18': 3 } },
    battleReportSummary: { data: { days: { '2026-11-18': { types: { rallyMobAttackResult: 10 } } } } },
  };

  const healedView = getActivityStatsForDay(liveCache, '2026-11-18', poisonedHistory, testNow);
  assert.equal(healedView.extAutoJoinCount, 3);
  assert.equal(healedView.gameAutoJoinCount, 7);
  assert.equal(healedView.autoJoinV2, true);

  const memStore = { dailyActivityHistory: poisonedHistory };
  const mockChrome = {
    storage: {
      local: {
        get: async () => ({ ...memStore }),
        set: async (patch) => Object.assign(memStore, patch),
      },
    },
  };
  const persisted = await persistDailyActivityStats(healedView, mockChrome, testNow);
  assert.equal(persisted['2026-11-18'].extAutoJoinCount, 3);
  assert.equal(persisted['2026-11-18'].gameAutoJoinCount, 7);
  assert.equal(persisted['2026-11-18'].autoJoinV2, true);
});
