import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { deriveTowerRules, indexedRows } from '../scripts/generate-tower-rules.mjs';
import { towerActivityState } from '../src/composables/activityState.ts';

const context = {};
vm.runInNewContext(await readFile(new URL('../extension/tower-rules.js', import.meta.url), 'utf8'), context);
const rules = context.hwaHelperTowerRules;
const fixtures = await Promise.all(['magicTower.pb', 'magicTowerFloorTemplate.pb'].map(async name => {
  const bytes = await readFile(new URL(`./fixtures/tower/${name}`, import.meta.url));
  assert.equal(bytes.length, rules.source.files[name].size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), rules.source.files[name].sha256);
  return bytes;
}));

test('verified splitlib contains 23 contiguous floors ending in terminal template 12', () => {
  assert.deepEqual(deriveTowerRules(...fixtures), {
    floorCount: rules.floorCount, finalFloor: rules.finalFloor, finalTemplateId: rules.finalTemplateId,
  });
  assert.equal(rules.floorCount, 23);
  // The table has an extra packed template field after row data, not extra floors.
  assert.equal(indexedRows(fixtures[0]).size, 23);
});

const varint = value => {
  const bytes = [];
  do { bytes.push((value % 128) | (value >= 128 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return Buffer.from(bytes);
};
const scalar = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);
const text = (field, value) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
};
function table(rows) {
  let end = 0;
  const index = Buffer.concat(rows.map(([id, row]) => {
    end += row.length;
    const entry = Buffer.concat([scalar(1, id), scalar(2, end)]);
    return Buffer.concat([Buffer.from([10]), varint(entry.length), entry]);
  }));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(index.length); header.writeUInt32LE(end, 4);
  return Buffer.concat([header, index, ...rows.map(([, row]) => row)]);
}
function synthetic(count, terminalFloors = [count], omitFloor = null) {
  const floors = Array.from({ length: count }, (_, i) => i + 1).filter(id => id !== omitFloor);
  return [table(floors.map(id => [id, Buffer.concat([scalar(1, id), scalar(2, terminalFloors.includes(id) ? 2 : 1)])])),
    table([1, 2].map(id => [id, Buffer.concat([scalar(1, id), text(6,
      id === 2 ? 'MAGIC_TOWER_FLOORLAST_TITLE' : 'MAGIC_TOWER_FLOOR_TITLE')])]))];
}

test('extraction adapts to future floor counts rather than assuming 23', () => {
  assert.deepEqual(deriveTowerRules(...synthetic(27)), { floorCount: 27, finalFloor: 27, finalTemplateId: 2 });
});

test('extraction rejects missing, duplicate, non-terminal and ambiguous final floors', () => {
  for (const args of [[5, []], [5, [3]], [5, [3, 5]], [5, [5], 3]]) {
    assert.throws(() => deriveTowerRules(...synthetic(...args)), /Tower/);
  }
  const templatesWithoutTerminal = table([[1, Buffer.concat([scalar(1, 1), text(6, 'MAGIC_TOWER_FLOOR_TITLE')])]]);
  assert.throws(() => deriveTowerRules(synthetic(5)[0], templatesWithoutTerminal), /Missing.*template/);
});

test('extraction rejects truncated data, invalid row IDs and corrupt index offsets', () => {
  assert.throws(() => indexedRows(fixtures[0].subarray(0, 7)), /header/);
  assert.throws(() => indexedRows(fixtures[0].subarray(0, 300)), /Truncated/);
  assert.throws(() => indexedRows(table([[1, scalar(1, 2)]])), /ID mismatch/);
  assert.throws(() => indexedRows(table([[1, scalar(1, 1)], [1, scalar(1, 1)]])), /index/);
  const corrupt = Buffer.from(synthetic(5)[0]);
  corrupt.writeUInt32LE(1, 4);
  assert.throws(() => indexedRows(corrupt), /index/);
});

const rpcSource = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const plannerSource = await readFile(new URL('../extension/tower-automation.js', import.meta.url), 'utf8');

test('planner requires a win in the configured final boss room, including future floor counts', () => {
  for (const finalFloor of [23, 27]) {
    const runtime = { hwaHelperTowerRules: { ...rules, finalFloor } };
    vm.runInNewContext(plannerSource, runtime);
    const plan = (floorNumber, type, win = true, historyRoom = 1) => runtime.hwaHelperTowerAutomation.plan({
      towerSession: { updatedAt: new Date().toISOString(), data: {
        floorNumber, roomNumber: 0,
        rooms: { 1: { roomNumber: 1, type, state: 'finished' } },
        history: [{ action: 'endBattle', floor: floorNumber, room: historyRoom, win }],
      } },
    });
    assert.equal(plan(finalFloor, 'boss_battle').kind, 'complete');
    assert.notEqual(plan(21, 'hero_battle').kind, 'complete');
    assert.notEqual(plan(finalFloor - 2, 'boss_battle').kind, 'complete');
    assert.notEqual(plan(finalFloor, 'hero_battle').kind, 'complete');
    assert.notEqual(plan(finalFloor, 'boss_battle', false).kind, 'complete');
    assert.notEqual(plan(finalFloor, 'boss_battle', true, 2).kind, 'complete');
  }
});

test('RPC snapshots use the configured final floor and require actual completion evidence', () => {
  const runtime = { TextEncoder, hwaHelperTowerRules: { ...rules } };
  vm.runInNewContext(rpcSource, runtime);
  const record = (name, response, args = {}) => ({
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date().toISOString(),
    requestBody: JSON.stringify({ calls: [{ name, ident: '1', args }] }),
    responseBody: JSON.stringify({ results: [{ ident: '1', result: { response } }] }),
  });
  const extract = response => runtime.hwaHelperRpcCache.extract(record('magicTower_getAll', response))
    .find(entry => entry.key === 'towerStatus').data;
  assert.equal(extract({ state: 'win' }).floorNumber, 23);
  for (const floorNumber of [23, 26]) {
    assert.equal(extract({ floorData: { floorNumber } }).isCleared, false);
  }
  runtime.hwaHelperTowerRules.finalFloor = 27;
  assert.equal(extract({ state: 'completed' }).floorNumber, 27);
  for (const floorNumber of [21, 27]) {
    const initial = runtime.hwaHelperRpcCache.merge({}, [record('magicTower_getAll', {
      floorData: { floorNumber, currentRoomNumber: 1, rooms: { 1: { type: 'boss_battle' } } },
    })]).cache;
    const result = runtime.hwaHelperRpcCache.merge(initial, [record('magicTower_endBattle',
      { currentRoomNumber: 0 }, { result: { win: true, stars: 3 } })]).cache;
    assert.equal(result.towerSession.data.completed, floorNumber === 27);
  }
});

test('Dashboard shows the configured total and never infers a win from a high floor', () => {
  const now = Date.now();
  const state = floorNumber => towerActivityState({ towerSession: {
    updatedAt: new Date(now).toISOString(), data: { floorNumber },
  } }, now);
  assert.deepEqual(state(23), { state: 'pending', detail: 'Floor 23 / 23' });
  assert.equal(state(26).state, 'pending');
});
