/**
 * Anti-Cap Energy Auto-Burner Service (`energyAutoBurnService.ts`).
 *
 * Zero-polling background planner for Campaign Energy and optional World Energy Solo-Monster fallback:
 * - Over-Cap Preservation Guard: ONLY burns when `triggerTarget <= energy <= cap`.
 *   If `energy > cap` (e.g. user claimed rewards or used bottles for an event), returns
 *   `action: 'over_cap_preserved'` and never touches user-managed over-cap energy.
 * - Campaign Energy Priority:
 *   1. Favorite Hero Soul Stone missions via `planFavoriteSoulStoneSweep` (P3-10), respecting `campaign_disabled_missions`.
 *   2. User-configured 3-star fallback mission watchlist (`fallbackMissionIds`, up to 3 missions).
 * - World Energy Fallback:
 *   Starts a short Solo Monster session (`monsterQueue`) ONLY when `raidEnergyAuto` is disabled,
 *   no `raidQueue` / `monsterQueue` is active, and `worldTriggerTarget <= worldEnergy <= worldCap`.
 * - Strict 0-Emerald & 0-Bottle guard: never dispatches energy purchase or bottle usage RPCs.
 */
import { getMissionTries, isMissionRaidable } from '../data/campaignData.ts';
import { getMissionCosts } from '../data/missionCostData.ts';
import { getEnergy, getWorldEnergy } from '../utils/resourceData.ts';
import { highestPowerHeroes } from '../utils/squadCapacity.ts';
import { planFavoriteSoulStoneSweep } from './heroSoulSweepService.ts';
import type { EnergyAutoBurnSettings } from '../types/index.ts';

export const AUTO_ENERGY_BURN_ALARM_NAME = 'hwa-auto-energy-burn';
export const ENERGY_BURN_ERROR_BACKOFF_MS = 15 * 60 * 1000;
export const ENERGY_BURN_WAKE_BUFFER_MS = 5000;
export const DEFAULT_CAMPAIGN_ENERGY_CAP = 180;
export const DEFAULT_WORLD_ENERGY_CAP = 200;

export const DEFAULT_ENERGY_AUTO_BURN_SETTINGS: EnergyAutoBurnSettings = {
  enabled: false,
  campaignEnabled: true,
  campaignTriggerPct: 90,
  campaignReserveEnergy: 30,
  campaignMaxRaidsPerTick: 5,
  useFavoriteSoulMissionsFirst: true,
  fallbackMissionIds: [],
  worldFallbackEnabled: false,
  worldTriggerPct: 90,
  worldReserveEnergy: 30,
  worldMaxAttacksPerTick: 5,
};

export interface CampaignBurnMissionStep {
  missionId: number;
  raids: number;
  costPerRaid: number;
  energyCost: number;
  source: 'favorite-soul' | 'fallback';
}

export interface CampaignEnergyBurnPlan {
  action: 'burn' | 'wait' | 'over_cap_preserved' | 'no_missions' | 'backoff' | 'disabled' | 'no_data';
  calls: Array<{ name: string; args?: Record<string, any> }>;
  steps: CampaignBurnMissionStep[];
  plannedRaids: number;
  plannedEnergy: number;
  energy: number | null;
  cap: number;
  triggerTarget: number;
  nextWakeAt: number | null;
  reason?: string;
}

export interface WorldEnergyFallbackPlan {
  action: 'start_monster' | 'wait' | 'over_cap_preserved' | 'busy' | 'raid_auto_active' | 'disabled' | 'no_data' | 'not_configured';
  attacks: number;
  worldEnergy: number | null;
  worldCap: number;
  triggerTarget: number;
  nextWakeAt: number | null;
  monsterOptions?: Record<string, any>;
  reason?: string;
}

export function normalizeEnergyAutoBurnSettings(
  raw?: Partial<EnergyAutoBurnSettings> | null
): EnergyAutoBurnSettings {
  const clamp = (val: unknown, min: number, max: number, fallback: number): number => {
    const n = Math.floor(Number(val));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  const rawFallback = Array.isArray(raw?.fallbackMissionIds) ? raw.fallbackMissionIds : [];
  const fallbackMissionIds = [
    ...new Set(
      rawFallback
        .map((id) => Math.floor(Number(id)))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].slice(0, 3);

  return {
    enabled: raw?.enabled === true,
    campaignEnabled: raw?.campaignEnabled !== false,
    campaignTriggerPct: clamp(raw?.campaignTriggerPct, 50, 100, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.campaignTriggerPct),
    campaignReserveEnergy: clamp(raw?.campaignReserveEnergy, 0, 180, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.campaignReserveEnergy),
    campaignMaxRaidsPerTick: clamp(raw?.campaignMaxRaidsPerTick, 1, 15, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.campaignMaxRaidsPerTick),
    useFavoriteSoulMissionsFirst: raw?.useFavoriteSoulMissionsFirst !== false,
    fallbackMissionIds,
    worldFallbackEnabled: raw?.worldFallbackEnabled === true,
    worldTriggerPct: clamp(raw?.worldTriggerPct, 50, 100, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.worldTriggerPct),
    worldReserveEnergy: clamp(raw?.worldReserveEnergy, 0, 180, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.worldReserveEnergy),
    worldMaxAttacksPerTick: clamp(raw?.worldMaxAttacksPerTick, 1, 20, DEFAULT_ENERGY_AUTO_BURN_SETTINGS.worldMaxAttacksPerTick),
  };
}

/**
 * Computes exact zero-polling wake timestamp (ms) when a refillable resource will reach `targetAmount`.
 */
export function computeExactRefillWakeAt(
  resourceEntry: any,
  targetAmount: number,
  now = Date.now(),
  defaultRefillEveryMs = 360_000
): number | null {
  const data = resourceEntry?.data;
  if (!data || typeof data !== 'object') return null;

  const amount = Number(data.amount);
  const cap = Number(data.cap);
  const lastRefillAt = Number(data.lastRefillAt);
  const refillEveryMs = Number(data.refillEveryMs) > 0 ? Number(data.refillEveryMs) : defaultRefillEveryMs;
  const refillAmount = Number(data.refillAmount) > 0 ? Number(data.refillAmount) : 1;

  if (!Number.isFinite(amount) || !Number.isFinite(targetAmount)) return null;
  const clampedTarget = Number.isFinite(cap) && cap > 0 ? Math.min(cap, targetAmount) : targetAmount;

  if (amount >= clampedTarget) return now + ENERGY_BURN_WAKE_BUFFER_MS;

  const ticksNeeded = Math.ceil((clampedTarget - amount) / refillAmount);
  const anchor = Number.isFinite(lastRefillAt) && lastRefillAt > 0 ? lastRefillAt : now;
  const wakeAt = anchor + ticksNeeded * refillEveryMs + ENERGY_BURN_WAKE_BUFFER_MS;
  return Math.max(now + 15_000, wakeAt);
}

/**
 * Pure planner for Campaign Energy Anti-Cap burning.
 * Strictly preserves over-cap energy (`energy > cap`) and never spends Emeralds or Energy Bottles.
 */
export function planCampaignEnergyBurn(
  cache: Record<string, any> | null | undefined,
  stored: Record<string, any> | null | undefined,
  rawSettings?: Partial<EnergyAutoBurnSettings> | null,
  now = Date.now()
): CampaignEnergyBurnPlan {
  const settings = normalizeEnergyAutoBurnSettings(rawSettings);
  const safeCache = cache && typeof cache === 'object' ? cache : {};
  const entry = safeCache['resource:energy'];
  const cap = Number(entry?.data?.cap) > 0 ? Math.floor(Number(entry.data.cap)) : DEFAULT_CAMPAIGN_ENERGY_CAP;
  const triggerTarget = Math.min(cap, Math.ceil((cap * settings.campaignTriggerPct) / 100));

  if (!settings.enabled || !settings.campaignEnabled) {
    return {
      action: 'disabled',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy: null,
      cap,
      triggerTarget,
      nextWakeAt: null,
    };
  }

  const nextRetryAt = Number(stored?.energyAutoBurnState?.nextRetryAt);
  if (Number.isFinite(nextRetryAt) && nextRetryAt > now) {
    return {
      action: 'backoff',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy: getEnergy(safeCache, now),
      cap,
      triggerTarget,
      nextWakeAt: nextRetryAt,
      reason: 'Backing off after previous dispatch error.',
    };
  }

  const energy = getEnergy(safeCache, now);
  if (energy == null || !Number.isFinite(energy)) {
    return {
      action: 'no_data',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy: null,
      cap,
      triggerTarget,
      nextWakeAt: null,
      reason: 'Campaign energy cache not available yet.',
    };
  }

  // Over-Cap Preservation Guard: never burn energy above natural cap (user claimed / saved for events)
  if (energy > cap) {
    return {
      action: 'over_cap_preserved',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy,
      cap,
      triggerTarget,
      nextWakeAt: null,
      reason: `Preserving over-cap energy (${energy}/${cap}) — user managed.`,
    };
  }

  if (energy < triggerTarget) {
    return {
      action: 'wait',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy,
      cap,
      triggerTarget,
      nextWakeAt: computeExactRefillWakeAt(entry, triggerTarget, now),
    };
  }

  const disabledIds = new Set<number>(
    Array.isArray(stored?.campaign_disabled_missions)
      ? stored.campaign_disabled_missions.map(Number).filter(Number.isFinite)
      : []
  );

  let remainingBudget = Math.max(0, energy - settings.campaignReserveEnergy);
  let remainingRaidsCap = settings.campaignMaxRaidsPerTick;
  const steps: CampaignBurnMissionStep[] = [];
  const usedMissionIds = new Set<number>();

  // Tier 1: Favorite Hero Soul Stone missions (P3-10)
  if (settings.useFavoriteSoulMissionsFirst && remainingBudget > 0 && remainingRaidsCap > 0) {
    const favHeroIds = Array.isArray(stored?.favoriteHeroes) ? stored.favoriteHeroes : [];
    if (favHeroIds.length > 0) {
      const soulPlan = planFavoriteSoulStoneSweep(safeCache, favHeroIds, {
        reserveEnergy: settings.campaignReserveEnergy,
        currentEnergy: energy,
        disabledMissionIds: disabledIds,
        now,
      });
      for (const m of soulPlan.missions) {
        if (remainingRaidsCap <= 0 || remainingBudget < m.costPerRaid) break;
        if (m.plannedRaids <= 0) continue;
        const raids = Math.min(m.plannedRaids, remainingRaidsCap, Math.floor(remainingBudget / m.costPerRaid));
        if (raids <= 0) continue;
        const energyCost = raids * m.costPerRaid;
        remainingBudget -= energyCost;
        remainingRaidsCap -= raids;
        usedMissionIds.add(m.missionId);
        steps.push({
          missionId: m.missionId,
          raids,
          costPerRaid: m.costPerRaid,
          energyCost,
          source: 'favorite-soul',
        });
      }
    }
  }

  // Tier 2: Fallback 3-star mission watchlist
  const missionProgress = safeCache.missionGetAll?.data;
  if (remainingBudget > 0 && remainingRaidsCap > 0 && settings.fallbackMissionIds.length > 0) {
    for (const mId of settings.fallbackMissionIds) {
      if (remainingRaidsCap <= 0) break;
      if (usedMissionIds.has(mId) || disabledIds.has(mId)) continue;
      if (!isMissionRaidable(mId, missionProgress, { disabledIds })) continue;

      const costs = getMissionCosts(mId);
      const costPerRaid = Array.isArray(costs) ? Number(costs[0]) + Number(costs[1]) : 0;
      if (!Number.isFinite(costPerRaid) || costPerRaid <= 0 || remainingBudget < costPerRaid) continue;

      const tries = getMissionTries(mId, missionProgress);
      const maxTries = Number(tries?.maxTries ?? 0);
      const triesLeft = maxTries > 0 ? Math.max(0, Number(tries?.triesLeft ?? 0)) : remainingRaidsCap;
      if (triesLeft <= 0) continue;

      const raids = Math.min(triesLeft, remainingRaidsCap, Math.floor(remainingBudget / costPerRaid));
      if (raids <= 0) continue;
      const energyCost = raids * costPerRaid;
      remainingBudget -= energyCost;
      remainingRaidsCap -= raids;
      usedMissionIds.add(mId);
      steps.push({
        missionId: mId,
        raids,
        costPerRaid,
        energyCost,
        source: 'fallback',
      });
    }
  }

  if (steps.length === 0) {
    return {
      action: 'no_missions',
      calls: [],
      steps: [],
      plannedRaids: 0,
      plannedEnergy: 0,
      energy,
      cap,
      triggerTarget,
      nextWakeAt: null,
      reason: 'No eligible 3-star missions available (configure favorite heroes or fallback missions).',
    };
  }

  const calls: Array<{ name: string; args?: Record<string, any> }> = [];
  let plannedRaids = 0;
  let plannedEnergy = 0;
  for (const st of steps) {
    for (let k = 0; k < st.raids; k++) {
      calls.push({ name: 'missionRaid', args: { id: st.missionId, times: 1 } });
    }
    plannedRaids += st.raids;
    plannedEnergy += st.energyCost;
  }
  calls.push({ name: 'inventoryGet', args: {} });
  calls.push({ name: 'userGetInfo', args: {} });

  const projectedAfter = Math.max(0, energy - plannedEnergy);
  const nextWakeAt = computeExactRefillWakeAt(
    { data: { ...(entry?.data || {}), amount: projectedAfter, cap, lastRefillAt: now } },
    triggerTarget,
    now
  );

  return {
    action: 'burn',
    calls,
    steps,
    plannedRaids,
    plannedEnergy,
    energy,
    cap,
    triggerTarget,
    nextWakeAt,
  };
}

/**
 * Pure evaluator for World Energy Solo-Monster fallback when `raidEnergyAuto` is off.
 * Strictly preserves over-cap World Energy (`worldEnergy > worldCap`).
 */
export function evaluateWorldEnergyMonsterFallback(
  cache: Record<string, any> | null | undefined,
  stored: Record<string, any> | null | undefined,
  rawSettings?: Partial<EnergyAutoBurnSettings> | null,
  now = Date.now(),
  helpers?: { isRaidActive?: boolean; isMonsterActive?: boolean }
): WorldEnergyFallbackPlan {
  const settings = normalizeEnergyAutoBurnSettings(rawSettings);
  const safeCache = cache && typeof cache === 'object' ? cache : {};
  const entry = safeCache['resource:world-energy'];
  const worldCap = Number(entry?.data?.cap) > 0 ? Math.floor(Number(entry.data.cap)) : DEFAULT_WORLD_ENERGY_CAP;
  const triggerTarget = Math.min(worldCap, Math.ceil((worldCap * settings.worldTriggerPct) / 100));

  if (!settings.enabled || !settings.worldFallbackEnabled) {
    return { action: 'disabled', attacks: 0, worldEnergy: null, worldCap, triggerTarget, nextWakeAt: null };
  }

  if (stored?.raidEnergyAuto?.enabled === true) {
    return {
      action: 'raid_auto_active',
      attacks: 0,
      worldEnergy: getWorldEnergy(safeCache, now),
      worldCap,
      triggerTarget,
      nextWakeAt: null,
      reason: 'Yielding World Energy to Raid Auto-Energy.',
    };
  }

  if (helpers?.isRaidActive || helpers?.isMonsterActive) {
    return {
      action: 'busy',
      attacks: 0,
      worldEnergy: getWorldEnergy(safeCache, now),
      worldCap,
      triggerTarget,
      nextWakeAt: now + 5 * 60 * 1000,
      reason: 'A Raid or Monster queue is already running.',
    };
  }

  const worldEnergy = getWorldEnergy(safeCache, now);
  if (worldEnergy == null || !Number.isFinite(worldEnergy)) {
    return { action: 'no_data', attacks: 0, worldEnergy: null, worldCap, triggerTarget, nextWakeAt: null };
  }

  // Over-Cap Preservation Guard: never burn World Energy above natural cap
  if (worldEnergy > worldCap) {
    return {
      action: 'over_cap_preserved',
      attacks: 0,
      worldEnergy,
      worldCap,
      triggerTarget,
      nextWakeAt: null,
      reason: `Preserving over-cap World Energy (${worldEnergy}/${worldCap}) — user managed.`,
    };
  }

  if (worldEnergy < triggerTarget) {
    return {
      action: 'wait',
      attacks: 0,
      worldEnergy,
      worldCap,
      triggerTarget,
      nextWakeAt: computeExactRefillWakeAt(entry, triggerTarget, now),
    };
  }

  const attacks = Math.min(
    settings.worldMaxAttacksPerTick,
    Math.floor(Math.max(0, worldEnergy - settings.worldReserveEnergy) / 10)
  );
  if (attacks <= 0) {
    return {
      action: 'wait',
      attacks: 0,
      worldEnergy,
      worldCap,
      triggerTarget,
      nextWakeAt: computeExactRefillWakeAt(entry, settings.worldReserveEnergy + 10, now),
    };
  }

  const prefs = stored?.monsterPreferences || {};
  const heroes = safeCache.heroGetAll?.data || {};
  const heroIds = Array.isArray(prefs.heroIds) && prefs.heroIds.length === 5
    ? prefs.heroIds
    : highestPowerHeroes(heroes);
  const mapInfo = safeCache.mapGetInfo?.data || safeCache.clan_getSummary?.data;
  const mapId = prefs.mapId ?? mapInfo?.mapId ?? mapInfo?.id;
  const center = prefs.center ?? mapInfo?.castlePosition ?? mapInfo?.center;

  if (!mapId || !center || heroIds.length !== 5) {
    return {
      action: 'not_configured',
      attacks: 0,
      worldEnergy,
      worldCap,
      triggerTarget,
      nextWakeAt: null,
      reason: 'Open Monster Attack dialog once to save map/team preferences before enabling World Energy fallback.',
    };
  }

  return {
    action: 'start_monster',
    attacks,
    worldEnergy,
    worldCap,
    triggerTarget,
    nextWakeAt: null,
    monsterOptions: {
      mapId,
      center,
      level: Number.isInteger(prefs.mobLevel) ? prefs.mobLevel : 15,
      count: attacks,
      teamId: prefs.teamId || 'auto-top',
      heroIds,
      autoHealAfterQueue: prefs.autoHealAfterQueue !== false,
    },
  };
}
