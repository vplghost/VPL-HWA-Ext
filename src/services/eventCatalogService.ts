/**
 * Event Catalog Service for dynamic remote config synchronization.
 * Downloads remote configs (specialQuestEventView, questChain, battlepass) from Nexters CDN
 * when new event versions are detected without requiring an extension rebuild.
 */
import { questData } from '../data/questData.ts';
import { registerRuntimeTierData } from '../utils/tierHelper.ts';

export interface DynamicEventCatalog {
  viewTitles: Record<string | number, string>;
  chainTitles: Record<string | number, string>;
  questTargets?: Record<string | number, number>;
  questRewards?: Record<string | number, any[]>;
  chainTransferProgress?: Record<string | number, boolean>;
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
  if (questData.localeTitles?.[key]?.title) return questData.localeTitles[key]!.title;

  // If contains Cyrillic characters
  if (/[\u0400-\u04FF]/.test(key)) {
    const stripped = key.replace(/[\u0400-\u04FF]/g, '').trim();
    if (stripped.length >= 3 && /[a-zA-Z]/.test(stripped)) {
      key = stripped;
    } else {
      return 'Special Event';
    }
  }

  // If already mixed-case and has spaces without underscores, preserve it
  if (/[a-z]/.test(key) && /\s/.test(key) && !key.includes('_')) {
    return key.trim();
  }

  const clean = key
    .replace(/^(LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_|LIB_SPECIAL_QUEST_EVENT_NAME_|LIB_SEASONAL_EVENT_NAME_|LIB_TEST_BP_|LIB_|QUEST_TAB_NAME_|QUEST_TAB_|UI_DIALOG_|UI_FEATURE_HUB_|UI_|STRATEGIC_BASE_INTERFACE_|STRATEGIC_GLOBAL_MAP_|EVENT_GLORY_NAME_QUEST_|EVENT_GLORY_NAME_|BATTLEPASS_UNIVERSAL_|BATTLEPASS_)/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!clean) return 'Special Event';

  // If numeric, check if questData has the full key defined
  if (/^\d+$/.test(clean)) {
    const fullKey = 'LIB_SPECIAL_QUEST_EVENT_NAME_' + clean;
    if (questData.localeTitles[fullKey]?.title) {
      return questData.localeTitles[fullKey].title;
    }
    return `Event #${clean}`;
  }

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

    const rawKey = val?.nameLocaleKey || val?.name_localeKey || val?.localeKey || val?.name || val?.title;
    let title = '';
    if (rawKey && rawKey !== 'empty') {
      title = cleanLocaleTitle(rawKey);
    }

    // If title is missing or generic fallback, inspect descriptive label
    if (!title || title === 'Special Event' || title.startsWith('Event #')) {
      const label = val?.label;
      if (label && typeof label === 'string') {
        if (/[a-zA-Z]{3,}/.test(label) && !/[\u0400-\u04FF]/.test(label)) {
          title = label
            .replace(/\(pp\d+\)/gi, '')
            .replace(/\s*Event View\s*$/i, '')
            .replace(/\s*View\s*$/i, '')
            .replace(/\. /g, ': ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[\s.:-]+$/g, '')
            .trim();
        } else if (label.includes('ClanClash')) {
          title = 'Clan Clash Event';
        } else if (label.includes('Водрин') || label.toLowerCase().includes('hero78')) {
          title = 'Wodryn Adventure Event';
        }
      }
    }

    // Preserve known hardcoded view titles if CDN config provides no specific title
    if ((!title || title === 'Special Event') && questData.viewTitles[Number(id)]) {
      title = questData.viewTitles[Number(id)] || '';
    }

    if (title && title !== 'Special Event') {
      result[Number(id)] = title;
    }
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

    const rawTitle = val?.name_localeKey || val?.localeKey || val?.name || (!/[\u0400-\u04FF]/.test(val?.label || '') ? val?.label : null) || val?.title;
    const title = cleanLocaleTitle(rawTitle);
    result[Number(id)] = title;
  }
  return result;
}

export function parseQuestChainTransferProgress(rawJson: any): Record<string | number, boolean> {
  const result: Record<string | number, boolean> = {};
  if (!rawJson || typeof rawJson !== 'object') return result;

  const entries = Array.isArray(rawJson) ? rawJson : Object.entries(rawJson);
  for (const item of entries) {
    const val = Array.isArray(rawJson) ? item : item[1];
    const id = val?.id ?? (Array.isArray(rawJson) ? null : item[0]);
    if (id == null) continue;
    if (val?.transferProgress != null) {
      result[Number(id)] = val.transferProgress === true;
    }
  }
  return result;
}

export function parseQuests(rawJson: any): {
  targets: Record<number, number>;
  rewards: Record<number, any[]>;
  chains: Record<number, number>;
} {
  const targets: Record<number, number> = {};
  const rewards: Record<number, any[]> = {};
  const chains: Record<number, number> = {};

  if (!rawJson || typeof rawJson !== 'object') return { targets, rewards, chains };

  const entries = Array.isArray(rawJson) ? rawJson : Object.entries(rawJson);
  for (const item of entries) {
    const val = Array.isArray(rawJson) ? item : item[1];
    const id = val?.id ?? (Array.isArray(rawJson) ? null : item[0]);
    if (id == null) continue;
    const numId = Number(id);
    if (!Number.isFinite(numId)) continue;

    const target = val?.condition?.target ?? val?.target;
    if (target != null && Number.isFinite(Number(target))) {
      targets[numId] = Number(target);
    }

    if (Array.isArray(val?.reward) && val.reward.length > 0) {
      rewards[numId] = val.reward;
    }

    if (val?.chainId != null) {
      chains[numId] = Number(val.chainId);
    }
  }
  return { targets, rewards, chains };
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
  storage: { get: (keys: string[]) => Promise<any>; set: (items: Record<string, any>) => Promise<any> },
  force: boolean = false
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
    questUrl: configData?.questUrl || '',
    bpTrackUrl: configData?.battlepassTrackUrl || '',
    bpRewardUrl: configData?.battlepassRewardUrl || '',
    bpLevelUrl: configData?.battlepassLevelUrl || ''
  };

  // Check if URLs have changed or if existing catalog contains stale generic Special Event titles
  const hasStaleSpecialEventTitles = Object.values(existingCatalog.viewTitles || {}).some(
    v => v === 'Special Event'
  );

  const urlsChanged =
    !existingCatalog.sourceUrls ||
    existingCatalog.sourceUrls.viewUrl !== currentUrls.viewUrl ||
    existingCatalog.sourceUrls.chainUrl !== currentUrls.chainUrl ||
    existingCatalog.sourceUrls.questUrl !== currentUrls.questUrl ||
    existingCatalog.sourceUrls.bpLevelUrl !== currentUrls.bpLevelUrl ||
    existingCatalog.sourceUrls.bpTrackUrl !== currentUrls.bpTrackUrl ||
    existingCatalog.sourceUrls.bpRewardUrl !== currentUrls.bpRewardUrl;

  if (!force && !urlsChanged && !hasStaleSpecialEventTitles && Object.keys(existingCatalog.viewTitles || {}).length > 0) {
    return { updated: false, catalog: existingCatalog };
  }

  // Initialize with clean base titles from questData and valid non-generic stored titles
  const newViewTitles: Record<string | number, string> = {};
  for (const [k, v] of Object.entries(questData.viewTitles || {})) {
    if (v && v !== 'Special Event') newViewTitles[k] = v;
  }
  for (const [k, v] of Object.entries(existingCatalog.viewTitles || {})) {
    if (v && v !== 'Special Event') newViewTitles[k] = v;
  }

  const newChainTitles: Record<string | number, string> = { ...existingCatalog.chainTitles };
  const newQuestTargets: Record<string | number, number> = { ...(existingCatalog.questTargets || {}) };
  const newQuestRewards: Record<string | number, any[]> = { ...(existingCatalog.questRewards || {}) };
  const newChainTransferProgress: Record<string | number, boolean> = { ...(existingCatalog.chainTransferProgress || {}) };
  let bpLevels = existingCatalog.battlepass?.levels || [];
  let bpTracks = existingCatalog.battlepass?.tracks || [];
  let bpRewards = existingCatalog.battlepass?.rewards || [];

  // Fetch view titles
  if (currentUrls.viewUrl) {
    const viewsData = await fetchJsonSafely(currentUrls.viewUrl);
    if (viewsData) {
      const parsed = parseSpecialQuestEventViews(viewsData);
      Object.assign(newViewTitles, parsed);
    }
  }

  // Fetch chain titles & transferProgress
  if (currentUrls.chainUrl) {
    const chainData = await fetchJsonSafely(currentUrls.chainUrl);
    if (chainData) {
      const parsedTitles = parseQuestChains(chainData);
      Object.assign(newChainTitles, parsedTitles);
      const parsedTransfer = parseQuestChainTransferProgress(chainData);
      Object.assign(newChainTransferProgress, parsedTransfer);
    }
  }

  // Fetch quests (targets & rewards)
  if (currentUrls.questUrl) {
    const questsData = await fetchJsonSafely(currentUrls.questUrl);
    if (questsData) {
      const { targets, rewards } = parseQuests(questsData);
      Object.assign(newQuestTargets, targets);
      Object.assign(newQuestRewards, rewards);
    }
  }

  // Fetch battlepass levels
  if (currentUrls.bpLevelUrl) {
    const levelData = await fetchJsonSafely(currentUrls.bpLevelUrl);
    if (levelData) {
      bpLevels = Array.isArray(levelData) ? levelData : Object.values(levelData);
    }
  }

  // Fetch battlepass tracks
  if (currentUrls.bpTrackUrl) {
    const trackData = await fetchJsonSafely(currentUrls.bpTrackUrl);
    if (trackData) {
      bpTracks = Array.isArray(trackData) ? trackData : Object.values(trackData);
    }
  }

  // Fetch battlepass rewards
  if (currentUrls.bpRewardUrl) {
    const rewardData = await fetchJsonSafely(currentUrls.bpRewardUrl);
    if (rewardData) {
      bpRewards = Array.isArray(rewardData) ? rewardData : Object.values(rewardData);
    }
  }

  const updatedCatalog: DynamicEventCatalog = {
    viewTitles: newViewTitles,
    chainTitles: newChainTitles,
    questTargets: newQuestTargets,
    questRewards: newQuestRewards,
    chainTransferProgress: newChainTransferProgress,
    battlepass: {
      levels: bpLevels,
      tracks: bpTracks,
      rewards: bpRewards,
    },
    sourceUrls: currentUrls,
    lastSyncedAt: new Date().toISOString()
  };

  await storage.set({ dynamicEventCatalog: updatedCatalog });
  questData.registerRuntimeDefinitions({
    viewTitles: newViewTitles
  });
  registerRuntimeTierData(updatedCatalog);

  return { updated: true, catalog: updatedCatalog };
}

export { getBattlePassName, knownBattlePassNames } from '../data/battlepassCatalog.ts';

export const eventCatalogService = {
  cleanLocaleTitle,
  parseSpecialQuestEventViews,
  parseQuestChains,
  parseQuestChainTransferProgress,
  parseQuests,
  fetchJsonSafely,
  syncRemoteEventCatalog
};
