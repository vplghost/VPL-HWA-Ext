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
