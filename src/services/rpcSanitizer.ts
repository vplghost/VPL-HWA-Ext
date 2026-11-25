/**
 * Pure RPC response sanitizer that ONLY mutates payloads when known
 * server-side data corruption would crash the Unity WebGL client.
 *
 * Specifically guards `PlayerTeamData.createTeam()` against
 * `DataObject+ValueObject<T>.get_Keys()` throwing
 * `System.InvalidOperationException` during `GameModel.OnLoginComplete`.
 */

export const MULTI_TEAM_KEYS = new Set<string>([
  'grand',
  'clan_boss',
  'champClanDefence_heroes',
]);

export interface SanitizeTeamGetAllResult {
  mutated: boolean;
  fixes: string[];
}

/**
 * Fast string pre-check so non-`teamGetAll` RPCs pay zero JSON parsing cost.
 */
export function hasTeamGetAllRequest(reqText: string | null | undefined): boolean {
  return typeof reqText === 'string' && reqText.includes('"teamGetAll"');
}

/**
 * Inspects a parsed RPC response envelope (`{ results: [...] }`) for a
 * `teamGetAll` call matching `reqText`.
 *
 * - Returns `{ mutated: false, fixes: [] }` without modifying `parsed` when
 *   all team entries are valid.
 * - Mutates `parsed` in place and returns `{ mutated: true, fixes }` ONLY
 *   when a corrupted entry is detected (e.g., flat 1D array in a multi-team
 *   slot like `grand`, mixed primitive elements in a multi-team slot, or a
 *   bare scalar/primitive where Unity expects a collection).
 */
export function sanitizeTeamGetAllRpcPayload(
  reqText: string | null | undefined,
  parsed: any
): SanitizeTeamGetAllResult {
  if (!hasTeamGetAllRequest(reqText) || !Array.isArray(parsed?.results)) {
    return { mutated: false, fixes: [] };
  }

  let teamIdent: string | null = null;
  try {
    const reqJson = JSON.parse(reqText as string);
    const teamCall = Array.isArray(reqJson?.calls)
      ? reqJson.calls.find((c: any) => c?.name === 'teamGetAll')
      : null;
    if (teamCall?.ident && typeof teamCall.ident === 'string') {
      teamIdent = teamCall.ident;
    }
  } catch {
    return { mutated: false, fixes: [] };
  }

  if (!teamIdent) return { mutated: false, fixes: [] };

  const resItem = parsed.results.find((r: any) => r?.ident === teamIdent);
  const teamsObj = resItem?.result?.response;
  if (!teamsObj || typeof teamsObj !== 'object' || Array.isArray(teamsObj)) {
    return { mutated: false, fixes: [] };
  }

  const fixes: string[] = [];

  for (const key of Object.keys(teamsObj)) {
    const val = teamsObj[key];
    if (val === null || val === undefined) continue;

    // Any bare scalar/primitive where DataObject expects a map/array will throw ValueObject<T>.get_Keys()
    if (typeof val !== 'object') {
      teamsObj[key] = [];
      fixes.push(`${key}:replaced-scalar`);
      continue;
    }

    if (MULTI_TEAM_KEYS.has(key) && Array.isArray(val) && val.length > 0) {
      const hasPrimitiveElement = val.some(
        (el: any) => el === null || typeof el !== 'object'
      );
      if (!hasPrimitiveElement) continue;

      const allPrimitives = val.every(
        (el: any) => el !== null && typeof el !== 'object'
      );
      if (allPrimitives) {
        // Classic corruption: 1D hero ID array [16, 54, 79, 72, 60] stored in a 2D multi-team key
        teamsObj[key] = [val];
        fixes.push(`${key}:wrapped-1d-to-2d`);
      } else {
        // Mixed array: keep only valid sub-team objects/arrays so .Keys never hits a ValueObject<T>
        teamsObj[key] = val.filter((el: any) => el !== null && typeof el === 'object');
        fixes.push(`${key}:filtered-invalid-elements`);
      }
    }
  }

  return { mutated: fixes.length > 0, fixes };
}
