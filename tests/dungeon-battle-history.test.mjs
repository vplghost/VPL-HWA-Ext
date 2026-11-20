import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getEncounterKey,
  getEnemyKey,
  loadDungeonBattleHistory,
  saveDungeonBattleHistory,
  recordDungeonEncounter,
  extractEncounterFromBattleRpc,
  findMatchingEncounter,
  buildSimulatedEndBattleArgs,
  exportDungeonBattleHistory,
  clearDungeonBattleHistory,
} from '../src/utils/dungeonBattleHistory.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

test('getEncounterKey and getEnemyKey normalize unit order and format correctly', () => {
  const enemyTeam = [4010, 4001, 4024, 4013, 4000];
  const playerTeam = [4053, 4002, 4004, 4001, 4000];

  const encounterKey = getEncounterKey(enemyTeam, playerTeam);
  assert.equal(encounterKey, 'e:4000,4001,4010,4013,4024_vs_p:4000,4001,4002,4004,4053');

  const enemyKey = getEnemyKey(enemyTeam);
  assert.equal(enemyKey, 'e:4000,4001,4010,4013,4024');

  // String IDs and unsorted inputs
  assert.equal(getEnemyKey(['4020', '4011', '4005']), 'e:4005,4011,4020');
});

test('recordDungeonEncounter persists records grouped by encounter key', async () => {
  const mockStorage = {
    store: {},
    async get(key) {
      return { [key]: this.store[key] };
    },
    async set(items) {
      Object.assign(this.store, items);
    },
  };

  const sampleRecord = {
    id: 'test_1',
    floor: 782,
    door: 0,
    timestamp: '2026-11-20T00:00:00.000Z',
    date: Date.parse('2026-11-20T00:00:00.000Z'),
    enemyTeam: [
      { id: 4010, level: 53, star: 5, power: 13000 },
      { id: 4013, level: 52, star: 5, power: 12000 },
    ],
    playerTeam: [4000, 4001],
    enemyPower: 25000,
    playerPower: 30000,
    duration: 18.5,
    win: true,
    stars: 3,
    preBattleStats: {
      4000: { hp: 1000000, energy: 500 },
      4001: { hp: 800000, energy: 600 },
    },
    postBattleStats: {
      4000: { hp: 950000, energy: 800, isDead: false },
      4001: { hp: 780000, energy: 750, isDead: false },
    },
  };

  const { key, history } = await recordDungeonEncounter(sampleRecord, mockStorage);
  assert.equal(key, 'e:4010,4013_vs_p:4000,4001');
  assert.equal(history[key]?.length, 1);
  assert.equal(history[key][0].id, 'test_1');

  // Add another record under same key
  const sampleRecord2 = {
    ...sampleRecord,
    id: 'test_2',
    duration: 16.2,
    date: Date.parse('2026-11-20T01:00:00.000Z'),
  };
  const res2 = await recordDungeonEncounter(sampleRecord2, mockStorage);
  assert.equal(res2.history[key]?.length, 2);

  // Reloading from storage retains both
  const loaded = await loadDungeonBattleHistory(mockStorage);
  assert.equal(loaded[key]?.length, 2);
});

test('extractEncounterFromBattleRpc captures genuine RPC metrics and payloads', () => {
  const activeBattle = {
    teamNum: 0,
    heroes: [4000, 4001, 4004, 4002, 4053],
    floorNumber: 782,
    startCall: {
      name: 'dungeonStartBattle',
      args: { heroes: [4000, 4001, 4004, 4002, 4053], teamNum: 0 },
    },
    startResponse: {
      seed: 3424911410,
      attackers: {
        4000: { id: 4000, power: 12871, hp: 1469630, state: { hp: 988545, energy: 959, isDead: false } },
        4001: { id: 4001, power: 8874, hp: 745452, state: { hp: 745452, energy: 1000, isDead: false } },
        4004: { id: 4004, power: 7341, hp: 799199, state: { hp: 799199, energy: 500, isDead: false } },
        4002: { id: 4002, power: 8769, hp: 828707, state: { hp: 828707, energy: 600, isDead: false } },
        4053: { id: 4053, power: 16565, hp: 1594552, state: { hp: 1313218, energy: 700, isDead: false } },
      },
      defenders: [
        {
          1: { id: 4013, level: 52, star: 5, power: 12899 },
          2: { id: 4024, level: 60, star: 5, power: 13042 },
          3: { id: 4000, level: 52, star: 5, power: 12897 },
          4: { id: 4001, level: 52, star: 5, power: 12896 },
          5: { id: 4010, level: 53, star: 5, power: 13278 },
        },
      ],
    },
  };

  const endCall = {
    name: 'dungeonEndBattle',
    args: {
      result: { win: true, stars: 3 },
      progress: [
        {
          defenders: { heroes: {}, input: [] },
          attackers: {
            heroes: {
              4000: { isDead: false, hp: 1129279, energy: 848 },
              4001: { isDead: false, hp: 745452, energy: 700 },
              4004: { isDead: false, hp: 799199, energy: 500 },
              4002: { isDead: false, hp: 828707, energy: 200 },
              4053: { isDead: false, hp: 1323869, energy: 900 },
            },
            input: [],
          },
          duration: 23.6137,
          seed: 3424911410,
        },
      ],
    },
  };

  const endResponse = {
    reward: { dungeonActivity: 12 },
    dungeon: {
      floorNumber: 782,
      states: {
        titans: {
          4000: { isDead: false, hp: 1129279, energy: 848 },
          4001: { isDead: false, hp: 745452, energy: 700 },
        },
      },
    },
  };

  const record = extractEncounterFromBattleRpc(activeBattle, endCall, endResponse, {
    floorNumber: 782,
    timestamp: '2026-11-09T06:05:35.709Z',
  });

  assert.ok(record);
  assert.equal(record.floor, 782);
  assert.equal(record.door, 0);
  assert.equal(record.win, true);
  assert.equal(record.stars, 3);
  assert.equal(record.duration, 23.6137);
  assert.equal(record.playerPower, 54420);
  assert.equal(record.enemyPower, 65012);
  assert.equal(record.enemyTeam.length, 5);
  assert.deepEqual(record.playerTeam, [4000, 4001, 4004, 4002, 4053]);
  assert.equal(record.preBattleStats['4000'].hp, 988545);
  assert.equal(record.postBattleStats['4000'].hp, 1129279);
});

test('findMatchingEncounter matches enemy lineups and ensures player titans are alive', () => {
  const doorEnemies = [
    { id: 4010, level: 55, star: 5 },
    { id: 4013, level: 55, star: 5 },
  ];

  const history = {
    'e:4010,4013_vs_p:4000,4001': [
      {
        id: 'rec_1',
        floor: 600,
        win: true,
        stars: 3,
        date: 1000,
        duration: 15,
        enemyTeam: [{ id: 4010 }, { id: 4013 }],
        playerTeam: [4000, 4001],
      },
      {
        id: 'rec_2',
        floor: 650,
        win: true,
        stars: 3,
        date: 2000,
        duration: 12,
        enemyTeam: [{ id: 4010 }, { id: 4013 }],
        playerTeam: [4000, 4001],
      },
    ],
  };

  // Case 1: Both titans alive
  const aliveTitans = {
    4000: { hp: 500000, isDead: false },
    4001: { hp: 400000, isDead: false },
  };
  const match1 = findMatchingEncounter(doorEnemies, aliveTitans, history);
  assert.ok(match1);
  assert.equal(match1.record.id, 'rec_2'); // Picks most recent

  // Case 2: One player titan is dead
  const deadTitans = {
    4000: { hp: 500000, isDead: false },
    4001: { hp: 0, isDead: true },
  };
  const match2 = findMatchingEncounter(doorEnemies, deadTitans, history);
  assert.equal(match2, null); // Cannot use team with fallen titan

  // Case 3: Door enemies do not match history
  const otherDoor = [{ id: 4022 }, { id: 4020 }];
  const match3 = findMatchingEncounter(otherDoor, aliveTitans, history);
  assert.equal(match3, null);
});

test('buildSimulatedEndBattleArgs produces valid dungeonEndBattle args with metrics', () => {
  const record = {
    playerTeam: [4000, 4001],
    stars: 3,
    duration: 21.5,
    preBattleStats: {
      4000: { hp: 1000000, energy: 500 },
      4001: { hp: 800000, energy: 600 },
    },
    postBattleStats: {
      4000: { hp: 900000, energy: 850, isDead: false },
      4001: { hp: 800000, energy: 750, isDead: false },
    },
  };

  const startResponse = {
    seed: 987654321,
    attackers: {
      4000: { hp: 1200000, state: { hp: 1100000, energy: 400 } },
      4001: { hp: 850000, state: { hp: 850000, energy: 500 } },
    },
  };

  const endArgs = buildSimulatedEndBattleArgs(record, startResponse);

  assert.equal(endArgs.result.win, true);
  assert.equal(endArgs.result.stars, 3);
  assert.equal(endArgs.progress[0].seed, 987654321);
  assert.ok(endArgs.progress[0].duration >= 8);
  assert.equal(endArgs.progress[0].attackers.heroes['4000'].isDead, false);
  assert.ok(endArgs.progress[0].attackers.heroes['4000'].hp > 0);
  assert.equal(endArgs.progress[0].attackers.heroes['4000'].energy, 850);
});

test('rpcCacheService updates battleHistory on dungeonStartBattle and dungeonEndBattle cycle', () => {
  const startRecord = {
    transport: 'fetch',
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    durationMs: 150,
    timestamp: '2026-11-20T02:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{
        name: 'dungeonStartBattle',
        args: { heroes: [4000, 4001], teamNum: 1 },
        ident: 'id_start'
      }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'id_start',
        result: {
          response: {
            seed: 555666777,
            attackers: {
              4000: { hp: 1000000, power: 15000, state: { hp: 1000000, energy: 500 } },
              4001: { hp: 800000, power: 12000, state: { hp: 800000, energy: 500 } },
            },
            defenders: [
              {
                1: { id: 4020, level: 50, star: 4, power: 10000 },
                2: { id: 4021, level: 50, star: 4, power: 11000 },
              }
            ]
          }
        }
      }]
    })
  };

  const endRecord = {
    transport: 'fetch',
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    durationMs: 180,
    timestamp: '2026-11-20T02:00:20.000Z',
    requestBody: JSON.stringify({
      calls: [{
        name: 'dungeonEndBattle',
        args: {
          result: { win: true, stars: 3 },
          progress: [{
            attackers: {
              heroes: {
                4000: { isDead: false, hp: 950000, energy: 900 },
                4001: { isDead: false, hp: 750000, energy: 800 }
              }
            },
            duration: 19.8,
            seed: 555666777
          }]
        },
        ident: 'id_end'
      }]
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'id_end',
        result: {
          response: {
            reward: { consumable: { 20: 25 } },
            dungeon: {
              floorNumber: 501,
              states: {
                titans: {
                  4000: { hp: 950000, energy: 900, isDead: false },
                  4001: { hp: 750000, energy: 800, isDead: false }
                }
              }
            }
          }
        }
      }]
    })
  };

  // 1. Merge start record
  const res1 = rpcCacheService.merge({}, [startRecord]);
  assert.ok(res1.cache.dungeonStatus?.data?.activeBattle);
  assert.equal(res1.cache.dungeonStatus.data.activeBattle.seed, 555666777);

  // 2. Merge end record
  const res2 = rpcCacheService.merge(res1.cache, [endRecord]);
  const history = res2.cache.dungeonStatus?.data?.battleHistory;
  assert.ok(history);
  const expectedKey = 'e:4020,4021_vs_p:4000,4001';
  assert.ok(history[expectedKey]);
  assert.equal(history[expectedKey].length, 1);
  assert.equal(history[expectedKey][0].win, true);
  assert.equal(history[expectedKey][0].duration, 19.8);
});

test('DungeonModal.vue includes #dungeon-export-btn next to refresh button', async () => {
  const source = await readFile(new URL('../src/components/dialogs/DungeonModal.vue', import.meta.url), 'utf8');
  assert.match(source, /id="dungeon-export-btn"/);
  assert.match(source, /handleExportHistory/);
  assert.match(source, /dungeon-simulate-attack-btn/);
});
