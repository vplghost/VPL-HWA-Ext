import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateBattleWithUnity,
  simulateBattleLocally,
  calculateHpLossMetrics,
  evaluateDoorSafetyAndLoss,
  isTitanEligibleForDoor,
  DUAL_ELEMENT_TITANS,
} from '../src/utils/dungeonBattleSim.ts';
import {
  resolveSquadForDoor,
  executeDungeonAutomationStep,
} from '../src/services/queues/dungeonAutomationRunner.ts';

describe('Dungeon Simulator & Automation Engine', () => {
  describe('Heuristic Elimination & Unity Simulation Enforcement', () => {
    it('throws when simulateBattleLocally is called, confirming heuristic removal', () => {
      assert.throws(
        () => simulateBattleLocally(),
        /Heuristic battle simulation has been removed\. Only Unity Engine simulation is supported\./
      );
    });
  });
  describe('Dual Element Titans & Door Eligibility', () => {
    it('allows Orm (4052) in Water doors as dual element', () => {
      assert.equal(isTitanEligibleForDoor(4052, 'water', { element: 'spirit' }), true);
      assert.equal(isTitanEligibleForDoor(4052, 'fire', { element: 'spirit' }), false);
      assert.equal(isTitanEligibleForDoor(4052, 'earth', { element: 'spirit' }), false);
      assert.equal(isTitanEligibleForDoor(4052, 'mixed', { element: 'spirit' }), true);
    });

    it('allows Alecto (4051) in Fire doors as dual element', () => {
      assert.equal(isTitanEligibleForDoor(4051, 'fire', { element: 'spirit' }), true);
      assert.equal(isTitanEligibleForDoor(4051, 'water', { element: 'spirit' }), false);
    });

    it('allows Pallant (4050) in Earth doors as dual element', () => {
      assert.equal(isTitanEligibleForDoor(4050, 'earth', { element: 'spirit' }), true);
      assert.equal(isTitanEligibleForDoor(4050, 'water', { element: 'spirit' }), false);
    });

    it('allows standard element titans in their respective doors', () => {
      assert.equal(isTitanEligibleForDoor(4000, 'water', { element: 'water' }), true);
      assert.equal(isTitanEligibleForDoor(4000, 'fire', { element: 'water' }), false);
      assert.equal(isTitanEligibleForDoor(4020, 'earth', { element: 'earth' }), true);
    });
  });

  describe('calculateHpLossMetrics', () => {
    it('prioritizes frontline tank loss with 2x weight', () => {
      // Scenario A: Tank loses 10%, other 4 lose 0% -> tankLoss = 10%, teamLoss = 2%, combined = (10*2)+2 = 22
      const attackersA = {
        '4000': { hp: 900000, maxHp: 1000000, hpDelta: -100000, isDead: false },
        '4001': { hp: 1000000, maxHp: 1000000, hpDelta: 0, isDead: false },
        '4002': { hp: 1000000, maxHp: 1000000, hpDelta: 0, isDead: false },
        '4003': { hp: 1000000, maxHp: 1000000, hpDelta: 0, isDead: false },
        '4004': { hp: 1000000, maxHp: 1000000, hpDelta: 0, isDead: false },
      };
      const metricsA = calculateHpLossMetrics(attackersA, 4000, 20);

      // Scenario B: Tank loses 0%, but backline loses 10% each -> tankLoss = 0%, teamLoss = 8%, combined = (0*2)+8 = 8
      const attackersB = {
        '4000': { hp: 1000000, maxHp: 1000000, hpDelta: 0, isDead: false },
        '4001': { hp: 900000, maxHp: 1000000, hpDelta: -100000, isDead: false },
        '4002': { hp: 900000, maxHp: 1000000, hpDelta: -100000, isDead: false },
        '4003': { hp: 900000, maxHp: 1000000, hpDelta: -100000, isDead: false },
        '4004': { hp: 900000, maxHp: 1000000, hpDelta: -100000, isDead: false },
      };
      const metricsB = calculateHpLossMetrics(attackersB, 4000, 20);

      assert.equal(metricsA.tankLossPct, 10);
      assert.equal(metricsB.tankLossPct, 0);
      assert.equal(metricsA.combinedScore > metricsB.combinedScore, true); // Lower score is better
    });

    it('flags hasCriticalHp when a titan drops below 20% safety threshold', () => {
      const attackers = {
        '4000': { hp: 180000, maxHp: 1000000, hpDelta: -20000, isDead: false }, // 18% HP
        '4001': { hp: 800000, maxHp: 1000000, hpDelta: 0, isDead: false },
      };
      const metrics = calculateHpLossMetrics(attackers, 4000, 20);
      assert.equal(metrics.hasCriticalHp, true);
      assert.equal(metrics.minFinalHpPct, 18);
    });
  });

  describe('evaluateDoorSafetyAndLoss', () => {
    it('disqualifies door if any titan enters with pre-battle HP < 20%', () => {
      const door = { attackerType: 'water', power: 500000 };
      const teamIds = [4000, 4001, 4052, 4004, 4002];
      const states = {
        '4000': { hp: 150000, maxHp: 1000000, isDead: false }, // 15% HP (< 20%)
        '4001': { hp: 900000, maxHp: 1000000, isDead: false },
        '4052': { hp: 900000, maxHp: 1000000, isDead: false },
        '4004': { hp: 900000, maxHp: 1000000, isDead: false },
        '4002': { hp: 900000, maxHp: 1000000, isDead: false },
      };

      const res = evaluateDoorSafetyAndLoss(door, 0, teamIds, states, 20);
      assert.equal(res.isSafe, false);
      assert.match(res.disqualificationReason, /below 20% safety threshold/);
    });

    it('marks door as safe when all titans remain >= 20% HP', () => {
      const door = { attackerType: 'water', power: 500000 };
      const teamIds = [4000, 4001, 4052, 4004, 4002];
      const states = {
        '4000': { hp: 800000, maxHp: 1000000, isDead: false },
        '4001': { hp: 800000, maxHp: 1000000, isDead: false },
        '4052': { hp: 800000, maxHp: 1000000, isDead: false },
        '4004': { hp: 800000, maxHp: 1000000, isDead: false },
        '4002': { hp: 800000, maxHp: 1000000, isDead: false },
      };

      const res = evaluateDoorSafetyAndLoss(door, 0, teamIds, states, 20);
      assert.equal(res.isSafe, true);
      assert.equal(res.disqualificationReason, undefined);
    });
  });

  describe('resolveSquadForDoor', () => {
    it('uses savedLineup first if valid and alive', () => {
      const states = {
        '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4052': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
      };
      const saved = { water: [4052, 4000, 4001, 4004, 4002] };
      const squad = resolveSquadForDoor('Water', states, { savedLineups: saved });
      assert.deepEqual(squad, [4052, 4000, 4001, 4004, 4002]);
    });

    it('falls back to custom titan team if savedLineup is absent', () => {
      const states = {
        '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4003': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
      };
      const customTeams = [
        { id: 'ct1', name: 'Water Squad', type: 'titan', heroIds: [4000, 4001, 4002, 4003, 4004] },
      ];
      const squad = resolveSquadForDoor('Water', states, { customTeams });
      assert.deepEqual(squad, [4000, 4001, 4002, 4003, 4004]);
    });
  });

  describe('executeDungeonAutomationStep', () => {
    it('stops automation when all doors are unsafe due to < 20% titan health', async () => {
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 55,
              currentFloorDoors: [
                { attackerType: 'water', power: 300000 },
                { attackerType: 'fire', power: 300000 },
              ],
              states: {
                titans: {
                  '4000': { hp: 100000, maxHp: 1000000, isDead: false }, // 10% HP
                  '4010': { hp: 100000, maxHp: 1000000, isDead: false }, // 10% HP
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async () => ({ results: [] });

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason, /below 20% safety threshold/);
    });

    it('picks the safest door and dispatches battle RPCs when safe', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 55,
              respawnFloor: 50,
              currentFloorDoors: [
                { attackerType: 'water', power: 300000 },
                { attackerType: 'earth', power: 300000 },
              ],
              states: {
                titans: {
                  '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4052': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4020': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4022': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4024': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4023': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4021': { hp: 1000000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        dispatchedCalls.push(...calls);
        if (calls[0]?.name === 'dungeonStartBattle') {
          return {
            results: [{ result: { response: { seed: 12345 } } }],
          };
        }
        if (calls[0]?.name === 'dungeonEndBattle') {
          return {
            results: [{ result: { response: { success: true } } }],
          };
        }
        return { results: [] };
      };

      globalThis.window = {
        __hwaSimulateBattle: async (_rawBattle, seed) => ({
          win: true,
          stars: 3,
          duration: 12.5,
          seed,
          attackers: {},
          defenders: {},
          endArgs: {
            result: { win: true, stars: 3 },
            progress: [{ duration: 12.5 }]
          }
        })
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
      });

      assert.equal(step.stopped, undefined);
      assert.equal(step.floorPassed, 55);
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonStartBattle'), true);
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonEndBattle'), true);
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonGetInfo'), true);
    });

    it('halts automation and reports error when Unity Engine simulation fails', async () => {
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 55,
              currentFloorDoors: [
                { attackerType: 'water', power: 300000 },
              ],
              states: {
                titans: {
                  '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4003': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 12345 } } }] };
        }
        return { results: [] };
      };

      // Mock Unity engine throwing error
      globalThis.window = {
        __hwaSimulateBattle: async () => {
          throw new Error('WASM table or memory not accessible');
        }
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason, /Unity battle simulation failed/);
    });
  });
});
