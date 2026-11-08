importScripts('tracking-filter.js');
importScripts('refillable-rules.js');
importScripts('clan-versus-rules.js');
importScripts('mission-costs.js');
importScripts('march-rules.js');
importScripts('rpc-cache.js');
importScripts('experimental-data.js');
importScripts('raid-queue.js');
importScripts('monster-queue.js');
importScripts('tower-automation.js');
importScripts('tower-runner.js');

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

chrome.storage.onChanged?.addListener?.((changes, area) => {
  if (area !== 'local' || !['popupRpcEnabled', 'socketRefreshMode', 'captureSettings'].some((key) => key in changes)) return;
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(['raidQueue', 'monsterQueue', 'towerRun', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings']);
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
  }).catch(() => {});
});

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
  if (type === 'rallyUserAutojoined' && typeof body?.rallyId === 'string') {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } },
      { name: 'getMarches', feature: 'march' }];
  }
  if (type === 'rallyMembersUpdated' && typeof body?.rallyId === 'string' &&
      cache?.marchStatus?.data?.marches?.some((march) => march.rally?.id === body.rallyId)) {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }];
  }
  if (['rallyCreated', 'rallyCompleted', 'returnToOutpostFromMob'].includes(type)) {
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
    await chrome.storage.local.set({ gameRecordingActive: true });
    return next;
  }
  if (kind === 'record-stop') {
    const next = { ...state, active: false };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    await chrome.storage.local.set({ gameRecordingActive: false });
    return next;
  }
  if (kind === 'record-clear') {
    await clearRecorded();
    await clearInteractions();
    const next = { active: false, nextIndex: 0, nextInteractionIndex: 0, error: null };
    await chrome.storage.session.set({ [RECORD_STATE_KEY]: next });
    await chrome.storage.local.set({ gameRecordingActive: false });
    return next;
  }
  return state;
}

chrome.runtime.onInstalled?.addListener(() => {
  chrome.storage.local.remove('apiRecords').catch(() => {});
});

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
      const transition = controller.start(message.options, tab.id, stored.rpcCache?.accountStatus?.data?.id,
        Date.now(), stored.rpcCache || {}, globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings));
      if (!transition) return { ok: false, error: 'Refresh troops and search for this boss before starting. Check the selected lineup and target.' };
      const state = await saveRaidTransition(transition, stored);
      return { ok: state.phase !== 'stopped', queued: stored.socketRefreshMode !== 'direct', error: state.reason };
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
      const transition = controller.start(message.options, tab.id, stored.rpcCache?.accountStatus?.data?.id,
        Date.now(), stored.rpcCache || {},
        globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings));
      if (!transition) return { ok: false, error: 'Refresh troops and search for this monster before starting. Check the lineup and target.' };
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
      const settings = String(stored.towerAutomationSettings?.accountId) === String(accountId) ?
        stored.towerAutomationSettings : { buffPriority: [] };
      const transition = runner.start(stored.rpcCache, settings, tab.id, Date.now());
      if (!transition) return { ok: false,
        error: 'Open Tower in game and refresh a saved five-hero magicTower team before starting.' };
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
      return { records: entries.map(([, r]) => r), interactions: interactions.map(([, r]) => r) };
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
      'attackMine:mine', 'stopMineGathering:mine']);
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
      message?.kind === 'engine-send-message') &&
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
              sendResponse({ ok: false, error: 'Invalid Draft lineup.' }); return;
            }
            calls = [{ name: message.action === 'saveDefence' ? 'randomDraft_saveDefence' : 'randomDraft_saveAttack',
              args: { heroes: message.heroes } }, { name: 'randomDraft_getInfo' }];
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
  if (message?.kind === 'open-tab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.kind !== 'api-record' || !isGameUrl(sender.url)) return;
  const record = normalize(message.record);
  if (!record) return;
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(['rpcCache', 'captureSettings',
      'popupRpcEnabled', 'socketRefreshMode']);
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
    if (stored.popupRpcEnabled === true && sender.tab?.id) {
      const calls = socketRefreshCalls(record, cacheResult.cache);
      const dispatch = rpcMessageForSettings(stored, calls);
      if (calls.length && dispatch) chrome.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
    }
    const latestClaim = cacheResult.cache.questClaimStatus?.data?.claims?.at(-1);
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
