import { getTitanMetadata } from '../../utils/metadata.ts';
import {
  simulateBattleWithUnity,
  evaluateDoorSafetyAndLoss,
  calculateHpLossMetrics,
  isTitanEligibleForDoor,
  type DoorEvaluationResult,
  type SimResultPayload,
} from '../../utils/dungeonBattleSim.ts';
import { getEffectiveTitanStates, DEFAULT_TITAN_POOLS } from './dungeonAutomation.ts';
import {
  needsFiveFloorCheckpointClaim,
  shouldUseBestOfTen,
  runSingleDoorBestOfTen,
  SINGLE_DOOR_SIM_ROUNDS,
  type BestOfTenReport,
} from '../dungeonPlanner.ts';

export interface DungeonAutomationOptions {
  cache: any;
  dispatchRpc: (calls: Array<{ name: string; args?: any }>) => Promise<any>;
  savedLineups?: Record<string, number[]>;
  customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
  safetyThresholdPct?: number; // default: 20
  targetTitanite?: number; // 0 = unlimited
  todayTitanite?: number;
  singleDoorBestOf10?: boolean; // default: true
  simulateFn?: (rawBattle: any, seed: number) => Promise<SimResultPayload>;
  shouldStop?: () => boolean;
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
  checkpointClaimed?: boolean;
  checkpointGold?: number;
  bestOfTenReport?: BestOfTenReport | null;
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
  const elemKey = (normElem === 'water' || normElem === 'fire' || normElem === 'earth') ? normElem : 'neutral';

  // 1. Saved lineup
  const saved = options.savedLineups?.[elemKey] || (elemKey === 'neutral' ? options.savedLineups?.['mixed'] : null);
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
  const serverCandidate = serverTeams[`dungeon_${elemKey}`] || (elemKey === 'neutral' ? (serverTeams['dungeon_neutral'] || serverTeams['dungeon'] || serverTeams['dungeon_mixed']) : null);
  if (Array.isArray(serverCandidate) && serverCandidate.length > 0) {
    const ids = serverCandidate
      .map(Number)
      .filter((id) => !states[String(id)]?.isDead && isTitanEligibleForDoor(id, doorElement, getTitanMetadata(id)));
    if (ids.length >= 3) {
      return ids.slice(0, 5);
    }
  }

  // 4. Default Pool fallback
  const pool = DEFAULT_TITAN_POOLS[elemKey] || DEFAULT_TITAN_POOLS.neutral || DEFAULT_TITAN_POOLS.mixed;
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
  const {
    cache,
    dispatchRpc,
    savedLineups = {},
    customTeams = [],
    safetyThresholdPct = 20,
    targetTitanite = 0,
    todayTitanite = 0,
    singleDoorBestOf10 = true,
    simulateFn = simulateBattleWithUnity,
  } = options;

  if (targetTitanite > 0 && todayTitanite >= targetTitanite) {
    return {
      done: true,
      stopped: true,
      stopReason: `Target Titanite reached (${todayTitanite}/${targetTitanite}).`,
    };
  }

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

  // Pre-check: handle 5-floor checkpoint/save reward gate before attempting any battle
  const needsPreClaim = needsFiveFloorCheckpointClaim({
    floorNumber,
    floorType: dungeonData.floorType,
    doorsCount: doors.length,
    respawnFloor: Number(dungeonData.respawnFloor) || 0,
    saveFloor: Number(dungeonData.saveFloor) || 0,
    readyToSave: dungeonData.readyToSave === true,
  });

  if (doors.length === 0 || String(dungeonData.floorType || '').toLowerCase() === 'save' || String(dungeonData.floorType || '').toLowerCase() === 'reward') {
    if (needsPreClaim) {
      const saveRes = await dispatchRpc([{ name: 'dungeonSaveProgress', args: {} }]);
      const saveResp = saveRes?.results?.[0]?.result?.response || saveRes?.results?.[0]?.response || {};
      const gold = Number(saveResp?.reward?.gold) || 0;
      await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);
      return {
        floorPassed: floorNumber,
        checkpointClaimed: true,
        checkpointGold: gold,
        stopReason: `Checkpoint reward claimed at Floor ${floorNumber}${gold > 0 ? ` (+${gold.toLocaleString()} Gold)` : ''}.`,
      };
    }

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
    let doorElement = 'Neutral';
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

  // Count total alive eligible titans for this door to detect Single-Door Best-of-10 (<= 5 members)
  const rawBestElem = bestDoor.door?.attackerType || bestDoor.door?.element || '';
  let bestDoorElemName = 'Neutral';
  if (/water/i.test(rawBestElem)) bestDoorElemName = 'Water';
  else if (/fire/i.test(rawBestElem)) bestDoorElemName = 'Fire';
  else if (/earth/i.test(rawBestElem)) bestDoorElemName = 'Earth';

  const aliveEligibleIds = Object.keys(titanStates)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0 && !titanStates[String(id)]?.isDead && isTitanEligibleForDoor(id, bestDoorElemName, getTitanMetadata(id)));

  const useBestOfTen = singleDoorBestOf10 && shouldUseBestOfTen(doors, aliveEligibleIds);

  // 2. Simulate outcome strictly using Unity Engine (zero heuristic fallback)
  let outcome: SimResultPayload;
  let bestOfTenReport: BestOfTenReport | null = null;
  try {
    if (useBestOfTen) {
      bestOfTenReport = await runSingleDoorBestOfTen(startPayload, simulateFn, {
        frontlineId: bestDoor.teamIds[0],
        minHpThresholdPct: safetyThresholdPct,
        rounds: SINGLE_DOOR_SIM_ROUNDS,
      });
      outcome = bestOfTenReport.bestOutcome;
    } else {
      outcome = await simulateFn(startPayload, seed);
    }
  } catch (err: any) {
    if (cache?.value?.dungeonStatus?.data) {
      cache.value.dungeonStatus.data.activeBattle = null;
    }
    await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

    const phasePrefix = err?.detail?.phase ? ` at [${err.detail.phase}]` : '';
    return {
      stopped: true,
      stopReason: `Unity battle simulation failed${phasePrefix}: ${err.message || String(err)}. Battle retreated without loss.`,
      chosenEvaluation: bestDoor,
      evaluations,
    };
  }

  // Evaluate post-battle titan health
  const frontlineId = bestDoor.teamIds[0];
  const metrics = calculateHpLossMetrics(outcome?.attackers || {}, frontlineId, safetyThresholdPct);

  const userRequestedStop = typeof options.shouldStop === 'function' ? options.shouldStop() : false;
  const isLoss = !outcome.win;
  const hasCasualty = outcome.stars < 3;
  const isUnsafeHp = metrics.hasCriticalHp;

  // Retreat and abort if battle was lost, titan casualty occurred, health fell below safety threshold, or stop requested
  if (userRequestedStop || isLoss || hasCasualty || isUnsafeHp) {
    // RETREAT FLOW: DO NOT SEND dungeonEndBattle!
    // Discarding the battle keeps titans 100% preserved on the game server without any damage or casualty.
    if (cache?.value?.dungeonStatus?.data) {
      cache.value.dungeonStatus.data.activeBattle = null;
    }
    await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

    let stopReason = '';
    if (userRequestedStop) {
      stopReason = 'Automation stopped by user. Current battle retreated without loss.';
    } else if (isLoss) {
      stopReason = 'Unity simulation predicted defeat. Battle retreated without loss.';
    } else if (hasCasualty) {
      stopReason = `Unity simulation predicted titan casualty (${outcome.stars} stars). Battle retreated without loss.`;
    } else {
      stopReason = `Titan health would fall to ${metrics.minFinalHpPct.toFixed(1)}% (below ${safetyThresholdPct}% safety threshold). Battle retreated without loss.`;
    }

    return {
      stopped: true,
      stopReason,
      chosenEvaluation: {
        ...bestDoor,
        tankLossPct: metrics.tankLossPct,
        teamLossPct: metrics.teamLossPct,
        minHpPct: metrics.minFinalHpPct,
      },
      evaluations,
    };
  }

  // 3. End battle - only submitted when verified win, 3 stars, and all titans stay above safety threshold
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

  // 4. Claim 5-floor checkpoint reward (`dungeonSaveProgress`) whenever required:
  // Confirmed from live game logs: every 5th floor (e.g. 580, 585), `dungeonEndBattle` returns `dungeon: null`
  // and blocks further battles until `dungeonSaveProgress({})` is called to claim gold & unlock floor N+1.
  const endResp = endPayload?.result?.response || endPayload?.response || {};
  const endDungeon = endResp?.dungeon || {};
  const currentRespawn = Number(endDungeon.respawnFloor ?? dungeonData.respawnFloor) || 0;
  const currentSaveFloor = Number(endDungeon.saveFloor ?? dungeonData.saveFloor) || 0;

  const shouldSaveCheckpoint = needsFiveFloorCheckpointClaim({
    floorNumber,
    floorType: endDungeon.floorType,
    endBattleResponse: endResp,
    respawnFloor: currentRespawn,
    saveFloor: currentSaveFloor,
    readyToSave: endDungeon.readyToSave === true || dungeonData.readyToSave === true,
  });

  let checkpointClaimed = false;
  let checkpointGold = 0;
  if (shouldSaveCheckpoint) {
    const saveRes = await dispatchRpc([{ name: 'dungeonSaveProgress', args: {} }]);
    const saveResp = saveRes?.results?.[0]?.result?.response || saveRes?.results?.[0]?.response || {};
    checkpointClaimed = true;
    checkpointGold = Number(saveResp?.reward?.gold) || 0;
  }

  // 5. Update local titan states immediately to prevent state desync between floors
  if (cache?.value?.dungeonStatus?.data?.states?.titans) {
    const titanStore = cache.value.dungeonStatus.data.states.titans;
    const serverTitans = endDungeon?.states?.titans;
    if (serverTitans && typeof serverTitans === 'object') {
      Object.assign(titanStore, serverTitans);
    } else if (outcome?.attackers) {
      for (const [id, att] of Object.entries(outcome.attackers)) {
        if (titanStore[id]) {
          titanStore[id].hp = att.hp;
          titanStore[id].isDead = att.isDead;
          if (att.energy != null) titanStore[id].energy = att.energy;
        } else {
          titanStore[id] = { hp: att.hp, maxHp: att.maxHp, energy: att.energy || 0, isDead: att.isDead };
        }
      }
    }
  }

  // 6. Refresh dungeon status
  await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

  const rawAttacker = bestDoor.door?.attackerType || bestDoor.door?.element || '';
  let doorElem = 'Neutral';
  if (/water/i.test(rawAttacker)) doorElem = 'Water';
  else if (/fire/i.test(rawAttacker)) doorElem = 'Fire';
  else if (/earth/i.test(rawAttacker)) doorElem = 'Earth';

  return {
    floorPassed: floorNumber,
    doorIdx: bestDoor.doorIdx,
    doorElement: doorElem,
    chosenEvaluation: {
      ...bestDoor,
      tankLossPct: metrics.tankLossPct,
      teamLossPct: metrics.teamLossPct,
      minHpPct: metrics.minFinalHpPct,
    },
    evaluations,
    checkpointClaimed,
    checkpointGold,
    bestOfTenReport,
  };
}
