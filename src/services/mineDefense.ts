import type { HospitalRoomInfo, MineDefensePlan } from '../types/game/mineDefense';
import { getInfirmaryCapacity } from '../data/mineDefenseData.ts';
import { smartGatherService } from './queues/smartGather.ts';
import { experimentalDataHelper } from '../utils/experimentalData.ts';

const list = (value: any): any[] =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

const fresh = (entry: any, now: number): boolean =>
  Number.isFinite(Date.parse(entry?.updatedAt)) &&
  Date.parse(entry.updatedAt) <= now &&
  now - Date.parse(entry.updatedAt) <= 60000;

function distance(a?: { x: number; y: number }, b?: { x: number; y: number }): number {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function estimateTravelMs(
  mineCoords?: { x: number; y: number },
  center?: { x: number; y: number }
): number | null {
  if (
    !mineCoords ||
    !center ||
    !Number.isFinite(mineCoords.x) ||
    !Number.isFinite(mineCoords.y) ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y)
  ) {
    return null;
  }
  const dist = Math.hypot(mineCoords.x - center.x, mineCoords.y - center.y);
  return Math.ceil((dist * 10000) / 15);
}

function buildSquadCall(
  cache: Record<string, any>,
  stored: Record<string, any> | undefined,
  mapId: string,
  mineId: number | string,
  heroIds: number[]
) {
  if (!heroIds || !heroIds.length) return null;
  const summary = cache['getUnitSummary:unit']?.data;
  if (!summary) return null;
  const availSummary = Array.isArray(summary?.available) ? summary : { available: list(summary?.units) };
  const heroes = cache.heroGetAll?.data || {};
  const model = experimentalDataHelper.capacityModel(
    heroIds,
    heroes,
    cache?.troopCapacityEvidence?.data,
    experimentalDataHelper.normalizeCapacitySettings(stored?.troopCapacitySettings),
    cache?.accountStatus?.data?.id ?? undefined
  );
  const capacity = model.total;
  if (!capacity || capacity <= 0) return null;
  const troops = experimentalDataHelper.allocateTroops(availSummary, capacity);
  const squad = experimentalDataHelper.buildSquad(heroIds, troops);
  if (!squad) return null;
  return experimentalDataHelper.buildGatherCall(mapId, String(mineId), squad);
}

export function hospital(cache: Record<string, any>, now: number): HospitalRoomInfo | null {
  const buildings = cache.buildingStatus;
  const healing = cache['getHealing:unit'];
  if (
    !fresh(buildings, now) ||
    !fresh(healing, now) ||
    !Array.isArray(buildings.data?.buildings) ||
    !Array.isArray(healing.data?.injuredUnits)
  ) {
    return null;
  }
  let capacity = 0;
  let wounded = 0;
  for (const row of buildings.data.buildings) {
    if (![162, 174, 175].includes(row.buildingId)) continue;
    const value = getInfirmaryCapacity(row.buildingId, row.level);
    if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
    capacity += value as number;
  }
  for (const unit of healing.data.injuredUnits) {
    if (!Number.isSafeInteger(unit.count) || unit.count < 0) return null;
    wounded += unit.count;
  }
  return { capacity, wounded, free: Math.max(0, capacity - wounded) };
}

export function unsafeMineIds(
  cache: Record<string, any>,
  state: Record<string, any>,
  now: number
): Set<number> {
  const unsafe = new Set<number>(
    list(cache.incomingMineAttacks?.data?.attacks)
      .filter((a: any) => a.impactAt > now)
      .map((a: any) => a.mineId)
  );
  for (const mine of list(state?.interrupted).filter((m: any) => m.defense)) {
    const observed = cache.mineMap?.[mine.mineId];
    if (
      now < mine.resumeAfter ||
      !observed ||
      !fresh({ updatedAt: observed.observedAt }, now) ||
      Date.parse(observed.observedAt) < mine.resumeAfter ||
      !Object.hasOwn(observed, 'gatheringUserId') ||
      observed.gatheringUserId != null
    ) {
      unsafe.add(mine.mineId);
    }
  }
  return unsafe;
}

export function plan(
  cache: Record<string, any>,
  state: Record<string, any>,
  now: number,
  settings?: Record<string, any>,
  stored?: Record<string, any>
): MineDefensePlan | null {
  if (settings?.defenseRecallEnabled === false) return null;
  const thresholdPercent = Number.isFinite(settings?.defenseInfirmaryThreshold)
    ? Number(settings?.defenseInfirmaryThreshold)
    : 50;
  const interceptTeamId = settings?.interceptTeamId || null;

  const smart = smartGatherService;

  // Check if there is an active intercept underway
  const activeIntercept = state?.intercept;
  if (activeIntercept) {
    if (activeIntercept.phase === 'clearing_slot') {
      const isAttackActive = Boolean(
        cache.incomingMineAttacks?.data?.attacks?.[activeIntercept.attackRouteId]
      );
      if (!isAttackActive && now < activeIntercept.impactAt) {
        return {
          action: 'wait',
          reason: 'Enemy attack aborted while clearing slot · intercept cancelled',
          intercept: null,
        };
      }
      const currentMarches = list(cache.marchStatus?.data?.marches);
      const maxMarches =
        settings && Number.isInteger(settings.maxMarches)
          ? Number(settings.maxMarches)
          : cache.marchStatus?.data?.maxCount || 3;
      const isSlotFree = currentMarches.length < maxMarches;

      const center =
        cache.experimentalMineSearch?.data?.center ||
        cache.experimentalMapContext?.data?.center ||
        smart?.context?.(cache)?.center;
      const mineCoords = activeIntercept.coordinates || cache.mineMap?.[activeIntercept.mineId]?.coordinates;
      const travelMs = estimateTravelMs(mineCoords, center);
      const minTimeNeeded = travelMs != null ? travelMs + 3000 : 3000;
      const timeLeft = activeIntercept.impactAt - now;

      if (isSlotFree) {
        if (timeLeft < minTimeNeeded) {
          const stopCall = {
            name: 'stopMineGathering',
            feature: 'mine',
            args: { squadId: activeIntercept.threatenedSquadId },
          };
          return {
            action: 'recall',
            reason: 'Insufficient time for intercept squad to arrive before impact · withdrawing threatened gatherer',
            call: stopCall,
            intercept: null,
            mine: {
              mineId: activeIntercept.mineId,
              mapId: activeIntercept.mapId,
              configId: activeIntercept.mineConfigId,
              coordinates: activeIntercept.coordinates,
              resumeAfter: activeIntercept.impactAt + 1000,
              defense: true,
            },
          };
        }

        const stopCall = {
          name: 'stopMineGathering',
          feature: 'mine',
          args: { squadId: activeIntercept.threatenedSquadId },
        };
        const rawCustom = stored?.customTeams?.[String(cache.accountStatus?.data?.id)] ?? stored?.customTeams ?? cache?.customTeams ?? [];
        const customTeams = Array.isArray(rawCustom) ? rawCustom : typeof rawCustom === 'object' ? Object.values(rawCustom).flat() : [];
        const team = customTeams.find((t: any) => String(t?.id) === String(interceptTeamId));
        const interceptHeroIds = team?.heroIds || [];
        const interceptCall = buildSquadCall(
          cache,
          stored,
          activeIntercept.mapId,
          activeIntercept.mineId,
          interceptHeroIds
        );
        const summary = cache['getUnitSummary:unit'];
        const squad = list(summary?.data?.squads).find(
          (s: any) => (s.squadId ?? s.id) === activeIntercept.threatenedSquadId
        );
        const farmingHeroIds =
          activeIntercept.farmingHeroIds ||
          squad?.heroes?.map((h: any) => h.id || h) || [];

        activeIntercept.phase = 'intercepting';
        activeIntercept.farmingHeroIds = farmingHeroIds;
        const calls = [stopCall, interceptCall].filter(Boolean);
        return {
          action: 'intercept',
          reason: 'Intercepting mine attack · Recalling gatherer and dispatching combat team',
          call: stopCall,
          calls,
          intercept: activeIntercept,
          mine: {
            mineId: activeIntercept.mineId,
            mapId: activeIntercept.mapId,
            configId: activeIntercept.mineConfigId,
            coordinates: activeIntercept.coordinates,
            resumeAfter: activeIntercept.impactAt + 1000,
            defense: true,
          },
        };
      } else {
        if (timeLeft < minTimeNeeded) {
          const stopCall = {
            name: 'stopMineGathering',
            feature: 'mine',
            args: { squadId: activeIntercept.threatenedSquadId },
          };
          return {
            action: 'recall',
            reason: 'Insufficient time for freed slot to open before impact · withdrawing threatened gatherer',
            call: stopCall,
            intercept: null,
            mine: {
              mineId: activeIntercept.mineId,
              mapId: activeIntercept.mapId,
              configId: activeIntercept.mineConfigId,
              coordinates: activeIntercept.coordinates,
              resumeAfter: activeIntercept.impactAt + 1000,
              defense: true,
            },
          };
        }
        return {
          action: 'wait',
          reason: 'Awaiting freed gathering squad return to open march slot for intercept',
          wakeAt: Math.min(now + 2000, activeIntercept.impactAt - minTimeNeeded),
          intercept: activeIntercept,
        };
      }
    }

    if (activeIntercept.phase === 'intercepting') {
      const isAttackActive = Boolean(
        cache.incomingMineAttacks?.data?.attacks?.[activeIntercept.attackRouteId]
      );
      if (!isAttackActive && now < activeIntercept.impactAt) {
        // Enemy retreated before impact -> wait 5s then switch back
        activeIntercept.phase = 'awaiting_switch';
        activeIntercept.enemyAborted = true;
        activeIntercept.switchBackAt = now + 5000;
        return {
          action: 'wait',
          reason: 'Enemy attack aborted · waiting 5s before switching squads back',
          wakeAt: activeIntercept.switchBackAt,
          intercept: activeIntercept,
        };
      }
      if (now >= activeIntercept.impactAt) {
        activeIntercept.phase = 'awaiting_switch';
        activeIntercept.switchBackAt = now;
      } else {
        return {
          action: 'wait',
          reason: 'Intercept squad holding mine · awaiting enemy attack impact',
          wakeAt: activeIntercept.impactAt,
          intercept: activeIntercept,
        };
      }
    }

    if (activeIntercept.phase === 'awaiting_switch') {
      if (activeIntercept.switchBackAt && now < activeIntercept.switchBackAt) {
        return {
          action: 'wait',
          reason: activeIntercept.enemyAborted
            ? 'Enemy attack aborted · waiting 5s cooldown before switching squads back'
            : 'Mine attack arrived · awaiting battle resolution before switching squads back',
          wakeAt: activeIntercept.switchBackAt,
          intercept: activeIntercept,
        };
      }

      // Time to switch squads back!
      // 1. Intercept squad returns to base
      const currentMarches = list(cache.marchStatus?.data?.marches);
      const interceptMarch = currentMarches.find(
        (m: any) =>
          m.mineId === activeIntercept.mineId &&
          (activeIntercept.interceptSquadId
            ? m.squadId === activeIntercept.interceptSquadId
            : m.squadId !== activeIntercept.threatenedSquadId)
      );
      const interceptSquadId = activeIntercept.interceptSquadId || interceptMarch?.squadId;
      const stopCall = interceptSquadId
        ? {
            name: 'stopMineGathering',
            feature: 'mine',
            args: { squadId: interceptSquadId },
          }
        : null;

      // 2. Farming squad redeploys to mine
      const farmingHeroIds = activeIntercept.farmingHeroIds || [];
      const gatherCall = buildSquadCall(
        cache,
        stored,
        activeIntercept.mapId,
        activeIntercept.mineId,
        farmingHeroIds
      );

      const calls = [stopCall, gatherCall].filter(Boolean);
      return {
        action: 'switch_back',
        reason: activeIntercept.enemyAborted
          ? 'Enemy retreated · switching squads back after 5s cooldown'
          : 'Attack resolved · switching squads back to gathering',
        calls,
        call: stopCall || gatherCall,
        intercept: activeIntercept,
      };
    }
  }

  const account = cache.accountStatus?.data?.id;
  const data = cache.incomingMineAttacks?.data;
  if (account == null || String(data?.accountId) !== String(account)) return null;

  const rows = list(data.attacks)
    .filter((a: any) => a.attackerId !== String(account) && a.impactAt > now)
    .sort((a: any, b: any) => a.impactAt - b.impactAt);

  for (const attack of rows) {
    const march = list(cache.marchStatus?.data?.marches).find(
      (m: any) =>
        smart?.gathering?.(m) &&
        m.mineId === attack.mineId &&
        (m.mapId || smart?.context?.(cache)?.mapId) === attack.mapId
    );
    if (!march || state?.attempted?.includes(attack.routeId + ':' + march.squadId)) continue;

    const base = {
      attack,
      march,
      wakeAt:
        now < attack.impactAt - 10000
          ? attack.impactAt - 10000
          : Math.min(now + 1000, attack.impactAt),
    };
    const room = hospital(cache, now);
    const summary = cache['getUnitSummary:unit'];
    if (!room || room.capacity <= 0 || !fresh(cache.marchStatus, now) || !fresh(summary, now)) {
      return {
        ...base,
        action: 'refresh',
        reason: 'Refreshing hospital and threatened gathering squad',
      };
    }
    const squad = list(summary.data?.squads).find(
      (s: any) => (s.squadId ?? s.id) === march.squadId
    );
    const units = squad?.units;
    if (!Array.isArray(units) || !units.length) {
      return { ...base, action: 'refresh', reason: 'Threatened squad troops unavailable' };
    }
    let count = 0;
    for (const unit of units) {
      const n = unit.state?.survived ?? unit.count;
      if (!Number.isSafeInteger(n) || n < 0) {
        return {
          ...base,
          action: 'refresh',
          reason: 'Threatened squad troop count unknown',
        };
      }
      count += n;
    }
    const isAboveThreshold = room.wounded > room.capacity * (thresholdPercent / 100);

    // If wounded troops are within threshold (safe infirmary space) but no intercept team is configured,
    // we don't need to recall or intercept; gatherers can continue mining safely.
    if (!isAboveThreshold && !interceptTeamId) {
      continue;
    }

    const configId = march.mineConfigId ?? cache.mineMap?.[march.mineId]?.mineConfigId;
    if (!configId) {
      return {
        ...base,
        action: 'refresh',
        reason: 'Threatened mine configuration unavailable',
      };
    }

    // Branch 1: Infirmary is above threshold -> Recall gatherers in final 10s (no intercept)
    if (isAboveThreshold) {
      if (now < attack.impactAt - 10000) {
        return {
          ...base,
          action: 'wait',
          reason: `Mine threatened · recall scheduled for final 10s (infirmary above ${thresholdPercent}%)`,
          room,
          count,
        };
      }
      return {
        ...base,
        action: 'recall',
        reason: `Withdrawing threatened gatherers · Infirmary occupancy above ${thresholdPercent}%`,
        call: {
          name: 'stopMineGathering',
          feature: 'mine',
          args: { squadId: march.squadId },
        },
        mine: {
          mineId: march.mineId,
          mapId: attack.mapId,
          configId,
          coordinates: march.targetCoordinates,
          resumeAfter: attack.impactAt + 1000,
          defense: true,
        },
        room,
        count,
      };
    }

    // Branch 2: Intercept branch (!isAboveThreshold && interceptTeamId)
    // Prioritized immediately upon attack signal (regardless of whether attack is > 2 minutes away)
    const center =
      cache.experimentalMineSearch?.data?.center ||
      cache.experimentalMapContext?.data?.center ||
      smart?.context?.(cache)?.center;
    const mineCoords = march.targetCoordinates || cache.mineMap?.[march.mineId]?.coordinates;
    const travelMs = estimateTravelMs(mineCoords, center);
    const minTimeNeeded = travelMs != null ? travelMs + 3000 : 3000;
    const timeLeft = attack.impactAt - now;

    if (timeLeft < minTimeNeeded) {
      // Remaining time is too short for intercept squad to travel to mine before impact
      return {
        ...base,
        action: 'recall',
        reason: 'Insufficient time for intercept squad to reach mine before impact · Withdrawing gatherer to base',
        call: {
          name: 'stopMineGathering',
          feature: 'mine',
          args: { squadId: march.squadId },
        },
        mine: {
          mineId: march.mineId,
          mapId: attack.mapId,
          configId,
          coordinates: march.targetCoordinates,
          resumeAfter: attack.impactAt + 1000,
          defense: true,
        },
        room,
        count,
      };
    }

    const maxMarches =
      settings && Number.isInteger(settings.maxMarches)
        ? Number(settings.maxMarches)
        : cache.marchStatus?.data?.maxCount || 3;
    const currentMarches = list(cache.marchStatus?.data?.marches);
    const availableSlots = Math.max(0, maxMarches - currentMarches.length);

    if (availableSlots === 0) {
      // Slots full: Prioritize opening a slot immediately by recalling nearest gathering squad
      const otherGatherers = currentMarches.filter(
        (m: any) =>
          smart?.gathering?.(m) &&
          m.squadId !== march.squadId &&
          m.mineId !== attack.mineId
      );
      if (otherGatherers.length > 0) {
        if (center) {
          otherGatherers.sort(
            (a: any, b: any) =>
              distance(a.targetCoordinates, center) - distance(b.targetCoordinates, center)
          );
        }
        const nearest = otherGatherers[0];
        return {
          ...base,
          action: 'clear_slot',
          reason: 'Clearing march slot for intercept · Recalling nearest gathering squad',
          call: {
            name: 'stopMineGathering',
            feature: 'mine',
            args: { squadId: nearest.squadId },
          },
          intercept: {
            phase: 'clearing_slot',
            mineId: attack.mineId,
            mapId: attack.mapId,
            mineConfigId: configId,
            attackRouteId: attack.routeId,
            impactAt: attack.impactAt,
            threatenedSquadId: march.squadId,
            freedSquadId: nearest.squadId,
            coordinates: march.targetCoordinates,
          },
          room,
          count,
        };
      }
    }

    // Slot is available: swap squads immediately if time permits!
    const stopCall = {
      name: 'stopMineGathering',
      feature: 'mine',
      args: { squadId: march.squadId },
    };

    const rawCustom = stored?.customTeams?.[String(account)] ?? stored?.customTeams ?? cache?.customTeams ?? [];
    const customTeams = Array.isArray(rawCustom) ? rawCustom : typeof rawCustom === 'object' ? Object.values(rawCustom).flat() : [];
    const team = customTeams.find((t: any) => String(t?.id) === String(interceptTeamId));
    const interceptHeroIds = team?.heroIds || [];
    const interceptCall = buildSquadCall(
      cache,
      stored,
      attack.mapId,
      attack.mineId,
      interceptHeroIds
    );

    const farmingHeroIds =
      squad?.heroes?.map((h: any) => h.id || h) || march.heroIds || [];

    const calls = [stopCall, interceptCall].filter(Boolean);
    return {
      ...base,
      action: 'intercept',
      reason: 'Intercepting mine attack · Recalling gatherer and dispatching combat team',
      call: stopCall,
      calls,
      intercept: {
        phase: 'intercepting',
        mineId: attack.mineId,
        mapId: attack.mapId,
        mineConfigId: configId,
        attackRouteId: attack.routeId,
        impactAt: attack.impactAt,
        threatenedSquadId: march.squadId,
        farmingHeroIds,
        coordinates: march.targetCoordinates,
      },
      mine: {
        mineId: march.mineId,
        mapId: attack.mapId,
        configId,
        coordinates: march.targetCoordinates,
        resumeAfter: attack.impactAt + 1000,
        defense: true,
      },
      room,
      count,
    };
  }
  return null;
}

export function sync(
  state: Record<string, any>,
  record: any,
  cache: Record<string, any>,
  now: number
): Record<string, any> {
  const defense = state.defense || { attempted: [] };
  const smart = smartGatherService;
  const process = (pending: any) => {
    if (!pending || !smart) return null;
    const child = smart.sync(
      { accountId: state.accountId, pending, interrupted: [] },
      record,
      cache,
      now
    );
    if (child.error) defense.status = child.error;
    state.interrupted = [
      ...list(state.interrupted),
      ...list(child.interrupted).filter(
        (m: any) => !list(state.interrupted).some((old: any) => old.mineId === m.mineId)
      ),
    ].slice(-20);
    return child.pending || null;
  };
  defense.pending = process(defense.pending);
  defense.waiting = list(defense.waiting).map(process).filter(Boolean);

  // Sync intercept lifecycle
  if (defense.intercept && record) {
    try {
      const resp = typeof record.responseBody === 'string' ? JSON.parse(record.responseBody) : record.response;
      const results = resp?.results || (resp?.result ? [resp] : []);
      for (const res of results) {
        const payload = res?.result?.response;
        if (payload?.squadId) {
          if (defense.intercept.phase === 'clearing_slot' && payload.squadId === defense.intercept.freedSquadId) {
            defense.intercept.phase = 'swapping';
          } else if (defense.intercept.phase === 'intercepting' && !defense.intercept.interceptSquadId) {
            defense.intercept.interceptSquadId = payload.squadId;
          }
        }
      }
    } catch (_) {}
  }

  state.defense = defense;
  return state;
}

export const mineDefenseService = {
  hospital,
  unsafeMineIds,
  plan,
  sync,
  estimateTravelMs,
};
