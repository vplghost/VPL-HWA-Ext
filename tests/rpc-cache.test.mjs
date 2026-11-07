import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
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

function testWithTraces(name, files, run) {
  test(name, async (context) => {
    for (const file of files) {
      try { await access(new URL(`../temp/tracking-data/${file}`, import.meta.url)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        context.skip(`Optional private trace unavailable: ${file}`);
        return;
      }
    }
    await run(context);
  });
}

function record(calls, results, timestamp = '2026-11-01T09:18:28.248Z') {
  return {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results }), timestamp,
    requestBodyTruncated: false, responseBodyTruncated: false
  };
}

test('dashboard sources are retained from passive RPC responses', () => {
  const methods = [
    ['arenaGetAll', { arenaPlace: '12', grandPlace: '34' }],
    ['expeditionGet', [{ slotId: 1, attemptsLeft: 2 }]],
    ['dailyBonusGetInfo', { availableToday: true }],
    ['zeppelinGiftGet', { available: true }]
  ];
  const snapshot = record(
    methods.map(([name], index) => ({ name, ident: String(index), args: {} })),
    methods.map(([, response], index) => ({ ident: String(index), result: { response } })),
    '2026-11-06T10:00:00Z'
  );
  const state = cache.merge({}, [snapshot]).cache;
  for (const [name, response] of methods) {
    assert.equal(JSON.stringify(state[name]?.data), JSON.stringify(response));
    assert.equal(state[name]?.updatedAt, '2026-11-06T10:00:00Z');
  }
});

test('capacity evidence learns only successful own rally, auto-join and gathering squads and keeps max load per profile', () => {
  const heroes = Object.fromEntries([1, 2, 3, 4, 5, 6].map((id) => [id, { level: 30, star: 2, power: id }]));
  const initial = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes } };
  const squad = (count, last = 5) => ({ heroes: [1, 2, 3, 4, last].map((heroId) => ({ heroId })), units: [{ unitId: 7, count }] });
  const create = (count) => record([{ name: 'createRally', feature: 'mob', ident: 'create', args: {
    mapId: 'map', mobId: 'mob', squad: squad(count)
  } }], [{ ident: 'create', result: { response: { squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: 1793937000000 } } } }]);
  let state = cache.merge(initial, [create(4100), create(2000)]).cache;
  assert.equal(state.troopCapacityEvidence.data.length, 1);
  assert.equal(state.troopCapacityEvidence.data[0].total, 4100);
  const socket = { transport: 'websocket', direction: 'received', encoding: 'utf8',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', timestamp: '2026-11-01T09:19:00.000Z',
    payload: JSON.stringify({ result: { type: 'rallyUserAutojoined', body: { rallyId: 'auto', squad: {
      ...squad(4200), squadId: 'joined' } } } }) };
  state = cache.merge(state, [socket]).cache;
  assert.equal(state.troopCapacityEvidence.data[0].total, 4200);
  assert.equal(state.troopCapacityEvidence.data[0].source, 'rallyUserAutojoined');
  const gather = record([{ name: 'attackMine', feature: 'mine', ident: 'gather', args: {
    mapId: 'map', mineId: 'mine', squad: squad(4300, 6)
  } }], [{ ident: 'gather', result: { response: { squadId: 'gather-squad', route: { startedAt: 1, durationMs: 1000 } } } }], '2026-11-01T09:20:00.000Z');
  state = cache.merge(state, [gather]).cache;
  assert.equal(state.troopCapacityEvidence.data.length, 2);
  assert.equal(state.troopCapacityEvidence.data[0].total, 4300);
  const foreign = record([{ name: 'getRallyById', feature: 'rally', ident: 'foreign' }], [{ ident: 'foreign', result: {
    response: { rally: { rallyId: 'foreign', leader: { userId: 20, squad: squad(9000) }, members: [] } }
  } }], '2026-11-01T09:21:00.000Z');
  assert.equal(cache.merge(state, [foreign]).cache.troopCapacityEvidence.data.length, 2);
  const details = record([{ name: 'getRallyById', feature: 'rally', ident: 'own' }], [{ ident: 'own', result: {
    response: { rally: { rallyId: 'own', leader: { userId: 20, squad: squad(9000) },
      members: [{ userId: 10, squad: { ...squad(4400), squadId: 'member' } }] } }
  } }], '2026-11-01T09:22:00.000Z');
  state = cache.merge(state, [details]).cache;
  assert.equal(state.troopCapacityEvidence.data[0].total, 4400, 'own manual join details can update the observed load');
  const failed = create(9999); failed.responseBody = JSON.stringify({ results: [{ ident: 'create', result: { error: 'rejected' } }] });
  assert.equal(cache.merge(state, [failed]).cache.troopCapacityEvidence.data[0].total, 4400);
});

test('rally search retains map context and candidate boss IDs for the experimental tab', () => {
  const solo = record([{ name: 'searchMob', feature: 'mob', ident: 'solo', args: {
    mapId: 'map-1', mobConfigIds: [37], mobType: 'solo', center: { x: 100, y: 200 }
  } }], [{ ident: 'solo', result: { response: { mobs: [] } } }]);
  const rally = record([{ name: 'searchMob', feature: 'mob', ident: 'rally', args: {
    mapId: 'map-1', mobConfigIds: [60], mobType: 'rally', center: { x: 100, y: 200 }
  } }], [{ ident: 'rally', result: { response: { mobs: [
    { mobId: 'boss-1', coordinates: { x: 120, y: 210 } }
  ] } } }]);
  const first = cache.merge({}, [solo]).cache;
  const second = cache.merge(first, [rally]).cache;
  assert.equal(second.experimentalMapContext.data.mapId, 'map-1');
  assert.equal(second.experimentalSoloSearch.data.mapId, 'map-1');
  assert.deepEqual(Array.from(second.experimentalSoloSearch.data.mobConfigIds), [37]);
  assert.equal(second.experimentalRallySearch.data.mobs[0].mobId, 'boss-1');
  assert.equal(second.experimentalRallySearch.data.mobConfigIds[0], 60);
});

test('world map chunk supplies map ID and experimental actions record RPC errors', () => {
  const chunk = record([{ name: 'getChunks', feature: 'globalMap', ident: 'map',
    args: { mapId: 'map-1' } }], [{ ident: 'map', result: {
    response: { chunks: [{ mobs: [], mines: [] }] }
  } }]);
  const failed = record([{ name: 'createRally', feature: 'mob', ident: 'rally',
    args: { mapId: 'map-1', mobId: 'boss-1', startDelay: 300000 } }],
  [{ ident: 'rally', result: { error: { message: 'Squad unavailable' } } }],
  '2026-11-01T09:19:00.000Z');
  const first = cache.merge({}, [chunk]).cache;
  const second = cache.merge(first, [failed]).cache;
  assert.equal(first.experimentalMapContext.data.mapId, 'map-1');
  assert.equal(second.experimentalActionStatus.data.ok, false);
  assert.equal(second.experimentalActionStatus.data.error, 'Squad unavailable');
});

test('rally result retains bounded history after the march returns', () => {
  const timestamp = '2026-11-06T03:00:00.000Z';
  const socket = { transport: 'websocket', direction: 'received', encoding: 'utf8',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt', timestamp,
    payload: JSON.stringify({ result: { type: 'mobRallyAttackResult', body: {
      squadId: 'squad-1', rallyId: 'rally-1', mobConfigId: 60,
      battleResult: { battleResult: 'win' },
      routeToOutpost: { startedAt: Date.parse(timestamp), durationMs: 60000 }
    } } }) };
  const initial = { marchStatus: { updatedAt: '2026-11-06T02:59:59.000Z',
    data: { marches: [{ squadId: 'squad-1', kind: 'raid',
      rally: { id: 'rally-1', waitUntil: Date.parse(timestamp) - 120000,
        arrivalAt: Date.parse(timestamp) - 1000 } }] } } };
  const result = cache.merge(initial, [socket]).cache;
  assert.equal(result.experimentalRallyHistory.data[0].result, 'win');
  assert.equal(result.experimentalRallyHistory.data[0].waitUntil,
    Date.parse(timestamp) - 120000);
  assert.equal(result.experimentalRallyHistory.data[0].returnAt,
    Date.parse(timestamp) + 60000);
});

test('win removes only the correlated boss and a later search cannot restore it', () => {
  const at = (seconds) => new Date(Date.UTC(2026, 10, 6, 3, 0, seconds)).toISOString();
  const search = (time) => record([{ name: 'searchMob', feature: 'mob', ident: 'search', args: {
    mapId: 'map', mobConfigIds: [60], mobType: 'rally', center: { x: 1, y: 2 }
  } }], [{ ident: 'search', result: { response: { mobs: [{ mobId: 'won' }, { mobId: 'keep' }] } } }], time);
  const create = record([{ name: 'createRally', feature: 'mob', ident: 'create', args: {
    mapId: 'map', mobId: 'won', squad: { heroes: [], units: [] }
  } }], [{ ident: 'create', result: { response: { squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: Date.parse(at(30)) } } } }], at(1));
  const finish = (type, body, second) => ({ transport: 'websocket', direction: 'received', encoding: 'utf8',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    timestamp: at(second), payload: JSON.stringify({ result: { type, body } }) });
  const returned = finish('returnFromMobCompleted', { squadId: 'squad' }, 40);
  const win = finish('mobRallyAttackResult', { squadId: 'squad', rallyId: 'rally', battleResult: { battleResult: 'win' },
    routeToOutpost: { startedAt: Date.parse(at(30)), durationMs: 60000 } }, 41);
  const result = cache.merge({}, [search(at(0)), create, returned, win, search(at(42))]).cache;
  assert.deepEqual(Array.from(result.experimentalRallySearch.data.mobs, (mob) => mob.mobId), ['keep']);
  assert.equal(result.experimentalDefeatedBosses.data.length, 1);
  assert.equal(result.experimentalRallyHistory.data[0].mobId, 'won');
  assert.equal(result.marchStatus.data.marches.length, 0, 'late result must not resurrect a returned army');
  const loss = finish('mobRallyAttackResult', { squadId: 'other', rallyId: 'unrelated', battleResult: { battleResult: 'lose' },
    routeToOutpost: { startedAt: Date.parse(at(44)), durationMs: 60000 } }, 44);
  assert.deepEqual(Array.from(cache.merge(result, [loss]).cache.experimentalRallySearch.data.mobs, (mob) => mob.mobId), ['keep']);
});

test('solo monster attack tracks team, cost, loss report, and estimated return without touching other marches', () => {
  const startedAt = Date.parse('2026-11-05T05:00:08.000Z');
  const chunk = record([{ name: 'getChunks', feature: 'globalMap', ident: 'map' }],
    [{ ident: 'map', result: { response: { chunks: [{ mobs: [
      { mobId: 'target', mobType: 'solo', mobConfigId: 67 }
    ], mines: [] }] } } }], '2026-11-05T05:00:02.000Z');
  const attack = record([{ name: 'attackMob', feature: 'mob', ident: 'attack', args: {
    mobId: 'target', squad: { heroes: [{ heroId: 16 }, { heroId: 79 }],
      units: [{ unitId: 7, count: 100 }] }
  } }], [{ ident: 'attack', result: { response: { squadId: 'solo-squad',
    route: { routeId: 'outbound', startedAt, durationMs: 45000 } } } }],
  '2026-11-05T05:00:08.100Z');
  const base = { 'resource:world-energy': { key: 'resource:world-energy',
    updatedAt: '2026-11-05T05:00:00.000Z', data: { amount: 100, cap: 200 } },
  marchStatus: { key: 'marchStatus', updatedAt: '2026-11-05T05:00:00.000Z',
    data: { marches: [{ squadId: 'unrelated', kind: 'raid', stage: 'waitingForRallyStart' }] } } };
  const started = cache.merge(base, [chunk, attack, attack]).cache;
  assert.equal(started['resource:world-energy'].data.amount, 90);
  assert.equal(started.marchStatus.data.marches.length, 2);
  const solo = started.marchStatus.data.marches.find((march) => march.squadId === 'solo-squad');
  assert.equal(solo.mobConfigId, 67);
  assert.equal(solo.targetArrivalAt, startedAt + 45000);
  assert.deepEqual(Array.from(solo.team.heroIds), [16, 79]);
  const reportAt = startedAt + 45500;
  const report = record([{ name: 'getPage', feature: 'report', ident: 'report' }],
    [{ ident: 'report', result: { response: { reports: [
      { id: 'old', type: 'soloMobAttackResult', createdAt: startedAt - 60000,
        payload: { mobConfigId: 67, result: 'win' } },
      { id: 'loss', type: 'soloMobAttackResult', createdAt: reportAt,
        payload: { mobConfigId: 67, result: 'lose' } }
    ] } } }], '2026-11-05T05:00:55.000Z');
  const finished = cache.merge(started, [report, report]).cache;
  assert.equal(finished.soloAttackResults.data.length, 2);
  const returning = finished.marchStatus.data.marches.find((march) => march.squadId === 'solo-squad');
  assert.equal(returning.result, 'lose');
  assert.equal(returning.stage, 'returnToOutpost');
  assert.equal(returning.returnAt, reportAt + 45000);
  assert.equal(finished.marchStatus.data.marches.find((march) => march.squadId === 'unrelated').kind, 'raid');
  assert.equal(finished['resource:world-energy'].data.amount, 90);
  const actualReturnAt = reportAt + 41000;
  const route = record([{ name: 'getRoutesByIds', feature: 'globalMap', ident: 'route' }],
    [{ ident: 'route', result: { response: { routes: [{ type: 'returnToOutpost',
      from: { object: { objectType: 'soloMob', objectId: 'target' } },
      startedAt: reportAt, durationMs: 41000 }] } } }], '2026-11-05T05:00:56.000Z');
  const actual = cache.merge(finished, [route]).cache;
  assert.equal(actual.marchStatus.data.marches.find((march) => march.squadId === 'solo-squad').returnAt, actualReturnAt);
  assert.equal(actual.marchStatus.data.marches.find((march) => march.squadId === 'solo-squad').returnEstimated, false);
  const fresh = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 'fresh' }],
    [{ ident: 'fresh', result: { response: { refillables: [
      { refillableId: 2, amount: 95, lastRefillAt: Date.parse('2026-11-05T05:01:00.000Z') }
    ] } } }], '2026-11-05T05:01:00.000Z');
  assert.equal(cache.merge(actual, [fresh, attack]).cache['resource:world-energy'].data.amount, 95);
});

test('solo attack without World Energy baseline does not invent a zero balance', () => {
  const at = '2026-11-05T05:00:08.100Z';
  const attack = record([{ name: 'attackMob', feature: 'mob', ident: 'attack', args: {
    mobId: 'target', squad: { heroes: [{ heroId: 16 }] }
  } }], [{ ident: 'attack', result: { response: { squadId: 'squad',
    route: { routeId: 'outbound', startedAt: Date.parse(at), durationMs: 45000 } } } }], at);
  const result = cache.merge({}, [attack]).cache;
  assert.equal(result['resource:world-energy'], undefined);
  assert.equal(result.marchStatus.data.marches.length, 1);
});

test('failed solo attack RPC is logged without creating a march or spending energy', () => {
  const failed = record([{ name: 'attackMob', feature: 'mob', ident: 'bad', args: {
    mobId: 'target'
  } }], [{ ident: 'bad', result: { error: { code: 'NO_ENERGY' } } }],
  '2026-11-05T05:00:08.100Z');
  const result = cache.merge({}, [failed, failed]).cache;
  assert.equal(result.soloAttackResults.data.length, 1);
  assert.equal(result.soloAttackResults.data[0].result, 'request_failed');
  assert.equal(result.marchStatus, undefined);
  assert.equal(result['resource:world-energy'], undefined);
});

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

testWithTraces('skin upgrade trace advances known skin levels once and accepts later hero and stone snapshots', ['hwa-api-202611032318_hero_skin_stone.json'], async () => {
  const trace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611032318_hero_skin_stone.json', import.meta.url), 'utf8'));
  const initial = record([
    { name: 'heroGetAll', ident: 'heroes' }, { name: 'inventoryGet', ident: 'items' }
  ], [
    { ident: 'heroes', result: { response: {
      501: { id: 501, power: 1000, skins: { 1002: 20 } },
      60: { id: 60, power: 900, skins: { 303: 4 } }
    } } },
    { ident: 'items', result: { response: { coin: { 8: 500, 9: 300, 10: 200 } } } }
  ], '2026-11-03T16:17:00.000Z');
  const actions = cache.extract(trace[0]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].key, 'skinUpgradeAction');
  assert.equal(actions[0].data.heroId, 501);

  const upgraded = cache.merge({}, [initial, ...trace, trace[0]]).cache;
  assert.equal(upgraded.heroGetAll.data[501].skins[1002], 30);
  assert.equal(upgraded.heroGetAll.data[60].skins[303], 5);
  assert.equal(upgraded.inventoryGet.data.coin[8], 500);
  assert.equal(upgraded.heroGetAll.data[501].power, 1000);
  assert.equal(Object.keys(upgraded.resourceActionHistory.data).length, 11);

  const fresh = record([
    { name: 'heroGetAll', ident: 'heroes-new' }, { name: 'inventoryGet', ident: 'items-new' }
  ], [
    { ident: 'heroes-new', result: { response: {
      501: { id: 501, power: 1150, skins: { 1002: 30 } },
      60: { id: 60, power: 930, skins: { 303: 5 } }
    } } },
    { ident: 'items-new', result: { response: { coin: { 8: 250, 9: 300, 10: 180 } } } }
  ], '2026-11-03T16:18:10.000Z');
  const reconciled = cache.merge(upgraded, [fresh, ...trace]).cache;
  assert.equal(reconciled.heroGetAll.data[501].power, 1150);
  assert.equal(reconciled.heroGetAll.data[501].skins[1002], 30);
  assert.equal(reconciled.inventoryGet.data.coin[8], 250);
  assert.equal(reconciled['resource:coin:8'].data.amount, 250);
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

test('titanEvolve upgrades titan star, deducts fragments, and syncs consumable balance', () => {
  const at = '2026-11-02T06:09:00.000Z';
  const titanGetAll = record([
    { name: 'titanGetAll', ident: 'titans-1' },
    { name: 'inventoryGet', ident: 'inv-1' }
  ], [
    { ident: 'titans-1', result: { response: {
      '4004': { id: 4004, star: 1, level: 30 }
    } } },
    { ident: 'inv-1', result: { response: {
      fragmentTitan: { '4004': 80 },
      consumable: { '24': 1100 }
    } } }
  ], '2026-11-02T06:08:00.000Z');

  // Evolve Tydus (titan 4004) to 2 stars: requires 50 fragments, returns consumable 24 balance 1078
  const evolve4004 = record([
    { name: 'titanEvolve', args: { titanId: 4004 }, ident: 'evolve-4004' }
  ], [
    { ident: 'evolve-4004', result: { response: { consumable: { '24': 1078 } } } }
  ], at);

  const extracted = cache.extract(evolve4004);
  assert.equal(extracted.some(e => e.key === 'titanEvolveAction' && e.data.titanId === 4004), true);

  const baseWithRes = {
    ...cache.merge({}, [titanGetAll]).cache,
    'resource:fragmentTitan:4004': { data: { amount: 80 }, updatedAt: '2026-11-02T06:08:00.000Z' },
    'resource:consumable:24': { data: { amount: 1100 }, updatedAt: '2026-11-02T06:08:00.000Z' }
  };

  const state1 = cache.merge(baseWithRes, [evolve4004]).cache;
  assert.equal(state1.titanGetAll.data['4004'].star, 2);
  assert.equal(state1.inventoryGet.data.fragmentTitan['4004'], 30); // 80 - 50 = 30
  assert.equal(state1['resource:fragmentTitan:4004'].data.amount, 30);
  assert.equal(state1.inventoryGet.data.consumable['24'], 1078);
  assert.equal(state1['resource:consumable:24'].data.amount, 1078);

  // Deduplication check
  const stateDuplicate = cache.merge(state1, [evolve4004]);
  assert.equal(stateDuplicate.changed, false);
});

test('rally march transitions to returnToOutpost from battleReport and returnRoute RPCs', () => {
  const at = '2026-11-02T05:03:00.000Z';
  const waitUntil = 1793595700000;
  const initial = {
    accountStatus: { data: { id: 10 } },
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
          rally: { id: 'rally-1', mobId: 'mob-1', waitUntil, outboundMs: 30000, returnMs: 40000 }
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
      { type: 'rallyMobAttackResult', createdAt: battleReportTime, payload: { rallyId: 'rally-1', mobConfigId: 10 } }
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
      { type: 'returnToOutpost', routeId: 'route-own', leader: { userId: 10 },
        from: { object: { objectType: 'rallyMob', objectId: 'mob-1' } }, startedAt: returnRouteTime, durationMs: 38000 }
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

test('rally routes and reports leave simultaneous unrelated rallies unchanged', () => {
  const initial = { accountStatus: { data: { id: 10 } }, marchStatus: { updatedAt: '2026-11-06T10:00:00.000Z',
    data: { marches: ['a', 'b'].map((id) => ({ squadId: `squad-${id}`, routeId: `route-${id}`, kind: 'raid',
      stage: 'moveToTargetInRally', endsAt: 900, rally: { id: `rally-${id}`, mobId: `boss-${id}`, returnMs: 100 } })) } } };
  const routes = record([{ name: 'getRoutesByIds', feature: 'globalMap', ident: 'routes' }], [{ ident: 'routes', result: { response: { routes: [
    { routeId: 'route-foreign', type: 'returnToOutpost', leader: { userId: 11 },
      from: { object: { objectType: 'rallyMob', objectId: 'boss-b' } }, startedAt: 1000, durationMs: 9999 },
    { routeId: 'return-own', type: 'returnToOutpost', leader: { userId: 10 },
      from: { object: { objectType: 'rallyMob', objectId: 'boss-a' } }, startedAt: 1000, durationMs: 50 }
  ] } } }], '2026-11-06T10:01:00.000Z');
  const next = cache.merge(initial, [routes]).cache;
  assert.equal(next.marchStatus.data.marches[0].endsAt, 1050);
  assert.deepEqual(next.marchStatus.data.marches[1], initial.marchStatus.data.marches[1]);
  const laterRally = JSON.parse(JSON.stringify(initial));
  laterRally.marchStatus.data.marches[0].rally.waitUntil = 2000;
  assert.deepEqual(cache.merge(laterRally, [routes]).cache.marchStatus, laterRally.marchStatus,
    'old returns from the same boss must not attach to a newer waiting rally');
  const report = (payload) => record([{ name: 'getPage', feature: 'report', ident: 'rep' }], [{ ident: 'rep', result: { response: {
    reports: [{ id: 'report', type: 'rallyMobAttackResult', createdAt: 2000, payload }]
  } } }], '2026-11-06T10:02:00.000Z');
  const unknown = cache.merge(next, [report({ mobConfigId: 79, result: 'win' })]).cache;
  assert.deepEqual(unknown.marchStatus, next.marchStatus, 'boss level alone is not instance identity');
  const matched = cache.merge(next, [report({ squadId: 'squad-b', result: 'win' })]).cache;
  assert.equal(matched.marchStatus.data.marches[1].rally.arrivalAt, 2000);
  assert.deepEqual(matched.marchStatus.data.marches[0], next.marchStatus.data.marches[0]);
  const anonymous = { ...initial, marchStatus: { ...initial.marchStatus, data: { marches: [initial.marchStatus.data.marches[0]] } } };
  assert.deepEqual(cache.merge(anonymous, [report({ mobConfigId: 79 })]).cache.marchStatus, anonymous.marchStatus);
});

test('rally route identity survives snapshots and ambiguous shared target routes are ignored', () => {
  const at = '2026-11-06T10:00:00.000Z';
  const initial = { marchStatus: { updatedAt: at, data: { marches: [{ squadId: 'squad', kind: 'raid',
    rally: { id: 'rally', mobId: 'boss' }, stage: 'moveToTargetInRally' }] } } };
  const snapshot = record([{ name: 'getMarches', feature: 'march', ident: 'march' }], [{ ident: 'march', result: { response: {
    marches: { returnToOutpost: [{ squadId: 'squad', route: { routeId: 'return-route', startedAt: 1000, durationMs: 100 } }] }
  } } }], at);
  const stored = cache.merge(initial, [snapshot]).cache;
  assert.equal(stored.marchStatus.data.marches[0].routeId, 'return-route');
  const route = record([{ name: 'getRoutesByIds', feature: 'globalMap', ident: 'route' }], [{ ident: 'route', result: { response: {
    routes: [{ routeId: 'return-route', type: 'returnToOutpost', startedAt: 1000, durationMs: 200 }]
  } } }], '2026-11-06T10:01:00.000Z');
  assert.equal(cache.merge(stored, [route]).cache.marchStatus.data.marches[0].endsAt, 1200);
  const ambiguous = { accountStatus: { data: { id: 10 } }, marchStatus: { updatedAt: at, data: { marches: [
    { squadId: 'a', rally: { id: 'a', mobId: 'boss' } }, { squadId: 'b', rally: { id: 'b', mobId: 'boss' } }
  ] } } };
  const shared = JSON.parse(JSON.stringify(route));
  shared.responseBody = JSON.stringify({ results: [{ ident: 'route', result: { response: { routes: [{ routeId: 'new', type: 'returnToOutpost',
    leader: { userId: 10 }, from: { object: { objectType: 'rallyMob', objectId: 'boss' } }, startedAt: 1000, durationMs: 200 }] } } }] });
  assert.deepEqual(cache.merge(ambiguous, [shared]).cache.marchStatus, ambiguous.marchStatus);
});

test('rally ownership never relies on a hardcoded account or a matching display name', () => {
  const details = (leader, members = []) => record([{ name: 'getRallyById', feature: 'rally', ident: 'r' }], [{ ident: 'r', result: { response: {
    rally: { rallyId: 'rally', leader, members, plannedStartTime: 9999999999999 }
  } } }], '2026-11-06T10:00:00.000Z');
  const leader = { userId: 1216438103, user: { name: 'VplGhost' }, squad: { squadId: 'leader', heroes: [{ heroId: 1 }], units: [] } };
  assert.equal(cache.merge({}, [details(leader)]).cache.marchStatus?.data?.marches?.length || 0, 0);
  assert.equal(cache.merge({ accountStatus: { data: { id: 10, name: 'VplGhost' } } }, [details(leader)]).cache.marchStatus?.data?.marches?.length || 0, 0);
  const own = { squadId: 'own', rally: { id: 'rally', isAutoJoin: true, team: { heroIds: [2], units: [] } } };
  const existing = { marchStatus: { updatedAt: '2026-11-06T09:59:00.000Z', data: { marches: [own] } } };
  const enriched = cache.merge(existing, [details(leader)]).cache.marchStatus.data.marches[0];
  assert.deepEqual(Array.from(enriched.rally.team.heroIds), [2]);
  assert.equal(enriched.rally.isAutoJoin, true);
  const joined = cache.merge(existing, [details(leader, [{ userId: 20, squad: { squadId: 'own', heroes: [{ heroId: 3 }], units: [] } }])]).cache;
  assert.deepEqual(Array.from(joined.marchStatus.data.marches[0].rally.team.heroIds), [3], 'known own squad is positive evidence when account snapshot is absent');
  const sameTime = { marchStatus: { updatedAt: '2026-11-06T10:00:00.000Z', data: { marches: [{ squadId: 'leader', kind: 'raid' }] } } };
  const sameBatch = cache.merge(sameTime, [details(leader)]).cache;
  assert.equal(sameBatch.marchStatus.data.marches[0].rally.id, 'rally', 'same-timestamp details must enrich a preceding march snapshot');
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

test('magicTower_briefInfo and magicTower_getAll extract towerStatus with isCleared state', () => {
  const briefRecord = record([
    { name: 'magicTower_briefInfo', ident: 'tower-1' }
  ], [
    {
      ident: 'tower-1',
      result: {
        response: {
          state: 'win',
          deadHeroesCount: 0
        }
      }
    }
  ], '2026-11-02T11:37:00.000Z');

  const extracted = cache.extract(briefRecord);
  const towerEntry = extracted.find((e) => e.key === 'towerStatus');
  assert.ok(towerEntry);
  assert.equal(towerEntry.data.state, 'win');
  assert.equal(towerEntry.data.isCleared, true);
  assert.equal(towerEntry.data.floorNumber, 26);

  const merged = cache.merge({}, [briefRecord]);
  assert.equal(merged.cache.towerStatus.data.isCleared, true);
  assert.equal(merged.cache.towerStatus.data.state, 'win');

  const inProgressRecord = record([
    { name: 'magicTower_getAll', ident: 'tower-2' }
  ], [
    {
      ident: 'tower-2',
      result: {
        response: {
          floorData: { floorNumber: 12 },
          state: 'battle'
        }
      }
    }
  ], '2026-11-02T11:38:00.000Z');

  const inProgressExtracted = cache.extract(inProgressRecord);
  const inProgressEntry = inProgressExtracted.find((e) => e.key === 'towerStatus');
  assert.ok(inProgressEntry);
  assert.equal(inProgressEntry.data.isCleared, false);
  assert.equal(inProgressEntry.data.floorNumber, 12);
});

test('openLootboxChanced deducts spent boxes and merges reward coins, consumables, and hero fragments', () => {
  const openRecord = record([
    { name: 'openLootboxChanced', ident: 'open-box-1', args: { lootBoxId: 26, amount: 63, reward: [] } }
  ], [
    {
      ident: 'open-box-1',
      result: {
        response: {
          reward: [
            { type: 'coin', id: 20, amount: 1755 },
            { type: 'consumable', id: 20, amount: 9800 },
            { type: 'fragmentHero', id: 72, amount: 20 }
          ]
        }
      }
    }
  ], '2026-11-02T09:58:15.000Z');

  const extracted = cache.extract(openRecord);
  const action = extracted.find((e) => e.key === 'chestOpenAction');
  assert.ok(action);
  assert.equal(action.data.boxType, 'lootboxChanced');
  assert.equal(action.data.boxId, '26');
  assert.equal(action.data.amount, 63);
  assert.equal(action.data.rewards.length, 3);

  const initial = {
    inventoryGet: {
      data: {
        lootboxChanced: { '26': 100 },
        coin: { '20': 500 },
        consumable: { '20': 200 },
        fragmentHero: { '72': 10 }
      }
    },
    'resource:lootboxChanced:26': { data: { amount: 100 } },
    'resource:coin:20': { data: { amount: 500, label: 'Titan Skin Stone' } },
    'resource:consumable:20': { data: { amount: 200, label: 'Titan potion' } }
  };

  const { cache: afterOpen } = cache.merge(initial, [openRecord]);
  assert.equal(afterOpen.inventoryGet.data.lootboxChanced['26'], 37);
  assert.equal(afterOpen['resource:lootboxChanced:26'].data.amount, 37);
  assert.equal(afterOpen.inventoryGet.data.coin['20'], 2255);
  assert.equal(afterOpen['resource:coin:20'].data.amount, 2255);
  assert.equal(afterOpen.inventoryGet.data.consumable['20'], 10000);
  assert.equal(afterOpen['resource:consumable:20'].data.amount, 10000);
  assert.equal(afterOpen.inventoryGet.data.fragmentHero['72'], 30);
});

test('inventory_use with chest opening deducts spent consumable chests and merges multi-item rewards', () => {
  const useChestRecord = record([
    { name: 'inventory_use', ident: 'use-chest-1', args: { libId: 15, amount: 2, params: { choice: -1 } } }
  ], [
    {
      ident: 'use-chest-1',
      result: {
        response: [
          { consumable: { '10': 2 } },
          { fragmentGear: { '61': 1 } },
          { gear: { '21': 1 } }
        ]
      }
    }
  ], '2026-11-02T09:58:24.000Z');

  const extracted = cache.extract(useChestRecord);
  const action = extracted.find((e) => e.key === 'chestOpenAction');
  assert.ok(action);
  assert.equal(action.data.boxType, 'consumable');
  assert.equal(action.data.boxId, '15');
  assert.equal(action.data.amount, 2);
  assert.equal(action.data.rewards.length, 3);

  const initial = {
    inventoryGet: {
      data: {
        consumable: { '15': 5, '10': 1 },
        fragmentGear: { '61': 3 },
        gear: {}
      }
    },
    'resource:consumable:15': { data: { amount: 5 } },
    'resource:consumable:10': { data: { amount: 1 } }
  };

  const { cache: afterUse } = cache.merge(initial, [useChestRecord]);
  assert.equal(afterUse.inventoryGet.data.consumable['15'], 3);
  assert.equal(afterUse['resource:consumable:15'].data.amount, 3);
  assert.equal(afterUse.inventoryGet.data.consumable['10'], 3);
  assert.equal(afterUse['resource:consumable:10'].data.amount, 3);
  assert.equal(afterUse.inventoryGet.data.fragmentGear['61'], 4);
  assert.equal(afterUse.inventoryGet.data.gear['21'], 1);
});

test('attackMine registers active gathering march and stopMineGathering transitions to returnToOutpost with route ETA', () => {
  const at = '2026-11-02T12:03:45.000Z';
  const searchRecord = record([
    {
      name: 'searchMine',
      feature: 'mine',
      ident: 'search-1',
      args: { mineConfigIds: [23] }
    }
  ], [
    {
      ident: 'search-1',
      result: {
        response: {
          mines: [{ mineId: 'mine-wood-1', coordinates: { x: 527, y: 214 } }]
        }
      }
    }
  ], at);

  const attackRecord = record([
    {
      name: 'attackMine',
      feature: 'mine',
      ident: 'attack-1',
      args: {
        mineId: 'mine-wood-1',
        battleType: 'pve',
        squad: {
          heroes: [{ heroId: 8 }],
          units: [{ unitId: 7, count: 500 }]
        }
      }
    }
  ], [
    {
      ident: 'attack-1',
      result: {
        response: {
          squadId: 'squad-gather-1',
          route: {
            startedAt: 1793621039000,
            durationMs: 50000
          }
        }
      }
    }
  ], '2026-11-02T12:03:59.000Z');

  const stopRecord = record([
    {
      name: 'stopMineGathering',
      feature: 'mine',
      ident: 'stop-1',
      args: { squadId: 'squad-gather-1' }
    }
  ], [
    {
      ident: 'stop-1',
      result: {
        response: {
          squadId: 'squad-gather-1',
          remainingResourceAmount: 500000,
          route: {
            startedAt: 1793621071000,
            durationMs: 120000
          }
        }
      }
    }
  ], '2026-11-02T12:04:31.000Z');

  // Step 1: extract searchMine
  const searchExtracted = cache.extract(searchRecord);
  const mineMapAction = searchExtracted.find((entry) => entry.key === 'mineMapAction');
  assert.equal(mineMapAction.data.mines['mine-wood-1'].mineType, 'wood');
  assert.equal(searchExtracted.find((entry) => entry.key === 'experimentalMineSearch').data.mines[0].mineId,
    'mine-wood-1');

  // Step 2: merge searchMine and attackMine
  const afterAttack = cache.merge({}, [searchRecord, attackRecord]).cache;
  assert.ok(afterAttack.marchStatus);
  const marches = afterAttack.marchStatus.data.marches;
  assert.equal(marches.length, 1);
  const march = marches[0];
  assert.equal(march.squadId, 'squad-gather-1');
  assert.equal(march.mineId, 'mine-wood-1');
  assert.equal(march.kind, 'wood');
  assert.equal(march.stage, 'moveToTargetInSolo');
  assert.equal(march.endsAt, 1793621039000 + 50000);
  assert.equal(march.targetArrivalAt, 1793621039000 + 50000);
  assert.deepEqual(Array.from(march.team.heroIds), [8]);

  // Step 3: merge stopMineGathering
  const afterStop = cache.merge(afterAttack, [stopRecord]).cache;
  const marchesAfterStop = afterStop.marchStatus.data.marches;
  assert.equal(marchesAfterStop.length, 1);
  const returning = marchesAfterStop[0];
  assert.equal(returning.squadId, 'squad-gather-1');
  assert.equal(returning.kind, 'return');
  assert.equal(returning.stage, 'returnToOutpost');
  assert.equal(returning.previousKind, 'wood');
  assert.equal(returning.endsAt, 1793621071000 + 120000);
  assert.equal(returning.returnAt, 1793621071000 + 120000);
  assert.equal(returning.remainingResourceAmount, 500000);
});

testWithTraces('replaying captured gathering and return traces produces coherent marchStatus transitions', ['hwa-api-202611021904_gathering.json', 'hwa-api-202611021904_gathering_return.json'], async () => {
  const gatherTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611021904_gathering.json', import.meta.url), 'utf8'));
  const returnTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611021904_gathering_return.json', import.meta.url), 'utf8'));

  const afterGather = cache.merge({}, gatherTrace).cache;
  assert.ok(afterGather.marchStatus?.data?.marches);
  assert.equal(afterGather.marchStatus.data.marches.length, 1);
  const gatherMarch = afterGather.marchStatus.data.marches[0];
  assert.equal(gatherMarch.squadId, '9252f22b-f3b6-4156-9d78-4dcf72e7d14c');
  assert.equal(gatherMarch.kind, 'wood');
  assert.equal(gatherMarch.stage, 'moveToTargetInSolo');
  assert.equal(gatherMarch.targetArrivalAt, 1793621039068 + 51030);

  const afterReturn = cache.merge(afterGather, returnTrace).cache;
  const marches = afterReturn.marchStatus.data.marches;
  assert.equal(marches.length, 2);
  const returningMarch = marches.find((m) => m.squadId === 'f6b8b5ef-3147-462e-b524-b8a279831d57');
  assert.ok(returningMarch);
  assert.equal(returningMarch.kind, 'return');
  assert.equal(returningMarch.stage, 'returnToOutpost');
  assert.equal(returningMarch.returnAt, 1793621071226 + 126008);
  assert.equal(returningMarch.endsAt, 1793621071226 + 126008);
});

test('getPage:report extracts mailStatus and detects unclaimed rewards', () => {
  const repRecord = record([
    { name: 'getPage', feature: 'report', ident: 'rep-test' }
  ], [
    { ident: 'rep-test', result: { response: { reports: [
      { id: 'rep-1', type: 'rallyMobAttackResult', read: false, claimedReward: false, createdAt: 1793623635307 },
      { id: 'rep-2', type: 'rallyMobAttackResult', read: true, claimedReward: true, createdAt: 1793623445151 }
    ] } } }
  ], '2026-11-02T12:00:00.000Z');

  const extracted = cache.extract(repRecord);
  const mailEntry = extracted.find((e) => e.key === 'mailStatus');
  assert.ok(mailEntry);
  assert.equal(mailEntry.data.unclaimedReportsCount, 1);
  assert.equal(mailEntry.data.hasUnclaimedReports, true);

  const merged = cache.merge({}, [repRecord]).cache;
  assert.ok(merged.mailStatus);
  assert.equal(merged.mailStatus.data.unclaimedReportsCount, 1);
  assert.equal(merged.mailStatus.data.hasUnclaimed, true);

  const claimRecord = record([{ name: 'readAndClaimAll', ident: 'claim-1' }], [
    { ident: 'claim-1', result: { response: { claimedRewards: [] } } }
  ], '2026-11-02T12:01:00.000Z');

  const afterClaim = cache.merge(merged, [claimRecord]).cache;
  assert.equal(afterClaim.mailStatus.data.hasUnclaimed, false);
  assert.equal(afterClaim.mailStatus.data.unclaimedReportsCount, 0);
});

testWithTraces('replaying rally success trace captures unclaimed battle reports', ['hwa-api-202611021947_rally_success.json'], async () => {
  const rallyTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611021947_rally_success.json', import.meta.url), 'utf8'));
  const merged = cache.merge({}, rallyTrace).cache;
  assert.ok(merged.mailStatus);
  assert.equal(merged.mailStatus.data.hasUnclaimed, true);
  assert.equal(merged.mailStatus.data.unclaimedReportsCount, 2);
});

testWithTraces('replaying quest claim trace updates Energy and World Energy', ['hwa-api-202611022008_claim_quests_rewards.json'], async () => {
  const questTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611022008_claim_quests_rewards.json', import.meta.url), 'utf8'));
  const merged = cache.merge({}, questTrace).cache;
  assert.ok(merged['resource:energy']);
  assert.equal(merged.energyStatus.data.energy, 89);
  assert.equal(merged['resource:energy'].data.amount, 89);
  assert.ok(merged['resource:world-energy']);
  assert.equal(merged.worldEnergyStatus.data.energy, 106);
  assert.equal(merged['resource:world-energy'].data.amount, 106);
});

testWithTraces('completeQuest records an event claim and only applies a known reward', ['hwa-api-202611032155_event_claim.json'], async () => {
  const eventTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611032155_event_claim.json', import.meta.url), 'utf8'));
  const unknown = cache.merge({}, eventTrace).cache;
  assert.equal(unknown.questClaimStatus.data.claims[0].id, 14360);
  assert.equal(unknown.questClaimStatus.data.claims[0].needsSync, true);
  assert.equal(Object.keys(unknown).some((key) => key.startsWith('resource:')), false);

  const withQuest = {
    questGetAll: { key: 'questGetAll', data: [{ id: 14360, reward: { consumable: { 100: 2 } } }],
      updatedAt: '2026-11-03T14:54:00.000Z' },
    'resource:consumable:100': { key: 'resource:consumable:100',
      data: { amount: 3, label: 'Consumable #100' }, updatedAt: '2026-11-03T14:54:00.000Z' }
  };
  const claimed = cache.merge(withQuest, eventTrace).cache;
  assert.equal(claimed['resource:consumable:100'].data.amount, 5);
  assert.equal(cache.merge(claimed, eventTrace).cache['resource:consumable:100'].data.amount, 5);
});

testWithTraces('event claim trace refreshes Balance Sigils and retains every inventory group', ['hwa-api-202611032321_claim_event.json'], async () => {
  const trace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611032321_claim_event.json', import.meta.url), 'utf8'));
  const merged = cache.merge({}, trace).cache;
  const inventory = JSON.parse(trace[1].responseBody).results[1].result.response;
  assert.equal(merged.questClaimStatus.data.claims[0].id, 14066);
  assert.equal(merged.inventoryGet.data.coin['40216'], 11050);
  assert.equal(merged['resource:coin:40216'].data.amount, 11050);
  assert.deepEqual(Object.keys(merged.inventoryGet.data).sort(), Object.keys(inventory).sort());
  assert.equal(merged.inventoryGet.data.fragmentSkin['1004'], 1);
  assert.equal(merged.inventoryGet.data.patron['57'], 30);
});

test('rally details enrich an existing squad without adding a duplicate march', () => {
  const at = '2026-11-03T14:17:51.731Z';
  const squadId = 'same-squad';
  const initial = { marchStatus: { key: 'marchStatus', updatedAt: at,
    data: { marches: [{ squadId, kind: 'raid', stage: 'moveToRallyLeader', endsAt: Date.parse(at) + 30000 }] } },
    accountStatus: { data: { id: '123' } } };
  const details = record([{ name: 'getRallyById', feature: 'rally', ident: 'details' }],
    [{ ident: 'details', result: { response: { rally: {
      rallyId: 'rally-1', plannedStartTime: Date.parse(at) + 60000,
      leader: { userId: '999', user: { name: 'Leader' } },
      members: [{ userId: '123', squad: { squadId, heroes: [{ heroId: 4 }] } }],
      target: { objectConfigId: 79 }
    } } } }], '2026-11-03T14:17:52.000Z');
  const merged = cache.merge(initial, [details]).cache;
  assert.equal(merged.marchStatus.data.marches.length, 1);
  assert.equal(merged.marchStatus.data.marches[0].rally.id, 'rally-1');
});

testWithTraces('replaying mail claim trace clears unclaimed reports and updates resources', ['hwa-api-202611021947_rally_success.json', 'hwa-api-202611022011_mail_claim.json'], async () => {
  const rallyTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611021947_rally_success.json', import.meta.url), 'utf8'));
  const initCache = cache.merge({}, rallyTrace).cache;
  assert.equal(initCache.mailStatus.data.hasUnclaimed, true);
  assert.equal(initCache.mailStatus.data.unclaimedReportsCount, 2);

  const mailClaimTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611022011_mail_claim.json', import.meta.url), 'utf8'));
  const afterClaim = cache.merge(initCache, mailClaimTrace).cache;
  assert.equal(afterClaim.mailStatus.data.hasUnclaimed, false);
  assert.equal(afterClaim.mailStatus.data.unclaimedReportsCount, 0);
  assert.equal(afterClaim.mailStatus.data.reports.every(r => r.claimedReward === true), true);
  assert.ok(afterClaim['resource:gold']);
  assert.ok(afterClaim['resource:material:5']);
  assert.ok(afterClaim['resource:consumable:11']);
});

test('paginated getPage:report preserves unclaimed reports across pages without flashing off', () => {
  const page1 = record([
    { name: 'getPage', feature: 'report', ident: 'p1', args: { limit: 10, cursor: null } }
  ], [
    { ident: 'p1', result: { response: { reports: [
      { id: 'rep-new-1', type: 'rallyMobAttackResult', read: false, claimedReward: false, createdAt: 1000 },
      { id: 'rep-new-2', type: 'rallyMobAttackResult', read: false, claimedReward: false, createdAt: 990 }
    ] } } }
  ], '2026-11-02T13:00:00.000Z');

  const afterP1 = cache.merge({}, [page1]).cache;
  assert.equal(afterP1.mailStatus.data.unclaimedReportsCount, 2);
  assert.equal(afterP1.mailStatus.data.hasUnclaimed, true);

  // Page 2 arrives with cursor and returns empty or already claimed reports
  const page2 = record([
    { name: 'getPage', feature: 'report', ident: 'p2', args: { limit: 10, cursor: { id: 'rep-new-2', createdAt: 990 } } }
  ], [
    { ident: 'p2', result: { response: { reports: [] } } }
  ], '2026-11-02T13:00:01.000Z');

  const afterP2 = cache.merge(afterP1, [page2]).cache;
  assert.equal(afterP2.mailStatus.data.unclaimedReportsCount, 2, 'Unclaimed count should not reset to 0 upon empty next page');
  assert.equal(afterP2.mailStatus.data.hasUnclaimed, true, 'hasUnclaimed should remain true');
});

testWithTraces('replaying titan evolve trace updates star, power, fragments, gold, and quests', ['hwa-api-202611022032_titan_evolve.json'], async () => {
  const at = '2026-11-02T13:30:00.000Z';
  const baseline = {
    titanGetAll: {
      key: 'titanGetAll',
      data: {
        '4040': { id: 4040, level: 35, star: 2, power: 4012, skills: { '4041': 35 } }
      },
      updatedAt: at
    },
    inventoryGet: {
      key: 'inventoryGet',
      data: {
        fragmentTitan: { '4040': 164 },
        coin: { '1': 1000000 },
        consumable: { '24': 1000 }
      },
      updatedAt: at
    },
    userGetInfo: {
      key: 'userGetInfo',
      data: { gold: 1000000 },
      updatedAt: at
    },
    'resource:fragmentTitan:4040': { data: { amount: 164 }, updatedAt: at },
    'resource:gold': { data: { amount: 1000000 }, updatedAt: at },
    questGetAll: {
      key: 'questGetAll',
      data: {
        '334': { id: 334, state: 1, progress: 12 },
        '335': { id: 335, state: 1, progress: 12 }
      },
      updatedAt: at
    }
  };

  const titanEvolveTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611022032_titan_evolve.json', import.meta.url), 'utf8'));
  const afterEvolve = cache.merge(baseline, titanEvolveTrace).cache;

  // Star: 2 -> 3
  assert.equal(afterEvolve.titanGetAll.data['4040'].star, 3);
  // Power scaled from 4012 to 5472 (1.364x)
  assert.equal(afterEvolve.titanGetAll.data['4040'].power, 5472);
  // Fragments: 164 - 150 = 14
  assert.equal(afterEvolve.inventoryGet.data.fragmentTitan['4040'], 14);
  assert.equal(afterEvolve['resource:fragmentTitan:4040'].data.amount, 14);
  // Gold: 1,000,000 - 300,000 = 700,000
  assert.equal(afterEvolve['resource:gold'].data.amount, 700000);
  assert.equal(afterEvolve.inventoryGet.data.coin['1'], 700000);
  assert.equal(afterEvolve.userGetInfo.data.gold, 700000);
  // Consumable 24 set to 1250
  assert.equal(afterEvolve.inventoryGet.data.consumable['24'], 1250);
  // Quests 334 and 335 updated with state 3 and progress 13
  assert.equal(afterEvolve.questGetAll.data['334'].state, 3);
  assert.equal(afterEvolve.questGetAll.data['334'].progress, 13);
  assert.equal(afterEvolve.questGetAll.data['335'].state, 3);
  assert.equal(afterEvolve.questGetAll.data['335'].progress, 13);
});

testWithTraces('replaying onload trace extracts getLeaderboardPowerSummary and retains mail unclaimed status', ['hwa-api-202611022043_total_power_up_onload.json'], async () => {
  const onloadTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611022043_total_power_up_onload.json', import.meta.url), 'utf8'));
  const result = cache.merge({}, onloadTrace).cache;

  // getLeaderboardPowerSummary snapshot extracted
  const powerSummary = result['getLeaderboardPowerSummary:leaderboardPower'] || result.getLeaderboardPowerSummary;
  assert.ok(powerSummary);
  assert.ok(Array.isArray(powerSummary.data.places));
  const heroPowerPlace = powerSummary.data.places.find(p => p.leaderboardType === 'heroPowerServer');
  assert.ok(heroPowerPlace);
  assert.equal(heroPowerPlace.place, 64);

  // Mail unclaimed status retained across page 2
  assert.ok(result.mailStatus);
  assert.equal(result.mailStatus.data.unclaimedReportsCount, 2);
  assert.equal(result.mailStatus.data.totalUnclaimed, 2);
  assert.equal(result.mailStatus.data.hasUnclaimed, true);
});


testWithTraces('replaying auto-join raid trace tracks guild rally and auto-joined march', ['hwa-api-202611022205_auto_joi_raid.json'], async () => {
  const autoJoinTrace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-api-202611022205_auto_joi_raid.json', import.meta.url), 'utf8'));
  const initial = {
    accountStatus: { data: { name: 'VplGhost', id: 1216438103 } }
  };
  const result = cache.merge(initial, autoJoinTrace).cache;

  assert.ok(result.marchStatus);
  assert.ok(Array.isArray(result.marchStatus.data.marches));
  assert.equal(result.marchStatus.data.marches.length, 1);

  const march = result.marchStatus.data.marches[0];
  assert.equal(march.kind, 'raid');
  assert.equal(march.squadId, 'f9eb4c1a-d6a5-4019-9c72-31f560694b0e');
  assert.equal(march.rally.id, '923ec3fa-32d8-42a3-8c5b-ee30421ab17d');
  assert.equal(march.rally.target, '[PvP] Boss, level 17');
  assert.equal(march.rally.leaderName, '10PR0');
  assert.equal(march.rally.isAutoJoin, true);
  assert.deepEqual([...march.rally.team.heroIds], [2, 16, 60, 70, 79]);
  assert.equal(march.rally.waitUntil, 1793631940951);
});

test('inventoryGet snapshot syncs resource:coin and resource:consumable balances to 0 when omitted', () => {
  const initial = {
    'resource:coin:13': { data: { amount: 5 } },
    'resource:consumable:46': { data: { amount: 20 } },
    'resource:coin:1': { data: { amount: 100 } }
  };
  const snapshot = record([{ name: 'inventoryGet', ident: 'inv1' }], [
    { ident: 'inv1', result: { response: { coin: { 1: 200 }, consumable: { 20: 50 } } } }
  ]);
  const result = cache.merge(initial, [snapshot]).cache;
  assert.equal(result['resource:coin:13'].data.amount, 0);
  assert.equal(result['resource:consumable:46'].data.amount, 0);
  assert.equal(result['resource:coin:1'].data.amount, 200);
});

test('shopBuy deducts slot cost currency and adds reward to inventory and resource caches', () => {
  const initial = {
    'resource:coin:1000': { data: { amount: 50 } },
    'resource:gold': { data: { amount: 100000 } },
    inventory: { data: { coin: { 1000: 50 }, consumable: {} } }
  };

  const buyTrace = record([
    {
      name: 'shopBuy',
      ident: 'buy1',
      args: { shopId: 1000, slot: 4, reward: { gold: 75000 }, amount: 1 }
    }
  ], [
    {
      ident: 'buy1',
      result: {
        response: {
          slot: {
            cost: { coin: { '1000': 5 } }
          },
          reward: { gold: '75000' }
        }
      }
    }
  ]);

  const extracted = cache.extract(buyTrace);
  assert.equal(extracted.some(e => e.key === 'resourceAction' && e.data.resourceKey === 'resource:coin:1000' && e.data.delta === -5), true);
  assert.equal(extracted.some(e => e.key === 'resourceAction' && e.data.resourceKey === 'resource:gold' && e.data.delta === 75000), true);

  const merged = cache.merge(initial, [buyTrace]).cache;
  assert.equal(merged['resource:coin:1000'].data.amount, 45);
  assert.equal(merged['resource:gold'].data.amount, 175000);
});

test('randomDraft_register deducts 1 draft chip and resets legendDraftStatus', () => {
  const initial = {
    'resource:refillable:60': { data: { amount: 3, cap: 5 } },
    legendDraftStatus: {
      data: {
        active: false,
        stageId: 0,
        matchId: 12345,
        lastResult: { result: 0 },
        defenceHeroes: [1, 2, 3, 4, 5],
        attackHeroes: [6, 7, 8, 9, 10]
      }
    }
  };

  const registerTrace = record([
    { name: 'randomDraft_register', ident: 'reg1' }
  ], [
    { ident: 'reg1', result: { response: null } }
  ]);

  const extracted = cache.extract(registerTrace);
  assert.equal(extracted.some(e => e.key === 'resourceAction' && e.data.resourceKey === 'resource:refillable:60' && e.data.delta === -1), true);
  assert.equal(extracted.some(e => e.key === 'legendDraftStatus' && e.data.stageId === 1), true);

  const merged = cache.merge(initial, [registerTrace]).cache;
  assert.equal(merged['resource:refillable:60'].data.amount, 2);
  assert.equal(merged.legendDraftStatus.data.active, true);
  assert.equal(merged.legendDraftStatus.data.stageId, 1);
  assert.deepEqual([...merged.legendDraftStatus.data.defenceHeroes], []);
  assert.deepEqual([...merged.legendDraftStatus.data.attackHeroes], []);
  assert.equal(merged.legendDraftStatus.data.lastResult, null);
});
