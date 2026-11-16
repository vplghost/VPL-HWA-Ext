import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const now = Date.parse('2026-11-15T12:00:00Z'), stamp = time => new Date(time).toISOString();
Date.now = () => now;
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
import { mailService as mail } from '../src/services/mailService.ts';
const entry = data => ({ data, updatedAt: stamp(now - 10000) });
const report = (id, extra = {}) => ({ id, type: 'rallyMobAttackResult', claimedReward: false, createdAt: now - 1000, expiresAt: now + 86400000, ...extra });
const baseline = reports => ({ accountStatus: entry({ id: 1 }), mailStatus: entry({ accountId: '1', reports,
  reportsObservedAt: stamp(now - 10000), letters: [{ id: '101', reward: { gold: 1 } }] }),
  'getPage:report': entry({ reports: structuredClone(reports) }), 'resource:gold': entry({ amount: 100 }) });
const rpc = (call, response, time = now, error) => ({ method: 'POST', status: 200, timestamp: stamp(time),
  endpoint: 'https://api.hero-wars-alliance.com/api/rpc', requestBody: JSON.stringify({ calls: [{ ...call, ident: call.ident || 'claim-1' }] }),
  responseBody: JSON.stringify({ results: [{ ident: call.ident || 'claim-1', result: error ? { error } : { response } }] }) });
const bulk = { name: 'readAndClaimAll', feature: 'report', args: { types: ['rallyMobAttackResult'] }, ident: 'bulk-receipt' };
const day = cache => cache.battleReportSummary.data.days['2026-11-15'];

test('mail.rows handles empty cache without accountStatus or battleReportSummary without throwing', () => {
  assert.doesNotThrow(() => {
    const result = mail.rows({});
    assert.equal(result.letters.length, 0);
    assert.equal(result.reports.length, 0);
    assert.equal(result.scoped, false);
  });
  assert.doesNotThrow(() => {
    const result = mail.rows({ mailStatus: { data: { reports: [] } } });
    assert.equal(result.reports.length, 0);
  });
});

test('migration replaces duplicate claimed payloads with daily aggregates and minimal ID guards without mutating input', () => {
  const reports = Array.from({ length: 25 }, (_, i) => report('claimed-' + i, { claimedReward: true,
    payload: { result: i % 2 ? 'lose' : 'win', redundant: 'x'.repeat(1000) } }));
  reports.push(report('pending'));
  const original = baseline(reports), copy = structuredClone(original);
  const result = reducer.pruneCache(original, now);
  assert.equal(result.changed, true); assert.deepEqual(original, copy);
  assert.equal(result.cache.mailStatus.data.reports.length, 1); assert.equal(result.cache['getPage:report'].data.reports.length, 1);
  assert.equal(day(result.cache).total, 25); assert.equal(day(result.cache).types.rallyMobAttackResult, 25);
  assert.equal(day(result.cache).wins, 13); assert.equal(day(result.cache).losses, 12);
  assert.equal(Object.keys(result.cache.battleReportSummary.data.seen).length, 25);
  assert.ok(Object.values(result.cache.battleReportSummary.data.seen).every(value => value[0] === '2026-11-15' && [1, -1].includes(value[1])));
  assert.ok(JSON.stringify(result.cache).length < JSON.stringify(original).length / 4);
  assert.equal(result.cache.mailStatus.data.unclaimedReportsCount, 1); assert.equal(result.cache.mailStatus.data.totalUnclaimed, 2);
  assert.equal(reducer.pruneCache(result.cache, now).changed, false);
});

test('repeated pages and stale unclaimed notifications do not recount or resurrect archived reports', () => {
  const claimed = report('once', { claimedReward: true });
  let cache = reducer.pruneCache(baseline([claimed]), now).cache;
  for (const time of [now, now + 1, now + 2]) cache = reducer.merge(cache,
    [rpc({ name: 'getPage', feature: 'report', args: {} }, { reports: [claimed, report('once')] }, time)]).cache;
  assert.equal(day(cache).total, 1); assert.equal(cache.mailStatus.data.reports.length, 0);
  const push = { transport: 'websocket', direction: 'received', encoding: 'utf8', timestamp: stamp(now + 3),
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', payload: JSON.stringify({ result: { type: 'newReport', body: { reportId: 'once', type: 'rallyMobAttackResult' } } }) };
  cache = reducer.merge(cache, [push]).cache;
  assert.equal(day(cache).total, 1); assert.equal(mail.rows(cache, now + 3).reports.length, 0);
});

test('confirmed bulk claims aggregate report dates and actual reward claim dates separately, once', () => {
  let cache = baseline([report('yesterday', { createdAt: now - 86400000, reward: { gold: 999999 } }), report('other', { type: 'mineGatheringResult' })]);
  const event = rpc(bulk, { gold: 50, claimedRewards: [{ type: 'material', id: 2, amount: 7 }] });
  cache = reducer.merge(cache, [event]).cache;
  assert.equal(cache.battleReportSummary.data.days['2026-11-14'].total, 1);
  assert.equal(day(cache).total, 0); assert.equal(day(cache).rewards['resource:gold'], 50);
  assert.equal(day(cache).rewards['resource:material:2'], 7);
  assert.equal(cache['resource:gold'].data.amount, 150);
  assert.equal(cache.mailStatus.data.reports.length, 1); assert.equal(cache.mailStatus.data.reports[0].id, 'other');
  assert.equal(cache['getPage:report'].data.reports.length, 1);
  assert.equal(cache.mailClaimReceipts.data[0].reward, undefined); assert.equal(cache.mailClaimStatus.data.call, undefined);
  // The summary retains only token/day even after the ordinary receipt ring rolls over.
  cache = { ...cache, mailClaimReceipts: entry([]) };
  cache = reducer.merge(cache, [event]).cache;
  assert.equal(day(cache).rewards['resource:gold'], 50); assert.equal(cache.battleReportSummary.data.days['2026-11-14'].total, 1);
});

test('native single claims archive only their report; rejected claims preserve pending details and reward totals', () => {
  const original = baseline([report('one'), report('two')]);
  const call = { name: 'claimReward', feature: 'report', args: { id: 'one' } };
  const rejected = reducer.merge(original, [rpc(call, {}, now, 'NotFound')]).cache;
  assert.equal(rejected.mailStatus.data.reports.length, 2); assert.equal(rejected.battleReportSummary, undefined);
  const confirmed = reducer.merge(original, [rpc(call, { reward: [{ type: 'gold', amount: 12 }] })]).cache;
  assert.equal(confirmed.mailStatus.data.reports.length, 1); assert.equal(confirmed.mailStatus.data.reports[0].id, 'two');
  assert.equal(day(confirmed).total, 1); assert.equal(day(confirmed).rewards['resource:gold'], 12);
});

test('legacy confirmed receipt payloads migrate without replaying balances, and authoritative same-batch balances win', () => {
  const old = baseline([report('migrated', { claimedReward: true })]);
  old.mailClaimReceipts = entry([{ token: 'legacy', accountId: '1', at: stamp(now), kind: 'reports', success: true, types: bulk.args.types,
    call: { ...bulk, ident: 'legacy' }, reward: { gold: 20 } }]);
  const migrated = reducer.pruneCache(old, now).cache;
  assert.equal(day(migrated).rewards['resource:gold'], 20); assert.equal(migrated['resource:gold'].data.amount, 100);
  assert.equal(migrated.mailClaimReceipts.data[0].reward, undefined);
  const event = rpc(bulk, { gold: 50 }), snapshot = { name: 'userGetInfo', ident: 'snapshot', args: {} };
  event.requestBody = JSON.stringify({ calls: [{ ...bulk }, snapshot] });
  event.responseBody = JSON.stringify({ results: [{ ident: bulk.ident, result: { response: { gold: 50 } } },
    { ident: 'snapshot', result: { response: { id: 1, name: 'Fixture', level: 80, gold: 777 } } }] });
  const merged = reducer.merge(baseline([report('one')]), [event]).cache;
  assert.equal(merged['resource:gold'].data.amount, 777); assert.equal(day(merged).rewards['resource:gold'], 50);
});

test('claimed combat reports still reach operational reducers before mail details are compacted', () => {
  const one = report('combat', { type: 'soloMobAttackResult', claimedReward: true, payload: { result: 'win', mobConfigId: 1 } });
  const cache = reducer.merge(baseline([]), [rpc({ name: 'getPage', feature: 'report', args: {} }, { reports: [one] })]).cache;
  assert.equal(cache.soloAttackResults.data[0].reportId, 'combat'); assert.equal(cache.soloAttackResults.data[0].result, 'win');
  assert.equal(cache.mailStatus.data.reports.length, 0); assert.equal(day(cache).wins, 1);
});

test('late report pages enrich previously unknown battle outcomes without counting the report twice', () => {
  let cache = reducer.merge(baseline([report('late')]), [rpc(bulk, {})]).cache;
  assert.equal(day(cache).total, 1); assert.equal(day(cache).wins, 0);
  const page = time => rpc({ name: 'getPage', feature: 'report', args: {} }, { reports: [report('late', { claimedReward: true, payload: { result: 'win' } })] }, time);
  cache = reducer.merge(cache, [page(now + 1), page(now + 2)]).cache;
  assert.equal(day(cache).total, 1); assert.equal(day(cache).wins, 1);
});

test('daily retention and account switches clear statistics and keys together; unknown report dates use first observation', () => {
  let cache = reducer.pruneCache(baseline([report('unknown', { claimedReward: true, createdAt: undefined })]), now).cache;
  assert.equal(day(cache).total, 1);
  const expired = reducer.pruneCache(cache, now + 30 * 86400000).cache;
  assert.equal(Object.keys(expired.battleReportSummary.data.days).length, 0); assert.equal(Object.keys(expired.battleReportSummary.data.seen).length, 0);
  cache = reducer.merge(cache, [rpc({ name: 'userGetInfo', args: {} }, { id: 2, name: 'Other', level: 80 }, now + 100)]).cache;
  assert.equal(cache.battleReportSummary, undefined); assert.equal(mail.dailyReports(cache, now).length, 0);
  cache = reducer.merge(cache, [rpc(bulk, { gold: 99 }, now + 50)]).cache;
  assert.equal(cache.battleReportSummary, undefined);
});

test('Mail groups pending reports without exposing archived duplicates or inventing unknown rewards', () => {
  const cache = reducer.pruneCache(baseline([report('a', { reward: { gold: 5 } }), report('b'), report('c', { claimedReward: true })]), now).cache;
  const groups = mail.reportGroups(mail.rows(cache, now).reports);
  assert.equal(groups.length, 1); assert.equal(groups[0].count, 2);
  assert.equal(groups[0].rewards.length, 1); assert.equal(groups[0].rewards[0].amount, 5);
  const days = mail.dailyReports(cache, now); assert.equal(days.length, 1); assert.equal(days[0].total, 1); assert.equal(days[0].rewards.length, 0);
});
