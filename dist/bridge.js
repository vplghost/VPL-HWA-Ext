let currentSettings = null;
let popupRpcEnabled = false;
let socketRefreshMode = 'piggyback';
let recordingActive = false;
let recordingStateObserved = false;

function sendControl() {
  if (!currentSettings) return;
  window.postMessage({
    source: 'hwa-helper-config',
    kind: 'control',
    interceptEnabled: currentSettings.interceptEnabled !== false,
    popupRpcEnabled,
    socketRefreshMode,
    recordingActive
  }, location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== 'hwa-helper-api') return;
  if (event.data.kind === 'ready') return sendControl();
  if (event.data.kind === 'mqtt-rpc-nudge-status') {
    const allowed = ['triggered', 'carrier-attached', 'waiting-template', 'expired-template', 'socket-closed', 'cooldown', 'disabled', 'error'];
    if (allowed.includes(event.data.state)) {
      try {
        const payload = {
          state: event.data.state,
          updatedAt: new Date().toISOString(),
          ...(event.data.nudgeType ? { nudgeType: event.data.nudgeType } : {}),
          ...(event.data.carrierSource ? { carrierSource: event.data.carrierSource } : {}),
          ...(typeof event.data.carrierDelayMs === 'number' ? { carrierDelayMs: event.data.carrierDelayMs } : {}),
          ...(event.data.carrierMethod ? { carrierMethod: event.data.carrierMethod } : {}),
          ...(event.data.trackId ? { trackId: event.data.trackId } : {})
        };
        chrome.storage?.local?.set?.({ rpcMqttTriggerStatus: payload })?.catch?.(() => {});
        if (event.data.state === 'carrier-attached') {
          chrome.storage?.local?.get?.(['rpcMqttTelemetry'], (res) => {
            const telemetry = res?.rpcMqttTelemetry || {
              fastCarrierCount: 0,
              fallbackCarrierCount: 0,
              lastCarrier: null
            };
            const isFast = typeof payload.carrierDelayMs === 'number' && payload.carrierDelayMs <= 3000;
            if (isFast) telemetry.fastCarrierCount = (telemetry.fastCarrierCount || 0) + 1;
            else telemetry.fallbackCarrierCount = (telemetry.fallbackCarrierCount || 0) + 1;
            telemetry.lastCarrier = {
              source: payload.carrierSource || (isFast ? 'fast-map-carrier' : 'periodic-fallback'),
              method: payload.carrierMethod || 'unknown',
              delayMs: payload.carrierDelayMs ?? null,
              nudgeType: payload.nudgeType || null,
              timestamp: payload.updatedAt
            };
            chrome.storage?.local?.set?.({ rpcMqttTelemetry: telemetry })?.catch?.(() => {});
          });
        }
      } catch (_) {}
    }
    return;
  }
  if (event.data.kind === 'rpc-queue-status') {
    if (Number.isInteger(event.data.count) && event.data.count >= 0 && event.data.count <= 64) {
      try { chrome.runtime?.sendMessage?.({ kind: 'rpc-queue-status', count: event.data.count })?.catch?.(() => {}); } catch (_) {}
    }
    return;
  }
  if (event.data.kind === 'engine-status' && event.data.status) {
    try {
      const extensionVersion = chrome.runtime?.getManifest?.()?.version;
      const status = extensionVersion ? { ...event.data.status, extensionVersion } : event.data.status;
      chrome.storage?.local?.set?.({ gameEngineStatus: status });
    } catch (_) {}
    return;
  }
  if (event.data.kind === 'legend-draft-hook-result' && event.data.payload) {
    try {
      chrome.storage?.local?.set?.({ legendDraftHookTelemetry: event.data.payload });
      if (Array.isArray(event.data.payload.topCandidateIds) && event.data.payload.topCandidateIds.length >= 15) {
        chrome.storage?.local?.get?.('rpcCache')?.then?.((stored) => {
          const cache = stored?.rpcCache || {};
          if (!cache.legendDraft) cache.legendDraft = {};
          cache.legendDraft.candidates = event.data.payload.topCandidateIds;
          cache.legendDraft.candidatesDiscoveredAt = new Date().toISOString();
          chrome.storage?.local?.set?.({ rpcCache: cache });
        })?.catch?.(() => {});
      }
    } catch (_) {}
    return;
  }
  if (event.data.kind === 'refresh-rpc-result') {
    try {
      chrome.storage?.local?.set?.({
        lastRefreshRpcResult: {
          ok: event.data.ok === true,
          status: event.data.status || null,
          error: event.data.error || null,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (_) {}
    return;
  }
  if (event.data.kind === 'claim-rpc-result') {
    try {
      chrome.storage?.local?.set?.({ claimRpcStatus: {
        state: event.data.ok === true ? 'complete' : 'failed',
        error: event.data.error || null,
        updatedAt: new Date().toISOString()
      } });
    } catch (_) {}
    return;
  }
  if (event.data.kind === 'interaction-record') {
    if (recordingActive && event.data.entry) saveInteraction(event.data.entry);
    return;
  }
  if (event.data.kind !== 'api-record') return;
  if (!chrome.runtime?.id) return;
  try {
    const p = chrome.runtime?.sendMessage?.({ kind: 'api-record', record: event.data.record });
    if (p && typeof p.then === 'function') {
      p.then(() => syncRecordingState()).catch(() => {});
    }
  } catch {
    // Extension context was invalidated; ignore safely
  }
});

function saveInteraction(entry) {
  try {
    const p = chrome.runtime?.sendMessage?.({ kind: 'record-interaction', entry });
    p?.catch?.(() => {});
  } catch (_) {}
}

function interactionTarget(target) {
  if (!target || typeof target !== 'object') return 'unknown';
  const tag = String(target.tagName || 'canvas').toLowerCase();
  const id = typeof target.id === 'string' ? target.id.slice(0, 80) : '';
  return `${tag}${id ? `#${id}` : ''}`;
}

function recordUiEvent(event) {
  if (!recordingActive || event.target?.closest?.('#hwa-helper-btn, #hwa-record-btn, #hwa-export-btn, #hwa-clear-btn')) return;
  const target = event.target;
  const entry = { timestamp: new Date().toISOString(), target: interactionTarget(target) };
  if (event.type === 'pointerdown') {
    Object.assign(entry, { category: 'pointer', action: 'pointerdown', x: event.clientX, y: event.clientY, button: event.button });
    const canvas = target?.closest?.('canvas') || (target?.tagName?.toLowerCase() === 'canvas' ? target : null);
    const rect = canvas?.getBoundingClientRect?.();
    if (rect?.width && rect?.height) {
      entry.canvasX = Math.round((event.clientX - rect.left) / rect.width * (canvas.width || rect.width));
      entry.canvasY = Math.round((event.clientY - rect.top) / rect.height * (canvas.height || rect.height));
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

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('pointerdown', recordUiEvent, true);
  document.addEventListener('keydown', recordUiEvent, true);
  document.addEventListener('wheel', recordUiEvent, { capture: true, passive: true });
}

try {
  chrome.runtime?.sendMessage?.({ kind: 'record-status' })?.then?.((state) => {
    if (recordingStateObserved) return;
    recordingActive = state?.active === true;
    sendControl();
  })?.catch?.(() => {});
} catch (_) {}

try {
  chrome.storage?.local?.get?.(['captureSettings', 'popupRpcEnabled', 'socketRefreshMode'])?.then?.((stored) => {
    currentSettings = stored?.captureSettings || {};
    popupRpcEnabled = stored?.popupRpcEnabled === true;
    socketRefreshMode = ['direct', 'mqtt-piggyback'].includes(stored?.socketRefreshMode) ? stored?.socketRefreshMode : 'piggyback';
    sendControl();
    try {
      const gv = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hwa_game_version') : null) ||
        (typeof window !== 'undefined' ? window.hwaHelperGameVersion : null);
      if (gv) {
        chrome.storage.local.set({ cachedGameVersion: String(gv) }).catch(() => {});
      }
    } catch (_) {}
  })?.catch?.(() => {
    currentSettings = {};
    sendControl();
  });
} catch {
  currentSettings = {};
  sendControl();
}

try {
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area === 'local' && 'gameRecordingActive' in changes) {
      recordingStateObserved = true;
      const nextActive = changes.gameRecordingActive.newValue === true;
      if (recordingActive !== nextActive) {
        recordingActive = nextActive;
        sendControl();
      }
    }
    if (area !== 'local') return;
    if ('raidQueue' in changes) scheduleRaidWake(changes.raidQueue.newValue);
    if ('monsterQueue' in changes) scheduleMonsterWake(changes.monsterQueue.newValue);
    if ('towerRun' in changes) scheduleTowerWake(changes.towerRun.newValue);
    if ('dungeonRun' in changes) scheduleDungeonWake(changes.dungeonRun.newValue);
    if ('buildingQueue' in changes) scheduleBuildingWake(changes.buildingQueue.newValue);
    if ('researchQueue' in changes) scheduleResearchWake(changes.researchQueue.newValue);
    if (('captureSettings' in changes || 'popupRpcEnabled' in changes) && typeof raidWakeTimer !== 'undefined') {
      chrome.storage.local.get(['raidQueue', 'monsterQueue', 'towerRun', 'buildingQueue', 'researchQueue']).then((stored) => {
        if (stored.raidQueue && !['stopped', 'complete'].includes(stored.raidQueue.phase)) {
          chrome.runtime.sendMessage({ kind: 'raid-queue-tick' }).catch(() => {});
        }
        if (stored.monsterQueue && !['stopped', 'complete'].includes(stored.monsterQueue.phase)) {
          chrome.runtime.sendMessage({ kind: 'monster-queue-tick' }).catch(() => {});
        }
        if (stored.towerRun && !['stopped', 'complete'].includes(stored.towerRun.phase)) {
          chrome.runtime.sendMessage({ kind: 'tower-run-tick' }).catch(() => {});
        }
        if (stored.dungeonRun && !['stopped', 'complete'].includes(stored.dungeonRun.phase)) {
          chrome.runtime.sendMessage({ kind: 'dungeon-run-tick' }).catch(() => {});
        }
        if (stored.buildingQueue && stored.buildingQueue.enabled !== false && Number.isFinite(stored.buildingQueue.wakeAt)) {
          chrome.runtime.sendMessage({ kind: 'building-queue-tick' }).catch(() => {});
        }
        if (stored.researchQueue && stored.researchQueue.enabled !== false && Number.isFinite(stored.researchQueue.wakeAt)) {
          chrome.runtime.sendMessage({ kind: 'research-queue-tick' }).catch(() => {});
        }
      }).catch(() => {});
    }
    if ('captureSettings' in changes) currentSettings = changes.captureSettings.newValue || {};
    if ('popupRpcEnabled' in changes) popupRpcEnabled = changes.popupRpcEnabled.newValue === true;
    if ('socketRefreshMode' in changes) socketRefreshMode =
      ['direct', 'mqtt-piggyback'].includes(changes.socketRefreshMode.newValue) ? changes.socketRefreshMode.newValue : 'piggyback';
    if (!('captureSettings' in changes) && !('popupRpcEnabled' in changes) &&
        !('socketRefreshMode' in changes)) return;
    sendControl();
  });
} catch {}

function clickGameCanvas(ratioX, ratioY, label = '') {
  const canvas = document.querySelector('canvas#gameCanvas, canvas#unity-canvas, canvas#canvas, canvas');
  if (!canvas) {
    console.warn('[HWA-DUNGEON] Game canvas not found for action:', label);
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    console.warn('[HWA-DUNGEON] Game canvas not visible for action:', label);
    return false;
  }

  const clientX = Math.round(rect.left + Math.max(0, Math.min(1, ratioX)) * rect.width);
  const clientY = Math.round(rect.top + Math.max(0, Math.min(1, ratioY)) * rect.height);

  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    screenX: clientX + (window.screenX || 0),
    screenY: clientY + (window.screenY || 0),
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  };

  try {
    canvas.focus?.();
    canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    canvas.dispatchEvent(new MouseEvent('mousedown', eventInit));
  } catch (_) {}

  setTimeout(() => {
    try {
      const upInit = { ...eventInit, buttons: 0 };
      canvas.dispatchEvent(new PointerEvent('pointerup', upInit));
      canvas.dispatchEvent(new MouseEvent('mouseup', upInit));
      canvas.dispatchEvent(new MouseEvent('click', upInit));
    } catch (_) {}
  }, 70);

  return true;
}

chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (message?.kind === 'dungeon-canvas-action' && message.action) {
    clickGameCanvas(message.action.ratioX, message.action.ratioY, message.action.label);
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.kind === 'drop-rpc-group') {
    window.postMessage({ source: 'hwa-helper-control', kind: message.kind, group: message.group }, location.origin);
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.kind === 'draft-action') {
    window.postMessage({
      source: 'hwa-helper-control',
      kind: 'draft-action',
      action: message.action,
      heroes: message.heroes
    }, location.origin);
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.kind === 'refresh-rpc' || message?.kind === 'queue-rpc' ||
      message?.kind === 'queue-claim') {
    if (message.trackId) {
      console.log('[HWA-TRACK][3/6 BRIDGE_FORWARD]', {
        trackId: message.trackId,
        time: new Date().toISOString(),
        kind: message.kind,
        callCount: message.calls?.length
      });
    }
    window.postMessage({
      source: 'hwa-helper-control',
      kind: message.kind,
      calls: message.calls,
      group: message.group,
      expiresAt: message.expiresAt,
      trackId: message.trackId,
      requestedAt: message.requestedAt
    }, location.origin);
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.kind === 'engine-ping') {
    window.postMessage({
      source: 'hwa-helper-control',
      kind: 'engine-ping'
    }, location.origin);
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.kind === 'engine-send-message') {
    window.postMessage({
      source: 'hwa-helper-control',
      kind: 'engine-send-message',
      objectName: message.objectName,
      methodName: message.methodName,
      param: message.param
    }, location.origin);
    sendResponse?.({ ok: true });
    return true;
  }
});

// Content-script timers wake the MV3 worker while the popup is closed. A late wake
// is checked against the deadline again by the controller and MAIN-world queue.
let raidWakeTimer;
function scheduleRaidWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(raidWakeTimer);
  if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
  raidWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'raid-queue-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('raidQueue').then((stored) => scheduleRaidWake(stored.raidQueue));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('raidQueue')?.then?.((stored) => scheduleRaidWake(stored.raidQueue))?.catch?.(() => {}); } catch {}

let monsterWakeTimer;
function scheduleMonsterWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(monsterWakeTimer);
  if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
  monsterWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'monster-queue-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('monsterQueue').then((stored) => scheduleMonsterWake(stored.monsterQueue));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('monsterQueue')?.then?.((stored) => scheduleMonsterWake(stored.monsterQueue))?.catch?.(() => {}); } catch {}

let towerWakeTimer;
function scheduleTowerWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(towerWakeTimer);
  if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
  towerWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'tower-run-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('towerRun').then((stored) => scheduleTowerWake(stored.towerRun));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('towerRun')?.then?.((stored) => scheduleTowerWake(stored.towerRun))?.catch?.(() => {}); } catch {}

let dungeonWakeTimer;
function scheduleDungeonWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(dungeonWakeTimer);
  if (!state || ['stopped', 'complete'].includes(state.phase) || !Number.isFinite(state.wakeAt)) return;
  dungeonWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'dungeon-run-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('dungeonRun').then((stored) => scheduleDungeonWake(stored.dungeonRun));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('dungeonRun')?.then?.((stored) => scheduleDungeonWake(stored.dungeonRun))?.catch?.(() => {}); } catch {}

let buildingWakeTimer;
function scheduleBuildingWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(buildingWakeTimer);
  if (!state || state.enabled === false || !Number.isFinite(state.wakeAt)) return;
  buildingWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'building-queue-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('buildingQueue').then((stored) => scheduleBuildingWake(stored.buildingQueue));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('buildingQueue')?.then?.((stored) => scheduleBuildingWake(stored.buildingQueue))?.catch?.(() => {}); } catch {}

let researchWakeTimer;
function scheduleResearchWake(state) {
  if (typeof clearTimeout !== 'function' || typeof setTimeout !== 'function') return;
  clearTimeout(researchWakeTimer);
  if (!state || state.enabled === false || !Number.isFinite(state.wakeAt)) return;
  researchWakeTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ kind: 'research-queue-tick' }).then((response) => {
      if (response?.watch) return chrome.storage.local.get('researchQueue').then((stored) => scheduleResearchWake(stored.researchQueue));
    }).catch(() => {});
  }, Math.max(100, Math.min(2147483647, state.wakeAt - Date.now())));
}
try { chrome.storage?.local?.get?.('researchQueue')?.then?.((stored) => scheduleResearchWake(stored.researchQueue))?.catch?.(() => {}); } catch {}

function handleContextInvalidated(err) {
  if (err?.message?.includes('Extension context invalidated')) {
    const notify = typeof alert === 'function' ? alert : (typeof window !== 'undefined' && window.alert ? window.alert : console.warn);
    notify('HWA Helper extension was updated or reloaded. Please refresh this game page to reconnect.');
  }
}

let syncRecordingState = () => {};

function injectHelperButton() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('hwa-helper-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'hwa-helper-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open HWA Helper in new tab');
  btn.title = 'Open HWA Helper in new tab';
  btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/></svg><span>HWA Helper</span>';
  btn.addEventListener('click', () => {
    try {
      const p = chrome.runtime?.sendMessage?.({ kind: 'open-tab' });
      if (p && typeof p.catch === 'function') {
        p.catch(handleContextInvalidated);
      }
    } catch (err) {
      handleContextInvalidated(err);
    }
  });

  const recordBtn = document.createElement('button');
  recordBtn.id = 'hwa-record-btn';
  recordBtn.type = 'button';
  recordBtn.className = 'hwa-icon-btn';
  recordBtn.setAttribute('aria-label', 'Record game activity');
  recordBtn.title = 'Record game activity';
  recordBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><circle cx="12" cy="12" r="9"/></svg>';

  const exportBtn = document.createElement('button');
  exportBtn.id = 'hwa-export-btn';
  exportBtn.type = 'button';
  exportBtn.className = 'hwa-icon-btn';
  exportBtn.setAttribute('aria-label', 'Export game activity JSON');
  exportBtn.title = 'Export game activity JSON';
  exportBtn.hidden = true;
  if (exportBtn.style) exportBtn.style.display = 'none';
  exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';

  const clearBtn = document.createElement('button');
  clearBtn.id = 'hwa-clear-btn';
  clearBtn.type = 'button';
  clearBtn.className = 'hwa-icon-btn';
  clearBtn.setAttribute('aria-label', 'Clear game activity log');
  clearBtn.title = 'Clear game activity log';
  clearBtn.hidden = true;
  if (clearBtn.style) clearBtn.style.display = 'none';
  clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';

  let isRecording = false;

  syncRecordingState = async () => {
    try {
      if (!chrome.runtime?.id) return;
      const p = chrome.runtime?.sendMessage?.({ kind: 'record-status' });
      if (!p) return;
      const res = typeof p.then === 'function' ? await p : null;
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
      const recTitle = res.error || (isRecording
        ? `Stop Recording (${count} API, ${interactionCount} interactions)` : 'Start Recording Log');
      recordBtn.title = recTitle;
      recordBtn.setAttribute('aria-label', recTitle);

      const hasRecords = count + interactionCount > 0;
      exportBtn.hidden = !hasRecords;
      clearBtn.hidden = !hasRecords;
      if (exportBtn.style) exportBtn.style.display = hasRecords ? 'inline-flex' : 'none';
      if (clearBtn.style) clearBtn.style.display = hasRecords ? 'inline-flex' : 'none';
      const expTitle = `Export ${count} API and ${interactionCount} interaction records`;
      exportBtn.title = expTitle;
      exportBtn.setAttribute('aria-label', expTitle);

      const clrTitle = `Clear ${count} API and ${interactionCount} interaction records`;
      clearBtn.title = clrTitle;
      clearBtn.setAttribute('aria-label', clrTitle);
    } catch {
      // Ignore background sync failure when extension context is invalidated
    }
  };

  recordBtn.addEventListener('click', () => {
    try {
      const nextKind = isRecording ? 'record-stop' : 'record-start';
      const p = chrome.runtime?.sendMessage?.({ kind: nextKind });
      if (p && typeof p.then === 'function') {
        p.then(syncRecordingState).catch(handleContextInvalidated);
      }
    } catch (err) {
      handleContextInvalidated(err);
    }
  });

  exportBtn.addEventListener('click', () => {
    try {
      const p = chrome.runtime?.sendMessage?.({ kind: 'record-export' });
      if (p && typeof p.then === 'function') {
        p.then((res) => {
          const records = res?.records || [];
          const interactions = res?.interactions || [];
          if ((!records.length && !interactions.length) || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
          const timeline = [
            ...records.map((record) => ({ kind: 'api', ...record })),
            ...interactions.map((entry) => ({ kind: 'interaction', ...entry }))
          ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const extensionVersion = chrome.runtime?.getManifest?.()?.version || res?.extensionVersion || null;
          let gameVersion = res?.gameVersion || null;
          if (!gameVersion) {
            try {
              const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : (typeof window !== 'undefined' ? window.sessionStorage : null);
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
          if (!gameVersion && typeof window !== 'undefined' && window.hwaHelperGameVersion) {
            gameVersion = window.hwaHelperGameVersion;
          }
          if (!gameVersion) {
            for (const item of records) {
              if (item.responseBody && item.responseBody.includes('"version"')) {
                try {
                  const parsed = JSON.parse(item.responseBody);
                  const ver = parsed?.results?.find((r) => r.result?.response?.version)?.result?.response?.version;
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
          const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
          a.download = `hwa-game-record-${ts}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }).catch(handleContextInvalidated);
      }
    } catch (err) {
      handleContextInvalidated(err);
    }
  });

  clearBtn.addEventListener('click', () => {
    try {
      exportBtn.hidden = true;
      clearBtn.hidden = true;
      if (exportBtn.style) exportBtn.style.display = 'none';
      if (clearBtn.style) clearBtn.style.display = 'none';
      const p = chrome.runtime?.sendMessage?.({ kind: 'record-clear' });
      if (p && typeof p.then === 'function') {
        p.then(syncRecordingState).catch(handleContextInvalidated);
      }
    } catch (err) {
      handleContextInvalidated(err);
    }
  });

  const parent = document.body || document.documentElement;
  if (parent) {
    parent.appendChild(btn);
    parent.appendChild(recordBtn);
    parent.appendChild(exportBtn);
    parent.appendChild(clearBtn);
  }

  syncRecordingState();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHelperButton, { once: true });
  } else {
    injectHelperButton();
  }
}
