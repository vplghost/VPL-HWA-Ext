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
