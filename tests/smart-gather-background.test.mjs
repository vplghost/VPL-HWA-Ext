import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root = new URL('../extension/', import.meta.url);
function environment() {
  const local = {}, sent = [], session = {};
  const clock = { now: Date.now() };
  class Clock extends Date { static now() { return clock.now; } }
  const area = state => ({ get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(state)).filter(k => k in state).map(k => [k, state[k]])),
    set: async data => Object.assign(state, data), remove: async keys => (Array.isArray(keys) ? keys : [keys]).forEach(k => delete state[k]) });
  const chrome = { runtime: { id: 'test', onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
    storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
    alarms: { get: (name, cb) => cb({}), onAlarm: { addListener() {} } },
    tabs: { query: (filter, cb) => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]),
      sendMessage: async (tabId, message) => sent.push(message) } };
  const ctx = vm.createContext({ chrome, console, TextEncoder, URL, structuredClone, Date: Clock });
  ctx.importScripts = (...names) => names.forEach(name => vm.runInContext(readFileSync(new URL(name, root), 'utf8'), ctx));
  vm.runInContext(readFileSync(new URL('background.js', root), 'utf8') + '\nglobalThis.runSmart = evaluateSmartGather; globalThis.deferGather = deferQueueForGathering; globalThis.advanceGather = advanceGatherQueue; globalThis.runPriority = evaluatePriorityAutoJoin;', ctx);
  return { local, sent, ctx, clock };
}
const at = Date.now();
function fixture() {
  const heroes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { id: i + 1, power: 10000, level: 40, star: 3 }]));
  const mine = { squadId: 'g', mineId: 'mine', mineConfigId: 68, targetCoordinates: { x: 10, y: 0 }, kind: 'food', stage: 'gathering' };
  return { popupRpcEnabled: true, socketRefreshMode: 'direct', autoGatherSettings: { enabled: true, smartEnabled: true, maxMarches: 1, mineType: 'food' },
    rpcCache: { accountStatus: { data: { id: 1 } }, heroGetAll: { data: heroes }, marchStatus: { updatedAt: new Date(at).toISOString(), data: { marches: [mine] } },
      'getUnitSummary:unit': { updatedAt: new Date(at).toISOString(), data: { available: [{ unitId: 7, count: 10000 }], squads: [{ id: 'g', heroes: [1,2,3,4,5].map(id => ({ id })) }] } },
      experimentalMapContext: { data: { mapId: 'map', center: { x: 0, y: 0 }, outposts: { 1: { x: 0, y: 0 } } } },
      experimentalRallySearch: { updatedAt: new Date(at).toISOString(), data: { mapId: 'map', mobConfigIds: [78], mobs: [{ mobId: 'boss' }] } } } };
}
function rpc(call, response, time) { return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(time).toISOString(),
  requestBody: JSON.stringify({ calls: [{ ...call, ident: '1' }] }), responseBody: JSON.stringify({ results: [{ ident: '1', result: { response } }] }) }; }

test('queue recall is wired: waits for confirmed return and then starts existing raid controller', async () => {
  const { local, ctx } = environment(); Object.assign(local, fixture());
  const options = { mapId: 'map', center: { x: 0, y: 0 }, level: 19, firstMobId: 'boss', waitSeconds: 60, count: 1, minMembers: 1, heroIds: [1,2,3,4,5] };
  const transition = await ctx.deferGather('raid', options, 1, 1, local, at);
  assert.equal(transition.state.phase, 'waiting_gather');
  assert.equal(transition.calls[0].name, 'stopMineGathering');
  local.raidQueue = transition.state;
  await ctx.advanceGather('raid', rpc(transition.calls[0], { squadId: 'g', route: { startedAt: at + 1, durationMs: 1000 } }, at + 1), local, 1);
  assert.equal(local.raidQueue.phase, 'waiting_gather');
  local.rpcCache.marchStatus = { updatedAt: new Date(at + 2000).toISOString(), data: { marches: [] } };
  local.rpcCache['getUnitSummary:unit'] = { updatedAt: new Date(at + 2000).toISOString(), data: { available: [{ unitId: 7, count: 10000 }], squads: [] } };
  await ctx.advanceGather('raid', null, local, 1);
  assert.equal(local.raidQueue.phase, 'creating');
  assert.equal(local.smartGatherState.interrupted[0].mineId, 'mine');
});

test('active queues suppress gather; terminal queue checks interrupted mine before resuming', async () => {
  const { local, ctx, sent } = environment(); Object.assign(local, fixture());
  local.rpcCache.marchStatus.data.marches = [];
  local.raidQueue = { id: 'q', phase: 'waiting' };
  await ctx.runSmart(null, local.rpcCache, local, 1, at);
  assert.equal(sent.some(msg => msg.calls?.some(call => ['attackMine', 'searchMine'].includes(call.name))), false);
  local.raidQueue.phase = 'stopped';
  local.smartGatherState.interrupted = [{ mineId: 'mine', mapId: 'map', configId: 68 }];
  await ctx.runSmart(null, local.rpcCache, local, 1, at + 6000);
  assert.equal(sent.at(-1).calls[0].name, 'getMineById');
  const pending = local.smartGatherState.pending;
  await ctx.runSmart(rpc(pending.call, { mineId: 'mine', resourceAmount: 10 }, at + 6001), local.rpcCache, local, 1, at + 12000);
  assert.equal(sent.at(-1).calls[0].name, 'attackMine');
  assert.equal(sent.at(-1).calls[0].args.mineId, 'mine', 'resume bypasses one-hour limit');
  assert.equal(local.smartGatherState.interrupted.length, 1, 'dispatch acknowledgement does not consume resume target');
});

test('priority rally recalls once, rechecks after return and waits for raid return before resume', async () => {
  const { local, ctx, sent, clock } = environment(); Object.assign(local, fixture());
  local.priorityAutoJoin = { enabled: true, minLevel: 10, teamId: 'highest' };
  const rally = { rallyId: 'r', mapId: 'map', rallyVersion: 1, plannedStartTime: Date.now() + 60000,
    leader: { userId: 2 }, members: [], membersCapacityLeft: 5, mob: { mobConfigId: 78 } };
  const call = { name: 'getRallyById', feature: 'rally', args: { rallyId: 'r', mapId: 'map' } };
  const start = Date.now();
  await ctx.runPriority(rpc(call, { rally }, start), local.rpcCache, local, 1);
  assert.equal(sent.at(-1).calls[0].name, 'stopMineGathering');
  await ctx.runPriority(rpc(call, { rally }, start + 1), local.rpcCache, local, 1);
  assert.equal(sent.length, 1, 'pending recall is never repeated');
  const recall = local.smartGatherState.pending.call;
  await ctx.runSmart(rpc(recall, { squadId: 'g', route: { startedAt: start, durationMs: 1000 } }, start + 2), local.rpcCache, local, 1, start + 2);
  local.rpcCache.marchStatus = { updatedAt: new Date(start + 2000).toISOString(), data: { marches: [] } };
  local.rpcCache['getUnitSummary:unit'] = { updatedAt: new Date(start + 2000).toISOString(), data: { available: [{ unitId: 7, count: 10000 }], squads: [] } };
  await ctx.runSmart(null, local.rpcCache, local, 1, start + 6000);
  assert.equal(sent.at(-1).calls[0].name, 'getRallyById');
  const recheck = local.smartGatherState.pending.call;
  clock.now = start + 6001;
  await ctx.runPriority(rpc(recheck, { rally }, start + 6001), local.rpcCache, local, 1);
  assert.equal(sent.at(-1).calls[0].name, 'joinRally');
  const join = local.smartGatherState.pending.call;
  await ctx.runSmart(rpc(join, { squadId: 'raid-squad' }, start + 6002), local.rpcCache, local, 1, start + 6002);
  assert.equal(local.smartGatherState.reservation.type, 'joinedRally');
  assert.equal(local.smartGatherState.interrupted.length, 1);
});

test('queue cancellation after confirmed recall preserves the mine and resumes only after return', async () => {
  const { local, ctx, sent } = environment(); Object.assign(local, fixture());
  const call = { name: 'stopMineGathering', feature: 'mine', args: { squadId: 'g' } };
  local.raidQueue = { id: 'q', phase: 'stopped' };
  local.smartGatherState = { accountId: 1, interrupted: [], reservation: { type: 'raid', queueId: 'q' },
    pending: { call, phase: 'sent', sentAt: at, mine: { mineId: 'mine', mapId: 'map', configId: 68 } } };
  await ctx.runSmart(rpc(call, { squadId: 'g', route: { startedAt: at + 1, durationMs: 1000 } }, at + 1), local.rpcCache, local, 1, at + 1);
  assert.equal(local.smartGatherState.reservation, null);
  assert.equal(local.smartGatherState.pending.phase, 'returning');
  assert.equal(sent.some(msg => msg.calls?.some(call => call.name === 'attackMine')), false);
  local.rpcCache.marchStatus = { updatedAt: new Date(at + 2000).toISOString(), data: { marches: [] } };
  local.rpcCache['getUnitSummary:unit'].updatedAt = new Date(at + 2000).toISOString();
  local.rpcCache['getUnitSummary:unit'].data.squads = [];
  await ctx.runSmart(null, local.rpcCache, local, 1, at + 6000);
  assert.equal(sent.at(-1).calls[0].name, 'getMineById');
});

test('shared RPC policy does not create an unissued pending Smart gathering action', async () => {
  const { local, ctx, sent } = environment(); Object.assign(local, fixture());
  local.popupRpcEnabled = false;
  await ctx.runSmart(null, local.rpcCache, local, 1, Date.now());
  assert.equal(sent.length, 0);
  assert.equal(local.smartGatherState.pending, undefined);
  assert.match(local.smartGatherState.status, /paused by shared RPC settings/);
});
