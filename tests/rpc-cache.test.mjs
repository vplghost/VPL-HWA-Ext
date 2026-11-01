import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const refillRules = await readFile(new URL('../extension/refillable-rules.js', import.meta.url), 'utf8');
const missionCosts = await readFile(new URL('../extension/mission-costs.js', import.meta.url), 'utf8');
const marchRules = await readFile(new URL('../extension/march-rules.js', import.meta.url), 'utf8');
const resourceDataSource = await readFile(new URL('../extension/resource-data.js', import.meta.url), 'utf8');
const context = { TextEncoder };
runInNewContext(refillRules, context);
runInNewContext(missionCosts, context);
runInNewContext(marchRules, context);
runInNewContext(resourceDataSource, context);
runInNewContext(source, context);
const cache = context.hwaHelperRpcCache;

function record(calls, results, timestamp = '2026-11-01T09:18:28.248Z') {
  return {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results }), timestamp,
    requestBodyTruncated: false, responseBodyTruncated: false
  };
}

test('extracts selected RPC results by ident and excludes login and chat methods', () => {
  const input = record([
    { name: 'heroGetAll', ident: 'a' },
    { name: 'inventoryGet', ident: 'b' },
    { name: 'mobileLogin', ident: 'c' },
    { name: 'chatGetAll', ident: 'd' }
  ], [
    { ident: 'b', result: { response: { coin: { 1: 7 } } } },
    { ident: 'a', result: { response: { 1: { level: 70 } } } },
    { ident: 'c', result: { response: { token: 'secret' } } },
    { ident: 'd', result: { response: { message: 'private' } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)], ['heroGetAll', 'inventoryGet', 'resource:coin:1']);
  assert.equal(entries[0].data[1].level, 70);
  assert.equal(entries[1].data.coin[1], 7);
});

test('keeps newer snapshot and ignores incomplete or unrelated records', () => {
  const newer = record([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 1: { level: 80 } } } }], '2026-11-01T09:19:00.000Z');
  const older = record([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 1: { level: 70 } } } }]);
  const invalid = { ...newer, responseBodyTruncated: true };
  const result = cache.merge({}, [newer, older, invalid, { ...newer, endpoint: '/oauth/refresh' }]);
  assert.equal(result.cache.heroGetAll.data[1].level, 80);
  assert.equal(Object.keys(result.cache).length, 1);
});

test('caches resource amounts and account name without account identifiers', () => {
  const input = record([{ name: 'userGetInfo', ident: 1 }], [{ ident: 1, result: {
    response: { id: 'private-id', name: 'private-name', level: 120,
      refillable: [{ id: 1, amount: 42, lastRefill: 1793532258 },
        { id: 2, amount: 10, lastRefill: 1793532258 },
        { id: 5, amount: 150, lastRefill: 1793532258 }] }
  } }]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)],
    ['accountStatus', 'resource:energy', 'energyStatus', 'resource:refillable:2',
      'resource:refillable:5']);
  assert.equal(entries.find((entry) => entry.key === 'accountStatus').data.name, 'private-name');
  assert.equal(entries.find((entry) => entry.key === 'resource:energy').data.amount, 42);
  assert.equal(entries.find((entry) => entry.key === 'resource:energy').data.cap, 180);
  assert.equal(entries.find((entry) => entry.key === 'resource:energy').data.refillEveryMs, 360000);
  assert.equal(entries.find((entry) => entry.key === 'resource:refillable:2').data.label, 'Skill Points');
  assert.equal(entries.find((entry) => entry.key === 'resource:refillable:2').data.cap, 10);
  assert.equal(entries.find((entry) => entry.key === 'resource:refillable:2').data.renewable, true);
  assert.equal(entries.find((entry) => entry.key === 'resource:refillable:5').data.renewable, undefined);
  assert.equal(JSON.stringify(entries).includes('private-id'), false);
});

test('numeric-string team level sets the Energy soft cap and six-minute fallback', () => {
  const input = record([{ name: 'userGetInfo', ident: 'level-string' }],
    [{ ident: 'level-string', result: { response: { name: 'Player', level: '78',
      refillable: [{ id: 1, amount: 8, lastRefill: 1793540178 }] } } }]);
  const entries = cache.extract(input);
  const energy = entries.find((entry) => entry.key === 'resource:energy');
  assert.equal(energy.data.cap, 138);
  assert.equal(energy.data.refillEveryMs, 360000);
  assert.equal(energy.data.lastRefillAt, 1793540178000);
  assert.equal(entries.find((entry) => entry.key === 'accountStatus').data.level, 78);
});

test('mission actions spend their configured Energy and reset a full refill clock', () => {
  const baseline = record([{ name: 'userGetInfo', ident: 'snapshot' }],
    [{ ident: 'snapshot', result: { response: { level: 78,
      refillable: [{ id: 1, amount: 138, lastRefill: 1793534400 }] } } }],
    '2026-11-01T12:00:00.000Z');
  const raid = record([{ name: 'missionRaid', ident: 'raid', args: { id: 99, times: 2 } }],
    [{ ident: 'raid', result: { response: { raid: {} } } }],
    '2026-11-01T12:01:00.000Z');
  const start = record([{ name: 'missionStart', ident: 'start', args: { id: 99 } }],
    [{ ident: 'start', result: { response: {} } }], '2026-11-01T12:01:30.000Z');
  const end = record([{ name: 'missionEnd', ident: 'end',
    args: { id: 99, result: { win: true } } }],
    [{ ident: 'end', result: { response: {} } }], '2026-11-01T12:02:00.000Z');
  const afterRaid = cache.merge({}, [baseline, raid]).cache;
  assert.equal(afterRaid['resource:energy'].data.amount, 126);
  assert.equal(afterRaid['resource:energy'].data.lastRefillAt,
    Date.parse('2026-11-01T12:01:00.000Z'));
  const afterBattle = cache.merge(afterRaid, [start, end]).cache;
  assert.equal(afterBattle['resource:energy'].data.amount, 120);
  assert.equal(afterBattle.energyStatus.data.energy, 120);
  assert.equal(cache.merge(afterBattle, [raid, start, end]).changed, false);
  const latest = record([{ name: 'userGetInfo', ident: 'latest' }],
    [{ ident: 'latest', result: { response: { level: 78,
      refillable: [{ id: 1, amount: 119, lastRefill: 1793534520 }] } } }],
    '2026-11-01T12:03:00.000Z');
  assert.equal(cache.merge(afterBattle, [latest, raid]).cache['resource:energy'].data.amount, 119);
});

test('successful empty skill results spend once and only refill below soft cap', () => {
  const baseline = record([{ name: 'userGetInfo', ident: 'snapshot' }],
    [{ ident: 'snapshot', result: { response: { level: 78,
      refillable: [{ id: 2, amount: 10, lastRefill: 1793534400 }] } } }],
    '2026-11-01T12:00:00.000Z');
  const spend = record([
    { name: 'heroUpgradeSkill', ident: 'a', args: { heroId: 16, skill: 3 } },
    { name: 'heroUpgradeSkill', ident: 'b', args: { heroId: 16, skill: 3 } }
  ], [{ ident: 'a', result: { response: null } },
    { ident: 'b', result: { response: null } }], '2026-11-01T12:01:00.000Z');
  const after = cache.merge({}, [baseline, spend]).cache;
  assert.equal(after['resource:refillable:2'].data.amount, 8);
  assert.equal(after['resource:refillable:2'].data.lastRefillAt,
    Date.parse('2026-11-01T12:01:00.000Z'));
  assert.equal(cache.merge(after, [spend]).changed, false);
  assert.equal(context.hwaHelperResourceData.amountAt(after['resource:refillable:2'],
    Date.parse('2026-11-01T12:05:59.000Z')), 8);
  assert.equal(context.hwaHelperResourceData.amountAt(after['resource:refillable:2'],
    Date.parse('2026-11-01T12:06:00.000Z')), 9);
  const failed = record([{ name: 'heroUpgradeSkill', ident: 'failed' }],
    [{ ident: 'failed', result: { error: 'no skill point' } }]);
  assert.equal(cache.extract(failed).length, 0);
});

test('a paid Skill Point balance above the soft cap waits until it drops below 10', () => {
  const baseline = record([{ name: 'userGetInfo', ident: 'snapshot' }],
    [{ ident: 'snapshot', result: { response: { level: 78,
      refillable: [{ id: 2, amount: 12, lastRefill: 1793534400 }] } } }],
    '2026-11-01T12:00:00.000Z');
  const spends = ['a', 'b', 'c'].map((ident, index) =>
    record([{ name: 'heroUpgradeSkill', ident }],
      [{ ident, result: { response: null } }],
      `2026-11-01T12:0${index + 1}:00.000Z`));
  const afterTwo = cache.merge({}, [baseline, ...spends.slice(0, 2)]).cache;
  assert.equal(afterTwo['resource:refillable:2'].data.amount, 10);
  assert.equal(context.hwaHelperResourceData.amountAt(afterTwo['resource:refillable:2'],
    Date.parse('2026-11-01T12:12:00.000Z')), 10);
  const afterThree = cache.merge(afterTwo, [spends[2]]).cache;
  assert.equal(afterThree['resource:refillable:2'].data.amount, 9);
  assert.equal(afterThree['resource:refillable:2'].data.lastRefillAt,
    Date.parse('2026-11-01T12:03:00.000Z'));
});

test('mail claims add each reward once to observed resource balances', () => {
  const baseline = record([{ name: 'getInventory', feature: 'inventory', ident: 'snapshot' }],
    [{ ident: 'snapshot', result: { response: { inventory: { items: [
      { type: 'material', id: 5, quantity: 1000 },
      { type: 'material', id: 4, quantity: 500 }
    ] } } } }], '2026-11-01T12:00:00.000Z');
  const claim = record([{ name: 'readAndClaimAll', ident: 'claim' }],
    [{ ident: 'claim', result: { response: { claimedRewards: [
      { type: 'material', id: 5, amount: 700 },
      { type: 'material', id: 5, amount: 5 },
      { type: 'material', id: 4, amount: 50 }
    ] } } }], '2026-11-01T12:01:00.000Z');
  const after = cache.merge({}, [baseline, claim]).cache;
  assert.equal(after['resource:material:5'].data.amount, 1705);
  assert.equal(after['resource:material:4'].data.amount, 550);
  assert.equal(cache.merge(after, [claim]).changed, false);
});

test('updates World Energy and other observed refillables with timing metadata', () => {
  const input = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }], [
    { ident: 1, result: { response: { refillables: [
      { refillableId: 1, amount: 43, lastRefillAt: 100 },
      { refillableId: 2, amount: 44, lastRefillAt: 123 },
      { refillableId: 6, amount: 1, lastRefillAt: 456 }
    ] } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)],
    ['resource:energy', 'energyStatus', 'resource:world-energy', 'worldEnergyStatus',
      'resource:world-refillable:6']);
  assert.equal(entries[0].data.amount, 43);
  assert.equal(entries[2].data.refillEveryMs, 300000);
  assert.equal(entries[2].data.cap, 200);
  assert.equal(entries[3].data.energy, 44);
  assert.equal(entries[4].data.amount, 1);
});

test('extracts material and speedups from World inventory, and queue timers', () => {
  const input = record([
    { name: 'getInventory', feature: 'inventory', ident: 1 },
    { name: 'getSummary', feature: 'personalResearch', ident: 2 },
    { name: 'getSummary', feature: 'building', ident: 3 }
  ], [
    { ident: 1, result: { response: { inventory: { items: [
      { type: 'material', id: 3, quantity: 17 },
      { type: 'speedUpResearch', id: 1, quantity: 4 },
      { type: 'lootboxChanced', id: 6, quantity: 5 }
    ] } } } },
    { ident: 2, result: { response: { queues: [
      { researchId: 120, startDate: 1793528241401, durationMs: 8136000 }
    ] } } },
    { ident: 3, result: { response: { queues: [] } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)], [
    'resource:material:3', 'resource:speedUpResearch:1', 'resource:lootboxChanced:6',
    'researchStatus', 'buildingStatus'
  ]);
  assert.equal(entries[0].data.label, 'Stone');
  assert.equal(entries[0].data.renewable, true);
  assert.equal(entries[1].data.renewable, undefined);
  assert.equal(entries[3].data.queues[0].durationMs, 8136000);
});

test('newer World Energy API snapshot replaces older balance and refill clock', () => {
  const world = (amount, lastRefillAt, timestamp) => record(
    [{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }],
    [{ ident: 1, result: { response: { refillables: [
      { refillableId: 2, amount, lastRefillAt }
    ] } } }], timestamp);
  const older = world(44, 1000000, '2026-11-01T10:00:00.000Z');
  const newer = world(20, 2000000, '2026-11-01T10:05:00.000Z');
  const merged = cache.merge({}, [older, newer, older]).cache['resource:world-energy'];
  assert.equal(merged.data.amount, 20);
  assert.equal(merged.data.lastRefillAt, 2000000);
});

test('march snapshots classify resource mines and movement without retaining raw route data', () => {
  const at = '2026-11-01T13:40:00.000Z';
  const march = (stage, targetType, objectConfigId, id) => ({
    squadId: id, startedAt: Date.parse(at), durationMs: 600000,
    targetType, target: { objectConfigId, coordinates: { x: 473, y: 304 } }
  });
  const first = record([{ name: 'getMarches', feature: 'march', ident: 'marches' }],
    [{ ident: 'marches', result: { response: { marches: {
      interactionWithTarget: [march('interactionWithTarget', 'mine', 55, 'wood-squad'),
        march('interactionWithTarget', 'mine', 75, 'stone-squad')],
      moveToTargetInSolo: [march('moveToTargetInSolo', 'mob', 0, 'attack-squad'),
        march('moveToTargetInSolo', 'mine', 55, 'wood-squad')],
      moveToTargetInRally: [march('moveToTargetInRally', 'mob', 0, 'raid-squad')],
      returnToOutpost: [{ squadId: 'return-squad', route: {
        startedAt: Date.parse(at), durationMs: 300000 } }]
    }, scoutMarches: { moveToTargetInSolo: [march('moveToTargetInSolo',
      'outpost', 0, 'scout-squad')] } } } }], at);
  const entries = cache.extract(first);
  assert.equal(entries.length, 1);
  const projected = entries[0].data.marches;
  assert.deepEqual(Array.from(projected, (item) => item.kind),
    ['wood', 'stone', 'attack', 'raid', 'return', 'scout']);
  assert.equal(projected[0].endsAt, Date.parse(at) + 600000);
  assert.equal(projected[4].endsAt, Date.parse(at) + 300000);
  assert.equal(projected[0].squadId, 'wood-squad');
  assert.equal(JSON.stringify(entries).includes('473'), false);
  const cleared = record([{ name: 'getMarches', feature: 'march', ident: 'later' }],
    [{ ident: 'later', result: { response: { marches: {}, scoutMarches: {} } } }],
    '2026-11-01T13:45:00.000Z');
  assert.equal(cache.merge({}, [first, cleared, first]).cache.marchStatus.data.marches.length, 0);
});

test('created rally keeps its departing team and gains target and leg estimates only for its own ID', () => {
  const at = '2026-11-01T14:17:51.731Z';
  const waitUntil = Date.parse(at) + 300000;
  const create = record([{ name: 'createRally', feature: 'mob', ident: 'create',
    args: { squad: { heroes: [{ heroId: 16 }, { heroId: 79 }],
      units: [{ unitId: 7, count: 1556 }] } } }],
  [{ ident: 'create', result: { response: { squadId: 'my-squad',
    rally: { rallyId: 'my-rally', plannedStartTime: waitUntil } } } }], at);
  const details = record([{ name: 'getRallyById', feature: 'rally', ident: 'details',
    args: { rallyId: 'my-rally' } }],
  [{ ident: 'details', result: { response: { rally: {
    rallyId: 'my-rally', plannedStartTime: waitUntil,
    leader: { squad: { squadId: 'my-squad', heroes: [{ heroId: 16 }, { heroId: 79 }],
      units: [{ unitId: 7, count: 1556 }] } },
    leaderCoordinates: { x: 507, y: 113 },
    target: { objectConfigId: 79, coordinates: { x: 569, y: 104 } }
  } } } }], '2026-11-01T14:17:53.061Z');
  const other = record([{ name: 'getRallyById', feature: 'rally', ident: 'other' }],
    [{ ident: 'other', result: { response: { rally: { rallyId: 'their-rally',
      target: { objectConfigId: 74 } } } } }], '2026-11-01T14:17:54.000Z');
  const after = cache.merge({}, [create, details, other]).cache;
  assert.equal(after.marchStatus.data.marches.length, 1);
  const march = after.marchStatus.data.marches[0];
  assert.equal(march.kind, 'raid');
  assert.equal(march.rally.waitUntil, waitUntil);
  assert.equal(march.rally.target, '[PvP] Boss, level 20');
  assert.deepEqual(Array.from(march.rally.team.heroIds), [16, 79]);
  assert.ok(march.rally.outboundMs > 30000 && march.rally.outboundMs < 33000);
  assert.ok(march.rally.returnMs > 40000 && march.rally.returnMs < 43000);
  assert.equal(cache.merge(after, [create, details]).changed, false);
  assert.equal(JSON.stringify(after.marchStatus).includes('507'), false);
});

test('rally march uses observed route ETA and disappears on cancel', () => {
  const at = '2026-11-01T14:17:51.731Z';
  const create = record([{ name: 'createRally', feature: 'mob', ident: 'create' }],
    [{ ident: 'create', result: { response: { squadId: 'squad',
      rally: { rallyId: 'rally', plannedStartTime: Date.parse(at) + 300000 } } } }], at);
  const route = (stage, stamp, duration, timestamp) => record(
    [{ name: 'getMarches', feature: 'march', ident: stage }],
    [{ ident: stage, result: { response: { marches: { [stage]: [
      { squadId: 'squad', route: { startedAt: stamp, durationMs: duration } }
    ] }, scoutMarches: {} } } }], timestamp);
  const outbound = route('moveToTargetInRally', Date.parse(at) + 300000,
    32000, '2026-11-01T14:22:52.000Z');
  const returning = route('returnToOutpost', Date.parse(at) + 340000,
    44000, '2026-11-01T14:23:32.000Z');
  const canceled = record([{ name: 'cancelRally', feature: 'rally', ident: 'cancel',
    args: { rallyId: 'rally' } }],
    [{ ident: 'cancel', result: { response: {} } }], '2026-11-01T14:24:00.000Z');
  const traveling = cache.merge({}, [create, outbound]).cache;
  assert.equal(traveling.marchStatus.data.marches[0].rally.arrivalAt,
    Date.parse(at) + 332000);
  assert.equal(traveling.marchStatus.data.marches[0].kind, 'raid');
  const back = cache.merge(traveling, [returning]).cache;
  assert.equal(back.marchStatus.data.marches[0].rally.returnAt,
    Date.parse(at) + 384000);
  assert.equal(cache.merge(back, [canceled]).cache.marchStatus.data.marches.length, 0);
});

test('research actions update and clear the live countdown', () => {
  const summary = record([{ name: 'getSummary', feature: 'personalResearch', ident: 1 }],
    [{ ident: 1, result: { response: { queues: [] } } }], '2026-11-01T12:33:00.000Z');
  const start = record([{ name: 'startResearch', feature: 'personalResearch', ident: 2,
    args: { researchId: 119, nextLevel: 2, startDate: 1793536406988,
      durationMs: 7810560, queueNumber: 0 } }],
    [{ ident: 2, result: { response: {} } }], '2026-11-01T12:33:29.055Z');
  const complete = record([{ name: 'completeResearch', feature: 'personalResearch', ident: 3,
    args: { researchId: 119 } }], [{ ident: 3, result: { response: {} } }],
    '2026-11-01T14:43:40.000Z');
  const started = cache.merge({}, [summary, start]).cache;
  assert.equal(started.researchStatus.data.queues[0].durationMs, 7810560);
  assert.equal(started.researchStatus.data.queues[0].researchId, 119);
  assert.equal(cache.merge(started, [start]).changed, false);
  assert.equal(cache.merge(started, [complete]).cache.researchStatus.data.queues.length, 0);
  const failed = record([{ name: 'startResearch', feature: 'personalResearch', ident: 4,
    args: { startDate: 1, durationMs: 100 } }],
    [{ ident: 4, result: { error: 'rejected' } }]);
  assert.equal(cache.extract(failed).length, 0);
});

test('raid start spends 25 World Energy and cancellation refunds once', () => {
  const baseline = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }],
    [{ ident: 1, result: { response: { refillables: [
      { refillableId: 2, amount: 44, lastRefillAt: 1793532222787 }
    ] } } }], '2026-11-01T11:28:27.082Z');
  const create = record([{ name: 'createRally', feature: 'mob', ident: 2 }],
    [{ ident: 2, result: { response: { rally: { rallyId: 'rally-a' } } } }],
    '2026-11-01T12:35:51.074Z');
  const cancel = record([{ name: 'cancelRally', feature: 'rally', ident: 3,
    args: { rallyId: 'rally-a' } }], [{ ident: 3, result: { response: {} } }],
    '2026-11-01T12:36:05.983Z');
  const started = cache.merge({}, [baseline, create]).cache;
  assert.equal(started['resource:world-energy'].data.amount, 33);
  assert.equal(started.worldEnergyStatus.data.energy, 33);
  assert.equal(cache.merge(started, [create]).changed, false);
  const canceled = cache.merge(started, [cancel]).cache;
  assert.equal(canceled['resource:world-energy'].data.amount, 58);
  assert.equal(cache.merge(canceled, [cancel]).changed, false);
  const fresh = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 4 }],
    [{ ident: 4, result: { response: { refillables: [
      { refillableId: 2, amount: 60, lastRefillAt: 1793536500000 }
    ] } } }], '2026-11-01T12:37:00.000Z');
  assert.equal(cache.merge(canceled, [fresh]).cache['resource:world-energy'].data.amount, 60);
});

test('raid from a full World Energy bar restarts the refill clock', () => {
  const at = '2026-11-01T12:35:51.074Z';
  const snapshot = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }],
    [{ ident: 1, result: { response: { refillables: [
      { refillableId: 2, amount: 200, lastRefillAt: 1793530000000 }
    ] } } }], '2026-11-01T12:30:00.000Z');
  const create = record([{ name: 'createRally', feature: 'mob', ident: 2 }],
    [{ ident: 2, result: { response: { rally: { rallyId: 'rally-b' } } } }], at);
  const result = cache.merge({}, [snapshot, create]).cache['resource:world-energy'];
  assert.equal(result.data.amount, 175);
  assert.equal(result.data.lastRefillAt, Date.parse(at));
});

test('stores only production inputs from config, bonus, producer and mission RPCs', () => {
  const input = record([
    { name: 'remoteConfigInit', ident: 1 },
    { name: 'getSummary', feature: 'bonus', ident: 2 },
    { name: 'getSummary', feature: 'resourceProduction', ident: 3 },
    { name: 'missionGetAll', ident: 4 }
  ], [
    { ident: 1, result: { response: { index: { configs: {
      bonus: { url: 'bonus-config' }, resourceProductionCampaign: { url: 'campaign-config' }
    } } } } },
    { ident: 2, result: { response: { persistentBonuses: [10], temporaryBonuses: [],
      stackableBonuses: [], clanBonuses: { stackableBonuses: [{ id: 20, counter: 2 }] } } } },
    { ident: 3, result: { response: { producers: [
      { id: 1, residents: [100, 101], lastCollectDate: 123 },
      { id: 2, residents: [] }
    ] } } },
    { ident: 4, result: { response: { 0: { stars: 3 }, 1: { stars: 0 } } } }
  ]);
  const entries = cache.extract(input);
  assert.equal(entries.find((item) => item.key === 'productionConfigStatus').data.bonusUrl,
    'bonus-config');
  assert.deepEqual([...entries.find((item) => item.key === 'productionBonusStatus').data.bonuses]
    .map((pair) => [...pair]),
    [[10, 1], [20, 2]]);
  assert.equal(entries.find((item) => item.key === 'productionStatus').data.producers[0].residentCount, 2);
  assert.equal(JSON.stringify(entries.find((item) => item.key === 'productionStatus')).includes('100'), false);
  assert.deepEqual([...entries.find((item) => item.key === 'missionProgressStatus').data.completed], [0]);
});
