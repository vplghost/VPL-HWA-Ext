export function recentMissionIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 5);
}

export function rememberMission(value: unknown, id: number): number[] {
  return recentMissionIds([id, ...recentMissionIds(value)]);
}
