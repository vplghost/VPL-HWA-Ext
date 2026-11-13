import { normalizeArray } from './troops.ts';
import { formatDuration } from './formatters.ts';
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

export function dashboardQueues(cache: Record<string, any>, kind: 'building' | 'research', now = Date.now()) {
  const status = cache[`${kind}Status`]?.data ?? cache[`${kind}_getQueue`]?.data;
  if (status == null) return { state: 'unknown', rows: [] };
  const raw = status.queues ?? status.queue ?? (Array.isArray(status) ? status
    : status[`${kind}Id`] != null || status.startDate != null || status.startTime != null ? [status]
    : Object.values(status).filter((value) => value && typeof value === 'object'));
  const rows = normalizeArray(raw).filter((queue) => queue && typeof queue === 'object').map((queue: any, index: number) => {
    const end = queueEndMs(queue);
    const remaining = end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
    return {
      id: `${queue.queueNumber ?? index}:${queue[`${kind}Id`] ?? queue.id ?? index}`,
      entityId: queue[`${kind}Id`] ?? queue.id,
      level: queue.level ?? queue.nextLevel ?? queue.targetLevel,
      state: end === null ? 'unknown' : end > now ? 'active' : 'ready',
      timerText: remaining === null ? 'Unknown' : remaining > 0 ? formatDuration(remaining) : 'Ready',
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
        (badge.category === 'monster' && Number.isFinite(arrival) && arrival <= now));
      const traveling = !returning && !waiting && !fighting &&
        (String(march.stage).startsWith('moveTo') && (!Number.isFinite(arrival) || arrival > now));
      const stage = returning ? 'Returning' : waiting ? 'Preparing rally' : fighting ? 'In battle'
        : traveling ? 'Traveling' : badge.category === 'gather' ? 'Gathering' : 'Active';
      const end = returning ? march.endsAt ?? march.returnAt ?? march.rally?.returnAt
        : waiting ? march.rally?.waitUntil ?? march.endsAt
        : traveling ? arrival ?? march.endsAt : march.endsAt;
      const remaining = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;
      return {
        id: `${march.id ?? march.marchId ?? march.squadId ?? index}`,
        march, category: badge.category, icon: badge.icon, stage,
        title: badge.category === 'raid' ? 'Guild Raid' : badge.category === 'gather' ? 'Gathering'
          : badge.category === 'monster' ? 'Solo Monster' : 'Squad March',
        target: march.targetName || (march.mineId ? `Mine #${march.mineId}`
          : march.mobId || march.rally?.mobId ? `Target #${march.mobId ?? march.rally.mobId}`
          : `Squad #${march.squadId ?? march.id ?? '—'}`),
        timerText: fighting ? 'In battle' : remaining === null ? 'Active'
          : remaining > 0 ? formatDuration(remaining) : 'Awaiting update',
      };
    });
}
