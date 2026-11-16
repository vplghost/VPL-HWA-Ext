import type {
  DungeonRunnerState,
  DungeonRunnerStepResult,
} from '../../types/game/dungeonAutomation.ts';
import dungeonAutomationService, { planDungeon } from './dungeonAutomation.ts';

function getPlanner(): any {
  return dungeonAutomationService;
}

export function terminal(state?: DungeonRunnerState | null): boolean {
  return !state || ['complete', 'stopped'].includes(state.phase);
}

export function stop(state: DungeonRunnerState, reason: string, casualty: any = null): DungeonRunnerState {
  return {
    ...state,
    phase: 'stopped',
    statusText: reason,
    reason,
    casualty: casualty || null,
    wakeAt: null,
  };
}

export function issue(
  state: DungeonRunnerState,
  phase: DungeonRunnerState['phase'],
  call: any,
  now: number
): DungeonRunnerStepResult {
  return {
    state: { ...state, phase, expected: call, sentAt: now, wakeAt: now + 120000 },
    calls: [call],
    expiresAt: now + 120000,
  };
}

export function makeEndBattleCall(startRes: any, heroesList: number[] = [], seed?: number): any {
  const heroMap: Record<string, any> = {};
  const list = Array.isArray(heroesList) && heroesList.length ? heroesList : [4000, 4001, 4004, 4002, 4053];
  const attackers = startRes?.attackers || {};

  for (const id of list) {
    const a = attackers[id] || attackers[String(id)];
    const hp = a?.state?.hp || a?.hp || 1000000;
    const energy = a?.state?.energy || a?.energy || 800;
    heroMap[String(id)] = {
      isDead: false,
      hp,
      energy,
    };
  }

  return {
    name: 'dungeonEndBattle',
    args: {
      result: { win: true, stars: 3 },
      progress: [
        {
          defenders: { heroes: {}, input: [] },
          attackers: { heroes: heroMap, input: [] },
          duration: Number((15 + Math.random() * 10).toFixed(4)),
          seed: seed || startRes?.seed || 0,
        },
      ],
    },
  };
}

export function checkCasualtiesInBattle(endCallArgs: any, endRep: any, deployedHeroes: number[]): number[] {
  const casualties: number[] = [];
  const progressHeroes = endCallArgs?.progress?.[0]?.attackers?.heroes || {};

  for (const hId of deployedHeroes) {
    const p = progressHeroes[String(hId)] || progressHeroes[Number(hId)];
    if (p && (p.isDead === true || (typeof p.hp === 'number' && p.hp <= 0))) {
      casualties.push(Number(hId));
    }
  }

  const serverTitans = endRep?.dungeon?.states?.titans || endRep?.states?.titans || {};
  for (const hId of deployedHeroes) {
    const s = serverTitans[String(hId)] || serverTitans[Number(hId)];
    if (s && (s.isDead === true || (typeof s.hp === 'number' && s.hp <= 0))) {
      if (!casualties.includes(Number(hId))) {
        casualties.push(Number(hId));
      }
    }
  }

  return casualties;
}

export function getGateCoordinates(
  doorCount: number,
  teamNum: number
): { ratioX: number; ratioY: number; label: string } {
  if (doorCount <= 1) {
    return { ratioX: 0.5, ratioY: 0.79, label: 'Center Gate' };
  }
  if (teamNum === 0) {
    return { ratioX: 0.34, ratioY: 0.79, label: 'Door 1 (Left Gate)' };
  }
  return { ratioX: 0.69, ratioY: 0.79, label: 'Door 2 (Right Gate)' };
}

export function next(state: DungeonRunnerState, cache: any, now: number): DungeonRunnerStepResult {
  const dungeon = cache?.dungeonStatus?.data;
  if (!dungeon || !Array.isArray(dungeon.currentFloorDoors) || !dungeon.currentFloorDoors.length) {
    return { state: stop(state, 'Dungeon interface is not open in game. Please open Titan Dungeon.') };
  }

  const planner = getPlanner();
  const decision = planner.planDungeon
    ? planner.planDungeon(cache, state.options || {})
    : planDungeon(cache, state.options || {});

  if (decision.kind === 'complete') {
    return { state: { ...state, phase: 'complete', statusText: 'Dungeon cleared.', wakeAt: null } };
  }
  if (decision.kind === 'stop' || decision.kind === 'need-snapshot') {
    return { state: stop(state, decision.reason || 'Dungeon snapshot is missing. Open Dungeon in game.') };
  }
  if (decision.kind === 'busy') {
    return { state: { ...state, statusText: decision.reason, wakeAt: now + 5000 } };
  }

  state.floorNumber = decision.floorNumber;
  state.teamNum = decision.teamNum;
  state.heroes = decision.heroes;
  state.attackerType = decision.attackerType;
  state.door = decision.door;

  return issue(state, 'starting-battle', decision.call, now);
}

export function start(
  cache: any,
  options: any,
  tabId: number,
  now: number
): DungeonRunnerStepResult | null {
  const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
  if (!accountId || !Number.isInteger(tabId)) return null;
  const dungeon = cache?.dungeonStatus?.data;
  if (!dungeon || !Array.isArray(dungeon.currentFloorDoors) || !dungeon.currentFloorDoors.length) {
    return null;
  }
  return next(
    {
      id: `dungeon:${now}:${tabId}`,
      tabId,
      accountId,
      phase: 'planning',
      options: options || {},
      statusText: 'Starting Dungeon automation...',
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
  previous: DungeonRunnerState,
  record?: any,
  cache?: any,
  now: number = Date.now()
): DungeonRunnerStepResult {
  if (terminal(previous)) return { state: previous };
  const state: DungeonRunnerState = { ...previous };
  const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
  if (accountId != null && String(accountId) !== String(state.accountId)) {
    return { state: stop(state, 'Game account changed.') };
  }
  if (!record && now >= (state.wakeAt || 0)) {
    return {
      state: stop(
        state,
        state.phase === 'waiting-battle' || state.phase === 'ending-battle'
          ? 'Dungeon battle did not finish.'
          : 'Dungeon RPC timed out. No automatic retry.'
      ),
    };
  }
  if (!record || Date.parse(record.timestamp) < (state.sentAt || 0)) return { state };
  const replies = responses(record);

  if (state.phase === 'waiting-battle' || state.phase === 'ending-battle') {
    const ended = replies.find(({ call }) => call.name === 'dungeonEndBattle');
    if (!ended) return { state };
    if (ended.result?.error || ended.call.args?.result?.win !== true) {
      return { state: stop(state, 'Dungeon battle was lost or rejected by server.') };
    }
    const casualties = checkCasualtiesInBattle(
      ended.call.args,
      ended.result?.response,
      state.heroes || []
    );
    if (casualties.length > 0 && state.options?.requireIntactLineup) {
      return {
        state: stop(
          state,
          `Titan casualties detected (${casualties.join(', ')}). Automation halted by safe setting.`,
          casualties
        ),
      };
    }
    return next(state, cache, now);
  }

  const reply = replies.find(({ call }) => sameCall(call, state.expected));
  if (!reply) return { state };
  if (reply.result?.error || reply.result?.response == null) {
    return { state: stop(state, `${state.expected?.name} failed. Dungeon stopped.`) };
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

export const dungeonRunnerService = {
  start,
  advance,
  stop,
  terminal,
  makeEndBattleCall,
  checkCasualtiesInBattle,
  getGateCoordinates,
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperDungeonRunner =
    (globalThis as any).hwaHelperDungeonRunner || dungeonRunnerService;
}

export default dungeonRunnerService;
