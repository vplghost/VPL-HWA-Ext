import type {
  RaidQueueOptions,
  RaidQueueState,
  RaidQueueStepResult,
  RaidCurrentTarget,
} from '../../types/game/raidQueue.ts';
import * as expData from '../../utils/experimentalData.ts';

function getDataHelper(): any {
  return expData;
}

export function terminal(state?: RaidQueueState | null): boolean {
  return !state || ['complete', 'stopped'].includes(state.phase);
}

export function rosterCalls(): Array<{ name: string; feature?: string }> {
  return [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }];
}

export const RALLY_ENERGY_COST = 25;

export function safeList<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function stop(state: RaidQueueState, reason: string): RaidQueueState {
  return { ...state, bossQueue: null, phase: 'stopped', reason, wakeAt: null };
}

export function issue(
  state: RaidQueueState,
  phase: RaidQueueState['phase'],
  calls: any[],
  now: number,
  expiresAt: number = now + 120000
): RaidQueueStepResult {
  return {
    state: { ...state, phase, sentAt: now, wakeAt: expiresAt, expected: calls },
    calls,
    expiresAt,
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

export function search(state: RaidQueueState, now: number): RaidQueueStepResult {
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
          mobType: 'rally',
          mobConfigIds: [data.bossConfigId(state.options.level)],
        },
      },
    ],
    now
  );
}

export function nextBoss(
  state: RaidQueueState,
  cache: Record<string, any> | null | undefined,
  now: number
): RaidQueueStepResult {
  const data = getDataHelper();
  const bossQueue = state.bossQueue;
  if (!bossQueue || bossQueue.remain_raid_count === 0) {
    return { state: { ...state, phase: 'complete', wakeAt: null } };
  }
  let currentQueue = bossQueue.queue;
  if (
    currentQueue.length &&
    (!Number.isFinite(state.searchedAt) || now - (state.searchedAt as number) > 300000)
  ) {
    currentQueue = [];
    state.bossQueue = { ...bossQueue, queue: [] };
  }
  if (!currentQueue.length) return search(state, now);
  const energy = energyAt(cache, now);
  if (Number.isFinite(energy) && (energy as number) < RALLY_ENERGY_COST) {
    return {
      state: stop(state, `Not enough World Energy for a rally (need ${RALLY_ENERGY_COST}).`),
    };
  }
  const mobId = currentQueue[0]?.mobId;
  const call = data.buildRallyCall(state.options.mapId, mobId, state.squad, state.options.waitSeconds);
  if (!call) return { state: stop(state, 'No available troops. Refresh the form.') };
  state.current = { mobId: mobId!, mapId: state.options.mapId };
  return issue(state, 'creating', [call], now);
}

export function consumeBoss(state: RaidQueueState, failed: boolean = false): void {
  const mobId = state.current?.mobId;
  const bq = state.bossQueue;
  if (bq) {
    state.bossQueue = {
      ...bq,
      queue: bq.queue.filter((boss) => boss.mobId !== mobId),
      remain_raid_count: bq.remain_raid_count - (failed ? 0 : 1),
    };
  }
  if (failed) {
    state.failedBossIds = [...new Set([...(state.failedBossIds || []), mobId!])];
  } else {
    state.wonBossIds = [...new Set([...(state.wonBossIds || []), mobId!])];
  }
  state.current = null;
}

export function hasActiveRaidPending(cache: Record<string, any> | null | undefined, now: number = Date.now()): boolean {
  const data = getDataHelper();
  const marches: any[] = cache?.marchStatus?.data?.marches || [];
  return marches.some((march: any) => {
    if (!march?.rally) return false;
    if (Number.isFinite(march.endsAt) && now >= march.endsAt) return false;
    if (Number.isFinite(march.rally.returnAt) && now >= march.rally.returnAt) return false;
    if (march.stage === 'returnToOutpost' || march.result) return false;
    const phase = data?.rallyPhase ? data.rallyPhase(march, now) : null;
    if (phase && (phase.phase === 'Returning' || phase.phase === 'Battle complete')) return false;
    return true;
  });
}

export function areHeroesDeployed(summary: any, heroIds: number[]): boolean {
  if (!summary?.squads || !Array.isArray(heroIds)) return false;
  return summary.squads.some((squad: any) =>
    squad.heroes?.some((hero: any) => heroIds.includes(hero.id ?? hero.heroId))
  );
}

export function start(
  options: RaidQueueOptions,
  tabId: number,
  accountId: string | number,
  now: number,
  cache?: Record<string, any> | null,
  settings?: any
): RaidQueueStepResult | null {
  const data = getDataHelper();
  if (
    !accountId ||
    !Number.isInteger(tabId) ||
    !options?.mapId ||
    !Number.isFinite(options.center?.x) ||
    !Number.isFinite(options.center?.y) ||
    !data.bossConfigId(options.level) ||
    !(data.rallyWaitOptions || expData.rallyWaitOptions).includes(options.waitSeconds) ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    !Number.isInteger(options.minMembers) ||
    options.minMembers < 1 ||
    options.minMembers > 6 ||
    (options.autoCancel != null && typeof options.autoCancel !== 'boolean') ||
    (options.maxTroops != null && (!Number.isSafeInteger(options.maxTroops) || (options.maxTroops as number) <= 0)) ||
    options.heroIds?.length !== 5 ||
    new Set(options.heroIds).size !== 5
  ) {
    return null;
  }

  if (options.teamId === 'weakest' && cache) {
    options = {
      ...options,
      heroIds: data.lowestPowerHeroes(
        cache.heroGetAll?.data,
        data.availableHeroIds(
          cache.heroGetAll?.data,
          cache['getUnitSummary:unit']?.data,
          cache.marchStatus?.data?.marches
        )
      ),
    };
    if (options.heroIds.length !== 5) return null;
  }

  const state: RaidQueueState = {
    id: `${now}:${tabId}`,
    tabId,
    accountId,
    options: { ...options, autoCancel: options.autoCancel !== false },
    started: 0,
    completed: 0,
    bossQueue: { remain_raid_count: options.count, queue: [] },
    failedBossIds: [],
    wonBossIds: [],
    phase: 'refreshing',
    current: null,
  };

  if (!cache) return issue(state, 'refreshing', rosterCalls(), now);

  const searchData = cache.experimentalRallySearch?.data;
  const heroes = cache.heroGetAll?.data;
  const summary = cache['getUnitSummary:unit']?.data;
  const isGuildRaidActive = hasActiveRaidPending(cache, now);
  const areDeployed = summary ? areHeroesDeployed(summary, options.heroIds) : false;
  const won = safeList(cache.experimentalDefeatedBosses?.data);
  const mobs = safeList(searchData?.mobs);

  if (!heroes || options.heroIds.some((id) => !heroes[id])) {
    return issue(state, 'refreshing', rosterCalls(), now);
  }

  const searchedAt = Date.parse(cache.experimentalRallySearch?.updatedAt);
  if (
    searchData?.mapId !== options.mapId ||
    !safeList(searchData.mobConfigIds).includes(data.bossConfigId(options.level)) ||
    !mobs.some((mob) => mob?.mobId === options.firstMobId) ||
    won.some((boss) => boss?.mapId === options.mapId && boss?.mobId === options.firstMobId) ||
    !Number.isFinite(searchedAt) ||
    searchedAt > now ||
    now - searchedAt > 300000
  ) {
    if (isGuildRaidActive || areDeployed) {
      return {
        state: { ...state, phase: 'waiting_rally', sentAt: now, wakeAt: now + 5000 },
        calls: [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }],
        expiresAt: now + 15000,
      };
    }
    return issue(state, 'refreshing', rosterCalls(), now);
  }

  state.searchedAt = searchedAt;
  const bosses = mobs.filter(
    (mob) => mob?.mobId && !won.some((item) => item?.mapId === options.mapId && item?.mobId === mob?.mobId)
  );
  const ordered = [
    bosses.find((mob) => mob.mobId === options.firstMobId),
    ...bosses.filter((mob) => mob.mobId !== options.firstMobId),
  ].filter(Boolean);
  const uniqueQueue = [...new Map(ordered.map((mob: any) => [mob.mobId, { mobId: mob.mobId }])).values()];

  if (isGuildRaidActive || areDeployed || !summary) {
    const waitState: RaidQueueState = {
      ...state,
      phase: 'waiting_rally',
      sentAt: now,
      wakeAt: now + 5000,
      bossQueue: state.bossQueue ? { ...state.bossQueue, queue: uniqueQueue } : { remain_raid_count: state.options?.count ?? 1, queue: uniqueQueue },
    };
    return {
      state: waitState,
      calls: [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }],
      expiresAt: now + 15000,
    };
  }

  const cap = data.capacityModel(
    options.heroIds,
    heroes,
    cache.troopCapacityEvidence?.data,
    settings,
    accountId
  ).total;
  const squad = data.buildSquad(
    options.heroIds,
    data.allocateTroops(summary, data.teamTroopCapacity(cap, options.maxTroops))
  );
  if (!squad) return null;

  return nextBoss(
    {
      ...state,
      squad,
      bossQueue: state.bossQueue ? { ...state.bossQueue, queue: uniqueQueue } : { remain_raid_count: Number(state.options?.count || 1), queue: uniqueQueue },
    },
    cache,
    now
  );
}

export function responses(record: any): Array<{ call: any; result: any }> {
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
      result: response.results?.find((result: any) => result.ident === call.ident)?.result,
    }));
  } catch {
    return [];
  }
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

export function advance(
  previous: RaidQueueState,
  record?: any,
  cache?: Record<string, any> | null,
  now: number = Date.now(),
  settings?: any
): RaidQueueStepResult {
  const data = getDataHelper();
  if (terminal(previous)) return { state: previous };
  let state: RaidQueueState = {
    ...previous,
    current: previous.current ? { ...previous.current } : null,
  };
  if (!state.bossQueue) {
    state.bossQueue = {
      remain_raid_count: Math.max(0, (state.options?.count || 0) - (state.completed || 0)),
      queue: state.current?.mobId ? [{ mobId: state.current.mobId }] : [],
    };
  }
  if (cache?.accountStatus?.data?.id != null && String(cache.accountStatus.data.id) !== String(state.accountId)) {
    return { state: stop(state, 'Game account changed.') };
  }

  const fresh = record && Date.parse(record.timestamp) >= (state.sentAt || 0);
  const replies = fresh ? responses(record) : [];

  for (const { call, result } of replies) {
    const error = result?.error || result?.response?.error;
    if (error && state.expected?.some((expected) => sameCall(call, expected))) {
      const detail =
        typeof error === 'string'
          ? error
          : error.message || error.description || error.code || 'Game rejected the request';
      if (call.name === 'createRally' && state.phase === 'creating') {
        if (/energy|stamina|refillable|resource/i.test(JSON.stringify(error))) {
          return { state: stop(state, `Not enough World Energy: ${String(detail).slice(0, 160)}.`) };
        }
        consumeBoss(state, true);
        if (
          /not.?found|not.?exist|expired|unavailable|already.*(?:dead|defeated|killed)|invalid.?mob|mob.*(?:missing|removed)/i.test(
            JSON.stringify(error)
          )
        ) {
          state.bossQueue = { ...state.bossQueue, queue: [] };
          return search(state, now);
        }
        return nextBoss(state, cache, now);
      }
      return { state: stop(state, `${call.name} failed: ${String(detail).slice(0, 160)}. No automatic retry.`) };
    }
  }

  if (state.phase === 'waiting_rally') {
    const isGuildRaidActive = hasActiveRaidPending(cache, now);
    const areDeployed = areHeroesDeployed(cache?.['getUnitSummary:unit']?.data, state.options?.heroIds);
    if (!isGuildRaidActive && !areDeployed) {
      return issue(state, 'refreshing', rosterCalls(), now);
    }
    if (now > (state.sentAt || now) + 3600000) {
      return { state: stop(state, 'Active guild raid wait timed out after 1 hour.') };
    }
    state.wakeAt = now + 5000;
    return {
      state,
      calls: [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }],
      expiresAt: now + 15000,
    };
  }

  if (state.phase === 'refreshing') {
    state.roster = { ...state.roster };
    for (const { call, result } of replies) {
      if (call.name === 'heroGetAll' && result?.response) state.roster.heroes = result.response;
      if (call.name === 'getUnitSummary' && call.feature === 'unit' && result?.response) {
        state.roster.units = result.response;
      }
    }
    if (state.roster.heroes && state.roster.units) {
      if (state.options.teamId === 'weakest') {
        state.options = {
          ...state.options,
          heroIds: data.lowestPowerHeroes(
            state.roster.heroes,
            data.availableHeroIds(state.roster.heroes, state.roster.units, cache?.marchStatus?.data?.marches)
          ),
        };
        if (state.options.heroIds.length !== 5) {
          return { state: stop(state, 'Fewer than five available heroes.') };
        }
      }
      if (
        state.roster.units.squads?.some((squad: any) =>
          squad.heroes?.some((hero: any) => state.options.heroIds.includes(hero.id ?? hero.heroId))
        )
      ) {
        return { state: stop(state, 'Selected heroes are already deployed. Queue stopped.') };
      }
      const cap = data.capacityModel(
        state.options.heroIds,
        state.roster.heroes,
        cache?.troopCapacityEvidence?.data,
        settings || state.options.capacitySettings,
        state.accountId
      ).total;
      const units = data.allocateTroops(state.roster.units, data.teamTroopCapacity(cap, state.options.maxTroops));
      state.squad = data.buildSquad(state.options.heroIds, units);
      if (!state.squad) return { state: stop(state, 'No available troops. Refresh the form.') };
      state.roster = null;
      return nextBoss(state, cache, now);
    }
  }

  if (state.phase === 'searching') {
    const reply = replies.find(
      ({ call, result }) =>
        sameCall(call, state.expected?.[0]) &&
        (Array.isArray(result?.response?.mobs) || (result?.response?.mobs && typeof result.response.mobs === 'object'))
    );
    if (reply) {
      const won = safeList(cache?.experimentalDefeatedBosses?.data);
      const replyMobs = safeList(reply.result?.response?.mobs);
      const targets = replyMobs.filter(
        (mob: any) =>
          mob?.mobId &&
          !state.failedBossIds?.includes(mob.mobId) &&
          !state.wonBossIds?.includes(mob.mobId) &&
          !won.some((item: any) => item?.mapId === state.options.mapId && item?.mobId === mob.mobId)
      );
      const unique = [...new Map(targets.map((mob: any) => [mob.mobId, { mobId: mob.mobId }])).values()];
      const selected = !state.started && unique.find((mob) => mob.mobId === state.options.firstMobId);
      state.bossQueue = {
        ...state.bossQueue,
        queue: selected ? [selected, ...unique.filter((mob) => mob.mobId !== selected.mobId)] : unique,
      };
      state.searchedAt = now;
      if (!state.bossQueue.queue.length) return { state: stop(state, 'No boss found for the selected level.') };
      return nextBoss(state, cache, now);
    }
  }

  if (state.phase === 'creating') {
    const reply = replies.find(
      ({ call, result }) => sameCall(call, state.expected?.[0]) && result?.response?.rally?.rallyId
    );
    if (reply) {
      const response = reply.result.response;
      if (!response.squadId || !Number.isFinite(response.rally.plannedStartTime)) {
        return { state: stop(state, 'Incomplete rally confirmation.') };
      }
      state.started++;
      state.phase = 'active';
      state.expected = [];
      Object.assign(state.current as RaidCurrentTarget, {
        rallyId: response.rally.rallyId,
        squadId: response.squadId,
        waitUntil: response.rally.plannedStartTime,
        members: data.rallyMembers(response.rally),
        membersAt: Date.parse(record.timestamp),
      });
      state.current!.memberChecked = !state.options.autoCancel;
      state.wakeAt = Math.max(now, state.current!.waitUntil! + (state.options.autoCancel ? -20000 : 15000));
      return {
        state,
        calls: [{ name: 'getRallyById', feature: 'rally', args: { rallyId: state.current!.rallyId } }],
      };
    }
  }

  if (['active', 'cancelling'].includes(state.phase)) {
    const current = state.current!;
    for (const { call, result } of replies) {
      const rally = result?.response?.rally;
      if (
        call.name === 'getRallyById' &&
        call.args?.rallyId === current.rallyId &&
        rally?.rallyId === current.rallyId
      ) {
        if (
          Number.isFinite(current.rallyVersion) &&
          Number.isFinite(rally.rallyVersion) &&
          rally.rallyVersion < (current.rallyVersion as number)
        ) {
          continue;
        }
        current.members = data.rallyMembers(rally);
        current.membersAt = Date.parse(record.timestamp);
        if (Number.isFinite(rally.rallyVersion)) current.rallyVersion = rally.rallyVersion;
        const durationMs = rally.route?.durationMs ?? rally.route?.duration;
        if (
          Number.isFinite(rally.route?.startedAt) &&
          Number.isFinite(durationMs) &&
          durationMs >= 0 &&
          rally.route?.to?.object?.objectId === current.mobId
        ) {
          current.waitUntil = rally.route.startedAt;
          current.arrivalAt = rally.route.startedAt + durationMs;
          current.departed = true;
          current.memberChecked = true;
        } else if (!current.departed && Number.isFinite(rally.plannedStartTime)) {
          current.waitUntil = rally.plannedStartTime;
        }
      }
      if (call.name === 'cancelRally' && call.args?.rallyId === current.rallyId && result?.response && !result.error) {
        consumeBoss(state, true);
        return issue(state, 'refreshing', rosterCalls(), now);
      }
      if (
        call.name === 'getMarches' &&
        call.feature === 'march' &&
        current.result === 'win' &&
        Date.parse(record.timestamp) > (current.resultAt || 0) &&
        result?.response?.marches &&
        !Array.isArray(result.response.marches) &&
        typeof result.response.marches === 'object' &&
        Object.values(result.response.marches).every(Array.isArray) &&
        !Object.values(result.response.marches).some((marches: any) =>
          marches.some((march: any) => march.squadId === current.squadId)
        )
      ) {
        current.returned = true;
      }
    }

    if (
      record?.transport === 'websocket' &&
      record.direction === 'received' &&
      record.encoding === 'utf8' &&
      !record.payloadTruncated &&
      fresh
    ) {
      try {
        const event = JSON.parse(record.payload).result;
        if (
          event?.type === 'mobRallyAttackResult' &&
          event.body?.rallyId === current.rallyId &&
          event.body?.squadId === current.squadId
        ) {
          const res = event.body.battleResult?.battleResult;
          if (res === 'lose' || res === 'loss' || res === 'defeat') {
            return { state: stop(state, 'Raid lost. Queue stopped.') };
          }
          if (res === 'win') {
            current.result = 'win';
            current.resultAt = Date.parse(record.timestamp);
            current.memberChecked = true;
          } else {
            return { state: stop(state, 'Unrecognized battle result. Queue stopped.') };
          }
        }
        if (event?.type === 'returnFromMobCompleted' && event.body?.squadId === current.squadId) {
          current.returned = true;
        }
        if (event?.type === 'rallyCancelled' && event.body?.rallyId === current.rallyId) {
          consumeBoss(state, true);
          return issue(state, 'refreshing', rosterCalls(), now);
        }
      } catch {}
    }

    if (current.result === 'win' && current.returned) {
      if (state.phase === 'cancelling') {
        return { state: stop(state, 'Rally finished before cancellation was confirmed. Queue stopped.') };
      }
      state.completed++;
      consumeBoss(state);
      if (state.bossQueue.remain_raid_count === 0) {
        return { state: { ...state, phase: 'complete', wakeAt: null } };
      }
      return issue(state, 'refreshing', rosterCalls(), now);
    }

    if (!record && now >= (state.wakeAt || 0)) {
      if (now > (current.waitUntil || 0) + 3600000) {
        return { state: stop(state, 'No confirmed battle result and return within one hour. Check the game.') };
      }
      if (state.phase === 'cancelling') {
        return { state: stop(state, 'Cancellation was not confirmed before departure. Check the game.') };
      }
      if (state.options.autoCancel && !current.memberChecked && now >= (current.waitUntil || 0) - 10000) {
        current.memberChecked = true;
        if (now >= (current.waitUntil || 0) - 1000) {
          return { state: stop(state, 'Member check deadline missed. Check the game.') };
        }
        if (
          !current.members ||
          (current.membersAt || 0) < (current.waitUntil || 0) - 25000 ||
          current.members.count < state.options.minMembers
        ) {
          return issue(
            state,
            'cancelling',
            [{ name: 'cancelRally', feature: 'rally', args: { rallyId: current.rallyId } }],
            now,
            (current.waitUntil || 0) - 1000
          );
        }
      }
      state.wakeAt = current.memberChecked ? now + 15000 : (current.waitUntil || 0) - 10000;
      return {
        state,
        calls: [
          { name: 'getMarches', feature: 'march' },
          ...(now < (current.waitUntil || 0)
            ? [{ name: 'getRallyById', feature: 'rally', args: { rallyId: current.rallyId } }]
            : []),
        ],
      };
    }
  }

  if (!record && now >= (state.wakeAt || 0)) {
    return { state: stop(state, 'RPC result timed out. No automatic retry.') };
  }

  return { state };
}

export function confirmedWins(state?: RaidQueueState | null): number {
  return (state?.completed || 0) + (state?.current?.result === 'win' ? 1 : 0);
}

export const raidQueueService = {
  start,
  advance,
  terminal,
  stop,
  confirmedWins,
  hasActiveRaidPending,
  areHeroesDeployed,
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperRaidQueue = (globalThis as any).hwaHelperRaidQueue || raidQueueService;
}

export default raidQueueService;
