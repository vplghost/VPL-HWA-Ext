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
  hasHealingTitan,
  hasMajorHealingTitan,
  HEALING_TITAN_IDS,
  MAJOR_HEALING_TITAN_IDS,
  MINOR_HEALING_TITAN_IDS,
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

test('buildSimulatedEndBattleArgs produces valid dungeonEndBattle args with metrics and tuning options', () => {
  const record = {
    playerTeam: [4000, 4001],
    stars: 3,
    duration: 21.5,
    preBattleStats: {
      4000: { hp: 1000000, energy: 500 },
      4001: { hp: 800000, energy: 600 },
    },
    postBattleStats: {
      4000: { hp: 900000, energy: 800, isDead: false },
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

  // Standard (0% bonus)
  const endArgsStandard = buildSimulatedEndBattleArgs(record, startResponse);
  assert.equal(endArgsStandard.result.win, true);
  assert.equal(endArgsStandard.result.stars, 3);
  assert.equal(endArgsStandard.progress[0].seed, 987654321);
  assert.ok(endArgsStandard.progress[0].duration >= 8);
  assert.equal(endArgsStandard.progress[0].attackers.heroes['4000'].isDead, false);
  // curHp 1.1M - 100k lost = 1.0M
  assert.equal(endArgsStandard.progress[0].attackers.heroes['4000'].hp, 1000000);
  assert.equal(endArgsStandard.progress[0].attackers.heroes['4000'].energy, 800);

  // Tuned (+20% HP bonus, +20% Energy bonus)
  // HP lost is reduced by 20%: 100k * 0.8 = 80k. Final HP = 1.1M - 80k = 1.02M
  // Energy 800 * 1.2 = 960
  const endArgsTuned = buildSimulatedEndBattleArgs(record, startResponse, {
    hpBonusPercent: 20,
    energyBonusPercent: 20,
  });
  assert.equal(endArgsTuned.progress[0].attackers.heroes['4000'].hp, 1020000);
  assert.equal(endArgsTuned.progress[0].attackers.heroes['4000'].energy, 960);
  // Titan 4001: energy 750 * 1.2 = 900
  assert.equal(endArgsTuned.progress[0].attackers.heroes['4001'].energy, 900);
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

test('rpcCache does not accumulate battle history across multiple battles and pruneCache cleans legacy bulk', () => {
  const legacyCache = {
    dungeonStatus: {
      key: 'dungeonStatus',
      updatedAt: '2026-11-20T12:00:00.000Z',
      data: {
        floorNumber: 500,
        battleHistory: {
          'e:101_vs_p:201': [{ id: 'b1', win: true }],
          'e:102_vs_p:202': [{ id: 'b2', win: false }],
        }
      }
    }
  };
  const pruned = rpcCacheService.pruneCache(legacyCache);
  assert.equal(pruned.changed, true);
  assert.equal(pruned.cache.dungeonStatus.data.battleHistory, undefined);
});

test('hasHealingTitan and hasMajorHealingTitan accurately identify healer titans', () => {
  assert.equal(hasMajorHealingTitan([4020, 4021, 4022, 4023, 4024]), false); // Earth has no major healer
  assert.equal(hasHealingTitan([4020, 4021, 4022, 4023, 4024]), true); // Avalon/Verdoc minor heal
  assert.equal(hasHealingTitan([4010, 4011, 4012, 4013, 4014]), false); // Fire team has 0 healers
  assert.equal(hasMajorHealingTitan([4010, 4011, 4012, 4013, 4014]), false);
  assert.equal(hasMajorHealingTitan([4000, 4001, 4002, 4003, 4004]), true); // Hyperion & Tydus in Water
  assert.equal(hasMajorHealingTitan([4004]), true); // Tydus (Deep Current 30% max HP team heal + Child of Water)
  assert.equal(hasMajorHealingTitan([4040, 4041, 4042]), true); // Iyari in Light
  assert.equal(hasMajorHealingTitan([4043]), true); // Solaris
  assert.equal(hasMajorHealingTitan([4052]), false); // Orm is minor support, not major team healer
  assert.ok(MAJOR_HEALING_TITAN_IDS.has(4003));
  assert.ok(MAJOR_HEALING_TITAN_IDS.has(4004));
  assert.ok(MAJOR_HEALING_TITAN_IDS.has(4042));
  assert.ok(MINOR_HEALING_TITAN_IDS.has(4022));
  assert.ok(MINOR_HEALING_TITAN_IDS.has(4024));
  assert.ok(MINOR_HEALING_TITAN_IDS.has(4052));
});

test('buildSimulatedEndBattleArgs respects pre-battle HP correlation and caps non-healer team HP', () => {
  // Pure Fire team with 0 healers
  const fireRecord = {
    playerTeam: [4010, 4011],
    stars: 3,
    duration: 15,
    preBattleStats: {
      4010: { hp: 1500000, energy: 500 },
      4011: { hp: 800000, energy: 500 },
    },
    postBattleStats: {
      4010: { hp: 1400000, energy: 700, isDead: false }, // took 100k
      4011: { hp: 800000, energy: 700, isDead: false },
    },
  };

  // Injured Fire team enters: 4010 has 500k HP, 4011 has 600k HP
  const startResponse = {
    seed: 11223344,
    attackers: {
      4010: { hp: 1900000, state: { hp: 500000, energy: 500 } },
      4011: { hp: 800000, state: { hp: 600000, energy: 500 } },
    },
  };

  // 1. Non-healer team: 4011 suffered 0 damage in record, but cannot jump to 800k (capped at curHp 600k)
  const fireArgs = buildSimulatedEndBattleArgs(fireRecord, startResponse, {
    hpBonusPercent: 50,
  });
  assert.equal(fireArgs.progress[0].attackers.heroes['4011'].hp, 600000); // capped at curHp!
  // 4010 took 100k lost, with 50% bonus = 50k lost. 500k - 50k = 450k <= curHp
  assert.equal(fireArgs.progress[0].attackers.heroes['4010'].hp, 450000);

  // 2. Healer team (Hyperion 4003 + Sigurd 4000)
  const waterRecord = {
    playerTeam: [4000, 4003],
    stars: 3,
    duration: 16,
    preBattleStats: {
      4000: { hp: 800000, energy: 500 },
      4003: { hp: 1000000, energy: 500 },
    },
    postBattleStats: {
      4000: { hp: 1100000, energy: 800, isDead: false }, // healed +300k
      4003: { hp: 1000000, energy: 800, isDead: false },
    },
  };

  const waterStart = {
    seed: 556677,
    attackers: {
      4000: { hp: 1200000, state: { hp: 700000, energy: 500 } },
      4003: { hp: 1000000, state: { hp: 1000000, energy: 500 } },
    },
  };

  const waterArgs = buildSimulatedEndBattleArgs(waterRecord, waterStart);
  // Healer active: 4000 can recover +300k from curHp 700k up to 1.0M (<= maxHp 1.2M)
  assert.equal(waterArgs.progress[0].attackers.heroes['4000'].hp, 1000000);
});

test('buildSimulatedEndBattleArgs auto-detects fatal damage on frontline titan and adjusts stars/spillover', () => {
  const record = {
    playerTeam: [4020, 4022, 4021],
    stars: 3,
    duration: 12.8,
    enemyPower: 40000,
    preBattleStats: {
      4020: { hp: 914132, energy: 512 },
      4022: { hp: 880343, energy: 500 },
      4021: { hp: 796742, energy: 500 },
    },
    postBattleStats: {
      4020: { hp: 641879, energy: 500, isDead: false }, // took 272k
      4022: { hp: 880343, energy: 500, isDead: false },
      4021: { hp: 796742, energy: 500, isDead: false },
    },
  };

  // Angus 4020 enters with only 250k HP (cannot survive 272k + energy deficit damage)
  const startResponse = {
    seed: 2767138561,
    attackers: {
      4020: { hp: 1937434, state: { hp: 250000, energy: 200 } }, // 200 energy vs 512 in record
      4022: { hp: 880343, state: { hp: 836745, energy: 200 } },
      4021: { hp: 796742, state: { hp: 796742, energy: 800 } },
    },
  };

  const endArgs = buildSimulatedEndBattleArgs(record, startResponse, {
    hpBonusPercent: 0,
    energyBonusPercent: 0,
    autoDetectDeath: true,
  });

  // Angus suffered fatal damage: omitted from attackers.heroes
  assert.equal(endArgs.progress[0].attackers.heroes['4020'], undefined);
  // Surviving titans: 4022, 4021
  assert.ok(endArgs.progress[0].attackers.heroes['4022']);
  assert.ok(endArgs.progress[0].attackers.heroes['4021']);
  // 1 titan died -> stars is 2
  assert.equal(endArgs.result.stars, 2);
  // Duration padded because frontline fell
  assert.ok(endArgs.progress[0].duration > 20);
  // Next titan 4022 took spillover damage
  assert.ok(endArgs.progress[0].attackers.heroes['4022'].hp < 836745);
});

test('DungeonModal.vue uses interactive simulation modal and removed obsolete history auto-clear buttons', async () => {
  const modalSource = await readFile(new URL('../src/components/dialogs/DungeonModal.vue', import.meta.url), 'utf8');
  const simModalSource = await readFile(new URL('../src/components/dialogs/DungeonSimModal.vue', import.meta.url), 'utf8');

  // Interactive simulation UI is wired
  assert.match(modalSource, /dungeon-door-sim-btn/);
  assert.match(modalSource, /openSimModal/);
  assert.match(modalSource, /<DungeonSimModal/);

  // Obsolete history auto-clear and tuning UI have been completely removed
  assert.equal(modalSource.includes('id="dungeon-export-btn"'), false);
  assert.equal(modalSource.includes('handleExportHistory'), false);
  assert.equal(modalSource.includes('dungeon-simulate-attack-btn'), false);
  assert.equal(modalSource.includes('btn-toggle-dungeon-sim-settings'), false);
  assert.equal(modalSource.includes('dungeon-sim-settings-panel'), false);
  assert.equal(modalSource.includes('dungeon-battle-error-banner'), false);

  // Sequential save progress in DungeonSimModal
  assert.match(simModalSource, /await dispatchRpc\(\[\{\s*name:\s*['"]dungeonEndBattle['"]/);
  assert.match(simModalSource, /await dispatchRpc\(\[\{\s*name:\s*['"]dungeonSaveProgress['"]/);
});
