import type {
  CacheEntry,
  MergeResult,
  PruneResult,
  RpcCacheModule,
  RpcCacheState,
  RpcRecord
} from '../../types';
import { RPC_CACHE_DEFINITIONS } from './definitions.ts';
import { extractSocket } from './extractors/socketExtractor.ts';
import { extractCostActions, extractRewardActions, normalizeArrayData } from './extractors/baseExtractor.ts';
import { reduceAccountChange } from './reducers/accountReducer.ts';
import { pruneCache as pruneCacheImpl } from './reducers/pruneReducer.ts';

export const definitions = RPC_CACHE_DEFINITIONS;

export function extract(record: RpcRecord): CacheEntry[] {
  const existing = (globalThis as any).hwaHelperRpcCache;
  if (existing?.extract && existing.extract !== extract) {
    return existing.extract(record);
  }

  // Socket frames
  if (record?.transport === 'websocket') {
    return extractSocket(record);
  }

  // Direct cache entries
  if (record && record.key && typeof record.key === 'string' && record.data) {
    return [
      {
        key: record.key,
        method: record.method,
        group: record.group || definitions[record.method || ''] || 'other',
        data: record.data,
        updatedAt: typeof record.timestamp === 'string' ? record.timestamp : new Date(record.timestamp || Date.now()).toISOString()
      }
    ];
  }

  // Parse HTTP RPC record
  if (!record?.requestBody || !record?.responseBody || record.status !== 200) {
    return [];
  }

  try {
    const req = JSON.parse(record.requestBody);
    const res = JSON.parse(record.responseBody);
    const calls: any[] = req.calls || [];
    const results: any[] = res.results || [];
    const entries: CacheEntry[] = [];
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : new Date(record.timestamp || Date.now()).toISOString();

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      if (!call || typeof call.name !== 'string') continue;
      const matched = results.find((r) => r.ident !== undefined && String(r.ident) === String(call.ident)) || results[i];
      const response = matched?.result?.response;
      if (response === undefined) continue;

      const group = definitions[call.name] || 'other';

      // General snapshot entry
      entries.push({
        key: call.name,
        method: call.name,
        group,
        data: response,
        updatedAt: timestamp
      });

      // Mail farm extraction
      if (call.name === 'mailFarm' && response && typeof response === 'object') {
        const letterIds = Object.keys(response);
        for (const letterId of letterIds) {
          const letterReward = response[letterId];
          if (letterReward && typeof letterReward === 'object') {
            entries.push(...extractRewardActions(record, call, letterReward, `mail:${letterId}`));
          }
        }
        entries.push({
          key: 'mailStatus',
          method: call.name,
          feature: call.feature || null,
          group: 'header',
          data: {
            letters: letterIds.map((id) => ({ id, claimed: true }))
          },
          updatedAt: timestamp
        });
        entries.push({
          key: 'mailClaimReceipts',
          group: 'internal',
          data: {
            token: call.ident,
            at: timestamp,
            accountId: null,
            success: true,
            letterIds
          },
          updatedAt: timestamp
        });
      }

      // Reward and Cost extractions
      if (response?.reward || response?.rewards || response?.claimedRewards) {
        entries.push(...extractRewardActions(record, call, response));
      }
      if (response?.cost || response?.costs) {
        entries.push(...extractCostActions(record, call, response.cost || response.costs));
      }
    }

    return entries;
  } catch (_) {
    return [];
  }
}

export function pruneCache(cache: RpcCacheState, now = Date.now()): PruneResult {
  const existing = (globalThis as any).hwaHelperRpcCache;
  if (existing?.pruneCache && existing.pruneCache !== pruneCache) {
    return existing.pruneCache(cache, now);
  }
  return pruneCacheImpl(cache, now);
}

export function merge(
  cache: RpcCacheState,
  records: RpcRecord[],
  maxBytes = 5 * 1024 * 1024
): MergeResult {
  const existing = (globalThis as any).hwaHelperRpcCache;
  if (existing?.merge && existing.merge !== merge) {
    return existing.merge(cache, records, maxBytes);
  }

  let next: RpcCacheState = { ...(cache && typeof cache === 'object' ? cache : {}) };
  let changed = false;

  for (const record of records) {
    const entries = record && record.key ? [record as unknown as CacheEntry] : extract(record);
    for (const entry of entries) {
      if (!entry || !entry.key) continue;

      if (reduceAccountChange(next, entry)) {
        changed = true;
      }

      // Handle experimental defeated bosses filter
      if (entry.key === 'experimentalRallySearch') {
        const won = normalizeArrayData(next.experimentalDefeatedBosses?.data);
        const mobs = normalizeArrayData(entry.data?.mobs);
        entry.data = {
          ...entry.data,
          mobs: mobs.filter((mob: any) =>
            mob && !won.some((item: any) => item?.mapId === entry.data?.mapId && item?.mobId === mob?.mobId)
          )
        };
      }

      if (entry.key === 'resourceAction') {
        const data = entry.data;
        const existingRes = next[data.resourceKey];
        if (existingRes?.data && typeof existingRes.data.amount === 'number') {
          existingRes.data.amount += data.delta;
          existingRes.updatedAt = entry.updatedAt;
          changed = true;
        }
        continue;
      }

      if (entry.key === 'mailClaimReceipts') {
        const seen = normalizeArrayData(next.mailClaimReceipts?.data);
        const data = entry.data;
        const receipt = {
          token: data.token,
          at: data.at || entry.updatedAt,
          accountId: data.accountId ?? next.accountStatus?.data?.id,
          success: data.success !== false,
          letterIds: normalizeArrayData(data.letterIds),
          reportIds: normalizeArrayData(data.reportIds),
          error: data.error
        };
        next.mailClaimReceipts = {
          key: 'mailClaimReceipts',
          group: 'internal',
          data: [...seen, receipt].slice(-200),
          updatedAt: entry.updatedAt
        };
        changed = true;
        continue;
      }

      if (entry.key === 'mailStatus') {
        const existingMail = next.mailStatus;
        if (existingMail?.data?.letters && Array.isArray(entry.data?.letters)) {
          const claimedMap = new Set(entry.data.letters.map((l: any) => String(l.id)));
          for (const letter of existingMail.data.letters) {
            if (claimedMap.has(String(letter.id))) {
              letter.claimed = true;
            }
          }
          existingMail.updatedAt = entry.updatedAt;
          changed = true;
        }
      }

      next[entry.key] = entry;
      changed = true;
    }
  }

  const pruned = pruneCache(next);
  if (pruned.changed) {
    next = pruned.cache;
    changed = true;
  }

  if (!changed) return { cache: next, changed: false };

  // Max bytes guard
  try {
    const encoder = new TextEncoder();
    const size = () => encoder.encode(JSON.stringify(next)).byteLength;
    while (size() > maxBytes && Object.keys(next).length > 1) {
      const oldest = Object.values(next)
        .filter((e: any) => e?.updatedAt)
        .sort((a: any, b: any) => String(a.updatedAt).localeCompare(String(b.updatedAt)))[0];
      if (oldest?.key) {
        delete next[oldest.key];
      } else {
        break;
      }
    }
  } catch (_) {}

  return { cache: next, changed: true };
}

export const rpcCacheService: RpcCacheModule = {
  extract,
  merge,
  definitions,
  pruneCache
};

// Global backward compatibility
if (typeof globalThis !== 'undefined') {
  const prev = (globalThis as any).hwaHelperRpcCache;
  if (!prev) {
    (globalThis as any).hwaHelperRpcCache = rpcCacheService;
  }
}
