let currentSettings = null;

function sendControl() {
  if (!currentSettings) return;
  window.postMessage({
    source: 'hwa-helper-config',
    kind: 'control',
    interceptEnabled: currentSettings.interceptEnabled !== false
  }, location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== 'hwa-helper-api') return;
  if (event.data.kind === 'ready') return sendControl();
  if (event.data.kind !== 'api-record') return;
  chrome.runtime.sendMessage({ kind: 'api-record', record: event.data.record }).then(() => syncRecordingState()).catch(() => {});
});

chrome.storage.local.get('captureSettings').then((stored) => {
  currentSettings = stored.captureSettings || {};
  sendControl();
}).catch(() => {
  currentSettings = {};
  sendControl();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('captureSettings' in changes)) return;
  currentSettings = changes.captureSettings.newValue || {};
  sendControl();
});

chrome.runtime?.onMessage?.addListener((message) => {
  if (message?.kind === 'draft-action') {
    window.postMessage({
      source: 'hwa-helper-control',
      kind: 'draft-action',
      action: message.action,
      heroes: message.heroes
    }, location.origin);
  }
});

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
  recordBtn.setAttribute('aria-label', 'Record API log');
  recordBtn.title = 'Record API log';
  recordBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><circle cx="12" cy="12" r="9"/></svg>';

  const exportBtn = document.createElement('button');
  exportBtn.id = 'hwa-export-btn';
  exportBtn.type = 'button';
  exportBtn.className = 'hwa-icon-btn';
  exportBtn.setAttribute('aria-label', 'Export API log JSON');
  exportBtn.title = 'Export API log JSON';
  exportBtn.hidden = true;
  if (exportBtn.style) exportBtn.style.display = 'none';
  exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';

  const clearBtn = document.createElement('button');
  clearBtn.id = 'hwa-clear-btn';
  clearBtn.type = 'button';
  clearBtn.className = 'hwa-icon-btn';
  clearBtn.setAttribute('aria-label', 'Clear API log');
  clearBtn.title = 'Clear API log';
  clearBtn.hidden = true;
  if (clearBtn.style) clearBtn.style.display = 'none';
  clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';

  let isRecording = false;

  syncRecordingState = async () => {
    try {
      const p = chrome.runtime?.sendMessage?.({ kind: 'record-status' });
      if (!p) return;
      const res = typeof p.then === 'function' ? await p : null;
      if (!res) return;
      isRecording = Boolean(res.active);
      const count = Number(res.count || 0);

      recordBtn.innerHTML = isRecording
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg><span class="hwa-rec-dot"></span>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><circle cx="12" cy="12" r="9"/></svg>';
      const recTitle = isRecording ? `Stop Recording (${count} records)` : 'Start Recording Log';
      recordBtn.title = recTitle;
      recordBtn.setAttribute('aria-label', recTitle);

      const hasRecords = count > 0;
      exportBtn.hidden = !hasRecords;
      clearBtn.hidden = !hasRecords;
      if (exportBtn.style) exportBtn.style.display = hasRecords ? 'inline-flex' : 'none';
      if (clearBtn.style) clearBtn.style.display = hasRecords ? 'inline-flex' : 'none';
      const expTitle = `Export ${count} API log record${count === 1 ? '' : 's'}`;
      exportBtn.title = expTitle;
      exportBtn.setAttribute('aria-label', expTitle);

      const clrTitle = `Clear ${count} API log record${count === 1 ? '' : 's'}`;
      clearBtn.title = clrTitle;
      clearBtn.setAttribute('aria-label', clrTitle);
    } catch (err) {
      handleContextInvalidated(err);
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
          if (!records.length || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
          const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
          a.download = `hwa-api-${ts}.json`;
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
