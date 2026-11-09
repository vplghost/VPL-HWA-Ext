import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const rpcCacheJs = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const dungeonAutoJs = await readFile(new URL('../extension/dungeon-automation.js', import.meta.url), 'utf8');
const titanMetaJs = await readFile(new URL('../extension/titan-metadata.js', import.meta.url), 'utf8');

const rpcContext = {
  Date,
  TextEncoder,
  globalThis: {}
};
vm.runInNewContext(rpcCacheJs, rpcContext);
const cacheModule = rpcContext.globalThis.hwaHelperRpcCache;

const autoContext = {
  Date,
  globalThis: {}
};
vm.runInNewContext(titanMetaJs, autoContext);
vm.runInNewContext(dungeonAutoJs, autoContext);
const dungeonAuto = autoContext.globalThis.hwaHelperDungeonAutomation;

test('rpc-cache extracts dungeonStartBattle activeBattle state and dungeonEndBattle clears it', () => {
  const startRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-09T06:05:35.000Z',
    requestBody: JSON.stringify({
      calls: [
        {
          name: 'dungeonStartBattle',
          ident: 'call-start-1',
          args: { heroes: [4000, 4001, 4004, 4002, 4053], teamNum: 1 }
        }
      ]
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'call-start-1',
          result: { response: { attackers: {}, defenders: [] } }
        }
      ]
    })
  };

  const extractedStart = cacheModule.extract(startRecord);
  const startStatusAction = extractedStart.find((a) => a.key === 'dungeonStatus');
  assert.ok(startStatusAction, 'dungeonStartBattle should produce dungeonStatus action');
  assert.equal(startStatusAction.data.activeBattle.teamNum, 1);
  assert.deepEqual([...startStatusAction.data.activeBattle.heroes], [4000, 4001, 4004, 4002, 4053]);

  // Merge into initial cache
  const initial = {
    dungeonStatus: {
      key: 'dungeonStatus',
      data: {
        floorNumber: 781,
        maxFloorPassed: 780,
        states: {
          titans: {
            '4000': { isDead: false, hp: 988545, maxHp: 1469630, energy: 959 }
          }
        }
      }
    }
  };

  const { cache: cacheWithBattle } = cacheModule.merge(initial, [startRecord]);
  assert.ok(cacheWithBattle.dungeonStatus.data.activeBattle);
  assert.equal(cacheWithBattle.dungeonStatus.data.activeBattle.teamNum, 1);
  assert.equal(cacheWithBattle.dungeonStatus.data.floorNumber, 781);

  // Now end battle
  const endRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: '2026-11-09T06:05:58.000Z',
    requestBody: JSON.stringify({
      calls: [
        {
          name: 'dungeonEndBattle',
          ident: 'call-end-1',
          args: { result: { win: true, stars: 3 }, progress: [] }
        }
      ]
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 'call-end-1',
          result: {
            response: {
              reward: { dungeonActivity: 12 },
              dungeon: {
                floorNumber: 782,
                maxFloorPassed: 781,
                elements: { prime: 'earth', nonprime: ['water', 'fire'] },
                floor: {
                  userData: [
                    { attackerType: 'water', defenderType: 'fire', power: 42360 }
                  ]
                }
              }
            }
          }
        }
      ]
    })
  };

  const { cache: cacheAfterEnd } = cacheModule.merge(cacheWithBattle, [endRecord]);
  assert.equal(cacheAfterEnd.dungeonStatus.data.activeBattle, null, 'dungeonEndBattle should clear activeBattle');
  assert.equal(cacheAfterEnd.dungeonStatus.data.floorNumber, 782);
  assert.equal(cacheAfterEnd.dungeonStatus.data.lastBattleResult.win, true);
  assert.equal(cacheAfterEnd.dungeonStatus.data.lastBattleResult.stars, 3);
});

test('dungeonAutomation evaluates lineups and titan health properly', () => {
  assert.equal(dungeonAuto.isTitanAlive({ isDead: false, hp: 100 }), true);
  assert.equal(dungeonAuto.isTitanAlive({ isDead: true, hp: 0 }), false);
  assert.equal(dungeonAuto.isTitanAlive({ isDead: false, hp: 0 }), false);
  assert.equal(dungeonAuto.isTitanAlive(null), true); // Unrecorded means no casualty

  const heroes = [4000, 4001, 4002];
  const allAliveStates = {
    '4000': { isDead: false, hp: 500 },
    '4001': { isDead: false, hp: 300 },
    '4002': { isDead: false, hp: 200 }
  };
  const intact = dungeonAuto.checkLineupIntactness(heroes, allAliveStates);
  assert.equal(intact.isIntact, true);
  assert.equal(intact.deadTitans.length, 0);
  assert.equal(intact.aliveCount, 3);

  const casualtyStates = {
    '4000': { isDead: false, hp: 500 },
    '4001': { isDead: true, hp: 0 },
    '4002': { isDead: false, hp: 200 }
  };
  const defective = dungeonAuto.checkLineupIntactness(heroes, casualtyStates);
  assert.equal(defective.isIntact, false);
  assert.deepEqual([...defective.deadTitans], [4001]);
  assert.equal(defective.aliveCount, 2);
});

test('dungeonAutomation selects intact door and halts when all doors have casualties', () => {
  const doors = [
    { attackerType: 'water', defenderType: 'fire', power: 42000 },
    { attackerType: 'fire', defenderType: 'earth', power: 14000 }
  ];

  const cache = {
    teamGetAll: {
      data: {
        dungeon_water: [4000, 4001, 4052, 4004, 4002],
        dungeon_fire: [4010, 4011, 4013, 4012]
      }
    },
    dungeonStatus: {
      data: {
        floorNumber: 785,
        elements: { prime: 'earth', nonprime: ['water', 'fire'] },
        currentFloorDoors: doors,
        states: {
          titans: {
            '4000': { isDead: false, hp: 900000 },
            '4001': { isDead: false, hp: 700000 },
            '4052': { isDead: false, hp: 600000 },
            '4004': { isDead: false, hp: 750000 },
            '4002': { isDead: false, hp: 800000 },
            // Fire titan 4013 has fallen!
            '4013': { isDead: true, hp: 0 }
          }
        }
      }
    }
  };

  // Case 1: Door 0 is intact (water), Door 1 is defective (fire has 4013 fallen)
  const selection1 = dungeonAuto.selectBestDoor(doors, cache);
  assert.equal(selection1.canAttack, true);
  assert.equal(selection1.chosen.teamNum, 0, 'Should select Door 0 (water) because water is intact');
  assert.equal(selection1.evaluations[1].canAttack, false, 'Door 1 must be disqualified due to casualty');
  assert.ok(selection1.evaluations[1].disqualificationReason.includes('4013'));

  // Test planDungeon in Case 1
  const plan1 = dungeonAuto.planDungeon(cache);
  assert.equal(plan1.kind, 'battle');
  assert.equal(plan1.teamNum, 0);
  assert.deepEqual([...plan1.heroes], [4000, 4001, 4052, 4004, 4002]);

  // Case 2: Water titan also falls! Both lineups now have casualties -> HALT
  cache.dungeonStatus.data.states.titans['4000'] = { isDead: true, hp: 0 };
  const selection2 = dungeonAuto.selectBestDoor(doors, cache);
  assert.equal(selection2.canAttack, false, 'Must not attack when all doors have casualties');
  assert.equal(selection2.chosen, null);
  assert.ok(selection2.reason.includes('Halting dungeon automation'));

  // Test planDungeon in Case 2
  const plan2 = dungeonAuto.planDungeon(cache);
  assert.equal(plan2.kind, 'stop');
  assert.ok(plan2.reason.includes('Halting dungeon automation'));
});

test('dungeonAutomation respects door priority ordering', () => {
  const doors = [
    { attackerType: 'water', defenderType: 'fire', power: 42000 },
    { attackerType: 'earth', defenderType: 'water', power: 25000 }
  ];

  const cache = {
    teamGetAll: {
      data: {
        dungeon_water: [4000, 4001, 4052, 4004, 4002],
        dungeon_earth: [4020, 4022, 4024, 4023, 4021]
      }
    },
    dungeonStatus: {
      data: {
        floorNumber: 786,
        elements: { prime: 'earth', nonprime: ['water', 'fire'] },
        currentFloorDoors: doors,
        states: { titans: {} } // all healthy
      }
    }
  };

  // Earth is Prime today. With default priority ['prime', 'water', 'earth', 'neutral', 'fire'],
  // earth door matches prime, so it takes priority over water!
  const selectionPrime = dungeonAuto.selectBestDoor(doors, cache);
  assert.equal(selectionPrime.canAttack, true);
  assert.equal(selectionPrime.chosen.teamNum, 1, 'Earth door should be prioritized because it is Prime element');

  // Custom priority where user prefers water over prime/earth
  const customOptions = { doorPriority: ['water', 'earth', 'neutral', 'fire'] };
  const selectionCustom = dungeonAuto.selectBestDoor(doors, cache, customOptions);
  assert.equal(selectionCustom.canAttack, true);
  assert.equal(selectionCustom.chosen.teamNum, 0, 'Water door should be prioritized when user doorPriority specifies water first');
});

test('replaying sample tracking file verify startBattle, endBattle and saveProgress lifecycle', async () => {
  const raw = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-game-record-202611091315_dungeon.json', import.meta.url), 'utf8'));
  let currentCache = {};
  let startBattleCount = 0;
  let endBattleCount = 0;
  let saveProgressCount = 0;

  for (const item of raw.timeline) {
    if (item.kind === 'api' && item.requestBody) {
      const req = JSON.parse(item.requestBody);
      const startCall = req.calls?.find((c) => c.name === 'dungeonStartBattle');
      const endCall = req.calls?.find((c) => c.name === 'dungeonEndBattle');
      const saveCall = req.calls?.find((c) => c.name === 'dungeonSaveProgress');

      if (startCall || endCall || saveCall) {
        const mockRecord = {
          method: item.method || 'POST',
          status: item.status || 200,
          endpoint: item.endpoint,
          timestamp: item.timestamp,
          requestBody: item.requestBody,
          responseBody: item.responseBody
        };
        const { cache: nextCache } = cacheModule.merge(currentCache, [mockRecord]);
        currentCache = nextCache;

        if (startCall) {
          startBattleCount++;
          assert.ok(currentCache.dungeonStatus?.data?.activeBattle, 'activeBattle must be populated on dungeonStartBattle');
          assert.equal(currentCache.dungeonStatus.data.activeBattle.teamNum, startCall.args.teamNum);
        }
        if (endCall) {
          endBattleCount++;
          assert.equal(currentCache.dungeonStatus?.data?.activeBattle, null, 'activeBattle must be null after dungeonEndBattle');
          assert.ok(currentCache.dungeonStatus?.data?.lastBattleResult);
        }
        if (saveCall) {
          saveProgressCount++;
          assert.equal(currentCache.dungeonStatus?.data?.activeBattle, null);
        }
      }
    }
  }

  assert.equal(startBattleCount, 41, 'Should process all 41 dungeonStartBattle calls');
  assert.equal(endBattleCount, 41, 'Should process all 41 dungeonEndBattle calls');
  assert.equal(saveProgressCount, 8, 'Should process all 8 dungeonSaveProgress calls');
});
