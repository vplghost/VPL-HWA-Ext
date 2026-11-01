import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const context = { TextEncoder };
runInNewContext(source, context);
const cache = context.hwaHelperRpcCache;

function record(calls, results, timestamp = '2026-11-01T09:18:28.248Z') {
  return {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results }), timestamp,
    requestBodyTruncated: false, responseBodyTruncated: false
  };
}

test('extracts selected RPC results by ident and excludes login and chat methods', () => {
  const input = record([
    { name: 'heroGetAll', ident: 'a' },
    { name: 'inventoryGet', ident: 'b' },
    { name: 'mobileLogin', ident: 'c' },
    { name: 'chatGetAll', ident: 'd' }
  ], [
    { ident: 'b', result: { response: { coin: { 1: 7 } } } },
    { ident: 'a', result: { response: { 1: { level: 70 } } } },
    { ident: 'c', result: { response: { token: 'secret' } } },
    { ident: 'd', result: { response: { message: 'private' } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)], ['heroGetAll', 'inventoryGet', 'resource:coin:1']);
  assert.equal(entries[0].data[1].level, 70);
  assert.equal(entries[1].data.coin[1], 7);
});

test('keeps newer snapshot and ignores incomplete or unrelated records', () => {
  const newer = record([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 1: { level: 80 } } } }], '2026-11-01T09:19:00.000Z');
  const older = record([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 1: { level: 70 } } } }]);
  const invalid = { ...newer, responseBodyTruncated: true };
  const result = cache.merge({}, [newer, older, invalid, { ...newer, endpoint: '/oauth/refresh' }]);
  assert.equal(result.cache.heroGetAll.data[1].level, 80);
  assert.equal(Object.keys(result.cache).length, 1);
});

test('caches resource amounts and account name without account identifiers', () => {
  const input = record([{ name: 'userGetInfo', ident: 1 }], [{ ident: 1, result: {
    response: { id: 'private-id', name: 'private-name', refillable: [{ id: 1, amount: 42 }] }
  } }]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)],
    ['accountStatus', 'resource:energy', 'energyStatus']);
  assert.equal(entries.find((entry) => entry.key === 'accountStatus').data.name, 'private-name');
  assert.equal(entries.find((entry) => entry.key === 'resource:energy').data.amount, 42);
  assert.equal(JSON.stringify(entries).includes('private-id'), false);
});

test('updates World Energy and other observed refillables with timing metadata', () => {
  const input = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }], [
    { ident: 1, result: { response: { refillables: [
      { refillableId: 1, amount: 43, lastRefillAt: 100 },
      { refillableId: 2, amount: 44, lastRefillAt: 123 },
      { refillableId: 6, amount: 1, lastRefillAt: 456 }
    ] } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)],
    ['resource:energy', 'energyStatus', 'resource:world-energy', 'worldEnergyStatus',
      'resource:world-refillable:6']);
  assert.equal(entries[0].data.amount, 43);
  assert.equal(entries[2].data.refillEveryMs, 300000);
  assert.equal(entries[2].data.cap, 200);
  assert.equal(entries[3].data.energy, 44);
  assert.equal(entries[4].data.amount, 1);
});

test('extracts material and speedups from World inventory, and queue timers', () => {
  const input = record([
    { name: 'getInventory', feature: 'inventory', ident: 1 },
    { name: 'getSummary', feature: 'personalResearch', ident: 2 },
    { name: 'getSummary', feature: 'building', ident: 3 }
  ], [
    { ident: 1, result: { response: { inventory: { items: [
      { type: 'material', id: 3, quantity: 17 },
      { type: 'speedUpResearch', id: 1, quantity: 4 },
      { type: 'lootboxChanced', id: 6, quantity: 5 }
    ] } } } },
    { ident: 2, result: { response: { queues: [
      { researchId: 120, startDate: 1793528241401, durationMs: 8136000 }
    ] } } },
    { ident: 3, result: { response: { queues: [] } } }
  ]);
  const entries = cache.extract(input);
  assert.deepEqual([...entries.map((entry) => entry.key)], [
    'resource:material:3', 'resource:speedUpResearch:1', 'resource:lootboxChanced:6',
    'researchStatus', 'buildingStatus'
  ]);
  assert.equal(entries[0].data.label, 'Stone');
  assert.equal(entries[3].data.queues[0].durationMs, 8136000);
});

test('newer World Energy API snapshot replaces older balance and refill clock', () => {
  const world = (amount, lastRefillAt, timestamp) => record(
    [{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }],
    [{ ident: 1, result: { response: { refillables: [
      { refillableId: 2, amount, lastRefillAt }
    ] } } }], timestamp);
  const older = world(44, 1000000, '2026-11-01T10:00:00.000Z');
  const newer = world(20, 2000000, '2026-11-01T10:05:00.000Z');
  const merged = cache.merge({}, [older, newer, older]).cache['resource:world-energy'];
  assert.equal(merged.data.amount, 20);
  assert.equal(merged.data.lastRefillAt, 2000000);
});
