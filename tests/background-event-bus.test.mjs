import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeEventBus, extractRecordTopics } from '../src/background/eventBus.ts';
import { ResourceLockManager } from '../src/background/resourceLock.ts';
import { registerQueueListeners } from '../src/background/handlers/queueDispatcher.ts';
import { handleDraftMessage } from '../src/background/handlers/draftHandler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('RuntimeEventBus extracts RPC & MQTT topics and dispatches batch records sequentially with liveCache', async () => {
  const bus = createRuntimeEventBus();
  const order = [];
  const seenCaches = [];

  bus.on('record:ingested', async (rec, ctx) => {
    order.push(`raw:${rec.seq}`);
    seenCaches.push(ctx.liveCache.version);
  });
  bus.on('rpc:createRally', async (rec) => {
    order.push(`rpc:createRally:${rec.seq}`);
  });
  bus.on('mqtt:mobRallyAttackResult', async (rec) => {
    order.push(`mqtt:mobRallyAttackResult:${rec.seq}`);
  });

  const rec1 = {
    seq: 1,
    requestBody: JSON.stringify({ calls: [{ name: 'createRally', args: {} }] }),
  };
  const rec2 = {
    seq: 2,
    transport: 'websocket',
    eventType: 'mobRallyAttackResult',
  };

  assert.deepEqual(extractRecordTopics(rec1), ['record:ingested', 'rpc:createRally']);
  assert.deepEqual(extractRecordTopics(rec2), ['record:ingested', 'mqtt:mobRallyAttackResult']);

  await bus.dispatchRecord(rec1, { tabId: 42, liveCache: { version: 10 }, chrome: {}, now: 1000 });
  await bus.dispatchRecord(rec2, { tabId: 42, liveCache: { version: 11 }, chrome: {}, now: 1001 });

  assert.deepEqual(order, [
    'raw:1',
    'rpc:createRally:1',
    'raw:2',
    'mqtt:mobRallyAttackResult:2',
  ]);
  assert.deepEqual(seenCaches, [10, 11]);
});

test('registerQueueListeners forwards liveCache to updateRaidQueue and updateMonsterQueue', async () => {
  const bus = createRuntimeEventBus();
  const calls = [];
  const noop = async () => {};

  registerQueueListeners(bus, {
    updateRaidQueue: async (rec, tabId, _cr, liveCache) => { calls.push(['raid', rec.id, tabId, liveCache?.marker]); },
    updateMonsterQueue: async (rec, tabId, _cr, liveCache) => { calls.push(['monster', rec.id, tabId, liveCache?.marker]); },
    updateTowerRun: noop,
    updateDungeonRun: noop,
    advanceBuildingQueue: noop,
    advanceResearchQueue: noop,
  });

  await bus.dispatchRecord({ id: 'evt-1' }, { tabId: 7, liveCache: { marker: 'hot-v1' }, chrome: {}, now: 1000 });
  assert.deepEqual(calls, [
    ['raid', 'evt-1', 7, 'hot-v1'],
    ['monster', 'evt-1', 7, 'hot-v1'],
  ]);
});

test('ResourceLockManager reserves raid heroes & march slots and expires stale locks by TTL', () => {
  const mgr = new ResourceLockManager();
  const t0 = 1_700_000_000_000;

  mgr.syncFromQueueStates(
    {
      raidQueue: {
        status: 'waiting_rally',
        heroIds: [1, 2, 3, 4, 5],
      },
    },
    t0
  );

  // autoGather must see raidQueue's 5 heroes as reserved and 1 march slot held
  const reservedForGather = mgr.getReservedHeroIds('autoGather', t0 + 1000);
  assert.deepEqual([...reservedForGather].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.equal(mgr.getAvailableMarchSlots(3, 'autoGather', t0 + 1000), 2);
  // raidQueue itself is not blocked by its own lock
  assert.equal(mgr.getReservedHeroIds('raidQueue', t0 + 1000).size, 0);
  assert.equal(mgr.getAvailableMarchSlots(3, 'raidQueue', t0 + 1000), 3);

  // After TTL expires (10 min + 1s), lock auto-releases
  assert.equal(mgr.getReservedHeroIds('autoGather', t0 + 11 * 60_000).size, 0);
  assert.equal(mgr.getAvailableMarchSlots(3, 'autoGather', t0 + 11 * 60_000), 3);

  // Idle status releases immediately
  mgr.syncFromQueueStates({ raidQueue: { status: 'running', heroIds: [10, 11] } }, t0);
  assert.equal(mgr.getReservedHeroIds('autoGather', t0).size, 2);
  mgr.syncFromQueueStates({ raidQueue: { status: 'idle' } }, t0 + 500);
  assert.equal(mgr.getReservedHeroIds('autoGather', t0 + 500).size, 0);
});

test('handleDraftMessage delegates decrypted {base, swap} payload and stamps autoOpenNonce', () => {
  let saved = null;
  let sentMsg = null;
  const mockChrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb({ autoOpenDraftDialog: true, legendsDraftSession: { matchId: 99 } }),
        set: (obj) => { saved = obj; return Promise.resolve(); },
      },
    },
    runtime: {
      sendMessage: (msg) => { sentMsg = msg; return Promise.resolve(); },
    },
  };

  const handled = handleDraftMessage(
    {
      kind: 'draft-decrypted',
      data: {
        draft: { base: { '501': { id: 501, star: 4, power: 183180 } }, swap: null },
        raw: '{"base":{"501":{"id":501}}}',
      },
    },
    mockChrome
  );
  assert.equal(handled, true);
  assert.ok(saved?.legendsDraftSession);
  assert.deepEqual(saved.legendsDraftSession.heroSteps, [[501]]);
  assert.ok(saved.legendsDraftSession.autoOpenNonce > 0);
  assert.equal(sentMsg?.kind, 'open-draft-dialog');
});

test('backgroundRuntime.ts wires RuntimeEventBus, ResourceLockManager, and modular handlers', () => {
  const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background', 'backgroundRuntime.ts'), 'utf8');
  assert.match(bgSrc, /createRuntimeEventBus/);
  assert.match(bgSrc, /resourceLockManager/);
  assert.match(bgSrc, /registerQueueListeners/);
  assert.match(bgSrc, /handleDraftMessage/);
  assert.match(bgSrc, /runtimeEventBus\.dispatchRecord/);
});
