if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

export interface BridgeSettings {
  interceptEnabled?: boolean;
}

export interface BridgeControlMessage {
  source: 'hwa-helper-config';
  kind: 'control';
  interceptEnabled: boolean;
  popupRpcEnabled: boolean;
  socketRefreshMode: string;
  recordingActive: boolean;
}

export function createControlPayload(
  settings: BridgeSettings | null,
  popupRpcEnabled: boolean,
  socketRefreshMode: string,
  recordingActive: boolean
): BridgeControlMessage | null {
  if (!settings) return null;
  return {
    source: 'hwa-helper-config',
    kind: 'control',
    interceptEnabled: settings.interceptEnabled !== false,
    popupRpcEnabled,
    socketRefreshMode,
    recordingActive
  };
}

export function createBridgeTimeoutManager() {
  const timers = new Set<any>();
  let invalidated = false;

  const bridgeTimeout = (callback: () => void, delay: number) => {
    if (invalidated) return null;
    const id = setTimeout(() => {
      timers.delete(id);
      if (!invalidated) callback();
    }, delay);
    timers.add(id);
    return id;
  };

  const clearBridgeTimeout = (id: any) => {
    clearTimeout(id);
    timers.delete(id);
  };

  const invalidate = () => {
    invalidated = true;
    for (const id of timers) {
      clearTimeout(id);
    }
    timers.clear();
  };

  return {
    timers,
    isInvalidated: () => invalidated,
    bridgeTimeout,
    clearBridgeTimeout,
    invalidate
  };
}

export default defineContentScript({
  matches: [
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  main() {
    let bridgeContextInvalidated = false;
    const { timers, bridgeTimeout, clearBridgeTimeout, invalidate } = createBridgeTimeoutManager();

    function handleContextInvalidated(error: any) {
      if (!bridgeContextInvalidated && error && String(error).includes('Extension context invalidated')) {
        bridgeContextInvalidated = true;
        invalidate();
      }
    }

    function sendBridgeMessage(message: any) {
      if (bridgeContextInvalidated) return Promise.resolve();
      try {
        return Promise.resolve(chrome.runtime.sendMessage(message)).catch((error) => {
          handleContextInvalidated(error);
        });
      } catch (error) {
        handleContextInvalidated(error);
        return Promise.resolve();
      }
    }

    let currentSettings: BridgeSettings | null = null;
    let popupRpcEnabled = false;
    let socketRefreshMode = 'piggyback';
    let recordingActive = false;

    function sendControl() {
      const payload = createControlPayload(currentSettings, popupRpcEnabled, socketRefreshMode, recordingActive);
      if (payload) {
        window.postMessage(payload, location.origin);
      }
    }

    window.addEventListener('message', (event) => {
      if (bridgeContextInvalidated) return;
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.source !== 'hwa-helper-api') return;
      if (event.data.kind === 'ready') return sendControl();

      if (event.data.kind === 'rpc-queue-status') {
        if (Number.isInteger(event.data.count) && event.data.count >= 0 && event.data.count <= 64) {
          sendBridgeMessage({ kind: 'rpc-queue-status', count: event.data.count });
        }
        return;
      }

      if (event.data.kind === 'api-record' && event.data.record) {
        sendBridgeMessage({ kind: 'api-record', record: event.data.record });
        return;
      }
    });

    // Listen to storage changes to update control configs
    try {
      chrome.storage?.local?.get?.(
        ['captureSettings', 'popupRpcEnabled', 'socketRefreshMode', 'recordingState'],
        (res: any) => {
          if (res?.captureSettings) currentSettings = res.captureSettings;
          if (res?.popupRpcEnabled !== undefined) popupRpcEnabled = Boolean(res.popupRpcEnabled);
          if (res?.socketRefreshMode) socketRefreshMode = res.socketRefreshMode;
          if (res?.recordingState?.active !== undefined) recordingActive = Boolean(res.recordingState.active);
          sendControl();
        }
      );

      chrome.storage?.onChanged?.addListener?.((changes: any, area: string) => {
        if (area !== 'local') return;
        let changed = false;
        if (changes.captureSettings) {
          currentSettings = changes.captureSettings.newValue;
          changed = true;
        }
        if (changes.popupRpcEnabled) {
          popupRpcEnabled = Boolean(changes.popupRpcEnabled.newValue);
          changed = true;
        }
        if (changes.socketRefreshMode) {
          socketRefreshMode = changes.socketRefreshMode.newValue;
          changed = true;
        }
        if (changes.recordingState) {
          recordingActive = Boolean(changes.recordingState.newValue?.active);
          changed = true;
        }
        if (changed) sendControl();
      });
    } catch (err) {
      handleContextInvalidated(err);
    }
  }
});
