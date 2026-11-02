import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const refillRules = await readFile(new URL('../extension/refillable-rules.js', import.meta.url), 'utf8');
const missionCosts = await readFile(new URL('../extension/mission-costs.js', import.meta.url), 'utf8');
const marchRules = await readFile(new URL('../extension/march-rules.js', import.meta.url), 'utf8');
const resourceDataSource = await readFile(new URL('../extension/resource-data.js', import.meta.url), 'utf8');
const clanVersusRules = await readFile(new URL('../extension/clan-versus-rules.js', import.meta.url), 'utf8');
const context = { TextEncoder };
runInNewContext(refillRules, context);
runInNewContext(missionCosts, context);
runInNewContext(marchRules, context);
runInNewContext(clanVersusRules, context);
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
  assert.equal(afterRaid['resource:energy'].data.amount, 122);
  assert.equal(afterRaid['resource:energy'].data.lastRefillAt,
    Date.parse('2026-11-01T12:01:00.000Z'));
  const afterBattle = cache.merge(afterRaid, [start, end]).cache;
  assert.equal(afterBattle['resource:energy'].data.amount, 114);
  assert.equal(afterBattle.energyStatus.data.energy, 114);
  assert.equal(cache.merge(afterBattle, [raid, start, end]).changed, false);
  const latest = record([{ name: 'userGetInfo', ident: 'latest' }],
    [{ ident: 'latest', result: { response: { level: 78,
      refillable: [{ id: 1, amount: 119, lastRefill: 1793534520 }] } } }],
    '2026-11-01T12:03:00.000Z');
  assert.equal(cache.merge(afterBattle, [latest, raid]).cache['resource:energy'].data.amount, 119);
});

test('missionRaid uses experience from response and awards gold', () => {
  const baseline = record([{ name: 'userGetInfo', ident: 'snapshot' }],
    [{ ident: 'snapshot', result: { response: { level: 78, gold: 50000,
      refillable: [{ id: 1, amount: 100, lastRefill: 1793534400 }] } } }],
    '2026-11-01T12:00:00.000Z');
  const raid99 = record([{ name: 'missionRaid', ident: 'raid99', args: { id: 99, times: 1 } }],
    [{ ident: 'raid99', result: { response: { '0': { experience: 8, gold: 1273 }, raid: { consumable: { 9: 4, 10: 1 } } } } }],
    '2026-11-01T12:01:00.000Z');
  const raid63 = record([{ name: 'missionRaid', ident: 'raid63', args: { id: 63, times: 1 } }],
    [{ ident: 'raid63', result: { response: { '0': { experience: 6, gold: 1038 }, raid: { consumable: { 9: 5 } } } } }],
    '2026-11-01T12:02:00.000Z');

  const after99 = cache.merge({}, [baseline, raid99]).cache;
  assert.equal(after99['resource:energy'].data.amount, 92);
  assert.equal(after99['resource:gold'].data.amount, 51273);

  const after63 = cache.merge(after99, [raid63]).cache;
  assert.equal(after63['resource:energy'].data.amount, 86);
  assert.equal(after63['resource:gold'].data.amount, 52311);
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

test('building actions start construction, retain buildingId and level, and update queue', () => {
  const at = '2026-11-01T16:49:08.368Z';
  const start = record([
    { name: 'startConstruction', feature: 'building', args: {
      buildingId: 183, nextLevel: 13, startDate: 1793551748368, durationMs: 17432800
    }, ident: 'start-1' }
  ], [
    { ident: 'start-1', result: { response: {} } }
  ], at);
  const extracted = cache.extract(start);
  assert.equal(extracted[0].key, 'buildingStatus');
  assert.equal(extracted[0].data.action, 'start');
  assert.equal(extracted[0].data.queue.buildingId, 183);
  assert.equal(extracted[0].data.queue.level, 13);

  const merged = cache.merge({}, [start]).cache.buildingStatus;
  assert.equal(merged.data.queues.length, 1);
  assert.equal(merged.data.queues[0].buildingId, 183);
  assert.equal(merged.data.queues[0].level, 13);
  assert.equal(merged.data.queues[0].durationMs, 17432800);
});

test('heroUpgradeSkill upgrades hero skill in heroGetAll and decrements skill points', () => {
  const at = '2026-11-01T17:03:42.349Z';
  const heroGetAll = record([
    { name: 'heroGetAll', ident: 'heroes-1' },
    { name: 'userGetInfo', ident: 'info-1' }
  ], [
    { ident: 'heroes-1', result: { response: {
      '60': { id: 60, level: 75, skills: { '350': 74, '351': 60, '352': 50, '353': 70 } }
    } } },
    { ident: 'info-1', result: { response: {
      level: 78,
      refillable: [{ id: 2, amount: 10, lastRefill: 1793550000 }]
    } } }
  ], '2026-11-01T17:00:00.000Z');

  const upgradeSkill = record([
    { name: 'heroUpgradeSkill', args: { heroId: 60, skill: 3 }, ident: 'skill-up-1' }
  ], [
    { ident: 'skill-up-1', result: { response: null, quests: [] } }
  ], at);

  const extracted = cache.extract(upgradeSkill);
  assert.equal(extracted.some(e => e.key === 'resourceAction' && e.data.resourceKey === 'resource:refillable:2'), true);
  assert.equal(extracted.some(e => e.key === 'heroSkillAction' && e.data.heroId === 60 && e.data.skillIndex === 3), true);

  const state = cache.merge({}, [heroGetAll, upgradeSkill]).cache;
  assert.equal(state['resource:refillable:2'].data.amount, 9);
  // Skill index 3 corresponds to the 3rd sorted skill key ('352'), incremented from 50 to 51
  assert.equal(state.heroGetAll.data['60'].skills['352'], 51);
  assert.equal(state.heroGetAll.data['60'].skills['350'], 74);
});

test('chatGetAll extracts clan and announcement messages and merges deduplicated messages', () => {
  const at1 = '2026-11-01T13:00:00.000Z';
  const chatClan1 = record([
    { name: 'chatGetAll', ident: 'chat-1', args: { chatType: 'clan' } }
  ], [
    { ident: 'chat-1', result: { response: {
      messages: [
        { id: '101', userId: 'u1', messageType: 'text', chatType: 'clan', ctime: '1793530000', data: { text: 'Hello clan', clanRole: '3' } },
        { id: '100', userId: 'u2', messageType: 'text', chatType: 'clan', ctime: '1793529000', data: { text: 'Welcome', clanRole: '255' } }
      ],
      users: {
        u1: { id: 'u1', name: 'MemberBob', level: '70', clanRole: '3' },
        u2: { id: 'u2', name: 'LeaderAlice', level: '85', clanRole: '255' }
      }
    } } }
  ], at1);

  const entries = cache.extract(chatClan1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'guildChat');
  assert.equal(entries[0].data.messages.length, 2);

  const state1 = cache.merge({}, [chatClan1]).cache;
  assert.ok(state1.guildChat);
  assert.equal(state1.guildChat.data.messages.length, 2);
  assert.equal(state1.guildChat.data.users.u1.name, 'MemberBob');

  const at2 = '2026-11-01T13:05:00.000Z';
  const chatClan2 = record([
    { name: 'chatGetAll', ident: 'chat-2', args: { chatType: 'clan' } },
    { name: 'chatGetAll', ident: 'chat-ann', args: { chatType: 'announcement' } }
  ], [
    { ident: 'chat-2', result: { response: {
      messages: [
        { id: '102', userId: 'u3', messageType: 'text', chatType: 'clan', ctime: '1793531000', data: { text: 'Promo code: TEST', clanRole: '4' } },
        { id: '101', userId: 'u1', messageType: 'text', chatType: 'clan', ctime: '1793530000', data: { text: 'Hello clan', clanRole: '3' } }
      ],
      users: {
        u3: { id: 'u3', name: 'OfficerCharlie', level: '80', clanRole: '4' }
      }
    } } },
    { ident: 'chat-ann', result: { response: {
      messages: [
        { id: '999', userId: 'u2', messageType: 'text', chatType: 'announcement', ctime: '1793532000', data: { text: 'Guild War tonight', clanRole: '255' } }
      ],
      users: {}
    } } }
  ], at2);

  const state2 = cache.merge(state1, [chatClan2]).cache;
  assert.equal(state2.guildChat.data.messages.length, 4);
  assert.equal(state2.guildChat.data.messages[0].id, '999');
  assert.equal(state2.guildChat.data.messages[1].id, '102');
  assert.equal(state2.guildChat.data.users.u3.name, 'OfficerCharlie');
  assert.equal(state2.guildChat.data.users.u1.name, 'MemberBob');
});

test('claimChest in clanVersus extracts rewards and updates energy, resources, and chest status', () => {
  const at = '2026-11-02T04:16:11.131Z';
  const baseline = record([
    { name: 'userGetInfo', ident: 1 },
    { name: 'getInventory', feature: 'inventory', ident: 2 }
  ], [
    { ident: 1, result: { response: { level: 80, gold: 50000, refillable: [{ id: 1, amount: 80, lastRefill: Date.parse('2026-11-02T04:15:00.000Z') / 1000 }] } } },
    { ident: 2, result: { response: { inventory: { items: [
      { type: 'consumable', id: 20, quantity: 1000 },
      { type: 'consumable', id: 40228, quantity: 10 },
      { type: 'consumable', id: 40230, quantity: 5 }
    ] } } } }
  ], '2026-11-02T04:10:00.000Z');

  // Record from actual user log: claimChest 2 (doubles chest 1: energy +100, gold +60000, titan potion +500, hero trove +2, titan trove +2)
  const chest2Record = record([
    { name: 'claimChest', feature: 'clanVersus', ident: 'claim-2', args: { chestNumber: 2 } }
  ], [
    { ident: 'claim-2', result: { response: {} } }
  ], at);

  const extracted = cache.extract(chest2Record);
  assert.equal(extracted.some((e) => e.key === 'resourceAction' && e.data.resourceKey === 'resource:energy' && e.data.delta === 100), true);
  assert.equal(extracted.some((e) => e.key === 'resourceAction' && e.data.resourceKey === 'resource:gold' && e.data.delta === 60000), true);
  assert.equal(extracted.some((e) => e.key === 'resourceAction' && e.data.resourceKey === 'resource:consumable:20' && e.data.delta === 500), true);
  assert.equal(extracted.some((e) => e.key === 'resourceAction' && e.data.resourceKey === 'resource:consumable:40228' && e.data.delta === 2), true);
  assert.equal(extracted.some((e) => e.key === 'resourceAction' && e.data.resourceKey === 'resource:consumable:40230' && e.data.delta === 2), true);
  assert.equal(extracted.some((e) => e.key === 'clanVersusChestAction' && e.data.chestNumber === 2), true);

  // Merge with baseline
  const merged = cache.merge({}, [baseline, chest2Record]).cache;
  assert.equal(merged['resource:energy'].data.amount, 180);
  assert.equal(merged.energyStatus.data.energy, 180);
  assert.equal(merged['resource:gold'].data.amount, 110000);
  assert.equal(merged['resource:consumable:20'].data.amount, 1500);
  assert.equal(merged['resource:consumable:40228'].data.amount, 12);
  assert.equal(merged['resource:consumable:40230'].data.amount, 7);
  assert.deepEqual([...merged.clanVersusStatus.data.chestNumbers], [2]);

  // Idempotency: re-merging does not duplicate rewards
  const remerged = cache.merge(merged, [chest2Record]).cache;
  assert.equal(remerged['resource:energy'].data.amount, 180);
  assert.equal(remerged['resource:gold'].data.amount, 110000);

  // Test chest 3 (relic shard +1, energy +200, titan potion +1250, hero trove +3, titan trove +3, Honor marks +50)
  const chest3Record = record([
    { name: 'claimChest', feature: 'clanVersus', ident: 'claim-3', args: { chestNumber: 3 } }
  ], [
    { ident: 'claim-3', result: { response: {} } }
  ], '2026-11-02T04:17:00.000Z');

  const afterChest3 = cache.merge(merged, [chest3Record]).cache;
  assert.equal(afterChest3['resource:energy'].data.amount, 380);
  assert.equal(afterChest3['resource:patron:1'].data.amount, 1);
  assert.equal(afterChest3['resource:material:12'].data.amount, 50);
  assert.deepEqual([...afterChest3.clanVersusStatus.data.chestNumbers], [2, 3]);

  // Test getUserProgress merge with claimChest
  const progressRecord = record([
    { name: 'getUserProgress', feature: 'clanVersus', ident: 'prog-1' }
  ], [
    { ident: 'prog-1', result: { response: { progress: 45000, chestNumbers: [1] } } }
  ], '2026-11-02T04:00:00.000Z');

  const withProgress = cache.merge({}, [progressRecord, chest2Record]).cache;
  assert.deepEqual([...withProgress.clanVersusStatus.data.chestNumbers], [1, 2]);
  assert.equal(withProgress.clanVersusStatus.data.progress, 45000);
});

test('clanVersus multi-call extracts and merges info, battle, rewards, and progress into clanVersusStatus', () => {
  const at = '2026-11-02T04:37:00.000Z';
  const getInfoRecord = record([
    { name: 'getInfo', feature: 'clanVersus', ident: 'info-1', args: { clanId: 305081 } }
  ], [
    { ident: 'info-1', result: { response: {
      eventId: 18,
      battleId: 52,
      battleNumber: 4,
      roundNumber: 1,
      league: 58,
      numActiveUsers: 5,
      currentNumActiveUsers: 28,
      weeklyUserActivity: 2450,
      personalRequirementsIsSatisfied: true,
      guildRequirementsIsSatisfied: true,
      challenges: [{ id: 27, progress: 0 }, { id: 31, progress: 11 }]
    } } }
  ], at);

  const battleRecord = record([
    { name: 'getCurrentBattle', feature: 'clanVersus', ident: 'battle-1', args: { clanId: 305081 } },
    { name: 'getUserProgress', feature: 'clanVersus', ident: 'prog-1', args: {} },
    { name: 'getRewardList', feature: 'clanVersus', ident: 'reward-1', args: {} }
  ], [
    { ident: 'battle-1', result: { response: {
      league: 'bronze',
      clan: { id: 305081, name: '4-LEAF CLOVER', server: '1431' },
      enemyClan: { id: 100752873, name: 'Black', server: '1410' },
      clanBattleScore: 0,
      enemyClanBattleScore: 0,
      clanRoundPoints: 10145150,
      enemyClanRoundPoints: 657950,
      rounds: [
        { index: 1, theme: 'Radar Training', score: 1, points: 10145150, enemyPoints: 657950, status: 'inProgress' },
        { index: 2, theme: 'Radar Training', score: 2, points: 0, enemyPoints: 0, status: 'soon' }
      ]
    } } },
    { ident: 'prog-1', result: { response: {
      progress: { score: 123700 },
      chestNumbers: [1, 2]
    } } },
    { ident: 'reward-1', result: { response: {
      userRoundPoints: 123700,
      userBattlePoints: 123700,
      userSeasonPoints: 15345899,
      userClanRank: 14,
      seasonClanRank: 1
    } } }
  ], at);

  const merged = cache.merge({}, [getInfoRecord, battleRecord]).cache;
  const vs = merged.clanVersusStatus?.data;
  assert.ok(vs);
  assert.equal(vs.battle.clan.name, '4-LEAF CLOVER');
  assert.equal(vs.battle.enemyClan.name, 'Black');
  assert.equal(vs.info.battleNumber, 4);
  assert.equal(vs.info.currentNumActiveUsers, 28);
  assert.equal(vs.score, 123700);
  assert.deepEqual([...vs.chestNumbers], [1, 2]);
  assert.equal(vs.rewards.userClanRank, 14);
  assert.equal(vs.rewards.seasonClanRank, 1);
});

test('event RPCs extract questEvents, clanWarChampStatus, fortressEventStatus, clanClashStatus, and brawlStatus', () => {
  const at = '2026-11-02T04:37:00.000Z';
  const rec = record([
    { name: 'questGetEvents', ident: 'q-1', args: {} },
    { name: 'clanWarChampInfo_getBriefInfo', ident: 'cw-1', args: {} },
    { name: 'getEventInfo', feature: 'fortress', ident: 'f-1', args: {} },
    { name: 'clanClash_getCurrentState', ident: 'cc-1', args: {} },
    { name: 'brawl_getAll', ident: 'b-1', args: {} }
  ], [
    { ident: 'q-1', result: { response: [{ id: 90249, name_localeKey: 'ADVENTURE_HERO62_TITLE_EVENT_UPGRADE' }] } },
    { ident: 'cw-1', result: { response: { seasonId: 58, tries: 0, hasActiveWar: false } } },
    { ident: 'f-1', result: { response: { id: 12, startDate: 1793005200, endDate: 1797732000 } } },
    { ident: 'cc-1', result: { response: { clashEvent: { id: 17, cycleId: 1, lanes: [] } } } },
    { ident: 'b-1', result: { response: [{ brawlId: '72', wins: '0', power: '1105464' }] } }
  ], at);

  const merged = cache.merge({}, [rec]).cache;
  assert.equal(merged.questEvents?.data?.events?.length, 1);
  assert.equal(merged.clanWarChampStatus?.data?.seasonId, 58);
  assert.equal(merged.fortressEventStatus?.data?.id, 12);
  assert.equal(merged.clanClashStatus?.data?.clashEvent?.id, 17);
  assert.equal(merged.brawlStatus?.data?.brawls?.length, 1);
});

test('heroEvolve upgrades hero star and deducts fragments from inventory and resources', () => {
  const at = '2026-11-02T05:00:00.000Z';
  const heroGetAll = record([
    { name: 'heroGetAll', ident: 'heroes-1' },
    { name: 'inventoryGet', ident: 'inv-1' }
  ], [
    { ident: 'heroes-1', result: { response: {
      '76': { id: 76, star: 1, level: 30 },
      '55': { id: 55, star: 2, level: 50 }
    } } },
    { ident: 'inv-1', result: { response: {
      fragmentHero: { '76': 50, '55': 100 }
    } } }
  ], '2026-11-02T04:59:00.000Z');

  // Evolve Crow (hero 76) to 2 stars: requires 20 fragments
  const evolve76 = record([
    { name: 'heroEvolve', args: { heroId: 76 }, ident: 'evolve-76' }
  ], [
    { ident: 'evolve-76', result: { response: null } }
  ], at);

  const extracted = cache.extract(evolve76);
  assert.equal(extracted.some(e => e.key === 'heroEvolveAction' && e.data.heroId === 76), true);

  const baseWithRes = {
    ...cache.merge({}, [heroGetAll]).cache,
    'resource:fragmentHero:76': { data: { amount: 50 }, updatedAt: '2026-11-02T04:59:00.000Z' }
  };
  const state1 = cache.merge(baseWithRes, [evolve76]).cache;
  assert.equal(state1.heroGetAll.data['76'].star, 2);
  assert.equal(state1.inventoryGet.data.fragmentHero['76'], 30);
  assert.equal(state1['resource:fragmentHero:76'].data.amount, 30);

  // Evolve Mushy and Shroom (hero 55) to 3 stars: requires 50 fragments
  const evolve55 = record([
    { name: 'heroEvolve', args: { heroId: 55 }, ident: 'evolve-55' }
  ], [
    { ident: 'evolve-55', result: { response: null } }
  ], '2026-11-02T05:01:00.000Z');

  const state2 = cache.merge(state1, [evolve55]).cache;
  assert.equal(state2.heroGetAll.data['55'].star, 3);
  assert.equal(state2.inventoryGet.data.fragmentHero['55'], 50);

  // Re-applying same evolve action token is deduplicated
  const stateDuplicate = cache.merge(state2, [evolve55]);
  assert.equal(stateDuplicate.changed, false);
});

test('rally march transitions to returnToOutpost from battleReport and returnRoute RPCs', () => {
  const at = '2026-11-02T05:03:00.000Z';
  const waitUntil = 1793595700000;
  const initial = {
    marchStatus: {
      key: 'marchStatus',
      method: 'createRally',
      feature: 'mob',
      group: 'header',
      data: {
        marches: [{
          squadId: 'squad-1',
          kind: 'raid',
          stage: 'waitingForRallyStart',
          endsAt: waitUntil,
          rally: { id: 'rally-1', waitUntil, outboundMs: 30000, returnMs: 40000 }
        }]
      },
      updatedAt: at
    }
  };
  const marchBefore = initial.marchStatus.data.marches[0];
  assert.equal(marchBefore.stage, 'waitingForRallyStart');

  // Battle completes: getPage:report with rallyMobAttackResult
  const battleReportTime = waitUntil + 30000;
  const reportRecord = record([
    { name: 'getPage', feature: 'report', ident: 'rep-1' }
  ], [
    { ident: 'rep-1', result: { response: { reports: [
      { type: 'rallyMobAttackResult', createdAt: battleReportTime, payload: { mobConfigId: 10 } }
    ] } } }
  ], '2026-11-02T05:03:30.000Z');

  const battleExtracted = cache.extract(reportRecord);
  assert.equal(battleExtracted.some(e => e.key === 'rallyAction' && e.data.action === 'battleReport'), true);

  const afterReport = cache.merge(initial, [reportRecord]).cache;
  const marchAfterReport = afterReport.marchStatus.data.marches[0];
  assert.equal(marchAfterReport.stage, 'returnToOutpost');
  assert.equal(marchAfterReport.rally.arrivalAt, battleReportTime);
  assert.equal(marchAfterReport.rally.returnAt, battleReportTime + 40000);
  assert.equal(marchAfterReport.endsAt, battleReportTime + 40000);

  // Return route observed: getRoutesByIds:globalMap
  const returnRouteTime = battleReportTime + 100;
  const routeRecord = record([
    { name: 'getRoutesByIds', feature: 'globalMap', ident: 'route-1' }
  ], [
    { ident: 'route-1', result: { response: { routes: [
      { type: 'returnToOutpost', startedAt: returnRouteTime, durationMs: 38000 }
    ] } } }
  ], '2026-11-02T05:03:31.000Z');

  const routeExtracted = cache.extract(routeRecord);
  assert.equal(routeExtracted.some(e => e.key === 'rallyAction' && e.data.action === 'returnRoute'), true);

  const afterRoute = cache.merge(afterReport, [routeRecord]).cache;
  const marchAfterRoute = afterRoute.marchStatus.data.marches[0];
  assert.equal(marchAfterRoute.stage, 'returnToOutpost');
  assert.equal(marchAfterRoute.rally.returnAt, returnRouteTime + 38000);
  assert.equal(marchAfterRoute.endsAt, returnRouteTime + 38000);
});

test('dungeonEndBattle and dungeonSaveProgress extract status and merge rewards', () => {
  const battleRecord = record([
    { name: 'dungeonEndBattle', ident: 'd-battle-1' }
  ], [
    {
      ident: 'd-battle-1',
      result: {
        response: {
          dungeonActivity: 738,
          reward: {
            dungeonActivity: 12,
            consumable: { '20': 50 },
            fragmentTitan: { '4011': 2 }
          },
          dungeon: {
            floorNumber: 581,
            maxFloorPassed: 580,
            respawnFloor: 576,
            elements: { prime: 'earth', nonprime: ['water', 'fire'] },
            states: {
              titans: {
                '4000': { isDead: false, hp: 856926, maxHp: 856926, energy: 600 }
              }
            },
            floor: {
              userData: [
                { attackerType: 'fire', defenderType: 'earth', power: 10861, team: [{ id: 4024, level: 58, star: 2 }] }
              ]
            }
          }
        }
      }
    }
  ], '2026-11-02T05:27:00.000Z');

  const extracted = cache.extract(battleRecord);
  assert.equal(extracted.some((e) => e.key === 'dungeonStatus'), true);
  assert.equal(extracted.some((e) => e.key === 'dungeonRewardAction'), true);

  const initial = {
    'resource:consumable:20': { data: { amount: 100 } },
    'resource:fragmentTitan:4011': { data: { amount: 10 } },
    inventoryGet: {
      data: {
        consumable: { '20': 100 },
        fragmentTitan: { '4011': 10 }
      }
    }
  };

  const { cache: afterBattle } = cache.merge(initial, [battleRecord]);
  assert.equal(afterBattle.dungeonStatus.data.floorNumber, 581);
  assert.equal(afterBattle.dungeonStatus.data.maxFloorPassed, 580);
  assert.equal(afterBattle.dungeonStatus.data.dungeonActivity, 738);
  assert.equal(afterBattle['resource:consumable:20'].data.amount, 150);
  assert.equal(afterBattle.inventoryGet.data.consumable['20'], 150);
  assert.equal(afterBattle['resource:fragmentTitan:4011'].data.amount, 12);
  assert.equal(afterBattle.inventoryGet.data.fragmentTitan['4011'], 12);
  assert.equal(afterBattle.dungeonStatus.data.states.titans['4000'].hp, 856926);

  // Save progress checkpoint with gold reward
  const saveRecord = record([
    { name: 'dungeonSaveProgress', ident: 'd-save-1' }
  ], [
    {
      ident: 'd-save-1',
      result: {
        response: {
          reward: { gold: 49900 },
          dungeon: {
            respawnFloor: 581,
            maxFloorPassed: 580
          }
        }
      }
    }
  ], '2026-11-02T05:27:30.000Z');

  const saveExtracted = cache.extract(saveRecord);
  assert.equal(saveExtracted.some((e) => e.key === 'dungeonStatus'), true);
  assert.equal(saveExtracted.some((e) => e.key === 'dungeonRewardAction'), true);

  const { cache: afterSave } = cache.merge(afterBattle, [saveRecord]);
  assert.equal(afterSave.dungeonStatus.data.respawnFloor, 581);
  assert.equal(afterSave['resource:gold']?.data?.amount, 49900);
});

test('inventory_use spends titan potions and updates titan xp', () => {
  const useRecord = record([
    { name: 'inventory_use', ident: 'use-potions-1', args: { libId: 20, amount: 590, params: { unitId: 4052 } } }
  ], [
    {
      ident: 'use-potions-1',
      result: {
        response: {
          titanXp: { '4052': 590 }
        }
      }
    }
  ], '2026-11-02T05:28:00.000Z');

  const extracted = cache.extract(useRecord);
  assert.equal(extracted.some((e) => e.key === 'inventoryUseAction'), true);

  const initial = {
    'resource:consumable:20': { data: { amount: 800 } },
    inventoryGet: {
      data: {
        consumable: { '20': 800 }
      }
    },
    titanGetAll: {
      data: {
        '4052': { id: 4052, level: 30, xp: 100 }
      }
    }
  };

  const { cache: afterUse } = cache.merge(initial, [useRecord]);
  assert.equal(afterUse['resource:consumable:20'].data.amount, 210);
  assert.equal(afterUse.inventoryGet.data.consumable['20'], 210);
  assert.equal(afterUse.titanGetAll.data['4052'].xp, 690);
});
