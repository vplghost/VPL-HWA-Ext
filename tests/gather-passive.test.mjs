import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const root = new URL('../extension/', import.meta.url);
const start = Date.parse('2026-11-15T07:00:00Z');
const stamp = at => new Date(at).toISOString();
const marchCall = { name: 'getMarches', feature: 'march' }, unitCall = { name: 'getUnitSummary', feature: 'unit' };
const rpc = (calls, replies, at) => ({ transport: 'fetch', method: 'POST', status: 200, durationMs: 1, outcome: 'completed', timestamp: stamp(at),
  endpoint: 'https://api.hero-wars-alliance.com/api/rpc', requestBody: JSON.stringify({ calls: calls.map((c, i) => ({ ...c, ident: String(i) })) }),
  responseBody: JSON.stringify({ results: replies.map((response, i) => ({ ident: String(i), result: { response } })) }) });
const mqtt = (type, body, at) => ({ transport: 'websocket', method: 'PUBLISH', status: null, durationMs: 0, outcome: 'completed', direction: 'received', encoding: 'utf8', timestamp: stamp(at),
  topic: 'hwm/user/test', qos: 0, payloadTruncated: false, payloadBytes: 100,
  endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', payload: JSON.stringify({ result: { type, body } }) });
async function environment(mode = 'direct') {
  const clock = { now: start }, local = { popupRpcEnabled: true, socketRefreshMode: mode, rpcCache: {
    accountStatus: { data: { id: 1 } }, marchStatus: { method: 'getMarches', updatedAt: stamp(start), data: { marches: [] } },
    'getUnitSummary:unit': { updatedAt: stamp(start), data: { squads: [], available: [] } } } };
  const sent = []; let listener;
  class Clock extends Date { static now() { return clock.now; } }
  const area = { get: async keys => structuredClone(Object.fromEntries((keys == null ? Object.keys(local) : Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]]))),
    set: async values => Object.assign(local, structuredClone(values)), remove: async keys => (Array.isArray(keys) ? keys : [keys]).forEach(k => delete local[k]) };
  const chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    storage: { local: area, session: area, onChanged: { addListener() {} } },
    alarms: { get: (_, cb) => cb({}), create() {}, clear() {}, onAlarm: { addListener() {} } },
    tabs: { query: (_, cb) => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]), sendMessage: async (_, msg) => { sent.push(structuredClone(msg)); return { ok: true }; } } };
  const ctx = vm.createContext({ chrome, console, Date: Clock, URL, TextEncoder, crypto: webcrypto, structuredClone });
  ctx.importScripts = (...files) => files.forEach(file => vm.runInContext(readFileSync(new URL(file, root), 'utf8'), ctx));
  vm.runInContext(readFileSync(new URL('background.js', root), 'utf8') + '\nglobalThis.drain=()=>pending; globalThis.runGather=evaluateSmartGather;', ctx);
  await ctx.drain();
  const send = (message, game = false) => new Promise(resolve => listener(message, game ? { url: 'https://www.hero-wars-alliance.com/', tab: { id: 1 } } : { url: 'chrome-extension://test/popup.html' }, resolve));
  const merge = record => { local.rpcCache = structuredClone(ctx.hwaHelperRpcCache.merge(local.rpcCache, [record]).cache); };
  return { ctx, clock, local, sent, send, merge };
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
