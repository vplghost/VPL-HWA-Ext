import test from 'node:test';
import assert from 'node:assert/strict';
import { monsterQueueService as queue } from '../src/services/queues/monsterQueue.ts';
import { experimentalDataHelper as data } from '../src/utils/experimentalData.ts';
const at = (seconds) => Date.UTC(2026, 10, 7, 12, 9, 0) + seconds * 1000;
const timestamp = (seconds) => new Date(at(seconds)).toISOString();
const heroes = Object.fromEntries([7, 51, 54, 60, 71].map((id) => [id, {
  level: 80, star: 5, power: id * 100, troopCapacity: 600
}]));
const units = { available: [7, 17, 27].map((unitId) => ({ unitId, count: 10000 })) };
const cache = {
  accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes },
  'getUnitSummary:unit': { data: units },
  'resource:world-energy': { data: { amount: 100 } },
  experimentalSoloSearch: { data: { mapId: 'map', center: { x: 606, y: 376 },
    mobConfigIds: [37, 67], mobs: [{ mobId: 'monster-a' }, { mobId: 'monster-b' }] } }
};
const options = { mapId: 'map', center: { x: 606, y: 376 }, level: 15,
  count: 2, firstMobId: 'monster-a', heroIds: [54, 60, 51, 7, 71], teamId: 'raid:0' };
function rpc(call, response, seconds) {
  return { transport: 'fetch', method: 'POST', status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: timestamp(seconds),
    requestBody: JSON.stringify({ calls: [{ ...call, ident: 'monster-test' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'monster-test', result: { response } }] }) };
}
function socket(type, body, seconds) {
  return { transport: 'websocket', direction: 'received', encoding: 'utf8',
    timestamp: timestamp(seconds), payload: JSON.stringify({ result: { type, body } }) };
}
function dispatched(count = 2) {
  const first = queue.start({ ...options, count }, 1, 10, at(0), cache, { defaultHero: 600, base: 950 });
  assert.equal(first.state.phase, 'attacking');
  assert.equal(first.calls[0].name, 'attackMob');
  assert.deepEqual(Array.from(first.calls[0].args.squad.heroes, (hero) => hero.heroId), options.heroIds);
  const accepted = queue.advance(first.state, rpc(first.calls[0], {
    squadId: 'squad-a', route: { routeId: 'outbound', startedAt: at(1), durationMs: 30000 }
  }, 1), cache, at(1));
  assert.equal(accepted.state.phase, 'active');
  return accepted.state;
}

test('solo monster config covers both captured families and the level-16 PvP gap', () => {
  assert.deepEqual(Array.from(data.soloMonsterConfigIds(15)), [37, 67]);
  assert.deepEqual(Array.from(data.soloMonsterConfigIds(16)), [38, 74]);
  assert.deepEqual(Array.from(data.soloMonsterConfigIds(30)), [52, 88]);
  assert.equal(data.soloMonsterConfigIds(31), null);
  assert.equal(data.soloMonsterLevel(88), 30);
});

test('queue advances once after exact win and completed return, then stops after requested count', () => {
  let state = dispatched();
  const win = socket('mobSoloAttackResult', { squadId: 'squad-a', mobId: 'monster-a', mobConfigId: 67,
    battleResult: { battleResult: 'win' },
    routeToOutpost: { startedAt: at(35), durationMs: 40000 } }, 35);
  state = queue.advance(state, win, cache, at(35)).state;
  assert.equal(queue.confirmedWins(state), 1);
  assert.equal(state.phase, 'active');
  assert.equal(queue.advance(state, socket('mobSingleAttackResult', {
    squadId: 'squad-a', mobId: 'monster-a', battleResult: { battleResult: 'win' }
  }, 35), cache, at(35)).state.recentResults.length, 1, 'duplicate game event is ignored');
  assert.equal(queue.advance(state, socket('returnFromMobCompleted', { squadId: 'other' }, 76), cache, at(76)).state.phase, 'active');
  const returned = queue.advance(state, socket('returnFromMobCompleted', { squadId: 'squad-a' }, 76), cache, at(76));
  assert.equal(returned.state.phase, 'refreshing');
  assert.equal(returned.state.completed, 1);
  assert.deepEqual(Array.from(returned.calls, (call) => call.name), ['heroGetAll', 'getUnitSummary']);
  const roster = { ...rpc(returned.calls[0], heroes, 77),
    requestBody: JSON.stringify({ calls: returned.calls.map((call, index) => ({ ...call, ident: `id-${index}` })) }),
    responseBody: JSON.stringify({ results: [
      { ident: 'id-0', result: { response: heroes } },
      { ident: 'id-1', result: { response: units } }
    ] }) };
  const next = queue.advance(returned.state, roster, cache, at(77));
  assert.equal(next.state.phase, 'attacking');
  assert.equal(next.calls[0].args.mobId, 'monster-b');
  state = queue.advance(next.state, rpc(next.calls[0], {
    squadId: 'squad-b', route: { routeId: 'outbound-b', startedAt: at(78), durationMs: 30000 }
  }, 78), cache, at(78)).state;
  state = queue.advance(state, socket('mobSoloAttackResult', { squadId: 'squad-b', mobId: 'monster-b',
    mobConfigId: 67, battleResult: { battleResult: 'win' } }, 115), cache, at(115)).state;
  state = queue.advance(state, socket('returnFromMobCompleted', { squadId: 'squad-b' }, 156), cache, at(156)).state;
  assert.equal(state.phase, 'complete');
  assert.equal(state.completed, 2);
  assert.equal(queue.advance(state, win, cache, at(160)).state.completed, 2);
});

test('loss, wrong identity, cancellation, account switch and timeout never dispatch another attack', () => {
  const state = dispatched();
  const wrong = queue.advance(state, socket('mobSoloAttackResult', { squadId: 'other', mobId: 'monster-a',
    battleResult: { battleResult: 'win' } }, 35), cache, at(35));
  assert.equal(wrong.state.phase, 'active');
  const loss = queue.advance(state, socket('mobSoloAttackResult', { squadId: 'squad-a', mobId: 'monster-a',
    mobConfigId: 67, battleResult: { battleResult: 'lose' } }, 35), cache, at(35));
  assert.equal(loss.state.phase, 'stopped');
  assert.equal(loss.state.recentResults[0].result, 'lose');
  assert.equal(loss.calls, undefined);
  assert.equal(queue.stop(state, 'Cancelled').phase, 'stopped');
  assert.equal(queue.advance(state, null, { ...cache, accountStatus: { data: { id: 11 } } }, at(20)).state.phase, 'stopped');
  assert.equal(queue.advance(state, null, cache, at(3700)).state.phase, 'stopped');
});

test('single attack completes, depleted energy and missing targets stop safely', () => {
  let state = dispatched(1);
  state = queue.advance(state, socket('mobSoloAttackResult', { squadId: 'squad-a', mobId: 'monster-a',
    battleResult: { battleResult: 'win' } }, 35), cache, at(35)).state;
  state = queue.advance(state, socket('returnFromMobCompleted', { squadId: 'squad-a' }, 76), cache, at(76)).state;
  assert.equal(state.phase, 'complete');
  assert.equal(state.completed, 1);
  assert.equal(queue.start(options, 1, 10, at(0), { ...cache,
    'resource:world-energy': { data: { amount: 9 } } }, {}).state.phase, 'stopped');
  const missingFirst = queue.start({ ...options, firstMobId: 'missing' }, 1, 10, at(0), cache, {});
  assert.equal(missingFirst.state.phase, 'searching');
  assert.equal(missingFirst.calls[0].name, 'searchMob');
});

test('MobNotFound auto-retries via fresh searchMob, evicts dead target, caps at 5 consecutive errors, and stops on energy errors', () => {
  const first = queue.start({ ...options, count: 1 }, 1, 10, at(0), cache, { defaultHero: 600, base: 950 });
  assert.equal(first.state.phase, 'attacking');
  assert.equal(first.calls[0].args.mobId, 'monster-a');

  // Server replies MobNotFound -> must evict monster-a and immediately issue fresh searchMob
  const retried = queue.advance(
    first.state,
    rpc(first.calls[0], { errorCode: 'MobNotFound' }, 2),
    cache,
    at(2)
  );
  assert.equal(retried.state.phase, 'searching');
  assert.equal(retried.calls[0].name, 'searchMob');
  assert.equal(retried.state.consecutiveAttackErrors, 1);
  assert.equal(retried.state.retriedCount, 1);
  assert.ok(retried.state.attackedMobIds.includes('monster-a'));
  assert.equal(retried.state.targets.length, 0);

  // Fresh searchMob returns monster-a (stale) and monster-c (fresh) -> skips monster-a, attacks monster-c
  const found = queue.advance(
    retried.state,
    rpc(retried.calls[0], { mobs: [{ mobId: 'monster-a' }, { mobId: 'monster-c' }] }, 4),
    cache,
    at(4)
  );
  assert.equal(found.state.phase, 'attacking');
  assert.equal(found.calls[0].args.mobId, 'monster-c');

  // Successful attack resets consecutiveAttackErrors to 0
  const accepted = queue.advance(
    found.state,
    rpc(found.calls[0], {
      squadId: 'squad-c',
      route: { routeId: 'outbound-c', startedAt: at(5), durationMs: 30000 },
    }, 5),
    cache,
    at(5)
  );
  assert.equal(accepted.state.phase, 'active');
  assert.equal(accepted.state.consecutiveAttackErrors, 0);

  // 5 consecutive MobNotFound errors stop cleanly
  const fifth = queue.advance(
    { ...first.state, consecutiveAttackErrors: 4 },
    rpc(first.calls[0], { errorCode: 'MobNotFound' }, 6),
    cache,
    at(6)
  );
  assert.equal(fifth.state.phase, 'stopped');
  assert.match(fifth.state.reason || '', /failed 5 times in a row/);

  // Energy error stops immediately without retrying
  const noEnergy = queue.advance(
    first.state,
    rpc(first.calls[0], { errorCode: 'NotEnoughEnergy' }, 7),
    cache,
    at(7)
  );
  assert.equal(noEnergy.state.phase, 'stopped');
  assert.match(noEnergy.state.reason || '', /World Energy/);
});

test('start auto-searches when experimentalSoloSearch cache is stale (>5m) or empty', () => {
  const staleCache = {
    ...cache,
    experimentalSoloSearch: {
      ...cache.experimentalSoloSearch,
      updatedAt: new Date(at(0) - 360000).toISOString(),
    },
  };
  const fromStale = queue.start(options, 1, 10, at(0), staleCache, { defaultHero: 600, base: 950 });
  assert.equal(fromStale.state.phase, 'searching');
  assert.equal(fromStale.calls[0].name, 'searchMob');

  const emptyCache = { ...cache, experimentalSoloSearch: undefined };
  const fromEmpty = queue.start({ ...options, firstMobId: '' }, 1, 10, at(0), emptyCache, { defaultHero: 600, base: 950 });
  assert.equal(fromEmpty.state.phase, 'searching');
  assert.equal(fromEmpty.calls[0].name, 'searchMob');
});
