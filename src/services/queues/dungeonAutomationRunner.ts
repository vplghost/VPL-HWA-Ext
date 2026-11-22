import { getTitanMetadata } from '../../utils/metadata.ts';
import {
  simulateBattleLocally,
  evaluateDoorSafetyAndLoss,
  isTitanEligibleForDoor,
  type DoorEvaluationResult,
  type SimResultPayload,
} from '../../utils/dungeonBattleSim.ts';
import { getEffectiveTitanStates, DEFAULT_TITAN_POOLS } from './dungeonAutomation.ts';

export interface DungeonAutomationOptions {
  cache: any;
  dispatchRpc: (calls: Array<{ name: string; args?: any }>) => Promise<any>;
  savedLineups?: Record<string, number[]>;
  customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
  safetyThresholdPct?: number; // default: 20
}

export interface DungeonAutomationStepResult {
  done?: boolean;
  stopped?: boolean;
  stopReason?: string;
  floorPassed?: number;
  doorIdx?: number;
  doorElement?: string;
  chosenEvaluation?: DoorEvaluationResult;
  evaluations?: DoorEvaluationResult[];
}

/**
 * Resolves the candidate titan squad for a specific door element.
 * Priority:
 * 1. Saved accepted lineup for this element from user simulation
 * 2. Custom Titan Team matching this element's titans
 * 3. Server team for this element (teamGetAll)
 * 4. Default Titan Pool for this element
 */
export function resolveSquadForDoor(
  doorElement: string,
  states: Record<string, any>,
  options: {
    savedLineups?: Record<string, number[]>;
    customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
    cache?: any;
  }
): number[] {
  const normElem = doorElement.toLowerCase();
  const elemKey = (normElem === 'water' || normElem === 'fire' || normElem === 'earth') ? normElem : 'mixed';

  // 1. Saved lineup
  const saved = options.savedLineups?.[elemKey];
  if (Array.isArray(saved) && saved.length > 0) {
    const aliveAndEligible = saved
      .map(Number)
      .filter((id) => !states[String(id)]?.isDead && isTitanEligibleForDoor(id, doorElement, getTitanMetadata(id)));
    if (aliveAndEligible.length >= 3) {
      return aliveAndEligible.slice(0, 5);
    }
  }

  // 2. Custom Titan Teams
  if (Array.isArray(options.customTeams)) {
    for (const ct of options.customTeams) {
      const isTitan = ct.type === 'titan' || ct.heroIds.some((id) => Number(id) >= 4000);
      if (!isTitan) continue;
      const ids = ct.heroIds
        .map(Number)
        .filter((id) => !states[String(id)]?.isDead && isTitanEligibleForDoor(id, doorElement, getTitanMetadata(id)));
      if (ids.length >= 5) {
        return ids.slice(0, 5);
      }
    }
  }

  // 3. Server Saved Team
  const serverTeams = options.cache?.teamGetAll?.data || {};
  const serverCandidate = serverTeams[`dungeon_${elemKey}`] || (elemKey === 'mixed' ? serverTeams['dungeon'] : null);
  if (Array.isArray(serverCandidate) && serverCandidate.length > 0) {
    const ids = serverCandidate
      .map(Number)
      .filter((id) => !states[String(id)]?.isDead && isTitanEligibleForDoor(id, doorElement, getTitanMetadata(id)));
    if (ids.length >= 3) {
      return ids.slice(0, 5);
    }
  }

  // 4. Default Pool fallback
  const pool = DEFAULT_TITAN_POOLS[elemKey] || DEFAULT_TITAN_POOLS.mixed;
  const picked = pool
    .map(Number)
    .filter((id) => !states[String(id)]?.isDead && isTitanEligibleForDoor(id, doorElement, getTitanMetadata(id)));
  return picked.slice(0, 5);
}

/**
 * Executes a single automated Dungeon floor step:
 * 1. Checks current floor doors and titan states.
 * 2. Evaluates all doors via battle simulation with tank-loss weighting.
 * 3. Enforces the 20% health safety threshold.
 * 4. Submits the battle for the safest / lowest-damage door.
 */
export async function executeDungeonAutomationStep(
  options: DungeonAutomationOptions
): Promise<DungeonAutomationStepResult> {
  const { cache, dispatchRpc, savedLineups = {}, customTeams = [], safetyThresholdPct = 20 } = options;

  let dungeonData = cache.value?.dungeonStatus?.data || cache.value?.dungeonGetInfo?.data;
  if (!dungeonData) {
    const getRes = await dispatchRpc([{ name: 'dungeonGetInfo' }]);
    dungeonData = getRes?.results?.[0]?.result?.response || cache.value?.dungeonStatus?.data;
  }

  if (!dungeonData) {
    return {
      stopped: true,
      stopReason: 'Could not fetch dungeon status from game server.',
    };
  }

  const floorNumber = Number(dungeonData.floorNumber || (dungeonData.maxFloorPassed ? dungeonData.maxFloorPassed + 1 : 1));
  const rawDoors = dungeonData.currentFloorDoors || dungeonData.floor?.userData || [];
  const doors = Array.isArray(rawDoors) ? rawDoors : Object.values(rawDoors);

  if (doors.length === 0) {
    return {
      stopped: true,
      stopReason: `No available doors on floor ${floorNumber}.`,
    };
  }

  const titanStates = getEffectiveTitanStates(cache.value);

  // Evaluate each door
  const evaluations: DoorEvaluationResult[] = [];

  for (let idx = 0; idx < doors.length; idx++) {
    const door = doors[idx];
    const rawElem = door?.attackerType || door?.element || '';
    let doorElement = 'Mixed';
    if (/water/i.test(rawElem)) doorElement = 'Water';
    else if (/fire/i.test(rawElem)) doorElement = 'Fire';
    else if (/earth/i.test(rawElem)) doorElement = 'Earth';

    const squad = resolveSquadForDoor(doorElement, titanStates, {
      savedLineups,
      customTeams,
      cache: cache.value,
    });

    const evalResult = evaluateDoorSafetyAndLoss(
      door,
      idx,
      squad,
      titanStates,
      safetyThresholdPct
    );

    evaluations.push(evalResult);
  }

  // Filter for safe doors
  const safeDoors = evaluations.filter((e) => e.isSafe);

  if (safeDoors.length === 0) {
    const firstReason = evaluations[0]?.disqualificationReason || 'Titan health below 20% safety threshold.';
    return {
      stopped: true,
      stopReason: `Automation stopped: ${firstReason}`,
      evaluations,
    };
  }

  // Pick best door with lowest combined score (heavily minimizing tank loss)
  safeDoors.sort((a, b) => a.score - b.score);
  const bestDoor = safeDoors[0];

  // Execute the battle officially
  // 1. Start battle
  const startRes = await dispatchRpc([
    {
      name: 'dungeonStartBattle',
      args: {
        teamNum: bestDoor.doorIdx,
        heroes: bestDoor.teamIds,
      },
    },
  ]);

  const startPayload = startRes?.results?.[0]?.result?.response || startRes?.results?.[0]?.response;
  if (!startPayload || startRes?.results?.[0]?.error) {
    const errMsg = startRes?.results?.[0]?.error?.description || 'Failed to start dungeon battle on server.';
    return {
      stopped: true,
      stopReason: errMsg,
      chosenEvaluation: bestDoor,
      evaluations,
    };
  }

  const seed = Number(startPayload.seed) || Math.floor(Math.random() * 1000000000);

  // 2. Simulate outcome locally or through game engine
  let outcome: SimResultPayload;
  if (typeof window !== 'undefined' && (window as any).__hwaSimulateBattle) {
    outcome = await (window as any).__hwaSimulateBattle(startPayload, seed);
  } else {
    outcome = simulateBattleLocally(startPayload, seed, bestDoor.teamIds, titanStates);
  }

  // 3. End battle
  const endRes = await dispatchRpc([
    {
      name: 'dungeonEndBattle',
      args: outcome.endArgs,
    },
  ]);

  const endPayload = endRes?.results?.[0];
  if (endPayload?.result?.response?.error || endPayload?.error) {
    const errMsg = endPayload?.result?.response?.error || endPayload?.error?.description || 'Server rejected battle result.';
    return {
      stopped: true,
      stopReason: errMsg,
      chosenEvaluation: bestDoor,
      evaluations,
    };
  }

  // 4. Save checkpoint if floor % 10 === 0
  const respawnFloor = Number(dungeonData.respawnFloor) || 0;
  if (floorNumber > respawnFloor && floorNumber % 10 === 0) {
    await dispatchRpc([{ name: 'dungeonSaveProgress', args: {} }]);
  }

  // 5. Refresh dungeon status
  await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

  return {
    floorPassed: floorNumber,
    doorIdx: bestDoor.doorIdx,
    doorElement: bestDoor.door?.attackerType || bestDoor.door?.element || 'Mixed',
    chosenEvaluation: bestDoor,
    evaluations,
  };
}
