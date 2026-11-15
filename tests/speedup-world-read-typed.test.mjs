import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kinds,
  suggestedAmount,
  duration,
  validate,
  target,
  stock,
  quote,
  buildCall,
  speedupService,
} from '../src/services/speedupService.ts';
import {
  incomingTtl,
  key,
  fresh,
  plan,
  wakeAt,
  worldReadService,
} from '../src/services/worldReadService.ts';

test('speedupService: definition, durations, suggested amounts, and validation', () => {
  assert.equal(kinds.building.method, 'speedUpConstructionWithResources');
  assert.equal(kinds.research.method, 'speedUpResearchWithResources');
  assert.equal(kinds.healing.method, 'speedUpHealingWithResources');

  // Duration
  assert.equal(duration('speedUpConstruction', 1), 60000); // 1 minute
  assert.equal(duration('speedUpConstruction', 2), 300000); // 5 minutes

  // Suggested amount
  // 12 minutes remaining, 5 minute item, 5 available -> ceil(12/5) - 1 = 3 - 1 = 2
  assert.equal(suggestedAmount(12 * 60000, 5 * 60000, 5), 2);
  // 4 minutes remaining, 5 minute item -> 0
  assert.equal(suggestedAmount(4 * 60000, 5 * 60000, 5), 0);

  // Validate call
  const validBuildingCall = {
    name: 'speedUpConstructionWithResources',
    feature: 'building',
    args: {
      buildingId: 10,
      nextLevel: 5,
      speedUpDate: 123456789,
      resourcesToReward: [],
      resourcesToSpend: [{ type: 'speedUpConstruction', id: 2, amount: 2 }],
    },
  };
  const validated = validate(validBuildingCall);
  assert.ok(validated);
  assert.equal(validated.kind, 'building');
  assert.equal(validated.totalMs, 600000); // 300000 * 2

  // Invalid call
  assert.equal(validate({ name: 'unknown' }), null);
});

test('worldReadService: incoming TTL, key extraction, freshness, and planning', () => {
  const now = 1700000000000;
  // TTL
  const cacheWithAttacks = {
    incomingMineAttacks: {
      data: { attacks: [{ impactAt: now + 5000 }] },
    },
  };
  assert.equal(incomingTtl(cacheWithAttacks, now), 15000);

  const cacheNoAttacks = {
    incomingMineAttacks: {
      data: { attacks: [{ impactAt: now - 5000 }] },
    },
  };
  assert.equal(incomingTtl(cacheNoAttacks, now), 60000);

  // Key extraction
  assert.equal(key({ name: 'getIncomingMarches', feature: 'march' }), 'incoming');
  assert.equal(
    key({ name: 'getRallyById', feature: 'rally', args: { rallyId: 'r1', mapId: 'm1' } }),
    'rally:r1:m1'
  );
  assert.equal(key({ name: 'other' }), null);

  // Plan call allowed and state tracked
  const cache = { accountStatus: { data: { id: 1001 } } };
  const calls = [{ name: 'getIncomingMarches', feature: 'march' }];
  const planned = plan(null, cache, calls, now);
  assert.equal(planned.calls.length, 1);
  assert.ok(planned.state.entries['incoming']);
  assert.equal(planned.state.entries['incoming'].until, now + 10000);
});
