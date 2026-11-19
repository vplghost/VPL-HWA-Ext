/**
 * Event and Battle Pass Captured Data Exporter for Offline Analysis
 */

import { downloadJson } from './metadata.ts';

export interface EventExportPayload {
  exportedAt: string;
  source: 'hwa-extension-cache';
  events: {
    specialQuestStatus?: any;
    getSpecialQuestState?: any;
    questEvents?: any;
    clanVersusStatus?: any;
  };
  battlepass: {
    battlepassLiveStatus?: any;
    getBattlepassState?: any;
    battlePass_getAll?: any;
    battlepassStatus?: any;
  };
  dailyQuests: {
    getDailyQuests?: any;
    dailyQuests?: any;
  };
  dynamicCatalog?: any;
  context?: any;
}

/**
 * Builds a structured snapshot of all captured event and battle pass data from the RPC cache.
 */
export function buildEventExportPayload(
  cache: any,
  dynamicCatalog?: any,
  context?: any
): EventExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    source: 'hwa-extension-cache',
    events: {
      specialQuestStatus: cache?.specialQuestStatus?.data ?? cache?.specialQuestStatus,
      getSpecialQuestState: cache?.['getSpecialQuestState:quest']?.data ?? cache?.['getSpecialQuestState:quest'],
      questEvents: cache?.questEvents?.data ?? cache?.questEvents,
      clanVersusStatus: cache?.clanVersusStatus?.data ?? cache?.clanVersusStatus,
    },
    battlepass: {
      battlepassLiveStatus: cache?.battlepassLiveStatus?.data ?? cache?.battlepassLiveStatus,
      getBattlepassState: cache?.['getBattlepassState:battlepass']?.data ?? cache?.['getBattlepassState:battlepass'],
      battlePass_getAll: cache?.['battlePass_getAll:events']?.data ?? cache?.['battlePass_getAll:events'],
      battlepassStatus: cache?.battlepassStatus?.data ?? cache?.battlepassStatus,
    },
    dailyQuests: {
      getDailyQuests: cache?.['getDailyQuests:quest']?.data ?? cache?.['getDailyQuests:quest'],
      dailyQuests: cache?.dailyQuests?.data ?? cache?.dailyQuests,
    },
    dynamicCatalog: dynamicCatalog || null,
    context: context || null,
  };
}

/**
 * Download captured event and battle pass data as a JSON file.
 */
export function exportEventsAsJson(
  cache: any,
  dynamicCatalog?: any,
  context?: any,
  prefix = 'hwa-events-data'
): EventExportPayload {
  const payload = buildEventExportPayload(cache, dynamicCatalog, context);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.json`;
  downloadJson(filename, payload);
  return payload;
}

/**
 * Copy captured event and battle pass JSON payload directly to the clipboard.
 */
export async function copyEventsToClipboard(
  cache: any,
  dynamicCatalog?: any,
  context?: any
): Promise<boolean> {
  const payload = buildEventExportPayload(cache, dynamicCatalog, context);
  const text = JSON.stringify(payload, null, 2);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  return false;
}
