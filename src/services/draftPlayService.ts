/**
 * Pure Legends Draft Headless Play Service (`draftPlayService.ts`).
 *
 * Verified 6-RPC contract (from `sample-data/legends-draft/draft-lifecycle-samples.json`):
 * - `randomDraft_getInfo`     {}
 * - `randomDraft_register`    {}
 * - `randomDraft_saveDefence` { heroes: [id1, id2, id3, id4, id5] }
 * - `randomDraft_saveAttack`  { heroes: [id1, id2, id3, id4, id5] }
 * - `randomDraft_startBattle` {}
 * - `randomDraft_result`      { matchId }
 *
 * Zero-Emerald safety guarantee: never builds or dispatches chip-purchase or winstreak-restore RPCs.
 */

export const DRAFT_AUTO_FINISH_STORAGE_KEY = 'legendsDraftAutoFinishBattle';

export interface DraftRpcCall {
  name:
    | 'randomDraft_getInfo'
    | 'randomDraft_register'
    | 'randomDraft_saveDefence'
    | 'randomDraft_saveAttack'
    | 'randomDraft_startBattle'
    | 'randomDraft_result';
  args: Record<string, any>;
}

export interface DraftLineupValidationResult {
  valid: boolean;
  error: string | null;
  normalizedHeroes: number[];
}

export interface DraftMatchOutcome {
  matchId: number | null;
  win: boolean;
  result: number;
  resultDetails?: number | null;
  userRating: number | null;
  enemyRating: number | null;
  ratingDelta: number | null;
  draftBpExp: number;
}

/**
 * Strictly validates a 5-hero Legends Draft lineup against the decrypted 5-round candidate matrix
 * (and optional swap pool) before sending `randomDraft_saveDefence` / `randomDraft_saveAttack`.
 */
export function validateDraftLineup(
  pickedIds: Array<number | null | undefined>,
  heroSteps: number[][] = [],
  swapHeroIds: number[] = []
): DraftLineupValidationResult {
  if (!Array.isArray(pickedIds) || pickedIds.length !== 5) {
    return {
      valid: false,
      error: 'Select exactly 5 heroes (1 per round) before submitting.',
      normalizedHeroes: [],
    };
  }

  const normalized: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < 5; i++) {
    const num = Number(pickedIds[i]);
    if (!Number.isInteger(num) || num <= 0) {
      return {
        valid: false,
        error: `Round ${i + 1} has no hero selected.`,
        normalizedHeroes: [],
      };
    }
    if (seen.has(num)) {
      return {
        valid: false,
        error: `Duplicate hero #${num} selected across rounds.`,
        normalizedHeroes: [],
      };
    }
    seen.add(num);
    normalized.push(num);
  }

  if (Array.isArray(heroSteps) && heroSteps.length >= 5) {
    const swapSet = new Set(
      Array.isArray(swapHeroIds) ? swapHeroIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
    );
    for (let i = 0; i < 5; i++) {
      const roundPool = Array.isArray(heroSteps[i]) ? heroSteps[i].map(Number) : [];
      if (roundPool.length > 0 && !roundPool.includes(normalized[i]) && !swapSet.has(normalized[i])) {
        return {
          valid: false,
          error: `Hero #${normalized[i]} is not in Round ${i + 1}'s candidate pool.`,
          normalizedHeroes: [],
        };
      }
    }
  }

  return {
    valid: true,
    error: null,
    normalizedHeroes: normalized,
  };
}

/**
 * Maps a 5-hero team (e.g. from Top-3 Recommendations) into exact `[round0..round4]` pick slots
 * matching `heroSteps[0..4]` (with optional swap fallback). Used by 1-Click Pick Team.
 */
export function mapTeamToRoundPicks(
  teamHeroIds: number[],
  heroSteps: number[][],
  swapHeroIds: number[] = []
): Array<number | null> {
  const result: Array<number | null> = [null, null, null, null, null];
  if (!Array.isArray(teamHeroIds) || teamHeroIds.length === 0) return result;
  const cleanTeam = teamHeroIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!Array.isArray(heroSteps) || heroSteps.length < 5) {
    for (let i = 0; i < Math.min(5, cleanTeam.length); i++) result[i] = cleanTeam[i];
    return result;
  }

  const swapSet = new Set(
    Array.isArray(swapHeroIds) ? swapHeroIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
  );

  // Backtracking exact assignment so heroes appearing in multiple rounds or swap pool map cleanly
  const used = new Set<number>();
  function assign(roundIdx: number): boolean {
    if (roundIdx === 5) return true;
    const pool = Array.isArray(heroSteps[roundIdx]) ? heroSteps[roundIdx].map(Number) : [];
    for (const hId of cleanTeam) {
      if (used.has(hId)) continue;
      if (pool.includes(hId) || swapSet.has(hId)) {
        used.add(hId);
        result[roundIdx] = hId;
        if (assign(roundIdx + 1)) return true;
        used.delete(hId);
        result[roundIdx] = null;
      }
    }
    return false;
  }

  if (assign(0)) return result;

  // Partial best-effort fallback
  const fallback: Array<number | null> = [null, null, null, null, null];
  const usedFallback = new Set<number>();
  for (let r = 0; r < 5; r++) {
    const pool = Array.isArray(heroSteps[r]) ? heroSteps[r].map(Number) : [];
    const match = cleanTeam.find((id) => !usedFallback.has(id) && (pool.includes(id) || swapSet.has(id)));
    if (match != null) {
      fallback[r] = match;
      usedFallback.add(match);
    }
  }
  return fallback;
}

export function buildDraftGetInfoCall(): DraftRpcCall {
  return { name: 'randomDraft_getInfo', args: {} };
}

export function buildDraftRegisterCall(): DraftRpcCall {
  return { name: 'randomDraft_register', args: {} };
}

export function buildDraftSaveLineupCall(phase: 'defense' | 'attack', heroes: number[]): DraftRpcCall {
  return {
    name: phase === 'attack' ? 'randomDraft_saveAttack' : 'randomDraft_saveDefence',
    args: { heroes: heroes.map(Number) },
  };
}

export function buildDraftStartBattleCall(): DraftRpcCall {
  return { name: 'randomDraft_startBattle', args: {} };
}

export function buildDraftResultCall(matchId: number): DraftRpcCall {
  return { name: 'randomDraft_result', args: { matchId: Number(matchId) } };
}

/**
 * Normalizes `randomDraft_result` response (or latest `journal` entry) into a displayable outcome.
 */
export function parseDraftMatchOutcome(resp: any): DraftMatchOutcome | null {
  if (!resp || typeof resp !== 'object') return null;
  const hasResult = resp.result != null && Number.isFinite(Number(resp.result));
  if (!hasResult) return null;
  const resultNum = Number(resp.result);
  const matchId = resp.matchId != null && Number.isFinite(Number(resp.matchId)) ? Number(resp.matchId) : null;
  const rating = resp.rating && typeof resp.rating === 'object' ? resp.rating : {};
  const userRating = rating.userRating != null && Number.isFinite(Number(rating.userRating)) ? Number(rating.userRating) : null;
  const enemyRating = rating.enemyRating != null && Number.isFinite(Number(rating.enemyRating)) ? Number(rating.enemyRating) : null;
  const ratingDelta = rating.userDifRating != null && Number.isFinite(Number(rating.userDifRating)) ? Number(rating.userDifRating) : null;
  const draftBpExp = Number(resp.reward?.draftBpExp ?? 0) || 0;
  return {
    matchId,
    win: resultNum === 0,
    result: resultNum,
    resultDetails: resp.resultDetails != null ? Number(resp.resultDetails) : null,
    userRating,
    enemyRating,
    ratingDelta,
    draftBpExp,
  };
}

/**
 * Reads remaining Legends Draft Chips (`resource:refillable:60`) from RPC cache.
 */
export function getDraftChipsCount(cache: Record<string, any> | null | undefined): number | null {
  if (!cache || typeof cache !== 'object') return null;
  const entry = cache['resource:refillable:60'];
  if (entry?.data?.amount != null && Number.isFinite(Number(entry.data.amount))) {
    return Math.max(0, Math.floor(Number(entry.data.amount)));
  }
  const refillables = cache.userGetInfo?.data?.refillable;
  if (Array.isArray(refillables)) {
    const found = refillables.find((r: any) => Number(r?.id) === 60);
    if (found?.amount != null && Number.isFinite(Number(found.amount))) {
      return Math.max(0, Math.floor(Number(found.amount)));
    }
  }
  return null;
}

/**
 * Determines whether the user can start a new Legends Draft match without spending Emeralds.
 */
export function canStartDraftMatch(
  stageId: number | null | undefined,
  draftChips: number | null | undefined
): boolean {
  const isIdleOrDone = stageId == null || stageId === 0 || stageId === 7;
  if (!isIdleOrDone) return false;
  if (draftChips != null && draftChips <= 0) return false;
  return true;
}

export const DRAFT_BATTLE_FEATURES = [
  'battleFeature_202',
  'battleFeature_204',
  'battleFeature_207',
  'battleFeature_208',
  'battleFeature_209',
  'battleFeature_212',
  'battleFeature_213',
  'battleFeature_214',
] as const;

export interface DraftBattleHeroInput {
  id: number;
  star?: number;
  power?: number;
  level?: number;
  color?: number;
}

function buildStandardizedDraftHero(
  input: DraftBattleHeroInput,
  cachedHero?: Record<string, any> | null
): Record<string, any> {
  const id = Number(input.id);
  const star = Math.max(3, Math.min(6, Number(input.star) || 3));
  const power = Math.max(100000, Number(input.power) || 180000);

  // Elevate all known hero skills to Lv. 120 (Legends Draft max skill rule)
  const skills: Record<string, number> = {};
  if (cachedHero?.skills && typeof cachedHero.skills === 'object' && !Array.isArray(cachedHero.skills)) {
    for (const k of Object.keys(cachedHero.skills)) {
      skills[String(k)] = 120;
    }
  }

  // Elevate all known hero skins to Lv. 60 and build object-shaped skinsInfo (required by Unity drafts engine)
  const skins: Record<string, number> = {};
  const skinsInfo: Record<string, { rank: number; skinColorsIds: number[] }> = {};
  const baseSkinId = Number(cachedHero?.baseSkinId) || id;
  if (cachedHero?.skins && typeof cachedHero.skins === 'object' && !Array.isArray(cachedHero.skins)) {
    for (const k of Object.keys(cachedHero.skins)) {
      skins[String(k)] = 60;
      skinsInfo[String(k)] = { rank: 0, skinColorsIds: [] };
    }
  }
  if (Object.keys(skins).length === 0) {
    skins[String(baseSkinId)] = 60;
    skinsInfo[String(baseSkinId)] = { rank: 0, skinColorsIds: [] };
  }

  return {
    id,
    xp: 2948945,
    level: 120,
    color: 16,
    slots: [0, 0, 0, 0, 0, 0],
    skills,
    power,
    star,
    runes: [0, 0, 0, 0, 0],
    hero_runes: [40, 40, 40, 40, 40],
    skins,
    currentSkin: 0,
    titanGiftLevel: 30,
    titanCoinsSpent: null,
    artifacts: [
      { level: 100, star: 6, artifactType: 'weapon' },
      { level: 100, star: 6, artifactType: 'book' },
      { level: 100, star: 6, artifactType: 'ring' },
    ],
    baseSkinId,
    skinsInfo,
    currentSkinRank: 0,
    patronLevel: 0,
    upgradedSkills: [],
    GlobalAttack: 130,
    GlobalDefence: 30,
    skin: 0,
    skinRank: 0,
    currentSkinColorId: 0,
  };
}

/**
 * Builds a Legends Draft `rawBattle` payload matching live server `attackReplay` standardization:
 * - Level 120, Orange+4 (color 16), Max Skills (120), Max Glyphs (40x5), Gift of Elements 30,
 *   3x Lv.100 6-star Artifacts, Lv.60 Skins with object-shaped `skinsInfo`.
 * - Star uses `Math.max(3, hero.star)` (default 3★, keeps player star if > 3).
 * - Strictly isolates Attacker and Defender maps so mirror heroes never overwrite each other's star/power.
 */
export function buildSyntheticDraftBattle(
  attackerHeroes: DraftBattleHeroInput[],
  defenderHeroes: DraftBattleHeroInput[],
  seed: number,
  opts: {
    playerHeroCache?: Record<string, any> | null;
    userId?: string | number;
    matchId?: number | null;
  } = {}
): Record<string, any> {
  const heroCache = opts.playerHeroCache && typeof opts.playerHeroCache === 'object' ? opts.playerHeroCache : {};
  const lookupCached = (id: number) => heroCache[id] ?? heroCache[String(id)] ?? null;

  const attackers: Record<string, any> = {};
  for (const h of attackerHeroes) {
    const nId = Number(h?.id);
    if (!Number.isInteger(nId) || nId <= 0) continue;
    attackers[String(nId)] = buildStandardizedDraftHero(h, lookupCached(nId));
  }

  const defenders: Record<string, any> = {};
  for (const h of defenderHeroes) {
    const nId = Number(h?.id);
    if (!Number.isInteger(nId) || nId <= 0) continue;
    defenders[String(nId)] = buildStandardizedDraftHero(h, lookupCached(nId));
  }

  return {
    userId: String(opts.userId ?? '1'),
    typeId: Number(opts.matchId) || 1,
    type: 'drafts',
    seed: (Number(seed) >>> 0) || 1,
    startTime: Math.floor(Date.now() / 1000),
    effects: [],
    reward: [],
    battleFeatures: [...DRAFT_BATTLE_FEATURES],
    battleEffects: {},
    attackers,
    defenders: [defenders],
  };
}
