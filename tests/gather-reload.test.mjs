import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { smartGatherService } from '../src/services/queues/smartGather.ts';
import { autoGatherService } from '../src/services/queues/autoGather.ts';

const fixture = JSON.parse(readFileSync(new URL('fixtures/gather-reload-20261115.json', import.meta.url)));
const occupiedFixture = JSON.parse(readFileSync(new URL('fixtures/gather-occupied-20261115.json', import.meta.url)));
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';

function environment() {
  const local = {}, sent = [], clock = { now: Date.parse(fixture.records.at(-1).timestamp) };
  const area = { get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]])), set: async value => Object.assign(local, value) };
  const chrome = { storage: { local: area, session: area, onChanged: { addListener() {} } },
    runtime: { id: 'test', onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
    alarms: { get: (name, cb) => cb({}), create() {}, onAlarm: { addListener() {} } },
    tabs: { sendMessage: async (id, message) => sent.push(message), query: (args, cb) => cb([]) } };

  const bg = setupBackgroundRuntime({ chrome });
  const withClock = async fn => {
    const orig = Date.now;
    Date.now = () => clock.now;
    try {
      return await fn();
    } finally {
      Date.now = orig;
    }
  };

  const ctx = {
    chrome,
    runGather: (...args) => withClock(() => bg.evaluateAutoGather(...args)),
    tickGather: (...args) => withClock(() => bg.tickAutoGather(...args)),
    findGameTab: () => bg.findActiveGameTab(),
    hwaHelperSmartGather: smartGatherService,
    hwaHelperAutoGather: autoGatherService,
    hwaHelperRpcCache: reducer
  };

  const cache = reducer.merge({}, fixture.records).cache;
  Object.assign(local, { rpcCache: cache, popupRpcEnabled: true, socketRefreshMode: 'direct', captureSettings: { interceptEnabled: true },
    autoGatherSettings: { enabled: true, smartEnabled: true, maxMarches: 3, mineType: 'rotate', mineLevel: 10 } });
  return { ctx, local, sent, clock, reducer };
}
function response(calls, values, now) {
  return { transport: 'fetch', method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(now).toISOString(),
    requestBody: JSON.stringify({ calls: calls.map((call, i) => ({ ...call, ident: 'test-' + i })) }),
    responseBody: JSON.stringify({ results: values.map((value, i) => ({ ident: 'test-' + i, result: { response: value } })) }) };
}

test('reload hydrates own base from captured outpost summary before opening world-map chunks', () => {
  const { ctx, reducer, local, clock } = environment();
  const without = reducer.merge({}, fixture.records.filter(r => r.sourceIndex !== 14)).cache;
  const smart = ctx.hwaHelperSmartGather;
  assert.equal(smart.nearestPlan(without, {}, 'food', clock.now).action, 'wait');
  assert.deepEqual(JSON.parse(JSON.stringify(smart.context(local.rpcCache).center)), { x: 606, y: 376 });
  const plan = ctx.hwaHelperAutoGather.planAutoGather(local.rpcCache, { ...local, autoGatherSettings: { ...local.autoGatherSettings, mineLevel: 'nearest' } }, clock.now);
  assert.equal(plan.action, 'search');
  assert.equal(plan.call.name, 'searchMine');
  assert.equal(plan.call.args.center.x, 606);
  assert.equal(plan.call.args.center.y, 376);
  assert.equal(local.rpcCache.marchStatus.data.marches.length, 1);
});

test('outpost summary rejects missing identity, rejected/invalid data and old-account replay', () => {
  const { reducer, local, clock } = environment();
  const record = fixture.records.find(r => r.sourceIndex === 14);
  assert.equal(reducer.merge({}, [record]).cache.experimentalMapContext, undefined);
  const changed = reducer.merge(local.rpcCache, [{ key: 'accountStatus', data: { id: 2 }, updatedAt: new Date(clock.now + 1).toISOString() }]).cache;
  assert.equal(reducer.merge(changed, [record]).cache.experimentalMapContext, undefined);
  for (const value of [{ error: 'Rejected' }, { mapId: 'map', coordinates: { x: null, y: 2 } }]) {
    const c = { accountStatus: local.rpcCache.accountStatus };
    const bad = response([{ name: 'getOutpostSummary', feature: 'outpost' }], [value], clock.now);
    assert.equal(reducer.merge(c, [bad]).cache.experimentalMapContext, undefined);
  }
  const newer = response([{ name: 'getOutpostSummary', feature: 'outpost' }], [{ mapId: 'new-map', coordinates: { x: 1, y: 2 } }], clock.now + 2);
  const relocated = reducer.merge(local.rpcCache, [newer]).cache;
  assert.equal(relocated.experimentalMapContext.data.mapId, 'new-map');
  assert.deepEqual(Object.keys(relocated.experimentalMapContext.data.outposts), ['1']);
  assert.equal(reducer.merge(relocated, [record]).cache.experimentalMapContext.data.mapId, 'new-map', 'Old summary cannot restore stale coordinates');
});

test('captured reload with one squad fills three slots sequentially after server-confirmed rosters', async () => {
  const { ctx, reducer, local, sent, clock } = environment();
  const originalMarch = structuredClone(local.rpcCache.marchStatus.data.marches[0]);
  const squads = structuredClone(local.rpcCache['getUnitSummary:unit'].data);
  const marches = JSON.parse(fixture.records.find(r => r.sourceIndex === 35).responseBody).results[0].result.response;
  const tick = async record => {
    if (record) local.rpcCache = reducer.merge(local.rpcCache, [record]).cache;
    await ctx.runGather(record || null, local.rpcCache, local, 1);
  };
  const lastCall = name => sent.filter(m => m.group === 'smart-gather').flatMap(m => m.calls || []).findLast(c => c.name === name);
  await tick();
  for (let n = 2; n <= 3; n++) {
    const search = lastCall('searchMine'); assert.ok(search);
    assert.equal(search.args.center.x, 606, 'Search stays anchored to own base after march snapshots update the viewport center');
    assert.equal(search.args.center.y, 376);
    clock.now += 5001;
    await tick(response([search], [{ mines: [{ mineId: 'resume-mine-' + n, coordinates: { x: 606 + n, y: 376 } }] }], clock.now));
    const gather = lastCall('attackMine'); assert.ok(gather);
    assert.equal(gather.args.mineId, 'resume-mine-' + n);
    const before = sent.filter(m => m.calls?.[0]?.name === 'attackMine').length;
    clock.now += 1;
    const squadId = 'new-squad-' + n;
    const route = { startedAt: clock.now, durationMs: 10000, type: 'toTargetSolo' };
    await tick(response([gather], [{ squadId, route }], clock.now));
    assert.equal(local.smartGatherState.pending.phase, 'refresh');
    assert.equal(sent.filter(m => m.calls?.[0]?.name === 'attackMine').length, before, 'Dispatch acknowledgement does not release another slot');
    squads.squads.push({ id: squadId, heroes: gather.args.squad.heroes.map(h => ({ id: h.heroId })),
      units: gather.args.squad.units.map(u => ({ id: u.unitId, state: { survived: u.count } })) });
    for (const u of gather.args.squad.units) squads.available.find(a => a.unitId === u.unitId).count -= u.count;
    marches.marches.interactionWithTarget.push({ squadId, mapId: originalMarch.mapId,
      target: { objectId: gather.args.mineId, objectType: 'mine', objectConfigId: search.args.mineConfigIds[0], coordinates: { x: 606 + n, y: 376 } },
      startedAt: clock.now, durationMs: 3600000 });
    clock.now += 5001;
    await tick(response([{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }], [marches, squads], clock.now));
  }
  assert.equal(local.rpcCache.marchStatus.data.marches.length, 3);
  assert.equal(sent.filter(m => m.calls?.[0]?.name === 'attackMine').length, 2);
  clock.now += 5001; await tick();
  assert.match(local.smartGatherState.status, /limit reached \(3\/3\)/);
  assert.equal(sent.filter(m => m.calls?.[0]?.name === 'attackMine').length, 2);
});

test('actual asynchronous Chrome tab query wakes gathering after popup start and periodic ticks', async () => {
  const { ctx, local, sent, clock } = environment();
  ctx.chrome.tabs.query = (filter, callback) => { setTimeout(() => callback([{ id: 7, url: 'https://www.hero-wars-alliance.com/' }]), 0); };
  assert.equal((await ctx.findGameTab()).id, 7);
  await ctx.tickGather(true);
  assert.ok(sent.some(m => m.calls?.[0]?.name === 'searchMine'), 'A tick must actually reach the game tab');
  assert.equal(local.smartGatherState.pending.call.name, 'searchMine');
  local.smartGatherState.pending.sentAt = clock.now - 120001;
  clock.now += 5001;
  await ctx.tickGather();
  assert.notEqual(local.smartGatherState.status, 'Waiting for game confirmation', 'Periodic tick advances pending timeout/recovery even without another API record');
});

test('asynchronous tab-query fallback waits for the second callback instead of resolving an empty list', async () => {
  const { ctx } = environment();
  let attempts = 0;
  ctx.chrome.tabs.query = (filter, callback) => { setTimeout(() => callback(++attempts === 1 ? [] : [{ id: 8, url: 'https://www.hero-wars-alliance.com/' }]), 0); };
  assert.equal((await ctx.findGameTab()).id, 8);
  assert.equal(attempts, 2);
});

test('captured occupied mine is removed from interrupted targets before any attack and gathering selects another mine', async () => {
  const { ctx, local, clock } = environment();
  const record = occupiedFixture.records[0], call = JSON.parse(record.requestBody).calls[0];
  const mine = { mineId: call.args.mineId, mapId: local.rpcCache.experimentalMapContext.data.mapId, configId: 32, coordinates: { x: 607, y: 376 } };
  const state = { accountId: 1, interrupted: [mine], pending: { call, sentAt: Date.parse(record.timestamp) - 1, phase: 'sent', purpose: 'resume', mine } };
  clock.now = Date.parse(record.timestamp);
  const next = ctx.hwaHelperSmartGather.sync(state, record, local.rpcCache, clock.now);
  assert.equal(next.pending, null);
  assert.equal(next.resumeCandidate, null);
  assert.equal(next.interrupted.length, 0);
  assert.ok(ctx.hwaHelperSmartGather.blockedMineIds(next, clock.now).has(mine.mineId));
  local.smartGatherState = next;
  for (const key of ['marchStatus', 'getUnitSummary:unit']) local.rpcCache[key].updatedAt = new Date(clock.now).toISOString();
  local.rpcCache.experimentalMineSearch = { data: { mineConfigId: 68, mines: [mine, { mineId: 'vacant-mine', coordinates: { x: 608, y: 376 } }] } };
  const plan = ctx.hwaHelperAutoGather.planAutoGather(local.rpcCache, local, clock.now);
  assert.equal(plan.action, 'gather');
  assert.equal(plan.call.args.mineId, 'vacant-mine');
  assert.equal(plan.call.args.battleType, 'pve');
});

test('occupied nearest candidate is skipped even when its amount estimates more than one hour', () => {
  const { ctx, local, clock } = environment();
  const record = occupiedFixture.records[0], call = JSON.parse(record.requestBody).calls[0];
  const mine = { mineId: call.args.mineId, configId: 32, coordinates: { x: 607, y: 376 } };
  const state = { accountId: 1, nearest: { type: 'food', mapId: local.rpcCache.experimentalMapContext.data.mapId,
    center: { x: 606, y: 376 }, levels: [1,2,3,4,5,6,7,8,9,10], candidates: [mine, { ...mine, mineId: 'free-nearest' }] },
    pending: { call, purpose: 'nearestProbe', mine, sentAt: Date.parse(record.timestamp) - 1, phase: 'sent' } };
  clock.now = Date.parse(record.timestamp);
  const next = ctx.hwaHelperSmartGather.sync(state, record, local.rpcCache, clock.now);
  assert.equal(next.nearest.selected, null);
  assert.equal(ctx.hwaHelperSmartGather.nearestPlan(local.rpcCache, next, 'food', clock.now).call.args.mineId, 'free-nearest');
});

test('captured errorCode-only BattleTypeMismatch releases the pending rejection and excludes that mine', () => {
  const { ctx, local, clock } = environment();
  const record = occupiedFixture.records[1], call = JSON.parse(record.requestBody).calls[0];
  const state = { accountId: 1, interrupted: [{ mineId: call.args.mineId }],
    pending: { call, sentAt: Date.parse(record.timestamp) - 1, phase: 'sent', resumeMineId: call.args.mineId } };
  clock.now = Date.parse(record.timestamp);
  const next = ctx.hwaHelperSmartGather.sync(state, record, local.rpcCache, clock.now);
  assert.equal(next.pending, null);
  assert.equal(next.error, undefined);
  assert.equal(next.interrupted.length, 0);
  assert.ok(ctx.hwaHelperSmartGather.blockedMineIds(next, clock.now).has(call.args.mineId));
  const fatal = structuredClone(record);
  const body = JSON.parse(fatal.responseBody); body.results[0].result.response.errorCode = 'InsufficientUnits'; fatal.responseBody = JSON.stringify(body);
  const stopped = ctx.hwaHelperSmartGather.sync(state, fatal, local.rpcCache, clock.now);
  assert.equal(stopped.pending, null);
  assert.match(stopped.error, /attackMine.*InsufficientUnits/);
});
