import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentalDataHelper as data } from '../src/utils/experimentalData.ts';
import { raidQueueService as queue } from '../src/services/queues/raidQueue.ts';
import { recallForQueue, returnMs } from '../src/services/queues/smartGather.ts';
const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { level: 30, star: 2, power: id * 100 }]));
const capacities = Object.fromEntries(Object.entries(heroes).map(([id, hero]) => [id, { signature: data.capacitySignature(hero), count: 600 }]));
const options = { mapId: 'map', center: { x: 10, y: 20 }, level: 5, heroIds: [1, 2, 3, 4, 5],
  capacities, baseTroops: 200, waitSeconds: 60, minMembers: 4, count: 2 };
const inventory = { squads: [], available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) };
function rpc(calls, responses, at) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(at).toISOString(),
    requestBody: JSON.stringify({ calls: calls.map((call, ident) => ({ ...call, ident })) }),
    responseBody: JSON.stringify({ results: responses.map((response, ident) => ({ ident, result: { response } })) }) };
}
const socket = (type, body, at) => ({ transport: 'websocket', direction: 'received', encoding: 'utf8',
  timestamp: new Date(at).toISOString(), payload: JSON.stringify({ result: { type, body } }) });
function active() {
  let step = queue.start(options, 1, 10, 1000);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 1100), {}, 1200);
  assert.equal(step.state.phase, 'searching');
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss' }] }], 1300), {}, 1400);
  assert.equal(step.state.phase, 'creating');
  step = queue.advance(step.state, rpc(step.calls, [{ squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: 65000 } }], 1500), {}, 1600);
  assert.equal(step.state.phase, 'active');
  return step.state;
}
const win = (at = 70000) => socket('mobRallyAttackResult', { rallyId: 'rally', squadId: 'squad', battleResult: { battleResult: 'win' } }, at);
const returned = (at = 80000) => socket('returnFromMobCompleted', { squadId: 'squad' }, at);
function members(state, count, at = 43000) {
  const rally = { rallyId: 'rally', plannedStartTime: 65000, leader: { userId: 10 },
    members: Array.from({ length: count - 1 }, (_, i) => ({ userId: 20 + i })), membersCapacityLeft: 6 - count };
  return queue.advance(state, rpc([{ name: 'getRallyById', feature: 'rally', args: { rallyId: 'rally' } }], [{ rally }], at), {}, at + 1).state;
}

test('an authoritative early rally route prevents cancellation at the old planned departure', () => {
  let state = active();
  const rally = { rallyId: 'rally', rallyVersion: 13, plannedStartTime: 65000,
    leader: { userId: 10 }, members: [], route: { startedAt: 20000, durationMs: 30345,
      to: { object: { objectId: 'boss' } } } };
  const call = { name: 'getRallyById', feature: 'rally', args: { rallyId: 'rally' } };
  state = queue.advance(state, rpc([call], [{ rally }], 21000), {}, 21001).state;
  assert.equal(state.current.waitUntil, 20000); assert.equal(state.current.arrivalAt, 50345);
  assert.equal(state.current.memberChecked, true); assert.equal(state.current.departed, true);
  state = queue.advance(state, rpc([call], [{ rally: { ...rally, rallyVersion: 10, route: undefined } }], 22000), {}, 22001).state;
  assert.equal(state.current.waitUntil, 20000);
  const check = queue.advance(state, null, {}, 55000);
  assert.ok(!check.calls.some(call => call.name === 'cancelRally'));
});

test('weakest queue recalculates available heroes after roster refresh', () => {
  const roster = { ...heroes, 6: { power: 600 }, 7: { power: 700 } };
  const units = { ...inventory, squads: [{ heroes: [{ id: 1 }, { heroId: 2 }] }] };
  let step = queue.start({ ...options, teamId: 'weakest' }, 1, 10, 1000);
  step = queue.advance(step.state, rpc(step.calls, [roster, units], 1100), {}, 1200);
  assert.equal(step.state.phase, 'searching');
  assert.deepEqual(Array.from(step.state.options.heroIds), [3, 4, 5, 6, 7]);
  step = queue.start({ ...options, teamId: 'weakest' }, 1, 10, 1000);
  step = queue.advance(step.state, rpc(step.calls, [heroes, units], 1100), {}, 1200);
  assert.equal(step.state.phase, 'stopped');
  assert.match(step.state.reason, /five available/);
});

test('persisted calls match responses after storage reorders object keys', () => {
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) :
    value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, reorder(value[key])])) : value;
  let step = queue.start(options, 1, 10, 1000);
  step = queue.advance(reorder(step.state), rpc(step.calls, [heroes, inventory], 1100), {}, 1200);
  step = queue.advance(reorder(step.state), rpc(step.calls, [{ mobs: [{ mobId: 'boss' }] }], 1300), {}, 1400);
  assert.equal(step.state.phase, 'creating');
  const sent = step.calls;
  const unrelated = sent.map((call) => ({ ...call, args: { ...call.args, mobId: 'other-boss' } }));
  const ignored = queue.advance(reorder(step.state), rpc(unrelated, [{ squadId: 'other', rally: { rallyId: 'other-rally', plannedStartTime: 301500 } }], 1450), {}, 1451);
  assert.equal(ignored.state.phase, 'creating', 'different boss confirmation must not be accepted');
  step = queue.advance(reorder(step.state), rpc(sent, [{ squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: 301500 } }], 1500), {}, 1600);
  assert.equal(step.state.phase, 'active');
  step = queue.advance(reorder(step.state), null, {}, 121401);
  assert.equal(step.state.phase, 'active', 'waiting rally must survive the creation timeout');
  assert.equal(step.state.bossQueue.remain_raid_count, 2);
  assert.equal(step.state.started, 1);
});

test('confirmed win count updates before return and remains stable across duplicate events', () => {
  let state = active();
  assert.equal(queue.confirmedWins(state), 0);
  state = queue.advance(state, win(), {}, 70001).state;
  assert.equal(queue.confirmedWins(state), 1);
  assert.equal(state.completed, 0, 'next raid still waits for return');
  state = queue.advance(state, win(71000), {}, 71001).state;
  assert.equal(queue.confirmedWins(state), 1);
  state = queue.advance(state, returned(), {}, 80001).state;
  assert.equal(queue.confirmedWins(state), 1);
  assert.equal(state.completed, 1);
  state = queue.advance(state, returned(81000), {}, 81001).state;
  assert.equal(queue.confirmedWins(state), 1);
  assert.equal(queue.confirmedWins(null), 0);
  assert.equal(queue.confirmedWins({ completed: 2, current: { result: 'win' } }), 3);
  assert.equal(queue.confirmedWins({ completed: 2, current: { result: 'lose' } }), 2);
});

test('queue waits for both matching win and confirmed return, never elapsed ETA', () => {
  let state = active();
  state = queue.advance(state, win(), {}, 70001).state;
  let step = queue.advance(state, null, {}, 999999);
  assert.equal(step.state.started, 1);
  assert.equal(step.state.phase, 'active', 'elapsed return ETA cannot launch another raid');
  state = members(active(), 4);
  state = queue.advance(state, null, {}, 55000).state;
  state = queue.advance(state, win(), {}, 70001).state;
  step = queue.advance(state, null, {}, 150000);
  assert.equal(step.state.phase, 'active'); assert.equal(step.state.completed, 0);
  step = queue.advance(step.state, returned(160000), {}, 160001);
  assert.equal(step.state.completed, 1); assert.equal(step.state.phase, 'refreshing');
  assert.deepEqual(Array.from(step.calls, (call) => call.name), ['heroGetAll', 'getUnitSummary']);
});

test('return before result, duplicates and unrelated rallies cannot launch an extra raid', () => {
  let state = active();
  const wrong = socket('mobRallyAttackResult', { rallyId: 'other', squadId: 'squad', battleResult: { battleResult: 'win' } }, 70000);
  state = queue.advance(state, wrong, {}, 70001).state;
  assert.equal(state.current.result, undefined);
  state = queue.advance(state, returned(70002), {}, 70003).state;
  assert.equal(state.completed, 0);
  let step = queue.advance(state, win(70004), {}, 70005);
  assert.equal(step.state.completed, 1);
  step = queue.advance(step.state, win(70004), {}, 70006);
  assert.equal(step.state.completed, 1); assert.equal(step.calls, undefined);
});

test('fresh march absence confirms return only after win; stale and malformed snapshots do not', () => {
  let state = queue.advance(active(), win(), {}, 70001).state;
  const calls = [{ name: 'getMarches', feature: 'march' }];
  for (const [body, at] of [[{ marches: {} }, 69999], [{ marches: [] }, 70002], [{ marches: { bad: null } }, 70003],
      [{ marches: { returnToOutpost: [{ squadId: 'squad' }] } }, 70004]]) {
    state = queue.advance(state, rpc(calls, [body], at), {}, at + 1).state;
    assert.equal(state.completed, 0);
  }
  const step = queue.advance(state, rpc(calls, [{ marches: {} }], 70005), {}, 70006);
  assert.equal(step.state.completed, 1);
});

test('loss stops queue immediately without a retry', () => {
  const step = queue.advance(active(), socket('mobRallyAttackResult', {
    rallyId: 'rally', squadId: 'squad', battleResult: { battleResult: 'lose' }
  }, 70000), {}, 70001);
  assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined);
  assert.equal(queue.advance(step.state, returned(), {}, 80001).state.completed, 0);
});

test('ten-second member check cancels once, counts leader and imposes a predeparture deadline', () => {
  let state = members(active(), 3);
  const early = queue.advance(state, null, {}, 11000);
  assert.equal(early.state.phase, 'active', 'ten seconds after creation is too early to cancel');
  assert.equal(early.calls, undefined);
  let step = queue.advance(state, null, {}, 45000);
  assert.equal(step.calls[1].name, 'getRallyById');
  step = queue.advance(step.state, null, {}, 55000);
  assert.equal(step.state.phase, 'cancelling'); assert.equal(step.calls[0].name, 'cancelRally');
  assert.equal(step.expiresAt, 64000);
  assert.equal(queue.advance(step.state, null, {}, 55001).calls, undefined);
  const expired = queue.advance(step.state, null, {}, 64000);
  assert.equal(expired.state.phase, 'stopped'); assert.equal(expired.calls, undefined);
  const enough = queue.advance(members(active(), 4), null, {}, 55000);
  assert.equal(enough.state.phase, 'active');
  assert.ok(!enough.calls.some((call) => call.name === 'cancelRally'));
});

test('disabled auto-cancel never dispatches a cancellation during the final ten seconds', () => {
  const state = members(active(), 2);
  state.options.autoCancel = false;
  const step = queue.advance(state, null, {}, 55000);
  assert.equal(step.state.phase, 'active');
  assert.ok(!step.calls?.some((call) => call.name === 'cancelRally'));
});

test('first rally uses selected boss and current troops without repeating search', () => {
  const snapshot = { heroGetAll: { data: heroes }, 'getUnitSummary:unit': { data: inventory },
    experimentalRallySearch: { updatedAt: new Date(1000).toISOString(), data: { mapId: 'map', mobConfigIds: [64], mobs: [{ mobId: 'boss' }] } } };
  const step = queue.start({ ...options, firstMobId: 'boss', autoCancel: false }, 1, 10, 1000, snapshot);
  assert.equal(step.state.phase, 'creating');
  assert.deepEqual(Array.from(step.calls, (call) => call.name), ['createRally']);
  assert.equal(step.calls[0].args.mobId, 'boss');
  const created = queue.advance(step.state, rpc(step.calls, [
    { squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: 65000 } }
  ], 1100), snapshot, 1200);
  assert.equal(created.state.phase, 'active');
  assert.equal(created.state.current.memberChecked, true);
  assert.equal(created.state.wakeAt, 80000);
  assert.equal(queue.start({ ...options, firstMobId: 'wrong' }, 1, 10, 1000, snapshot).state.phase, 'refreshing');
});

test('unknown or stale membership cancels conservatively; late wake never dispatches cancellation', () => {
  for (const state of [active(), members(active(), 6, 10000)]) {
    assert.equal(queue.advance(state, null, {}, 55000).state.phase, 'cancelling');
  }
  const step = queue.advance(active(), null, {}, 65000);
  assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined);
});

test('queue validates waits, count and threshold and stops on account switch or timeout', () => {
  for (const override of [{ waitSeconds: 10 }, { count: 0 }, { count: 101 }, { minMembers: 7 }, { minMembers: 0 }]) {
    assert.equal(queue.start({ ...options, ...override }, 1, 10, 1000), null);
  }
  assert.equal(queue.advance(active(), null, { accountStatus: { data: { id: 11 } } }, 2000).state.phase, 'stopped');
  const step = queue.start(options, 1, 10, 1000);
  assert.equal(queue.advance(step.state, null, {}, 121000).state.phase, 'stopped');
});

test('roster refresh falls back after hero changes and rejects deployed heroes before spending energy', () => {
  for (const [roster, troops] of [[{ ...heroes, 1: { ...heroes[1], power: 999 } }, inventory],
      [heroes, { ...inventory, squads: [{ heroes: [{ id: 1 }] }] }]]) {
    const start = queue.start(options, 1, 10, 1000);
    const step = queue.advance(start.state, rpc(start.calls, [roster, troops], 1100), {}, 1200);
    if (troops.squads.length) { assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined); }
    else { assert.equal(step.state.phase, 'searching'); assert.equal(step.state.squad.units.reduce((sum, unit) => sum + unit.count, 0), 3950); }
  }
});

test('queue stops at requested count and cannot reuse a won boss', () => {
  let state = active(); state.bossQueue.remain_raid_count = 1;
  state = queue.advance(state, win(), {}, 70001).state;
  const complete = queue.advance(state, returned(), {}, 80001);
  assert.equal(complete.state.phase, 'complete'); assert.equal(complete.calls, undefined);
  let step = queue.start(options, 1, 10, 1000);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 1100), {}, 1200);
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss' }] }], 1300),
    { experimentalDefeatedBosses: { data: [{ mobId: 'boss', mapId: 'map' }] } }, 1400);
  assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined);
});

function cachedQueue(bosses = ['boss-a', 'boss-b'], count = 3, energy = 100) {
  const cache = { heroGetAll: { data: heroes }, 'getUnitSummary:unit': { data: inventory },
    experimentalRallySearch: { updatedAt: new Date(1000).toISOString(), data: { mapId: 'map', mobConfigIds: [64],
      mobs: bosses.map((mobId) => ({ mobId })) } },
    'resource:world-energy': { data: { amount: energy } } };
  return { cache, step: queue.start({ ...options, count, firstMobId: bosses[1] || bosses[0],
    autoCancel: false }, 1, 10, 1000, cache) };
}

test('custom troop maximum applies to first rally and every refreshed round', () => {
  const { cache } = cachedQueue();
  for (const maxTroops of [700, 6000]) {
    let step = queue.start({ ...options, teamId: 'custom:one', maxTroops, firstMobId: 'boss-a',
      autoCancel: false }, 1, 10, 1000, cache);
    const total = (call) => call.args.squad.units.reduce((sum, unit) => sum + unit.count, 0);
    assert.equal(total(step.calls[0]), maxTroops);
    step = queue.advance(step.state, rpc(step.calls, [{ squadId: 'squad', rally: {
      rallyId: 'rally', plannedStartTime: 65000 } }], 1100), cache, 1200);
    step = queue.advance(step.state, win(), cache, 70001);
    step = queue.advance(step.state, returned(), cache, 80001);
    step = queue.advance(JSON.parse(JSON.stringify(step.state)), rpc(step.calls, [heroes, inventory], 81000), cache, 81001);
    assert.equal(step.state.phase, 'creating');
    assert.equal(total(step.calls[0]), maxTroops);
  }
  for (const maxTroops of [0, -1, 0.5, '700']) {
    assert.equal(queue.start({ ...options, maxTroops }, 1, 10, 1000), null);
  }
});

test('one search supplies several rallies; next search waits until every queued boss is consumed', () => {
  const { cache, step: first } = cachedQueue();
  assert.equal(first.state.bossQueue.remain_raid_count, 3);
  assert.deepEqual(Array.from(first.state.bossQueue.queue, (boss) => boss.mobId), ['boss-b', 'boss-a']);
  assert.equal(first.calls[0].args.mobId, 'boss-b');
  let step = queue.advance(first.state, rpc(first.calls, [{ squadId: 'squad-b',
    rally: { rallyId: 'rally-b', plannedStartTime: 65000 } }], 1100), cache, 1200);
  step = queue.advance(step.state, socket('mobRallyAttackResult', { rallyId: 'rally-b',
    squadId: 'squad-b', battleResult: { battleResult: 'win' } }, 70000), cache, 70001);
  step = queue.advance(step.state, socket('returnFromMobCompleted', { squadId: 'squad-b' }, 80000), cache, 80001);
  assert.equal(step.state.bossQueue.remain_raid_count, 2);
  assert.deepEqual(Array.from(step.state.bossQueue.queue, (boss) => boss.mobId), ['boss-a']);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 81000), cache, 81001);
  assert.equal(step.state.phase, 'creating');
  assert.equal(step.calls[0].name, 'createRally');
  assert.equal(step.calls[0].args.mobId, 'boss-a');
  step = queue.advance(step.state, rpc(step.calls, [{ squadId: 'squad-a',
    rally: { rallyId: 'rally-a', plannedStartTime: 145000 } }], 82000), cache, 82001);
  step = queue.advance(step.state, socket('mobRallyAttackResult', { rallyId: 'rally-a',
    squadId: 'squad-a', battleResult: { battleResult: 'win' } }, 150000), cache, 150001);
  step = queue.advance(step.state, socket('returnFromMobCompleted', { squadId: 'squad-a' }, 160000), cache, 160001);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 161000), cache, 161001);
  assert.equal(step.state.phase, 'searching');
  assert.equal(step.calls[0].name, 'searchMob');
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss-a' },
    { mobId: 'boss-c' }] }], 162000), cache, 162001);
  assert.equal(step.calls[0].args.mobId, 'boss-c', 'won bosses stay excluded even if cache lags');
});

test('missing or stale cached target refreshes roster, searches and continues without a second click', () => {
  for (const override of [{}, { updatedAt: new Date(-400000).toISOString() }, { updatedAt: 'invalid' }]) {
    const { cache } = cachedQueue();
    cache.experimentalRallySearch = override;
    let step = queue.start({ ...options, firstMobId: 'old' }, 1, 10, 1000, cache);
    assert.equal(step.state.phase, 'refreshing');
    step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 1100), cache, 1101);
    assert.equal(step.state.phase, 'searching');
    step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'new' }] }], 1200), cache, 1201);
    assert.equal(step.calls[0].name, 'createRally');
    assert.equal(step.calls[0].args.mobId, 'new');
  }
});

test('target-not-found discards stale candidates, searches and excludes failed boss without consuming count', () => {
  const { cache, step: initial } = cachedQueue(['boss-a', 'boss-b']);
  const call = initial.calls[0];
  const failed = rpc([call], [{ error: { code: 'mobNotFound' } }], 1100);
  // rpc() wraps supplied values in response, exercising response.error as well.
  let step = queue.advance(initial.state, failed, cache, 1101);
  assert.equal(step.state.phase, 'searching');
  assert.equal(step.state.bossQueue.remain_raid_count, 3);
  assert.equal(step.state.failedBossIds[0], 'boss-b');
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss-b' }, { mobId: 'fresh' }] }], 1200), cache, 1201);
  assert.equal(step.calls[0].args.mobId, 'fresh');
  assert.equal(step.state.bossQueue.remain_raid_count, 3);
});

test('create errors skip only their boss and preserve remaining win count', () => {
  const { cache, step: first } = cachedQueue(['boss-a', 'boss-b', 'boss-c']);
  const failed = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(1100).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...first.calls[0], ident: 'create' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'create', result: { error: { message: 'Temporary server failure' } } }] }) };
  let step = queue.advance(first.state, failed, cache, 1200);
  assert.equal(step.state.phase, 'creating');
  assert.equal(step.calls[0].args.mobId, 'boss-a');
  assert.equal(step.state.bossQueue.remain_raid_count, 3);
  assert.deepEqual(Array.from(step.state.bossQueue.queue, (boss) => boss.mobId), ['boss-a', 'boss-c']);
  step = queue.advance(step.state, { ...failed, timestamp: new Date(1300).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...step.calls[0], ident: 'create' }] }) }, cache, 1400);
  assert.equal(step.calls[0].args.mobId, 'boss-c');
  step = queue.advance(step.state, { ...failed, timestamp: new Date(1500).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...step.calls[0], ident: 'create' }] }) }, cache, 1600);
  assert.equal(step.state.phase, 'searching');
  assert.equal(step.calls[0].name, 'searchMob');
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss-b' },
    { mobId: 'boss-d' }] }], 1700), cache, 1800);
  assert.equal(step.calls[0].args.mobId, 'boss-d');
});

test('insufficient World Energy and a loss stop dispatch; cancelling clears queue but preserves active rally', () => {
  assert.equal(cachedQueue(['boss-a'], 2, 24).step.state.phase, 'stopped');
  const { cache, step: first } = cachedQueue();
  const activeStep = queue.advance(first.state, rpc(first.calls, [{ squadId: 'squad-b',
    rally: { rallyId: 'rally-b', plannedStartTime: 65000 } }], 1100), cache, 1200);
  const cancelled = queue.stop(activeStep.state, 'Stopped by user.');
  assert.equal(cancelled.bossQueue, null);
  assert.equal(cancelled.current.rallyId, 'rally-b');
  assert.equal(queue.advance(cancelled, socket('mobRallyAttackResult', { rallyId: 'rally-b',
    squadId: 'squad-b', battleResult: { battleResult: 'win' } }, 70000), cache, 70001).calls, undefined);
  const lost = queue.advance(activeStep.state, socket('mobRallyAttackResult', { rallyId: 'rally-b',
    squadId: 'squad-b', battleResult: { battleResult: 'lose' } }, 70000), cache, 70001);
  assert.equal(lost.state.phase, 'stopped');
  assert.equal(lost.state.bossQueue, null);
  const winStep = queue.advance(activeStep.state, socket('mobRallyAttackResult', { rallyId: 'rally-b',
    squadId: 'squad-b', battleResult: { battleResult: 'win' } }, 70000), cache, 70001);
  const returnedStep = queue.advance(winStep.state, socket('returnFromMobCompleted', {
    squadId: 'squad-b' }, 80000), cache, 80001);
  const lowEnergy = { ...cache, 'resource:world-energy': { data: { amount: 24 } } };
  const next = queue.advance(returnedStep.state, rpc(returnedStep.calls,
    [heroes, inventory], 81000), lowEnergy, 81001);
  assert.equal(next.state.phase, 'stopped');
  assert.match(next.state.reason, /World Energy/);
  assert.equal(next.calls, undefined);
});

test('server energy rejection stops queue while a confirmed auto-cancel skips its boss', () => {
  const { cache, step: first } = cachedQueue();
  const failure = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(1100).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...first.calls[0], ident: 'create' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'create', result: {
      error: { code: 'NOT_ENOUGH_WORLD_ENERGY' } } }] }) };
  assert.equal(queue.advance(first.state, failure, cache, 1200).state.phase, 'stopped');
  let step = queue.advance(first.state, rpc(first.calls, [{ squadId: 'squad-b',
    rally: { rallyId: 'rally-b', plannedStartTime: 65000 } }], 1100), cache, 1200);
  const cancelCall = [{ name: 'cancelRally', feature: 'rally', args: { rallyId: 'rally-b' } }];
  step.state.phase = 'cancelling'; step.state.expected = cancelCall;
  step = queue.advance(step.state, rpc(cancelCall, [{}], 1300), cache, 1400);
  assert.equal(step.state.phase, 'refreshing');
  assert.equal(step.state.bossQueue.remain_raid_count, 3);
  assert.deepEqual(Array.from(step.state.bossQueue.queue, (boss) => boss.mobId), ['boss-a']);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 1500), cache, 1600);
  assert.equal(step.calls[0].args.mobId, 'boss-a');
});

test('active queues saved before the boss-list upgrade can finish their current rally', () => {
  const legacy = active();
  delete legacy.bossQueue;
  let step = queue.advance(legacy, win(), {}, 70001);
  assert.equal(step.state.bossQueue.remain_raid_count, 2);
  step = queue.advance(step.state, returned(), {}, 80001);
  assert.equal(step.state.phase, 'refreshing');
  assert.equal(step.state.bossQueue.remain_raid_count, 1);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 81000), {}, 81001);
  assert.equal(step.state.phase, 'searching');
});

test('rally creation prioritizes highest-level troops across multiple types dynamically', () => {
  const customInventory = {
    squads: [],
    available: [
      { unitId: 8, count: 500 },  // Type 0, Tier 8
      { unitId: 18, count: 500 }, // Type 1, Tier 8
      { unitId: 27, count: 1000 },// Type 2, Tier 7
      { unitId: 6, count: 2000 }, // Type 0, Tier 6
    ]
  };
  const cache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: customInventory },
    experimentalRallySearch: {
      updatedAt: new Date(1000).toISOString(),
      data: { mapId: 'map', mobConfigIds: [64], mobs: [{ mobId: 'boss-a' }] }
    },
    'resource:world-energy': { data: { amount: 100 } }
  };
  const step = queue.start({ ...options, maxTroops: 800, firstMobId: 'boss-a', autoCancel: false }, 1, 10, 1000, cache);
  assert.equal(step.state.phase, 'creating');
  const units = step.calls[0].args.squad.units;
  const total = units.reduce((s, u) => s + u.count, 0);
  assert.equal(total, 800);
  // All 800 troops must come from Tier 8 units (unitId 8 and 18)
  const tier8Count = units.filter(u => u.unitId === 8 || u.unitId === 18).reduce((s, u) => s + u.count, 0);
  assert.equal(tier8Count, 800);
  // Tier 7 and Tier 6 should not be used when Tier 8 capacity is sufficient
  assert.ok(!units.some(u => u.unitId === 27 || u.unitId === 6));
});

test('queue waits when raid squad is returning before dispatching next rally', () => {
  const returningCache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: inventory },
    'mapObjectGetAll:march': {
      march1: { data: { stage: 'returnToOutpost', heroes: [{ id: 1 }, { id: 2 }] } }
    },
    experimentalRallySearch: {
      updatedAt: new Date(1000).toISOString(),
      data: { mapId: 'map', mobConfigIds: [64], mobs: [{ mobId: 'boss-a' }] }
    },
    'resource:world-energy': { data: { amount: 100 } }
  };
  // Start while squad is returning should enter waiting_rally instead of creating
  const step = queue.start({ ...options, firstMobId: 'boss-a', autoCancel: false }, 1, 10, 1000, returningCache);
  assert.equal(step.state.phase, 'waiting_rally');
  assert.deepEqual(step.calls, [
    { name: 'getMarches', feature: 'march' },
    { name: 'getUnitSummary', feature: 'unit' }
  ]);

  // Once march is gone, advance moves to refreshing/creating
  const clearedCache = { ...returningCache, 'mapObjectGetAll:march': {} };
  const nextStep = queue.advance(step.state, null, clearedCache, 2000);
  assert.equal(nextStep.state.phase, 'refreshing');
});

test('mid-queue clan rally interruption enters waiting_rally and auto-resumes when cleared', () => {
  const started = queue.start({ ...options, firstMobId: 'boss-a', autoCancel: false, count: 3 }, 1, 10, 1000, {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: inventory },
    experimentalRallySearch: {
      updatedAt: new Date(1000).toISOString(),
      data: { mapId: 'map', mobConfigIds: [64], mobs: [{ mobId: 'boss-a' }, { mobId: 'boss-b' }] }
    },
    'resource:world-energy': { data: { amount: 150 } }
  });
  assert.equal(started.state.phase, 'creating');

  // Simulate round 1 already completed and now in refreshing while clanmate rally auto-joined our heroes
  const refreshingState = {
    ...started.state,
    started: 1,
    completed: 1,
    phase: 'refreshing',
    sentAt: 5000,
    wakeAt: 125000,
    bossQueue: { remain_raid_count: 2, queue: [{ mobId: 'boss-b' }] },
    roster: {}
  };
  const clanBusyCache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: { ...inventory, squads: [{ heroes: [{ id: 1 }, { id: 2 }] }] } },
    marchStatus: {
      data: {
        marches: [{ squadId: 'clan-autojoin', rally: { rallyId: 'clan-r1', returnAt: 999999 }, stage: 'waitingForRallyStart', endsAt: 999999 }]
      }
    },
    'resource:world-energy': { data: { amount: 125 } }
  };
  const rosterReply = {
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    method: 'POST',
    status: 200,
    timestamp: new Date(6000).toISOString(),
    requestBody: JSON.stringify({ calls: [{ name: 'heroGetAll', ident: 'h1' }, { name: 'getUnitSummary', feature: 'unit', ident: 'u1' }] }),
    responseBody: JSON.stringify({
      results: [
        { ident: 'h1', result: { response: heroes } },
        { ident: 'u1', result: { response: { ...inventory, squads: [{ heroes: [{ id: 1 }, { id: 2 }] }] } } }
      ]
    })
  };
  const waited = queue.advance(refreshingState, rosterReply, clanBusyCache, 6000);
  assert.equal(waited.state.phase, 'waiting_rally', 'Must enter waiting_rally instead of stopping queue when clan rally deploys heroes');

  // Unrelated packet before wakeAt should not spam polling RPCs
  const idleWait = queue.advance(waited.state, { timestamp: new Date(7000).toISOString() }, clanBusyCache, 7000);
  assert.equal(idleWait.state.phase, 'waiting_rally');
  assert.equal(idleWait.calls, undefined);

  // Once clan rally finishes and heroes are free, queue automatically resumes to refreshing
  const freeCache = {
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: inventory },
    marchStatus: { data: { marches: [] } },
    'resource:world-energy': { data: { amount: 125 } }
  };
  const resumed = queue.advance(waited.state, null, freeCache, 12000);
  assert.equal(resumed.state.phase, 'refreshing', 'Must automatically resume to refreshing once clan rally clears');
});

test('active rally recognizes returnToOutpostFromMob and enters waiting_rally if another clan rally is active', () => {
  const activeState = {
    id: '1000:1',
    tabId: 1,
    accountId: 10,
    options: { ...options, autoCancel: false, count: 2 },
    started: 1,
    completed: 0,
    createdRallyIds: ['r1'],
    completedRallyIds: [],
    bossQueue: { remain_raid_count: 2, queue: [{ mobId: 'boss-a' }, { mobId: 'boss-b' }] },
    failedBossIds: [],
    wonBossIds: [],
    phase: 'active',
    sentAt: 1000,
    wakeAt: 20000,
    current: { mobId: 'boss-a', mapId: 'map', rallyId: 'r1', squadId: 'sq1', result: 'win', resultAt: 5000, memberChecked: true }
  };
  const returnMqtt = {
    transport: 'websocket',
    direction: 'received',
    encoding: 'utf8',
    payloadTruncated: false,
    timestamp: new Date(8000).toISOString(),
    payload: JSON.stringify({ result: { type: 'returnToOutpostFromMob', body: { squadId: 'sq1' } } })
  };
  const next = queue.advance(activeState, returnMqtt, {
    marchStatus: { data: { marches: [] } },
    'resource:world-energy': { data: { amount: 100 } }
  }, 8000);
  assert.equal(next.state.completed, 1);
  assert.equal(next.state.phase, 'refreshing');
});

test('createRally response with result.response.errorCode MobNotFound recovers immediately by searching new bosses instead of hanging', async () => {
  const { extractRpcResultError } = await import('../src/services/queues/raidQueue.ts');
  const { monsterQueueService } = await import('../src/services/queues/monsterQueue.ts');

  // Verify errorCode extraction ignores success codes (0, '', null) and captures MobNotFound
  assert.equal(extractRpcResultError({ response: { errorCode: 0 } }), null);
  assert.equal(extractRpcResultError({ response: { errorCode: '' } }), null);
  assert.equal(extractRpcResultError({ response: { errorCode: 'MobNotFound' } }), 'MobNotFound');

  const expectedCall = {
    name: 'createRally',
    feature: 'mob',
    args: {
      mapId: '5929afff-c3a6-495d-8f2c-37e7c509a4dc',
      mobId: '6a19d071-6357-4057-af63-ceedc7f7ffdc',
      squad: { heroes: [{ heroId: 60 }], units: [{ unitId: 8, count: 1602 }] },
      startDelay: 60000,
    },
  };

  const creatingState = {
    id: '2000:1',
    tabId: 1,
    accountId: 10,
    options: { ...options, mapId: '5929afff-c3a6-495d-8f2c-37e7c509a4dc', count: 2 },
    started: 0,
    completed: 0,
    retriedCount: 0,
    consecutiveCreateErrors: 0,
    sessionEvents: [],
    bossQueue: { remain_raid_count: 2, queue: [{ mobId: '6a19d071-6357-4057-af63-ceedc7f7ffdc' }, { mobId: 'stale-2' }] },
    failedBossIds: [],
    wonBossIds: [],
    phase: 'creating',
    sentAt: 2000,
    wakeAt: 122000,
    expected: [expectedCall],
    current: { mobId: '6a19d071-6357-4057-af63-ceedc7f7ffdc', mapId: '5929afff-c3a6-495d-8f2c-37e7c509a4dc' },
  };

  // Exact payload captured in temp/tracking-data/raid-error.md
  const mobNotFoundRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(2500).toISOString(),
    requestBody: JSON.stringify({
      calls: [{ ...expectedCall, ident: '00aacf66ec160b280008983dc302356f' }],
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: '00aacf66ec160b280008983dc302356f',
          result: { response: { errorCode: 'MobNotFound' } },
        },
      ],
    }),
  };

  const recovered = queue.advance(creatingState, mobNotFoundRecord, {}, 2500);
  assert.equal(recovered.state.phase, 'searching', 'Must immediately transition to searching instead of hanging in creating');
  assert.equal(recovered.calls?.[0]?.name, 'searchMob');
  assert.ok(recovered.state.failedBossIds.includes('6a19d071-6357-4057-af63-ceedc7f7ffdc'));
  assert.equal(recovered.state.retriedCount, 1);
  assert.equal(recovered.state.consecutiveCreateErrors, 1);

  // Guard: 5 consecutive createRally MobNotFound errors stop the queue safely instead of looping forever
  const fifthError = queue.advance(
    { ...creatingState, consecutiveCreateErrors: 4 },
    mobNotFoundRecord,
    {},
    3000
  );
  assert.equal(fifthError.state.phase, 'stopped');
  assert.match(fifthError.state.reason || '', /5 times in a row \(MobNotFound\)/);

  // Monster queue parity: result.response.errorCode triggers auto-retry searchMob instead of hanging or hard-stopping
  const monsterExpected = { name: 'attackMob', feature: 'mob', args: { mapId: 'm1', mobId: 'mob-gone' } };
  const monsterRes = monsterQueueService.advance(
    {
      id: '3000:1',
      tabId: 1,
      accountId: 10,
      options: { mapId: 'm1', center: { x: 1, y: 1 }, level: 1, count: 1, heroIds: [1, 2, 3, 4, 5] },
      phase: 'attacking',
      sentAt: 3000,
      wakeAt: 123000,
      expected: [monsterExpected],
      current: { mobId: 'mob-gone', mapId: 'm1' },
      targets: [],
      attackedMobIds: [],
      started: 0,
      completed: 0,
    },
    {
      method: 'POST',
      status: 200,
      endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
      timestamp: new Date(3500).toISOString(),
      requestBody: JSON.stringify({ calls: [{ ...monsterExpected, ident: 'm-err-1' }] }),
      responseBody: JSON.stringify({
        results: [{ ident: 'm-err-1', result: { response: { errorCode: 'MobNotFound' } } }],
      }),
    },
    {},
    3500
  );
  assert.equal(monsterRes.state.phase, 'searching');
  assert.equal(monsterRes.calls?.[0]?.name, 'searchMob');
  assert.ok(monsterRes.state.attackedMobIds.includes('mob-gone'));
  assert.equal(monsterRes.state.retriedCount, 1);
});

test('recallForQueue returns null instead of false error when needed heroes are already returning from raid/combat', () => {
  const now = 1_795_701_070_000;
  const cache = {
    accountStatus: { data: { id: 1216438103 } },
    heroGetAll: {
      data: {
        51: { id: 51, power: 50000 },
        71: { id: 71, power: 48000 },
        60: { id: 60, power: 46000 },
        7: { id: 7, power: 45000 },
        37: { id: 37, power: 44000 },
        38: { id: 38, power: 30000 },
        41: { id: 41, power: 29000 },
        46: { id: 46, power: 28000 },
        10: { id: 10, power: 25000 },
        11: { id: 11, power: 24000 },
      },
    },
    'getUnitSummary:unit': {
      data: {
        squads: [
          { id: 'raid-ret', heroes: [{ id: 51 }, { id: 71 }, { id: 60 }, { id: 7 }, { id: 37 }] },
          { id: 'gather-1', heroes: [{ id: 38 }, { id: 41 }, { id: 46 }] },
          { id: 'gather-2', heroes: [{ id: 10 }, { id: 11 }] },
        ],
      },
    },
    marchStatus: {
      data: {
        marches: [
          {
            squadId: 'gather-1',
            mineId: 'mine-1',
            stage: 'interactionWithTarget',
            targetCoordinates: { x: 545, y: 352 },
          },
          {
            squadId: 'gather-2',
            mineId: 'mine-2',
            stage: 'interactionWithTarget',
            targetCoordinates: { x: 542, y: 386 },
          },
          {
            squadId: 'raid-ret',
            stage: 'returnToOutpost',
            route: { to: { coordinates: { x: 606, y: 376 } } },
          },
        ],
      },
    },
  };

  // AC1: Raid heroes [51, 71, 60, 7, 37] are on returnToOutpost -> must return null (wait naturally), NOT hard error
  const demandReturning = recallForQueue(
    cache,
    { maxMarches: 3 },
    { heroIds: [51, 71, 60, 7, 37], center: { x: 606, y: 376 } },
    now
  );
  assert.equal(demandReturning, null);

  // AC3: Weakest team (needed = []) with a march already returning -> must return null (do not interrupt gatherers)
  const demandWeakest = recallForQueue(
    cache,
    { maxMarches: 3 },
    { teamId: 'weakest', heroIds: [], center: { x: 606, y: 376 } },
    now
  );
  assert.equal(demandWeakest, null);

  // AC2: When all 3 slots are gathering and experimentalMapContext lacks outpost center,
  // returnMs & recallForQueue fall back to options.center and pick the nearest gatherer
  const allGatheringCache = {
    ...cache,
    marchStatus: {
      data: {
        marches: [
          { squadId: 'gather-1', mineId: 'mine-1', stage: 'interactionWithTarget', targetCoordinates: { x: 545, y: 352 } },
          { squadId: 'gather-2', mineId: 'mine-2', stage: 'interactionWithTarget', targetCoordinates: { x: 600, y: 370 } },
          { squadId: 'gather-3', mineId: 'mine-3', stage: 'interactionWithTarget', targetCoordinates: { x: 400, y: 200 } },
        ],
      },
    },
  };
  assert.ok(Number.isFinite(returnMs(allGatheringCache.marchStatus.data.marches[1], allGatheringCache, { x: 606, y: 376 })));
  const demandAllGather = recallForQueue(
    allGatheringCache,
    { maxMarches: 3 },
    { teamId: 'weakest', heroIds: [], center: { x: 606, y: 376 } },
    now
  );
  assert.equal(demandAllGather?.march?.squadId, 'gather-2', 'Must pick nearest gathering squad using options.center fallback');
});
