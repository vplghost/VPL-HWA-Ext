/**
 * Favorite Heroes Daily Soul-Stone Sweeper & 1-Click Recursive Gear Craft-Equip Planner (`heroSoulSweepService.ts`).
 *
 * Pure, deterministic planners with strict safety guards:
 * - Never spends Emeralds or uses Energy Bottles.
 * - Skips 6★ (Absolute Star) heroes and heroes that already have enough soul stones to evolve (`canEvolve === true`).
 * - Respects configurable `reserveEnergy` (default 30⚡).
 * - Accounts for shared inventory stock across all unequipped hero equipment slots (atomic rollback per slot)
 *   and produces strict bottom-up craft order (`inventoryCraftFragments` / `inventoryCraftRecipe`) + `heroInsertItem`.
 * - Never auto-promotes (`heroPromote` remains an explicit user action).
 */

import { getHeroSoulMissions, getMissionTries, isMissionRaidable } from '../data/campaignData.ts';
import { getMissionCosts } from '../data/missionCostData.ts';
import { gearCraftData, scrollCraftData } from '../data/heroMetadata.ts';
import { getHeroName, getItemName } from '../data/nameData.ts';
import { getHeroSoulProgress } from '../utils/metadata.ts';
import { getEnergy } from '../utils/resourceData.ts';

export const DEFAULT_SOUL_SWEEP_RESERVE_ENERGY = 30;
export const SOUL_SWEEP_RESERVE_STORAGE_KEY = 'soulSweepReserveEnergy';

export interface SoulSweepMissionPlan {
  missionId: number;
  heroId: number;
  heroName: string;
  triesLeft: number;
  plannedRaids: number;
  costPerRaid: number;
  energyCost: number;
}

export interface SoulSweepPlan {
  eligibleHeroCount: number;
  totalMissions: number;
  totalAvailableRaids: number;
  totalAvailableEnergy: number;
  plannedRaids: number;
  plannedEnergy: number;
  currentEnergy: number;
  reserveEnergy: number;
  missions: SoulSweepMissionPlan[];
  skippedReason: string | null;
}

export function clampReserveEnergy(value: unknown, fallback = DEFAULT_SOUL_SWEEP_RESERVE_ENERGY): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.max(0, Math.min(200, n));
}

export function planFavoriteSoulStoneSweep(
  cache: Record<string, any> = {},
  favoriteHeroIds: Array<string | number> = [],
  options: {
    reserveEnergy?: number;
    currentEnergy?: number;
    disabledMissionIds?: Set<number> | number[];
    now?: number;
  } = {}
): SoulSweepPlan {
  const reserveEnergy = clampReserveEnergy(options.reserveEnergy, DEFAULT_SOUL_SWEEP_RESERVE_ENERGY);
  const energyInfo = getEnergy(cache, options.now ?? Date.now());
  const currentEnergy = Number.isFinite(Number(options.currentEnergy))
    ? Math.max(0, Math.floor(Number(options.currentEnergy)))
    : Math.max(0, Math.floor(Number(energyInfo?.amount ?? 0)));

  const heroesMap = cache?.heroGetAll?.data || {};
  const inventory = cache?.inventoryGet?.data || {};
  const missionProgress = cache?.missionGetAll?.data;
  const missionCosts = getMissionCosts() || {};
  const disabledSet = new Set<number>(
    options.disabledMissionIds ? Array.from(options.disabledMissionIds).map(Number) : []
  );

  // Deduplicate and filter eligible favorite heroes (owned, star < 6, !canEvolve)
  const uniqueFavIds = [...new Set(favoriteHeroIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const heroCandidates: Array<{ heroId: number; heroName: string; ratioRemaining: number }> = [];

  for (const heroId of uniqueFavIds) {
    const hero = heroesMap[heroId] || heroesMap[String(heroId)];
    if (!hero) continue;
    const star = Number(hero.star) || 0;
    if (star >= 6) continue;
    const prog = getHeroSoulProgress(heroId, hero, inventory);
    const needed = typeof prog?.needed === 'number' && prog.needed > 0 ? prog.needed : 0;
    const owned = Number(prog?.owned) || 0;
    const canEvolve = Boolean((prog as any)?.canEvolve) || (needed > 0 && owned >= needed);
    if (canEvolve) continue;
    const ratioRemaining = needed > 0 ? Math.max(0, needed - owned) / needed : 1;
    heroCandidates.push({
      heroId,
      heroName: getHeroName(heroId) || `Hero #${heroId}`,
      ratioRemaining,
    });
  }

  // Sort closest to next star first, then heroId ascending
  heroCandidates.sort((a, b) => a.ratioRemaining - b.ratioRemaining || a.heroId - b.heroId);

  const seenMissionIds = new Set<number>();
  const rawMissions: Array<Omit<SoulSweepMissionPlan, 'plannedRaids' | 'energyCost'>> = [];

  for (const hc of heroCandidates) {
    const soulMissions = getHeroSoulMissions(hc.heroId) || [];
    for (const m of soulMissions) {
      const mId = Number(m?.id);
      if (!Number.isFinite(mId) || seenMissionIds.has(mId) || disabledSet.has(mId)) continue;
      if (!isMissionRaidable(mId, missionProgress, { disabledIds: disabledSet })) continue;
      const tries = getMissionTries(mId, missionProgress);
      const triesLeft = Math.max(0, Number(tries?.triesLeft ?? (tries as any)?.remaining) || 0);
      if (triesLeft <= 0) continue;
      const costs = missionCosts[mId];
      const costPerRaid = Array.isArray(costs) ? (Number(costs[0]) + Number(costs[1])) : 12;
      seenMissionIds.add(mId);
      rawMissions.push({
        missionId: mId,
        heroId: hc.heroId,
        heroName: hc.heroName,
        triesLeft,
        costPerRaid: costPerRaid > 0 ? costPerRaid : 12,
      });
    }
  }

  const totalAvailableRaids = rawMissions.reduce((s, m) => s + m.triesLeft, 0);
  const totalAvailableEnergy = rawMissions.reduce((s, m) => s + m.triesLeft * m.costPerRaid, 0);

  let budget = Math.max(0, currentEnergy - reserveEnergy);
  const missions: SoulSweepMissionPlan[] = [];
  let plannedRaids = 0;
  let plannedEnergy = 0;

  for (const m of rawMissions) {
    const affordable = Math.floor(budget / m.costPerRaid);
    const raids = Math.min(m.triesLeft, affordable);
    const energyCost = raids * m.costPerRaid;
    budget -= energyCost;
    plannedRaids += raids;
    plannedEnergy += energyCost;
    missions.push({
      ...m,
      plannedRaids: raids,
      energyCost,
    });
  }

  let skippedReason: string | null = null;
  if (uniqueFavIds.length === 0) {
    skippedReason = 'No favorite heroes configured.';
  } else if (heroCandidates.length === 0) {
    skippedReason = 'All favorite heroes are already 6★ or ready to evolve.';
  } else if (rawMissions.length === 0) {
    skippedReason = 'No 3★ Heroic missions with remaining tries today.';
  } else if (plannedRaids === 0) {
    skippedReason = `Energy (${currentEnergy}⚡) is at or below reserve (${reserveEnergy}⚡).`;
  }

  return {
    eligibleHeroCount: heroCandidates.length,
    totalMissions: rawMissions.length,
    totalAvailableRaids,
    totalAvailableEnergy,
    plannedRaids,
    plannedEnergy,
    currentEnergy,
    reserveEnergy,
    missions,
    skippedReason,
  };
}

export interface RecursiveCraftStep {
  rpcName: 'inventoryCraftFragments' | 'inventoryCraftRecipe';
  type: 'gear' | 'scroll';
  libId: number;
  amount: number;
  name: string;
  goldCost: number;
}

export interface PlannedEquipSlot {
  slotNum: number;
  slotIdx: number;
  itemId: number;
  itemName: string;
}

export interface RecursiveGearCraftPlan {
  craftSteps: RecursiveCraftStep[];
  equipSlots: PlannedEquipSlot[];
  readySlotCount: number;
  totalGoldCost: number;
  canAffordGold: boolean;
  currentGold: number;
}

type StockBuckets = Record<'gear' | 'scroll' | 'fragmentGear' | 'fragmentScroll', Record<string, number>>;

function cloneStock(inventory: Record<string, any> = {}): StockBuckets {
  const copy = (raw: any): Record<string, number> => {
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        const n = Math.max(0, Math.floor(Number(v) || 0));
        if (n > 0) out[String(k)] = n;
      }
    }
    return out;
  };
  return {
    gear: copy(inventory?.gear),
    scroll: copy(inventory?.scroll),
    fragmentGear: copy(inventory?.fragmentGear),
    fragmentScroll: copy(inventory?.fragmentScroll),
  };
}

/**
 * Plans bottom-up recursive gear crafting and equipping across all unequipped slots of a hero
 * using shared virtual inventory accounting (atomic per-slot rollback so two slots cannot double-spend
 * the same fragment or intermediate gear). Never includes `heroPromote`.
 */
export function planRecursiveGearCraftAndEquip(
  equipmentSlots: Array<{ slotNum: number; itemId: number | string; itemName?: string; isEquipped: boolean }>,
  inventory: Record<string, any> = {},
  currentGold = 0,
  customCraftMap?: Record<string, any>
): RecursiveGearCraftPlan {
  const stock = cloneStock(inventory);
  const allCraftSteps: RecursiveCraftStep[] = [];
  const equipSlots: PlannedEquipSlot[] = [];
  let totalGoldCost = 0;

  function getCraftInfo(category: 'gear' | 'scroll', id: string): any {
    if (customCraftMap && customCraftMap[id]) return customCraftMap[id];
    return category === 'gear' ? gearCraftData?.[id] : scrollCraftData?.[id];
  }

  function tryFulfill(
    category: 'gear' | 'scroll',
    id: string,
    needed: number,
    workingStock: StockBuckets,
    stepsOut: RecursiveCraftStep[],
    ancestors: Set<string>
  ): boolean {
    const identity = `${category}:${id}`;
    if (ancestors.has(identity)) return false;

    const have = workingStock[category][id] || 0;
    const consumeDirect = Math.min(have, needed);
    if (consumeDirect > 0) {
      workingStock[category][id] = have - consumeDirect;
    }
    const missing = needed - consumeDirect;
    if (missing <= 0) return true;

    const info = getCraftInfo(category, id);
    if (!info) return false;

    const fragCount = Number(info.fragmentCount) || 0;
    const unitGold = Math.max(0, Number(info.gold) || 0);
    const name = getItemName(category, id) || `${category} #${id}`;

    if (fragCount > 0) {
      const fragCat: 'fragmentGear' | 'fragmentScroll' = category === 'scroll' ? 'fragmentScroll' : 'fragmentGear';
      const reqFrags = fragCount * missing;
      const haveFrags = workingStock[fragCat][id] || 0;
      if (haveFrags < reqFrags) return false;
      workingStock[fragCat][id] = haveFrags - reqFrags;
      stepsOut.push({
        rpcName: 'inventoryCraftFragments',
        type: category,
        libId: Number(id),
        amount: missing,
        name,
        goldCost: unitGold * missing,
      });
      return true;
    }

    const gearRecipe = info.recipe && typeof info.recipe === 'object' ? Object.entries(info.recipe) : [];
    const scrollRecipe = info.scroll && typeof info.scroll === 'object' ? Object.entries(info.scroll) : [];
    if (gearRecipe.length === 0 && scrollRecipe.length === 0) return false;

    const nextAncestors = new Set(ancestors).add(identity);
    for (const [childId, qty] of gearRecipe) {
      const q = Number(qty);
      if (q > 0 && !tryFulfill('gear', String(childId), q * missing, workingStock, stepsOut, nextAncestors)) {
        return false;
      }
    }
    for (const [childId, qty] of scrollRecipe) {
      const q = Number(qty);
      if (q > 0 && !tryFulfill('scroll', String(childId), q * missing, workingStock, stepsOut, nextAncestors)) {
        return false;
      }
    }

    stepsOut.push({
      rpcName: 'inventoryCraftRecipe',
      type: category,
      libId: Number(id),
      amount: missing,
      name,
      goldCost: unitGold * missing,
    });
    return true;
  }

  for (const slot of equipmentSlots || []) {
    if (!slot || slot.isEquipped || !slot.itemId) continue;
    const trialStock = cloneStock(stock);
    const trialSteps: RecursiveCraftStep[] = [];
    const ok = tryFulfill('gear', String(slot.itemId), 1, trialStock, trialSteps, new Set());
    if (!ok) continue;

    // Commit trial stock & steps
    stock.gear = trialStock.gear;
    stock.scroll = trialStock.scroll;
    stock.fragmentGear = trialStock.fragmentGear;
    stock.fragmentScroll = trialStock.fragmentScroll;

    for (const st of trialSteps) {
      allCraftSteps.push(st);
      totalGoldCost += st.goldCost;
    }
    equipSlots.push({
      slotNum: slot.slotNum,
      slotIdx: slot.slotNum - 1,
      itemId: Number(slot.itemId),
      itemName: slot.itemName || getItemName('gear', String(slot.itemId)) || `Item #${slot.itemId}`,
    });
  }

  const safeGold = Math.max(0, Number(currentGold) || 0);
  return {
    craftSteps: allCraftSteps,
    equipSlots,
    readySlotCount: equipSlots.length,
    totalGoldCost,
    canAffordGold: safeGold >= totalGoldCost,
    currentGold: safeGold,
  };
}

export function buildRecursiveGearCraftEquipCalls(
  heroId: number | string,
  plan: RecursiveGearCraftPlan
): Array<{ name: string; args?: Record<string, any> }> {
  const numHeroId = Number(heroId);
  if (!Number.isFinite(numHeroId) || numHeroId <= 0 || plan.equipSlots.length === 0) return [];
  const calls: Array<{ name: string; args?: Record<string, any> }> = [];
  for (const step of plan.craftSteps) {
    calls.push({
      name: step.rpcName,
      args: { type: step.type, libId: step.libId, amount: step.amount },
    });
  }
  for (const eq of plan.equipSlots) {
    calls.push({
      name: 'heroInsertItem',
      args: { heroId: numHeroId, slot: eq.slotIdx },
    });
  }
  calls.push({ name: 'inventoryGet' }, { name: 'heroGetAll' }, { name: 'userGetInfo' });
  return calls;
}
