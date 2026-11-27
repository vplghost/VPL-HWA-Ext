import {
  hasHealingTitan,
  hasMajorHealingTitan,
  MAJOR_HEALING_TITAN_IDS,
  MINOR_HEALING_TITAN_IDS,
  extractEnemyUnits,
} from './dungeonBattleHistory.ts';

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
 * Checks if a titan ID is eligible for a given door element (Water, Fire, Earth, Neutral).
 * Server official naming for multi-element doors is "neutral" (attackerType: "neutral").
 * Also accepts "mixed" for backwards compatibility.
 */
export function isTitanEligibleForDoor(titanId: number, element: string, titanMetadata?: any): boolean {
  const normElem = element.toLowerCase();
  if (normElem === 'neutral' || normElem === 'mixed' || !normElem) return true;

  // Dual-element titans allowed in specific elemental doors
  if (DUAL_ELEMENT_TITANS[normElem]?.includes(titanId)) return true;

  // Check intrinsic element
  const elem = (titanMetadata?.element || '').toLowerCase();
  return elem === normElem;
}

export interface SimErrorDetail {
  phase?: string;
  kind?: 'managed' | 'trap' | 'generic';
  message: string;
  rawMessage?: string;
  context?: {
    battleType?: string;
    seed?: number;
    attackerIds?: string[];
    defenderCount?: number;
  };
  stack?: string;
}

export class BattleSimError extends Error {
  detail?: SimErrorDetail;
  constructor(message: string, detail?: SimErrorDetail) {
    super(message);
    this.name = 'BattleSimError';
    this.detail = detail;
  }
}

/**
 * Simulates a battle outcome strictly using the game's official Unity WebAssembly engine.
 * Completely eliminates empirical/heuristic formulas to prevent invalid battle desyncs with server.
 * If Unity engine is not available or fails, throws a BattleSimError so caller can notify the user immediately.
 */
export async function simulateBattleWithUnity(
  rawBattle: any,
  seed: number
): Promise<SimResultPayload> {
  const effectiveSeed = (Number.isFinite(seed) && seed > 0 ? seed : Number(rawBattle?.seed)) || Math.floor(Math.random() * 1000000000);

  // 1. Direct in-page Unity simulation (when running inside the game tab)
  if (typeof window !== 'undefined' && typeof (window as any).__hwaSimulateBattle === 'function') {
    try {
      const directOutcome = await (window as any).__hwaSimulateBattle(rawBattle, effectiveSeed);
      if (directOutcome) return directOutcome;
    } catch (err: any) {
      if (err instanceof BattleSimError) throw err;
      throw new BattleSimError(err?.message || String(err), err?.errorDetail);
    }
  }

  // 2. Cross-context RPC via chrome.runtime messaging (when running from Popup, Modal, or Background Worker)
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const resp: any = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            kind: 'simulate-battle',
            rawBattle,
            seed: effectiveSeed,
          },
          (response) => {
            const err = chrome.runtime?.lastError;
            if (err) {
              resolve({ ok: false, error: err.message || 'Extension runtime message failed.' });
            } else {
              resolve(response || { ok: false, error: 'No response from game tab.' });
            }
          }
        );
      } catch (err: any) {
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });

    if (resp?.ok && resp?.result) {
      return resp.result;
    }
    const errMsg = resp?.error || 'Unity Engine battle simulation is unavailable. Please ensure the game tab is open and loaded.';
    throw new BattleSimError(errMsg, resp?.errorDetail);
  }

  throw new BattleSimError('Unity Engine battle simulation requires active game tab or extension environment.');
}

/**
 * Legacy heuristic simulator has been removed per user mandate:
 * "chỉ sử dụng unity engine để giả lập trận đấu, loại bỏ toàn bộ phương pháp kinh nghiệm".
 */
export function simulateBattleLocally(
  _rawBattle?: any,
  _seed?: number,
  _teamIds?: number[],
  _states?: Record<string, any>
): never {
  throw new Error('Heuristic battle simulation has been removed. Only Unity Engine simulation is supported.');
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
  const emptyOutcome: SimResultPayload = {
    win: false,
    stars: 0,
    duration: 0,
    seed: 0,
    attackers: {},
    defenders: {},
  };

  if (!teamIds || teamIds.length === 0) {
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

  // Pre-battle health check: enforce safety threshold strictly
  for (const id of teamIds) {
    const s = states[String(id)] || {};
    const maxHp = Number(s.maxHp) || 1;
    const curHp = Number(s.hp != null ? s.hp : maxHp);
    const hpPct = (curHp / maxHp) * 100;
    if (s.isDead || curHp <= 0 || hpPct < safetyThresholdPct) {
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
        simOutcome: emptyOutcome,
      };
    }
  }

  // Build current snapshot from authoritative game states
  const frontlineId = teamIds[0];
  const squadAttackers: Record<string, any> = {};
  let totalCurHp = 0;
  let totalMaxHp = 0;
  let minHpPct = 100;

  for (const id of teamIds) {
    const s = states[String(id)] || {};
    const maxHp = Number(s.maxHp) || 1000000;
    const curHp = Number(s.hp != null ? s.hp : maxHp);
    const hpPct = (curHp / maxHp) * 100;
    if (hpPct < minHpPct) minHpPct = hpPct;
    totalCurHp += curHp;
    totalMaxHp += maxHp;

    squadAttackers[String(id)] = {
      hp: curHp,
      maxHp,
      energy: Number(s.energy) || 0,
      isDead: Boolean(s.isDead || curHp <= 0),
      hpDelta: 0,
    };
  }

  const frontlineState = states[String(frontlineId)] || {};
  const frontlineMaxHp = Number(frontlineState.maxHp) || 1000000;
  const frontlineCurHp = Number(frontlineState.hp != null ? frontlineState.hp : frontlineMaxHp);
  const tankHpPct = (frontlineCurHp / frontlineMaxHp) * 100;
  const teamAvgHpPct = totalMaxHp > 0 ? (totalCurHp / totalMaxHp) * 100 : 100;

  // Door ranking score: lower score is better (heavily favors higher tank HP% and team HP%)
  const score = Math.round((100 - tankHpPct) * 2 + (100 - teamAvgHpPct));

  const stateOutcome: SimResultPayload = {
    win: true,
    stars: 3,
    duration: 14,
    seed: 0,
    attackers: squadAttackers,
    defenders: {},
  };

  return {
    door,
    doorIdx,
    teamIds,
    isSafe: true,
    score,
    tankLossPct: 0,
    teamLossPct: 0,
    minHpPct,
    simOutcome: stateOutcome,
  };
}

/**
 * Normalizes `progress[0].attackers.heroes` and `defenders.heroes` returned by Unity's
 * `DataObject_asJson`.
 *
 * In Hero Wars: Alliance (PHP/Unity associative map convention), an empty map (0 surviving
 * units) is frequently serialized as an empty JSON array `[]` or omitted.
 * - On defeat (`win === false`), an empty/missing `attackers.heroes` represents a total wipe
 *   (all attackers dead) and normalizes cleanly to `{}` so callers (Dual-Door, Best-of-10,
 *   PvP/Arena Optimizer) treat it as a normal loss instead of crashing `EXTRACT_BATTLE_RESULT`.
 * - On victory (`win === true`), missing/empty/malformed `attackers.heroes` is impossible and
 *   MUST throw to preserve the P1-14 anti-wipe guard before `dungeonEndBattle`.
 */
export function resolveSimulatedProgressHeroes(
  parsedProgress: any,
  win: boolean,
  rawJsonSnippet?: string
): { attackersHeroes: Record<string, any>; defendersHeroes: Record<string, any> } {
  const rawAtt = parsedProgress?.attackers?.heroes;
  const rawDef = parsedProgress?.defenders?.heroes;

  const defendersHeroes: Record<string, any> =
    rawDef && typeof rawDef === 'object' && !Array.isArray(rawDef) ? rawDef : {};

  if (rawAtt && typeof rawAtt === 'object' && !Array.isArray(rawAtt)) {
    if (win && Object.keys(rawAtt).length === 0) {
      throw new Error(
        `Unity simulation returned empty attackers.heroes on a winning battle (win=true)${rawJsonSnippet ? ` [${rawJsonSnippet.slice(0, 140)}]` : ''}`
      );
    }
    return { attackersHeroes: rawAtt, defendersHeroes };
  }

  // On defeat (total wipe), Unity/PHP serializes empty maps as `[]` or omits them.
  const isEmptyOrMissingAtt =
    rawAtt == null || (Array.isArray(rawAtt) && rawAtt.length === 0);
  if (!win && isEmptyOrMissingAtt) {
    return { attackersHeroes: {}, defendersHeroes };
  }

  const shape =
    !parsedProgress
      ? 'progress=null'
      : !parsedProgress.attackers
        ? 'attackers=missing'
        : Array.isArray(rawAtt)
          ? `attackers.heroes=Array(${rawAtt.length})`
          : `attackers.heroes=${typeof rawAtt}`;
  throw new Error(
    `Unity simulation returned missing or malformed battle progress (attackers.heroes unavailable: win=${win}, ${shape})${rawJsonSnippet ? ` [${rawJsonSnippet.slice(0, 140)}]` : ''}`
  );
}
