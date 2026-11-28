import type {
  AutoGatherSettings,
  AutoGatherPlanResult,
  GatherTroopReserve,
} from '../../types/game/gatherQueue.ts';
import type { BasicResourceType } from '../../types/game/march.ts';
import * as expData from '../../utils/experimentalData.ts';
import { calculateAccountMaxMarches } from '../../utils/dashboardState.ts';
import {
  RESOURCE_CARGO_WEIGHT,
  TROOP_CARGO_CAPACITY_BY_LEVEL,
  calculateMineCargo,
} from '../../utils/mineData.ts';
import { resolveMarchResourceType, isMarchExpired } from '../../utils/resourceData.ts';
import smartGatherService from './smartGather.ts';
import { unsafeMineIds as getUnsafeMineIds } from '../mineDefense.ts';
import { ResourceLockManager, type ResourceReservation } from '../../background/resourceLock.ts';

function resolveGatherLocks(
  cache: any,
  stored: any,
  now: number
): { reservedHeroIds: Set<number>; reservedMarchSlots: number } {
  const reservedHeroIds = new Set<number>();
  let reservedMarchSlots = 0;
  let locks: ResourceReservation[] = [];
  if (Array.isArray(stored?.activeResourceLocks)) {
    locks = stored.activeResourceLocks;
  } else if (stored?.raidQueue || stored?.monsterQueue || stored?.raidEnergyAuto?.enabled) {
    const tmp = new ResourceLockManager();
    const energy = cache?.['resource:world-energy']?.data;
    const currentEnergy = Number.isFinite(energy?.amount) ? Number(energy.amount) : null;
    tmp.syncFromQueueStates(
      {
        raidQueue: stored.raidQueue,
        monsterQueue: stored.monsterQueue,
        raidEnergyAuto: stored.raidEnergyAuto,
        currentEnergy,
      },
      now
    );
    locks = tmp.getSnapshot(now);
  }
  for (const lock of locks) {
    if (!lock || lock.owner === 'autoGather') continue;
    if (Number.isFinite(lock.expiresAt) && lock.expiresAt <= now) continue;
    if (Array.isArray(lock.heroIds)) {
      for (const id of lock.heroIds) {
        const n = Number(id);
        if (Number.isInteger(n) && n > 0) reservedHeroIds.add(n);
      }
    }
    reservedMarchSlots += Math.max(0, Math.floor(Number(lock.marchSlots) || 0));
  }
  return { reservedHeroIds, reservedMarchSlots };
}

export const BASIC_MINE_TYPES: readonly BasicResourceType[] = ['food', 'wood', 'stone', 'iron'];

function getDataHelper(): any {
  return expData;
}

function getSmartGatherHelper(): any {
  return smartGatherService;
}

function getMineDefenseHelper(): any {
  return {
    unsafeMineIds: getUnsafeMineIds,
  };
}


export function safeList<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function normalizeTroopReserve(raw?: any): GatherTroopReserve {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toNonNegInt = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(10_000_000, Math.floor(n)) : 0;
  };
  return {
    infantry: toNonNegInt(src.infantry),
    spearmen: toNonNegInt(src.spearmen),
    marksmen: toNonNegInt(src.marksmen),
  };
}

export function hasTroopReserve(reserve?: GatherTroopReserve | null): boolean {
  if (!reserve) return false;
  return (reserve.infantry || 0) > 0 || (reserve.spearmen || 0) > 0 || (reserve.marksmen || 0) > 0;
}

export function countAvailableTroops(unitSummary: any): number {
  const rows = Array.isArray(unitSummary?.available)
    ? unitSummary.available
    : safeList(unitSummary?.available ?? unitSummary?.units);
  let total = 0;
  for (const item of rows) {
    const count = Number(item?.count);
    if (Number.isFinite(count) && count > 0) total += Math.floor(count);
  }
  return total;
}

export function countDeployedTroops(unitSummary: any): number {
  const squads = safeList(unitSummary?.squads);
  let total = 0;
  for (const squad of squads) {
    for (const unit of safeList(squad?.units)) {
      const count = Number(unit?.state?.survived ?? unit?.count);
      if (Number.isFinite(count) && count > 0) total += Math.floor(count);
    }
  }
  return total;
}

export function countTotalTroops(unitSummary: any): number {
  return countAvailableTroops(unitSummary) + countDeployedTroops(unitSummary);
}

export interface BalancedGatherPlan {
  constrained: boolean;
  totalTroops: number;
  reserveTotal: number;
  netTroops: number;
  targetSlots: number;
  perMarchCap: number;
  dispatchCap: number;
}

export function computeBalancedGatherAllocation(params: {
  rawSummary: any;
  effectiveSummary: any;
  reserveTroops?: GatherTroopReserve | null;
  squadCapacity: number;
  effectiveMaxMarches: number;
  activeCount: number;
}): BalancedGatherPlan {
  const normReserve = normalizeTroopReserve(params.reserveTroops);
  const reserveTotal = normReserve.infantry + normReserve.spearmen + normReserve.marksmen;
  const totalTroops = countTotalTroops(params.rawSummary);
  const netTroops = Math.max(0, totalTroops - reserveTotal);
  const squadCap = Math.max(0, Math.floor(Number(params.squadCapacity) || 0));
  const maxMarches = Math.max(0, Math.floor(Number(params.effectiveMaxMarches) || 0));
  const active = Math.max(0, Math.floor(Number(params.activeCount) || 0));

  const fullNeed = squadCap * maxMarches;
  const constrained = maxMarches > 1 && squadCap > 0 && netTroops < fullNeed;

  if (!constrained) {
    return {
      constrained: false,
      totalTroops,
      reserveTotal,
      netTroops,
      targetSlots: maxMarches,
      perMarchCap: squadCap,
      dispatchCap: squadCap,
    };
  }

  const targetSlots = Math.max(1, maxMarches);
  const perMarchCap = Math.max(1, Math.min(squadCap, Math.floor(netTroops / targetSlots)));
  const remainingSlots = Math.max(1, targetSlots - active);
  const surplusInCity = countAvailableTroops(params.effectiveSummary);
  const fairShareNow = Math.max(1, Math.floor(surplusInCity / remainingSlots));
  const dispatchCap = Math.max(1, Math.min(squadCap, perMarchCap, fairShareNow));

  return {
    constrained: true,
    totalTroops,
    reserveTotal,
    netTroops,
    targetSlots,
    perMarchCap,
    dispatchCap,
  };
}

export function getCityResourceStock(cache: any): {
  hasStockData: boolean;
  stock: Record<BasicResourceType, number>;
} {
  const keys: Record<BasicResourceType, [string, string]> = {
    food: ['resource:material:5', 'resource:food'],
    wood: ['resource:material:4', 'resource:wood'],
    stone: ['resource:material:3', 'resource:stone'],
    iron: ['resource:material:2', 'resource:iron'],
  };
  let hasStockData = false;
  const stock: Record<BasicResourceType, number> = { food: 0, wood: 0, stone: 0, iron: 0 };
  for (const type of BASIC_MINE_TYPES) {
    const [primary, fallback] = keys[type];
    const raw = cache?.[primary]?.data?.amount ?? cache?.[fallback]?.data?.amount;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      hasStockData = true;
      stock[type] = Math.max(0, raw);
    }
  }
  return { hasStockData, stock };
}

export function estimateMarchInFlightResourceAmount(
  march: any,
  type: BasicResourceType,
  cache: any
): number {
  const weight = RESOURCE_CARGO_WEIGHT[type] ?? 1;
  const squadId = march?.squadId ?? march?.id;
  const plan =
    cache?.gatheringStatus?.data?.plans?.[squadId] ||
    safeList(cache?.gatheringStatus?.data?.gatherings).find(
      (g: any) => (g?.squadId ?? g?.id) === squadId && (!march?.mineId || g?.mineId === march.mineId)
    );
  const planned = Number(plan?.plannedGatheredResourceAmount ?? march?.gatheringTotalAmount);
  if (Number.isFinite(planned) && planned > 0) return planned;

  const mineRemaining = Number(
    march?.resourceAmount ??
      march?.resourcesAmount ??
      cache?.mineMap?.[march?.mineId]?.resourceAmount ??
      cache?.mineMap?.[march?.mineId]?.resourcesAmount
  );

  // Estimate cargo from deployed squad units (for marches still moving to the mine)
  const squads = safeList(cache?.['getUnitSummary:unit']?.data?.squads);
  const squad = squads.find((s: any) => (s?.squadId ?? s?.id) === squadId);
  if (squad && Array.isArray(squad.units) && squad.units.length > 0) {
    let totalCargo = 0;
    for (const u of squad.units) {
      const count = Number(u?.state?.survived ?? u?.count);
      const id = Number(u?.unitId ?? u?.id);
      if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(id) || id <= 0) continue;
      const tier = ((id - 1) % 10) + 1;
      const capPerTroop = TROOP_CARGO_CAPACITY_BY_LEVEL[tier] ?? 1900;
      totalCargo += count * capPerTroop;
    }
    if (totalCargo > 0) {
      const fromSquad = Math.floor(totalCargo / weight);
      return Number.isFinite(mineRemaining) && mineRemaining > 0
        ? Math.min(fromSquad, mineRemaining)
        : fromSquad;
    }
  }

  if (Number.isFinite(mineRemaining) && mineRemaining > 0) return mineRemaining;
  const level = Number(march?.mineLevel ?? cache?.mineMap?.[march?.mineId]?.level) || 7;
  return Math.floor(calculateMineCargo(type, level) / weight);
}

/**
 * Selects the next basic resource type by lowest capacity-weighted projected stock:
 *   score[type] = (cityStock[type] + inFlightAmount[type]) * RESOURCE_CARGO_WEIGHT[type]
 * Excludes unopened chests; includes marching, gathering, and returning gathering marches.
 */
export function selectBalancedResourceType(
  cache: any,
  now: number = Date.now()
): {
  type: BasicResourceType;
  hasStockData: boolean;
  scores: Record<BasicResourceType, number>;
  stock: Record<BasicResourceType, number>;
  inFlight: Record<BasicResourceType, number>;
} {
  const { hasStockData, stock } = getCityResourceStock(cache);
  const inFlight: Record<BasicResourceType, number> = { food: 0, wood: 0, stone: 0, iron: 0 };

  for (const m of safeList(cache?.marchStatus?.data?.marches)) {
    if (!m || isMarchExpired(m, now)) continue;
    const resolved = resolveMarchResourceType(m, cache);
    const normType = resolved === 'gold' ? 'food' : resolved;
    if (!normType || !(BASIC_MINE_TYPES as readonly string[]).includes(normType)) continue;
    const t = normType as BasicResourceType;
    inFlight[t] += estimateMarchInFlightResourceAmount(m, t, cache);
  }

  const tieOrder: readonly BasicResourceType[] = ['food', 'iron', 'stone', 'wood'];
  const scores: Record<BasicResourceType, number> = { food: 0, wood: 0, stone: 0, iron: 0 };
  for (const t of tieOrder) {
    scores[t] = (stock[t] + inFlight[t]) * (RESOURCE_CARGO_WEIGHT[t] ?? 1);
  }

  let best: BasicResourceType = tieOrder[0];
  for (const t of tieOrder.slice(1)) {
    if (scores[t] < scores[best]) best = t;
  }

  return { type: best, hasStockData, scores, stock, inFlight };
}

/**
 * Deducts reserved troop counts per type (infantry=0, spearmen=1, marksmen=2),
 * preserving the HIGHEST tiers first for combat (Auto-Join / Rallies).
 * Never mutates the original unitSummary.
 */
export function applyTroopReserve(unitSummary: any, reserve?: GatherTroopReserve | null): any {
  if (!unitSummary || typeof unitSummary !== 'object') return unitSummary;
  const norm = normalizeTroopReserve(reserve);
  if (!hasTroopReserve(norm)) return unitSummary;

  const rawRows = Array.isArray(unitSummary.available)
    ? unitSummary.available
    : safeList(unitSummary.available ?? unitSummary.units);
  const cloned = rawRows.map((item: any) => ({ ...item }));

  const reserveByType: [number, number, number] = [norm.infantry, norm.spearmen, norm.marksmen];
  for (let type = 0; type < 3; type++) {
    let toReserve = reserveByType[type] || 0;
    if (toReserve <= 0) continue;

    const matching = cloned
      .filter((item: any) => {
        const id = Number(item?.unitId);
        return Number.isInteger(id) && id > 0 && Math.floor((id - 1) / 10) === type && Number(item?.count) > 0;
      })
      .sort((a: any, b: any) => {
        const tierA = ((Number(a.unitId) - 1) % 10) + 1;
        const tierB = ((Number(b.unitId) - 1) % 10) + 1;
        return tierB - tierA;
      });

    for (const item of matching) {
      if (toReserve <= 0) break;
      const available = Math.max(0, Math.floor(Number(item.count) || 0));
      const hold = Math.min(available, toReserve);
      item.count = available - hold;
      toReserve -= hold;
    }
  }

  return {
    ...unitSummary,
    available: cloned.filter((item: any) => Number(item?.count) > 0),
  };
}

export function normalizeAutoGatherSettings(settings: any, cache?: any): AutoGatherSettings {
  const raw = settings && typeof settings === 'object' ? settings : {};
  const baseMax =
    Number.isInteger(raw.maxMarches) && raw.maxMarches >= 1 && raw.maxMarches <= 10
      ? raw.maxMarches
      : 3;
  const maxMarches = cache ? Math.min(baseMax, calculateAccountMaxMarches(cache)) : baseMax;
  const mineLevel =
    raw.smartEnabled === true && raw.mineLevel === 'nearest'
      ? 'nearest'
      : Number.isInteger(raw.mineLevel) && raw.mineLevel >= 1 && raw.mineLevel <= 10
      ? raw.mineLevel
      : 5;
  const mineType =
    typeof raw.mineType === 'string' &&
    (raw.mineType === 'rotate' || (BASIC_MINE_TYPES as readonly string[]).includes(raw.mineType))
      ? raw.mineType
      : 'rotate';
  const lastAutoMineType =
    typeof raw.lastAutoMineType === 'string' &&
    (BASIC_MINE_TYPES as readonly string[]).includes(raw.lastAutoMineType)
      ? raw.lastAutoMineType
      : null;
  const selectedTeam = typeof raw.selectedTeam === 'string' ? raw.selectedTeam : undefined;
  const optimizeTeam = raw.optimizeTeam === true || raw.selectedTeam === 'optimized';
  const reserveTroops = raw.reserveTroops ? normalizeTroopReserve(raw.reserveTroops) : undefined;

  return {
    enabled: raw.enabled === true,
    smartEnabled: raw.smartEnabled === true,
    maxMarches,
    mineLevel,
    mineType,
    lastAutoMineType,
    ...(selectedTeam ? { selectedTeam } : {}),
    ...(optimizeTeam ? { optimizeTeam: true } : {}),
    ...(typeof raw.defenseRecallEnabled === 'boolean' ? { defenseRecallEnabled: raw.defenseRecallEnabled } : {}),
    ...(Number.isFinite(raw.defenseInfirmaryThreshold) ? { defenseInfirmaryThreshold: Number(raw.defenseInfirmaryThreshold) } : {}),
    ...(typeof raw.interceptTeamId === 'string' ? { interceptTeamId: raw.interceptTeamId } : {}),
    ...(reserveTroops ? { reserveTroops } : {}),
  };
}

export function resolveNextMineType(
  mineTypeSetting: string,
  lastAutoMineType?: string | null
): string {
  if ((BASIC_MINE_TYPES as readonly string[]).includes(mineTypeSetting)) {
    return mineTypeSetting;
  }
  if (lastAutoMineType && (BASIC_MINE_TYPES as readonly string[]).includes(lastAutoMineType)) {
    const idx = (BASIC_MINE_TYPES as readonly string[]).indexOf(lastAutoMineType);
    return BASIC_MINE_TYPES[(idx + 1) % BASIC_MINE_TYPES.length] || 'food';
  }
  return BASIC_MINE_TYPES[0] || 'food';
}

export function countActiveMarches(marches: any, now: number = Date.now()): number {
  const list = safeList(marches);
  return list.filter((m: any) => {
    if (m?.stage === 'returnToOutpost' || m?.kind === 'return') {
      if (Number.isFinite(m.endsAt) && now >= m.endsAt) return false;
    }
    return true;
  }).length;
}

export function parseCalls(body: any): any[] {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return Array.isArray(parsed?.calls) ? parsed.calls : [];
  } catch {
    return [];
  }
}

export function isGameLoadRecord(record: any): boolean {
  if (!record) return false;
  const calls = record.requestBody ? parseCalls(record.requestBody) : [];
  if (
    calls.some((c) =>
      [
        'userGetInfo',
        'mobileLogin',
        'getLeaderboardPowerSummary',
        'getUnitSummary',
        'getMarches',
      ].includes(c.name)
    )
  ) {
    return true;
  }
  if (
    typeof record.requestBody === 'string' &&
    (record.requestBody.includes('"userGetInfo"') ||
      record.requestBody.includes('"mobileLogin"') ||
      record.requestBody.includes('"getMarches"'))
  ) {
    return true;
  }
  return false;
}

export function isMarchReturnRecord(
  record: any,
  prevCache: any,
  currentCache: any,
  now: number = Date.now()
): boolean {
  if (!record) return false;
  if (
    record.transport === 'websocket' &&
    record.direction === 'received' &&
    record.encoding === 'utf8'
  ) {
    try {
      const payload = JSON.parse(record.payload)?.result;
      if (
        payload?.type === 'returnToOutpostFromMob' ||
        payload?.type === 'returnToOutpostFromMine' ||
        payload?.type === 'rallyCompleted' ||
        payload?.type === 'marchCompleted'
      ) {
        return true;
      }
    } catch (_) {}
  }
  const prevMarches = countActiveMarches(prevCache?.marchStatus?.data?.marches, now);
  const curMarches = countActiveMarches(currentCache?.marchStatus?.data?.marches, now);
  if (prevMarches > 0 && curMarches < prevMarches) {
    return true;
  }
  const prevReturning = safeList(prevCache?.marchStatus?.data?.marches).some(
    (m: any) =>
      (m.stage === 'returnToOutpost' || m.kind === 'return') && (!m.endsAt || now >= m.endsAt)
  );
  if (prevReturning) return true;

  return false;
}

export function isTroopAvailabilityEvent(
  record: any,
  prevCache: any,
  currentCache: any,
  now: number = Date.now(),
  reserveTroops?: GatherTroopReserve | null
): boolean {
  if (isMarchReturnRecord(record, prevCache, currentCache, now)) return true;

  if (
    record?.transport === 'websocket' &&
    record.direction === 'received' &&
    record.encoding === 'utf8'
  ) {
    try {
      const type = JSON.parse(record.payload)?.result?.type;
      if (type === 'returnFromMineCompleted' || type === 'gatheringMineCompleted') {
        return true;
      }
    } catch (_) {}
  }

  if (record?.requestBody) {
    const calls = parseCalls(record.requestBody);
    if (
      calls.some(
        (c: any) =>
          (c?.name === 'completeTraining' || c?.name === 'completeHealing') &&
          (!c.feature || c.feature === 'unit')
      )
    ) {
      return true;
    }
  }

  const curUnitEntry = currentCache?.['getUnitSummary:unit'];
  const prevUnitEntry = prevCache?.['getUnitSummary:unit'];
  if (
    curUnitEntry?.data &&
    curUnitEntry.updatedAt &&
    curUnitEntry.updatedAt !== prevUnitEntry?.updatedAt
  ) {
    const effective = applyTroopReserve(curUnitEntry.data, reserveTroops);
    if (countAvailableTroops(effective) > 0) return true;
  }

  return false;
}

export function planAutoGather(cache: any, stored: any, now: number = Date.now()): AutoGatherPlanResult {
  if (stored?.popupRpcEnabled !== true) {
    return { action: 'idle', reason: 'Popup RPC disabled' };
  }
  const settings = normalizeAutoGatherSettings(stored?.autoGatherSettings, cache);
  if (!settings.enabled) {
    return { action: 'idle', reason: 'Auto-gather disabled' };
  }

  const smart = settings.smartEnabled ? getSmartGatherHelper() : null;
  const defense = getMineDefenseHelper();
  let daily: any = null;
  const incompleteMarches =
    cache?.marchStatus?.method &&
    cache.marchStatus.method !== 'getMarches' &&
    String(cache?.marchSnapshotStatus?.data?.accountId) !== String(cache?.accountStatus?.data?.id);

  const snapshotRefresh =
    smart &&
    (incompleteMarches ||
      !cache?.marchStatus?.data?.marches ||
      !cache?.['getUnitSummary:unit']?.data?.squads ||
      !smart.fresh(cache.marchStatus, now) ||
      !smart.fresh(cache['getUnitSummary:unit'], now))
      ? {
          action: 'refresh' as const,
          reason: 'Refreshing current marches, troops and gathering plans',
          calls: [
            ...(incompleteMarches ||
            !cache?.marchStatus?.data?.marches ||
            !smart.fresh(cache.marchStatus, now)
              ? [{ name: 'getMarches', feature: 'march' }]
              : []),
            ...(!cache?.['getUnitSummary:unit']?.data?.squads ||
            !smart.fresh(cache['getUnitSummary:unit'], now)
              ? [{ name: 'getUnitSummary', feature: 'unit' }]
              : []),
            ...(!smart.fresh(cache?.gatheringStatus, now)
              ? [{ name: 'getMineSummary', feature: 'mine' }]
              : []),
            ...(!cache?.heroGetAll?.data ? [{ name: 'heroGetAll' }] : []),
          ],
        }
      : null;

  if (smart && incompleteMarches) return snapshotRefresh!;
  if (smart && smart.activeQueue(stored)) {
    return { action: 'wait', reason: 'Gathering paused while raid/monster queue is active' };
  }
  if (
    smart &&
    stored?.smartGatherState?.marchLimitBackoffUntil &&
    now < stored.smartGatherState.marchLimitBackoffUntil
  ) {
    return {
      action: 'wait',
      reason: 'Server march limit reached (MarchLimitExceeded); waiting for squad return',
    };
  }

  const { reservedHeroIds, reservedMarchSlots } = resolveGatherLocks(cache, stored, now);
  const effectiveMaxMarches = Math.max(0, settings.maxMarches - reservedMarchSlots);
  const marches = safeList(cache?.marchStatus?.data?.marches);
  const activeCount = smart ? marches.length : countActiveMarches(marches, now);

  const rawSummary = cache?.['getUnitSummary:unit']?.data;
  const effectiveSummary = rawSummary ? applyTroopReserve(rawSummary, settings.reserveTroops) : null;
  const unitSummaryFresh = !smart || smart.fresh(cache?.['getUnitSummary:unit'], now);
  if (
    effectiveSummary &&
    unitSummaryFresh &&
    activeCount < effectiveMaxMarches &&
    countAvailableTroops(effectiveSummary) <= 0
  ) {
    const hasReserve = hasTroopReserve(settings.reserveTroops);
    return {
      action: 'wait',
      waitForTroops: true,
      reason: hasReserve
        ? 'No surplus troops above reserve; waiting for training, healing, or returning march'
        : 'No troops available; waiting for training, healing, or returning march',
    };
  }

  const resume = smart?.resumePlan(cache, stored?.smartGatherState, now);
  if (resume && resume.action !== 'target') return snapshotRefresh || resume;

  if (smart && !resume && settings.mineType === 'rotate') {
    daily = smart.dailyPlan(
      cache,
      {
        ...settings,
        lastAutoMineType: stored?.smartGatherState?.lastAutoMineType || settings.lastAutoMineType,
      },
      now,
      stored?.smartGatherState
    );
    if (daily.action === 'refresh') {
      if (!stored?.smartGatherState?.notice?.message?.includes('falling back to standard gathering rotation')) {
        return {
          action: 'refresh',
          reason: daily.reason,
          calls: [{ name: 'getDailyQuests', feature: 'quest', args: {} }, { name: 'user_getNextDayTime' }],
        };
      }
    }
    if (daily.action === 'wait') return daily;
    if (daily.action === 'recall') {
      return (
        snapshotRefresh || {
          action: 'recall',
          reason: daily.reason,
          call: { name: 'stopMineGathering', feature: 'mine', args: { squadId: daily.march.squadId } },
        }
      );
    }
  }

  if (activeCount >= effectiveMaxMarches) {
    if (snapshotRefresh && marches.some((m: any) => !Number.isFinite(m.endsAt) || now >= m.endsAt)) {
      return snapshotRefresh;
    }
    return {
      action: 'wait',
      reason:
        reservedMarchSlots > 0
          ? `Waiting: ${reservedMarchSlots} march slot(s) reserved by active queue (${activeCount}/${effectiveMaxMarches})`
          : `Current marches limit reached (${activeCount}/${settings.maxMarches})`,
      activeCount,
      maxMarches: effectiveMaxMarches,
    };
  }
  if (snapshotRefresh) return snapshotRefresh;

  const contextObj = {
    ...cache?.experimentalMineSearch?.data,
    ...cache?.experimentalRallySearch?.data,
    ...cache?.experimentalMapContext?.data,
  };
  const mapId = contextObj.mapId;
  const center = contextObj.outposts?.[cache?.accountStatus?.data?.id] || contextObj.center;
  if (!mapId || !Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
    return { action: 'wait', reason: 'Map ID or center coordinates unavailable' };
  }

  const data = getDataHelper();
  if (!data) return { action: 'wait', reason: 'Experimental data helper unavailable' };

  const heroes = cache?.heroGetAll?.data || {};
  const summary = rawSummary;
  if (!summary || !effectiveSummary) return { action: 'wait', reason: 'Unit summary unavailable' };

  const rawAvailableHeroIds = data.availableHeroIds(heroes, summary, marches);
  const availableHeroIds = reservedHeroIds.size > 0
    ? rawAvailableHeroIds.filter((id: number) => !reservedHeroIds.has(Number(id)))
    : rawAvailableHeroIds;
  const isOptimized = settings.selectedTeam === 'optimized' || settings.optimizeTeam === true;

  if (isOptimized) {
    if (availableHeroIds.length < 1) {
      return {
        action: 'wait',
        reason: reservedHeroIds.size > 0 ? 'No unreserved heroes available (reserved by active queue)' : 'No heroes available',
      };
    }
  } else {
    if (availableHeroIds.length < 5) {
      return {
        action: 'wait',
        reason:
          reservedHeroIds.size > 0
            ? `Fewer than 5 unreserved heroes available (${availableHeroIds.length}; ${reservedHeroIds.size} reserved by active queue)`
            : `Fewer than 5 heroes available (${availableHeroIds.length})`,
      };
    }
  }

  const myAccountId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id ?? cache?.accountStatus?.data?.id;
  const refHeroIds = data.lowestPowerHeroes(heroes, availableHeroIds);
  const refSquadCapacity =
    refHeroIds.length > 0
      ? data.capacityModel(
          refHeroIds,
          heroes,
          cache?.troopCapacityEvidence?.data,
          data.normalizeCapacitySettings(stored?.troopCapacitySettings),
          myAccountId
        ).total || 0
      : 0;
  const balanced = computeBalancedGatherAllocation({
    rawSummary: summary,
    effectiveSummary,
    reserveTroops: settings.reserveTroops,
    squadCapacity: refSquadCapacity,
    effectiveMaxMarches,
    activeCount,
  });

  const weightedPick = settings.mineType === 'rotate' ? selectBalancedResourceType(cache, now) : null;
  const targetMineType =
    resume?.type ||
    daily?.type ||
    (weightedPick?.hasStockData
      ? weightedPick.type
      : resolveNextMineType(settings.mineType, settings.lastAutoMineType));
  const nearest =
    smart && !resume && settings.mineLevel === 'nearest'
      ? smart.nearestPlan(cache, stored?.smartGatherState, targetMineType, now)
      : null;
  if (nearest && nearest.action !== 'target') return nearest;
  const targetMineLevel = resume?.level || nearest?.level || settings.mineLevel;
  const configId = data.mineConfigId(targetMineType, targetMineLevel);
  if (!configId) return { action: 'wait', reason: 'Invalid mine configuration' };

  const mineSearch = cache?.experimentalMineSearch?.data;
  const activeMineIds = new Set([
    ...(smart ? smart.blockedMineIds(stored?.smartGatherState, now) : []),
    ...(smart && defense?.unsafeMineIds ? defense.unsafeMineIds(cache, stored?.smartGatherState, now) || [] : []),
    ...marches.map((m: any) => m?.mineId || m?.target?.objectId || m?.targetId).filter(Boolean),
  ]);

  const matchingMines = resume
    ? [resume.mine]
    : nearest
    ? [nearest.mine]
    : mineSearch?.mineConfigId === configId
    ? safeList(mineSearch?.mines).filter((m: any) => m?.mineId && !activeMineIds.has(m.mineId))
    : [];

  if (matchingMines.length > 0) {
    const selectedMine = matchingMines[0];
    let squad: any = null;

    if (isOptimized) {
      const myId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id;
      const remainingAmount =
        selectedMine?.resourceAmount ??
        selectedMine?.resourcesAmount ??
        selectedMine?.amount ??
        cache?.mineMap?.[selectedMine?.mineId]?.resourceAmount ??
        cache?.mineMap?.[selectedMine?.mineId]?.resourcesAmount;

      const opt = data.buildOptimizedGatheringTeam({
        heroes,
        availableHeroIds,
        unitSummary: effectiveSummary,
        mineType: targetMineType,
        mineLevel: targetMineLevel,
        resourcesAmount: remainingAmount,
        resourceAmount: remainingAmount,
        targetMine: selectedMine,
        capacitySettings: data.normalizeCapacitySettings(stored?.troopCapacitySettings),
        accountId: myId,
        ...(balanced.constrained ? { maxTroopBudget: balanced.dispatchCap } : {}),
      });
      if (!opt.heroIds.length || !opt.allocatedTroops.length) {
        return {
          action: 'wait',
          waitForTroops: !opt.allocatedTroops.length,
          reason: 'Could not allocate optimized gathering team',
        };
      }
      squad = data.buildSquad(opt.heroIds, opt.allocatedTroops);
    } else {
      const heroIds = data.lowestPowerHeroes(heroes, availableHeroIds);
      if (heroIds.length !== 5) {
        return { action: 'wait', reason: 'Could not select 5 lowest power heroes' };
      }

      const myId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id;
      const capacity = data.capacityModel(
        heroIds,
        heroes,
        cache?.troopCapacityEvidence?.data,
        data.normalizeCapacitySettings(stored?.troopCapacitySettings),
        myId
      ).total;
      const effectiveCap = balanced.constrained && Number.isFinite(capacity)
        ? Math.min(capacity, balanced.dispatchCap)
        : capacity;
      const availSummary = Array.isArray(effectiveSummary?.available)
        ? effectiveSummary
        : { available: safeList(effectiveSummary?.units) };
      const troops = data.allocateTroops(availSummary, effectiveCap);
      squad = data.buildSquad(heroIds, troops);
    }

    if (!squad) return { action: 'wait', waitForTroops: true, reason: 'Could not allocate squad troops' };

    const gatherCall = data.buildGatherCall(mapId, selectedMine.mineId, squad);
    if (!gatherCall) return { action: 'wait', reason: 'Failed to build gather call' };

    return {
      action: 'gather',
      mineType: targetMineType,
      mineLevel: targetMineLevel,
      mineId: selectedMine.mineId,
      call: gatherCall,
      pending: { mineType: targetMineType, ...(resume ? { resumeMineId: selectedMine.mineId } : {}) },
      nextLastAutoMineType: targetMineType,
    };
  }

  const searchCall = data.buildMineSearchCall(mapId, center, targetMineType, targetMineLevel);
  if (!searchCall) return { action: 'wait', reason: 'Failed to build mine search call' };

  return {
    action: 'search',
    mineType: targetMineType,
    mineLevel: targetMineLevel,
    call: searchCall,
  };
}

export const autoGatherService = {
  BASIC_MINE_TYPES,
  safeList,
  normalizeTroopReserve,
  hasTroopReserve,
  countAvailableTroops,
  countDeployedTroops,
  countTotalTroops,
  computeBalancedGatherAllocation,
  getCityResourceStock,
  estimateMarchInFlightResourceAmount,
  selectBalancedResourceType,
  applyTroopReserve,
  normalizeAutoGatherSettings,
  resolveNextMineType,
  countActiveMarches,
  isGameLoadRecord,
  isMarchReturnRecord,
  isTroopAvailabilityEvent,
  planAutoGather,
};

export default autoGatherService;
