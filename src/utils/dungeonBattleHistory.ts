import { downloadJson } from './metadata.ts';

export interface DungeonEnemyUnit {
  id: number;
  level?: number | null;
  star?: number | null;
  element?: string;
  power?: number;
}

export interface DungeonHeroBattleStat {
  hp: number;
  energy: number;
  maxHp?: number;
  isDead?: boolean;
}

export interface DungeonEncounterRecord {
  id: string;
  floor?: number | null;
  door?: number;
  timestamp: string;
  date?: number;
  enemyTeam: DungeonEnemyUnit[];
  playerTeam: number[];
  enemyPower: number;
  playerPower: number;
  duration: number;
  win: boolean;
  stars: number;
  preBattleStats: Record<string, DungeonHeroBattleStat>;
  postBattleStats: Record<string, DungeonHeroBattleStat>;
  startCall?: any;
  startResponse?: any;
  endCall?: any;
  endResponse?: any;
}

export type DungeonBattleHistoryMap = Record<string, DungeonEncounterRecord[]>;

export const DUNGEON_BATTLE_HISTORY_STORAGE_KEY = 'dungeonBattleHistory';

let memoryBattleHistory: DungeonBattleHistoryMap = {};

/**
 * Generate normalized encounter key for enemy team vs player team.
 * Format: "e:4000,4001,4010,4013,4024_vs_p:4000,4001,4002,4004,4053"
 */
export function getEncounterKey(
  enemyIds: Array<number | string>,
  playerIds: Array<number | string>
): string {
  const eKey = [...enemyIds]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .join(',');
  const pKey = [...playerIds]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .join(',');
  return `e:${eKey}_vs_p:${pKey}`;
}

/**
 * Generate normalized enemy team key prefix.
 * Format: "e:4000,4001,4010,4013,4024"
 */
export function getEnemyKey(enemyIds: Array<number | string>): string {
  const eKey = [...enemyIds]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .join(',');
  return `e:${eKey}`;
}

function getSafeStorage(customStorage?: any): any {
  if (customStorage) return customStorage;
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}

/**
 * Load persisted battle history map from chrome.storage.local (or memory fallback).
 */
export async function loadDungeonBattleHistory(
  customStorage?: any
): Promise<DungeonBattleHistoryMap> {
  const storage = getSafeStorage(customStorage);
  if (storage && typeof storage.get === 'function') {
    try {
      const res = await storage.get(DUNGEON_BATTLE_HISTORY_STORAGE_KEY);
      const data = res?.[DUNGEON_BATTLE_HISTORY_STORAGE_KEY];
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        memoryBattleHistory = { ...data };
        return { ...data };
      }
    } catch (_) {
      // Fall through to memory fallback
    }
  }
  return { ...memoryBattleHistory };
}

/**
 * Save battle history map to storage and sync memory copy.
 */
export async function saveDungeonBattleHistory(
  history: DungeonBattleHistoryMap,
  customStorage?: any
): Promise<void> {
  memoryBattleHistory = { ...history };
  const storage = getSafeStorage(customStorage);
  if (storage && typeof storage.set === 'function') {
    try {
      await storage.set({ [DUNGEON_BATTLE_HISTORY_STORAGE_KEY]: history });
    } catch (_) {}
  }
}

/**
 * Append an encounter record into persistent history.
 */
export async function recordDungeonEncounter(
  record: DungeonEncounterRecord,
  customStorage?: any
): Promise<{ key: string; history: DungeonBattleHistoryMap }> {
  const enemyIds = record.enemyTeam.map((e) => e.id);
  const key = getEncounterKey(enemyIds, record.playerTeam);

  const history = await loadDungeonBattleHistory(customStorage);
  const existingList = Array.isArray(history[key]) ? [...history[key]] : [];

  // Avoid exact duplicate entries if already recorded with same ID
  const isDuplicate = existingList.some((item) => item.id === record.id);
  if (!isDuplicate) {
    existingList.push(record);
    // Keep most recent 50 entries per key to balance detail with memory
    if (existingList.length > 50) {
      existingList.splice(0, existingList.length - 50);
    }
    history[key] = existingList;
    await saveDungeonBattleHistory(history, customStorage);
  }

  return { key, history };
}

/**
 * Helper to normalize enemy units from startResponse defenders or door enemies.
 */
export function extractEnemyUnits(rawDefenders: any): DungeonEnemyUnit[] {
  const units: DungeonEnemyUnit[] = [];
  if (!rawDefenders) return units;

  const pushUnit = (u: any) => {
    if (!u) return;
    const rawId = typeof u === 'object' ? u.id : u;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return;
    units.push({
      id,
      level: u.level != null ? Number(u.level) : null,
      star: u.star != null ? Number(u.star) : null,
      element: u.element || '',
      power: Number(u.power) || 0,
    });
  };

  if (Array.isArray(rawDefenders)) {
    for (const item of rawDefenders) {
      if (item && typeof item === 'object') {
        if (item.id != null) {
          pushUnit(item);
        } else {
          // Object with numeric slot keys: { "1": { id: ... }, "2": { id: ... } }
          for (const slotKey of Object.keys(item)) {
            pushUnit(item[slotKey]);
          }
        }
      }
    }
  } else if (typeof rawDefenders === 'object') {
    for (const key of Object.keys(rawDefenders)) {
      pushUnit(rawDefenders[key]);
    }
  }

  return units;
}

/**
 * Extract a complete DungeonEncounterRecord from genuine start & end RPC pairs.
 */
export function extractEncounterFromBattleRpc(
  activeBattle: any,
  endCall: any,
  endResponse: any,
  options: {
    floorNumber?: number | null;
    timestamp?: string;
    doors?: any[];
  } = {}
): DungeonEncounterRecord | null {
  if (!endCall || !endResponse) return null;

  const startCall = activeBattle?.startCall;
  const startResponse = activeBattle?.startResponse;

  // 1. Identify player heroes
  const playerHeroes: number[] = Array.isArray(startCall?.args?.heroes)
    ? startCall.args.heroes.map(Number)
    : Array.isArray(activeBattle?.heroes)
    ? activeBattle.heroes.map(Number)
    : Object.keys(endCall.args?.progress?.[0]?.attackers?.heroes || {}).map(Number);

  if (!playerHeroes.length) return null;

  // 2. Identify enemy heroes
  let enemyTeam: DungeonEnemyUnit[] = [];
  if (startResponse?.defenders) {
    enemyTeam = extractEnemyUnits(startResponse.defenders);
  }
  const doorIndex = Number(startCall?.args?.teamNum ?? activeBattle?.teamNum ?? 0);
  if (!enemyTeam.length && options.doors && options.doors[doorIndex]) {
    const door = options.doors[doorIndex];
    enemyTeam = extractEnemyUnits(door.team ?? door.enemies);
  }

  // 3. Pre-battle stats & player power
  const preBattleStats: Record<string, DungeonHeroBattleStat> = {};
  let playerPower = 0;
  const attackers = startResponse?.attackers || {};
  for (const hId of playerHeroes) {
    const a = attackers[hId] || attackers[String(hId)];
    const hp = Number(a?.state?.hp ?? a?.hp ?? 0);
    const energy = Number(a?.state?.energy ?? a?.energy ?? 0);
    const maxHp = Number(a?.hp ?? hp);
    const power = Number(a?.power) || 0;
    playerPower += power;
    preBattleStats[String(hId)] = {
      hp,
      energy,
      maxHp,
      isDead: a?.state?.isDead === true || (hp <= 0 && a?.state?.hp != null),
    };
  }

  // 4. Enemy power
  let enemyPower = 0;
  for (const enemy of enemyTeam) {
    enemyPower += Number(enemy.power) || 0;
  }
  if (enemyPower === 0 && options.doors && options.doors[doorIndex]?.power) {
    enemyPower = Number(options.doors[doorIndex].power) || 0;
  }

  // 5. Post-battle stats
  const postBattleStats: Record<string, DungeonHeroBattleStat> = {};
  const progressAttackers = endCall.args?.progress?.[0]?.attackers?.heroes || {};
  const serverTitans = endResponse.dungeon?.states?.titans || endResponse.states?.titans || {};
  for (const hId of playerHeroes) {
    const p = progressAttackers[hId] || progressAttackers[String(hId)];
    const s = serverTitans[hId] || serverTitans[String(hId)];
    const hp = Number(p?.hp ?? s?.hp ?? preBattleStats[String(hId)]?.hp ?? 0);
    const energy = Number(p?.energy ?? s?.energy ?? preBattleStats[String(hId)]?.energy ?? 0);
    const isDead = p?.isDead === true || s?.isDead === true || hp <= 0;
    postBattleStats[String(hId)] = {
      hp,
      energy,
      isDead,
    };
  }

  const floor =
    options.floorNumber ??
    endResponse.dungeon?.floorNumber ??
    activeBattle?.floorNumber ??
    null;

  const duration = Number(endCall.args?.progress?.[0]?.duration) || 15;
  const win = endCall.args?.result?.win !== false;
  const stars = Number(endCall.args?.result?.stars) || 3;
  const timestamp = options.timestamp || new Date().toISOString();
  const id = `${Date.parse(timestamp) || Date.now()}_${floor || 0}_${doorIndex}`;

  return {
    id,
    floor: floor != null ? Number(floor) : null,
    door: doorIndex,
    timestamp,
    date: Date.parse(timestamp) || Date.now(),
    enemyTeam,
    playerTeam: playerHeroes,
    enemyPower,
    playerPower,
    duration,
    win,
    stars,
    preBattleStats,
    postBattleStats,
    startCall,
    startResponse,
    endCall,
    endResponse,
  };
}

/**
 * Find matching historical encounter for a door.
 * Matches when the enemy team IDs match and all titans in the recorded player team are alive.
 */
export function findMatchingEncounter(
  doorEnemies: any[],
  aliveTitans: Record<string, any> | Array<number | string>,
  history: DungeonBattleHistoryMap
): { record: DungeonEncounterRecord; key: string } | null {
  if (!Array.isArray(doorEnemies) || doorEnemies.length === 0) return null;
  if (!history || typeof history !== 'object') return null;

  const enemyUnits = extractEnemyUnits(doorEnemies);
  if (!enemyUnits.length) return null;

  const targetEnemyKey = getEnemyKey(enemyUnits.map((u) => u.id));
  const prefix = `${targetEnemyKey}_vs_p:`;

  // Create helper to check if a titan is alive
  const isTitanAlive = (hId: number | string): boolean => {
    if (Array.isArray(aliveTitans)) {
      return aliveTitans.map(Number).includes(Number(hId));
    }
    if (aliveTitans && typeof aliveTitans === 'object') {
      const state = aliveTitans[hId] || aliveTitans[String(hId)];
      if (!state) return false;
      if (state.isDead === true) return false;
      if (typeof state.hp === 'number' && state.hp <= 0) return false;
      return true;
    }
    return true;
  };

  let bestMatch: { record: DungeonEncounterRecord; key: string } | null = null;

  for (const [key, records] of Object.entries(history)) {
    if (!key.startsWith(prefix) || !Array.isArray(records)) continue;

    for (const rec of records) {
      // Must be a winning record
      if (rec.win === false) continue;

      // All player titans in this record must currently be alive
      const allAlive = rec.playerTeam.every((hId) => isTitanAlive(hId));
      if (!allAlive) continue;

      // Pick the most recent encounter (or highest stars)
      if (
        !bestMatch ||
        (rec.date || 0) > (bestMatch.record.date || 0) ||
        rec.stars > bestMatch.record.stars
      ) {
        bestMatch = { record: rec, key };
      }
    }
  }

  return bestMatch;
}

export const MAJOR_HEALING_TITAN_IDS = new Set<number>([
  4003, // Hyperion (Water Supertitan - Compassion heal lowest HP ally)
  4004, // Tydus (Water Summoner - Deep Current 30% max HP team heal with water synergy + Child of Water life-steal)
  4042, // Iyari (Light Support - Beacon of Light heal)
  4043, // Solaris (Light Supertitan - Solar Embrace heal/shield)
]);

export const MINOR_HEALING_TITAN_IDS = new Set<number>([
  4022, // Avalon (Earth Support - Overgrowth nature shield/minor heal)
  4024, // Verdoc (Earth Summoner - Verdant Guard minor heal)
  4052, // Orm (Spirit Support)
]);

export const HEALING_TITAN_IDS = new Set<number>([
  ...MAJOR_HEALING_TITAN_IDS,
  ...MINOR_HEALING_TITAN_IDS,
]);

export function hasMajorHealingTitan(playerTeam: Array<number | string>): boolean {
  return (playerTeam || []).some((id) => MAJOR_HEALING_TITAN_IDS.has(Number(id)));
}

export function hasHealingTitan(playerTeam: Array<number | string>): boolean {
  return (playerTeam || []).some((id) => HEALING_TITAN_IDS.has(Number(id)));
}

export interface DungeonSimulationOptions {
  hpBonusPercent?: number; // 0 to 50
  energyBonusPercent?: number; // 0 to 50
  allowNonHealerRecovery?: boolean; // default false: non-healer team HP cannot exceed pre-battle HP
  autoDetectDeath?: boolean; // default true: auto detect fatal damage, omit dead titans and adjust stars/duration
}

/**
 * Build simulated dungeonEndBattle arguments from matched historical record and fresh start response.
 */
export function buildSimulatedEndBattleArgs(
  record: DungeonEncounterRecord,
  startResponse: any,
  options?: DungeonSimulationOptions
): any {
  const heroMap: Record<string, any> = {};
  const seed =
    startResponse?.seed ??
    startResponse?.response?.seed ??
    record.startResponse?.seed ??
    0;
  const currentAttackers =
    startResponse?.attackers ??
    startResponse?.response?.attackers ??
    {};

  const hpBonus = Math.max(0, Math.min(100, Number(options?.hpBonusPercent) || 0));
  const energyBonus = Math.max(0, Math.min(100, Number(options?.energyBonusPercent) || 0));
  const hasMajor = hasMajorHealingTitan(record.playerTeam);
  const hasMinor = hasHealingTitan(record.playerTeam);
  const allowNonHealerRecovery = options?.allowNonHealerRecovery === true;
  const autoDetectDeath = options?.autoDetectDeath !== false;

  let deadCount = 0;
  let spilloverDamage = 0;

  for (let idx = 0; idx < record.playerTeam.length; idx++) {
    const hId = record.playerTeam[idx];
    const curA = currentAttackers[hId] || currentAttackers[String(hId)];
    const curHp = Number(curA?.state?.hp ?? curA?.hp ?? 1000000);
    const maxHp = Number(curA?.hp ?? curHp);
    const curEnergy = Number(curA?.state?.energy ?? curA?.energy ?? 800);
    const isAlreadyDead = curA?.state?.isDead === true || (curHp <= 0 && curA?.state?.hp != null);

    if (isAlreadyDead) {
      deadCount++;
      continue;
    }

    const recPost =
      record.postBattleStats?.[hId] ||
      record.postBattleStats?.[String(hId)] ||
      record.endCall?.args?.progress?.[0]?.attackers?.heroes?.[hId] ||
      record.endCall?.args?.progress?.[0]?.attackers?.heroes?.[String(hId)];
    const recPre =
      record.preBattleStats?.[hId] || record.preBattleStats?.[String(hId)];

    let finalHp: number;
    let finalEnergy: number;

    if (recPost && typeof recPost.hp === 'number') {
      const recPreHp = typeof recPre?.hp === 'number' && recPre.hp > 0 ? recPre.hp : maxHp;
      const recPostHp = recPost.hp;

      if (recPostHp < recPreHp) {
        // Historical damage taken
        let rawHpLost = recPreHp - recPostHp;

        // Energy deficit adjustment: low starting energy delays skill/ult casting, leading to prolonged enemy assault
        const recPreEnergy = typeof recPre?.energy === 'number' ? recPre.energy : 500;
        const energyDeficit = Math.max(0, recPreEnergy - curEnergy);
        if (energyDeficit > 150) {
          const enemyPwr = Number(record.enemyPower) || 40000;
          const energyPenalty = Math.round((energyDeficit / 1000) * (enemyPwr * 15));
          rawHpLost += energyPenalty;
        }

        // Frontline vulnerability: position 0 tank bearing full brunt without major healing dies if severely wounded (< 35% HP)
        if (idx === 0 && !hasMajor && curHp <= maxHp * 0.35 && energyDeficit > 100) {
          rawHpLost = Math.max(rawHpLost, Math.round(curHp * 1.05));
        }

        // Apply spillover damage from preceding dead frontline tank
        if (spilloverDamage > 0) {
          rawHpLost += spilloverDamage;
          spilloverDamage = 0;
        }

        // Outcome tuning: hpBonus reduces damage taken
        let effectiveHpLost = rawHpLost;
        if (hpBonus > 0) {
          effectiveHpLost = Math.max(0, Math.round(effectiveHpLost * (1 - hpBonus / 100)));
        }

        // Check if damage is fatal
        if (autoDetectDeath && effectiveHpLost >= curHp) {
          deadCount++;
          spilloverDamage = Math.max(60000, Math.round((effectiveHpLost - curHp) * 0.5));
          continue; // Dead titan omitted from attackers.heroes (server omission standard)
        }

        finalHp = Math.max(1, Math.min(curHp, Math.round(curHp - effectiveHpLost)));
      } else if (recPostHp > recPreHp) {
        // Historical heal occurred
        if (!hasMinor && !allowNonHealerRecovery) {
          // Team has no healer: HP CANNOT exceed pre-battle HP!
          let effectiveHp = curHp;
          if (spilloverDamage > 0) {
            effectiveHp = Math.max(1, curHp - spilloverDamage);
            spilloverDamage = 0;
          }
          finalHp = effectiveHp;
        } else {
          // Team has healer: can recover towards maxHp
          let rawHeal = recPostHp - recPreHp;
          if (spilloverDamage > 0) {
            rawHeal -= spilloverDamage;
            spilloverDamage = 0;
          }
          if (hpBonus > 0) {
            rawHeal = Math.round(rawHeal * (1 + hpBonus / 100));
          }
          if (!hasMajor && !allowNonHealerRecovery) {
            // Minor healer only (Avalon/Verdoc): small recovery, capped at 25,000 HP
            rawHeal = Math.min(25000, rawHeal);
          }
          finalHp = Math.max(1, Math.min(maxHp, curHp + rawHeal));
        }
      } else {
        // recPostHp === recPreHp (e.g. backline titan unharmed in record)
        if (spilloverDamage > 0) {
          let effSpill = spilloverDamage;
          if (hpBonus > 0) {
            effSpill = Math.max(0, Math.round(effSpill * (1 - hpBonus / 100)));
          }
          finalHp = Math.max(1, Math.min(curHp, curHp - effSpill));
          spilloverDamage = 0;
        } else if (!hasMinor && !allowNonHealerRecovery) {
          finalHp = curHp;
        } else {
          let extraHeal = 0;
          if (hpBonus > 0 && curHp < maxHp) {
            let boost = Math.round((maxHp - curHp) * (hpBonus / 100));
            if (!hasMajor && !allowNonHealerRecovery) {
              boost = Math.min(25000, boost);
            }
            extraHeal = boost;
          }
          finalHp = Math.min(maxHp, curHp + extraHeal);
        }
      }

      let baseEnergy = typeof recPost.energy === 'number' ? recPost.energy : curEnergy;
      if (energyBonus > 0) {
        baseEnergy = Math.round(baseEnergy * (1 + energyBonus / 100));
      }
      finalEnergy = Math.max(0, Math.min(1000, baseEnergy));
    } else {
      finalHp = curHp;
      finalEnergy = Math.max(0, Math.min(1000, curEnergy + Math.round(curEnergy * (energyBonus / 100))));
    }

    heroMap[String(hId)] = {
      isDead: false,
      hp: finalHp,
      energy: finalEnergy,
    };
  }

  // Adjust stars based on surviving titans
  let stars = record.stars || 3;
  if (deadCount > 0) {
    stars = Math.max(1, 3 - deadCount);
  }

  const baseDuration =
    typeof record.duration === 'number' && record.duration > 5
      ? record.duration
      : 20;
  // If titans died, battle took longer (e.g. 24s vs 13s)
  const durationPadding = deadCount > 0 ? (deadCount * 11) : 0;
  const jitter = Number(((Math.random() * 1.2) - 0.6).toFixed(4));
  const duration = Number(Math.max(8, baseDuration + durationPadding + jitter).toFixed(4));

  return {
    result: { win: true, stars },
    progress: [
      {
        defenders: { heroes: {}, input: [] },
        attackers: { heroes: heroMap, input: [] },
        duration,
        seed,
      },
    ],
  };
}

/**
 * Export complete dungeon battle encounter history as a JSON file.
 */
export function exportDungeonBattleHistory(history: DungeonBattleHistoryMap): void {
  const encounterKeys = Object.keys(history || {});
  let totalBattles = 0;
  for (const k of encounterKeys) {
    if (Array.isArray(history[k])) {
      totalBattles += history[k].length;
    }
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    totalEncounterKeys: encounterKeys.length,
    totalBattles,
    history: history || {},
  };

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadJson(`hwa-dungeon-battle-history-${dateStr}.json`, payload);
}

/**
 * Reset in-memory and persistent battle history (for testing or user reset).
 */
export async function clearDungeonBattleHistory(customStorage?: any): Promise<void> {
  memoryBattleHistory = {};
  const storage = getSafeStorage(customStorage);
  if (storage && typeof storage.remove === 'function') {
    try {
      await storage.remove(DUNGEON_BATTLE_HISTORY_STORAGE_KEY);
    } catch (_) {}
  }
}
