/**
 * Mob & Boss Utilities for Hero Wars: Alliance
 * Provides typed definitions and algorithms for:
 * - Boss configurations and levels (Levels 1 to 30)
 * - Solo Monster configurations and levels (Levels 1 to 30)
 * - Rally phases, countdown timers, and RPC call builders
 */

export const rallyWaitOptions = [60, 300, 900, 1800] as const;

export function bossConfigId(level: number): number | null {
  return Number.isInteger(level) && level >= 1 && level <= 30 ? 59 + level : null;
}

export function bossLevel(configId: number): number | null {
  if (!Number.isInteger(configId)) return null;
  if (configId >= 60 && configId <= 89) return configId - 59;
  return null;
}

export function soloMonsterConfigIds(level: number): number[] | null {
  return Number.isInteger(level) && level >= 1 && level <= 30
    ? [22 + level, (level <= 15 ? 52 : 58) + level]
    : null;
}

export function soloMonsterLevel(configId: number): number | null {
  const id = Number(configId);
  if (id >= 23 && id <= 52) return id - 22;
  if (id >= 53 && id <= 67) return id - 52;
  if (id >= 74 && id <= 88) return id - 58;
  return null;
}

export interface RallyPhaseInfo {
  phase: 'Returning' | 'Battle complete' | 'Waiting' | 'Traveling to boss' | 'Battle / awaiting result';
  until: number | null;
  result: string | null;
}

export function rallyPhase(march: any, now: number = Date.now()): RallyPhaseInfo | null {
  const rally = march?.rally;
  if (!rally) return null;
  if (march.stage === 'returnToOutpost') return { phase: 'Returning', until: rally.returnAt || march.endsAt, result: march.result || null };
  if (march.result) return { phase: 'Battle complete', until: rally.returnAt, result: march.result };
  if (Number.isFinite(rally.waitUntil) && now < rally.waitUntil) return {
    phase: 'Waiting', until: rally.waitUntil, result: null };
  const arrivalAt = rally.arrivalAt ||
    (march.stage === 'moveToTargetInRally' && Number.isFinite(march.endsAt) ? march.endsAt : null) ||
    (Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ?
      rally.waitUntil + rally.outboundMs : null);
  if (Number.isFinite(arrivalAt) && now < arrivalAt) return {
    phase: 'Traveling to boss', until: arrivalAt, result: null };
  return { phase: 'Battle / awaiting result', until: null, result: null };
}

export function buildRallyCall(mapId: string, mobId: string, squad: any, waitSeconds: number) {
  if (
    !mapId ||
    !mobId ||
    !squad ||
    !Number.isInteger(waitSeconds) ||
    !(rallyWaitOptions as readonly number[]).includes(waitSeconds)
  ) {
    return null;
  }
  return {
    name: 'createRally',
    feature: 'mob',
    args: {
      mapId,
      mobId,
      squad,
      startDelay: waitSeconds * 1000,
    },
  };
}

export function rallyMembers(rally: any): { count: number; total: number } | null {
  if (!rally?.leader || !Array.isArray(rally.members) || !Number.isInteger(rally.membersCapacityLeft)) return null;
  const ids = new Set([rally.leader, ...rally.members].map((member: any) => member?.userId).filter((id: any) => id != null).map(String));
  if (!ids.size) return null;
  return { count: ids.size, total: ids.size + rally.membersCapacityLeft };
}

export function buildJoinRallyCall(mapId: string | null | undefined, rallyId: string, squad: any): any {
  if (!rallyId || !squad) return null;
  const args: any = { rallyId, squad };
  if (mapId) args.mapId = mapId;
  return { name: 'joinRally', feature: 'rally', args };
}
