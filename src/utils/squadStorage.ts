/** Match the account boundary used by the background and legacy popup. */
export function selectSquadStorage(stored: Record<string, any>, accountId: unknown, preferenceKey: string, teamField: string) {
  const key = accountId == null ? null : String(accountId);
  const rawTeams = key == null ? [] : stored.customTeams?.[key];
  const teams = Array.isArray(rawTeams) ? rawTeams : rawTeams && typeof rawTeams === 'object' ? Object.values(rawTeams) : [];
  const prefs = stored[preferenceKey];
  const selected = key != null && prefs?.accountId != null && String(prefs.accountId) === key
    ? String(prefs[teamField] || '') : '';
  return { teams, selected };
}
