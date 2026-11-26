import { getTitanMetadata } from '../../utils/metadata.ts';
import {
  simulateBattleWithUnity,
  evaluateDoorSafetyAndLoss,
  calculateHpLossMetrics,
  type DoorEvaluationResult,
  type SimResultPayload,
  type HpLossMetrics,
} from '../../utils/dungeonBattleSim.ts';
import {
  getEffectiveTitanStates,
  pickSmartSquadForDoor,
  type SmartSquadPickResult,
} from './dungeonAutomation.ts';
import {
  needsFiveFloorCheckpointClaim,
  shouldUseBestOfTen,
  runSingleDoorBestOfTen,
  scoreDungeonOutcome,
  compareDungeonOutcomes,
  areAllDoorsPoolDepleted,
  formatDungeonElementName,
  SINGLE_DOOR_SIM_ROUNDS,
  type BestOfTenReport,
  type DungeonOrderedPools,
  type DungeonOutcomeScore,
  type DungeonClearedRoomEntry,
} from '../dungeonPlanner.ts';
import { validateDungeonEndBattleArgs } from '../rpcSanitizer.ts';

export interface DungeonAutomationOptions {
  cache: any;
  dispatchRpc: (calls: Array<{ name: string; args?: any }>) => Promise<any>;
  savedLineups?: Record<string, number[]>;
  customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
  orderedPools?: Partial<DungeonOrderedPools>;
  safetyThresholdPct?: number; // default: 20
  tankSwitchHpPct?: number; // default: 35
  targetTitanite?: number; // 0 = unlimited
  todayTitanite?: number;
  singleDoorBestOf10?: boolean; // default: true
  allowCasualtyOnDepletedPool?: boolean; // default: false
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
  switchedTankFrom?: number | null;
  switchedTankTo?: number | null;
  forceMajeureUsed?: boolean;
  casualties?: number;
  fallenTitans?: string[];
  clearedRoomEntry?: DungeonClearedRoomEntry;
}

interface DoorCandidateContext {
  door: any;
  doorIdx: number;
  doorElement: 'Water' | 'Fire' | 'Earth' | 'Neutral';
  squadPick: SmartSquadPickResult;
  evaluation: DoorEvaluationResult;
}

interface SimulatedDoorCandidate {
  ctx: DoorCandidateContext;
  startSeed: number;
  outcome: SimResultPayload;
  score: DungeonOutcomeScore;
  metrics: HpLossMetrics;
  bestOfTenReport: BestOfTenReport | null;
}

/**
 * Resolves the candidate titan squad for a specific door element.
 * Delegates to `pickSmartSquadForDoor` (ordered pool + tanker auto-switch + fallback chain).
 */
export function resolveSquadForDoor(
  doorElement: string,
  states: Record<string, any>,
  options: {
    orderedPools?: Partial<DungeonOrderedPools>;
    savedLineups?: Record<string, number[]>;
    customTeams?: Array<{ id: string; name: string; type?: string; heroIds: number[] }>;
    cache?: any;
    tankSwitchHpPct?: number;
    safetyThresholdPct?: number;
  }
): number[] {
  const res = pickSmartSquadForDoor(doorElement, states, {
    orderedPools: options.orderedPools,
    savedLineups: options.savedLineups,
    customTeams: options.customTeams,
    cache: options.cache,
    tankSwitchHpPct: options.tankSwitchHpPct ?? 35,
    safetyThresholdPct: options.safetyThresholdPct ?? 20,
  });
  return res.squadIds;
}

function extractFallenTitanNames(outcome: SimResultPayload): string[] {
  const fallen: string[] = [];
  for (const [idStr, att] of Object.entries(outcome?.attackers || {})) {
    if (att?.isDead === true || (typeof att?.hp === 'number' && att.hp <= 0)) {
      const meta = getTitanMetadata(idStr);
      fallen.push(meta?.name || `Titan #${idStr}`);
    }
  }
  return fallen;
}

/**
 * Executes a single automated Dungeon floor step:
 * 1. Checks current floor doors, 5-floor checkpoints, and titan states.
 * 2. Picks squads per door using Ordered Titan Pool + Auto-Switch Tanker.
 * 3. Evaluates doors via Unity WASM simulation (with Best-of-10 when depleted <= 5).
 * 4. In standard mode, enforces 3-star win and safety HP threshold.
 * 5. In Force-Majeure mode (`allowCasualtyOnDepletedPool` when all doors have <= 5 alive titans),
 *    compares all available doors (1 or 2) and accepts the winning door with minimum casualties/loss,
 *    stopping only when no door can win.
 */
export async function executeDungeonAutomationStep(
  options: DungeonAutomationOptions
): Promise<DungeonAutomationStepResult> {
  const {
    cache,
    dispatchRpc,
    savedLineups = {},
    customTeams = [],
    orderedPools,
    safetyThresholdPct = 20,
    tankSwitchHpPct = 35,
    targetTitanite = 0,
    todayTitanite = 0,
    singleDoorBestOf10 = true,
    allowCasualtyOnDepletedPool = false,
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

  // Build smart squad picks and baseline evaluations for every door
  const doorContexts: DoorCandidateContext[] = [];
  const evaluations: DoorEvaluationResult[] = [];

  for (let idx = 0; idx < doors.length; idx++) {
    const door = doors[idx];
    const rawElem = door?.attackerType || door?.element || '';
    const doorElement = formatDungeonElementName(rawElem);

    const squadPick = pickSmartSquadForDoor(doorElement, titanStates, {
      orderedPools,
      savedLineups,
      customTeams,
      cache: cache.value,
      tankSwitchHpPct,
      safetyThresholdPct,
    });

    const evalResult = evaluateDoorSafetyAndLoss(
      door,
      idx,
      squadPick.squadIds,
      titanStates,
      safetyThresholdPct
    );

    evaluations.push(evalResult);
    doorContexts.push({
      door,
      doorIdx: idx,
      doorElement,
      squadPick,
      evaluation: evalResult,
    });
  }

  const allDoorsDepleted = areAllDoorsPoolDepleted(
    doorContexts.map((c) => c.squadPick.aliveEligibleCount)
  );
  const forceMajeureEligible = Boolean(allowCasualtyOnDepletedPool && allDoorsDepleted);

  const safeContexts = doorContexts
    .filter((c) => c.evaluation.isSafe)
    .sort((a, b) => a.evaluation.score - b.evaluation.score);

  if (safeContexts.length === 0 && !forceMajeureEligible) {
    const firstReason = evaluations[0]?.disqualificationReason || `Titan health below ${safetyThresholdPct}% safety threshold.`;
    return {
      stopped: true,
      stopReason: `Automation stopped: ${firstReason}`,
      evaluations,
    };
  }

  // Order candidate doors to simulate:
  // - Standard mode: only the best safe door
  // - Force-majeure mode (all doors <= 5 alive): all doors with at least 1 alive titan, safest first
  const candidatesToTry: DoorCandidateContext[] = forceMajeureEligible
    ? [...doorContexts]
        .filter((c) => c.squadPick.squadIds.length > 0)
        .sort((a, b) => {
          if (a.evaluation.isSafe !== b.evaluation.isSafe) return a.evaluation.isSafe ? -1 : 1;
          return a.evaluation.score - b.evaluation.score;
        })
    : [safeContexts[0]!];

  if (candidatesToTry.length === 0) {
    return {
      stopped: true,
      stopReason: 'No alive titans available for any door on this floor.',
      evaluations,
    };
  }

  // Helper to start & simulate a single door candidate via Unity WASM.
  // Calling dungeonStartBattle without submitting dungeonEndBattle acts as the real game's manual retreat buffer.
  const startAndSimulateDoor = async (
    ctx: DoorCandidateContext,
    disableBestOfTen = false
  ): Promise<{ result?: SimulatedDoorCandidate; error?: string }> => {
    const startRes = await dispatchRpc([
      {
        name: 'dungeonStartBattle',
        args: {
          teamNum: ctx.doorIdx,
          heroes: ctx.squadPick.squadIds,
        },
      },
    ]);

    const startPayload = startRes?.results?.[0]?.result?.response || startRes?.results?.[0]?.response;
    if (!startPayload || startRes?.results?.[0]?.error) {
      return {
        error: startRes?.results?.[0]?.error?.description || 'Failed to start dungeon battle on server.',
      };
    }

    const seed = Number(startPayload.seed) || Math.floor(Math.random() * 1000000000);
    const frontlineId = ctx.squadPick.frontlineId ?? ctx.squadPick.squadIds[0] ?? 0;
    const useBestOfTen =
      !disableBestOfTen &&
      singleDoorBestOf10 &&
      (shouldUseBestOfTen(doors, ctx.squadPick.aliveEligibleIds) ||
        (forceMajeureEligible && ctx.squadPick.isPoolDepleted));

    let outcome: SimResultPayload;
    let bestOfTenReport: BestOfTenReport | null = null;
    try {
      if (useBestOfTen) {
        bestOfTenReport = await runSingleDoorBestOfTen(startPayload, simulateFn, {
          frontlineId,
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
        error: `Unity battle simulation failed${phasePrefix}: ${err.message || String(err)}. Battle retreated without loss.`,
      };
    }

    const metrics = calculateHpLossMetrics(outcome?.attackers || {}, frontlineId, safetyThresholdPct);
    const score = scoreDungeonOutcome(outcome, frontlineId, safetyThresholdPct);

    return {
      result: {
        ctx,
        startSeed: seed,
        outcome,
        score,
        metrics,
        bestOfTenReport,
      },
    };
  };

  // Simulate candidate door(s)
  const simulatedDoors: SimulatedDoorCandidate[] = [];
  let lastStartedDoorIdx = -1;

  for (const ctx of candidatesToTry) {
    const simAttempt = await startAndSimulateDoor(ctx);
    if (simAttempt.error || !simAttempt.result) {
      return {
        stopped: true,
        stopReason: simAttempt.error || 'Failed to simulate dungeon battle.',
        chosenEvaluation: ctx.evaluation,
        evaluations,
      };
    }

    const sim = simAttempt.result;
    lastStartedDoorIdx = ctx.doorIdx;
    simulatedDoors.push(sim);

    const isFlawlessSafeWin = sim.outcome.win && sim.outcome.stars >= 3 && !sim.metrics.hasCriticalHp;
    // Short-circuit: if first door already yields a flawless safe win, no need to probe the second door
    if (isFlawlessSafeWin || !forceMajeureEligible) {
      break;
    }
  }

  // Pick the best simulated door (win > fewest casualties > highest preservation score)
  simulatedDoors.sort((a, b) => compareDungeonOutcomes(a.score, b.score));
  let chosen = simulatedDoors[0]!;

  const userRequestedStop = typeof options.shouldStop === 'function' ? options.shouldStop() : false;
  const isLoss = !chosen.outcome.win;
  const hasCasualty = chosen.outcome.stars < 3 || chosen.score.casualties > 0;
  const isUnsafeHp = chosen.metrics.hasCriticalHp;
  const acceptedViaForceMajeure = forceMajeureEligible && !isLoss && (hasCasualty || isUnsafeHp);

  // Retreat and abort if user requested stop, battle is unwinnable, or standard safety checks failed
  if (userRequestedStop || isLoss || (!forceMajeureEligible && (hasCasualty || isUnsafeHp))) {
    if (cache?.value?.dungeonStatus?.data) {
      cache.value.dungeonStatus.data.activeBattle = null;
    }
    await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

    let stopReason = '';
    if (userRequestedStop) {
      stopReason = 'Automation stopped by user. Current battle retreated without loss.';
    } else if (isLoss) {
      stopReason = forceMajeureEligible
        ? 'No winnable door found across depleted pool (<=5 titans). Battle retreated without loss.'
        : 'Unity simulation predicted defeat. Battle retreated without loss.';
    } else if (hasCasualty) {
      stopReason = `Unity simulation predicted titan casualty (${chosen.outcome.stars} stars). Battle retreated without loss.`;
    } else {
      stopReason = `Titan health would fall to ${chosen.metrics.minFinalHpPct.toFixed(1)}% (below ${safetyThresholdPct}% safety threshold). Battle retreated without loss.`;
    }

    return {
      stopped: true,
      stopReason,
      chosenEvaluation: {
        ...chosen.ctx.evaluation,
        tankLossPct: chosen.metrics.tankLossPct,
        teamLossPct: chosen.metrics.teamLossPct,
        minHpPct: chosen.metrics.minFinalHpPct,
      },
      evaluations,
    };
  }

  // Session sync guard: if force-majeure compared 2 doors and Door 0 beat Door 1,
  // re-start Door 0 on server and simulate using the FRESH server seed (real manual-retreat buffer).
  if (chosen.ctx.doorIdx !== lastStartedDoorIdx) {
    const resyncAttempt = await startAndSimulateDoor(chosen.ctx, true);
    if (resyncAttempt.error || !resyncAttempt.result || !resyncAttempt.result.outcome.win) {
      if (cache?.value?.dungeonStatus?.data) {
        cache.value.dungeonStatus.data.activeBattle = null;
      }
      await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);
      return {
        stopped: true,
        stopReason: resyncAttempt.error || 'Failed to re-sync winning door session with server. Battle retreated without loss.',
        chosenEvaluation: chosen.ctx.evaluation,
        evaluations,
      };
    }
    chosen = resyncAttempt.result;
  }

  const bestDoor = chosen.ctx.evaluation;
  const outcome = chosen.outcome;
  const metrics = chosen.metrics;
  const bestOfTenReport = chosen.bestOfTenReport;
  const squadPick = chosen.ctx.squadPick;
  const doorElem = chosen.ctx.doorElement;

  // Hard outgoing payload safety guard: NEVER dispatch dungeonEndBattle with empty/malformed
  // progress[0].attackers.heroes or 0 surviving titans (server treats omitted titans as dead -> wipe).
  const endArgsCheck = validateDungeonEndBattleArgs(outcome.endArgs, {
    expectedTeamIds: bestDoor.teamIds,
    expectedSeed: bestOfTenReport ? null : chosen.startSeed,
    requireAllAlive: !acceptedViaForceMajeure,
  });
  if (!endArgsCheck.ok) {
    if (cache?.value?.dungeonStatus?.data) {
      cache.value.dungeonStatus.data.activeBattle = null;
    }
    await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);
    return {
      stopped: true,
      stopReason: `${endArgsCheck.error} Battle retreated without loss.`,
      chosenEvaluation: bestDoor,
      evaluations,
    };
  }

  // 3. Submit official battle outcome
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

  // 4. Claim 5-floor checkpoint reward (`dungeonSaveProgress`) whenever required
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

  const fallenTitans = extractFallenTitanNames(outcome);
  const casualties = Math.max(chosen.score.casualties, fallenTitans.length);
  const switchedFromName = squadPick.switchedTankFrom
    ? getTitanMetadata(squadPick.switchedTankFrom)?.name || `Titan #${squadPick.switchedTankFrom}`
    : null;
  const switchedToName = squadPick.switchedTankTo
    ? getTitanMetadata(squadPick.switchedTankTo)?.name || `Titan #${squadPick.switchedTankTo}`
    : null;

  const clearedRoomEntry: DungeonClearedRoomEntry = {
    id: `${floorNumber}_${bestDoor.doorIdx + 1}_${Date.now()}`,
    floor: floorNumber,
    door: bestDoor.doorIdx + 1,
    element: doorElem,
    source: 'auto',
    win: true,
    stars: Number(outcome.stars) || (casualties > 0 ? Math.max(1, 3 - casualties) : 3),
    casualties,
    fallenTitans,
    teamIds: [...bestDoor.teamIds],
    tankLossPct: Math.round(metrics.tankLossPct * 10) / 10,
    teamLossPct: Math.round(metrics.teamLossPct * 10) / 10,
    switchedTankFrom: switchedFromName,
    switchedTankTo: switchedToName,
    forceMajeure: acceptedViaForceMajeure,
    bestOfTenNote: bestOfTenReport
      ? `#${bestOfTenReport.bestIndex + 1}/${bestOfTenReport.roundsRun} (${bestOfTenReport.wins}/${bestOfTenReport.roundsRun} wins)`
      : null,
    checkpointGold: checkpointClaimed ? checkpointGold : undefined,
    timestamp: new Date().toISOString(),
  };

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
    switchedTankFrom: squadPick.switchedTankFrom,
    switchedTankTo: squadPick.switchedTankTo,
    forceMajeureUsed: acceptedViaForceMajeure,
    casualties,
    fallenTitans,
    clearedRoomEntry,
  };
}
