import { rpcCacheService } from '../src/core/cache/index.ts';
import { buildingQueueService } from '../src/services/queues/buildingQueue.ts';
import researchQueueService from '../src/services/queues/researchQueue.ts';
import raidQueueService from '../src/services/queues/raidQueue.ts';
import monsterQueueService from '../src/services/queues/monsterQueue.ts';
import raidEnergyAutoService from '../src/services/queues/raidEnergyAuto.ts';
import autoGatherService from '../src/services/queues/autoGather.ts';
import smartGatherService from '../src/services/queues/smartGather.ts';
import towerAutomationService from '../src/services/queues/towerAutomation.ts';
import towerRunnerService from '../src/services/queues/towerRunner.ts';
import dungeonAutomationService from '../src/services/queues/dungeonAutomation.ts';
import dungeonRunnerService from '../src/services/queues/dungeonRunner.ts';
import { speedupService } from '../src/services/speedupService.ts';
import { freeAlchemyPolicy } from '../src/services/freeAlchemy.ts';
import { mailService } from '../src/services/mailService.ts';
import { mineDefenseService } from '../src/services/mineDefense.ts';
import { worldReadService } from '../src/services/worldReadService.ts';

export const RECORD_STATE_KEY = 'recordingState';
export const GAME_ORIGINS = ['https://www.hero-wars-alliance.com', 'https://hero-wars-alliance.com'];

export function isGameUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  return GAME_ORIGINS.some((origin) => url.startsWith(`${origin}/`) || url === origin) || url.includes('hero-wars-alliance.com');
}

if (typeof (globalThis as any).defineBackground === 'undefined') {
  (globalThis as any).defineBackground = (fn: () => void) => fn;
}

export default defineBackground(() => {
  // Ensure typed services are registered onto globalThis for backwards compatibility
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).hwaHelperRpcCache = rpcCacheService;
    (globalThis as any).hwaHelperBuildingQueue = buildingQueueService;
    (globalThis as any).hwaHelperResearchQueue = researchQueueService;
    (globalThis as any).hwaHelperRaidQueue = raidQueueService;
    (globalThis as any).hwaHelperMonsterQueue = monsterQueueService;
    (globalThis as any).hwaHelperRaidEnergyAuto = raidEnergyAutoService;
    (globalThis as any).hwaHelperAutoGather = autoGatherService;
    (globalThis as any).hwaHelperSmartGather = smartGatherService;
    (globalThis as any).hwaHelperTowerAutomation = towerAutomationService;
    (globalThis as any).hwaHelperTowerRunner = towerRunnerService;
    (globalThis as any).hwaHelperDungeonAutomation = dungeonAutomationService;
    (globalThis as any).hwaHelperDungeonRunner = dungeonRunnerService;
    (globalThis as any).hwaHelperSpeedup = speedupService;
    (globalThis as any).hwaHelperFreeAlchemy = freeAlchemyPolicy;
    (globalThis as any).hwaHelperMailData = mailService;
    (globalThis as any).hwaHelperMineDefense = mineDefenseService;
    (globalThis as any).hwaHelperWorldRead = worldReadService;
  }

  // Routine storage optimization on worker startup
  try {
    chrome.storage.local.get('rpcCache').then((stored) => {
      if (stored?.rpcCache) {
        const pruned = rpcCacheService.pruneCache(stored.rpcCache);
        if (pruned.changed) {
          chrome.storage.local.set({ rpcCache: pruned.cache });
        }
      }
    }).catch(() => {});
  } catch (_) {}

  // Message router
  chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    const isExtensionSender = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    const isGameSender = isGameUrl(sender.url);
    const isAllowedOrigin = isExtensionSender || isGameSender;

    // Recording controls
    const recordKinds = ['record-start', 'record-stop', 'record-clear', 'start-recording', 'stop-recording'];
    if (recordKinds.includes(message?.kind) && isAllowedOrigin) {
      let mappedKind = message.kind;
      if (mappedKind === 'start-recording') mappedKind = 'record-start';
      if (mappedKind === 'stop-recording') mappedKind = 'record-stop';

      chrome.storage.session.get(RECORD_STATE_KEY).then((stored) => {
        const state = stored[RECORD_STATE_KEY] || { active: false, nextIndex: 0 };
        let next = { ...state };
        if (mappedKind === 'record-start') {
          next = { active: true, nextIndex: 0, nextInteractionIndex: 0, error: null };
          chrome.storage.local.set({ gameRecordingActive: true, recordingState: next });
        } else if (mappedKind === 'record-stop') {
          next = { ...state, active: false };
          chrome.storage.local.set({ gameRecordingActive: false, recordingState: next });
        } else if (mappedKind === 'record-clear') {
          next = { active: false, nextIndex: 0, nextInteractionIndex: 0, error: null };
          chrome.storage.local.set({ gameRecordingActive: false, recordingState: next });
        }
        chrome.storage.session.set({ [RECORD_STATE_KEY]: next }).then(() => {
          sendResponse(next);
        });
      }).catch((err) => sendResponse({ error: String(err) }));
      return true;
    }

    // Ping / Status check
    if (message?.kind === 'ping') {
      sendResponse({ ok: true, version: chrome.runtime.getManifest()?.version });
      return true;
    }

    return false;
  });
});
