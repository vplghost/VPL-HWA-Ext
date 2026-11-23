/**
 * Entrypoint: Unity Debug Bridge Main World Script (MAIN world).
 * Automatically initializes window.__unityBridge in MAIN world context
 * when VITE_DEBUG_BRIDGE is enabled.
 */

if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

import { initUnityMainBridge } from '../src/utils/unityDebugBridge.ts';

export default defineContentScript({
  matches: [
    'https://*.hero-wars-alliance.com/*',
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (import.meta.env.VITE_DEBUG_BRIDGE === 'true') {
      initUnityMainBridge();
    }
  }
});
