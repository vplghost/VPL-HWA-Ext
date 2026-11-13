export const BRIGAND_ENERGY_COST = 10;

export function campSearchCalls() {
  return [{ name: 'getCampSummary', feature: 'camp', args: {} }];
}

export interface DiscoveredCamp {
  id: string;
  campConfigId: number;
  defendersPack?: Array<{ id: number; level?: number; star?: number }>;
}

export function availableCamps(summary: { camps?: DiscoveredCamp[]; nextRespawnDt?: number | null } | undefined, now = Date.now()): DiscoveredCamp[] {
  if (!summary || (typeof summary.nextRespawnDt === 'number' && summary.nextRespawnDt <= now)) return [];
  return Array.isArray(summary.camps) ? summary.camps : [];
}

export function campHeroIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const group = Array.isArray(raw[0]) ? raw[0] : raw;
  return [...new Set(group.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 5);
}

export function campAttackError(campId: string, heroIds: number[], owned: Record<string, unknown>, energy: number | null): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campId.trim())) return 'Enter a valid camp ID.';
  if (!heroIds.length || heroIds.length > 5 || new Set(heroIds).size !== heroIds.length ||
      heroIds.some(id => !Number.isInteger(id) || !owned[String(id)])) return 'Select 1–5 owned heroes.';
  if (energy === null || !Number.isFinite(energy)) return 'Sync World Energy before attacking.';
  if (energy < BRIGAND_ENERGY_COST) return 'Not enough World Energy.';
  return '';
}

export function campAttackCalls(campId: string, heroIds: number[]) {
  return [{ name: 'winCampBattle', feature: 'camp', args: { campId: campId.trim(), userHeroesIds: [...heroIds] } }];
}
