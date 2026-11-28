/**
 * Shared Raid & Monster Queue Coordination Helpers (`queueCoordination.ts`).
 * - Post-queue auto-heal planning (fires once when queue completes or stops, never between rounds)
 * - Structured QueueSessionSummary builder for Raid and Monster queues
 */
import { calculateHealingDurationMs, normalizeArray } from '../../utils/troops.ts';
import { buildSmartHealBatch, computeMarchDefenseDemand } from '../troopHealService.ts';
import type { TroopHealSettings } from '../../types/index.ts';

export type QueueSessionEventType =
  | 'created'
  | 'won'
  | 'cancelled'
  | 'retried'
  | 'heal_started'
  | 'stopped'
  | 'completed';

export interface QueueSessionEvent {
  at: number;
  type: QueueSessionEventType;
  mobId?: string | number;
  rallyId?: string | number;
  detail?: string;
}

export interface PostQueueHealSummary {
  status: 'triggered' | 'already_active' | 'no_wounded' | 'completing_previous' | 'pending' | 'skipped';
  troopsCount: number;
  durationMs?: number;
}

export interface QueueSessionSummary {
  kind: 'raid' | 'monster';
  accountId: string | number;
  startedAt: number;
  endedAt?: number;
  targetRounds: number;
  completedRounds: number;
  cancelledRounds: number;
  retriedRounds: number;
  energySpent: number;
  postQueueHeal?: PostQueueHealSummary;
  status: 'running' | 'complete' | 'stopped';
  stopReason?: string;
  events: QueueSessionEvent[];
}

export interface PostQueueHealPlan {
  action: 'heal' | 'complete_and_refresh' | 'fetch' | 'noop';
  calls: Array<{ name: string; feature?: string; args?: Record<string, any> }>;
  summary: PostQueueHealSummary;
}

export const RALLY_ENERGY_UNIT_COST = 25;
export const MONSTER_ENERGY_UNIT_COST = 10;
export const MAX_SESSION_EVENTS = 20;

export function appendSessionEvent(
  events: QueueSessionEvent[] | undefined,
  event: QueueSessionEvent
): QueueSessionEvent[] {
  const list = Array.isArray(events) ? [...events, event] : [event];
  return list.length > MAX_SESSION_EVENTS ? list.slice(list.length - MAX_SESSION_EVENTS) : list;
}

/**
 * Plans a single post-queue healing dispatch after a Raid or Monster queue completes or stops.
 * - If healing cache is missing -> fetches `getHealing:unit`
 * - If healing is currently active -> no-op (`already_active`)
 * - If a previous healing batch already finished -> dispatches `completeHealing` + refresh
 * - If hospital is idle and wounded troops exist -> dispatches `startHealing` once (fire-and-forget)
 * - Otherwise -> no-op (`no_wounded`)
 */
export function planPostQueueHeal(
  healingData: any,
  now: number = Date.now(),
  options?: {
    cache?: Record<string, any> | null;
    stored?: Record<string, any> | null;
    healSettings?: Partial<TroopHealSettings> | null;
  }
): PostQueueHealPlan {
  if (!healingData || typeof healingData !== 'object') {
    return {
      action: 'fetch',
      calls: [{ name: 'getHealing', feature: 'unit' }],
      summary: { status: 'pending', troopsCount: 0 },
    };
  }

  const activeHealing = healingData.healing;
  const healingUnits = normalizeArray(activeHealing?.units);
  const startDate = Number(activeHealing?.startDate);
  const duration = Number(activeHealing?.duration);
  const hasHealingBatch = healingUnits.length > 0 && Number.isFinite(startDate) && Number.isFinite(duration);

  if (hasHealingBatch) {
    const endsAt = startDate + duration;
    if (endsAt > now) {
      return {
        action: 'noop',
        calls: [],
        summary: {
          status: 'already_active',
          troopsCount: healingUnits.reduce((s: number, u: any) => s + (Number(u?.count) || 0), 0),
          durationMs: Math.max(0, endsAt - now),
        },
      };
    }
    return {
      action: 'complete_and_refresh',
      calls: [
        { name: 'completeHealing', args: { completeDate: now }, feature: 'unit' },
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' },
      ],
      summary: {
        status: 'completing_previous',
        troopsCount: healingUnits.reduce((s: number, u: any) => s + (Number(u?.count) || 0), 0),
      },
    };
  }

  let unitsToHeal = normalizeArray(healingData.injuredUnits)
    .filter((u: any) => Number.isInteger(Number(u?.unitId)) && Number(u?.count) > 0)
    .map((u: any) => ({ unitId: Number(u.unitId), count: Number(u.count) }));

  if (unitsToHeal.length === 0) {
    return {
      action: 'noop',
      calls: [],
      summary: { status: 'no_wounded', troopsCount: 0 },
    };
  }

  // Use smart batching when troopHealSettings or strongest-team demand is provided
  if (options?.healSettings || options?.cache) {
    const demand = computeMarchDefenseDemand(options.cache, options.stored);
    const totalInjured = unitsToHeal.reduce((sum, u) => sum + u.count, 0);
    const shouldBatch =
      options.healSettings?.autoHealEnabled === true ||
      (Number(options.healSettings?.batchPerType) || 0) > 0 ||
      totalInjured > demand.topTeamCapacity;
    if (shouldBatch) {
      const batch = buildSmartHealBatch(healingData, options.healSettings, demand);
      if (batch.units.length > 0) {
        unitsToHeal = batch.units;
      }
    }
  }

  const troopsCount = unitsToHeal.reduce((sum: number, u) => sum + u.count, 0);
  const durationMs = calculateHealingDurationMs(unitsToHeal);

  return {
    action: 'heal',
    calls: [
      {
        name: 'startHealing',
        feature: 'unit',
        args: { startDate: now, duration: durationMs, units: unitsToHeal },
      },
      { name: 'getHealing', feature: 'unit' },
    ],
    summary: {
      status: 'triggered',
      troopsCount,
      durationMs,
    },
  };
}

export function buildQueueSessionSummary(
  kind: 'raid' | 'monster',
  state: any,
  now: number = Date.now(),
  postQueueHeal?: PostQueueHealSummary
): QueueSessionSummary {
  const completedRounds = Math.max(0, Number(state?.completed) || 0);
  const targetRounds = Math.max(0, Number(state?.options?.count) || 0);
  const cancelledRounds = Math.max(0, Number(state?.cancelledCount) || 0);
  const retriedRounds = Math.max(0, Number(state?.retriedCount) || 0);
  const costPerRound = kind === 'raid' ? RALLY_ENERGY_UNIT_COST : MONSTER_ENERGY_UNIT_COST;
  const energySpent = completedRounds * costPerRound;
  const phase = String(state?.phase || 'stopped');
  const status: QueueSessionSummary['status'] =
    phase === 'complete' ? 'complete' : phase === 'stopped' ? 'stopped' : 'running';

  const events: QueueSessionEvent[] = Array.isArray(state?.sessionEvents)
    ? state.sessionEvents.slice(-MAX_SESSION_EVENTS)
    : [];

  return {
    kind,
    accountId: state?.accountId ?? '',
    startedAt: Number(state?.startedAt) || Number(state?.sentAt) || now,
    ...(status !== 'running' ? { endedAt: now } : {}),
    targetRounds,
    completedRounds,
    cancelledRounds,
    retriedRounds,
    energySpent,
    ...(postQueueHeal ? { postQueueHeal } : {}),
    status,
    ...(state?.reason ? { stopReason: String(state.reason) } : {}),
    events,
  };
}
