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
import {
  isGameUrl,
  setupBackgroundRuntime
} from '../src/background/backgroundRuntime.ts';

export const RECORD_STATE_KEY = 'recordingState';
export { isGameUrl };

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

  // Setup standardized background runtime orchestrator
  setupBackgroundRuntime();
});
