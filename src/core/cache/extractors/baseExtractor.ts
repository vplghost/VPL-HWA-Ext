import type { CacheEntry, RpcCall, RpcRecord } from '../../../types';
import {
  RESOURCE_TYPES,
  WORLD_MATERIAL_NAMES,
  TYPE_NAMES,
  resolveResourceLabel
} from '../definitions.ts';

export function normalizeArrayData<T = any>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function resource(
  key: string,
  amount: number,
  record: RpcRecord,
  method: string,
  label: string,
  extra: Record<string, any> = {}
): CacheEntry[] {
  if (key === 'refillable:62' || key === 'world-refillable:62') return []; // Wheel feature is shelved.
  if (!Number.isFinite(amount) || amount < 0) return [];
  const updatedAt = typeof record.timestamp === 'string' ? record.timestamp : new Date(record.timestamp || Date.now()).toISOString();
  return [
    {
      key: `resource:${key}`,
      method,
      group: 'resources',
      data: { amount, label, ...extra },
      updatedAt
    }
  ];
}

export function inventoryResources(
  items: Array<{ type: string; id: number | string; quantity: number }>,
  record: RpcRecord,
  method: string
): CacheEntry[] {
  return items.flatMap((item) => {
    if (!RESOURCE_TYPES.has(item?.type)) return [];
    const numId = Number(item.id);
    const label = item.type === 'material' ? WORLD_MATERIAL_NAMES[numId] : null;
    return resource(
      `${item.type}:${item.id}`,
      item.quantity,
      record,
      method,
      label || `${TYPE_NAMES[item.type] || item.type} #${item.id}`
    );
  });
}

export function resourceAction(
  record: RpcRecord,
  call: RpcCall,
  key: string,
  delta: number,
  label: string,
  tokenSuffix = ''
): CacheEntry[] {
  if (!Number.isFinite(delta) || delta === 0 || !call.ident) return [];
  const token = tokenSuffix ? `${call.ident}:${tokenSuffix}:${key}` : `${call.ident}:${key}`;
  const updatedAt = typeof record.timestamp === 'string' ? record.timestamp : new Date(record.timestamp || Date.now()).toISOString();
  return [
    {
      key: 'resourceAction',
      method: call.name,
      group: 'internal',
      data: {
        resourceKey: `resource:${key}`,
        delta,
        label,
        token
      },
      updatedAt
    }
  ];
}

export function extractRewardActions(
  record: RpcRecord,
  call: RpcCall,
  rewardObj: Record<string, any>,
  tokenPrefix = ''
): CacheEntry[] {
  if (!rewardObj || typeof rewardObj !== 'object') return [];
  const aggregated = new Map<string, number>();
  const addReward = (key: string, delta: number) => {
    if (!key || !Number.isFinite(delta) || delta <= 0) return;
    aggregated.set(key, (aggregated.get(key) || 0) + delta);
  };

  const numStamina = Number(rewardObj.stamina);
  if (Number.isFinite(numStamina) && numStamina > 0) {
    addReward('energy', numStamina);
  }
  const numGold = Number(rewardObj.gold);
  if (Number.isFinite(numGold) && numGold > 0) {
    addReward('gold', numGold);
  }
  const numStarMoney = Number(rewardObj.starMoney || rewardObj.starmoney);
  if (Number.isFinite(numStarMoney) && numStarMoney > 0) {
    addReward('starMoney', numStarMoney);
  }
  if (rewardObj.refillableResource && typeof rewardObj.refillableResource === 'object') {
    for (const [rId, amt] of Object.entries(rewardObj.refillableResource)) {
      const numAmt = Number(amt);
      if (Number.isFinite(numAmt) && numAmt > 0) {
        const resKey = rId === '1' ? 'energy' : rId === '2' ? 'world-energy' : `refillable:${rId}`;
        addReward(resKey, numAmt);
      }
    }
  }
  for (const groupType of [
    'consumable',
    'material',
    'coin',
    'gear',
    'fragmentHero',
    'fragmentTitan',
    'lootboxChanced',
    'patron',
    'scroll',
    'teleporter'
  ]) {
    if (rewardObj[groupType] && typeof rewardObj[groupType] === 'object') {
      for (const [id, amt] of Object.entries(rewardObj[groupType])) {
        const numAmt = Number(amt);
        if (Number.isFinite(numAmt) && numAmt > 0) {
          addReward(`${groupType}:${id}`, numAmt);
        }
      }
    }
  }
  const arrayRewards = Array.isArray(rewardObj.reward)
    ? rewardObj.reward
    : Array.isArray(rewardObj.rewards)
      ? rewardObj.rewards
      : Array.isArray(rewardObj.claimedRewards)
        ? rewardObj.claimedRewards
        : [];
  for (const r of arrayRewards) {
    const numAmt = Number(r?.amount);
    if (Number.isFinite(numAmt) && numAmt > 0 && r?.type) {
      const type = r.type;
      const id = r.id;
      const key =
        type === 'gold' || type === 'starMoney'
          ? type
          : type === 'stamina' || (type === 'refillable' && String(id) === '1')
            ? 'energy'
            : type === 'refillable' && String(id) === '2'
              ? 'world-energy'
              : RESOURCE_TYPES.has(type) && id !== undefined && id !== null
                ? `${type}:${id}`
                : null;
      if (key) {
        addReward(key, numAmt);
      }
    }
  }

  const actions: CacheEntry[] = [];
  for (const [key, totalAmt] of aggregated) {
    const label = resolveResourceLabel(key);
    actions.push(...resourceAction(record, call, key, totalAmt, label, tokenPrefix));
  }
  return actions;
}

export function extractCostActions(
  record: RpcRecord,
  call: RpcCall,
  costObj: Record<string, any>,
  tokenPrefix = 'cost'
): CacheEntry[] {
  if (!costObj || typeof costObj !== 'object') return [];
  const aggregated = new Map<string, number>();
  const addCost = (key: string, delta: number) => {
    if (!key || !Number.isFinite(delta) || delta <= 0) return;
    aggregated.set(key, (aggregated.get(key) || 0) + delta);
  };

  const numStamina = Number(costObj.stamina);
  if (Number.isFinite(numStamina) && numStamina > 0) {
    addCost('energy', numStamina);
  }
  const numGold = Number(costObj.gold);
  if (Number.isFinite(numGold) && numGold > 0) {
    addCost('gold', numGold);
  }
  const numStarMoney = Number(costObj.starMoney || costObj.starmoney);
  if (Number.isFinite(numStarMoney) && numStarMoney > 0) {
    addCost('starMoney', numStarMoney);
  }
  if (costObj.refillableResource && typeof costObj.refillableResource === 'object') {
    for (const [rId, amt] of Object.entries(costObj.refillableResource)) {
      const numAmt = Number(amt);
      if (Number.isFinite(numAmt) && numAmt > 0) {
        const resKey = rId === '1' ? 'energy' : rId === '2' ? 'world-energy' : `refillable:${rId}`;
        addCost(resKey, numAmt);
      }
    }
  }
  for (const groupType of ['coin', 'consumable', 'material', 'gear', 'fragmentHero', 'fragmentTitan', 'scroll']) {
    if (costObj[groupType] && typeof costObj[groupType] === 'object') {
      for (const [id, amt] of Object.entries(costObj[groupType])) {
        const numAmt = Number(amt);
        if (Number.isFinite(numAmt) && numAmt > 0) {
          addCost(`${groupType}:${id}`, numAmt);
        }
      }
    }
  }

  const actions: CacheEntry[] = [];
  for (const [key, totalAmt] of aggregated) {
    const label = resolveResourceLabel(key);
    actions.push(...resourceAction(record, call, key, -totalAmt, label, tokenPrefix));
  }
  return actions;
}

export function routeEstimate(
  from: { x?: number; y?: number } | null | undefined,
  to: { x?: number; y?: number } | null | undefined,
  routeType = 'direct'
): { durationSeconds: number; distance: number } {
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) {
    return { durationSeconds: 0, distance: 0 };
  }
  const dx = (from.x ?? 0) - (to.x ?? 0);
  const dy = (from.y ?? 0) - (to.y ?? 0);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const speed = routeType === 'direct' ? 1.0 : 0.8;
  const durationSeconds = Math.max(1, Math.round(distance / speed));
  return { durationSeconds, distance };
}
