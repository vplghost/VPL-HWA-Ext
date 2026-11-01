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

test('extracts selected RPC results by ident and excludes account and chat methods', () => {
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
  assert.deepEqual([...entries.map((entry) => entry.key)], ['heroGetAll', 'inventoryGet']);
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

test('caches only Energy from userGetInfo without account fields', () => {
  const input = record([{ name: 'userGetInfo', ident: 1 }], [{ ident: 1, result: {
    response: { id: 'private-id', name: 'private-name', refillable: [{ id: 1, amount: 42 }] }
  } }]);
  const entries = cache.extract(input);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'energyStatus');
  assert.equal(JSON.stringify(entries[0].data), '{"energy":42}');
});

test('updates World Energy from refillableGetAll without storing other resources', () => {
  const input = record([{ name: 'refillableGetAll', feature: 'refillable', ident: 1 }], [
    { ident: 1, result: { response: { refillables: [
      { refillableId: 2, amount: 44, lastRefillAt: 123 },
      { refillableId: 6, amount: 1, lastRefillAt: 456 }
    ] } } }
  ]);
  const entries = cache.extract(input);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'worldEnergyStatus');
  assert.equal(JSON.stringify(entries[0].data), '{"energy":44}');
});
