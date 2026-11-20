/**
 * Standardized TypeScript Background Runtime for HWA Helper.
 * Orchestrates background service worker duties:
 * - Direct ES module imports of typed services and caches
 * - Standardized storage access and chrome message routing
 * - Typed queues, free spin, auto gather, mine defense, speedup, mail claims
 */
import { rpcCacheService } from '../core/cache/index.ts';
import { buildingQueueService } from '../services/queues/buildingQueue.ts';
import researchQueueService from '../services/queues/researchQueue.ts';
import { raidQueueService } from '../services/queues/raidQueue.ts';
import { monsterQueueService } from '../services/queues/monsterQueue.ts';
import { raidEnergyAutoService } from '../services/queues/raidEnergyAuto.ts';
import { autoGatherService } from '../services/queues/autoGather.ts';
import { smartGatherService } from '../services/queues/smartGather.ts';
import { towerAutomationService } from '../services/queues/towerAutomation.ts';
import { towerRunnerService } from '../services/queues/towerRunner.ts';
import { dungeonAutomationService } from '../services/queues/dungeonAutomation.ts';
import { dungeonRunnerService } from '../services/queues/dungeonRunner.ts';
import { speedupService } from '../services/speedupService.ts';
import { freeAlchemyPolicy } from '../services/freeAlchemy.ts';
import { mailService } from '../services/mailService.ts';
import { mineDefenseService } from '../services/mineDefense.ts';
import { worldReadService } from '../services/worldReadService.ts';
import { experimentalDataHelper } from '../utils/experimentalData.ts';
import { isTrackingUrl } from '../utils/trackingFilter.ts';
import { eventCatalogService } from '../services/eventCatalogService.ts';

export const RECORD_STATE_KEY = 'recordingState';
export const RECORD_PREFIX = 'record:';
export const INTERACTION_PREFIX = 'interaction:';
export const MAX_INTERACTIONS = 3000;
export const MAX_BODY_CHARS = 512 * 1024;
export const GAME_ORIGIN = 'https://www.hero-wars-alliance.com';
export const GAME_ORIGINS = ['https://www.hero-wars-alliance.com', 'https://hero-wars-alliance.com'];
export const CACHE_KEY = 'rpcCache';

let activeChrome: any = null;
let pending: Promise<any> = Promise.resolve();

export function getActiveChrome(override?: any): any {
  if (override) return override;
  if (activeChrome) return activeChrome;
  if (typeof chrome !== 'undefined') return chrome;
  if (typeof globalThis !== 'undefined' && (globalThis as any).chrome) return (globalThis as any).chrome;
  return null;
}

export function setActiveChrome(cr: any) {
  activeChrome = cr;
}

export function getPending(): Promise<any> {
  return pending;
}

export function drainPending(): Promise<any> {
  return pending;
}

export function chainPending(fn: () => Promise<any>): Promise<any> {
  pending = pending.then(fn).catch(() => {});
  return pending;
}

export function isGameUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  return (
    GAME_ORIGINS.some((origin) => url.startsWith(`${origin}/`) || url === origin) ||
    url.includes('hero-wars-alliance.com')
  );
}

export async function isTabAlive(tabId: number | undefined, cr: any): Promise<boolean> {
  if (!tabId) return false;
  if (typeof cr?.tabs?.get === 'function') {
    return new Promise<boolean>((resolve) => {
      try {
        cr.tabs.get(tabId, (tab: any) => {
          if (cr.runtime?.lastError || !tab || !isGameUrl(tab.url)) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch {
        resolve(false);
      }
    });
  }
  if (typeof cr?.tabs?.query === 'function') {
    return new Promise<boolean>((resolve) => {
      try {
        cr.tabs.query({}, (tabs: any[]) => {
          const tab = (tabs || []).find((t: any) => t.id === tabId);
          resolve(Boolean(tab && isGameUrl(tab.url)));
        });
      } catch {
        resolve(false);
      }
    });
  }
  return true;
}

export function bodyFields(record: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const field of ['requestBody', 'responseBody']) {
    const value = record[field];
    result[field] = typeof value === 'string' ? value.slice(0, MAX_BODY_CHARS) : null;
    result[`${field}Truncated`] = value?.length > MAX_BODY_CHARS || record[`${field}Truncated`] === true;
  }
  return result;
}

export function normalize(record: any): any {
  if (!record || !['fetch', 'xhr', 'websocket'].includes(record.transport)) return null;
  if (!['completed', 'failed'].includes(record.outcome)) return null;
  if (typeof record.method !== 'string' || !/^[A-Z]+$/.test(record.method)) return null;
  if (!Number.isInteger(record.status) && record.status !== null) return null;
  if (!Number.isInteger(record.durationMs) || record.durationMs < 0) return null;
  if (typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))) return null;
  try {
    const url = new URL(record.endpoint);
    if (record.transport === 'websocket') {
      if (
        `${url.origin}${url.pathname}` !== 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt' ||
        record.method !== 'PUBLISH' ||
        record.outcome !== 'completed' ||
        record.status !== null ||
        !['sent', 'received'].includes(record.direction) ||
        typeof record.topic !== 'string' ||
        ![0, 1, 2].includes(record.qos) ||
        !['utf8', 'base64'].includes(record.encoding) ||
        typeof record.payload !== 'string' ||
        !Number.isInteger(record.payloadBytes) ||
        record.payloadBytes < 0
      )
        return null;
      return {
        transport: 'websocket',
        method: 'PUBLISH',
        endpoint: `${url.origin}${url.pathname}`,
        status: null,
        durationMs: 0,
        outcome: 'completed',
        timestamp: record.timestamp,
        direction: record.direction,
        topic: record.topic.slice(0, 512),
        qos: record.qos,
        payload: record.payload.slice(0, MAX_BODY_CHARS),
        encoding: record.encoding,
        payloadBytes: record.payloadBytes,
        payloadTruncated: record.payloadTruncated === true || record.payload.length > MAX_BODY_CHARS,
        ...(typeof record.eventMethod === 'string' ? { eventMethod: record.eventMethod.slice(0, 100) } : {}),
        ...(typeof record.eventType === 'string' ? { eventType: record.eventType.slice(0, 100) } : {})
      };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (isTrackingUrl(url.href)) return null;
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

export function normalizeInteraction(entry: any): any {
  if (
    !entry ||
    !['pointer', 'keyboard', 'wheel', 'engine', 'rpc'].includes(entry.category) ||
    typeof entry.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(entry.timestamp))
  )
    return null;
  const clean: Record<string, any> = { category: entry.category, timestamp: entry.timestamp };
  for (const key of ['action', 'target', 'objectName', 'methodName', 'paramType', 'key']) {
    if (typeof entry[key] === 'string') clean[key] = entry[key].slice(0, 160);
  }
  for (const key of ['x', 'y', 'canvasX', 'canvasY', 'button', 'deltaY', 'paramLength']) {
    if (Number.isFinite(entry[key])) clean[key] = Math.round(entry[key]);
  }
  return clean;
}

export function rpcMessageForSettings(stored: any, calls: any[], claim = false, extra: Record<string, any> = {}): any {
  if (stored?.popupRpcEnabled !== true) return null;
  const queued = stored.socketRefreshMode !== 'direct';
  if (queued && stored.captureSettings?.interceptEnabled === false) return null;
  return { kind: queued ? (claim ? 'queue-claim' : 'queue-rpc') : 'refresh-rpc', calls, ...extra };
}

const marchReadLeases = new Map<string, { at: number; until: number }>();

export function passiveMarchReads(cache: any, calls: any[], now: number = Date.now(), after: number = now - 60000): any[] {
  const account = String(cache?.accountStatus?.data?.id ?? 'unknown');
  for (const [key, value] of marchReadLeases) if (now >= value.until) marchReadLeases.delete(key);
  return calls.filter((call) => {
    const name =
      call.name === 'getMarches' && call.feature === 'march'
        ? 'marchStatus'
        : call.name === 'getUnitSummary' && call.feature === 'unit'
        ? 'getUnitSummary:unit'
        : null;
    if (!name) return true;
    const entry = cache?.[name];
    const at = Date.parse(entry?.updatedAt);
    const rows = name === 'marchStatus' ? entry?.data?.marches : entry?.data?.squads;
    const complete =
      name !== 'marchStatus' || entry?.method === 'getMarches' || String(cache?.marchSnapshotStatus?.data?.accountId) === account;
    if (complete && rows && typeof rows === 'object' && at >= after && at <= now) return false;
    const key = account + ':' + name;
    const lease = marchReadLeases.get(key);
    if (lease && lease.at >= after) return false;
    if (marchReadLeases.size >= 100) marchReadLeases.delete(marchReadLeases.keys().next().value!);
    marchReadLeases.set(key, { at: now, until: now + 30000 });
    return true;
  });
}

export function observeMarchReads(record: any, cache: any) {
  if (
    record?.status !== 200 ||
    record.method !== 'POST' ||
    record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
    record.requestBodyTruncated ||
    record.responseBodyTruncated
  )
    return;
  try {
    const calls = JSON.parse(record.requestBody).calls || [];
    const results = JSON.parse(record.responseBody).results || [];
    for (const call of calls)
      if (results.some((result: any) => result.ident === call.ident)) {
        const key =
          call.name === 'getMarches' && call.feature === 'march'
            ? 'marchStatus'
            : call.name === 'getUnitSummary' && call.feature === 'unit'
            ? 'getUnitSummary:unit'
            : null;
        if (key) marchReadLeases.delete(String(cache?.accountStatus?.data?.id ?? 'unknown') + ':' + key);
      }
  } catch (_) {}
}

export function scheduleWorldRead(state: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const wakeAt = worldReadService.wakeAt(state);
  if (wakeAt != null) cr?.alarms?.create?.('hwa-world-read', { when: Math.max(Date.now() + 1, wakeAt) });
  else cr?.alarms?.clear?.('hwa-world-read');
}

let worldReadsPending: Promise<any> = Promise.resolve();

export function passiveWorldReads(
  cache: any,
  calls: any[],
  tabId: number,
  now: number = Date.now(),
  options: Record<string, any> = {},
  customChrome?: any
): Promise<any[]> {
  const cr = getActiveChrome(customChrome);
  if (!worldReadService || !calls.some((call) => worldReadService.key(call))) return Promise.resolve(calls);
  const work = worldReadsPending.then(async () => {
    const stored = (await cr?.storage?.local?.get('worldReadState')) || {};
    const result = worldReadService.plan(stored.worldReadState, cache, calls, now, { ...options, tabId });
    await cr?.storage?.local?.set({ worldReadState: result.state });
    scheduleWorldRead(result.state, cr);
    return result.calls;
  });
  worldReadsPending = work.catch(() => {});
  return work;
}

export async function flushWorldReads(customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get(['worldReadState', 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  const accountId = stored.rpcCache?.accountStatus?.data?.id;
  if (accountId == null || String(stored.worldReadState?.accountId) !== String(accountId) || !rpcMessageForSettings(stored, [])) {
    await cr?.storage?.local?.remove('worldReadState');
    scheduleWorldRead(null, cr);
    return;
  }
  const now = Date.now();
  const tab = await findActiveGameTab(cr);
  if (!tab?.id) {
    await cr?.storage?.local?.remove('worldReadState');
    scheduleWorldRead(null, cr);
    return;
  }
  for (const row of Object.values((stored.worldReadState?.entries as Record<string, any>) || {})) {
    if (!row.pending || now < row.until) continue;
    const calls = await passiveWorldReads(stored.rpcCache, [row.call], tab.id, now, { after: row.after, version: row.version }, cr);
    if (calls.length) {
      await cr?.tabs?.sendMessage(tab.id, { ...rpcMessageForSettings(stored, calls), group: 'world-read', expiresAt: now + 10000 }).catch(() => {});
    }
  }
}

export async function updateRpcQueueCount(tabId: any, count: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.session?.get('rpcQueueCounts')) || {};
  const counts = { ...stored.rpcQueueCounts };
  if (count === null) delete counts[tabId];
  else counts[tabId] = count;
  if (Object.keys(counts).length || stored.rpcQueueCounts) {
    await cr?.storage?.session?.set({ rpcQueueCounts: counts });
  }
  await cr?.storage?.local?.set({
    rpcQueueStatus: {
      count: Object.values(counts).reduce((sum: number, value: any) => sum + (Number(value) || 0), 0),
      updatedAt: new Date().toISOString()
    }
  });
}

export async function findAllGameTabs(customChrome?: any): Promise<any[]> {
  const cr = getActiveChrome(customChrome);
  const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
  const tabs = await new Promise<any[]>((resolve) => {
    if (!cr?.tabs?.query) return resolve([]);
    cr.tabs.query({ url: queryPatterns }, resolve);
  });
  const validTabs = (tabs || []).filter((t: any) => t.id && isGameUrl(t.url));
  if (validTabs.length) {
    return validTabs.sort((a: any, b: any) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.id - a.id);
  }
  const allTabs = await new Promise<any[]>((resolve) => {
    if (!cr?.tabs?.query) return resolve([]);
    cr.tabs.query({}, resolve);
  });
  return (allTabs || []).filter((t: any) => t.id && isGameUrl(t.url)).sort((a: any, b: any) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.id - a.id);
}

export async function findActiveGameTab(customChrome?: any): Promise<any> {
  const tabs = await findAllGameTabs(customChrome);
  return tabs[0] || null;
}

export async function appendQueueLog(type: string, logEntry: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  try {
    const key = type === 'building' ? 'buildingQueueLogs' : 'researchQueueLogs';
    const stored = (await cr?.storage?.local?.get([key]).catch(() => ({}))) || {};
    const currentLogs = Array.isArray(stored[key]) ? stored[key] : [];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      timestamp: Date.now(),
      type,
      ...logEntry
    };
    const updatedLogs = [entry, ...currentLogs].slice(0, 100);
    await cr?.storage?.local?.set({ [key]: updatedLogs });

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

const cityQueueLanes = new Map<string, Promise<any>>();

export function inCityQueueLane<T>(type: string, operation: () => Promise<T>): Promise<T> {
  const previous = cityQueueLanes.get(type) || Promise.resolve();
  const run = previous.catch(() => {}).then(operation);
  cityQueueLanes.set(type, run);
  return run.finally(() => {
    if (cityQueueLanes.get(type) === run) cityQueueLanes.delete(type);
  });
}

export function cityQueueItems(raw: any): any[] {
  return (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []).filter(
    (item: any) => item && typeof item === 'object'
  );
}

export function cityMutationResults(record: any, request: any): any[] | null {
  if (
    !record ||
    record.method !== 'POST' ||
    record.status !== 200 ||
    record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
    record.requestBodyTruncated ||
    record.responseBodyTruncated
  )
    return null;
  try {
    const calls = JSON.parse(record.requestBody).calls || [];
    const results = JSON.parse(record.responseBody).results || [];
    const matched = request.calls
      .filter((call: any) => call.name !== 'getSummary')
      .map((expected: any) => {
        const call = calls.find(
          (c: any) =>
            c.name === expected.name &&
            c.feature === expected.feature &&
            Object.entries(expected.args || {}).every(([key, value]) => c.args?.[key] === value)
        );
        if (!call) return null;
        const response = results.find((result: any) => result.ident === call.ident)?.result;
        if (!response) return null;
        return {
          name: expected.name,
          ok: !response.error && !response.response?.error && Object.hasOwn(response, 'response'),
          error: response.error || response.response?.error
        };
      });
    return matched.every(Boolean) ? matched : null;
  } catch {
    return null;
  }
}

export function scheduleCityQueueRecovery(type: string, when: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  if (Number.isFinite(when) && when > Date.now()) {
    cr?.alarms?.create?.('hwa-' + type + '-queue-recovery', { when });
  }
}

export function advanceBuildingQueue(tabId?: number, record?: any, customChrome?: any) {
  return advanceCityQueue('building', tabId, record, customChrome);
}

export function advanceResearchQueue(tabId?: number, record?: any, customChrome?: any) {
  return advanceCityQueue('research', tabId, record, customChrome);
}

export function advanceCityQueue(type: string, tabId?: number, record?: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  return inCityQueueLane(type, async () => {
    try {
      return await runCityQueue(type, tabId, record, cr);
    } catch (error: any) {
      await appendQueueLog(
        type,
        {
          action: 'error',
          status: 'error',
          message: 'Queue evaluation failed: ' + (error?.message || String(error)),
          error: error?.message || String(error)
        },
        cr
      );
      return (await cr?.storage?.local?.get([type + 'Queue']).catch(() => ({})))?.[type + 'Queue'];
    }
  });
}

export async function runCityQueue(type: string, tabId?: number, record?: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const now = Date.now();
  if (!tabId) tabId = (await findActiveGameTab(cr))?.id;
  const key = type + 'Queue';
  const stored = (await cr?.storage?.local?.get([key, 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  const queue = stored[key];
  if (!queue || queue.enabled === false) return queue;
  const helper: any = type === 'building' ? buildingQueueService : researchQueueService;
  if (!helper) {
    await appendQueueLog(type, { action: 'error', status: 'error', message: 'Queue planner is unavailable.' }, cr);
    return queue;
  }
  const feature = type === 'building' ? 'building' : 'personalResearch';
  const status = stored.rpcCache?.[type + 'Status'];
  const validMethods = ['getSummary', 'startResearch', 'completeResearch', 'startConstruction', 'completeConstruction'];
  const summaryTime =
    status?.updatedAt && (validMethods.includes(status?.method) || status?.data?.action)
      ? Date.parse(status.updatedAt)
      : NaN;
  const fresh = Number.isFinite(summaryTime) && summaryTime <= now + 5000 && now - summaryTime <= 60000;
  const save = async () => {
    queue.updatedAt = Math.max(Date.now(), (Number(queue.updatedAt) || 0) + 1);
    await cr?.storage?.local?.set({ [key]: queue });
  };
  const log = async (action: string, message: string, logStatus = 'info', extra: Record<string, any> = {}) =>
    appendQueueLog(type, { action, status: logStatus, message, ...extra }, cr);

  if (!Array.isArray(queue.items)) {
    queue.items = cityQueueItems(queue.items);
    await save();
    await log('repair', 'Recovered a non-array saved queue. Check its targets before continuing.', 'warn');
  }
  const repairedItems = queue.items.map((item: any) => helper.normalizeQueuedItem?.(item) || item);
  if (repairedItems.some((item: any, index: number) => item !== queue.items[index])) {
    queue.items = repairedItems;
    await save();
    await log('repair', 'Corrected saved building duration estimates that lost their day component.', 'warn');
  }
  const idKey = type === 'building' ? 'buildingId' : 'researchId';
  const rawQueues = status?.data?.queues;
  const observed: any[] = Array.isArray(rawQueues) ? rawQueues : Object.values(rawQueues || {});

  const remainingTargets = fresh ? helper.planNextStep(queue, stored.rpcCache, now).remainingItemsAfterSkip : queue.items;
  const ends = observed
    .map((item: any) => {
      const dur = Number.isFinite(item.durationMs) ? item.durationMs : Number.isFinite(item.duration) ? item.duration : 0;
      if (dur === 0 && Number.isFinite(summaryTime)) return summaryTime;
      return helper.getQueueEnd(item, now);
    })
    .filter((end: number) => end > 0);
  if (!remainingTargets.length || ends.some((end: number) => end > now)) {
    if (queue.stalledRefresh) {
      queue.stalledRefresh = null;
      await save();
    }
  } else {
    const previousEnd =
      queue.waitUntil > 0 && (queue.waitUntil <= now || (fresh && observed.length === 0)) ? Math.min(queue.waitUntil, now) : 0;
    const finishedAt = Math.max(0, ...ends.filter((end: number) => end <= now), previousEnd);
    if (finishedAt > (queue.lastConfirmedStartAt || 0) && !queue.stalledRefresh) {
      queue.stalledRefresh = { completedAt: finishedAt };
      scheduleCityQueueRecovery(type, finishedAt + 60000, cr);
      await save();
    }
  }

  async function recoverStalledQueue(): Promise<boolean> {
    const watch = queue.stalledRefresh;
    if (
      !watch ||
      watch.attemptedAt != null ||
      !queue.items.length ||
      now - watch.completedAt < 60000 ||
      !rpcMessageForSettings(stored, [])
    )
      return false;
    return inCityQueueLane('game-refresh', async () => {
      const tabs = await new Promise<any[]>((resolve) => cr?.tabs?.query({}, resolve));
      const tab = tabs.find((t: any) => t.id === tabId && isGameUrl(t.url));
      if (!tab) return false;
      const latest = (await cr?.storage?.local?.get('cityQueueGameRefresh')) || {};
      const previous = latest.cityQueueGameRefresh;
      if (previous?.tabId === tab.id && previous.at >= watch.completedAt) {
        watch.attemptedAt = previous.at;
        await save();
        await log('refresh', 'Game tab refresh was already attempted for stalled city queues. Waiting for server state.', 'warn');
        return true;
      }
      if (previous?.tabId === tab.id && now - previous.at < 60000) {
        scheduleCityQueueRecovery(type, previous.at + 60000, cr);
        return false;
      }
      watch.attemptedAt = now;
      await save();
      await cr?.storage?.local?.set({ cityQueueGameRefresh: { tabId: tab.id, at: now } });
      try {
        await cr?.tabs?.reload(tab.id);
        await log(
          'refresh',
          'No next upgrade started within 60 seconds after the previous upgrade ended. Refreshed the open game tab.',
          'warn',
          { tabId: tab.id, completedAt: watch.completedAt }
        );
      } catch (error: any) {
        await log('error', 'Could not refresh the game tab for the stalled queue: ' + (error?.message || String(error)), 'error');
      }
      return true;
    });
  }

  async function verify(reason: string) {
    if (!tabId) {
      if (queue.lastBlocked !== 'tab') {
        queue.lastBlocked = 'tab';
        await save();
        await log('blocked', 'Queue saved, but no active game tab is available.', 'warn');
      }
      return;
    }
    if (queue.lastVerifiedAt != null && now - queue.lastVerifiedAt < 15000) return;
    const dispatch = rpcMessageForSettings(stored, [{ name: 'getSummary', feature, args: {} }]);
    if (!dispatch) {
      if (queue.lastBlocked !== 'settings') {
        queue.lastBlocked = 'settings';
        await save();
        await log('blocked', 'Queue saved. RPC dispatch is disabled by shared settings.', 'warn');
      }
      return;
    }
    queue.lastBlocked = null;
    queue.lastVerifiedAt = now;
    queue.wakeAt = now + 15000;
    await save();
    try {
      const reply = await cr?.tabs?.sendMessage(tabId, { ...dispatch, group: type + '-queue-check', expiresAt: now + 120000 });
      if (reply?.error || reply?.ok === false) throw new Error(reply.error || 'Game tab rejected summary request.');
      await log('verify', reason + ' Requested current server summary.');
    } catch (error: any) {
      await log('error', 'Could not verify queue: ' + (error?.message || String(error)), 'error');
    }
  }

  if (queue.pendingRequest) {
    const request = queue.pendingRequest;
    if (request.tabId !== tabId) return queue;
    const outcomes = cityMutationResults(record, request);
    let confirmed = outcomes && outcomes.every((result: any) => result.ok);
    let startConfirmed = outcomes?.some((result: any) => result.ok && result.name.startsWith('start'));
    if (!outcomes && fresh && summaryTime >= request.issuedAt) {
      if (request.startedItem) {
        startConfirmed = observed.some(
          (item: any) =>
            Number(item[idKey]) === Number(request.startedItem[idKey]) &&
            Number(item.level ?? item.nextLevel) >= Number(request.startedItem.nextLevel)
        );
        confirmed = startConfirmed;
      } else {
        confirmed = request.calls
          .filter((call: any) => call.name.startsWith('complete'))
          .every((call: any) => !observed.some((item: any) => Number(item[idKey]) === Number(call.args[idKey])));
      }
    }
    if (startConfirmed) {
      const item = request.startedItem;
      const index = (queue.items || []).findIndex((value: any) =>
        item.queueItemId
          ? value.queueItemId === item.queueItemId
          : Number(value[idKey]) === Number(item[idKey]) && Number(value.nextLevel) === Number(item.nextLevel)
      );
      if (index >= 0) queue.items.splice(index, 1);
      queue.lastStarted = item;
      queue.lastConfirmedStartAt = request.issuedAt;
      queue.stalledRefresh = null;
    }
    if (confirmed || outcomes) {
      queue.pendingRequest = null;
      queue.wakeAt = null;
      await save();
      if (confirmed) {
        if (!request.startedItem && queue.items.length && !queue.stalledRefresh) {
          queue.stalledRefresh = { completedAt: now };
          scheduleCityQueueRecovery(type, now + 60000, cr);
          await save();
        }
        await log(
          request.startedItem ? 'start' : 'complete',
          request.startedItem ? 'Server confirmed queued upgrade started.' : 'Server confirmed finished upgrades completed.',
          'success',
          { targetId: request.startedItem?.[idKey], nextLevel: request.startedItem?.nextLevel }
        );
      } else {
        queue.retryAt = now + 30000;
        await save();
        await log(
          'error',
          'Server rejected queue action: ' +
            JSON.stringify(outcomes?.filter((result: any) => !result.ok).map((result: any) => result.error)),
          'error'
        );
        if (await recoverStalledQueue()) return queue;
        await verify('Checking state after rejected action.');
        return queue;
      }
    } else if (now < request.expiresAt) {
      await recoverStalledQueue();
      return queue;
    } else {
      if (!fresh || summaryTime < request.expiresAt) {
        if (await recoverStalledQueue()) return queue;
        await verify('Queue action acknowledgement timed out.');
        return queue;
      }
      queue.pendingRequest = null;
      await save();
      await log('retry', 'No start was observed after dispatch. Retrying from the verified server state.', 'warn');
    }
  }
  if (await recoverStalledQueue()) return queue;
  const hasWork = (queue.items || []).length > 0 || observed.length > 0 || Boolean(queue.wakeAt);
  if (!hasWork) return queue;
  if (!fresh) {
    await verify('Cached occupancy is missing, stale, or estimated.');
    return queue;
  }
  if (queue.retryAt > now) return queue;
  if (!tabId) {
    await verify('Checking idle queue.');
    return queue;
  }

  const plan = helper.planNextStep(queue, stored.rpcCache, now);
  if (plan.skippedItems?.length) {
    queue.items = plan.remainingItemsAfterSkip;
    await save();
    for (const item of plan.skippedItems)
      await log('skip_completed', 'Removed already completed target ' + item[idKey] + ' level ' + item.nextLevel + '.', 'warn');
  }
  if (plan.action === 'wait') {
    const observedEnd = plan.wakeAt - 1000;
    const changedWait = queue.waitUntil !== observedEnd;
    queue.waitUntil = observedEnd;
    scheduleCityQueueRecovery(type, observedEnd + 60000, cr);
    queue.wakeAt = Math.min(plan.wakeAt, now + 60000);
    await save();
    if (changedWait)
      await log(
        'wait',
        'Observed upgrade ends at ' +
          new Date(observedEnd).toLocaleTimeString() +
          '. Occupancy will be checked again within 60 seconds.',
        'info',
        { waitUntil: observedEnd, wakeAt: queue.wakeAt }
      );
    return queue;
  }
  queue.waitUntil = null;
  if (!plan.calls?.length) {
    queue.wakeAt = null;
    await save();
    return queue;
  }
  const invalidMutation = plan.calls.find(
    (call: any) =>
      call.name !== 'getSummary' &&
      (!Number.isInteger(Number(call.args?.[idKey])) ||
        Number(call.args[idKey]) <= 0 ||
        !Number.isInteger(Number(call.args?.nextLevel ?? call.args?.level)) ||
        Number(call.args.nextLevel ?? call.args.level) <= 0)
  );
  if (invalidMutation) {
    queue.retryAt = now + 30000;
    await save();
    await log('error', 'Queue planner produced an invalid target or level. Remove the invalid item before retrying.', 'error');
    return queue;
  }
  const dispatch = rpcMessageForSettings(stored, plan.calls);
  if (!dispatch) {
    await verify('Queue is idle.');
    return queue;
  }
  queue.pendingRequest = {
    calls: plan.calls,
    startedItem: plan.startedItem || null,
    issuedAt: now,
    expiresAt: now + 120000,
    tabId
  };
  queue.wakeAt = now + 120000;
  await save();
  try {
    const reply = await cr?.tabs?.sendMessage(tabId, { ...dispatch, group: type + '-queue', expiresAt: now + 120000 });
    if (reply?.error || reply?.ok === false) throw new Error(reply.error || 'Game tab rejected queue command.');
    await log(
      'trigger',
      plan.startedItem
        ? 'Dispatched queued upgrade; awaiting server confirmation.'
        : 'Dispatched completion; awaiting server confirmation.',
      'info',
      { targetId: plan.startedItem?.[idKey], nextLevel: plan.startedItem?.nextLevel, rpcCalls: plan.calls }
    );
  } catch (error: any) {
    queue.pendingRequest = null;
    queue.retryAt = now + 30000;
    await save();
    await log('error', 'Queue dispatch failed: ' + (error?.message || String(error)), 'error');
  }
  return queue;
}

export function mutateCityQueue(type: string, message: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  return inCityQueueLane(type, () => runCityQueueMutation(type, message, cr));
}

export async function runCityQueueMutation(type: string, message: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const key = type + 'Queue';
  const idKey = type === 'building' ? 'buildingId' : 'researchId';
  try {
    const stored = (await cr?.storage?.local?.get([key])) || {};
    const queue = { enabled: true, ...stored[key], items: cityQueueItems(stored[key]?.items) };
    if (stored[key]?.items != null && !Array.isArray(stored[key].items)) {
      await appendQueueLog(type, { action: 'repair', status: 'warn', message: 'Recovered a non-array saved queue before applying the action.' }, cr);
    }
    const action = message.action || 'sync';
    if (action === 'add') {
      const item = message.item;
      if (
        !item ||
        !Number.isInteger(item[idKey]) ||
        item[idKey] <= 0 ||
        !Number.isInteger(item.nextLevel) ||
        item.nextLevel <= 0 ||
        !Number.isFinite(item.durationMs) ||
        item.durationMs < 0 ||
        !Number.isFinite(item.currentLevel) ||
        item.currentLevel >= item.nextLevel
      ) {
        throw new Error('Invalid queue target, level, or duration.');
      }
      if (queue.items.some((value: any) => value[idKey] === item[idKey] && value.nextLevel === item.nextLevel)) {
        throw new Error('This target level is already queued.');
      }
      queue.items.push({ ...item, queueItemId: String(Date.now()) + '-' + Math.random().toString(36).slice(2), addedAt: Date.now() });
    } else if (action === 'remove' || action === 'move') {
      const index = queue.items.findIndex((value: any) =>
        message.item?.queueItemId
          ? value.queueItemId === message.item.queueItemId
          : value[idKey] === message.item?.[idKey] && value.nextLevel === message.item?.nextLevel
      );
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
      await cr?.storage?.local?.set({ [key]: queue });
      await appendQueueLog(
        type,
        {
          action: action === 'add' ? 'enqueue' : action,
          status: 'info',
          message:
            action === 'add'
              ? 'Saved queue target ' + message.item[idKey] + ' level ' + message.item.nextLevel + '.'
              : 'Queue action saved: ' + action + '.'
        },
        cr
      );
    }
    await runCityQueue(type, undefined, undefined, cr);
    const latest = (await cr?.storage?.local?.get([key])) || {};
    return { ok: true, queue: latest[key] };
  } catch (error: any) {
    const reason = error?.message || String(error);
    await appendQueueLog(type, { action: 'error', status: 'error', message: 'Queue action failed: ' + reason, error: reason }, cr);
    return { ok: false, error: reason, logged: true };
  }
}

export function setupQueueAlarms(customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  if (!cr?.alarms) return;
  try {
    cr.alarms.get('hwa-queue-watch', (alarm: any) => {
      if (!alarm) {
        cr.alarms.create('hwa-queue-watch', { periodInMinutes: 1 });
      }
    });
  } catch (_) {}
}

export async function saveRaidTransition(transition: any, stored: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  let state = transition.state;
  if (!raidQueueService.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = raidQueueService.stop(state, 'RPC settings disabled. Queue stopped.');
  }
  await cr?.storage?.local?.set({ raidQueue: state });
  if (raidQueueService.terminal(state)) {
    await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    const dispatch = rpcMessageForSettings(stored, transition.calls);
    try {
      await cr?.tabs?.sendMessage(state.tabId, {
        ...dispatch,
        group: state.id,
        expiresAt: transition.expiresAt || Date.now() + 120000
      });
    } catch {
      state = raidQueueService.stop(state, 'Game tab disconnected. Queue stopped.');
      await cr?.storage?.local?.set({ raidQueue: state });
    }
  }
  return state;
}

export async function evaluateRaidEnergy(tabId: number, sessionId: string, now: number = Date.now(), customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get([
      'raidEnergyAuto',
      'rpcCache',
      'raidQueue',
      'monsterQueue',
      'popupRpcEnabled',
      'socketRefreshMode',
      'captureSettings',
      'troopCapacitySettings',
      'customTeams'
    ])) || {};
  const config = stored.raidEnergyAuto;
  if (!config?.enabled) return;
  const cache = stored.rpcCache || {};
  const accountId = cache.accountStatus?.data?.id;
  const session = (await cr?.storage?.session?.get('raidEnergyWatch')) || {};
  const observation = raidEnergyAutoService.observe(session.raidEnergyWatch, config, cache['resource:world-energy'], accountId, tabId, sessionId, now);
  await cr?.storage?.session?.set({ raidEnergyWatch: observation.state });
  if (!observation.trigger) return;
  let reason = '';
  if (!rpcMessageForSettings(stored, [])) reason = 'Auto raid skipped: RPC is disabled by shared settings.';
  else if (!raidQueueService.terminal(stored.raidQueue) || !monsterQueueService.terminal(stored.monsterQueue)) {
    reason = 'Auto raid skipped: a raid or monster queue is already running.';
  }
  const data = experimentalDataHelper;
  const heroes = cache.heroGetAll?.data || {};
  const available = data.availableHeroIds(heroes, cache['getUnitSummary:unit']?.data, cache.marchStatus?.data?.marches);
  const team = data
    .teamOptions(cache.teamGetAll?.data, heroes, stored.customTeams?.[String(accountId)] || [], available)
    .find((t: any) => t.id === config.options.teamId);
  if (!team || team.heroIds.length !== 5) reason ||= 'Auto raid skipped: selected team is unavailable.';
  if (team?.heroIds.some((id: number) => !available.includes(id))) reason ||= 'Auto raid skipped: selected heroes are deployed.';
  const activeRally = (
    Array.isArray(cache.marchStatus?.data?.marches) ? cache.marchStatus.data.marches : Object.values(cache.marchStatus?.data?.marches || {})
  ).some(
    (march: any) =>
      march.rally && (!Number.isFinite(march.endsAt) || march.endsAt > now) && !march.result && march.stage !== 'returnToOutpost'
  );
  if (activeRally) reason ||= 'Auto raid skipped: an active rally is already in progress.';
  let state: any;
  if (!reason && team && Array.isArray(team.heroIds) && team.heroIds.length === 5) {
    const transition = raidQueueService.start(
      { ...config.options, firstMobId: '', heroIds: team.heroIds, maxTroops: team.maxTroops ?? config.options.maxTroops },
      tabId,
      accountId,
      now,
      cache,
      data.normalizeCapacitySettings(stored.troopCapacitySettings)
    );
    if (transition) state = await saveRaidTransition(transition, stored, cr);
    else reason = 'Auto raid skipped: dialog options or troop data are invalid.';
  }
  await cr?.storage?.local?.set({
    raidEnergyAutoStatus: {
      at: new Date(now).toISOString(),
      message: reason || (state?.phase === 'stopped' ? state.reason : 'Auto raid started at the natural World Energy threshold.'),
      phase: state?.phase || 'skipped'
    }
  });
}

export async function deferQueueForGathering(
  type: string,
  options: any,
  tabId: number,
  accountId: any,
  stored: any,
  now: number,
  customChrome?: any
) {
  const cr = getActiveChrome(customChrome);
  const smart = smartGatherService;
  const settings = stored.autoGatherSettings;
  if (!smart || !settings?.enabled || !settings.smartEnabled || accountId == null) return null;
  const data = experimentalDataHelper;
  if (
    !options?.mapId ||
    !Number.isFinite(options.center?.x) ||
    !Number.isFinite(options.center?.y) ||
    options.heroIds?.length !== 5 ||
    new Set(options.heroIds).size !== 5 ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    (type === 'raid'
      ? !data.bossConfigId(options.level) ||
        !data.rallyWaitOptions.includes(options.waitSeconds) ||
        !Number.isInteger(options.minMembers) ||
        options.minMembers < 1 ||
        options.minMembers > 6
      : !data.soloMonsterConfigIds(options.level))
  )
    return null;
  if (!smart.fresh(stored.rpcCache?.marchStatus, now) || !smart.fresh(stored.rpcCache?.['getUnitSummary:unit'], now))
    return { error: 'Refresh current marches and troops before starting this queue.' };
  const demand = smart.recallForQueue(stored.rpcCache || {}, autoGatherService.normalizeAutoGatherSettings(settings), options, now);
  if (!demand) return null;
  if (!demand.march) return { error: demand.reason };
  let runtime = smart.sync(stored.smartGatherState, null, stored.rpcCache, now);
  if (runtime.pending || runtime.reservation)
    return { error: 'Wait for the current Smart gathering operation before starting a queue.' };
  const march = demand.march;
  const map = smart.context(stored.rpcCache);
  if (!map.mapId || (!march.mineConfigId && !stored.rpcCache.mineMap?.[march.mineId]?.mineConfigId))
    return { error: 'Refresh world map and mine configuration before releasing a gathering squad.' };
  const id = type + ':gather:' + now + ':' + tabId;
  const call = { name: 'stopMineGathering', feature: 'mine', args: { squadId: march.squadId } };
  runtime = {
    ...runtime,
    error: undefined,
    reservation: { type, queueId: id },
    pending: {
      call,
      sentAt: now,
      phase: 'sent',
      mine: {
        mineId: march.mineId,
        mapId: map.mapId,
        configId: march.mineConfigId ?? stored.rpcCache.mineMap[march.mineId].mineConfigId,
        coordinates: march.targetCoordinates || stored.rpcCache.mineMap?.[march.mineId]?.coordinates
      }
    },
    status: 'Recalling nearest gathering squad for ' + type + ' queue'
  };
  await cr?.storage?.local?.set({ smartGatherState: runtime });
  return {
    state: {
      id,
      tabId,
      accountId,
      options,
      started: 0,
      completed: 0,
      phase: 'waiting_gather',
      sentAt: now,
      wakeAt: now + 5000,
      current: null,
      bossQueue: { remain_raid_count: options.count, queue: [] }
    },
    calls: [call],
    expiresAt: now + 30000
  };
}

export async function advanceGatherQueue(type: string, record: any, stored: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const key = type + 'Queue';
  const queue = stored[key];
  const now = Date.now();
  const controller: any = type === 'raid' ? raidQueueService : monsterQueueService;
  const save = type === 'raid' ? saveRaidTransition : saveMonsterTransition;
  const runtime = smartGatherService.sync(stored.smartGatherState, record, stored.rpcCache || {}, now);
  if (String(queue.accountId) !== String(runtime.accountId) || runtime.reservation?.queueId !== queue.id) {
    return save({ state: controller.stop(queue, 'Gathering reservation no longer matches this account/queue.') }, stored, cr);
  }
  await cr?.storage?.local?.set({ smartGatherState: runtime });
  if (runtime.error || !rpcMessageForSettings(stored, []))
    return save({ state: controller.stop(queue, runtime.error || 'RPC disabled while waiting for gathering squad.') }, stored, cr);
  if (runtime.pending) {
    const calls = now >= queue.wakeAt ? [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }] : [];
    return save({ state: { ...queue, wakeAt: calls.length ? now + 5000 : queue.wakeAt }, calls }, stored, cr);
  }
  runtime.reservation = null;
  await cr?.storage?.local?.set({ smartGatherState: runtime });
  const transition = controller.start(
    queue.options,
    tabId,
    queue.accountId,
    now,
    stored.rpcCache || {},
    experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
  );
  return save(transition || { state: controller.stop(queue, 'Team or target unavailable after gathering return. Refresh and start again.') }, stored, cr);
}

export async function updateRaidQueue(record: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get([
      'raidQueue',
      'rpcCache',
      'popupRpcEnabled',
      'socketRefreshMode',
      'captureSettings',
      'troopCapacitySettings',
      'smartGatherState'
    ])) || {};
  const state = stored.raidQueue;
  if (state?.phase === 'waiting_gather' && state.tabId === tabId) return advanceGatherQueue('raid', record, stored, tabId, cr);
  if (raidQueueService.terminal(state) || state.tabId !== tabId) return state;
  return saveRaidTransition(
    raidQueueService.advance(
      state,
      record,
      stored.rpcCache,
      Date.now(),
      experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
    ),
    stored,
    cr
  );
}

export async function saveMonsterTransition(transition: any, stored: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  let state = transition.state;
  if (!monsterQueueService.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = monsterQueueService.stop(state, 'RPC settings disabled. Queue stopped.');
  }
  await cr?.storage?.local?.set({ monsterQueue: state });
  if (monsterQueueService.terminal(state)) {
    await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      await cr?.tabs?.sendMessage(state.tabId, {
        ...rpcMessageForSettings(stored, transition.calls),
        group: state.id,
        expiresAt: transition.expiresAt || Date.now() + 120000
      });
    } catch {
      state = monsterQueueService.stop(state, 'Game tab disconnected. Queue stopped.');
      await cr?.storage?.local?.set({ monsterQueue: state });
    }
  }
  return state;
}

export async function updateMonsterQueue(record: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get([
      'monsterQueue',
      'rpcCache',
      'popupRpcEnabled',
      'socketRefreshMode',
      'captureSettings',
      'troopCapacitySettings',
      'smartGatherState'
    ])) || {};
  if (stored.monsterQueue?.phase === 'waiting_gather' && stored.monsterQueue.tabId === tabId)
    return advanceGatherQueue('monster', record, stored, tabId, cr);
  if (monsterQueueService.terminal(stored.monsterQueue) || stored.monsterQueue.tabId !== tabId) return stored.monsterQueue;
  return saveMonsterTransition(
    monsterQueueService.advance(
      stored.monsterQueue,
      record,
      stored.rpcCache,
      Date.now(),
      experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
    ),
    stored,
    cr
  );
}

export async function saveTowerTransition(transition: any, stored: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  let state = transition.state;
  if (!towerRunnerService.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = towerRunnerService.stop(state, 'RPC settings disabled. Tower stopped.');
  }
  await cr?.storage?.local?.set({ towerRun: state });
  if (towerRunnerService.terminal(state)) {
    await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      await cr?.tabs?.sendMessage(state.tabId, {
        ...rpcMessageForSettings(stored, transition.calls),
        group: state.id,
        expiresAt: transition.expiresAt
      });
    } catch {
      state = towerRunnerService.stop(state, 'Game tab disconnected. Tower stopped.');
      await cr?.storage?.local?.set({ towerRun: state });
    }
  }
  return state;
}

export async function updateTowerRun(record: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get(['towerRun', 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  if (towerRunnerService.terminal(stored.towerRun) || stored.towerRun.tabId !== tabId) return stored.towerRun;
  return saveTowerTransition(towerRunnerService.advance(stored.towerRun, record, stored.rpcCache, Date.now()), stored, cr);
}

export async function saveDungeonTransition(transition: any, stored: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  let state = transition.state;
  if (!dungeonRunnerService?.terminal(state) && !rpcMessageForSettings(stored, [])) {
    state = dungeonRunnerService?.stop(state, 'RPC settings disabled. Dungeon stopped.');
  }
  await cr?.storage?.local?.set({ dungeonRun: state });
  if (dungeonRunnerService?.terminal(state)) {
    await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: state.id }).catch(() => {});
  } else if (transition.calls?.length) {
    try {
      const msg = rpcMessageForSettings(stored, transition.calls, false, { group: state.id, expiresAt: transition.expiresAt });
      await cr?.tabs?.sendMessage(state.tabId, msg);
    } catch {
      state = dungeonRunnerService?.stop(state, 'Game tab disconnected. Dungeon stopped.');
      await cr?.storage?.local?.set({ dungeonRun: state });
    }
  }
  return state;
}

export async function updateDungeonRun(record: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get(['dungeonRun', 'rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  if (!dungeonRunnerService || dungeonRunnerService.terminal(stored.dungeonRun) || stored.dungeonRun.tabId !== tabId)
    return stored.dungeonRun;
  return saveDungeonTransition(dungeonRunnerService.advance(stored.dungeonRun, record, stored.rpcCache, Date.now()), stored, cr);
}

const attemptedAutoJoinRallies = new Set<string>();

export async function evaluatePriorityAutoJoin(record: any, cache: any, stored: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  if (stored.popupRpcEnabled !== true || !stored.priorityAutoJoin?.enabled || !tabId) return;
  const minLevel = Number.isInteger(stored.priorityAutoJoin.minLevel) ? stored.priorityAutoJoin.minLevel : 10;
  if (
    record?.method !== 'POST' ||
    record.status !== 200 ||
    record.requestBodyTruncated ||
    record.responseBodyTruncated ||
    record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc'
  )
    return;
  let replies: any[] = [];
  try {
    const req = JSON.parse(record.requestBody);
    const res = JSON.parse(record.responseBody);
    replies = (req.calls || []).map((call: any) => ({
      call,
      result: res.results?.find((item: any) => item.ident === call.ident)?.result
    }));
  } catch {
    return;
  }

  for (const { call, result } of replies) {
    if (call.name !== 'getRallyById' || call.feature !== 'rally' || !result?.response?.rally) continue;
    const rally = result.response.rally;
    const rallyId = rally.rallyId;
    if (!rallyId) continue;

    const configId = rally.target?.objectConfigId ?? rally.mob?.mobConfigId;
    const level = experimentalDataHelper.bossLevel(configId);
    if (level === null || level < minLevel) continue;

    const myId = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id;
    const attemptKey = String(myId) + ':' + rallyId;
    if (attemptedAutoJoinRallies.has(attemptKey)) continue;
    const smart = stored.autoGatherSettings?.enabled && stored.autoGatherSettings.smartEnabled ? smartGatherService : null;
    let runtime = smart ? smart.sync(stored.smartGatherState, record, cache, Date.now()) : null;
    const unavailable =
      rally.route ||
      (Number.isInteger(rally.membersCapacityLeft) && rally.membersCapacityLeft <= 0) ||
      (Number.isFinite(rally.plannedStartTime) && rally.plannedStartTime - Date.now() < 3000);
    if (unavailable && runtime && runtime.reservation?.rallyId === rallyId && runtime.reservation.type === 'rally') {
      runtime.reservation = null;
      stored.smartGatherState = runtime;
      await cr?.storage?.local?.set({ smartGatherState: runtime });
    }
    if (rally.route || (smart && !Number.isFinite(rally.plannedStartTime))) continue;
    const knownRally = smartGatherService.list(cache.experimentalRallyTargets?.data).find((row: any) => row.rallyId === rallyId);
    if (
      Number.isFinite(knownRally?.rallyVersion) &&
      Number.isFinite(rally.rallyVersion) &&
      rally.rallyVersion < knownRally.rallyVersion
    )
      continue;
    if (myId != null) {
      if (String(rally.leader?.userId) === String(myId)) continue;
      if (Array.isArray(rally.members) && rally.members.some((m: any) => String(m.userId) === String(myId))) continue;
    }
    if (Number.isInteger(rally.membersCapacityLeft) && rally.membersCapacityLeft <= 0) continue;
    if (Number.isFinite(rally.plannedStartTime) && rally.plannedStartTime - Date.now() < 3000) continue;

    const heroes = cache.heroGetAll?.data;
    const summary = cache['getUnitSummary:unit']?.data;
    const marches = cache.marchStatus?.data?.marches;
    if (!heroes || !summary) continue;
    if (
      smart &&
      (!marches ||
        !summary.squads ||
        !smart.fresh(cache.marchStatus, Date.now()) ||
        !smart.fresh(cache['getUnitSummary:unit'], Date.now()))
    )
      continue;
    if (smart && runtime) {
      if (
        smart.activeQueue(stored) ||
        runtime.error ||
        runtime.pending ||
        runtime.attemptedRallies?.includes(rallyId) ||
        (runtime.reservation && runtime.reservation.rallyId !== rallyId)
      )
        continue;
      const settings = autoGatherService.normalizeAutoGatherSettings(stored.autoGatherSettings);
      if (smart.list(marches).length >= settings.maxMarches) {
        const release = smart.recallForRally(cache, stored, rally, Date.now());
        if (!release || runtime.reservation) {
          runtime.notice = { at: Date.now(), message: 'Rally skipped: no gathering squad can return in under 29s before it starts' };
          stored.smartGatherState = runtime;
          await cr?.storage?.local?.set({ smartGatherState: runtime });
          continue;
        }
        const info = cache.mineMap?.[release.march.mineId];
        const releaseConfigId = release.march.mineConfigId ?? info?.mineConfigId;
        const map = smart.context(cache);
        if (!releaseConfigId || !map.mapId) continue;
        const releaseCall = { name: 'stopMineGathering', feature: 'mine', args: { squadId: release.march.squadId } };
        runtime = {
          ...runtime,
          reservation: { type: 'rally', rallyId, mapId: rally.mapId, expiresAt: rally.plannedStartTime - 3000 },
          pending: {
            call: releaseCall,
            sentAt: Date.now(),
            phase: 'sent',
            mine: {
              mineId: release.march.mineId,
              mapId: map.mapId,
              configId: releaseConfigId,
              coordinates: release.march.targetCoordinates || info?.coordinates
            }
          },
          status: 'Releasing gathering slot for rally · estimated return ' + Math.ceil(release.ms / 1000) + 's'
        };
        const dispatch = rpcMessageForSettings(stored, [releaseCall]);
        if (dispatch) {
          await cr?.storage?.local?.set({ smartGatherState: runtime });
          stored.smartGatherState = runtime;
          await cr?.tabs
            ?.sendMessage(tabId, {
              ...dispatch,
              group: 'smart-gather',
              expiresAt: Math.min(Date.now() + 30000, rally.plannedStartTime - release.ms - 3000)
            })
            .catch(() => {});
        }
        continue;
      }
    }

    const availableHeroIds = experimentalDataHelper.availableHeroIds(heroes, summary, marches);
    const teamSetting = stored.priorityAutoJoin?.teamId || stored.raidPreferences?.teamId || 'highest';
    let targetTeamHeroes = null;

    if (teamSetting === 'highest') {
      targetTeamHeroes = experimentalDataHelper.highestPowerHeroes(heroes, availableHeroIds);
    } else if (teamSetting === 'weakest') {
      const weakest = experimentalDataHelper.lowestPowerHeroes(heroes);
      if (weakest.length === 5 && weakest.every((id: number) => availableHeroIds.includes(id))) {
        targetTeamHeroes = weakest;
      }
    } else {
      let teamHeroIds = null;
      const allTeams = experimentalDataHelper.autoJoinTeamOptions(
        cache.teamGetAll?.data,
        heroes,
        stored.customTeams?.[String(myId)] || [],
        availableHeroIds
      );
      const matched = allTeams.find((t: any) => t.id === teamSetting);
      if (matched && Array.isArray(matched.heroIds) && matched.heroIds.length === 5) {
        teamHeroIds = matched.heroIds;
      } else if (Array.isArray(stored.priorityAutoJoin?.heroIds) && stored.priorityAutoJoin.heroIds.length === 5) {
        teamHeroIds = stored.priorityAutoJoin.heroIds;
      } else if (Array.isArray(stored.raidPreferences?.heroIds) && stored.raidPreferences.heroIds.length === 5) {
        teamHeroIds = stored.raidPreferences.heroIds;
      }
      if (Array.isArray(teamHeroIds) && teamHeroIds.length === 5 && teamHeroIds.every((id: number) => availableHeroIds.includes(id))) {
        targetTeamHeroes = teamHeroIds;
      }
    }

    let heroIds = targetTeamHeroes;
    if (!heroIds || heroIds.length !== 5) {
      heroIds = experimentalDataHelper.highestPowerHeroes(heroes, availableHeroIds);
    }
    if (!heroIds || heroIds.length !== 5) continue;

    const cap = experimentalDataHelper.capacityModel(
      heroIds,
      heroes,
      cache.troopCapacityEvidence?.data,
      experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings),
      myId != null ? myId : undefined
    ).total;
    if (cap == null || cap <= 0) continue;
    const troops = experimentalDataHelper.allocateTroops(summary, cap);
    const squad = experimentalDataHelper.buildSquad(heroIds, troops);
    if (!squad) continue;

    const joinCall = experimentalDataHelper.buildJoinRallyCall(rally.mapId, rallyId, squad);
    if (!joinCall) continue;

    const dispatch = rpcMessageForSettings(stored, [joinCall]);
    if (dispatch) {
      attemptedAutoJoinRallies.add(attemptKey);
      const existingAutoJoins = Array.isArray(cache.priorityAutoJoinedRallies?.data) ? cache.priorityAutoJoinedRallies.data : [];
      if (!existingAutoJoins.includes(rallyId)) {
        cache.priorityAutoJoinedRallies = {
          key: 'priorityAutoJoinedRallies',
          group: 'internal',
          updatedAt: new Date().toISOString(),
          data: [...existingAutoJoins, rallyId].slice(-200),
        };
      }
      const marchList = cache.marchStatus?.data?.marches;
      if (Array.isArray(marchList)) {
        const targetSquadId = (squad as any)?.squadId;
        const march = marchList.find((m: any) => m?.rally?.id === rallyId || (targetSquadId && m?.squadId === targetSquadId));
        if (march) {
          march.rally = { ...march.rally, isAutoJoin: true, autoJoinSource: 'extension', isHelperAutoJoin: true };
        }
      }
      await cr?.storage?.local?.set({ rpcCache: cache });
      if (smart && runtime) {
        runtime.attemptedRallies = [...(runtime.attemptedRallies || []), rallyId].slice(-100);
        runtime.pending = { call: joinCall, sentAt: Date.now(), phase: 'sent' };
        await cr?.storage?.local?.set({ smartGatherState: runtime });
        stored.smartGatherState = runtime;
      }
      cr?.tabs
        ?.sendMessage?.(tabId, {
          ...dispatch,
          ...(smart ? { group: 'smart-gather', expiresAt: rally.plannedStartTime - 3000 } : {})
        })
        ?.catch?.(() => {});
    }
  }
}

export function scheduleMailExpiry(cache: any = {}, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const helper = mailService;
  const rawDeadlines = [
    ...helper.list(cache.mailStatus?.data?.letters),
    ...helper.list(cache.mailGetAll?.data?.letters ?? cache.mailGetAll?.letters),
    ...helper.list(cache.mailStatus?.data?.reports).map((row: any) => ({ availableUntil: (helper.expiry(row, 'report') || 0) / 1000 })),
    ...helper.list(cache['getPage:report']?.data?.reports).map((row: any) => ({ availableUntil: (helper.expiry(row, 'report') || 0) / 1000 }))
  ].map((row: any) => helper.expiry(row));
  const deadlines = rawDeadlines.filter((at: any): at is number => typeof at === 'number' && Number.isFinite(at) && at > Date.now());
  if (deadlines.length) cr?.alarms?.create?.('hwa-mail-expiry', { when: Math.min(...deadlines) });
  else cr?.alarms?.clear?.('hwa-mail-expiry');
}

export async function pruneExpiredMail(customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get('rpcCache')) || {};
  const result = mailService.prune(stored.rpcCache || {}, Date.now());
  if (result.changed) await cr?.storage?.local?.set({ rpcCache: result.cache });
  scheduleMailExpiry(result.cache, cr);
  await reconcileMailClaim(result.cache, cr);
  return { ok: true, removedExpired: result.changed };
}

export async function reconcileMailClaim(cache: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const state = (await cr?.storage?.local?.get('mailClaimState'))?.mailClaimState;
  if (!state?.pending || cache?.accountStatus?.data?.id == null) return;
  const helper = mailService;
  const request = state.pending;
  const receipt = helper
    .list(cache.mailClaimReceipts?.data)
    .find((row: any) => row.token === request.token && String(row.accountId) === String(state.accountId));
  const changedAccount = String(cache.accountStatus.data.id) !== String(state.accountId);
  const status = cache.mailStatus?.data || {};
  const collection = request.kind === 'letters' ? helper.list(status.letters) : helper.list(status.reports);
  const observedAt = request.kind === 'letters' ? status.lettersObservedAt : status.reportsObservedAt;
  const snapshotSettled =
    String(status.accountId) === String(state.accountId) &&
    Date.parse(observedAt) >= request.sentAt &&
    request.ids.every(
      (id: string) =>
        !collection.some(
          (row: any) => String(row.id ?? row.letterId) === id && (request.kind === 'letters' ? helper.unclaimed(row) : row.claimedReward === false)
        )
    );
  const expiredAll = request.deadline && Date.now() >= request.deadline;
  if (receipt || changedAccount || snapshotSettled || expiredAll) {
    if (state.tabId && (changedAccount || expiredAll))
      await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: 'mail-claim' }).catch(() => {});
    await cr?.storage?.local?.set({
      mailClaimState: {
        accountId: cache.accountStatus.data.id,
        pending: null,
        message: changedAccount
          ? 'Account changed. Refresh mail.'
          : receipt
          ? receipt.success
            ? 'Rewards claimed by game.'
            : receipt.error || 'Claim rejected by game.'
          : expiredAll
          ? 'Mail expired while awaiting confirmation. Refresh to check the outcome.'
          : 'Mail list updated by game. Check the returned rewards.'
      }
    });
  }
}

export async function claimMail(message: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  await pruneExpiredMail(cr);
  const stored =
    (await cr?.storage?.local?.get(['rpcCache', 'mailClaimState', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  if (stored.mailClaimState?.pending) return { ok: false, error: 'A mail claim is awaiting game confirmation.' };
  if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Mail claims are paused by shared RPC settings.' };
  const helper = mailService;
  const cache = stored.rpcCache || {};
  const accountId = cache.accountStatus?.data?.id;
  if (accountId == null || String(message.accountId) !== String(accountId))
    return { ok: false, error: 'Current mail account changed. Refresh mail.' };
  const rows = helper.rows(cache);
  const kind = message.reports === true ? 'reports' : 'letters';
  const ids: string[] = (
    kind === 'letters'
      ? Array.isArray(message.ids)
        ? [...new Set(message.ids.map(String))]
        : []
      : rows.reports.filter((row: any) => row.canClaim).map((row: any) => String(row.id))
  ) as string[];
  const candidates = kind === 'letters' ? rows.letters : rows.reports;
  if (
    !rows.scoped ||
    !ids.length ||
    (kind === 'letters' && ids.length > 100) ||
    ids.some((id: string) => !candidates.some((row: any) => String(row.id) === id && row.canClaim))
  )
    return { ok: false, error: 'No matching unclaimed, unexpired mail. Refresh first.' };
  const tab = await findActiveGameTab(cr);
  if (!tab?.id) return { ok: false, error: 'Open the game to claim mail.' };
  const context = await cr?.tabs?.sendMessage(tab.id, { kind: 'game-account-context' }).catch(() => null);
  if (!context?.ok || String(context.accountId) !== String(accountId))
    return { ok: false, error: 'Refresh the game to verify the mail account.' };
  const token = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replaceAll('-', '');
  const call =
    kind === 'letters'
      ? { name: 'mailFarm', args: { letterIds: ids }, ident: token }
      : { name: 'readAndClaimAll', feature: 'report', args: { types: helper.reportTypes }, ident: token };
  if (!helper.validateClaim(call)) return { ok: false, error: 'Invalid mail claim.' };
  const latest =
    (await cr?.storage?.local?.get(['rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  const latestRows = helper.rows(latest.rpcCache || {});
  const selected = kind === 'letters' ? latestRows.letters : latestRows.reports;
  if (
    String(latest.rpcCache?.accountStatus?.data?.id) !== String(accountId) ||
    !rpcMessageForSettings(latest, []) ||
    ids.some((id: string) => !selected.some((row: any) => String(row.id) === id && row.canClaim))
  )
    return { ok: false, error: 'Mail or RPC settings changed. Refresh before claiming.' };
  const now = Date.now();
  const deadlines = selected.filter((row: any) => ids.includes(String(row.id))).map((row: any) => row.expiresAtMs ?? Infinity);
  const queueDeadline = Math.min(...deadlines);
  const deadline = Math.max(...deadlines);
  if (queueDeadline <= now) return { ok: false, error: 'Mail has expired. Refresh mail.' };
  const dispatch = rpcMessageForSettings(latest, [call, { name: 'mailGetAll' }], true);
  const state = {
    accountId,
    tabId: tab.id,
    pending: { token, kind, ids, sentAt: now, deadline: Number.isFinite(deadline) ? deadline : null },
    message: 'Waiting for mail claim confirmation.'
  };
  await cr?.storage?.local?.set({ mailClaimState: state });
  try {
    await cr?.tabs?.sendMessage(tab.id, { ...dispatch, group: 'mail-claim', expiresAt: Math.min(now + 30000, queueDeadline) });
  } catch (_) {
    return { ok: false, error: 'Claim transport uncertain. Pending retained; refresh game data before retrying.' };
  }
  return { ok: true, queued: dispatch.kind !== 'refresh-rpc' };
}

export async function reconcileSpeedup(cache: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get('speedupSpendState')) || {};
  const state = stored.speedupSpendState;
  if (!state?.pending || cache?.accountStatus?.data?.id == null) return;
  const receipt = speedupService.list(cache.speedupReceipts?.data).find((row: any) => row.token === state.pending.token);
  if (String(cache?.accountStatus?.data?.id) !== String(state.accountId)) {
    if (state.tabId) await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: 'manual-speedup' }).catch(() => {});
    await cr?.storage?.local?.set({
      speedupSpendState: { accountId: cache?.accountStatus?.data?.id, pending: null, message: 'Account changed. Refresh speedup inventory.' }
    });
  } else if (receipt && String(receipt.accountId) === String(state.accountId) && Date.parse(receipt.at) >= state.pending.sentAt) {
    await cr?.storage?.local?.set({
      speedupSpendState: {
        ...state,
        pending: null,
        message: receipt.success ? 'Speedup confirmed by game.' : receipt.error || 'Speedup rejected by game.'
      }
    });
  }
}

export async function useConfirmedSpeedup(message: any, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get(['rpcCache', 'speedupSpendState', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  const cache = stored.rpcCache || {};
  const helper = speedupService;
  await reconcileSpeedup(cache, cr);
  const state = (await cr?.storage?.local?.get('speedupSpendState'))?.speedupSpendState;
  if (message.confirmed !== true) return { ok: false, error: 'Confirm the item spend before using speedup.' };
  if (state?.pending) return { ok: false, error: 'A speedup is awaiting game confirmation. Do not resend it.' };
  if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Speedup paused by shared RPC settings.' };
  const request = message.quote;
  const now = Date.now();
  const current = helper.quote(cache, request?.kind, request?.targetId, request?.itemId, request?.amount, now);
  if (!current || helper.signature(current) !== helper.signature(request))
    return { ok: false, error: 'Target, inventory or remaining time changed. Refresh and confirm again.' };
  const tab = await findActiveGameTab(cr);
  if (!tab?.id) return { ok: false, error: 'Open the game before using speedup.' };
  const context = await cr?.tabs?.sendMessage(tab.id, { kind: 'game-account-context' }).catch(() => null);
  if (!context?.ok || String(context.accountId) !== current.accountId)
    return { ok: false, error: 'Refresh the game to verify the current account.' };
  const latest =
    (await cr?.storage?.local?.get(['rpcCache', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])) || {};
  const sentAt = Date.now();
  const finalQuote = helper.quote(latest.rpcCache || {}, request.kind, request.targetId, request.itemId, request.amount, sentAt);
  if (!finalQuote || helper.signature(finalQuote) !== helper.signature(request) || !rpcMessageForSettings(latest, [])) {
    return { ok: false, error: 'Target, inventory, remaining time or RPC settings changed. Review and confirm again.' };
  }
  const call = helper.buildCall(finalQuote, sentAt);
  if (!call) return { ok: false, error: 'Unsupported speedup request.' };
  const token = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replaceAll('-', '');
  call.ident = token;
  const dispatch = rpcMessageForSettings(latest, [call]);
  const next = {
    accountId: current.accountId,
    tabId: tab.id,
    pending: { token, call, sentAt },
    message: 'Speedup requested. Waiting for game confirmation; do not resend.'
  };
  await cr?.storage?.local?.set({ speedupSpendState: next });
  try {
    await cr?.tabs?.sendMessage(tab.id, { ...dispatch, group: 'manual-speedup', expiresAt: sentAt + 30000 });
  } catch (_) {
    return { ok: false, error: 'Speedup transport uncertain. Pending request retained; refresh game data before continuing.' };
  }
  return { ok: true, queued: dispatch.kind === 'queue-rpc' };
}

export async function runFreeSpin(manual = false, _record: any = null, sourceTabId: any = null, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get([
      'autoFreeSpinEnabled',
      'autoFreeSpinState',
      'rpcCache',
      'popupRpcEnabled',
      'socketRefreshMode',
      'captureSettings'
    ])) || {};
  const cache = stored.rpcCache || {};
  const policy = freeAlchemyPolicy;
  const accountId = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id;
  const now = Date.now();
  let state = stored.autoFreeSpinState ? structuredClone(stored.autoFreeSpinState) : null;
  if (!manual && !stored.autoFreeSpinEnabled && !state?.pending) return { ok: false, error: 'Auto free spin is disabled.' };
  if (!policy || accountId == null) return { ok: false, error: 'Waiting for current game account.' };
  if (state && String(state.accountId) !== String(accountId)) {
    if (state.tabId) await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: 'free-alchemy-spin' }).catch(() => {});
    state = null;
  }
  state = state || { accountId, pending: null };
  if (
    state.pending?.automatic &&
    (!stored.autoFreeSpinEnabled || !rpcMessageForSettings(stored, []) || state.pending.mode !== stored.socketRefreshMode) &&
    !state.pending.cancelRequested
  ) {
    if (state.tabId) await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: 'free-alchemy-spin' }).catch(() => {});
    state.pending.cancelRequested = true;
  }
  const save = async (status: string, wakeAt: any = null) => {
    state.status = status;
    state.wakeAt = wakeAt;
    if (JSON.stringify(state) !== JSON.stringify(stored.autoFreeSpinState)) await cr?.storage?.local?.set({ autoFreeSpinState: state });
    if (Number.isFinite(wakeAt)) cr?.alarms?.create?.('hwa-auto-free-spin', { when: Math.max(now + 1000, wakeAt) });
  };
  const receipt = cache.freeAlchemySpinStatus;
  const quota = cache['resource:refillable:53'];
  if (state.pending?.phase === 'sent') {
    const request = state.pending;
    const confirmed = receipt?.data?.token && receipt.data.token !== request.previous && Date.parse(receipt.updatedAt) >= request.sentAt;
    const consumed =
      Date.parse(quota?.updatedAt) > request.sentAt && quota?.data?.amount === 0 && quota.data.lastRefillAt >= request.sentAt - 1000;
    if (confirmed || consumed) {
      if (request.queued && state.tabId)
        await cr?.tabs?.sendMessage(state.tabId, { kind: 'drop-rpc-group', group: 'free-alchemy-spin' }).catch(() => {});
      state.pending = null;
      state.lastResult = confirmed
        ? receipt.data.success
          ? 'Free spin confirmed'
          : receipt.data.error
        : 'Free spin quota updated by game';
    } else {
      const refreshQuota = rpcMessageForSettings(stored, [{ name: 'userGetInfo' }]);
      if (refreshQuota && state.tabId && now - request.sentAt >= 30000 && now - (request.refreshAt || 0) >= 30000) {
        request.refreshAt = now;
        try {
          const context = await cr?.tabs?.sendMessage(state.tabId, { kind: 'free-spin-context' });
          if (context?.ok && String(context.accountId) === String(accountId))
            await cr?.tabs?.sendMessage(state.tabId, { ...refreshQuota, group: 'free-alchemy-refresh', expiresAt: now + 30000 });
        } catch (_) {}
      }
      await save('Free spin awaiting server confirmation; no automatic retry', now + 30000);
      return { ok: true, pending: true, queued: request.queued };
    }
  }
  if (!manual && !stored.autoFreeSpinEnabled) {
    await save('Auto free spin is disabled');
    return { ok: false, error: state.status };
  }
  if (!rpcMessageForSettings(stored, [])) {
    await save('Free spin paused by shared RPC settings');
    return { ok: false, error: state.status };
  }
  const available = policy.availability(cache, now);
  if (!available.ready) {
    state.pending = null;
    await save('Waiting for free spin cooldown', available.readyAt);
    return { ok: false, error: 'Free spin cooldown has not expired.' };
  }
  let tabId = sourceTabId;
  let context: any = null;
  if (tabId) {
    try {
      const ping = await cr?.tabs?.sendMessage(tabId, { kind: 'free-spin-context' });
      if (ping?.ok) context = ping;
    } catch (_) {}
  }
  if (!context && state.tabId) {
    try {
      const ping = await cr?.tabs?.sendMessage(state.tabId, { kind: 'free-spin-context' });
      if (ping?.ok) {
        tabId = state.tabId;
        context = ping;
      } else {
        state.tabId = null;
      }
    } catch (_) {
      state.tabId = null;
    }
  }
  if (!context) {
    const candidateTabs = await findAllGameTabs(cr);
    for (const cand of candidateTabs) {
      if (cand.id === tabId || cand.id === state.tabId) continue;
      try {
        const ping = await cr?.tabs?.sendMessage(cand.id, { kind: 'free-spin-context' });
        if (ping?.ok) {
          tabId = cand.id;
          context = ping;
          break;
        }
      } catch (_) {}
    }
    if (!tabId && candidateTabs.length > 0) {
      tabId = candidateTabs[0].id;
    }
  }
  if (!tabId) {
    await save('Open the game to use free spin', now + 30000);
    return { ok: false, error: state.status };
  }
  if (!context?.ok) {
    state.tabId = null;
    await save('Free spin bridge unavailable; press F5 in the game tab', now + 30000);
    return { ok: false, error: state.status };
  }
  if (!context.accountId) {
    const refreshQuota = rpcMessageForSettings(stored, [{ name: 'userGetInfo' }, { name: 'user_getNextDayTime' }]);
    if (refreshQuota) {
      state.pending = { phase: 'refresh', sentAt: now, expiresAt: now + 30000 };
      await save('Refreshing free spin quota', now + 30000);
      try {
        await cr?.tabs?.sendMessage(tabId, { ...refreshQuota, group: 'free-alchemy-refresh', expiresAt: now + 30000 });
        return { ok: true, pending: true };
      } catch (_) {
        state.pending = null;
        state.tabId = null;
        await save('Free spin bridge unavailable; press F5 in the game tab', now + 30000);
        return { ok: false, error: state.status };
      }
    }
    await save('Free spin needs current account data; press F5 in the game tab', now + 30000);
    return { ok: false, error: state.status };
  }
  if (String(context.accountId) !== String(accountId)) {
    await save('Free spin needs current account data; press F5 in the game tab', now + 30000);
    return { ok: false, error: state.status };
  }
  state.tabId = tabId;
  const cycle = policy.cycle(cache, now);
  if (!manual && state.attemptedCycle === cycle) {
    await save(state.lastResult || 'Free spin already attempted; waiting for a new cooldown or game day', policy.day(cache, now).next);
    return { ok: false, error: state.status };
  }
  if (!manual) {
    const refreshed = state.pending?.phase === 'refresh' && Date.parse(quota?.updatedAt) >= state.pending.sentAt;
    if (!refreshed) {
      if (state.pending?.phase === 'refresh' && now < state.pending.expiresAt) {
        await save('Refreshing free spin quota', state.pending.expiresAt);
        return { ok: true, pending: true };
      }
      state.pending = { phase: 'refresh', sentAt: now, expiresAt: now + 30000 };
      await save('Refreshing free spin quota', now + 30000);
      try {
        await cr?.tabs?.sendMessage(tabId, {
          ...rpcMessageForSettings(stored, [{ name: 'userGetInfo' }, { name: 'user_getNextDayTime' }]),
          group: 'free-alchemy-refresh',
          expiresAt: now + 30000
        });
      } catch (_) {
        state.pending = null;
        state.tabId = null;
        await save('Free spin bridge unavailable; press F5 in the game tab', now + 30000);
      }
      return { ok: true, pending: true };
    }
  }
  const dispatch = rpcMessageForSettings(stored, [{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }]);
  state.attemptedCycle = cycle;
  state.pending = {
    phase: 'sent',
    sentAt: now,
    previous: receipt?.data?.token,
    automatic: !manual,
    mode: stored.socketRefreshMode,
    queued: dispatch.kind === 'queue-rpc'
  };
  await save(state.pending.queued ? 'Free spin queued for game traffic' : 'Free spin awaiting server confirmation', now + 30000);
  try {
    await cr?.tabs?.sendMessage(tabId, { ...dispatch, group: 'free-alchemy-spin', expiresAt: now + 30000 });
  } catch (_) {
    await save('Free spin transport unavailable; press F5 and sync game data before retrying', now + 30000);
    return { ok: false, error: state.status };
  }
  return { ok: true, queued: state.pending.queued };
}

let lastAutoGatherSearchAt = 0;
let lastAutoGatherPendingType: any = null;
let lastAutoGatherPendingLevel: any = null;

export async function dropMineDefenseRpc(tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get('smartGatherState')) || {};
  const defense = stored.smartGatherState?.defense;
  const groups = new Set([
    'mine-defense',
    ...[defense?.pending, ...(defense?.waiting || [])].filter(Boolean).map((p: any) => 'mine-defense:' + p.attackRouteId)
  ]);
  for (const group of groups) await cr?.tabs?.sendMessage(tabId, { kind: 'drop-rpc-group', group }).catch(() => {});
}

export async function evaluateMineDefense(record: any, cache: any, stored: any, state: any, tabId: number, now: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const helper = mineDefenseService;
  if (!helper) return { state, hold: false };
  state = helper.sync(state, record, cache, now);
  const defense = state.defense;
  const plan = helper.plan(cache, defense, now, stored?.autoGatherSettings, stored);
  state.wakeAt = plan?.wakeAt || null;
  const planWakeAt = plan?.wakeAt;
  if (planWakeAt && planWakeAt > now) cr?.alarms?.create?.('hwa-mine-defense', { when: planWakeAt });
  if (defense.pending && plan?.action === 'recall' && plan.march && defense.pending.call.args.squadId !== plan.march.squadId) {
    defense.waiting = [...(defense.waiting || []), defense.pending].slice(-20);
    defense.pending = null;
  }
  for (const request of [defense.pending, ...(defense.waiting || [])].filter(Boolean)) {
    if (!cache.incomingMineAttacks?.data?.attacks?.[request.attackRouteId] || now >= request.impactAt)
      await cr?.tabs?.sendMessage(tabId, { kind: 'drop-rpc-group', group: 'mine-defense:' + request.attackRouteId }).catch(() => {});
  }
  const pendingDefense = defense.pending;
  let calls: any[] = [];
  let expiresAt = now + 15000;
  let group = 'mine-defense';
  if (pendingDefense) {
    const active = cache.incomingMineAttacks?.data?.attacks?.[pendingDefense.attackRouteId];
    if (!active || now >= pendingDefense.impactAt) {
      await cr?.tabs?.sendMessage(tabId, { kind: 'drop-rpc-group', group: 'mine-defense:' + pendingDefense.attackRouteId }).catch(() => {});
    }
    if (now - (defense.refreshAt || 0) >= 3000) {
      calls = [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }];
      defense.refreshAt = now;
    }
    defense.status = pendingDefense.phase === 'returning' ? 'Threatened squad returning to base' : 'Awaiting defensive recall confirmation';
  } else if (plan?.action === 'refresh' && now - (defense.refreshAt || 0) >= 5000) {
    calls = [
      { name: 'getMarches', feature: 'march' },
      { name: 'getUnitSummary', feature: 'unit' },
      { name: 'getHealing', feature: 'unit' },
      { name: 'getSummary', feature: 'building' },
      { name: 'getIncomingMarches', feature: 'march', args: {} }
    ];
    defense.refreshAt = now;
    defense.status = plan.reason;
  } else if (plan?.action === 'clear_slot') {
    calls = [plan.call];
    defense.intercept = plan.intercept;
    expiresAt = plan.attack?.impactAt || (now + 15000);
    group = 'mine-defense:intercept:' + (plan.attack?.routeId || 'slot');
    defense.status = plan.reason;
  } else if (plan?.action === 'intercept') {
    calls = plan.calls || [plan.call];
    defense.intercept = plan.intercept;
    if (plan.attack && plan.march) {
      const key = plan.attack.routeId + ':' + plan.march.squadId;
      defense.attempted = [...(defense.attempted || []), key].slice(-100);
    }
    expiresAt = plan.attack?.impactAt || (now + 15000);
    group = 'mine-defense:intercept:' + (plan.attack?.routeId || 'active');
    defense.status = plan.reason;
  } else if (plan?.action === 'switch_back') {
    calls = plan.calls || [plan.call];
    defense.intercept = null;
    expiresAt = now + 15000;
    group = 'mine-defense:switch-back';
    defense.status = plan.reason;
  } else if (plan?.action === 'recall' && plan.attack && plan.march) {
    const attack = plan.attack;
    const key = attack.routeId + ':' + plan.march.squadId;
    defense.attempted = [...(defense.attempted || []), key].slice(-100);
    defense.pending = {
      call: plan.call,
      sentAt: now,
      phase: 'sent',
      mine: plan.mine,
      attackRouteId: attack.routeId,
      impactAt: attack.impactAt
    };
    calls = [plan.call];
    expiresAt = attack.impactAt;
    group = 'mine-defense:' + attack.routeId;
    defense.status = stored.socketRefreshMode === 'direct' ? plan.reason : 'Defensive recall queued · needs game RPC before impact';
  } else {
    if (plan?.intercept) defense.intercept = plan.intercept;
    defense.status = plan?.reason || '';
  }
  if (!calls.length && defense.waiting?.length && now - (defense.refreshAt || 0) >= 3000) {
    calls = [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }];
    defense.refreshAt = now;
  }
  const incomingTtl = worldReadService.incomingTtl(cache, now) || 15000;
  if (
    !calls.length &&
    !defense.pending &&
    (!cache.incomingMineAttacks?.data?.snapshotAt || now - (Date.parse(cache.incomingMineAttacks?.updatedAt) || 0) > incomingTtl) &&
    now - (defense.refreshAt || 0) >= 5000
  ) {
    calls = [{ name: 'getIncomingMarches', feature: 'march', args: {} }];
    defense.refreshAt = now;
  }
  if (calls.length) {
    const returningUntil = defense.pending?.phase === 'returning' ? defense.pending.returnAt : null;
    calls =
      Number.isFinite(returningUntil) && now < returningUntil
        ? calls.filter((call) => !['getMarches', 'getUnitSummary'].includes(call.name))
        : passiveMarchReads(cache, calls, now, Math.max(now - 10000, defense.pending?.sentAt || 0, returningUntil || 0));
  }
  if (calls.length) {
    calls = await passiveWorldReads(cache, calls, tabId, now, {}, cr);
  }
  if (calls.length) {
    const dispatch = rpcMessageForSettings(stored, calls);
    if (dispatch) {
      await cr?.storage?.local?.set({ smartGatherState: state });
      await cr?.tabs?.sendMessage(tabId, { ...dispatch, group, expiresAt }).catch(() => {
        defense.status = 'Defensive recall could not reach the game tab';
      });
    }
  }
  return { state, hold: Boolean(defense.pending || defense.waiting?.length || defense.intercept || (plan && (plan.action as string) !== 'monitor')) };
}

export async function evaluateSmartGather(
  record: any,
  cache: any,
  stored: any,
  tabId: number,
  now: number = Date.now(),
  customChrome?: any
) {
  const cr = getActiveChrome(customChrome);
  const smart = smartGatherService;
  if (cache?.accountStatus?.data?.id == null) return;
  if (stored.smartGatherState?.accountId != null && String(stored.smartGatherState.accountId) !== String(cache.accountStatus.data.id)) {
    await dropMineDefenseRpc(tabId, cr);
    await cr?.tabs?.sendMessage(tabId, { kind: 'drop-rpc-group', group: 'smart-gather' }).catch(() => {});
  }
  let state = smart.sync(stored.smartGatherState, record, cache, now);
  if (!rpcMessageForSettings(stored, [])) {
    state.status = 'Smart gathering paused by shared RPC settings';
    await cr?.storage?.local?.set({ smartGatherState: state });
    return;
  }
  const defense = await evaluateMineDefense(record, cache, stored, state, tabId, now, cr);
  state = defense.state;
  if (defense.hold) {
    state.status = state.defense.status || 'Monitoring threatened mine';
    state.updatedAt = now;
    await cr?.storage?.local?.set({ smartGatherState: state });
    stored.smartGatherState = state;
    return;
  }
  if (state.reservation?.queueId && smart.activeQueue(stored)?.id !== state.reservation.queueId) state.reservation = null;
  if (state.reservation?.type === 'rally' && !stored.priorityAutoJoin?.enabled) state.reservation = null;
  let calls: any[] = [];
  let reason = state.error;
  if (state.pending) {
    const method = state.pending.call.name + (state.pending.call.feature ? ':' + state.pending.call.feature : '');
    reason =
      state.pending.phase === 'returning'
        ? 'Waiting for recalled gathering squad to return'
        : state.pending.phase === 'refresh'
        ? `Confirming ${method} with current march/unit snapshots`
        : `Waiting for ${method} response · ${stored.socketRefreshMode === 'direct' ? 'Direct' : 'queued; requires a game RPC carrier'}`;
    if (['returning', 'refresh'].includes(state.pending.phase) && now - (state.lastRefreshAt || 0) >= 5000) {
      const returnAt =
        state.pending.phase === 'returning'
          ? Math.max(
              state.pending.returnAt || 0,
              cache.marchReturnStatus?.data?.completions?.[state.pending.squadId ?? state.pending.call.args?.squadId] || 0
            )
          : 0;
      if (now >= returnAt)
        calls = passiveMarchReads(
          cache,
          [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }],
          now,
          Math.max(state.pending.confirmedAt || 0, returnAt, now - 10000)
        );
      state.lastRefreshAt = now;
    }
  } else if (!state.error && state.reservation?.type === 'rally' && now < state.reservation.expiresAt) {
    reason = 'Rechecking rally capacity and start time after gathering return';
    if (now - (state.lastRefreshAt || 0) >= 5000) {
      const call = { name: 'getRallyById', feature: 'rally', args: { rallyId: state.reservation.rallyId, mapId: state.reservation.mapId } };
      calls = [call];
      state.lastRefreshAt = now;
      state.pending = { call, sentAt: now, phase: 'sent' };
    }
  } else if (!state.error && state.reservation?.type === 'joinedRally') {
    const reservation = state.reservation;
    const exists = smart.list(cache.marchStatus?.data?.marches).some((m: any) => m.squadId === reservation.squadId);
    const deployed = smart.list(cache['getUnitSummary:unit']?.data?.squads).some((s: any) => (s.id ?? s.squadId) === reservation.squadId);
    if (
      Date.parse(cache.marchStatus?.updatedAt) >= reservation.confirmedAt &&
      Date.parse(cache['getUnitSummary:unit']?.updatedAt) >= reservation.confirmedAt &&
      !exists &&
      !deployed
    )
      state.reservation = null;
    else if (now - (state.lastRefreshAt || 0) >= 5000) {
      calls = passiveMarchReads(
        cache,
        [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }],
        now,
        Math.max(reservation.confirmedAt || 0, now - 10000)
      );
      state.lastRefreshAt = now;
    }
    reason = 'Waiting for rally team to return before resuming gathering';
  } else if (!state.error) {
    if (state.reservation?.type === 'rally') state.reservation = null;
    if (state.marchLimitBackoffUntil && now < state.marchLimitBackoffUntil) {
      reason = 'Server march limit reached (MarchLimitExceeded); waiting for squad return';
      if (now - (state.lastRefreshAt || 0) >= 5000) {
        calls = [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }];
        state.lastRefreshAt = now;
      }
    } else {
      const plan = autoGatherService.planAutoGather(cache, { ...stored, smartGatherState: state }, now);
      reason = plan.reason || (plan.action === 'gather' ? 'Dispatching gathering squad' : 'Searching for resource mine');
      calls = plan.calls || (plan.call ? [plan.call] : []);
      if (calls.length && now - (state.lastPlanAt || 0) < 5000) calls = [];
      if (calls.length) calls = passiveMarchReads(cache, calls, now);
      if (calls.length) {
        state.lastPlanAt = now;
        if (plan.nearest) state.nearest = plan.nearest;
        state.pending = { ...plan.pending, call: calls[0], sentAt: now, expiresAt: now + 30000, phase: 'sent' };
      }
    }
  }
  const retriedRead = state.readTimeout && calls.some((c) => c.name + ':' + (c.feature || '') === state.readTimeout?.key);
  const dispatch = calls.length ? (retriedRead ? { kind: 'refresh-rpc', calls } : rpcMessageForSettings(stored, calls)) : null;
  if (dispatch) {
    await cr?.tabs?.sendMessage(tabId, { ...dispatch, group: 'smart-gather', expiresAt: now + 30000 }).catch(() => {
      state.pending = null;
      state.error = 'Game tab RPC bridge unavailable; press F5 in the game tab and restart Smart gathering';
    });
  }
  const noticeValid = state.notice && ((state.notice.expiresAt ?? state.notice.at + 30000) > now);
  state.status = state.error || (noticeValid ? state.notice?.message : null) || reason || 'Waiting';
  state.updatedAt = now;
  await cr?.storage?.local?.set({ smartGatherState: state });
  stored.smartGatherState = state;
}

export async function evaluateAutoGather(record: any, currentCache: any, stored: any, tabId: number, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  if (!tabId) return;
  if (
    stored.smartGatherState &&
    smartGatherService &&
    (stored.popupRpcEnabled !== true || !stored.autoGatherSettings?.enabled || !stored.autoGatherSettings.smartEnabled)
  ) {
    const state = smartGatherService.sync(stored.smartGatherState, record, currentCache, Date.now());
    mineDefenseService.sync(state, record, currentCache, Date.now());
    await cr?.storage?.local?.set({ smartGatherState: state });
  }
  if (stored.popupRpcEnabled !== true || !stored.autoGatherSettings?.enabled) return;

  const helper = autoGatherService;
  if (!helper) return;

  const now = Date.now();
  if (stored.autoGatherSettings.smartEnabled && smartGatherService) {
    await evaluateSmartGather(record, currentCache, stored, tabId, now, cr);
    return;
  }
  const isLoad = helper.isGameLoadRecord(record);
  const isReturn = helper.isMarchReturnRecord(record, stored.rpcCache, currentCache, now);
  const isMineSearch =
    typeof record?.responseBody === 'string' &&
    record.responseBody.includes('"mines"') &&
    typeof record?.requestBody === 'string' &&
    record.requestBody.includes('"searchMine"');
  const isMineAction =
    typeof record?.requestBody === 'string' &&
    (record.requestBody.includes('"attackMine"') || record.requestBody.includes('"searchMine"'));
  const isMarchesUpdate = typeof record?.requestBody === 'string' && record.requestBody.includes('"getMarches"');

  if (!isLoad && !isReturn && !isMineSearch && !isMineAction && !isMarchesUpdate) return;

  const plan = helper.planAutoGather(currentCache, stored, now);
  if (plan.action === 'search') {
    if (
      now - lastAutoGatherSearchAt < 10000 &&
      lastAutoGatherPendingType === plan.mineType &&
      lastAutoGatherPendingLevel === plan.mineLevel
    ) {
      return;
    }
    const dispatch = rpcMessageForSettings(stored, [plan.call]);
    if (dispatch) {
      lastAutoGatherSearchAt = now;
      lastAutoGatherPendingType = plan.mineType;
      lastAutoGatherPendingLevel = plan.mineLevel;
      cr?.tabs?.sendMessage?.(tabId, dispatch)?.catch?.(() => {});
    }
  } else if (plan.action === 'gather') {
    const dispatch = rpcMessageForSettings(stored, [plan.call]);
    if (dispatch) {
      cr?.tabs?.sendMessage?.(tabId, dispatch)?.catch?.(() => {});
      const updatedSettings = {
        ...helper.normalizeAutoGatherSettings(stored.autoGatherSettings),
        lastAutoMineType: plan.nextLastAutoMineType
      };
      stored.autoGatherSettings = updatedSettings;
      await cr?.storage?.local?.set({ autoGatherSettings: updatedSettings });
      lastAutoGatherPendingType = null;
      lastAutoGatherPendingLevel = null;
      lastAutoGatherSearchAt = 0;
    }
  }
}

export async function tickAutoGather(reset = false, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored =
    (await cr?.storage?.local?.get([
      'rpcCache',
      'popupRpcEnabled',
      'socketRefreshMode',
      'captureSettings',
      'autoGatherSettings',
      'smartGatherState',
      'troopCapacitySettings',
      'raidQueue',
      'monsterQueue',
      'priorityAutoJoin'
    ])) || {};
  const tab = await findActiveGameTab(cr);
  if (reset) {
    if (tab?.id) await cr?.tabs?.sendMessage(tab.id, { kind: 'drop-rpc-group', group: 'smart-gather' }).catch(() => {});
    if (tab?.id && !stored.autoGatherSettings?.smartEnabled) await dropMineDefenseRpc(tab.id, cr);
    if (stored.smartGatherState) {
      stored.smartGatherState = { ...stored.smartGatherState, error: null, nearest: null, readTimeout: null, notice: null };
      if (
        stored.smartGatherState.pending &&
        !['stopMineGathering', 'attackMine', 'joinRally'].includes(stored.smartGatherState.pending.call?.name)
      )
        stored.smartGatherState.pending = null;
      await cr?.storage?.local?.set({ smartGatherState: stored.smartGatherState });
    }
  }
  if (tab?.id) await evaluateAutoGather(null, stored.rpcCache || {}, stored, tab.id, cr);
}

export function socketRefreshCalls(record: any, cache: any): any[] {
  if (record.transport !== 'websocket' || record.direction !== 'received' || record.encoding !== 'utf8' || record.payloadTruncated)
    return [];
  let type: string | undefined;
  let body: any;
  try {
    const event = JSON.parse(record.payload)?.result;
    type = event?.type;
    body = event?.body;
  } catch (_) {
    return [];
  }
  if (['marchAttackDetected', 'marchAttackEnded'].includes(type || '')) return [{ name: 'getHealing', feature: 'unit' }];
  if (['gatheringMineCompleted', 'returnFromMineCompleted'].includes(type || ''))
    return [{ name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }, { name: 'getHealing', feature: 'unit' }];
  if (type === 'newReport') return [{ name: 'getPage', feature: 'report', args: { limit: 10, cursor: null } }];
  if (type === 'questUpdateAll')
    return [
      { name: 'getDailyQuests', feature: 'quest', args: {} },
      { name: 'getSpecialQuestState', feature: 'quest', args: {} },
      { name: 'questGetAll' },
      { name: 'questGetEvents' }
    ];
  if (type === 'rallyCreated' && typeof body?.rallyId === 'string') {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }, { name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }];
  }
  if (type === 'rallyUserAutojoined' && typeof body?.rallyId === 'string') {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }, { name: 'getMarches', feature: 'march' }, { name: 'getUnitSummary', feature: 'unit' }];
  }
  if (
    type === 'rallyStarted' &&
    typeof body?.rallyId === 'string' &&
    cache?.marchStatus?.data?.marches?.some((march: any) => march.rally?.id === body.rallyId)
  ) {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }, { name: 'getMarches', feature: 'march' }];
  }
  if (
    type === 'rallyMembersUpdated' &&
    typeof body?.rallyId === 'string' &&
    cache?.marchStatus?.data?.marches?.some((march: any) => march.rally?.id === body.rallyId)
  ) {
    return [{ name: 'getRallyById', feature: 'rally', args: { rallyId: body.rallyId } }];
  }
  if (['rallyCompleted', 'returnToOutpostFromMob'].includes(type || '')) {
    return [{ name: 'getMarches', feature: 'march' }];
  }
  return [];
}

export async function recordedEntries(customChrome?: any): Promise<[string, any][]> {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.session?.get(null)) || {};
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(RECORD_PREFIX))
    .sort(([a], [b]) => Number(a.slice(RECORD_PREFIX.length)) - Number(b.slice(RECORD_PREFIX.length)));
}

export async function clearRecorded(customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const keys = (await recordedEntries(cr)).map(([key]) => key);
  if (keys.length) await cr?.storage?.session?.remove(keys);
}

export async function interactionEntries(customChrome?: any): Promise<[string, any][]> {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.local?.get(null)) || {};
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(INTERACTION_PREFIX))
    .sort(([a], [b]) => Number(a.slice(INTERACTION_PREFIX.length)) - Number(b.slice(INTERACTION_PREFIX.length)));
}

export async function clearInteractions(customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const keys = (await interactionEntries(cr)).map(([key]) => key);
  if (keys.length) await cr?.storage?.local?.remove(keys);
}

export async function handleControl(kind: string, customChrome?: any) {
  const cr = getActiveChrome(customChrome);
  const stored = (await cr?.storage?.session?.get(RECORD_STATE_KEY)) || {};
  const state = stored[RECORD_STATE_KEY] || { active: false, nextIndex: 0 };
  if (kind === 'record-start') {
    await clearRecorded(cr);
    await clearInteractions(cr);
    await cr?.storage?.local?.remove('apiRecords');
    const settings = (await cr?.storage?.local?.get('captureSettings')) || {};
    if (settings.captureSettings?.interceptEnabled === false) {
      await cr?.storage?.local?.set({
        captureSettings: {
          ...settings.captureSettings,
          interceptEnabled: true
        }
      });
    }
    const next = { active: true, nextIndex: 0, nextInteractionIndex: 0, error: null };
    await cr?.storage?.session?.set({ [RECORD_STATE_KEY]: next });
    await cr?.storage?.local?.set({ gameRecordingActive: true, recordingState: next });
    return next;
  }
  if (kind === 'record-stop') {
    const next = { ...state, active: false };
    await cr?.storage?.session?.set({ [RECORD_STATE_KEY]: next });
    await cr?.storage?.local?.set({ gameRecordingActive: false, recordingState: next });
    return next;
  }
  if (kind === 'record-clear') {
    await clearRecorded(cr);
    await clearInteractions(cr);
    const next = { active: false, nextIndex: 0, nextInteractionIndex: 0, error: null };
    await cr?.storage?.session?.set({ [RECORD_STATE_KEY]: next });
    await cr?.storage?.local?.set({ gameRecordingActive: false, recordingState: next });
    return next;
  }
  return state;
}

export interface SetupBackgroundRuntimeOptions {
  chrome?: any;
}

export function setupBackgroundRuntime(options: SetupBackgroundRuntimeOptions = {}) {
  const cr = options.chrome || getActiveChrome();
  if (!cr) return null;
  setActiveChrome(cr);
  marchReadLeases.clear();
  attemptedAutoJoinRallies.clear();
  cityQueueLanes.clear();

  // Routine storage optimization on worker startup
  try {
    pending = pending
      .then(async () => {
        const stored = await cr.storage?.local?.get('rpcCache');
        if (stored?.rpcCache && rpcCacheService?.pruneCache) {
          const pruned = rpcCacheService.pruneCache(stored.rpcCache);
          if (pruned.changed) {
            await cr.storage?.local?.set({ rpcCache: pruned.cache });
          }
          scheduleMailExpiry(pruned.cache, cr);
        }
      })
      .catch(() => {});
  } catch (_) {}

  // Tab remove listener
  cr.tabs?.onRemoved?.addListener?.((tabId: number) => {
    pending = pending
      .then(async () => {
        await updateRpcQueueCount(tabId, null, cr);
        const stored = (await cr.storage?.local?.get('raidQueue')) || {};
        if (stored.raidQueue?.tabId === tabId && !raidQueueService.terminal(stored.raidQueue)) {
          await cr.storage?.local?.set({ raidQueue: raidQueueService.stop(stored.raidQueue, 'Game tab closed.') });
        }
        const monster = (await cr.storage?.local?.get('monsterQueue')) || {};
        if (monster.monsterQueue?.tabId === tabId && !monsterQueueService.terminal(monster.monsterQueue)) {
          await cr.storage?.local?.set({ monsterQueue: monsterQueueService.stop(monster.monsterQueue, 'Game tab closed.') });
        }
        const tower = (await cr.storage?.local?.get('towerRun')) || {};
        if (tower.towerRun?.tabId === tabId && !towerRunnerService.terminal(tower.towerRun)) {
          await cr.storage?.local?.set({ towerRun: towerRunnerService.stop(tower.towerRun, 'Game tab closed.') });
        }
        const dungeon = (await cr.storage?.local?.get('dungeonRun')) || {};
        if (dungeon.dungeonRun?.tabId === tabId && !dungeonRunnerService?.terminal(dungeon.dungeonRun)) {
          await cr.storage?.local?.set({ dungeonRun: dungeonRunnerService.stop(dungeon.dungeonRun, 'Game tab closed.') });
        }
      })
      .catch(() => {});
  });
  pending = pending.then(() => updateRpcQueueCount('__startup__', null, cr)).catch(() => {});

  // World read startup
  pending = pending
    .then(async () => {
      const stored = (await cr.storage?.local?.get('worldReadState')) || {};
      if (stored.worldReadState) scheduleWorldRead(stored.worldReadState, cr);
    })
    .catch(() => {});

  // Startup queue alarms
  try {
    setupQueueAlarms(cr);
  } catch (_) {}

  // Alarms listener
  cr.alarms?.onAlarm?.addListener?.(async (alarm: any) => {
    if (alarm.name === 'hwa-world-read') {
      pending = pending.then(() => flushWorldReads(cr)).catch(() => {});
      await pending;
    }
    if (alarm.name === 'hwa-mail-expiry') {
      pending = pending.then(() => pruneExpiredMail(cr)).catch(() => {});
      await pending;
    }
    if (alarm.name === 'hwa-building-queue-recovery' || alarm.name === 'hwa-research-queue-recovery') {
      await advanceCityQueue(alarm.name === 'hwa-building-queue-recovery' ? 'building' : 'research', undefined, undefined, cr);
    }
    if (alarm.name === 'hwa-auto-free-spin') {
      pending = pending.then(() => runFreeSpin(false, null, null, cr)).catch(() => {});
      await pending;
    }
    if (alarm.name === 'hwa-mine-defense') await tickAutoGather(false, cr);
    if (alarm.name === 'hwa-queue-watch') {
      const tab = await findActiveGameTab(cr);
      if (tab?.id) {
        await advanceBuildingQueue(tab.id, undefined, cr);
        await advanceResearchQueue(tab.id, undefined, cr);
      }
    }
  });

  // Runtime events
  cr.runtime?.onStartup?.addListener?.(async () => {
    setupQueueAlarms(cr);
    const tab = await findActiveGameTab(cr);
    if (tab?.id) {
      await advanceBuildingQueue(tab.id, undefined, cr);
      await advanceResearchQueue(tab.id, undefined, cr);
    }
  });

  cr.runtime?.onInstalled?.addListener?.(async () => {
    setupQueueAlarms(cr);
    cr.storage?.local?.remove('apiRecords')?.catch?.(() => {});
    try {
      const stored = await cr.storage?.local?.get(['socketRefreshMode', 'popupRpcEnabled', 'captureSettings']);
      const updates: Record<string, any> = {};
      if (!stored?.socketRefreshMode || stored.socketRefreshMode === 'piggyback') {
        updates.socketRefreshMode = 'direct';
      }
      if (stored?.popupRpcEnabled === undefined || stored.popupRpcEnabled === false) {
        updates.popupRpcEnabled = true;
      }
      if (!stored?.captureSettings) {
        updates.captureSettings = { interceptEnabled: true };
      }
      if (Object.keys(updates).length > 0) {
        await cr.storage?.local?.set(updates);
      }
    } catch (_) {}
  });

  // Storage onChanged listener
  cr.storage?.onChanged?.addListener?.((changes: any, area: string) => {
    if (area === 'local' && ['autoFreeSpinEnabled', 'popupRpcEnabled', 'socketRefreshMode', 'captureSettings'].some((key) => key in changes)) {
      pending = pending.then(() => runFreeSpin(false, null, null, cr)).catch(() => {});
    }
    if (area !== 'local' || !['popupRpcEnabled', 'socketRefreshMode', 'captureSettings'].some((key) => key in changes)) return;
    pending = pending
      .then(async () => {
        const stored =
          (await cr.storage?.local?.get([
            'raidQueue',
            'monsterQueue',
            'towerRun',
            'dungeonRun',
            'popupRpcEnabled',
            'socketRefreshMode',
            'captureSettings'
          ])) || {};
        const modeChanged = changes.socketRefreshMode && changes.socketRefreshMode.oldValue !== changes.socketRefreshMode.newValue;
        if (
          modeChanged ||
          changes.popupRpcEnabled?.newValue === false ||
          changes.captureSettings?.newValue?.interceptEnabled === false
        ) {
          const tab = await findActiveGameTab(cr);
          if (tab?.id) {
            await cr.tabs?.sendMessage(tab.id, { kind: 'drop-rpc-group', group: 'smart-gather' }).catch(() => {});
            await dropMineDefenseRpc(tab.id, cr);
          }
        }
        if (!raidQueueService.terminal(stored.raidQueue)) {
          const state = modeChanged ? raidQueueService.stop(stored.raidQueue, 'RPC mode changed. Queue stopped.') : stored.raidQueue;
          await saveRaidTransition({ state }, stored, cr);
        }
        if (!monsterQueueService.terminal(stored.monsterQueue)) {
          const state = modeChanged ? monsterQueueService.stop(stored.monsterQueue, 'RPC mode changed. Queue stopped.') : stored.monsterQueue;
          await saveMonsterTransition({ state }, stored, cr);
        }
        if (!towerRunnerService.terminal(stored.towerRun)) {
          const state = modeChanged ? towerRunnerService.stop(stored.towerRun, 'RPC mode changed. Tower stopped.') : stored.towerRun;
          await saveTowerTransition({ state }, stored, cr);
        }
        if (!dungeonRunnerService?.terminal(stored.dungeonRun)) {
          const state = modeChanged ? dungeonRunnerService.stop(stored.dungeonRun, 'RPC mode changed. Dungeon stopped.') : stored.dungeonRun;
          await saveDungeonTransition({ state }, stored, cr);
        }
      })
      .catch(() => {});
  });

  // Message listener
  const messageListener = (message: any, sender: any, sendResponse: (resp?: any) => void) => {
    if (['mail-claim', 'mail-prune'].includes(message?.kind) && sender.url?.startsWith('chrome-extension://' + cr.runtime.id + '/')) {
      pending = pending.then(async () => (message.kind === 'mail-prune' ? pruneExpiredMail(cr) : claimMail(message, cr)) as any);
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'speedup-use' && sender.url?.startsWith('chrome-extension://' + cr.runtime.id + '/')) {
      pending = pending.then(() => useConfirmedSpeedup(message, cr));
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'refresh-rpc' && message.calls?.some((call: any) => /^speedUp.*WithResources$/.test(call?.name))) {
      sendResponse({ ok: false, error: 'Use the speedup confirmation dialog for item spending.' });
      return false;
    }
    const freeManual =
      message?.kind === 'free-alchemy-spin' ||
      (message?.kind === 'refresh-rpc' &&
        message.calls?.length === 1 &&
        message.calls[0]?.name === 'refillable_alchemyUseVideo' &&
        !message.calls[0].feature &&
        message.calls[0].args?.type === 'alchemy' &&
        Object.keys(message.calls[0].args).length === 1);
    if (
      (freeManual || message?.kind === 'free-spin-tick') &&
      (sender.url?.startsWith('chrome-extension://' + cr.runtime.id + '/') ||
        (!freeManual && isGameUrl(sender.url) && sender.tab?.id))
    ) {
      pending = pending.then(() => runFreeSpin(freeManual, null, sender.tab?.id, cr));
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (
      ['auto-gather-start', 'auto-gather-stop', 'smart-gather-tick'].includes(message?.kind) &&
      (sender.url?.startsWith('chrome-extension://' + cr.runtime.id + '/') ||
        (message.kind === 'smart-gather-tick' && isGameUrl(sender.url) && sender.tab?.id))
    ) {
      pending = pending.then(async () => {
        if (message.kind === 'auto-gather-stop') {
          const tab = await findActiveGameTab(cr);
          if (tab?.id) await dropMineDefenseRpc(tab.id, cr);
          if (tab?.id) await cr.tabs?.sendMessage(tab.id, { kind: 'drop-rpc-group', group: 'smart-gather' }).catch(() => {});
        } else await tickAutoGather(message.kind === 'auto-gather-start', cr);
        return { ok: true };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'raid-energy-config' && sender.url?.startsWith('chrome-extension://' + cr.runtime.id + '/')) {
      pending = pending.then(async () => {
        const config = message.config;
        const stored = (await cr.storage?.local?.get(['rpcCache'])) || {};
        if (
          !raidEnergyAutoService.validConfig(config) ||
          (config.enabled && String(config.accountId) !== String(stored.rpcCache?.accountStatus?.data?.id))
        ) {
          return { ok: false, error: 'Select a complete team, valid map and raid options before enabling auto raid.' };
        }
        const old = (await cr.storage?.local?.get('raidEnergyAuto')) || {};
        await cr.storage?.local?.set({ raidEnergyAuto: config });
        if (JSON.stringify(old.raidEnergyAuto) !== JSON.stringify(config)) {
          await cr.storage?.session?.remove('raidEnergyWatch');
        }
        return { ok: true };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'raid-energy-tick' && isGameUrl(sender.url) && sender.tab?.id && typeof message.sessionId === 'string') {
      pending = pending.then(() => evaluateRaidEnergy(sender.tab.id, message.sessionId, Date.now(), cr));
      pending.then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (['raid-queue-start', 'raid-queue-stop'].includes(message?.kind) && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      pending = pending.then(async () => {
        const stored =
          (await cr.storage?.local?.get([
            'raidQueue',
            'monsterQueue',
            'rpcCache',
            'popupRpcEnabled',
            'socketRefreshMode',
            'captureSettings',
            'troopCapacitySettings',
            'autoGatherSettings',
            'smartGatherState'
          ])) || {};
        const controller = raidQueueService;
        if (message.kind === 'raid-queue-stop') {
          if (!controller.terminal(stored.raidQueue))
            await saveRaidTransition(
              { state: controller.stop(stored.raidQueue, 'Stopped by user. Any rally already sent continues in game.') },
              stored,
              cr
            );
          else if (stored.raidQueue) {
            await cr.storage?.local?.set({
              raidQueue: { ...stored.raidQueue, phase: 'stopped', reason: 'Stopped by user.' }
            });
          }
          return { ok: true };
        }
        if (!controller.terminal(stored.raidQueue)) {
          if (!(await isTabAlive(stored.raidQueue?.tabId, cr))) {
            stored.raidQueue = await saveRaidTransition(
              { state: controller.stop(stored.raidQueue, 'Game tab was closed or disconnected.') },
              stored,
              cr
            );
          }
        }
        if (!controller.terminal(stored.raidQueue)) return { ok: false, error: 'A raid queue is already running.' };

        if (!monsterQueueService.terminal(stored.monsterQueue)) {
          if (!(await isTabAlive(stored.monsterQueue?.tabId, cr))) {
            stored.monsterQueue = await saveMonsterTransition(
              { state: monsterQueueService.stop(stored.monsterQueue, 'Game tab was closed or disconnected.') },
              stored,
              cr
            );
          }
        }
        if (!monsterQueueService.terminal(stored.monsterQueue)) return { ok: false, error: 'A monster queue is already running.' };
        if (!rpcMessageForSettings(stored, [])) {
          return { ok: false, error: 'Enable RPC, and enable Monitor API for Piggyback mode.' };
        }
        const tabs = await new Promise<any[]>((resolve) => cr.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
        const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
        if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
        const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
        const deferred = await deferQueueForGathering(
          message.kind.startsWith('raid') ? 'raid' : 'monster',
          message.options,
          tab.id,
          accountId,
          stored,
          Date.now(),
          cr
        );
        if (deferred?.error) return { ok: false, error: deferred.error };
        const transition =
          deferred ||
          controller.start(
            message.options,
            tab.id,
            accountId,
            Date.now(),
            stored.rpcCache || {},
            experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
          );
        if (!transition) return { ok: false, error: 'Refresh troops and search for this boss before starting. Check the selected team and target.' };
        const state = await saveRaidTransition(transition, stored, cr);
        return { ok: state.phase !== 'stopped', queued: stored.socketRefreshMode !== 'direct', phase: state.phase, error: state.reason };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'raid-queue-tick' && isGameUrl(sender.url) && sender.tab?.id) {
      pending = pending.then(() => updateRaidQueue(null, sender.tab.id, cr));
      pending.then(
        (state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id && !raidQueueService.terminal(state) }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (['monster-queue-start', 'monster-queue-stop'].includes(message?.kind) && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      pending = pending.then(async () => {
        const stored =
          (await cr.storage?.local?.get([
            'monsterQueue',
            'raidQueue',
            'rpcCache',
            'popupRpcEnabled',
            'socketRefreshMode',
            'captureSettings',
            'troopCapacitySettings',
            'autoGatherSettings',
            'smartGatherState'
          ])) || {};
        const controller = monsterQueueService;
        if (message.kind === 'monster-queue-stop') {
          if (!controller.terminal(stored.monsterQueue))
            await saveMonsterTransition(
              { state: controller.stop(stored.monsterQueue, 'Stopped by user. An attack already sent continues in game.') },
              stored,
              cr
            );
          else if (stored.monsterQueue) {
            await cr.storage?.local?.set({
              monsterQueue: { ...stored.monsterQueue, phase: 'stopped', reason: 'Stopped by user.' }
            });
          }
          return { ok: true };
        }
        if (!controller.terminal(stored.monsterQueue)) {
          if (!(await isTabAlive(stored.monsterQueue?.tabId, cr))) {
            stored.monsterQueue = await saveMonsterTransition(
              { state: controller.stop(stored.monsterQueue, 'Game tab was closed or disconnected.') },
              stored,
              cr
            );
          } else if (Date.now() >= (stored.monsterQueue.wakeAt || 0) && ['refreshing', 'searching', 'attacking'].includes(stored.monsterQueue.phase)) {
            const timedOut = controller.advance(
              stored.monsterQueue,
              null,
              stored.rpcCache,
              Date.now(),
              experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
            );
            if (controller.terminal(timedOut.state)) {
              stored.monsterQueue = await saveMonsterTransition(timedOut, stored, cr);
            }
          }
        }
        if (!controller.terminal(stored.monsterQueue)) return { ok: false, error: 'A monster queue is already running.' };

        if (!raidQueueService.terminal(stored.raidQueue)) {
          if (!(await isTabAlive(stored.raidQueue?.tabId, cr))) {
            stored.raidQueue = await saveRaidTransition(
              { state: raidQueueService.stop(stored.raidQueue, 'Game tab was closed or disconnected.') },
              stored,
              cr
            );
          }
        }
        if (!raidQueueService.terminal(stored.raidQueue)) return { ok: false, error: 'A raid queue is already running.' };
        if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
        const tabs = await new Promise<any[]>((resolve) => cr.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
        const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
        if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
        const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
        const deferred = await deferQueueForGathering(
          message.kind.startsWith('raid') ? 'raid' : 'monster',
          message.options,
          tab.id,
          accountId,
          stored,
          Date.now(),
          cr
        );
        if (deferred?.error) return { ok: false, error: deferred.error };
        const transition =
          deferred ||
          controller.start(
            message.options,
            tab.id,
            accountId,
            Date.now(),
            stored.rpcCache || {},
            experimentalDataHelper.normalizeCapacitySettings(stored.troopCapacitySettings)
          );
        if (!transition) return { ok: false, error: 'Refresh troops and search for this monster before starting. Check the team and target.' };
        const state = await saveMonsterTransition(transition, stored, cr);
        return { ok: state.phase !== 'stopped', queued: stored.socketRefreshMode !== 'direct', error: state.reason };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'monster-queue-tick' && isGameUrl(sender.url) && sender.tab?.id) {
      pending = pending.then(() => updateMonsterQueue(null, sender.tab.id, cr));
      pending.then(
        (state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id && !monsterQueueService.terminal(state) }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (['tower-run-start', 'tower-run-stop'].includes(message?.kind) && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      pending = pending.then(async () => {
        const stored =
          (await cr.storage?.local?.get([
            'towerRun',
            'rpcCache',
            'popupRpcEnabled',
            'socketRefreshMode',
            'captureSettings',
            'towerAutomationSettings'
          ])) || {};
        const runner = towerRunnerService;
        if (message.kind === 'tower-run-stop') {
          if (!runner.terminal(stored.towerRun))
            await saveTowerTransition(
              { state: runner.stop(stored.towerRun, 'Stopped by user. Any Tower battle already sent continues in game.') },
              stored,
              cr
            );
          return { ok: true };
        }
        if (!runner.terminal(stored.towerRun)) return { ok: false, error: 'Tower automation is already running.' };
        if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
        const tabs = await new Promise<any[]>((resolve) => cr.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
        const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
        if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
        const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
        const baseSettings =
          String(stored.towerAutomationSettings?.accountId) === String(accountId) ? stored.towerAutomationSettings : {};
        const teamFromMsg =
          Array.isArray(message.heroes) && message.heroes.length === 5 && message.heroes.every(Number.isInteger) ? message.heroes : null;
        const teamFromStored =
          Array.isArray(baseSettings.heroes) && baseSettings.heroes.length === 5 && baseSettings.heroes.every(Number.isInteger)
            ? baseSettings.heroes
            : null;
        const buffFromMsg = Array.isArray(message.buffPriority) && message.buffPriority.length > 0 ? message.buffPriority : null;
        const buffFromStored = Array.isArray(baseSettings.buffPriority) && baseSettings.buffPriority.length > 0 ? baseSettings.buffPriority : [];
        const settings = {
          ...baseSettings,
          buffPriority: buffFromMsg || buffFromStored,
          heroes: teamFromMsg || teamFromStored || stored.rpcCache?.teamGetAll?.data?.magicTower
        };
        if (buffFromMsg || teamFromMsg) {
          await cr.storage?.local?.set({
            towerAutomationSettings: {
              ...baseSettings,
              accountId,
              heroes: settings.heroes,
              buffPriority: settings.buffPriority
            }
          });
        }
        const transition = runner.start(stored.rpcCache, settings, tab.id, Date.now());
        if (!transition) return { ok: false, error: 'Open Tower in game and select a 5-hero team before starting.' };
        const state = await saveTowerTransition(transition, stored, cr);
        return { ok: state.phase !== 'stopped', error: state.reason };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'tower-run-tick' && isGameUrl(sender.url) && sender.tab?.id) {
      pending = pending.then(() => updateTowerRun(null, sender.tab.id, cr));
      pending.then(
        (state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id && !towerRunnerService.terminal(state) }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (['dungeon-run-start', 'dungeon-run-stop'].includes(message?.kind) && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      pending = pending.then(async () => {
        const stored =
          (await cr.storage?.local?.get([
            'dungeonRun',
            'rpcCache',
            'popupRpcEnabled',
            'socketRefreshMode',
            'captureSettings',
            'dungeonAutomationSettings'
          ])) || {};
        const runner = dungeonRunnerService;
        if (message.kind === 'dungeon-run-stop') {
          if (!runner?.terminal(stored.dungeonRun))
            await saveDungeonTransition(
              { state: runner?.stop(stored.dungeonRun, 'Stopped by user. Any Dungeon battle already sent continues in game.') },
              stored,
              cr
            );
          return { ok: true };
        }
        if (!runner?.terminal(stored.dungeonRun)) return { ok: false, error: 'Dungeon automation is already running.' };
        if (!rpcMessageForSettings(stored, [])) return { ok: false, error: 'Enable RPC and Monitor API for Piggyback mode.' };
        const tabs = await new Promise<any[]>((resolve) => cr.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, resolve));
        const tab = tabs.find((candidate) => candidate.id && isGameUrl(candidate.url));
        if (!tab) return { ok: false, error: 'No active Hero Wars tab found.' };
        try {
          if (typeof cr?.tabs?.update === 'function') {
            cr.tabs.update(tab.id, { active: true }).catch(() => {});
          }
        } catch (_) {}
        const dungeonData = stored.rpcCache?.dungeonStatus?.data;
        if (!dungeonData || !Array.isArray(dungeonData.currentFloorDoors) || !dungeonData.currentFloorDoors.length) {
          return { ok: false, error: 'Open Titan Dungeon interface in the game before starting automation.' };
        }
        const accountId = stored.rpcCache?.accountStatus?.data?.id ?? stored.rpcCache?.userGetInfo?.data?.id;
        const baseSettings =
          String(stored.dungeonAutomationSettings?.accountId) === String(accountId) ? stored.dungeonAutomationSettings : {};
        const settings = {
          ...baseSettings,
          ...(message.settings || {})
        };
        if (message.settings) {
          await cr.storage?.local?.set({
            dungeonAutomationSettings: {
              ...baseSettings,
              accountId,
              ...message.settings
            }
          });
        }
        if (stored.rpcCache?.dungeonStatus?.data?.activeBattle) {
          const battleTime =
            Number(stored.rpcCache.dungeonStatus.data.activeBattle.startTime) ||
            Date.parse(stored.rpcCache.dungeonStatus.data.activeBattle.startTime) ||
            0;
          if (!battleTime || Date.now() - battleTime > 30000 || message.forceRestart) {
            stored.rpcCache.dungeonStatus.data.activeBattle = null;
            await cr.storage?.local?.set({ [CACHE_KEY]: stored.rpcCache });
          }
        }
        const transition = runner?.start(stored.rpcCache, settings, tab.id, Date.now());
        if (!transition) return { ok: false, error: 'Open Titan Dungeon interface in game before starting automation.' };
        const state = await saveDungeonTransition(transition, stored, cr);
        return { ok: state.phase !== 'stopped', error: state.reason };
      });
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'dungeon-run-tick' && isGameUrl(sender.url) && sender.tab?.id) {
      pending = pending.then(() => updateDungeonRun(null, sender.tab.id, cr));
      pending.then(
        (state) => sendResponse({ ok: true, watch: state?.tabId === sender.tab.id && !dungeonRunnerService?.terminal(state) }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'building-queue-tick') {
      pending = pending.then(async () => {
        let tabId = isGameUrl(sender.url) && sender.tab?.id ? sender.tab.id : null;
        if (!tabId) {
          const tab = await findActiveGameTab(cr);
          tabId = tab?.id;
        }
        return tabId ? advanceBuildingQueue(tabId, undefined, cr) : null;
      });
      pending.then(
        (queue) =>
          sendResponse({
            ok: true,
            watch: queue?.enabled !== false && (Number.isFinite(queue?.wakeAt) || (Array.isArray(queue?.items) && queue.items.length > 0))
          }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'building-queue-action') {
      pending = pending.then(() => mutateCityQueue('building', message, cr));
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'research-queue-tick') {
      pending = pending.then(async () => {
        let tabId = isGameUrl(sender.url) && sender.tab?.id ? sender.tab.id : null;
        if (!tabId) {
          const tab = await findActiveGameTab(cr);
          tabId = tab?.id;
        }
        return tabId ? advanceResearchQueue(tabId, undefined, cr) : null;
      });
      pending.then(
        (queue) =>
          sendResponse({
            ok: true,
            watch: queue?.enabled !== false && (Number.isFinite(queue?.wakeAt) || (Array.isArray(queue?.items) && queue.items.length > 0))
          }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'research-queue-action') {
      pending = pending.then(() => mutateCityQueue('research', message, cr));
      pending.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (
      message?.kind === 'rpc-queue-status' &&
      isGameUrl(sender.url) &&
      sender.tab?.id &&
      Number.isInteger(message.count) &&
      message.count >= 0 &&
      message.count <= 64
    ) {
      pending = pending.then(() => updateRpcQueueCount(sender.tab.id, message.count, cr));
      pending.then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'mqtt-telemetry-update' && isGameUrl(sender.url)) {
      pending = pending.then(async () => {
        const stored = (await cr.storage?.local?.get('rpcMqttTelemetry')) || {};
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
          await cr.storage?.local?.set({ rpcMqttTelemetry: telemetry });
        }
      });
      pending.then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      pending = pending.catch(() => {});
      return true;
    }
    const isAllowedOrigin = sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`) || isGameUrl(sender.url);
    const recordKinds = ['record-start', 'record-stop', 'record-clear', 'start-recording', 'stop-recording'];
    if (recordKinds.includes(message?.kind) && isAllowedOrigin) {
      let mappedKind = message.kind;
      if (mappedKind === 'start-recording') mappedKind = 'record-start';
      if (mappedKind === 'stop-recording') mappedKind = 'record-stop';
      pending = pending.then(() => handleControl(mappedKind, cr));
      pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'record-status' && isAllowedOrigin) {
      pending = pending.then(async () => {
        const state = (await cr.storage?.session?.get(RECORD_STATE_KEY))?.[RECORD_STATE_KEY] || { active: false };
        const entries = await recordedEntries(cr);
        const interactions = await interactionEntries(cr);
        return {
          active: Boolean(state.active),
          count: entries.length,
          interactionCount: interactions.length,
          error: state.error || null
        };
      });
      pending.then(sendResponse, (error) => sendResponse({ error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'record-export' && isAllowedOrigin) {
      pending = pending.then(async () => {
        const entries = await recordedEntries(cr);
        const interactions = await interactionEntries(cr);
        const extensionVersion = cr.runtime?.getManifest?.()?.version || null;
        let gameVersion = null;
        try {
          const sessionStore = await cr.storage?.session?.get?.(['cachedGameVersion']).catch?.(() => ({}));
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
        const state = (await cr.storage?.session?.get(RECORD_STATE_KEY))?.[RECORD_STATE_KEY];
        if (!state?.active) return { saved: false };
        const index = state.nextInteractionIndex || 0;
        if (index >= MAX_INTERACTIONS) {
          await cr.storage?.session?.set({
            [RECORD_STATE_KEY]: {
              ...state,
              active: false,
              error: 'Interaction log reached 3,000 entries. Export before recording again.'
            }
          });
          return { saved: false, limitReached: true };
        }
        try {
          await cr.storage?.local?.set({ [`${INTERACTION_PREFIX}${index}`]: entry });
        } catch (error) {
          await cr.storage?.session?.set({
            [RECORD_STATE_KEY]: {
              ...state,
              active: false,
              error: 'Local interaction storage is full. Export the current log.'
            }
          });
          return { saved: false, error: String(error) };
        }
        await cr.storage?.session?.set({ [RECORD_STATE_KEY]: { ...state, nextInteractionIndex: index + 1 } });
        return { saved: true };
      });
      pending.then(sendResponse, (error) => sendResponse({ saved: false, error: String(error) }));
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'rebuild-cache' && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      pending = pending.then(async () => {
        const stored = (await cr.storage?.local?.get('rpcCache')) || {};
        const records = (await recordedEntries(cr)).map(([, record]) => record);
        const result = rpcCacheService.merge(stored.rpcCache, records);
        if (result.changed) await cr.storage?.local?.set({ rpcCache: result.cache });
        return Object.keys(result.cache).length;
      });
      pending.then(
        (count) => sendResponse({ count }),
        (error) => sendResponse({ error: String(error) })
      );
      pending = pending.catch(() => {});
      return true;
    }
    if (message?.kind === 'experimental-rpc' && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      const allowed = new Set([
        'searchMob:mob',
        'searchMine:mine',
        'createRally:mob',
        'joinRally:rally',
        'joinRally:mob',
        'attackMine:mine',
        'stopMineGathering:mine'
      ]);
      const calls = message.calls;
      if (!Array.isArray(calls) || calls.length !== 1 || !allowed.has(`${calls[0]?.name}:${calls[0]?.feature}`)) {
        sendResponse({ ok: false, error: 'Invalid experimental RPC.' });
        return true;
      }
      cr.storage?.local
        ?.get(['popupRpcEnabled', 'socketRefreshMode', 'captureSettings'])
        .then((stored: any) => {
          if (stored.popupRpcEnabled !== true) {
            sendResponse({ ok: false, error: 'Popup RPC calls are disabled in Settings.' });
            return;
          }
          const dispatch = rpcMessageForSettings(stored, calls);
          if (!dispatch) {
            sendResponse({ ok: false, error: 'Enable Monitor API for Piggyback RPC.' });
            return;
          }
          cr.tabs.query({ url: GAME_ORIGINS.map((origin) => `${origin}/*`) }, (tabs: any[]) => {
            const tab = (tabs || []).find((candidate: any) => candidate.id && isGameUrl(candidate.url));
            if (!tab) {
              sendResponse({ ok: false, error: 'No active Hero Wars tab found.' });
              return;
            }
            cr.tabs
              .sendMessage(tab.id, dispatch)
              .then(() => sendResponse({ ok: true, queued: dispatch.kind === 'queue-rpc' }))
              .catch((error: any) => sendResponse({ ok: false, error: String(error) }));
          });
        })
        .catch((error: any) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (
      (message?.kind === 'refresh-rpc' ||
        message?.kind === 'claim-rewards' ||
        message?.kind === 'engine-ping' ||
        message?.kind === 'engine-send-message' ||
        message?.kind === 'campaign-raid' ||
        message?.kind === 'craft-fragment' ||
        message?.kind === 'craft-recipe') &&
      sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)
    ) {
      const forward = (forwardedMessage = message, queued = false) =>
        cr.tabs?.query({ url: GAME_ORIGINS.map((o) => `${o}/*`) }, async (tabs: any[]) => {
          let forwarded = false;
          for (const tab of tabs || []) {
            if (tab.id) {
              if (queued && !forwarded && message.kind === 'claim-rewards')
                await cr.storage?.local
                  ?.set({
                    claimRpcStatus: {
                      state: 'queued',
                      updatedAt: new Date().toISOString()
                    }
                  })
                  .catch(() => {});
              cr.tabs.sendMessage(tab.id, forwardedMessage).catch(() => {});
              forwarded = true;
              break;
            }
          }
          if (!forwarded) {
            cr.tabs?.query({}, async (allTabs: any[]) => {
              for (const tab of allTabs || []) {
                if (tab.id && isGameUrl(tab.url)) {
                  if (queued && !forwarded && message.kind === 'claim-rewards')
                    await cr.storage?.local
                      ?.set({
                        claimRpcStatus: {
                          state: 'queued',
                          updatedAt: new Date().toISOString()
                        }
                      })
                      .catch(() => {});
                  cr.tabs.sendMessage(tab.id, forwardedMessage).catch(() => {});
                  forwarded = true;
                  break;
                }
              }
              sendResponse({ ok: forwarded, queued: forwarded && queued, error: forwarded ? null : 'No active Hero Wars tab found.' });
            });
            return;
          }
          sendResponse({ ok: forwarded, queued: forwarded && queued, error: null });
        });
      if (message.kind === 'engine-ping') forward();
      else
        cr.storage?.local
          ?.get(['popupRpcEnabled', 'socketRefreshMode', 'captureSettings', 'claimRpcStatus', 'rpcCache'])
          .then((stored: any) => {
            if (stored.popupRpcEnabled === true) {
              if (message.kind === 'claim-rewards') {
                const allowed = new Set([
                  'mailFarm',
                  'readAndClaimAll',
                  'quest_multiFarm',
                  'completeQuest',
                  'claimBattlepassRewardAll',
                  'attentionBonus_collectReward',
                  'cinemaGiveReward',
                  'refillable_alchemyUseVideo',
                  'refillable_skillpointsUseVideo',
                  'zeppelinGiftGet',
                  'zeppelinGiftFarm',
                  'subscriptionFarm',
                  'subscriptionGetInfo',
                  'dailyBonusFarm',
                  'dailyBonusGetInfo',
                  'dailyBonus_claim',
                  'offerFarmReward',
                  'userGetInfo',
                  'refillableGetAll',
                  'inventoryGet',
                  'cinemaGetCounters',
                  'offerGetAll',
                  'mailGetAll',
                  'questGetAll',
                  'getDailyQuests',
                  'getSpecialQuestState',
                  'getBattlepassState',
                  'user_getNextDayTime',
                ]);
                const claimNames = new Set([
                  'mailFarm',
                  'readAndClaimAll',
                  'quest_multiFarm',
                  'completeQuest',
                  'claimBattlepassRewardAll',
                  'attentionBonus_collectReward',
                  'cinemaGiveReward',
                  'refillable_alchemyUseVideo',
                  'refillable_skillpointsUseVideo',
                  'zeppelinGiftGet',
                  'zeppelinGiftFarm',
                  'subscriptionFarm',
                  'dailyBonusFarm',
                  'dailyBonus_claim',
                  'offerFarmReward',
                ]);
                if (
                  !Array.isArray(message.calls) ||
                  !message.calls.length ||
                  message.calls.some((call: any) => !allowed.has(call?.name)) ||
                  !message.calls.some((call: any) => claimNames.has(call?.name))
                ) {
                  sendResponse({ ok: false, error: 'Invalid reward claim calls.' });
                  return;
                }
                const dispatch = rpcMessageForSettings(stored, message.calls, true);
                const queued = stored.socketRefreshMode !== 'direct';
                if (!dispatch) {
                  sendResponse({
                    ok: false,
                    error: 'Enable Monitor API or choose Direct for reward claims.'
                  });
                  return;
                }
                if (
                  queued &&
                  stored.claimRpcStatus?.state === 'queued' &&
                  Date.now() - Date.parse(stored.claimRpcStatus.updatedAt || '') < 120000
                ) {
                  sendResponse({ ok: false, error: 'Reward claims are already queued.' });
                  return;
                }
                if (!queued) cr.storage?.local?.remove('claimRpcStatus').catch(() => {});
                forward(dispatch, queued);
              } else if (message.kind === 'engine-send-message') {
                if ((stored.socketRefreshMode || 'direct') !== 'direct') {
                  sendResponse({ ok: false, error: 'Unity commands require Direct RPC mode.' });
                } else forward();
              } else {
                let calls = message.calls;
                if (message.kind === 'refresh-rpc' && message.passiveFirst && Array.isArray(calls) && rpcMessageForSettings(stored, [])) {
                  calls = passiveMarchReads(stored.rpcCache, calls);
                  if (!calls.length) {
                    sendResponse({ ok: true, skipped: true });
                    return;
                  }
                }
                if (message.kind === 'campaign-raid') {
                  const missionId = Number(message.missionId);
                  const times = Math.max(1, Math.min(100, Number(message.times) || 1));
                  if (!Number.isInteger(missionId) || missionId <= 0) {
                    sendResponse({ ok: false, error: 'Invalid mission ID.' });
                    return;
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
                    sendResponse({ ok: false, error: 'Invalid fragment item ID.' });
                    return;
                  }
                  calls = [{ name: 'inventoryCraftFragments', args: { type, libId, amount } }, { name: 'inventoryGet' }];
                } else if (message.kind === 'craft-recipe') {
                  const libId = Number(message.libId);
                  const amount = Math.max(1, Number(message.amount) || 1);
                  const type = message.type || 'gear';
                  if (!Number.isInteger(libId) || libId <= 0) {
                    sendResponse({ ok: false, error: 'Invalid recipe item ID.' });
                    return;
                  }
                  calls = [{ name: 'inventoryCraftRecipe', args: { type, libId, amount } }, { name: 'inventoryGet' }];
                }
                const extra: Record<string, any> = {};
                if (message.trackId) extra.trackId = message.trackId;
                if (message.requestedAt) extra.requestedAt = message.requestedAt;
                const dispatch = rpcMessageForSettings(stored, calls, false, extra);
                if (!dispatch) sendResponse({ ok: false, error: 'Enable Monitor API for Piggyback RPC.' });
                else forward(dispatch, dispatch.kind === 'queue-rpc');
              }
            } else sendResponse({ ok: false, error: 'Popup RPC calls are disabled in Settings.' });
          })
          .catch((error: any) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (message?.kind === 'reload-game-tab' && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
      cr.tabs?.query({ url: queryPatterns }, (tabs: any[]) => {
        let reloaded = false;
        for (const tab of tabs || []) {
          if (tab.id) {
            cr.tabs.reload(tab.id);
            reloaded = true;
          }
        }
        if (!reloaded) {
          cr.tabs?.query({}, (allTabs: any[]) => {
            for (const tab of allTabs || []) {
              if (tab.id && isGameUrl(tab.url)) {
                cr.tabs.reload(tab.id);
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
    if (message?.kind === 'get-game-tab-status' && sender.url?.startsWith(`chrome-extension://${cr.runtime.id}/`)) {
      const queryPatterns = GAME_ORIGINS.map((o) => `${o}/*`);
      cr.tabs?.query({ url: queryPatterns }, (tabs: any[]) => {
        let gameTabs = (tabs || []).filter((tab: any) => tab.id && isGameUrl(tab.url));
        const finish = (finalTabs: any[]) => {
          cr.storage?.local?.get('gameEngineStatus', (stored: any) => {
            sendResponse({
              ok: true,
              hasGameTab: finalTabs.length > 0,
              tabCount: finalTabs.length,
              gameEngineStatus: stored?.gameEngineStatus || null
            });
          });
        };
        if (gameTabs.length === 0) {
          cr.tabs?.query({}, (allTabs: any[]) => {
            gameTabs = (allTabs || []).filter((tab: any) => tab.id && isGameUrl(tab.url));
            finish(gameTabs);
          });
          return;
        }
        finish(gameTabs);
      });
      return true;
    }
    if (message?.kind === 'open-tab') {
      cr.tabs?.create?.({ url: cr.runtime.getURL('popup.html?view=tab') });
      sendResponse({ ok: true });
      return true;
    }
    if (message?.kind !== 'api-record' || !isGameUrl(sender.url)) return;
    const record = normalize(message.record);
    if (!record) return;
    if (record.responseBody && record.responseBody.includes('"version"')) {
      try {
        const parsed = JSON.parse(record.responseBody);
        const ver = parsed?.results?.find((r: any) => r.result?.response?.version)?.result?.response?.version;
        if (ver) {
          cr.storage?.session?.set?.({ cachedGameVersion: String(ver) })?.catch?.(() => {});
          cr.storage?.local?.set?.({ cachedGameVersion: String(ver) })?.catch?.(() => {});
        }
      } catch (_) {}
    }
    if (record.requestBody && record.requestBody.includes('"appVersion"')) {
      try {
        const match = record.requestBody.match(/"appVersion"\s*:\s*"([^"]+)"/);
        if (match?.[1]) {
          cr.storage?.session?.set?.({ cachedGameVersion: match[1] })?.catch?.(() => {});
          cr.storage?.local?.set?.({ cachedGameVersion: match[1] })?.catch?.(() => {});
        }
      } catch (_) {}
    }
    pending = pending.then(async () => {
      const stored =
        (await cr.storage?.local?.get([
          'rpcCache',
          'captureSettings',
          'popupRpcEnabled',
          'socketRefreshMode',
          'priorityAutoJoin',
          'troopCapacitySettings',
          'raidPreferences',
          'customTeams',
          'autoGatherSettings',
          'smartGatherState',
          'raidQueue',
          'monsterQueue'
        ])) || {};
      if (stored.captureSettings?.interceptEnabled === false) return { saved: false, cached: false };
      if (record.requestBody && /"name"\s*:\s*"(?:mobileLogin|userLogin)"/.test(record.requestBody)) {
        await cr.storage?.session?.remove('raidEnergyWatch');
      }
      const cacheResult = rpcCacheService.merge(stored.rpcCache, [record]);
      observeMarchReads(record, cacheResult.cache);
      if (cacheResult.changed) {
        await cr.storage?.local?.set({ rpcCache: cacheResult.cache });
      }
      if (cacheResult.cache?.remoteConfigStatus?.data && cr.storage?.local) {
        eventCatalogService.syncRemoteEventCatalog(cacheResult.cache.remoteConfigStatus.data, cr.storage.local).catch(() => {});
      }
      if (sender.tab?.id) await updateRaidQueue(record, sender.tab.id, cr);
      if (sender.tab?.id) await updateMonsterQueue(record, sender.tab.id, cr);
      if (sender.tab?.id) await updateTowerRun(record, sender.tab.id, cr);
      if (sender.tab?.id) await updateDungeonRun(record, sender.tab.id, cr);
      if (cacheResult.changed && cacheResult.cache?.dungeonStatus?.data?.battleHistory && cr?.storage?.local) {
        const history = cacheResult.cache.dungeonStatus.data.battleHistory;
        const storedHist = (await cr.storage.local.get('dungeonBattleHistory').catch(() => ({}))) as any;
        const existing = storedHist?.dungeonBattleHistory || {};
        let merged = { ...existing };
        let hasNew = false;
        for (const [k, v] of Object.entries(history)) {
          if (!merged[k]) {
            merged[k] = v;
            hasNew = true;
          } else if (Array.isArray(v)) {
            const list = [...merged[k]];
            for (const item of (v as any[])) {
              if (!list.some((existingItem: any) => existingItem.id === item.id)) {
                list.push(item);
                hasNew = true;
              }
            }
            if (list.length > 50) list.splice(0, list.length - 50);
            merged[k] = list;
          }
        }
        if (hasNew) {
          await cr.storage.local.set({ dungeonBattleHistory: merged }).catch(() => {});
        }
      }
      if (sender.tab?.id) await advanceBuildingQueue(sender.tab.id, record, cr);
      if (sender.tab?.id) await advanceResearchQueue(sender.tab.id, record, cr);
      Object.assign(stored, await cr.storage?.local?.get(['smartGatherState', 'raidQueue', 'monsterQueue']));
      if (sender.tab?.id) await evaluatePriorityAutoJoin(record, cacheResult.cache, stored, sender.tab.id, cr);
      if (sender.tab?.id) await evaluateAutoGather(record, cacheResult.cache, stored, sender.tab.id, cr);
      if (sender.tab?.id) await runFreeSpin(false, record, sender.tab.id, cr);
      await reconcileSpeedup(cacheResult.cache, cr);
      await reconcileMailClaim(cacheResult.cache, cr);
      scheduleMailExpiry(cacheResult.cache, cr);
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        cacheResult.cache.mailClaimStatus?.updatedAt === record.timestamp &&
        cacheResult.cache.mailClaimStatus.data?.success
      ) {
        const calls: any[] = [{ name: 'userGetInfo' }, { name: 'inventoryGet' }, { name: 'getInventory', feature: 'inventory' }];
        if (cacheResult.cache.mailClaimStatus.data.kind === 'reports')
          calls.push({ name: 'getPage', feature: 'report', args: { limit: 50, cursor: null } });
        const dispatch = rpcMessageForSettings(stored, calls);
        if (dispatch) cr.tabs.sendMessage(sender.tab.id, { ...dispatch, group: 'mail-refresh' }).catch(() => {});
      }
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        cacheResult.cache.speedupStatus?.updatedAt === record.timestamp &&
        cacheResult.cache.speedupStatus.data?.success
      ) {
        const calls = speedupService.refreshCalls(cacheResult.cache.speedupStatus.data.kind);
        const dispatch = rpcMessageForSettings(stored, calls);
        if (dispatch) cr.tabs.sendMessage(sender.tab.id, { ...dispatch, group: 'speedup-refresh' }).catch(() => {});
      }
      if (rpcMessageForSettings(stored, []) && sender.tab?.id) {
        let calls = passiveMarchReads(
          cacheResult.cache,
          socketRefreshCalls(record, cacheResult.cache),
          Date.now(),
          Date.parse(record.timestamp)
        );
        let version: any;
        try {
          version = JSON.parse(record.payload)?.result?.body?.rallyVersion;
        } catch (_) {}
        const isRallyCreated = record.eventType === 'rallyCreated';
        calls = await passiveWorldReads(cacheResult.cache, calls, sender.tab.id, Date.now(), {
          after: Date.parse(record.timestamp),
          version,
          isRallyCreated
        }, cr);
        const dispatch = rpcMessageForSettings(stored, calls);
        if (calls.length && dispatch) {
          cr.tabs?.sendMessage?.(sender.tab.id, {
            ...dispatch,
            ...(isRallyCreated ? { group: 'priority-rally' } : {})
          })?.catch?.(() => {});
        }
      }
      const accountLoaded =
        cacheResult.cache.accountStatus?.updatedAt === record.timestamp &&
        (String(stored.rpcCache?.accountStatus?.data?.id ?? '') !== String(cacheResult.cache.accountStatus?.data?.id ?? '') ||
          /"name"\s*:\s*"mobileLogin"/.test(record.requestBody || ''));
      if (rpcMessageForSettings(stored, []) && sender.tab?.id && accountLoaded) {
        let calls = passiveMarchReads(cacheResult.cache, [
          { name: 'getSummary', feature: 'building' },
          { name: 'getSummary', feature: 'personalResearch' },
          { name: 'getMarches', feature: 'march' },
          { name: 'getUnitSummary', feature: 'unit' },
          { name: 'getIncomingMarches', feature: 'march', args: {} }
        ]);
        calls = await passiveWorldReads(cacheResult.cache, calls, sender.tab.id, Date.now(), {}, cr);
        const dispatch = rpcMessageForSettings(stored, calls);
        if (calls.length && dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        cacheResult.cache.brigandCampStatus?.updatedAt === record.timestamp &&
        cacheResult.cache.brigandCampStatus.data?.success
      ) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'refillableGetAll', feature: 'refillable' },
          { name: 'inventoryGet' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const expeditionCollect = cacheResult.cache.expeditionCollectStatus;
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        expeditionCollect?.data?.success &&
        expeditionCollect.updatedAt === record.timestamp &&
        expeditionCollect.data.token !== stored.rpcCache?.expeditionCollectStatus?.data?.token
      ) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'expeditionGet' },
          { name: 'inventoryGet' },
          { name: 'questGetAll' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const expeditionStart = cacheResult.cache.expeditionStartStatus;
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        expeditionStart?.data?.success &&
        expeditionStart.updatedAt === record.timestamp &&
        expeditionStart.data.token !== stored.rpcCache?.expeditionStartStatus?.data?.token
      ) {
        const dispatch = rpcMessageForSettings(stored, [{ name: 'expeditionGet' }, { name: 'questGetAll' }]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const spinStatus = cacheResult.cache.freeAlchemySpinStatus;
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        spinStatus?.data?.success &&
        spinStatus.updatedAt === record.timestamp &&
        spinStatus.data.token !== stored.rpcCache?.freeAlchemySpinStatus?.data?.token
      ) {
        const dispatch = rpcMessageForSettings(stored, [{ name: 'userGetInfo' }, { name: 'questGetAll' }]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const clashClaimList = (raw: any) => (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []);
      const clashClaims = clashClaimList(cacheResult.cache.clanClashClaimStatus?.data?.claims);
      const previousClashClaims = clashClaimList(stored.rpcCache?.clanClashClaimStatus?.data?.claims);
      const newClashClaim = clashClaims.some(
        (claim: any) => claim?.at === record.timestamp && !previousClashClaims.some((previous: any) => previous?.token === claim.token)
      );
      if (stored.popupRpcEnabled === true && cacheResult.changed && newClashClaim && sender.tab?.id) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'userGetInfo' },
          { name: 'inventoryGet' },
          { name: 'refillableGetAll', feature: 'refillable' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const isVersusChestClaim = rpcCacheService.extract(record).some((e: any) => e.key === 'clanVersusChestAction');
      if (stored.popupRpcEnabled === true && cacheResult.changed && isVersusChestClaim && sender.tab?.id) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'userGetInfo' },
          { name: 'inventoryGet' },
          { name: 'refillableGetAll', feature: 'refillable' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const isBattlepassClaim = rpcCacheService.extract(record).some((e: any) => e.key === 'battlepassClaimAction');
      if (stored.popupRpcEnabled === true && cacheResult.changed && isBattlepassClaim && sender.tab?.id) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'userGetInfo' },
          { name: 'inventoryGet' },
          { name: 'refillableGetAll', feature: 'refillable' },
          { name: 'getBattlepassState', feature: 'battlepass' },
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const rawClaims = cacheResult.cache.questClaimStatus?.data?.claims;
      const claims = Array.isArray(rawClaims) ? rawClaims : rawClaims && typeof rawClaims === 'object' ? Object.values(rawClaims) : [];
      const latestClaim = claims.length > 0 ? claims[claims.length - 1] : null;
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        latestClaim?.needsSync &&
        latestClaim.at === record.timestamp &&
        sender.tab?.id
      ) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'userGetInfo' },
          { name: 'inventoryGet' },
          { name: 'refillableGetAll', feature: 'refillable' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        rpcCacheService.extract(record).some((entry: any) => entry.key === 'skinUpgradeAction')
      ) {
        const dispatch = rpcMessageForSettings(stored, [{ name: 'heroGetAll' }, { name: 'inventoryGet' }]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      if (
        stored.popupRpcEnabled === true &&
        cacheResult.changed &&
        sender.tab?.id &&
        rpcCacheService.extract(record).some((entry: any) =>
          ['completeTrainingAction', 'startTrainingAction', 'startHealingAction', 'completeHealingAction'].includes(entry.key)
        )
      ) {
        const dispatch = rpcMessageForSettings(stored, [
          { name: 'getUnitSummary', feature: 'unit' },
          { name: 'getTrainings', feature: 'unit' },
          { name: 'getHealing', feature: 'unit' }
        ]);
        if (dispatch) cr.tabs?.sendMessage?.(sender.tab.id, dispatch)?.catch?.(() => {});
      }
      const recState = (await cr.storage?.session?.get(RECORD_STATE_KEY))?.[RECORD_STATE_KEY];
      if (!recState?.active) return { saved: false, cached: cacheResult.changed };
      try {
        await cr.storage?.session?.set({
          [`${RECORD_PREFIX}${recState.nextIndex}`]: record,
          [RECORD_STATE_KEY]: { ...recState, nextIndex: recState.nextIndex + 1 }
        });
        return { saved: true, cached: cacheResult.changed };
      } catch (error) {
        const next = { ...recState, active: false, error: 'Session storage is full. Export the current log.' };
        try {
          await cr.storage?.session?.set({ [RECORD_STATE_KEY]: next });
        } catch (_) {
          await cr.storage?.session?.set({ [RECORD_STATE_KEY]: { active: false, nextIndex: recState.nextIndex } });
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
  };

  cr.runtime?.onMessage?.addListener?.(messageListener);

  return {
    listener: messageListener,
    updateRpcQueueCount: (tabId: any, count: any) => updateRpcQueueCount(tabId, count, cr),
    findAllGameTabs: () => findAllGameTabs(cr),
    findActiveGameTab: () => findActiveGameTab(cr),
    runFreeSpin: (manual?: boolean, record?: any, sourceTabId?: any) => runFreeSpin(manual, record, sourceTabId, cr),
    reconcileSpeedup: (cache: any) => reconcileSpeedup(cache, cr),
    useConfirmedSpeedup: (msg: any) => useConfirmedSpeedup(msg, cr),
    reconcileMailClaim: (cache: any) => reconcileMailClaim(cache, cr),
    claimMail: (msg: any) => claimMail(msg, cr),
    pruneExpiredMail: () => pruneExpiredMail(cr),
    scheduleMailExpiry: (cache: any) => scheduleMailExpiry(cache, cr),
    advanceBuildingQueue: (tabId?: number, record?: any) => advanceBuildingQueue(tabId, record, cr),
    advanceResearchQueue: (tabId?: number, record?: any) => advanceResearchQueue(tabId, record, cr),
    advanceCityQueue: (type: string, tabId?: number, record?: any) => advanceCityQueue(type, tabId, record, cr),
    runCityQueue: (type: string, tabId?: number, record?: any) => runCityQueue(type, tabId, record, cr),
    mutateCityQueue: (type: string, message: any) => mutateCityQueue(type, message, cr),
    evaluatePriorityAutoJoin: (record: any, cache: any, stored: any, tabId: number) =>
      evaluatePriorityAutoJoin(record, cache, stored, tabId, cr),
    evaluateMineDefense: (record: any, cache: any, stored: any, state: any, tabId: number, now: number) =>
      evaluateMineDefense(record, cache, stored, state, tabId, now, cr),
    dropMineDefenseRpc: (tabId: number) => dropMineDefenseRpc(tabId, cr),
    evaluateSmartGather: (record: any, cache: any, stored: any, tabId: number, now?: number) =>
      evaluateSmartGather(record, cache, stored, tabId, now, cr),
    evaluateAutoGather: (record: any, currentCache: any, stored: any, tabId: number) =>
      evaluateAutoGather(record, currentCache, stored, tabId, cr),
    tickAutoGather: (reset?: boolean) => tickAutoGather(reset, cr),
    deferQueueForGathering: (queueType: string, options: any, tabId: number, accountId: any, stored: any, now: number = Date.now()) =>
      deferQueueForGathering(queueType, options, tabId, accountId, stored, now, cr),
    advanceGatherQueue: (queueType: string, record: any, stored: any, tabId: number) =>
      advanceGatherQueue(queueType, record, stored, tabId, cr),
    socketRefreshCalls: (record: any, cache: any) => socketRefreshCalls(record, cache),
    saveRaidTransition: (transition: any, stored: any) => saveRaidTransition(transition, stored, cr),
    updateRaidQueue: (record: any, tabId: number) => updateRaidQueue(record, tabId, cr),
    evaluateRaidEnergy: (tabId: number, sessionId: string, now?: number) => evaluateRaidEnergy(tabId, sessionId, now, cr),
    saveMonsterTransition: (transition: any, stored: any) => saveMonsterTransition(transition, stored, cr),
    updateMonsterQueue: (record: any, tabId: number) => updateMonsterQueue(record, tabId, cr),
    saveTowerTransition: (transition: any, stored: any) => saveTowerTransition(transition, stored, cr),
    updateTowerRun: (record: any, tabId: number) => updateTowerRun(record, tabId, cr),
    saveDungeonTransition: (transition: any, stored: any) => saveDungeonTransition(transition, stored, cr),
    updateDungeonRun: (record: any, tabId: number) => updateDungeonRun(record, tabId, cr),
    passiveWorldReads: (cache: any, calls: any[], tabId: number, now?: number, options?: any) =>
      passiveWorldReads(cache, calls, tabId, now, options, cr),
    flushWorldReads: () => flushWorldReads(cr),
    scheduleWorldRead: (state: any) => scheduleWorldRead(state, cr),
    handleControl: (kind: string) => handleControl(kind, cr),
    recordedEntries: () => recordedEntries(cr),
    clearRecorded: () => clearRecorded(cr),
    interactionEntries: () => interactionEntries(cr),
    clearInteractions: () => clearInteractions(cr),
    drain: () => pending
  };
}
