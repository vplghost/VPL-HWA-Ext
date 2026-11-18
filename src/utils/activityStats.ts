import { formatUtcDay, getUtcDayOffset } from './resourceIncome.ts';

export interface DailyActivityStats {
  date: string;
  // Raid Auto-Join
  extAutoJoinCount: number;
  gameAutoJoinCount: number;
  totalAutoJoinCount: number;
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

  // Game auto joins from battle reports (if total rallies exceed organized + extension auto-joins)
  let gameAutoJoinCount = marchGameJoins;
  if (rallyReports > 0) {
    const unassignedRallies = Math.max(0, rallyReports - organizedRalliesCount - extAutoJoinCount);
    gameAutoJoinCount = Math.max(gameAutoJoinCount, unassignedRallies);
  }

  // 5. Campaign Raids
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

  // 6. Solo Monsters Hunted
  let monstersCount = Math.max(monsterReports, marchMonsters);
  const monsterQueueState = cache?.monsterQueue;
  if (monsterQueueState && Number.isFinite(monsterQueueState.completed)) {
    monstersCount = Math.max(monstersCount, Number(monsterQueueState.completed));
  }

  // 7. Brigand Camps Cleared
  let brigandCampsCount = campReports;
  const brigandStatus = cache?.brigandCampStatus?.data;
  if (brigandStatus?.success && cache?.brigandCampStatus?.updatedAt) {
    if (formatUtcDay(Date.parse(cache.brigandCampStatus.updatedAt)) === today) {
      brigandCampsCount = Math.max(brigandCampsCount, 1);
    }
  }

  // Preserve overall losses from battleReportSummary if individual reports were claimed/pruned
  if (todayReports?.losses && Number(todayReports.losses) > (rallyLosses + autoJoinLosses + monsterLosses + campLosses)) {
    const unassigned = Number(todayReports.losses) - (rallyLosses + autoJoinLosses + monsterLosses + campLosses);
    if (rallyReports > 0 && organizedRalliesCount > 0) {
      rallyLosses += unassigned;
    } else if (monsterReports > 0) {
      monsterLosses += unassigned;
    } else {
      rallyLosses += unassigned;
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

  // 8. Energy Consumption Calculations
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
    autoJoinLosses,
    campaignCount,
    campaignLosses,
    organizedRalliesCount,
    rallyLosses,
    monstersCount,
    monsterLosses,
    brigandCampsCount,
    campLosses,
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
    const autoLoss = Math.max(liveToday.autoJoinLosses, existing.autoJoinLosses || 0);
    const campaign = Math.max(liveToday.campaignCount, existing.campaignCount || 0);
    const campLoss = Math.max(liveToday.campaignLosses, existing.campaignLosses || 0);
    const orgRallies = Math.max(liveToday.organizedRalliesCount, existing.organizedRalliesCount || 0);
    const rallyLoss = Math.max(liveToday.rallyLosses, existing.rallyLosses || 0);
    const monsters = Math.max(liveToday.monstersCount, existing.monstersCount || 0);
    const monsterLoss = Math.max(liveToday.monsterLosses, existing.monsterLosses || 0);
    const camps = Math.max(liveToday.brigandCampsCount, existing.brigandCampsCount || 0);
    const campBattleLoss = Math.max(liveToday.campLosses, existing.campLosses || 0);

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
      autoJoinLosses: autoLoss,
      campaignCount: campaign,
      campaignLosses: campLoss,
      organizedRalliesCount: orgRallies,
      rallyLosses: rallyLoss,
      monstersCount: monsters,
      monsterLosses: monsterLoss,
      brigandCampsCount: camps,
      campLosses: campBattleLoss,
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

  const campaign = Math.max(history?.campaignCount || 0, campaignCountFromReceipts);
  const orgRallies = Math.max(history?.organizedRalliesCount || 0, pastCreatedCount);
  const extAuto = history?.extAutoJoinCount || 0;
  let gameAuto = history?.gameAutoJoinCount || 0;
  if (rallyReports > 0) {
    gameAuto = Math.max(gameAuto, Math.max(0, rallyReports - orgRallies - extAuto));
  }
  const monsters = Math.max(history?.monstersCount || 0, monsterReports);
  const camps = Math.max(history?.brigandCampsCount || 0, campReports);

  const autoLoss = history?.autoJoinLosses || 0;
  const campLoss = history?.campaignLosses || 0;
  let rallyLoss = history?.rallyLosses || 0;
  let monsterLoss = history?.monsterLosses || 0;
  let campBattleLoss = history?.campLosses || 0;

  // Attribute past day losses if summary has losses not yet broken down
  if (dayReports?.losses && Number(dayReports.losses) > (rallyLoss + autoLoss + monsterLoss + campBattleLoss)) {
    const unassigned = Number(dayReports.losses) - (rallyLoss + autoLoss + monsterLoss + campBattleLoss);
    if (rallyReports > 0 && orgRallies > 0) rallyLoss += unassigned;
    else if (monsterReports > 0) monsterLoss += unassigned;
    else rallyLoss += unassigned;
  }

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
    autoJoinLosses: autoLoss,
    campaignCount: campaign,
    campaignLosses: campLoss,
    organizedRalliesCount: orgRallies,
    rallyLosses: rallyLoss,
    monstersCount: monsters,
    monsterLosses: monsterLoss,
    brigandCampsCount: camps,
    campLosses: campBattleLoss,
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
      autoJoinLosses: Math.max(existing?.autoJoinLosses || 0, stats.autoJoinLosses),
      campaignCount: Math.max(existing?.campaignCount || 0, stats.campaignCount),
      campaignLosses: Math.max(existing?.campaignLosses || 0, stats.campaignLosses),
      organizedRalliesCount: Math.max(existing?.organizedRalliesCount || 0, stats.organizedRalliesCount),
      rallyLosses: Math.max(existing?.rallyLosses || 0, stats.rallyLosses),
      monstersCount: Math.max(existing?.monstersCount || 0, stats.monstersCount),
      monsterLosses: Math.max(existing?.monsterLosses || 0, stats.monsterLosses),
      brigandCampsCount: Math.max(existing?.brigandCampsCount || 0, stats.brigandCampsCount),
      campLosses: Math.max(existing?.campLosses || 0, stats.campLosses),
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
