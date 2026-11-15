import { observedToday } from '../composables/activityState.ts';

// Packaged from expedition_slot.json / level_vip.json in the verified splitlib.
// Runtime duration, required power, IDs and unlock status always come from expeditionGet.
export const EXPEDITION_SLOTS = [
  { slotId: 1, title: 'Expedition 1', teamLevel: 20, vip: 0, subscription: false, needsHeroes: true },
  { slotId: 2, title: 'Expedition 2', teamLevel: 20, vip: 0, subscription: false, needsHeroes: true },
  { slotId: 3, title: 'Long Expedition', teamLevel: 20, vip: 0, subscription: false, needsHeroes: true },
  { slotId: 4, title: 'Expedition 4', teamLevel: 25, vip: 0, subscription: false, needsHeroes: true },
  { slotId: 5, title: 'Expedition 5', teamLevel: 30, vip: 0, subscription: false, needsHeroes: true },
  { slotId: 6, title: 'Subscription Expedition', teamLevel: 0, vip: 0, subscription: true, needsHeroes: true },
  { slotId: 7, title: 'VIP Expedition', teamLevel: 0, vip: 8, subscription: false, needsHeroes: true },
  { slotId: 8, title: 'Video Expedition', teamLevel: 20, vip: 0, subscription: false, needsHeroes: false },
];
const VIP_POINTS = [0, 50, 100, 300, 500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 40000, 80000, 150000];
const list = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

export function expeditionRows(cache: Record<string, any>, now = Date.now()) {
  const snapshot = cache.expeditionStatus;
  const account = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id;
  const scoped = account != null && String(snapshot?.data?.accountId) === String(account);
  const nextReset = cache.questResetStatus?.data?.nextDayAt;
  const data = scoped ? list(snapshot.data.rows) : [];
  const info = cache.userGetInfo?.data;
  const points = info?.id != null && String(info.id) === String(account) ? Number(info.vipPoints) : NaN;
  const vip = Number.isFinite(points) ? VIP_POINTS.filter(value => points >= value).length - 1 : null;
  const level = Number(cache.accountStatus?.data?.level ?? info?.level);
  return EXPEDITION_SLOTS.map(slot => {
    const row = data.find(row => row.slotId === slot.slotId);
    const fresh = scoped && observedToday({ updatedAt: row?.observedAt ?? snapshot.updatedAt }, now, nextReset);
    const duration = Number.isFinite(row?.duration) && row.duration > 0 ? row.duration * 1000 : null;
    const end = Number.isFinite(row?.endTime) && row.endTime > 0 ? row.endTime * 1000 : null;
    const busy = row?.status === 2;
    const remaining = end == null ? null : Math.max(0, Math.ceil((end - now) / 1000));
    const progress = busy && end != null && duration != null ? Math.max(0, Math.min(100, (1 - (end - now) / duration) * 100))
      : fresh && row?.status === 3 ? 100 : 0;
    const requirement = slot.subscription ? 'Active expedition subscription required'
      : slot.vip ? `VIP ${slot.vip} required${vip == null ? '' : ` · Current VIP ${vip}`}`
      : `Team level ${slot.teamLevel} required`;
    let state: 'unknown' | 'locked' | 'idle' | 'running' | 'ready' | 'done' = 'unknown';
    let reason = scoped ? 'Refresh expedition data for today' : 'Refresh game data';
    if (busy) { state = remaining === 0 ? 'ready' : 'running'; reason = state === 'ready' ? 'Ready to collect' : 'Expedition in progress'; }
    else if (fresh && row) {
      if (row.status === 0 || slot.vip && vip != null && vip < slot.vip || slot.teamLevel && Number.isFinite(level) && level < slot.teamLevel) {
        state = 'locked'; reason = requirement;
      } else if (row.status === 3 || row.attemptsLeft === 0) { state = 'done'; reason = 'Completed today'; }
      else if (row.status === 1 && Number.isInteger(row.attemptsLeft) && row.attemptsLeft > 0) { state = 'idle'; reason = 'Ready to start'; }
    }
    return { ...slot, id: row?.id, state, reason, requirement, fresh, durationMs: duration,
      endTime: end, remainingSeconds: remaining, progress, power: row?.power,
      attemptsLeft: row?.attemptsLeft, heroes: list(row?.heroes).filter(Number.isInteger), reward: row?.reward || {} };
  });
}

/** Hero-based expeditions require five owned heroes, even if fewer meet the power target. */
export function expeditionTeam(heroes: any[], required: number): number[] | null {
  if (!Number.isFinite(required) || required < 0) return null;
  const unique = new Map<number, any>();
  for (const hero of heroes) {
    if (Number.isInteger(hero?.id) && hero.id > 0 && Number.isFinite(hero.power) && hero.power > 0) unique.set(hero.id, hero);
  }
  const sorted = [...unique.values()].sort((a, b) => b.power - a.power || a.id - b.id);
  const team = sorted.slice(0, 5);
  let power = team.reduce((sum, hero) => sum + hero.power, 0);
  if (team.length !== 5 || power < required) return null;
  for (let index = 0; index < team.length; index++) {
    const replacement = [...sorted].reverse().find(hero => !team.some(used => used.id === hero.id) &&
      hero.power < team[index].power && power - team[index].power + hero.power >= required);
    if (replacement) { power += replacement.power - team[index].power; team[index] = replacement; }
  }
  return team.map(hero => hero.id);
}

export function expeditionPlan(cache: Record<string, any>, now = Date.now()) {
  const rows = expeditionRows(cache, now);
  // Heroes stay reserved even after the timer ends, until a server snapshot releases them.
  const busy = new Set(rows.filter(row => ['running', 'ready', 'unknown'].includes(row.state)).flatMap(row => row.heroes));
  const unique = new Map<number, any>();
  for (const hero of list(cache.heroGetAll?.data)) {
    if (Number.isInteger(hero?.id) && hero.id > 0 && Number.isFinite(hero.power) && hero.power > 0 && !busy.has(hero.id)) unique.set(hero.id, hero);
  }
  const available = [...unique.values()];
  const planned: { expeditionId: number; slotId: number; heroes: number[]; power: number }[] = [];
  for (const row of rows.filter(row => row.state === 'idle' && Number.isInteger(row.id))
    .sort((a, b) => Number(b.power) - Number(a.power) || a.slotId - b.slotId)) {
    const team = row.needsHeroes ? expeditionTeam(available.filter(hero => !busy.has(hero.id)), row.power) : [];
    if (!team) continue;
    team.forEach(id => busy.add(id));
    planned.push({ expeditionId: row.id, slotId: row.slotId, heroes: team,
      power: team.reduce((sum, id) => sum + unique.get(id).power, 0) });
  }
  return planned;
}

export function expeditionActivity(cache: Record<string, any>, now = Date.now()) {
  const rows = expeditionRows(cache, now);
  const known = rows.filter(row => row.state !== 'unknown');
  const available = known.filter(row => row.state !== 'locked');
  const running = rows.filter(row => row.state === 'running').length;
  const ready = rows.filter(row => row.state === 'ready').length;
  const done = rows.filter(row => row.state === 'done').length;
  return { id: 'expeditions', title: 'Expeditions', icon: '⛵', isInteractive: true,
    state: !known.length ? 'unknown' as const : available.length && done === available.length ? 'done' as const : 'pending' as const,
    detail: !known.length ? 'Waiting for game data' : `${running} running · ${ready} ready · ${done}/${available.length} completed · ${known.length - available.length} locked`,
    progress: available.length ? available.reduce((sum, row) => sum + row.progress, 0) / available.length : 0 };
}

export const expeditionRefreshCalls = () => [{ name: 'userGetInfo' }, { name: 'heroGetAll' }, { name: 'expeditionGet' }, { name: 'user_getNextDayTime' }];
