import test from 'node:test';
import assert from 'node:assert/strict';

import {
  start as startRaid,
  advance as advanceRaid,
  terminal as terminalRaid,
  stop as stopRaid,
  confirmedWins as confirmedRaidWins,
  energyAt as energyAtRaid,
  hasActiveRaidPending,
  raidQueueService,
} from '../src/services/queues/raidQueue.ts';

import {
  start as startMonster,
  advance as advanceMonster,
  terminal as terminalMonster,
  stop as stopMonster,
  confirmedWins as confirmedMonsterWins,
  energyAt as energyAtMonster,
  monsterQueueService,
} from '../src/services/queues/monsterQueue.ts';

import {
  amountAt as amountAtEnergy,
  observe as observeEnergy,
  validConfig as validEnergyConfig,
  raidEnergyAutoService,
} from '../src/services/queues/raidEnergyAuto.ts';

test('raidQueueService - lifecycle, validation, and energy calculation', () => {
  assert.equal(terminalRaid(null), true);
  assert.equal(terminalRaid({ phase: 'complete' }), true);
  assert.equal(terminalRaid({ phase: 'stopped' }), true);
  assert.equal(terminalRaid({ phase: 'active' }), false);

  const stopped = stopRaid({ phase: 'active', options: {} }, 'User cancelled');
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.reason, 'User cancelled');

  assert.equal(confirmedRaidWins({ completed: 3, current: { result: 'win' } }), 4);
  assert.equal(confirmedRaidWins({ completed: 3, current: { result: 'lose' } }), 3);

  // Energy calculation
  const cacheWithRefill = {
    'resource:world-energy': {
      data: {
        amount: 20,
        lastRefillAt: 1000,
        refillEveryMs: 1000,
        cap: 100,
      },
    },
  };
  assert.equal(energyAtRaid(cacheWithRefill, 5000), 24);

  // Invalid start options -> null
  const invalidResult = startRaid(
    { mapId: 1, center: { x: 0, y: 0 }, level: 99, waitSeconds: 60, count: 0, minMembers: 1, heroIds: [1, 2] },
    1,
    'acc1',
    1000
  );
  assert.equal(invalidResult, null);
});

test('monsterQueueService - lifecycle, validation, and attack planning', () => {
  assert.equal(terminalMonster(null), true);
  assert.equal(terminalMonster({ phase: 'complete' }), true);
  assert.equal(terminalMonster({ phase: 'stopped' }), true);
  assert.equal(terminalMonster({ phase: 'active' }), false);

  const stopped = stopMonster({ phase: 'active' }, 'Out of energy');
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.reason, 'Out of energy');

  assert.equal(confirmedMonsterWins({ completed: 5, current: { result: 'win' } }), 6);
  assert.equal(confirmedMonsterWins({ completed: 5, current: null }), 5);

  // Invalid start options -> null
  const invalid = startMonster(
    { mapId: 1, center: { x: 0, y: 0 }, level: 99, count: 1, heroIds: [1, 2, 3, 4, 5] },
    1,
    'acc1',
    1000
  );
  assert.equal(invalid, null);
});

test('raidEnergyAutoService - amount calculation, config validation, and observe trigger', () => {
  // Amount calculation
  const energyData = {
    amount: 50,
    lastRefillAt: 1000,
    refillEveryMs: 60000,
    refillAmount: 1,
    cap: 120,
  };
  assert.equal(amountAtEnergy(energyData, 1000), 50);
  assert.equal(amountAtEnergy(energyData, 121000), 52);
  assert.equal(amountAtEnergy(energyData, 1000 + 200 * 60000), 120, 'Clamped at cap');

  // Config validation
  assert.equal(validEnergyConfig({ enabled: false }), true);
  const validFull = {
    enabled: true,
    accountId: 'acc1',
    threshold: 100,
    options: {
      mapId: 1,
      center: { x: 10, y: 20 },
      level: 10,
      count: 5,
      waitSeconds: 60,
      minMembers: 2,
      autoCancel: true,
      teamId: 'custom',
      heroIds: [1, 2, 3, 4, 5],
    },
  };
  assert.equal(validEnergyConfig(validFull), true);
  assert.equal(validEnergyConfig({ ...validFull, threshold: 10 }), false, 'Threshold must be >= 25');

  // Observation natural crossing trigger
  const previousState = {
    key: JSON.stringify(validFull),
    accountId: 'acc1',
    tabId: 1,
    sessionId: 'sess1',
    at: 1000,
    amount: 99,
    source: {
      amount: 99,
      lastRefillAt: 1000,
      refillEveryMs: 10000,
      refillAmount: 1,
      cap: 120,
    },
  };

  const entry = {
    data: {
      amount: 99,
      lastRefillAt: 1000,
      refillEveryMs: 10000,
      refillAmount: 1,
      cap: 120,
    },
  };

  // At 11000 ms, energy reaches 100 (threshold) naturally
  const result = observeEnergy(
    previousState,
    validFull,
    entry,
    'acc1',
    1,
    'sess1',
    11000
  );
  assert.equal(result.trigger, true, 'Natural refill crossing threshold triggers raid auto');
});
