/**
 * Tier 3: Background Service Worker Native Messaging Manager.
 * Connects to Windows Native Messaging Host 'com.local.wxt_unity_bridge',
 * handles auto-reconnect, forwards telemetry logs to the host,
 * and routes live hot-tweak & chain commands from the host back to the active game tab.
 */

const NATIVE_HOST_NAME = 'com.local.wxt_unity_bridge';
const RECONNECT_DELAY_MS = 5000;

let nativePort: chrome.runtime.Port | null = null;
let isConnecting = false;
let reconnectTimer: any = null;
let lastActiveGameTabId: number | null = null;
let isSetup = false;

function getChromeRuntime(): typeof chrome | null {
  if (typeof chrome !== 'undefined' && chrome.runtime) return chrome;
  if (typeof (globalThis as any).chrome !== 'undefined') return (globalThis as any).chrome;
  return null;
}

/**
 * Finds the currently active or connected Hero Wars tab
 */
async function findGameTabId(): Promise<number | null> {
  const cr = getChromeRuntime();
  if (!cr?.tabs) return lastActiveGameTabId;

  // Try last known active game tab if still valid
  if (lastActiveGameTabId) {
    try {
      const tab = await cr.tabs.get(lastActiveGameTabId);
      if (tab?.id) return tab.id;
    } catch (_) {
      lastActiveGameTabId = null;
    }
  }

  // Query active tab in current window
  try {
    const [activeTab] = await cr.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && activeTab.url && isHeroWarsUrl(activeTab.url)) {
      lastActiveGameTabId = activeTab.id;
      return activeTab.id;
    }
  } catch (_) {}

  // Query any open Hero Wars tab
  try {
    const tabs = await cr.tabs.query({
      url: [
        'https://*.hero-wars-alliance.com/*',
        'https://hero-wars-alliance.com/*'
      ]
    });
    for (const tab of tabs) {
      if (tab.id) {
        lastActiveGameTabId = tab.id;
        return tab.id;
      }
    }
  } catch (_) {}

  return null;
}

function isHeroWarsUrl(url: string): boolean {
  return /hero-wars-alliance\.com/i.test(url);
}

/**
 * Strips Content Security Policy response headers on Hero Wars in debug bridge mode
 */
async function setupCspBypass() {
  const cr = getChromeRuntime();
  if (!cr?.declarativeNetRequest?.updateSessionRules) return;
  try {
    await cr.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [9876],
      addRules: [
        {
          id: 9876,
          priority: 1,
          action: {
            type: 'modifyHeaders' as any,
            responseHeaders: [
              { header: 'content-security-policy', operation: 'remove' as any },
              { header: 'content-security-policy-report-only', operation: 'remove' as any },
            ],
          },
          condition: {
            urlFilter: '*hero-wars-alliance.com*',
            resourceTypes: ['main_frame' as any, 'sub_frame' as any],
          },
        },
      ],
    });
  } catch (_) {}
}

/**
 * Connects to the Native Messaging Host
 */
export function connectNativeHost() {
  const cr = getChromeRuntime();
  if (!cr?.runtime?.connectNative) return;
  if (nativePort || isConnecting) return;

  isConnecting = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    nativePort = cr.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener(async (msg: any) => {
      await handleHostMessage(msg);
    });

    nativePort.onDisconnect.addListener(() => {
      const error = cr.runtime.lastError?.message;
      nativePort = null;
      isConnecting = false;
      scheduleReconnect(error);
    });

    isConnecting = false;

    // Send initial handshake
    try {
      nativePort.postMessage({
        type: 'tab_ready',
        timestamp: new Date().toISOString(),
        tabId: lastActiveGameTabId
      });
    } catch (_) {}
  } catch (err: any) {
    nativePort = null;
    isConnecting = false;
    scheduleReconnect(err?.message);
  }
}

function scheduleReconnect(_reason?: string) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, RECONNECT_DELAY_MS);
}

/**
 * Handles incoming messages from Native Host (e.g. POST /eval, POST /chain)
 */
async function handleHostMessage(msg: any) {
  if (!msg || typeof msg !== 'object') return;

  const targetTabId = await findGameTabId();
  const cr = getChromeRuntime();

  if (msg.type === 'reload_tab' && msg.id) {
    if (!targetTabId || !cr?.tabs?.reload) {
      sendToHost({
        type: 'reload_result',
        id: msg.id,
        ok: false,
        error: 'No active Hero Wars tab found in Chrome.'
      });
      return;
    }

    try {
      cr.tabs.reload(targetTabId, { bypassCache: false }, () => {
        if (cr.runtime?.lastError) {
          sendToHost({
            type: 'reload_result',
            id: msg.id,
            ok: false,
            tabId: targetTabId,
            error: cr.runtime.lastError.message
          });
        } else {
          sendToHost({
            type: 'reload_result',
            id: msg.id,
            ok: true,
            tabId: targetTabId
          });
        }
      });
    } catch (err: any) {
      sendToHost({
        type: 'reload_result',
        id: msg.id,
        ok: false,
        tabId: targetTabId,
        error: err?.message || String(err)
      });
    }
    return;
  }

  if (msg.type === 'eval' && msg.id) {
    if (!targetTabId || !cr?.tabs) {
      sendToHost({
        type: 'eval_result',
        id: msg.id,
        ok: false,
        error: 'No active Hero Wars tab found in Chrome.'
      });
      return;
    }

    try {
      cr.tabs.sendMessage(
        targetTabId,
        {
          kind: 'unity-debug-bridge-eval',
          id: msg.id,
          payload: msg.payload
        },
        (_response) => {
          if (cr.runtime.lastError) {
            sendToHost({
              type: 'eval_result',
              id: msg.id,
              ok: false,
              error: cr.runtime.lastError.message
            });
          }
        }
      );
    } catch (err: any) {
      sendToHost({
        type: 'eval_result',
        id: msg.id,
        ok: false,
        error: err?.message || String(err)
      });
    }
    return;
  }

  if (msg.type === 'chain' && msg.id) {
    if (!targetTabId || !cr?.tabs) {
      sendToHost({
        type: 'chain_result',
        id: msg.id,
        ok: false,
        error: 'No active Hero Wars tab found in Chrome.'
      });
      return;
    }

    try {
      cr.tabs.sendMessage(
        targetTabId,
        {
          kind: 'unity-debug-bridge-chain',
          id: msg.id,
          payload: msg.payload
        },
        (_response) => {
          if (cr.runtime.lastError) {
            sendToHost({
              type: 'chain_result',
              id: msg.id,
              ok: false,
              error: cr.runtime.lastError.message
            });
          }
        }
      );
    } catch (err: any) {
      sendToHost({
        type: 'chain_result',
        id: msg.id,
        ok: false,
        error: err?.message || String(err)
      });
    }
  }
}

/**
 * Sends a message from Background to Native Host
 */
export function sendToHost(message: Record<string, any>): boolean {
  if (!nativePort) {
    connectNativeHost();
    return false;
  }
  try {
    nativePort.postMessage(message);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Initializes the Tier 3 Background Service Worker bridge runtime
 */
export function setupDebugBridge() {
  if (isSetup) return;
  isSetup = true;

  const cr = getChromeRuntime();
  if (!cr?.runtime) return;

  // Connect native host immediately
  connectNativeHost();

  // Strip page CSP in debug mode to allow arbitrary code eval via bridge
  setupCspBypass();

  // Listen to messages from content scripts
  cr.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender) => {
    if (sender.tab?.id) {
      lastActiveGameTabId = sender.tab.id;
    }

    if (message?.kind === 'unity-debug-bridge-tab-ready') {
      if (sender.tab?.id) lastActiveGameTabId = sender.tab.id;
      connectNativeHost();
      sendToHost({
        type: 'tab_ready',
        tabId: lastActiveGameTabId,
        url: sender.tab?.url
      });
      return;
    }

    if (message?.kind === 'unity-debug-bridge-log') {
      sendToHost({
        type: 'log',
        tag: message.tag,
        data: message.data,
        timestamp: message.timestamp,
        tabId: sender.tab?.id || lastActiveGameTabId
      });
      return;
    }

    if (message?.kind === 'unity-debug-bridge-eval-result') {
      sendToHost({
        type: 'eval_result',
        id: message.id,
        ok: message.ok,
        result: message.result,
        error: message.error,
        stack: message.stack
      });
      return;
    }

    if (message?.kind === 'unity-debug-bridge-chain-result') {
      sendToHost({
        type: 'chain_result',
        id: message.id,
        ok: message.ok,
        results: message.results,
        error: message.error
      });
      return;
    }
  });

  // Track tab activations
  cr.tabs?.onActivated?.addListener?.((activeInfo: chrome.tabs.TabActiveInfo) => {
    cr.tabs.get(activeInfo.tabId, (tab) => {
      if (tab?.url && isHeroWarsUrl(tab.url)) {
        lastActiveGameTabId = tab.id ?? null;
      }
    });
  });
}
