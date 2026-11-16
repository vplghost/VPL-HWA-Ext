import type {
  TowerRunnerState,
  TowerRunnerStepResult,
} from '../../types/game/towerAutomation.ts';
import towerAutomationService, { plan as planTower } from './towerAutomation.ts';

function getPlanner(): any {
  return towerAutomationService;
}

export function terminal(state?: TowerRunnerState | null): boolean {
  return !state || ['complete', 'stopped'].includes(state.phase);
}

export function stop(state: TowerRunnerState, reason: string): TowerRunnerState {
  return { ...state, phase: 'stopped', reason, wakeAt: null };
}

export function issue(
  state: TowerRunnerState,
  phase: TowerRunnerState['phase'],
  call: any,
  now: number
): TowerRunnerStepResult {
  return {
    state: { ...state, phase, expected: call, sentAt: now, wakeAt: now + 120000 },
    calls: [call],
    expiresAt: now + 120000,
  };
}

export function makeEndBattleCall(startRes: any, team?: number[]): any {
  const seed = startRes?.seed;
  const attackers = startRes?.attackers || {};
  const heroList = Array.isArray(team) && team.length ? team : Object.keys(attackers).map(Number);
  const heroes: Record<string | number, any> = {};
  for (const id of heroList) {
    const a = attackers[id] || attackers[String(id)];
    const hp = a?.state?.hp || a?.hp || 100000;
    heroes[id] = {
      isDead: false,
      hp,
      energy: 600,
    };
  }
  return {
    name: 'magicTower_endBattle',
    args: {
      result: { win: true, stars: 3 },
      progress: [
        {
          defenders: { heroes: {}, input: [] },
          attackers: { heroes, input: [] },
          duration: 10.0,
          seed,
        },
      ],
    },
  };
}

export function next(
  state: TowerRunnerState,
  cache: any,
  now: number
): TowerRunnerStepResult {
  const planner = getPlanner();
  const decision = planner.plan
    ? planner.plan(cache, state.buffPriority, Math.random, state.heroes)
    : planTower(cache, state.buffPriority, Math.random, state.heroes);

  if (decision.kind === 'complete') {
    return { state: { ...state, phase: 'complete', wakeAt: null } };
  }
  if (decision.kind === 'stop' || decision.kind === 'need-snapshot') {
    return { state: stop(state, decision.reason || 'Tower snapshot is missing. Open Tower in game.') };
  }
  state.floor = decision.floor;
  state.room = decision.room;
  if (decision.kind === 'battle') {
    return issue(
      state,
      'starting-battle',
      {
        name: 'magicTower_startBattle',
        args: { heroes: decision.team },
      },
      now
    );
  }
  return issue(state, 'acting', decision.call, now);
}

export function start(
  cache: any,
  settings: any,
  tabId: number,
  now: number
): TowerRunnerStepResult | null {
  const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
  if (!accountId || !Number.isInteger(tabId)) return null;
  const session = cache?.towerSession;
  const team =
    Array.isArray(settings?.heroes) &&
    settings.heroes.length === 5 &&
    settings.heroes.every(Number.isInteger)
      ? settings.heroes
      : cache?.teamGetAll?.data?.magicTower;
  if (
    !Array.isArray(team) ||
    team.length !== 5 ||
    team.some((id: any) => !Number.isInteger(id)) ||
    !session ||
    !Number.isFinite(Date.parse(session.updatedAt || '')) ||
    now - Date.parse(session.updatedAt) > 43200000 ||
    cache?.towerStatus?.data?.isCleared ||
    session.data?.completed
  ) {
    return null;
  }
  return next(
    {
      id: `${now}:${tabId}`,
      tabId,
      accountId,
      phase: 'planning',
      buffPriority: Array.isArray(settings?.buffPriority) ? settings.buffPriority : [],
      heroes: team,
      startedAt: now,
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
      result: response.results?.find((item: any) => item.ident === call.ident)?.result,
    }));
  } catch {
    return [];
  }
}

export const sameCall = (a: any, b: any): boolean =>
  a?.name === b?.name && JSON.stringify(a?.args || {}) === JSON.stringify(b?.args || {});

export function advance(
  previous: TowerRunnerState,
  record?: any,
  cache?: any,
  now: number = Date.now()
): TowerRunnerStepResult {
  if (terminal(previous)) return { state: previous };
  const state: TowerRunnerState = { ...previous };
  const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
  if (accountId != null && String(accountId) !== String(state.accountId)) {
    return { state: stop(state, 'Game account changed.') };
  }
  if (!record && now >= (state.wakeAt || 0)) {
    return {
      state: stop(
        state,
        state.phase === 'waiting-battle' || state.phase === 'ending-battle'
          ? 'Tower battle did not finish.'
          : 'Tower RPC timed out. No automatic retry.'
      ),
    };
  }
  if (!record || Date.parse(record.timestamp) < (state.sentAt || 0)) return { state };
  const replies = responses(record);
  if (state.phase === 'waiting-battle' || state.phase === 'ending-battle') {
    const ended = replies.find(({ call }) => call.name === 'magicTower_endBattle');
    if (!ended) return { state };
    if (ended.result?.error || ended.call.args?.result?.win !== true) {
      return { state: stop(state, 'Tower battle was lost or rejected.') };
    }
    const heroes = ended.result?.response?.userHeroStates;
    if (heroes && Object.values(heroes).some((hero: any) => hero?.isDead || hero?.hp <= 0)) {
      return { state: stop(state, 'Tower hero state is missing or a hero died.') };
    }
    return next(state, cache, now);
  }
  const reply = replies.find(({ call }) => sameCall(call, state.expected));
  if (!reply) return { state };
  if (reply.result?.error || reply.result?.response == null) {
    return { state: stop(state, `${state.expected?.name} failed. Queue stopped.`) };
  }
  if (state.phase === 'starting-battle') {
    const endBattleCall = makeEndBattleCall(
      reply.result?.response,
      state.heroes || state.expected?.args?.heroes
    );
    return issue(state, 'ending-battle', endBattleCall, now);
  }
  return next(state, cache, now);
}

export const towerRunnerService = {
  start,
  advance,
  stop,
  terminal,
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperTowerRunner =
    (globalThis as any).hwaHelperTowerRunner || towerRunnerService;
}

export default towerRunnerService;
