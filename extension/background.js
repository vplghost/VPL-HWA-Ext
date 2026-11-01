importScripts('tracking-filter.js');
importScripts('rpc-cache.js');

const STORAGE_KEY = 'apiRecords';
const MAX_RECORDS = 500;
const MAX_STORAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_CHARS = 512 * 1024;
const GAME_ORIGIN = 'https://www.hero-wars-alliance.com';
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

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.kind === 'rebuild-cache' && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get(['apiRecords', 'rpcCache']);
      const result = globalThis.hwaHelperRpcCache.merge(stored.rpcCache, stored.apiRecords || []);
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
  if (message?.kind !== 'api-record' || !sender.url?.startsWith(`${GAME_ORIGIN}/`)) return;
  const record = normalize(message.record);
  if (!record) return;
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get([STORAGE_KEY, 'rpcCache', 'captureSettings']);
    if (stored.captureSettings?.interceptEnabled === false) return { saved: false, cached: false };
    const logEnabled = stored.captureSettings?.logEnabled !== false;
    const updates = {};
    if (logEnabled) {
      const records = Array.isArray(stored[STORAGE_KEY]) ? [...stored[STORAGE_KEY]] : [];
      records.push(record);
      const limited = records.slice(-MAX_RECORDS);
      let size = STORAGE_KEY.length + 2 + limited.reduce((sum, item) => sum + bytes(item) + 1, 0);
      while (size > MAX_STORAGE_BYTES && limited.length > 1) {
        size -= bytes(limited.shift()) + 1;
      }
      updates[STORAGE_KEY] = limited;
    }
    const cacheResult = globalThis.hwaHelperRpcCache.merge(stored.rpcCache, [record]);
    if (cacheResult.changed) updates.rpcCache = cacheResult.cache;
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    return { saved: logEnabled, cached: cacheResult.changed };
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
