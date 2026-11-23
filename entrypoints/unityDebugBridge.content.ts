/**
 * Entrypoint: Unity Debug Bridge Content Script (ISOLATED World).
 * Serves as Tier 2 bi-directional message relay between:
 * - MAIN World (window.postMessage)
 * - Background Service Worker (browser.runtime.sendMessage / chrome.runtime.onMessage)
 */

if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

import {
  UNITY_BRIDGE_NAMESPACE_FROM_MAIN,
  UNITY_BRIDGE_NAMESPACE_TO_MAIN
} from '../src/utils/unityDebugBridge.ts';

export function installContentDebugBridge() {
  if (typeof window === 'undefined') return;

  const cr = typeof chrome !== 'undefined' ? chrome : (globalThis as any).chrome;
  if (!cr?.runtime) return;

  // 1. Notify background runtime that this game tab is ready
  try {
    cr.runtime.sendMessage({ kind: 'unity-debug-bridge-tab-ready' }).catch?.(() => {});
  } catch (_) {}

  // 2. Listen to messages from MAIN World (logs, eval responses, chain responses) and relay to Background
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || !event.data || event.data.source !== UNITY_BRIDGE_NAMESPACE_FROM_MAIN) {
      return;
    }

    // Forward log to background
    if (event.data.type === 'log') {
      try {
        cr.runtime.sendMessage({
          kind: 'unity-debug-bridge-log',
          tag: event.data.tag,
          data: event.data.data,
          timestamp: event.data.timestamp || new Date().toISOString()
        }).catch?.(() => {});
      } catch (_) {}
      return;
    }

    // Forward chain result to background
    if (event.data.id && event.data.action === 'chain_result') {
      try {
        cr.runtime.sendMessage({
          kind: 'unity-debug-bridge-chain-result',
          id: event.data.id,
          ok: event.data.ok,
          results: event.data.results,
          error: event.data.error || null
        }).catch?.(() => {});
      } catch (_) {}
      return;
    }

    // Forward eval response to background
    if (event.data.id && typeof event.data.ok === 'boolean') {
      try {
        cr.runtime.sendMessage({
          kind: 'unity-debug-bridge-eval-result',
          id: event.data.id,
          ok: event.data.ok,
          result: event.data.result,
          error: event.data.error || null,
          stack: event.data.stack || null
        }).catch?.(() => {});
      } catch (_) {}
      return;
    }
  });

  // 3. Listen to commands from Background Service Worker and relay to MAIN World
  try {
    cr.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (resp: any) => void) => {
      if (message?.kind === 'unity-debug-bridge-eval') {
        window.postMessage(
          {
            source: UNITY_BRIDGE_NAMESPACE_TO_MAIN,
            id: message.id,
            action: 'eval',
            payload: message.payload
          },
          '*'
        );
        sendResponse({ received: true });
        return true;
      }

      if (message?.kind === 'unity-debug-bridge-chain') {
        window.postMessage(
          {
            source: UNITY_BRIDGE_NAMESPACE_TO_MAIN,
            id: message.id,
            action: 'chain',
            payload: message.payload
          },
          '*'
        );
        sendResponse({ received: true });
        return true;
      }
    });
  } catch (_) {}
}

export default defineContentScript({
  matches: [
    'https://*.hero-wars-alliance.com/*',
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  main() {
    if (import.meta.env.VITE_DEBUG_BRIDGE === 'true') {
      installContentDebugBridge();
    }
  }
});
