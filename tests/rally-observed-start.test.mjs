import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dashboardMarches } from '../src/utils/dashboardState.ts';

import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
const at = Date.parse('2026-11-14T07:52:16.845Z');
const id = '705830d9-40d5-412b-94fe-a23932169fca';
const mobId = '57f4f40f-test-boss';
const rally = { rallyId: id, rallyVersion: 13, mapId: 'captured-map',
  leader: { userId: 1216356317, squad: { squadId: 'leader', heroes: [{ heroId: 16 }], units: [] } },
  members: [{ userId: 1216438103, eta: 1775001600000,
    squad: { squadId: 'd3b9f4e0-2d5c-4a17-9ef6-58f406ccaf83', heroes: [{ heroId: 2 }, { heroId: 16 }], units: [] } }],
  membersCapacityLeft: 0, unitsCapacityLeft: 400000,
  mob: { mobId, mobConfigId: 74 }, target: { objectId: mobId, objectConfigId: 74 },
  plannedStartTime: 1794642997979,
  route: { routeId: 'actual-route', startedAt: 1794642735636, durationMs: 30345, duration: 30345,
    to: { object: { objectId: mobId, objectType: 'rallyMob' } } } };
function rpc(data = rally, time = at) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: new Date(time).toISOString(),
    requestBody: JSON.stringify({ calls: [{ name: 'getRallyById', feature: 'rally', args: { rallyId: data.rallyId }, ident: 'details' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'details', result: { response: { rally: data } } }] }) };
}
const own = { accountStatus: { data: { id: 1216438103 } } };

test('captured route supersedes planned start and enriches only the local member squad', () => {
  const cache = reducer.merge(own, [rpc()]).cache;
  const march = cache.marchStatus.data.marches[0];
  assert.equal(march.squadId, rally.members[0].squad.squadId);
  assert.equal(march.stage, 'moveToTargetInRally');
  assert.equal(march.targetArrivalAt, 1794642765981);
  assert.equal(march.rally.waitUntil, 1794642735636);
  assert.equal(march.rally.plannedStartTime, 1794642997979);
  assert.equal(march.durationMs, 30345);
  assert.equal(dashboardMarches(cache, at)[0].stage, 'Traveling');
  assert.equal(dashboardMarches(cache, 1794642765981)[0].stage, 'In battle');
  const foreign = reducer.merge({ accountStatus: { data: { id: 99 } } }, [rpc()]).cache;
  assert.equal(foreign.marchStatus.data.marches.length, 0);
});

test('lower version details cannot regress departed routes or attach an unrelated route', () => {
  const cache = reducer.merge(own, [rpc()]).cache;
  const stale = reducer.merge(cache, [rpc({ ...rally, rallyVersion: 10, route: undefined }, at + 1000)]).cache;
  assert.equal(stale.marchStatus.data.marches[0].targetArrivalAt, 1794642765981);
  assert.equal(stale.experimentalRallyTargets.data[0].rallyVersion, 13);
  const bad = reducer.merge(own, [rpc({ ...rally, route: { ...rally.route, to: { object: { objectId: 'different-boss' } } } })]).cache;
  assert.notEqual(bad.marchStatus.data.marches[0].targetArrivalAt, 1794642765981);
  assert.notEqual(bad.marchStatus.data.marches[0].stage, 'moveToTargetInRally');
});
