/**
 * Standardized TypeScript Background Runtime for HWA Helper.
 * Orchestrates background service worker duties:
 * - Direct ES module imports of typed services and caches
 * - Standardized storage access via storageStore
 * - Clean message router and alarm handlers
 */
import { rpcCacheService } from '../core/cache/index.ts';
import { buildingQueueService } from '../services/queues/buildingQueue.ts';
import researchQueueService from '../services/queues/researchQueue.ts';
import raidQueueService from '../services/queues/raidQueue.ts';
import monsterQueueService from '../services/queues/monsterQueue.ts';
import raidEnergyAutoService from '../services/queues/raidEnergyAuto.ts';
import autoGatherService from '../services/queues/autoGather.ts';
import smartGatherService from '../services/queues/smartGather.ts';
import towerAutomationService from '../services/queues/towerAutomation.ts';
import towerRunnerService from '../services/queues/towerRunner.ts';
import dungeonAutomationService from '../services/queues/dungeonAutomation.ts';
import dungeonRunnerService from '../services/queues/dungeonRunner.ts';
import { speedupService } from '../services/speedupService.ts';
import { freeAlchemyPolicy } from '../services/freeAlchemy.ts';
import { mailService } from '../services/mailService.ts';
import { mineDefenseService } from '../services/mineDefense.ts';
import { worldReadService } from '../services/worldReadService.ts';
import { localStorageStore, sessionStorageStore } from '../core/storage/storageStore.ts';
import { isTrackingUrl } from '../utils/trackingFilter.ts';

export const RECORD_STATE_KEY = 'recordingState';
export const GAME_ORIGINS = ['https://www.hero-wars-alliance.com', 'https://hero-wars-alliance.com'];

export function isGameUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  return GAME_ORIGINS.some((origin) => url.startsWith(`${origin}/`) || url === origin) || url.includes('hero-wars-alliance.com');
}

export function rpcMessageForSettings(settings: any, calls: any[], trackId?: string) {
  const mode = settings?.socketRefreshMode;
  const kind = mode === 'direct' ? 'refresh-rpc' : 'queue-rpc';
  return {
    source: 'hwa-helper-control',
    kind,
    calls,
    trackId: trackId || null,
    requestedAt: new Date().toISOString()
  };
}

export interface BackgroundRuntimeOptions {
  chrome?: any;
}

export function setupBackgroundRuntime(options: BackgroundRuntimeOptions = {}) {
  const cr = options.chrome || (typeof chrome !== 'undefined' ? chrome : null);
  if (!cr) return;

  // Routine storage pruning on startup
  try {
    localStorageStore.get('rpcCache').then((storedCache: any) => {
      if (storedCache) {
        const pruned = rpcCacheService.pruneCache(storedCache);
        if (pruned.changed) {
          localStorageStore.set('rpcCache', pruned.cache);
        }
      }
    }).catch(() => {});
  } catch (_) {}

  async function queryGameTabs(): Promise<any[]> {
    return new Promise((resolve) => {
      try {
        cr.tabs.query({ url: ['https://*.hero-wars-alliance.com/*', 'https://hero-wars-alliance.com/*'] }, (tabs: any[]) => {
          resolve(tabs || []);
        });
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function forwardToGameTab(message: any, preferredTabId?: number): Promise<boolean> {
    const tabs = await queryGameTabs();
    if (!tabs.length) return false;
    let target = tabs.find((t) => t.id === preferredTabId);
    if (!target) target = tabs.find((t) => t.active) || tabs[0];
    if (!target?.id) return false;
    try {
      await cr.tabs.sendMessage(target.id, message);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Handle incoming API records
  async function handleApiRecord(record: any, sender: any) {
    if (!record) return;
    try {
      const stored = await localStorageStore.getMultiple([
        'rpcCache',
        'popupRpcEnabled',
        'socketRefreshMode',
        'raidQueue',
        'monsterQueue',
        'buildingQueue',
        'researchQueue'
      ]);

      const currentCache = stored.rpcCache || {};
      const updatedCache = rpcCacheService.merge(currentCache, record);
      await localStorageStore.set('rpcCache', updatedCache.cache);

      // Check if camp battle victory calls for energy refresh
      const requestBody = JSON.parse(record.requestBody || '{}');
      const responseBody = JSON.parse(record.responseBody || '{}');
      const calls = requestBody.calls || [];
      const results = responseBody.results || [];

      for (const call of calls) {
        if (call.name === 'winCampBattle') {
          const res = results.find((r: any) => r.ident === call.ident)?.result;
          if (res && !res.error && stored.popupRpcEnabled) {
            const refreshMsg = rpcMessageForSettings(stored, [
              { name: 'refillableGetAll', feature: 'refillable' },
              { name: 'inventoryGet' }
            ]);
            await forwardToGameTab(refreshMsg, sender?.tab?.id);
          }
        }
      }
    } catch (_) {}
  }

  // Alarms
  cr.alarms?.onAlarm?.addListener?.((alarm: any) => {
    if (alarm.name === 'queue') {
      // Periodic queue check
    }
  });

  // Message router
  cr.runtime?.onMessage?.addListener?.((message: any, sender: any, sendResponse: (resp?: any) => void) => {
    const isExtensionSender = sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`);
    const isGameSender = isGameUrl(sender.url);
    const isAllowedOrigin = isExtensionSender || isGameSender;

    // Ping
    if (message?.kind === 'ping') {
      sendResponse({ ok: true, version: cr.runtime.getManifest()?.version });
      return true;
    }

    // API Record
    if (message?.kind === 'api-record' && isGameSender) {
      handleApiRecord(message.record, sender);
      sendResponse({ ok: true });
      return true;
    }

    // Recording controls
    const recordKinds = ['record-start', 'record-stop', 'record-clear', 'start-recording', 'stop-recording'];
    if (recordKinds.includes(message?.kind) && isAllowedOrigin) {
      let mappedKind = message.kind;
      if (mappedKind === 'start-recording') mappedKind = 'record-start';
      if (mappedKind === 'stop-recording') mappedKind = 'record-stop';

      sessionStorageStore.get(RECORD_STATE_KEY).then(async (stored: any) => {
        const state = stored || { active: false, nextIndex: 0 };
        let next = { ...state };
        if (mappedKind === 'record-start') {
          next = { active: true, nextIndex: 0, nextInteractionIndex: 0, error: null };
          await localStorageStore.set('gameRecordingActive', true);
          await localStorageStore.set('recordingState', next);
        } else if (mappedKind === 'record-stop') {
          next = { ...state, active: false };
          await localStorageStore.set('gameRecordingActive', false);
          await localStorageStore.set('recordingState', next);
        } else if (mappedKind === 'record-clear') {
          next = { active: false, nextIndex: 0, nextInteractionIndex: 0, error: null };
          await localStorageStore.set('gameRecordingActive', false);
          await localStorageStore.set('recordingState', next);
        }
        await sessionStorageStore.set(RECORD_STATE_KEY, next);
        sendResponse(next);
      }).catch((err: any) => sendResponse({ error: String(err) }));
      return true;
    }

    // Record status & export
    if (message?.kind === 'record-status' && isAllowedOrigin) {
      sessionStorageStore.get(RECORD_STATE_KEY).then((state: any) => {
        sendResponse(state || { active: false, count: 0, interactionCount: 0 });
      }).catch(() => sendResponse({ active: false }));
      return true;
    }

    // Queue actions
    if (message?.kind === 'building-queue-action') {
      localStorageStore.get('buildingQueue').then((queue: any) => {
        let updated = queue;
        if (message.action === 'add') updated = buildingQueueService.addToQueue(queue, message.item);
        else if (message.action === 'remove') updated = buildingQueueService.removeFromQueue(queue, message.index);
        else if (message.action === 'clear') updated = buildingQueueService.clearQueue(queue);
        localStorageStore.set('buildingQueue', updated).then(() => sendResponse({ ok: true, queue: updated }));
      }).catch((err: any) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message?.kind === 'research-queue-action') {
      localStorageStore.get('researchQueue').then((queue: any) => {
        let updated = queue;
        if (message.action === 'add') updated = researchQueueService.addToQueue(queue, message.item);
        else if (message.action === 'remove') updated = researchQueueService.removeFromQueue(queue, message.index);
        else if (message.action === 'clear') updated = researchQueueService.clearQueue(queue);
        localStorageStore.set('researchQueue', updated).then(() => sendResponse({ ok: true, queue: updated }));
      }).catch((err: any) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    // Forwarding RPC to game tab
    if (
      [
        'refresh-rpc',
        'queue-rpc',
        'draft-action',
        'claim-rewards',
        'engine-ping',
        'engine-send-message',
        'campaign-raid',
        'craft-fragment',
        'craft-recipe'
      ].includes(message?.kind) &&
      isAllowedOrigin
    ) {
      forwardToGameTab(message).then((ok) => sendResponse({ ok }));
      return true;
    }

    // Tab Management
    if (message?.kind === 'open-tab') {
      cr.tabs?.create?.({ url: cr.runtime.getURL('popup.html') });
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  return {
    queryGameTabs,
    forwardToGameTab,
    handleApiRecord
  };
}
