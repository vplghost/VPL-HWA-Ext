if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

import type {
  BridgeSettings,
  BridgeControlMessage
} from '../src/content/bridge.ts';
import {
  createControlPayload,
  createBridgeTimeoutManager,
  installBridge
} from '../src/content/bridge.ts';

export type { BridgeSettings, BridgeControlMessage };
export { createControlPayload, createBridgeTimeoutManager };

export default defineContentScript({
  matches: [
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  main() {
    installBridge(typeof window !== 'undefined' ? window : null);
  }
});
