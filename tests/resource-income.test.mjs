import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUtcDay,
  getUtcDayOffset,
  getDateRangeDays,
  getDefaultPrevious7DaysRange,
  aggregateIncomeByDate,
  getTodayIncome,
  getDailyIncomeTrend,
  formatCompactNumber,
  INCOME_SOURCES,
} from '../src/utils/resourceIncome.ts';

test('resourceIncome date utilities produce correct UTC bounds', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  assert.equal(formatUtcDay(fixedNow), '2026-11-15');
  assert.equal(getUtcDayOffset(fixedNow, -1), '2026-11-14');
  assert.equal(getUtcDayOffset(fixedNow, -7), '2026-11-08');

  const defaultRange = getDefaultPrevious7DaysRange(fixedNow);
  assert.equal(defaultRange.fromDate, '2026-11-08');
  assert.equal(defaultRange.toDate, '2026-11-14');

  // Must not include today (2026-11-15)
  assert.ok(!getDateRangeDays(defaultRange.fromDate, defaultRange.toDate).includes('2026-11-15'));
  assert.equal(getDateRangeDays(defaultRange.fromDate, defaultRange.toDate).length, 7);
});

test('getDateRangeDays handles single-day, multi-day, and inverted ranges', () => {
  assert.deepEqual(getDateRangeDays('2026-11-10', '2026-11-12'), [
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
  ]);
  assert.deepEqual(getDateRangeDays('2026-11-10', '2026-11-10'), ['2026-11-10']);
  assert.deepEqual(getDateRangeDays('2026-11-12', '2026-11-10'), []);
});

test('aggregateIncomeByDate extracts battle reports, free alchemy spins, and mail letters', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    battleReportSummary: {
      data: {
        accountId: 'acc123',
        days: {
          '2026-11-14': {
            total: 10,
            rewards: {
              'resource:gold': 150000,
              'resource:starMoney': 30,
            },
          },
          '2026-11-15': {
            total: 5,
            rewards: {
              'resource:gold': 80000,
            },
          },
        },
      },
    },
    mailClaimReceipts: {
      data: [
        {
          token: 'mail-tok-1',
          kind: 'letters',
          success: true,
          at: '2026-11-15T08:00:00.000Z',
          reward: {
            'letter-101': [
              { type: 'gold', amount: 50000 },
              { type: 'starMoney', amount: 100 },
            ],
          },
        },
      ],
    },
    freeAlchemySpinAction: {
      updatedAt: '2026-11-15T09:30:00.000Z',
      data: {
        token: 'alchemy-spin-1',
        success: true,
        gold: 73800,
      },
    },
  };

  const days = aggregateIncomeByDate(mockCache, fixedNow);

  // Check 2026-11-14 (yesterday)
  const day14 = days.get('2026-11-14');
  assert.ok(day14);
  assert.equal(day14.gold, 150000);
  assert.equal(day14.emerald, 30);
  assert.equal(day14.goldBySource.battles, 150000);

  // Check 2026-11-15 (today)
  const today = getTodayIncome(mockCache, fixedNow);
  assert.equal(today.date, '2026-11-15');
  // Gold: 80,000 (battles) + 50,000 (mail letter) + 73,800 (alchemy) = 203,800
  assert.equal(today.gold, 203800);
  assert.equal(today.goldBySource.battles, 80000);
  assert.equal(today.goldBySource.mail, 50000);
  assert.equal(today.goldBySource.alchemy, 73800);
  // Emerald: 100 (mail letter)
  assert.equal(today.emerald, 100);
  assert.equal(today.emeraldBySource.mail, 100);
});

test('getDailyIncomeTrend defaults to previous 7 days excluding current day and fills zero days', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    battleReportSummary: {
      data: {
        days: {
          '2026-11-10': {
            rewards: { 'resource:gold': 50000 },
          },
          '2026-11-15': {
            rewards: { 'resource:gold': 999999 }, // Today must be excluded from default 7-day trend
          },
        },
      },
    },
  };

  const trend = getDailyIncomeTrend(mockCache, { now: fixedNow });
  assert.equal(trend.length, 7);
  assert.equal(trend[0].date, '2026-11-08');
  assert.equal(trend[6].date, '2026-11-14');

  // Verify none is today
  assert.ok(trend.every((d) => d.date !== '2026-11-15'));

  // Day with data
  const day10 = trend.find((d) => d.date === '2026-11-10');
  assert.ok(day10);
  assert.equal(day10.gold, 50000);

  // Empty days within the range must have zero values
  const day08 = trend.find((d) => d.date === '2026-11-08');
  assert.ok(day08);
  assert.equal(day08.gold, 0);
  assert.equal(day08.emerald, 0);
});

test('formatCompactNumber formats suffixes correctly', () => {
  assert.equal(formatCompactNumber(0), '0');
  assert.equal(formatCompactNumber(450), '450');
  assert.equal(formatCompactNumber(1250), '1.3K');
  assert.equal(formatCompactNumber(73800), '73.8K');
  assert.equal(formatCompactNumber(1500000), '1.5M');
  assert.equal(formatCompactNumber(2000000000), '2B');
});

test('resourceIncome handles undefined, null, or empty cache gracefully without throwing', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const emptyTrend = getDailyIncomeTrend({}, { now: fixedNow });
  assert.equal(emptyTrend.length, 7);
  assert.ok(emptyTrend.every((d) => d.gold === 0 && d.emerald === 0));

  const emptyToday = getTodayIncome(undefined, fixedNow);
  assert.equal(emptyToday.date, '2026-11-15');
  assert.equal(emptyToday.gold, 0);
  assert.equal(emptyToday.emerald, 0);
});

test('aggregateIncomeByDate aggregates from all collectible sources: campaign, quests, dungeon, tower, and other', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    lastCampaignRaidResult: {
      updatedAt: '2026-11-15T09:00:00.000Z',
      data: {
        missionId: 101,
        drops: { gold: 35000 },
      },
    },
    questClaimStatus: {
      data: {
        claims: [
          {
            id: 201,
            at: '2026-11-15T09:15:00.000Z',
            reward: { gold: 20000, starMoney: 50 },
          },
          {
            id: 202,
            at: '2026-11-15T09:20:00.000Z',
            reward: {
              rewards: [{ type: 'gold', amount: 15000 }, { type: 'starMoney', amount: 25 }],
            },
          },
        ],
      },
    },
    dungeonRewardAction: {
      updatedAt: '2026-11-15T09:30:00.000Z',
      data: {
        reward: { gold: 45000 },
      },
    },
    towerAction: {
      updatedAt: '2026-11-15T09:45:00.000Z',
      data: {
        action: 'openChest',
        reward: { gold: 60000, starMoney: 10 },
      },
    },
    freeBoxAction: {
      updatedAt: '2026-11-15T10:00:00.000Z',
      data: {
        gold: 12000,
      },
    },
  };

  const today = getTodayIncome(mockCache, fixedNow);
  assert.equal(today.date, '2026-11-15');
  // Campaign: 35,000
  assert.equal(today.goldBySource.campaign, 35000);
  // Quests: 20,000 + 15,000 = 35,000 Gold, 50 + 25 = 75 Emeralds
  assert.equal(today.goldBySource.quests, 35000);
  assert.equal(today.emeraldBySource.quests, 75);
  // Dungeon: 45,000
  assert.equal(today.goldBySource.dungeon, 45000);
  // Tower: 60,000 Gold, 10 Emeralds
  assert.equal(today.goldBySource.tower, 60000);
  assert.equal(today.emeraldBySource.tower, 10);
  // Other: 12,000
  assert.equal(today.goldBySource.other, 12000);

  // Total Gold: 35000 + 35000 + 45000 + 60000 + 12000 = 187,000
  assert.equal(today.gold, 187000);
  // Total Emeralds: 75 + 10 = 85
  assert.equal(today.emerald, 85);
});

test('aggregateIncomeByDate merges persistent resourceIncomeHistory without double counting snapshots', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    resourceIncomeHistory: {
      data: {
        '2026-11-15': {
          gold: 150000,
          emerald: 100,
          goldBySource: {
            campaign: 150000, // Cumulative 5 raids
          },
          emeraldBySource: {
            quests: 100,
          },
        },
      },
    },
    // Snapshot of the 5th raid only (30,000 gold). Must not double count!
    lastCampaignRaidResult: {
      updatedAt: '2026-11-15T10:00:00.000Z',
      data: {
        drops: { gold: 30000 },
      },
    },
  };

  const today = getTodayIncome(mockCache, fixedNow);
  assert.equal(today.gold, 150000);
  assert.equal(today.goldBySource.campaign, 150000);
  assert.equal(today.emerald, 100);
  assert.equal(today.emeraldBySource.quests, 100);
});

test('aggregateIncomeByDate includes tower combat (endBattle) rewards from towerSession history', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    towerSession: {
      updatedAt: '2026-11-15T10:00:00.000Z',
      data: {
        floorNumber: 5,
        history: [
          // Tower battle won on floor 1
          {
            token: 'tok-battle-1',
            action: 'endBattle',
            floor: 1,
            win: true,
            reward: { gold: 25000 },
            at: '2026-11-15T09:10:00.000Z',
          },
          // Tower chest opened on floor 2
          {
            token: 'tok-chest-2',
            action: 'openChest',
            floor: 2,
            reward: { gold: 35000, starMoney: 10 },
            at: '2026-11-15T09:20:00.000Z',
          },
          // Tower battle won on floor 3
          {
            token: 'tok-battle-3',
            action: 'endBattle',
            floor: 3,
            win: true,
            reward: {
              rewards: [{ type: 'gold', amount: 40000 }],
            },
            at: '2026-11-15T09:30:00.000Z',
          },
        ],
      },
    },
  };

  const today = getTodayIncome(mockCache, fixedNow);
  assert.equal(today.date, '2026-11-15');
  // Tower gold: 25,000 (battle 1) + 35,000 (chest 2) + 40,000 (battle 3) = 100,000
  assert.equal(today.goldBySource.tower, 100000);
  assert.equal(today.emeraldBySource.tower, 10);
  assert.equal(today.gold, 100000);
  assert.equal(today.emerald, 10);
});

test('aggregateIncomeByDate deduplicates tower combat rewards between towerSession and towerAction', () => {
  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z');
  const mockCache = {
    towerSession: {
      updatedAt: '2026-11-15T09:30:00.000Z',
      data: {
        floorNumber: 3,
        history: [
          {
            token: 'tok-battle-3',
            action: 'endBattle',
            floor: 3,
            win: true,
            reward: { gold: 40000 },
            at: '2026-11-15T09:30:00.000Z',
          },
        ],
      },
    },
    // towerAction holding the exact same endBattle event
    towerAction: {
      updatedAt: '2026-11-15T09:30:00.000Z',
      data: {
        token: 'tok-battle-3',
        action: 'endBattle',
        floorNumber: 3,
        win: true,
        reward: { gold: 40000 },
      },
    },
  };

  const today = getTodayIncome(mockCache, fixedNow);
  // Must NOT double count 40,000 + 40,000!
  assert.equal(today.goldBySource.tower, 40000);
  assert.equal(today.gold, 40000);
});
