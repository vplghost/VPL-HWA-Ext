import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  planPostQueueHeal,
  buildQueueSessionSummary,
  appendSessionEvent,
} from '../src/services/queues/queueCoordination.ts';
import { ResourceLockManager } from '../src/background/resourceLock.ts';
import { planAutoGather } from '../src/services/queues/autoGather.ts';

const root = resolve(process.cwd());

test('planPostQueueHeal dispatches startHealing once when wounded troops exist and hospital is idle', () => {
  const now = 1_700_000_000_000;
  const plan = planPostQueueHeal(
    {
      injuredUnits: [
        { unitId: 1, count: 40 },
        { unitId: 11, count: 25 },
      ],
      healing: null,
    },
    now
  );
  assert.equal(plan.action, 'heal');
  assert.equal(plan.summary.status, 'triggered');
  assert.equal(plan.summary.troopsCount, 65);
  assert.equal(plan.calls.length, 2);
  assert.equal(plan.calls[0].name, 'startHealing');
  assert.equal(plan.calls[0].feature, 'unit');
  assert.equal(plan.calls[0].args?.units?.length, 2);
  assert.ok((plan.calls[0].args?.duration || 0) > 0);
  assert.equal(plan.calls[1].name, 'getHealing');
});

test('planPostQueueHeal handles active heal, completed previous heal, empty infirmary, and missing cache', () => {
  const now = 1_700_000_000_000;

  const missing = planPostQueueHeal(null, now);
  assert.equal(missing.action, 'fetch');
  assert.equal(missing.calls[0].name, 'getHealing');

  const active = planPostQueueHeal(
    {
      injuredUnits: [{ unitId: 1, count: 50 }],
      healing: { startDate: now - 10_000, duration: 60_000, units: [{ unitId: 1, count: 50 }] },
    },
    now
  );
  assert.equal(active.action, 'noop');
  assert.equal(active.summary.status, 'already_active');

  const finished = planPostQueueHeal(
    {
      injuredUnits: [{ unitId: 1, count: 50 }],
      healing: { startDate: now - 70_000, duration: 60_000, units: [{ unitId: 1, count: 50 }] },
    },
    now
  );
  assert.equal(finished.action, 'complete_and_refresh');
  assert.equal(finished.calls[0].name, 'completeHealing');

  const clean = planPostQueueHeal({ injuredUnits: [], healing: null }, now);
  assert.equal(clean.action, 'noop');
  assert.equal(clean.summary.status, 'no_wounded');
});

test('ResourceLockManager syncs real RaidQueueState/MonsterQueueState phases and arms before raidEnergyAuto', () => {
  const mgr = new ResourceLockManager();
  const now = 1_700_000_000_000;

  // Real raidQueue schema uses `phase` and `options.heroIds`
  mgr.syncFromQueueStates(
    {
      raidQueue: { phase: 'waiting_rally', options: { heroIds: [16, 54, 79, 72, 60] } },
      monsterQueue: { phase: 'stopped', options: { heroIds: [1, 2, 3, 4, 5] } },
    },
    now
  );
  const reserved = mgr.getReservedHeroIds('autoGather', now);
  assert.deepEqual([...reserved].sort((a, b) => a - b), [16, 54, 60, 72, 79]);
  assert.equal(mgr.getReservedMarchSlots('autoGather', now), 1);

  // Release when queue completes, then arm when raidEnergyAuto is within 15 energy of threshold
  mgr.syncFromQueueStates(
    {
      raidQueue: { phase: 'complete', options: { heroIds: [16, 54, 79, 72, 60] } },
      raidEnergyAuto: { enabled: true, threshold: 200, options: { heroIds: [10, 20, 30, 40, 50] } },
      currentEnergy: 190,
    },
    now
  );
  assert.deepEqual([...mgr.getReservedHeroIds('autoGather', now)].sort((a, b) => a - b), [10, 20, 30, 40, 50]);
  assert.equal(mgr.getReservedMarchSlots('autoGather', now), 1);

  // Release when energy is far below threshold
  mgr.syncFromQueueStates(
    {
      raidQueue: { phase: 'complete', options: { heroIds: [16, 54, 79, 72, 60] } },
      raidEnergyAuto: { enabled: true, threshold: 200, options: { heroIds: [10, 20, 30, 40, 50] } },
      currentEnergy: 120,
    },
    now
  );
  assert.equal(mgr.getReservedHeroIds('autoGather', now).size, 0);
  assert.equal(mgr.getReservedMarchSlots('autoGather', now), 0);
});

test('planAutoGather respects reserved march slots and reserved heroes from activeResourceLocks', () => {
  const now = 1_700_000_000_000;
  const cache = {
    accountStatus: { data: { id: 'acc1' } },
    marchStatus: { data: { marches: [{ squadId: 'm1' }, { squadId: 'm2' }] } },
    experimentalMapContext: { data: { mapId: 1, center: { x: 10, y: 10 } } },
    heroGetAll: {
      data: {
        1: { id: 1, power: 50000 },
        2: { id: 2, power: 49000 },
        3: { id: 3, power: 48000 },
        4: { id: 4, power: 47000 },
        5: { id: 5, power: 46000 },
      },
    },
    'getUnitSummary:unit': { data: { available: [{ unitId: 1, count: 5000 }], squads: [] } },
  };

  // maxMarches = 3, 2 active marches, 1 reserved by raidQueue -> must wait!
  const slotBlocked = planAutoGather(
    cache,
    {
      popupRpcEnabled: true,
      autoGatherSettings: { enabled: true, smartEnabled: false, maxMarches: 3, mineLevel: 5, mineType: 'food' },
      activeResourceLocks: [
        { owner: 'raidQueue', heroIds: [1, 2, 3, 4, 5], marchSlots: 1, reason: 'Raid active', updatedAt: now, expiresAt: now + 60_000 },
      ],
    },
    now
  );
  assert.equal(slotBlocked.action, 'wait');
  assert.ok(slotBlocked.reason?.includes('reserved by active queue'), `Unexpected reason: ${slotBlocked.reason}`);

  // With 0 active marches, all 5 heroes are reserved -> must wait for unreserved heroes!
  const heroBlocked = planAutoGather(
    { ...cache, marchStatus: { data: { marches: [] } } },
    {
      popupRpcEnabled: true,
      autoGatherSettings: { enabled: true, smartEnabled: false, maxMarches: 3, mineLevel: 5, mineType: 'food' },
      activeResourceLocks: [
        { owner: 'raidQueue', heroIds: [1, 2, 3, 4, 5], marchSlots: 1, reason: 'Raid active', updatedAt: now, expiresAt: now + 60_000 },
      ],
    },
    now
  );
  assert.equal(heroBlocked.action, 'wait');
  assert.ok(heroBlocked.reason?.includes('reserved by active queue'), `Unexpected reason: ${heroBlocked.reason}`);
});

test('buildQueueSessionSummary aggregates rounds, energy, cancellations, post-queue heal, and caps events', () => {
  let events = [];
  for (let i = 0; i < 25; i++) {
    events = appendSessionEvent(events, { at: 1000 + i, type: 'won', mobId: `m${i}` });
  }
  assert.equal(events.length, 20, 'Session events must be capped at 20');

  const summary = buildQueueSessionSummary(
    'raid',
    {
      accountId: 'acc1',
      startedAt: 1000,
      completed: 4,
      cancelledCount: 1,
      retriedCount: 0,
      phase: 'complete',
      options: { count: 4 },
      sessionEvents: events,
    },
    5000,
    { status: 'triggered', troopsCount: 142, durationMs: 30_000 }
  );
  assert.equal(summary.completedRounds, 4);
  assert.equal(summary.targetRounds, 4);
  assert.equal(summary.energySpent, 100);
  assert.equal(summary.cancelledRounds, 1);
  assert.equal(summary.postQueueHeal?.troopsCount, 142);
  assert.equal(summary.status, 'complete');
});

test('RaidModal and MonsterModal expose post-queue auto-heal, squad lock badge, and last session summary', async () => {
  const raidSrc = await readFile(resolve(root, 'src/components/dialogs/RaidModal.vue'), 'utf8');
  assert.ok(raidSrc.includes('id="raid-auto-heal-after"'));
  assert.ok(raidSrc.includes('id="raid-squad-lock-badge"'));
  assert.ok(raidSrc.includes('id="raid-last-session-summary"'));

  const monsterSrc = await readFile(resolve(root, 'src/components/dialogs/MonsterModal.vue'), 'utf8');
  assert.ok(monsterSrc.includes('id="monster-auto-heal-after"'));
  assert.ok(monsterSrc.includes('id="monster-squad-lock-badge"'));
  assert.ok(monsterSrc.includes('id="monster-last-session-summary"'));
});
