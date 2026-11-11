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
  if (key === 'resource:material:5') return { icon: '🍞', classes: 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 ring-amber-200 dark:ring-amber-700/60' };
  if (key === 'resource:material:4') return { icon: '🌲', classes: 'bg-green-50 dark:bg-green-950/60 text-green-800 dark:text-green-300 ring-green-200 dark:ring-green-700/60' };
  if (key === 'resource:material:3') return { icon: '◆', classes: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-300 dark:ring-slate-700' };
  if (key === 'resource:material:2') return { icon: '⚙', classes: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 ring-blue-200 dark:ring-blue-700/60' };
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
};

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

  const [type, itemIdStr] = rawKey.split(':');
  const itemId = Number(itemIdStr);

  if (type === 'material' && Number.isInteger(itemId) && worldMaterialNames[itemId]) {
    return worldMaterialNames[itemId];
  }

  // Lookup in nameMap
  const nameMap = (globalThis as any).hwaHelperNameMap;
  if (nameMap && typeof nameMap.item === 'function') {
    const found = nameMap.item(type, itemIdStr || itemId);
    if (found) return found;
  }

  // Lookup in nameData dictionary
  const nameData = (globalThis as any).hwaHelperNameData?.names;
  if (nameData?.[type]?.[itemIdStr]) {
    return nameData[type][itemIdStr];
  }

  if (entry?.data?.label) {
    return entry.data.label;
  }

  if (typeNames[type]) {
    return itemIdStr ? `${typeNames[type]} #${itemIdStr}` : typeNames[type];
  }

  if (itemIdStr) return `${type} #${itemIdStr}`;
  return entry?.data?.name || rawKey || 'Resource';
}

export function isSelectableForHeader(entry: ResourceEntry | undefined): boolean {
  if (!entry?.key) return false;
  return !['resource:energy', 'resource:world-energy', 'resource:refillable:62', 'resource:world-refillable:62'].includes(entry.key);
}

export function isMarchExpired(march: any, now = Date.now()): boolean {
  if (!march) return true;
  if (march.endsAt && march.endsAt <= now && (march.kind === 'return' || march.stage === 'returnToOutpost')) {
    return true;
  }
  return false;
}

export function getMarchBadgeInfo(march: any, now = Date.now()): {
  category: string;
  icon: string;
  classes: string;
  isPulse: boolean;
} {
  const isAutoJoin = Boolean(march?.rally?.isAutoJoin);
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
      icon = isAutoJoin ? '⚡' : '⏳';
    } else if (isAutoJoin) {
      icon = '⚡';
    } else {
      icon = '⚔️';
    }
  } else if (isMine) {
    category = 'gather';
    classes = 'bg-emerald-100 text-emerald-900 ring-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-700';

    if (isReturning) {
      icon = '↩️';
    } else if (march?.stage === 'moveToTargetInSolo' && Number.isFinite(march?.targetArrivalAt) && now < march.targetArrivalAt) {
      icon = '🚶‍♂️';
    } else {
      icon = '⛏️';
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
