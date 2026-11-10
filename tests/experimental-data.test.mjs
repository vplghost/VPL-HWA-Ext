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
  assert.equal(data.bossLevel(60), 1);
  assert.equal(data.bossLevel(89), 30);
  assert.equal(data.bossLevel(74), 15);
  assert.equal(data.bossLevel(59), null);
  assert.equal(data.bossLevel(90), null);
  assert.equal(data.bossLevel('74'), null);

  const joinCall = data.buildJoinRallyCall('map-1', 'rally-1', squad);
  assert.equal(joinCall.name, 'joinRally');
  assert.equal(joinCall.feature, 'rally');
  assert.equal(joinCall.args.rallyId, 'rally-1');
  assert.equal(joinCall.args.mapId, 'map-1');
  assert.deepEqual(joinCall.args.squad, squad);
  assert.equal(data.buildJoinRallyCall(null, null, squad), null);
  assert.equal(data.buildJoinRallyCall('map-1', 'rally-1', null), null);
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


test('hero troop capacity is estimated from power with a safe -2 margin to prevent overflow', () => {
  // Invalid or dummy powers (< 1000) return null
  for (const invalid of [null, undefined, NaN, -100, 0, 50, 999, '5000']) {
    assert.equal(data.estimateHeroTroopCapacity(invalid), null);
  }

  // Bracket 1: Power < 9000
  // Level 1 baseline (power ~5844): actual is 623, estimate(-2) is 621 (<= 623)
  assert.equal(data.estimateHeroTroopCapacity(5844), 621);
  // Kendle (power 6669): actual is 640, estimate(-2) is 638 (<= 640)
  assert.equal(data.estimateHeroTroopCapacity(6669), 638);
  // Tristan (power 7622): actual is 665, estimate(-2) is 662 (<= 665)
  assert.equal(data.estimateHeroTroopCapacity(7622), 662);
  // Dorian (power 8692): actual is 691, estimate(-2) is 690 (<= 691)
  assert.equal(data.estimateHeroTroopCapacity(8692), 690);

  // Bracket 2: 9000 <= Power < 30000
  // Eva (power 9027): actual is 697, estimate(-2) is 694 (<= 697)
  assert.equal(data.estimateHeroTroopCapacity(9027), 694);
  // Jhu (power 12236): actual is 715, estimate(-2) is 713 (<= 715)
  assert.equal(data.estimateHeroTroopCapacity(12236), 713);
  // Iris (power 23242): actual is 767, estimate(-2) is 765 (<= 767)
  assert.equal(data.estimateHeroTroopCapacity(23242), 765);
  // Leonel (power 28744): actual is 787, estimate(-2) is 786 (<= 787)
  assert.equal(data.estimateHeroTroopCapacity(28744), 786);

  // Bracket 3: Power >= 30000
  // Galahad (power 31637): actual is 797, estimate(-2) is 793 (<= 797)
  assert.equal(data.estimateHeroTroopCapacity(31637), 793);
  // Dante (power 36894): actual is 812, estimate(-2) is 810 (<= 812)
  assert.equal(data.estimateHeroTroopCapacity(36894), 810);

  // Lineups without custom maxTroops use capacityModel derived from hero powers
  const powerLineupHeroes = {
    10: { level: 70, star: 1, power: 12236 },
    11: { level: 70, star: 1, power: 12236 },
    12: { level: 70, star: 1, power: 12236 },
    13: { level: 70, star: 1, power: 12236 },
    14: { level: 70, star: 1, power: 12236 },
  };
  const ids = [10, 11, 12, 13, 14];
  const model = data.capacityModel(ids, powerLineupHeroes, [], {}, 10);
  // 950 base + 5 * 713 = 4515
  assert.equal(model.total, 4515);

  // When lineup has custom maxTroops, teamTroopCapacity overrides automatic capacity
  assert.equal(data.teamTroopCapacity(model.total, 4000), 4000);
  // When lineup has no custom maxTroops (undefined/null), teamTroopCapacity uses automatic capacity
  assert.equal(data.teamTroopCapacity(model.total, undefined), 4515);
  assert.equal(data.teamTroopCapacity(model.total, null), 4515);
});

test('highestPowerHeroes sorts available heroes by power descending', () => {
  const heroes = {
    1: { power: 1000 },
    2: { power: 5000 },
    3: { power: 3000 },
    4: { power: 9000 },
    5: { power: 2000 },
    6: { power: 8000 }
  };
  assert.deepEqual(Array.from(data.highestPowerHeroes(heroes)), [4, 6, 2, 3, 5]);
  assert.deepEqual(Array.from(data.highestPowerHeroes(heroes, [1, 2, 3, 5, 6])), [6, 2, 3, 5, 1]);
});

test('autoJoinTeamOptions includes highest power default, custom teams, in-game teams and weakest option', () => {
  const heroes = {
    1: { power: 1000 },
    2: { power: 5000 },
    3: { power: 3000 },
    4: { power: 9000 },
    5: { power: 2000 },
    6: { power: 8000 }
  };
  const custom = [{ id: 'alpha', name: 'Alpha Squad', heroIds: [1, 2, 3, 4, 5] }];
  const inGame = { arena: [[2, 3, 4, 5, 6]] };
  const options = data.autoJoinTeamOptions(inGame, heroes, custom);
  assert.equal(options[0].id, 'highest');
  assert.deepEqual(Array.from(options[0].heroIds), [4, 6, 2, 3, 5]);
  assert.equal(options[1].id, 'custom:alpha');
  assert.deepEqual(Array.from(options[1].heroIds), [1, 2, 3, 4, 5]);
  assert.equal(options[2].id, 'arena:0');
  assert.deepEqual(Array.from(options[2].heroIds), [2, 3, 4, 5, 6]);
  assert.equal(options[3].id, 'weakest');
  assert.deepEqual(Array.from(options[3].heroIds), [1, 5, 3, 2, 6]);
});
