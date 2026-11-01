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
