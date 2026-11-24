/**
 * TTL & Cap Auto-Pruner for rpcCache history partitions.
 * Keeps `chrome.storage.local` lean (< 2 MB typical) without losing recent/today activity data.
 */

export const CACHE_PRUNE_LIMITS = {
  resourceActionHistory: { maxItems: 300, maxAgeDays: 14 },
  createdRalliesHistory: { maxItems: 200, maxAgeDays: 14 },
  brigandCampHistory: { maxItems: 150, maxAgeDays: 14 },
  guildChatMessages: { maxItems: 250, maxAgeDays: 0 },
  battleReports: { maxItems: 100, maxAgeDays: 7 },
} as const;

export interface PruneResult {
  changed: boolean;
  removedCount: number;
  details: Record<string, number>;
}

function extractEntryTimestampMs(item: any): number | null {
  if (!item || typeof item !== 'object') return null;
  const raw =
    item.timestamp ??
    item.updatedAt ??
    item.createdAt ??
    item.time ??
    item.ctime ??
    item.ts ??
    null;
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return num > 1e12 ? num : num * 1000;
  }
  return null;
}

function pruneArray(
  arr: any[],
  maxItems: number,
  maxAgeDays: number,
  nowMs: number
): { next: any[]; removed: number } {
  if (!Array.isArray(arr) || arr.length === 0) return { next: arr, removed: 0 };
  const cutoffMs = maxAgeDays > 0 ? nowMs - maxAgeDays * 86_400_000 : 0;

  let filtered = arr;
  if (cutoffMs > 0) {
    filtered = arr.filter((item) => {
      const ts = extractEntryTimestampMs(item);
      // Keep items without parseable timestamps to avoid accidental data loss
      return ts == null || ts >= cutoffMs;
    });
  }

  if (maxItems > 0 && filtered.length > maxItems) {
    // Keep newest `maxItems` entries (preserve tail if chronological)
    const firstTs = extractEntryTimestampMs(filtered[0]);
    const lastTs = extractEntryTimestampMs(filtered[filtered.length - 1]);
    if (firstTs != null && lastTs != null && firstTs > lastTs) {
      filtered = filtered.slice(0, maxItems);
    } else {
      filtered = filtered.slice(filtered.length - maxItems);
    }
  }

  const removed = arr.length - filtered.length;
  return { next: removed > 0 ? filtered : arr, removed };
}

/**
 * Pure-style in-place or cloned pruning of `rpcCache` history partitions.
 * Returns summary of removed entries.
 */
export function pruneRpcCache(
  cache: Record<string, any> | null | undefined,
  nowMs: number = Date.now()
): PruneResult {
  const details: Record<string, number> = {};
  let removedCount = 0;
  if (!cache || typeof cache !== 'object') {
    return { changed: false, removedCount: 0, details };
  }

  const historyKeys: Array<keyof typeof CACHE_PRUNE_LIMITS> = [
    'resourceActionHistory',
    'createdRalliesHistory',
    'brigandCampHistory',
  ];

  for (const key of historyKeys) {
    const limit = CACHE_PRUNE_LIMITS[key];
    const entry = cache[key];
    if (Array.isArray(entry)) {
      const { next, removed } = pruneArray(entry, limit.maxItems, limit.maxAgeDays, nowMs);
      if (removed > 0) {
        cache[key] = next;
        details[key] = removed;
        removedCount += removed;
      }
    } else if (entry && Array.isArray(entry.data)) {
      const { next, removed } = pruneArray(entry.data, limit.maxItems, limit.maxAgeDays, nowMs);
      if (removed > 0) {
        cache[key] = { ...entry, data: next };
        details[key] = removed;
        removedCount += removed;
      }
    }
  }

  // Guild chat messages cap
  const chatMsgs = cache.guildChat?.data?.messages;
  if (Array.isArray(chatMsgs)) {
    const { next, removed } = pruneArray(
      chatMsgs,
      CACHE_PRUNE_LIMITS.guildChatMessages.maxItems,
      0,
      nowMs
    );
    if (removed > 0) {
      cache.guildChat = {
        ...cache.guildChat,
        data: { ...cache.guildChat.data, messages: next },
      };
      details.guildChatMessages = removed;
      removedCount += removed;
    }
  }

  // Battle reports / arena replays cap
  const reports = cache.battleReports?.data;
  if (Array.isArray(reports)) {
    const { next, removed } = pruneArray(
      reports,
      CACHE_PRUNE_LIMITS.battleReports.maxItems,
      CACHE_PRUNE_LIMITS.battleReports.maxAgeDays,
      nowMs
    );
    if (removed > 0) {
      cache.battleReports = { ...cache.battleReports, data: next };
      details.battleReports = removed;
      removedCount += removed;
    }
  }

  return {
    changed: removedCount > 0,
    removedCount,
    details,
  };
}
