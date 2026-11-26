import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  needsFiveFloorCheckpointClaim,
  shouldUseBestOfTen,
  deriveCandidateSeeds,
  scoreDungeonOutcome,
  compareDungeonOutcomes,
  runSingleDoorBestOfTen,
  areAllDoorsPoolDepleted,
  mergeClearedRoomEntry,
  SINGLE_DOOR_SIM_ROUNDS,
} from '../src/services/dungeonPlanner.ts';
import { executeDungeonAutomationStep } from '../src/services/queues/dungeonAutomationRunner.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('needsFiveFloorCheckpointClaim detects every-5-floor milestone and dungeon:null responses', () => {
  // Real game log pattern at floor 580 and 585: dungeonEndBattle returns { reward, states } with dungeon: null
  assert.equal(
    needsFiveFloorCheckpointClaim({
      floorNumber: 585,
      respawnFloor: 576,
      endBattleResponse: { reward: { dungeonActivity: 15 }, states: {}, dungeon: null },
    }),
    true
  );

  // Floor 585 divisible by 5 even when endBattleResponse not provided
  assert.equal(needsFiveFloorCheckpointClaim({ floorNumber: 585, respawnFloor: 576 }), true);
  assert.equal(needsFiveFloorCheckpointClaim({ floorNumber: 580, respawnFloor: 571 }), true);

  // Normal floor (582) with valid next dungeon object does NOT require claim
  assert.equal(
    needsFiveFloorCheckpointClaim({
      floorNumber: 582,
      respawnFloor: 576,
      endBattleResponse: { dungeon: { floorNumber: 583, floorType: 'battle' } },
    }),
    false
  );

  // Pre-check: 0 doors or floorType === 'save' / 'reward'
  assert.equal(needsFiveFloorCheckpointClaim({ floorNumber: 585, doorsCount: 0, respawnFloor: 576 }), true);
  assert.equal(needsFiveFloorCheckpointClaim({ floorNumber: 585, floorType: 'save', respawnFloor: 576 }), true);
});

test('shouldUseBestOfTen returns true strictly for single-door rooms with <= 5 alive members', () => {
  assert.equal(shouldUseBestOfTen([{}], [1, 2, 3, 4, 5]), true);
  assert.equal(shouldUseBestOfTen([{}], [1, 2, 3]), true);
  assert.equal(shouldUseBestOfTen([{}], [1, 2, 3, 4, 5, 6]), false);
  assert.equal(shouldUseBestOfTen([{}, {}], [1, 2, 3, 4, 5]), false);
  assert.equal(shouldUseBestOfTen([{}], []), false);
});

test('runSingleDoorBestOfTen executes 10 WASM runs and selects the best outcome by win > 0 casualties > HP/energy score', async () => {
  const seenSeeds = [];
  const mockSim = async (_battle, seed) => {
    seenSeeds.push(seed);
    const idx = seenSeeds.length - 1;
    // Run 0: defeat
    if (idx === 0) {
      return {
        win: false,
        stars: 0,
        seed,
        attackers: { '4020': { hp: 0, maxHp: 1000, energy: 0, isDead: true, hpDelta: -1000 } },
        endArgs: { seed },
      };
    }
    // Run 1: win with 1 casualty
    if (idx === 1) {
      return {
        win: true,
        stars: 2,
        seed,
        attackers: {
          '4020': { hp: 0, maxHp: 1000, energy: 0, isDead: true, hpDelta: -1000 },
          '4021': { hp: 900, maxHp: 1000, energy: 800, isDead: false, hpDelta: -100 },
        },
        endArgs: { seed },
      };
    }
    // Run 6: best flawless victory (tank 95% HP, positive energy 900)
    if (idx === 6) {
      return {
        win: true,
        stars: 3,
        seed,
        attackers: {
          '4020': { hp: 950, maxHp: 1000, energy: 900, isDead: false, hpDelta: 50 },
          '4021': { hp: 980, maxHp: 1000, energy: 800, isDead: false, hpDelta: 20 },
        },
        endArgs: { seed, bestMarker: true },
      };
    }
    // Other runs: weaker flawless victories (tank 60% HP)
    return {
      win: true,
      stars: 3,
      seed,
      attackers: {
        '4020': { hp: 600, maxHp: 1000, energy: 300, isDead: false, hpDelta: -400 },
        '4021': { hp: 700, maxHp: 1000, energy: 300, isDead: false, hpDelta: -300 },
      },
      endArgs: { seed },
    };
  };

  const report = await runSingleDoorBestOfTen({ seed: 123456 }, mockSim, {
    frontlineId: 4020,
    minHpThresholdPct: 20,
  });

  assert.equal(report.roundsRun, SINGLE_DOOR_SIM_ROUNDS);
  assert.equal(seenSeeds.length, 10);
  assert.equal(seenSeeds[0], 123456, 'First run must use canonical server seed');
  assert.equal(new Set(seenSeeds).size, 10, 'All 10 candidate seeds must be distinct');
  assert.equal(report.wins, 9);
  assert.equal(report.zeroCasualtyWins, 8);
  assert.equal(report.bestIndex, 6);
  assert.equal(report.bestOutcome.endArgs.bestMarker, true);
  assert.equal(report.bestScore.tankHpEndPct, 95);
});

test('executeDungeonAutomationStep runs Best-of-10 on single-door <=5 earth room and auto-claims 5-floor checkpoint', async () => {
  const rpcCalls = [];
  const simSeeds = [];

  const cache = {
    value: {
      dungeonStatus: {
        data: {
          floorNumber: 585,
          floorType: 'battle',
          respawnFloor: 576,
          currentFloorDoors: [
            { attackerType: 'earth', team: [{ id: 4020, power: 50000 }] },
          ],
          states: {
            titans: {
              '4020': { hp: 900000, maxHp: 1000000, energy: 500, isDead: false },
              '4021': { hp: 700000, maxHp: 700000, energy: 500, isDead: false },
              '4022': { hp: 800000, maxHp: 800000, energy: 500, isDead: false },
              '4023': { hp: 800000, maxHp: 800000, energy: 500, isDead: false },
              '4024': { hp: 400000, maxHp: 400000, energy: 500, isDead: false },
            },
          },
        },
      },
      titanGetAll: {
        data: {
          '4020': { id: 4020, hp: 1000000 },
          '4021': { id: 4021, hp: 700000 },
          '4022': { id: 4022, hp: 800000 },
          '4023': { id: 4023, hp: 800000 },
          '4024': { id: 4024, hp: 400000 },
        },
      },
    },
  };

  const dispatchRpc = async (calls) => {
    for (const c of calls) rpcCalls.push(c.name);
    const name = calls[0]?.name;
    if (name === 'dungeonStartBattle') {
      return { results: [{ result: { response: { seed: 777001, attackers: {}, defenders: {} } } }] };
    }
    if (name === 'dungeonEndBattle') {
      // Floor 585 real server behavior: dungeon is null until dungeonSaveProgress is called
      return { results: [{ result: { response: { reward: { dungeonActivity: 15 }, dungeon: null } } }] };
    }
    if (name === 'dungeonSaveProgress') {
      return {
        results: [{ result: { response: { reward: { gold: 49600 }, dungeon: { floorNumber: 586, floorType: 'battle', respawnFloor: 581 } } } }],
      };
    }
    return { results: [{ result: { response: {} } }] };
  };

  const simulateFn = async (_raw, seed) => {
    simSeeds.push(seed);
    return {
      win: true,
      stars: 3,
      duration: 18,
      seed,
      attackers: {
        '4020': { hp: 850000, maxHp: 1000000, energy: 700, isDead: false, hpDelta: -50000 },
        '4021': { hp: 680000, maxHp: 700000, energy: 600, isDead: false, hpDelta: -20000 },
        '4022': { hp: 780000, maxHp: 800000, energy: 600, isDead: false, hpDelta: -20000 },
        '4023': { hp: 790000, maxHp: 800000, energy: 600, isDead: false, hpDelta: -10000 },
        '4024': { hp: 380000, maxHp: 400000, energy: 600, isDead: false, hpDelta: -20000 },
      },
      defenders: {},
      endArgs: {
        result: { win: true, stars: 3 },
        progress: [{
          seed,
          attackers: {
            heroes: {
              '4020': { hp: 850000, energy: 700, isDead: false },
              '4021': { hp: 680000, energy: 600, isDead: false },
              '4022': { hp: 780000, energy: 600, isDead: false },
              '4023': { hp: 790000, energy: 600, isDead: false },
              '4024': { hp: 380000, energy: 600, isDead: false },
            },
          },
        }],
      },
    };
  };

  const step = await executeDungeonAutomationStep({
    cache,
    dispatchRpc,
    simulateFn,
    safetyThresholdPct: 20,
    targetTitanite: 150,
    todayTitanite: 90,
    singleDoorBestOf10: true,
  });

  assert.equal(step.stopped, undefined);
  assert.equal(step.floorPassed, 585);
  assert.equal(simSeeds.length, 10, 'Must run 10 simulations for single-door <=5 earth roster');
  assert.equal(step.bestOfTenReport?.roundsRun, 10);
  assert.equal(step.checkpointClaimed, true, 'Must auto-claim 5-floor checkpoint at floor 585');
  assert.equal(step.checkpointGold, 49600);
  assert.deepEqual(rpcCalls, [
    'dungeonStartBattle',
    'dungeonEndBattle',
    'dungeonSaveProgress',
    'dungeonGetInfo',
  ]);
});

test('executeDungeonAutomationStep stops cleanly when Target Titanite is reached', async () => {
  const step = await executeDungeonAutomationStep({
    cache: { value: {} },
    dispatchRpc: async () => ({ results: [] }),
    targetTitanite: 150,
    todayTitanite: 150,
  });
  assert.equal(step.done, true);
  assert.equal(step.stopped, true);
  assert.match(step.stopReason || '', /Target Titanite reached/);
});

test('DungeonModal keeps single Auto Attack button, compact config bar, and no redundant % 10 checkpoint bug', () => {
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dialogs', 'DungeonModal.vue'), 'utf8');
  assert.equal((modalSrc.match(/id="dungeon-auto-btn"/g) || []).length, 1, 'Must keep single #dungeon-auto-btn');
  assert.match(modalSrc, /id="dungeon-auto-config-bar"/);
  assert.match(modalSrc, /id="dungeon-target-titanite-select"/);
  assert.match(modalSrc, /id="dungeon-best10-checkbox"/);

  const runnerSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'queues', 'dungeonAutomationRunner.ts'), 'utf8');
  assert.ok(!runnerSrc.includes('floorNumber % 10 === 0'), 'Outdated % 10 checkpoint check must be removed');
  assert.match(runnerSrc, /needsFiveFloorCheckpointClaim/);
  assert.match(runnerSrc, /runSingleDoorBestOfTen/);

  const simSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dialogs', 'DungeonSimModal.vue'), 'utf8');
  assert.ok(!simSrc.includes('curFloor % 10 === 0'), 'Outdated % 10 checkpoint check in DungeonSimModal must be removed');
  assert.match(simSrc, /id="dungeon-sim-best10-summary"/);

  // P2-17 selectors: tank switch, force-majeure, ordered pool panel, unified compact combat log grid & tooltip
  assert.match(modalSrc, /id="dungeon-tank-switch-select"/);
  assert.match(modalSrc, /id="dungeon-force-majeure-checkbox"/);
  assert.match(modalSrc, /id="dungeon-pool-config-toggle"/);
  assert.match(modalSrc, /id="dungeon-pool-config-panel"/);
  assert.match(modalSrc, /id="dungeon-combat-log-grid"/);
  assert.match(modalSrc, /id="dungeon-log-card-tooltip"/);
});

test('areAllDoorsPoolDepleted returns true only when all available doors have 1..5 alive titans', () => {
  assert.equal(areAllDoorsPoolDepleted([5]), true);
  assert.equal(areAllDoorsPoolDepleted([4, 5]), true);
  assert.equal(areAllDoorsPoolDepleted([5, 6]), false);
  assert.equal(areAllDoorsPoolDepleted([0, 5]), false);
  assert.equal(areAllDoorsPoolDepleted([]), false);
});

test('mergeClearedRoomEntry deduplicates by (floor, door) and preserves rich auto metadata', () => {
  const base = mergeClearedRoomEntry([], {
    id: 'auto_581_1',
    floor: 581,
    door: 1,
    element: 'Water',
    source: 'auto',
    win: true,
    stars: 3,
    casualties: 0,
    fallenTitans: [],
    tankLossPct: 8.5,
    teamLossPct: 2.1,
    switchedTankFrom: 'Sigurd',
    switchedTankTo: 'Brustar',
    timestamp: '2026-11-26T03:00:00.000Z',
  });
  assert.equal(base.length, 1);

  // Merging same (floor, door) updates in place without duplicating
  const merged = mergeClearedRoomEntry(base, {
    id: 'casualty_581_1',
    floor: 581,
    door: 1,
    element: 'Water',
    source: 'manual',
    win: true,
    stars: 3,
    casualties: 0,
    fallenTitans: [],
    timestamp: '2026-11-26T03:00:05.000Z',
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].tankLossPct, 8.5);
  assert.equal(merged[0].switchedTankTo, 'Brustar');

  const added = mergeClearedRoomEntry(merged, {
    id: 'manual_582_2',
    floor: 582,
    door: 2,
    element: 'Fire',
    source: 'manual',
    win: true,
    stars: 2,
    casualties: 1,
    fallenTitans: ['Moloch'],
    timestamp: '2026-11-26T03:01:00.000Z',
  });
  assert.equal(added.length, 2);
  assert.equal(added[1].source, 'manual');
  assert.equal(added[1].casualties, 1);
});
