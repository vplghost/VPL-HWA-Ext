import test from 'node:test';
import assert from 'node:assert/strict';
import {
  definitions,
  getSkillUpgradeGoldCost,
  resolveResourceLabel,
  RESOURCE_TYPES,
  WORLD_MATERIAL_NAMES
} from '../src/core/cache/definitions.ts';
import {
  normalizeArrayData,
  resource,
  inventoryResources,
  resourceAction,
  extractRewardActions,
  extractCostActions,
  routeEstimate
} from '../src/core/cache/extractors/baseExtractor.ts';
import {
  extractSocket,
  normalizeIncomingAttack,
  rallyTeam
} from '../src/core/cache/extractors/socketExtractor.ts';
import { reduceAccountChange } from '../src/core/cache/reducers/accountReducer.ts';
import { pruneCache as pruneCacheImpl } from '../src/core/cache/reducers/pruneReducer.ts';
import { extract, merge, pruneCache } from '../src/core/cache/cacheStore.ts';

test('definitions and helper functions resolve correctly', () => {
  assert.equal(definitions.heroGetAll, 'heroes');
  assert.equal(definitions.inventoryGet, 'items');
  assert.equal(definitions.dungeonGetInfo, 'events');
  assert.equal(definitions.mailGetAll, 'header');

  // getSkillUpgradeGoldCost
  assert.equal(getSkillUpgradeGoldCost(1), 0);
  assert.equal(getSkillUpgradeGoldCost(2), 100);
  assert.equal(getSkillUpgradeGoldCost(3), 550);
  assert.equal(getSkillUpgradeGoldCost(120), 100000);
  assert.equal(getSkillUpgradeGoldCost(125), 105000);

  // resolveResourceLabel
  assert.equal(resolveResourceLabel('energy'), 'Energy');
  assert.equal(resolveResourceLabel('world-energy'), 'World Energy');
  assert.equal(resolveResourceLabel('gold'), 'Gold');
  assert.equal(resolveResourceLabel('starMoney'), 'Emeralds');
  assert.equal(resolveResourceLabel('material:2'), 'Iron');
  assert.equal(resolveResourceLabel('material:3'), 'Stone');
  assert.equal(resolveResourceLabel('material:4'), 'Wood');
  assert.equal(resolveResourceLabel('material:5'), 'Food');
  assert.equal(resolveResourceLabel('patron:1'), 'Relic Shard');
});

test('baseExtractor extracts resources and reward/cost actions', () => {
  const dummyRecord = { timestamp: '2026-11-15T12:00:00Z' };

  // resource & inventoryResources
  const items = [
    { type: 'material', id: 2, quantity: 5000 },
    { type: 'coin', id: 1, quantity: 120000 },
    { type: 'unknown_type', id: 99, quantity: 10 }
  ];
  const res = inventoryResources(items, dummyRecord, 'inventoryGet');
  assert.equal(res.length, 2);
  assert.equal(res[0].key, 'resource:material:2');
  assert.equal(res[0].data.amount, 5000);
  assert.equal(res[0].data.label, 'Iron');

  // extractRewardActions
  const call = { name: 'claimReward', ident: 'call_1' };
  const rewards = {
    gold: 50000,
    stamina: 120,
    material: { 3: 200 },
    reward: [{ type: 'starMoney', amount: 300 }]
  };
  const rewardActions = extractRewardActions(dummyRecord, call, rewards);
  assert.ok(rewardActions.length >= 4);
  const goldAction = rewardActions.find((a) => a.data.resourceKey === 'resource:gold');
  assert.ok(goldAction);
  assert.equal(goldAction.data.delta, 50000);
  assert.equal(goldAction.data.token, 'call_1:gold');

  // extractCostActions
  const costCall = { name: 'buyItem', ident: 'call_2' };
  const costs = {
    gold: 15000,
    material: { 2: 50 }
  };
  const costActions = extractCostActions(dummyRecord, costCall, costs);
  assert.equal(costActions.length, 2);
  const costGold = costActions.find((a) => a.data.resourceKey === 'resource:gold');
  assert.equal(costGold.data.delta, -15000);

  // routeEstimate
  const route = routeEstimate({ x: 0, y: 0 }, { x: 30, y: 40 });
  assert.equal(route.distance, 50);
  assert.equal(route.durationSeconds, 50);
});

test('socketExtractor extracts MQTT incoming events', () => {
  const dummyTimestamp = '2026-11-15T12:05:00Z';
  const chatPacket = {
    transport: 'websocket',
    direction: 'received',
    encoding: 'utf8',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    payload: JSON.stringify({
      result: {
        type: 'chatMessage',
        body: {
          id: 'msg_100',
          userId: 'user_42',
          chatType: 'clan',
          messageType: 'text',
          ctime: '1794564000',
          data: { text: 'Hello clan' },
          user: { name: 'PlayerOne' }
        }
      }
    }),
    timestamp: dummyTimestamp
  };

  const chatEntries = extractSocket(chatPacket);
  assert.equal(chatEntries.length, 1);
  assert.equal(chatEntries[0].key, 'guildChat');
  assert.equal(chatEntries[0].data.messages[0].id, 'msg_100');
  assert.equal(chatEntries[0].data.users['user_42'].name, 'PlayerOne');

  const reportPacket = {
    transport: 'websocket',
    direction: 'received',
    encoding: 'utf8',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    payload: JSON.stringify({
      result: {
        type: 'newReport',
        body: {
          reportId: 'rep_999',
          type: 'battle',
          pushTs: 1794564300
        }
      }
    }),
    timestamp: dummyTimestamp
  };
  const reportEntries = extractSocket(reportPacket);
  assert.equal(reportEntries.length, 1);
  assert.equal(reportEntries[0].key, 'mailStatus');
  assert.equal(reportEntries[0].data.reports[0].id, 'rep_999');
});

test('accountReducer and pruneReducer update and normalize cache', () => {
  // reduceAccountChange
  const cache = {
    accountStatus: { data: { id: 101 }, updatedAt: '2026-11-15T10:00:00Z' },
    heroGetAll: { data: [{ id: 1 }] },
    mailStatus: { data: { reports: [] } }
  };
  const switchAccountEntry = {
    key: 'accountStatus',
    data: { id: 202 },
    updatedAt: '2026-11-15T11:00:00Z'
  };
  const changed = reduceAccountChange(cache, switchAccountEntry);
  assert.equal(changed, true);
  assert.equal(cache.heroGetAll, undefined);
  assert.equal(cache.mailStatus, undefined);
  assert.equal(cache.mailAccountEpoch.data.accountId, '202');

  // pruneCache with old guildChat and object claims
  const now = Date.parse('2026-11-15T12:00:00Z');
  const oldCtime = String(Math.floor(now / 1000) - 10 * 86400); // 10 days old
  const freshCtime = String(Math.floor(now / 1000) - 1 * 86400); // 1 day old
  const unprunedCache = {
    guildChat: {
      updatedAt: '2026-11-15T12:00:00Z',
      data: {
        messages: [
          { id: '1', userId: '10', ctime: oldCtime },
          { id: '2', userId: '20', ctime: freshCtime }
        ],
        users: { '10': { name: 'Old' }, '20': { name: 'Fresh' } }
      }
    },
    questClaimStatus: {
      data: {
        claims: { 'claim_1': { id: 1 }, 'claim_2': { id: 2 } }
      }
    }
  };

  const pruneResult = pruneCacheImpl(unprunedCache, now);
  assert.equal(pruneResult.changed, true);
  assert.equal(pruneResult.cache.guildChat.data.messages.length, 1);
  assert.equal(pruneResult.cache.guildChat.data.messages[0].id, '2');
  assert.equal(pruneResult.cache.guildChat.data.users['10'], undefined);
  assert.equal(pruneResult.cache.guildChat.data.users['20'].name, 'Fresh');
  assert.ok(Array.isArray(pruneResult.cache.questClaimStatus.data.claims));
});

test('cacheStore atomic merge processes snapshots, extractions and pruning', () => {
  const reqBody = JSON.stringify({
    calls: [
      { name: 'arenaGetAll', ident: 1, args: {} },
      { name: 'expeditionGet', ident: 2, args: {} }
    ]
  });
  const resBody = JSON.stringify({
    results: [
      { ident: 1, result: { response: { arenaPlace: '45' } } },
      { ident: 2, result: { response: [{ slotId: 1, attemptsLeft: 3 }] } }
    ]
  });
  const httpRecord = {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: reqBody,
    responseBody: resBody,
    timestamp: '2026-11-15T12:10:00Z'
  };

  const mergeResult = merge({}, [httpRecord]);
  assert.equal(mergeResult.changed, true);
  assert.equal(mergeResult.cache.arenaGetAll.data.arenaPlace, '45');
  assert.equal(mergeResult.cache.expeditionGet.data[0].attemptsLeft, 3);
});
