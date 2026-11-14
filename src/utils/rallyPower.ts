import { BOSS_POWER, UNIT_POWER } from './rallyPowerData.ts';

const list = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
type Power = { value: number; known: boolean; complete: boolean };
const empty = (): Power => ({ value: 0, known: false, complete: true });

export function formatPower(power: Power): string {
  if (!power.known) return '—';
  const scale = power.value >= 1e6 ? 1e6 : power.value >= 1e3 ? 1e3 : 1;
  const value = power.complete ? Math.round(power.value / scale * 10) / 10 : Math.floor(power.value / scale * 10) / 10;
  return `${value}${scale === 1e6 ? 'M' : scale === 1e3 ? 'k' : ''}${power.complete ? '' : '+'}`;
}

/** Observed rally power; roster powers are scoped to the current player's heroes. */
export function rallyPowerTooltip(march: any, cache: any): string[] {
  const account = cache.accountStatus?.data?.id;
  const stored = cache.rallyPowerStatus?.data;
  const snapshot = account != null && String(stored?.accountId) === String(account)
    ? list(stored.rallies).find(row => row.rallyId === march.rally?.id) : null;
  const configId = march.rally?.mobConfigId ?? march.mobConfigId ?? snapshot?.mobConfigId;
  const boss = BOSS_POWER[configId];
  const team = march.team ?? march.rally?.team;
  const participants = snapshot?.participants ?? (account != null && team ? [{ userId: account, squad: {
    heroes: list(team.heroIds).map(heroId => ({ heroId })), units: team.units
  } }] : []);
  const heroes = empty(), troops = empty();
  heroes.complete = troops.complete = Boolean(snapshot);
  for (const person of participants) {
    const squad = person?.squad;
    if (!squad || !('heroes' in squad)) heroes.complete = false;
    for (const hero of list(squad?.heroes)) {
      const own = account != null && String(person.userId) === String(account);
      const profile = own ? cache.heroGetAll?.data?.[hero.heroId ?? hero.id] : null;
      const matches = profile && ['level', 'color', 'star'].every(key => hero[key] == null || hero[key] === profile[key]);
      if (matches && typeof profile.power === 'number' && Number.isFinite(profile.power) && profile.power >= 0) {
        heroes.value += profile.power; heroes.known = true;
      } else heroes.complete = false;
    }
    if (!squad || !('units' in squad)) troops.complete = false;
    for (const unit of list(squad?.units)) {
      const count = unit.count ?? unit.state?.survived;
      const power = UNIT_POWER[unit.unitId ?? unit.id];
      if (Number.isSafeInteger(count) && count >= 0 && power != null) {
        troops.value += count * power; troops.known = true;
      } else troops.complete = false;
    }
  }
  const total = { value: heroes.value + troops.value, known: heroes.known || troops.known,
    complete: heroes.complete && troops.complete && heroes.known && troops.known };
  const exact = (value: number | undefined) => value == null ? '—' : formatPower({ value, known: true, complete: true });
  return ['Power · Rally / Boss', `Heroes power: ${formatPower(heroes)} / ${exact(boss?.heroes)}`,
    `Troops power: ${formatPower(troops)} / ${exact(boss?.troops)}`,
    `Total power: ${formatPower(total)} / ${exact(boss ? boss.heroes + boss.troops : undefined)}`];
}
