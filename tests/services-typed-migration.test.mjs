import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freeAlchemyDay,
  freeAlchemyAvailability,
  freeAlchemyCycle,
  freeAlchemyPolicy,
} from '../src/services/freeAlchemy.ts';
import {
  mineDefenseData,
  getInfirmaryCapacity,
} from '../src/data/mineDefenseData.ts';
import {
  hospital,
  unsafeMineIds,
  plan,
  mineDefenseService,
} from '../src/services/mineDefense.ts';
import {
  mailService,
  reportTypes,
  reportLabels,
  reportLabel,
  rewards,
  unclaimed,
  counts,
  validateClaim,
} from '../src/services/mailService.ts';

test('freeAlchemyService: availability calculation and daily rollover', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
  const nextReset = now + 4 * 3600 * 1000;
  const cache = {
    questResetStatus: { data: { nextDayAt: nextReset } },
    'resource:refillable:53': {
      updatedAt: new Date(now - 1000).toISOString(),
      data: { amount: 1 },
    },
    accountStatus: { data: { id: 12345 } },
  };

  // When amount > 0, it is ready now
  const avail = freeAlchemyAvailability(cache, now);
  assert.equal(avail.ready, true);
  assert.equal(avail.remainingSeconds, 0);

  // When amount === 0 and on cooldown
  cache['resource:refillable:53'].data.amount = 0;
  cache['resource:refillable:53'].data.lastRefillAt = now - 3600 * 1000;
  const availCooldown = freeAlchemyAvailability(cache, now);
  assert.equal(availCooldown.ready, false);
  assert.ok(availCooldown.remainingSeconds > 0);

  // Day info and cycle string
  const day = freeAlchemyDay(cache, now);
  assert.equal(day.next, nextReset);
  assert.equal(day.start, nextReset - 86400000);

  const cycle = freeAlchemyCycle(cache, now);
  assert.ok(cycle.startsWith('12345:'));

  // Policy export
  assert.equal(typeof freeAlchemyPolicy.availability, 'function');
});

test('mineDefenseData & Service: hospital capacity and defense plan', () => {
  // Test data lookup
  assert.equal(getInfirmaryCapacity(162, 1), 400);
  assert.equal(getInfirmaryCapacity(162, 25), 16800);
  assert.equal(getInfirmaryCapacity(174, 10), 5300);
  assert.equal(getInfirmaryCapacity(999, 1), undefined);

  // Test hospital room evaluation
  const now = Date.now();
  const cache = {
    buildingStatus: {
      updatedAt: new Date(now).toISOString(),
      data: {
        buildings: [
          { buildingId: 162, level: 1 },
          { buildingId: 174, level: 1 },
          { buildingId: 175, level: 1 },
        ],
      },
    },
    'getHealing:unit': {
      updatedAt: new Date(now).toISOString(),
      data: {
        injuredUnits: [{ count: 300 }, { count: 200 }],
      },
    },
  };

  const room = hospital(cache, now);
  assert.ok(room);
  assert.equal(room.capacity, 1200); // 400 + 400 + 400
  assert.equal(room.wounded, 500); // 300 + 200
  assert.equal(room.free, 700);

  // Unsafe mine ids
  const state = { interrupted: [] };
  const unsafe = unsafeMineIds(
    {
      incomingMineAttacks: {
        data: {
          attacks: [{ mineId: 42, impactAt: now + 5000 }],
        },
      },
    },
    state,
    now
  );
  assert.ok(unsafe.has(42));
});

test('mailService: rewards normalization, counts, and validation', () => {
  // Reward normalization
  const letterRewards = rewards({
    gold: 50000,
    stamina: 100,
    consumable: { '20': 5 },
  });
  assert.ok(letterRewards.some((r) => r.key === 'resource:gold' && r.amount === 50000));
  assert.ok(letterRewards.some((r) => r.key === 'resource:energy' && r.amount === 100));
  assert.ok(letterRewards.some((r) => r.key === 'resource:consumable:20' && r.amount === 5));

  // Unclaimed checks
  assert.equal(unclaimed({ claimed: false, reward: { gold: 100 } }), true);
  assert.equal(unclaimed({ claimed: true, reward: { gold: 100 } }), false);
  assert.equal(unclaimed({ deleted: true, reward: { gold: 100 } }), false);

  // Counts
  const c = counts({
    letters: [
      { claimed: false, reward: { gold: 10 } },
      { claimed: true, reward: { gold: 10 } },
    ],
    reports: [{ claimedReward: false }, { claimedReward: true }],
  });
  assert.equal(c.unclaimedLettersCount, 1);
  assert.equal(c.unclaimedReportsCount, 1);
  assert.equal(c.totalUnclaimed, 2);
  assert.equal(c.hasUnclaimed, true);

  // Report label
  assert.equal(reportLabel('soloMobAttackResult'), 'Monster battles');
  assert.equal(reportLabel('rallyMobAttackResult'), 'Rally battles');

  // Claim validation
  const letterClaim = validateClaim({ name: 'mailFarm', args: { letterIds: [1, 2, 3] } });
  assert.deepEqual(letterClaim, { kind: 'letters', ids: ['1', '2', '3'] });

  const reportClaim = validateClaim({
    name: 'readAndClaimAll',
    feature: 'report',
    args: { types: ['soloMobAttackResult'] },
  });
  assert.deepEqual(reportClaim, { kind: 'reports', types: ['soloMobAttackResult'] });
});
