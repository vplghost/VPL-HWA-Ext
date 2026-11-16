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
  // Setup standardized background runtime orchestrator
  setupBackgroundRuntime();
});
