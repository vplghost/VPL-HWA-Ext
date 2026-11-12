import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { Date };
for (const name of ['tower-automation', 'tower-runner']) vm.runInNewContext(
  await readFile(new URL(`../extension/${name}.js`, import.meta.url), 'utf8'), context);
const planner = context.hwaHelperTowerAutomation;
const runner = context.hwaHelperTowerRunner;
const time = Date.parse('2026-11-06T11:15:20Z');
const team = [79, 72, 16, 54, 60];
const rooms = {
  1: { roomNumber: 1, type: 'hero_battle', state: 'initial' },
  2: { roomNumber: 2, type: 'buffs', state: 'initial', buffs: [36, 34, 43] },
  3: { roomNumber: 3, type: 'hero_battle', state: 'initial' },
  4: { roomNumber: 4, type: 'buffs', state: 'initial', buffs: [32, 46, 5] }
};
const snapshot = (floorNumber = 3, roomNumber = 0, currentRooms = rooms, history = []) => ({
  accountStatus: { data: { id: 10 } }, teamGetAll: { data: { magicTower: team } },
  towerStatus: { data: { state: 'inProgress', skipState: 'disabled' } },
  towerSession: { updatedAt: new Date(time).toISOString(), data: {
    floorNumber, roomNumber, rooms: currentRooms, history, completed: false } }
});
function rpc(call, response, at, error = null) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(at).toISOString(), requestBody: JSON.stringify({ calls: [{ ...call, ident: 'tower' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'tower', result: error ? { error } : { response } }] }) };
}

test('Tower selects the route with the highest-priority offered buff', () => {
  const choice = planner.plan(snapshot(), [32, 34]);
  assert.equal(choice.call.name, 'magicTower_enterRoom');
  assert.equal(choice.call.args.number, 3);
  assert.equal(planner.plan(snapshot(), [34, 32]).call.args.number, 1);

  // When no preferred buffs given, DEFAULT_BUFF_PRIORITY picks Room 3 (buff 5 is ranked higher than buff 34)
  const defaultChoice = planner.plan(snapshot(), []);
  assert.equal(defaultChoice.call.name, 'magicTower_enterRoom');
  assert.equal(defaultChoice.call.args.number, 3);
});

test('Tower opens one randomly selected free chest and never chooses paid options', () => {
  const chests = { 1: { roomNumber: 1, type: 'chests',
    openCosts: { 1: null, 2: { starmoney: '70' }, 3: null },
    openChests: { 1: null, 2: null, 3: null } } };
  assert.equal(planner.plan(snapshot(4, 1, chests), [], () => 0).call.args.number, 1);
  assert.equal(planner.plan(snapshot(4, 1, chests), [], () => 0.99).call.args.number, 3);
  const opened = [{ action: 'openChest', floor: 4, room: 1, number: 1 }];
  assert.equal(planner.plan(snapshot(4, 1, chests, opened)).call.name, 'magicTower_enterNextFloor');
  assert.equal(planner.plan(snapshot(4, 1, { 1: { ...chests[1], openCosts: {
    1: { starmoney: '70' } } } })).kind, 'stop');
});

test('Tower runner sends saved team and automatically finishes battle before choosing buff and chest', () => {
  let cache = snapshot();
  let step = runner.start(cache, { buffPriority: [32, 34] }, 1, time);
  assert.equal(step.calls[0].args.number, 3);
  cache = snapshot(3, 3);
  step = runner.advance(step.state, rpc(step.calls[0], { currentRoomNumber: 3 }, time + 1000), cache, time + 1001);
  assert.equal(step.calls[0].name, 'magicTower_startBattle');
  assert.deepEqual(Array.from(step.calls[0].args.heroes), team);
  step = runner.advance(step.state, rpc(step.calls[0], { type: 'tower', seed: 8888, attackers: {} }, time + 2000), cache, time + 2001);
  assert.equal(step.state.phase, 'ending-battle');
  assert.equal(step.calls[0].name, 'magicTower_endBattle');
  assert.equal(step.calls[0].args.progress[0].seed, 8888);
  assert.equal(step.calls[0].args.result.win, true);
  cache = snapshot(3, 4);
  step = runner.advance(step.state, rpc(step.calls[0], { currentRoomNumber: 4,
    userHeroStates: Object.fromEntries(team.map((id) => [id, { isDead: false, hp: 100 }])) }, time + 4000),
    cache, time + 4001);
  assert.equal(step.calls[0].name, 'magicTower_activateBuff');
  assert.equal(step.calls[0].args.id, 32);
  cache = snapshot(3, 4, rooms, [{ action: 'activateBuff', floor: 3, room: 4, buffId: 32 }]);
  step = runner.advance(step.state, rpc(step.calls[0], [], time + 5000), cache, time + 5001);
  assert.equal(step.calls[0].name, 'magicTower_enterNextFloor');
  cache = snapshot(4, 1, { 1: { roomNumber: 1, type: 'chests',
    openCosts: { 1: null, 2: { starmoney: '70' } }, openChests: { 1: null, 2: null } } });
  step = runner.advance(step.state, rpc(step.calls[0], { floorNumber: 4 }, time + 6000), cache, time + 6001);
  assert.equal(step.calls[0].name, 'magicTower_openChest');
  assert.equal(step.calls[0].args.number, 1);
});

test('Tower runner supports custom heroes from settings and detects boss floor completion', () => {
  const customTeam = [1, 2, 3, 4, 5];
  const cacheWithoutSavedTeam = { ...snapshot(), teamGetAll: { data: {} } };
  const step = runner.start(cacheWithoutSavedTeam, { heroes: customTeam }, 1, time);
  assert.ok(step, 'Runner should start with custom heroes');
  assert.deepEqual(step.state.heroes, customTeam);

  const bossRooms = { 1: { roomNumber: 1, type: 'boss_battle', state: 'initial' } };
  const wonHistory = [{ action: 'endBattle', floor: 23, room: 1, win: true }];
  const bossSnapshot = snapshot(23, 0, bossRooms, wonHistory);
  const decision = planner.plan(bossSnapshot, []);
  assert.equal(decision.kind, 'complete');
});

test('Tower runner stops on battle loss, failed action, timeout, missing team and completion', () => {
  const cache = snapshot();
  assert.equal(runner.start({ ...cache, teamGetAll: { data: {} } }, {}, 1, time), null);
  let step = runner.start(cache, { buffPriority: [32] }, 1, time);
  assert.equal(runner.advance(step.state, rpc(step.calls[0], null, time + 1000,
    { message: 'rejected' }), cache, time + 1001).state.phase, 'stopped');
  assert.equal(runner.advance(step.state, null, cache, time + 120001).state.phase, 'stopped');
  step = runner.advance(step.state, rpc(step.calls[0], { currentRoomNumber: 3 }, time + 1000),
    snapshot(3, 3), time + 1001);
  step = runner.advance(step.state, rpc(step.calls[0], { type: 'tower', seed: 123 }, time + 2000),
    snapshot(3, 3), time + 2001);
  assert.equal(step.calls[0].name, 'magicTower_endBattle');
  const lost = runner.advance(step.state, rpc(step.calls[0], { currentRoomNumber: 0 }, time + 3000,
    { message: 'rejected' }), cache, time + 3001);
  assert.equal(lost.state.phase, 'stopped');
  const completed = planner.plan({ ...cache, towerStatus: { data: { state: 'win', isCleared: true } } });
  assert.equal(completed.kind, 'complete');
});

test('Tower automation handles object-shaped history, tokens, and buffs without TypeError', () => {
  const objectHistory = {
    '0': { action: 'endBattle', floor: 1, room: 1, win: true }
  };
  const rooms = {
    1: { roomNumber: 1, type: 'buffs', buffs: { '0': 6, '1': 3 } }
  };
  const session = {
    floorNumber: 1,
    roomNumber: 1,
    rooms,
    history: objectHistory,
    tokens: { '0': 'token-1' },
    completed: false
  };
  const cache = {
    towerSession: {
      data: session,
      updatedAt: '2026-11-12T04:00:00.000Z'
    },
    towerStatus: {
      data: { isCleared: false }
    }
  };

  assert.doesNotThrow(() => {
    const decision = planner.plan(cache, [6, 3]);
    assert.equal(decision.kind, 'rpc');
    assert.equal(decision.call.name, 'magicTower_activateBuff');
    assert.equal(decision.call.args.id, 6);
  });
});
