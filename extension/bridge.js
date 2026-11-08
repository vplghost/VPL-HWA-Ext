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
      try { chrome.storage?.local?.set?.({ rpcMqttTriggerStatus: {
        state: event.data.state, updatedAt: new Date().toISOString()
      } })?.catch?.(() => {}); } catch (_) {}
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
      chrome.storage?.local?.set?.({ gameEngineStatus: event.data.status });
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
    if (('captureSettings' in changes || 'popupRpcEnabled' in changes) && typeof raidWakeTimer !== 'undefined') {
      chrome.storage.local.get(['raidQueue', 'monsterQueue', 'towerRun']).then((stored) => {
        if (stored.raidQueue && !['stopped', 'complete'].includes(stored.raidQueue.phase)) {
          chrome.runtime.sendMessage({ kind: 'raid-queue-tick' }).catch(() => {});
        }
        if (stored.monsterQueue && !['stopped', 'complete'].includes(stored.monsterQueue.phase)) {
          chrome.runtime.sendMessage({ kind: 'monster-queue-tick' }).catch(() => {});
        }
        if (stored.towerRun && !['stopped', 'complete'].includes(stored.towerRun.phase)) {
          chrome.runtime.sendMessage({ kind: 'tower-run-tick' }).catch(() => {});
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

chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
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
          const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), timeline }, null, 2)], { type: 'application/json' });
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
