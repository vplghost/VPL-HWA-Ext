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

export interface OutgoingRpcValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Outgoing safety gate for multi-team RPC calls (`customArena_startBattle` with
 * `type: 'GrandArena'`, and `battle_teamSet` on `MULTI_TEAM_KEYS`) so extension
 * code can never dispatch a flat 1D array or corrupted team matrix to the server.
 */
export function validateOutgoingMultiTeamRpcCalls(calls: any[]): OutgoingRpcValidationResult {
  if (!Array.isArray(calls)) return { ok: true };
  for (const call of calls) {
    if (!call || typeof call !== 'object') continue;
    const name = call.name;
    const args = call.args;

    if (name === 'customArena_startBattle' && args?.type === 'GrandArena') {
      const units = args?.units;
      if (!Array.isArray(units) || units.length !== 3) {
        return {
          ok: false,
          error: `Blocked outgoing GrandArena customArena_startBattle: units must be a 2D array of 3 teams (got ${Array.isArray(units) ? units.length : typeof units}).`,
        };
      }
      const seen = new Set<number>();
      for (let i = 0; i < 3; i++) {
        const sub = units[i];
        if (!Array.isArray(sub) || sub.length === 0 || sub.length > 5) {
          return {
            ok: false,
            error: `Blocked outgoing GrandArena customArena_startBattle: team #${i + 1} must be an array of 1..5 hero IDs.`,
          };
        }
        for (const rawId of sub) {
          const id = Number(rawId);
          if (!Number.isInteger(id) || id <= 0) {
            return {
              ok: false,
              error: `Blocked outgoing GrandArena customArena_startBattle: team #${i + 1} has invalid hero ID (${String(rawId)}).`,
            };
          }
          if (seen.has(id)) {
            return {
              ok: false,
              error: `Blocked outgoing GrandArena customArena_startBattle: hero #${id} is duplicated across teams.`,
            };
          }
          seen.add(id);
        }
      }
    }

    if (name === 'battle_teamSet' && typeof args?.key === 'string' && MULTI_TEAM_KEYS.has(args.key)) {
      const units = args?.units;
      if (!Array.isArray(units) || units.length === 0 || units.some((sub: any) => !Array.isArray(sub) || sub.some((id: any) => !Number.isInteger(Number(id)) || Number(id) <= 0))) {
        return {
          ok: false,
          error: `Blocked outgoing battle_teamSet(${args.key}): multi-team key requires a 2D array of positive integer hero IDs.`,
        };
      }
    }

    if (name === 'heroChest_openChest') {
      const isStrictFreeVideo =
        args?.free === true &&
        args?.video === true &&
        Number(args?.count) === 1 &&
        String(args?.costId ?? '') === '';
      if (!isStrictFreeVideo) {
        return {
          ok: false,
          error: 'Blocked outgoing heroChest_openChest: only free video opens (count:1, free:true, video:true, costId:"") are permitted to prevent accidental Emerald spend.',
        };
      }
    }

    if (name === 'rune_upgradeHeroRune') {
      if (args?.alternatePrice !== false) {
        return {
          ok: false,
          error: 'Blocked outgoing rune_upgradeHeroRune: alternatePrice must be explicitly false (Rune Stones only) to prevent accidental Emerald spend.',
        };
      }
    }
  }
  return { ok: true };
}
