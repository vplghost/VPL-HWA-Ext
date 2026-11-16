import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { BOSS_POWER, UNIT_POWER } from '../src/utils/rallyPowerData.ts';
import { formatMarchTooltip } from '../src/utils/marchTooltip.ts';

const march = { kind: 'raid', rally: { id: 'r', mobConfigId: 78, team: { heroIds: [2], units: [{ id: 7, count: 100 }] } } };
const own = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: { 2: { power: 114000, level: 50 } } } };
const participants = [
  { userId: 10, squad: { heroes: [{ heroId: 2, level: 50 }], units: [{ unitId: 7, count: 100 }] } },
  { userId: 20, squad: { heroes: [{ heroId: 2, level: 50 }], units: [{ unitId: 27, count: 200 }] } }
];
const cache = { ...own, rallyPowerStatus: { data: { accountId: '10', rallies: [{ rallyId: 'r', participants }] } } };

test('verified boss presets match in-game levels 19, 20 and 22', () => {
  assert.equal(Object.keys(BOSS_POWER).length, 30);
  for (const [id, heroes, troops, count] of [[78, 639800, 459500, 16250], [79, 735875, 511000, 17500], [81, 1042375, 678000, 19750]]) {
    assert.deepEqual([BOSS_POWER[id].heroes, BOSS_POWER[id].troops, BOSS_POWER[id].count], [heroes, troops, count]);
  }
  assert.equal(UNIT_POWER[7], 32);
  assert.equal(UNIT_POWER[27], 33);
});

test('tooltip compares exact boss power to troop total and known hero subtotal', () => {
  const tooltip = formatMarchTooltip(march, 0, cache);
  assert.match(tooltip, /Heroes power: 114k\+ \/ 639\.8k/);
  assert.match(tooltip, /Troops power: 9\.8k \/ 459\.5k/);
  assert.match(tooltip, /Total power: 123\.8k\+ \/ 1\.1M/);
});

test('own-team fallback remains partial; foreign and mismatched profiles are never substituted', () => {
  assert.match(formatMarchTooltip(march, 0, own), /Troops power: 3\.2k\+/);
  const wrongAccount = { ...cache, accountStatus: { data: { id: 30 } }, heroGetAll: {} };
  assert.match(formatMarchTooltip(march, 0, wrongAccount), /Heroes power: —/);
  const changed = { ...cache, heroGetAll: { data: { 2: { power: 999999, level: 51 } } } };
  assert.match(formatMarchTooltip(march, 0, changed), /Heroes power: —/);
  const missing = { ...cache, rallyPowerStatus: { data: { accountId: 10, rallies: [{ rallyId: 'r', participants: [participants[0], { userId: 20 }] }] } } };
  assert.match(formatMarchTooltip(march, 0, missing), /Troops power: 3\.2k\+/);
});

test('rally snapshots survive march refresh, reject lower versions and clear on account switch', async () => {
  const { rpcCacheService: reducer } = await import('../src/core/cache/index.ts');
  const details = (version, time) => ({ key: 'rallyAction', method: 'getRallyById', updatedAt: time,
    data: { action: 'details', rallyId: 'r', rallyVersion: version, mobId: 'mob', mapId: 'map', mobConfigId: 78,
      leader: participants[0], members: [participants[1]] } });
  const first = reducer.merge(own, [details(3, '2026-11-14T10:00:00Z')]).cache;
  assert.equal(first.rallyPowerStatus.data.rallies[0].participants.length, 2);
  const stale = reducer.merge(first, [details(2, '2026-11-14T10:01:00Z')]).cache;
  assert.equal(stale.rallyPowerStatus.data.rallies[0].version, 3);
  const refreshed = reducer.merge(first, [{ key: 'marchStatus', updatedAt: '2026-11-14T10:02:00Z', data: { marches: [] } }]).cache;
  assert.equal(refreshed.rallyPowerStatus.data.rallies[0].version, 3);
  const switched = reducer.merge(first, [{ key: 'accountStatus', updatedAt: '2026-11-14T10:03:00Z', data: { id: 30 } }]).cache;
  assert.equal(switched.rallyPowerStatus, undefined);
});
