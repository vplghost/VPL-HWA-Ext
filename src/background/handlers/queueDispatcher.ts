/**
 * Modular Queue Dispatcher (`queueDispatcher.ts`).
 * Registers all automation queues onto `RuntimeEventBus` so every record in an
 * `api-record-batch` is processed sequentially with live hot cache.
 */
import type { RuntimeEventBus, RuntimeDispatchContext } from '../eventBus.ts';

export interface QueueDispatchTargets {
  updateRaidQueue: (record: any, tabId: number, cr: any, liveCache?: Record<string, any>) => Promise<any>;
  updateMonsterQueue: (record: any, tabId: number, cr: any, liveCache?: Record<string, any>) => Promise<any>;
  updateTowerRun: (record: any, tabId: number, cr: any) => Promise<any>;
  updateDungeonRun: (record: any, tabId: number, cr: any) => Promise<any>;
  advanceBuildingQueue: (tabId: number, record: any, cr: any) => Promise<any>;
  advanceResearchQueue: (tabId: number, record: any, cr: any) => Promise<any>;
}

export function registerQueueListeners(
  bus: RuntimeEventBus,
  targets: QueueDispatchTargets
): () => void {
  return bus.on('record:ingested', async (record: any, ctx: RuntimeDispatchContext) => {
    if (!ctx.tabId) return;
    await targets.updateRaidQueue(record, ctx.tabId, ctx.chrome, ctx.liveCache);
    await targets.updateMonsterQueue(record, ctx.tabId, ctx.chrome, ctx.liveCache);
    await targets.updateTowerRun(record, ctx.tabId, ctx.chrome);
    await targets.updateDungeonRun(record, ctx.tabId, ctx.chrome);
    await targets.advanceBuildingQueue(ctx.tabId, record, ctx.chrome);
    await targets.advanceResearchQueue(ctx.tabId, record, ctx.chrome);
  });
}
