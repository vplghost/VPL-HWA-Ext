/**
 * Expiring Quest & Event Rewards Auto-Claim Service (`expiringClaimService.ts`).
 *
 * Last-chance safety net (default 10 minutes before expiry) with Zero-Polling Single Alarm:
 * - Timed Quests (`questGetAll`, `state === 2` with explicit `endTime`/`availableUntil`,
 *   including the 3x daily free 60-Energy timed quests) -> `quest_multiFarm`
 * - Daily Reset Quests (`questGetAll` without explicit `endTime` + ready `dailyQuests`) -> `quest_multiFarm` / `completeQuest`
 * - Event Quests (`resolveClaimableEventQuests` with `event.endTime`) -> `completeQuest`
 * - Battle Pass Free Rewards (`resolveClaimableBattlePassRewards` with `pass.endTime`) -> `claimBattlepassRewardAll`
 *
 * Strict 0-Emerald safety: only dispatches verified free reward claim RPCs.
 */
import { dailyQuests, questData } from '../data/questData.ts';
import {
  resolveClaimableBattlePassRewards,
  resolveClaimableEventQuests,
} from '../utils/eventClaimHelper.ts';
import { knownQuestTargets } from '../utils/tierHelper.ts';
import { resolveDailyResetAnchor } from './dailyAutopilotService.ts';
import type { ExpiringClaimSettings } from '../types/index.ts';

export const AUTO_EXPIRING_CLAIMS_ALARM_NAME = 'hwa-auto-expiring-claims';
export const EXPIRING_CLAIMS_DEDUPE_MS = 5 * 60 * 1000;
export const EXPIRING_CLAIMS_ERROR_BACKOFF_MS = 2 * 60 * 1000;

export const DEFAULT_EXPIRING_CLAIM_SETTINGS: ExpiringClaimSettings = {
  enabled: false,
  leadMinutes: 10,
  includeTimedQuests: true,
  includeDailyResetQuests: true,
  includeEventRewards: true,
};

export interface ExpiringRewardItem {
  dedupeKey: string;
  kind: 'timed-quest' | 'daily-quest' | 'daily-4x-quest' | 'event-quest' | 'battlepass';
  id: number;
  label: string;
  expiryMs: number;
  payload?: any;
}

export interface ExpiringClaimPlan {
  action: 'claim' | 'wait' | 'idle' | 'backoff' | 'disabled';
  calls: Array<{ name: string; feature?: string; args?: Record<string, any> }>;
  dueItems: ExpiringRewardItem[];
  upcomingItems: ExpiringRewardItem[];
  nextWakeAt: number | null;
  leadMs: number;
}

export function normalizeExpiringClaimSettings(
  raw?: Partial<ExpiringClaimSettings> | null
): ExpiringClaimSettings {
  const rawLead = Math.floor(Number(raw?.leadMinutes));
  const leadMinutes = Number.isFinite(rawLead)
    ? Math.max(1, Math.min(60, rawLead))
    : DEFAULT_EXPIRING_CLAIM_SETTINGS.leadMinutes;

  return {
    enabled: raw?.enabled === true,
    leadMinutes,
    includeTimedQuests: raw?.includeTimedQuests !== false,
    includeDailyResetQuests: raw?.includeDailyResetQuests !== false,
    includeEventRewards: raw?.includeEventRewards !== false,
  };
}

export function toExpiryMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim()))) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? Math.floor(n * 1000) : Math.floor(n);
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function pruneRecentlyClaimedMap(
  map: Record<string, number> | null | undefined,
  now = Date.now()
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!map || typeof map !== 'object') return out;
  for (const [key, ts] of Object.entries(map)) {
    const numTs = Number(ts);
    if (Number.isFinite(numTs) && now - numTs < EXPIRING_CLAIMS_DEDUPE_MS) {
      out[key] = numTs;
    }
  }
  return out;
}

/**
 * Evaluates all ready-to-claim quests & event rewards and partitions them into:
 * - `dueItems`: expiring within `leadMinutes` (`now >= expiryMs - leadMs && now < expiryMs`) -> claim now
 * - `upcomingItems`: expiring later (`expiryMs - leadMs > now`) -> schedule single alarm at earliest `expiryMs - leadMs`
 */
export function collectExpiringClaimPlan(
  cache: Record<string, any> | null | undefined,
  rawSettings?: Partial<ExpiringClaimSettings> | null,
  now = Date.now(),
  options?: {
    recentlyClaimed?: Record<string, number> | null;
    nextRetryAt?: number | null;
    dynamicCatalog?: any;
  }
): ExpiringClaimPlan {
  const settings = normalizeExpiringClaimSettings(rawSettings);
  const leadMs = settings.leadMinutes * 60_000;

  if (!settings.enabled) {
    return { action: 'disabled', calls: [], dueItems: [], upcomingItems: [], nextWakeAt: null, leadMs };
  }

  const nextRetryAt = Number(options?.nextRetryAt);
  if (Number.isFinite(nextRetryAt) && nextRetryAt > now) {
    return { action: 'backoff', calls: [], dueItems: [], upcomingItems: [], nextWakeAt: nextRetryAt, leadMs };
  }

  const safeCache = cache && typeof cache === 'object' ? cache : {};
  const recent = pruneRecentlyClaimedMap(options?.recentlyClaimed, now);
  const dailyAnchor = resolveDailyResetAnchor(safeCache, null, now);
  const nextDailyResetMs = dailyAnchor.nextResetMs;

  const candidates: ExpiringRewardItem[] = [];

  // 1. Classic / Timed Quests (`questGetAll`, state === 2) — includes 3x daily free 60-Energy quests
  const legacyQuests = Array.isArray(safeCache.questGetAll?.data)
    ? safeCache.questGetAll.data
    : Array.isArray(safeCache.questGetAll)
      ? safeCache.questGetAll
      : [];

  for (const q of legacyQuests) {
    if (!q || q.state !== 2 || q.id == null) continue;
    const qId = Number(q.id);
    if (!Number.isFinite(qId)) continue;

    const explicitExpiry = toExpiryMs(q.endTime ?? q.availableUntil ?? q.dateEnd ?? q.expireTime);
    if (explicitExpiry != null) {
      if (!settings.includeTimedQuests) continue;
      if (explicitExpiry <= now) continue; // already expired
      candidates.push({
        dedupeKey: `timed-quest:${qId}:${explicitExpiry}`,
        kind: 'timed-quest',
        id: qId,
        label: `Timed Quest #${qId}`,
        expiryMs: explicitExpiry,
      });
    } else if (settings.includeDailyResetQuests && nextDailyResetMs > now) {
      candidates.push({
        dedupeKey: `daily-quest:${qId}:${nextDailyResetMs}`,
        kind: 'daily-quest',
        id: qId,
        label: `Daily Quest #${qId}`,
        expiryMs: nextDailyResetMs,
      });
    }
  }

  // 2. Daily 4X Quests expiring at daily reset
  if (settings.includeDailyResetQuests && nextDailyResetMs > now) {
    const dqList = dailyQuests(safeCache, now) || [];
    for (const dq of dqList) {
      if (!dq || dq.id == null) continue;
      const isDone = dq.state === 'completed' || (dq.state as any) === 3 || (Number(dq.completionCount) || 0) > 0;
      if (isDone) continue;
      const target =
        Number(
          questData?.dailyDefinition?.(dq.id)?.condition?.target ??
            (knownQuestTargets as any)[dq.id] ??
            dq.target ??
            dq.condition?.target
        ) || 0;
      const progress = Number(dq.progress) || 0;
      const isReady = dq.state === 'ready' || (dq.state as any) === 2 || (target > 0 && progress >= target);
      if (!isReady) continue;

      const dqId = Number(dq.id);
      candidates.push({
        dedupeKey: `daily-4x-quest:${dqId}:${nextDailyResetMs}`,
        kind: 'daily-4x-quest',
        id: dqId,
        label: `Daily 4X Quest #${dqId}`,
        expiryMs: nextDailyResetMs,
      });
    }
  }

  // 3. Special Event Quests & Battle Pass Free Rewards
  if (settings.includeEventRewards) {
    const rawEvents =
      safeCache.specialQuestStatus?.data?.events ||
      safeCache['getSpecialQuestState:quest']?.data?.events ||
      safeCache.questEvents?.data?.events ||
      [];
    const eventExpiryById = new Map<number, number>();
    for (const ev of Array.isArray(rawEvents) ? rawEvents : []) {
      const evId = Number(ev?.id);
      const exp = toExpiryMs(ev?.endTime ?? ev?.dateEnd ?? ev?.finishTime);
      if (Number.isFinite(evId) && exp != null && exp > now) {
        eventExpiryById.set(evId, exp);
      }
    }

    const eventQuests = resolveClaimableEventQuests(safeCache);
    for (const eq of eventQuests) {
      const exp = eventExpiryById.get(eq.eventId);
      if (!exp || exp <= now) continue;
      candidates.push({
        dedupeKey: `event-quest:${eq.questId}:${exp}`,
        kind: 'event-quest',
        id: eq.questId,
        label: eq.title || `Event Quest #${eq.questId}`,
        expiryMs: exp,
      });
    }

    const rawPasses =
      safeCache.battlepassLiveStatus?.data?.battlepasses ||
      safeCache['getBattlepassState:battlepass']?.data?.battlepasses ||
      [];
    const passExpiryById = new Map<number, number>();
    for (const p of Array.isArray(rawPasses) ? rawPasses : []) {
      const bpId = Number(p?.battlepassId);
      const exp = toExpiryMs(p?.endTime ?? p?.finishTime ?? p?.dateEnd);
      if (Number.isFinite(bpId) && exp != null && exp > now) {
        passExpiryById.set(bpId, exp);
      }
    }

    const bpRewards = resolveClaimableBattlePassRewards(safeCache, options?.dynamicCatalog);
    for (const bp of bpRewards) {
      const exp = passExpiryById.get(bp.battlepassId);
      if (!exp || exp <= now || bp.levelIdAndTrackIdToClaim.length === 0) continue;
      candidates.push({
        dedupeKey: `battlepass:${bp.battlepassId}:${bp.count}:${exp}`,
        kind: 'battlepass',
        id: bp.battlepassId,
        label: `Battle Pass #${bp.battlepassId} (${bp.count})`,
        expiryMs: exp,
        payload: bp,
      });
    }
  }

  const dueItems: ExpiringRewardItem[] = [];
  const upcomingItems: ExpiringRewardItem[] = [];

  for (const item of candidates) {
    if (item.expiryMs <= now) continue;
    const triggerAt = item.expiryMs - leadMs;
    if (now >= triggerAt) {
      if (!recent[item.dedupeKey]) {
        dueItems.push(item);
      }
    } else {
      upcomingItems.push(item);
    }
  }

  // Build verified 0-Emerald claim RPCs
  const calls: Array<{ name: string; feature?: string; args?: Record<string, any> }> = [];
  const legacyQuestIds = dueItems
    .filter((i) => i.kind === 'timed-quest' || i.kind === 'daily-quest')
    .map((i) => i.id);
  if (legacyQuestIds.length > 0) {
    calls.push({ name: 'quest_multiFarm', args: { questIds: legacyQuestIds } });
  }

  for (const item of dueItems) {
    if (item.kind === 'daily-4x-quest' || item.kind === 'event-quest') {
      calls.push({ name: 'completeQuest', args: { questId: item.id }, feature: 'quest' });
    } else if (item.kind === 'battlepass' && item.payload) {
      calls.push({
        name: 'claimBattlepassRewardAll',
        args: {
          battlepassId: item.payload.battlepassId,
          levelIdAndTrackIdToClaim: item.payload.levelIdAndTrackIdToClaim,
          claimedAt: new Date(now).toISOString(),
        },
        feature: 'battlepass',
      });
    }
  }

  let nextWakeAt: number | null = null;
  for (const up of upcomingItems) {
    const wake = up.expiryMs - leadMs;
    if (nextWakeAt == null || wake < nextWakeAt) {
      nextWakeAt = wake;
    }
  }

  if (calls.length > 0) {
    return { action: 'claim', calls, dueItems, upcomingItems, nextWakeAt, leadMs };
  }
  if (nextWakeAt != null) {
    return { action: 'wait', calls: [], dueItems: [], upcomingItems, nextWakeAt, leadMs };
  }
  return { action: 'idle', calls: [], dueItems: [], upcomingItems: [], nextWakeAt: null, leadMs };
}
