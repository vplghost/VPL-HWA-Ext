import type {
  DungeonDoorEvaluation,
  DungeonDoorSelectionResult,
  DungeonPlanResult,
} from '../../types/game/dungeonAutomation.ts';
import { titanMetadata, getTitanRole } from '../../data/titanMetadata.ts';
import { observedToday } from '../../composables/activityState.ts';
import { isTitanEligibleForDoor } from '../../utils/dungeonBattleSim.ts';
import {
  DEFAULT_ORDERED_TITAN_POOLS,
  normalizeDungeonElementKey,
  type DungeonElementKey,
  type DungeonOrderedPools,
} from '../dungeonPlanner.ts';

export const DEFAULT_DOOR_PRIORITY: string[] = ['prime', 'water', 'mixed', 'neutral', 'earth', 'fire'];
export const DEFAULT_ATTACKER_PRIORITY: string[] = ['water', 'mixed', 'neutral', 'earth', 'fire'];

export const DEFAULT_TITAN_POOLS: Record<string, number[]> = {
  water: [...DEFAULT_ORDERED_TITAN_POOLS.water],
  earth: [...DEFAULT_ORDERED_TITAN_POOLS.earth],
  fire: [...DEFAULT_ORDERED_TITAN_POOLS.fire],
  neutral: [...DEFAULT_ORDERED_TITAN_POOLS.neutral],
  mixed: [...DEFAULT_ORDERED_TITAN_POOLS.neutral],
};

export const FALLBACK_LINEUPS: Record<string, number[]> = {
  water: [4000, 4001, 4052, 4004, 4002],
  earth: [4020, 4022, 4024, 4023, 4021],
  fire: [4010, 4011, 4013, 4012],
  neutral: [4000, 4001, 4004, 4002, 4053],
  mixed: [4000, 4001, 4004, 4002, 4053],
};

export function isTitanAlive(titanState: any): boolean {
  if (!titanState) return true;
  if (titanState.isDead === true) return false;
  if (typeof titanState.hp === 'number' && titanState.hp <= 0) return false;
  return true;
}

/**
 * Resolves the effective in-dungeon status for titans, handling daily rest reset.
 * At the start of a new day, all titans are restored to full HP (100%), energy 0, and alive (isDead: false).
 */
export function getEffectiveTitanStates(
  cache: any,
  now = Date.now()
): Record<string, { hp: number; maxHp: number; energy: number; isDead: boolean }> {
  const dungeonEntry = cache?.dungeonStatus;
  const dungeonData = dungeonEntry?.data || cache?.dungeonGetInfo?.data || {};
  const nextReset = cache?.questResetStatus?.data?.nextDayAt;
  const hasUpdatedAt = Boolean(dungeonEntry?.updatedAt);
  const isToday = hasUpdatedAt ? observedToday(dungeonEntry, now, nextReset) : true;

  const roster = cache?.titanGetAll?.data || {};
  const states = dungeonData?.states?.titans || {};
  const effective: Record<string, { hp: number; maxHp: number; energy: number; isDead: boolean }> = {};

  const allIds = new Set<string>([...Object.keys(states), ...Object.keys(roster)]);

  for (const id of allIds) {
    const rosterTitan = roster[id];
    const rawState = states[id];
    const maxHp = Number(rawState?.maxHp) || Number(rosterTitan?.hp) || 1000000;

    if (!isToday) {
      // Start of a new day: all titans are fully healed, energy reset to 0, alive
      effective[id] = {
        hp: maxHp,
        maxHp,
        energy: 0,
        isDead: false,
      };
    } else {
      // Current day
      if (rawState) {
        const hp = Math.max(0, rawState.hp != null ? Number(rawState.hp) : maxHp);
        const energy = Math.max(0, Number(rawState.energy) || 0);
        const isDead = rawState.isDead === true || hp <= 0;
        effective[id] = {
          hp,
          maxHp,
          energy,
          isDead,
        };
      } else {
        // Not yet deployed today -> fresh at 100% HP, 0 energy, alive
        effective[id] = {
          hp: maxHp,
          maxHp,
          energy: 0,
          isDead: false,
        };
      }
    }
  }

  return effective;
}

export function getPoolForType(type: string, cache: any, customPools: any = {}): number[] {
  const raw = String(type || '').toLowerCase().trim();
  const norm = raw === 'mixed' ? 'neutral' : raw;

  if (Array.isArray(customPools?.[raw]) && customPools[raw].length > 0) {
    return customPools[raw].map(Number);
  }
  if (Array.isArray(customPools?.[norm]) && customPools[norm].length > 0) {
    return customPools[norm].map(Number);
  }

  const savedTeams = cache?.teamGetAll?.data || {};
  const teamKey = `dungeon_${norm}`;
  if (Array.isArray(savedTeams[teamKey]) && savedTeams[teamKey].length > 0) {
    return savedTeams[teamKey].map(Number);
  }
  const rawTeamKey = `dungeon_${raw}`;
  if (Array.isArray(savedTeams[rawTeamKey]) && savedTeams[rawTeamKey].length > 0) {
    return savedTeams[rawTeamKey].map(Number);
  }

  if (DEFAULT_TITAN_POOLS[norm]) {
    return [...DEFAULT_TITAN_POOLS[norm]!];
  }

  const meta = titanMetadata;
  const elemental = Object.entries(meta)
    .filter(([_, data]: [string, any]) => data?.element?.toLowerCase() === norm)
    .map(([id]) => Number(id));
  return elemental.length ? elemental : [...DEFAULT_TITAN_POOLS.neutral!];
}

export function pickLineupFromPool(
  type: string,
  titanStates: Record<string | number, any> = {},
  cache: any = null,
  options: any = {}
): {
  pool: number[];
  selectedHeroes: number[];
  aliveTitans: number[];
  deadTitans: number[];
  deadCount: number;
  aliveCount: number;
  canAttack: boolean;
  isIntact: boolean;
} {
  const pool = getPoolForType(type, cache, options.pools || options.lineups);
  const deadTitans: number[] = [];
  const aliveTitans: number[] = [];

  for (const id of pool) {
    const st = titanStates?.[String(id)] || titanStates?.[Number(id)];
    if (!isTitanAlive(st)) {
      deadTitans.push(Number(id));
    } else {
      aliveTitans.push(Number(id));
    }
  }

  const selectedHeroes = aliveTitans.slice(0, 5);

  return {
    pool,
    selectedHeroes,
    aliveTitans,
    deadTitans,
    deadCount: deadTitans.length,
    aliveCount: aliveTitans.length,
    canAttack: selectedHeroes.length > 0,
    isIntact: deadTitans.length === 0,
  };
}

export function getLineupForDoor(door: any, cache: any, customLineups: any = {}): number[] {
  const type = String(door?.attackerType || '').toLowerCase();
  const titanStates = getEffectiveTitanStates(cache);
  const lineupInfo = pickLineupFromPool(type, titanStates, cache, { lineups: customLineups });
  if (lineupInfo.selectedHeroes.length > 0) {
    return lineupInfo.selectedHeroes;
  }
  if (FALLBACK_LINEUPS[type]) {
    return [...FALLBACK_LINEUPS[type]!];
  }
  return [4000, 4001, 4004, 4002, 4053];
}

export function checkLineupIntactness(
  heroes: number[],
  titanStates: Record<string | number, any> = {}
): {
  isIntact: boolean;
  casualties: boolean;
  aliveCount: number;
  totalCount: number;
  deadTitans: number[];
  aliveTitans: number[];
} {
  const list = Array.isArray(heroes) ? heroes.map(Number) : [];
  if (!list.length) {
    return {
      isIntact: false,
      casualties: true,
      aliveCount: 0,
      totalCount: 0,
      deadTitans: [],
      aliveTitans: [],
    };
  }
  const deadTitans: number[] = [];
  const aliveTitans: number[] = [];
  for (const id of list) {
    const st = titanStates?.[String(id)] || titanStates?.[Number(id)];
    if (!isTitanAlive(st)) {
      deadTitans.push(id);
    } else {
      aliveTitans.push(id);
    }
  }
  const isIntact = deadTitans.length === 0;
  return {
    isIntact,
    casualties: !isIntact,
    aliveCount: aliveTitans.length,
    totalCount: list.length,
    deadTitans,
    aliveTitans,
  };
}

export function evaluateDoor(door: any, teamNum: number | string, cache: any, options: any = {}): DungeonDoorEvaluation {
  const primeElement = (cache?.dungeonStatus?.data?.elements?.prime || '').toLowerCase();
  const attackerType = String(door?.attackerType || '').toLowerCase();
  const titanStates = getEffectiveTitanStates(cache);
  const lineupInfo = pickLineupFromPool(attackerType, titanStates, cache, options);
  const heroes = lineupInfo.selectedHeroes;
  const isPrime = Boolean(primeElement && attackerType === primeElement);

  const priorityList =
    Array.isArray(options.doorPriority) && options.doorPriority.length > 0
      ? options.doorPriority
      : Array.isArray(options.attackerPriority) && options.attackerPriority.length > 0
      ? options.attackerPriority
      : DEFAULT_DOOR_PRIORITY;

  let priorityRank = 999;
  if (isPrime && priorityList.includes('prime')) {
    priorityRank = priorityList.indexOf('prime');
  } else {
    const normType = attackerType === 'mixed' ? 'neutral' : attackerType;
    const matchIdx = priorityList.findIndex((p: string) => {
      const normP = p === 'mixed' ? 'neutral' : p;
      return normP === normType;
    });
    if (matchIdx !== -1) {
      priorityRank = matchIdx;
    } else if (priorityList.includes(attackerType)) {
      priorityRank = priorityList.indexOf(attackerType);
    }
  }

  const intactness = {
    isIntact: lineupInfo.isIntact,
    casualties: !lineupInfo.isIntact,
    aliveCount: lineupInfo.aliveCount,
    totalCount: lineupInfo.pool.length,
    deadTitans: lineupInfo.deadTitans,
    aliveTitans: lineupInfo.aliveTitans,
  };

  const canAttack = options.requireIntactLineup ? lineupInfo.isIntact : heroes.length > 0;

  return {
    teamNum: Number(teamNum) || 0,
    door,
    attackerType,
    defenderType: door?.defenderType || 'unknown',
    enemyPower: Number(door?.power) || 0,
    heroes,
    pool: lineupInfo.pool,
    deadCount: lineupInfo.deadCount,
    aliveCount: lineupInfo.aliveCount,
    isPrime,
    intactness,
    canAttack,
    priorityRank,
    disqualificationReason: canAttack
      ? null
      : heroes.length === 0
      ? 'No alive titans remaining in pool for this element.'
      : `Team has fallen titan(s): ${lineupInfo.deadTitans.join(', ')}`,
  };
}

export function selectBestDoor(doors: any[], cache: any, options: any = {}): DungeonDoorSelectionResult {
  const list = Array.isArray(doors) ? doors : [];
  if (!list.length) {
    return {
      chosen: null,
      canAttack: false,
      reason: 'No dungeon doors available for current floor.',
      evaluations: [],
    };
  }

  const evaluations = list.map((door, idx) => evaluateDoor(door, idx, cache, options));
  const viable = evaluations.filter((e) => e.canAttack);

  if (!viable.length) {
    return {
      chosen: null,
      canAttack: false,
      reason: options.requireIntactLineup
        ? 'All available doors require teams with casualties. Halting dungeon automation.'
        : 'All available doors have no viable alive titans remaining.',
      evaluations,
    };
  }

  viable.sort((a, b) => {
    if (a.deadCount !== b.deadCount) return a.deadCount - b.deadCount;
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.enemyPower !== b.enemyPower) return a.enemyPower - b.enemyPower;
    return a.teamNum - b.teamNum;
  });

  const best = viable[0]!;
  const statusNote =
    best.deadCount === 0
      ? 'intact team'
      : `${best.deadCount} fallen titan(s) in pool, ${best.heroes.length} alive deployed`;

  return {
    chosen: best,
    canAttack: true,
    reason: `Selected door ${best.teamNum + 1} (${best.attackerType}) with ${statusNote}.`,
    evaluations,
  };
}

export function planDungeon(cache: any, options: any = {}): DungeonPlanResult {
  const dungeonData = cache?.dungeonStatus?.data;
  if (!dungeonData) {
    return { kind: 'need-snapshot', reason: 'Dungeon status cache is missing.' };
  }
  if (dungeonData.activeBattle) {
    const startTime =
      Number(dungeonData.activeBattle.startTime) || Date.parse(dungeonData.activeBattle.startTime) || 0;
    const isStale = startTime > 0 && Date.now() - startTime > 120000;
    if (!isStale) {
      return {
        kind: 'busy',
        reason: `Battle currently in progress on door ${Number(dungeonData.activeBattle.teamNum ?? 0) + 1}.`,
        activeBattle: dungeonData.activeBattle,
      };
    }
  }
  const rawDoors = dungeonData.currentFloorDoors;
  const doors = Array.isArray(rawDoors)
    ? rawDoors
    : rawDoors && typeof rawDoors === 'object'
    ? Object.values(rawDoors)
    : [];
  if (!Array.isArray(doors) || !doors.length) {
    return { kind: 'need-snapshot', reason: 'Waiting for floor doors to be loaded.' };
  }
  const selection = selectBestDoor(doors, cache, options);
  if (!selection.canAttack || !selection.chosen) {
    return {
      kind: 'stop',
      reason: selection.reason,
      evaluations: selection.evaluations,
    };
  }
  return {
    kind: 'battle',
    teamNum: selection.chosen.teamNum,
    heroes: selection.chosen.heroes,
    attackerType: selection.chosen.attackerType,
    door: selection.chosen.door,
    floorNumber: dungeonData.floorNumber,
    call: {
      name: 'dungeonStartBattle',
      args: {
        teamNum: selection.chosen.teamNum,
        heroes: selection.chosen.heroes,
      },
    },
    selection,
  };
}

export function resetTitanStates(cache: any): any {
  if (cache?.dungeonStatus?.data) {
    if (!cache.dungeonStatus.data.states) {
      cache.dungeonStatus.data.states = {};
    }
    cache.dungeonStatus.data.states.titans = {};
    cache.dungeonStatus.data.activeBattle = null;
    cache.dungeonStatus.data.todayTitanite = 0;
  }
  return cache;
}

export interface SmartSquadPickOptions {
  orderedPools?: Partial<DungeonOrderedPools>;
  savedLineups?: Record<string, number[]>;
  customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
  cache?: any;
  tankSwitchHpPct?: number;
  safetyThresholdPct?: number;
  ignoreSavedLineups?: boolean;
}

export interface SmartSquadPickResult {
  elemKey: DungeonElementKey;
  squadIds: number[];
  frontlineId: number | null;
  primaryTankId: number | null;
  switchedTankFrom: number | null;
  switchedTankTo: number | null;
  aliveEligibleIds: number[];
  aliveEligibleCount: number;
  isPoolDepleted: boolean;
  orderedPool: number[];
}

function getTitanHpPct(id: number, titanStates: Record<string, any>): number {
  const st = titanStates?.[String(id)] ?? titanStates?.[Number(id)];
  if (!st) return 100;
  const maxHp = Math.max(1, Number(st.maxHp) || 1000000);
  const hp = Math.max(0, st.hp != null ? Number(st.hp) : maxHp);
  return (hp / maxHp) * 100;
}

/**
 * Resolves the optimal 5-titan squad for a door element using:
 * 1. User-configured ordered pool for that room type (water / fire / earth / neutral)
 * 2. Fallback to saved lineups / custom teams / server saved teams / DEFAULT_ORDERED_TITAN_POOLS
 * 3. Automatic tanker rotation when the primary tank's HP% drops to or below `tankSwitchHpPct`
 */
export function pickSmartSquadForDoor(
  doorElement: string,
  titanStates: Record<string, any> = {},
  options: SmartSquadPickOptions = {}
): SmartSquadPickResult {
  const elemKey = normalizeDungeonElementKey(doorElement);
  const tankSwitchHpPct = Number.isFinite(Number(options.tankSwitchHpPct))
    ? Number(options.tankSwitchHpPct)
    : 35;
  const safetyThresholdPct = Number.isFinite(Number(options.safetyThresholdPct))
    ? Number(options.safetyThresholdPct)
    : 20;

  const roster = options.cache?.titanGetAll?.data || {};
  const stateKeys = Object.keys(titanStates || {});
  const rosterKeys = Object.keys(roster || {});
  const hasKnownRoster = stateKeys.length > 0 || rosterKeys.length > 0;
  const ownedSet = new Set<number>();
  for (const k of stateKeys) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0) ownedSet.add(n);
  }
  for (const k of rosterKeys) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0) ownedSet.add(n);
  }

  const isEligibleAndAlive = (id: number): boolean => {
    if (!Number.isInteger(id) || id <= 0) return false;
    if (hasKnownRoster && !ownedSet.has(id)) return false;
    const st = titanStates?.[String(id)] ?? titanStates?.[Number(id)];
    if (!isTitanAlive(st)) return false;
    const meta = titanMetadata[String(id)] || null;
    return isTitanEligibleForDoor(id, doorElement, meta);
  };

  // Build ordered candidate pool
  const orderedPool: number[] = [];
  const pushUnique = (ids: Array<number | string> | undefined | null) => {
    if (!Array.isArray(ids)) return;
    for (const raw of ids) {
      const n = Number(raw);
      if (Number.isInteger(n) && n > 0 && !orderedPool.includes(n)) {
        orderedPool.push(n);
      }
    }
  };

  // 1. User-configured ordered pool for this room type (highest priority)
  const customOrdered = options.orderedPools?.[elemKey];
  if (Array.isArray(customOrdered) && customOrdered.length > 0) {
    pushUnique(customOrdered);
  } else {
    // 2. Saved lineup (unless explicitly ignored, e.g., when strictly using ordered pool)
    if (!options.ignoreSavedLineups) {
      const saved =
        options.savedLineups?.[elemKey] ||
        (elemKey === 'neutral' ? options.savedLineups?.['mixed'] : undefined);
      if (Array.isArray(saved) && saved.length > 0) {
        const aliveSaved = saved.map(Number).filter(isEligibleAndAlive);
        if (aliveSaved.length >= 3) {
          pushUnique(aliveSaved);
        }
      }
    }

    // 3. Custom Titan Teams
    if (Array.isArray(options.customTeams)) {
      for (const ct of options.customTeams) {
        const isTitan = ct.type === 'titan' || ct.heroIds.some((id) => Number(id) >= 4000);
        if (!isTitan) continue;
        const aliveCt = ct.heroIds.map(Number).filter(isEligibleAndAlive);
        if (aliveCt.length >= 5) {
          pushUnique(aliveCt);
          break;
        }
      }
    }

    // 4. Server Saved Team
    const serverTeams = options.cache?.teamGetAll?.data || {};
    const serverCandidate =
      serverTeams[`dungeon_${elemKey}`] ||
      (elemKey === 'neutral'
        ? serverTeams['dungeon_neutral'] || serverTeams['dungeon'] || serverTeams['dungeon_mixed']
        : undefined);
    if (Array.isArray(serverCandidate) && serverCandidate.length > 0) {
      const aliveServer = serverCandidate.map(Number).filter(isEligibleAndAlive);
      if (aliveServer.length >= 3) {
        pushUnique(aliveServer);
      }
    }
  }

  // 5. Default ordered pool for this element
  pushUnique(DEFAULT_ORDERED_TITAN_POOLS[elemKey]);

  // 6. Any remaining owned alive eligible titans sorted by power desc, HP% desc
  if (hasKnownRoster) {
    const remainingOwned = [...ownedSet]
      .filter((id) => !orderedPool.includes(id) && isEligibleAndAlive(id))
      .sort((a, b) => {
        const pA = Number(roster?.[String(a)]?.power) || 0;
        const pB = Number(roster?.[String(b)]?.power) || 0;
        if (pB !== pA) return pB - pA;
        return getTitanHpPct(b, titanStates) - getTitanHpPct(a, titanStates);
      });
    pushUnique(remainingOwned);
  }

  const aliveEligibleIds = orderedPool.filter(isEligibleAndAlive);
  const aliveEligibleCount = aliveEligibleIds.length;
  const isPoolDepleted = aliveEligibleCount > 0 && aliveEligibleCount <= 5;

  if (aliveEligibleCount === 0) {
    return {
      elemKey,
      squadIds: [],
      frontlineId: null,
      primaryTankId: null,
      switchedTankFrom: null,
      switchedTankTo: null,
      aliveEligibleIds: [],
      aliveEligibleCount: 0,
      isPoolDepleted: false,
      orderedPool,
    };
  }

  // Auto-Switch Tanker logic
  const tanks = aliveEligibleIds.filter((id) => getTitanRole(id) === 'Tank');
  const primaryTankId = tanks[0] ?? null;
  let switchedTankFrom: number | null = null;
  let switchedTankTo: number | null = null;
  const demotedLowHpTanks = new Set<number>();

  if (primaryTankId != null && tankSwitchHpPct > 0) {
    const primaryHpPct = getTitanHpPct(primaryTankId, titanStates);
    if (primaryHpPct <= tankSwitchHpPct) {
      const healthyTank = tanks.find((id) => getTitanHpPct(id, titanStates) > tankSwitchHpPct);
      if (healthyTank != null && healthyTank !== primaryTankId) {
        switchedTankFrom = primaryTankId;
        switchedTankTo = healthyTank;
        for (const tId of tanks) {
          if (tId === healthyTank) break;
          if (getTitanHpPct(tId, titanStates) <= tankSwitchHpPct) {
            demotedLowHpTanks.add(tId);
          }
        }
      } else if (tanks.length > 1) {
        let healthiestTank = primaryTankId;
        let bestTankHp = primaryHpPct;
        for (const tId of tanks) {
          const hpPct = getTitanHpPct(tId, titanStates);
          if (hpPct > bestTankHp) {
            bestTankHp = hpPct;
            healthiestTank = tId;
          }
        }
        if (healthiestTank !== primaryTankId) {
          switchedTankFrom = primaryTankId;
          switchedTankTo = healthiestTank;
          demotedLowHpTanks.add(primaryTankId);
        }
      }
    }
  }

  // Build final 5-titan squad
  const squadIds: number[] = [];
  if (switchedTankTo != null) {
    squadIds.push(switchedTankTo);
    // Pass 1: healthy non-demoted titans in pool order
    for (const id of aliveEligibleIds) {
      if (squadIds.length >= 5) break;
      if (squadIds.includes(id) || demotedLowHpTanks.has(id)) continue;
      if (getTitanHpPct(id, titanStates) >= safetyThresholdPct) {
        squadIds.push(id);
      }
    }
    // Pass 2: remaining non-demoted titans in pool order
    for (const id of aliveEligibleIds) {
      if (squadIds.length >= 5) break;
      if (squadIds.includes(id) || demotedLowHpTanks.has(id)) continue;
      squadIds.push(id);
    }
    // Pass 3: demoted low-HP tanks (highest HP% first) if still < 5
    if (squadIds.length < 5 && demotedLowHpTanks.size > 0) {
      const sortedDemoted = [...demotedLowHpTanks].sort(
        (a, b) => getTitanHpPct(b, titanStates) - getTitanHpPct(a, titanStates)
      );
      for (const id of sortedDemoted) {
        if (squadIds.length >= 5) break;
        if (!squadIds.includes(id)) squadIds.push(id);
      }
    }
  } else {
    // No tank switch needed: preserve pool order, skipping below-safety titans only if >5 alive
    if (aliveEligibleIds.length > 5 && safetyThresholdPct > 0) {
      for (const id of aliveEligibleIds) {
        if (squadIds.length >= 5) break;
        if (getTitanHpPct(id, titanStates) >= safetyThresholdPct) {
          squadIds.push(id);
        }
      }
    }
    for (const id of aliveEligibleIds) {
      if (squadIds.length >= 5) break;
      if (!squadIds.includes(id)) squadIds.push(id);
    }
  }

  const frontlineId =
    switchedTankTo ??
    squadIds.find((id) => getTitanRole(id) === 'Tank') ??
    squadIds[0] ??
    null;

  return {
    elemKey,
    squadIds,
    frontlineId,
    primaryTankId,
    switchedTankFrom,
    switchedTankTo,
    aliveEligibleIds,
    aliveEligibleCount,
    isPoolDepleted,
    orderedPool,
  };
}

export const dungeonAutomationService = {
  DEFAULT_DOOR_PRIORITY,
  DEFAULT_ATTACKER_PRIORITY,
  DEFAULT_TITAN_POOLS,
  FALLBACK_LINEUPS,
  isTitanAlive,
  getEffectiveTitanStates,
  getPoolForType,
  pickLineupFromPool,
  pickSmartSquadForDoor,
  getLineupForDoor,
  checkLineupIntactness,
  evaluateDoor,
  selectBestDoor,
  planDungeon,
  resetTitanStates,
};

export default dungeonAutomationService;
