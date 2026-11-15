import type {
  SpeedupType,
  SpeedupKind,
  SpeedupKindDef,
  SpeedupTargetInfo,
  SpeedupQuote,
  SpeedupValidationResult,
} from '../types/game/speedup';
import { getSpeedupDuration, speedupData } from '../data/speedupData.ts';

export const kinds: Record<SpeedupKind, SpeedupKindDef> = {
  building: {
    method: 'speedUpConstructionWithResources',
    feature: 'building',
    type: 'speedUpConstruction',
    id: 'buildingId',
    status: 'buildingStatus',
  },
  research: {
    method: 'speedUpResearchWithResources',
    feature: 'personalResearch',
    type: 'speedUpResearch',
    id: 'researchId',
    status: 'researchStatus',
  },
  healing: {
    method: 'speedUpHealingWithResources',
    feature: 'unit',
    type: 'speedUpUnitHealing',
    id: null,
    status: 'getHealing:unit',
  },
};

export const list = (raw: any): any[] =>
  Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];

export const positive = (value: any): boolean =>
  Number.isSafeInteger(value) && (value as number) > 0;

export function suggestedAmount(
  remainingMs: number,
  itemMs: number,
  available: number
): number {
  if (
    !Number.isFinite(remainingMs) ||
    remainingMs <= 0 ||
    !positive(itemMs) ||
    !Number.isSafeInteger(available) ||
    available < 0
  ) {
    return 0;
  }
  return Math.min(available, Math.max(0, Math.ceil(remainingMs / itemMs) - 1));
}

export function duration(type: string, id: number | string): number | undefined {
  return getSpeedupDuration(type as SpeedupType, id) ?? undefined;
}

export function kindFor(call: any): SpeedupKind | undefined {
  return (Object.keys(kinds) as SpeedupKind[]).find(
    (kind) => kinds[kind].method === call?.name && kinds[kind].feature === call?.feature
  );
}

export function validate(call: any): SpeedupValidationResult | null {
  const kind = kindFor(call);
  if (!kind) return null;
  const def = kinds[kind];
  const args = call?.args;
  if (!def || !args) return null;

  const expectedKeys = (
    kind === 'healing'
      ? ['resourcesToReward', 'resourcesToSpend', 'speedUpDuration']
      : [def.id as string, 'nextLevel', 'resourcesToReward', 'resourcesToSpend', 'speedUpDate']
  )
    .sort()
    .join(',');

  if (Object.keys(args).sort().join(',') !== expectedKeys) return null;
  if (
    !Array.isArray(args.resourcesToReward) ||
    args.resourcesToReward.length ||
    !Array.isArray(args.resourcesToSpend) ||
    args.resourcesToSpend.length !== 1
  ) {
    return null;
  }
  const item = args.resourcesToSpend[0];
  if (
    !item ||
    Object.keys(item).sort().join(',') !== 'amount,id,type' ||
    item.type !== def.type ||
    !positive(item.id) ||
    !positive(item.amount)
  ) {
    return null;
  }
  const itemDuration = duration(item.type, item.id);
  if (itemDuration == null) return null;
  const totalMs = itemDuration * item.amount;
  if (!positive(totalMs)) return null;

  if (
    kind === 'healing'
      ? args.speedUpDuration !== totalMs
      : !positive(args[def.id as string]) ||
        !positive(args.nextLevel) ||
        !positive(args.speedUpDate)
  ) {
    return null;
  }
  return { kind, ...def, totalMs, item };
}

export function target(
  cache: Record<string, any>,
  kind: SpeedupKind,
  targetId: number | string
): SpeedupTargetInfo | null {
  const def = kinds[kind];
  if (!def) return null;
  const entry = cache[def.status] || (kind === 'healing' ? cache.getHealing : null);
  const row =
    kind === 'healing'
      ? entry?.data?.healing
      : list(entry?.data?.queues).find((r: any) => r[def.id as string] === targetId);

  const ms = row?.durationMs ?? row?.duration;
  if (!positive(row?.startDate) || !positive(ms)) return null;
  const level = kind === 'healing' ? null : row.level ?? row.nextLevel;
  if (kind !== 'healing' && !positive(level)) return null;

  return {
    kind,
    targetId: kind === 'healing' ? 0 : targetId,
    startDate: row.startDate,
    durationMs: ms,
    level,
    endsAt: row.startDate + ms,
    updatedAt: entry?.updatedAt,
  };
}

export function stock(cache: Record<string, any>, kind: SpeedupKind): any[] {
  const account = cache.accountStatus?.data?.id;
  const snapshot = cache.speedupInventory;
  if (account == null || String(snapshot?.data?.accountId) !== String(account)) return [];
  return list(snapshot.data.items).filter(
    (item: any) =>
      item.type === kinds[kind]?.type &&
      positive(item.quantity) &&
      positive(duration(item.type, item.id))
  );
}

export function quote(
  cache: Record<string, any>,
  kind: SpeedupKind,
  targetId: number | string,
  itemId: number,
  amount: number,
  now = Date.now()
): SpeedupQuote | null {
  const accountId = cache.accountStatus?.data?.id;
  const row = target(cache, kind, targetId);
  if (accountId == null || !row || !positive(amount)) return null;

  const item = stock(cache, kind).find((i: any) => i.id === itemId);
  const itemMs = duration(kinds[kind].type, itemId);
  if (itemMs == null) return null;
  const totalMs = itemMs * amount;

  const fresh = (at: any) =>
    Number.isFinite(Date.parse(at)) && now >= Date.parse(at) && now - Date.parse(at) <= 120000;

  if (
    !item ||
    item.quantity < amount ||
    !positive(totalMs) ||
    totalMs > row.endsAt - now ||
    !fresh(row.updatedAt) ||
    !fresh(cache.speedupInventory?.data?.observedAt ?? cache.speedupInventory?.updatedAt)
  ) {
    return null;
  }
  return {
    accountId: String(accountId),
    ...row,
    itemId,
    amount,
    itemMs,
    totalMs,
    available: item.quantity,
  };
}

export function signature(value: any): string | null {
  return (
    value &&
    JSON.stringify([
      value.accountId,
      value.kind,
      value.targetId,
      value.startDate,
      value.durationMs,
      value.level,
      value.itemId,
      value.amount,
      value.available,
    ])
  );
}

export function buildCall(value: any, now = Date.now()): any | null {
  const def = kinds[value?.kind as SpeedupKind];
  if (!def) return null;
  const args: Record<string, any> = {
    resourcesToSpend: [{ type: def.type, id: value.itemId, amount: value.amount }],
    resourcesToReward: [],
  };
  if (value.kind === 'healing') {
    args.speedUpDuration = value.totalMs;
  } else {
    Object.assign(args, {
      [def.id as string]: value.targetId,
      nextLevel: value.level,
      speedUpDate: now,
    });
  }
  const call = { name: def.method, feature: def.feature, args };
  return validate(call) ? call : null;
}

export const refreshCalls = (kind: SpeedupKind): any[] => [
  { name: 'getInventory', feature: 'inventory' },
  ...(kind === 'healing'
    ? [
        { name: 'getHealing', feature: 'unit' },
        { name: 'getUnitSummary', feature: 'unit' },
      ]
    : [{ name: 'getSummary', feature: kinds[kind]?.feature }]),
];

export const speedupService = {
  kinds,
  list,
  duration,
  suggestedAmount,
  kindFor,
  validate,
  target,
  stock,
  quote,
  signature,
  buildCall,
  refreshCalls,
};

// Preserve backward compatibility for background service worker scripts and VM tests
if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any).hwaHelperSpeedup) {
    (globalThis as any).hwaHelperSpeedup = speedupService;
  }
}
