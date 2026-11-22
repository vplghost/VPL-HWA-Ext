import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveTitanStates,
  resetTitanStates,
  getLineupForDoor,
  evaluateDoor
} from '../src/services/queues/dungeonAutomation.ts';
import * as cacheModule from '../src/core/cache/index.ts';

test('getEffectiveTitanStates fully heals titans and resets energy to 0 on a new day', () => {
  const now = new Date('2026-11-22T10:00:00.000Z').getTime();
  const yesterdayTime = '2026-11-21T18:00:00.000Z';

  const cache = {
    questResetStatus: {
      data: { nextDayAt: new Date('2026-11-23T05:00:00.000Z').getTime() }
    },
    titanGetAll: {
      data: {
        '4000': { id: 4000, hp: 1200000, level: 80, star: 5 }, // Sigurd (Water tank)
        '4020': { id: 4020, hp: 1500000, level: 80, star: 5 }, // Angus (Earth tank)
        '4010': { id: 4010, hp: 900000, level: 80, star: 5 }   // Moloch (Fire tank)
      }
    },
    dungeonStatus: {
      updatedAt: yesterdayTime,
      data: {
        floorNumber: 520,
        states: {
          titans: {
            '4000': { hp: 0, maxHp: 1200000, energy: 650, isDead: true },
            '4020': { hp: 300000, maxHp: 1500000, energy: 950, isDead: false }
          }
        }
      }
    }
  };

  const effective = getEffectiveTitanStates(cache, now);

  // 1. Titan 4000 was dead yesterday with 0 HP and 650 energy -> Today must be 100% full HP, 0 energy, alive
  assert.equal(effective['4000'].isDead, false, 'Titan 4000 must be revived on new day');
  assert.equal(effective['4000'].hp, 1200000, 'Titan 4000 must have full HP');
  assert.equal(effective['4000'].maxHp, 1200000);
  assert.equal(effective['4000'].energy, 0, 'Titan 4000 energy must be reset to 0');

  // 2. Titan 4020 had 300k HP and 950 energy yesterday -> Today must be 100% full HP, 0 energy, alive
  assert.equal(effective['4020'].isDead, false);
  assert.equal(effective['4020'].hp, 1500000, 'Titan 4020 must have full HP');
  assert.equal(effective['4020'].energy, 0, 'Titan 4020 energy must be reset to 0');

  // 3. Titan 4010 had no state yesterday -> In roster, full HP, 0 energy, alive
  assert.equal(effective['4010'].isDead, false);
  assert.equal(effective['4010'].hp, 900000);
  assert.equal(effective['4010'].energy, 0);
});

test('getEffectiveTitanStates preserves actual casualties and energy for battles fought TODAY', () => {
  const now = new Date('2026-11-22T10:00:00.000Z').getTime();
  const todayTime = '2026-11-22T08:30:00.000Z'; // Today after reset

  const cache = {
    questResetStatus: {
      data: { nextDayAt: new Date('2026-11-23T05:00:00.000Z').getTime() }
    },
    titanGetAll: {
      data: {
        '4000': { id: 4000, hp: 1200000 },
        '4020': { id: 4020, hp: 1500000 }
      }
    },
    dungeonStatus: {
      updatedAt: todayTime,
      data: {
        floorNumber: 521,
        states: {
          titans: {
            '4000': { hp: 0, maxHp: 1200000, energy: 0, isDead: true },
            '4020': { hp: 800000, maxHp: 1500000, energy: 750, isDead: false }
          }
        }
      }
    }
  };

  const effective = getEffectiveTitanStates(cache, now);

  assert.equal(effective['4000'].isDead, true, 'Titan 4000 dead status must be preserved for today');
  assert.equal(effective['4000'].hp, 0);

  assert.equal(effective['4020'].isDead, false);
  assert.equal(effective['4020'].hp, 800000);
  assert.equal(effective['4020'].energy, 750);
});

test('getEffectiveTitanStates honors nextDayAt server reset when calendar date is same', () => {
  // Scenario: Server reset is at 05:00 UTC.
  // Last dungeon battle was at 04:30 UTC (before reset). Current time is 06:00 UTC (after reset, same day!).
  const nextReset = new Date('2026-11-22T05:00:00.000Z').getTime();
  const beforeResetTime = '2026-11-22T04:30:00.000Z';
  const afterResetTime = new Date('2026-11-22T06:00:00.000Z').getTime();

  const cache = {
    questResetStatus: {
      data: { nextDayAt: nextReset + 86400000 }
    },
    titanGetAll: {
      data: {
        '4000': { id: 4000, hp: 1000000 }
      }
    },
    dungeonStatus: {
      updatedAt: beforeResetTime,
      data: {
        states: {
          titans: {
            '4000': { hp: 100, maxHp: 1000000, energy: 900, isDead: false }
          }
        }
      }
    }
  };

  const effective = getEffectiveTitanStates(cache, afterResetTime);
  assert.equal(effective['4000'].hp, 1000000, 'HP must be fully restored across server reset');
  assert.equal(effective['4000'].energy, 0, 'Energy must be reset to 0 across server reset');
});

test('resetTitanStates cleans all in-dungeon states, active battle and todayTitanite', () => {
  const cache = {
    dungeonStatus: {
      data: {
        activeBattle: { startTime: Date.now() },
        todayTitanite: 150,
        states: {
          titans: {
            '4000': { hp: 0, isDead: true }
          }
        }
      }
    }
  };

  resetTitanStates(cache);
  assert.deepEqual(cache.dungeonStatus.data.states.titans, {});
  assert.equal(cache.dungeonStatus.data.activeBattle, null);
  assert.equal(cache.dungeonStatus.data.todayTitanite, 0);
});

test('getLineupForDoor and evaluateDoor pick revived titans on new day', () => {
  const now = new Date('2026-11-22T10:00:00.000Z').getTime();
  const yesterdayTime = '2026-11-21T18:00:00.000Z';

  const cache = {
    questResetStatus: {
      data: { nextDayAt: new Date('2026-11-23T05:00:00.000Z').getTime() }
    },
    titanGetAll: {
      data: {
        '4000': { id: 4000, hp: 1000000 },
        '4001': { id: 4001, hp: 800000 },
        '4052': { id: 4052, hp: 700000 },
        '4004': { id: 4004, hp: 900000 },
        '4002': { id: 4002, hp: 750000 }
      }
    },
    dungeonStatus: {
      updatedAt: yesterdayTime,
      data: {
        elements: { prime: 'water' },
        states: {
          titans: {
            // All water titans were fallen yesterday
            '4000': { isDead: true, hp: 0 },
            '4001': { isDead: true, hp: 0 },
            '4052': { isDead: true, hp: 0 },
            '4004': { isDead: true, hp: 0 },
            '4002': { isDead: true, hp: 0 }
          }
        }
      }
    }
  };

  // Water door
  const door = { attackerType: 'water', defenderType: 'fire', enemies: [{ id: 4010, level: 70 }] };

  // On a new day, getLineupForDoor must successfully select the revived water titans
  const lineup = getLineupForDoor(door, cache);
  assert.equal(lineup.length, 5, 'Must pick 5 alive titans on new day');
  assert.ok(lineup.includes(4000), 'Must include revived Titan 4000');

  // evaluateDoor must recognize the team as intact and viable
  const evalResult = evaluateDoor(door, 0, cache);
  assert.equal(evalResult.canAttack, true);
  assert.equal(evalResult.intactness.isIntact, true);
  assert.equal(evalResult.deadCount, 0);
});
