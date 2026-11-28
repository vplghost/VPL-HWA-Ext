/**
 * Data backup, export and import utilities for HWA Helper.
 * Handles configuration export, full user data export, and importing with overwrite/merge modes.
 */

export interface BackupFileEnvelope<T = Record<string, any>> {
  _format: 'hwa-helper-config' | 'hwa-helper-full-data';
  _version: number;
  _exportedAt: string;
  data?: T;
  config?: T;
}

export interface ImportResult {
  success: boolean;
  format?: string;
  keysCount: number;
  message: string;
}

// Config keys that belong to configuration / settings
export const CONFIG_KEYS = [
  'tabConfig',
  'theme',
  'popupRpcEnabled',
  'sanitizeTeamEnabled',
  'dailyAutopilotSettings',
  'socketRefreshMode',
  'resourceSelection',
  'customTeams',
  'troopCapacitySettings',
  'troopTrainSettings',
  'troopHealSettings',
  'autoShopFavoritesEnabled',
  'shopFavorites',
  'shopCurrencyReserves',
  'towerAutomationSettings',
  'autoGatherSettings',
  'campaignRaidSequential',
  'campaign_disabled_missions',
  'buildingQueue',
  'buildingQueueLogs',
  'researchQueue',
  'researchQueueLogs',
  'raidQueue',
  'monsterQueue',
  'speedupSpendState',
  'guildChatLastReadTime',
];

// Keys that are runtime/transient and should NOT be in config export
export const RUNTIME_EXCLUDE_KEYS = new Set([
  'gameRecordingActive',
  'recordingState',
  'rpcQueueCounts',
  'rpcCache',
  'guildChat',
  'dungeonBattleHistory',
  'cache:world',
  'cache:roster',
]);

/**
 * Filter all storage items to extract only config items.
 */
export function filterConfigData(allStorage: Record<string, any>): Record<string, any> {
  const config: Record<string, any> = {};
  for (const [key, val] of Object.entries(allStorage || {})) {
    if (RUNTIME_EXCLUDE_KEYS.has(key)) continue;
    // Include known config keys or any squad/preference keys
    if (
      CONFIG_KEYS.includes(key) ||
      key.startsWith('squadPreference') ||
      key.startsWith('customTeam') ||
      key.startsWith('preference')
    ) {
      config[key] = val;
    }
  }
  return config;
}

/**
 * Build config export payload.
 */
export function createConfigExportPayload(allStorage: Record<string, any>): BackupFileEnvelope {
  return {
    _format: 'hwa-helper-config',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    config: filterConfigData(allStorage),
  };
}

/**
 * Build full data export payload.
 */
export function createFullDataExportPayload(allStorage: Record<string, any>): BackupFileEnvelope {
  const cleanData: Record<string, any> = {};
  for (const [key, val] of Object.entries(allStorage || {})) {
    if (key === 'recordingState' || key === 'gameRecordingActive' || key === 'rpcQueueCounts') {
      continue;
    }
    cleanData[key] = val;
  }
  return {
    _format: 'hwa-helper-full-data',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    data: cleanData,
  };
}

/**
 * Prepare data to save into storage during import.
 * Handles overwrite = true (overwrites existing keys) vs overwrite = false (merges without overwriting).
 */
export function prepareImportUpdates(
  importedRaw: any,
  currentLocalStorage: Record<string, any>,
  overwrite: boolean
): { success: boolean; updates?: Record<string, any>; keysCount: number; format?: string; error?: string } {
  if (!importedRaw || typeof importedRaw !== 'object' || Array.isArray(importedRaw)) {
    return { success: false, keysCount: 0, error: 'Invalid file format: Expected JSON object.' };
  }

  const format = importedRaw._format || 'raw-data';
  const sourceData = importedRaw.data || importedRaw.config || importedRaw;

  if (typeof sourceData !== 'object' || sourceData === null || Array.isArray(sourceData)) {
    return { success: false, keysCount: 0, error: 'Invalid backup content: No data found.' };
  }

  const incomingEntries = Object.entries(sourceData).filter(([k]) => !k.startsWith('_'));
  if (incomingEntries.length === 0) {
    return { success: false, keysCount: 0, error: 'Backup file is empty (contains 0 keys).' };
  }

  const updates: Record<string, any> = {};

  if (overwrite) {
    for (const [k, v] of incomingEntries) {
      updates[k] = v;
    }
  } else {
    for (const [k, v] of incomingEntries) {
      if (!(k in currentLocalStorage)) {
        updates[k] = v;
      } else if (
        typeof v === 'object' &&
        v !== null &&
        !Array.isArray(v) &&
        typeof currentLocalStorage[k] === 'object' &&
        currentLocalStorage[k] !== null &&
        !Array.isArray(currentLocalStorage[k])
      ) {
        // Merge without overwriting existing non-null local fields
        updates[k] = { ...v, ...currentLocalStorage[k] };
      }
    }
  }

  return {
    success: true,
    updates,
    keysCount: Object.keys(updates).length,
    format,
  };
}

export interface PruneSummary {
  removedInteractions: number;
  removedLegacyKeys: number;
  trimmedLogEntries: number;
  totalPrunedKeys: number;
  details: string[];
}

export interface PruneResult {
  keysToRemove: string[];
  updatesToSet: Record<string, any>;
  summary: PruneSummary;
}

export const LEGACY_PRUNE_KEYS = new Set([
  'apiRecords',
  'claimRpcStatus',
  'claimAllRpcStatus',
  'frontierClaimStatus',
  '_claimRpcStatus',
  'hwa_last_rpc_headers',
  'hwa_game_version',
]);

/**
 * Identify and trim old or bloated data in chrome.storage.local without touching
 * user settings, squads, active queues, or catalogs.
 */
export function pruneStorageData(allStorage: Record<string, any>): PruneResult {
  const keysToRemove: string[] = [];
  const updatesToSet: Record<string, any> = {};
  let removedInteractions = 0;
  let removedLegacyKeys = 0;
  let trimmedLogEntries = 0;
  const details: string[] = [];

  for (const [key, val] of Object.entries(allStorage || {})) {
    // 1. Remove recorded interaction logs
    if (/^interaction:\d+$/.test(key)) {
      keysToRemove.push(key);
      removedInteractions++;
      continue;
    }

    // 2. Remove obsolete / transient keys from older versions
    if (LEGACY_PRUNE_KEYS.has(key)) {
      keysToRemove.push(key);
      removedLegacyKeys++;
      continue;
    }

    // 3. Trim bloated queue logs (newest entries first, keep max 50)
    if ((key === 'buildingQueueLogs' || key === 'researchQueueLogs') && Array.isArray(val)) {
      if (val.length > 50) {
        trimmedLogEntries += (val.length - 50);
        updatesToSet[key] = val.slice(0, 50);
        details.push(`Trimmed ${key} from ${val.length} to 50 entries`);
      }
    }

    // 4. Trim daily activity history (keep max 30 days)
    if (key === 'dailyActivityHistory' && Array.isArray(val)) {
      if (val.length > 30) {
        trimmedLogEntries += (val.length - 30);
        updatesToSet[key] = val.slice(-30);
        details.push(`Trimmed dailyActivityHistory from ${val.length} to 30 days`);
      }
    }

    // 5. Trim dungeon battle history encounter records (keep max 50 records per encounter)
    if (key === 'dungeonBattleHistory' && val && typeof val === 'object' && !Array.isArray(val)) {
      let modified = false;
      const newMap: Record<string, any> = {};
      for (const [encKey, records] of Object.entries(val)) {
        if (Array.isArray(records) && records.length > 50) {
          trimmedLogEntries += (records.length - 50);
          newMap[encKey] = records.slice(-50);
          modified = true;
        } else {
          newMap[encKey] = records;
        }
      }
      if (modified) {
        updatesToSet[key] = newMap;
        details.push('Trimmed dungeonBattleHistory encounter records');
      }
    }
  }

  if (removedInteractions > 0) {
    details.push(`Removed ${removedInteractions} interaction record(s)`);
  }
  if (removedLegacyKeys > 0) {
    details.push(`Removed ${removedLegacyKeys} legacy/transient key(s)`);
  }

  return {
    keysToRemove,
    updatesToSet,
    summary: {
      removedInteractions,
      removedLegacyKeys,
      trimmedLogEntries,
      totalPrunedKeys: keysToRemove.length + Object.keys(updatesToSet).length,
      details,
    },
  };
}

/**
 * Execute storage pruning on chrome.storage.local (or provided mock storage).
 */
export async function executeStoragePrune(customStorage?: any): Promise<PruneSummary> {
  const storage = customStorage || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
  if (!storage) {
    return {
      removedInteractions: 0,
      removedLegacyKeys: 0,
      trimmedLogEntries: 0,
      totalPrunedKeys: 0,
      details: ['Storage is not accessible.'],
    };
  }

  const allStorage = (await storage.get(null)) || {};
  const { keysToRemove, updatesToSet, summary } = pruneStorageData(allStorage);

  if (keysToRemove.length > 0) {
    await storage.remove(keysToRemove);
  }
  if (Object.keys(updatesToSet).length > 0) {
    await storage.set(updatesToSet);
  }

  return summary;
}
