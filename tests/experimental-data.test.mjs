import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/experimental-data.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const data = context.globalThis.hwaHelperExperimentalData;

test('gather default chooses five owned heroes with least power', () => {
  const heroes = { 7: { power: 20 }, 8: { power: 5 }, 9: { power: 5 },
    10: { power: 10 }, 11: { power: 30 }, 12: { power: 15 } };
  assert.deepEqual(Array.from(data.lowestPowerHeroes(heroes)), [8, 9, 10, 12, 7]);
  const options = data.teamOptions({ arena: [7, 8, 9, 10, 11] }, heroes);
  assert.equal(options[0].id, 'weakest');
  assert.deepEqual(Array.from(options[0].heroIds), [8, 9, 10, 12, 7]);
});

test('custom teams precede defaults and synced teams without modifying game data', () => {
  const heroes = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((id) => [id, { power: id }]));
  const synced = { arena: [1, 2, 3, 4, 5] };
  const custom = [{ id: 'one', name: ' Raid ', heroIds: [3, 4, 5, 6, 7] }];
  const options = data.teamOptions(synced, heroes, custom);
  assert.deepEqual(Array.from(options, (team) => team.id), ['custom:one', 'weakest', 'arena:0']);
  assert.equal(options[0].label, 'Custom · Raid');
  assert.equal(synced.arena[0], 1);
  assert.equal(data.normalizeCustomTeam({ name: 'bad', heroIds: [1, 1, 2, 3, 4] }, heroes), null);
  assert.equal(data.normalizeCustomTeam({ name: 'bad', heroIds: [1, 2, 3, 4, 99] }, heroes), null);
  assert.equal(data.normalizeCustomTeam({ name: ' ', heroIds: [1, 2, 3, 4, 5] }, heroes), null);
  assert.equal(data.teamOptions(synced, heroes, []).some((team) => team.id === 'custom:one'), false);
});

test('custom team troop maximum survives storage, can be cleared and overrides estimates', () => {
  const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, {}]));
  const base = { id: 'one', name: 'Raid', heroIds: [1, 2, 3, 4, 5] };
  for (const maxTroops of [1, 2000, 6000]) {
    const team = data.normalizeCustomTeam({ ...base, maxTroops }, heroes);
    const stored = JSON.parse(JSON.stringify(team));
    assert.equal(data.teamOptions({}, heroes, [stored])[0].maxTroops, maxTroops);
    assert.equal(data.teamTroopCapacity(3950, stored.maxTroops), maxTroops);
  }
  for (const maxTroops of [0, -1, 1.5, '6000', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(data.normalizeCustomTeam({ ...base, maxTroops }, heroes), null);
  }
  const cleared = data.normalizeCustomTeam({ ...base, maxTroops: undefined }, heroes);
  assert.equal(cleared.maxTroops, undefined);
  assert.equal(data.teamTroopCapacity(3950, cleared.maxTroops), 3950);
  const troops = data.allocateTroops({ available: [7, 17, 27].map((unitId) => ({ unitId, count: 1000 })) }, 700);
  assert.equal(troops.reduce((sum, unit) => sum + unit.count, 0), 700);
  assert.equal(data.allocateTroops({ available: [{ unitId: 7, count: 100 }] }, 6000)[0].count, 100);
});

test('lowest power excludes deployed squad and march heroes and leaves incomplete teams incomplete', () => {
  const heroes = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, { power: id }]));
  const summary = { squads: [{ heroes: [{ id: 1 }, { heroId: 2 }] }] };
  const available = data.availableHeroIds(heroes, summary, [{ team: { heroIds: [3] } }]);
  assert.deepEqual(Array.from(data.lowestPowerHeroes(heroes, available)), [4, 5, 6, 7, 8]);
  assert.deepEqual(Array.from(data.teamOptions({}, heroes, [], available)[0].heroIds), [4, 5, 6, 7, 8]);
  assert.equal(data.lowestPowerHeroes(heroes, [7, 8]).length, 2);
});

test('rally boss level maps to captured config range and squad rejects incomplete troops', () => {
  assert.equal(data.bossConfigId(1), 60);
  assert.equal(data.bossConfigId(30), 89);
  assert.equal(data.bossConfigId(31), null);
  assert.equal(data.buildSquad([1, 2, 3, 4, 5], []), null);
  const squad = data.buildSquad([1, 2, 3, 4, 5], [{ unitId: 7, count: 500 }]);
  assert.deepEqual(Array.from(squad.heroes, (hero) => hero.heroId), [1, 2, 3, 4, 5]);
  assert.equal(squad.units[0].count, 500);
  const rally = data.buildRallyCall('map-1', 'boss-1', squad, 300);
  assert.equal(rally.name, 'createRally');
  assert.equal(rally.feature, 'mob');
  assert.equal(rally.args.startDelay, 300000);
  assert.deepEqual(Array.from(Object.keys(rally.args)), ['mapId', 'mobId', 'squad', 'startDelay']);
  assert.equal(data.buildRallyCall('map-1', 'boss-1', squad, 0), null);
  const gather = data.buildGatherCall('map-1', 'mine-1', squad);
  assert.equal(gather.name, 'attackMine');
  assert.equal(gather.feature, 'mine');
  assert.equal(gather.args.battleType, 'pve');
  assert.deepEqual(Array.from(Object.keys(gather.args)), ['mapId', 'mineId', 'battleType', 'squad']);
});

test('rally phase follows wait, travel, result and return times', () => {
  const march = { stage: 'waitingForRallyStart', rally: { waitUntil: 2000, outboundMs: 1000 } };
  assert.equal(data.rallyPhase(march, 1000).phase, 'Waiting');
  assert.equal(data.rallyPhase(march, 2500).phase, 'Traveling to boss');
  assert.equal(data.rallyPhase(march, 3500).phase, 'Battle / awaiting result');
  march.stage = 'returnToOutpost'; march.result = 'win'; march.rally.returnAt = 5000;
  assert.equal(data.rallyPhase(march, 4000).result, 'win');
  assert.equal(data.rallyPhase(march, 4000).until, 5000);
});

test('mine search uses captured type, level and full-only arguments', () => {
  const call = data.buildMineSearchCall('map-1', { x: 606, y: 376 }, 'food', 8);
  assert.equal(call.args.mineConfigIds[0], 66);
  assert.equal(call.args.fullOnly, true);
  assert.equal(data.mineConfigId('iron', 9), 87);
  assert.equal(data.mineConfigId('stone', 7), 75);
  assert.equal(data.mineConfigId('wood', 8), 56);
});

test('rally waits match game config and reject arbitrary seconds', () => {
  const squad = data.buildSquad([1, 2, 3, 4, 5], [{ unitId: 7, count: 5 }]);
  for (const wait of [60, 300, 900, 1800]) assert.equal(data.buildRallyCall('map', 'boss', squad, wait).args.startDelay, wait * 1000);
  for (const wait of [1, 59, 61, 600, 3600]) assert.equal(data.buildRallyCall('map', 'boss', squad, wait), null);
});

test('troop allocator maximizes capacity, uses highest tier first and redistributes shortages', () => {
  const summary = { available: [{ unitId: 7, count: 80 }, { unitId: 6, count: 1000 },
    { unitId: 17, count: 20 }, { unitId: 27, count: 2000 }], reserved: [{ unitId: 17, count: 9999 }] };
  const units = JSON.parse(JSON.stringify(data.allocateTroops(summary, 302)));
  assert.deepEqual(units, [{ unitId: 7, count: 80 }, { unitId: 6, count: 61 }, { unitId: 17, count: 20 }, { unitId: 27, count: 141 }]);
  for (let cap = 1; cap < 4000; cap += 37) {
    const allocated = data.allocateTroops(summary, cap);
    assert.equal(allocated.reduce((sum, unit) => sum + unit.count, 0), Math.min(cap, 3100));
    for (const unit of allocated) assert.ok(unit.count <= summary.available.find((item) => item.unitId === unit.unitId).count);
  }
  const balanced = data.allocateTroops({ available: [7, 17, 27].map((unitId) => ({ unitId, count: 1000 })) }, 1000);
  assert.deepEqual(Array.from(balanced, (unit) => unit.count), [334, 333, 333]);
  assert.equal(data.allocateTroops({ available: [{ unitId: 99, count: 10 }] }, 10).length, 0);
});

test('capacity uses hero data and falls back after saved values become stale', () => {
  const heroes = { 16: { level: 80, star: 3, power: 1234 }, 67: { level: 70, star: 4 },
    14: { level: 30, star: 2 }, 33: { level: 2, star: 1 }, 38: { level: 1, star: 1 } };
  const ids = [16, 67, 14, 33, 38];
  assert.equal(data.squadCapacity(ids, heroes, {}, 200), 3669);
  const saved = { 16: { count: 799, signature: data.capacitySignature(heroes[16]) } };
  assert.equal(data.squadCapacity(ids, heroes, saved, 200), 3669);
  heroes[16].power++;
  assert.equal(data.squadCapacity(ids, heroes, saved, 200), 3669);
  assert.equal(data.squadCapacity([16, 67, 14, 33, 33], heroes, {}, 200), null);
  assert.equal(data.squadCapacity(ids, heroes, {}, -1), null);
});

test('capacity defaults and corrected troop ranges apply without manual capacities', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(data.normalizeCapacitySettings())), { defaultHero: 600, base: 950 });
  assert.equal(data.squadCapacity([1, 2, 3, 4, 5], {}, {}, 950), 3950);
  for (const [id, label, level] of [[1, 'Marksmen', 1], [9, 'Marksmen', 9], [11, 'Spearmen', 1],
      [19, 'Spearmen', 9], [21, 'Infantry', 1], [29, 'Infantry', 9]]) {
    assert.equal(data.unitInfo(id).label, label); assert.equal(data.unitInfo(id).level, level);
  }
  for (const id of [0, 10, 20, 30, 31, -1]) assert.equal(data.unitInfo(id), null);
  const units = data.allocateTroops({ available: [9, 10, 19, 20, 29, 30].map((unitId) => ({ unitId, count: 100 })) }, 300);
  assert.deepEqual(Array.from(units, (unit) => unit.unitId), [9, 19, 29]);
});

test('capacity inference preserves unknowns until independent observations identify each hero', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const heroes = Object.fromEntries(ids.map((id) => [id, { level: 30, star: 2, power: id }]));
  const observation = (members, total, accountId = 10) => ({ accountId, total,
    profiles: members.map((id) => ({ id, signature: data.capacitySignature(heroes[id]) })) });
  const capacities = ids.map((id) => 600 + id * 10);
  const selected = ids.slice(0, 5);
  const rows = ids.map((_, excluded) => {
    const members = ids.filter((_, i) => i !== excluded);
    return observation(members, 950 + members.reduce((sum, id) => sum + capacities[id - 1], 0));
  });
  const underdetermined = data.capacityModel(selected, heroes, rows.slice(0, 1), {}, 10);
  assert.equal(Object.keys(underdetermined.inferred).length, 0);
  const solved = data.capacityModel(selected, heroes, rows, {}, 10);
  assert.deepEqual(Array.from(solved.counts), [610, 620, 630, 640, 650]);
  assert.equal(solved.total, 4100);
  const conflicting = data.capacityModel(selected, heroes, [...rows, observation(selected, 4200)], {}, 10);
  assert.equal(Object.keys(conflicting.inferred).length, 0, 'inconsistent load equations cannot identify hero contributions');
  assert.equal(data.capacityModel(selected, heroes, [observation(selected, 1000)], {}, 10).total, 3950);
  assert.equal(data.capacityModel(selected, heroes, [observation(selected, 5000, 11)], {}, 10).total, 3950);
  const same = observation(selected, 5000);
  assert.equal(data.capacityModel(selected, heroes, [same], {}, 10).total, 5000);
  heroes[1].power++;
  assert.equal(data.capacityModel(selected, heroes, [same], {}, 10).total, 3950);
  assert.equal(data.capacityModel(selected, heroes, [], { defaultHero: 700, base: 1000 }, 10).total, 4500);
});

test('member threshold includes leader once and distinguishes unknown membership', () => {
  const counts = data.rallyMembers({ leader: { userId: 1 }, members: [{ userId: 1 }, { userId: 2 }], membersCapacityLeft: 4 });
  assert.equal(counts.count, 2); assert.equal(counts.total, 6);
  assert.equal(data.rallyMembers({ members: [] }), null);
});
