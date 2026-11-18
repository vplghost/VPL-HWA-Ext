import { normalizeArray } from './troops.ts';
import { formatDuration } from './formatters.ts';
import { gatheringProgress } from './gatheringProgress.ts';
import { bossLevel, soloMonsterLevel } from './experimentalData.ts';
import { getMarchBadgeInfo, isMarchExpired } from './resourceData.ts';

const timestampMs = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e11 ? value * 1000 : value;
};

export function queueEndMs(queue: any): number | null {
  const finish = timestampMs(queue?.finishTime ?? queue?.endTime);
  if (finish !== null) return finish;
  const start = timestampMs(queue?.startDate ?? queue?.startTime);
  const duration = Number.isFinite(queue?.durationMs) ? queue.durationMs
    : Number.isFinite(queue?.duration) ? queue.duration * 1000 : null;
  return start !== null && duration !== null && duration >= 0 ? start + duration : null;
}

export function queueProgressPercent(queue: any, now = Date.now()): number {
  const end = queueEndMs(queue);
  if (end === null) return 0;
  if (now >= end) return 100;
  const rawStart = timestampMs(queue?.startDate ?? queue?.startTime);
  const duration = Number.isFinite(queue?.durationMs) ? queue.durationMs
    : Number.isFinite(queue?.duration) ? queue.duration * 1000 : null;
  const start = rawStart !== null ? rawStart : (duration !== null ? end - duration : null);
  if (start !== null && end > start) {
    const elapsed = Math.max(0, now - start);
    const total = end - start;
    const pct = (elapsed / total) * 100;
    return Math.min(100, Math.max(0, Number(pct.toFixed(1))));
  }
  return 0;
}

/**
 * Calculates the account's maximum squad/march capacity based on permanent research and active subscription.
 * - Base capacity: 1 squad queue
 * - Command Tactics I (Research ID 7, Level >= 1): +1 squad queue
 * - Command Tactics II (Research ID 94, Level >= 1): +1 squad queue
 * - Active Subscription (Bonus 3732): +1 squad queue
 * - Floored at current active marches/squads in game cache.
 * Defaults to 3 if research cache is not yet populated.
 */
export function calculateAccountMaxMarches(cache: Record<string, any>): number {
  if (!cache || typeof cache !== 'object') return 3;

  const researchStatus = cache.researchStatus?.data;
  let baseAndBonuses = 1;

  if (researchStatus != null) {
    const rawResearches = researchStatus.completedResearches ?? researchStatus.researches ?? researchStatus;
    const completed = normalizeArray(rawResearches);

    // Command Tactics I (Research ID 7)
    const hasTac1 = completed.some((r: any) => (r?.researchId ?? r?.id) === 7 && (r?.level ?? 1) >= 1);
    if (hasTac1) baseAndBonuses += 1;

    // Command Tactics II (Research ID 94)
    const hasTac2 = completed.some((r: any) => (r?.researchId ?? r?.id) === 94 && (r?.level ?? 1) >= 1);
    if (hasTac2) baseAndBonuses += 1;

    // 30-day Subscription bonus
    const sub = cache.subscriptionGetInfo?.data?.subscription ?? cache.subscriptionStatus?.data?.subscription;
    if (sub && (sub.isActive === true || (sub.endTime && (sub.endTime > Date.now() / 1000 || sub.endTime > Date.now())))) {
      baseAndBonuses += 1;
    }
  } else {
    // If researchStatus is not yet populated in cache, fallback to stored settings or 3
    const storedMax = cache.autoGatherSettings?.data?.maxMarches ?? cache.autoGatherSettings?.maxMarches;
    baseAndBonuses = Number.isInteger(storedMax) && storedMax >= 1 ? storedMax : 3;
  }

  // Ensure capacity is at least as large as currently deployed marches or squads
  const rawMarches = cache.marchStatus?.data?.marches;
  const marchesCount = normalizeArray(rawMarches).length;

  const rawSquads = cache['getUnitSummary:unit']?.data?.squads;
  const squadsCount = normalizeArray(rawSquads).length;

  const maxMarches = Math.max(baseAndBonuses, marchesCount, squadsCount);
  return Math.max(1, Math.min(10, maxMarches));
}

export function dashboardQueues(cache: Record<string, any>, kind: 'building' | 'research', now = Date.now()) {
  const status = cache[`${kind}Status`]?.data ?? cache[`${kind}_getQueue`]?.data;
  if (status == null) return { state: 'unknown', rows: [] };
  const raw = status.queues ?? status.queue ?? (Array.isArray(status) ? status
    : status[`${kind}Id`] != null || status.startDate != null || status.startTime != null ? [status]
    : Object.values(status).filter((value) => value && typeof value === 'object'));
  const rows = normalizeArray(raw).filter((queue) => queue && typeof queue === 'object').map((queue: any, index: number) => {
    const end = queueEndMs(queue);
    const remaining = end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
    const state = end === null ? 'unknown' : end > now ? 'active' : 'ready';
    return {
      id: `${queue.queueNumber ?? index}:${queue[`${kind}Id`] ?? queue.id ?? index}`,
      entityId: queue[`${kind}Id`] ?? queue.id,
      level: queue.level ?? queue.nextLevel ?? queue.targetLevel,
      state,
      timerText: remaining === null ? 'Unknown' : remaining > 0 ? formatDuration(remaining) : 'Ready',
      progressPercent: state === 'ready' ? 100 : queueProgressPercent(queue, now),
    };
  });
  return { state: rows.length ? 'active' : 'idle', rows };
}

export function dashboardMarches(cache: Record<string, any>, now = Date.now()) {
  return normalizeArray(cache.marchStatus?.data?.marches)
    .filter((march: any) => march && typeof march === 'object' && !isMarchExpired(march, now))
    .map((march: any, index: number) => {
      const badge = getMarchBadgeInfo(march, now);
      const returning = march.kind === 'return' || march.stage === 'returnToOutpost';
      const arrival = march.targetArrivalAt ?? march.rally?.arrivalAt;
      const waiting = march.stage === 'waitingForRallyStart' || (march.rally?.waitUntil > now);
      const fighting = !returning && !waiting && (['battle', 'battleInRally'].includes(march.stage) ||
        (['monster', 'raid'].includes(badge.category) && Number.isFinite(arrival) && arrival <= now));
      const traveling = !returning && !waiting && !fighting &&
        (String(march.stage).startsWith('moveTo') && (!Number.isFinite(arrival) || arrival > now));
      const stage = returning ? 'Returning' : waiting ? 'Preparing rally' : fighting ? 'In battle'
        : traveling ? 'Traveling' : badge.category === 'gather' ? 'Gathering' : 'Active';
      const end = returning ? march.endsAt ?? march.returnAt ?? march.rally?.returnAt
        : waiting ? march.rally?.waitUntil ?? march.endsAt
        : traveling ? arrival ?? march.endsAt : march.endsAt;
      const remaining = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;
      const gathering = badge.category === 'gather' ? gatheringProgress(march, now, cache) : null;
      const level = badge.category === 'raid' ? bossLevel(march.rally?.mobConfigId ?? march.mobConfigId)
        : badge.category === 'monster' ? soloMonsterLevel(march.mobConfigId) : null;
      const target = gathering?.target || march.targetName || (badge.category === 'raid' ? `Guild Boss${level ? ` · Lv.${level}` : ''}`
        : badge.category === 'monster' ? `World Monster${level ? ` · Lv.${level}` : ''}` : returning ? 'Returning to outpost' : 'Active squad march');
      return {
        gathering,
        id: `${march.id ?? march.marchId ?? march.squadId ?? index}`,
        march, category: badge.category, icon: badge.icon, stage: gathering?.phase || stage,
        title: badge.category === 'raid' ? 'Guild Raid' : badge.category === 'gather' ? 'Gathering'
          : badge.category === 'monster' ? 'Solo Monster' : 'Squad March',
        target,
        timerText: gathering ? (gathering.remainingSeconds == null ? 'In progress' : gathering.remainingSeconds > 0 ? formatDuration(gathering.remainingSeconds) : 'Awaiting update') : fighting ? 'In battle' : remaining === null ? 'Active'
          : remaining > 0 ? formatDuration(remaining) : 'Awaiting update',
      };
    });
}
