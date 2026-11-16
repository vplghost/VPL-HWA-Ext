import test from 'node:test';
import assert from 'node:assert/strict';
import { worldReadService as helper } from '../src/services/worldReadService.ts';
const now = Date.parse('2026-11-15T08:00:00Z');
const incoming = { name: 'getIncomingMarches', feature: 'march', args: {} };
const rally = { name: 'getRallyById', feature: 'rally', args: { rallyId: 'r', mapId: 'map' } };
const cache = () => ({ accountStatus: { data: { id: 1 } } });

test('incoming needs full initial hydration and uses active versus idle freshness, including passive deltas', () => {
  const c = cache();
  c.incomingMineAttacks = { updatedAt: new Date(now).toISOString(), data: { accountId: '1', snapshotAt: 0, attacks: {} } };
  assert.equal(helper.fresh(c, incoming, now), false);
  c.incomingMineAttacks.data.snapshotAt = now - 50000;
  assert.equal(helper.fresh(c, incoming, now + 59000), true);
  assert.equal(helper.fresh(c, incoming, now + 61000), false);
  c.incomingMineAttacks.data.attacks.route = { impactAt: now + 60000 };
  assert.equal(helper.fresh(c, incoming, now + 14000), true);
  assert.equal(helper.fresh(c, incoming, now + 16000), false);
});

test('rally state survives serialization and coalesces new versions without an unbounded failed-read retry', () => {
  let result = helper.plan(null, cache(), [rally], now, { after: now, version: 1, tabId: 1 });
  assert.equal(result.calls.length, 1);
  result = helper.plan(JSON.parse(JSON.stringify(result.state)), cache(), [rally], now + 1, { after: now + 1, version: 20, tabId: 1 });
  assert.equal(result.calls.length, 0); assert.equal(result.wakeAt, now + 5000);
  result = helper.plan(JSON.parse(JSON.stringify(result.state)), cache(), [rally], now + 5000, { after: now + 1, version: 20, tabId: 1 });
  assert.equal(result.calls.length, 1); assert.equal(result.wakeAt, null);
  assert.ok(Object.values(result.state.entries).every(row => !row.pending), 'failed/missing response does not schedule endless retries');
});

test('native rally version and map must satisfy invalidation; old details do not suppress new reads', () => {
  const c = cache();
  c.rallyReadStatus = { data: { accountId: '1', rallies: { r: { at: now, version: 5, mapId: 'map' } } } };
  assert.equal(helper.plan(null, c, [rally], now + 10, { after: now + 10, version: 5 }).calls.length, 0);
  assert.equal(helper.plan(null, c, [rally], now + 10, { after: now + 10, version: 6 }).calls.length, 1);
  assert.equal(helper.plan(null, c, [{ ...rally, args: { ...rally.args, mapId: 'other' } }], now + 10, { version: 5 }).calls.length, 1);
  assert.equal(helper.plan(null, c, [rally], now + 61000, { version: 5 }).calls.length, 1);
});

test('account changes discard deferred reads and foreign cached details never fulfill the new account', () => {
  const c = cache();
  let result = helper.plan(null, c, [rally], now, { after: now, version: 1 });
  result = helper.plan(result.state, c, [rally], now + 1, { after: now + 1, version: 2 });
  c.accountStatus.data.id = 2;
  c.rallyReadStatus = { data: { accountId: '1', rallies: { r: { at: now, version: 10, mapId: 'map' } } } };
  const next = helper.plan(JSON.parse(JSON.stringify(result.state)), c, [rally], now + 2, { after: now + 2, version: 2 });
  assert.equal(next.state.accountId, '2'); assert.equal(next.calls.length, 1); assert.equal(next.wakeAt, null);
});
