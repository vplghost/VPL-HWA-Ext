/**
 * API RPC Interceptor and Game Hook.
 * Operates in the game page MAIN world.
 * Intercepts fetch and XMLHttpRequest for game RPCs, handles piggyback RPCs,
 * hooks Unity WebGL engine / SendMessage, reports engine status, and synchronizes monotonic x-request-id.
 */
import { isTrackingUrl } from '../utils/trackingFilter.ts';
import { speedupService } from '../services/speedupService.ts';
import { mailService } from '../services/mailService.ts';

export interface InterceptRecord {
  endpoint: string;
  method?: string;
  status?: number | null;
  requestBody?: string | null;
  responseBody?: string | null;
  timestamp: string;
  transport?: string;
  direction?: string;
  encoding?: string;
  payload?: string;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  durationMs?: number;
  outcome?: 'completed' | 'failed';
}

export function isTargetRpcUrl(url: string | URL | Request): boolean {
  if (!url) return false;
  const str = typeof url === 'string' ? url : (url as any).url || url.toString();
  return str.includes('/api/rpc');
}

export function isMqttUrl(url: string | URL): boolean {
  if (!url) return false;
  const str = typeof url === 'string' ? url : url.toString();
  return str.includes('emqx-hwmb-wss.nextersglobal.com/mqtt') || str.includes('/mqtt');
}

export function createApiRecordMessage(record: InterceptRecord): {
  source: 'hwa-helper-api';
  kind: 'api-record';
  record: InterceptRecord;
} {
  return {
    source: 'hwa-helper-api',
    kind: 'api-record',
    record
  };
}

export function createQueueStatusMessage(count: number): {
  source: 'hwa-helper-api';
  kind: 'rpc-queue-status';
  count: number;
} {
  return {
    source: 'hwa-helper-api',
    kind: 'rpc-queue-status',
    count: Math.max(0, Math.min(64, Math.floor(count)))
  };
}

export function installInterceptor(customWindow?: any): void {
  const win = customWindow || (typeof window !== 'undefined' ? window : null);
  if (!win) return;

  const flag = Symbol.for('hwa-helper-api-intercept-installed');
  if (win[flag]) return;
  win[flag] = true;

  const loc = win.location || (typeof location !== 'undefined' ? location : { href: 'https://www.hero-wars-alliance.com/', origin: 'https://www.hero-wars-alliance.com' });
  const perf = win.performance || (typeof performance !== 'undefined' ? performance : { now: () => Date.now() });
  const doc = win.document || (typeof document !== 'undefined' ? document : null);

  const MAX_BODY_CHARS = 512 * 1024;
  const originalFetch = typeof win.fetch === 'function' ? win.fetch : null;
  const getNow = () => (typeof win.Date?.now === 'function' ? win.Date.now() : Date.now());
  const setTimer = (fn: any, ms?: number) => {
    const t = typeof win.setTimeout === 'function' ? win.setTimeout(fn, ms) : setTimeout(fn, ms);
    if (t && typeof (t as any).unref === 'function') (t as any).unref();
    return t;
  };
  const clearTimer = (id: any) => (typeof win.clearTimeout === 'function' ? win.clearTimeout(id) : clearTimeout(id));

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
    win.postMessage(
      createQueueStatusMessage(queuedRpcCalls.size),
      loc.origin
    );
    if (actionQueueTimer !== null) clearTimer(actionQueueTimer);
    actionQueueTimer = null;
    if (queuedActionExpiry.size) {
      const delay = Math.max(0, Math.min(...queuedActionExpiry.values()) - getNow());
      actionQueueTimer = setTimer(() => {
        for (const [key, expiresAt] of queuedActionExpiry) {
          if (getNow() >= expiresAt) {
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
    if (speedupService.kindFor(call)) {
      return Boolean(speedupService.validate(call) && /^[a-f0-9]{32}$/.test(call.ident || ''));
    }
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

  const trackedMail = (call: any) => Boolean(mailService.validateClaim(call) && /^[a-f0-9]{32}$/.test(call?.ident || ''));
  const claimActionMethods = new Set(['mailFarm', 'readAndClaimAll', 'quest_multiFarm']);
  const claimQueueMethods = new Set([...claimActionMethods, 'mailGetAll', 'questGetAll']);
  const reportClaimResult = (ok: boolean, error: any = null) =>
    win.postMessage({ source: 'hwa-helper-api', kind: 'claim-rpc-result', ok, error }, loc.origin);

  const tracePiggyback = (action: string, detail = '') => {
    if (!recordingActive) return;
    win.postMessage(
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
      loc.origin
    );
  };

  const getStorage = () => (typeof win.sessionStorage !== 'undefined' ? win.sessionStorage : (typeof sessionStorage !== 'undefined' ? sessionStorage : null));

  let lastRpcUrl: string | null = null;
  try {
    const s = getStorage();
    if (s) lastRpcUrl = s.getItem('hwa_last_rpc_url');
  } catch (_) {}
  if (lastRpcUrl && !lastRpcUrl.includes('/api/rpc')) {
    lastRpcUrl = null;
  }

  let lastRpcHeaders: any = null;
  try {
    const s = getStorage();
    if (s) {
      const stored = s.getItem('hwa_last_rpc_headers');
      if (stored) lastRpcHeaders = JSON.parse(stored);
    }
  } catch (_) {}

  let highestRequestId = 0;
  try {
    const s = getStorage();
    if (s) {
      const stored = s.getItem('hwa_highest_request_id');
      if (stored) highestRequestId = parseInt(stored, 10) || 0;
    }
  } catch (_) {}

  function syncRequestId(candidate: any) {
    try {
      const s = getStorage();
      if (s) {
        const stored = parseInt(s.getItem('hwa_highest_request_id') || '0', 10);
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
        candidate = String(highestRequestId);
      }
      try {
        const s = getStorage();
        if (s) {
          s.setItem('hwa_highest_request_id', String(highestRequestId));
        }
      } catch (_) {}
    }
    return candidate;
  }

  try {
    win.__hwaRequestIdState = {
      get: () => {
        try {
          const s = getStorage();
          if (s) {
            const stored = parseInt(s.getItem('hwa_highest_request_id') || '0', 10);
            if (!isNaN(stored) && stored > highestRequestId) highestRequestId = stored;
          }
        } catch (_) {}
        return highestRequestId;
      },
      setOffset: (offset: any) => {
        const val = parseInt(offset, 10);
        if (!isNaN(val) && val > highestRequestId) {
          highestRequestId = val;
          try {
            const s = getStorage();
            if (s) s.setItem('hwa_highest_request_id', String(highestRequestId));
          } catch (_) {}
        }
        return highestRequestId;
      }
    };
  } catch (_) {}

  function getNextRequestId(baseHeaders: any) {
    try {
      const s = getStorage();
      if (s) {
        const stored = parseInt(s.getItem('hwa_highest_request_id') || '0', 10);
        if (!isNaN(stored) && stored > highestRequestId) highestRequestId = stored;
      }
    } catch (_) {}

    if (baseHeaders && typeof baseHeaders === 'object') {
      const reqIdKey = Object.keys(baseHeaders).find((k) => k.toLowerCase() === 'x-request-id');
      const raw = reqIdKey ? baseHeaders[reqIdKey] : null;
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > highestRequestId) highestRequestId = parsed;
      }
    }
    highestRequestId++;
    try {
      const s = getStorage();
      if (s) s.setItem('hwa_highest_request_id', String(highestRequestId));
    } catch (_) {}
    return String(highestRequestId);
  }

  function buildDispatchHeaders(baseHeaders: any) {
    const headers: Record<string, string> = {};
    if (baseHeaders && typeof baseHeaders === 'object') {
      for (const [rawKey, val] of Object.entries(baseHeaders)) {
        if (!rawKey || val === undefined || val === null) continue;
        const key = rawKey.toLowerCase();
        if (key.startsWith(':')) continue;
        if (key === 'content-length' || key === 'host' || key === 'origin' || key === 'referer') continue;
        if (key === 'x-auth-signature') continue;
        if (key === 'x-request-id' || key === 'x-env-timestamp') continue;
        headers[rawKey] = String(val);
      }
    }
    headers['content-type'] = 'application/json; charset=UTF-8';
    headers['accept'] = '*/*';
    headers['x-requested-with'] = 'XMLHttpRequest';
    headers['x-request-id'] = getNextRequestId(baseHeaders);
    headers['x-env-timestamp'] = String(Math.floor(Date.now() / 1000));

    try {
      const auth = win.webglAuth;
      if (auth && auth.accessToken) {
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
        if (auth.accountId && !headers['x-auth-user-id'] && !headers['X-Auth-User-Id']) {
          headers['x-auth-user-id'] = String(auth.accountId);
        }
      }
    } catch (_) {}

    return headers;
  }

  // --- Engine & Unity Discovery ---
  let activeUnityInstance: any = null;

  function findActiveUnityInstance(targetWin = win, targetDoc = doc) {
    if (!targetWin) return null;
    if (typeof targetWin.SendMessage === 'function') {
      return { SendMessage: targetWin.SendMessage.bind(targetWin), _source: 'window.SendMessage' };
    }
    const candidateProps = [
      'unityInstance',
      'gameInstance',
      'Module',
      'unity',
      'Unity',
      'hwa',
      'HWA',
      'nexters',
      'Nexters',
      'app',
      'engine',
      'game'
    ];
    for (const prop of candidateProps) {
      try {
        const val = targetWin[prop];
        if (val && typeof val === 'object') {
          if (typeof val.SendMessage === 'function') return val;
          if (val.unityInstance && typeof val.unityInstance.SendMessage === 'function') return val.unityInstance;
          if (val.instance && typeof val.instance.SendMessage === 'function') return val.instance;
        }
      } catch (_) {}
    }
    if (targetDoc) {
      try {
        const canvases = (typeof targetDoc.querySelectorAll === 'function' ? targetDoc.querySelectorAll('canvas#unity-canvas, canvas#canvas, canvas') : []) || [];
        for (const canvas of canvases) {
          if (!canvas) continue;
          const canvasCandidates = [
            canvas.unityInstance,
            canvas._unityInstance,
            canvas.gameInstance,
            canvas._gameInstance,
            canvas.Module
          ];
          for (const cand of canvasCandidates) {
            if (cand && typeof cand === 'object' && typeof cand.SendMessage === 'function') return cand;
          }
        }
      } catch (_) {}
    }
    try {
      const props = Object.getOwnPropertyNames(targetWin);
      for (const prop of props) {
        if (/unity|game|hwa|nexter|module|engine/i.test(prop)) {
          try {
            const val = targetWin[prop];
            if (val && typeof val === 'object' && typeof val.SendMessage === 'function') return val;
          } catch (_) {}
        }
      }
    } catch (_) {}
    try {
      if (targetWin.unityInstance && typeof targetWin.unityInstance === 'object') return targetWin.unityInstance;
      if (targetWin.gameInstance && typeof targetWin.gameInstance === 'object') return targetWin.gameInstance;
    } catch (_) {}
    return null;
  }

  function reportEngineStatus(reason = 'check') {
    try {
      if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
        const candidate = findActiveUnityInstance(win, doc);
        if (candidate) setUnityInstance(candidate, `scanner-${reason}`);
      }
      const hasSendMessage = typeof activeUnityInstance?.SendMessage === 'function';
      const hasCanvas = typeof doc !== 'undefined' && typeof doc?.querySelector === 'function' && Boolean(doc.querySelector('canvas#unity-canvas, canvas#canvas, canvas'));
      let detectedGlobals: string[] = [];
      try {
        detectedGlobals = Object.getOwnPropertyNames(win).filter((k) => /unity|game|hwa|nexter|launch|module/i.test(k)).slice(0, 20);
      } catch (_) {}

      const status = {
        ready: Boolean(activeUnityInstance),
        hasSendMessage,
        hasCanvas,
        hasRpcHeaders: Boolean(lastRpcHeaders && Object.keys(lastRpcHeaders).length > 0),
        rpcUrlAvailable: Boolean(lastRpcUrl),
        detectedGlobals,
        updatedAt: new Date().toISOString(),
        reason
      };
      win.postMessage({
        source: 'hwa-helper-api',
        kind: 'engine-status',
        status
      }, loc.origin);
    } catch (_) {}
  }

  function setUnityInstance(instance: any, source = 'detected') {
    if (!instance) return;
    instrumentEngineMethod(instance, 'SendMessage', source);
    if (activeUnityInstance === instance) return;
    if (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function' && typeof instance.SendMessage !== 'function') {
      return;
    }
    activeUnityInstance = instance;
    win.__hwaUnityInstance = instance;
    reportEngineStatus(`instance-${source}`);
  }

  function instrumentEngineMethod(instance: any, methodName: string, source: any) {
    try {
      const original = instance?.[methodName];
      if (typeof original !== 'function' || original.__hwaRecordWrapped) return;
      const wrapped = function (this: any, ...args: any[]) {
        if (recordingActive) {
          const param = args[2];
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'interaction-record',
            entry: {
              category: 'engine',
              action: 'call',
              timestamp: new Date().toISOString(),
              target: String(source).slice(0, 80),
              objectName: String(args[0] ?? '').slice(0, 160),
              methodName: String(args[1] ?? methodName).slice(0, 160),
              paramType: typeof param,
              paramLength: typeof param === 'string' ? param.length : 0
            }
          }, loc.origin);
        }
        return original.apply(this, args);
      };
      wrapped.__hwaRecordWrapped = true;
      instance[methodName] = wrapped;
    } catch (_) {}
  }

  function hookCreateUnityInstance(original: any) {
    if (typeof original !== 'function' || original.__hwaHooked) return original;
    const hooked = function (this: any, ...args: any[]) {
      reportEngineStatus('createUnityInstance-called');
      const res = original.apply(this, args);
      if (res && typeof res.then === 'function') {
        return res.then((instance: any) => {
          setUnityInstance(instance, 'createUnityInstance-resolve');
          return instance;
        });
      }
      if (res && typeof res === 'object') {
        setUnityInstance(res, 'createUnityInstance-return');
      }
      return res;
    };
    hooked.__hwaHooked = true;
    return hooked;
  }

  try {
    if (typeof win.createUnityInstance === 'function') {
      win.createUnityInstance = hookCreateUnityInstance(win.createUnityInstance);
    } else {
      let _cui: any = undefined;
      Object.defineProperty(win, 'createUnityInstance', {
        configurable: true,
        enumerable: true,
        get: () => _cui,
        set: (fn) => { _cui = hookCreateUnityInstance(fn); }
      });
    }
  } catch (_) {}

  try {
    let _uf = win.unityFramework;
    Object.defineProperty(win, 'unityFramework', {
      configurable: true,
      enumerable: true,
      get: () => _uf,
      set: (fn) => {
        if (typeof fn === 'function' && !fn.__hwaHooked) {
          const origFn = fn;
          _uf = function (this: any, mod: any, ...args: any[]) {
            if (mod && typeof mod === 'object') {
              if (Array.isArray(mod.postRun)) {
                mod.postRun.push(() => {
                  setUnityInstance({
                    SendMessage: typeof mod.SendMessage === 'function' ? mod.SendMessage.bind(mod) : null,
                    Module: mod
                  }, 'unityFramework-postRun');
                });
              }
            }
            return origFn.apply(this, [mod, ...args]);
          };
          _uf.__hwaHooked = true;
        } else {
          _uf = fn;
        }
      }
    });
  } catch (_) {}

  function watchGlobalProperty(propName: string) {
    try {
      let val = win[propName];
      if (val) {
        if (typeof val === 'function' && propName === 'SendMessage') {
          setUnityInstance({ SendMessage: val.bind(win), _source: 'window.SendMessage' }, 'existing-SendMessage');
        } else if (typeof val === 'object') {
          setUnityInstance(val, `existing-${propName}`);
        }
      }
      Object.defineProperty(win, propName, {
        configurable: true,
        enumerable: true,
        get: () => val,
        set: (newVal) => {
          val = newVal;
          if (typeof newVal === 'function' && propName === 'SendMessage') {
            setUnityInstance({ SendMessage: newVal.bind(win), _source: 'window.SendMessage' }, 'set-SendMessage');
          } else if (newVal && typeof newVal === 'object') {
            setUnityInstance(newVal, `set-${propName}`);
          }
        }
      });
    } catch (_) {}
  }

  watchGlobalProperty('unityInstance');
  watchGlobalProperty('gameInstance');
  watchGlobalProperty('Module');
  watchGlobalProperty('SendMessage');

  // --- Legend Draft Memory Scanner ---
  let lastDraftPayload: any = null;
  let draftHookScanTimers: any[] = [];
  const capturedDraftStrings: any[] = [];

  function getWasmMemory() {
    const mod = activeUnityInstance?.Module || win.Module || activeUnityInstance;
    if (!mod) return null;
    let heapU8: Uint8Array | null = null;
    let heapU32: Uint32Array | null = null;
    try {
      if (mod.HEAPU8 && mod.HEAPU8.buffer && !mod.HEAPU8.buffer.detached) heapU8 = mod.HEAPU8;
      else if (mod.wasmMemory?.buffer && !mod.wasmMemory.buffer.detached) heapU8 = new Uint8Array(mod.wasmMemory.buffer);
      if (mod.HEAPU32 && mod.HEAPU32.buffer && !mod.HEAPU32.buffer.detached) heapU32 = mod.HEAPU32;
      else if (mod.wasmMemory?.buffer && !mod.wasmMemory.buffer.detached) heapU32 = new Uint32Array(mod.wasmMemory.buffer);
    } catch (_) {}
    return { mod, heapU8, heapU32 };
  }

  function findSequenceInHeap(heapU8: Uint8Array, targetBytes: Uint8Array, maxMatches = 10) {
    if (!heapU8 || !targetBytes || targetBytes.length === 0) return [];
    const len = targetBytes.length;
    const max = heapU8.length - len;
    const first = targetBytes[0];
    const matches: number[] = [];
    for (let i = 0; i < max; i++) {
      if (heapU8[i] === first) {
        let match = true;
        for (let j = 1; j < len; j++) {
          if (heapU8[i + j] !== targetBytes[j]) { match = false; break; }
        }
        if (match) {
          matches.push(i);
          if (matches.length >= maxMatches) break;
        }
      }
    }
    return matches;
  }

  function scanCandidateHeroArrays(heapU32: Uint32Array, maxResults = 8) {
    if (!heapU32) return [];
    const results: any[] = [];
    const len = heapU32.length - 26;
    for (let i = 0; i < len; i++) {
      const candidateCount = heapU32[i];
      if (candidateCount === 25 || candidateCount === 15) {
        let valid = true;
        const heroIds: number[] = [];
        for (let j = 1; j <= candidateCount; j++) {
          const val = heapU32[i + j];
          if (val === undefined || val < 1 || val > 150) { valid = false; break; }
          heroIds.push(val);
        }
        if (valid) {
          const chunkSize = candidateCount === 25 ? 5 : 3;
          let distinctInChunks = true;
          for (let c = 0; c < candidateCount; c += chunkSize) {
            const chunk = heroIds.slice(c, c + chunkSize);
            if (new Set(chunk).size !== chunkSize) { distinctInChunks = false; break; }
          }
          if (distinctInChunks) {
            results.push({ ptr: i * 4, count: candidateCount, heroIds });
            if (results.length >= maxResults) break;
          }
        }
      }
    }
    return results;
  }

  function instrumentModuleStrings(mod: any) {
    if (!mod || mod.__hwaStringsHooked) return;
    const origUTF8ToString = mod.UTF8ToString;
    if (typeof origUTF8ToString === 'function') {
      mod.UTF8ToString = function (this: any, ptr: any, maxBytesToRead: any) {
        const str = origUTF8ToString.apply(this, arguments);
        if (typeof str === 'string' && str.length > 0 && str.length < 250 && (str.includes('hero') || str.includes('draft') || str.includes('Hero') || str.includes('Draft'))) {
          if (capturedDraftStrings.length > 100) capturedDraftStrings.shift();
          capturedDraftStrings.push({ time: Date.now(), str, ptr });
        }
        return str;
      };
      mod.UTF8ToString.__hwaOriginal = origUTF8ToString;
    }
    mod.__hwaStringsHooked = true;
  }

  function runLegendDraftMemoryScan() {
    const memory = getWasmMemory();
    if (!memory || !memory.mod) {
      return { ok: false, error: 'Unity WebGL Module or WebAssembly memory buffer not available' };
    }
    instrumentModuleStrings(memory.mod);
    let cipherOffsets: number[] = [];
    if (lastDraftPayload?.draft) {
      try {
        const binStr = atob(lastDraftPayload.draft);
        const rawTargetBytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) rawTargetBytes[i] = binStr.charCodeAt(i);
        if (memory.heapU8) cipherOffsets = findSequenceInHeap(memory.heapU8, rawTargetBytes);
      } catch (_) {}
    }
    const detectedPools = memory.heapU32 ? scanCandidateHeroArrays(memory.heapU32) : [];
    const topCandidateIds = detectedPools[0]?.heroIds || null;
    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      stageId: lastDraftPayload?.stageId ?? null,
      draftBase64: lastDraftPayload?.draft ?? null,
      cipherOffsets,
      detectedPoolsCount: detectedPools.length,
      detectedCandidatePools: detectedPools,
      topCandidateIds,
      capturedStringsCount: capturedDraftStrings.length
    };
    if (topCandidateIds) win.__hwa_legend_draft_candidates = topCandidateIds;
    try {
      win.postMessage({ source: 'hwa-helper-api', kind: 'legend-draft-hook-result', payload: result }, loc.origin);
    } catch (_) {}
    return result;
  }

  function scheduleLegendDraftScans() {
    draftHookScanTimers.forEach(clearTimer);
    draftHookScanTimers = [];
    const delays = [100, 300, 700, 1500, 3000];
    for (const delay of delays) {
      const timer = setTimer(() => {
        const res = runLegendDraftMemoryScan();
        if (res && res.ok && (res as any).topCandidateIds) {
          draftHookScanTimers.forEach(clearTimer);
          draftHookScanTimers = [];
        }
      }, delay);
      if (timer && typeof (timer as any).unref === 'function') (timer as any).unref();
      draftHookScanTimers.push(timer);
    }
  }

  function handleLegendDraftRpcResponse(resText: string) {
    if (!resText || !resText.includes('randomDraft_getInfo')) return;
    try {
      const parsed = JSON.parse(resText);
      const draftObj = parsed?.results?.find((r: any) => r.ident === 'randomDraft_getInfo' || r.result?.response?.draft)?.result?.response;
      if (draftObj && draftObj.draft) {
        lastDraftPayload = { stageId: draftObj.stageId, draft: draftObj.draft, draftEnemy: draftObj.draftEnemy, receivedAt: Date.now() };
        scheduleLegendDraftScans();
      }
    } catch (_) {}
  }

  win.__hwaLegendDraftHook = {
    getMemory: getWasmMemory,
    runScan: runLegendDraftMemoryScan,
    getLastPayload: () => lastDraftPayload,
    getCapturedStrings: () => [...capturedDraftStrings],
    findSequenceInHeap,
    scanCandidateHeroArrays,
    handleLegendDraftRpcResponse
  };

  // --- Message Listener ---
  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.origin !== loc.origin) return;

    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      rpcDispatchMode = ['direct', 'mqtt-piggyback'].includes(event.data.socketRefreshMode) ? event.data.socketRefreshMode : 'piggyback';
      recordingActive = event.data.recordingActive === true;
      if (!captureEnabled || !popupRpcEnabled || event.data.socketRefreshMode === 'direct') {
        if (queuedClaimKeys.size) reportClaimResult(false, 'Queued claims were cancelled by Settings.');
        queuedRpcCalls.clear();
        queuedClaimKeys.clear();
        queuedActionExpiry.clear();
        if (claimQueueTimer !== null) clearTimer(claimQueueTimer);
        claimQueueTimer = null;
      }
      reportQueueStatus();
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'drop-rpc-group') {
      for (const [key, group] of queuedRpcGroups) {
        if (!queuedRpcCalls.has(key) || group === event.data.group) {
          if (group === event.data.group) { queuedRpcCalls.delete(key); queuedActionExpiry.delete(key); }
          queuedRpcGroups.delete(key);
        }
      }
      reportQueueStatus();
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && ['queue-rpc', 'queue-claim'].includes(event.data.kind)) {
      if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct' || !Array.isArray(event.data.calls)) return;
      const isClaim = event.data.kind === 'queue-claim';
      if (Number.isFinite(event.data.expiresAt) && getNow() >= event.data.expiresAt) return;
      for (const call of event.data.calls) {
        if (!(isClaim ? claimQueueMethods.has(call?.name) : isPiggybackRead(call) || isHelperAction(call))) continue;
        const safe = {
          name: call.name,
          args: call.args || {},
          ...(speedupService.kindFor(call) || trackedMail(call) ? { ident: call.ident } : {}),
          ...(call.feature ? { feature: call.feature } : {})
        };
        const key = JSON.stringify(safe);
        if (event.data.calls.some((item: any) => isHelperAction(item) || claimActionMethods.has(item?.name)) && isPiggybackRead(call)) {
          queuedRpcCalls.delete(key);
        }
        if (!queuedRpcCalls.has(key)) {
          if (queuedRpcCalls.size >= 64) {
            const oldest = [...queuedRpcCalls.keys()].find((item) => !queuedClaimKeys.has(item) && !queuedActionExpiry.has(item));
            if (!oldest) continue;
            queuedRpcCalls.delete(oldest);
            queuedClaimKeys.delete(oldest);
          }
          queuedRpcCalls.set(key, safe);
          if (typeof event.data.group === 'string') queuedRpcGroups.set(key, event.data.group);
          if (isHelperAction(call) || Number.isFinite(event.data.expiresAt)) {
            queuedActionExpiry.set(key, Math.min(getNow() + 120000, event.data.expiresAt || Infinity));
          }
        }
        if (isClaim) queuedClaimKeys.add(key);
      }
      if (isClaim && queuedClaimKeys.size) {
        if (claimQueueTimer !== null) clearTimer(claimQueueTimer);
        claimQueueTimer = setTimer(() => {
          for (const key of queuedClaimKeys) queuedRpcCalls.delete(key);
          queuedClaimKeys.clear();
          claimQueueTimer = null;
          tracePiggyback('piggyback-expired', 'claim');
          reportClaimResult(false, 'No game RPC arrived within two minutes. Retry the claim.');
          reportQueueStatus();
        }, 120000);
      }
      tracePiggyback('piggyback-queued', `${isClaim ? 'claim' : 'refresh'}:${event.data.calls.length}`);
      reportQueueStatus();
      if (rpcDispatchMode === 'mqtt-piggyback' && queuedRpcCalls.size) {
        lastNudgeAt = getNow();
        lastNudgeTrackId = event.data?.trackId || null;
        win.postMessage({
          source: 'hwa-helper-control',
          kind: 'mqtt-rpc-nudge',
          trackId: event.data?.trackId,
          requestedAt: event.data?.requestedAt
        }, loc.origin);
      }
      return;
    }

    if (event.data?.source === 'hwa-helper-api' && event.data.kind === 'mqtt-rpc-nudge-status') {
      if (event.data.state === 'triggered') {
        lastNudgeAt = getNow();
        if (event.data.nudgeType) lastNudgeType = event.data.nudgeType;
        if (event.data.trackId) lastNudgeTrackId = event.data.trackId;
      }
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'refresh-rpc') {
      if (!popupRpcEnabled) return;
      if (Number.isFinite(event.data.expiresAt) && getNow() >= event.data.expiresAt) return;
      if (rpcDispatchMode !== 'direct') {
        win.postMessage({ ...event.data, kind: 'queue-rpc' }, loc.origin);
        return;
      }
      const calls = event.data.calls;
      const s = getStorage();
      const storedUrl = s ? s.getItem('hwa_last_rpc_url') : null;
      const rawUrl = (lastRpcUrl && lastRpcUrl.includes('/api/rpc')) ? lastRpcUrl : ((storedUrl && storedUrl.includes('/api/rpc')) ? storedUrl : null);
      const url = rawUrl || 'https://api.hero-wars-alliance.com/api/rpc';
      if (!url || !Array.isArray(calls) || calls.length === 0) return;
      if (calls.some((call: any) => (['refillable_alchemyUseVideo', 'artifact_expeditionStart', 'expeditionFarm'].includes(typeof call === 'string' ? call : call?.name) || /^speedUp.*WithResources$/.test(call?.name)) && !isHelperAction(call))) return;

      let headersToUse = lastRpcHeaders;
      if (!headersToUse && s) {
        try {
          const stored = s.getItem('hwa_last_rpc_headers');
          if (stored) headersToUse = JSON.parse(stored);
        } catch (_) {}
      }
      const randHex = () => Math.random().toString(16).slice(2).padStart(16, '0').slice(0, 16);
      const payload = {
        calls: calls.map((c: any) => ({
          name: typeof c === 'string' ? c : c.name,
          args: (typeof c === 'object' && c.args) ? c.args : {},
          ident: speedupService.kindFor(c) || trackedMail(c) ? c.ident : randHex() + randHex(),
          ...(typeof c === 'object' && c.feature ? { feature: c.feature } : {})
        }))
      };
      const headers = buildDispatchHeaders(headersToUse);
      try {
        (originalFetch || win.fetch)(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).then(async (res: any) => {
          let responseText: string | null = null;
          try { responseText = await res.clone().text(); } catch (_) {}
          if (responseText) {
            try {
              const u = new URL(String(url), loc.href);
              win.postMessage({
                source: 'hwa-helper-api',
                kind: 'api-record',
                record: {
                  transport: 'fetch',
                  method: 'POST',
                  endpoint: `${u.origin}${u.pathname}`,
                  status: res.status,
                  durationMs: 0,
                  outcome: res.ok ? 'completed' : 'failed',
                  timestamp: new Date().toISOString(),
                  requestBody: JSON.stringify(payload),
                  responseBody: responseText
                }
              }, loc.origin);
            } catch (_) {}
          }
          win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', ok: res.ok, status: res.status }, loc.origin);
        }).catch((err: any) => {
          win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', ok: false, error: err?.message || String(err) }, loc.origin);
        });
      } catch (err: any) {
        win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', ok: false, error: err?.message || String(err) }, loc.origin);
      }
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'draft-action') {
      if (!popupRpcEnabled || !['saveDefence', 'saveAttack'].includes(event.data.action) || !Array.isArray(event.data.heroes) || event.data.heroes.length !== 5 || event.data.heroes.some((id: any) => !Number.isInteger(id))) return;
      win.postMessage({
        source: 'hwa-helper-control',
        kind: 'refresh-rpc',
        calls: [
          { name: event.data.action === 'saveDefence' ? 'randomDraft_saveDefence' : 'randomDraft_saveAttack', args: { heroes: event.data.heroes } },
          { name: 'randomDraft_getInfo' }
        ]
      }, loc.origin);
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'engine-ping') {
      reportEngineStatus('ping');
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'engine-send-message') {
      if (!popupRpcEnabled || rpcDispatchMode !== 'direct') return;
      const { objectName, methodName, param } = event.data;
      let ok = false;
      let error: any = null;
      try {
        if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
          const found = findActiveUnityInstance(win, doc);
          if (found) setUnityInstance(found, 'pre-send-message');
        }
        if (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function') {
          activeUnityInstance.SendMessage(objectName, methodName, param ?? '');
          ok = true;
        } else {
          error = 'Unity instance not ready or SendMessage not available';
        }
      } catch (err: any) {
        error = err?.message || String(err);
      }
      win.postMessage({
        source: 'hwa-helper-api',
        kind: 'engine-send-message-result',
        ok,
        error,
        call: { objectName, methodName, param }
      }, loc.origin);
      return;
    }
  });

  // --- Startup Polling & Status Trigger ---
  if (typeof setInterval === 'function') {
    let pollAttempts = 0;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      try {
        if (typeof win.createUnityInstance === 'function' && !win.createUnityInstance.__hwaHooked) {
          win.createUnityInstance = hookCreateUnityInstance(win.createUnityInstance);
        }
        if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
          const candidate = findActiveUnityInstance(win, doc);
          if (candidate) setUnityInstance(candidate, 'startup-poll');
        }
      } catch (_) {}
      if (pollAttempts >= 50 || (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function')) {
        clearInterval(pollInterval);
      }
    }, 200);
    if (pollInterval && typeof (pollInterval as any).unref === 'function') {
      (pollInterval as any).unref();
    }
  }

  if (doc && doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => reportEngineStatus('dom-ready'), { once: true });
  }
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('load', () => reportEngineStatus('window-load'), { once: true });
  }

  win.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, loc.origin);
  reportEngineStatus('initial');

  if (typeof setInterval === 'function') {
    let statusPolls = 0;
    const statusInterval = setInterval(() => {
      statusPolls++;
      const hasCanvas = typeof doc !== 'undefined' && typeof doc?.querySelector === 'function' && Boolean(doc.querySelector('canvas#unity-canvas, canvas#canvas, canvas'));
      if (hasCanvas || activeUnityInstance || statusPolls >= 20) {
        reportEngineStatus('canvas-poll');
        if (hasCanvas && activeUnityInstance) {
          clearInterval(statusInterval);
        }
      }
    }, 2000);
    if (statusInterval && typeof (statusInterval as any).unref === 'function') {
      (statusInterval as any).unref();
    }
  }

  // --- Request and Response Parsing Helpers ---
  function limit(text: string) {
    return { text: text.slice(0, MAX_BODY_CHARS), truncated: text.length > MAX_BODY_CHARS };
  }

  function isTextType(type?: string | null) {
    return !type || /(?:json|text|xml|javascript|x-www-form-urlencoded)/i.test(type);
  }

  async function readStream(stream: any) {
    if (!stream) return null;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      while (text.length <= MAX_BODY_CHARS) {
        const { done, value } = await reader.read();
        if (done) return limit(text + decoder.decode());
        text += decoder.decode(value, { stream: true });
      }
      void reader.cancel().catch(() => {});
      return limit(text);
    } catch (_) {
      return null;
    }
  }

  async function readRequestBody(input: any, options: any) {
    try {
      const body = options && Object.hasOwn(options, 'body') ? options.body : undefined;
      if (typeof body === 'string') return limit(body);
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return limit(body.toString());
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        let text = '';
        for (const [key, value] of (body as any)) {
          text += `${key}=${typeof value === 'string' ? value : '[file]'}&`;
          if (text.length > MAX_BODY_CHARS) break;
        }
        return limit(text.replace(/&$/, ''));
      }
      if (typeof Blob !== 'undefined' && body instanceof Blob && isTextType(body.type)) {
        return limit(await body.slice(0, MAX_BODY_CHARS + 1).text());
      }
      if (body !== undefined && body !== null) return null;
      if (input && typeof input.clone === 'function' && input.body) {
        return readStream(input.clone().body);
      }
    } catch (_) {}
    return null;
  }

  async function readFetchResponse(response: any) {
    try {
      if (!isTextType(response.headers?.get?.('content-type'))) return null;
      return await readStream(response.clone().body);
    } catch (_) {
      return null;
    }
  }

  function readXhrResponse(xhr: any) {
    try {
      if (!isTextType(xhr.getResponseHeader?.('content-type'))) return null;
      if (!xhr.responseType || xhr.responseType === 'text') return limit(xhr.responseText);
      if (xhr.responseType === 'json') return limit(JSON.stringify(xhr.response));
    } catch (_) {}
    return null;
  }

  function record(transport: string, method: string, inputUrl: any, status: number | null, durationMs: number, outcome: 'completed' | 'failed', bodies: any = {}) {
    if (!captureEnabled) return;
    try {
      const url = new URL(String(inputUrl), loc.href);
      win.postMessage({
        source: 'hwa-helper-api',
        kind: 'api-record',
        record: {
          transport,
          method: String(method || 'GET').toUpperCase(),
          endpoint: `${url.origin}${url.pathname}`,
          status,
          durationMs: Math.round(durationMs),
          outcome,
          timestamp: new Date().toISOString(),
          ...(String(method).toUpperCase() === 'POST' ? bodies : {})
        }
      }, loc.origin);
    } catch (_) {}
  }

  function preparePiggyback(url: any, method: string, options: any, source = 'init'): any {
    for (const [key, expiresAt] of queuedActionExpiry) {
      if (getNow() >= expiresAt) {
        queuedRpcCalls.delete(key);
        queuedActionExpiry.delete(key);
      }
    }
    if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct' || !queuedRpcCalls.size || String(method).toUpperCase() !== 'POST' || typeof options?.body !== 'string' || typeof Response !== 'function') return null;

    try {
      const target = new URL(String(url), loc.href);
      if (`${target.origin}${target.pathname}` !== 'https://api.hero-wars-alliance.com/api/rpc') return null;
      const request = JSON.parse(options.body);
      if (!Array.isArray(request.calls)) return null;
      const existing = new Map(request.calls.map((call: any) => [
        JSON.stringify({ name: call.name, args: call.args || {}, ...(call.feature ? { feature: call.feature } : {}) }),
        call.ident
      ]));
      const appended: any[] = [];
      const consumed: string[] = [];
      const claimIds: string[] = [];
      const hasActions = [...queuedRpcCalls.values()].some((call) => isHelperAction(call) || claimActionMethods.has(call.name));

      for (const [key, call] of queuedRpcCalls) {
        if (!existing.has(key) || (hasActions && isPiggybackRead(call))) {
          const ident = speedupService.kindFor(call) || trackedMail(call) ? call.ident :
            Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16) + Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16);
          appended.push({ ...call, ident });
          if (queuedClaimKeys.has(key) && claimActionMethods.has(call.name)) claimIds.push(ident);
        } else if (queuedClaimKeys.has(key) && claimActionMethods.has(call.name)) {
          const existingId = existing.get(key);
          if (typeof existingId === 'string') claimIds.push(existingId);
        }
        consumed.push(key);
      }

      const now = getNow();
      const delayMs = Number.isFinite(lastNudgeAt) && lastNudgeAt > 0 ? Math.max(0, now - lastNudgeAt) : null;
      const nativeNames = request.calls.map((c: any) => c.name);
      let carrierSource = 'native-traffic';
      if (rpcDispatchMode === 'mqtt-piggyback') {
        if (delayMs !== null && delayMs <= 3000) {
          carrierSource = nativeNames.includes('getChunks') ? 'fast-map-carrier' : 'fast-user-carrier';
        } else if (delayMs !== null && delayMs <= 15000) {
          carrierSource = 'periodic-fallback';
        } else {
          carrierSource = 'passive-carrier';
        }
      }

      const notifyCarrierAttached = () => {
        if (rpcDispatchMode === 'mqtt-piggyback') {
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'mqtt-rpc-nudge-status',
            state: 'carrier-attached',
            carrierSource,
            carrierDelayMs: delayMs,
            carrierMethod: nativeNames[0] || 'unknown',
            nudgeType: lastNudgeType,
            trackId: lastNudgeTrackId
          }, loc.origin);
        }
      };

      if (!appended.length) {
        for (const key of consumed) {
          queuedRpcCalls.delete(key);
          queuedClaimKeys.delete(key);
          queuedActionExpiry.delete(key);
        }
        if (!queuedClaimKeys.size && claimQueueTimer !== null) {
          clearTimer(claimQueueTimer);
          claimQueueTimer = null;
        }
        if (claimIds.length) tracePiggyback('piggyback-covered', source);
        reportQueueStatus();
        notifyCarrierAttached();
        return claimIds.length ? { appended, claimIds, options } : null;
      }

      const headers = typeof Headers === 'function' ? new Headers(options.headers || {}) : { ...(options.headers || {}) };
      if (typeof (headers as any).delete === 'function') (headers as any).delete('x-auth-signature');
      else {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'x-auth-signature') delete headers[key];
        }
      }

      const prepared = {
        appended,
        claimIds,
        options: {
          ...options,
          headers,
          body: JSON.stringify({ ...request, calls: [...request.calls, ...appended] })
        }
      };

      for (const key of consumed) {
        queuedRpcCalls.delete(key);
        queuedClaimKeys.delete(key);
        queuedActionExpiry.delete(key);
      }
      if (!queuedClaimKeys.size && claimQueueTimer !== null) {
        clearTimer(claimQueueTimer);
        claimQueueTimer = null;
      }
      tracePiggyback('piggyback-attached', `${source}:${appended.length}`);
      reportQueueStatus();
      notifyCarrierAttached();
      return prepared;
    } catch (_) {
      return null;
    }
  }

  function restorePiggyback(appended: any[]) {
    if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct') return;
    for (const { ident, ...call } of appended || []) {
      if (!isPiggybackRead(call)) continue;
      const key = JSON.stringify(call);
      if (!queuedRpcCalls.has(key)) queuedRpcCalls.set(key, call);
    }
    reportQueueStatus();
  }

  // --- Fetch Interception ---
  if (typeof win.fetch === 'function') {
    const nativeFetch = originalFetch || win.fetch;
    win.fetch = function (...args: any[]) {
      const input = args[0];
      const options = args[1];
      const url = typeof input === 'string' || input instanceof URL ? input : input?.url;
      const urlStr = String(url || '');

      if (urlStr.includes('/api/rpc')) {
        lastRpcUrl = urlStr;
        try {
          const s = getStorage();
          if (s) s.setItem('hwa_last_rpc_url', urlStr);
        } catch (_) {}

        // Request-ID guard
        try {
          let origReqId = null;
          let reqIdKey = null;
          if (options && options.headers) {
            if (typeof options.headers.get === 'function' && typeof options.headers.set === 'function') {
              origReqId = options.headers.get('x-request-id');
              if (origReqId) {
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) options.headers.set('x-request-id', synced);
              }
            } else if (Array.isArray(options.headers)) {
              const pair = options.headers.find((p: any) => p && String(p[0]).toLowerCase() === 'x-request-id');
              if (pair) {
                origReqId = pair[1];
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) pair[1] = synced;
              }
            } else if (typeof options.headers === 'object') {
              reqIdKey = Object.keys(options.headers).find((k) => k.toLowerCase() === 'x-request-id');
              if (reqIdKey) {
                origReqId = options.headers[reqIdKey];
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) options.headers[reqIdKey] = synced;
              }
            }
          } else if (input && typeof input === 'object' && input.headers) {
            if (typeof input.headers.get === 'function') {
              origReqId = input.headers.get('x-request-id');
              if (origReqId) {
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) {
                  if (typeof input.headers.set === 'function') {
                    try { input.headers.set('x-request-id', synced); } catch (_) {}
                  }
                  args[1] = args[1] || {};
                  const HdrCtor = typeof Headers !== 'undefined' ? Headers : (args[1].headers ? args[1].headers.constructor : null);
                  if (HdrCtor) {
                    const newHeaders = new HdrCtor(input.headers);
                    newHeaders.set('x-request-id', synced);
                    args[1].headers = newHeaders;
                  }
                }
              }
            } else if (typeof input.headers === 'object') {
              reqIdKey = Object.keys(input.headers).find((k) => k.toLowerCase() === 'x-request-id');
              if (reqIdKey) {
                origReqId = input.headers[reqIdKey];
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) {
                  try {
                    input.headers[reqIdKey] = synced;
                  } catch (_) {
                    args[1] = { ...(args[1] || {}), headers: { ...input.headers, [reqIdKey]: synced } };
                  }
                }
              }
            }
          }
        } catch (_) {}

        const rawHeaders = (args[1] && args[1].headers) || options?.headers || (input && typeof input === 'object' && input.headers ? input.headers : null);
        if (rawHeaders) {
          try {
            if (typeof Headers !== 'undefined' && rawHeaders instanceof Headers) {
              lastRpcHeaders = Object.fromEntries(rawHeaders.entries());
            } else if (typeof rawHeaders === 'object') {
              lastRpcHeaders = { ...rawHeaders };
            }
            if (lastRpcHeaders) {
              const reqIdKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-request-id');
              const reqId = reqIdKey ? lastRpcHeaders[reqIdKey] : null;
              if (reqId) {
                const parsed = parseInt(reqId, 10);
                if (!isNaN(parsed) && parsed > highestRequestId) {
                  highestRequestId = parsed;
                  const s = getStorage();
                  if (s) s.setItem('hwa_highest_request_id', String(highestRequestId));
                }
              }
              const appVerKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-application-version');
              if (appVerKey && lastRpcHeaders[appVerKey]) {
                const appVer = String(lastRpcHeaders[appVerKey]);
                const s = getStorage();
                if (s) s.setItem('hwa_game_version', appVer);
                win.hwaHelperGameVersion = appVer;
              }
              const s = getStorage();
              if (s) s.setItem('hwa_last_rpc_headers', JSON.stringify(lastRpcHeaders));
            }
            reportEngineStatus('rpc-traffic');
          } catch (_) {}
        }
      }

      if (!captureEnabled || isTrackingUrl(urlStr, loc.href)) return nativeFetch.apply(this, args);

      const method = options?.method || input?.method || 'GET';
      const isPost = String(method).toUpperCase() === 'POST';

      const dispatch = (piggyback: any) => {
        if (piggyback) args[1] = piggyback.options;
        const requestBody = isPost ? readRequestBody(input, args[1]) : Promise.resolve(null);
        const started = perf.now();

        try {
          return Promise.resolve(nativeFetch.apply(this, args)).then(
            async (response: any) => {
              if (!captureEnabled && !piggyback) return response;
              const duration = perf.now() - started;

              if (piggyback) {
                try {
                  const fullText = await response.clone().text();
                  const full = JSON.parse(fullText);
                  if (!response.ok || !Array.isArray(full.results)) throw Error('Piggyback RPC failed');

                  const appendedIds = new Set(piggyback.appended.map((call: any) => call.ident));
                  const extraResults = full.results.filter((item: any) => appendedIds.has(item.ident));
                  if (extraResults.length < piggyback.appended.length) {
                    const receivedIds = new Set(extraResults.map((item: any) => item.ident));
                    restorePiggyback(piggyback.appended.filter((call: any) => !receivedIds.has(call.ident)));
                  }
                  const gameResponse = {
                    ...full,
                    results: full.results.filter((item: any) => !appendedIds.has(item.ident))
                  };

                  const headers = new Headers(response.headers);
                  headers.delete('content-length');
                  headers.delete('content-encoding');
                  const filtered = new Response(JSON.stringify(gameResponse), {
                    status: response.status,
                    statusText: response.statusText,
                    headers
                  });
                  for (const property of ['url', 'redirected', 'type']) {
                    try { Object.defineProperty(filtered, property, { value: response[property] }); } catch (_) {}
                  }

                  record('fetch', method, url, response.status, duration, 'completed', {
                    requestBody: piggyback.options.body,
                    responseBody: fullText
                  });

                  if (fullText && fullText.includes('randomDraft_getInfo')) {
                    handleLegendDraftRpcResponse(fullText);
                  }
                  if (fullText.length > MAX_BODY_CHARS && extraResults.length) {
                    record('fetch', method, url, response.status, duration, 'completed', {
                      requestBody: JSON.stringify({ calls: piggyback.appended }),
                      responseBody: JSON.stringify({ results: extraResults })
                    });
                  }
                  if (piggyback.claimIds.length) {
                    const ok = piggyback.claimIds.every((ident: any) => {
                      const result = full.results.find((item: any) => item.ident === ident);
                      return result?.result && Object.hasOwn(result.result, 'response');
                    });
                    reportClaimResult(Boolean(ok), ok ? null : 'One or more reward claims failed.');
                    tracePiggyback(ok ? 'piggyback-claim-ok' : 'piggyback-claim-failed');
                  }
                  return filtered;
                } catch (_) {
                  restorePiggyback(piggyback.appended);
                  if (piggyback.claimIds.length) reportClaimResult(false, 'Reward claim RPC failed.');
                  record('fetch', method, url, response.status, duration, 'completed', {
                    requestBody: piggyback.options.body,
                    responseBody: (await readFetchResponse(response))?.text ?? null
                  });
                  return response;
                }
              }

              if (isPost) {
                Promise.all([requestBody, readFetchResponse(response)]).then(([request, received]) => {
                  const resText = received?.text ?? null;
                  if (resText && resText.includes('randomDraft_getInfo')) {
                    handleLegendDraftRpcResponse(resText);
                  }
                  if (resText && resText.includes('"version"')) {
                    try {
                      const parsed = JSON.parse(resText);
                      const gv = parsed?.results?.find((r: any) => r.result?.response?.version)?.result?.response?.version;
                      if (gv) {
                        const gvStr = String(gv);
                        const s = getStorage();
                        if (s) s.setItem('hwa_game_version', gvStr);
                        win.hwaHelperGameVersion = gvStr;
                      }
                    } catch (_) {}
                  }
                  record('fetch', method, url, response.status, duration, 'completed', {
                    requestBody: request?.text ?? null,
                    requestBodyTruncated: request?.truncated ?? false,
                    responseBody: resText,
                    responseBodyTruncated: received?.truncated ?? false
                  });
                }).catch(() => record('fetch', method, url, response.status, duration, 'completed'));
              } else {
                record('fetch', method, url, response.status, duration, 'completed');
              }
              return response;
            },
            (error: any) => {
              if (piggyback) restorePiggyback(piggyback.appended);
              if (piggyback?.claimIds.length) reportClaimResult(false, 'Reward claim RPC failed.');
              const duration = perf.now() - started;
              if (isPost) {
                requestBody.then((request) => record('fetch', method, url, null, duration, 'failed', {
                  requestBody: request?.text ?? null,
                  requestBodyTruncated: request?.truncated ?? false,
                  responseBody: null,
                  responseBodyTruncated: false
                })).catch(() => record('fetch', method, url, null, duration, 'failed'));
              } else {
                record('fetch', method, url, null, duration, 'failed');
              }
              throw error;
            }
          );
        } catch (error) {
          if (piggyback) restorePiggyback(piggyback.appended);
          if (piggyback?.claimIds.length) reportClaimResult(false, 'Reward claim RPC failed.');
          const duration = perf.now() - started;
          if (isPost) {
            requestBody.then((request) => record('fetch', method, url, null, duration, 'failed', {
              requestBody: request?.text ?? null,
              requestBodyTruncated: request?.truncated ?? false,
              responseBody: null,
              responseBodyTruncated: false
            })).catch(() => record('fetch', method, url, null, duration, 'failed'));
          } else {
            record('fetch', method, url, null, duration, 'failed');
          }
          throw error;
        }
      };

      if (isPost && queuedRpcCalls.size && typeof options?.body !== 'string') {
        const body = options?.body;
        const bodyText = typeof Blob !== 'undefined' && body instanceof Blob ?
          body.text() : input?.body && typeof input.clone === 'function' ?
            input.clone().text() : null;
        if (bodyText) {
          return bodyText.then((text: string) => {
            const extra = text.length <= MAX_BODY_CHARS ? preparePiggyback(url, method, {
              ...(options || {}),
              body: text,
              headers: options?.headers || input?.headers || {}
            }, 'request') : null;
            return dispatch(extra);
          }, () => {
            tracePiggyback('piggyback-skipped', 'request-body-unreadable');
            return dispatch(null);
          });
        }
      }

      const sourceOptions = options?.body && !options.headers && input?.headers ?
        { ...options, headers: input.headers } : options;
      return dispatch(preparePiggyback(url, method, sourceOptions));
    };
  }

  // --- XMLHttpRequest Interception ---
  const xhrProto = win.XMLHttpRequest?.prototype;
  if (xhrProto) {
    const originalOpen = xhrProto.open;
    const originalSetRequestHeader = xhrProto.setRequestHeader;
    const originalSend = xhrProto.send;
    const requestInfo = new WeakMap<any, any>();
    const xhrHeaders = new WeakMap<any, any>();
    const xhrUrls = new WeakMap<any, string>();

    if (typeof originalSetRequestHeader === 'function') {
      xhrProto.setRequestHeader = function (this: any, name: string, value: any) {
        try {
          if (name && String(name).toLowerCase() === 'x-request-id') {
            value = syncRequestId(value);
            arguments[1] = value;
          }
          let headers = xhrHeaders.get(this);
          if (!headers) {
            headers = {};
            xhrHeaders.set(this, headers);
          }
          if (name) headers[String(name).toLowerCase()] = String(value);
        } catch (_) {}
        return originalSetRequestHeader.call(this, name, value);
      };
    }

    xhrProto.open = function (this: any, method: string, url: any, ...rest: any[]) {
      const urlStr = String(url || '');
      xhrUrls.set(this, urlStr);
      if (urlStr.includes('/api/rpc')) {
        lastRpcUrl = urlStr;
        try {
          const s = getStorage();
          if (s) s.setItem('hwa_last_rpc_url', urlStr);
        } catch (_) {}
      }
      const result = originalOpen.call(this, method, url, ...rest);
      if (!captureEnabled || isTrackingUrl(urlStr, loc.href)) requestInfo.delete(this);
      else requestInfo.set(this, { method, url, outcome: 'completed' });
      return result;
    };

    xhrProto.send = function (this: any, ...args: any[]) {
      try {
        const urlStr = xhrUrls.get(this) || '';
        if (urlStr.includes('/api/rpc')) {
          const headers = xhrHeaders.get(this);
          if (headers && Object.keys(headers).length > 0) {
            lastRpcHeaders = { ...headers };
            const reqIdKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-request-id');
            const reqId = reqIdKey ? lastRpcHeaders[reqIdKey] : null;
            if (reqId) {
              const parsed = parseInt(reqId, 10);
              if (!isNaN(parsed) && parsed > highestRequestId) {
                highestRequestId = parsed;
                const s = getStorage();
                if (s) s.setItem('hwa_highest_request_id', String(highestRequestId));
              }
            }
            const appVerKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-application-version');
            if (appVerKey && lastRpcHeaders[appVerKey]) {
              const appVer = String(lastRpcHeaders[appVerKey]);
              const s = getStorage();
              if (s) s.setItem('hwa_game_version', appVer);
              win.hwaHelperGameVersion = appVer;
            }
            const s = getStorage();
            if (s) s.setItem('hwa_last_rpc_headers', JSON.stringify(lastRpcHeaders));
            reportEngineStatus('rpc-traffic');
          }
        }
      } catch (_) {}

      const info = captureEnabled ? requestInfo.get(this) : null;
      if (info) {
        info.started = perf.now();
        info.requestBody = String(info.method).toUpperCase() === 'POST'
          ? readRequestBody(null, { body: args[0] }) : Promise.resolve(null);
        const markFailed = () => { info.outcome = 'failed'; };
        this.addEventListener('error', markFailed, { once: true });
        this.addEventListener('abort', markFailed, { once: true });
        this.addEventListener('timeout', markFailed, { once: true });
        this.addEventListener('loadend', () => {
          if (!captureEnabled) return;
          const duration = perf.now() - info.started;
          if (String(info.method).toUpperCase() === 'POST') {
            const received = readXhrResponse(this);
            const resText = received?.text ?? null;
            if (resText && resText.includes('randomDraft_getInfo')) {
              handleLegendDraftRpcResponse(resText);
            }
            info.requestBody.then((request: any) => record('xhr', info.method, info.url,
              this.status || null, duration, info.outcome, {
                requestBody: request?.text ?? null,
                requestBodyTruncated: request?.truncated ?? false,
                responseBody: received?.text ?? null,
                responseBodyTruncated: received?.truncated ?? false
              })).catch(() => record('xhr', info.method, info.url, this.status || null, duration, info.outcome));
          } else {
            record('xhr', info.method, info.url, this.status || null, duration, info.outcome);
          }
        }, { once: true });
      }

      try {
        return originalSend.apply(this, args);
      } catch (error) {
        if (info) {
          const duration = perf.now() - info.started;
          if (String(info.method).toUpperCase() === 'POST') {
            info.requestBody.then((request: any) => record('xhr', info.method, info.url, null,
              duration, 'failed', {
                requestBody: request?.text ?? null,
                requestBodyTruncated: request?.truncated ?? false,
                responseBody: null,
                responseBodyTruncated: false
              })).catch(() => record('xhr', info.method, info.url, null, duration, 'failed'));
          } else {
            record('xhr', info.method, info.url, null, duration, 'failed');
          }
        }
        throw error;
      }
    };
  }
}
