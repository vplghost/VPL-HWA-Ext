import { formatUtcDay, getUtcDayOffset } from './resourceIncome.ts';

export interface DailyActivityStats {
  date: string;
  accountId?: string;
  titaniteAuthoritative?: boolean;
  // Raid Auto-Join
  extAutoJoinCount: number;
  gameAutoJoinCount: number;
  totalAutoJoinCount: number;
  autoJoinV2?: boolean;
  autoJoinLosses: number;
  // Activities
  campaignCount: number;
  campaignLosses: number;
  organizedRalliesCount: number;
  rallyLosses: number;
  monstersCount: number;
  monsterLosses: number;
  brigandCampsCount: number;
  campLosses: number;
  // Progression: Dungeon & Frontier
  dungeonBattlesToday: number;
  personalTitaniteToday: number;
  frontierStagesToday: number;
  frontierCoinsToday: number;
  // Energy consumption
  campaignEnergySpent: number;
  worldEnergySpent: number;
  totalEnergySpent: number;
}

export const CAMPAIGN_ENERGY_COST = 6;
export const RALLY_ENERGY_COST = 25;
export const MONSTER_ENERGY_COST = 10;
export const BRIGAND_ENERGY_COST = 10;
export const ACTIVITY_HISTORY_STORAGE_KEY = 'dailyActivityHistory';
export const MAX_ACTIVITY_HISTORY_DAYS = 30;
const TITANITE_QUEST_IDS = [10031, 10032, 10108];

function isSameUtcDayOrUnstamped(updatedAt: any, todayUtc: string): boolean {
  if (!updatedAt) return true;
  const ts = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number(updatedAt);
  return Number.isFinite(ts) ? formatUtcDay(ts) === todayUtc : true;
}

function maxTitaniteQuestProgress(quests: any): number {
  if (!quests) return 0;
  let maxVal = 0;
  if (Array.isArray(quests)) {
    for (const q of quests) {
      if (q && TITANITE_QUEST_IDS.includes(Number(q.id)) && Number.isFinite(Number(q.progress))) {
        maxVal = Math.max(maxVal, Number(q.progress));
      }
    }
  } else if (typeof quests === 'object') {
    for (const qId of TITANITE_QUEST_IDS) {
      const q = quests[qId] ?? quests[String(qId)];
      if (q && Number.isFinite(Number(q.progress))) {
        maxVal = Math.max(maxVal, Number(q.progress));
      }
    }
  }
  return maxVal;
}

function hasTitaniteQuestEntry(quests: any): boolean {
  if (!quests) return false;
  if (Array.isArray(quests)) {
    return quests.some((q) => q && TITANITE_QUEST_IDS.includes(Number(q.id)) && Number.isFinite(Number(q.progress)));
  }
  if (typeof quests === 'object') {
    return TITANITE_QUEST_IDS.some((qId) => {
      const q = quests[qId] ?? quests[String(qId)];
      return Boolean(q && Number.isFinite(Number(q.progress)));
    });
  }
  return false;
}

/**
 * Returns true when cache contains at least one server-authoritative Titanite source for today (UTC).
 * When true, Dashboard Personal Titanite must trust live resolved value 1:1 with DungeonModal
 * instead of locking onto a stale/inflated dailyActivityHistory entry via Math.max.
 */
export function hasAuthoritativePersonalTitanite(cache: Record<string, any> = {}, now = Date.now()): boolean {
  const today = formatUtcDay(now);
  const accountId = String(cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? '');

  const guildData = cache?.guildStatus?.data;
  if (
    guildData &&
    accountId &&
    (!guildData.accountId || String(guildData.accountId) === accountId) &&
    isSameUtcDayOrUnstamped(cache?.guildStatus?.updatedAt, today)
  ) {
    const guildTitanite = Number(guildData.members?.[accountId]?.stats?.todayDungeonActivity);
    if (Number.isFinite(guildTitanite) && guildTitanite >= 0) return true;
  }

  if (isSameUtcDayOrUnstamped(cache?.questGetAll?.updatedAt, today) && hasTitaniteQuestEntry(cache?.questGetAll?.data)) {
    return true;
  }
  if (
    isSameUtcDayOrUnstamped(cache?.['getDailyQuests:quest']?.updatedAt, today) &&
    hasTitaniteQuestEntry(cache?.['getDailyQuests:quest']?.data?.events)
  ) {
    return true;
  }

  const dungeonStatus = cache?.dungeonStatus?.data || cache?.dungeonGetInfo?.data;
  const dungeonUpdated = cache?.dungeonStatus?.updatedAt || cache?.dungeonGetInfo?.updatedAt;
  if (dungeonStatus && isSameUtcDayOrUnstamped(dungeonUpdated, today)) {
    const statusTitanite = Number(dungeonStatus.todayTitanite);
    if (Number.isFinite(statusTitanite) && statusTitanite >= 0) return true;
    const logTitanite = Number(dungeonStatus.dailyCombatLog?.todayTitanite);
    if (Number.isFinite(logTitanite) && logTitanite >= 0) return true;
  }

  return false;
}

/**
 * Resolves the most accurate personal Titanite earned today (UTC) by combining:
 * 1. Guild member stats (`guildStatus.data.members[accountId].stats.todayDungeonActivity`, uncapped)
 * 2. Max progress across Titanite daily quests (`10031`, `10032`, `10108`) in `questGetAll` & `getDailyQuests:quest`
 * 3. `dungeonStatus` (`todayTitanite` / `dailyCombatLog.todayTitanite`, falling back to `dungeonActivity` only when others are 0)
 */
export function resolvePersonalTitaniteToday(cache: Record<string, any> = {}, now = Date.now()): number {
  const today = formatUtcDay(now);
  const accountId = String(cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? '');
  let best = 0;

  // 1. Uncapped server-authoritative personal Titanite from guildStatus
  const guildData = cache?.guildStatus?.data;
  if (
    guildData &&
    accountId &&
    (!guildData.accountId || String(guildData.accountId) === accountId) &&
    isSameUtcDayOrUnstamped(cache?.guildStatus?.updatedAt, today)
  ) {
    const member = guildData.members?.[accountId];
    const guildTitanite = Number(member?.stats?.todayDungeonActivity);
    if (Number.isFinite(guildTitanite) && guildTitanite > 0) {
      best = Math.max(best, guildTitanite);
    }
  }

  // 2. Max progress across all Titanite quests (avoids capping at quest 10031's 75 limit)
  if (isSameUtcDayOrUnstamped(cache?.questGetAll?.updatedAt, today)) {
    best = Math.max(best, maxTitaniteQuestProgress(cache?.questGetAll?.data));
  }
  if (isSameUtcDayOrUnstamped(cache?.['getDailyQuests:quest']?.updatedAt, today)) {
    best = Math.max(best, maxTitaniteQuestProgress(cache?.['getDailyQuests:quest']?.data?.events));
  }

  // 3. Dungeon status & daily combat log (aligned to UTC day, with legacy local-date tolerance)
  const dungeonStatus = cache?.dungeonStatus?.data || cache?.dungeonGetInfo?.data;
  const dungeonUpdated = cache?.dungeonStatus?.updatedAt || cache?.dungeonGetInfo?.updatedAt;
  const isDungeonToday = isSameUtcDayOrUnstamped(dungeonUpdated, today);
  if (isDungeonToday && dungeonStatus) {
    const dungeonCombatLog = dungeonStatus.dailyCombatLog;
    const isCombatLogToday = !dungeonCombatLog?.date
      ? true
      : (String(dungeonCombatLog.date) === today ||
         new Date(dungeonCombatLog.date).toDateString() === new Date(now).toDateString());

    const statusTitanite = Number(dungeonStatus.todayTitanite);
    if (Number.isFinite(statusTitanite) && statusTitanite > 0) {
      best = Math.max(best, statusTitanite);
    }
    if (isCombatLogToday) {
      const logTitanite = Number(dungeonCombatLog?.todayTitanite);
      if (Number.isFinite(logTitanite) && logTitanite > 0) {
        best = Math.max(best, logTitanite);
      }
    }
    if (best === 0) {
      const fallbackActivity = Number(dungeonStatus.dungeonActivity);
      if (Number.isFinite(fallbackActivity) && fallbackActivity > 0) {
        best = fallbackActivity;
      }
    }
  }

  return best;
}

function resolveCampaignDayTotals(
  cache: Record<string, any>,
  dateStr: string,
  includeLastResultFallback: boolean
): { count: number; energy: number } {
  // 1. Primary: compact daily aggregate written by rpcCache / CampaignRaidModal (< 1 KB)
  const summaryDay = cache?.campaignDailySummary?.data?.days?.[dateStr];
  const summaryCount = Number(summaryDay?.count) || 0;
  const summaryEnergy = Number(summaryDay?.energy) || 0;

  // 2. Legacy/test compatibility: campaignRaidReceipts array
  let receiptCount = 0;
  let receiptEnergy = 0;
  const campaignReceipts = Array.isArray(cache?.campaignRaidReceipts?.data)
    ? cache.campaignRaidReceipts.data
    : [];
  const seenReceiptKeys = new Set<string>();
  for (const r of campaignReceipts) {
    if (!r) continue;
    const timeVal = r.at || r.timestamp || r.updatedAt;
    if (!timeVal) continue;
    const dStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    if (dStr === dateStr) {
      const dedupKey = r.ident ? `id:${r.ident}` : `ts:${timeVal}:${r.missionId ?? ''}:${r.times ?? 1}`;
      if (seenReceiptKeys.has(dedupKey)) continue;
      seenReceiptKeys.add(dedupKey);
      const times = Number(r.times) || 1;
      const energy = Number.isFinite(Number(r.energySpent)) && Number(r.energySpent) > 0
        ? Number(r.energySpent)
        : times * CAMPAIGN_ENERGY_COST;
      receiptCount += times;
      receiptEnergy += energy;
    }
  }

  let count = Math.max(summaryCount, receiptCount);
  let energy = Math.max(summaryEnergy, receiptEnergy);

  // 3. Fallback: single lastCampaignRaidResult only if summary/receipts have not already counted it
  if (includeLastResultFallback && count === 0) {
    const lastRaid = cache?.lastCampaignRaidResult;
    if (lastRaid && !lastRaid.data?.failed && lastRaid.data?.success !== false) {
      const timeVal = lastRaid.updatedAt || lastRaid.at;
      if (timeVal) {
        const dStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
        if (dStr === dateStr) {
          const times = Number(lastRaid.data?.times ?? lastRaid.times ?? 1);
          const raidEnergy = Number.isFinite(Number(lastRaid.data?.energySpent)) && Number(lastRaid.data.energySpent) > 0
            ? Number(lastRaid.data.energySpent)
            : times * CAMPAIGN_ENERGY_COST;
          count = times;
          energy = raidEnergy;
        }
      }
    }
  }

  return { count, energy };
}

/**
 * Records a new extension auto-joined rally ID into `priorityAutoJoinedRallies`:
 * - Preserves `data` as a deduplicated rolling list of the last 200 rally IDs (for membership lookups).
 * - Maintains compact `dailyCounts` keyed by UTC day (pruned to last 7 UTC days, < 200 bytes).
 */
export function recordPriorityAutoJoinDaily(
  existingEntry: any,
  rallyId: string | number,
  now = Date.now()
): {
  key: 'priorityAutoJoinedRallies';
  group: 'internal';
  updatedAt: string;
  data: any[];
  dailyCounts: Record<string, number>;
} {
  const existingIds = Array.isArray(existingEntry?.data) ? existingEntry.data : [];
  const rawCounts =
    existingEntry?.dailyCounts && typeof existingEntry.dailyCounts === 'object'
      ? { ...existingEntry.dailyCounts }
      : {};
  const today = formatUtcDay(now);
  const alreadyRecorded = existingIds.some((id: any) => String(id) === String(rallyId));
  const nextData = alreadyRecorded ? existingIds.slice(-200) : [...existingIds, rallyId].slice(-200);

  const dailyCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawCounts)) {
    const n = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(n) && n >= 0) {
      dailyCounts[k] = Math.floor(n);
    }
  }
  if (!alreadyRecorded) {
    dailyCounts[today] = (dailyCounts[today] || 0) + 1;
  }

  // Prune to last 7 UTC days
  const sortedDays = Object.keys(dailyCounts).sort();
  while (sortedDays.length > 7) {
    const oldest = sortedDays.shift();
    if (oldest) delete dailyCounts[oldest];
  }

  return {
    key: 'priorityAutoJoinedRallies',
    group: 'internal',
    updatedAt: new Date(now).toISOString(),
    data: nextData,
    dailyCounts,
  };
}

/**
 * Aggregates daily activity and automation efficiency metrics from cache for today:
 * - Raid auto-joins: extension auto-recalls/joins vs game auto-joins
 * - Campaign missions completed today
 * - Organized rallies, monsters hunted, brigand camps cleared
 * - Unified total energy consumption (Campaign Energy + World Energy)
 */
export function getTodayActivityStats(cache: Record<string, any> = {}, now = Date.now()): DailyActivityStats {
  const today = formatUtcDay(now);
  const accountId = String(cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? '');

  // 1. Raid Auto-Joins (Extension vs Game) — strictly scoped to current UTC day
  const priorityEntry = cache?.priorityAutoJoinedRallies;
  const priorityJoins = Array.isArray(priorityEntry?.data) ? priorityEntry.data : [];
  const priorityJoinIdSet = new Set(priorityJoins.map((id: any) => String(id)));
  const dailyExtAutoCount = Math.max(0, Math.floor(Number(priorityEntry?.dailyCounts?.[today]) || 0));

  const marches = Array.isArray(cache?.marchStatus?.data?.marches)
    ? cache.marchStatus.data.marches
    : [];

  let marchExtJoins = 0;
  let marchGameJoins = 0;
  let marchOrganizedRallies = 0;
  let marchMonsters = 0;

  for (const m of marches) {
    if (!m) continue;
    if (m.rally) {
      const isLeader = m.rally.isLeader || (accountId && String(m.rally.leader?.userId) === accountId);
      if (isLeader) {
        marchOrganizedRallies++;
      } else {
        const isExt = Boolean(m.rally.isHelperAutoJoin || m.rally.autoJoinSource === 'extension' || m.rally.autoJoinSource === 'helper');
        const isGame = Boolean(m.rally.autoJoinSource === 'game' || (!isExt && m.rally.isAutoJoin));
        if (isExt) {
          marchExtJoins++;
        } else if (isGame) {
          marchGameJoins++;
        }
      }
    } else if (m.mob) {
      marchMonsters++;
    }
  }

  // 2. Battle Reports for Today
  const todayReports = cache?.battleReportSummary?.data?.days?.[today];
  const reportTypes = todayReports?.types || {};

  const rallyReports = Number(reportTypes.rallyMobAttackResult || reportTypes.mobRallyAttackResult || 0);
  const monsterReports = Number(reportTypes.soloMobAttackResult || reportTypes.mobAttackResult || reportTypes.mobSoloAttackResult || 0);
  const campReports = Number(reportTypes.campBattleResult || reportTypes.brigandCampResult || reportTypes.winCampBattle || 0);

  // 3. Battle Reports Analysis (Losses and Leader Rallies)
  const rawReports: any[] = [];
  for (const k of ['getPage:report', 'mailStatus']) {
    const list = cache?.[k]?.data?.reports ?? cache?.[k]?.reports;
    if (Array.isArray(list)) rawReports.push(...list);
    else if (list && typeof list === 'object') rawReports.push(...Object.values(list));
  }

  let rallyLosses = 0;
  let autoJoinLosses = 0;
  let monsterLosses = 0;
  let campLosses = 0;
  let campaignLosses = 0;

  const organizedRallyIds = new Set<string>();
  const todayExtReportRallyIds = new Set<string>();
  const seenReportIds = new Set<string>();

  for (const rep of rawReports) {
    if (!rep || rep.id == null || seenReportIds.has(String(rep.id))) continue;
    seenReportIds.add(String(rep.id));

    const repDay = rep.createdAt ? formatUtcDay(Number(rep.createdAt)) : '';
    if (repDay && repDay !== today) continue;

    const type = String(rep.type || '');
    const res = String(rep.result ?? rep.payload?.result ?? '').toLowerCase();
    const isLoss = ['lose', 'loss', 'defeat', 'failed'].includes(res);

    if (type === 'rallyMobAttackResult' || type === 'mobRallyAttackResult') {
      const isLeader = Boolean(
        rep.payload?.isLeader ||
        rep.isLeader ||
        (accountId && (
          String(rep.payload?.leader?.userId) === accountId ||
          String(rep.payload?.leaderUserId) === accountId
        ))
      );
      if (isLeader) {
        const rId = rep.payload?.rallyId || rep.rallyId || String(rep.id);
        if (rId) organizedRallyIds.add(String(rId));
        if (isLoss) rallyLosses++;
      } else {
        const rId = rep.payload?.rallyId || rep.rallyId;
        if (rId != null && priorityJoinIdSet.has(String(rId))) {
          todayExtReportRallyIds.add(String(rId));
        }
        if (isLoss) autoJoinLosses++;
      }
    } else if (type === 'soloMobAttackResult' || type === 'mobAttackResult' || type === 'mobSoloAttackResult') {
      if (isLoss) monsterLosses++;
    } else if (type === 'campBattleResult' || type === 'brigandCampResult') {
      if (isLoss) campLosses++;
    }
  }

  // 4. Organized Rallies (Player as Leader)
  // 4a. From createdRalliesHistory in cache
  const createdHistory = Array.isArray(cache?.createdRalliesHistory?.data)
    ? cache.createdRalliesHistory.data
    : [];
  for (const item of createdHistory) {
    if (!item) continue;
    const timeVal = item.timestamp || item.at || item.createdAt;
    if (timeVal) {
      const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
      if (dateStr === today && item.rallyId) {
        organizedRallyIds.add(String(item.rallyId));
      }
    }
  }

  // 4b. Single rallyAction create action
  const rallyAction = cache?.rallyAction?.data;
  if (rallyAction?.action === 'create' && cache?.rallyAction?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.rallyAction.updatedAt)) === today) {
      if (rallyAction.rallyId) {
        organizedRallyIds.add(String(rallyAction.rallyId));
      }
    }
  }

  // 4c. Active leader marches
  for (const m of marches) {
    if (!m?.rally) continue;
    const isLeader = Boolean(m.rally.isLeader || (accountId && String(m.rally.leader?.userId) === accountId));
    if (isLeader) {
      const rId = m.rally.id || m.rally.rallyId;
      if (rId) organizedRallyIds.add(String(rId));
    }
  }

  // 4d. Raid queue state (completed / started)
  const raidQueueState = cache?.raidQueue;
  let raidQueueCount = 0;
  if (raidQueueState) {
    if (Array.isArray(raidQueueState.createdRallyIds)) {
      for (const id of raidQueueState.createdRallyIds) {
        if (id) organizedRallyIds.add(String(id));
      }
    }
    if (raidQueueState.current?.rallyId) {
      organizedRallyIds.add(String(raidQueueState.current.rallyId));
    }
    const completed = Number(raidQueueState.completed);
    const started = Number(raidQueueState.started);
    raidQueueCount = Math.max(
      Number.isFinite(completed) ? completed : 0,
      Number.isFinite(started) ? started : 0
    );
  }

  let organizedRalliesCount = Math.max(
    organizedRallyIds.size,
    marchOrganizedRallies,
    raidQueueCount
  );
  if (organizedRalliesCount === 0 && rallyAction?.action === 'create' && cache?.rallyAction?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.rallyAction.updatedAt)) === today) {
      organizedRalliesCount = 1;
    }
  }

  // Extension auto-joins for today only (never use untimestamped 200-cap priorityJoins.length)
  const extAutoJoinCount = Math.max(dailyExtAutoCount, todayExtReportRallyIds.size, marchExtJoins);

  // Game auto joins from battle reports (if total rallies exceed organized + extension auto-joins)
  let gameAutoJoinCount = marchGameJoins;
  if (rallyReports > 0) {
    const unassignedRallies = Math.max(0, rallyReports - organizedRalliesCount - extAutoJoinCount);
    gameAutoJoinCount = Math.max(gameAutoJoinCount, unassignedRallies);
  }

  // 5. Campaign Raids (from compact campaignDailySummary + legacy fallback)
  const campaignTotals = resolveCampaignDayTotals(cache, today, true);
  const campaignCount = campaignTotals.count;
  const campaignEnergySpentFromCache = campaignTotals.energy;

  // 6. Solo Monsters Hunted
  let monstersCount = Math.max(monsterReports, marchMonsters);
  const monsterQueueState = cache?.monsterQueue;
  if (monsterQueueState && Number.isFinite(monsterQueueState.completed)) {
    monstersCount = Math.max(monstersCount, Number(monsterQueueState.completed));
  }

  // 7. Brigand Camps Cleared
  const campIdsToday = new Set<string>();
  let campAttacksCount = 0;
  const campHistory = Array.isArray(cache?.brigandCampHistory?.data)
    ? cache.brigandCampHistory.data
    : (Array.isArray(cache?.brigandCampHistory) ? cache.brigandCampHistory : []);

  for (const ch of campHistory) {
    if (!ch) continue;
    const timeVal = ch.at || ch.timestamp || ch.updatedAt;
    if (!timeVal) continue;
    const dStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    if (dStr === today && ch.success !== false) {
      campAttacksCount++;
      if (ch.campId) campIdsToday.add(String(ch.campId));
    }
  }

  const brigandStatus = cache?.brigandCampStatus?.data;
  if (brigandStatus?.success && cache?.brigandCampStatus?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.brigandCampStatus.updatedAt)) === today) {
      if (brigandStatus.campId) campIdsToday.add(String(brigandStatus.campId));
      else if (campIdsToday.size === 0) campIdsToday.add('status-camp');
      campAttacksCount = Math.max(campAttacksCount, 1);
    }
  }

  let brigandCampsCount = Math.max(campReports, campIdsToday.size, campAttacksCount);

  // Preserve overall losses from battleReportSummary if individual reports were claimed/pruned
  if (todayReports?.losses && Number(todayReports.losses) > (rallyLosses + autoJoinLosses + monsterLosses + campLosses)) {
    const unassigned = Number(todayReports.losses) - (rallyLosses + autoJoinLosses + monsterLosses + campLosses);
    if (rallyReports > 0) {
      autoJoinLosses += unassigned;
    } else if (monsterReports > 0) {
      monsterLosses += unassigned;
    } else {
      autoJoinLosses += unassigned;
    }
  }

  // Check campaign loss if any
  const lastCampaign = cache?.lastCampaignRaidResult;
  if (lastCampaign) {
    const timeVal = lastCampaign.updatedAt || lastCampaign.at;
    const dateStr = timeVal ? formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal) : '';
    if (dateStr === today) {
      const success = lastCampaign.data?.success ?? lastCampaign.success;
      if (success === false) {
        campaignLosses++;
      }
    }
  }

  // 8. Dungeon Progression
  const dungeonStatus = cache?.dungeonStatus?.data || cache?.dungeonGetInfo?.data;
  const dungeonUpdated = cache?.dungeonStatus?.updatedAt || cache?.dungeonGetInfo?.updatedAt;
  const isDungeonToday = dungeonUpdated ? formatUtcDay(Date.parse(dungeonUpdated)) === today : true;

  const dungeonCombatLog = dungeonStatus?.dailyCombatLog;
  const isCombatLogToday = !dungeonCombatLog?.date
    ? true
    : (String(dungeonCombatLog.date) === today ||
       new Date(dungeonCombatLog.date).toDateString() === new Date(now).toDateString());

  let dungeonBattlesToday = 0;
  if (isCombatLogToday && dungeonCombatLog) {
    dungeonBattlesToday = Math.max(
      Number(dungeonCombatLog.totalBattles) || 0,
      (Number(dungeonCombatLog.flawlessCount) || 0) +
        (Array.isArray(dungeonCombatLog.casualtyBattles) ? dungeonCombatLog.casualtyBattles.length : 0)
    );
  }

  const battleHistory = cache?.dungeonBattleHistory;
  if (battleHistory && typeof battleHistory === 'object') {
    let historyBattlesToday = 0;
    for (const item of Object.values(battleHistory)) {
      if (item && typeof item === 'object') {
        const timeVal = (item as any).timestamp || (item as any).updatedAt || (item as any).at;
        if (timeVal && formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal) === today) {
          historyBattlesToday++;
        }
      }
    }
    dungeonBattlesToday = Math.max(dungeonBattlesToday, historyBattlesToday);
  }

  const personalTitaniteToday = resolvePersonalTitaniteToday(cache, now);
  const titaniteAuthoritative = hasAuthoritativePersonalTitanite(cache, now);
  const resolvedAccountId = String(cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? '') || undefined;

  // 9. Frontier Progression
  const frontierProgress = cache?.eternalStoryDailyProgress?.data;
  const isFrontierToday = frontierProgress?.date === new Date(now).toDateString() ||
    (cache?.eternalStoryDailyProgress?.updatedAt && formatUtcDay(Date.parse(cache.eternalStoryDailyProgress.updatedAt)) === today);
  const frontierStagesToday = isFrontierToday ? (Number(frontierProgress?.clearedCount) || 0) : 0;
  const frontierCoinsToday = isFrontierToday
    ? (Number(frontierProgress?.coinsEarned) || (frontierStagesToday * 1000))
    : 0;

  // 10. Energy Consumption Calculations
  // Only host/organized rallies consume World Energy (joining rallies costs 0 World Energy)
  const campaignEnergySpent = campaignEnergySpentFromCache > 0
    ? campaignEnergySpentFromCache
    : campaignCount * CAMPAIGN_ENERGY_COST;
  const worldEnergySpent =
    organizedRalliesCount * RALLY_ENERGY_COST +
    monstersCount * MONSTER_ENERGY_COST +
    brigandCampsCount * BRIGAND_ENERGY_COST;

  const totalEnergySpent = campaignEnergySpent + worldEnergySpent;

  return {
    date: today,
    ...(resolvedAccountId ? { accountId: resolvedAccountId } : {}),
    titaniteAuthoritative,
    extAutoJoinCount,
    gameAutoJoinCount,
    totalAutoJoinCount: extAutoJoinCount + gameAutoJoinCount,
    autoJoinV2: true,
    autoJoinLosses,
    campaignCount,
    campaignLosses,
    organizedRalliesCount,
    rallyLosses,
    monstersCount,
    monsterLosses,
    brigandCampsCount,
    campLosses,
    dungeonBattlesToday,
    personalTitaniteToday,
    frontierStagesToday,
    frontierCoinsToday,
    campaignEnergySpent,
    worldEnergySpent,
    totalEnergySpent,
  };
}

/**
 * Resolves activity stats for any specific date (Today or a past date within 30 days).
 * Merges cache records with persisted daily history map.
 */
export function getActivityStatsForDay(
  cache: Record<string, any> = {},
  dateStr: string,
  historyMap: Record<string, DailyActivityStats> = {},
  now = Date.now()
): DailyActivityStats {
  const today = formatUtcDay(now);
  if (dateStr === today) {
    const liveToday = getTodayActivityStats(cache, now);
    const existing = historyMap[dateStr];
    if (!existing) return liveToday;

    // Merge live with existing stored records; self-heal pre-v2 entries that were poisoned to 200 Ext
    const isV2Existing = existing.autoJoinV2 === true;
    const extAuto = isV2Existing
      ? Math.max(liveToday.extAutoJoinCount, existing.extAutoJoinCount || 0)
      : liveToday.extAutoJoinCount;
    const gameAuto = isV2Existing
      ? Math.max(liveToday.gameAutoJoinCount, existing.gameAutoJoinCount || 0)
      : liveToday.gameAutoJoinCount;
    const autoLoss = Math.max(liveToday.autoJoinLosses, existing.autoJoinLosses || 0);
    const campaign = Math.max(liveToday.campaignCount, existing.campaignCount || 0);
    const campLoss = Math.max(liveToday.campaignLosses, existing.campaignLosses || 0);
    const orgRallies = Math.max(liveToday.organizedRalliesCount, existing.organizedRalliesCount || 0);
    const rallyLoss = Math.max(liveToday.rallyLosses, existing.rallyLosses || 0);
    const monsters = Math.max(liveToday.monstersCount, existing.monstersCount || 0);
    const monsterLoss = Math.max(liveToday.monsterLosses, existing.monsterLosses || 0);
    const camps = Math.max(liveToday.brigandCampsCount, existing.brigandCampsCount || 0);
    const campBattleLoss = Math.max(liveToday.campLosses, existing.campLosses || 0);

    const dungeonBattles = Math.max(liveToday.dungeonBattlesToday, existing.dungeonBattlesToday || 0);
    const sameAccount =
      !liveToday.accountId || !existing.accountId || String(existing.accountId) === String(liveToday.accountId);
    const titanite = liveToday.titaniteAuthoritative
      ? liveToday.personalTitaniteToday
      : sameAccount
        ? Math.max(liveToday.personalTitaniteToday, existing.personalTitaniteToday || 0)
        : liveToday.personalTitaniteToday;
    const frontierStages = Math.max(liveToday.frontierStagesToday, existing.frontierStagesToday || 0);
    const frontierCoins = Math.max(liveToday.frontierCoinsToday, existing.frontierCoinsToday || 0);

    const campaignEnergy = Math.max(
      liveToday.campaignEnergySpent,
      existing.campaignEnergySpent || 0,
      campaign > 0 && liveToday.campaignEnergySpent === 0 && !(existing.campaignEnergySpent > 0)
        ? campaign * CAMPAIGN_ENERGY_COST
        : 0
    );
    // Only host/organized rallies consume World Energy
    const worldEnergy =
      orgRallies * RALLY_ENERGY_COST +
      monsters * MONSTER_ENERGY_COST +
      camps * BRIGAND_ENERGY_COST;

    return {
      date: dateStr,
      extAutoJoinCount: extAuto,
      gameAutoJoinCount: gameAuto,
      totalAutoJoinCount: extAuto + gameAuto,
      autoJoinV2: true,
      autoJoinLosses: autoLoss,
      campaignCount: campaign,
      campaignLosses: campLoss,
      organizedRalliesCount: orgRallies,
      rallyLosses: rallyLoss,
      monstersCount: monsters,
      monsterLosses: monsterLoss,
      brigandCampsCount: camps,
      campLosses: campBattleLoss,
      dungeonBattlesToday: dungeonBattles,
      personalTitaniteToday: titanite,
      frontierStagesToday: frontierStages,
      frontierCoinsToday: frontierCoins,
      campaignEnergySpent: campaignEnergy,
      worldEnergySpent: worldEnergy,
      totalEnergySpent: campaignEnergy + worldEnergy,
    };
  }

  // Past day resolution
  const history = historyMap[dateStr];
  const dayReports = cache?.battleReportSummary?.data?.days?.[dateStr];
  const reportTypes = dayReports?.types || {};

  const rallyReports = Number(reportTypes.rallyMobAttackResult || reportTypes.mobRallyAttackResult || 0);
  const monsterReports = Number(reportTypes.soloMobAttackResult || reportTypes.mobAttackResult || reportTypes.mobSoloAttackResult || 0);
  const campReports = Number(reportTypes.campBattleResult || reportTypes.brigandCampResult || reportTypes.winCampBattle || 0);

  // Campaign summary / receipts for that specific past date
  const pastCampaignTotals = resolveCampaignDayTotals(cache, dateStr, false);

  let pastCreatedCount = 0;
  const createdHistory = Array.isArray(cache?.createdRalliesHistory?.data)
    ? cache.createdRalliesHistory.data
    : [];
  for (const item of createdHistory) {
    if (!item) continue;
    const timeVal = item.timestamp || item.at || item.createdAt;
    if (timeVal) {
      const dStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
      if (dStr === dateStr) pastCreatedCount++;
    }
  }

  const campaign = Math.max(history?.campaignCount || 0, pastCampaignTotals.count);
  const orgRallies = Math.max(history?.organizedRalliesCount || 0, pastCreatedCount);
  const dailyExtFromCache = Math.max(0, Math.floor(Number(cache?.priorityAutoJoinedRallies?.dailyCounts?.[dateStr]) || 0));
  const extAuto = history?.autoJoinV2
    ? Math.max(history.extAutoJoinCount || 0, dailyExtFromCache)
    : (dailyExtFromCache > 0 ? dailyExtFromCache : (history?.extAutoJoinCount || 0));
  let gameAuto = history?.gameAutoJoinCount || 0;
  if (rallyReports > 0) {
    gameAuto = Math.max(gameAuto, Math.max(0, rallyReports - orgRallies - extAuto));
  }
  const monsters = Math.max(history?.monstersCount || 0, monsterReports);
  const camps = Math.max(history?.brigandCampsCount || 0, campReports);

  let autoLoss = history?.autoJoinLosses || 0;
  const campLoss = history?.campaignLosses || 0;
  let rallyLoss = history?.rallyLosses || 0;
  let monsterLoss = history?.monsterLosses || 0;
  let campBattleLoss = history?.campLosses || 0;

  // Attribute past day losses if summary has losses not yet broken down
  if (dayReports?.losses && Number(dayReports.losses) > (rallyLoss + autoLoss + monsterLoss + campBattleLoss)) {
    const unassigned = Number(dayReports.losses) - (rallyLoss + autoLoss + monsterLoss + campBattleLoss);
    if (rallyReports > 0) autoLoss += unassigned;
    else if (monsterReports > 0) monsterLoss += unassigned;
    else autoLoss += unassigned;
  }

  const dungeonBattles = history?.dungeonBattlesToday || 0;
  const titanite = history?.personalTitaniteToday || 0;
  const frontierStages = history?.frontierStagesToday || 0;
  const frontierCoins = history?.frontierCoinsToday || 0;

  const campaignEnergy = Math.max(
    history?.campaignEnergySpent || 0,
    pastCampaignTotals.energy,
    campaign > 0 && !(history?.campaignEnergySpent > 0) && pastCampaignTotals.energy === 0
      ? campaign * CAMPAIGN_ENERGY_COST
      : 0
  );
  // Only host/organized rallies consume World Energy
  const worldEnergy =
    orgRallies * RALLY_ENERGY_COST +
    monsters * MONSTER_ENERGY_COST +
    camps * BRIGAND_ENERGY_COST;

  return {
    date: dateStr,
    extAutoJoinCount: extAuto,
    gameAutoJoinCount: gameAuto,
    totalAutoJoinCount: extAuto + gameAuto,
    autoJoinLosses: autoLoss,
    campaignCount: campaign,
    campaignLosses: campLoss,
    organizedRalliesCount: orgRallies,
    rallyLosses: rallyLoss,
    monstersCount: monsters,
    monsterLosses: monsterLoss,
    brigandCampsCount: camps,
    campLosses: campBattleLoss,
    dungeonBattlesToday: dungeonBattles,
    personalTitaniteToday: titanite,
    frontierStagesToday: frontierStages,
    frontierCoinsToday: frontierCoins,
    campaignEnergySpent: campaignEnergy,
    worldEnergySpent: worldEnergy,
    totalEnergySpent: campaignEnergy + worldEnergy,
  };
}

/**
 * Load persisted 30-day activity history from chrome.storage.local
 */
export async function loadDailyActivityHistory(customChrome?: any): Promise<Record<string, DailyActivityStats>> {
  const cr = customChrome || (typeof chrome !== 'undefined' ? chrome : null);
  if (!cr?.storage?.local) return {};
  try {
    const res = await cr.storage.local.get(ACTIVITY_HISTORY_STORAGE_KEY);
    return (res?.[ACTIVITY_HISTORY_STORAGE_KEY] as Record<string, DailyActivityStats>) || {};
  } catch {
    return {};
  }
}

/**
 * Persist daily activity stats to chrome.storage.local, automatically keeping the last 30 days.
 */
export async function persistDailyActivityStats(
  stats: DailyActivityStats,
  customChrome?: any,
  now = Date.now()
): Promise<Record<string, DailyActivityStats>> {
  const cr = customChrome || (typeof chrome !== 'undefined' ? chrome : null);
  if (!cr?.storage?.local || !stats?.date) return {};
  try {
    const current = await loadDailyActivityHistory(cr);
    const existing = current[stats.date];
    const isV2Existing = existing?.autoJoinV2 === true;
    const nextExtAuto = isV2Existing
      ? Math.max(existing?.extAutoJoinCount || 0, stats.extAutoJoinCount)
      : stats.extAutoJoinCount;
    const nextGameAuto = isV2Existing
      ? Math.max(existing?.gameAutoJoinCount || 0, stats.gameAutoJoinCount)
      : stats.gameAutoJoinCount;
    const sameAccount =
      !stats.accountId || !existing?.accountId || String(existing.accountId) === String(stats.accountId);
    const nextTitanite = stats.titaniteAuthoritative
      ? (stats.personalTitaniteToday || 0)
      : sameAccount
        ? Math.max(existing?.personalTitaniteToday || 0, stats.personalTitaniteToday || 0)
        : (stats.personalTitaniteToday || 0);
    const merged: DailyActivityStats = {
      date: stats.date,
      ...(stats.accountId || existing?.accountId ? { accountId: stats.accountId || existing?.accountId } : {}),
      extAutoJoinCount: nextExtAuto,
      gameAutoJoinCount: nextGameAuto,
      totalAutoJoinCount: nextExtAuto + nextGameAuto,
      autoJoinV2: true,
      autoJoinLosses: Math.max(existing?.autoJoinLosses || 0, stats.autoJoinLosses),
      campaignCount: Math.max(existing?.campaignCount || 0, stats.campaignCount),
      campaignLosses: Math.max(existing?.campaignLosses || 0, stats.campaignLosses),
      organizedRalliesCount: Math.max(existing?.organizedRalliesCount || 0, stats.organizedRalliesCount),
      rallyLosses: Math.max(existing?.rallyLosses || 0, stats.rallyLosses),
      monstersCount: Math.max(existing?.monstersCount || 0, stats.monstersCount),
      monsterLosses: Math.max(existing?.monsterLosses || 0, stats.monsterLosses),
      brigandCampsCount: Math.max(existing?.brigandCampsCount || 0, stats.brigandCampsCount),
      campLosses: Math.max(existing?.campLosses || 0, stats.campLosses),
      dungeonBattlesToday: Math.max(existing?.dungeonBattlesToday || 0, stats.dungeonBattlesToday || 0),
      personalTitaniteToday: nextTitanite,
      frontierStagesToday: Math.max(existing?.frontierStagesToday || 0, stats.frontierStagesToday || 0),
      frontierCoinsToday: Math.max(existing?.frontierCoinsToday || 0, stats.frontierCoinsToday || 0),
      campaignEnergySpent: Math.max(existing?.campaignEnergySpent || 0, stats.campaignEnergySpent),
      worldEnergySpent: Math.max(existing?.worldEnergySpent || 0, stats.worldEnergySpent),
      totalEnergySpent: Math.max(existing?.totalEnergySpent || 0, stats.totalEnergySpent),
    };
    current[stats.date] = merged;

    // Prune dates older than 30 days
    const cutoff = getUtcDayOffset(now, -MAX_ACTIVITY_HISTORY_DAYS);
    for (const d of Object.keys(current)) {
      if (d < cutoff) delete current[d];
    }

    await cr.storage.local.set({ [ACTIVITY_HISTORY_STORAGE_KEY]: current });
    return current;
  } catch {
    return {};
  }
}
