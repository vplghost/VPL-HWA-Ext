import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { mineDefenseService } from '../src/services/mineDefense.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/mine-attacks-20261114.json', import.meta.url), 'utf8'));
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';

function environment() {
  const local = {}, sent = [], alarms = [], clock = { now: 0 };
  const area = { get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]])), set: async value => Object.assign(local, value), remove: async () => {} };
  const chrome = { storage: { local: area, session: area, onChanged: { addListener() {} } },
    runtime: { id: 'test', onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
    alarms: { get: (name, cb) => cb({}), create: (name, args) => alarms.push({ name, ...args }), onAlarm: { addListener() {} } },
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
    runDefense: (...args) => withClock(() => bg.evaluateSmartGather(...args)),
    tickMine: (...args) => withClock(() => bg.tickAutoGather(...args)),
    hwaHelperMineDefense: mineDefenseService,
    hwaHelperRpcCache: reducer
  };

  let cache = { accountStatus: { data: { id: fixture.accountId } } };
  for (const key of ['getSummary', 'getMarches', 'getUnitSummary', 'getHealing', 'getIncomingMarches']) cache = reducer.merge(cache, [fixture.rpc[key]]).cache;
  Object.assign(local, { rpcCache: cache, popupRpcEnabled: true, socketRefreshMode: 'direct', autoGatherSettings: { enabled: true, smartEnabled: true } });
  const attack = Object.values(cache.incomingMineAttacks.data.attacks)[0];
  clock.now = attack.impactAt - 10000;
  return { ctx, cache, local, sent, alarms, clock, attack, helper: mineDefenseService, reducer };
}
function crowdHospital(cache) { cache['getHealing:unit'].data.injuredUnits = [{ unitId: 7, count: 23000 }]; }
function socket(type, body, time) { return { transport: 'websocket', direction: 'received', encoding: 'utf8', endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', timestamp: new Date(time).toISOString(), payload: JSON.stringify({ result: { type, body } }) }; }

test('late-load RPC identifies mine and exact impact; captured hospital occupancy is below 50%', () => {
  const { helper, cache, attack, clock } = environment();
  assert.equal(attack.routeId, '476a2092-9cd5-4e24-8bfb-e67b9df03f59');
  assert.equal(attack.impactAt, 1794658795363);
  assert.equal(helper.hospital(cache, clock.now).capacity, 23100);
  assert.equal(helper.hospital(cache, clock.now).wounded, 11188);
  assert.equal(helper.hospital(cache, clock.now).free, 11912);
  assert.equal(helper.plan(cache, {}, clock.now), null);
});

test('defense requires strictly above 50% infirmary occupancy, regardless of defending squad size', () => {
  const { helper, cache, clock } = environment();
  const healing = cache['getHealing:unit'].data;
  const march = cache.marchStatus.data.marches.find(m => m.mineId === Object.values(cache.incomingMineAttacks.data.attacks)[0].mineId);
  const squad = cache['getUnitSummary:unit'].data.squads.find(s => (s.squadId ?? s.id) === march.squadId);
  squad.units = [{ count: 20000 }];
  for (const wounded of [0, 11549, 11550]) {
    healing.injuredUnits = [{ count: wounded }];
    assert.equal(helper.plan(cache, {}, clock.now), null, `No recall with ${wounded}/23100 wounded, even if the squad exceeds free space`);
  }
  squad.units = [{ count: 1 }];
  healing.injuredUnits = [{ count: 11551 }];
  const plan = helper.plan(cache, {}, clock.now);
  assert.equal(plan.action, 'recall', 'Above 50% recalls even when a one-troop squad fits the remaining space');
  assert.match(plan.reason, /above 50%/);
});

test('unknown, stale or zero infirmary capacity cannot authorize recall above the threshold', () => {
  for (const mode of ['missing', 'stale', 'zero']) {
    const { helper, cache, clock } = environment(); crowdHospital(cache);
    if (mode === 'missing') delete cache.buildingStatus;
    if (mode === 'stale') cache.buildingStatus.updatedAt = new Date(clock.now - 60001).toISOString();
    if (mode === 'zero') cache.buildingStatus.data.buildings = [];
    assert.equal(helper.plan(cache, {}, clock.now).action, 'refresh', mode);
  }
});

test('background rechecks the 50% occupancy threshold at the scheduled recall time', async () => {
  const { ctx, cache, local, clock, attack, sent, alarms } = environment();
  cache['getHealing:unit'].data.injuredUnits = [{ count: 11551 }];
  clock.now = attack.impactAt - 10001;
  await ctx.runDefense(null, cache, local, 1, clock.now);
  assert.ok(alarms.some(a => a.when === attack.impactAt - 10000));
  cache['getHealing:unit'].data.injuredUnits = [{ count: 11550 }];
  clock.now++;
  await ctx.runDefense(null, cache, local, 1, clock.now);
  assert.equal(sent.some(msg => msg.calls?.some(call => call.name === 'stopMineGathering')), false);
  cache['getHealing:unit'].data.injuredUnits = [{ count: 11551 }];
  await ctx.runDefense(null, cache, local, 1, clock.now + 1);
  assert.equal(sent.filter(msg => msg.calls?.[0]?.name === 'stopMineGathering').length, 1);
});

test('full hospital recalls only within [impact-10s, impact), using defending squad not enemy squad', () => {
  const { helper, cache, attack } = environment(); crowdHospital(cache);
  assert.equal(helper.plan(cache, {}, attack.impactAt - 10001).action, 'wait');
  const plan = helper.plan(cache, {}, attack.impactAt - 10000);
  assert.equal(plan.action, 'recall');
  assert.equal(plan.call.args.squadId, '708cf95e-5e9c-4dc3-89df-dbc4c0efc50b');
  assert.equal(plan.count, 4194);
  assert.equal(helper.plan(cache, {}, attack.impactAt), null);
  assert.equal(helper.plan(cache, {}, attack.impactAt + 1), null);
});

test('live MQTT detection and end remove the correct enemy attack and block replay', () => {
  const { reducer, cache } = environment();
  const detected = reducer.merge(cache, [fixture.mqtt[0]]).cache;
  const id = JSON.parse(fixture.mqtt[0].payload).result.body.route.routeId;
  assert.ok(detected.incomingMineAttacks.data.attacks[id]);
  const ended = reducer.merge(detected, [fixture.mqtt[1]]).cache;
  assert.equal(ended.incomingMineAttacks.data.attacks[id], undefined);
  const replay = { ...fixture.mqtt[0], timestamp: new Date(Date.parse(fixture.mqtt[1].timestamp) + 1).toISOString() };
  assert.equal(reducer.merge(ended, [replay]).cache.incomingMineAttacks.data.attacks[id], undefined);
});

test('newer route versions win and empty RPC snapshot retires prior incoming attacks', () => {
  const { reducer, cache, attack } = environment();
  const body = JSON.parse(fixture.mqtt[2].payload).result.body;
  const newer = structuredClone(body); newer.route.version = 2; newer.route.durationMs += 5000;
  let current = reducer.merge(cache, [socket('marchAttackDetected', newer, attack.impactAt + 150000)]).cache;
  current = reducer.merge(current, [socket('marchAttackDetected', body, attack.impactAt + 150001)]).cache;
  assert.equal(current.incomingMineAttacks.data.attacks[body.route.routeId].version, 2);
  const empty = { ...fixture.rpc.getIncomingMarches, timestamp: new Date(attack.impactAt + 150002).toISOString(), responseBody: JSON.stringify({ results: [{ ident: 'e', result: { response: { attacks: [] } } }] }) };
  current = reducer.merge(current, [empty]).cache;
  assert.equal(Object.keys(current.incomingMineAttacks.data.attacks).length, 0);
});

test('missing/stale hospital or troop count refreshes instead of guessing; foreign recipient cannot trigger', () => {
  const { helper, cache, clock, reducer } = environment();
  delete cache['getHealing:unit'];
  assert.equal(helper.plan(cache, {}, clock.now).action, 'refresh');
  const body = JSON.parse(fixture.mqtt[0].payload).result.body; body.pushUserId = 99;
  const changed = reducer.merge(cache, [socket('marchAttackDetected', body, clock.now)]).cache;
  assert.equal(Object.keys(changed.incomingMineAttacks.data.attacks).length, 1);
  const switched = reducer.merge(cache, [{ key: 'accountStatus', updatedAt: new Date(clock.now).toISOString(), data: { id: 99 } }]).cache;
  assert.equal(switched.incomingMineAttacks, undefined);
});

test('background schedules and sends exactly one recall with an impact deadline, then records confirmed return', async () => {
  const { ctx, cache, local, clock, attack, sent, alarms } = environment(); crowdHospital(cache);
  clock.now = attack.impactAt - 10001;
  await ctx.runDefense(null, cache, local, 1, clock.now);
  assert.equal(sent.some(msg => msg.calls?.some(call => call.name === 'stopMineGathering')), false);
  assert.ok(alarms.some(a => a.when === attack.impactAt - 10000));
  clock.now++;
  await ctx.runDefense(null, cache, local, 1, clock.now);
  const recall = sent.find(msg => msg.calls?.[0]?.name === 'stopMineGathering');
  assert.equal(recall.expiresAt, attack.impactAt);
  assert.equal(recall.group, 'mine-defense:' + attack.routeId);
  await ctx.runDefense(null, cache, local, 1, clock.now + 1);
  assert.equal(sent.filter(msg => msg.calls?.[0]?.name === 'stopMineGathering').length, 1);
  assert.equal(local.smartGatherState.interrupted.length, 0);
  const response = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(clock.now + 2).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...recall.calls[0], ident: 'r' }] }), responseBody: JSON.stringify({ results: [{ ident: 'r', result: { response: { squadId: recall.calls[0].args.squadId, route: { startedAt: clock.now + 2, durationMs: 18898 } } } }] }) };
  await ctx.runDefense(response, cache, local, 1, clock.now + 2);
  assert.equal(local.smartGatherState.defense.pending.phase, 'returning');
  assert.equal(local.smartGatherState.interrupted[0].defense, true);
});

test('piggyback retains global mode and expires defensive recall at impact; RPC disabled sends nothing', async () => {
  const { ctx, cache, local, clock, attack, sent } = environment(); crowdHospital(cache);
  local.socketRefreshMode = 'piggyback';
  await ctx.runDefense(null, cache, local, 1, clock.now);
  assert.equal(sent.find(msg => msg.calls?.[0]?.name === 'stopMineGathering').kind, 'queue-rpc');
  assert.equal(sent.find(msg => msg.calls?.[0]?.name === 'stopMineGathering').expiresAt, attack.impactAt);
  const disabled = environment(); disabled.local.popupRpcEnabled = false; crowdHospital(disabled.cache);
  await disabled.ctx.runDefense(null, disabled.cache, disabled.local, 1, disabled.clock.now);
  assert.equal(disabled.sent.length, 0);
});

test('defensive interrupted mine is skipped while hostile/unknown, resumes only with post-impact vacancy', () => {
  const { helper, cache, attack } = environment();
  const mine = { mineId: attack.mineId, mapId: attack.mapId, configId: 76, defense: true, resumeAfter: attack.impactAt + 1000 };
  const state = { interrupted: [mine] }, now = attack.impactAt + 20000;
  assert.ok(helper.unsafeMineIds(cache, state, now).has(mine.mineId));
  cache.mineMap = { [mine.mineId]: { gatheringUserId: 99, observedAt: new Date(now).toISOString() } };
  assert.ok(helper.unsafeMineIds(cache, state, now).has(mine.mineId));
  cache.mineMap[mine.mineId].gatheringUserId = null;
  assert.equal(helper.unsafeMineIds(cache, state, now).has(mine.mineId), false);
  delete cache.mineMap[mine.mineId].observedAt;
  assert.equal(helper.unsafeMineIds(cache, state, now).has(mine.mineId), true, 'vacancy without an observation time is unknown');
});

test('overlapping attacks recall separate own squads and retain both confirmations', async () => {
  const { ctx, cache, local, clock, attack, sent } = environment(); crowdHospital(cache);
  const march = cache.marchStatus.data.marches.find(m => m.squadId === '0c64e739-6dcc-4067-889e-58ac500e95be');
  const second = { ...structuredClone(attack), routeId: 'parallel-route', mineId: march.mineId, impactAt: attack.impactAt + 1, enemySquadIds: ['parallel-enemy'] };
  cache.incomingMineAttacks.data.attacks[second.routeId] = second;
  await ctx.runDefense(null, cache, local, 1, clock.now);
  await ctx.runDefense(null, cache, local, 1, clock.now + 2);
  const recalls = sent.filter(msg => msg.calls?.[0]?.name === 'stopMineGathering');
  assert.equal(recalls.length, 2);
  assert.equal(new Set(recalls.map(r => r.calls[0].args.squadId)).size, 2);
  assert.equal(local.smartGatherState.defense.waiting.length, 1);
  assert.notEqual(recalls[0].group, recalls[1].group);
});

test('route completion before impact invalidates threat and no recall is sent after the window', async () => {
  const { reducer, cache, attack, clock, helper, ctx, local, sent } = environment(); crowdHospital(cache);
  const ended = reducer.merge(cache, [socket('routeCompleted', { routeId: attack.routeId }, clock.now - 1)]).cache;
  assert.equal(helper.plan(ended, {}, clock.now), null);
  await ctx.runDefense(null, cache, local, 1, attack.impactAt);
  assert.equal(sent.some(msg => msg.calls?.some(call => call.name === 'stopMineGathering')), false);
});

test('account change drops queued defense groups before clearing the old runtime', async () => {
  const { ctx, cache, local, clock, attack, sent } = environment(); crowdHospital(cache);
  await ctx.runDefense(null, cache, local, 1, clock.now);
  cache.accountStatus.data.id = 99;
  await ctx.runDefense(null, cache, local, 1, clock.now + 1);
  assert.ok(sent.some(msg => msg.kind === 'drop-rpc-group' && msg.group === 'mine-defense:' + attack.routeId));
  assert.equal(local.smartGatherState.accountId, 99);
  assert.equal(local.smartGatherState.defense.pending, null);
});

test('disabling Smart while basic auto-gather remains enabled cancels queued defensive recalls', async () => {
  const { ctx, cache, local, clock, attack, sent } = environment(); crowdHospital(cache);
  await ctx.runDefense(null, cache, local, 1, clock.now);
  local.autoGatherSettings.smartEnabled = false;
  ctx.chrome.tabs.query = (args, cb) => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]);
  await ctx.tickMine(true);
  assert.ok(sent.some(msg => msg.kind === 'drop-rpc-group' && msg.group === 'mine-defense:' + attack.routeId));
});
