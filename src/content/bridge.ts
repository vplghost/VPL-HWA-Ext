/**
 * Standardized TypeScript Bridge for HWA Helper.
 * Handles isolated-world content script duties:
 * - Window <-> Background runtime messaging
 * - Telemetry & Interaction recording
 * - Wake timer coordination for MV3 service worker
 * - Quick UI button injection (Helper open, Record, Export, Clear)
 */

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
  recordingActive: boolean): BridgeControlMessage | null {
  if (!settings) return null;
  const payload: BridgeControlMessage = {
    source: 'hwa-helper-config',
    kind: 'control',
    interceptEnabled: settings.interceptEnabled !== false,
    popupRpcEnabled,
    socketRefreshMode,
    recordingActive
  };
  return payload;
}

export function createBridgeTimeoutManager(customWin?: any) {
  const timers = new Set<any>();
  let invalidated = false;

  const setTimer = (fn: (...args: any[]) => void, ms: number) => {
    if (customWin && typeof customWin.setTimeout === 'function') {
      return customWin.setTimeout(fn, ms);
    }
    const timer = setTimeout(fn, ms);
    if (typeof (timer as any)?.unref === 'function') (timer as any).unref();
    return timer;
  };

  const clearTimer = (id: any) => {
    if (customWin && typeof customWin.clearTimeout === 'function') {
      return customWin.clearTimeout(id);
    }
    clearTimeout(id);
  };

  const bridgeTimeout = (callback: () => void, delay: number) => {
    if (invalidated) return null;
    let id: any = null;
    id = setTimer(() => {
      timers.delete(id);
      if (!invalidated) callback();
    }, delay);
    timers.add(id);
    return id;
  };

  const clearBridgeTimeout = (id: any) => {
    clearTimer(id);
    timers.delete(id);
  };

  const invalidate = () => {
    invalidated = true;
    for (const id of Array.from(timers)) {
      clearTimer(id);
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

export function installBridge(customWindow: any = typeof window !== 'undefined' ? window : null) {
  if (!customWindow) return;

  const win = customWindow;
  const doc = win.document;
  const timeoutManager = createBridgeTimeoutManager(win);
  let bridgeContextInvalidated = false;
  const pendingRpcRequests = new Map<string, { resolve: (resp: any) => void; timeout: any }>();
  const getNow = () => (typeof win.Date?.now === 'function' ? win.Date.now() : Date.now());

  function handleContextInvalidated(err: any, notifyUser = true) {
    if (err?.message?.includes('Extension context invalidated') || String(err).includes('Extension context invalidated')) {
      bridgeContextInvalidated = true;
      timeoutManager.invalidate();
      for (const req of pendingRpcRequests.values()) {
        try { clearTimeout(req.timeout); req.resolve({ ok: false, error: 'Extension context invalidated.' }); } catch (_) {}
      }
      pendingRpcRequests.clear();
      if (!notifyUser) return;
      const notify = typeof win.alert === 'function' ? win.alert : console.warn;
      notify('HWA Helper extension was updated or reloaded. Please refresh this game page to reconnect.');
    }
  }

  function sendBridgeMessage(message: any): Promise<any> {
    if (bridgeContextInvalidated) return Promise.resolve();
    try {
      const p = win.chrome?.runtime?.sendMessage?.(message);
      if (p && typeof p.then === 'function') {
        return p.catch((error: any) => {
          handleContextInvalidated(error, false);
          return Promise.reject(error);
        });
      }
      return Promise.resolve(p);
    } catch (error) {
      handleContextInvalidated(error, false);
      return Promise.resolve();
    }
  }

  function readLocal(keys: string | string[]): Promise<any> {
    try {
      const p = win.chrome?.storage?.local?.get?.(keys);
      if (p && typeof p.then === 'function') {
        return p;
      }
    } catch (err) {
      handleContextInvalidated(err, false);
    }
    return Promise.resolve({});
  }

  let currentSettings: BridgeSettings = { interceptEnabled: true };
  let popupRpcEnabled = false;
  let socketRefreshMode = 'direct';
  let recordingActive = false;
  let recordingStateObserved = false;
  let freeSpinAccountId: string | null = null;

  function sendControl() {
    if (!currentSettings) return;
    const payload = createControlPayload(currentSettings, popupRpcEnabled, socketRefreshMode, recordingActive);
    if (payload) {
      win.postMessage(payload, win.location?.origin || '*');
    }
  }

  function saveInteraction(entry: any) {
    try {
      const p = win.chrome?.runtime?.sendMessage?.({ kind: 'record-interaction', entry });
      p?.catch?.(() => {});
    } catch (_) {}
  }

  function interactionTarget(target: any): string {
    if (!target || typeof target !== 'object') return 'unknown';
    const tag = String(target.tagName || 'canvas').toLowerCase();
    const id = typeof target.id === 'string' ? target.id.slice(0, 80) : '';
    return `${tag}${id ? `#${id}` : ''}`;
  }

  function recordUiEvent(event: any) {
    if (!recordingActive || event.target?.closest?.('#hwa-helper-btn, #hwa-record-btn, #hwa-export-btn, #hwa-clear-btn')) return;
    const target = event.target;
    const entry: any = { timestamp: new Date().toISOString(), target: interactionTarget(target) };
    if (event.type === 'pointerdown') {
      Object.assign(entry, {
        category: 'pointer',
        action: 'pointerdown',
        x: event.clientX,
        y: event.clientY,
        button: event.button
      });
      const canvas = target?.closest?.('canvas') || (target?.tagName?.toLowerCase() === 'canvas' ? target : null);
      const rect = canvas?.getBoundingClientRect?.();
      if (rect?.width && rect?.height) {
        entry.canvasX = Math.round(((event.clientX - rect.left) / rect.width) * (canvas.width || rect.width));
        entry.canvasY = Math.round(((event.clientY - rect.top) / rect.height) * (canvas.height || rect.height));
      }
    } else if (event.type === 'wheel') {
      Object.assign(entry, { category: 'wheel', action: 'wheel', x: event.clientX, y: event.clientY, deltaY: event.deltaY });
    } else {
      if (target?.closest?.('input, textarea, [contenteditable]') || target?.isContentEditable) return;
      const key = String(event.key || '');
      if (key.length === 1) return;
      Object.assign(entry, { category: 'keyboard', action: 'keydown', key: key.slice(0, 40) });
    }
    saveInteraction(entry);
  }

  if (doc?.addEventListener) {
    doc.addEventListener('pointerdown', recordUiEvent, true);
    doc.addEventListener('keydown', recordUiEvent, true);
    doc.addEventListener('wheel', recordUiEvent, { capture: true, passive: true });
  }

  win.addEventListener('message', (event: MessageEvent) => {
    if (bridgeContextInvalidated) return;
    if (event.source !== win || event.origin !== win.location?.origin) return;
    if (event.data?.source !== 'hwa-helper-api') return;

    if (event.data.kind === 'ready') return sendControl();

    if (event.data.kind === 'rpc-queue-status') {
      if (Number.isInteger(event.data.count) && event.data.count >= 0 && event.data.count <= 64) {
        sendBridgeMessage({ kind: 'rpc-queue-status', count: event.data.count });
      }
      return;
    }

    if (event.data.kind === 'engine-status' && event.data.status) {
      try {
        const extensionVersion = win.chrome?.runtime?.getManifest?.()?.version;
        const status = extensionVersion ? { ...event.data.status, extensionVersion } : event.data.status;
        win.chrome?.storage?.local?.set?.({ gameEngineStatus: status });
      } catch (_) {}
      return;
    }


    if (event.data.kind === 'refresh-rpc-result') {
      try {
        win.chrome?.storage?.local?.set?.({
          lastRefreshRpcResult: {
            ok: event.data.ok === true,
            status: event.data.status || null,
            error: event.data.error || null,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (_) {}
      const reqId = event.data.requestId;
      if (reqId && pendingRpcRequests.has(reqId)) {
        const pending = pendingRpcRequests.get(reqId);
        pendingRpcRequests.delete(reqId);
        if (pending?.timeout) clearTimeout(pending.timeout);
        pending?.resolve?.({
          ok: event.data.ok === true,
          status: event.data.status || null,
          results: event.data.results || null,
          data: event.data.data || null,
          error: event.data.error || null
        });
      }
      return;
    }

    if (event.data.kind === 'claim-rpc-result') {
      try {
        win.chrome?.storage?.local?.set?.({
          claimRpcStatus: {
            state: event.data.ok === true ? 'complete' : 'failed',
            error: event.data.error || null,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (_) {}
      return;
    }

    if (event.data.kind === 'interaction-record') {
      if (recordingActive && event.data.entry) saveInteraction(event.data.entry);
      return;
    }

    if (event.data.kind !== 'api-record') return;

    try {
      const calls = JSON.parse(event.data.record?.requestBody || '{}').calls || [];
      const results = JSON.parse(event.data.record?.responseBody || '{}').results || [];
      for (const call of calls) {
        if (['userGetInfo', 'mobileLogin', 'user_getInfo', 'user_getClanInfo'].includes(call.name)) {
          const result = results.find((row: any) => row.ident === call.ident)?.result;
          const id = result?.response?.id ?? result?.response?.userId ?? result?.response?.user?.id;
          if (!result?.error && Number.isFinite(Number(id)) && Number(id) > 0) {
            freeSpinAccountId = String(id);
          }
        }
      }
    } catch (_) {}

    sendBridgeMessage({ kind: 'api-record', record: event.data.record });
  });

  // Background runtime listeners
  try {
    win.chrome?.runtime?.onMessage?.addListener?.((message: any, _sender: any, sendResponse: (resp: any) => void) => {
      if (bridgeContextInvalidated) return;
      if (message?.kind === 'free-spin-context' || message?.kind === 'game-account-context') {
        if (freeSpinAccountId) {
          sendResponse?.({ ok: true, accountId: freeSpinAccountId });
          return true;
        }
        try {
          win.chrome?.storage?.local?.get(['rpcCache'], (stored: any) => {
            const cachedAccountId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id;
            if (cachedAccountId) freeSpinAccountId = String(cachedAccountId);
            sendResponse?.({ ok: true, accountId: freeSpinAccountId || null });
          });
        } catch (_) {
          sendResponse?.({ ok: true, accountId: null });
        }
        return true;
      }
      if (message?.kind === 'drop-rpc-group') {
        win.postMessage({ source: 'hwa-helper-control', kind: message.kind, group: message.group }, win.location.origin);
        sendResponse?.({ ok: true });
        return true;
      }
      if (message?.kind === 'refresh-rpc') {
        const requestId = message.requestId || ('req_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        const timeout = setTimeout(() => {
          if (pendingRpcRequests.has(requestId)) {
            pendingRpcRequests.delete(requestId);
            sendResponse?.({ ok: false, error: 'RPC request timed out in content bridge.' });
          }
        }, 15000);
        pendingRpcRequests.set(requestId, { resolve: sendResponse, timeout });
        win.postMessage({
          source: 'hwa-helper-control',
          kind: message.kind,
          calls: message.calls,
          group: message.group,
          expiresAt: message.expiresAt,
          trackId: message.trackId,
          requestedAt: message.requestedAt,
          direct: message.direct,
          userAction: message.userAction,
          requestId
        }, win.location.origin);
        return true;
      }
      if (message?.kind === 'queue-rpc' || message?.kind === 'queue-claim') {
        win.postMessage({
          source: 'hwa-helper-control',
          kind: message.kind,
          calls: message.calls,
          group: message.group,
          expiresAt: message.expiresAt,
          trackId: message.trackId,
          requestedAt: message.requestedAt
        }, win.location.origin);
        sendResponse?.({ ok: true, queued: true });
        return true;
      }
      if (message?.kind === 'engine-ping') {
        win.postMessage({ source: 'hwa-helper-control', kind: 'engine-ping' }, win.location.origin);
        sendResponse?.({ ok: true });
        return true;
      }
      if (message?.kind === 'engine-send-message') {
        win.postMessage({
          source: 'hwa-helper-control',
          kind: 'engine-send-message',
          objectName: message.objectName,
          methodName: message.methodName,
          param: message.param
        }, win.location.origin);
        sendResponse?.({ ok: true });
        return true;
      }
    });
  } catch (_) {}

  // Timers and Wake schedulers
  let freeSpinTimer: any = null;
  let smartGatherTimer: any = null;
  let raidEnergyTimer: any = null;
  let raidWakeTimer: any = null;
  let monsterWakeTimer: any = null;
  let towerWakeTimer: any = null;
  let dungeonWakeTimer: any = null;
  let buildingWakeTimer: any = null;
  let researchWakeTimer: any = null;
  const raidEnergySession = getNow().toString(36) + '-' + Math.random().toString(36).slice(2);

  function scheduleFreeSpin(enabled: boolean, state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(freeSpinTimer);
    if (!enabled && !state?.pending) return;
    const wakeAt = Number.isFinite(state?.wakeAt) ? state.wakeAt : getNow() + 1000;
    freeSpinTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'free-spin-tick' }).catch((error: any) => handleContextInvalidated(error, false));
    }, Math.max(100, Math.min(2147483647, wakeAt - getNow())));
  }

  function scheduleSmartGather(settings: any, state?: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(smartGatherTimer);
    if (!settings?.enabled || !settings?.smartEnabled) return;
    const delay = Number.isFinite(state?.wakeAt) && state.wakeAt > getNow() ? Math.min(5000, Math.max(50, state.wakeAt - getNow())) : 5000;
    smartGatherTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'smart-gather-tick' }).catch((error: any) => handleContextInvalidated(error, false));
      scheduleSmartGather(settings);
    }, delay);
  }

  function scheduleRaidEnergy(enabled: boolean) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(raidEnergyTimer);
    if (!enabled) return;
    sendBridgeMessage({ kind: 'raid-energy-tick', sessionId: raidEnergySession }).catch((error: any) => handleContextInvalidated(error, false));
    raidEnergyTimer = timeoutManager.bridgeTimeout(() => scheduleRaidEnergy(true), 30000);
  }

  function scheduleRaidWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(raidWakeTimer);
    if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
    raidWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'raid-queue-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['raidQueue']).then((stored: any) => scheduleRaidWake(stored.raidQueue));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, Math.max(100, Math.min(2147483647, state.wakeAt - getNow())));
  }

  function scheduleMonsterWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(monsterWakeTimer);
    if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
    monsterWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'monster-queue-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['monsterQueue']).then((stored: any) => scheduleMonsterWake(stored.monsterQueue));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, Math.max(100, Math.min(2147483647, state.wakeAt - getNow())));
  }

  function scheduleTowerWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(towerWakeTimer);
    if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
    towerWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'tower-run-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['towerRun']).then((stored: any) => scheduleTowerWake(stored.towerRun));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, Math.max(100, Math.min(2147483647, state.wakeAt - getNow())));
  }

  function scheduleDungeonWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(dungeonWakeTimer);
    if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
    dungeonWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'dungeon-run-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['dungeonRun']).then((stored: any) => scheduleDungeonWake(stored.dungeonRun));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, Math.max(100, Math.min(2147483647, state.wakeAt - getNow())));
  }

  function scheduleBuildingWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(buildingWakeTimer);
    if (!state || state.enabled === false) return;
    const hasItems = Array.isArray(state.items) && state.items.length > 0;
    if (!Number.isFinite(state.wakeAt)) {
      if (hasItems) {
        buildingWakeTimer = timeoutManager.bridgeTimeout(() => {
          sendBridgeMessage({ kind: 'building-queue-tick' })
            .then((res: any) => {
              if (res?.watch) {
                return readLocal(['buildingQueue']).then((stored: any) => scheduleBuildingWake(stored.buildingQueue));
              }
            })
            .catch((error: any) => handleContextInvalidated(error, false));
        }, 100);
      }
      return;
    }
    const delay = Math.max(100, Math.min(2147483647, state.wakeAt - getNow()));
    buildingWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'building-queue-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['buildingQueue']).then((stored: any) => scheduleBuildingWake(stored.buildingQueue));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, delay);
  }

  function scheduleResearchWake(state: any) {
    if (bridgeContextInvalidated) return;
    timeoutManager.clearBridgeTimeout(researchWakeTimer);
    if (!state || state.enabled === false) return;
    const hasItems = Array.isArray(state.items) && state.items.length > 0;
    if (!Number.isFinite(state.wakeAt)) {
      if (hasItems) {
        researchWakeTimer = timeoutManager.bridgeTimeout(() => {
          sendBridgeMessage({ kind: 'research-queue-tick' })
            .then((res: any) => {
              if (res?.watch) {
                return readLocal(['researchQueue']).then((stored: any) => scheduleResearchWake(stored.researchQueue));
              }
            })
            .catch((error: any) => handleContextInvalidated(error, false));
        }, 100);
      }
      return;
    }
    const delay = Math.max(100, Math.min(2147483647, state.wakeAt - getNow()));
    researchWakeTimer = timeoutManager.bridgeTimeout(() => {
      sendBridgeMessage({ kind: 'research-queue-tick' })
        .then((res: any) => {
          if (res?.watch) {
            return readLocal(['researchQueue']).then((stored: any) => scheduleResearchWake(stored.researchQueue));
          }
        })
        .catch((error: any) => handleContextInvalidated(error, false));
    }, delay);
  }

  // Storage initialization and watcher
  sendControl();
  readLocal([
    'captureSettings',
    'popupRpcEnabled',
    'socketRefreshMode',
    'rpcCache',
    'autoFreeSpinEnabled',
    'autoFreeSpinState',
    'autoGatherSettings',
    'smartGatherState',
    'raidEnergyAuto',
    'raidQueue',
    'monsterQueue',
    'towerRun',
    'dungeonRun',
    'buildingQueue',
    'researchQueue',
    'gameEngineStatus'
  ]).then((stored: any) => {
    const currentExtVersion = win.chrome?.runtime?.getManifest?.()?.version;
    const hasCanvas = typeof doc?.querySelector === 'function' && Boolean(doc.querySelector('canvas#unity-canvas, canvas#canvas, canvas'));
    const existingStatus = stored?.gameEngineStatus || null;
    if (!existingStatus || existingStatus.extensionVersion !== currentExtVersion || (hasCanvas && !existingStatus.hasCanvas)) {
      win.chrome?.storage?.local?.set?.({
        gameEngineStatus: {
          ready: existingStatus?.ready || false,
          hasSendMessage: existingStatus?.hasSendMessage || false,
          hasCanvas: hasCanvas || existingStatus?.hasCanvas || false,
          hasRpcHeaders: existingStatus?.hasRpcHeaders || false,
          rpcUrlAvailable: existingStatus?.rpcUrlAvailable || false,
          detectedGlobals: existingStatus?.detectedGlobals || [],
          extensionVersion: currentExtVersion || existingStatus?.extensionVersion || null,
          updatedAt: new Date().toISOString(),
          reason: 'bridge-init'
        }
      });
    }

    if (stored?.captureSettings) currentSettings = { ...currentSettings, ...stored.captureSettings };
    if (stored?.popupRpcEnabled !== undefined) popupRpcEnabled = Boolean(stored.popupRpcEnabled);
    if (stored?.socketRefreshMode) socketRefreshMode = stored.socketRefreshMode === 'piggyback' ? 'piggyback' : 'direct';
    const cachedAccountId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id;
    if (cachedAccountId && !freeSpinAccountId) freeSpinAccountId = String(cachedAccountId);
    sendControl();

    scheduleFreeSpin(stored?.autoFreeSpinEnabled, stored?.autoFreeSpinState);
    scheduleSmartGather(stored?.autoGatherSettings, stored?.smartGatherState);
    scheduleRaidEnergy(stored?.raidEnergyAuto?.enabled === true);
    scheduleRaidWake(stored?.raidQueue);
    scheduleMonsterWake(stored?.monsterQueue);
    scheduleTowerWake(stored?.towerRun);
    scheduleDungeonWake(stored?.dungeonRun);
    scheduleBuildingWake(stored?.buildingQueue);
    scheduleResearchWake(stored?.researchQueue);
  }).catch((err: any) => handleContextInvalidated(err, false));

  try {
    win.chrome?.storage?.onChanged?.addListener?.((changes: any, area: string) => {
      if (bridgeContextInvalidated || area !== 'local') return;
      if ('gameRecordingActive' in changes) {
        recordingStateObserved = true;
        const next = changes.gameRecordingActive.newValue === true;
        if (recordingActive !== next) {
          recordingActive = next;
          sendControl();
        }
      }
      if ('rpcCache' in changes) {
        const cachedAccountId = changes.rpcCache.newValue?.accountStatus?.data?.id ?? changes.rpcCache.newValue?.userGetInfo?.data?.id;
        if (cachedAccountId) freeSpinAccountId = String(cachedAccountId);
      }
      if ('autoFreeSpinEnabled' in changes || 'autoFreeSpinState' in changes) {
        readLocal(['autoFreeSpinEnabled', 'autoFreeSpinState']).then((res: any) => scheduleFreeSpin(res.autoFreeSpinEnabled, res.autoFreeSpinState));
      }
      if ('raidEnergyAuto' in changes) scheduleRaidEnergy(changes.raidEnergyAuto.newValue?.enabled === true);
      if ('autoGatherSettings' in changes || 'smartGatherState' in changes) {
        readLocal(['autoGatherSettings', 'smartGatherState']).then((res: any) => scheduleSmartGather(res.autoGatherSettings, res.smartGatherState));
      }
      if ('raidQueue' in changes) scheduleRaidWake(changes.raidQueue.newValue);
      if ('monsterQueue' in changes) scheduleMonsterWake(changes.monsterQueue.newValue);
      if ('towerRun' in changes) scheduleTowerWake(changes.towerRun.newValue);
      if ('dungeonRun' in changes) scheduleDungeonWake(changes.dungeonRun.newValue);
      if ('buildingQueue' in changes) scheduleBuildingWake(changes.buildingQueue.newValue);
      if ('researchQueue' in changes) scheduleResearchWake(changes.researchQueue.newValue);

      let configChanged = false;
      if ('captureSettings' in changes) {
        currentSettings = changes.captureSettings.newValue || {};
        configChanged = true;
      }
      if ('popupRpcEnabled' in changes) {
        popupRpcEnabled = changes.popupRpcEnabled.newValue === true;
        configChanged = true;
      }
      if ('socketRefreshMode' in changes) {
        socketRefreshMode = changes.socketRefreshMode.newValue === 'piggyback' ? 'piggyback' : 'direct';
        configChanged = true;
      }
      if (configChanged) sendControl();
    });
  } catch (err) {
    handleContextInvalidated(err);
  }

  // Quick Action Buttons
  function injectHelperButtons() {
    if (!doc || doc.getElementById('hwa-helper-btn')) return;

    const btn = doc.createElement('button');
    btn.id = 'hwa-helper-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open HWA Helper in new tab');
    btn.title = 'Open HWA Helper in new tab';
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/></svg><span>HWA Helper</span>';
    btn.addEventListener('click', () => {
      try {
        const p = win.chrome?.runtime?.sendMessage?.({ kind: 'open-tab' });
        if (p && typeof p.then === 'function') {
          p.catch((err: any) => handleContextInvalidated(err, true));
        }
      } catch (err) {
        handleContextInvalidated(err, true);
      }
    });

    const recordBtn = doc.createElement('button');
    recordBtn.id = 'hwa-record-btn';
    recordBtn.type = 'button';
    recordBtn.className = 'hwa-icon-btn';
    recordBtn.setAttribute('aria-label', 'Record game activity');
    recordBtn.title = 'Record game activity';
    recordBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><circle cx="12" cy="12" r="9"/></svg>';

    const exportBtn = doc.createElement('button');
    exportBtn.id = 'hwa-export-btn';
    exportBtn.type = 'button';
    exportBtn.className = 'hwa-icon-btn';
    exportBtn.setAttribute('aria-label', 'Export game activity JSON');
    exportBtn.title = 'Export game activity JSON';
    exportBtn.hidden = true;
    if (exportBtn.style) exportBtn.style.display = 'none';
    exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';

    const clearBtn = doc.createElement('button');
    clearBtn.id = 'hwa-clear-btn';
    clearBtn.type = 'button';
    clearBtn.className = 'hwa-icon-btn';
    clearBtn.setAttribute('aria-label', 'Clear game activity log');
    clearBtn.title = 'Clear game activity log';
    clearBtn.hidden = true;
    if (clearBtn.style) clearBtn.style.display = 'none';
    clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';

    let isRecording = false;

    async function syncRecordingState() {
      try {
        const res = await sendBridgeMessage({ kind: 'record-status' });
        if (!res) return;
        isRecording = Boolean(res.active);
        if (recordingActive !== isRecording) {
          recordingActive = isRecording;
          sendControl();
        }
        const count = Number(res.count || 0);
        const interactionCount = Number(res.interactionCount || 0);
        recordBtn.innerHTML = isRecording
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg><span class="hwa-rec-dot"></span>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><circle cx="12" cy="12" r="9"/></svg>';
        const hasRecords = count + interactionCount > 0;
        exportBtn.hidden = !hasRecords;
        clearBtn.hidden = !hasRecords;
        if (exportBtn.style) exportBtn.style.display = hasRecords ? 'inline-flex' : 'none';
        if (clearBtn.style) clearBtn.style.display = hasRecords ? 'inline-flex' : 'none';
      } catch (_) {}
    }

    recordBtn.addEventListener('click', () => {
      const nextKind = isRecording ? 'record-stop' : 'record-start';
      sendBridgeMessage({ kind: nextKind }).then(syncRecordingState);
    });

    exportBtn.addEventListener('click', () => {
      try {
        const p = win.chrome?.runtime?.sendMessage?.({ kind: 'record-export' });
        if (p && typeof p.then === 'function') {
          p.then((res: any) => {
            const records = res?.records || [];
            const interactions = res?.interactions || [];
            const BlobConstructor = win.Blob || (typeof Blob !== 'undefined' ? Blob : null);
            const UrlConstructor = win.URL || (typeof URL !== 'undefined' ? URL : null);
            if ((!records.length && !interactions.length) || !BlobConstructor || !UrlConstructor) return;
            const timeline = [
              ...records.map((record: any) => ({ kind: 'api', ...record })),
              ...interactions.map((entry: any) => ({ kind: 'interaction', ...entry }))
            ].sort((a: any, b: any) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
            const extensionVersion = win.chrome?.runtime?.getManifest?.()?.version || res?.extensionVersion || null;
            let gameVersion = res?.gameVersion || null;
            if (!gameVersion) {
              try {
                const storage = win.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
                if (storage) {
                  gameVersion = storage.getItem('hwa_game_version');
                  if (!gameVersion) {
                    const stored = storage.getItem('hwa_last_rpc_headers');
                    if (stored) {
                      const h = JSON.parse(stored);
                      const k = Object.keys(h).find((key) => key.toLowerCase() === 'x-application-version');
                      if (k) gameVersion = h[k];
                    }
                  }
                }
              } catch (_) {}
            }
            if (!gameVersion) {
              for (const item of records) {
                if (item.responseBody && item.responseBody.includes('"version"')) {
                  try {
                    const parsed = JSON.parse(item.responseBody);
                    const ver = parsed?.results?.find((r: any) => r.result?.response?.version)?.result?.response?.version;
                    if (ver) { gameVersion = String(ver); break; }
                  } catch (_) {}
                }
              }
            }

            const exportPayload = {
              version: 1,
              extensionVersion,
              gameVersion: gameVersion || null,
              exportedAt: new Date().toISOString(),
              timeline
            };
            const blob = new BlobConstructor([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
            const url = UrlConstructor.createObjectURL(blob);
            const a = doc.createElement('a');
            a.href = url;
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
            a.download = `hwa-game-record-${ts}.json`;
            a.click();
            UrlConstructor.revokeObjectURL(url);
          }).catch((err: any) => handleContextInvalidated(err));
        }
      } catch (err) {
        handleContextInvalidated(err);
      }
    });

    clearBtn.addEventListener('click', () => {
      exportBtn.hidden = true;
      clearBtn.hidden = true;
      if (exportBtn.style) exportBtn.style.display = 'none';
      if (clearBtn.style) clearBtn.style.display = 'none';
      sendBridgeMessage({ kind: 'record-clear' }).then(syncRecordingState);
    });

    const parent = doc.body || doc.documentElement;
    if (parent) {
      parent.appendChild(btn);
      parent.appendChild(recordBtn);
      parent.appendChild(exportBtn);
      parent.appendChild(clearBtn);
    }
    syncRecordingState();
  }

  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', injectHelperButtons, { once: true });
    } else {
      injectHelperButtons();
    }
  }

  return {
    timeoutManager,
    sendControl,
    invalidate: () => timeoutManager.invalidate()
  };
}
