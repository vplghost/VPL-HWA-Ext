export {
  getTodayActivityStats,
  getActivityStatsForDay,
  loadDailyActivityHistory,
  persistDailyActivityStats,
  type DailyActivityStats,
} from './activityStats.ts';

/**
 * Tracks Gold and Emerald income across observed game activities:
 * - Alchemy / Emerald Exchange (video free spins and paid spins)
 * - Mail Letters & System Rewards (Arena rankings, event rewards)
 * - Combat & Battle Reports (Solo monsters, guild rallies, outpost attacks)
 * - Campaign Raids
 * - Tower Chests & Bosses
 * - Dungeon Rewards
 * - Brigand Camps
 * - Quests & Daily Achievements
 */

export interface IncomeBySource {
  [sourceKey: string]: number;
}

export interface DayIncomeSummary {
  date: string; // YYYY-MM-DD (UTC)
  gold: number;
  emerald: number;
  goldBySource: IncomeBySource;
  emeraldBySource: IncomeBySource;
}

export interface IncomeSourceMeta {
  key: string;
  label: string;
  icon: string;
  description: string;
}

export const INCOME_SOURCES: Record<string, IncomeSourceMeta> = {
  alchemy: {
    key: 'alchemy',
    label: 'Emerald Exchange',
    icon: '🎰',
    description: 'Gold from free video spins and emerald exchange',
  },
  battles: {
    key: 'battles',
    label: 'Combat Reports',
    icon: '⚔️',
    description: 'Monster hunts, guild rallies, and outpost attacks',
  },
  mail: {
    key: 'mail',
    label: 'Mail & Rankings',
    icon: '📬',
    description: 'Arena rankings, compensation, and clan clash mail rewards',
  },
  campaign: {
    key: 'campaign',
    label: 'Campaign Raids',
    icon: '🗺️',
    description: 'Mission raids and campaign gear farming drops',
  },
  tower: {
    key: 'tower',
    label: 'Tower',
    icon: '🗼',
    description: 'Tower floor clears and reward chests',
  },
  dungeon: {
    key: 'dungeon',
    label: 'Dungeon',
    icon: '🚪',
    description: 'Dungeon battle wins and floor rewards',
  },
  brigands: {
    key: 'brigands',
    label: 'Brigand Camps',
    icon: '⛺',
    description: 'Brigand camp clears and settlements',
  },
  quests: {
    key: 'quests',
    label: 'Quests',
    icon: '📜',
    description: 'Daily quests and achievement rewards',
  },
  other: {
    key: 'other',
    label: 'Other Sources',
    icon: '📦',
    description: 'Lootboxes, consumables, and misc rewards',
  },
};

export const SOURCE_COLORS: Record<string, { stroke: string; bg: string; text: string }> = {
  alchemy: { stroke: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-500' },
  battles: { stroke: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-500' },
  mail: { stroke: '#8b5cf6', bg: 'bg-violet-500', text: 'text-violet-500' },
  campaign: { stroke: '#0ea5e9', bg: 'bg-sky-500', text: 'text-sky-500' },
  tower: { stroke: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-500' },
  quests: { stroke: '#f97316', bg: 'bg-orange-500', text: 'text-orange-500' },
  dungeon: { stroke: '#6366f1', bg: 'bg-indigo-500', text: 'text-indigo-500' },
  brigands: { stroke: '#14b8a6', bg: 'bg-teal-500', text: 'text-teal-500' },
  other: { stroke: '#64748b', bg: 'bg-slate-500', text: 'text-slate-500' },
};

export interface EmeraldFluctuation {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  prevAmount: number;
  newAmount: number;
  delta: number;
}

export interface EmeraldDailySummary {
  date: string;
  startAmount: number;
  endAmount: number;
  netDelta: number;
  totalGain: number;
  totalSpend: number;
  fluctuationCount: number;
}

export interface EmeraldHistoryState {
  lastKnownAmount?: number;
  lastUpdatedAt?: number;
  records: EmeraldFluctuation[];
  dailyAggregates: Record<string, EmeraldDailySummary>;
}

/**
 * Format timestamp as YYYY-MM-DD UTC.
 */
export function formatUtcDay(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Get date string offset by N days from given timestamp (UTC).
 */
export function getUtcDayOffset(timestamp: number, daysOffset: number): string {
  const d = new Date(timestamp);
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Generate an array of consecutive YYYY-MM-DD date strings between fromDate and toDate (inclusive).
 */
export function getDateRangeDays(fromDate: string, toDate: string): string[] {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const days: string[] = [];
  let current = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

/**
 * Returns default 7-day range prior to today: [today - 7 days, today - 1 day].
 * Excludes today as today has its own dedicated card.
 */
export function getDefaultPrevious7DaysRange(now: number = Date.now()): { fromDate: string; toDate: string } {
  const toDate = getUtcDayOffset(now, -1);
  const fromDate = getUtcDayOffset(now, -7);
  return { fromDate, toDate };
}

/**
 * Extract income records by day across all known cache slices.
 */
export function aggregateIncomeByDate(cache: Record<string, any> = {}, now: number = Date.now()): Map<string, DayIncomeSummary> {
  const daysMap = new Map<string, DayIncomeSummary>();

  const getOrCreateDay = (dateStr: string): DayIncomeSummary => {
    let day = daysMap.get(dateStr);
    if (!day) {
      day = {
        date: dateStr,
        gold: 0,
        emerald: 0,
        goldBySource: {},
        emeraldBySource: {},
      };
      daysMap.set(dateStr, day);
    }
    return day;
  };

  const addIncome = (dateStr: string, sourceKey: string, goldAmt: number, emeraldAmt: number) => {
    if (!dateStr || (!goldAmt && !emeraldAmt)) return;
    const day = getOrCreateDay(dateStr);
    const validSource = INCOME_SOURCES[sourceKey] ? sourceKey : 'other';

    if (goldAmt > 0) {
      day.gold += goldAmt;
      day.goldBySource[validSource] = (day.goldBySource[validSource] || 0) + goldAmt;
    }
    if (emeraldAmt > 0) {
      day.emerald += emeraldAmt;
      day.emeraldBySource[validSource] = (day.emeraldBySource[validSource] || 0) + emeraldAmt;
    }
  };

  // 1. Battle Report Summary (stored daily UTC aggregates for reports)
  const reportDays = cache?.battleReportSummary?.data?.days;
  if (reportDays && typeof reportDays === 'object') {
    for (const [dayStr, dayData] of Object.entries(reportDays as Record<string, any>)) {
      if (!dayData?.rewards || typeof dayData.rewards !== 'object') continue;
      const rewards = dayData.rewards;
      const gold = Number(rewards['resource:gold'] ?? rewards.gold ?? 0) || 0;
      const emerald = Number(rewards['resource:starMoney'] ?? rewards['resource:diamond'] ?? rewards.starMoney ?? 0) || 0;
      if (gold > 0 || emerald > 0) {
        addIncome(dayStr, 'battles', gold, emerald);
      }
    }
  }

  // 2. Mail Claim Receipts (Letters & System Rewards)
  const receipts = Array.isArray(cache?.mailClaimReceipts?.data)
    ? cache.mailClaimReceipts.data
    : cache?.mailClaimReceipts?.data && typeof cache.mailClaimReceipts.data === 'object'
      ? Object.values(cache.mailClaimReceipts.data)
      : [];

  for (const receipt of receipts as any[]) {
    if (!receipt?.success || !receipt?.at) continue;
    const dateStr = formatUtcDay(Date.parse(receipt.at));
    if (!dateStr) continue;

    // Distinguish letters vs reports: reports are already in battleReportSummary.
    // Letters carry rewards like Arena ranking rewards or event gifts.
    if (receipt.kind === 'letters' && receipt.reward && typeof receipt.reward === 'object') {
      let letterGold = 0;
      let letterEmerald = 0;
      for (const item of Object.values(receipt.reward) as any[]) {
        if (!item) continue;
        if (Array.isArray(item)) {
          for (const r of item) {
            const amt = Number(r?.amount ?? r?.count ?? r?.quantity ?? 0);
            if (r?.type === 'gold' || r?.key === 'resource:gold') letterGold += amt;
            if (r?.type === 'starMoney' || r?.key === 'resource:starMoney' || r?.type === 'diamond') letterEmerald += amt;
          }
        } else if (typeof item === 'object') {
          const goldVal = Number(item.gold ?? item['resource:gold'] ?? 0);
          const emVal = Number(item.starMoney ?? item['resource:starMoney'] ?? item.diamond ?? 0);
          letterGold += goldVal;
          letterEmerald += emVal;
        }
      }
      if (letterGold > 0 || letterEmerald > 0) {
        addIncome(dateStr, 'mail', letterGold, letterEmerald);
      }
    }
  }

  // 3. Free Alchemy Spins
  const alchemySpin = cache?.freeAlchemySpinAction?.data;
  if (alchemySpin?.success && alchemySpin.gold > 0 && cache?.freeAlchemySpinAction?.updatedAt) {
    const dateStr = formatUtcDay(Date.parse(cache.freeAlchemySpinAction.updatedAt));
    if (dateStr) {
      addIncome(dateStr, 'alchemy', alchemySpin.gold, 0);
    }
  }

  // 4. Stored persistent daily income logs (resourceIncomeHistory)
  const customIncome = cache?.resourceIncomeHistory?.data?.days ?? cache?.resourceIncomeHistory?.data ?? cache?.resourceIncomeHistory;
  if (customIncome && typeof customIncome === 'object') {
    for (const [dayStr, summary] of Object.entries(customIncome as Record<string, any>)) {
      if (!summary || typeof summary !== 'object') continue;
      if (summary.goldBySource && typeof summary.goldBySource === 'object') {
        for (const [src, amt] of Object.entries(summary.goldBySource)) {
          const num = Number(amt) || 0;
          const existing = daysMap.get(dayStr)?.goldBySource?.[src] || 0;
          if (num > existing) {
            addIncome(dayStr, src, num - existing, 0);
          }
        }
      }
      if (summary.emeraldBySource && typeof summary.emeraldBySource === 'object') {
        for (const [src, amt] of Object.entries(summary.emeraldBySource)) {
          const num = Number(amt) || 0;
          const existing = daysMap.get(dayStr)?.emeraldBySource?.[src] || 0;
          if (num > existing) {
            addIncome(dayStr, src, 0, num - existing);
          }
        }
      }
    }
  }

  // 5. Campaign Raids (lastCampaignRaidResult and historical raid receipts)
  const campaignEntries = [
    cache?.lastCampaignRaidResult,
    ...(Array.isArray(cache?.campaignRaidReceipts?.data) ? cache.campaignRaidReceipts.data : []),
  ];
  const campaignByDay = new Map<string, { gold: number; emerald: number }>();
  for (const cEntry of campaignEntries) {
    if (!cEntry) continue;
    const timeVal = cEntry.updatedAt || cEntry.at;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    const drops = cEntry.data?.drops ?? cEntry.drops;
    if (!dateStr || !drops) continue;
    const raidGold = Number(drops.gold ?? drops['resource:gold'] ?? 0);
    const raidEmerald = Number(drops.starMoney ?? drops['resource:starMoney'] ?? drops.diamond ?? 0);
    if (raidGold > 0 || raidEmerald > 0) {
      const cur = campaignByDay.get(dateStr) || { gold: 0, emerald: 0 };
      cur.gold += raidGold;
      cur.emerald += raidEmerald;
      campaignByDay.set(dateStr, cur);
    }
  }
  for (const [dateStr, cData] of campaignByDay) {
    const existingGold = daysMap.get(dateStr)?.goldBySource?.campaign || 0;
    const existingEm = daysMap.get(dateStr)?.emeraldBySource?.campaign || 0;
    if (cData.gold > existingGold || cData.emerald > existingEm) {
      addIncome(dateStr, 'campaign', Math.max(0, cData.gold - existingGold), Math.max(0, cData.emerald - existingEm));
    }
  }

  // 6. Quests (questClaimStatus claims and completed quests)
  const questClaims = Array.isArray(cache?.questClaimStatus?.data?.claims)
    ? cache.questClaimStatus.data.claims
    : Array.isArray(cache?.questClaimStatus?.claims)
      ? cache.questClaimStatus.claims
      : [];

  const allQuestItems = [
    ...questClaims,
    ...(cache?.questClaimAction ? [cache.questClaimAction] : []),
  ];

  const questByDay = new Map<string, { gold: number; emerald: number }>();
  for (const claim of allQuestItems as any[]) {
    if (!claim) continue;
    const timeVal = claim.at || claim.updatedAt;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    const reward = claim.data?.reward ?? claim.reward;
    if (!dateStr || !reward || typeof reward !== 'object') continue;

    let qGold = Number(reward.gold ?? reward['resource:gold'] ?? 0);
    let qEmerald = Number(reward.starMoney ?? reward['resource:starMoney'] ?? reward.diamond ?? 0);

    const arrayRewards = Array.isArray(reward.reward) ? reward.reward : (Array.isArray(reward.rewards) ? reward.rewards : []);
    for (const item of arrayRewards) {
      const amt = Number(item?.amount ?? item?.count ?? item?.quantity ?? 0);
      if (item?.type === 'gold' || item?.key === 'resource:gold') qGold += amt;
      if (item?.type === 'starMoney' || item?.type === 'diamond' || item?.key === 'resource:starMoney') qEmerald += amt;
    }

    if (qGold > 0 || qEmerald > 0) {
      const cur = questByDay.get(dateStr) || { gold: 0, emerald: 0 };
      cur.gold += qGold;
      cur.emerald += qEmerald;
      questByDay.set(dateStr, cur);
    }
  }

  for (const [dateStr, qData] of questByDay) {
    const existingGold = daysMap.get(dateStr)?.goldBySource?.quests || 0;
    const existingEm = daysMap.get(dateStr)?.emeraldBySource?.quests || 0;
    if (qData.gold > existingGold || qData.emerald > existingEm) {
      addIncome(dateStr, 'quests', Math.max(0, qData.gold - existingGold), Math.max(0, qData.emerald - existingEm));
    }
  }

  // 7. Dungeon Rewards (dungeonRewardAction and dungeon floor/battle rewards)
  const dungeonEntries = [
    cache?.dungeonRewardAction,
    ...(Array.isArray(cache?.dungeonRewardHistory?.data) ? cache.dungeonRewardHistory.data : []),
  ];
  const dungeonByDay = new Map<string, { gold: number; emerald: number }>();
  for (const dEntry of dungeonEntries) {
    if (!dEntry) continue;
    const timeVal = dEntry.updatedAt || dEntry.at;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    const reward = dEntry.data?.reward ?? dEntry.reward;
    if (!dateStr || !reward || typeof reward !== 'object') continue;

    const dGold = Number(reward.gold ?? reward['resource:gold'] ?? 0);
    const dEmerald = Number(reward.starMoney ?? reward['resource:starMoney'] ?? reward.diamond ?? 0);
    if (dGold > 0 || dEmerald > 0) {
      const cur = dungeonByDay.get(dateStr) || { gold: 0, emerald: 0 };
      cur.gold += dGold;
      cur.emerald += dEmerald;
      dungeonByDay.set(dateStr, cur);
    }
  }
  for (const [dateStr, dData] of dungeonByDay) {
    const existingGold = daysMap.get(dateStr)?.goldBySource?.dungeon || 0;
    const existingEm = daysMap.get(dateStr)?.emeraldBySource?.dungeon || 0;
    if (dData.gold > existingGold || dData.emerald > existingEm) {
      addIncome(dateStr, 'dungeon', Math.max(0, dData.gold - existingGold), Math.max(0, dData.emerald - existingEm));
    }
  }

  // 8. Tower (magicTower_openChest and towerAction rewards)
  const towerEntries = [
    cache?.towerAction,
    ...(Array.isArray(cache?.towerHistory?.data) ? cache.towerHistory.data : []),
  ];
  const towerByDay = new Map<string, { gold: number; emerald: number }>();
  for (const tEntry of towerEntries) {
    if (!tEntry) continue;
    const timeVal = tEntry.updatedAt || tEntry.at;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    const reward = tEntry.data?.reward ?? tEntry.reward;
    if (!dateStr || !reward || typeof reward !== 'object') continue;

    const tGold = Number(reward.gold ?? reward['resource:gold'] ?? 0);
    const tEmerald = Number(reward.starMoney ?? reward['resource:starMoney'] ?? reward.diamond ?? 0);
    if (tGold > 0 || tEmerald > 0) {
      const cur = towerByDay.get(dateStr) || { gold: 0, emerald: 0 };
      cur.gold += tGold;
      cur.emerald += tEmerald;
      towerByDay.set(dateStr, cur);
    }
  }
  for (const [dateStr, tData] of towerByDay) {
    const existingGold = daysMap.get(dateStr)?.goldBySource?.tower || 0;
    const existingEm = daysMap.get(dateStr)?.emeraldBySource?.tower || 0;
    if (tData.gold > existingGold || tData.emerald > existingEm) {
      addIncome(dateStr, 'tower', Math.max(0, tData.gold - existingGold), Math.max(0, tData.emerald - existingEm));
    }
  }

  // 9. Free Video Boxes, Brigands, & Misc Sources (other / brigands)
  const miscBoxes = [
    cache?.freeBoxAction,
    cache?.cinemaBoxAction,
    cache?.clanVersusChestAction,
    cache?.expeditionCollectAction,
    cache?.brigandCampAction,
  ];
  const miscByDay = new Map<string, Map<string, { gold: number; emerald: number }>>();
  for (const mEntry of miscBoxes) {
    if (!mEntry) continue;
    const timeVal = mEntry.updatedAt || mEntry.at;
    const dateStr = formatUtcDay(typeof timeVal === 'string' ? Date.parse(timeVal) : timeVal);
    if (!dateStr) continue;

    const data = mEntry.data ?? mEntry;
    const reward = data?.reward ?? data;
    const bGold = Number(data?.gold ?? reward?.gold ?? reward?.['resource:gold'] ?? 0);
    const bEmerald = Number(data?.starMoney ?? reward?.starMoney ?? reward?.['resource:starMoney'] ?? reward?.diamond ?? 0);
    const sourceKey = mEntry.key === 'brigandCampAction' ? 'brigands' : 'other';

    if (bGold > 0 || bEmerald > 0) {
      if (!miscByDay.has(dateStr)) miscByDay.set(dateStr, new Map());
      const dayMap = miscByDay.get(dateStr)!;
      const cur = dayMap.get(sourceKey) || { gold: 0, emerald: 0 };
      cur.gold += bGold;
      cur.emerald += bEmerald;
      dayMap.set(sourceKey, cur);
    }
  }
  for (const [dateStr, dayMap] of miscByDay) {
    for (const [sourceKey, mData] of dayMap) {
      const existingGold = daysMap.get(dateStr)?.goldBySource?.[sourceKey] || 0;
      const existingEm = daysMap.get(dateStr)?.emeraldBySource?.[sourceKey] || 0;
      if (mData.gold > existingGold || mData.emerald > existingEm) {
        addIncome(dateStr, sourceKey, Math.max(0, mData.gold - existingGold), Math.max(0, mData.emerald - existingEm));
      }
    }
  }

  return daysMap;
}

/**
 * Get Today's income summary with breakdown by source.
 */
export function getTodayIncome(cache: Record<string, any> = {}, now: number = Date.now()): DayIncomeSummary {
  const todayStr = formatUtcDay(now);
  const allDays = aggregateIncomeByDate(cache, now);
  const todayRecord = allDays.get(todayStr);

  if (todayRecord) {
    return todayRecord;
  }

  return {
    date: todayStr,
    gold: 0,
    emerald: 0,
    goldBySource: {},
    emeraldBySource: {},
  };
}

/**
 * Get daily income series between fromDate and toDate (inclusive).
 * Fills zero-income days within the range so charts have uniform continuous dates.
 */
export function getDailyIncomeTrend(
  cache: Record<string, any> = {},
  options: { fromDate?: string; toDate?: string; now?: number } = {}
): DayIncomeSummary[] {
  const now = options.now ?? Date.now();
  const defaultRange = getDefaultPrevious7DaysRange(now);
  const fromDate = options.fromDate || defaultRange.fromDate;
  const toDate = options.toDate || defaultRange.toDate;

  const dateList = getDateRangeDays(fromDate, toDate);
  const allDays = aggregateIncomeByDate(cache, now);

  return dateList.map((dateStr) => {
    const existing = allDays.get(dateStr);
    if (existing) return existing;
    return {
      date: dateStr,
      gold: 0,
      emerald: 0,
      goldBySource: {},
      emeraldBySource: {},
    };
  });
}

/**
 * Format compact number with metric suffix (e.g. 1.2M, 450K, 120).
 */
export function formatCompactNumber(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '0';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (abs >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (abs >= 1_000) {
    return (amount / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return amount.toLocaleString('en-US');
}

/**
 * Get current emerald amount from cache slices.
 */
export function getCurrentEmeraldAmount(cache: Record<string, any> = {}): number | null {
  const val =
    cache?.['resource:starMoney']?.data?.amount ??
    cache?.['resource:diamond']?.data?.amount ??
    cache?.userGetInfo?.data?.user?.starMoney ??
    cache?.userGetInfo?.data?.starMoney;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Extract emerald history state from cache.
 */
export function getEmeraldHistory(cache: Record<string, any> = {}): EmeraldHistoryState {
  const data = cache?.emeraldHistory?.data ?? cache?.emeraldHistory ?? {};
  return {
    lastKnownAmount: typeof data.lastKnownAmount === 'number' ? data.lastKnownAmount : undefined,
    lastUpdatedAt: typeof data.lastUpdatedAt === 'number' ? data.lastUpdatedAt : undefined,
    records: Array.isArray(data.records) ? data.records : [],
    dailyAggregates: data.dailyAggregates && typeof data.dailyAggregates === 'object' ? data.dailyAggregates : {},
  };
}

/**
 * Record an emerald snapshot / fluctuation into emerald history.
 * Returns updated history state and whether a new fluctuation was logged.
 */
export function recordEmeraldFluctuation(
  cache: Record<string, any>,
  newAmount: number,
  now: number = Date.now()
): { updated: boolean; state: EmeraldHistoryState; fluctuation?: EmeraldFluctuation } {
  if (!Number.isFinite(newAmount) || newAmount < 0) {
    return { updated: false, state: getEmeraldHistory(cache) };
  }

  const state = getEmeraldHistory(cache);
  const records = [...state.records];
  const dailyAggregates = { ...state.dailyAggregates };

  if (state.lastKnownAmount === undefined) {
    const nextState: EmeraldHistoryState = {
      lastKnownAmount: newAmount,
      lastUpdatedAt: now,
      records,
      dailyAggregates,
    };
    return { updated: true, state: nextState };
  }

  if (state.lastKnownAmount === newAmount) {
    return { updated: false, state };
  }

  const prevAmount = state.lastKnownAmount;
  const delta = newAmount - prevAmount;
  const actionDate = new Date(now);
  const dateStr = formatUtcDay(now);
  const timeStr = actionDate.toISOString().slice(11, 19);

  const fluctuation: EmeraldFluctuation = {
    id: `em-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    date: dateStr,
    time: timeStr,
    prevAmount,
    newAmount,
    delta,
  };

  records.push(fluctuation);
  // Keep up to 300 recent fluctuation records
  const cappedRecords = records.length > 300 ? records.slice(-300) : records;

  // Update daily aggregate
  const prevDaily = dailyAggregates[dateStr] || {
    date: dateStr,
    startAmount: prevAmount,
    endAmount: newAmount,
    netDelta: 0,
    totalGain: 0,
    totalSpend: 0,
    fluctuationCount: 0,
  };

  const updatedDaily: EmeraldDailySummary = {
    date: dateStr,
    startAmount: prevDaily.startAmount ?? prevAmount,
    endAmount: newAmount,
    netDelta: prevDaily.netDelta + delta,
    totalGain: delta > 0 ? prevDaily.totalGain + delta : prevDaily.totalGain,
    totalSpend: delta < 0 ? prevDaily.totalSpend + Math.abs(delta) : prevDaily.totalSpend,
    fluctuationCount: prevDaily.fluctuationCount + 1,
  };

  dailyAggregates[dateStr] = updatedDaily;

  const nextState: EmeraldHistoryState = {
    lastKnownAmount: newAmount,
    lastUpdatedAt: now,
    records: cappedRecords,
    dailyAggregates,
  };

  return { updated: true, state: nextState, fluctuation };
}

/**
 * Get today's emerald fluctuations list.
 */
export function getTodayEmeraldFluctuations(cache: Record<string, any> = {}, now: number = Date.now()): EmeraldFluctuation[] {
  const todayStr = formatUtcDay(now);
  const history = getEmeraldHistory(cache);
  return history.records.filter((r) => r.date === todayStr);
}

/**
 * Get today's emerald aggregate summary.
 */
export function getTodayEmeraldSummary(cache: Record<string, any> = {}, now: number = Date.now()): EmeraldDailySummary {
  const todayStr = formatUtcDay(now);
  const history = getEmeraldHistory(cache);
  const existing = history.dailyAggregates[todayStr];
  const current = getCurrentEmeraldAmount(cache) ?? history.lastKnownAmount ?? 0;

  if (existing) {
    return existing;
  }

  const todayRecords = history.records.filter((r) => r.date === todayStr);
  if (todayRecords.length > 0) {
    let totalGain = 0;
    let totalSpend = 0;
    let netDelta = 0;
    for (const r of todayRecords) {
      netDelta += r.delta;
      if (r.delta > 0) totalGain += r.delta;
      else totalSpend += Math.abs(r.delta);
    }
    return {
      date: todayStr,
      startAmount: todayRecords[0]?.prevAmount ?? current,
      endAmount: todayRecords[todayRecords.length - 1]?.newAmount ?? current,
      netDelta,
      totalGain,
      totalSpend,
      fluctuationCount: todayRecords.length,
    };
  }

  return {
    date: todayStr,
    startAmount: current,
    endAmount: current,
    netDelta: 0,
    totalGain: 0,
    totalSpend: 0,
    fluctuationCount: 0,
  };
}

/**
 * Get daily emerald trend aggregated by day across a date range.
 */
export function getDailyEmeraldTrend(
  cache: Record<string, any> = {},
  options: { fromDate?: string; toDate?: string; now?: number } = {}
): EmeraldDailySummary[] {
  const now = options.now ?? Date.now();
  const defaultRange = getDefaultPrevious7DaysRange(now);
  const fromDate = options.fromDate || defaultRange.fromDate;
  const toDate = options.toDate || defaultRange.toDate;

  const dateList = getDateRangeDays(fromDate, toDate);
  const history = getEmeraldHistory(cache);
  const allDaysIncome = aggregateIncomeByDate(cache, now);

  return dateList.map((dateStr) => {
    const existing = history.dailyAggregates[dateStr];
    if (existing) return existing;

    const fallbackDay = allDaysIncome.get(dateStr);
    const fallbackEmerald = fallbackDay?.emerald || 0;

    return {
      date: dateStr,
      startAmount: 0,
      endAmount: 0,
      netDelta: fallbackEmerald,
      totalGain: fallbackEmerald,
      totalSpend: 0,
      fluctuationCount: fallbackEmerald > 0 ? 1 : 0,
    };
  });
}
