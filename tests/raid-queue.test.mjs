import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = {};
for (const file of ['experimental-data', 'raid-queue']) vm.runInNewContext(
  await readFile(new URL(`../extension/${file}.js`, import.meta.url), 'utf8'), context);
const queue = context.hwaHelperRaidQueue, data = context.hwaHelperExperimentalData;
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
