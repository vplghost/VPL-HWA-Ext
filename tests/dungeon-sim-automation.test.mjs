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
import { pickSmartSquadForDoor } from '../src/services/queues/dungeonAutomation.ts';

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

    it('allows all titans in neutral (official server name) and mixed doors', () => {
      assert.equal(isTitanEligibleForDoor(4052, 'neutral', { element: 'spirit' }), true);
      assert.equal(isTitanEligibleForDoor(4000, 'neutral', { element: 'water' }), true);
      assert.equal(isTitanEligibleForDoor(4010, 'neutral', { element: 'fire' }), true);
      assert.equal(isTitanEligibleForDoor(4020, 'neutral', { element: 'earth' }), true);
      assert.equal(isTitanEligibleForDoor(4053, 'Neutral', { element: 'spirit' }), true);
      assert.equal(isTitanEligibleForDoor(4052, 'mixed', { element: 'spirit' }), true);
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

    it('resolves Neutral doors with official neutral or legacy mixed savedLineups', () => {
      const states = {
        '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4053': { hp: 1000000, maxHp: 1000000, isDead: false },
      };
      // Test with neutral key
      const savedNeutral = { neutral: [4004, 4053, 4002, 4001, 4000] };
      const squad1 = resolveSquadForDoor('Neutral', states, { savedLineups: savedNeutral });
      assert.deepEqual(squad1, [4004, 4053, 4002, 4001, 4000]);

      // Test with legacy mixed key fallback
      const savedMixed = { mixed: [4000, 4001, 4002, 4004, 4053] };
      const squad2 = resolveSquadForDoor('Neutral', states, { savedLineups: savedMixed });
      assert.deepEqual(squad2, [4000, 4001, 4002, 4004, 4053]);
    });

    it('resolves Neutral doors from custom titan teams when savedLineup is empty', () => {
      const states = {
        '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
        '4053': { hp: 1000000, maxHp: 1000000, isDead: false },
      };
      const customTeams = [
        { id: 'custom_neutral', name: 'My Neutral Squad', type: 'titan', heroIds: [4053, 4004, 4002, 4001, 4000] },
      ];
      const squad = resolveSquadForDoor('Neutral', states, { customTeams });
      assert.deepEqual(squad, [4053, 4004, 4002, 4001, 4000]);
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
            progress: [{
              duration: 12.5,
              seed,
              attackers: {
                heroes: {
                  '4000': { hp: 1000000, energy: 500, isDead: false },
                  '4001': { hp: 1000000, energy: 500, isDead: false },
                  '4052': { hp: 1000000, energy: 500, isDead: false },
                  '4004': { hp: 1000000, energy: 500, isDead: false },
                  '4002': { hp: 1000000, energy: 500, isDead: false },
                },
              },
            }],
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

    it('wraps WebAssembly / IL2CPP runtime errors with granular phase diagnostics in BattleSimError', async () => {
      const { BattleSimError } = await import('../src/utils/dungeonBattleSim.ts');
      
      const simError = new BattleSimError('IL2CPP managed exception in phase \'EXECUTE_BATTLE\'', {
        phase: 'EXECUTE_BATTLE',
        kind: 'managed',
        message: 'IL2CPP managed exception in phase \'EXECUTE_BATTLE\' (Unity engine C# runtime threw an unhandled exception).',
        rawMessage: '[object WebAssembly.Exception]',
        context: {
          battleType: 'dungeon_titan',
          seed: 4177167138,
          attackerIds: ['4000', '4001', '4002', '4004', '4053'],
          defenderCount: 5
        }
      });

      assert.equal(simError.name, 'BattleSimError');
      assert.equal(simError.detail.phase, 'EXECUTE_BATTLE');
      assert.equal(simError.detail.kind, 'managed');
      assert.equal(simError.detail.context.seed, 4177167138);

      globalThis.window = {
        __hwaSimulateBattle: async () => {
          throw simError;
        }
      };

      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 60,
              currentFloorDoors: [{ attackerType: 'mixed', power: 300000 }],
              states: {
                titans: {
                  '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4053': { hp: 1000000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 4177167138 } } }] };
        }
        return { results: [] };
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason, /at \[EXECUTE_BATTLE\]/);
      assert.match(step.stopReason, /IL2CPP managed exception/);
    });

    it('retreats and never submits dungeonEndBattle when post-battle HP drops below safetyThresholdPct', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 70,
              currentFloorDoors: [{ attackerType: 'water', power: 300000 }],
              activeBattle: { teamNum: 0 },
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
        dispatchedCalls.push(...calls);
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 99999 } } }] };
        }
        return { results: [] };
      };

      // Mock Unity simulation: 3 stars win, BUT frontline tank took 90% loss (10% HP remaining < 20% safety threshold)
      globalThis.window = {
        __hwaSimulateBattle: async () => ({
          win: true,
          stars: 3,
          duration: 15,
          seed: 99999,
          attackers: {
            '4000': { hp: 100000, maxHp: 1000000, isDead: false }, // 10% HP
            '4001': { hp: 900000, maxHp: 1000000, isDead: false },
            '4002': { hp: 900000, maxHp: 1000000, isDead: false },
            '4003': { hp: 900000, maxHp: 1000000, isDead: false },
            '4004': { hp: 900000, maxHp: 1000000, isDead: false },
          },
          defenders: {},
          endArgs: {
            result: { win: true, stars: 3 },
            progress: [{ duration: 15 }],
          },
        }),
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
      });

      // Verification of retreat flow:
      assert.equal(step.stopped, true);
      assert.match(step.stopReason, /below 20% safety threshold/);
      assert.match(step.stopReason, /Battle retreated without loss/);

      // CRITICAL: dungeonEndBattle must NEVER be dispatched!
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonEndBattle'), false, 'dungeonEndBattle must NOT be sent to server');
      // dungeonGetInfo must be called to sync/confirm untouched state
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonGetInfo'), true, 'dungeonGetInfo must be called');
      // activeBattle must be cleared in cache
      assert.equal(mockCache.value.dungeonStatus.data.activeBattle, null);
    });

    it('retreats immediately when user requested stop and does not submit dungeonEndBattle', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 71,
              currentFloorDoors: [{ attackerType: 'water', power: 300000 }],
              activeBattle: { teamNum: 0 },
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
        dispatchedCalls.push(...calls);
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 88888 } } }] };
        }
        return { results: [] };
      };

      globalThis.window = {
        __hwaSimulateBattle: async () => ({
          win: true,
          stars: 3,
          duration: 10,
          seed: 88888,
          attackers: {
            '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
          },
          defenders: {},
          endArgs: { result: { win: true, stars: 3 } },
        }),
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        safetyThresholdPct: 20,
        shouldStop: () => true, // User clicked stop during battle simulation
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason, /Automation stopped by user/);
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonEndBattle'), false);
      assert.equal(mockCache.value.dungeonStatus.data.activeBattle, null);
    });

    it('force-majeure mode compares both depleted doors (<=5), re-syncs Door 0 when it has fewer casualties, and submits win', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 901,
              respawnFloor: 900,
              currentFloorDoors: [
                { attackerType: 'water', power: 400000 },
                { attackerType: 'fire', power: 400000 },
              ],
              states: {
                titans: {
                  // Water pool <= 5 (4 alive, Sigurd low HP 15% < 20%)
                  '4000': { hp: 150000, maxHp: 1000000, isDead: false },
                  '4001': { hp: 800000, maxHp: 1000000, isDead: false },
                  '4002': { hp: 800000, maxHp: 1000000, isDead: false },
                  '4004': { hp: 800000, maxHp: 1000000, isDead: false },
                  // Fire pool <= 5 (4 alive, Moloch low HP 15% < 20%)
                  '4010': { hp: 150000, maxHp: 1000000, isDead: false },
                  '4011': { hp: 800000, maxHp: 1000000, isDead: false },
                  '4012': { hp: 800000, maxHp: 1000000, isDead: false },
                  '4013': { hp: 800000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        dispatchedCalls.push(...calls);
        const c = calls[0];
        if (c?.name === 'dungeonStartBattle') {
          return {
            results: [{ result: { response: { seed: c.args.teamNum === 0 ? 111 : 222, teamNum: c.args.teamNum } } }],
          };
        }
        if (c?.name === 'dungeonEndBattle') {
          return { results: [{ result: { response: { dungeon: { floorNumber: 902, floorType: 'battle' } } } }] };
        }
        return { results: [{ result: { response: {} } }] };
      };

      const simulateFn = async (rawBattle, seed) => {
        if (rawBattle.teamNum === 0) {
          // Door 0 (Water): wins with 1 casualty (Sigurd falls)
          return {
            win: true,
            stars: 2,
            duration: 18,
            seed,
            attackers: {
              '4000': { hp: 0, maxHp: 1000000, energy: 0, isDead: true, hpDelta: -150000 },
              '4001': { hp: 700000, maxHp: 1000000, energy: 600, isDead: false, hpDelta: -100000 },
              '4002': { hp: 750000, maxHp: 1000000, energy: 600, isDead: false, hpDelta: -50000 },
              '4004': { hp: 760000, maxHp: 1000000, energy: 600, isDead: false, hpDelta: -40000 },
            },
            defenders: {},
            endArgs: {
              doorMarker: 0,
              result: { win: true, stars: 2 },
              progress: [{
                seed,
                attackers: {
                  heroes: {
                    '4001': { hp: 700000, energy: 600, isDead: false },
                    '4002': { hp: 750000, energy: 600, isDead: false },
                    '4004': { hp: 760000, energy: 600, isDead: false },
                  },
                },
              }],
            },
          };
        }
        // Door 1 (Fire): wins with 2 casualties (worse than Door 0)
        return {
          win: true,
          stars: 1,
          duration: 24,
          seed,
          attackers: {
            '4010': { hp: 0, maxHp: 1000000, energy: 0, isDead: true, hpDelta: -150000 },
            '4011': { hp: 0, maxHp: 1000000, energy: 0, isDead: true, hpDelta: -800000 },
            '4012': { hp: 500000, maxHp: 1000000, energy: 400, isDead: false, hpDelta: -300000 },
            '4013': { hp: 600000, maxHp: 1000000, energy: 400, isDead: false, hpDelta: -200000 },
          },
          defenders: {},
          endArgs: {
            doorMarker: 1,
            result: { win: true, stars: 1 },
            progress: [{
              seed,
              attackers: {
                heroes: {
                  '4012': { hp: 500000, energy: 400, isDead: false },
                  '4013': { hp: 600000, energy: 400, isDead: false },
                },
              },
            }],
          },
        };
      };

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        simulateFn,
        safetyThresholdPct: 20,
        singleDoorBestOf10: false,
        allowCasualtyOnDepletedPool: true,
      });

      assert.equal(step.stopped, undefined);
      assert.equal(step.floorPassed, 901);
      assert.equal(step.doorIdx, 0, 'Must pick Door 0 with 1 casualty over Door 1 with 2 casualties');
      assert.equal(step.forceMajeureUsed, true);
      assert.equal(step.casualties, 1);
      assert.equal(step.clearedRoomEntry?.source, 'auto');
      assert.equal(step.clearedRoomEntry?.forceMajeure, true);

      const startTeamNums = dispatchedCalls
        .filter((c) => c.name === 'dungeonStartBattle')
        .map((c) => c.args.teamNum);
      assert.deepEqual(startTeamNums, [0, 1, 0], 'Must re-sync Door 0 session before submitting dungeonEndBattle');

      const endCall = dispatchedCalls.find((c) => c.name === 'dungeonEndBattle');
      assert.equal(endCall?.args?.doorMarker, 0);
    });

    it('force-majeure mode retreats and stops when no depleted door can win', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 905,
              respawnFloor: 901,
              currentFloorDoors: [
                { attackerType: 'water', power: 999999 },
                { attackerType: 'fire', power: 999999 },
              ],
              states: {
                titans: {
                  '4000': { hp: 100000, maxHp: 1000000, isDead: false },
                  '4010': { hp: 100000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        dispatchedCalls.push(...calls);
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 333 } } }] };
        }
        return { results: [{ result: { response: {} } }] };
      };

      const simulateFn = async (_raw, seed) => ({
        win: false,
        stars: 0,
        duration: 12,
        seed,
        attackers: { '4000': { hp: 0, maxHp: 1000000, energy: 0, isDead: true, hpDelta: -100000 } },
        defenders: {},
        endArgs: { seed },
      });

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        simulateFn,
        safetyThresholdPct: 20,
        singleDoorBestOf10: false,
        allowCasualtyOnDepletedPool: true,
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason || '', /No winnable door found/);
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonEndBattle'), false);
    });

    it('P1-14: blocks dungeonEndBattle and retreats cleanly if endArgs.progress[0].attackers.heroes is empty (prevents full-team wipe)', async () => {
      const dispatchedCalls = [];
      const mockCache = {
        value: {
          dungeonStatus: {
            data: {
              floorNumber: 910,
              respawnFloor: 906,
              currentFloorDoors: [{ attackerType: 'water', power: 300000 }],
              states: {
                titans: {
                  '4000': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4001': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4052': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4004': { hp: 1000000, maxHp: 1000000, isDead: false },
                  '4002': { hp: 1000000, maxHp: 1000000, isDead: false },
                },
              },
            },
          },
        },
      };

      const dispatchRpc = async (calls) => {
        dispatchedCalls.push(...calls);
        if (calls[0]?.name === 'dungeonStartBattle') {
          return { results: [{ result: { response: { seed: 55555 } } }] };
        }
        return { results: [{ result: { response: {} } }] };
      };

      // Corrupted simulator output: claims win:true & 3 stars, but progress[0].attackers.heroes is EMPTY {}
      // (which the server would interpret as all 5 titans dead = full team wipe!)
      const simulateFn = async (_raw, seed) => ({
        win: true,
        stars: 3,
        duration: 15,
        seed,
        attackers: {
          '4000': { hp: 1000000, maxHp: 1000000, energy: 500, isDead: false, hpDelta: 0 },
          '4001': { hp: 1000000, maxHp: 1000000, energy: 500, isDead: false, hpDelta: 0 },
          '4052': { hp: 1000000, maxHp: 1000000, energy: 500, isDead: false, hpDelta: 0 },
          '4004': { hp: 1000000, maxHp: 1000000, energy: 500, isDead: false, hpDelta: 0 },
          '4002': { hp: 1000000, maxHp: 1000000, energy: 500, isDead: false, hpDelta: 0 },
        },
        defenders: {},
        endArgs: {
          result: { win: true, stars: 3 },
          progress: [{ seed, attackers: { heroes: {} }, defenders: { heroes: {} } }],
        },
      });

      const step = await executeDungeonAutomationStep({
        cache: mockCache,
        dispatchRpc,
        simulateFn,
        safetyThresholdPct: 20,
        singleDoorBestOf10: false,
      });

      assert.equal(step.stopped, true);
      assert.match(step.stopReason || '', /0 surviving titans|wipe/i);
      assert.equal(
        dispatchedCalls.some((c) => c.name === 'dungeonEndBattle'),
        false,
        'CRITICAL: dungeonEndBattle MUST NEVER be sent when progress[0].attackers.heroes is empty'
      );
      assert.equal(dispatchedCalls.some((c) => c.name === 'dungeonGetInfo'), true);
    });
  });

  describe('pickSmartSquadForDoor (Ordered Pool & Auto-Switch Tanker)', () => {
    it('respects user-configured ordered pool per room type and includes dual-element Pallant (4050) in Earth', () => {
      const states = {
        '4020': { hp: 900000, maxHp: 1000000, isDead: false },
        '4050': { hp: 950000, maxHp: 1000000, isDead: false },
        '4022': { hp: 900000, maxHp: 1000000, isDead: false },
        '4024': { hp: 900000, maxHp: 1000000, isDead: false },
        '4023': { hp: 900000, maxHp: 1000000, isDead: false },
        '4021': { hp: 900000, maxHp: 1000000, isDead: false },
      };
      const res = pickSmartSquadForDoor('Earth', states, {
        orderedPools: { earth: [4050, 4023, 4022, 4024, 4021, 4020] },
        tankSwitchHpPct: 35,
      });
      assert.deepEqual(res.squadIds, [4050, 4023, 4022, 4024, 4021]);
      assert.equal(res.switchedTankTo, null);
      assert.equal(res.isPoolDepleted, false);
    });

    it('automatically switches to next healthy tank when primary tank HP <= tankSwitchHpPct', () => {
      const states = {
        '4000': { hp: 250000, maxHp: 1000000, isDead: false }, // Sigurd 25% <= 35%
        '4030': { hp: 950000, maxHp: 1000000, isDead: false }, // Brustar 95% > 35%
        '4001': { hp: 900000, maxHp: 1000000, isDead: false },
        '4004': { hp: 900000, maxHp: 1000000, isDead: false },
        '4002': { hp: 900000, maxHp: 1000000, isDead: false },
        '4053': { hp: 900000, maxHp: 1000000, isDead: false },
      };
      const res = pickSmartSquadForDoor('Neutral', states, {
        orderedPools: { neutral: [4000, 4030, 4001, 4004, 4002, 4053] },
        tankSwitchHpPct: 35,
        safetyThresholdPct: 20,
      });
      assert.equal(res.switchedTankFrom, 4000);
      assert.equal(res.switchedTankTo, 4030);
      assert.equal(res.frontlineId, 4030);
      assert.equal(res.squadIds[0], 4030);
      assert.ok(!res.squadIds.includes(4000), 'Low-HP primary tank should be benched when 5 healthier titans exist');
    });

    it('falls back to healthiest alive tank when all tanks are below tankSwitchHpPct', () => {
      const states = {
        '4020': { hp: 150000, maxHp: 1000000, isDead: false }, // Angus 15%
        '4050': { hp: 300000, maxHp: 1000000, isDead: false }, // Pallant 30%
        '4022': { hp: 900000, maxHp: 1000000, isDead: false },
        '4024': { hp: 900000, maxHp: 1000000, isDead: false },
        '4023': { hp: 900000, maxHp: 1000000, isDead: false },
      };
      const res = pickSmartSquadForDoor('Earth', states, {
        orderedPools: { earth: [4020, 4050, 4022, 4024, 4023] },
        tankSwitchHpPct: 35,
        safetyThresholdPct: 20,
      });
      assert.equal(res.switchedTankFrom, 4020);
      assert.equal(res.switchedTankTo, 4050);
      assert.equal(res.squadIds[0], 4050);
      assert.equal(res.squadIds.length, 5);
      assert.equal(res.isPoolDepleted, true);
    });
  });
});
