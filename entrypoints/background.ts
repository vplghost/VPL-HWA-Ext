import {
  isGameUrl,
  setupBackgroundRuntime
} from '../src/background/backgroundRuntime.ts';

export const RECORD_STATE_KEY = 'recordingState';
export { isGameUrl };

if (typeof (globalThis as any).defineBackground === 'undefined') {
  (globalThis as any).defineBackground = (fn: () => void) => fn;
}

export default defineBackground(async () => {
  // Ensure default Direct RPC mode and enabled settings on startup
  try {
    const cr = typeof chrome !== 'undefined' ? chrome : (globalThis as any).chrome;
    const stored = await cr?.storage?.local?.get(['socketRefreshMode', 'popupRpcEnabled', 'captureSettings']);
    const updates: Record<string, any> = {};
    if (!stored?.socketRefreshMode || stored.socketRefreshMode === 'piggyback') {
      updates.socketRefreshMode = 'direct';
    }
    if (stored?.popupRpcEnabled === undefined || stored.popupRpcEnabled === false) {
      updates.popupRpcEnabled = true;
    }
    if (!stored?.captureSettings) {
      updates.captureSettings = { interceptEnabled: true };
    }
    if (Object.keys(updates).length > 0) {
      await cr?.storage?.local?.set(updates);
    }
  } catch (_) {}

  // Setup standardized background runtime orchestrator
  setupBackgroundRuntime();
});
