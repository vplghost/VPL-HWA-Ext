/**
 * Daily Routine Autopilot Service (`dailyAutopilotService.ts`).
 *
 * Pure, testable helpers for:
 * - Dynamic daily server reset anchor detection (questResetStatus.nextDayAt -> event -> timezone -> 02:00 UTC / 09:00 UTC+7 fallback)
 * - Safe-first execution planning with high-risk activities (Hydra, Arena, Grand Arena, Dungeon) placed at the bottom & skippable
 * - Zero-spam Expedition next-wake timer calculation
 * - Unified per-group Free Gifts / Video / Spin strip descriptors with isolated error & disabled states
 * - Extended ActivityGoals status overlay (`running`, `waiting`, `skipped`, `error`, `done`)
 */

import {
  towerActivityState,
  arenaActivityState,
  dungeonActivityState,
  frontierActivityState,
  observedToday,
} from '../composables/activityState.ts';
import { freeAlchemyAvailability, freeAlchemyTimer } from '../utils/freeAlchemySpin.ts';
import { getAttentionBonusAvailability, formatCooldownTimer } from '../utils/freeChestHelper.ts';

export const DAILY_AUTOPILOT_SETTINGS_KEY = 'dailyAutopilotSettings';
export const DAILY_AUTOPILOT_STATE_KEY = 'dailyAutopilotState';

export type DailyActivityId =
  | 'freebies'
  | 'expeditions'
  | 'frontier'
  | 'quests'
  | 'tower'
  | 'hydra'
  | 'arena'
  | 'grand-arena'
  | 'dungeon';

export type DailyActivityRunStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'waiting'
  | 'done'
  | 'skipped'
  | 'error';

export type ExtendedActivityState =
  | 'pending'
  | 'done'
  | 'info'
  | 'unknown'
  | 'running'
  | 'waiting'
  | 'skipped'
  | 'error';

export const HIGH_RISK_ACTIVITIES = new Set<DailyActivityId>([
  'hydra',
  'arena',
  'grand-arena',
  'dungeon',
]);

export const DEFAULT_DAILY_STEP_ORDER: DailyActivityId[] = [
  'freebies',
  'expeditions',
  'frontier',
  'quests',
  'tower',
  'hydra',
  'arena',
  'grand-arena',
  'dungeon',
];

export const DAILY_STEP_LABELS: Record<DailyActivityId, string> = {
  freebies: 'Free Gifts & Video',
  expeditions: 'Expeditions',
  frontier: 'Frontier Chest',
  quests: 'Daily Quests & Mail',
  tower: 'Tower',
  hydra: 'Hydra',
  arena: 'Arena',
  'grand-arena': 'Grand Arena',
  dungeon: 'Guild Dungeon',
};

export interface DailyAutopilotSettings {
  enabled: boolean;
  resetOverrideUtcMinutes: number | null;
  postResetJitterSec: number;
  errorPolicy: 'skip-and-continue' | 'stop-all';
  skipHighRiskByDefault: boolean;
  stepOrder: DailyActivityId[];
  skippedSteps: Record<string, boolean>;
}

export interface DailyAutopilotStepRuntime {
  status: DailyActivityRunStatus;
  detail?: string;
  error?: string;
  completedAt?: number;
  waitingUntil?: number;
}

export interface DailyAutopilotRuntimeState {
  running: boolean;
  activeStepId: DailyActivityId | null;
  cycleKey: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  summary: string;
  steps: Partial<Record<DailyActivityId, DailyAutopilotStepRuntime>>;
}

export interface DailyResetAnchor {
  nextResetMs: number;
  source: 'override' | 'battlePassNextDay' | 'eventReset' | 'default-02utc';
  cycleKey: string;
  formattedUtc: string;
  formattedLocal: string;
}

export function getDefaultDailyAutopilotSettings(): DailyAutopilotSettings {
  return {
    enabled: false,
    resetOverrideUtcMinutes: null,
    postResetJitterSec: 60,
    errorPolicy: 'skip-and-continue',
    skipHighRiskByDefault: true,
    stepOrder: [...DEFAULT_DAILY_STEP_ORDER],
    skippedSteps: {},
  };
}

export function normalizeDailyAutopilotSettings(raw: any): DailyAutopilotSettings {
  const def = getDefaultDailyAutopilotSettings();
  if (!raw || typeof raw !== 'object') return def;

  const validSet = new Set<string>(DEFAULT_DAILY_STEP_ORDER);
  const rawOrder = Array.isArray(raw.stepOrder)
    ? raw.stepOrder.filter((id: any): id is DailyActivityId => typeof id === 'string' && validSet.has(id))
    : [];
  const seen = new Set<DailyActivityId>(rawOrder);
  const stepOrder: DailyActivityId[] = [
    ...rawOrder,
    ...DEFAULT_DAILY_STEP_ORDER.filter((id) => !seen.has(id)),
  ];

  const overrideMin =
    raw.resetOverrideUtcMinutes !== null &&
    raw.resetOverrideUtcMinutes !== undefined &&
    Number.isFinite(Number(raw.resetOverrideUtcMinutes))
      ? Math.max(0, Math.min(1439, Math.floor(Number(raw.resetOverrideUtcMinutes))))
      : null;

  const jitter = Number.isFinite(Number(raw.postResetJitterSec))
    ? Math.max(0, Math.min(600, Math.floor(Number(raw.postResetJitterSec))))
    : def.postResetJitterSec;

  const skippedSteps: Record<string, boolean> = {};
  if (raw.skippedSteps && typeof raw.skippedSteps === 'object') {
    for (const [k, v] of Object.entries(raw.skippedSteps)) {
      if (validSet.has(k)) skippedSteps[k] = Boolean(v);
    }
  }

  return {
    enabled: raw.enabled === true,
    resetOverrideUtcMinutes: overrideMin,
    postResetJitterSec: jitter,
    errorPolicy: raw.errorPolicy === 'stop-all' ? 'stop-all' : 'skip-and-continue',
    skipHighRiskByDefault: raw.skipHighRiskByDefault !== false,
    stepOrder,
    skippedSteps,
  };
}

export function createDefaultDailyRuntimeState(): DailyAutopilotRuntimeState {
  return {
    running: false,
    activeStepId: null,
    cycleKey: null,
    startedAt: null,
    finishedAt: null,
    summary: '',
    steps: {},
  };
}

function toMsEpoch(val: unknown): number | null {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Seconds vs milliseconds heuristic
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
}

function rollForwardToUpcoming(anchorMs: number, now: number): number {
  if (anchorMs > now) return anchorMs;
  const daysBehind = Math.floor((now - anchorMs) / 86400000) + 1;
  return anchorMs + daysBehind * 86400000;
}

function formatUtcHhMm(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function computeCycleKey(nextResetMs: number): string {
  // Cycle key corresponds to the start date (UTC) of the current 24h cycle
  const cycleStart = new Date(nextResetMs - 86400000);
  return cycleStart.toISOString().slice(0, 10);
}

/**
 * Resolves the authoritative **Event Daily Quest** reset anchor (02:00 UTC / 09:00 UTC+7),
 * intentionally NOT the personal daily quest reset (05:00 local / 22:00 UTC), so Autopilot
 * waits until event daily quests (e.g., open Tower chests, fight in Arena) have refreshed:
 * 1. Explicit Settings override (`resetOverrideUtcMinutes`), if configured by user
 * 2. `cache.battlePass_getAll.data[].nextDayTime` (server-authoritative 02:00 UTC event day rollover)
 * 3. Active Event Daily Quest boundary (`getSpecialQuestState:quest` events / `questGetEvents` / `specialEvent_getAll`)
 * 4. Fallback default: 02:00 UTC (09:00 AM UTC+7)
 */
export function resolveDailyResetAnchor(
  cache: Record<string, any> | null | undefined,
  settings?: Partial<DailyAutopilotSettings> | null,
  now = Date.now()
): DailyResetAnchor {
  const c = cache || {};

  const buildAnchor = (
    nextResetMs: number,
    source: DailyResetAnchor['source']
  ): DailyResetAnchor => ({
    nextResetMs,
    source,
    cycleKey: computeCycleKey(nextResetMs),
    formattedUtc: formatUtcHhMm(nextResetMs),
    formattedLocal: formatShortTime(nextResetMs),
  });

  // 1. User manual override
  if (
    settings?.resetOverrideUtcMinutes !== null &&
    settings?.resetOverrideUtcMinutes !== undefined &&
    Number.isFinite(Number(settings.resetOverrideUtcMinutes))
  ) {
    const mins = Math.max(0, Math.min(1439, Math.floor(Number(settings.resetOverrideUtcMinutes))));
    const base = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
      Math.floor(mins / 60),
      mins % 60,
      0
    );
    return buildAnchor(rollForwardToUpcoming(base, now), 'override');
  }

  // 2. Server-authoritative Battle Pass event day rollover (`battlePass_getAll[].nextDayTime`, 02:00 UTC)
  const bpRaw = c.battlePass_getAll?.data;
  if (bpRaw && typeof bpRaw === 'object') {
    const bpList = Array.isArray(bpRaw) ? bpRaw : Object.values(bpRaw);
    for (const bp of bpList) {
      const nextDayMs = toMsEpoch((bp as any)?.nextDayTime);
      if (nextDayMs !== null) {
        return buildAnchor(rollForwardToUpcoming(nextDayMs, now), 'battlePassNextDay');
      }
    }
  }

  // 3. Active Event Daily Quest reset boundary from `getSpecialQuestState:quest` / `questGetEvents` / `specialEvent_getAll`
  const specialEvents =
    c['getSpecialQuestState:quest']?.data?.events ??
    c.getSpecialQuestState?.data?.events;
  if (Array.isArray(specialEvents) && specialEvents.length > 0) {
    // Prefer events with a `daily` repeatType group, falling back to any active event start/end
    const prioritized = [
      ...specialEvents.filter((ev: any) =>
        Array.isArray(ev?.groups) && ev.groups.some((g: any) => g?.repeatType === 'daily')
      ),
      ...specialEvents,
    ];
    for (const ev of prioritized) {
      const ts = toMsEpoch(ev?.nextResetAt ?? ev?.dailyResetAt ?? ev?.start ?? ev?.end);
      if (ts !== null) {
        return buildAnchor(rollForwardToUpcoming(ts, now), 'eventReset');
      }
    }
  }

  const eventSources = [c.questGetEvents?.data, c.specialEvent_getAll?.data];
  for (const src of eventSources) {
    if (!src || typeof src !== 'object') continue;
    const list = Array.isArray(src) ? src : Object.values(src);
    for (const item of list) {
      const ts = toMsEpoch(
        (item as any)?.nextResetAt ??
          (item as any)?.dailyResetAt ??
          (item as any)?.resetTime ??
          (item as any)?.startTime ??
          (item as any)?.endTime
      );
      if (ts !== null) {
        return buildAnchor(rollForwardToUpcoming(ts, now), 'eventReset');
      }
    }
  }

  // 4. Fallback default: 02:00 UTC (09:00 AM Vietnam time, UTC+7)
  const defaultAnchor = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
    2,
    0,
    0
  );
  return buildAnchor(rollForwardToUpcoming(defaultAnchor, now), 'default-02utc');
}

export interface PlannedDailyStep {
  id: DailyActivityId;
  label: string;
  highRisk: boolean;
  shouldRun: boolean;
  skipReason?: string;
}

/**
 * Builds the sequential daily execution plan respecting user priority order,
 * high-risk skip defaults, explicit per-step skip toggles, and already-done activity state.
 */
export function buildDailyExecutionPlan(
  rawSettings: Partial<DailyAutopilotSettings> | null | undefined,
  cache: Record<string, any> | null | undefined,
  now = Date.now()
): PlannedDailyStep[] {
  const settings = normalizeDailyAutopilotSettings(rawSettings);
  const c = cache || {};

  return settings.stepOrder.map((id) => {
    const highRisk = HIGH_RISK_ACTIVITIES.has(id);
    const label = DAILY_STEP_LABELS[id];

    if (settings.skippedSteps[id] === true) {
      return { id, label, highRisk, shouldRun: false, skipReason: 'Skipped in settings' };
    }
    if (highRisk && settings.skipHighRiskByDefault && settings.skippedSteps[id] !== false) {
      return { id, label, highRisk, shouldRun: false, skipReason: 'High-risk skipped by default' };
    }

    // Skip activities already verified done today
    if (id === 'tower' && towerActivityState(c, now).state === 'done') {
      return { id, label, highRisk, shouldRun: false, skipReason: 'Already cleared today' };
    }
    if (id === 'arena' && arenaActivityState(c, false, now).state === 'done') {
      return { id, label, highRisk, shouldRun: false, skipReason: '0 battles left today' };
    }
    if (id === 'grand-arena' && arenaActivityState(c, true, now).state === 'done') {
      return { id, label, highRisk, shouldRun: false, skipReason: '0 battles left today' };
    }
    if (id === 'dungeon' && dungeonActivityState(c, now).state === 'done') {
      return { id, label, highRisk, shouldRun: false, skipReason: 'Completed today' };
    }
    if (id === 'frontier' && frontierActivityState(c, now).state === 'done') {
      return { id, label, highRisk, shouldRun: false, skipReason: 'No chest ready' };
    }
    if (id === 'hydra') {
      const hydraEntry = c.clanBoss_getAll;
      const hydra = observedToday(hydraEntry, now, c.questResetStatus?.data?.nextDayAt) ? hydraEntry.data : null;
      if (hydra && Number(hydra.tries) === 0 && Number(hydra.superTries) === 0) {
        return { id, label, highRisk, shouldRun: false, skipReason: '0 Hydra tries left today' };
      }
    }

    return { id, label, highRisk, shouldRun: true };
  });
}

/**
 * Computes the earliest future Expedition completion timestamp (+5s safety buffer)
 * so long-running expeditions schedule a single wake alarm instead of polling RPCs.
 */
export function computeExpeditionNextWakeMs(
  cache: Record<string, any> | null | undefined,
  now = Date.now()
): number | null {
  const raw = cache?.expeditionGet?.data ?? cache?.expeditionStatus?.data;
  if (!raw || typeof raw !== 'object') return null;

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.expeditions)
      ? raw.expeditions
      : Object.values(raw);

  let earliest: number | null = null;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const endRaw = (item as any).endTime ?? (item as any).finishTime ?? (item as any).endsAt;
    const endMs = toMsEpoch(endRaw);
    if (endMs !== null && endMs > now) {
      if (earliest === null || endMs < earliest) earliest = endMs;
    }
  }
  return earliest !== null ? earliest + 5000 : null;
}

export type FreeGiftId =
  | 'videoBoxes'
  | 'videoTickets'
  | 'alchemySpin'
  | 'attentionBonuses'
  | 'zeppelinGift'
  | 'skillPointsVideo'
  | 'heroicChestVideo';

export interface FreeGiftStripItem {
  id: FreeGiftId;
  icon: string;
  label: string;
  count: number;
  badgeText: string;
  state: 'available' | 'running' | 'done' | 'error' | 'unknown';
  disabled: boolean;
  clickable: boolean;
  tooltip: string;
  error?: string;
}

/**
 * Produces isolated per-group descriptors for the unified Free Gifts / Video / Spin strip
 * rendered inside the Daily Activities & Progress card.
 * Each group maintains independent availability, color state, disabled flag, and error isolation.
 */
export function computeFreeGiftStripItems(
  cache: Record<string, any> | null | undefined,
  now = Date.now(),
  opts: {
    hasGameTab?: boolean;
    runningIds?: Set<string> | null;
    errorMap?: Record<string, string | null | undefined> | null;
  } = {}
): FreeGiftStripItem[] {
  const c = cache || {};
  const hasTab = opts.hasGameTab !== false;
  const running = opts.runningIds || new Set<string>();
  const errors = opts.errorMap || {};

  const buildItem = (
    id: FreeGiftId,
    icon: string,
    label: string,
    count: number,
    baseState: 'available' | 'done' | 'unknown',
    baseTooltip: string,
    clickable = true
  ): FreeGiftStripItem => {
    const err = errors[id] || undefined;
    const isRunning = running.has(id);
    const state: FreeGiftStripItem['state'] = isRunning
      ? 'running'
      : err
        ? 'error'
        : baseState;
    const disabled = !hasTab || isRunning || !clickable || state === 'done' || state === 'unknown';
    const badgeText = isRunning
      ? '…'
      : state === 'error'
        ? '!'
        : state === 'unknown'
          ? '—'
          : state === 'done'
            ? '✓'
            : String(count);
    const tooltip = !hasTab
      ? `Open the game to claim ${label}`
      : isRunning
        ? `Claiming ${label}…`
        : err
          ? `${label} error: ${err}`
          : baseTooltip;

    return {
      id,
      icon,
      label,
      count,
      badgeText,
      state,
      disabled,
      clickable,
      tooltip,
      ...(err ? { error: err } : {}),
    };
  };

  // 1. Video Boxes (0..4)
  const cinema = c.cinemaGetCounters?.data;
  const boxesRemaining = cinema ? Math.max(0, 5 - Number(cinema.placementViewed ?? 0)) : 0;
  const boxesState = !cinema ? 'unknown' : boxesRemaining > 0 ? 'available' : 'done';
  const videoBoxes = buildItem(
    'videoBoxes',
    '🎁',
    'Video Boxes',
    boxesRemaining,
    boxesState,
    boxesState === 'available'
      ? `Free Video Boxes: ${boxesRemaining}/5 available today`
      : boxesState === 'done'
        ? 'All 5 Free Video Boxes claimed today'
        : 'Video Boxes: waiting for cinemaGetCounters'
  );

  // 2. Video Tickets (0..8)
  const ticketsRemaining = cinema ? Math.max(0, 8 - Number(cinema.viewed ?? 0)) : 0;
  const ticketsState = !cinema ? 'unknown' : ticketsRemaining > 0 ? 'available' : 'done';
  const videoTickets = buildItem(
    'videoTickets',
    '🎟️',
    'Video Tickets',
    ticketsRemaining,
    ticketsState,
    ticketsState === 'available'
      ? `Free Cinema Video Tickets: ${ticketsRemaining}/8 available today`
      : ticketsState === 'done'
        ? 'All 8 Free Video Tickets claimed today'
        : 'Video Tickets: waiting for cinemaGetCounters'
  );

  // 3. Free Alchemy Video Spin
  const alchemy = freeAlchemyAvailability(c, now);
  const alchemyState = alchemy.ready ? 'available' : alchemy.remainingSeconds > 0 ? 'done' : 'unknown';
  const alchemySpin = buildItem(
    'alchemySpin',
    '🎡',
    'Alchemy Spin',
    alchemy.ready ? 1 : 0,
    alchemyState,
    alchemy.ready
      ? 'Free Alchemy Video Spin ready'
      : alchemy.remainingSeconds > 0
        ? `Alchemy Spin ready in ${freeAlchemyTimer(alchemy.remainingSeconds)}`
        : 'Alchemy Spin: waiting for refillable data'
  );

  // 4. Attention Bonuses / Free Gifts (Energy & Items)
  const bonuses = c.attentionBonusStatus?.data?.bonuses;
  const bonusAvail = getAttentionBonusAvailability(bonuses, now);
  const hasBonusData = bonuses && typeof bonuses === 'object' && Object.keys(bonuses).length > 0;
  const bonusState = !hasBonusData ? 'unknown' : bonusAvail.ready ? 'available' : 'done';
  const attentionBonuses = buildItem(
    'attentionBonuses',
    '🎀',
    'Free Gifts',
    bonusAvail.availableCount,
    bonusState,
    bonusAvail.ready
      ? `Free Gifts: ${bonusAvail.availableCount} available to claim (Energy & items)`
      : bonusAvail.nextRefreshSeconds != null && bonusAvail.nextRefreshSeconds > 0
        ? `Free Gifts ready in ${formatCooldownTimer(bonusAvail.nextRefreshSeconds)}`
        : 'Free Gifts: waiting for liveOps_refresh'
  );

  // 5. Zeppelin / Airship Gift
  const zeppelin = c.zeppelinGiftGet?.data;
  const zeppelinReady = Boolean(zeppelin && (zeppelin.available === true || zeppelin.canClaim === true || Number(zeppelin.count ?? 0) > 0));
  const zeppelinState = !zeppelin ? 'unknown' : zeppelinReady ? 'available' : 'done';
  const zeppelinGift = buildItem(
    'zeppelinGift',
    '🎈',
    'Zeppelin Gift',
    zeppelinReady ? 1 : 0,
    zeppelinState,
    zeppelinReady
      ? 'Zeppelin / Airship Gift ready to collect'
      : zeppelinState === 'done'
        ? 'Zeppelin Gift already claimed today'
        : 'Zeppelin Gift: waiting for zeppelinGiftGet'
  );

  // 6. Free Skill Points via Video (refillable:55)
  const skillRefill = c['resource:refillable:55']?.data;
  const skillCount = skillRefill ? Math.max(0, Number(skillRefill.amount ?? 0)) : 0;
  const skillState = !skillRefill ? 'unknown' : skillCount > 0 ? 'available' : 'done';
  const skillPointsVideo = buildItem(
    'skillPointsVideo',
    '💡',
    'Skill Video',
    skillCount,
    skillState,
    skillCount > 0
      ? `Free Skill Points Video: ${skillCount} available today`
      : skillState === 'done'
        ? 'Free Skill Points Video claimed today'
        : 'Skill Points Video: waiting for refillable:55'
  );

  // 7. Heroic Chest Video (24h renewal via heroChest_getInfo.videoCooldown + 30-minute open window)
  const heroChestEntry = c.heroChest_getInfo;
  const heroChest = heroChestEntry?.data;
  const heroChestCdMs = toMsEpoch(heroChest?.videoCooldown);
  const heroChestRemSec = heroChestCdMs !== null ? Math.max(0, Math.ceil((heroChestCdMs - now) / 1000)) : null;
  const heroChestReady = heroChest != null && heroChestRemSec !== null && heroChestRemSec === 0;
  const heroChestState = !heroChest ? 'unknown' : heroChestReady ? 'available' : 'done';
  const infoSeenMs = heroChestEntry?.updatedAt ? Date.parse(heroChestEntry.updatedAt) : NaN;
  const windowRemSec =
    heroChestReady && Number.isFinite(infoSeenMs) && infoSeenMs <= now
      ? Math.max(0, 1800 - Math.floor((now - infoSeenMs) / 1000))
      : null;
  const heroicChestVideo = buildItem(
    'heroicChestVideo',
    '🧰',
    'Heroic Video',
    heroChestReady ? 1 : 0,
    heroChestState,
    heroChestReady
      ? windowRemSec != null && windowRemSec > 0
        ? `Free Heroic Chest (Video) ready · ${formatCooldownTimer(windowRemSec)} left in 30m window`
        : 'Free Heroic Chest (Video) ready to claim (24h renewal)'
      : heroChestRemSec != null && heroChestRemSec > 0
        ? `Heroic Chest Video ready in ${formatCooldownTimer(heroChestRemSec)}`
        : 'Heroic Chest Video: waiting for heroChest_getInfo',
    true
  );

  return [
    videoBoxes,
    videoTickets,
    alchemySpin,
    attentionBonuses,
    zeppelinGift,
    skillPointsVideo,
    heroicChestVideo,
  ];
}

/**
 * Computes the next wake timestamp (+5s buffer) when the 24h Heroic Chest Video
 * cooldown expires so background scheduling uses a single alarm with zero polling.
 */
export function computeHeroicChestNextWakeMs(
  cache: Record<string, any> | null | undefined,
  now = Date.now()
): number | null {
  const cdMs = toMsEpoch(cache?.heroChest_getInfo?.data?.videoCooldown);
  if (cdMs !== null && cdMs > now) {
    return cdMs + 5000;
  }
  return null;
}

export function formatShortTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Overlays autopilot runtime status (`running`, `waiting`, `skipped`, `error`, `done`)
 * onto a base Daily Activity row for display in `ActivityGoals.vue`.
 */
export function mergeActivityWithAutopilotState<T extends { id: string; state: string; detail: string }>(
  row: T,
  stepRuntime?: DailyAutopilotStepRuntime | null
): T & { state: ExtendedActivityState } {
  if (!stepRuntime || stepRuntime.status === 'idle' || stepRuntime.status === 'pending') {
    return row as T & { state: ExtendedActivityState };
  }
  if (stepRuntime.status === 'running') {
    return {
      ...row,
      state: 'running',
      detail: stepRuntime.detail || 'Running autopilot step…',
    };
  }
  if (stepRuntime.status === 'waiting') {
    const until = formatShortTime(stepRuntime.waitingUntil);
    return {
      ...row,
      state: 'waiting',
      detail: stepRuntime.detail || (until ? `Waiting · next return ${until}` : 'Waiting for timer'),
    };
  }
  if (stepRuntime.status === 'error') {
    return {
      ...row,
      state: 'error',
      detail: stepRuntime.error ? `Error: ${stepRuntime.error}` : 'Autopilot step failed',
    };
  }
  if (stepRuntime.status === 'skipped') {
    return {
      ...row,
      state: 'skipped',
      detail: stepRuntime.detail || 'Skipped by autopilot settings',
    };
  }
  if (stepRuntime.status === 'done') {
    const at = formatShortTime(stepRuntime.completedAt);
    return {
      ...row,
      state: 'done',
      detail: at ? `${stepRuntime.detail || row.detail} · ${at}` : (stepRuntime.detail || row.detail),
    };
  }
  return row as T & { state: ExtendedActivityState };
}
