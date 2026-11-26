import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getEffectiveTitanStates,
  resetTitanStates,
  getLineupForDoor,
  evaluateDoor
} from '../src/services/queues/dungeonAutomation.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

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

test('rpcCacheService persists real knownMaxHp from dungeonStartBattle/dungeonEndBattle across fresh-day reset', () => {
  const day1Start = '2026-11-25T10:00:00.000Z';
  const day1End = '2026-11-25T10:02:00.000Z';
  const day2Reload = '2026-11-26T06:58:00.000Z';
  const makeRpcRecord = (timestamp, calls, results) => ({
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp,
    requestBody: JSON.stringify({ calls }),
    responseBody: JSON.stringify({ results }),
  });

  let cache = {};

  // 1. Day 1 dungeonStartBattle provides real titan HP in attackers[id].hp
  const startRecord = makeRpcRecord(
    day1Start,
    [{ ident: 'c1', name: 'dungeonStartBattle', args: { teamNum: 0, heroes: [4000, 4001] } }],
    [{
      ident: 'c1',
      result: {
        response: {
          seed: 12345,
          attackers: {
            '4000': { id: 4000, hp: 3845120, level: 120, star: 6 },
            '4001': { id: 4001, hp: 1620400, level: 120, star: 6 }
          },
          defenders: {}
        }
      }
    }]
  );
  cache = rpcCacheService.merge(cache, [startRecord]).cache;
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4000'], 3845120);
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4001'], 1620400);

  // 2. Day 1 dungeonEndBattle updates states.titans with maxHp
  const endRecord = makeRpcRecord(
    day1End,
    [{ ident: 'c2', name: 'dungeonEndBattle', args: { result: { win: true, stars: 3 } } }],
    [{
      ident: 'c2',
      result: {
        response: {
          dungeon: {
            floorNumber: 550,
            states: {
              titans: {
                '4000': { hp: 2900000, maxHp: 3845120, energy: 700, isDead: false },
                '4004': { hp: 1400000, maxHp: 2150000, energy: 400, isDead: false }
              }
            }
          }
        }
      }
    }]
  );
  cache = rpcCacheService.merge(cache, [endRecord]).cache;
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4004'], 2150000);

  // 3. Day 2 fresh reload: dungeonGetInfo returns empty states.titans = {}
  const reloadRecord = makeRpcRecord(
    day2Reload,
    [{ ident: 'c3', name: 'dungeonGetInfo', args: {} }],
    [{
      ident: 'c3',
      result: {
        response: {
          floorNumber: 551,
          states: { titans: {} }
        }
      }
    }]
  );
  cache = rpcCacheService.merge(cache, [reloadRecord]).cache;
  assert.deepEqual(cache.dungeonStatus.data.states.titans, {});
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4000'], 3845120, 'knownMaxHp must survive daily reset');
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4001'], 1620400);
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4004'], 2150000);

  // 4. Fresh-day titanGetAll (real server payload without hp field)
  cache.titanGetAll = {
    data: {
      '4000': { id: 4000, level: 120, star: 6, power: 150000 },
      '4001': { id: 4001, level: 120, star: 6, power: 140000 },
      '4020': { id: 4020, level: 100, star: 5, power: 95000 } // Never fought yet -> unknown maxHp
    }
  };

  const effective = getEffectiveTitanStates(cache, new Date(day2Reload).getTime());

  // Previously seen titan uses real knownMaxHp
  assert.equal(effective['4000'].hasKnownMaxHp, true);
  assert.equal(effective['4000'].maxHp, 3845120);
  assert.equal(effective['4000'].hp, 3845120);
  assert.equal(effective['4000'].isDead, false);

  // Unseen titan does NOT fabricate 1,000,000
  assert.equal(effective['4020'].hasKnownMaxHp, false);
  assert.notEqual(effective['4020'].maxHp, 1000000);
  assert.equal(effective['4020'].hp, effective['4020'].maxHp);
  assert.equal(effective['4020'].isDead, false);

  // resetTitanStates preserves knownMaxHp
  resetTitanStates(cache);
  assert.equal(cache.dungeonStatus.data.knownMaxHp['4000'], 3845120);
});

test('DungeonModal.vue renders Full (100%) fallback instead of fake 1,000,000 when maxHp is unknown', () => {
  const modalSource = fs.readFileSync(
    new URL('../src/components/dialogs/DungeonModal.vue', import.meta.url),
    'utf8'
  );
  assert.match(modalSource, /hasKnownMaxHp:\s*state\.hasKnownMaxHp !== false/);
  assert.match(modalSource, /t\.hasKnownMaxHp/);
  assert.match(modalSource, /Full \(\$\{t\.hpPct\}%\)/);
});
