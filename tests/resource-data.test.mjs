import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/resource-data.js', import.meta.url), 'utf8');
const context = {};
runInNewContext(source, context);
const resources = context.hwaHelperResourceData;

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
  assert.equal(resources.minutesSeconds(301), '05:01');
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
  assert.equal(resources.formatAmount(1000000000), '1.0B');
  assert.equal(resources.formatAmount(2500000000), '2.5B');
  assert.equal(resources.formatAmount(null), '—');
});

test('renewable tooltip shows per-minute rate or next refill countdown', () => {
  const fast = { data: { amount: 5, lastRefillAt: 1000000,
    refillEveryMs: 30000, refillAmount: 1, cap: 20 } };
  const slow = { data: { amount: 5, lastRefillAt: 1000000,
    refillEveryMs: 300000, refillAmount: 1, cap: 20 } };
  assert.equal(resources.refillDescription(fast, 1000000), '+2/min');
  assert.equal(resources.refillDescription(slow, 1000000 + 60000), 'Next +1 in 04:00');
  assert.equal(resources.refillDescription({ data: { ...slow.data, amount: 20 } }, 1000000),
    'Full; refill resumes after spending');
  assert.equal(resources.refillDescription({ data: { amount: 100 } }, 1000000), null);
});
