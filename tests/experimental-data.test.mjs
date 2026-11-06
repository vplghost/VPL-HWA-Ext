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
