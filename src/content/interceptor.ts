/**
 * API RPC Interceptor and Game Hook.
 * Operates in the game page MAIN world.
 */
import { isTrackingUrl } from '../utils/trackingFilter.ts';

export function installInterceptor(): void {
  const flag = Symbol.for('hwa-helper-api-intercept-installed');
  if ((window as any)[flag]) return;
  (window as any)[flag] = true;

  const MAX_BODY_CHARS = 512 * 1024;
  const originalFetch = typeof window.fetch === 'function' ? window.fetch : null;
  let captureEnabled = false;
  let popupRpcEnabled = false;
  let rpcDispatchMode = 'piggyback';
  let recordingActive = false;
  let lastNudgeAt = -Infinity;
  let lastNudgeTrackId: string | null = null;
  let lastNudgeType: string | null = null;
  const queuedRpcCalls = new Map<string, any>();
  const queuedClaimKeys = new Set<string>();
  const queuedActionExpiry = new Map<string, number>();
  const queuedRpcGroups = new Map<string, string>();
  let claimQueueTimer: any = null;
  let actionQueueTimer: any = null;

  function reportQueueStatus() {
    for (const key of queuedRpcGroups.keys()) {
      if (!queuedRpcCalls.has(key)) queuedRpcGroups.delete(key);
    }
    window.postMessage(
      { source: 'hwa-helper-api', kind: 'rpc-queue-status', count: queuedRpcCalls.size },
      location.origin
    );
    if (actionQueueTimer !== null) clearTimeout(actionQueueTimer);
    actionQueueTimer = null;
    if (queuedActionExpiry.size && typeof setTimeout === 'function') {
      const delay = Math.max(0, Math.min(...queuedActionExpiry.values()) - Date.now());
      actionQueueTimer = setTimeout(() => {
        for (const [key, expiresAt] of queuedActionExpiry) {
          if (Date.now() >= expiresAt) {
            queuedRpcCalls.delete(key);
            queuedActionExpiry.delete(key);
          }
        }
        reportQueueStatus();
      }, delay);
    }
  }

  const piggybackMethods = new Set([
    'randomDraft_getInfo',
    'getPage',
    'questGetAll',
    'questGetEvents',
    'getMarches',
    'getRallyById',
    'getUnitSummary',
    'userGetInfo',
    'inventoryGet',
    'heroGetAll',
    'titanGetAll',
    'teamGetAll',
    'refillableGetAll',
    'missionGetAll',
    'artifact_getAll',
    'titan_artifactGetCounters',
    'skin_getAll',
    'rune_getAll',
    'arenaGetAll',
    'clanWarGetBriefInfo',
    'mailGetAll',
    'searchMob',
    'searchMine',
    'getTrainings',
    'getHealing',
    'clan_getSummary',
    'getSummary',
    'playable_getAvailable',
    'worldStars_getAvailable'
  ]);

  const migratedReadFeatures = new Map([
    ['getInventory', 'inventory'],
    ['getInfo', 'clanVersus'],
    ['getCampSummary', 'camp'],
    ['getMineSummary', 'mine'],
    ['getMineById', 'mine'],
    ['getIncomingMarches', 'march'],
    ['expeditionGet', ''],
    ['user_getNextDayTime', ''],
    ['user_getClanInfo', ''],
    ['getUserClanMembersOutposts', 'globalMap'],
    ['getDailyQuests', 'quest'],
    ['getSpecialQuestState', 'quest'],
    ['magicTower_briefInfo', ''],
    ['magicTower_getAll', ''],
    ['dungeonGetInfo', ''],
    ['chatGetAll', '']
  ]);

  function isPiggybackRead(call: any): boolean {
    if (migratedReadFeatures.has(call?.name)) {
      return (call.feature ?? '') === migratedReadFeatures.get(call.name);
    }
    return piggybackMethods.has(call?.name);
  }

  const helperActionMethods = new Set([
    'winCampBattle',
    'createRally',
    'cancelRally',
    'joinRally',
    'attackMob',
    'attackMine',
    'stopMineGathering',
    'randomDraft_saveDefence',
    'randomDraft_saveAttack',
    'magicTower_enterRoom',
    'magicTower_startBattle',
    'magicTower_activateBuff',
    'magicTower_openChest',
    'magicTower_enterNextFloor',
    'startConstruction',
    'completeConstruction',
    'startResearch',
    'completeResearch',
    'startHealing',
    'startTraining',
    'completeTraining',
    'missionRaid',
    'mission_raid',
    'heroUpgradeSkill',
    'heroInsertItem',
    'inventoryCraftFragments',
    'inventoryCraftRecipe',
    'cinemaGiveReward',
    'cinemaGetCounters'
  ]);

  function isHelperAction(call: any): boolean {
    if (call?.name === 'expeditionFarm') {
      return (
        !call.feature &&
        Object.keys(call.args || {}).length === 1 &&
        Number.isInteger(call.args?.expeditionId) &&
        call.args.expeditionId >= 0
      );
    }
    if (call?.name === 'artifact_expeditionStart') {
      return (
        !call.feature &&
        Object.keys(call.args || {}).length === 2 &&
        Number.isInteger(call.args?.expeditionId) &&
        call.args.expeditionId >= 0 &&
        Array.isArray(call.args.heroes) &&
        [0, 5].includes(call.args.heroes.length) &&
        call.args.heroes.every((id: any) => Number.isInteger(id) && id > 0) &&
        new Set(call.args.heroes).size === call.args.heroes.length
      );
    }
    if (call?.name === 'refillable_alchemyUseVideo') {
      return !call.feature && call.args?.type === 'alchemy' && Object.keys(call.args).length === 1;
    }
    return helperActionMethods.has(call?.name);
  }

  const reportClaimResult = (ok: boolean, error: any = null) =>
    window.postMessage({ source: 'hwa-helper-api', kind: 'claim-rpc-result', ok, error }, location.origin);

  const tracePiggyback = (action: string, detail = '') => {
    if (!recordingActive) return;
    window.postMessage(
      {
        source: 'hwa-helper-api',
        kind: 'interaction-record',
        entry: {
          category: 'rpc',
          action,
          target: 'api/rpc',
          methodName: detail,
          timestamp: new Date().toISOString()
        }
      },
      location.origin
    );
  };

  let lastRpcUrl: string | null =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hwa_last_rpc_url') : null;
  if (lastRpcUrl && !lastRpcUrl.includes('/api/rpc')) {
    lastRpcUrl = null;
  }
  let lastRpcHeaders: any = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('hwa_last_rpc_headers');
      if (stored) lastRpcHeaders = JSON.parse(stored);
    }
  } catch (_) {}

  let highestRequestId = 0;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('hwa_highest_request_id');
      if (stored) highestRequestId = parseInt(stored, 10) || 0;
    }
  } catch (_) {}

  function syncRequestId(candidate: any) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = parseInt(sessionStorage.getItem('hwa_highest_request_id') || '0', 10);
        if (!isNaN(stored) && stored > highestRequestId) {
          highestRequestId = stored;
        }
      }
    } catch (_) {}

    const parsed = parseInt(candidate, 10);
    if (!isNaN(parsed)) {
      if (parsed > highestRequestId) {
        highestRequestId = parsed;
      } else if (popupRpcEnabled) {
        highestRequestId++;
      }
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
      }
    } catch (_) {}
    return highestRequestId;
  }

  function rememberRpcHeaders(headers: any) {
    if (!headers) return;
    try {
      const cleanHeaders: Record<string, string> = {};
      if (typeof headers.forEach === 'function') {
        headers.forEach((v: string, k: string) => {
          cleanHeaders[k.toLowerCase()] = v;
        });
      } else if (typeof headers === 'object') {
        for (const [k, v] of Object.entries(headers)) {
          cleanHeaders[k.toLowerCase()] = String(v);
        }
      }
      lastRpcHeaders = cleanHeaders;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('hwa_last_rpc_headers', JSON.stringify(cleanHeaders));
      }
    } catch (_) {}
  }

  // Intercept window.fetch
  if (originalFetch) {
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string' ? input : (input as any).url || input.toString();

      // Block analytics/telemetry requests
      if (isTrackingUrl(urlStr, location.origin)) {
        return new Response(JSON.stringify({ ok: true, blocked: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const isRpc = urlStr.includes('/api/rpc') || urlStr.includes('api.hero-wars-alliance.com');
      if (!isRpc || !init || init.method?.toUpperCase() !== 'POST') {
        return originalFetch.call(this, input, init);
      }

      // Remember RPC endpoint & headers
      lastRpcUrl = urlStr;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('hwa_last_rpc_url', urlStr);
      }
      rememberRpcHeaders(init.headers);

      // Piggyback injection if enabled
      let bodyText = typeof init.body === 'string' ? init.body : '';
      let parsedBody: any = null;
      let injectedCalls: any[] = [];

      try {
        parsedBody = JSON.parse(bodyText);
        if (parsedBody && typeof parsedBody === 'object') {
          syncRequestId(parsedBody.id);
          parsedBody.id = highestRequestId;

          if (popupRpcEnabled && queuedRpcCalls.size > 0 && Array.isArray(parsedBody.calls)) {
            const batch: any[] = [];
            for (const [key, call] of queuedRpcCalls.entries()) {
              batch.push(call);
              queuedRpcCalls.delete(key);
              if (batch.length >= 16) break;
            }
            if (batch.length > 0) {
              injectedCalls = batch;
              parsedBody.calls.push(...batch);
              tracePiggyback('piggyback-injected', `${batch.length} calls`);
              reportQueueStatus();
            }
          }
          bodyText = JSON.stringify(parsedBody);
          init.body = bodyText;
        }
      } catch (_) {}

      const startTime = Date.now();
      let response: Response;
      let responseText = '';

      try {
        response = await originalFetch.call(this, input, init);
        const cloned = response.clone();
        responseText = await cloned.text();
      } catch (err) {
        throw err;
      }

      // Record & resolve injected calls
      if (captureEnabled || recordingActive) {
        const record = {
          endpoint: urlStr,
          method: 'POST',
          status: response.status,
          requestBody: bodyText.slice(0, MAX_BODY_CHARS),
          responseBody: responseText.slice(0, MAX_BODY_CHARS),
          timestamp: new Date(startTime).toISOString(),
          durationMs: Date.now() - startTime,
          transport: 'fetch'
        };
        window.postMessage({ source: 'hwa-helper-api', kind: 'api-record', record }, location.origin);
      }

      return response;
    };
  }

  // Listen to control and queue messages from bridge
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      rpcDispatchMode = event.data.socketRefreshMode || 'piggyback';
      recordingActive = event.data.recordingActive === true;
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'queue-rpc') {
      const calls = Array.isArray(event.data.calls) ? event.data.calls : [];
      const group = event.data.group || 'default';
      const expiresAt = Number.isFinite(event.data.expiresAt) ? event.data.expiresAt : Date.now() + 60000;
      for (const call of calls) {
        const key = call.ident || `${call.name}_${Math.random().toString(36).slice(2)}`;
        queuedRpcCalls.set(key, call);
        queuedRpcGroups.set(key, group);
        queuedActionExpiry.set(key, expiresAt);
      }
      reportQueueStatus();
      return;
    }
  });

  window.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, location.origin);
}
