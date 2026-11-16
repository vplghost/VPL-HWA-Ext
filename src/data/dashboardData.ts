import { questData } from './questData.ts';

export interface DashboardRow {
  id: string;
  title: string;
  icon: string;
  state: 'pending' | 'done' | 'info' | 'unknown';
  detail: string;
}

export interface DailyDashboardResult {
  activities: DashboardRow[];
  quests: DashboardRow[];
  gifts: DashboardRow[];
}

export function sameDay(entry: any, now: number | Date = Date.now()): boolean {
  const observed = new Date(entry?.updatedAt);
  return Number.isFinite(observed.getTime()) && observed.toDateString() === new Date(now).toDateString();
}

export function dailyDashboard(cache: Record<string, any> = {}, now: number | Date = Date.now()): DailyDashboardResult {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const data = (key: string) => sameDay(cache[key], now) ? cache[key].data : null;
  const row = (id: string, title: string, icon: string, state: 'pending' | 'done' | 'info' | 'unknown', detail: string): DashboardRow => ({ id, title, icon, state, detail });
  const unknown = 'Waiting for game data';
  const activities: DashboardRow[] = [];

  const tower = data('towerStatus');
  activities.push(row('tower', 'Tower', '🗼', !tower ? 'unknown' : tower.isCleared ? 'done' : 'pending',
    !tower ? unknown : tower.isCleared ? 'Cleared today' : tower.floorNumber ? `Floor ${tower.floorNumber} / 25` : 'Ready to enter'));

  const arena = data('arenaGetAll');
  for (const [id, title, icon, rank, refillableId] of [
    ['arena', 'Arena', '⚔️', arena?.arenaPlace, 6],
    ['grand-arena', 'Grand Arena', '🛡️', arena?.grandPlace, 21]
  ] as const) {
    const amount = data(`resource:refillable:${refillableId}`)?.amount;
    const known = Number.isInteger(amount) && amount >= 0;
    activities.push(row(id, title, icon, !known ? 'unknown' : amount > 0 ? 'pending' : 'info',
      known ? `Rank ${rank ?? '—'} · ${amount} battles left today` :
        arena ? `Rank ${rank ?? '—'} · Battles remaining unavailable` : unknown));
  }

  const expeditions = data('expeditionGet');
  const slots = Array.isArray(expeditions) ? expeditions : null;
  const attempts = slots?.reduce((sum, slot) => sum + Math.max(0, Number(slot?.attemptsLeft) || 0), 0);
  activities.push(row('expeditions', 'Expeditions', '⛵', !slots ? 'unknown' : attempts > 0 ? 'pending' : 'info',
    !slots ? unknown : `${attempts} attempts left · ${slots.length} slots observed`));

  const dungeon = data('dungeonStatus');
  activities.push(row('dungeon', 'Guild Dungeon', '🏰', dungeon ? 'pending' : 'unknown',
    !dungeon ? unknown : `${Number(dungeon.dungeonActivity) || 0} activity points · Floor ${dungeon.floorNumber ?? '—'}`));

  const hydra = data('clanBoss_getAll');
  const tries = hydra ? (Number(hydra.tries) || 0) + (Number(hydra.superTries) || 0) : 0;
  activities.push(row('hydra', 'Hydra', '🐉', !hydra ? 'unknown' : tries > 0 ? 'pending' : 'info',
    !hydra ? unknown : `${hydra.tries ?? 0} regular · ${hydra.superTries ?? 0} super tries left`));

  const qData = questData || (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperQuestData);
  const quests = data('questGetAll');
  const dailyList = qData?.dailyQuests(cache, nowMs) || null;
  const openDaily = dailyList?.filter((quest: any) => quest.state === 'inProgress') || [];
  const ready = Array.isArray(quests) ? quests.filter((quest: any) => quest?.state === 2).length : 0;
  const questRows = [row('daily-quests', 'Daily Quests', '📜', openDaily.length || ready ? 'pending' : dailyList || Array.isArray(quests) ? 'info' : 'unknown',
    dailyList ? `${openDaily.length} remaining of ${dailyList.length} · ${ready} rewards ready to claim` :
      Array.isArray(quests) ? `${ready} quest rewards ready to claim · Daily list unavailable` : unknown)];
  const eventDailies = (qData?.visibleEvents(cache, nowMs) || []).flatMap((event: any) =>
    event.groups.filter((group: any) => group.repeatType === 'daily' &&
      group.quests.some((quest: any) => quest.state === 'inProgress')).map((group: any) => ({ event, group })));
  if (eventDailies.length) {
    const earliestEnd = Math.min(...eventDailies.map(({ event }: any) => event.end));
    questRows.push(row('event-daily-quests', 'Event Daily Quests', '⏳', 'pending',
      `${eventDailies.length} active groups · Earliest event ends ${new Date(earliestEnd).toLocaleString()}`));
  }

  const dailyBonus = data('dailyBonusGetInfo');
  const zeppelin = data('zeppelinGiftGet');
  const giftRows = [
    row('daily-bonus', 'Daily Login Bonus', '🎁', !dailyBonus ? 'unknown' : dailyBonus.availableToday ? 'pending' : 'info',
      !dailyBonus ? unknown : dailyBonus.availableToday ? 'Free reward available' : 'Already claimed or unavailable'),
    row('zeppelin-gift', 'Zeppelin Gift', '🎈', !zeppelin ? 'unknown' : zeppelin.available ? 'pending' : 'info',
      !zeppelin ? unknown : zeppelin.available ? 'Free gift available' : 'Already claimed or unavailable')
  ];
  for (const [id, title] of [[3, 'Bronze Free Chest'], [4, 'Gold Free Chest'], [35, 'Diamond Free Chest']] as const) {
    const chest = data(`resource:refillable:${id}`);
    const amount = Number(chest?.amount);
    giftRows.push(row(`chest-${id}`, title, '📦', !chest || !Number.isFinite(amount) ? 'unknown' : amount > 0 ? 'pending' : 'info',
      !chest || !Number.isFinite(amount) ? unknown : amount > 0 ? `${amount} available` : 'None available'));
  }
  return { activities, quests: questRows, gifts: giftRows };
}

export const dashboardDataHelper = {
  dailyDashboard
};

if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperDashboardData = dashboardDataHelper;
}

export default dashboardDataHelper;
