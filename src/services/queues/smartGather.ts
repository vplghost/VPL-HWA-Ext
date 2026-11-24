import type {
  SmartGatherState,
  SmartGatherDailyRow,
} from '../../types/game/gatherQueue.ts';
import smartGatherData from '../../data/smartGatherData.ts';
import { routeSpeeds } from '../../utils/marchRules.ts';
import * as expData from '../../utils/experimentalData.ts';
import { unsafeMineIds as getUnsafeMineIds } from '../mineDefense.ts';
import { normalizeAutoGatherSettings } from './autoGather.ts';

function getSmartGatherData(): any {
  return smartGatherData;
}

function getDataHelper(): any {
  return expData;
}

function getRouteSpeeds(): any {
  return routeSpeeds;
}

function getMineDefenseHelper(): any {
  return {
    unsafeMineIds: getUnsafeMineIds,
  };
}

export function list<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function finite(n: any): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

export const order = ['food', 'iron', 'stone', 'wood'] as const;

export function gathering(march: any): boolean {
  return Boolean(march?.mineId) && ['interactionWithTarget', 'gathering'].includes(march.stage);
}

export function typeOf(march: any, cache: any): string | undefined {
  const data = getSmartGatherData();
  const configId = march?.mineConfigId ?? cache?.mineMap?.[march?.mineId]?.mineConfigId;
  return data?.mines?.[configId]?.type || cache?.mineMap?.[march?.mineId]?.mineType || march?.kind;
}

export function context(cache: any): { mapId: any; center: any } {
  const raw = cache?.experimentalMapContext?.data || cache?.experimentalMineSearch?.data || {};
  return { mapId: raw.mapId, center: raw.outposts?.[cache?.accountStatus?.data?.id] };
}

export function fresh(entry: any, now: number): boolean {
  const at = Date.parse(entry?.updatedAt);
  return finite(at) && at <= now && now - at <= 60000;
}

export function returnMs(march: any, cache: any): number | null {
  const speeds = getRouteSpeeds();
  const from = march?.targetCoordinates || cache?.mineMap?.[march?.mineId]?.coordinates;
  const to = context(cache).center;
  const speed = speeds?.returnToOutpost;
  return finite(from?.x) && finite(from?.y) && finite(to?.x) && finite(to?.y) && speed > 0
    ? Math.ceil((Math.hypot(to.x - from.x, to.y - from.y) * 10000) / speed)
    : null;
}

export function collectedSince(march: any, cache: any, since: number, now: number): number | null {
  const plan =
    cache?.gatheringStatus?.data?.plans?.[march?.squadId] ||
    list(cache?.gatheringStatus?.data?.gatherings).find(
      (row: any) => row.squadId === march?.squadId && row.mineId === march?.mineId
    );
  const start = plan?.startedAt ?? march?.gatheringStartedAt;
  const duration = plan?.plannedDurationMs ?? march?.gatheringDurationMs;
  const amount = plan?.plannedGatheredResourceAmount ?? march?.gatheringTotalAmount;
  const stopTime = march?.stage === 'returnToOutpost' || march?.kind === 'return' ? march?.gatheringStoppedAt : now;
  if (!finite(start) || !finite(duration) || duration <= 0 || !finite(amount) || !finite(stopTime)) {
    return null;
  }
  const ratio = (time: number) => Math.max(0, Math.min(1, (time - start) / duration));
  return Math.max(0, Math.floor(amount * ratio(stopTime)) - Math.ceil(amount * ratio(since)));
}

export function activeQueue(stored: any): any {
  return [stored?.raidQueue, stored?.monsterQueue].find((q) => q && !['complete', 'stopped'].includes(q.phase));
}

export function blockedMineIds(state: any, now: number): Set<string | number> {
  return new Set(list(state?.rejectedMines).filter((row: any) => row.expiresAt > now).map((row: any) => row.mineId));
}

export function skipMine(state: any, mineId: string | number | undefined, now: number, reason: string): void {
  if (!mineId) return;
  state.rejectedMines = [
    ...list(state.rejectedMines).filter((row: any) => row.mineId !== mineId && row.expiresAt > now),
    { mineId, expiresAt: now + 60000, reason },
  ].slice(-50);
  state.interrupted = list(state.interrupted).filter((row: any) => row.mineId !== mineId);
  if (state.resumeCandidate?.mineId === mineId) state.resumeCandidate = null;
  if (state.nearest) {
    state.nearest.candidates = list(state.nearest.candidates).filter((row: any) => row.mineId !== mineId);
    if (state.nearest.selected?.mineId === mineId) state.nearest.selected = null;
  }
  state.notice = {
    at: now,
    expiresAt: now + 5000,
    message: `Skipping unavailable mine (${reason}); finding a free mine`,
  };
}

export function rpcFailure(result: any): string | null {
  const response = result?.response;
  const code = response?.errorCode ?? result?.errorCode;
  const error =
    result?.error || response?.error || (code != null && code !== 0 && code !== '0' && code !== '' ? code : null);
  if (!error) return null;
  if (typeof error !== 'object') return String(error);
  const kind = error.code || error.name;
  return ['MineNotFound', 'BattleTypeMismatch'].includes(kind) ? kind : error.message || kind || JSON.stringify(error);
}

export function recallForRally(cache: any, stored: any, rally: any, now: number): any {
  const marches = list(cache?.marchStatus?.data?.marches);
  const maxMarches = normalizeAutoGatherSettings(stored?.autoGatherSettings).maxMarches ?? 3;
  if (marches.length < maxMarches) return null;
  if (!finite(rally?.plannedStartTime) || rally?.route) return null;
  return (
    marches
      .filter(gathering)
      .map((march: any) => ({ march, ms: returnMs(march, cache) }))
      .filter((row: any) => finite(row.ms) && row.ms < 29000 && now + row.ms + 3000 < rally.plannedStartTime)
      .sort((a: any, b: any) => a.ms - b.ms)[0] || null
  );
}

export function recallForQueue(cache: any, settings: any, options: any, now: number): any {
  const data = getDataHelper();
  const marches = list(cache?.marchStatus?.data?.marches);
  const summary = cache?.['getUnitSummary:unit']?.data;
  const available = data.availableHeroIds(cache?.heroGetAll?.data, summary, marches);
  const needed = options?.teamId === 'weakest' ? [] : (options?.heroIds || []).filter((id: any) => !available.includes(id));
  if (marches.length < settings?.maxMarches && !needed.length) return null;
  const eligible = marches
    .filter(gathering)
    .filter((m: any) => {
      const squad = list(summary?.squads).find((s: any) => (s.id ?? s.squadId) === m.squadId);
      const ids = list(squad?.heroes).map((h: any) => h.id ?? h.heroId);
      return needed.every((id: any) => ids.includes(id));
    })
    .map((march: any) => ({ march, ms: returnMs(march, cache) }))
    .filter((row: any) => finite(row.ms))
    .sort((a: any, b: any) => a.ms - b.ms);
  return {
    march: eligible[0]?.march || null,
    reason: 'No gathering squad with known coordinates can release the required slot/heroes',
  };
}

export function nearestPlan(cache: any, state: any, type: string, now: number): any {
  const map = context(cache);
  const data = getDataHelper();
  const smartData = getSmartGatherData();
  const defense = getMineDefenseHelper();

  if (!map.mapId || !finite(map.center?.x) || !finite(map.center?.y)) {
    return {
      action: 'wait',
      reason: 'Own outpost coordinates unavailable; open the world map to refresh',
    };
  }
  const sameCenter = state?.nearest?.center?.x === map.center?.x && state?.nearest?.center?.y === map.center?.y;
  const exhausted = finite(state?.nearest?.exhaustedAt) && now >= state.nearest.exhaustedAt + 60000;
  const nearest =
    !exhausted && state?.nearest?.type === type && state.nearest.mapId === map.mapId && sameCenter
      ? state.nearest
      : { mapId: map.mapId, center: map.center, type, levels: [], candidates: [], startedAt: now };

  if (nearest.selected && blockedMineIds(state, now).has(nearest.selected.mineId)) {
    nearest.selected = null;
  }
  const level = Array.from({ length: 10 }, (_, i) => i + 1).find((lvl) => !nearest.levels.includes(lvl));
  if (level) {
    return {
      action: 'search',
      reason: `Finding nearest ${type} mine: level ${level}/10`,
      nearest,
      call: data.buildMineSearchCall(map.mapId, map.center, type, level),
      pending: { purpose: 'nearestSearch', level, configId: data.mineConfigId(type, level) },
    };
  }
  if (nearest.selected && now - nearest.selected.checkedAt < 30000) {
    return {
      action: 'target',
      mine: nearest.selected,
      type,
      level: smartData.mines[nearest.selected.configId]?.level,
    };
  }
  const active = new Set([
    ...list(cache?.marchStatus?.data?.marches).map((m: any) => m.mineId).filter(Boolean),
    ...blockedMineIds(state, now),
    ...(defense.unsafeMineIds ? defense.unsafeMineIds(cache, state, now) : []),
  ]);
  const candidate = nearest.candidates
    .filter((m: any) => !active.has(m.mineId))
    .sort(
      (a: any, b: any) =>
        Math.hypot(a.coordinates.x - map.center.x, a.coordinates.y - map.center.y) -
        Math.hypot(b.coordinates.x - map.center.x, b.coordinates.y - map.center.y)
    )[0];
  if (!candidate) {
    if (!finite(nearest.exhaustedAt)) nearest.exhaustedAt = now;
    return {
      action: 'wait',
      reason: `No eligible nearest mine; searching again in ${Math.ceil((nearest.exhaustedAt + 60000 - now) / 1000)}s`,
      nearest,
    };
  }
  return {
    action: 'probe',
    reason: 'Checking nearest mine · estimated duration must exceed 1h',
    nearest,
    call: { name: 'getMineById', feature: 'mine', args: { mineId: candidate.mineId } },
    pending: { purpose: 'nearestProbe', mine: candidate },
  };
}

export function activeGatheringMineIds(cache: any): Set<string> {
  const ids = new Set<string>();
  for (const m of list(cache?.marchStatus?.data?.marches)) {
    if (m?.stage === 'returnToOutpost' || m?.kind === 'return') continue;
    const id = m?.mineId || m?.target?.objectId || m?.targetId;
    if (typeof id === 'string' && id) ids.add(id);
  }
  for (const g of list(cache?.gatheringStatus?.data?.gatherings)) {
    if (typeof g?.mineId === 'string' && g.mineId) ids.add(g.mineId);
  }
  return ids;
}

export function resumePlan(cache: any, state: any, now: number = Date.now()): any {
  const mapId = context(cache).mapId;
  const smartData = getSmartGatherData();
  const defense = getMineDefenseHelper();
  const unsafe = new Set([
    ...(defense.unsafeMineIds ? defense.unsafeMineIds(cache, state, now) : []),
    ...blockedMineIds(state, now),
  ]);
  const occupied = activeGatheringMineIds(cache);
  const mine = list(state?.interrupted).find(
    (row: any) =>
      row?.mineId &&
      row.mapId === mapId &&
      !unsafe.has(row.mineId) &&
      !occupied.has(row.mineId) &&
      Boolean(smartData?.mines?.[row.configId])
  );
  if (!mine) return null;
  const info = smartData.mines[(mine as any).configId];
  if (state.resumeCandidate?.mineId === (mine as any).mineId && state.resumeCandidate.checkedAt > now - 30000) {
    const remaining = state.resumeCandidate.resourceAmount ?? (mine as any).resourceAmount ?? (mine as any).resourcesAmount;
    return {
      action: 'target',
      mine: { ...mine, resourceAmount: remaining, resourcesAmount: remaining },
      type: info.type,
      level: info.level,
    };
  }
  return {
    action: 'probe',
    reason: 'Checking interrupted mine before returning',
    call: { name: 'getMineById', feature: 'mine', args: { mineId: (mine as any).mineId } },
    pending: { purpose: 'resume', mine },
  };
}

export function dailyPlan(cache: any, settings: any, now: number, state: any = {}): any {
  const smartData = getSmartGatherData();
  const entry = cache?.['getDailyQuests:quest'];
  const reset = cache?.questResetStatus?.data?.nextDayAt;
  const at = Date.parse(entry?.updatedAt);
  const accountAt = Date.parse(cache?.accountStatus?.updatedAt);
  if (!finite(reset) || !finite(at)) {
    return { action: 'refresh', reason: 'Waiting for daily quests and server reset time' };
  }
  const next = reset > now ? reset : reset + (Math.floor((now - reset) / 86400000) + 1) * 86400000;
  const dayStart = next - 86400000;
  if (at < dayStart || at > now || (finite(accountAt) && at < accountAt) || !Array.isArray(entry.data?.quests)) {
    return { action: 'refresh', reason: 'Waiting for current-account daily quest snapshot' };
  }
  const marches = list(cache?.marchStatus?.data?.marches);
  if (state.dailyBaseline?.dayStart !== dayStart) {
    state.dailyBaseline = { dayStart, resources: {} };
  }
  const baselines = state.dailyBaseline.resources;
  const rows: SmartGatherDailyRow[] = [];
  for (const type of order) {
    const def = smartData?.daily?.[type];
    if (!def) return { action: 'wait', reason: 'Verified daily chain metadata unavailable' };
    const found = def.steps
      .map((step: any) => ({ step, quest: entry.data.quests.find((q: any) => q.id === step.id) }))
      .filter((x: any) => x.quest);
    if (!found.length) continue;
    const current = found.at(-1);
    const progress = current.quest.progress;
    if (!finite(progress) || progress < 0) return { action: 'wait', reason: `Unknown ${type} daily progress` };
    const finished =
      current.step.id === def.steps.at(-1).id && ['completed', 'claimed', 'rewarded'].includes(current.quest.state);
    const squads = marches.filter((m: any) => typeOf(m, cache) === type);
    const target = Math.ceil((def.target * 102) / 100);
    if (!baselines[type] || baselines[type].progress !== progress) {
      baselines[type] = { progress, since: at };
    }
    const increments = squads.map((m: any) => collectedSince(m, cache, Math.max(baselines[type].since, dayStart), now));
    const estimated = progress + increments.reduce((sum: number, n: any) => sum + (n ?? 0), 0);
    rows.push({ type, target, progress, estimated, done: finished || estimated >= target, squads });
  }
  const unserved = rows.find(
    (row) => !row.done && !row.squads.some((m: any) => m.stage !== 'returnToOutpost' && m.kind !== 'return')
  );
  if (unserved) {
    const complete = rows
      .filter((row) => row.done)
      .flatMap((row) => row.squads)
      .filter(gathering)
      .sort((a: any, b: any) => (returnMs(a, cache) ?? Infinity) - (returnMs(b, cache) ?? Infinity));
    if (complete.length) {
      return {
        action: 'recall',
        march: complete[0],
        reason: `Daily target reached; switching to ${unserved.type}`,
        rows,
      };
    }
    return {
      action: 'target',
      type: unserved.type,
      reason: `Daily ${unserved.type}: ${Math.floor(unserved.estimated)}/${unserved.target}`,
      rows,
    };
  }
  const last = order.indexOf(settings.lastAutoMineType);
  const rotating = [...order.slice(last + 1), ...order.slice(0, last + 1)];
  const rotType = rotating.find(
    (t) => !marches.some((m: any) => typeOf(m, cache) === t && m.stage !== 'returnToOutpost' && m.kind !== 'return')
  );
  if (rotType) {
    const hasUnfinishedDaily = rows.some((row) => !row.done);
    return {
      action: 'target',
      type: rotType,
      reason: hasUnfinishedDaily
        ? 'Daily resource squads active; rotating other resources'
        : 'Daily chains covered; resource rotation',
      rows,
    };
  }
  return {
    action: 'wait',
    reason: rows.some((row) => !row.done)
      ? 'Daily resource squads already gathering'
      : 'All resource types already gathering',
    rows,
  };
}

export function equal(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
  );
}

export function matches(a: any, b: any): boolean {
  return a?.name === b?.name && a?.feature === b?.feature && equal(a?.args || {}, b?.args || {});
}

export function replies(record: any): Array<{ call: any; result: any }> {
  if (
    record?.method !== 'POST' ||
    record.status !== 200 ||
    record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
    record.requestBodyTruncated ||
    record.responseBodyTruncated
  ) {
    return [];
  }
  try {
    const req = JSON.parse(record.requestBody);
    const res = JSON.parse(record.responseBody);
    return (req.calls || []).map((call: any) => ({
      call,
      result: res.results?.find((row: any) => row.ident === call.ident)?.result,
    }));
  } catch {
    return [];
  }
}

export const readFeatures = new Map<string, string>([
  ['getMarches', 'march'],
  ['getUnitSummary', 'unit'],
  ['getMineSummary', 'mine'],
  ['heroGetAll', ''],
  ['getDailyQuests', 'quest'],
  ['user_getNextDayTime', ''],
  ['searchMine', 'mine'],
  ['getMineById', 'mine'],
  ['getRallyById', 'rally'],
]);

export function pendingRead(pending: any): boolean {
  return (
    pending?.phase === 'sent' &&
    readFeatures.has(pending.call?.name) &&
    readFeatures.get(pending.call.name) === (pending.call.feature || '')
  );
}

function isLoadRecord(record: any): boolean {
  if (!record || record.method !== 'POST' || !record.requestBody) return false;
  try {
    const parsed = typeof record.requestBody === 'string' ? JSON.parse(record.requestBody) : record.requestBody;
    return (parsed?.calls || []).some((c: any) =>
      ['userGetInfo', 'mobileLogin', 'getLeaderboardPowerSummary', 'getUnitSummary', 'getMarches'].includes(c.name)
    );
  } catch {
    return false;
  }
}

export function sync(raw: any, record: any, cache: any, now: number): SmartGatherState {
  const smartData = getSmartGatherData();
  const accountId = cache?.accountStatus?.data?.id;
  const state: SmartGatherState =
    raw && accountId != null && String(raw.accountId) === String(accountId)
      ? structuredClone(raw)
      : { accountId, interrupted: [] };

  if (
    !state.pending &&
    state.error &&
    (/^Read .* timed out after 3 attempts/.test(state.error) ||
      /^Smart gathering .* confirmation timed out/.test(state.error)) &&
    isLoadRecord(record)
  ) {
    delete state.error;
    delete state.readTimeout;
    state.notice = {
      at: now,
      expiresAt: now + 5000,
      message: 'Resuming Smart gathering after game reconnect',
    };
  }

  if (
    !state.pending &&
    (/^(getMineById|attackMine) rejected by game: (MineNotFound|MarchLimitExceeded); restart Smart gathering to retry$/.test(state.error || '') ||
      /^getRallyById rejected by game:/.test(state.error || ''))
  ) {
    delete state.error;
    if (state.reservation?.type === 'rally') state.reservation = null;
    state.notice = {
      at: now,
      expiresAt: now + 5000,
      message: 'Resuming gathering; checking available targets',
    };
  }

  if (state.marchLimitBackoffUntil && now >= state.marchLimitBackoffUntil) {
    delete state.marchLimitBackoffUntil;
  }

  // Prune interrupted mines that already have an active (non-returning) gathering squad or invalid config
  const occupiedMines = activeGatheringMineIds(cache);
  const beforeInterrupted = list(state.interrupted);
  if (beforeInterrupted.length > 0) {
    const pruned = beforeInterrupted.filter((row: any) => {
      if (!row?.mineId) return false;
      if (occupiedMines.has(row.mineId)) return false;
      if (smartData?.mines && row.configId != null && !smartData.mines[row.configId]) return false;
      return true;
    });
    if (pruned.length !== beforeInterrupted.length) {
      state.interrupted = pruned;
      if (state.resumeCandidate?.mineId && !pruned.some((r: any) => r.mineId === state.resumeCandidate?.mineId)) {
        state.resumeCandidate = null;
      }
    }
  }

  const pending = state.pending;
  if (!pending) return state;

  const reply =
    Date.parse(record?.timestamp) >= pending.sentAt
      ? replies(record).find((row) => matches(row.call, pending.call))
      : null;

  if (reply && pendingRead(pending)) delete state.readTimeout;
  const failure = rpcFailure(reply?.result);

  if (reply && failure && pending.call.name !== 'joinRally') {
    state.pending = null;
    if (pending.call.name === 'getRallyById') {
      if (state.reservation?.type === 'rally') state.reservation = null;
      if (pending.call.args?.rallyId) {
        state.attemptedRallies = [...(state.attemptedRallies || []), pending.call.args.rallyId].slice(-100);
      }
      delete state.error;
      state.notice = {
        at: now,
        expiresAt: now + 5000,
        message: `Rally no longer available (${failure}); resuming gathering`,
      };
      return state;
    }
    if (failure === 'MarchLimitExceeded') {
      delete state.error;
      state.marchLimitBackoffUntil = now + 15000;
      state.notice = {
        at: now,
        expiresAt: now + 30000,
        message: 'Server march limit reached (MarchLimitExceeded); waiting for squad return',
      };
      return state;
    }
    const isTargetFailure =
      typeof failure === 'string' &&
      (['MineNotFound', 'BattleTypeMismatch'].includes(failure) ||
        failure.includes('Occupied') ||
        failure.includes('Target') ||
        failure.includes('Mine'));
    if (
      pending.call.feature === 'mine' &&
      ['getMineById', 'attackMine'].includes(pending.call.name) &&
      isTargetFailure
    ) {
      skipMine(state, pending.call.args?.mineId, now, failure);
      delete state.error;
    } else {
      state.error = `${pending.call.name} rejected by game: ${failure}; restart Smart gathering to retry`;
    }
    return state;
  }

  if (reply && pending.purpose === 'nearestSearch' && !reply.result?.error && Array.isArray(reply.result?.response?.mines)) {
    const nearest = state.nearest;
    if (nearest) {
      nearest.levels = [...new Set([...nearest.levels, pending.level])];
      const rows = reply.result.response.mines
        .filter((m: any) => m?.mineId && finite(m.coordinates?.x) && finite(m.coordinates?.y))
        .slice(0, 100)
        .map((m: any) => ({ mineId: m.mineId, coordinates: m.coordinates, configId: pending.configId }));
      nearest.candidates = [...new Map([...nearest.candidates, ...rows].map((m: any) => [m.mineId, m])).values()];
    }
    state.pending = null;
    return state;
  }

  if (reply && pending.purpose === 'nearestSearch' && !reply.result?.error) {
    state.pending = null;
    state.error = 'Mine search returned no usable mine list; refresh game and restart Smart gathering';
    return state;
  }

  if (reply && pending.purpose === 'nearestProbe') {
    if (!state.nearest) {
      state.pending = null;
      return state;
    }
    const amount = reply.result?.response?.resourceAmount;
    const info = smartData?.mines?.[pending.mine.configId];
    const duration = finite(amount) && info?.speedPerMinute > 0 ? (amount / info.speedPerMinute) * 60 : null;
    if (reply.result?.response?.gathering) skipMine(state, pending.mine.mineId, now, 'occupied');
    if (
      !failure &&
      !reply.result?.response?.gathering &&
      reply.result?.response?.mineId === pending.mine.mineId &&
      duration !== null &&
      duration > 3600
    ) {
      state.nearest.selected = {
        ...pending.mine,
        checkedAt: now,
        estimatedSeconds: duration,
        resourceAmount: amount,
        resourcesAmount: amount,
      };
    } else {
      state.nearest.candidates = state.nearest.candidates.filter((m: any) => m.mineId !== pending.mine.mineId);
      state.nearest.selected = null;
    }
    state.pending = null;
    return state;
  }

  if (reply && pending.purpose === 'resume') {
    const amount = reply.result?.response?.resourceAmount;
    if (reply.result?.response?.gathering) skipMine(state, pending.mine.mineId, now, 'occupied');
    if (
      !failure &&
      !reply.result?.response?.gathering &&
      finite(amount) &&
      amount > 0 &&
      reply.result?.response?.mineId === pending.mine.mineId
    ) {
      state.resumeCandidate = {
        mineId: pending.mine.mineId,
        checkedAt: now,
        resourceAmount: amount,
        resourcesAmount: amount,
      };
    } else {
      state.interrupted = list(state.interrupted).filter((m: any) => m.mineId !== pending.mine.mineId);
      state.resumeCandidate = null;
    }
    state.pending = null;
    return state;
  }

  if (reply && pending.call.name === 'joinRally') {
    const squadId = reply.result?.response?.squadId;
    if (!failure && squadId) {
      state.reservation = {
        type: 'joinedRally',
        rallyId: pending.call.args.rallyId,
        squadId,
        confirmedAt: Date.parse(record.timestamp),
      };
      state.pending = null;
    } else if (failure) {
      state.reservation = null;
      state.pending = null;
      state.notice = { at: now, message: 'Rally join rejected; resuming interrupted gathering' };
    }
    return state;
  }

  if (reply?.result?.error || reply?.result?.response?.error) {
    const err = rpcFailure(reply?.result) || 'error';
    state.pending = null;
    if (pending.call.name === 'getRallyById') {
      if (state.reservation?.type === 'rally') state.reservation = null;
      if (pending.call.args?.rallyId) {
        state.attemptedRallies = [...(state.attemptedRallies || []), pending.call.args.rallyId].slice(-100);
      }
      delete state.error;
      state.notice = {
        at: now,
        expiresAt: now + 5000,
        message: `Rally no longer available (${err}); resuming gathering`,
      };
    } else {
      const isTargetFailure =
        typeof err === 'string' &&
        (['MineNotFound', 'BattleTypeMismatch'].includes(err) ||
          err.includes('Occupied') ||
          err.includes('Target') ||
          err.includes('Mine'));
      if (
        pending.call.feature === 'mine' &&
        ['getMineById', 'attackMine'].includes(pending.call.name) &&
        isTargetFailure
      ) {
        skipMine(state, pending.call.args?.mineId, now, err);
        delete state.error;
      } else {
        state.error = `${pending.call.name} rejected by game; restart Smart gathering to retry`;
      }
    }
  } else if (reply && Object.hasOwn(reply.result || {}, 'response')) {
    const response = reply.result.response;
    if (pending.call.name === 'stopMineGathering' && response?.squadId === pending.call.args.squadId && response.route) {
      if (pending.mine && !list(state.interrupted).some((m: any) => m.mineId === pending.mine.mineId)) {
        state.interrupted = [...list(state.interrupted), pending.mine].slice(-20);
      }
      state.pending = {
        ...pending,
        phase: 'returning',
        confirmedAt: Date.parse(record.timestamp),
        returnAt: response.route.startedAt + (response.route.durationMs ?? response.route.duration),
      };
    } else if (pending.call.name === 'attackMine' && response?.squadId && response.route) {
      if (pending.resumeMineId) {
        state.interrupted = list(state.interrupted).filter((m: any) => m.mineId !== pending.resumeMineId);
        state.resumeCandidate = null;
      }
      if (state.nearest && state.nearest.selected?.mineId === pending.call.args.mineId) {
        state.nearest.candidates = state.nearest.candidates.filter((m: any) => m.mineId !== pending.call.args.mineId);
        state.nearest.selected = null;
      }
      if (pending.mineType) state.lastAutoMineType = pending.mineType;
      state.pending = {
        ...pending,
        phase: 'refresh',
        squadId: response.squadId,
        confirmedAt: Date.parse(record.timestamp),
      };
    } else if (!['stopMineGathering', 'attackMine'].includes(pending.call.name)) {
      if (pending.call.name === 'getRallyById' && !response?.rally) {
        if (state.reservation?.type === 'rally') state.reservation = null;
        if (pending.call.args?.rallyId) {
          state.attemptedRallies = [...(state.attemptedRallies || []), pending.call.args.rallyId].slice(-100);
        }
        delete state.error;
        state.notice = {
          at: now,
          expiresAt: now + 5000,
          message: 'Reserved rally no longer available; resuming gathering',
        };
      }
      state.pending = null;
    }
  }

  const wait = state.pending;
  if (wait?.phase === 'returning' || wait?.phase === 'refresh') {
    const squadId = wait.squadId ?? wait.call.args.squadId;
    const requiredAt =
      wait.phase === 'returning'
        ? Math.max(
            wait.confirmedAt || 0,
            wait.returnAt || 0,
            cache?.marchReturnStatus?.data?.completions?.[squadId] || 0
          )
        : wait.confirmedAt;
    const marchFresh = Date.parse(cache?.marchStatus?.updatedAt) >= requiredAt;
    const unitsFresh = Date.parse(cache?.['getUnitSummary:unit']?.updatedAt) >= requiredAt;
    const exists = list(cache?.marchStatus?.data?.marches).some((m: any) => m.squadId === squadId);
    const deployed = list(cache?.['getUnitSummary:unit']?.data?.squads).some((s: any) => (s.squadId ?? s.id) === squadId);
    if (marchFresh && unitsFresh && (wait.phase === 'returning' ? !exists && !deployed : exists)) {
      state.pending = null;
    }
  }

  if (state.pending && pendingRead(state.pending) && now >= (state.pending.expiresAt || state.pending.sentAt + 30000)) {
    const key = state.pending.call.name + ':' + (state.pending.call.feature || '');
    const attempts = state.readTimeout?.key === key ? state.readTimeout.attempts + 1 : 1;
    state.pending = null;
    state.readTimeout = { key, attempts };
    state.notice = { at: now, message: `Retrying expired read ${key} (${attempts}/3)` };
    if (attempts >= 3) {
      if (key === 'getDailyQuests:quest' || key === 'user_getNextDayTime:' || key === 'getRallyById:rally') {
        delete state.readTimeout;
        if (key === 'getRallyById:rally' && state.reservation?.type === 'rally') {
          state.reservation = null;
        }
        state.notice = {
          at: now,
          expiresAt: now + 60000,
          message:
            key === 'getRallyById:rally'
              ? 'Rally read timed out; resuming standard gathering rotation'
              : 'Daily quest read timed out; falling back to standard gathering rotation',
        };
      } else {
        state.error = `Read ${key} timed out after 3 attempts; press F5 in the game tab and restart Smart gathering`;
      }
    }
  } else if (state.pending && now - (state.pending.returnAt || state.pending.sentAt) > 120000) {
    const name = state.pending.call.name;
    state.pending = null;
    state.error = `Smart gathering ${name} confirmation timed out; refresh game and restart Smart gathering`;
  }

  return state;
}

export const smartGatherService = {
  list,
  finite,
  fresh,
  order,
  gathering,
  typeOf,
  context,
  returnMs,
  collectedSince,
  activeQueue,
  blockedMineIds,
  rpcFailure,
  recallForRally,
  recallForQueue,
  nearestPlan,
  resumePlan,
  dailyPlan,
  replies,
  sync,
};

export default smartGatherService;
