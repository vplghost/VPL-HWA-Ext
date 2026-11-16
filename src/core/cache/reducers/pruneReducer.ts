import type { PruneResult, RpcCacheState } from '../../../types';
import { normalizeArrayData, extractRewardActions } from '../extractors/baseExtractor.ts';
import { prune as pruneMail } from '../../../services/mailService.ts';

export function pruneCache(cache: RpcCacheState, now = Date.now()): PruneResult {
  if (!cache || typeof cache !== 'object') return { cache: {}, changed: false };

  const mailPruned = pruneMail(cache, now, (receipt: any) =>
    extractRewardActions(
      { timestamp: receipt.at },
      receipt.call || { ident: receipt.token, name: 'mailClaim' },
      receipt.reward
    ).map((action) => ({ key: action.data.resourceKey, amount: action.data.delta }))
  );

  const next: RpcCacheState = { ...(mailPruned?.cache || cache) };
  let changed = mailPruned?.changed || false;

  // 1. Prune guildChat (drop messages older than 7 days relative to last chat update and orphaned users)
  if (next.guildChat?.data) {
    const existing = next.guildChat.data;
    const refTimeMs = Date.parse(next.guildChat.updatedAt) || now;
    const cutoffSec = Math.floor(refTimeMs / 1000) - 7 * 86400;
    const rawMsgs = Array.isArray(existing.messages)
      ? existing.messages
      : existing.messages && typeof existing.messages === 'object'
        ? Object.values(existing.messages)
        : [];
    const msgs = rawMsgs.filter((m: any) => {
      const ctime = Number(m?.ctime || 0);
      return !ctime || ctime >= cutoffSec;
    });
    const originalCount = Array.isArray(existing.messages)
      ? existing.messages.length
      : existing.messages
        ? Object.keys(existing.messages).length
        : 0;
    if (msgs.length !== originalCount || !Array.isArray(existing.messages)) {
      const activeUids = new Set(msgs.map((m: any) => String(m.userId)));
      const users = Object.fromEntries(
        Object.entries(existing.users || {}).filter(([uid]) => activeUids.has(String(uid)))
      );
      next.guildChat = {
        ...next.guildChat,
        data: {
          ...existing,
          messages: msgs,
          users: Object.keys(users).length > 0 ? users : existing.users || {}
        }
      };
      changed = true;
    }
  }

  // 2. Prune specialQuestStatus (drop events expired > 30 minutes relative to last update)
  if (next.specialQuestStatus?.data?.events) {
    const rawEvents = Array.isArray(next.specialQuestStatus.data.events)
      ? next.specialQuestStatus.data.events
      : next.specialQuestStatus.data.events && typeof next.specialQuestStatus.data.events === 'object'
        ? Object.values(next.specialQuestStatus.data.events)
        : [];
    const refTimeMs = Date.parse(next.specialQuestStatus.updatedAt) || now;
    const validEvents = rawEvents.filter((ev: any) => !Number.isFinite(ev?.end) || ev.end >= refTimeMs - 1800000);
    const originalCount = Array.isArray(next.specialQuestStatus.data.events)
      ? next.specialQuestStatus.data.events.length
      : Object.keys(next.specialQuestStatus.data.events).length;
    if (validEvents.length !== originalCount || !Array.isArray(next.specialQuestStatus.data.events)) {
      next.specialQuestStatus = {
        ...next.specialQuestStatus,
        data: {
          ...next.specialQuestStatus.data,
          events: validEvents
        }
      };
      changed = true;
    }
  }

  // 3. Prune / normalize questClaimStatus (heal object-shaped claims)
  if (next.questClaimStatus?.data?.claims && !Array.isArray(next.questClaimStatus.data.claims)) {
    next.questClaimStatus = {
      ...next.questClaimStatus,
      data: {
        ...next.questClaimStatus.data,
        claims: normalizeArrayData(next.questClaimStatus.data.claims)
      }
    };
    changed = true;
  }

  return { cache: next, changed };
}
