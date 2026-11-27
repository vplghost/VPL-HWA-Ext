import { MONSTER_POWER, UNIT_POWER } from './rallyPowerData.ts';
import { formatPower } from './rallyPower.ts';
import { teamMemberIds } from './teamMembers.ts';

type Power = { value: number; known: boolean; complete: boolean };
const list = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

/** Same base/display power as rally comparison, using the planned allocation only. */
export function monsterSquadPower(heroIds: unknown, roster: any, units: unknown, unitsKnown: boolean) {
  const ids = teamMemberIds(heroIds);
  const heroes: Power = { value: 0, known: false, complete: ids.length === 5 };
  const troops: Power = { value: 0, known: unitsKnown, complete: unitsKnown };
  for (const id of ids) {
    const power = roster?.[id]?.power;
    if (typeof power === 'number' && Number.isFinite(power) && power >= 0) {
      heroes.value += power; heroes.known = true;
    } else heroes.complete = false;
  }
  if (unitsKnown) for (const unit of list(units)) {
    const count = unit?.count, power = UNIT_POWER[unit?.unitId];
    if (Number.isSafeInteger(count) && count >= 0 && power != null) troops.value += count * power;
    else troops.complete = false;
  }
  const total: Power = { value: heroes.value + troops.value, known: heroes.known || troops.known,
    complete: heroes.complete && troops.complete };
  return { heroes, troops, total };
}

export const MONSTER_ATTACK_ENERGY_COST = 10;

export function computeMaxMonsterAttacks(
  worldEnergy: number | null | undefined,
  energyPerAttack = MONSTER_ATTACK_ENERGY_COST,
  fallbackMax = 100
) {
  if (worldEnergy != null && Number.isFinite(Number(worldEnergy))) {
    const energy = Math.max(0, Math.floor(Number(worldEnergy)));
    const cost = Math.max(1, Math.floor(Number(energyPerAttack) || MONSTER_ATTACK_ENERGY_COST));
    return { known: true, energy, maxAttacks: Math.floor(energy / cost) };
  }
  return { known: false, energy: null as number | null, maxAttacks: fallbackMax };
}

export function monsterPowerComparison(level: number, squad: ReturnType<typeof monsterSquadPower>, target?: any) {
  const variants = Object.values(MONSTER_POWER).filter(row => row.level === level);
  const exact = variants.find(row => row.predefinedSquadId === Number(target?.predefinedSquadId));
  const pvpDefault = variants.find(row => row.variant === 'pvp') || variants[0];
  const presets = exact ? [exact] : (pvpDefault ? [pvpDefault] : []);
  const rows = presets.map(preset => ({
    ...preset, total: preset.heroes + preset.troops,
    weaker: squad.total.complete && squad.total.value < preset.heroes + preset.troops,
  }));
  const weaker = rows.filter(row => row.weaker);
  const message = !squad.total.complete
    ? 'Incomplete squad power data. Refresh heroes and troops before comparing; + marks a known subtotal.'
    : weaker.length
      ? `Squad power is lower than ${weaker.map(row => row.variant === 'pvp' ? 'PvP monster' : 'Normal monster').join(' and ')} at this level. Risk of defeat and wounded troops.`
      : 'Squad power meets the PvP monster preset total. Power alone does not guarantee victory.';
  return { rows, variantKnown: Boolean(exact || pvpDefault), warning: !squad.total.complete || weaker.length > 0,
    message, squad: { heroes: formatPower(squad.heroes), troops: formatPower(squad.troops), total: formatPower(squad.total) } };
}

export const formatMonsterPower = (value: number) => formatPower({ value, known: true, complete: true });
