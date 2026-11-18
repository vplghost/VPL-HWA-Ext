import { formatUtcDay, getUtcDayOffset } from './resourceIncome.ts';

export interface DailyActivityStats {
  date: string;
  // Raid Auto-Join
  extAutoJoinCount: number;
  gameAutoJoinCount: number;
  totalAutoJoinCount: number;
  // Activities
  campaignCount: number;
  organizedRalliesCount: number;
  monstersCount: number;
  brigandCampsCount: number;
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

  // 1. Raid Auto-Joins (Extension vs Game)
  const priorityJoins = Array.isArray(cache?.priorityAutoJoinedRallies?.data)
    ? cache.priorityAutoJoinedRallies.data
    : [];
  let extAutoJoinCount = priorityJoins.length;

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
          if (m.rally.rallyId && !priorityJoins.includes(m.rally.rallyId)) {
            extAutoJoinCount++;
          }
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

  // 3. Organized Rallies (Player as Leader)
  let organizedRalliesCount = marchOrganizedRallies;
  const raidQueueState = cache?.raidQueue;
  if (raidQueueState && Number.isFinite(raidQueueState.completed)) {
    organizedRalliesCount = Math.max(organizedRalliesCount, Number(raidQueueState.completed));
  }
  const rallyAction = cache?.rallyAction?.data;
  if (rallyAction?.action === 'create' && cache?.rallyAction?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.rallyAction.updatedAt)) === today) {
      organizedRalliesCount = Math.max(organizedRalliesCount, 1);
    }
  }

  // Game auto joins from battle reports (if total rallies exceed organized + extension auto-joins)
  let gameAutoJoinCount = marchGameJoins;
  if (rallyReports > 0) {
    const unassignedRallies = Math.max(0, rallyReports - organizedRalliesCount - extAutoJoinCount);
    gameAutoJoinCount = Math.max(gameAutoJoinCount, unassignedRallies);
  }

  // 4. Campaign Raids
  let campaignCount = 0;
  const campaignReceipts = Array.isArray(cache?.campaignRaidReceipts?.data)
    ? cache.campaignRaidReceipts.data
    : [];

  const seenCampaignTimes = new Set<string>();
  for (const r of campaignReceipts) {
    if (!r) continue;
    const timeVal = r.at || r.timestamp || r.updatedAt;
    if (!timeVal) continue;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    if (dateStr === today) {
      const times = Number(r.times) || 1;
      campaignCount += times;
      seenCampaignTimes.add(String(timeVal));
    }
  }

  const lastRaid = cache?.lastCampaignRaidResult;
  if (lastRaid) {
    const timeVal = lastRaid.updatedAt || lastRaid.at;
    if (timeVal) {
      const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
      if (dateStr === today && !seenCampaignTimes.has(String(timeVal))) {
        const times = Number(lastRaid.data?.times ?? lastRaid.times ?? 1);
        campaignCount += times;
      }
    }
  }

  // 5. Solo Monsters Hunted
  let monstersCount = Math.max(monsterReports, marchMonsters);
  const monsterQueueState = cache?.monsterQueue;
  if (monsterQueueState && Number.isFinite(monsterQueueState.completed)) {
    monstersCount = Math.max(monstersCount, Number(monsterQueueState.completed));
  }

  // 6. Brigand Camps Cleared
  let brigandCampsCount = campReports;
  const brigandStatus = cache?.brigandCampStatus?.data;
  if (brigandStatus?.success && cache?.brigandCampStatus?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.brigandCampStatus.updatedAt)) === today) {
      brigandCampsCount = Math.max(brigandCampsCount, 1);
    }
  }

  // 7. Energy Consumption Calculations
  // Only host/organized rallies consume World Energy (joining rallies costs 0 World Energy)
  const campaignEnergySpent = campaignCount * CAMPAIGN_ENERGY_COST;
  const worldEnergySpent =
    organizedRalliesCount * RALLY_ENERGY_COST +
    monstersCount * MONSTER_ENERGY_COST +
    brigandCampsCount * BRIGAND_ENERGY_COST;

  const totalEnergySpent = campaignEnergySpent + worldEnergySpent;

  return {
    date: today,
    extAutoJoinCount,
    gameAutoJoinCount,
    totalAutoJoinCount: extAutoJoinCount + gameAutoJoinCount,
    campaignCount,
    organizedRalliesCount,
    monstersCount,
    brigandCampsCount,
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

    // Merge live with existing stored records (taking maximums)
    const extAuto = Math.max(liveToday.extAutoJoinCount, existing.extAutoJoinCount || 0);
    const gameAuto = Math.max(liveToday.gameAutoJoinCount, existing.gameAutoJoinCount || 0);
    const campaign = Math.max(liveToday.campaignCount, existing.campaignCount || 0);
    const orgRallies = Math.max(liveToday.organizedRalliesCount, existing.organizedRalliesCount || 0);
    const monsters = Math.max(liveToday.monstersCount, existing.monstersCount || 0);
    const camps = Math.max(liveToday.brigandCampsCount, existing.brigandCampsCount || 0);

    const campaignEnergy = campaign * CAMPAIGN_ENERGY_COST;
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
      campaignCount: campaign,
      organizedRalliesCount: orgRallies,
      monstersCount: monsters,
      brigandCampsCount: camps,
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

  // Campaign receipts for that specific past date
  let campaignCountFromReceipts = 0;
  const campaignReceipts = Array.isArray(cache?.campaignRaidReceipts?.data)
    ? cache.campaignRaidReceipts.data
    : [];
  for (const r of campaignReceipts) {
    if (!r) continue;
    const timeVal = r.at || r.timestamp || r.updatedAt;
    if (!timeVal) continue;
    const dStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    if (dStr === dateStr) {
      campaignCountFromReceipts += Number(r.times) || 1;
    }
  }

  const campaign = Math.max(history?.campaignCount || 0, campaignCountFromReceipts);
  const orgRallies = history?.organizedRalliesCount || 0;
  const extAuto = history?.extAutoJoinCount || 0;
  let gameAuto = history?.gameAutoJoinCount || 0;
  if (rallyReports > 0) {
    gameAuto = Math.max(gameAuto, Math.max(0, rallyReports - orgRallies - extAuto));
  }
  const monsters = Math.max(history?.monstersCount || 0, monsterReports);
  const camps = Math.max(history?.brigandCampsCount || 0, campReports);

  const campaignEnergy = campaign * CAMPAIGN_ENERGY_COST;
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
    campaignCount: campaign,
    organizedRalliesCount: orgRallies,
    monstersCount: monsters,
    brigandCampsCount: camps,
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
    const merged: DailyActivityStats = {
      date: stats.date,
      extAutoJoinCount: Math.max(existing?.extAutoJoinCount || 0, stats.extAutoJoinCount),
      gameAutoJoinCount: Math.max(existing?.gameAutoJoinCount || 0, stats.gameAutoJoinCount),
      totalAutoJoinCount: Math.max(existing?.totalAutoJoinCount || 0, stats.totalAutoJoinCount),
      campaignCount: Math.max(existing?.campaignCount || 0, stats.campaignCount),
      organizedRalliesCount: Math.max(existing?.organizedRalliesCount || 0, stats.organizedRalliesCount),
      monstersCount: Math.max(existing?.monstersCount || 0, stats.monstersCount),
      brigandCampsCount: Math.max(existing?.brigandCampsCount || 0, stats.brigandCampsCount),
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
