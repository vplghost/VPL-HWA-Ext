/**
 * Event Catalog Service for dynamic remote config synchronization.
 * Downloads remote configs (specialQuestEventView, questChain, battlepass) from Nexters CDN
 * when new event versions are detected without requiring an extension rebuild.
 */
import { questData } from '../data/questData.ts';

export interface DynamicEventCatalog {
  viewTitles: Record<string | number, string>;
  chainTitles: Record<string | number, string>;
  battlepass?: {
    tracks?: any[];
    levels?: any[];
    rewards?: any[];
  };
  lastSyncedAt?: string;
  sourceUrls?: Record<string, string>;
}

export interface RemoteConfigIndexData {
  gameTimeShift?: string;
  specialQuestEventViewUrl?: string;
  questUrl?: string;
  questChainUrl?: string;
  questConditionUrl?: string;
  battlepassTrackUrl?: string;
  battlepassRewardUrl?: string;
  battlepassLevelUrl?: string;
  battlepassViewUrl?: string;
  battlepassLocalizationUrl?: string;
  eventHubPopupUrl?: string;
  liveOpsSettingsUrl?: string;
}

export function cleanLocaleTitle(key?: string | null): string {
  if (!key || typeof key !== 'string') return 'Special Event';
  if (questData.localeTitles[key]?.title) return questData.localeTitles[key].title;

  // If already mixed-case and has spaces without underscores, preserve it
  if (/[a-z]/.test(key) && /\s/.test(key) && !key.includes('_')) {
    return key.trim();
  }

  const clean = key
    .replace(/^(LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_|LIB_SPECIAL_QUEST_EVENT_NAME_|LIB_SEASONAL_EVENT_NAME_|LIB_TEST_BP_|LIB_|QUEST_TAB_NAME_|QUEST_TAB_|UI_DIALOG_|UI_FEATURE_HUB_|UI_|STRATEGIC_BASE_INTERFACE_|STRATEGIC_GLOBAL_MAP_)/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!clean) return 'Special Event';
  if (/^\d+$/.test(clean)) return `Event #${clean}`;
  return clean
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\w/g, c => c.toUpperCase());
}

export function parseSpecialQuestEventViews(rawJson: any): Record<string | number, string> {
  const result: Record<string | number, string> = {};
  if (!rawJson || typeof rawJson !== 'object') return result;

  const entries = Array.isArray(rawJson) ? rawJson : Object.entries(rawJson);
  for (const item of entries) {
    const val = Array.isArray(rawJson) ? item : item[1];
    const id = val?.id ?? (Array.isArray(rawJson) ? null : item[0]);
    if (id == null) continue;

    const rawTitle = val?.title || val?.name_localeKey || val?.localeKey || val?.name;
    const title = cleanLocaleTitle(rawTitle);
    result[Number(id)] = title;
  }
  return result;
}

export function parseQuestChains(rawJson: any): Record<string | number, string> {
  const result: Record<string | number, string> = {};
  if (!rawJson || typeof rawJson !== 'object') return result;

  const entries = Array.isArray(rawJson) ? rawJson : Object.entries(rawJson);
  for (const item of entries) {
    const val = Array.isArray(rawJson) ? item : item[1];
    const id = val?.id ?? (Array.isArray(rawJson) ? null : item[0]);
    if (id == null) continue;

    const rawTitle = val?.name || val?.label || val?.localeKey;
    const title = cleanLocaleTitle(rawTitle);
    result[Number(id)] = title;
  }
  return result;
}

export async function fetchJsonSafely(url: string, timeoutMs: number = 8000): Promise<any | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetch(url, {
      signal: controller?.signal,
      headers: { Accept: 'application/json' }
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function syncRemoteEventCatalog(
  configData: RemoteConfigIndexData,
  storage: { get: (keys: string[]) => Promise<any>; set: (items: Record<string, any>) => Promise<any> }
): Promise<{ updated: boolean; catalog: DynamicEventCatalog }> {
  const stored = await storage.get(['dynamicEventCatalog']);
  const existingCatalog: DynamicEventCatalog = stored?.dynamicEventCatalog || {
    viewTitles: {},
    chainTitles: {},
    sourceUrls: {}
  };

  const currentUrls = {
    viewUrl: configData?.specialQuestEventViewUrl || '',
    chainUrl: configData?.questChainUrl || '',
    bpTrackUrl: configData?.battlepassTrackUrl || '',
    bpRewardUrl: configData?.battlepassRewardUrl || '',
    bpLevelUrl: configData?.battlepassLevelUrl || ''
  };

  // Check if URLs have changed
  const urlsChanged =
    !existingCatalog.sourceUrls ||
    existingCatalog.sourceUrls.viewUrl !== currentUrls.viewUrl ||
    existingCatalog.sourceUrls.chainUrl !== currentUrls.chainUrl;

  if (!urlsChanged && Object.keys(existingCatalog.viewTitles || {}).length > 0) {
    return { updated: false, catalog: existingCatalog };
  }

  const newViewTitles: Record<string | number, string> = { ...existingCatalog.viewTitles };
  const newChainTitles: Record<string | number, string> = { ...existingCatalog.chainTitles };

  // Fetch view titles
  if (currentUrls.viewUrl) {
    const viewsData = await fetchJsonSafely(currentUrls.viewUrl);
    if (viewsData) {
      const parsed = parseSpecialQuestEventViews(viewsData);
      Object.assign(newViewTitles, parsed);
    }
  }

  // Fetch chain titles
  if (currentUrls.chainUrl) {
    const chainData = await fetchJsonSafely(currentUrls.chainUrl);
    if (chainData) {
      const parsed = parseQuestChains(chainData);
      Object.assign(newChainTitles, parsed);
    }
  }

  const updatedCatalog: DynamicEventCatalog = {
    viewTitles: newViewTitles,
    chainTitles: newChainTitles,
    sourceUrls: currentUrls,
    lastSyncedAt: new Date().toISOString()
  };

  await storage.set({ dynamicEventCatalog: updatedCatalog });
  questData.registerRuntimeDefinitions({
    viewTitles: newViewTitles
  });

  return { updated: true, catalog: updatedCatalog };
}

export const eventCatalogService = {
  cleanLocaleTitle,
  parseSpecialQuestEventViews,
  parseQuestChains,
  fetchJsonSafely,
  syncRemoteEventCatalog
};
