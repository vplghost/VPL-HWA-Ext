import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const context = { TextEncoder };
runInNewContext(await readFile(new URL('../extension/tower-rules.js', import.meta.url), 'utf8'), context);
runInNewContext(source, context);
const cache = context.hwaHelperRpcCache;

function rpc(name, args, result, index) {
  const ident = `tower-${index}`;
  return {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: `2026-11-03T05:00:${String(index).padStart(2, '0')}.000Z`,
    requestBody: JSON.stringify({ calls: [{ name: `magicTower_${name}`, ident, args }] }),
    responseBody: JSON.stringify({ results: [{ ident, result }] })
  };
}

test('accepted boss victory without optional completion fields immediately completes Tower', () => {
  const initial = cache.merge({}, [
    rpc('enterNextFloor', {}, { response: { floorNumber: 23, currentRoomNumber: 1,
      rooms: { 1: { roomNumber: 1, type: 'boss_battle', state: 'initial' } } } }, 1)
  ]).cache;
  const result = cache.merge(initial, [rpc('endBattle', { result: { win: true, stars: 3 } },
    { response: { currentRoomNumber: 0, reward: { gold: 38200 } } }, 2)]).cache;
  assert.equal(result.towerSession.data.completed, true);
  assert.equal(result.towerStatus.data.isCleared, true);
  assert.equal(result.towerStatus.updatedAt, result.towerSession.updatedAt);
});

test('Tower requires accepted boss win and resets completion on a new run', () => {
  for (const [type, win, response] of [
    ['hero_battle', true, { response: { currentRoomNumber: 0 } }],
    ['boss_battle', false, { response: { currentRoomNumber: 0 } }],
    ['boss_battle', true, { error: 'rejected' }],
    ['boss_battle', true, { response: { error: 'rejected' } }],
    ['boss_battle', true, {}]
  ]) {
    const initial = cache.merge({}, [rpc('enterNextFloor', {}, { response: {
      floorNumber: 23, currentRoomNumber: 1, rooms: { 1: { type } }
    } }, 1)]).cache;
    const result = cache.merge(initial, [rpc('endBattle', { result: { win } }, response, 2)]).cache;
    assert.equal(result.towerSession.data.completed, false);
    assert.notEqual(result.towerStatus?.data?.isCleared, true);
  }
  let state = cache.merge({}, [
    rpc('enterNextFloor', {}, { response: { floorNumber: 23, currentRoomNumber: 1,
      rooms: { 1: { type: 'boss_battle' } } } }, 1),
    rpc('endBattle', { result: { win: true } }, { response: { currentRoomNumber: 0 } }, 2)
  ]).cache;
  assert.equal(state.towerStatus.data.isCleared, true);
  const next = rpc('getAll', {}, { response: { state: 'inProgress',
    floorData: { floorNumber: 1, currentRoomNumber: 0, rooms: {} } } }, 3);
  state = cache.merge(state, [next]).cache;
  assert.equal(state.towerSession.data.completed, false);
  assert.equal(state.towerSession.data.history.length, 0);
  assert.equal(state.towerStatus.data.isCleared, false);
});

test('Tower cache retains floor choices and marks final boss completion', () => {
  const records = [
    rpc('enterNextFloor', {}, { response: { floorNumber: 1, currentRoomNumber: 0,
      rooms: { 1: { roomNumber: 1, type: 'hero_battle', defenders: { units: [{ id: 7 }] } },
        2: { roomNumber: 2, type: 'buffs', buffs: [17, 18, 19] } } } }, 1),
    rpc('enterRoom', { number: 1 }, { response: { currentRoomNumber: 1 } }, 2),
    rpc('startBattle', { heroes: [79, 72] }, { response: {} }, 3),
    rpc('endBattle', { result: { win: true, stars: 3 } },
      { response: { currentRoomNumber: 2, reward: { gold: 6400 } } }, 4),
    rpc('activateBuff', { id: 17 }, { response: [] }, 5),
    rpc('enterNextFloor', {}, { response: { floorNumber: 2, currentRoomNumber: 1,
      rooms: { 1: { roomNumber: 1, type: 'chests', openCosts: { 1: null, 2: { starmoney: '70' } },
        rewards: [{ reward: { gold: 100000 } }] } } } }, 6),
    rpc('openChest', { number: 2 }, { response: { rewardIndex: 0, reward: { gold: 100000 } } }, 7),
    rpc('enterNextFloor', {}, { response: { floorNumber: 23, currentRoomNumber: 0,
      rooms: { 1: { roomNumber: 1, type: 'boss_battle', defenders: { units: [{ id: 5267 }] } } } } }, 8),
    rpc('enterRoom', { number: 1 }, { response: { currentRoomNumber: 1 } }, 9),
    rpc('endBattle', { result: { win: true, stars: 3 } }, { response: { currentRoomNumber: 0,
      reward: { gold: 38200 } }, magicTower_completion: { totalClears: 30, streak: 15 },
      magicTower_briefInfo: { state: 'win', deadHeroesCount: 0 } }, 10)
  ];
  const result = cache.merge({}, records);
  const session = result.cache.towerSession.data;
  assert.equal(session.floorNumber, 23);
  assert.equal(session.roomNumber, 0);
  assert.equal(session.completed, true);
  assert.equal(session.history.length, 4);
  assert.equal(session.history[1].buffId, 17);
  assert.deepEqual([...session.history[1].options], [17, 18, 19]);
  assert.equal(session.history[2].number, 2);
  assert.equal(session.history[2].reward.gold, 100000);
  assert.equal(session.history[2].options[2].starmoney, '70');
  assert.equal(session.history[2].possibleRewards[0].gold, 100000);
  assert.equal(result.cache.towerStatus.data.state, 'win');
  assert.equal(cache.merge(result.cache, records).cache.towerSession.data.history.length, 4);
  const restarted = cache.merge(result.cache, [rpc('enterRoom', { number: 1 },
    { response: { currentRoomNumber: 1 } }, 11)]).cache;
  assert.equal(restarted.towerSession.data.completed, false);
  assert.equal(restarted.towerSession.data.history.length, 0);
  assert.equal(restarted.towerStatus.data.isCleared, false);
});
