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

test('capacity uses each selected hero plus base and invalidates saved values after stats change', () => {
  const heroes = { 16: { level: 80, star: 3, power: 1234 }, 67: { level: 70, star: 4 },
    14: { level: 30, star: 2 }, 33: { level: 2, star: 1 }, 38: { level: 1, star: 1 } };
  const ids = [16, 67, 14, 33, 38];
  assert.equal(data.squadCapacity(ids, heroes, {}, 200), 3669);
  const saved = { 16: { count: 799, signature: data.capacitySignature(heroes[16]) } };
  assert.equal(data.squadCapacity(ids, heroes, saved, 200), 3669);
  heroes[16].power++;
  assert.equal(data.squadCapacity(ids, heroes, saved, 200), null);
  assert.equal(data.squadCapacity([16, 67, 14, 33, 33], heroes, {}, 200), null);
  assert.equal(data.squadCapacity(ids, heroes, {}, -1), null);
});

test('member threshold includes leader once and distinguishes unknown membership', () => {
  const counts = data.rallyMembers({ leader: { userId: 1 }, members: [{ userId: 1 }, { userId: 2 }], membersCapacityLeft: 4 });
  assert.equal(counts.count, 2); assert.equal(counts.total, 6);
  assert.equal(data.rallyMembers({ members: [] }), null);
});
