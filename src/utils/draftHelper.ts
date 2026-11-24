import type { DraftDto, DraftHeroCandidate, DraftSessionData } from '../types/game/draft.ts';
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

/**
 * Extract 5x3 candidate hero IDs matrix from flexible decrypted DraftDto structures
 */
export function extractDraftHeroSteps(dto: any): number[][] {
  if (!dto || typeof dto !== 'object') return [];
  const rawSteps = dto.playerTeam?.heroes ?? dto.heroes ?? dto.steps ?? null;
  if (!rawSteps) return [];
  const stepList = Array.isArray(rawSteps)
    ? rawSteps
    : (typeof rawSteps === 'object' ? Object.values(rawSteps) : []);
  return stepList
    .map((step: any) => {
      const items = Array.isArray(step)
        ? step
        : (step && typeof step === 'object' ? Object.values(step) : []);
      return items
        .map((item: any) => Number(typeof item === 'object' && item !== null ? (item.id ?? item.heroId) : item))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    })
    .filter((step: number[]) => step.length > 0);
}

/**
 * Transform 5 columns (rounds) of 3 candidate IDs into a 5-step matrix of DraftHeroCandidate objects
 */
export function buildCandidateMatrix(
  heroSteps: number[][] | undefined,
  pickedIds: number[] = []
): DraftHeroCandidate[][] {
  if (!Array.isArray(heroSteps) || heroSteps.length === 0) {
    return [];
  }

  const pickedSet = new Set(pickedIds.filter((id) => Number.isFinite(id) && id > 0));

  return heroSteps.slice(0, 5).map((step) => {
    if (!Array.isArray(step)) return [];
    return step.slice(0, 3).map((heroId) => {
      const meta = getHeroMetadata(heroId);
      const name = meta?.name || getHeroName(heroId) || `Hero #${heroId}`;
      return {
        id: heroId,
        name,
        avatarFile: meta?.avatarFile,
        role: meta?.role,
        class: meta?.class,
        faction: meta?.faction,
        mainStat: meta?.mainStat,
        picked: pickedSet.has(heroId)
      };
    });
  });
}
