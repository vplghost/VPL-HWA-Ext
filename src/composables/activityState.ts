import { TOWER_FLOOR_COUNT } from '../utils/towerRules.ts';
import { normalizeArray } from '../utils/troops.ts';
import { titanMetadata } from '../data/titanMetadata.ts';
import { guildVersusView } from '../utils/guildVersusView.ts';
import { clanVersusChestThresholds } from '../data/clanVersusData.ts';

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
  const entries = [cache.towerStatus, cache.towerSession, cache.magicTower_briefInfo, cache.magicTower_getAll]
    .filter((entry) => observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt));
  if (!entries.length) return { state: 'unknown' as const, detail: 'Waiting for game data' };
  // A newer reset (e.g. floor < TOWER_FLOOR_COUNT or explicit isCleared=false) beats an older completed session,
  // while a newer briefInfo still at the final floor without rooms preserves an earlier final-boss completion today.
  const newest = Math.max(...entries.map((entry) => new Date(entry.updatedAt).getTime()));
  const current = entries.filter((entry) => new Date(entry.updatedAt).getTime() === newest)
    .map((entry) => entry.data ?? entry);
  const allTodayData = entries.map((entry) => entry.data ?? entry).filter((d) => d && typeof d === 'object');
  const isEntryCleared = (data: any) =>
    data.isCleared === true ||
    data.completed === true ||
    data.isCompleted === true ||
    ['win', 'completed'].includes(data.state) ||
    (Number(data.floorData?.floorNumber ?? data.floorNumber) === TOWER_FLOOR_COUNT &&
      normalizeArray(data.floorData?.rooms ?? data.rooms).some((room: any) => room?.type === 'boss_battle' && room.state === 'room_completed')) ||
    (Number(data.floorNumber) === TOWER_FLOOR_COUNT && normalizeArray(data.history).some((event: any) => event?.action === 'endBattle' &&
      event.win === true && Number(event.floor) === Number(data.floorNumber) &&
      (!event.at || observedToday({ updatedAt: event.at }, now, cache.questResetStatus?.data?.nextDayAt)) &&
      (event.roomType === 'boss_battle' || data.rooms?.[event.room]?.type === 'boss_battle')));
  const newestFloorRaw = current
    .map((data) => data.floorData?.floorNumber ?? data.floorNumber ?? data.floor)
    .find((val) => val != null);
  const newestFloorNum = newestFloorRaw != null && Number.isFinite(Number(newestFloorRaw)) ? Number(newestFloorRaw) : null;
  const newestExplicitlyReset = current.some(
    (data) =>
      data.isCleared === false ||
      data.completed === false ||
      (newestFloorNum != null && newestFloorNum < TOWER_FLOOR_COUNT)
  );
  const cleared =
    current.some(isEntryCleared) ||
    (!newestExplicitlyReset && newestFloorNum === TOWER_FLOOR_COUNT && allTodayData.some(isEntryCleared));
  const floor = [...current, ...allTodayData]
    .map((data) => data.floorData?.floorNumber ?? data.floorNumber ?? data.floor)
    .find((val) => val != null);
  const floorNum = floor != null && Number.isFinite(Number(floor)) ? Number(floor) : null;
  return {
    state: cleared ? 'done' as const : 'pending' as const,
    detail: cleared ? 'Cleared today' : floorNum != null ? `Floor ${floorNum} / ${TOWER_FLOOR_COUNT}` : 'Ready to enter',
  };
}

export function arenaActivityState(cache: Record<string, any>, grand = false, now = Date.now()) {
  const entry = cache[`resource:refillable:${grand ? 21 : 6}`];
  const amount = observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt) ? entry.data?.amount : null;
  const arena = observedToday(cache.arenaGetAll, now, cache.questResetStatus?.data?.nextDayAt) ? cache.arenaGetAll.data : null;
  const rank = arena?.[grand ? 'grandPlace' : 'arenaPlace'] ?? '—';
  const known = Number.isInteger(amount) && amount >= 0;
  const maxFreeTokens = 5;
  const progress = known
    ? Math.min(100, Math.max(0, Math.round(((maxFreeTokens - Math.min(maxFreeTokens, amount)) / maxFreeTokens) * 100)))
    : undefined;
  return {
    state: !known ? 'unknown' as const : amount === 0 ? 'done' as const : 'pending' as const,
    detail: known ? `Rank ${rank} · ${amount}/${maxFreeTokens} free (${amount} battles left today)`
      : arena ? `Rank ${rank} · Battles remaining unavailable` : 'Waiting for game data',
    ...(progress != null ? { progress } : {}),
  };
}

export function dungeonActivityState(cache: Record<string, any>, now = Date.now(),
  metadata: Record<string, any> = titanMetadata) {
  const entry = cache.dungeonStatus;
  if (!observedToday(entry, now, cache.questResetStatus?.data?.nextDayAt)) return { state: 'unknown' as const, detail: 'Waiting for game data' };
  const dungeon = entry.data || {};
  const detail = `${Number(dungeon.dungeonActivity) || 0} activity points · Floor ${dungeon.floorNumber ?? '—'}`;
  if (dungeon.activeBattle) return { state: 'pending' as const, detail: `${detail} · Battle in progress` };
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  const unwinnableToday =
    dungeon.unwinnableDate === todayUtc &&
    dungeon.unwinnableFloor != null &&
    Number(dungeon.unwinnableFloor) === Number(dungeon.floorNumber);
  if (unwinnableToday) {
    return {
      state: 'done' as const,
      detail: `${detail} · No winnable doors left today`,
    };
  }
  const log = dungeon.dailyCombatLog;
  const foughtToday = (log?.date && (log.date === new Date(now).toDateString() || String(log.date) === todayUtc) && Number(log.totalBattles) > 0) ||
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

export function guildVersusActivityState(cache: Record<string, any>, now = Date.now()) {
  const entry = cache.clanVersusStatus;
  if (!entry || !entry.data) {
    return { state: 'unknown' as const, detail: 'Waiting for game data' };
  }
  const view = guildVersusView(cache, now);
  if (view.stale) {
    return {
      state: 'info' as const,
      detail: view.league && view.league !== '—' ? `${view.league} League · Awaiting next round` : 'Awaiting next round',
    };
  }

  const score = view.personalRoundPoints;
  const claimed = view.claimed;
  const isEligible = view.personalEligible === true && view.guildEligible === true;

  let readyCount = 0;
  for (let c = 1; c <= 9; c++) {
    if (!claimed.includes(c)) {
      const target = clanVersusChestThresholds[c];
      if (view.claimsKnown && isEligible && score != null && target != null && score >= target) {
        readyCount++;
      }
    }
  }

  const claimedCount = view.claimedCount ?? 0;
  const currentScore = score ?? 0;

  if (claimedCount >= 9) {
    return {
      state: 'done' as const,
      detail: `All 9 chests claimed · Round ${view.roundNumber ?? 1}`,
      progress: 100,
    };
  }

  // Find next locked chest that user is accumulating points towards
  const unclaimed = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(c => !claimed.includes(c));
  const nextLocked = unclaimed.find(c => currentScore < (clanVersusChestThresholds[c] || 0));

  // If no remaining chest is locked, all unclaimed chests are ready to claim (100% progress)
  if (!nextLocked) {
    return {
      state: 'pending' as const,
      detail: `${readyCount} chest${readyCount > 1 ? 's' : ''} ready to claim · ${claimedCount}/9 claimed`,
      progress: 100,
    };
  }

  const nextChest = nextLocked;
  const targetThreshold = clanVersusChestThresholds[nextChest] || 25000;
  const progress = Math.min(100, Math.max(0, Math.round((currentScore / targetThreshold) * 100)));

  const formatCompact = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(val);
  };

  const scoreDisplay = `${formatCompact(currentScore)} / ${formatCompact(targetThreshold)} pts (Chest ${nextChest})`;

  if (readyCount > 0) {
    return {
      state: 'pending' as const,
      detail: `${readyCount} ready · ${scoreDisplay}`,
      progress,
    };
  }

  return {
    state: (currentScore > 0 ? 'info' : 'pending') as 'info' | 'pending',
    detail: `${scoreDisplay} · ${claimedCount}/9 claimed`,
    progress,
  };
}

export function frontierActivityState(cache: Record<string, any>, now = Date.now()) {
  const statusEntry = cache.eternalStoryStatus;
  const chestEntry = cache.eternalStoryChestStatus;
  const progressEntry = cache.eternalStoryDailyProgress;

  if (!statusEntry && !chestEntry) {
    return { state: 'unknown' as const, detail: 'Waiting for game data' };
  }

  const mission = statusEntry?.data?.mission;
  const chest = chestEntry?.data;
  const progress = progressEntry?.data;
  const isToday = progress?.date === new Date(now).toDateString();
  const todayCleared = isToday ? (Number(progress?.clearedCount) || 0) : 0;

  const stage = mission?.position;
  const world = mission?.world;
  const defenders = mission?.defender_packs?.[0] || [];
  const enemyPower = defenders.reduce((sum: number, d: any) => sum + (Number(d.power) || 0), 0);

  const chestPercent = Number(chest?.filled_in_percents) || 0;
  const chestCoins = Number(chest?.reward?.coin?.['23']) || 0;

  let detail = '';
  if (stage != null) {
    detail = `Stage ${stage}${world ? ` (World ${world})` : ''} · Power: ${enemyPower.toLocaleString()}`;
  } else {
    detail = 'Frontier ready';
  }

  if (todayCleared > 0) {
    detail += ` · Cleared: ${todayCleared} today`;
  }
  if (chestPercent > 0 || chestCoins > 0) {
    detail += ` · Chest: ${chestPercent}% (${chestCoins} coins)`;
  }

  const state = (chestPercent >= 80 || (stage != null && todayCleared === 0)) ? ('pending' as const) : ('info' as const);

  return {
    state,
    detail,
    currentStage: stage,
    world,
    enemyPower,
    todayCleared,
    chestPercent,
    chestCoins,
  };
}
