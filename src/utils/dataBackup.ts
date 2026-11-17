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
  'socketRefreshMode',
  'resourceSelection',
  'customTeams',
  'troopCapacitySettings',
  'troopTrainSettings',
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
  'legendDraftLoggingEnabled',
];

// Keys that are runtime/transient and should NOT be in config export
export const RUNTIME_EXCLUDE_KEYS = new Set([
  'gameRecordingActive',
  'recordingState',
  'rpcQueueCounts',
  'rpcCache',
  'legendDraftSessionLog',
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
