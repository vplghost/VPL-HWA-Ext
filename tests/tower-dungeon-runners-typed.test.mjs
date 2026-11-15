import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUFF_PRIORITY,
  priorityOrder,
  chooseBuff,
  chooseBattleRoom,
  plan as planTower,
  towerAutomationService,
} from '../src/services/queues/towerAutomation.ts';

import {
  terminal as terminalTower,
  stop as stopTower,
  makeEndBattleCall as makeTowerEndBattleCall,
  start as startTower,
  advance as advanceTower,
  towerRunnerService,
} from '../src/services/queues/towerRunner.ts';

import {
  isTitanAlive,
  getPoolForType,
  pickLineupFromPool,
  evaluateDoor,
  selectBestDoor,
  planDungeon,
  dungeonAutomationService,
} from '../src/services/queues/dungeonAutomation.ts';

import {
  terminal as terminalDungeon,
  stop as stopDungeon,
  checkCasualtiesInBattle,
  getGateCoordinates,
  start as startDungeon,
  advance as advanceDungeon,
  dungeonRunnerService,
} from '../src/services/queues/dungeonRunner.ts';

test('towerAutomationService - buff choices, room selection, and floor planning', () => {
  // Buff priority
  const offered = [30, 6, 11];
  const preferred = [11];
  assert.equal(chooseBuff(offered, preferred), 11, 'User preferred buff comes first');
  assert.equal(chooseBuff(offered, []), 6, 'Default buff priority fallback');

  // Plan complete
  assert.equal(planTower({ towerStatus: { data: { isCleared: true } } }).kind, 'complete');

  // Plan need-snapshot
  assert.equal(planTower({}).kind, 'need-snapshot');

  // Plan battle room
  const session = {
    floorNumber: 5,
    roomNumber: 0,
    rooms: {
      1: { type: 'hero_battle', roomNumber: 1, state: 'initial' },
      2: { type: 'buffs', buffs: [6, 3] },
    },
    history: [],
  };
  const cache = {
    towerSession: { data: session, updatedAt: new Date().toISOString() },
    teamGetAll: { data: { magicTower: [1, 2, 3, 4, 5] } },
  };
  const decision = planTower(cache);
  assert.equal(decision.kind, 'rpc');
  assert.equal(decision.call?.name, 'magicTower_enterRoom');
  assert.equal(decision.call?.args?.number, 1);
});

test('towerRunnerService - lifecycle and battle call generation', () => {
  assert.equal(terminalTower(null), true);
  assert.equal(terminalTower({ phase: 'complete' }), true);
  assert.equal(terminalTower({ phase: 'stopped' }), true);
  assert.equal(terminalTower({ phase: 'planning' }), false);

  const stopped = stopTower({ phase: 'acting' }, 'Hero died');
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.reason, 'Hero died');

  // End battle call
  const startRes = { seed: 12345, attackers: { 1: { hp: 50000 }, 2: { hp: 60000 } } };
  const endCall = makeTowerEndBattleCall(startRes, [1, 2]);
  assert.equal(endCall.name, 'magicTower_endBattle');
  assert.equal(endCall.args.result.win, true);
  assert.equal(endCall.args.progress[0].seed, 12345);
  assert.equal(endCall.args.progress[0].attackers.heroes[1].hp, 50000);
});

test('dungeonAutomationService - titan pool evaluation and door selection', () => {
  assert.equal(isTitanAlive({ hp: 100 }), true);
  assert.equal(isTitanAlive({ hp: 0 }), false);
  assert.equal(isTitanAlive({ isDead: true }), false);

  const poolWater = getPoolForType('water', null);
  assert.ok(poolWater.length >= 5);

  const titanStates = { 4000: { isDead: true } }; // 4000 dead
  const lineup = pickLineupFromPool('water', titanStates, null);
  assert.equal(lineup.deadCount, 1);
  assert.equal(lineup.isIntact, false);
  assert.ok(!lineup.selectedHeroes.includes(4000));

  // Select best door
  const doors = [
    { attackerType: 'water', defenderType: 'fire', power: 50000 },
    { attackerType: 'earth', defenderType: 'water', power: 40000 },
  ];
  const cache = {
    dungeonStatus: {
      data: {
        currentFloorDoors: doors,
        elements: { prime: 'earth' },
        states: { titans: {} },
      },
    },
  };
  const selection = selectBestDoor(doors, cache, { requireIntactLineup: true });
  assert.equal(selection.canAttack, true);
  assert.ok(selection.chosen);
});

test('dungeonRunnerService - lifecycle, coordinates, and casualty tracking', () => {
  assert.equal(terminalDungeon(null), true);
  assert.equal(terminalDungeon({ phase: 'complete' }), true);
  assert.equal(terminalDungeon({ phase: 'stopped' }), true);
  assert.equal(terminalDungeon({ phase: 'planning' }), false);

  // Gate coordinates
  const singleGate = getGateCoordinates(1, 0);
  assert.equal(singleGate.label, 'Center Gate');
  const door1 = getGateCoordinates(2, 0);
  assert.equal(door1.label, 'Door 1 (Left Gate)');
  const door2 = getGateCoordinates(2, 1);
  assert.equal(door2.label, 'Door 2 (Right Gate)');

  // Casualty detection
  const endCallArgs = {
    progress: [{ attackers: { heroes: { 4000: { isDead: true } } } }],
  };
  const casualties = checkCasualtiesInBattle(endCallArgs, {}, [4000, 4001]);
  assert.deepEqual(casualties, [4000]);
});
