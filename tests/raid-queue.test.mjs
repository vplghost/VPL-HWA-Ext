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

test('roster refresh rejects stale capacity and deployed heroes before spending energy', () => {
  for (const [roster, troops] of [[{ ...heroes, 1: { ...heroes[1], power: 999 } }, inventory],
      [heroes, { ...inventory, squads: [{ heroes: [{ id: 1 }] }] }]]) {
    const start = queue.start(options, 1, 10, 1000);
    const step = queue.advance(start.state, rpc(start.calls, [roster, troops], 1100), {}, 1200);
    assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined);
  }
});

test('queue stops at requested count and cannot reuse a won boss', () => {
  let state = active(); state.options = { ...state.options, count: 1 };
  state = queue.advance(state, win(), {}, 70001).state;
  const complete = queue.advance(state, returned(), {}, 80001);
  assert.equal(complete.state.phase, 'complete'); assert.equal(complete.calls, undefined);
  let step = queue.start(options, 1, 10, 1000);
  step = queue.advance(step.state, rpc(step.calls, [heroes, inventory], 1100), {}, 1200);
  step = queue.advance(step.state, rpc(step.calls, [{ mobs: [{ mobId: 'boss' }] }], 1300),
    { experimentalDefeatedBosses: { data: [{ mobId: 'boss', mapId: 'map' }] } }, 1400);
  assert.equal(step.state.phase, 'stopped'); assert.equal(step.calls, undefined);
});
