import { normalizeArray } from './troops.ts';

/** Cache/storage boundaries accept indexed objects as well as arrays. */
export function teamMemberIds(raw: unknown): number[] {
  return [...new Set(normalizeArray(raw).map(value => {
    const id = value && typeof value === 'object' ? value.heroId ?? value.id : value;
    return typeof id === 'number' || typeof id === 'string' && id.trim() ? Number(id) : NaN;
  }).filter(id => Number.isSafeInteger(id) && id > 0))];
}

export function serverTeamGroups(raw: unknown): number[][] {
  const values = normalizeArray(raw);
  const nested = values.some(value => Array.isArray(value) || value && typeof value === 'object' && value.id == null && value.heroId == null);
  return (nested ? values.map(teamMemberIds) : [teamMemberIds(values)]).filter(ids => ids.length > 0);
}
