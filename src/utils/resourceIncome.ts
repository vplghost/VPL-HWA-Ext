/**
 * Resource income aggregation and analytics utilities.
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

  // 4. Stored custom daily income logs if persisted in storage
  const customIncome = cache?.resourceIncomeHistory?.data ?? cache?.resourceIncomeHistory;
  if (customIncome && typeof customIncome === 'object') {
    for (const [dayStr, summary] of Object.entries(customIncome as Record<string, any>)) {
      if (!summary || typeof summary !== 'object') continue;
      if (summary.goldBySource) {
        for (const [src, amt] of Object.entries(summary.goldBySource)) {
          addIncome(dayStr, src, Number(amt) || 0, 0);
        }
      }
      if (summary.emeraldBySource) {
        for (const [src, amt] of Object.entries(summary.emeraldBySource)) {
          addIncome(dayStr, src, 0, Number(amt) || 0);
        }
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
