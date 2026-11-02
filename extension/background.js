importScripts('tracking-filter.js');
importScripts('refillable-rules.js');
importScripts('clan-versus-rules.js');
importScripts('mission-costs.js');
importScripts('march-rules.js');
importScripts('rpc-cache.js');

const RECORD_STATE_KEY = 'recordingState';
const RECORD_PREFIX = 'record:';
const MAX_BODY_CHARS = 512 * 1024;
const GAME_ORIGIN = 'https://www.hero-wars-alliance.com';
const GAME_ORIGINS = ['https://www.hero-wars-alliance.com', 'https://hero-wars-alliance.com'];
const isGameUrl = (url) => typeof url === 'string' && (
  GAME_ORIGINS.some((origin) => url.startsWith(`${origin}/`) || url === origin) ||
  url.includes('hero-wars-alliance.com')
);
let pending = Promise.resolve();

function bodyFields(record) {
  const result = {};
  for (const field of ['requestBody', 'responseBody']) {
    const value = record[field];
    result[field] = typeof value === 'string' ? value.slice(0, MAX_BODY_CHARS) : null;
    result[`${field}Truncated`] = value?.length > MAX_BODY_CHARS || record[`${field}Truncated`] === true;
  }
  return result;
}

function normalize(record) {
  if (!record || !['fetch', 'xhr'].includes(record.transport)) return null;
  if (!['completed', 'failed'].includes(record.outcome)) return null;
  if (typeof record.method !== 'string' || !/^[A-Z]+$/.test(record.method)) return null;
  if (!Number.isInteger(record.status) && record.status !== null) return null;
  if (!Number.isInteger(record.durationMs) || record.durationMs < 0) return null;
  if (typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))) return null;
  try {
    const url = new URL(record.endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (globalThis.hwaHelperIsTrackingUrl(url.href)) return null;
    return {
      transport: record.transport,
      method: record.method.slice(0, 16),
      endpoint: `${url.origin}${url.pathname}`.slice(0, 2048),
      status: record.status,
      durationMs: record.durationMs,
      outcome: record.outcome,
      timestamp: record.timestamp,
      ...(record.method === 'POST' ? bodyFields(record) : {})
    };
  } catch (_) {
    return null;
  }
}

async function recordedEntries() {
  const stored = await chrome.storage.session.get(null);
  return Object.entries(stored).filter(([key]) => key.startsWith(RECORD_PREFIX))
    .sort(([a], [b]) => Number(a.slice(RECORD_PREFIX.length)) - Number(b.slice(RECORD_PREFIX.length)));
}

async function clearRecorded() {
  const keys = (await recordedEntries()).map(([key]) => key);
  if (keys.length) await chrome.storage.session.remove(keys);
}

async function handleControl(kind) {
  const stored = await chrome.storage.session.get(RECORD_STATE_KEY);
  const state = stored[RECORD_STATE_KEY] || { active: false, nextIndex: 0 };
  if (kind === 'record-start') {
    await clearRecorded();
    await chrome.storage.local.remove('apiRecords');
    const settings = await chrome.storage.local.get('captureSettings');
    if (settings.captureSettings?.interceptEnabled === false) {
      await chrome.storage.local.set({ captureSettings: {
        ...settings.captureSettings, interceptEnabled: true
      } });
    }
    const next = { active: true, nextIndex: 0, error: null };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    return next;
  }
  if (kind === 'record-stop') {
    const next = { ...state, active: false };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    return next;
  }
  if (kind === 'record-clear') {
    await clearRecorded();
    const next = { active: false, nextIndex: 0, error: null };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    return next;
  }
  return state;
}

chrome.runtime.onInstalled?.addListener(() => {
  chrome.storage.local.remove('apiRecords').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isAllowedOrigin = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`) || isGameUrl(sender.url);
  if (['record-start', 'record-stop', 'record-clear'].includes(message?.kind) && isAllowedOrigin) {
    pending = pending.then(() => handleControl(message.kind));
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'record-status' && isAllowedOrigin) {
    pending = pending.then(async () => {
      const state = (await chrome.storage.session.get(RECORD_STATE_KEY))[RECORD_STATE_KEY] || { active: false };
      const entries = await recordedEntries();
      return { active: Boolean(state.active), count: entries.length };
    });
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'record-export' && isAllowedOrigin) {
    pending = pending.then(async () => {
      const entries = await recordedEntries();
      return { records: entries.map(([, r]) => r) };
    });
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'rebuild-cache' && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get('rpcCache');
      const records = (await recordedEntries()).map(([, record]) => record);
      const result = globalThis.hwaHelperRpcCache.merge(stored.rpcCache, records);
      if (result.changed) await chrome.storage.local.set({ rpcCache: result.cache });
      return Object.keys(result.cache).length;
    });
    pending.then(
      (count) => sendResponse({ count }),
      (error) => sendResponse({ error: String(error) })
    );
    pending = pending.catch(() => {});
    return true;
  }
  if ((message?.kind === 'draft-action' || message?.kind === 'refresh-rpc') && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
    chrome.tabs?.query({ url: queryPatterns }, (tabs) => {
      let forwarded = false;
      for (const tab of tabs || []) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
          forwarded = true;
        }
      }
      if (!forwarded) {
        chrome.tabs?.query({}, (allTabs) => {
          for (const tab of allTabs || []) {
            if (tab.id && isGameUrl(tab.url)) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
              forwarded = true;
            }
          }
          sendResponse({ ok: forwarded, error: forwarded ? null : 'No active Hero Wars tab found.' });
        });
        return;
      }
      sendResponse({ ok: forwarded, error: null });
    });
    return true;
  }
  if (message?.kind === 'open-tab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.kind !== 'api-record' || !isGameUrl(sender.url)) return;
  const record = normalize(message.record);
  if (!record) return;
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(['rpcCache', 'captureSettings']);
    if (stored.captureSettings?.interceptEnabled === false) return { saved: false, cached: false };
    const cacheResult = globalThis.hwaHelperRpcCache.merge(stored.rpcCache, [record]);
    if (cacheResult.changed) await chrome.storage.local.set({ rpcCache: cacheResult.cache });
    const state = (await chrome.storage.session.get(RECORD_STATE_KEY))[RECORD_STATE_KEY];
    if (!state?.active) return { saved: false, cached: cacheResult.changed };
    try {
      await chrome.storage.session.set({ [`${RECORD_PREFIX}${state.nextIndex}`]: record,
        [RECORD_STATE_KEY]: { ...state, nextIndex: state.nextIndex + 1 } });
      return { saved: true, cached: cacheResult.changed };
    } catch (error) {
      // Browser session storage has a finite quota. Stop rather than silently dropping records.
      const next = { ...state, active: false, error: 'Session storage is full. Export the current log.' };
      try {
        await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
      } catch (_) {
        // Keep the existing records and stop even if the quota cannot fit the error text.
        await chrome.storage.session.set({ [RECORD_STATE_KEY]: { active: false, nextIndex: state.nextIndex } });
      }
      return { saved: false, cached: cacheResult.changed, error: String(error) };
    }
  });
  pending.then(
    (result) => sendResponse(result),
    (error) => {
      console.warn('HWA Helper could not save API record:', error);
      sendResponse({ saved: false });
    }
  );
  pending = pending.catch(() => {});
  return true;
});
