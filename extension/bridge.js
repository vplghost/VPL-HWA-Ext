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
  chrome.runtime.sendMessage({ kind: 'api-record', record: event.data.record }).catch(() => {});
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
    chrome.runtime?.sendMessage?.({ kind: 'open-tab' });
  });

  const parent = document.body || document.documentElement;
  if (parent) parent.appendChild(btn);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHelperButton, { once: true });
  } else {
    injectHelperButton();
  }
}
