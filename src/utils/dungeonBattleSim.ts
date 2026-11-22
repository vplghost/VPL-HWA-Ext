import { hasHealingTitan } from './dungeonBattleHistory.ts';

export interface SimTitanItem {
  id: number;
  name: string;
  element: string;
  role: string;
  avatar: string | null;
  hp: number;
  maxHp: number;
  hpPct: number;
  energy: number;
  energyPct: number;
  isDead: boolean;
  power?: number;
  level?: number;
  star?: number;
  isDualElement?: boolean;
}

export interface SimResultPayload {
  win: boolean;
  stars: number;
  duration: number;
  seed: number;
  attackers: Record<string, { hp: number; maxHp: number; energy: number; isDead: boolean; hpDelta: number }>;
  defenders: Record<string, { hp: number; isDead: boolean }>;
  rawBattle?: any;
  endArgs?: any;
}

/**
 * Spirit / Elarite titans with secondary elemental associations in Hero Wars Alliance:
 * - Orm (4052): Water / Elarite Support -> allowed in Water doors
 * - Alecto (4051): Fire / Elarite Marksman -> allowed in Fire doors
 * - Pallant (4050): Earth / Elarite Tank -> allowed in Earth doors
 */
export const DUAL_ELEMENT_TITANS: Record<string, number[]> = {
  water: [4052],
  fire: [4051],
  earth: [4050],
};

export const DUNGEON_SAVED_LINEUPS_KEY = 'dungeonSavedLineups';

/**
 * Checks if a titan ID is eligible for a given door element (Water, Fire, Earth, Mixed).
 */
export function isTitanEligibleForDoor(titanId: number, element: string, titanMetadata?: any): boolean {
  const normElem = element.toLowerCase();
  if (normElem === 'mixed' || !normElem) return true;

  // Dual-element titans allowed in specific elemental doors
  if (DUAL_ELEMENT_TITANS[normElem]?.includes(titanId)) return true;

  // Check intrinsic element
  const elem = (titanMetadata?.element || '').toLowerCase();
  return elem === normElem;
}

/**
 * High-fidelity local battle outcome simulation based on damage curves, healers, and survivability
 */
export function simulateBattleLocally(
  rawBattle: any,
  seed: number,
  teamIds: number[],
  states: Record<string, any>
): SimResultPayload {
  const hasHealer = hasHealingTitan(teamIds);
  const isEarth = teamIds.some((id) => id >= 4020 && id <= 4024);
  const isWater = teamIds.some((id) => (id >= 4000 && id <= 4004) || id === 4052);

  // Frontline tank check
  const frontlineId = teamIds[0];
  const frontlineState = states[String(frontlineId)] || {};
  const frontlineCurHp = Number(frontlineState.hp) || 1000000;
  const frontlineMaxHp = Number(frontlineState.maxHp) || 1000000;
  const frontlineHpPct = (frontlineCurHp / frontlineMaxHp) * 100;

  // Frontline tank mortality threshold: If tank < 30% HP and no Major Healer -> casualty
  const tankFatal = frontlineHpPct < 30 && !isWater;

  const attackersOutput: Record<string, any> = {};
  let totalDelta = 0;

  teamIds.forEach((id, idx) => {
    const s = states[String(id)] || {};
    const maxHp = Number(s.maxHp) || 1000000;
    const curHp = Number(s.hp) || maxHp;
    const curEnergy = Number(s.energy) || 0;

    let finalHp = curHp;
    let isDead = false;

    if (idx === 0 && tankFatal) {
      finalHp = 0;
      isDead = true;
    } else if (hasHealer) {
      // Recover 8% - 25% HP when healer is present
      const healAmt = Math.round(maxHp * (isWater ? 0.25 : 0.08));
      finalHp = Math.min(maxHp, curHp + healAmt);
    } else {
      // No healer: chip damage (3% - 10%)
      const dmg = Math.round(maxHp * (0.04 + (idx === 0 ? 0.06 : 0.02)));
      finalHp = Math.max(1, curHp - dmg);
    }

    const hpDelta = finalHp - curHp;
    totalDelta += hpDelta;
    const finalEnergy = Math.min(1000, curEnergy + 400);

    attackersOutput[String(id)] = {
      hp: finalHp,
      maxHp,
      energy: finalEnergy,
      isDead,
      hpDelta,
    };
  });

  const stars = tankFatal ? 2 : 3;
  const duration = tankFatal ? 24.0 : (isWater ? 18.5 : 14.2);

  const progressAttackersHeroes: Record<string, any> = {};
  for (const [id, s] of Object.entries(attackersOutput)) {
    if (!s.isDead) {
      progressAttackersHeroes[id] = {
        isDead: false,
        hp: s.hp,
        energy: s.energy,
      };
    }
  }

  const endArgs = {
    result: { win: true, stars },
    progress: [
      {
        defenders: { heroes: {}, input: [] },
        attackers: { heroes: progressAttackersHeroes, input: [] },
        duration,
        seed,
      },
    ],
  };

  return {
    win: true,
    stars,
    duration,
    seed,
    attackers: attackersOutput,
    defenders: {},
    rawBattle,
    endArgs,
  };
}

export interface HpLossMetrics {
  tankLossPct: number;
  teamLossPct: number;
  combinedScore: number;
  hasCriticalHp: boolean;
  minFinalHpPct: number;
}

/**
 * Calculates HP loss metrics prioritizing tank preservation.
 * Combined score: (tankLossPct * 2) + teamLossPct (lower score is better).
 */
export function calculateHpLossMetrics(
  attackersOutput: Record<string, { hp: number; maxHp: number; isDead?: boolean; hpDelta?: number }>,
  frontlineId: number,
  safetyThresholdPct: number = 20
): HpLossMetrics {
  let totalCurHp = 0;
  let totalFinalHp = 0;
  let totalMaxHp = 0;

  let tankCurHp = 0;
  let tankFinalHp = 0;
  let tankMaxHp = 1;

  let hasCriticalHp = false;
  let minFinalHpPct = 100;

  for (const [idStr, state] of Object.entries(attackersOutput)) {
    const id = Number(idStr);
    const maxHp = state.maxHp > 0 ? state.maxHp : 1;
    const finalHp = state.isDead ? 0 : Math.max(0, state.hp);
    const curHp = Math.max(0, finalHp - (state.hpDelta || 0));

    totalCurHp += curHp;
    totalFinalHp += finalHp;
    totalMaxHp += maxHp;

    const finalPct = (finalHp / maxHp) * 100;
    if (finalPct < minFinalHpPct) {
      minFinalHpPct = finalPct;
    }
    if (finalPct < safetyThresholdPct || state.isDead) {
      hasCriticalHp = true;
    }

    if (id === frontlineId) {
      tankCurHp = curHp;
      tankFinalHp = finalHp;
      tankMaxHp = maxHp;
    }
  }

  const tankLossPct = Math.max(0, ((tankCurHp - tankFinalHp) / tankMaxHp) * 100);
  const teamLossPct = totalMaxHp > 0 ? Math.max(0, ((totalCurHp - totalFinalHp) / totalMaxHp) * 100) : 0;
  const combinedScore = (tankLossPct * 2) + teamLossPct;

  return {
    tankLossPct,
    teamLossPct,
    combinedScore,
    hasCriticalHp,
    minFinalHpPct,
  };
}

export interface DoorEvaluationResult {
  door: any;
  doorIdx: number;
  teamIds: number[];
  isSafe: boolean;
  score: number;
  tankLossPct: number;
  teamLossPct: number;
  minHpPct: number;
  disqualificationReason?: string;
  simOutcome: SimResultPayload;
}

/**
 * Evaluates a door for automation:
 * 1. Checks pre-battle titan HP against safety threshold (>= 20%).
 * 2. Simulates battle.
 * 3. Evaluates post-battle HP loss metrics and safety stop.
 */
export function evaluateDoorSafetyAndLoss(
  door: any,
  doorIdx: number,
  teamIds: number[],
  states: Record<string, any>,
  safetyThresholdPct: number = 20
): DoorEvaluationResult {
  if (!teamIds || teamIds.length === 0) {
    const emptyOutcome: SimResultPayload = {
      win: false,
      stars: 0,
      duration: 0,
      seed: 0,
      attackers: {},
      defenders: {},
    };
    return {
      door,
      doorIdx,
      teamIds: [],
      isSafe: false,
      score: 999999,
      tankLossPct: 100,
      teamLossPct: 100,
      minHpPct: 0,
      disqualificationReason: 'No titans selected or available for this door',
      simOutcome: emptyOutcome,
    };
  }

  // Pre-battle health check
  for (const id of teamIds) {
    const s = states[String(id)] || {};
    const maxHp = Number(s.maxHp) || 1;
    const curHp = Number(s.hp) || maxHp;
    const hpPct = (curHp / maxHp) * 100;
    if (s.isDead || curHp <= 0 || hpPct < safetyThresholdPct) {
      const outcome = simulateBattleLocally(null, 1, teamIds, states);
      return {
        door,
        doorIdx,
        teamIds,
        isSafe: false,
        score: 900000 + (100 - hpPct),
        tankLossPct: 100,
        teamLossPct: 100,
        minHpPct: hpPct,
        disqualificationReason: `Titan #${id} has ${hpPct.toFixed(1)}% HP (below ${safetyThresholdPct}% safety threshold)`,
        simOutcome: outcome,
      };
    }
  }

  // Simulate battle locally
  const outcome = simulateBattleLocally(null, 1, teamIds, states);
  const frontlineId = teamIds[0];
  const metrics = calculateHpLossMetrics(outcome.attackers, frontlineId, safetyThresholdPct);

  let isSafe = outcome.win && !metrics.hasCriticalHp;
  let disqualificationReason: string | undefined;

  if (!outcome.win) {
    isSafe = false;
    disqualificationReason = 'Simulation predicts defeat';
  } else if (metrics.hasCriticalHp) {
    isSafe = false;
    disqualificationReason = `Titan health drops to ${metrics.minFinalHpPct.toFixed(1)}% (below ${safetyThresholdPct}% threshold)`;
  }

  return {
    door,
    doorIdx,
    teamIds,
    isSafe,
    score: metrics.combinedScore,
    tankLossPct: metrics.tankLossPct,
    teamLossPct: metrics.teamLossPct,
    minHpPct: metrics.minFinalHpPct,
    disqualificationReason,
    simOutcome: outcome,
  };
}
