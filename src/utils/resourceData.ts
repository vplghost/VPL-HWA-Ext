import { isInactiveResource } from './itemResources.ts';
import { getItemName } from '../data/nameData.ts';
import { getMineTypeLevel } from './experimentalData.ts';

export interface ResourceTheme {
  name: string;
  icon: string;
  badgeClasses: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  progressBarClass: string;
}

export const RESOURCE_THEMES: Record<string, ResourceTheme> = {
  food: {
    name: 'Food',
    icon: '🌾',
    badgeClasses: 'bg-lime-100 text-lime-900 ring-lime-400 dark:bg-lime-950/70 dark:text-lime-200 dark:ring-lime-700',
    textClass: 'text-lime-700 dark:text-lime-300',
    bgClass: 'bg-lime-50 dark:bg-lime-950/40',
    borderClass: 'border-lime-200 dark:border-lime-800',
    progressBarClass: 'bg-lime-500',
  },
  wood: {
    name: 'Wood',
    icon: '🪵',
    badgeClasses: 'bg-emerald-100 text-emerald-900 ring-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-700',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    progressBarClass: 'bg-emerald-500',
  },
  stone: {
    name: 'Stone',
    icon: '🪨',
    badgeClasses: 'bg-slate-200 text-slate-800 ring-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
    textClass: 'text-slate-700 dark:text-slate-300',
    bgClass: 'bg-slate-100 dark:bg-slate-800/60',
    borderClass: 'border-slate-300 dark:border-slate-700',
    progressBarClass: 'bg-slate-500',
  },
  iron: {
    name: 'Iron',
    icon: '⚙️',
    badgeClasses: 'bg-cyan-100 text-cyan-900 ring-cyan-400 dark:bg-cyan-950/70 dark:text-cyan-200 dark:ring-cyan-700',
    textClass: 'text-cyan-700 dark:text-cyan-300',
    bgClass: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderClass: 'border-cyan-200 dark:border-cyan-800',
    progressBarClass: 'bg-cyan-500',
  },
  gold: {
    name: 'Gold',
    icon: '🪙',
    badgeClasses: 'bg-yellow-100 text-yellow-900 ring-yellow-400 dark:bg-yellow-950/70 dark:text-yellow-200 dark:ring-yellow-700',
    textClass: 'text-yellow-700 dark:text-yellow-300',
    bgClass: 'bg-yellow-50 dark:bg-yellow-950/40',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
    progressBarClass: 'bg-yellow-500',
  },
};

export function resolveMarchResourceType(march: any, cache?: any): string | null {
  if (!march) return null;
  const directKind = march.kind === 'return' ? march.previousKind : march.kind;
  if (['food', 'wood', 'stone', 'iron', 'gold'].includes(directKind)) {
    return directKind;
  }
  const typeField = march.mineType || march.resourceType;
  if (['food', 'wood', 'stone', 'iron', 'gold'].includes(typeField)) {
    return typeField;
  }
  if (march.mineConfigId) {
    const config = getMineTypeLevel(march.mineConfigId);
    if (config?.type && ['food', 'wood', 'stone', 'iron', 'gold'].includes(config.type)) {
      return config.type;
    }
  }
  const mineId = march.mineId || march.targetId;
  if (mineId && cache?.mineMap?.[mineId]) {
    const mine = cache.mineMap[mineId];
    if (['food', 'wood', 'stone', 'iron', 'gold'].includes(mine.mineType)) {
      return mine.mineType;
    }
    if (mine.mineConfigId) {
      const config = getMineTypeLevel(mine.mineConfigId);
      if (config?.type && ['food', 'wood', 'stone', 'iron', 'gold'].includes(config.type)) {
        return config.type;
      }
    }
  }
  if (cache?.gatheringStatus?.data) {
    const raw = cache.gatheringStatus.data.gatherings;
    const summaries: any[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    const saved = cache.gatheringStatus.data.plans?.[march?.squadId];
    const summary = summaries.find(
      (row) =>
        row &&
        march?.squadId != null &&
        String(row.squadId) === String(march.squadId) &&
        (!mineId || row.mineId === mineId)
    ) || (saved && (!mineId || saved.mineId === mineId) ? saved : null);
    if (summary) {
      const sType = summary.mineType || summary.resourceType;
      if (['food', 'wood', 'stone', 'iron', 'gold'].includes(sType)) {
        return sType;
      }
      if (summary.mineConfigId) {
        const config = getMineTypeLevel(summary.mineConfigId);
        if (config?.type && ['food', 'wood', 'stone', 'iron', 'gold'].includes(config.type)) {
          return config.type;
        }
      }
    }
  }
  const target = String(march.targetName || '').toLowerCase();
  if (target.includes('food')) return 'food';
  if (target.includes('wood') || target.includes('lumber')) return 'wood';
  if (target.includes('stone') || target.includes('quarry')) return 'stone';
  if (target.includes('iron')) return 'iron';
  if (target.includes('gold')) return 'gold';
  return null;
}

export interface ResourceEntry {
  key?: string;
  data?: {
    amount?: number;
    lastRefillAt?: number;
    refillEveryMs?: number;
    refillAmount?: number;
    cap?: number;
    label?: string;
    renewable?: boolean;
    queues?: Array<{
      startDate: number;
      durationMs: number;
      [key: string]: any;
    }>;
    [key: string]: any;
  };
}

export function formatResourceAmount(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) return '—';
  if (Math.abs(value) < 1_000_000) return value.toLocaleString('en-US');
  const roundedMillions = Math.round(Math.abs(value) / 100_000);
  const unit = Math.abs(value) >= 1_000_000_000 || roundedMillions >= 10_000 ? 1_000_000_000 : 1_000_000;
  const suffix = unit === 1_000_000_000 ? 'B' : 'M';
  return `${(value / unit).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${suffix}`;
}

export function getAmountAt(entry: ResourceEntry | undefined, now = Date.now()): number | null {
  const data = entry?.data;
  if (!Number.isFinite(data?.amount)) return null;
  const { lastRefillAt, refillEveryMs, refillAmount, cap } = data!;
  if (
    !Number.isFinite(lastRefillAt) ||
    !Number.isFinite(refillEveryMs) ||
    (refillEveryMs || 0) <= 0 ||
    !Number.isFinite(refillAmount) ||
    (refillAmount || 0) <= 0 ||
    !Number.isFinite(cap)
  ) {
    return data!.amount!;
  }
  if (data!.amount! >= cap!) return data!.amount!;
  const elapsed = Math.max(0, now - lastRefillAt!);
  return Math.min(cap!, data!.amount! + Math.floor(elapsed / refillEveryMs!) * refillAmount!);
}

export function getNextRefillSeconds(entry: ResourceEntry | undefined, now = Date.now()): number | null {
  const data = entry?.data;
  if (
    !Number.isFinite(data?.lastRefillAt) ||
    !Number.isFinite(data?.refillEveryMs) ||
    (data?.refillEveryMs || 0) <= 0 ||
    !Number.isFinite(data?.cap)
  ) {
    return null;
  }
  const current = getAmountAt(entry, now);
  if (current === null || current >= data!.cap!) return null;

  const elapsed = Math.max(0, now - data!.lastRefillAt!);
  const remainder = elapsed % data!.refillEveryMs!;
  return Math.ceil((data!.refillEveryMs! - remainder) / 1000);
}

export function remainingMinutes(entry: any, now = Date.now()): number | null {
  const queues = entry?.data?.queues;
  if (!Array.isArray(queues) || !queues.length) return null;
  const ends = queues
    .map((q: any) => q.startDate + q.durationMs)
    .filter((end: number) => Number.isFinite(end) && end > now);
  if (!ends.length) return null;
  return Math.ceil((Math.min(...ends) - now) / 60000);
}

export function hoursMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function tooltipTime(seconds: number | null): string {
  if (!Number.isFinite(seconds) || seconds === null || seconds < 0) return '—';
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (seconds < 3600) return `${String(minutes).padStart(2, '0')} min`;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function resourceAppearance(entry: ResourceEntry | undefined): { icon: string; classes: string } {
  const key = entry?.key || '';
  if (key === 'resource:refillable:2') return { icon: '✦', classes: 'bg-violet-50 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 ring-violet-200 dark:ring-violet-700/60' };
  if (key === 'resource:material:5') return { icon: '🌾', classes: 'bg-lime-50 dark:bg-lime-950/60 text-lime-900 dark:text-lime-300 ring-lime-200 dark:ring-lime-700/60' };
  if (key === 'resource:material:4') return { icon: '🪵', classes: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-700/60' };
  if (key === 'resource:material:3') return { icon: '🪨', classes: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 ring-slate-300 dark:ring-slate-700' };
  if (key === 'resource:material:2') return { icon: '⚙️', classes: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-900 dark:text-cyan-300 ring-cyan-200 dark:ring-cyan-700/60' };
  if (key === 'resource:material:1') return { icon: '✧', classes: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 ring-cyan-200 dark:ring-cyan-700/60' };
  if (key.includes('energy') || key.startsWith('resource:refillable:')) return { icon: '⚡', classes: 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 ring-orange-200 dark:ring-orange-700/60' };
  if (key === 'resource:gold') return { icon: '🪙', classes: 'bg-yellow-50 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 ring-yellow-200 dark:ring-yellow-700/60' };
  if (key === 'resource:starMoney') return { icon: '💎', classes: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-700/60' };
  if (key.startsWith('resource:coin:')) return { icon: '🪙', classes: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-700/60' };
  if (key.startsWith('resource:consumable:')) return { icon: '🧪', classes: 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 ring-teal-200 dark:ring-teal-700/60' };
  if (key.startsWith('resource:speedUp')) return { icon: '⏱️', classes: 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 ring-sky-200 dark:ring-sky-700/60' };
  if (key.startsWith('resource:fragment')) return { icon: '🧩', classes: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-700/60' };
  return { icon: '◉', classes: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700' };
}

export const worldMaterialNames: Record<number, string> = {
  1: 'Elarite Shards',
  2: 'Iron',
  3: 'Stone',
  4: 'Wood',
  5: 'Food',
  12: 'Honor Marks',
  14: 'Blueprints',
};

export const ITEM_CATEGORIES = new Set([
  'gear',
  'fragmentGear',
  'artifact',
  'fragmentArtifact',
  'scroll',
  'fragmentScroll',
  'consumable',
  'coin',
  'fragmentHero',
  'fragmentTitan',
  'fragmentSkin',
  'patron',
  'lootboxChanced',
  'lootboxChoiced',
  'speedUpUnitTraining',
  'speedUpUniversal',
  'speedUpUnitHealing',
  'speedUpConstruction',
  'speedUpResearch',
  'teleporter',
  'talisman',
]);

export const CHEST_REFILLABLES = new Set([
  '3', '4', '35', '37', '40', '41', '42', '43', '44', '45',
]);

export function isItemResourceKey(key: string | undefined): boolean {
  if (!key) return false;
  const parts = key.split(':');
  if (parts.length < 2 || parts[0] !== 'resource') return false;
  const category = parts[1];
  const id = parts[2] || '';
  if (ITEM_CATEGORIES.has(category)) return true;
  if (category.startsWith('speedUp')) return true;
  if (category === 'refillable' && CHEST_REFILLABLES.has(id)) return true;
  return false;
}

export const typeNames: Record<string, string> = {
  speedUpUnitTraining: 'Training Speedup',
  speedUpUniversal: 'Universal Speedup',
  speedUpUnitHealing: 'Healing Speedup',
  speedUpConstruction: 'Construction Speedup',
  speedUpResearch: 'Research Speedup',
  teleporter: 'Teleporter',
  lootboxChanced: 'Chance Lootbox',
  patron: 'Relic Shard',
};

export function resourceLabel(entry: ResourceEntry | undefined): string {
  if (entry?.data?.label && !entry.data.label.includes('#')) {
    return entry.data.label;
  }
  const rawKey = String(entry?.key || '').replace(/^resource:/, '');
  const fallback: Record<string, string> = {
    gold: 'Gold',
    starMoney: 'Emeralds',
    energy: 'Energy',
    'world-energy': 'World Energy',
  };
  if (fallback[rawKey]) return fallback[rawKey];

  const [type = '', itemIdStr = ''] = rawKey.split(':');
  const itemId = Number(itemIdStr);

  if (type === 'material' && Number.isInteger(itemId) && worldMaterialNames[itemId]) {
    return worldMaterialNames[itemId];
  }

  // Lookup in typed nameData (which already checks local names and fallbacks)
  const resolved = typeof getItemName === 'function' ? getItemName(type, itemIdStr || itemId) : null;
  if (resolved) return resolved;

  if (entry?.data?.label) {
    return entry.data.label;
  }

  if (typeNames[type]) {
    return itemIdStr ? `${typeNames[type]} #${itemIdStr}` : typeNames[type];
  }

  if (itemIdStr) return `${type} #${itemIdStr}`;
  return entry?.data?.name || rawKey || 'Resource';
}

export function isListedInventoryItem(entry: ResourceEntry | undefined, inventory: Record<string, any> | null | undefined): boolean {
  const parts = entry?.key?.split(':');
  if (!parts || parts.length !== 3 || parts[0] !== 'resource') return false;
  const category = parts[1]!, id = parts[2]!;
  const items = inventory?.[category];
  // Match ItemsTab: only own entries in category collections with positive stock.
  return items != null && typeof items === 'object' && Object.hasOwn(items, id) && Number(items[id]) > 0;
}

export function isSelectableForHeader(entry: ResourceEntry | undefined): boolean {
  if (!entry?.key || isInactiveResource(entry)) return false;
  return !['resource:energy', 'resource:world-energy', 'resource:refillable:62', 'resource:world-refillable:62'].includes(entry.key);
}

export function isMarchExpired(march: any, now = Date.now()): boolean {
  if (!march) return true;
  if (march.endsAt && march.endsAt <= now && (march.kind === 'return' || march.stage === 'returnToOutpost')) {
    return true;
  }
  return false;
}

export function getMarchBadgeInfo(march: any, now = Date.now(), cache?: any): {
  category: string;
  icon: string;
  classes: string;
  isPulse: boolean;
} {
  const rallyId = march?.rally?.id;
  const isHelperFromCache = Boolean(rallyId && (
    cache?.priorityAutoJoinedRallies?.data?.includes(rallyId) ||
    cache?.experimentalPriorityAutoJoinedRallies?.data?.includes(rallyId)
  ));
  const isHelperAutoJoin = Boolean(
    march?.rally?.isHelperAutoJoin ||
    march?.rally?.autoJoinSource === 'extension' ||
    march?.rally?.autoJoinSource === 'helper' ||
    isHelperFromCache
  );
  const isGameAutoJoin = Boolean(
    march?.rally?.autoJoinSource === 'game' ||
    (!isHelperAutoJoin && Boolean(march?.rally?.isAutoJoin))
  );
  const isAutoJoin = isHelperAutoJoin || isGameAutoJoin;
  const isRaid = Boolean(march?.rally) || march?.kind === 'raid' || march?.previousKind === 'raid';
  const isMine =
    Boolean(march?.mineId) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.kind) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.previousKind);
  const isMonster =
    !isRaid &&
    !isMine &&
    (march?.kind === 'attack' || march?.previousKind === 'attack' || Boolean(march?.mobConfigId));
  const isReturning = march?.kind === 'return' || march?.stage === 'returnToOutpost';

  let category = 'other';
  let icon = '⚔️';
  let classes = 'bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  let isPulse = false;

  if (isRaid) {
    category = 'raid';
    classes = 'bg-indigo-100 text-indigo-900 ring-indigo-400 dark:bg-indigo-950/70 dark:text-indigo-200 dark:ring-indigo-700';
    isPulse = true;

    if (isReturning) {
      icon = '↩️';
    } else if (march?.stage === 'battle') {
      icon = '💥';
    } else if (march?.stage === 'moveToTargetInRally' || march?.stage === 'moveToTarget') {
      icon = '🏹';
    } else if (march?.stage === 'waitingForRallyStart' || (march?.rally?.waitUntil && now < march.rally.waitUntil)) {
      icon = isHelperAutoJoin ? '🤖' : (isAutoJoin ? '⚡' : '⏳');
    } else if (isHelperAutoJoin) {
      icon = '🤖';
    } else if (isAutoJoin) {
      icon = '⚡';
    } else {
      icon = '⚔️';
    }
  } else if (isMine) {
    category = 'gather';
    const resType = resolveMarchResourceType(march, cache);
    const theme = resType ? RESOURCE_THEMES[resType] : null;
    classes = theme ? theme.badgeClasses : 'bg-emerald-100 text-emerald-900 ring-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-700';

    if (isReturning) {
      icon = '↩️';
    } else if (march?.stage === 'moveToTargetInSolo' && Number.isFinite(march?.targetArrivalAt) && now < march.targetArrivalAt) {
      icon = '🚶‍♂️';
    } else {
      icon = theme ? theme.icon : '⛏️';
    }
  } else if (isMonster) {
    category = 'monster';
    classes = 'bg-amber-100 text-amber-900 ring-amber-400 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-700';

    const isFighting = !isReturning && Number.isFinite(march?.targetArrivalAt) && now >= march.targetArrivalAt;
    if (isReturning) {
      icon = '↩️';
    } else if (isFighting) {
      icon = '💥';
    } else if (march?.stage === 'moveToTargetInSolo' || (Number.isFinite(march?.targetArrivalAt) && now < march.targetArrivalAt)) {
      icon = '🏃‍♂️';
    } else {
      icon = '👾';
    }
  } else if (isReturning) {
    icon = '↩️';
  }

  return { category, icon, classes, isPulse };
}

export const amountAt = getAmountAt;
export const nextRefillSeconds = getNextRefillSeconds;
export const formatAmount = formatResourceAmount;

export function refillDescription(entry: ResourceEntry | undefined, now = Date.now()): string | null {
  const data = entry?.data;
  if (!Number.isFinite(data?.refillEveryMs) || (data?.refillEveryMs || 0) <= 0 ||
      !Number.isFinite(data?.refillAmount) || (data?.refillAmount || 0) <= 0) return null;
  const perMinute = (data!.refillAmount! * 60000) / data!.refillEveryMs!;
  if (perMinute >= 1) return `+${Number(perMinute.toFixed(2)).toLocaleString('en-US')}/min`;
  const next = nextRefillSeconds(entry, now);
  if (next != null) return `Next +${data!.refillAmount} in ${tooltipTime(next)}`;
  return Number.isFinite(data?.cap) && (amountAt(entry, now) ?? 0) >= data!.cap! ?
    'Full; refill resumes after spending' : 'Next refill time unavailable';
}

export const resourceDataHelper = {
  amountAt,
  nextRefillSeconds,
  remainingMinutes,
  hoursMinutes,
  formatAmount,
  refillDescription,
  tooltipTime,
  resourceAppearance,
  resourceLabel,
  isListedInventoryItem,
  isItemResourceKey,
  ITEM_CATEGORIES,
  CHEST_REFILLABLES,
  isSelectableForHeader,
  isMarchExpired,
  getMarchBadgeInfo,
  resolveMarchResourceType,
  RESOURCE_THEMES,
};
