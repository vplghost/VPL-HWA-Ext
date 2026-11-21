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

test('defenseRecallEnabled=false suppresses recall/intercept on attack', () => {
  const { helper, cache, clock } = environment(); crowdHospital(cache);
  const planEnabled = helper.plan(cache, {}, clock.now, { defenseRecallEnabled: true });
  assert.equal(planEnabled?.action, 'recall');
  const planDisabled = helper.plan(cache, {}, clock.now, { defenseRecallEnabled: false });
  assert.equal(planDisabled, null);
});

test('custom defenseInfirmaryThreshold changes recall trigger threshold', () => {
  const { helper, cache, clock } = environment();
  const healing = cache['getHealing:unit'].data;
  // Hospital capacity is 23100. 40% = 9240. 60% = 13860.
  healing.injuredUnits = [{ count: 10000 }]; // ~43%
  // With 50% threshold: 10000 <= 11550 -> no recall
  assert.equal(helper.plan(cache, {}, clock.now, { defenseInfirmaryThreshold: 50 }), null);
  // With 40% threshold: 10000 > 9240 -> recalls
  const plan40 = helper.plan(cache, {}, clock.now, { defenseInfirmaryThreshold: 40 });
  assert.equal(plan40?.action, 'recall');
  assert.match(plan40?.reason, /above 40%/);
  // With 60% threshold: 10000 <= 13860 -> no recall
  assert.equal(helper.plan(cache, {}, clock.now, { defenseInfirmaryThreshold: 60 }), null);
});

test('intercept clears nearest gathering slot when marches are full, then dispatches intercept squad', () => {
  const { helper, cache, clock, attack } = environment(); // hospital wounded = 11188 <= 50% (under threshold -> allows intercept)
  cache.customTeams = [{ id: 'combat-1', heroIds: [1, 2, 3, 4, 5] }];
  const settings = {
    defenseRecallEnabled: true,
    defenseInfirmaryThreshold: 50,
    interceptTeamId: 'combat-1',
    maxMarches: 2, // 2 marches currently gathering -> 0 available slots
  };

  // Step 1: No free slots -> clear_slot by recalling nearest other gatherer
  const plan1 = helper.plan(cache, {}, clock.now, settings);
  assert.equal(plan1?.action, 'clear_slot');
  assert.match(plan1?.reason, /Clearing march slot/);
  assert.equal(plan1?.call?.args?.squadId, '0c64e739-6dcc-4067-889e-58ac500e95be');

  // Step 2: When slots are available -> intercept (recall threatened gatherer & attackMine)
  settings.maxMarches = 3;
  const plan2 = helper.plan(cache, {}, clock.now, settings);
  assert.equal(plan2?.action, 'intercept');
  assert.match(plan2?.reason, /Intercepting mine attack/);
  assert.equal(plan2?.call?.args?.squadId, '708cf95e-5e9c-4dc3-89df-dbc4c0efc50b');
  assert.equal(plan2?.intercept?.phase, 'intercepting');
  assert.equal(plan2?.calls?.[0]?.name, 'stopMineGathering');
});

test('when wounded troops exceed threshold, recall only and never intercept even with interceptTeamId', () => {
  const { helper, cache, clock, attack } = environment(); crowdHospital(cache); // wounded = 23000 > 50%
  cache.customTeams = [{ id: 'combat-1', heroIds: [1, 2, 3, 4, 5] }];
  const settings = {
    defenseRecallEnabled: true,
    defenseInfirmaryThreshold: 50,
    interceptTeamId: 'combat-1',
    maxMarches: 3,
  };
  const plan = helper.plan(cache, {}, clock.now, settings);
  assert.equal(plan?.action, 'recall', 'Must recall instead of intercept when infirmary exceeds threshold');
  assert.match(plan?.reason, /above 50%/);
});

test('intercept switches squads back after battle impact, or after 5s when enemy retreats', () => {
  const { helper, cache, clock, attack } = environment();
  const intercept = {
    phase: 'intercepting',
    mineId: attack.mineId,
    mapId: attack.mapId,
    attackRouteId: attack.routeId,
    impactAt: attack.impactAt,
    threatenedSquadId: '708cf95e-5e9c-4dc3-89df-dbc4c0efc50b',
    interceptSquadId: 'intercept-squad-1',
    farmingHeroIds: [42, 11, 44, 26, 32],
  };

  // Case A: Enemy aborts attack before impact -> waits 5s
  delete cache.incomingMineAttacks.data.attacks[attack.routeId];
  const waitPlan = helper.plan(cache, { intercept }, clock.now, { interceptTeamId: 'combat-1' });
  assert.equal(waitPlan?.action, 'wait');
  assert.equal(waitPlan?.intercept?.phase, 'awaiting_switch');
  assert.equal(waitPlan?.intercept?.switchBackAt, clock.now + 5000);

  // Still waiting at 4s
  const waitStill = helper.plan(cache, { intercept: waitPlan.intercept }, clock.now + 4000, { interceptTeamId: 'combat-1' });
  assert.equal(waitStill?.action, 'wait');

  // At 5s: switch squads back
  const switchPlan = helper.plan(cache, { intercept: waitPlan.intercept }, clock.now + 5000, { interceptTeamId: 'combat-1' });
  assert.equal(switchPlan?.action, 'switch_back');
  assert.match(switchPlan?.reason, /switching squads back/);
  assert.equal(switchPlan?.calls?.[0]?.name, 'stopMineGathering');
  assert.equal(switchPlan?.calls?.[0]?.args?.squadId, 'intercept-squad-1');

  // Case B: Battle impact reached
  const impactIntercept = structuredClone(intercept);
  impactIntercept.phase = 'intercepting';
  delete impactIntercept.enemyAborted;
  delete impactIntercept.switchBackAt;
  cache.incomingMineAttacks.data.attacks[attack.routeId] = attack;
  const postImpactPlan = helper.plan(cache, { intercept: impactIntercept }, attack.impactAt, { interceptTeamId: 'combat-1' });
  assert.equal(postImpactPlan?.action, 'switch_back');
  assert.match(postImpactPlan?.reason, /Attack resolved/);
});

test('intercept prioritizes clearing slot immediately when attack is > 2 minutes away, and swaps squad once slot opens', () => {
  const { helper, cache, attack } = environment();
  const attackTime = attack.impactAt;
  const now = attackTime - 130000; // 2 minutes 10 seconds before impact
  const isoNow = new Date(now).toISOString();
  cache.marchStatus.updatedAt = isoNow;
  cache['getUnitSummary:unit'].updatedAt = isoNow;
  cache.buildingStatus.updatedAt = isoNow;
  cache['getHealing:unit'].updatedAt = isoNow;
  cache.customTeams = [{ id: 'combat-1', heroIds: [1, 2, 3, 4, 5] }];
  const settings = {
    defenseRecallEnabled: true,
    defenseInfirmaryThreshold: 50,
    interceptTeamId: 'combat-1',
    maxMarches: 2, // 2 marches currently gathering -> 0 available slots
  };

  // Step 1: Immediately clears slot upon attack signal (>2m away), does NOT wait until 10s
  const plan1 = helper.plan(cache, {}, now, settings);
  assert.equal(plan1?.action, 'clear_slot');
  assert.match(plan1?.reason, /Clearing march slot/i);
  assert.equal(plan1?.intercept?.phase, 'clearing_slot');
  assert.equal(plan1?.call?.args?.squadId, '0c64e739-6dcc-4067-889e-58ac500e95be');

  // Step 2: Slot opens up (march returns home) -> swaps squads for intercept
  settings.maxMarches = 3;
  const laterNow = now + 20000;
  const isoLater = new Date(laterNow).toISOString();
  cache.marchStatus.updatedAt = isoLater;
  cache['getUnitSummary:unit'].updatedAt = isoLater;
  cache.buildingStatus.updatedAt = isoLater;
  cache['getHealing:unit'].updatedAt = isoLater;
  const plan2 = helper.plan(cache, { intercept: plan1.intercept }, laterNow, settings);
  assert.equal(plan2?.action, 'intercept');
  assert.match(plan2?.reason, /Intercepting mine attack/i);
  assert.equal(plan2?.intercept?.phase, 'intercepting');
  assert.equal(plan2?.calls?.[0]?.name, 'stopMineGathering');
});

test('intercept swaps squads immediately when attack is > 2 minutes away and a slot is already available', () => {
  const { helper, cache, attack } = environment();
  const now = attack.impactAt - 140000; // 2 minutes 20 seconds before impact
  const isoNow = new Date(now).toISOString();
  cache.marchStatus.updatedAt = isoNow;
  cache['getUnitSummary:unit'].updatedAt = isoNow;
  cache.buildingStatus.updatedAt = isoNow;
  cache['getHealing:unit'].updatedAt = isoNow;
  cache.customTeams = [{ id: 'combat-1', heroIds: [1, 2, 3, 4, 5] }];
  const settings = {
    defenseRecallEnabled: true,
    defenseInfirmaryThreshold: 50,
    interceptTeamId: 'combat-1',
    maxMarches: 3, // 2 marches gathering < 3 max -> 1 available slot
  };

  const plan = helper.plan(cache, {}, now, settings);
  assert.equal(plan?.action, 'intercept');
  assert.match(plan?.reason, /Intercepting mine attack/i);
  assert.equal(plan?.intercept?.phase, 'intercepting');
  assert.equal(plan?.calls?.[0]?.name, 'stopMineGathering');
});

test('intercept recalls immediately when remaining time is less than travel time needed', () => {
  const { helper, cache, attack } = environment();
  const now = attack.impactAt - 2000; // Only 2s left before impact (< 3000ms minimum threshold)
  cache.customTeams = [{ id: 'combat-1', heroIds: [1, 2, 3, 4, 5] }];
  const settings = {
    defenseRecallEnabled: true,
    defenseInfirmaryThreshold: 50,
    interceptTeamId: 'combat-1',
    maxMarches: 3,
  };

  const plan = helper.plan(cache, {}, now, settings);
  assert.equal(plan?.action, 'recall');
  assert.match(plan?.reason, /Insufficient time/i);
  assert.equal(plan?.call?.name, 'stopMineGathering');
});

test('evaluatePriorityAutoJoin is suppressed when incoming mine attack is active on gathering mine (>2 minutes away)', async () => {
  const { cache, local, attack } = environment();
  const now = attack.impactAt - 130000; // 2m 10s away
  local.priorityAutoJoin = { enabled: true, minLevel: 10, teamId: 'highest' };
  local.popupRpcEnabled = true;

  const bg = setupBackgroundRuntime({
    chrome: {
      storage: {
        local: {
          get: async (k) => local,
          set: async (v) => Object.assign(local, v)
        }
      },
      tabs: { sendMessage: async () => {} }
    }
  });

  const rallyRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ ident: 'c1', name: 'getRallyById', feature: 'rally' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'c1',
        result: {
          response: {
            rally: {
              rallyId: 'rally-999',
              mapId: 'map-1',
              target: { objectConfigId: 75 },
              membersCapacityLeft: 3,
              plannedStartTime: now + 50000
            }
          }
        }
      }]
    })
  };

  const origNow = Date.now;
  Date.now = () => now;
  try {
    await bg.evaluatePriorityAutoJoin(rallyRecord, cache, local, 1);
  } finally {
    Date.now = origNow;
  }

  // priorityAutoJoinedRallies should NOT include rally-999 because auto join was suppressed by incoming mine attack
  const autoJoins = cache.priorityAutoJoinedRallies?.data || [];
  assert.equal(autoJoins.includes('rally-999'), false, 'Priority auto join must not join rally while mine is under attack');
});
