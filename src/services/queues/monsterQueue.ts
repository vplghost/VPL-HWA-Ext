import type {
  MonsterQueueOptions,
  MonsterQueueState,
  MonsterQueueStepResult,
  MonsterCurrentTarget,
} from '../../types/game/monsterQueue.ts';
import * as expData from '../../utils/experimentalData.ts';

function getDataHelper(): any {
  return (
    (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperExperimentalData) ||
    expData
  );
}

export const MONSTER_ATTACK_COST = 10;

export function terminal(state?: MonsterQueueState | null): boolean {
  return !state || ['complete', 'stopped'].includes(state.phase);
}

export function rosterCalls(): Array<{ name: string; feature?: string }> {
  return [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }];
}

export function safeList<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function stop(state: MonsterQueueState, reason: string): MonsterQueueState {
  return { ...state, phase: 'stopped', reason, wakeAt: null, expected: [] };
}

export function issue(
  state: MonsterQueueState,
  phase: MonsterQueueState['phase'],
  calls: any[],
  now: number
): MonsterQueueStepResult {
  return {
    state: { ...state, phase, expected: calls, sentAt: now, wakeAt: now + 120000 },
    calls,
    expiresAt: now + 120000,
  };
}

export function energyAt(cache: Record<string, any> | null | undefined, now: number): number | undefined {
  const energy = cache?.['resource:world-energy']?.data;
  if (Number.isFinite(energy?.amount)) {
    if (
      Number.isFinite(energy.lastRefillAt) &&
      Number.isFinite(energy.refillEveryMs) &&
      energy.refillEveryMs > 0 &&
      Number.isFinite(energy.cap)
    ) {
      return Math.min(
        energy.cap,
        energy.amount + Math.floor(Math.max(0, now - energy.lastRefillAt) / energy.refillEveryMs)
      );
    }
    return energy.amount;
  }
  return cache?.worldEnergyStatus?.data?.energy;
}

export function sameValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}

export function sameCall(a: any, b: any): boolean {
  return (
    a.name === b.name &&
    (a.feature || '') === (b.feature || '') &&
    sameValue(a.args || {}, b.args || {})
  );
}

export function replies(record: any): Array<{ call: any; result: any }> {
  if (
    record?.method !== 'POST' ||
    record.status !== 200 ||
    record.requestBodyTruncated ||
    record.responseBodyTruncated ||
    record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc'
  ) {
    return [];
  }
  try {
    const request = JSON.parse(record.requestBody);
    const response = JSON.parse(record.responseBody);
    return (request.calls || []).map((call: any) => ({
      call,
      result: response.results?.find((item: any) => item.ident === call.ident)?.result,
    }));
  } catch {
    return [];
  }
}

export function search(state: MonsterQueueState, now: number): MonsterQueueStepResult {
  const data = getDataHelper();
  return issue(
    state,
    'searching',
    [
      {
        name: 'searchMob',
        feature: 'mob',
        args: {
          mapId: state.options.mapId,
          center: state.options.center,
          mobType: 'solo',
          mobConfigIds: data.soloMonsterConfigIds(state.options.level),
        },
      },
    ],
    now
  );
}

export function nextAttack(
  state: MonsterQueueState,
  cache: Record<string, any> | null | undefined,
  now: number
): MonsterQueueStepResult {
  if (state.completed >= state.options.count) {
    return { state: { ...state, phase: 'complete', wakeAt: null, expected: [] } };
  }
  if (!state.targets.length) return search(state, now);
  const energy = energyAt(cache, now);
  if (Number.isFinite(energy) && (energy as number) < MONSTER_ATTACK_COST) {
    return {
      state: stop(state, `Not enough World Energy for a monster attack (need ${MONSTER_ATTACK_COST}).`),
    };
  }
  const target = state.targets[0];
  const squad = state.squad;
  if (!squad) return { state: stop(state, 'No available team or troops.') };
  state.current = {
    mobId: target.mobId,
    mobConfigId: target.mobConfigId || null,
    mapId: state.options.mapId,
  };
  return issue(
    state,
    'attacking',
    [
      {
        name: 'attackMob',
        feature: 'mob',
        args: {
          mapId: state.options.mapId,
          mobId: target.mobId,
          squad,
        },
      },
    ],
    now
  );
}

export function refresh(
  state: MonsterQueueState,
  cache: Record<string, any> | null | undefined,
  now: number,
  settings?: any
): MonsterQueueStepResult {
  const data = getDataHelper();
  const heroes = cache?.heroGetAll?.data;
  const summary = cache?.['getUnitSummary:unit']?.data;
  if (!heroes || !summary) return issue(state, 'refreshing', rosterCalls(), now);
  let heroIds = state.options.heroIds;
  const available = data.availableHeroIds(heroes, summary, cache?.marchStatus?.data?.marches);
  if (state.options.teamId === 'weakest') heroIds = data.lowestPowerHeroes(heroes, available);
  if (heroIds.length !== 5 || heroIds.some((id: number) => !available.includes(id))) {
    return { state: stop(state, 'Selected heroes are deployed or unavailable.') };
  }
  const cap = data.capacityModel(
    heroIds,
    heroes,
    cache?.troopCapacityEvidence?.data,
    settings,
    state.accountId
  ).total;
  state.squad = data.buildSquad(
    heroIds,
    data.allocateTroops(summary, data.teamTroopCapacity(cap, state.options.maxTroops))
  );
  if (!state.squad) return { state: stop(state, 'No available troops. Refresh the game roster.') };
  return nextAttack(state, cache, now);
}

export function start(
  options: MonsterQueueOptions,
  tabId: number,
  accountId: string | number,
  now: number,
  cache?: Record<string, any> | null,
  settings?: any
): MonsterQueueStepResult | null {
  const data = getDataHelper();
  if (
    !accountId ||
    !Number.isInteger(tabId) ||
    !options?.mapId ||
    !Number.isFinite(options.center?.x) ||
    !Number.isFinite(options.center?.y) ||
    !data.soloMonsterConfigIds(options.level) ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    options.heroIds?.length !== 5 ||
    new Set(options.heroIds).size !== 5 ||
    (options.maxTroops != null && (!Number.isSafeInteger(options.maxTroops) || (options.maxTroops as number) <= 0))
  ) {
    return null;
  }
  const searchCache = cache?.experimentalSoloSearch?.data;
  const configs = data.soloMonsterConfigIds(options.level);
  const mobs = safeList(searchCache?.mobs);
  if (
    searchCache?.mapId !== options.mapId ||
    !sameValue(searchCache.mobConfigIds, configs) ||
    !mobs.some((mob: any) => mob?.mobId === options.firstMobId)
  ) {
    return null;
  }
  const state: MonsterQueueState = {
    id: `monster:${now}:${tabId}`,
    tabId,
    accountId,
    options,
    started: 0,
    completed: 0,
    phase: 'refreshing',
    current: null,
    targets: [],
    attackedMobIds: [],
    recentResults: [],
  };
  const first = mobs.find((mob: any) => mob?.mobId === options.firstMobId);
  state.targets = [first, ...mobs.filter((mob: any) => mob?.mobId !== first?.mobId)].filter(
    (mob: any) => typeof mob?.mobId === 'string'
  );
  return refresh(state, cache, now, settings);
}

export function advance(
  previous: MonsterQueueState,
  record?: any,
  cache?: Record<string, any> | null,
  now: number = Date.now(),
  settings?: any
): MonsterQueueStepResult {
  if (terminal(previous)) return { state: previous };
  const state: MonsterQueueState = {
    ...previous,
    current: previous.current ? { ...previous.current } : null,
    targets: [...(previous.targets || [])],
    attackedMobIds: [...(previous.attackedMobIds || [])],
  };
  if (cache?.accountStatus?.data?.id != null && String(cache.accountStatus.data.id) !== String(state.accountId)) {
    return { state: stop(state, 'Game account changed.') };
  }
  const fresh = record && Date.parse(record.timestamp) >= (state.sentAt || 0);
  const respList = fresh ? replies(record) : [];
  for (const { call, result } of respList) {
    if (result?.error && state.expected?.some((expected) => sameCall(call, expected))) {
      return { state: stop(state, `Game rejected ${call.name}. Queue stopped.`) };
    }
  }

  if (state.phase === 'refreshing') {
    if (state.expected?.length) {
      state.roster ||= {};
      for (const { call, result } of respList) {
        if (call.name === 'heroGetAll' && result?.response) state.roster.heroes = result.response;
        if (call.name === 'getUnitSummary' && call.feature === 'unit' && result?.response) {
          state.roster.units = result.response;
        }
      }
      if (state.roster.heroes && state.roster.units) {
        const freshCache = {
          ...cache,
          heroGetAll: { data: state.roster.heroes },
          'getUnitSummary:unit': { data: state.roster.units },
        };
        state.roster = null;
        return refresh(state, freshCache, now, settings);
      }
    }
  } else if (state.phase === 'searching') {
    const match = respList.find(
      ({ call, result }) =>
        sameCall(call, state.expected?.[0]) &&
        (Array.isArray(result?.response?.mobs) || (result?.response?.mobs && typeof result.response.mobs === 'object'))
    );
    if (match) {
      const replyMobs = safeList(match.result?.response?.mobs);
      state.targets = [
        ...new Map(
          replyMobs
            .filter((mob: any) => typeof mob?.mobId === 'string' && !state.attackedMobIds.includes(mob.mobId))
            .map((mob: any) => [mob.mobId, mob])
        ).values(),
      ];
      if (!state.targets.length) return { state: stop(state, 'No new monster found for this level.') };
      return refresh(state, cache, now, settings);
    }
  } else if (state.phase === 'attacking') {
    const match = respList.find(
      ({ call, result }) =>
        sameCall(call, state.expected?.[0]) && result?.response?.squadId && result.response.route
    );
    if (match) {
      const route = match.result.response.route;
      state.current = {
        ...state.current,
        mobId: state.current?.mobId!,
        mapId: state.current?.mapId!,
        squadId: match.result.response.squadId,
        routeId: route.routeId,
        arrivalAt:
          Number.isFinite(route.startedAt) && Number.isFinite(route.durationMs ?? route.duration)
            ? route.startedAt + (route.durationMs ?? route.duration)
            : null,
      };
      state.started++;
      state.phase = 'active';
      state.expected = [];
      state.wakeAt = now + 15000;
      return { state };
    }
  } else if (state.phase === 'active') {
    const current = state.current!;
    if (
      fresh &&
      record.transport === 'websocket' &&
      record.direction === 'received' &&
      record.encoding === 'utf8' &&
      !record.payloadTruncated
    ) {
      try {
        const event = JSON.parse(record.payload)?.result;
        if (
          ['mobSoloAttackResult', 'mobSingleAttackResult'].includes(event?.type) &&
          event.body?.squadId === current.squadId &&
          event.body?.mobId === current.mobId &&
          !current.result
        ) {
          const outcome = event.body.battleResult?.battleResult;
          state.recentResults = [
            {
              mobId: current.mobId,
              mobConfigId: event.body.mobConfigId,
              result: outcome || 'unknown',
              at: Date.parse(record.timestamp),
            },
            ...(state.recentResults || []),
          ].slice(0, 10);
          if (outcome === 'win') {
            current.result = 'win';
            current.resultAt = Date.parse(record.timestamp);
            current.mobConfigId = event.body.mobConfigId;
            const route = event.body.routeToOutpost;
            current.returnAt =
              Number.isFinite(route?.startedAt) && Number.isFinite(route?.durationMs ?? route?.duration)
                ? route.startedAt + (route.durationMs ?? route.duration)
                : null;
          } else {
            return {
              state: stop(
                state,
                outcome === 'lose' || outcome === 'loss' || outcome === 'defeat'
                  ? 'Monster attack lost. Queue stopped.'
                  : 'Unrecognized monster result. Queue stopped.'
              ),
            };
          }
        }
        if (event?.type === 'returnFromMobCompleted' && event.body?.squadId === current.squadId) {
          current.returned = true;
        }
      } catch {}
    }
    for (const { call, result } of respList) {
      if (
        call.name === 'getMarches' &&
        call.feature === 'march' &&
        current.result === 'win' &&
        Date.parse(record.timestamp) > (current.resultAt || 0) &&
        result?.response?.marches &&
        !Array.isArray(result.response.marches) &&
        Object.values(result.response.marches).every(Array.isArray) &&
        !Object.values(result.response.marches).some((marches: any) =>
          marches.some((march: any) => march.squadId === current.squadId)
        )
      ) {
        current.returned = true;
      }
    }
    if (current.result === 'win' && current.returned) {
      state.completed++;
      state.attackedMobIds.push(current.mobId);
      state.targets = state.targets.filter((target: any) => target.mobId !== current.mobId);
      state.current = null;
      if (state.completed >= state.options.count) {
        return { state: { ...state, phase: 'complete', wakeAt: null, expected: [] } };
      }
      return issue(state, 'refreshing', rosterCalls(), now);
    }
    if (!record && now >= (state.wakeAt || 0)) {
      if (now - (state.sentAt || 0) > 3600000) {
        return {
          state: stop(state, 'No confirmed monster result and return within one hour. Check the game.'),
        };
      }
      state.wakeAt = now + 15000;
      return { state, calls: [{ name: 'getMarches', feature: 'march' }] };
    }
  }

  if (!record && now >= (state.wakeAt || 0) && ['refreshing', 'searching', 'attacking'].includes(state.phase)) {
    return { state: stop(state, 'RPC result timed out. No automatic retry.') };
  }

  return { state };
}

export function confirmedWins(state?: MonsterQueueState | null): number {
  return (state?.completed || 0) + (state?.current?.result === 'win' ? 1 : 0);
}

export const monsterQueueService = {
  start,
  advance,
  terminal,
  stop,
  confirmedWins,
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperMonsterQueue = (globalThis as any).hwaHelperMonsterQueue || monsterQueueService;
}

export default monsterQueueService;
