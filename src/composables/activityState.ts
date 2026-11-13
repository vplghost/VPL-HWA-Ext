import { TOWER_FLOOR_COUNT } from '../utils/towerRules.ts';
import { normalizeArray } from '../utils/troops.ts';

export function observedToday(entry: any, now = Date.now(), nextReset?: number): boolean {
  const time = new Date(entry?.updatedAt).getTime();
  if (!Number.isFinite(time) || time > now) return false;
  if (typeof nextReset === 'number' && Number.isFinite(nextReset)) {
    const upcoming = nextReset > now ? nextReset
      : nextReset + (Math.floor((now - nextReset) / 86400000) + 1) * 86400000;
    return time >= upcoming - 86400000;
  }
  return new Date(time).toDateString() === new Date(now).toDateString();
}

export function towerActivityState(cache: Record<string, any>, now = Date.now()) {
  const entries = [cache.towerStatus, cache.towerSession, cache.magicTower_briefInfo]
    .filter((entry) => observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt));
  if (!entries.length) return { state: 'unknown' as const, detail: 'Waiting for game data' };
  // A new run/snapshot takes precedence over an older completed session.
  const newest = Math.max(...entries.map((entry) => new Date(entry.updatedAt).getTime()));
  const current = entries.filter((entry) => new Date(entry.updatedAt).getTime() === newest)
    .map((entry) => entry.data ?? entry);
  const cleared = current.some((data) => data.isCleared === true || data.completed === true ||
    ['win', 'completed'].includes(data.state) ||
    (Number(data.floorNumber) === TOWER_FLOOR_COUNT && normalizeArray(data.history).some((event: any) => event?.action === 'endBattle' &&
      event.win === true && Number(event.floor) === Number(data.floorNumber) &&
      (!event.at || observedToday({ updatedAt: event.at }, now, cache.questResetStatus?.data?.nextDayAt)) &&
      (event.roomType === 'boss_battle' || data.rooms?.[event.room]?.type === 'boss_battle'))));
  const floor = current.find((data) => data.floorNumber != null)?.floorNumber;
  return {
    state: cleared ? 'done' as const : 'pending' as const,
    detail: cleared ? 'Cleared today' : floor ? `Floor ${floor} / ${TOWER_FLOOR_COUNT}` : 'Ready to enter',
  };
}

export function arenaActivityState(cache: Record<string, any>, grand = false, now = Date.now()) {
  const entry = cache[`resource:refillable:${grand ? 21 : 6}`];
  const amount = observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt) ? entry.data?.amount : null;
  const arena = observedToday(cache.arenaGetAll, now, cache.questResetStatus?.data?.nextDayAt) ? cache.arenaGetAll.data : null;
  const rank = arena?.[grand ? 'grandPlace' : 'arenaPlace'] ?? '—';
  const known = Number.isInteger(amount) && amount >= 0;
  return {
    state: !known ? 'unknown' as const : amount === 0 ? 'done' as const : 'pending' as const,
    detail: known ? `Rank ${rank} · ${amount} battles left today`
      : arena ? `Rank ${rank} · Battles remaining unavailable` : 'Waiting for game data',
  };
}

export function dungeonActivityState(cache: Record<string, any>, now = Date.now(),
  metadata: Record<string, any> = (globalThis as any).hwaHelperTitanMetadata || {}) {
  const entry = cache.dungeonStatus;
  if (!observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt)) return { state: 'unknown' as const, detail: 'Waiting for game data' };
  const dungeon = entry.data || {};
  const detail = `${Number(dungeon.dungeonActivity) || 0} activity points · Floor ${dungeon.floorNumber ?? '—'}`;
  if (dungeon.activeBattle) return { state: 'pending' as const, detail: `${detail} · Battle in progress` };
  const log = dungeon.dailyCombatLog;
  const foughtToday = (log?.date === new Date(now).toDateString() && Number(log.totalBattles) > 0) ||
    (entry.method === 'dungeonEndBattle' && dungeon.lastBattleResult != null);
  const doors = dungeon.currentFloorDoors;
  if (!Array.isArray(doors) || !doors.length) {
    return { state: 'unknown' as const, detail: `${detail} · Waiting for next floor data` };
  }
  const roster = cache.titanGetAll?.data;
  const owned = roster && typeof roster === 'object'
    ? Object.entries(roster).map(([id, titan]: [string, any]) => String(titan?.id ?? id)) : [];
  const states = dungeon.states?.titans || {};
  // Missing HP is not evidence of death. Examine all owned eligible titans,
  // rather than only the currently saved team or preferred automation pool.
  const exhausted = doors.every((door: any) => {
    const type = String(door?.attackerType || '').toLowerCase();
    if (!['water', 'earth', 'fire', 'neutral', 'mixed'].includes(type) || !owned.length) return false;
    if (owned.some((id) => !metadata[id]?.element)) return false;
    const eligible = owned.filter((id) => ['neutral', 'mixed'].includes(type) ||
      String(metadata[id].element).toLowerCase() === type);
    return eligible.length > 0 && eligible.every((id) => {
      const state = states[id];
      return state?.isDead === true || (typeof state?.hp === 'number' && state.hp <= 0);
    });
  });
  return {
    state: foughtToday && exhausted ? 'done' as const : 'pending' as const,
    detail: foughtToday && exhausted ? `${detail} · No surviving titans for the next battle` : detail,
  };
}

export function readyQuestCount(cache: Record<string, any>) {
  const quests = cache.questGetAll?.data ?? cache.quest_getAll?.data;
  return quests && typeof quests === 'object' ? Object.values(quests).filter((quest: any) => Number(quest?.state) === 2).length : 0;
}
