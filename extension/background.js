importScripts('tracking-filter.js');
importScripts('refillable-rules.js');
importScripts('clan-versus-rules.js');
importScripts('mission-costs.js');
importScripts('march-rules.js');
importScripts('hero-metadata.js');
importScripts('rpc-cache.js');
importScripts('experimental-data.js');
importScripts('raid-queue.js');
importScripts('monster-queue.js');
importScripts('tower-automation.js');
importScripts('tower-runner.js');
importScripts('dungeon-automation.js');
importScripts('dungeon-runner.js');
importScripts('building-data.js');
importScripts('building-queue.js');
importScripts('research-data.js');
importScripts('research-queue.js');
importScripts('auto-gather.js');

const RECORD_STATE_KEY = 'recordingState';
const RECORD_PREFIX = 'record:';
const INTERACTION_PREFIX = 'interaction:';
const MAX_INTERACTIONS = 3000;
const MAX_BODY_CHARS = 512 * 1024;
const GAME_ORIGIN = 'https://www.hero-wars-alliance.com';
const GAME_ORIGINS = ['https://www.hero-wars-alliance.com', 'https://hero-wars-alliance.com'];
const isGameUrl = (url) => typeof url === 'string' && (
  GAME_ORIGINS.some((origin) => url.startsWith(`${origin}/`) || url === origin) ||
  url.includes('hero-wars-alliance.com')
);
let pending = Promise.resolve();

// Routine storage optimization on worker startup
try {
  chrome.storage.local.get('rpcCache').then((stored) => {
    if (stored?.rpcCache && globalThis.hwaHelperRpcCache?.pruneCache) {
      const pruned = globalThis.hwaHelperRpcCache.pruneCache(stored.rpcCache);
      if (pruned.changed) {
        chrome.storage.local.set({ rpcCache: pruned.cache }).catch(() => {});
      }
    }
  }).catch(() => {});
} catch (_) {}

async function updateRpcQueueCount(tabId, count) {
  const stored = await chrome.storage.session.get('rpcQueueCounts');
  const counts = { ...stored.rpcQueueCounts };
  if (count === null) delete counts[tabId];
  else counts[tabId] = count;
  if (Object.keys(counts).length || stored.rpcQueueCounts) {
    await chrome.storage.session.set({ rpcQueueCounts: counts });
  }
  await chrome.storage.local.set({ rpcQueueStatus: {
    count: Object.values(counts).reduce((sum, value) => sum + value, 0),
    updatedAt: new Date().toISOString()
  } });
}

chrome.tabs?.onRemoved?.addListener?.((tabId) => {
  pending = pending.then(async () => {
    await updateRpcQueueCount(tabId, null);
    const stored = await chrome.storage.local.get('raidQueue');
    if (stored.raidQueue?.tabId === tabId && !globalThis.hwaHelperRaidQueue.terminal(stored.raidQueue)) {
      await chrome.storage.local.set({ raidQueue: globalThis.hwaHelperRaidQueue.stop(stored.raidQueue, 'Game tab closed.') });
    }
    const monster = await chrome.storage.local.get('monsterQueue');
    if (monster.monsterQueue?.tabId === tabId && !globalThis.hwaHelperMonsterQueue.terminal(monster.monsterQueue)) {
      await chrome.storage.local.set({ monsterQueue: globalThis.hwaHelperMonsterQueue.stop(monster.monsterQueue, 'Game tab closed.') });
    }
    const tower = await chrome.storage.local.get('towerRun');
    if (tower.towerRun?.tabId === tabId && !globalThis.hwaHelperTowerRunner.terminal(tower.towerRun)) {
      await chrome.storage.local.set({ towerRun: globalThis.hwaHelperTowerRunner.stop(tower.towerRun, 'Game tab closed.') });
    }
    const dungeon = await chrome.storage.local.get('dungeonRun');
    if (dungeon.dungeonRun?.tabId === tabId && !globalThis.hwaHelperDungeonRunner?.terminal(dungeon.dungeonRun)) {
      await chrome.storage.local.set({ dungeonRun: globalThis.hwaHelperDungeonRunner.stop(dungeon.dungeonRun, 'Game tab closed.') });
    }
  }).catch(() => {});
});
pending = pending.then(() => updateRpcQueueCount('__startup__', null)).catch(() => {});

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
  if (!record || !['fetch', 'xhr', 'websocket'].includes(record.transport)) return null;
  if (!['completed', 'failed'].includes(record.outcome)) return null;
  if (typeof record.method !== 'string' || !/^[A-Z]+$/.test(record.method)) return null;
  if (!Number.isInteger(record.status) && record.status !== null) return null;
  if (!Number.isInteger(record.durationMs) || record.durationMs < 0) return null;
  if (typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))) return null;
  try {
    const url = new URL(record.endpoint);
    if (record.transport === 'websocket') {
      if (`${url.origin}${url.pathname}` !== 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt' ||
          record.method !== 'PUBLISH' || record.outcome !== 'completed' || record.status !== null ||
          !['sent', 'received'].includes(record.direction) || typeof record.topic !== 'string' ||
          ![0, 1, 2].includes(record.qos) || !['utf8', 'base64'].includes(record.encoding) ||
          typeof record.payload !== 'string' || !Number.isInteger(record.payloadBytes) ||
          record.payloadBytes < 0) return null;
      return {
        transport: 'websocket', method: 'PUBLISH', endpoint: `${url.origin}${url.pathname}`,
        status: null, durationMs: 0, outcome: 'completed', timestamp: record.timestamp,
        direction: record.direction, topic: record.topic.slice(0, 512), qos: record.qos,
        payload: record.payload.slice(0, MAX_BODY_CHARS), encoding: record.encoding,
        payloadBytes: record.payloadBytes,
        payloadTruncated: record.payloadTruncated === true || record.payload.length > MAX_BODY_CHARS,
        ...(typeof record.eventMethod === 'string' ? { eventMethod: record.eventMethod.slice(0, 100) } : {}),
        ...(typeof record.eventType === 'string' ? { eventType: record.eventType.slice(0, 100) } : {})
      };
    }
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

function rpcMessageForSettings(stored, calls, claim = false, extra = {}) {
  if (stored.popupRpcEnabled !== true) return null;
  const queued = stored.socketRefreshMode !== 'direct';
  if (queued && stored.captureSettings?.interceptEnabled === false) return null;
  return { kind: queued ? (claim ? 'queue-claim' : 'queue-rpc') : 'refresh-rpc', calls, ...extra };
}

async function saveRaidTransition(transition, stored) {
  let state = transition.state;
  if (!globalThis.hwaHelperRaidQueue.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = globalThis.hwaHelperRaidQueue.stop(state, 'RPC settings disabled. Queue stopped.');
  }
  // Persist the intent before sending; restarting the worker must never resend a mutation.
  await chrome.storage.local.set({ raidQueue: state });
  if (globalThis.hwaHelperRaidQueue.terminal(state)) {
    await chrome.tabs.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    const dispatch = rpcMessageForSettings(stored, transition.calls);
    try {
      await chrome.tabs.sendMessage(state.tabId, { ...dispatch, group: state.id,
        expiresAt: transition.expiresAt || Date.now() + 120000 });
    } catch {
      state = globalThis.hwaHelperRaidQueue.stop(state, 'Game tab disconnected. Queue stopped.');
      await chrome.storage.local.set({ raidQueue: state });
    }
  }
  return state;
}

async function updateRaidQueue(record, tabId) {
  const stored = await chrome.storage.local.get(['raidQueue', 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings', 'troopCapacitySettings']);
  const state = stored.raidQueue;
  if (globalThis.hwaHelperRaidQueue.terminal(state) || state.tabId !== tabId) return state;
  return saveRaidTransition(globalThis.hwaHelperRaidQueue.advance(state, record, stored.rpcCache, Date.now(),
    globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings)), stored);
}

async function saveMonsterTransition(transition, stored) {
  let state = transition.state;
  if (!globalThis.hwaHelperMonsterQueue.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = globalThis.hwaHelperMonsterQueue.stop(state, 'RPC settings disabled. Queue stopped.');
  }
  await chrome.storage.local.set({ monsterQueue: state });
  if (globalThis.hwaHelperMonsterQueue.terminal(state)) {
    await chrome.tabs.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      await chrome.tabs.sendMessage(state.tabId, { ...rpcMessageForSettings(stored, transition.calls),
        group: state.id, expiresAt: transition.expiresAt || Date.now() + 120000 });
    } catch {
      state = globalThis.hwaHelperMonsterQueue.stop(state, 'Game tab disconnected. Queue stopped.');
      await chrome.storage.local.set({ monsterQueue: state });
    }
  }
  return state;
}

async function updateMonsterQueue(record, tabId) {
  const stored = await chrome.storage.local.get(['monsterQueue', 'rpcCache', 'popupRpcEnabled',
    'socketRefreshMode', 'captureSettings', 'troopCapacitySettings']);
  if (globalThis.hwaHelperMonsterQueue.terminal(stored.monsterQueue) || stored.monsterQueue.tabId !== tabId) return stored.monsterQueue;
  return saveMonsterTransition(globalThis.hwaHelperMonsterQueue.advance(stored.monsterQueue,
    record, stored.rpcCache, Date.now(),
    globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings)), stored);
}

async function saveTowerTransition(transition, stored) {
  let state = transition.state;
  if (!globalThis.hwaHelperTowerRunner.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = globalThis.hwaHelperTowerRunner.stop(state, 'RPC settings disabled. Tower stopped.');
  }
  await chrome.storage.local.set({ towerRun: state });
  if (globalThis.hwaHelperTowerRunner.terminal(state)) {
    await chrome.tabs.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      await chrome.tabs.sendMessage(state.tabId, { ...rpcMessageForSettings(stored, transition.calls),
        group: state.id, expiresAt: transition.expiresAt });
    } catch {
      state = globalThis.hwaHelperTowerRunner.stop(state, 'Game tab disconnected. Tower stopped.');
      await chrome.storage.local.set({ towerRun: state });
    }
  }
  return state;
}

async function updateTowerRun(record, tabId) {
  const stored = await chrome.storage.local.get(['towerRun', 'rpcCache', 'popupRpcEnabled',
    'socketRefreshMode', 'captureSettings']);
  if (globalThis.hwaHelperTowerRunner.terminal(stored.towerRun) || stored.towerRun.tabId !== tabId) return stored.towerRun;
  return saveTowerTransition(globalThis.hwaHelperTowerRunner.advance(stored.towerRun,
    record, stored.rpcCache, Date.now()), stored);
}

async function saveDungeonTransition(transition, stored) {
  let state = transition.state;
  if (!globalThis.hwaHelperDungeonRunner?.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = globalThis.hwaHelperDungeonRunner?.stop(state, 'RPC settings disabled. Dungeon stopped.');
  }
  await chrome.storage.local.set({ dungeonRun: state });
  if (globalThis.hwaHelperDungeonRunner?.terminal(state)) {
    await chrome.tabs.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      const msg = rpcMessageForSettings(stored, transition.calls, { group: state.id, expiresAt: transition.expiresAt });
      await chrome.tabs.sendMessage(state.tabId, msg);
    } catch {
      state = globalThis.hwaHelperDungeonRunner?.stop(state, 'Game tab disconnected. Dungeon stopped.');
      await chrome.storage.local.set({ dungeonRun: state });
    }
  }
  return state;
}

async function updateDungeonRun(record, tabId) {
  const stored = await chrome.storage.local.get(['dungeonRun', 'rpcCache', 'popupRpcEnabled',
    'socketRefreshMode', 'captureSettings']);
  if (!globalThis.hwaHelperDungeonRunner || globalThis.hwaHelperDungeonRunner.terminal(stored.dungeonRun) || stored.dungeonRun.tabId !== tabId) return stored.dungeonRun;
  return saveDungeonTransition(globalThis.hwaHelperDungeonRunner.advance(stored.dungeonRun,
    record, stored.rpcCache, Date.now()), stored);
}

async function findActiveGameTab() {
  const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
  const tabs = await new Promise((resolve) => chrome.tabs?.query?.({ url: queryPatterns }, resolve) || resolve([]));
  const tab = (tabs || []).find((t) => t.id && isGameUrl(t.url));
  if (tab) return tab;
  const allTabs = await new Promise((resolve) => chrome.tabs?.query?.({}, resolve) || resolve([]));
  return (allTabs || []).find((t) => t.id && isGameUrl(t.url)) || null;
}

async function appendQueueLog(type, logEntry) {
  try {
    const key = type === 'building' ? 'buildingQueueLogs' : 'researchQueueLogs';
    const stored = await chrome.storage.local.get([key]).catch(() => ({}));
    const currentLogs = Array.isArray(stored[key]) ? stored[key] : [];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      timestamp: Date.now(),
      type,
      ...logEntry
    };
    const updatedLogs = [entry, ...currentLogs].slice(0, 100);
    await chrome.storage.local.set({ [key]: updatedLogs });

    const logPrefix = `[HWA-QUEUE][${type.toUpperCase()}]`;
    if (entry.status === 'error' || entry.error) {
      console.error(logPrefix, entry.message || entry.action, entry);
    } else if (entry.status === 'warn') {
      console.warn(logPrefix, entry.message || entry.action, entry);
    } else {
      console.log(logPrefix, entry.message || entry.action, entry);
    }
    return entry;
  } catch (err) {
    console.warn('Failed to append queue log', err);
  }
}

const cityQueueLanes = new Map();
function advanceBuildingQueue(tabId, record) { return advanceCityQueue('building', tabId, record); }
function advanceResearchQueue(tabId, record) { return advanceCityQueue('research', tabId, record); }

function advanceCityQueue(type, tabId, record) {
  return inCityQueueLane(type, async () => {
    try { return await runCityQueue(type, tabId, record); }
    catch (error) {
      await appendQueueLog(type, { action: 'error', status: 'error',
        message: 'Queue evaluation failed: ' + (error?.message || String(error)), error: error?.message || String(error) });
      return (await chrome.storage.local.get([type + 'Queue']).catch(() => ({})))[type + 'Queue'];
    }
  });
}

function inCityQueueLane(type, operation) {
  const previous = cityQueueLanes.get(type) || Promise.resolve();
  const run = previous.catch(() => {}).then(operation);
  cityQueueLanes.set(type, run);
  return run.finally(() => { if (cityQueueLanes.get(type) === run) cityQueueLanes.delete(type); });
}

function cityQueueItems(raw) {
  return (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [])
    .filter(item => item && typeof item === 'object');
}

function cityMutationResults(record, request) {
  if (!record || record.method !== 'POST' || record.status !== 200 ||
      record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
      record.requestBodyTruncated || record.responseBodyTruncated) return null;
  try {
    const calls = JSON.parse(record.requestBody).calls || [];
    const results = JSON.parse(record.responseBody).results || [];
    const matched = request.calls.filter(call => call.name !== 'getSummary').map(expected => {
      const call = calls.find(call => call.name === expected.name && call.feature === expected.feature &&
        Object.entries(expected.args || {}).every(([key, value]) => call.args?.[key] === value));
      if (!call) return null;
      const response = results.find(result => result.ident === call.ident)?.result;
      if (!response) return null;
      return { name: expected.name, ok: !response.error && !response.response?.error &&
        Object.hasOwn(response, 'response'), error: response.error || response.response?.error };
    });
    return matched.every(Boolean) ? matched : null;
  } catch { return null; }
}

async function runCityQueue(type, tabId, record) {
  const now = Date.now();
  if (!tabId) tabId = (await findActiveGameTab())?.id;
  const key = type + 'Queue';
  const stored = await chrome.storage.local.get([key, 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings']);
  const queue = stored[key];
  if (!queue || queue.enabled === false) return queue;
  const helper = type === 'building' ? globalThis.hwaHelperBuildingQueue : globalThis.hwaHelperResearchQueue;
  if (!helper) {
    await appendQueueLog(type, { action: 'error', status: 'error', message: 'Queue planner is unavailable.' });
    return queue;
  }
  const feature = type === 'building' ? 'building' : 'personalResearch';
  const status = stored.rpcCache?.[type + 'Status'];
  const summaryTime = status?.method === 'getSummary' ? Date.parse(status.updatedAt) : NaN;
  const fresh = Number.isFinite(summaryTime) && summaryTime <= now + 5000 && now - summaryTime <= 60000;
  const save = async () => { queue.updatedAt = Math.max(Date.now(), (Number(queue.updatedAt) || 0) + 1); await chrome.storage.local.set({ [key]: queue }); };
  const log = async (action, message, status = 'info', extra = {}) =>
    appendQueueLog(type, { action, status, message, ...extra });
  if (!Array.isArray(queue.items)) {
    queue.items = cityQueueItems(queue.items);
    await save();
    await log('repair', 'Recovered a non-array saved queue. Check its targets before continuing.', 'warn');
  }
  const idKey = type === 'building' ? 'buildingId' : 'researchId';
  const rawQueues = status?.data?.queues;
  const observed = Array.isArray(rawQueues) ? rawQueues : Object.values(rawQueues || {});

  async function verify(reason) {
    if (!tabId) {
      if (queue.lastBlocked !== 'tab') { queue.lastBlocked = 'tab'; await save(); await log('blocked', 'Queue saved, but no active game tab is available.', 'warn'); }
      return;
    }
    if (queue.lastVerifiedAt != null && now - queue.lastVerifiedAt < 15000) return;
    const dispatch = rpcMessageForSettings(stored, [{ name: 'getSummary', feature, args: {} }]);
    if (!dispatch) {
      if (queue.lastBlocked !== 'settings') { queue.lastBlocked = 'settings'; await save(); await log('blocked', 'Queue saved. RPC dispatch is disabled by shared settings.', 'warn'); }
      return;
    }
    queue.lastBlocked = null;
    queue.lastVerifiedAt = now;
    queue.wakeAt = now + 15000;
    await save();
    try {
      const reply = await chrome.tabs.sendMessage(tabId, { ...dispatch, group: type + '-queue-check', expiresAt: now + 120000 });
      if (reply?.error || reply?.ok === false) throw new Error(reply.error || 'Game tab rejected summary request.');
      await log('verify', reason + ' Requested current server summary.');
    } catch (error) {
      await log('error', 'Could not verify queue: ' + (error?.message || String(error)), 'error');
    }
  }

  if (queue.pendingRequest) {
    const request = queue.pendingRequest;
    if (request.tabId !== tabId) return queue;
    const outcomes = cityMutationResults(record, request);
    let confirmed = outcomes && outcomes.every(result => result.ok);
    let startConfirmed = outcomes?.some(result => result.ok && result.name.startsWith('start'));
    // A newer authoritative summary can recover acknowledgement after a service-worker restart.
    if (!outcomes && fresh && summaryTime >= request.issuedAt) {
      if (request.startedItem) {
        startConfirmed = observed.some(item => Number(item[idKey]) === Number(request.startedItem[idKey]) &&
          Number(item.level ?? item.nextLevel) >= Number(request.startedItem.nextLevel));
        confirmed = startConfirmed;
      } else {
        confirmed = request.calls.filter(call => call.name.startsWith('complete')).every(call =>
          !observed.some(item => Number(item[idKey]) === Number(call.args[idKey])));
      }
    }
    if (startConfirmed) {
      const item = request.startedItem;
      const index = (queue.items || []).findIndex(value => item.queueItemId
        ? value.queueItemId === item.queueItemId
        : Number(value[idKey]) === Number(item[idKey]) && Number(value.nextLevel) === Number(item.nextLevel));
      if (index >= 0) queue.items.splice(index, 1);
      queue.lastStarted = item;
    }
    if (confirmed || outcomes) {
      queue.pendingRequest = null;
      queue.wakeAt = null;
      await save();
      if (confirmed) {
        await log(request.startedItem ? 'start' : 'complete',
          request.startedItem ? 'Server confirmed queued upgrade started.' : 'Server confirmed finished upgrades completed.',
          'success', { targetId: request.startedItem?.[idKey], nextLevel: request.startedItem?.nextLevel });
      } else {
        queue.retryAt = now + 30000;
        await save();
        await log('error', 'Server rejected queue action: ' + JSON.stringify(outcomes.filter(result => !result.ok).map(result => result.error)), 'error');
        await verify('Checking state after rejected action.');
        return queue;
      }
    } else if (now < request.expiresAt) {
      return queue;
    } else {
      // Do not retry a mutation against old occupancy data.
      if (!fresh || summaryTime < request.expiresAt) {
        await verify('Queue action acknowledgement timed out.');
        return queue;
      }
      queue.pendingRequest = null;
      await save();
      await log('retry', 'No start was observed after dispatch. Retrying from the verified server state.', 'warn');
    }
  }
  const hasWork = (queue.items || []).length > 0 || observed.length > 0 || Boolean(queue.wakeAt);
  if (!hasWork) return queue;
  if (!fresh) {
    await verify('Cached occupancy is missing, stale, or estimated.');
    return queue;
  }
  if (queue.retryAt > now) return queue;
  if (!tabId) { await verify('Checking idle queue.'); return queue; }

  const plan = helper.planNextStep(queue, stored.rpcCache, now);
  if (plan.skippedItems?.length) {
    queue.items = plan.remainingItemsAfterSkip;
    await save();
    for (const item of plan.skippedItems) await log('skip_completed', 'Removed already completed target ' + item[idKey] + ' level ' + item.nextLevel + '.', 'warn');
  }
  if (plan.action === 'wait') {
    const observedEnd = plan.wakeAt - 1000;
    const changedWait = queue.waitUntil !== observedEnd;
    queue.waitUntil = observedEnd;
    queue.wakeAt = Math.min(plan.wakeAt, now + 60000);
    await save();
    if (changedWait) await log('wait', 'Observed upgrade ends at ' + new Date(observedEnd).toLocaleTimeString() +
      '. Occupancy will be checked again within 60 seconds.', 'info', { waitUntil: observedEnd, wakeAt: queue.wakeAt });
    return queue;
  }
  queue.waitUntil = null;
  if (!plan.calls?.length) {
    queue.wakeAt = null;
    await save();
    return queue;
  }
  const invalidMutation = plan.calls.find(call => call.name !== 'getSummary' &&
    (!Number.isInteger(Number(call.args?.[idKey])) || Number(call.args[idKey]) <= 0 ||
      !Number.isInteger(Number(call.args?.nextLevel ?? call.args?.level)) || Number(call.args.nextLevel ?? call.args.level) <= 0));
  if (invalidMutation) {
    queue.retryAt = now + 30000;
    await save();
    await log('error', 'Queue planner produced an invalid target or level. Remove the invalid item before retrying.', 'error');
    return queue;
  }
  const dispatch = rpcMessageForSettings(stored, plan.calls);
  if (!dispatch) { await verify('Queue is idle.'); return queue; }
  queue.pendingRequest = { calls: plan.calls, startedItem: plan.startedItem || null,
    issuedAt: now, expiresAt: now + 120000, tabId };
  queue.wakeAt = now + 120000;
  await save();
  try {
    const reply = await chrome.tabs.sendMessage(tabId, { ...dispatch, group: type + '-queue', expiresAt: now + 120000 });
    if (reply?.error || reply?.ok === false) throw new Error(reply.error || 'Game tab rejected queue command.');
    await log('trigger', plan.startedItem ? 'Dispatched queued upgrade; awaiting server confirmation.'
      : 'Dispatched completion; awaiting server confirmation.', 'info',
      { targetId: plan.startedItem?.[idKey], nextLevel: plan.startedItem?.nextLevel, rpcCalls: plan.calls });
  } catch (error) {
    queue.pendingRequest = null;
    queue.retryAt = now + 30000;
    await save();
    await log('error', 'Queue dispatch failed: ' + (error?.message || String(error)), 'error');
  }
  return queue;
}

function mutateCityQueue(type, message) {
  return inCityQueueLane(type, () => runCityQueueMutation(type, message));
}

async function runCityQueueMutation(type, message) {
  const key = type + 'Queue';
  const idKey = type === 'building' ? 'buildingId' : 'researchId';
  try {
    const stored = await chrome.storage.local.get([key]);
    const queue = { enabled: true, ...stored[key], items: cityQueueItems(stored[key]?.items) };
    if (stored[key]?.items != null && !Array.isArray(stored[key].items)) {
      await appendQueueLog(type, { action: 'repair', status: 'warn', message: 'Recovered a non-array saved queue before applying the action.' });
    }
    const action = message.action || 'sync';
    if (action === 'add') {
      const item = message.item;
      if (!item || !Number.isInteger(item[idKey]) || item[idKey] <= 0 ||
          !Number.isInteger(item.nextLevel) || item.nextLevel <= 0 ||
          !Number.isFinite(item.durationMs) || item.durationMs < 0 ||
          !Number.isFinite(item.currentLevel) || item.currentLevel >= item.nextLevel) {
        throw new Error('Invalid queue target, level, or duration.');
      }
      if (queue.items.some(value => value[idKey] === item[idKey] && value.nextLevel === item.nextLevel)) {
        throw new Error('This target level is already queued.');
      }
      queue.items.push({ ...item, queueItemId: String(Date.now()) + '-' + Math.random().toString(36).slice(2), addedAt: Date.now() });
    } else if (action === 'remove' || action === 'move') {
      const index = queue.items.findIndex(value => message.item?.queueItemId
        ? value.queueItemId === message.item.queueItemId
        : value[idKey] === message.item?.[idKey] && value.nextLevel === message.item?.nextLevel);
      if (index < 0) throw new Error('Queue changed before this action. Refresh and try again.');
      const item = queue.items.splice(index, 1)[0];
      if (action === 'move') {
        const target = Math.max(0, Math.min(queue.items.length, index + (message.direction === 'up' ? -1 : 1)));
        queue.items.splice(target, 0, item);
      }
    } else if (action === 'clear') queue.items = [];
    else if (action === 'enabled') queue.enabled = message.enabled === true;
    else if (action !== 'sync') throw new Error('Unknown queue action: ' + action);
    if (action !== 'sync') {
      queue.updatedAt = Math.max(Date.now(), (Number(queue.updatedAt) || 0) + 1);
      await chrome.storage.local.set({ [key]: queue });
      await appendQueueLog(type, { action: action === 'add' ? 'enqueue' : action, status: 'info',
        message: action === 'add' ? 'Saved queue target ' + message.item[idKey] + ' level ' + message.item.nextLevel + '.'
          : 'Queue action saved: ' + action + '.' });
    }
    await runCityQueue(type);
    const latest = await chrome.storage.local.get([key]);
    return { ok: true, queue: latest[key] };
  } catch (error) {
    const reason = error?.message || String(error);
    await appendQueueLog(type, { action: 'error', status: 'error', message: 'Queue action failed: ' + reason, error: reason });
    return { ok: false, error: reason, logged: true };
  }
}

function setupQueueAlarms() {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  try {
    chrome.alarms.get('hwa-queue-watch', (alarm) => {
      if (!alarm) {
        chrome.alarms.create('hwa-queue-watch', { periodInMinutes: 1 });
      }
    });
  } catch (_) {}
}

chrome.alarms?.onAlarm?.addListener?.(async (alarm) => {
  if (alarm.name === 'hwa-queue-watch') {
    const tab = await findActiveGameTab();
    if (tab?.id) {
      await advanceBuildingQueue(tab.id);
      await advanceResearchQueue(tab.id);
    }
  }
});

chrome.runtime?.onStartup?.addListener?.(async () => {
  setupQueueAlarms();
  const tab = await findActiveGameTab();
  if (tab?.id) {
    await advanceBuildingQueue(tab.id);
    await advanceResearchQueue(tab.id);
  }
});

chrome.runtime?.onInstalled?.addListener?.(async () => {
  setupQueueAlarms();
  chrome.storage.local.remove('apiRecords').catch(() => {});
  try {
    const stored = await chrome.storage.local.get(['socketRefreshMode']);
    if (!stored?.socketRefreshMode) {
      await chrome.storage.local.set({ socketRefreshMode: 'piggyback' });
    }
  } catch (_) {}
});

try {
  setupQueueAlarms();
} catch (_) {}

chrome.storage.onChanged?.addListener?.((changes, area) => {
  if (area !== 'local' || !['popupRpcEnabled', 'socketRefreshMode', 'captureSettings'].some((key) => key in changes)) return;
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(['raidQueue', 'monsterQueue', 'towerRun', 'dungeonRun', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings']);
    const modeChanged = changes.socketRefreshMode && changes.socketRefreshMode.oldValue !== changes.socketRefreshMode.newValue;
    if (!globalThis.hwaHelperRaidQueue.terminal(stored.raidQueue)) {
      const state = modeChanged ? globalThis.hwaHelperRaidQueue.stop(stored.raidQueue, 'RPC mode changed. Queue stopped.') : stored.raidQueue;
      await saveRaidTransition({ state }, stored);
    }
    if (!globalThis.hwaHelperMonsterQueue.terminal(stored.monsterQueue)) {
      const state = modeChanged ? globalThis.hwaHelperMonsterQueue.stop(stored.monsterQueue, 'RPC mode changed. Queue stopped.') : stored.monsterQueue;
      await saveMonsterTransition({ state }, stored);
    }
    if (!globalThis.hwaHelperTowerRunner.terminal(stored.towerRun)) {
      const state = modeChanged ? globalThis.hwaHelperTowerRunner.stop(stored.towerRun, 'RPC mode changed. Tower stopped.') : stored.towerRun;
      await saveTowerTransition({ state }, stored);
    }
    if (!globalThis.hwaHelperDungeonRunner?.terminal(stored.dungeonRun)) {
      const state = modeChanged ? globalThis.hwaHelperDungeonRunner.stop(stored.dungeonRun, 'RPC mode changed. Dungeon stopped.') : stored.dungeonRun;
      await saveDungeonTransition({ state }, stored);
    }
  }).catch(() => {});
});

const attemptedAutoJoinRallies = new Set();

async function evaluatePriorityAutoJoin(record, cache, stored, tabId) {
  if (stored.popupRpcEnabled !== true || !stored.priorityAutoJoin?.enabled || !tabId) return;
  const minLevel = Number.isInteger(stored.priorityAutoJoin.minLevel) ? stored.priorityAutoJoin.minLevel : 10;
  if (record?.method !== 'POST' || record.status !== 200 || record.requestBodyTruncated ||
      record.responseBodyTruncated || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc') return;
  let replies = [];
  try {
    const req = JSON.parse(record.requestBody), res = JSON.parse(record.responseBody);
    replies = (req.calls || []).map((call) => ({
      call,
      result: res.results?.find((item) => item.ident === call.ident)?.result
    }));
  } catch { return; }

  for (const { call, result } of replies) {
    if (call.name !== 'getRallyById' || call.feature !== 'rally' || !result?.response?.rally) continue;
    const rally = result.response.rally;
    const rallyId = rally.rallyId;
    if (!rallyId || attemptedAutoJoinRallies.has(rallyId)) continue;

    const configId = rally.target?.objectConfigId ?? rally.mob?.mobConfigId;
    const level = globalThis.hwaHelperExperimentalData.bossLevel(configId);
    if (level === null || level < minLevel) continue;

    const myId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
    if (myId != null) {
      if (String(rally.leader?.userId) === String(myId)) continue;
      if (Array.isArray(rally.members) && rally.members.some((m) => String(m.userId) === String(myId))) continue;
    }
    if (Number.isInteger(rally.membersCapacityLeft) && rally.membersCapacityLeft <= 0) continue;
    if (Number.isFinite(rally.plannedStartTime) && rally.plannedStartTime - Date.now() < 3000) continue;

    const heroes = cache.heroGetAll?.data;
    const summary = cache['getUnitSummary:unit']?.data;
    const marches = cache.marchStatus?.data?.marches;
    if (!heroes || !summary) continue;

    const availableHeroIds = globalThis.hwaHelperExperimentalData.availableHeroIds(heroes, summary, marches);
    const teamSetting = stored.priorityAutoJoin?.teamId || stored.raidPreferences?.teamId || 'highest';
    let targetTeamHeroes = null;

    if (teamSetting === 'highest') {
      targetTeamHeroes = globalThis.hwaHelperExperimentalData.highestPowerHeroes(heroes, availableHeroIds);
    } else if (teamSetting === 'weakest') {
      const weakest = globalThis.hwaHelperExperimentalData.lowestPowerHeroes(heroes);
      if (weakest.length === 5 && weakest.every((id) => availableHeroIds.includes(id))) {
        targetTeamHeroes = weakest;
      }
    } else {
      let teamHeroIds = null;
      const allTeams = globalThis.hwaHelperExperimentalData.autoJoinTeamOptions(
        cache.teamGetAll?.data, heroes, stored.customTeams?.[String(myId)] || [], availableHeroIds
      );
      const matched = allTeams.find((t) => t.id === teamSetting);
      if (matched && Array.isArray(matched.heroIds) && matched.heroIds.length === 5) {
        teamHeroIds = matched.heroIds;
      } else if (Array.isArray(stored.priorityAutoJoin?.heroIds) && stored.priorityAutoJoin.heroIds.length === 5) {
        teamHeroIds = stored.priorityAutoJoin.heroIds;
      } else if (Array.isArray(stored.raidPreferences?.heroIds) && stored.raidPreferences.heroIds.length === 5) {
        teamHeroIds = stored.raidPreferences.heroIds;
      }
      if (Array.isArray(teamHeroIds) && teamHeroIds.length === 5 &&
          teamHeroIds.every((id) => availableHeroIds.includes(id))) {
        targetTeamHeroes = teamHeroIds;
      }
    }

    let heroIds = targetTeamHeroes;
    if (!heroIds || heroIds.length !== 5) {
      heroIds = globalThis.hwaHelperExperimentalData.highestPowerHeroes(heroes, availableHeroIds);
    }
    if (!heroIds || heroIds.length !== 5) continue;

    const cap = globalThis.hwaHelperExperimentalData.capacityModel(
      heroIds, heroes, cache.troopCapacityEvidence?.data,
      globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings), myId
    ).total;
    const troops = globalThis.hwaHelperExperimentalData.allocateTroops(summary, cap);
    const squad = globalThis.hwaHelperExperimentalData.buildSquad(heroIds, troops);
    if (!squad) continue;

    const joinCall = globalThis.hwaHelperExperimentalData.buildJoinRallyCall(rally.mapId, rallyId, squad);
    if (!joinCall) continue;

    attemptedAutoJoinRallies.add(rallyId);
    const dispatch = rpcMessageForSettings(stored, [joinCall]);
    if (dispatch) {
      chrome.tabs?.sendMessage?.(tabId, dispatch)?.catch?.(() => {});
    }
  }
}

let lastAutoGatherSearchAt = 0;
let lastAutoGatherPendingType = null;
let lastAutoGatherPendingLevel = null;

async function evaluateAutoGather(record, currentCache, stored, tabId) {
  if (stored.popupRpcEnabled !== true || !stored.autoGatherSettings?.enabled || !tabId) return;

  const helper = globalThis.hwaHelperAutoGather;
  if (!helper) return;

  const now = Date.now();
  const isLoad = helper.isGameLoadRecord(record);
  const isReturn = helper.isMarchReturnRecord(record, stored.rpcCache, currentCache, now);
  const isMineSearch = typeof record?.responseBody === 'string' &&
    record.responseBody.includes('"mines"') &&
    typeof record?.requestBody === 'string' &&
    record.requestBody.includes('"searchMine"');
  const isMineAction = typeof record?.requestBody === 'string' &&
    (record.requestBody.includes('"attackMine"') || record.requestBody.includes('"searchMine"'));
  const isMarchesUpdate = typeof record?.requestBody === 'string' &&
    record.requestBody.includes('"getMarches"');

  if (!isLoad && !isReturn && !isMineSearch && !isMineAction && !isMarchesUpdate) return;

  const plan = helper.planAutoGather(currentCache, stored, now);
  if (plan.action === 'search') {
    if (now - lastAutoGatherSearchAt < 10000 &&
        lastAutoGatherPendingType === plan.mineType &&
        lastAutoGatherPendingLevel === plan.mineLevel) {
      return;
    }
    const dispatch = rpcMessageForSettings(stored, [plan.call]);
    if (dispatch) {
      lastAutoGatherSearchAt = now;
      lastAutoGatherPendingType = plan.mineType;
      lastAutoGatherPendingLevel = plan.mineLevel;
      chrome.tabs?.sendMessage?.(tabId, dispatch)?.catch?.(() => {});
    }
  } else if (plan.action === 'gather') {
    const dispatch = rpcMessageForSettings(stored, [plan.call]);
    if (dispatch) {
      chrome.tabs?.sendMessage?.(tabId, dispatch)?.catch?.(() => {});
      const updatedSettings = {
        ...helper.normalizeAutoGatherSettings(stored.autoGatherSettings),
        lastAutoMineType: plan.nextLastAutoMineType
      };
      stored.autoGatherSettings = updatedSettings;
      await chrome.storage.local.set({ autoGatherSettings: updatedSettings });
      lastAutoGatherPendingType = null;
      lastAutoGatherPendingLevel = null;
      lastAutoGatherSearchAt = 0;
    }
  }
}

function socketRefreshCalls(record, cache) {
  if (record.transport !== 'websocket' || record.direction !== 'received' ||
      record.encoding !== 'utf8' || record.payloadTruncated) return [];
  let type;
  let body;
  try {
    const event = JSON.parse(record.payload)?.result;
    type = event?.type;
    body = event?.body;
  } catch (_) { return []; }
  if (type === 'randomDraft_statusChanged') return [{ name: 'randomDraft_getInfo' }];
  if (type === 'newReport') return [{ name: 'getPage', feature: 'report',
    args: { limit: 10, cursor: null } }];
  if (type === 'questUpdateAll') return [
    { name: 'getDailyQuests', feature: 'quest', args: {} },
    { name: 'getSpecialQuestState', feature: 'quest', args: {} },
    { name: 'questGetAll' }, { name: 'questGetEvents' }
  ];
  if (type === 'rallyCreated' && typeof body?.rallyId === 'string') {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } },
      { name: 'getMarches', feature: 'march' }];
  }
  if (type === 'rallyUserAutojoined' && typeof body?.rallyId === 'string') {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } },
      { name: 'getMarches', feature: 'march' }];
  }
  if (type === 'rallyMembersUpdated' && typeof body?.rallyId === 'string' &&
      cache?.marchStatus?.data?.marches?.some((march) => march.rally?.id === body.rallyId)) {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }];
  }
  if (['rallyCompleted', 'returnToOutpostFromMob'].includes(type)) {
    return [{ name: 'getMarches', feature: 'march' }];
  }
  return [];
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

async function interactionEntries() {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored).filter(([key]) => key.startsWith(INTERACTION_PREFIX))
    .sort(([a], [b]) => Number(a.slice(INTERACTION_PREFIX.length)) - Number(b.slice(INTERACTION_PREFIX.length)));
}

async function clearInteractions() {
  const keys = (await interactionEntries()).map(([key]) => key);
  if (keys.length) await chrome.storage.local.remove(keys);
}

function normalizeInteraction(entry) {
  if (!entry || !['pointer', 'keyboard', 'wheel', 'engine', 'rpc'].includes(entry.category) ||
      typeof entry.timestamp !== 'string' || !Number.isFinite(Date.parse(entry.timestamp))) return null;
  const clean = { category: entry.category, timestamp: entry.timestamp };
  for (const key of ['action', 'target', 'objectName', 'methodName', 'paramType', 'key']) {
    if (typeof entry[key] === 'string') clean[key] = entry[key].slice(0, 160);
  }
  for (const key of ['x', 'y', 'canvasX', 'canvasY', 'button', 'deltaY', 'paramLength']) {
    if (Number.isFinite(entry[key])) clean[key] = Math.round(entry[key]);
  }
  return clean;
}

async function handleControl(kind) {
  const stored = await chrome.storage.session.get(RECORD_STATE_KEY);
  const state = stored[RECORD_STATE_KEY] || { active: false, nextIndex: 0 };
  if (kind === 'record-start') {
    await clearRecorded();
    await clearInteractions();
    await chrome.storage.local.remove('apiRecords');
    const settings = await chrome.storage.local.get('captureSettings');
    if (settings.captureSettings?.interceptEnabled === false) {
      await chrome.storage.local.set({ captureSettings: {
        ...settings.captureSettings, interceptEnabled: true
      } });
    }
    const next = { active: true, nextIndex: 0, nextInteractionIndex: 0, error: null };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    await chrome.storage.local.set({ gameRecordingActive: true, recordingState: next });
    return next;
  }
  if (kind === 'record-stop') {
    const next = { ...state, active: false };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    await chrome.storage.local.set({ gameRecordingActive: false, recordingState: next });
    return next;
  }
  if (kind === 'record-clear') {
    await clearRecorded();
    await clearInteractions();
    const next = { active: false, nextIndex: 0, nextInteractionIndex: 0, error: null };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    await chrome.storage.local.set({ gameRecordingActive: false, recordingState: next });
    return next;
  }
  return state;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['raid-queue-start', 'raid-queue-stop'].includes(message?.kind) &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get(['raidQueue', 'monsterQueue', 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings', 'troopCapacitySettings']);
      const controller = globalThis.hwaHelperRaidQueue;
      if (message.kind === 'raid-queue-stop') {
        if (!controller.terminal(stored.raidQueue)) await saveRaidTransition({ state: controller.stop(stored.raidQueue,
          'Stopped by user. Any rally already sent continues in game.') }, stored);
        return { ok: true };
      }
      if (!controller.terminal(stored.raidQueue)) return { ok: false, error: 'A raid queue is already running.' };
      if (!globalThis.hwaHelperMonsterQueue.terminal(stored.monsterQueue)) return { ok: false, error: 'A monster queue is already running.' };
      if (!rpcMessageForSettings(stored, [])) {
        return { ok: false, error: 'Enable RPC, and enable Monitor API for Piggyback mode.' };
      }
      const tabs = await new Promise((resolve) => chrome.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
      const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
      if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
      const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
      const transition = controller.start(message.options, tab.id, accountId,
        Date.now(), stored.rpcCache || {}, globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings));
      if (!transition) return { ok: false, error: 'Refresh troops and search for this boss before starting. Check the selected team and target.' };
      const state = await saveRaidTransition(transition, stored);
      return { ok: state.phase !== 'stopped', queued: stored.socketRefreshMode !== 'direct', phase: state.phase, error: state.reason };
    });
    pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'raid-queue-tick' && isGameUrl(sender.url) && sender.tab?.id) {
    pending = pending.then(() => updateRaidQueue(null, sender.tab.id));
    pending.then((state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id &&
      !globalThis.hwaHelperRaidQueue.terminal(state) }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (['monster-queue-start', 'monster-queue-stop'].includes(message?.kind) &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get(['monsterQueue', 'raidQueue', 'rpcCache', 'popupRpcEnabled',
        'socketRefreshMode', 'captureSettings', 'troopCapacitySettings']);
      const controller = globalThis.hwaHelperMonsterQueue;
      if (message.kind === 'monster-queue-stop') {
        if (!controller.terminal(stored.monsterQueue)) await saveMonsterTransition({ state: controller.stop(stored.monsterQueue,
          'Stopped by user. An attack already sent continues in game.') }, stored);
        return { ok: true };
      }
      if (!controller.terminal(stored.monsterQueue)) return { ok: false, error: 'A monster queue is already running.' };
      if (!globalThis.hwaHelperRaidQueue.terminal(stored.raidQueue)) return { ok: false, error: 'A raid queue is already running.' };
      if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
      const tabs = await new Promise((resolve) => chrome.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
      const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
      if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
      const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
      const transition = controller.start(message.options, tab.id, accountId,
        Date.now(), stored.rpcCache || {},
        globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings));
      if (!transition) return { ok: false, error: 'Refresh troops and search for this monster before starting. Check the team and target.' };
      const state = await saveMonsterTransition(transition, stored);
      return { ok: state.phase !== 'stopped', queued: stored.socketRefreshMode !== 'direct', error: state.reason };
    });
    pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'monster-queue-tick' && isGameUrl(sender.url) && sender.tab?.id) {
    pending = pending.then(() => updateMonsterQueue(null, sender.tab.id));
    pending.then((state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id &&
      !globalThis.hwaHelperMonsterQueue.terminal(state) }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (['tower-run-start', 'tower-run-stop'].includes(message?.kind) &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get(['towerRun', 'rpcCache', 'popupRpcEnabled',
        'socketRefreshMode', 'captureSettings', 'towerAutomationSettings']);
      const runner = globalThis.hwaHelperTowerRunner;
      if (message.kind === 'tower-run-stop') {
        if (!runner.terminal(stored.towerRun)) await saveTowerTransition({ state: runner.stop(stored.towerRun,
          'Stopped by user. Any Tower battle already sent continues in game.') }, stored);
        return { ok: true };
      }
      if (!runner.terminal(stored.towerRun)) return { ok: false, error: 'Tower automation is already running.' };
      if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
      const tabs = await new Promise((resolve) => chrome.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
      const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
      if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
      const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
      const baseSettings = String(stored.towerAutomationSettings?.accountId) === String(accountId) ?
        stored.towerAutomationSettings : {};
      const teamFromMsg = Array.isArray(message.heroes) && message.heroes.length === 5 && message.heroes.every(Number.isInteger)
        ? message.heroes
        : null;
      const teamFromStored = Array.isArray(baseSettings.heroes) && baseSettings.heroes.length === 5 && baseSettings.heroes.every(Number.isInteger)
        ? baseSettings.heroes
        : null;
      const buffFromMsg = Array.isArray(message.buffPriority) && message.buffPriority.length > 0
        ? message.buffPriority
        : null;
      const buffFromStored = Array.isArray(baseSettings.buffPriority) && baseSettings.buffPriority.length > 0
        ? baseSettings.buffPriority
        : [];
      const settings = {
        ...baseSettings,
        buffPriority: buffFromMsg || buffFromStored,
        heroes: teamFromMsg || teamFromStored || stored.rpcCache?.teamGetAll?.data?.magicTower
      };
      if (buffFromMsg || teamFromMsg) {
        await chrome.storage.local.set({
          towerAutomationSettings: {
            ...baseSettings,
            accountId,
            heroes: settings.heroes,
            buffPriority: settings.buffPriority
          }
        });
      }
      const transition = runner.start(stored.rpcCache, settings, tab.id, Date.now());
      if (!transition) return { ok: false,
        error: 'Open Tower in game and select a 5-hero team before starting.' };
      const state = await saveTowerTransition(transition, stored);
      return { ok: state.phase !== 'stopped', error: state.reason };
    });
    pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'tower-run-tick' && isGameUrl(sender.url) && sender.tab?.id) {
    pending = pending.then(() => updateTowerRun(null, sender.tab.id));
    pending.then((state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id &&
      !globalThis.hwaHelperTowerRunner.terminal(state) }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (['dungeon-run-start', 'dungeon-run-stop'].includes(message?.kind) &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get(['dungeonRun', 'rpcCache', 'popupRpcEnabled',
        'socketRefreshMode', 'captureSettings', 'dungeonAutomationSettings']);
      const runner = globalThis.hwaHelperDungeonRunner;
      if (message.kind === 'dungeon-run-stop') {
        if (!runner.terminal(stored.dungeonRun)) await saveDungeonTransition({ state: runner.stop(stored.dungeonRun,
          'Stopped by user. Any Dungeon battle already sent continues in game.') }, stored);
        return { ok: true };
      }
      if (!runner.terminal(stored.dungeonRun)) return { ok: false, error: 'Dungeon automation is already running.' };
      if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
      const tabs = await new Promise((resolve) => chrome.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
      const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
      if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
      try {
        if (typeof chrome?.tabs?.update === 'function') {
          chrome.tabs.update(tab.id, { active: true }).catch(() => {});
        }
      } catch (_) {}
      const dungeonData = stored.rpcCache?.dungeonStatus?.data;
      if (!dungeonData || !Array.isArray(dungeonData.currentFloorDoors) || !dungeonData.currentFloorDoors.length) {
        return { ok: false, error: 'Open Titan Dungeon interface in the game before starting automation.' };
      }
      const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
      const baseSettings = String(stored.dungeonAutomationSettings?.accountId) === String(accountId) ?
        stored.dungeonAutomationSettings : {};
      const settings = {
        ...baseSettings,
        ...(message.settings || {})
      };
      if (message.settings) {
        await chrome.storage.local.set({
          dungeonAutomationSettings: {
            ...baseSettings,
            accountId,
            ...message.settings
          }
        });
      }
      if (stored.rpcCache?.dungeonStatus?.data?.activeBattle) {
        const battleTime = Number(stored.rpcCache.dungeonStatus.data.activeBattle.startTime) ||
          Date.parse(stored.rpcCache.dungeonStatus.data.activeBattle.startTime) || 0;
        if (!battleTime || Date.now() - battleTime > 30000 || message.forceRestart) {
          stored.rpcCache.dungeonStatus.data.activeBattle = null;
          await chrome.storage.local.set({ [CACHE_KEY]: stored.rpcCache });
        }
      }
      const transition = runner.start(stored.rpcCache, settings, tab.id, Date.now());
      if (!transition) return { ok: false,
        error: 'Open Titan Dungeon interface in game before starting automation.' };
      const state = await saveDungeonTransition(transition, stored);
      return { ok: state.phase !== 'stopped', error: state.reason };
    });
    pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'dungeon-run-tick' && isGameUrl(sender.url) && sender.tab?.id) {
    pending = pending.then(() => updateDungeonRun(null, sender.tab.id));
    pending.then((state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id &&
      !globalThis.hwaHelperDungeonRunner?.terminal(state) }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'building-queue-tick') {
    pending = pending.then(async () => {
      let tabId = (isGameUrl(sender.url) && sender.tab?.id) ? sender.tab.id : null;
      if (!tabId) {
        const tab = await findActiveGameTab();
        tabId = tab?.id;
      }
      return tabId ? advanceBuildingQueue(tabId) : null;
    });
    pending.then((queue) => sendResponse({ ok: true, watch: queue?.enabled !== false && (Number.isFinite(queue?.wakeAt) || (Array.isArray(queue?.items) && queue.items.length > 0)) }),
      () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'building-queue-action') {
    pending = pending.then(() => mutateCityQueue('building', message));
    pending.then(sendResponse, error => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'research-queue-tick') {
    pending = pending.then(async () => {
      let tabId = (isGameUrl(sender.url) && sender.tab?.id) ? sender.tab.id : null;
      if (!tabId) {
        const tab = await findActiveGameTab();
        tabId = tab?.id;
      }
      return tabId ? advanceResearchQueue(tabId) : null;
    });
    pending.then((queue) => sendResponse({ ok: true, watch: queue?.enabled !== false && (Number.isFinite(queue?.wakeAt) || (Array.isArray(queue?.items) && queue.items.length > 0)) }),
      () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'research-queue-action') {
    pending = pending.then(() => mutateCityQueue('research', message));
    pending.then(sendResponse, error => sendResponse({ ok: false, error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'rpc-queue-status' && isGameUrl(sender.url) && sender.tab?.id &&
      Number.isInteger(message.count) && message.count >= 0 && message.count <= 64) {
    pending = pending.then(() => updateRpcQueueCount(sender.tab.id, message.count));
    pending.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'mqtt-telemetry-update' && isGameUrl(sender.url)) {
    pending = pending.then(async () => {
      const stored = await chrome.storage.local.get('rpcMqttTelemetry');
      const telemetry = stored.rpcMqttTelemetry || {
        fastCarrierCount: 0,
        fallbackCarrierCount: 0,
        lastCarrier: null
      };
      if (message.status?.state === 'carrier-attached') {
        const isFast = typeof message.status.carrierDelayMs === 'number' && message.status.carrierDelayMs <= 3000;
        if (isFast) telemetry.fastCarrierCount = (telemetry.fastCarrierCount || 0) + 1;
        else telemetry.fallbackCarrierCount = (telemetry.fallbackCarrierCount || 0) + 1;
        telemetry.lastCarrier = {
          source: message.status.carrierSource || (isFast ? 'fast-map-carrier' : 'periodic-fallback'),
          method: message.status.carrierMethod || 'unknown',
          delayMs: message.status.carrierDelayMs ?? null,
          nudgeType: message.status.nudgeType || null,
          timestamp: message.status.updatedAt || new Date().toISOString()
        };
        await chrome.storage.local.set({ rpcMqttTelemetry: telemetry });
      }
    });
    pending.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    pending = pending.catch(() => {});
    return true;
  }
  const isAllowedOrigin = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`) || isGameUrl(sender.url);
  const recordKinds = ['record-start', 'record-stop', 'record-clear', 'start-recording', 'stop-recording'];
  if (recordKinds.includes(message?.kind) && isAllowedOrigin) {
    let mappedKind = message.kind;
    if (mappedKind === 'start-recording') mappedKind = 'record-start';
    if (mappedKind === 'stop-recording') mappedKind = 'record-stop';
    pending = pending.then(() => handleControl(mappedKind));
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'record-status' && isAllowedOrigin) {
    pending = pending.then(async () => {
      const state = (await chrome.storage.session.get(RECORD_STATE_KEY))[RECORD_STATE_KEY] || { active: false };
      const entries = await recordedEntries();
      const interactions = await interactionEntries();
      return { active: Boolean(state.active), count: entries.length,
        interactionCount: interactions.length, error: state.error || null };
    });
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'record-export' && isAllowedOrigin) {
    pending = pending.then(async () => {
      const entries = await recordedEntries();
      const interactions = await interactionEntries();
      const extensionVersion = chrome.runtime?.getManifest?.()?.version || null;
      let gameVersion = null;
      try {
        const sessionStore = await chrome.storage.session?.get?.(['cachedGameVersion']).catch?.(() => ({}));
        if (sessionStore?.cachedGameVersion) gameVersion = sessionStore.cachedGameVersion;
      } catch (_) {}
      return {
        extensionVersion,
        gameVersion,
        records: entries.map(([, r]) => r),
        interactions: interactions.map(([, r]) => r)
      };
    });
    pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
    pending = pending.catch(() => {});
    return true;
  }
  if (message?.kind === 'record-interaction' && isGameUrl(sender.url)) {
    const entry = normalizeInteraction(message.entry);
    if (!entry) return;
    pending = pending.then(async () => {
      const state = (await chrome.storage.session.get(RECORD_STATE_KEY))[RECORD_STATE_KEY];
      if (!state?.active) return { saved: false };
      const index = state.nextInteractionIndex || 0;
      if (index >= MAX_INTERACTIONS) {
        await chrome.storage.session.set({ [RECORD_STATE_KEY]: { ...state, active: false,
          error: 'Interaction log reached 3,000 entries. Export before recording again.' } });
        return { saved: false, limitReached: true };
      }
      try {
        await chrome.storage.local.set({ [`${INTERACTION_PREFIX}${index}`]: entry });
      } catch (error) {
        await chrome.storage.session.set({ [RECORD_STATE_KEY]: { ...state, active: false,
          error: 'Local interaction storage is full. Export the current log.' } });
        return { saved: false, error: String(error) };
      }
      await chrome.storage.session.set({ [RECORD_STATE_KEY]: { ...state, nextInteractionIndex: index + 1 } });
      return { saved: true };
    });
    pending.then(sendResponse, (error) => sendResponse({ saved: false, error: String(error) }));
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
  if (message?.kind === 'experimental-rpc' &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    const allowed = new Set(['searchMob:mob', 'searchMine:mine', 'createRally:mob',
      'joinRally:rally', 'joinRally:mob', 'attackMine:mine', 'stopMineGathering:mine']);
    const calls = message.calls;
    if (!Array.isArray(calls) || calls.length !== 1 ||
        !allowed.has(`${calls[0]?.name}:${calls[0]?.feature}`)) {
      sendResponse({ ok: false, error: 'Invalid experimental RPC.' });
      return true;
    }
    chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode', 'captureSettings']).then((stored) => {
      if (stored.popupRpcEnabled !== true) {
        sendResponse({ ok: false, error: 'Popup RPC calls are disabled in Settings.' });
        return;
      }
      const dispatch = rpcMessageForSettings(stored, calls);
      if (!dispatch) { sendResponse({ ok: false, error: 'Enable Monitor API for Piggyback RPC.' }); return; }
      chrome.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, (tabs) => {
        const tab = (tabs || []).find((candidate) => candidate.id && isGameUrl(candidate.url));
        if (!tab) { sendResponse({ ok: false, error: 'No active Hero Wars tab found.' }); return; }
        chrome.tabs.sendMessage(tab.id, dispatch).then(() =>
          sendResponse({ ok: true, queued: dispatch.kind === 'queue-rpc' })).catch((error) => sendResponse({ ok: false, error: String(error) }));
      });
    }).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if ((message?.kind === 'draft-action' || message?.kind === 'refresh-rpc' ||
      message?.kind === 'claim-rewards' || message?.kind === 'engine-ping' ||
      message?.kind === 'engine-send-message' ||
      message?.kind === 'campaign-raid' || message?.kind === 'craft-fragment' ||
      message?.kind === 'craft-recipe') &&
      sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    const forward = (forwardedMessage = message, queued = false) =>
      chrome.tabs?.query({ url: GAME_ORIGINS.map((o) => `${o}/*`) }, async (tabs) => {
      let forwarded = false;
      for (const tab of tabs || []) {
        if (tab.id) {
          if (queued && !forwarded && message.kind === 'claim-rewards') await chrome.storage.local.set({ claimRpcStatus: {
            state: 'queued', updatedAt: new Date().toISOString()
          } }).catch(() => {});
          chrome.tabs.sendMessage(tab.id, forwardedMessage).catch(() => {});
          forwarded = true;
          break;
        }
      }
      if (!forwarded) {
        chrome.tabs?.query({}, async (allTabs) => {
          for (const tab of allTabs || []) {
            if (tab.id && isGameUrl(tab.url)) {
              if (queued && !forwarded && message.kind === 'claim-rewards') await chrome.storage.local.set({ claimRpcStatus: {
                state: 'queued', updatedAt: new Date().toISOString()
              } }).catch(() => {});
              chrome.tabs.sendMessage(tab.id, forwardedMessage).catch(() => {});
              forwarded = true;
              break;
            }
          }
          sendResponse({ ok: forwarded, queued: forwarded && queued,
            error: forwarded ? null : 'No active Hero Wars tab found.' });
        });
        return;
      }
      sendResponse({ ok: forwarded, queued: forwarded && queued, error: null });
    });
    if (message.kind === 'engine-ping') forward();
    else chrome.storage.local.get(['popupRpcEnabled', 'socketRefreshMode',
      'captureSettings', 'claimRpcStatus']).then((stored) => {
      if (stored.popupRpcEnabled === true) {
        if (message.kind === 'claim-rewards') {
          const allowed = new Set(['mailFarm', 'readAndClaimAll', 'quest_multiFarm',
            'mailGetAll', 'questGetAll']);
          if (!Array.isArray(message.calls) || !message.calls.length ||
              message.calls.some((call) => !allowed.has(call?.name)) ||
              !message.calls.some((call) => ['mailFarm', 'readAndClaimAll',
                'quest_multiFarm'].includes(call.name))) {
            sendResponse({ ok: false, error: 'Invalid reward claim calls.' });
            return;
          }
          const dispatch = rpcMessageForSettings(stored, message.calls, true);
          const queued = stored.socketRefreshMode !== 'direct';
          if (!dispatch) {
            sendResponse({ ok: false,
              error: 'Enable Monitor API or choose Direct for reward claims.' });
            return;
          }
          if (queued && stored.claimRpcStatus?.state === 'queued' &&
              Date.now() - Date.parse(stored.claimRpcStatus.updatedAt || '') < 120000) {
            sendResponse({ ok: false, error: 'Reward claims are already queued.' });
            return;
          }
          if (!queued) chrome.storage.local.remove('claimRpcStatus').catch(() => {});
          forward(dispatch, queued);
        } else if (message.kind === 'engine-send-message') {
          if (stored.socketRefreshMode !== 'direct') {
            sendResponse({ ok: false, error: 'Unity commands require Direct RPC mode.' });
          } else forward();
        } else {
          let calls = message.calls;
          if (message.kind === 'draft-action') {
            if (!['saveDefence', 'saveAttack'].includes(message.action) ||
                !Array.isArray(message.heroes) || message.heroes.length !== 5 ||
                message.heroes.some((id) => !Number.isInteger(id))) {
              sendResponse({ ok: false, error: 'Invalid Draft team.' }); return;
            }
            calls = [{ name: message.action === 'saveDefence' ? 'randomDraft_saveDefence' : 'randomDraft_saveAttack',
              args: { heroes: message.heroes } }, { name: 'randomDraft_getInfo' }];
          } else if (message.kind === 'campaign-raid') {
            const missionId = Number(message.missionId);
            const times = Math.max(1, Math.min(100, Number(message.times) || 1));
            if (!Number.isInteger(missionId) || missionId <= 0) {
              sendResponse({ ok: false, error: 'Invalid mission ID.' }); return;
            }
            calls = [
              { name: 'missionRaid', args: { id: missionId, times } },
              { name: 'playable_getAvailable' },
              { name: 'worldStars_getAvailable' },
              { name: 'inventoryGet' }
            ];
          } else if (message.kind === 'craft-fragment') {
            const libId = Number(message.libId);
            const amount = Math.max(1, Number(message.amount) || 1);
            const type = message.type || 'gear';
            if (!Number.isInteger(libId) || libId <= 0) {
              sendResponse({ ok: false, error: 'Invalid fragment item ID.' }); return;
            }
            calls = [
              { name: 'inventoryCraftFragments', args: { type, libId, amount } },
              { name: 'inventoryGet' }
            ];
          } else if (message.kind === 'craft-recipe') {
            const libId = Number(message.libId);
            const amount = Math.max(1, Number(message.amount) || 1);
            const type = message.type || 'gear';
            if (!Number.isInteger(libId) || libId <= 0) {
              sendResponse({ ok: false, error: 'Invalid recipe item ID.' }); return;
            }
            calls = [
              { name: 'inventoryCraftRecipe', args: { type, libId, amount } },
              { name: 'inventoryGet' }
            ];
          }
          const extra = {};
          if (message.trackId) extra.trackId = message.trackId;
          if (message.requestedAt) extra.requestedAt = message.requestedAt;
          const dispatch = rpcMessageForSettings(stored, calls, false, extra);
          console.log('[HWA-TRACK][2/6 BG_RECEIVE_ROUTE]', {
            trackId: message.trackId,
            time: new Date().toISOString(),
            calls,
            dispatchMode: stored.socketRefreshMode,
            dispatchKind: dispatch?.kind
          });
          if (!dispatch) sendResponse({ ok: false, error: 'Enable Monitor API for Piggyback RPC.' });
          else forward(dispatch, dispatch.kind === 'queue-rpc');
        }
      }
      else sendResponse({ ok: false, error: 'Popup RPC calls are disabled in Settings.' });
    }).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.kind === 'reload-game-tab' && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
    chrome.tabs?.query({ url: queryPatterns }, (tabs) => {
      let reloaded = false;
      for (const tab of tabs || []) {
        if (tab.id) {
          chrome.tabs.reload(tab.id);
          reloaded = true;
        }
      }
      if (!reloaded) {
        chrome.tabs?.query({}, (allTabs) => {
          for (const tab of allTabs || []) {
            if (tab.id && isGameUrl(tab.url)) {
              chrome.tabs.reload(tab.id);
              reloaded = true;
            }
          }
          sendResponse({ ok: reloaded, error: reloaded ? null : 'No active Hero Wars tab found.' });
        });
        return;
      }
      sendResponse({ ok: reloaded, error: null });
    });
    return true;
  }
  if (message?.kind === 'get-game-tab-status' && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
    chrome.tabs?.query({ url: queryPatterns }, (tabs) => {
      let gameTabs = (tabs || []).filter((tab) => tab.id && isGameUrl(tab.url));
      const finish = (finalTabs) => {
        chrome.storage.local.get('gameEngineStatus', (stored) => {
          sendResponse({
            ok: true,
            hasGameTab: finalTabs.length > 0,
            tabCount: finalTabs.length,
            gameEngineStatus: stored?.gameEngineStatus || null
          });
        });
      };
      if (gameTabs.length === 0) {
        chrome.tabs?.query({}, (allTabs) => {
          gameTabs = (allTabs || []).filter((tab) => tab.id && isGameUrl(tab.url));
          finish(gameTabs);
        });
        return;
      }
      finish(gameTabs);
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
  if (record.responseBody && record.responseBody.includes('"version"')) {
    try {
      const parsed = JSON.parse(record.responseBody);
      const ver = parsed?.results?.find((r) => r.result?.response?.version)?.result?.response?.version;
      if (ver) {
        chrome.storage.session?.set?.({ cachedGameVersion: String(ver) }).catch?.(() => {});
        chrome.storage.local?.set?.({ cachedGameVersion: String(ver) }).catch?.(() => {});
      }
    } catch (_) {}
  }
  if (record.requestBody && record.requestBody.includes('"appVersion"')) {
    try {
      const match = record.requestBody.match(/"appVersion"\s*:\s*"([^"]+)"/);
      if (match?.[1]) {
        chrome.storage.session?.set?.({ cachedGameVersion: match[1] }).catch?.(() => {});
        chrome.storage.local?.set?.({ cachedGameVersion: match[1] }).catch?.(() => {});
      }
    } catch (_) {}
  }
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(['rpcCache', 'captureSettings',
      'popupRpcEnabled', 'socketRefreshMode', 'priorityAutoJoin', 'troopCapacitySettings', 'raidPreferences', 'customTeams', 'autoGatherSettings']);
    if (stored.captureSettings?.interceptEnabled === false) return { saved: false, cached: false };
    const cacheResult = globalThis.hwaHelperRpcCache.merge(stored.rpcCache, [record]);
    if (cacheResult.changed) {
      await chrome.storage.local.set({ rpcCache: cacheResult.cache });
      const heroSnap = cacheResult.cache.heroGetAll;
      if (heroSnap && heroSnap.updatedAt === record.timestamp) {
        console.log('[HWA-TRACK][CACHE_HEROES_UPDATED]', {
          time: new Date().toISOString(),
          heroCount: Object.keys(heroSnap.data || {}).length,
          updatedAt: heroSnap.updatedAt
        });
      }
    }
    if (sender.tab?.id) await updateRaidQueue(record, sender.tab.id);
    if (sender.tab?.id) await updateMonsterQueue(record, sender.tab.id);
    if (sender.tab?.id) await updateTowerRun(record, sender.tab.id);
    if (sender.tab?.id) await updateDungeonRun(record, sender.tab.id);
    if (sender.tab?.id) await advanceBuildingQueue(sender.tab.id, record);
    if (sender.tab?.id) await advanceResearchQueue(sender.tab.id, record);
    if (sender.tab?.id) await evaluatePriorityAutoJoin(record, cacheResult.cache, stored, sender.tab.id);
    if (sender.tab?.id) await evaluateAutoGather(record, cacheResult.cache, stored, sender.tab.id);
    if (stored.popupRpcEnabled === true && sender.tab?.id) {
      const calls = socketRefreshCalls(record, cacheResult.cache);
      const dispatch = rpcMessageForSettings(stored, calls);
      if (calls.length && dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
    if (stored.popupRpcEnabled === true && sender.tab?.id && record.requestBody &&
        (record.requestBody.includes('"userGetInfo"') || record.requestBody.includes('"mobileLogin"'))) {
      const dispatch = rpcMessageForSettings(stored, [
        { name: 'getSummary', feature: 'building' },
        { name: 'getSummary', feature: 'personalResearch' },
        { name: 'getMarches', feature: 'march' },
        { name: 'getUnitSummary', feature: 'unit' }
      ]);
      if (dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
    const rawClaims = cacheResult.cache.questClaimStatus?.data?.claims;
    const claims = Array.isArray(rawClaims)
      ? rawClaims
      : (rawClaims && typeof rawClaims === 'object')
      ? Object.values(rawClaims)
      : [];
    const latestClaim = claims.length > 0 ? claims[claims.length - 1] : null;
    if (stored.popupRpcEnabled === true && cacheResult.changed && latestClaim?.needsSync &&
        latestClaim.at === record.timestamp && sender.tab?.id) {
      const dispatch = rpcMessageForSettings(stored, [
        { name: 'userGetInfo' },
        { name: 'inventoryGet' },
        { name: 'refillableGetAll', feature: 'refillable' }
      ]);
      if (dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
    if (stored.popupRpcEnabled === true && cacheResult.changed && sender.tab?.id &&
        globalThis.hwaHelperRpcCache.extract(record).some((entry) => entry.key === 'skinUpgradeAction')) {
      const dispatch = rpcMessageForSettings(stored, [
        { name: 'heroGetAll' }, { name: 'inventoryGet' }
      ]);
      if (dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
    if (stored.popupRpcEnabled === true && cacheResult.changed && sender.tab?.id &&
        globalThis.hwaHelperRpcCache.extract(record).some((entry) =>
          ['completeTrainingAction', 'startTrainingAction', 'startHealingAction', 'completeHealingAction'].includes(entry.key))) {
      const dispatch = rpcMessageForSettings(stored, [
        { name: 'getUnitSummary', feature: 'unit' },
        { name: 'getTrainings', feature: 'unit' },
        { name: 'getHealing', feature: 'unit' }
      ]);
      if (dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
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
