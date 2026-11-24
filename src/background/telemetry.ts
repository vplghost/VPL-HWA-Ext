/**
 * Runtime Storage Quota & Latency Telemetry Tracker.
 * Maintains a lightweight in-memory ring buffer of bridge->background latencies
 * and disk flush frequencies without generating extra disk writes.
 */
import type { RecorderStore } from './storage/recorderDb.ts';

export const CHROME_LOCAL_QUOTA_BYTES = 10 * 1024 * 1024; // 10 MB

export interface StoragePartitionStat {
  name: string;
  bytes: number;
  keys: number;
}

export interface RuntimeTelemetrySnapshot {
  updatedAt: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  storageUsagePct: number;
  quotaWarning: boolean;
  partitions: StoragePartitionStat[];
  recorderBackend: 'indexeddb' | 'memory';
  recorderIdbBytes: number;
  recorderCounts: { apiCount: number; interactionCount: number };
  avgBridgeLatencyMs: number;
  p95BridgeLatencyMs: number;
  flushesPerMinute: number;
  avgFlushDurationMs: number;
}

const MAX_SAMPLES = 60;

export class RuntimeTelemetryTracker {
  private latencies: number[] = [];
  private flushTimestamps: number[] = [];
  private flushDurations: number[] = [];

  recordBridgeLatency(recordTimestamp?: string | number | null, nowMs: number = Date.now()): void {
    if (recordTimestamp == null) return;
    const ts = typeof recordTimestamp === 'number' ? recordTimestamp : Date.parse(String(recordTimestamp));
    if (!Number.isFinite(ts)) return;
    const delta = Math.max(0, Math.min(60_000, nowMs - ts));
    this.latencies.push(delta);
    if (this.latencies.length > MAX_SAMPLES) this.latencies.shift();
  }

  recordFlush(durationMs: number, nowMs: number = Date.now()): void {
    const dur = Math.max(0, Number(durationMs) || 0);
    this.flushDurations.push(dur);
    if (this.flushDurations.length > MAX_SAMPLES) this.flushDurations.shift();
    this.flushTimestamps.push(nowMs);
    const oneMinAgo = nowMs - 60_000;
    while (this.flushTimestamps.length > 0 && this.flushTimestamps[0] < oneMinAgo) {
      this.flushTimestamps.shift();
    }
  }

  getLatencyStats(): { avgMs: number; p95Ms: number } {
    if (this.latencies.length === 0) return { avgMs: 0, p95Ms: 0 };
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const sorted = this.latencies.slice().sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return {
      avgMs: Math.round(sum / this.latencies.length),
      p95Ms: Math.round(sorted[p95Idx] || 0),
    };
  }

  getFlushStats(nowMs: number = Date.now()): { flushesPerMinute: number; avgFlushDurationMs: number } {
    const oneMinAgo = nowMs - 60_000;
    while (this.flushTimestamps.length > 0 && this.flushTimestamps[0] < oneMinAgo) {
      this.flushTimestamps.shift();
    }
    const avgFlushDurationMs = this.flushDurations.length
      ? Math.round(this.flushDurations.reduce((a, b) => a + b, 0) / this.flushDurations.length)
      : 0;
    return {
      flushesPerMinute: this.flushTimestamps.length,
      avgFlushDurationMs,
    };
  }

  reset(): void {
    this.latencies = [];
    this.flushTimestamps = [];
    this.flushDurations = [];
  }
}

export const runtimeTelemetry = new RuntimeTelemetryTracker();

function estimateBytes(val: any): number {
  try {
    return new TextEncoder().encode(JSON.stringify(val)).length;
  } catch {
    try {
      return JSON.stringify(val).length;
    } catch {
      return 0;
    }
  }
}

export async function collectStorageTelemetry(
  cr: any,
  recorderStore?: RecorderStore | null,
  tracker: RuntimeTelemetryTracker = runtimeTelemetry,
  nowMs: number = Date.now()
): Promise<RuntimeTelemetrySnapshot> {
  const allLocal: Record<string, any> = (await cr?.storage?.local?.get?.(null)?.catch?.(() => ({}))) || {};
  const buckets = new Map<string, { bytes: number; keys: number }>();

  const addBucket = (name: string, bytes: number) => {
    const cur = buckets.get(name) || { bytes: 0, keys: 0 };
    cur.bytes += bytes;
    cur.keys += 1;
    buckets.set(name, cur);
  };

  let computedTotal = 0;
  for (const [k, v] of Object.entries(allLocal)) {
    const b = estimateBytes(v) + k.length;
    computedTotal += b;
    if (k === 'rpcCache') addBucket('rpcCache', b);
    else if (k === 'cache:world') addBucket('cache:world', b);
    else if (k === 'cache:roster') addBucket('cache:roster', b);
    else if (k === 'guildChat') addBucket('guildChat', b);
    else if (k.startsWith('record:') || k.startsWith('interaction:')) addBucket('legacyRecorder', b);
    else addBucket('queues & settings', b);
  }

  let storageUsedBytes = computedTotal;
  try {
    if (typeof cr?.storage?.local?.getBytesInUse === 'function') {
      const nativeBytes = await cr.storage.local.getBytesInUse(null);
      if (typeof nativeBytes === 'number' && Number.isFinite(nativeBytes) && nativeBytes >= 0) {
        storageUsedBytes = nativeBytes;
      }
    }
  } catch (_) {}

  const recorderCounts = recorderStore
    ? await recorderStore.getCounts().catch(() => ({ apiCount: 0, interactionCount: 0 }))
    : { apiCount: 0, interactionCount: 0 };
  const recorderIdbBytes = recorderStore
    ? await recorderStore.estimateBytes().catch(() => 0)
    : 0;

  const { avgMs, p95Ms } = tracker.getLatencyStats();
  const { flushesPerMinute, avgFlushDurationMs } = tracker.getFlushStats(nowMs);
  const storageUsagePct = Math.min(100, Math.round((storageUsedBytes / CHROME_LOCAL_QUOTA_BYTES) * 1000) / 10);

  const partitions: StoragePartitionStat[] = [...buckets.entries()]
    .map(([name, stat]) => ({ name, bytes: stat.bytes, keys: stat.keys }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    updatedAt: new Date(nowMs).toISOString(),
    storageQuotaBytes: CHROME_LOCAL_QUOTA_BYTES,
    storageUsedBytes,
    storageUsagePct,
    quotaWarning: storageUsagePct >= 70,
    partitions,
    recorderBackend: recorderStore?.backend ?? 'memory',
    recorderIdbBytes,
    recorderCounts,
    avgBridgeLatencyMs: avgMs,
    p95BridgeLatencyMs: p95Ms,
    flushesPerMinute,
    avgFlushDurationMs,
  };
}
