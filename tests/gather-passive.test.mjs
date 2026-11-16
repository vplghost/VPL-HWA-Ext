import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { autoGatherService } from '../src/services/queues/autoGather.ts';

import { rpcCacheService as rpcCacheReducer } from '../src/core/cache/index.ts';

const start = Date.parse('2026-11-15T07:00:00Z');
const stamp = at => new Date(at).toISOString();
const marchCall = { name: 'getMarches', feature: 'march' }, unitCall = { name: 'getUnitSummary', feature: 'unit' };
const rpc = (calls, replies, at) => ({ transport: 'fetch', method: 'POST', status: 200, durationMs: 1, outcome: 'completed', timestamp: stamp(at),
  endpoint: 'https://api.hero-wars-alliance.com/api/rpc', requestBody: JSON.stringify({ calls: calls.map((c, i) => ({ ...c, ident: String(i) })) }),
  responseBody: JSON.stringify({ results: replies.map((response, i) => ({ ident: String(i), result: { response } })) }) });
const mqtt = (type, body, at) => ({ transport: 'websocket', method: 'PUBLISH', status: null, durationMs: 0, outcome: 'completed', direction: 'received', encoding: 'utf8', timestamp: stamp(at),
  topic: 'hwm/user/test', qos: 0, payloadTruncated: false, payloadBytes: 100,
  endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', payload: JSON.stringify({ result: { type, body } }) });
async function environment(mode = 'direct', existing) {
  const clock = { now: start }, local = existing ? structuredClone(existing) : { popupRpcEnabled: true, socketRefreshMode: mode, rpcCache: {
    accountStatus: { data: { id: 1 } }, marchStatus: { method: 'getMarches', updatedAt: stamp(start), data: { marches: [] } },
    'getUnitSummary:unit': { updatedAt: stamp(start), data: { squads: [], available: [] } } } };
  const sent = [], alarms = new Map(); let listener, onAlarm;
  const area = { get: async keys => structuredClone(Object.fromEntries((keys == null ? Object.keys(local) : Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]]))),
    set: async values => Object.assign(local, structuredClone(values)), remove: async keys => (Array.isArray(keys) ? keys : [keys]).forEach(k => delete local[k]) };
  const chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    storage: { local: area, session: area, onChanged: { addListener() {} } },
    alarms: { get: (_, cb) => cb({}), create: (name, options) => alarms.set(name, options), clear: name => alarms.delete(name), onAlarm: { addListener: fn => { onAlarm = fn; } } },
    tabs: { query: (_, cb) => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]), sendMessage: async (_, msg) => { sent.push(structuredClone(msg)); return { ok: true }; } } };

  const withClock = async fn => {
    const orig = Date.now;
    Date.now = () => clock.now;
    try {
      return await fn();
    } finally {
      Date.now = orig;
    }
  };

  const bg = await withClock(() => setupBackgroundRuntime({ chrome }));
  const ctx = {
    drain: () => bg.drain(),
    runGather: (...args) => withClock(() => bg.evaluateSmartGather(...args)),
    hwaHelperAutoGather: autoGatherService,
    hwaHelperRpcCache: rpcCacheReducer
  };
  await ctx.drain();
  const send = (message, game = false) => withClock(() => new Promise(resolve => listener(message, game ? { url: 'https://www.hero-wars-alliance.com/', tab: { id: 1 } } : { url: 'chrome-extension://test/popup.html' }, resolve)));
  const merge = record => withClock(() => { local.rpcCache = structuredClone(rpcCacheReducer.merge(local.rpcCache, [record]).cache); });
  return { ctx, clock, local, sent, send, merge, alarms, fireAlarm: name => withClock(() => onAlarm({ name })) };
}

test('passive-first popup reads reuse native snapshots, deduplicate missing reads and retain explicit refresh', async () => {
  for (const mode of ['direct', 'piggyback']) {
    const e = await environment(mode), request = { kind: 'refresh-rpc', calls: [marchCall], passiveFirst: true };
    assert.equal((await e.send(request)).skipped, true); assert.equal(e.sent.length, 0);
    e.clock.now += 61000;
    await e.send(request); await e.send(request);
    assert.equal(e.sent.length, 1); assert.equal(e.sent[0].kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
    await e.send({ ...request, passiveFirst: false }); assert.equal(e.sent.length, 2);
    await e.send({ kind: 'api-record', record: rpc([marchCall], [{ marches: {} }], e.clock.now) }, true);
    await e.send(request); assert.equal(e.sent.length, 2, 'native response satisfies Header bootstrap');
    e.clock.now += 61000; await e.send(request); assert.equal(e.sent.length, 3);
    e.clock.now += 30001; await e.send(request); assert.equal(e.sent.length, 4, 'lost read has a bounded retry');
    e.local.rpcCache.accountStatus.data.id = 2; delete e.local.rpcCache.marchStatus;
    await e.send(request); assert.equal(e.sent.length, 5, 'account does not inherit another account lease');
  }
});

test('ordinary energy userGetInfo does not trigger march bootstrap; initial login reuses same-batch native snapshots', async () => {
  const e = await environment();
  await e.send({ kind: 'api-record', record: rpc([{ name: 'userGetInfo' }], [{ id: 1, name: 'Fixture', level: 80, gold: 500 }], start) }, true);
  assert.equal(e.sent.length, 0);
  e.clock.now++;
  await e.send({ kind: 'api-record', record: rpc([{ name: 'userGetInfo' }, marchCall, unitCall], [{ id: 2, name: 'Other', level: 80 }, { marches: {} }, { squads: [], available: [] }], start + 1) }, true);
  assert.equal(e.sent.length, 1);
  assert.ok(e.sent[0].calls.every(call => !['getMarches', 'getUnitSummary'].includes(call.name)));
});

test('full deployed gathering teams wait for route transition; missing state requests only its own snapshot', async () => {
  const e = await environment(), plan = e.ctx.hwaHelperAutoGather.planAutoGather;
  const stored = { popupRpcEnabled: true, autoGatherSettings: { enabled: true, smartEnabled: true, mineType: 'food', maxMarches: 1 } };
  e.local.rpcCache.marchStatus.data.marches = [{ squadId: 's', mineId: 'mine', kind: 'food', stage: 'gathering', endsAt: start + 3600000 }];
  assert.equal(plan(e.local.rpcCache, stored, start + 61000).action, 'wait');
  assert.ok(plan(e.local.rpcCache, stored, start + 3600001).calls.some(c => c.name === 'getMarches'));
  e.local.rpcCache.marchStatus.data.marches = []; e.local.rpcCache.marchStatus.updatedAt = stamp(start + 61000);
  const calls = plan(e.local.rpcCache, stored, start + 61000).calls;
  assert.ok(calls.some(c => c.name === 'getUnitSummary')); assert.ok(calls.every(c => c.name !== 'getMarches'));
});

test('captured mine MQTT routes replace march reads and return completion still requires fresh troops', async () => {
  const e = await environment(), cache = e.local.rpcCache;
  cache.marchStatus.data.marches = [{ squadId: 's', mineId: 'mine', kind: 'food', stage: 'gathering', startedAt: start - 1000 }];
  cache['getUnitSummary:unit'].data.squads = [{ id: 's', units: [] }];
  const route = { routeId: 'route', startedAt: start, durationMs: 20000, from: { object: { objectId: 'mine' } }, to: { object: { objectType: 'outpost' } } };
  const returning = mqtt('gatheringMineCompleted', { pushUserId: 1, squadId: 's', mineId: 'mine', routeToOutpost: route }, start);
  e.merge(returning); assert.equal(e.local.rpcCache.marchStatus.data.marches[0].endsAt, start + 20000);
  e.local.autoGatherSettings = { enabled: true, smartEnabled: true, mineType: 'food', maxMarches: 1 };
  e.local.smartGatherState = { accountId: 1, pending: { phase: 'returning', call: { name: 'stopMineGathering', feature: 'mine', args: { squadId: 's' } }, sentAt: start - 1, confirmedAt: start, returnAt: start + 20000 } };
  e.clock.now = start + 10000;
  await e.ctx.runGather(null, e.local.rpcCache, e.local, 1, e.clock.now);
  assert.ok(e.sent.every(msg => !msg.calls?.some(c => c.name === 'getMarches')));
  e.sent.length = 0; e.clock.now = start + 20001;
  const returned = mqtt('returnFromMineCompleted', { pushUserId: 1, squadId: 's' }, e.clock.now);
  await e.send({ kind: 'api-record', record: returned }, true);
  assert.equal(e.local.rpcCache.marchStatus.data.marches.length, 0);
  assert.ok(e.local.smartGatherState.pending, 'MQTT does not invent troop availability');
  assert.ok(e.sent.flatMap(msg => msg.calls || []).some(c => c.name === 'getUnitSummary'));
  assert.ok(e.sent.flatMap(msg => msg.calls || []).every(c => c.name !== 'getMarches'));
  e.clock.now++;
  await e.send({ kind: 'api-record', record: rpc([unitCall], [{ squads: [], available: [] }], e.clock.now) }, true);
  assert.notEqual(e.local.smartGatherState.pending?.call.name, 'stopMineGathering');
});

test('mine MQTT rejects other accounts, unknown squads and stale route replays', async () => {
  const e = await environment();
  e.local.rpcCache.marchStatus.data.marches = [{ squadId: 's', mineId: 'mine', kind: 'return', stage: 'returnToOutpost', returnAt: start }];
  for (const body of [{ pushUserId: 2, squadId: 's' }, { pushUserId: 1, squadId: 'unknown' }]) {
    e.merge(mqtt('returnFromMineCompleted', body, start)); assert.equal(e.local.rpcCache.marchStatus.data.marches.length, 1);
  }
  e.merge(mqtt('returnFromMineCompleted', { pushUserId: 1, squadId: 's' }, start - 2000));
  assert.equal(e.local.rpcCache.marchStatus.data.marches.length, 1);
  e.merge(mqtt('returnFromMineCompleted', { pushUserId: 1, squadId: 's' }, start));
  assert.equal(e.local.rpcCache.marchStatus.data.marches.length, 0);
});

test('a single rally push does not substitute for the first complete march snapshot', async () => {
  const e = await environment();
  delete e.local.rpcCache.marchStatus;
  await e.send({ kind: 'api-record', record: mqtt('rallyUserAutojoined', {
    rallyId: 'r', squad: { squadId: 's', heroes: [], units: [] }, route: { startedAt: start, durationMs: 20000 }
  }, start) }, true);
  assert.ok(e.sent.flatMap(msg => msg.calls || []).some(c => c.name === 'getMarches'));
  await e.send({ kind: 'api-record', record: rpc([marchCall], [{ marches: {} }], start) }, true);
  e.sent.length = 0; e.clock.now++;
  await e.send({ kind: 'api-record', record: mqtt('rallyUserAutojoined', {
    rallyId: 'r2', squad: { squadId: 's2', heroes: [], units: [] }, route: { startedAt: start + 1, durationMs: 20000 }
  }, start + 1) }, true);
  assert.ok(e.sent.flatMap(msg => msg.calls || []).every(c => c.name !== 'getMarches'));
});

test('idle incoming monitoring reuses snapshots for a minute and native refresh restores the window', async () => {
  for (const mode of ['direct', 'piggyback']) {
    const e = await environment(mode), incoming = { name: 'getIncomingMarches', feature: 'march', args: {} };
    e.local.autoGatherSettings = { enabled: true, smartEnabled: true, mineType: 'food', maxMarches: 1 };
    e.local.rpcCache.marchStatus.data.marches = [{ squadId: 'g', kind: 'food', mineId: 'mine', stage: 'gathering', endsAt: start + 3600000 }];
    await e.send({ kind: 'api-record', record: rpc([incoming], [{ attacks: [] }], start) }, true);
    e.sent.length = 0;
    for (let seconds = 5; seconds <= 60; seconds += 5) {
      e.clock.now = start + seconds * 1000;
      await e.ctx.runGather(null, e.local.rpcCache, e.local, 1, e.clock.now);
    }
    assert.equal(e.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getIncomingMarches').length, 0);
    e.clock.now = start + 65000;
    await e.ctx.runGather(null, e.local.rpcCache, e.local, 1, e.clock.now);
    assert.equal(e.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getIncomingMarches').length, 1);
    await e.send({ kind: 'api-record', record: rpc([incoming], [{ attacks: [] }], e.clock.now) }, true);
    e.clock.now += 20000;
    await e.ctx.runGather(null, e.local.rpcCache, e.local, 1, e.clock.now);
    assert.equal(e.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getIncomingMarches').length, 1);
  }
});

test('rally push bursts coalesce and defer only unsatisfied newer versions', async () => {
  for (const mode of ['direct', 'piggyback']) {
    const e = await environment(mode), own = { squadId: 's', kind: 'raid', rally: { id: 'r' } };
    e.local.rpcCache.marchStatus.data.marches = [own];
    await e.send({ kind: 'api-record', record: mqtt('rallyMembersUpdated', { rallyId: 'r', rallyVersion: 1 }, start) }, true);
    for (let version = 2; version <= 10; version++) {
      e.clock.now++;
      await e.send({ kind: 'api-record', record: mqtt('rallyMembersUpdated', { rallyId: 'r', rallyVersion: version }, e.clock.now) }, true);
    }
    const count = () => e.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getRallyById').length;
    assert.equal(count(), 1); assert.ok(e.alarms.has('hwa-world-read'));
    e.clock.now = start + 5001;
    await e.fireAlarm('hwa-world-read');
    assert.equal(count(), 2, 'one trailing read covers all newer versions');
    const call = { name: 'getRallyById', feature: 'rally', args: { rallyId: 'r' } };
    await e.send({ kind: 'api-record', record: rpc([call], [{ rally: { rallyId: 'r', mapId: 'map', rallyVersion: 10, leader: { userId: 2 }, members: [] } }], e.clock.now) }, true);
    e.clock.now++;
    await e.send({ kind: 'api-record', record: mqtt('rallyMembersUpdated', { rallyId: 'r', rallyVersion: 10 }, e.clock.now) }, true);
    assert.equal(count(), 2, 'same version native details satisfy repeated pushes');
    await e.send({ kind: 'refresh-rpc', calls: [call] }); assert.equal(count(), 3, 'manual refresh bypasses debounce');
  }
});

test('a native latest-version response satisfies a deferred rally request without sending the trailing RPC', async () => {
  const e = await environment(); e.local.rpcCache.marchStatus.data.marches = [{ squadId: 's', rally: { id: 'r' } }];
  for (const version of [1, 2]) {
    e.clock.now++;
    await e.send({ kind: 'api-record', record: mqtt('rallyMembersUpdated', { rallyId: 'r', rallyVersion: version }, e.clock.now) }, true);
  }
  e.clock.now++;
  await e.send({ kind: 'api-record', record: rpc([{ name: 'getRallyById', feature: 'rally', args: { rallyId: 'r' } }],
    [{ rally: { rallyId: 'r', rallyVersion: 2, mapId: 'map', members: [] } }], e.clock.now) }, true);
  e.clock.now = start + 6000; await e.fireAlarm('hwa-world-read');
  assert.equal(e.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getRallyById').length, 1);
  assert.equal(e.alarms.has('hwa-world-read'), false);
});

test('deferred rally refresh survives worker restart and is dropped if the account or RPC policy changes', async () => {
  const e = await environment(); e.local.rpcCache.marchStatus.data.marches = [{ squadId: 's', rally: { id: 'r' } }];
  for (const version of [1, 2]) {
    e.clock.now++;
    await e.send({ kind: 'api-record', record: mqtt('rallyMembersUpdated', { rallyId: 'r', rallyVersion: version }, e.clock.now) }, true);
  }
  const restart = await environment('direct', e.local);
  assert.ok(restart.alarms.has('hwa-world-read'));
  restart.clock.now = start + 6000; await restart.fireAlarm('hwa-world-read');
  assert.equal(restart.sent.flatMap(msg => msg.calls || []).filter(c => c.name === 'getRallyById').length, 1);
  for (const change of ['account', 'settings']) {
    const stopped = await environment('direct', e.local);
    if (change === 'account') stopped.local.rpcCache.accountStatus.data.id = 2;
    else stopped.local.popupRpcEnabled = false;
    stopped.clock.now = start + 6000; await stopped.fireAlarm('hwa-world-read');
    assert.equal(stopped.sent.length, 0); assert.equal(stopped.local.worldReadState, undefined);
  }
});
