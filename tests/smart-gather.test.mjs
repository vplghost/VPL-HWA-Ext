import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import '../extension/march-rules.js';
import '../extension/experimental-data.js';
import '../extension/smart-gather-data.js';
import '../extension/smart-gather.js';
import '../extension/auto-gather.js';
const smart = globalThis.hwaHelperSmartGather;
const now = Date.parse('2026-11-14T10:00:00Z');
const at = new Date(now - 60000).toISOString();
function failureRecord(call, result, time = now + 1) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(time).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...call, ident: 'missing-mine' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'missing-mine', result }] }) };
}

test('missing mine probes and explicitly rejected attacks skip the target rather than stopping', () => {
  for (const name of ['getMineById', 'attackMine']) for (const result of [
    { response: { errorCode: 'MineNotFound' } }, { error: 'MineNotFound' }, { error: { name: 'MineNotFound', message: 'The mine no longer exists' } },
    { response: { error: 'MineNotFound' } }, { errorCode: 'MineNotFound' }
  ]) {
    const mine = { mineId: 'gone', mapId: 'map', configId: 68, coordinates: { x: 1, y: 0 } };
    const call = { name, feature: 'mine', args: { mineId: mine.mineId } };
    const state = { accountId: 1, interrupted: [mine], resumeCandidate: mine,
      nearest: { mapId: 'map', center: { x: 0, y: 0 }, type: 'food', levels: [1,2,3,4,5,6,7,8,9,10],
        selected: mine, candidates: [mine, { ...mine, mineId: 'free' }] },
      pending: { purpose: 'resume', mine, call, phase: 'sent', sentAt: now } };
    const next = smart.sync(state, failureRecord(call, result), cache(), now + 1);
    assert.equal(next.error, undefined); assert.equal(next.pending, null);
    assert.equal(next.interrupted.length, 0); assert.equal(next.resumeCandidate, null);
    assert.equal(next.nearest.selected, null); assert.equal(next.nearest.candidates.length, 1);
    assert.equal(smart.nearestPlan(cache(), next, 'food', now + 2).call.args.mineId, 'free');
    assert.ok(smart.blockedMineIds(next, now + 2).has('gone'));
    assert.equal(state.interrupted.length, 1, 'sync must not mutate its persisted input');
  }
});

test('an exhausted nearest scan waits one minute then searches again without restart', () => {
  const state = { accountId: 1, nearest: { mapId: 'map', center: { x: 0, y: 0 }, type: 'food',
    levels: [1,2,3,4,5,6,7,8,9,10], candidates: [] } };
  const first = smart.nearestPlan(cache(), state, 'food', now);
  assert.equal(first.action, 'wait'); assert.doesNotMatch(first.reason, /restart/);
  assert.equal(smart.nearestPlan(cache(), state, 'food', now + 59999).action, 'wait');
  const next = smart.nearestPlan(cache(), state, 'food', now + 60000);
  assert.equal(next.action, 'search'); assert.equal(next.pending.level, 1);
});

test('only a persisted confirmed missing-mine error is released automatically', () => {
  for (const name of ['getMineById', 'attackMine']) {
    const next = smart.sync({ accountId: 1, error: `${name} rejected by game: MineNotFound; restart Smart gathering to retry` }, null, cache(), now);
    assert.equal(next.error, undefined);
  }
  for (const error of ['attackMine rejected by game: InsufficientUnits; restart Smart gathering to retry', 'Smart gathering attackMine confirmation timed out; refresh game and restart Smart gathering']) {
    assert.equal(smart.sync({ accountId: 1, error }, null, cache(), now).error, error);
  }
  const call = { name: 'getMineById', feature: 'mine', args: { mineId: 'old' } };
  const state = { accountId: 1, pending: { call, phase: 'sent', sentAt: now + 2 } };
  assert.ok(smart.sync(state, failureRecord(call, { error: 'MineNotFound' }), cache(), now + 3).pending, 'older replies cannot release a current request');
});

function cache() {
  return { accountStatus: { data: { id: 1 } }, questResetStatus: { data: { nextDayAt: now + 3600000 } },
    'getDailyQuests:quest': { updatedAt: at, data: { quests: [354, 357, 356, 355].map(id => ({ id, progress: 0, state: 'inProgress' })) } },
    marchStatus: { updatedAt: at, data: { marches: [] } },
    experimentalMapContext: { data: { mapId: 'map', center: { x: 0, y: 0 }, outposts: { 1: { x: 0, y: 0 } } } } };
}
test('daily final chain targets and priority match confirmed user rules', () => {
  const c = cache();
  let result = smart.dailyPlan(c, {}, now);
  assert.equal(result.type, 'food');
  assert.deepEqual(result.rows.map(row => [row.type, row.target]), [['food', 255000], ['iron', 15300], ['stone', 51000], ['wood', 255000]]);
  c['getDailyQuests:quest'].data.quests[0].progress = 255000;
  assert.equal(smart.dailyPlan(c, {}, now).type, 'iron');
});
test('first milestone completion is not full-chain completion; stale days require refresh', () => {
  const c = cache();
  c['getDailyQuests:quest'].data.quests[0] = { id: 354, progress: 50000, state: 'completed' };
  assert.equal(smart.dailyPlan(c, {}, now).type, 'food');
  c['getDailyQuests:quest'].updatedAt = new Date(now - 86400000).toISOString();
  assert.equal(smart.dailyPlan(c, {}, now).action, 'refresh');
  assert.equal(smart.dailyPlan(cache(), {}, now + 3600000).action, 'refresh');
});
test('observed daily progress and gathering increments are not counted twice', () => {
  const c = cache(), m = { squadId: 's', mineId: 'mine', kind: 'food', stage: 'gathering',
    gatheringStartedAt: now - 120000, gatheringDurationMs: 120000, gatheringTotalAmount: 100000 };
  c.marchStatus.data.marches = [m];
  assert.equal(smart.collectedSince(m, c, now - 60000, now), 50000);
  assert.equal(smart.dailyPlan(c, {}, now).type, 'iron', 'do not dispatch another food squad');
  c['getDailyQuests:quest'].data.quests[0].progress = 205000;
  assert.equal(smart.dailyPlan(c, {}, now).action, 'recall');
  delete m.gatheringTotalAmount;
  assert.equal(smart.dailyPlan(c, {}, now).action, 'target', 'missing plan cannot trigger recall');
});
test('recall confirmation and fresh roster gate return; account changes discard state', () => {
  const c = cache(), call = { name: 'stopMineGathering', feature: 'mine', args: { squadId: 's' } };
  const state = { accountId: 1, pending: { call, sentAt: now, phase: 'sent' } };
  const record = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(now + 1).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...call, ident: '1' }] }), responseBody: JSON.stringify({ results: [{ ident: '1', result: { response: { squadId: 's', route: { startedAt: now, durationMs: 20000 } } } }] }) };
  const confirmed = smart.sync(state, record, c, now + 1);
  assert.equal(confirmed.pending.phase, 'returning');
  assert.equal(smart.sync(confirmed, null, c, now + 21000).pending.phase, 'returning', 'ETA alone does not release slot');
  c.marchStatus.updatedAt = new Date(now + 21000).toISOString();
  c['getUnitSummary:unit'] = { updatedAt: c.marchStatus.updatedAt, data: { squads: [] } };
  assert.equal(smart.sync(confirmed, null, c, now + 21000).pending, null);
  c.accountStatus.data.id = 2;
  assert.equal(smart.sync(confirmed, null, c, now + 21000).pending, undefined);
});
test('shared RPC and disabled smart mode preserve existing dispatch gates', () => {
  assert.equal(globalThis.hwaHelperAutoGather.planAutoGather(cache(), { popupRpcEnabled: false, autoGatherSettings: { enabled: true, smartEnabled: true } }, now).action, 'idle');
  assert.equal(globalThis.hwaHelperAutoGather.normalizeAutoGatherSettings({}).smartEnabled, false);
});

test('nearest mode scans levels, orders candidates and rejects exactly one hour', () => {
  const c = cache(), state = { accountId: 1, interrupted: [] };
  const first = smart.nearestPlan(c, state, 'food', now);
  assert.equal(first.pending.level, 1);
  assert.equal(first.call.args.fullOnly, true);
  state.nearest = { ...first.nearest, levels: [1,2,3,4,5,6,7,8,9,10], candidates: [
    { mineId: 'far', configId: 68, coordinates: { x: 20, y: 0 } },
    { mineId: 'near', configId: 68, coordinates: { x: 10, y: 0 } }
  ] };
  const probe = smart.nearestPlan(c, state, 'food', now);
  assert.equal(probe.call.args.mineId, 'near');
  const response = amount => ({ method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(now + 1).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...probe.call, ident: 'p' }] }), responseBody: JSON.stringify({ results: [{ ident: 'p', result: { response: { mineId: 'near', resourceAmount: amount } } }] }) });
  state.pending = { ...probe.pending, call: probe.call, phase: 'sent', sentAt: now };
  const perMinute = globalThis.hwaHelperSmartGatherData.mines[68].speedPerMinute;
  const rejected = smart.sync(state, response(perMinute * 60), c, now + 1);
  assert.equal(rejected.nearest.candidates.length, 1);
  assert.equal(smart.nearestPlan(c, rejected, 'food', now + 2).call.args.mineId, 'far');
  const accepted = smart.sync(state, response(perMinute * 60 + 1), c, now + 1);
  assert.equal(smart.nearestPlan(c, accepted, 'food', now + 2).mine.mineId, 'near');
  const changedMap = cache(); changedMap.experimentalMapContext.data.mapId = 'other';
  assert.equal(smart.nearestPlan(changedMap, accepted, 'food', now).pending.level, 1);
});

test('rally preemption uses return distance and rejects 29s, unknown ETA and insufficient window', () => {
  const c = cache();
  const march = { squadId: 's', mineId: 'mine', stage: 'gathering', targetCoordinates: { x: 43.5, y: 0 } };
  c.marchStatus.data.marches = [march];
  const stored = { autoGatherSettings: { maxMarches: 1 } }, rally = { plannedStartTime: now + 60000 };
  assert.equal(smart.returnMs(march, c), 29000);
  assert.equal(smart.recallForRally(c, stored, rally, now), null);
  march.targetCoordinates.x = 43;
  assert.ok(smart.recallForRally(c, stored, rally, now));
  assert.equal(smart.recallForRally(c, stored, { plannedStartTime: now + 30000 }, now), null);
  delete march.targetCoordinates;
  assert.equal(smart.recallForRally(c, stored, rally, now), null);
});

test('unchanged refreshed quest snapshots retain the gathering baseline', () => {
  const c = cache(), state = {};
  c.marchStatus.data.marches = [{ squadId: 's', mineId: 'mine', kind: 'food', stage: 'gathering',
    gatheringStartedAt: now - 120000, gatheringDurationMs: 120000, gatheringTotalAmount: 100000 }];
  const first = smart.dailyPlan(c, {}, now, state).rows[0].estimated;
  c['getDailyQuests:quest'].updatedAt = new Date(now - 10000).toISOString();
  assert.equal(smart.dailyPlan(c, {}, now, state).rows[0].estimated, first);
});

test('unknown account and restarting during an old nearest probe remain safe', () => {
  assert.deepEqual(smart.sync(undefined, null, {}, now).interrupted, []);
  const call = { name: 'getMineById', feature: 'mine', args: { mineId: 'old' } };
  const state = { accountId: 1, nearest: null, pending: { purpose: 'nearestProbe', call, sentAt: now, mine: { mineId: 'old', configId: 68 } } };
  const record = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(now + 1).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...call, ident: 'p' }] }), responseBody: JSON.stringify({ results: [{ ident: 'p', result: { response: { mineId: 'old', resourceAmount: 10000000 } } }] }) };
  assert.equal(smart.sync(state, record, cache(), now + 1).pending, null);
});

test('expired read requests recover with a bounded retry count while mutations never auto-retry', () => {
  const c = cache(), call = { name: 'getMineById', feature: 'mine', args: { mineId: 'mine' } };
  let state = { accountId: 1 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    state.pending = { call, phase: 'sent', sentAt: now, expiresAt: now + 30000 };
    state = smart.sync(state, null, c, now + 30000);
    assert.equal(state.pending, null);
    assert.equal(state.readTimeout.attempts, attempt);
    assert.equal(Boolean(state.error), attempt === 3);
  }
  assert.match(state.error, /getMineById:mine.*3 attempts/);
  const mutation = { accountId: 1, pending: { call: { name: 'attackMine', feature: 'mine', args: { mineId: 'mine' } }, sentAt: now, phase: 'sent', expiresAt: now + 30000 } };
  const waiting = smart.sync(mutation, null, c, now + 30000);
  assert.equal(waiting.pending.call.name, 'attackMine');
  assert.equal(waiting.readTimeout, undefined);
  const failed = smart.sync(waiting, null, c, now + 120001);
  assert.match(failed.error, /attackMine confirmation timed out/);
  assert.equal(failed.pending, null);
});

test('return route records the outpost destination and account change clears gathering inputs', async () => {
  const context = { TextEncoder };
  vm.runInNewContext(await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8'), context);
  const reducer = context.hwaHelperRpcCache;
  const record = { method: 'POST', status: 200, timestamp: new Date(now).toISOString(), endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ name: 'getMarches', feature: 'march', ident: 'm' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'm', result: { response: { marches: { returnToOutpost: [{ squadId: 's', mapId: 'map', route: {
      type: 'returnToOutpost', leader: { userId: 1 }, startedAt: now, durationMs: 10000,
      from: { coordinates: { x: 20, y: 0 }, object: { objectType: 'mine' } },
      to: { coordinates: { x: 0, y: 0 }, object: { objectType: 'outpost' } }
    } }] } } } }] }) };
  const first = reducer.merge({ accountStatus: { data: { id: 1 } } }, [record]).cache;
  assert.equal(first.experimentalMapContext.data.outposts[1].x, 0);
  const switched = reducer.merge(first, [{ key: 'accountStatus', updatedAt: new Date(now + 1).toISOString(), data: { id: 2 } }]).cache;
  assert.equal(switched.marchStatus, undefined);
  assert.equal(switched.experimentalMapContext, undefined);
});

test('daily quest read timeout falls back to standard rotation without fatal error', () => {
  const call = { name: 'getDailyQuests', feature: 'quest', args: {} };
  const state = {
    accountId: 1,
    pending: { call, sentAt: now - 35000, expiresAt: now - 5000, phase: 'sent' },
    readTimeout: { key: 'getDailyQuests:quest', attempts: 2 }
  };
  const synced = smart.sync(state, null, cache(), now);
  assert.equal(synced.error, undefined, 'Must not set fatal error for daily quest read timeout');
  assert.equal(synced.pending, null);
  assert.match(synced.notice?.message || '', /falling back to standard gathering rotation/);
});

test('game load record automatically releases persisted read timeout error on reconnect', () => {
  const state = {
    accountId: 1,
    error: 'Read getDailyQuests:quest timed out after 3 attempts; press F5 in the game tab and restart Smart gathering',
    readTimeout: { key: 'getDailyQuests:quest', attempts: 3 }
  };
  const reloadRecord = {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(now).toISOString(),
    requestBody: JSON.stringify({ calls: [{ name: 'getMarches', feature: 'march', ident: '1' }] }),
    responseBody: JSON.stringify({ results: [{ ident: '1', result: { response: { marches: [] } } }] })
  };
  const synced = smart.sync(state, reloadRecord, cache(), now);
  assert.equal(synced.error, undefined, 'Game reload must automatically clear read timeout error');
  assert.equal(synced.readTimeout, undefined);
  assert.match(synced.notice?.message || '', /Resuming Smart gathering/);
});
