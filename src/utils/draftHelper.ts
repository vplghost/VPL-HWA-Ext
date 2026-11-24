import type { DraftDto, DraftHeroCandidate, DraftHeroLiveStats, DraftSessionData } from '../types/game/draft.ts';
import { getHeroMetadata, getHeroName } from './metadata.ts';

export const DEFAULT_DRAFT_CONST_KEY = '307E8FB4B733591B75D74EA13946882BA59FAA3274CF815A2B8788E76403BD0F';
export const BACKUP_DRAFT_CONST_KEY = '268EA1F1B979AC33218CEF1225D1F835EA88D2C1233B8D6AFA0277FC8E30684B';

/**
 * Pure TypeScript fallback decryption for Legends Draft ciphertext (Plan B)
 */
export function decodeDraftPayload(
  base64Payload: string,
  dynamicKey: string,
  constKey: string = DEFAULT_DRAFT_CONST_KEY
): DraftDto | null {
  if (!base64Payload || !dynamicKey) return null;

  try {
    const rawDecoded = typeof atob === 'function'
      ? atob(base64Payload)
      : Buffer.from(base64Payload, 'base64').toString('binary');

    const chars: string[] = [];
    const cLen = constKey.length;
    const dLen = dynamicKey.length;

    for (let i = 0; i < rawDecoded.length; i++) {
      const inputChar = rawDecoded.charCodeAt(i);
      const constChar = constKey.charCodeAt(i % cLen);
      const dynChar = dynamicKey.charCodeAt(i % dLen);
      chars.push(String.fromCharCode(inputChar ^ constChar ^ dynChar));
    }

    const jsonStr = chars.join('');
    return JSON.parse(jsonStr) as DraftDto;
  } catch (err) {
    return null;
  }
}

/**
 * Parse plaintext JSON string from Native WASM hook into DraftDto
 */
export function parseDraftDto(jsonStr: string): { ok: boolean; draft?: DraftDto; error?: string } {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return { ok: false, error: 'Empty payload provided.' };
  }
  try {
    const parsed = JSON.parse(jsonStr) as DraftDto;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Parsed result is not an object.' };
    }
    return { ok: true, draft: parsed };
  } catch (err: any) {
    return { ok: false, error: `JSON parse error: ${err?.message || String(err)}` };
  }
}

/**
 * Format stage ID into friendly phase description, badge styling, and label (English)
 */
export function formatDraftPhase(stageId: number | null): {
  phase: DraftSessionData['phase'];
  label: string;
  badgeCls: string;
  icon: string;
} {
  switch (stageId) {
    case 1:
      return {
        phase: 'idle',
        label: 'Searching for Opponent (Matchmaking)',
        badgeCls: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        icon: '🔍'
      };
    case 2:
      return {
        phase: 'defense',
        label: 'Round 1: Defense Phase',
        badgeCls: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        icon: '🛡️'
      };
    case 3:
      return {
        phase: 'defense',
        label: 'Defense Team Submitted',
        badgeCls: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
        icon: '⏳'
      };
    case 4:
      return {
        phase: 'attack',
        label: 'Round 2: Attack Phase',
        badgeCls: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        icon: '⚔️'
      };
    case 5:
      return {
        phase: 'ready',
        label: 'Ready for Battle',
        badgeCls: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        icon: '⚡'
      };
    case 7:
      return {
        phase: 'result',
        label: 'Match Finished',
        badgeCls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        icon: '🏆'
      };
    default:
      return {
        phase: 'idle',
        label: 'Waiting for New Session (Idle)',
        badgeCls: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        icon: '💤'
      };
  }
}

function extractPoolHeroEntries(pool: any, poolName: 'base' | 'swap'): DraftHeroLiveStats[] {
  if (!pool || typeof pool !== 'object') return [];
  const rawList = Array.isArray(pool) ? pool : Object.entries(pool).map(([k, v]) => {
    if (v && typeof v === 'object') return { ...v, id: v.id ?? v.heroId ?? Number(k) };
    return { id: Number(v ?? k) };
  });
  const out: DraftHeroLiveStats[] = [];
  const seen = new Set<number>();
  for (const item of rawList) {
    const id = Number(typeof item === 'object' && item !== null ? (item.id ?? item.heroId) : item);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const entry: DraftHeroLiveStats = { id, pool: poolName };
    if (item && typeof item === 'object') {
      if (Number.isFinite(Number(item.level))) entry.level = Number(item.level);
      if (Number.isFinite(Number(item.color))) entry.color = Number(item.color);
      if (Number.isFinite(Number(item.star))) entry.star = Number(item.star);
      if (Number.isFinite(Number(item.power))) entry.power = Number(item.power);
    }
    out.push(entry);
  }
  return out;
}

function chunkIds(ids: number[], size = 3): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Extract per-hero live stats (level, color, star, power, pool) from decrypted DraftDto ({ base, swap })
 */
export function extractDraftHeroDetails(dto: any): Record<number, DraftHeroLiveStats> {
  const details: Record<number, DraftHeroLiveStats> = {};
  if (!dto || typeof dto !== 'object') return details;
  for (const entry of extractPoolHeroEntries(dto.base, 'base')) {
    details[entry.id] = entry;
  }
  for (const entry of extractPoolHeroEntries(dto.swap, 'swap')) {
    if (!details[entry.id]) details[entry.id] = entry;
  }
  return details;
}

/**
 * Extract distinct swap-pool hero IDs from decrypted DraftDto ({ base, swap })
 */
export function extractDraftSwapHeroIds(dto: any): number[] {
  if (!dto || typeof dto !== 'object') return [];
  const baseSet = new Set(extractPoolHeroEntries(dto.base, 'base').map((e) => e.id));
  return extractPoolHeroEntries(dto.swap, 'swap')
    .map((e) => e.id)
    .filter((id) => !baseSet.has(id));
}

/**
 * Extract 5x3 candidate hero IDs matrix from flexible decrypted DraftDto structures
 * Supports both legacy matrix format (playerTeam.heroes / heroes / steps)
 * and live Unity DraftsXORCipher payload format ({ base: { [heroId]: HeroObj }, swap: { ... } }).
 */
export function extractDraftHeroSteps(dto: any): number[][] {
  if (!dto || typeof dto !== 'object') return [];
  const rawSteps = dto.playerTeam?.heroes ?? dto.heroes ?? dto.steps ?? null;
  if (rawSteps) {
    const stepList = Array.isArray(rawSteps)
      ? rawSteps
      : (typeof rawSteps === 'object' ? Object.values(rawSteps) : []);
    const matrix = stepList
      .map((step: any) => {
        const items = Array.isArray(step)
          ? step
          : (step && typeof step === 'object' ? Object.values(step) : []);
        return items
          .map((item: any) => Number(typeof item === 'object' && item !== null ? (item.id ?? item.heroId) : item))
          .filter((id: number) => Number.isFinite(id) && id > 0);
      })
      .filter((step: number[]) => step.length > 0);
    if (matrix.length > 0) return matrix;
  }

  // Live Unity DraftsXORCipher format: { base: { "501": { id: 501, ... }, ... }, swap: { ... } }
  const baseEntries = extractPoolHeroEntries(dto.base, 'base');
  if (baseEntries.length > 0) {
    return chunkIds(baseEntries.map((e) => e.id), 3);
  }
  const swapEntries = extractPoolHeroEntries(dto.swap, 'swap');
  if (swapEntries.length > 0) {
    return chunkIds(swapEntries.map((e) => e.id), 3);
  }
  return [];
}

/**
 * Build a DraftHeroCandidate card from a heroId + optional live stats
 */
export function buildDraftHeroCandidate(
  heroId: number,
  pickedSet: Set<number> = new Set(),
  heroDetails?: Record<number, DraftHeroLiveStats> | null
): DraftHeroCandidate {
  const meta = getHeroMetadata(heroId);
  const name = meta?.name || getHeroName(heroId) || `Hero #${heroId}`;
  const avatarFile = meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${heroId}.png` : undefined);
  const live = heroDetails?.[heroId];
  return {
    id: heroId,
    name,
    avatarFile,
    role: meta?.role,
    class: meta?.class,
    faction: meta?.faction,
    mainStat: (meta as any)?.mainStat,
    picked: pickedSet.has(heroId),
    ...(live?.level != null ? { level: live.level } : {}),
    ...(live?.color != null ? { color: live.color } : {}),
    ...(live?.star != null ? { star: live.star } : {}),
    ...(live?.power != null ? { power: live.power } : {}),
    ...(live?.pool ? { pool: live.pool } : {}),
  };
}

/**
 * Transform columns (rounds) of candidate IDs into a matrix of DraftHeroCandidate objects
 */
export function buildCandidateMatrix(
  heroSteps: number[][] | undefined,
  pickedIds: number[] = [],
  heroDetails?: Record<number, DraftHeroLiveStats> | null
): DraftHeroCandidate[][] {
  if (!Array.isArray(heroSteps) || heroSteps.length === 0) {
    return [];
  }

  const pickedSet = new Set(pickedIds.filter((id) => Number.isFinite(id) && id > 0));

  return heroSteps.map((step) => {
    if (!Array.isArray(step)) return [];
    return step.map((heroId) => buildDraftHeroCandidate(heroId, pickedSet, heroDetails));
  });
}
