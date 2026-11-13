import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { TextEncoder };
for (const name of ['resource-data', 'rpc-cache']) {
  vm.runInNewContext(await readFile(new URL(`../extension/${name}.js`, import.meta.url), 'utf8'), context);
}
const reducer = context.hwaHelperRpcCache;
const at = '2026-11-13T23:49:09.310Z';
// Sanitized contract from hwa-game-record-202611140649._guild_rewardjson.json.
// topGet/clan ranking data is unrelated to the claim and omitted.
function claim(response = {}, result = { response }, ident = 'guild-clash-claim', timestamp = at) {
  return {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp,
    requestBody: JSON.stringify({ calls: [{ name: 'clanClash_claimReward', ident,
      args: { ClashEventId: 1, ClaimedTypes: [1] } }] }),
    responseBody: JSON.stringify({ results: [{ ident, result }] }),
  };
}

test('captured empty Guild Clash claim records a receipt without inventing reward amounts and replays once', () => {
  const record = claim(), first = reducer.merge({}, [record]);
  assert.equal(first.changed, true);
  const receipt = first.cache.clanClashClaimStatus.data.claims[0];
  assert.equal(receipt.eventId, 1);
  assert.deepEqual([...receipt.claimedTypes], [1]);
  assert.equal(receipt.needsSync, true);
  assert.equal(Object.keys(first.cache).some(key => key.startsWith('resource:')), false);
  assert.equal(reducer.merge(first.cache, [record]).changed, false);
  assert.equal(reducer.merge(first.cache, [claim({}, { response: {} }, 'guild-clash-claim', '2026-11-14T00:00:00Z')]).changed, false);
});

test('failed, missing, truncated and mismatched claim responses cannot create a reward receipt', () => {
  for (const result of [{ error: 'alreadyClaimed' }, { response: { error: 'rejected' } }, {}, { response: null }]) {
    assert.equal(reducer.merge({}, [claim(undefined, result)]).changed, false);
  }
  for (const field of ['requestBodyTruncated', 'responseBodyTruncated']) {
    assert.equal(reducer.merge({}, [{ ...claim(), [field]: true }]).changed, false);
  }
  assert.equal(reducer.merge({}, [{ ...claim(), responseBody: JSON.stringify({ results: [{ ident: 'other', result: { response: {} } }] }) }]).changed, false);
});

test('explicit reward payload compatibility uses shared deltas once and never overwrites newer balances', () => {
  const initial = {
    inventoryGet: { data: { coin: { 1: 30 }, lootboxChanced: { 27: 2 } } },
    'resource:coin:1': { data: { amount: 30 }, updatedAt: '2026-11-13T23:40:00Z' },
    'resource:lootboxChanced:27': { data: { amount: 2 }, updatedAt: '2026-11-13T23:40:00Z' },
  };
  // Compatibility path; the supplied trace has {}, not these amounts.
  const record = claim({ reward: { coin: { 1: 10 }, lootboxChanced: { 27: 3 } } });
  const state = reducer.merge(initial, [record]).cache;
  assert.equal(state['resource:coin:1'].data.amount, 40);
  assert.equal(state.inventoryGet.data.coin[1], 40);
  assert.equal(state.inventoryGet.data.lootboxChanced[27], 5);
  assert.equal(reducer.merge(state, [record]).changed, false);
  for (const snapshotFirst of [true, false]) {
    const requests = JSON.parse(record.requestBody).calls;
    const results = JSON.parse(record.responseBody).results;
    const snapshotCall = { name: 'inventoryGet', ident: 'inventory' };
    const snapshotResult = { ident: 'inventory', result: { response: { coin: { 1: 40 }, lootboxChanced: { 27: 5 } } } };
    requests[snapshotFirst ? 'unshift' : 'push'](snapshotCall);
    results[snapshotFirst ? 'unshift' : 'push'](snapshotResult);
    const mixed = { ...record, requestBody: JSON.stringify({ calls: requests }), responseBody: JSON.stringify({ results }) };
    const refreshed = reducer.merge(initial, [mixed]).cache;
    assert.equal(refreshed['resource:coin:1'].data.amount, 40, 'A same-batch snapshot must not be credited twice');
    assert.equal(refreshed.inventoryGet.data.lootboxChanced[27], 5);
  }
  const newer = { ...initial, 'resource:coin:1': { data: { amount: 100 }, updatedAt: '2026-11-14T00:00:00Z' } };
  assert.equal(reducer.merge(newer, [record]).cache['resource:coin:1'].data.amount, 100);
});
