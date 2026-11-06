import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/dashboard-data.js', import.meta.url), 'utf8');
const context = { Date, Number, Array, globalThis: {} };
vm.runInNewContext(source, context);
const { dailyDashboard } = context.globalThis.hwaHelperDashboardData;
const now = new Date('2026-11-06T12:00:00Z').getTime();
const observed = (data, updatedAt = '2026-11-06T10:00:00Z') => ({ data, updatedAt });

test('daily dashboard groups activities before quests and gifts', () => {
  const model = dailyDashboard({
    towerStatus: observed({ isCleared: true, floorNumber: 26 }),
    arenaGetAll: observed({ arenaPlace: '123', grandPlace: '456' }),
    'resource:refillable:6': observed({ amount: 3 }),
    'resource:refillable:21': observed({ amount: 0 }),
    expeditionGet: observed([{ attemptsLeft: 2 }, { attemptsLeft: 0 }]),
    dungeonStatus: observed({ dungeonActivity: 150, floorNumber: 42 }),
    clanBoss_getAll: observed({ tries: 1, superTries: 0 }),
    'getDailyQuests:quest': observed({ quests: [{}, {}] }),
    questGetAll: observed([{ state: 2 }, { state: 1 }]),
    dailyBonusGetInfo: observed({ availableToday: true }),
    zeppelinGiftGet: observed({ available: false }),
    'resource:refillable:3': observed({ amount: 1 })
  }, now);
  assert.deepEqual(Array.from(model.activities, (item) => item.id),
    ['tower', 'arena', 'grand-arena', 'expeditions', 'dungeon', 'hydra']);
  assert.equal(model.activities[0].state, 'done');
  assert.equal(model.activities[1].state, 'pending');
  assert.equal(model.activities[1].detail, 'Rank 123 · 3 battles left today');
  assert.equal(model.activities[2].state, 'info');
  assert.equal(model.activities[2].detail, 'Rank 456 · 0 battles left today');
  assert.match(model.activities[3].detail, /2 attempts left/);
  assert.equal(model.quests[0].detail, '2 daily quests observed · 1 rewards ready to claim');
  assert.equal(model.gifts[0].state, 'pending');
  assert.equal(model.gifts[1].state, 'info');
  assert.equal(model.gifts[2].state, 'pending');
});

test('Arena counters use distinct fresh refillables and never infer zero from missing data', () => {
  const yesterday = '2026-11-05T10:00:00Z';
  const model = dailyDashboard({
    arenaGetAll: observed({ arenaPlace: '12', grandPlace: '34' }),
    'resource:refillable:6': observed({ amount: 1 }, yesterday),
    'resource:world-refillable:6': observed({ amount: 4 }),
    'resource:refillable:21': observed({ amount: 2 })
  }, now);
  assert.equal(model.activities[1].state, 'unknown');
  assert.equal(model.activities[1].detail, 'Rank 12 · Battles remaining unavailable');
  assert.equal(model.activities[2].state, 'pending');
  assert.equal(model.activities[2].detail, 'Rank 34 · 2 battles left today');
});

test('old observations become unknown instead of appearing completed today', () => {
  const yesterday = '2026-11-05T10:00:00Z';
  const model = dailyDashboard({
    towerStatus: observed({ isCleared: true }, yesterday),
    dailyBonusGetInfo: observed({ availableToday: false }, yesterday),
    zeppelinGiftGet: observed({ available: true }, yesterday)
  }, now);
  assert.equal(model.activities[0].state, 'unknown');
  assert.equal(model.gifts[0].state, 'unknown');
  assert.equal(model.gifts[1].state, 'unknown');
  assert.equal(model.activities[1].state, 'unknown');
});
