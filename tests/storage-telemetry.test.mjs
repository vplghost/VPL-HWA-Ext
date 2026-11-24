import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecorderStore, InMemoryRecorderStore } from '../src/background/storage/recorderDb.ts';
import { pruneRpcCache, CACHE_PRUNE_LIMITS } from '../src/core/cache/cachePruner.ts';
import { RuntimeTelemetryTracker, collectStorageTelemetry, CHROME_LOCAL_QUOTA_BYTES } from '../src/background/telemetry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('RecorderStore appends, counts, exports, and clears API and interaction entries cleanly', async () => {
  const store = createRecorderStore(false);
  assert.ok(store instanceof InMemoryRecorderStore);
  assert.equal(store.backend, 'memory');

  await store.appendApiRecords([
    { endpoint: '/api/rpc', method: 'POST', timestamp: '2026-11-24T08:00:00.000Z' },
    { endpoint: '/mqtt', transport: 'mqtt', timestamp: '2026-11-24T08:00:01.000Z' },
  ]);
  await store.appendInteraction({ category: 'pointer', action: 'pointerdown', x: 100, y: 200 });

  const counts = await store.getCounts();
  assert.equal(counts.apiCount, 2);
  assert.equal(counts.interactionCount, 1);
  assert.ok((await store.estimateBytes()) > 0);

  const exported = await store.exportAll();
  assert.equal(exported.records.length, 2);
  assert.equal(exported.interactions.length, 1);

  await store.clear();
  const afterClear = await store.getCounts();
  assert.equal(afterClear.apiCount, 0);
  assert.equal(afterClear.interactionCount, 0);
  assert.equal(await store.estimateBytes(), 0);
});

test('pruneRpcCache trims oversized histories and expired entries while keeping recent data', () => {
  const now = Date.parse('2026-11-24T12:00:00.000Z');
  const oldTs = new Date(now - 20 * 86_400_000).toISOString();
  const recentTs = new Date(now - 1 * 86_400_000).toISOString();

  const cache = {
    resourceActionHistory: [
      { id: 'old-1', timestamp: oldTs },
      ...Array.from({ length: CACHE_PRUNE_LIMITS.resourceActionHistory.maxItems + 25 }, (_, i) => ({
        id: `recent-${i}`,
        timestamp: recentTs,
      })),
    ],
    createdRalliesHistory: [
      { id: 'rally-old', timestamp: oldTs },
      { id: 'rally-new', timestamp: recentTs },
    ],
    guildChat: {
      data: {
        messages: Array.from({ length: 300 }, (_, i) => ({ id: i, text: `msg-${i}` })),
      },
    },
  };

  const res = pruneRpcCache(cache, now);
  assert.equal(res.changed, true);
  assert.equal(cache.resourceActionHistory.length, CACHE_PRUNE_LIMITS.resourceActionHistory.maxItems);
  assert.equal(cache.createdRalliesHistory.length, 1);
  assert.equal(cache.createdRalliesHistory[0].id, 'rally-new');
  assert.equal(cache.guildChat.data.messages.length, CACHE_PRUNE_LIMITS.guildChatMessages.maxItems);
  assert.equal(cache.guildChat.data.messages[cache.guildChat.data.messages.length - 1].id, 299);
});

test('RuntimeTelemetryTracker and collectStorageTelemetry compute latency, flush rate, and partition sizes', async () => {
  const tracker = new RuntimeTelemetryTracker();
  const now = 1_700_000_000_000;
  tracker.recordBridgeLatency(now - 20, now);
  tracker.recordBridgeLatency(now - 40, now);
  tracker.recordBridgeLatency(now - 100, now);
  tracker.recordFlush(12, now - 10_000);
  tracker.recordFlush(18, now - 5_000);

  const mockChrome = {
    storage: {
      local: {
        get: async () => ({
          rpcCache: { heroGetAll: { data: { '1': { id: 1 } } } },
          'cache:world': { marchStatus: { data: [] } },
          guildChat: { data: { messages: [] } },
          raidQueue: { status: 'idle' },
        }),
        getBytesInUse: async () => 7_500_000, // 71.5% -> triggers quotaWarning
      },
    },
  };

  const store = createRecorderStore(false);
  await store.appendApiRecords([{ endpoint: '/api/rpc' }]);

  const snap = await collectStorageTelemetry(mockChrome, store, tracker, now);
  assert.equal(snap.storageQuotaBytes, CHROME_LOCAL_QUOTA_BYTES);
  assert.equal(snap.storageUsedBytes, 7_500_000);
  assert.equal(snap.quotaWarning, true);
  assert.equal(snap.flushesPerMinute, 2);
  assert.equal(snap.avgFlushDurationMs, 15);
  assert.equal(snap.avgBridgeLatencyMs, 53);
  assert.equal(snap.p95BridgeLatencyMs, 100);
  assert.equal(snap.recorderCounts.apiCount, 1);
  assert.ok(snap.partitions.some((p) => p.name === 'rpcCache'));
});

test('SettingsTab.vue and backgroundRuntime.ts wire Storage & Runtime Telemetry and Compact Cache', () => {
  const settingsSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'tabs', 'SettingsTab.vue'), 'utf8');
  assert.match(settingsSrc, /id="storage-telemetry-card"/);
  assert.match(settingsSrc, /id="btn-compact-cache"/);
  assert.match(settingsSrc, /get-storage-telemetry/);
  assert.match(settingsSrc, /compact-storage-cache/);

  const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background', 'backgroundRuntime.ts'), 'utf8');
  assert.match(bgSrc, /getRecorderStore/);
  assert.match(bgSrc, /pruneRpcCache/);
  assert.match(bgSrc, /collectStorageTelemetry/);
  assert.match(bgSrc, /kind === 'get-storage-telemetry'/);
  assert.match(bgSrc, /kind === 'compact-storage-cache'/);
});
