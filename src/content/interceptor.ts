/**
 * API RPC Interceptor and Game Hook.
 * Operates in the game page MAIN world.
 * Intercepts fetch and XMLHttpRequest for game RPCs, handles piggyback RPCs,
 * hooks Unity WebGL engine / SendMessage, reports engine status, and synchronizes monotonic x-request-id.
 */
import { isTrackingUrl } from '../utils/trackingFilter.ts';
import { speedupService } from '../services/speedupService.ts';
import { mailService } from '../services/mailService.ts';
import {
  getWasmProfileForVersion,
  verifyWasmProfile,
  type WasmSymbolOverrides,
  type WasmProfileVerification,
} from '../data/wasmSymbols.ts';
import { shouldTriggerWasmGc } from '../services/wasmGcScheduler.ts';
import {
  hasTeamGetAllRequest,
  sanitizeTeamGetAllRpcPayload,
  validateOutgoingMultiTeamRpcCalls,
} from '../services/rpcSanitizer.ts';

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

export const EMPTY_ZIP_BYTES = new Uint8Array([
  0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

export function isInternalZipUrl(url: string | URL | Request): boolean {
  if (!url) return false;
  const str = typeof url === 'string' ? url : (url as any).url || url.toString();
  return /StreamingAssets\/(?:internal|StreamingAssets)\.zip(?:\?.*)?$/i.test(str);
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
  let rpcDispatchMode = 'direct';
  let recordingActive = false;
  let sanitizeTeamEnabled = true;
  try {
    const storedSanitize = win.localStorage?.getItem?.('hwa_sanitize_team_enabled');
    if (storedSanitize === 'false') sanitizeTeamEnabled = false;
  } catch (_) {}
  let wasmSymbolOverrides: WasmSymbolOverrides | null = null;
  let lastWasmVerification: WasmProfileVerification | null = null;
  let verifiedTableRef: any = null;

  function getActiveWasmProfile() {
    const liveVer = typeof win.hwaHelperGameVersion === 'string' && win.hwaHelperGameVersion
      ? win.hwaHelperGameVersion
      : null;
    return getWasmProfileForVersion(liveVer, wasmSymbolOverrides);
  }

  function buildSymMap(profile = getActiveWasmProfile()): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, entry] of Object.entries(profile.symbols)) {
      out[key] = entry.tableIndex;
    }
    return out;
  }
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
    'worldStars_getAvailable',
    'eternalStory_getState',
    'eternalStory_getChest'
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
    'heroPromote',
    'inventoryCraftFragments',
    'inventoryCraftRecipe',
    'cinemaGiveReward',
    'cinemaGetCounters',
    'refillable_skillpointsUseVideo',
    'eternalStory_collectChest',
    'randomDraft_getInfo',
    'randomDraft_register',
    'randomDraft_startBattle'
  ]);

  function isHelperAction(call: any): boolean {
    if (call?.name === 'randomDraft_saveDefence' || call?.name === 'randomDraft_saveAttack') {
      const heroes = call?.args?.heroes;
      return (
        !call.feature &&
        Object.keys(call.args || {}).length === 1 &&
        Array.isArray(heroes) &&
        heroes.length === 5 &&
        heroes.every((id: any) => Number.isInteger(id) && id > 0) &&
        new Set(heroes).size === 5
      );
    }
    if (call?.name === 'randomDraft_result') {
      return (
        !call.feature &&
        Object.keys(call.args || {}).length === 1 &&
        Number.isInteger(call?.args?.matchId) &&
        call.args.matchId > 0
      );
    }
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
    if (call?.name === 'refillable_skillpointsUseVideo') {
      return !call.feature && call.args?.type === 'skill_points' && Object.keys(call.args || {}).length === 1;
    }
    return helperActionMethods.has(call?.name);
  }

  const trackedMail = (call: any) => Boolean(mailService.validateClaim(call) && /^[a-f0-9]{32}$/.test(call?.ident || ''));
  const claimActionMethods = new Set(['mailFarm', 'readAndClaimAll', 'quest_multiFarm', 'eternalStory_collectChest']);
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
    if (instance?.Module) {
      win.__hwaUnityModule = instance.Module;
    }
    reportEngineStatus(`instance-${source}`);
    setupWasmSimulationBridge(instance);
    tryHookWasmDraftCipher(instance);
  }

  let cachedDraftCipherKlass = 0;
  let cachedDraftCipherInst = 0;
  let cachedDraftCipherKeys: { dynamicKey: string; constKey: string; source: string } | null = null;
  const DRAFT_CONST_KEYS = [
    'YL@i9y7YgvTqMWsKUw4M9aAeY7d2DJ&rK2!bSUqsKZbZgNZjHaRwbz$uwk6JPmML7@&NqnwXFajZ^ER#Tr5XJeK2Af!ddf^FMqW$matmTCa4nCD8JGRmKP37U9pj*pDT',
    '307E8FB4B733591B75D74EA13946882BA59FAA3274CF815A2B8788E76403BD0F',
    '268EA1F1B979AC33218CEF1225D1F835EA88D2C1233B8D6AFA0277FC8E30684B'
  ];
  const DRAFT_KNOWN_EMPTY_PT = '{"base":null,"swap":null}';

  function recoverDraftKeyFromKnownPlaintext(base64Payload: string): { dynamicKey: string; constKey: string; source: string } | null {
    if (!base64Payload || typeof base64Payload !== 'string') return null;
    try {
      const rawDecoded = typeof atob === 'function' ? atob(base64Payload) : '';
      if (rawDecoded.length !== DRAFT_KNOWN_EMPTY_PT.length) return null;
      const candidateLengths = [14, 12, 13, 15, 16, 10, 11, 17, 18, 19, 20];
      for (const constKey of DRAFT_CONST_KEYS) {
        const derived: number[] = new Array(rawDecoded.length);
        for (let i = 0; i < rawDecoded.length; i++) {
          derived[i] =
            rawDecoded.charCodeAt(i) ^
            DRAFT_KNOWN_EMPTY_PT.charCodeAt(i) ^
            constKey.charCodeAt(i % constKey.length);
        }
        for (const kLen of candidateLengths) {
          if (kLen >= rawDecoded.length) continue;
          let printable = true;
          for (let i = 0; i < kLen; i++) {
            if (derived[i] < 0x21 || derived[i] > 0x7e) { printable = false; break; }
          }
          if (!printable) continue;
          let periodic = true;
          for (let i = kLen; i < rawDecoded.length; i++) {
            if (derived[i] !== derived[i % kLen]) { periodic = false; break; }
          }
          if (periodic) {
            const recovered = {
              dynamicKey: String.fromCharCode(...derived.slice(0, kLen)),
              constKey,
              source: 'known-plaintext-stage1'
            };
            cachedDraftCipherKeys = recovered;
            return recovered;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function xorDecryptDraftBase64(base64Payload: string, dynamicKey: string, constKey: string): string | null {
    if (!base64Payload || !dynamicKey || !constKey) return null;
    try {
      const rawDecoded = typeof atob === 'function' ? atob(base64Payload) : '';
      if (!rawDecoded) return null;
      const cLen = constKey.length;
      const dLen = dynamicKey.length;
      const chars: string[] = new Array(rawDecoded.length);
      for (let i = 0; i < rawDecoded.length; i++) {
        chars[i] = String.fromCharCode(
          rawDecoded.charCodeAt(i) ^ constKey.charCodeAt(i % cLen) ^ dynamicKey.charCodeAt(i % dLen)
        );
      }
      return chars.join('');
    } catch (_) {
      return null;
    }
  }

  function readDraftCipherKeysFromUnity(instance?: any): {
    unityReady: boolean;
    cipherClassFound: boolean;
    cipherInstanceFound: boolean;
    dynamicKey: string | null;
    constKey: string | null;
    error?: string;
  } {
    const out = {
      unityReady: false,
      cipherClassFound: false,
      cipherInstanceFound: false,
      dynamicKey: null as string | null,
      constKey: null as string | null,
      error: undefined as string | undefined
    };
    try {
      const activeInst = instance || activeUnityInstance || findActiveUnityInstance(win, doc);
      const mod = activeInst?.Module || win.unityFramework?.Module || (win as any).__hwaUnityModule || activeInst;
      const asm = mod?.asm || mod;
      const memory = (asm ? Object.values(asm).find((v: any) => v instanceof WebAssembly.Memory) : null) || (mod as any)?.wasmMemory;
      if (!memory?.buffer) {
        out.error = 'Unity WebAssembly memory not ready';
        return out;
      }
      out.unityReady = true;

      const buf = memory.buffer as ArrayBuffer;
      const byteLen = buf.byteLength;
      const u32 = new Uint32Array(buf);
      const i32 = new Int32Array(buf);
      const u8 = new Uint8Array(buf);
      const u16 = new Uint16Array(buf);

      const readCStr = (p: number): string => {
        if (!p || p < 65536 || p >= byteLen) return '';
        let s = '';
        for (let i = 0; i < 64 && p + i < byteLen; i++) {
          const ch = u8[p + i];
          if (ch === 0) break;
          s += String.fromCharCode(ch);
        }
        return s;
      };

      const readIl2CppStr = (p: number): string | null => {
        if (!p || p < 65536 || p + 16 >= byteLen || (p % 4 !== 0)) return null;
        const len = i32[(p + 8) >>> 2];
        if (len <= 0 || len > 4096 || p + 12 + len * 2 > byteLen) return null;
        const start = (p + 12) >>> 1;
        let s = '';
        for (let i = 0; i < len; i++) {
          const code = u16[start + i];
          if (code === 0 || code > 127) return null;
          s += String.fromCharCode(code);
        }
        return s;
      };

      // 1. Resolve DraftsXORCipher Il2CppClass* (cached)
      let cipherKlass = cachedDraftCipherKlass;
      if (cipherKlass > 65536 && cipherKlass < byteLen && (cipherKlass % 4 === 0)) {
        if (readCStr(u32[(cipherKlass + 8) >>> 2]) !== 'DraftsXORCipher') cipherKlass = 0;
      } else {
        cipherKlass = 0;
      }
      if (!cipherKlass) {
        const target = 'DraftsXORCipher';
        const tLen = target.length;
        for (let i = 1024; i < byteLen - 64; i += 4) {
          const cand = u32[i >>> 2];
          if (cand > 65536 && cand < byteLen && (cand % 4 === 0)) {
            const namePtr = u32[(cand + 8) >>> 2];
            if (namePtr > 65536 && namePtr + tLen < byteLen && u8[namePtr] === 68 /* 'D' */) {
              let match = true;
              for (let c = 1; c < tLen; c++) {
                if (u8[namePtr + c] !== target.charCodeAt(c)) { match = false; break; }
              }
              if (match && u8[namePtr + tLen] === 0) {
                cipherKlass = cand;
                cachedDraftCipherKlass = cand;
                break;
              }
            }
          }
        }
      }
      if (!cipherKlass) {
        out.error = 'DraftsXORCipher Il2CppClass not found in WASM memory';
        return out;
      }
      out.cipherClassFound = true;

      // 2. Locate live DraftsXORCipher instance (using dynamic struct offsets from wasmSymbols profile)
      const { draftCipherDynamicKey, draftCipherConstKey } = getActiveWasmProfile().structOffsets;
      const tryReadInstance = (instPtr: number): boolean => {
        if (instPtr < 65536 || instPtr + Math.max(draftCipherDynamicKey, draftCipherConstKey) + 8 >= byteLen || (instPtr % 4 !== 0)) return false;
        if (u32[instPtr >>> 2] !== cipherKlass || u32[(instPtr + 4) >>> 2] !== 0) return false;
        const dk = readIl2CppStr(u32[(instPtr + draftCipherDynamicKey) >>> 2]);
        const ck = readIl2CppStr(u32[(instPtr + draftCipherConstKey) >>> 2]);
        if (dk && ck && ck.length >= 32) {
          out.cipherInstanceFound = true;
          out.dynamicKey = dk;
          out.constKey = ck;
          cachedDraftCipherInst = instPtr;
          cachedDraftCipherKeys = { dynamicKey: dk, constKey: ck, source: 'wasm-heap-DraftsXORCipher' };
          return true;
        }
        return false;
      };

      if (cachedDraftCipherInst && tryReadInstance(cachedDraftCipherInst)) {
        return out;
      }
      cachedDraftCipherInst = 0;

      for (let addr = 65536; addr < byteLen - 20; addr += 4) {
        if (u32[addr >>> 2] === cipherKlass && u32[(addr + 4) >>> 2] === 0) {
          if (tryReadInstance(addr)) return out;
        }
      }
      out.error = 'DraftsXORCipher instance not yet initialized in WASM heap';
      return out;
    } catch (err: any) {
      out.error = String(err?.message || err);
      return out;
    }
  }

  const DRAFT_DECRYPT_RETRY_DELAYS_MS = [150, 400, 900, 1800];

  function decryptDraftPayloadFromUnity(
    base64Payload: string,
    meta?: { stageId?: any; matchId?: any; enemyCiphertext?: string | null },
    attempt = 0
  ) {
    if (!base64Payload || typeof base64Payload !== 'string') return;
    const stageId = meta?.stageId != null ? Number(meta.stageId) : null;
    const matchId = meta?.matchId != null ? Number(meta.matchId) : null;
    const isActiveCipherStage = stageId === 2 || stageId === 4 || base64Payload.length > 128;

    // Fast path: if this is a 25-byte empty draft (Stage 1 / Stage 6), recover & cache dynamicKey in <0.1ms
    if (base64Payload.length >= 32 && base64Payload.length <= 40) {
      recoverDraftKeyFromKnownPlaintext(base64Payload);
    }

    const candidates: Array<{ method: string; dynamicKey: string; constKey: string }> = [];
    if (cachedDraftCipherKeys?.dynamicKey && cachedDraftCipherKeys?.constKey) {
      candidates.push({
        method: cachedDraftCipherKeys.source || 'cached-cipher-key',
        dynamicKey: cachedDraftCipherKeys.dynamicKey,
        constKey: cachedDraftCipherKeys.constKey
      });
    }

    const tryCandidates = (list: Array<{ method: string; dynamicKey: string; constKey: string }>) => {
      let sample: string | null = null;
      let errMsg: string | null = null;
      for (const cand of list) {
        const plaintext = xorDecryptDraftBase64(base64Payload, cand.dynamicKey, cand.constKey);
        if (!plaintext) continue;
        sample = plaintext.slice(0, 300);
        if (plaintext.startsWith('{')) {
          try {
            const parsed = JSON.parse(plaintext);
            if (parsed && typeof parsed === 'object') {
              cachedDraftCipherKeys = { dynamicKey: cand.dynamicKey, constKey: cand.constKey, source: cand.method };
              let enemyDraft: any = null;
              let rawEnemy: string | null = null;
              if (typeof meta?.enemyCiphertext === 'string' && meta.enemyCiphertext.length > 8) {
                try {
                  const enemyPt = xorDecryptDraftBase64(meta.enemyCiphertext, cand.dynamicKey, cand.constKey);
                  if (enemyPt && (enemyPt.startsWith('{') || enemyPt.startsWith('['))) {
                    enemyDraft = JSON.parse(enemyPt);
                    rawEnemy = enemyPt;
                  }
                } catch (_) {}
              }
              win.postMessage({
                source: 'hwa-helper-api',
                kind: 'draft-decrypted',
                draft: parsed,
                enemyDraft,
                raw: plaintext,
                rawEnemy,
                method: cand.method,
                attempt,
                stageId,
                matchId
              }, loc.origin);
              return { ok: true, sample, errMsg: null };
            }
          } catch (parseErr: any) {
            errMsg = `JSON parse error (${cand.method}): ${parseErr?.message || parseErr}`;
          }
        } else {
          errMsg = `XOR output did not start with '{' (${cand.method})`;
        }
      }
      return { ok: false, sample, errMsg };
    };

    // 1. Try cached key first (avoids scanning >1GB WASM heap on every RPC)
    if (candidates.length > 0) {
      const fastRes = tryCandidates(candidates);
      if (fastRes.ok) return;
    }

    // 2. Scan Unity WASM heap for live DraftsXORCipher instance
    const unityKeys = readDraftCipherKeysFromUnity();
    const fallbackCandidates: Array<{ method: string; dynamicKey: string; constKey: string }> = [];
    if (unityKeys.dynamicKey && unityKeys.constKey) {
      fallbackCandidates.push({
        method: 'wasm-heap-DraftsXORCipher',
        dynamicKey: unityKeys.dynamicKey,
        constKey: unityKeys.constKey
      });
    }

    // 3. Fallback: captured auth session/token headers with known const keys
    const sessionKeys: string[] = [];
    try {
      const hdrs = lastRpcHeaders || null;
      if (hdrs && typeof hdrs === 'object') {
        for (const [k, v] of Object.entries(hdrs)) {
          const lk = k.toLowerCase();
          if ((lk === 'x-auth-session-id' || lk === 'x-auth-token') && typeof v === 'string' && v.length >= 8) {
            sessionKeys.push(v);
          }
        }
      }
      if (typeof win.webglAuth?.accessToken === 'string' && win.webglAuth.accessToken.length >= 8) {
        sessionKeys.push(win.webglAuth.accessToken);
      }
    } catch (_) {}

    for (const sk of [...new Set(sessionKeys)]) {
      for (const ck of DRAFT_CONST_KEYS) {
        fallbackCandidates.push({ method: 'session-header-xor', dynamicKey: sk, constKey: ck });
      }
    }

    const res = tryCandidates(fallbackCandidates);
    if (res.ok) return;

    const lastDecryptedSample = res.sample;
    const lastError = res.errMsg || unityKeys.error || 'No valid decryption key available';

    // Defer & retry when Unity C# has not yet instantiated DraftsXORCipher on first draft open
    if (isActiveCipherStage && attempt < DRAFT_DECRYPT_RETRY_DELAYS_MS.length && typeof setTimeout === 'function') {
      const delayMs = DRAFT_DECRYPT_RETRY_DELAYS_MS[attempt];
      setTimeout(() => {
        decryptDraftPayloadFromUnity(base64Payload, meta, attempt + 1);
      }, delayMs);
      return;
    }

    if (isActiveCipherStage) {
      const detail = JSON.stringify({
        stageId,
        matchId,
        attempt,
        cipherLen: base64Payload.length,
        unityReady: unityKeys.unityReady,
        cipherClassFound: unityKeys.cipherClassFound,
        cipherInstanceFound: unityKeys.cipherInstanceFound,
        hasCachedKey: Boolean(cachedDraftCipherKeys),
        hasDynamicKey: Boolean(unityKeys.dynamicKey),
        hasConstKey: Boolean(unityKeys.constKey),
        sessionHeaderCandidates: sessionKeys.length,
        lastError
      });
      win.postMessage({
        source: 'hwa-helper-api',
        kind: 'draft-decrypt-error',
        error: `Unable to decrypt Legends Draft payload${stageId != null ? ` (Stage ${stageId})` : ''}`,
        detail,
        raw: lastDecryptedSample || base64Payload.slice(0, 160)
      }, loc.origin);
    }
  }

  function tryHookWasmDraftCipher(instance?: any) {
    // Prime DraftsXORCipher class/instance discovery once Unity is ready (zero table.set mutation)
    try {
      readDraftCipherKeysFromUnity(instance);
    } catch (_) {}
  }

  function inspectDraftRpc(reqText: string | null | undefined, resText: string | null | undefined) {
    if (!resText) return;
    const hasDraftReq = typeof reqText === 'string' && reqText.includes('randomDraft_');
    const hasDraftRes =
      resText.includes('"stageId"') ||
      resText.includes('"draftEnemy"') ||
      resText.includes('randomDraft');
    if (!hasDraftReq && !hasDraftRes) return;

    try {
      const draftCallsByIdent = new Map<string, any>();
      if (hasDraftReq && reqText) {
        try {
          const parsedReq = JSON.parse(reqText);
          const calls = Array.isArray(parsedReq?.calls) ? parsedReq.calls : (parsedReq?.name ? [parsedReq] : []);
          for (const c of calls) {
            if (typeof c?.name === 'string' && c.name.startsWith('randomDraft_') && c.ident) {
              draftCallsByIdent.set(String(c.ident), c);
            }
          }
        } catch (_) {}
      }

      const parsed = JSON.parse(resText);
      for (const r of (parsed?.results || [])) {
        const ident = r?.ident != null ? String(r.ident) : '';
        const matchedCall = ident ? draftCallsByIdent.get(ident) : null;
        const resp = r?.result?.response;
        const looksLikeDraftResp =
          resp &&
          typeof resp === 'object' &&
          !Array.isArray(resp) &&
          (resp.draft !== undefined ||
            resp.draftEnemy !== undefined ||
            (resp.stageId !== undefined && resp.matchId !== undefined));

        if (matchedCall || looksLikeDraftResp) {
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'draft-rpc-event',
            action: matchedCall?.name || 'randomDraft_getInfo',
            args: matchedCall?.args || null,
            response: resp
          }, loc.origin);

          if (typeof resp?.draft === 'string' && resp.draft.length > 0) {
            decryptDraftPayloadFromUnity(resp.draft, {
              stageId: resp.stageId,
              matchId: resp.matchId,
              enemyCiphertext: typeof resp.draftEnemy === 'string' ? resp.draftEnemy : null
            });
          }
        }
      }
    } catch (_) {}
  }

  function describeWasmException(err: any, phase: string, context?: any) {
    const isWasmException = (typeof WebAssembly !== 'undefined' && err instanceof (WebAssembly as any).Exception) ||
      String(err?.constructor?.name) === 'Exception' ||
      String(err).includes('WebAssembly.Exception');
    const isRuntimeTrap = (typeof WebAssembly !== 'undefined' && err instanceof (WebAssembly as any).RuntimeError) ||
      String(err?.constructor?.name) === 'RuntimeError';

    const kind: 'managed' | 'trap' | 'generic' = isWasmException ? 'managed' : (isRuntimeTrap ? 'trap' : 'generic');
    let detailMsg = '';
    if (isWasmException) {
      detailMsg = `IL2CPP managed exception in phase '${phase}' (Unity engine C# runtime threw an unhandled exception).`;
    } else if (isRuntimeTrap) {
      detailMsg = `WebAssembly execution trap in phase '${phase}': ${err?.message || 'memory out of bounds or arithmetic exception'}.`;
    } else {
      detailMsg = `Simulation failed in phase '${phase}': ${err?.message || String(err)}`;
    }

    return {
      phase,
      kind,
      message: detailMsg,
      rawMessage: err?.message || String(err),
      context: {
        battleType: context?.type,
        seed: context?.seed,
        attackerIds: Object.keys(context?.attackers || {}),
        defenderCount: Array.isArray(context?.defenders) ? context.defenders.length : (context?.defenders ? Object.keys(context.defenders).length : 0),
      },
      stack: err?.stack || ''
    };
  }

  function setupWasmSimulationBridge(instance: any) {
    let cachedPlayKlass = 0;
    let cachedLazyKlass = 0;
    let cachedStringClass = 0;
    let cachedBattleConfigStorage = 0;
    let cachedPlayTypePtr = 0;
    let cachedLazyTypePtr = 0;
    let simCountSinceGc = 0;
    let lastGcMemoryMb = 0;
    let totalGcRuns = 0;

    async function runWasmGcCycle(
      table: WebAssembly.Table | undefined,
      memory: WebAssembly.Memory | undefined,
      sym: Record<string, number>,
      opts: { force?: boolean; passes?: number; yieldMs?: number } = {}
    ): Promise<{ wasmMemoryMb: number; gcRuns: number; gcMethod: string }> {
      const passes = Math.max(1, Math.min(3, Math.floor(Number(opts.passes ?? 1))));
      const yieldMs = Math.max(10, Math.min(500, Math.floor(Number(opts.yieldMs ?? 40))));
      let gcMethod = 'frame-yield';

      if (table && sym.GC_Collect) {
        try {
          const gcFn = table.get(sym.GC_Collect);
          if (typeof gcFn === 'function') {
            for (let p = 0; p < passes; p++) {
              const args = new Array(gcFn.length).fill(0);
              gcFn(...args);
            }
            gcMethod = 'System.GC.Collect+yield';
          }
        } catch (_) {
          gcMethod = 'frame-yield';
        }
      }

      // Yield to browser animation frame + event loop so Unity/Boehm GC can sweep dead battle graphs
      if (typeof win.requestAnimationFrame === 'function') {
        await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, yieldMs));

      const wasmMemoryMb = memory?.buffer ? Math.round(memory.buffer.byteLength / 1048576) : 0;
      simCountSinceGc = 0;
      lastGcMemoryMb = wasmMemoryMb;
      totalGcRuns++;
      return { wasmMemoryMb, gcRuns: totalGcRuns, gcMethod };
    }

    (win as any).__hwaRunWasmGc = async function (force = true) {
      const activeInst = activeUnityInstance || findActiveUnityInstance(win, doc);
      const mod = activeInst?.Module || win.unityFramework?.Module || (win as any).__hwaUnityModule || activeInst;
      const asm = mod?.asm || mod;
      const values = asm ? Object.values(asm) : [];
      const table = (values.find((v: any) => v instanceof WebAssembly.Table) || (mod as any)?.wasmTable) as WebAssembly.Table | undefined;
      const memory = (values.find((v: any) => v instanceof WebAssembly.Memory) || (mod as any)?.wasmMemory) as WebAssembly.Memory | undefined;
      const sym = buildSymMap(getActiveWasmProfile());
      const decision = shouldTriggerWasmGc({
        simCountSinceGc,
        wasmMemoryMb: memory?.buffer ? Math.round(memory.buffer.byteLength / 1048576) : 0,
        lastGcMemoryMb,
        force,
      });
      return runWasmGcCycle(table, memory, sym, { force, passes: decision.passes || 2, yieldMs: decision.yieldMs || 200 });
    };

    win.__hwaSimulateBattle = async function (rawBattle: any, seed: number) {
      let currentPhase = 'INIT_BRIDGE';
      const activeInst = instance || activeUnityInstance || findActiveUnityInstance(win, doc);
      if (!activeInst) {
        throw new Error('Unity game instance not found. Make sure the game is loaded in this tab.');
      }

      const mod = activeInst?.Module || win.unityFramework?.Module || (win as any).__hwaUnityModule || activeInst;
      const asm = mod?.asm || mod;
      if (!asm) {
        throw new Error('Unity WebAssembly asm not found');
      }

      const values = Object.values(asm);
      const table = (values.find((v: any) => v instanceof WebAssembly.Table) || (mod as any).wasmTable) as WebAssembly.Table | undefined;
      const memory = (values.find((v: any) => v instanceof WebAssembly.Memory) || (mod as any).wasmMemory) as WebAssembly.Memory | undefined;

      if (!table || !memory) {
        throw new Error('WASM table or memory not accessible in Unity engine');
      }

      // Live WASM heap views that transparently rebind if WASM calls memory.grow() mid-simulation
      // (a detached ArrayBuffer would otherwise make heap.i32[...] return undefined and readString() return "").
      let _heapBuf = memory.buffer;
      let _heapU8 = new Uint8Array(_heapBuf);
      let _heapU16 = new Uint16Array(_heapBuf);
      let _heapI32 = new Int32Array(_heapBuf);
      let _heapU32 = new Uint32Array(_heapBuf);
      const syncHeap = () => {
        if (memory.buffer !== _heapBuf) {
          _heapBuf = memory.buffer;
          _heapU8 = new Uint8Array(_heapBuf);
          _heapU16 = new Uint16Array(_heapBuf);
          _heapI32 = new Int32Array(_heapBuf);
          _heapU32 = new Uint32Array(_heapBuf);
        }
      };
      const heap = {
        get buffer() { syncHeap(); return _heapBuf; },
        get u8() { syncHeap(); return _heapU8; },
        get u16() { syncHeap(); return _heapU16; },
        get i32() { syncHeap(); return _heapI32; },
        get u32() { syncHeap(); return _heapU32; },
      };

      const malloc = (asm as any).Ol || (asm as any).malloc || (asm as any)._malloc;
      const free = (asm as any).Pl || (asm as any).free || (asm as any)._free;
      if (typeof malloc !== 'function' || typeof free !== 'function') {
        throw new Error('WASM malloc/free memory primitives not found');
      }

      const activeProfile = getActiveWasmProfile();
      const liveGameVer = typeof win.hwaHelperGameVersion === 'string' && win.hwaHelperGameVersion
        ? win.hwaHelperGameVersion
        : null;
      if (verifiedTableRef !== table || !lastWasmVerification) {
        lastWasmVerification = verifyWasmProfile(table, activeProfile, liveGameVer);
        verifiedTableRef = table;
      }
      if (lastWasmVerification.status === 'arity_mismatch') {
        const bad = lastWasmVerification.mismatches
          .slice(0, 5)
          .map((m) => `${m.key}@${m.tableIndex}(exp=${m.expectedArity},got=${m.actualArity})`)
          .join(', ');
        throw new Error(
          `WASM symbol profile arity mismatch (profile=${activeProfile.gameVersion}, live=${liveGameVer || 'unknown'}): ${bad}. Run npm run wasm:sync or apply a Symbol Override in Settings.`
        );
      }
      const sym = buildSymMap(activeProfile);

      // Safe caller that pads arguments to match exact WebAssembly function signature length
      const callTableFn = (index: number, ...args: any[]): number => {
        const func = table.get(index);
        if (typeof func !== 'function') return 0;
        const requiredLen = func.length;
        const callArgs = args.slice(0, requiredLen);
        while (callArgs.length < requiredLen) {
          callArgs.push(0);
        }
        return (func(...callArgs) >>> 0);
      };

      const invoke = (name: keyof typeof sym, ...args: any[]) => {
        const idx = sym[name];
        return callTableFn(idx, ...args);
      };

      const invokePtr = (name: keyof typeof sym, ...args: any[]) => {
        const idx = sym[name];
        return callTableFn(idx, ...args) >>> 0;
      };

      // Read string from IL2CPP System.String pointer (always refreshes views in case memory.grow() detached old buffer)
      const readString = (ptr: number): string | null => {
        if (!ptr) return null;
        const i32 = heap.i32;
        const u16 = heap.u16;
        const len = i32[(ptr + 8) >>> 2];
        if (!Number.isFinite(len) || len < 0 || len > 2000000) return null;
        const u16Start = (ptr + 12) >>> 1;
        let s = '';
        for (let i = 0; i < len; i += 8192) {
          s += String.fromCharCode.apply(null, Array.from(u16.subarray(u16Start + i, u16Start + Math.min(len, i + 8192))));
        }
        return s;
      };

      let hPlay = 0;
      let hPresets = 0;
      let playPtr = 0;
      let lazyDataPtr = 0;
      let playAllocatedByMalloc = false;
      let lazyAllocatedByMalloc = false;
      let presetAllocatedByMalloc = false;
      let presetPtr = 0;

      // Dynamic Il2CppClass lookup by matching class name in metadata
      const findClassByName = (className: string): number => {
        const maxScan = Math.min(memory.buffer.byteLength, 256 * 1024 * 1024);
        const u32 = heap.u32;
        const u8 = heap.u8;
        const cLen = className.length;
        for (let i = 1024; i < maxScan - 64; i += 4) {
          const candKlass = u32[i >>> 2];
          if (candKlass > 65536 && candKlass < memory.buffer.byteLength && (candKlass % 4 === 0)) {
            const namePtr = u32[(candKlass + 8) >>> 2];
            if (namePtr > 65536 && namePtr + cLen < memory.buffer.byteLength) {
              let match = true;
              for (let c = 0; c < cLen; c++) {
                if (u8[namePtr + c] !== className.charCodeAt(c)) { match = false; break; }
              }
              if (match && u8[namePtr + cLen] === 0) {
                return candKlass;
              }
            }
          }
        }
        return 0;
      };

      try {
        // Helper: scan linear memory for IL2CPP System.String descriptor
        const findStringClassFromHeap = (): number => {
          const targetWords = ['BattleInstantPlay', 'BattlePresets', 'BattleData', 'dungeon', 'titan', 'Neutral', 'arena'];
          const byteLen = memory.buffer.byteLength;
          const maxScan = Math.min(byteLen, 256 * 1024 * 1024);
          const u16 = heap.u16;

          for (const word of targetWords) {
            const wLen = word.length;
            const codes = new Uint16Array(wLen);
            for (let i = 0; i < wLen; i++) codes[i] = word.charCodeAt(i);
            const firstCode = codes[0];

            const u16Limit = (maxScan - (16 + wLen * 2)) >>> 1;
            for (let i = 8; i < u16Limit; i += 2) {
              if (u16[i] === firstCode) {
                let match = true;
                for (let j = 1; j < wLen; j++) {
                  if (u16[i + j] !== codes[j]) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  const strPtr = (i * 2) - 12;
                  if (strPtr >= 1024 && strPtr + 16 < byteLen) {
                    const reportedLen = heap.i32[(strPtr + 8) >>> 2];
                    const syncBlock = heap.u32[(strPtr + 4) >>> 2];
                    const candidateKlass = heap.u32[strPtr >>> 2];
                    if (reportedLen === wLen && syncBlock === 0 && candidateKlass > 65536 && candidateKlass < byteLen) {
                      return candidateKlass;
                    }
                  }
                }
              }
            }
          }
          return 0;
        };

        // Step 1: Learn String class pointer
        currentPhase = 'LEARN_STRING_CLASS';
        let stringClassPtr = cachedStringClass;

        if (!stringClassPtr) {
          // Try getting stringClass from managed instances via Object.ToString
          const probeObjects = [
            () => callTableFn(sym.Presets_clanWarReplay, 1, 0),
            () => callTableFn(sym.Presets_clanWarReplay, 0, 0),
            () => callTableFn(sym.Presets_tower, 0, 0),
            () => callTableFn(sym.Presets_createReplay, 0, 0),
          ];

          for (const probeFn of probeObjects) {
            try {
              const probePtr = probeFn();
              if (probePtr > 0) {
                const strSamplePtr = invokePtr('Object_ToString', probePtr);
                if (strSamplePtr > 0) {
                  const kPtr = heap.u32[strSamplePtr >>> 2];
                  if (kPtr > 65536 && kPtr < memory.buffer.byteLength && (kPtr % 4 === 0)) {
                    stringClassPtr = kPtr;
                    break;
                  }
                }
              }
            } catch (_) {}
          }

          // If not found from live objects, scan heap memory for System.String instances
          if (!stringClassPtr) {
            stringClassPtr = findStringClassFromHeap();
          }

          if (stringClassPtr) cachedStringClass = stringClassPtr;
        }

        if (!stringClassPtr) {
          throw new Error('Failed to obtain IL2CPP String class descriptor from managed objects or memory scan');
        }

        const forgeString = (str: string): number => {
          const len = str.length;
          const ptr = malloc(16 + 2 * len) >>> 0;
          if (!ptr) throw new Error('malloc failed for forgeString');
          heap.u32[ptr >>> 2] = stringClassPtr;
          heap.u32[(ptr + 4) >>> 2] = 0;
          heap.i32[(ptr + 8) >>> 2] = len;
          const u16Start = (ptr + 12) >>> 1;
          for (let i = 0; i < len; i++) {
            heap.u16[u16Start + i] = str.charCodeAt(i);
          }
          heap.u16[u16Start + len] = 0;
          return ptr;
        };

        // Step 2: Create presets for battle
        // Per DungeonStartBattleRoutine_tryInstantBattle (WASM func 159715):
        // - Dungeon Titan uses BattleConfigStorage_get_titan (285313) + Presets_manualRaid(cfg, 0, 0)
        // - Dungeon Hero uses BattleConfigStorage_get_tower (285311) + Presets_manualRaid(cfg, 0, 0)
        // Using Presets_clanWarReplay(0, 0) picks BattleConfigStorage_get_titanClanPvp which desyncs
        // from Dungeon PvE rules and causes server rejection ("Invalid battle").
        currentPhase = 'CREATE_PRESETS';
        const battleType = String(rawBattle?.type || '').toLowerCase();
        const isTitan = battleType.includes('titan');
        const isDungeon = battleType.includes('dungeon');
        presetPtr = 0;
        const candidateErrors: string[] = [];

        const readCStr = (ptr: number): string => {
          const curU8 = new Uint8Array(memory.buffer);
          if (!ptr || ptr < 65536 || ptr >= curU8.byteLength) return '';
          let out = '';
          for (let i = 0; i < 64; i++) {
            const ch = curU8[ptr + i];
            if (ch === 0) break;
            out += String.fromCharCode(ch);
          }
          return out;
        };

        const resolveBattleConfigStorage = (): number => {
          const readU32 = () => new Uint32Array(memory.buffer);
          let curU32 = readU32();
          let byteLen = curU32.byteLength;
          if (cachedBattleConfigStorage > 65536 && cachedBattleConfigStorage < byteLen) {
            const k = curU32[cachedBattleConfigStorage >>> 2];
            if (k > 65536 && k < byteLen && readCStr(curU32[(k + 8) >>> 2]) === 'BattleConfigStorage') {
              return cachedBattleConfigStorage;
            }
            cachedBattleConfigStorage = 0;
          }

          // Trigger IL2CPP ClassInit on the BattleConfigStorage holder class
          try { callTableFn(sym.Presets_titanArenaRaid, 0); } catch (_) {}

          curU32 = readU32();
          byteLen = curU32.byteLength;
          const {
            battleConfigHolder,
            battleConfigStaticFieldsOff,
            battleConfigStorageOff,
          } = activeProfile.staticAddrs;
          const holderKlass = battleConfigHolder > 0 && battleConfigHolder < byteLen
            ? curU32[battleConfigHolder >>> 2]
            : 0;
          if (holderKlass > 65536 && holderKlass < byteLen && (holderKlass % 4 === 0)) {
            const staticFields = curU32[(holderKlass + battleConfigStaticFieldsOff) >>> 2];
            if (staticFields > 65536 && staticFields + battleConfigStorageOff + 4 < byteLen && (staticFields % 4 === 0)) {
              const storagePtr = curU32[(staticFields + battleConfigStorageOff) >>> 2];
              if (storagePtr > 65536 && storagePtr < byteLen && (storagePtr % 4 === 0)) {
                const storageKlass = curU32[storagePtr >>> 2];
                if (storageKlass > 65536 && storageKlass < byteLen && readCStr(curU32[(storageKlass + 8) >>> 2]) === 'BattleConfigStorage') {
                  cachedBattleConfigStorage = storagePtr;
                  return storagePtr;
                }
              }
            }
          }

          // Fallback: locate BattleConfigStorage Il2CppClass and scan heap for live instance
          const storageKlass = findClassByName('BattleConfigStorage');
          if (storageKlass > 65536 && storageKlass < byteLen) {
            const maxScan = Math.min(byteLen, 256 * 1024 * 1024);
            for (let addr = 65536; addr < maxScan - 16; addr += 4) {
              if (curU32[addr >>> 2] === storageKlass && curU32[(addr + 4) >>> 2] === 0) {
                cachedBattleConfigStorage = addr;
                return addr;
              }
            }
          }
          return 0;
        };

        const createDungeonPreset = (titanMode: boolean): number => {
          const storagePtr = resolveBattleConfigStorage();
          if (!storagePtr) return 0;
          const cfgIdx = titanMode ? sym.BattleConfigStorage_get_titan : sym.BattleConfigStorage_get_tower;
          const cfgPtr = callTableFn(cfgIdx, storagePtr, 0);
          if (!cfgPtr) return 0;
          return callTableFn(sym.Presets_manualRaid, cfgPtr, 0, 0);
        };

        // Comprehensive candidate list supporting exact WASM arities
        const dungeonCandidates = isDungeon
          ? [
              {
                name: isTitan
                  ? 'Presets_manualRaid(BattleConfigStorage.titan)'
                  : 'Presets_manualRaid(BattleConfigStorage.tower)',
                fn: () => createDungeonPreset(isTitan),
              },
            ]
          : [];

        const isArena = battleType === 'arena' || battleType.includes('arena');
        const arenaCandidates = !isTitan && isArena
          ? [
              { name: 'Presets_arena(0)', fn: () => callTableFn(sym.Presets_arena, 0) },
              { name: 'Presets_arenaReplay(0, 0, 0)', fn: () => callTableFn(sym.Presets_arenaReplay, 0, 0, 0) },
            ]
          : [];

        const candidates = isTitan
          ? [
              ...dungeonCandidates,
              // 1. ClanWar Replay (Titan variants with arity padding)
              { name: 'Presets_clanWarReplay(0, 0)', fn: () => callTableFn(sym.Presets_clanWarReplay, 0, 0) },
              { name: 'Presets_clanWarReplay(1, 0)', fn: () => callTableFn(sym.Presets_clanWarReplay, 1, 0) },
              { name: 'Presets_clanWarReplay(0, 1)', fn: () => callTableFn(sym.Presets_clanWarReplay, 0, 1) },
              { name: 'Presets_clanWarReplay(1, 1)', fn: () => callTableFn(sym.Presets_clanWarReplay, 1, 1) },

              // 2. Titan Arena variants
              { name: 'Presets_titanArenaReplay(0)', fn: () => callTableFn(sym.Presets_titanArenaReplay, 0) },
              { name: 'Presets_titanArenaRaid(0)', fn: () => callTableFn(sym.Presets_titanArenaRaid, 0) },
              { name: 'Presets_titanArenaManual(0)', fn: () => callTableFn(sym.Presets_titanArenaManual, 0) },

              // 3. Generic Replay and Challenge Auto
              { name: 'Presets_replay(0, 1, 0)', fn: () => callTableFn(sym.Presets_replay, 0, 1, 0) },
              { name: 'Presets_replay(1, 1, 0)', fn: () => callTableFn(sym.Presets_replay, 1, 1, 0) },
              { name: 'Presets_replay(0, 0, 0)', fn: () => callTableFn(sym.Presets_replay, 0, 0, 0) },
              { name: 'Presets_createReplay(0)', fn: () => callTableFn(sym.Presets_createReplay, 0) },
              { name: 'Presets_challengeReplayAuto(0)', fn: () => callTableFn(sym.Presets_challengeReplayAuto, 0) },

              // 4. Other battle modes
              { name: 'Presets_clanWar(0)', fn: () => callTableFn(sym.Presets_clanWar, 0) },
              { name: 'Presets_arenaReplay(0, 0, 0)', fn: () => callTableFn(sym.Presets_arenaReplay, 0, 0, 0) },
              { name: 'Presets_tower(0)', fn: () => callTableFn(sym.Presets_tower, 0) },
              { name: 'Presets_manualRaid(0)', fn: () => callTableFn(sym.Presets_manualRaid, 0) },
              { name: 'Presets_manual(0)', fn: () => callTableFn(sym.Presets_manual, 0) },
            ]
          : [
              ...dungeonCandidates,
              ...arenaCandidates,
              // Hero priority
              { name: 'Presets_clanWarReplay(1, 0)', fn: () => callTableFn(sym.Presets_clanWarReplay, 1, 0) },
              { name: 'Presets_clanWarReplay(0, 0)', fn: () => callTableFn(sym.Presets_clanWarReplay, 0, 0) },
              { name: 'Presets_replay(1, 1, 0)', fn: () => callTableFn(sym.Presets_replay, 1, 1, 0) },
              { name: 'Presets_replay(0, 1, 0)', fn: () => callTableFn(sym.Presets_replay, 0, 1, 0) },
              { name: 'Presets_arenaReplay(0, 0, 0)', fn: () => callTableFn(sym.Presets_arenaReplay, 0, 0, 0) },
              { name: 'Presets_createReplay(0)', fn: () => callTableFn(sym.Presets_createReplay, 0) },
              { name: 'Presets_tower(0)', fn: () => callTableFn(sym.Presets_tower, 0) },
              { name: 'Presets_challengeReplayAuto(0)', fn: () => callTableFn(sym.Presets_challengeReplayAuto, 0) },
              { name: 'Presets_clanWar(0)', fn: () => callTableFn(sym.Presets_clanWar, 0) },
            ];

        for (const cand of candidates) {
          try {
            const ptr = cand.fn();
            if (ptr && ptr > 0) {
              presetPtr = ptr;
              break;
            } else {
              candidateErrors.push(`${cand.name} returned 0`);
            }
          } catch (e: any) {
            candidateErrors.push(`${cand.name} thrown: ${e?.message || String(e)}`);
          }
        }

        // Managed BattlePresets constructor fallback (IL2CPP GetUninitializedObject)
        if (!presetPtr) {
          try {
            const presetsTypeNamePtr = forgeString('BattlePresets');
            let presetsTypePtr = 0;
            try {
              presetsTypePtr = invokePtr('Type_GetType', presetsTypeNamePtr);
            } finally {
              free(presetsTypeNamePtr);
            }
            if (presetsTypePtr > 0) {
              const managedPresetsPtr = invokePtr('GetUninitializedObject', presetsTypePtr);
              if (managedPresetsPtr > 0) {
                callTableFn(sym.BattlePresets_ctorDefault, managedPresetsPtr, 0);
                presetPtr = managedPresetsPtr;
              }
            }
          } catch (e: any) {
            candidateErrors.push(`Managed BattlePresets ctor failed: ${e?.message || String(e)}`);
          }
        }

        // Raw malloc fallback if managed allocation wasn't available
        if (!presetPtr) {
          try {
            const fallbackPtr = malloc(128) >>> 0;
            if (fallbackPtr > 0) {
              callTableFn(sym.BattlePresets_ctorDefault, fallbackPtr, 0);
              presetPtr = fallbackPtr;
              presetAllocatedByMalloc = true;
            }
          } catch (e: any) {
            candidateErrors.push(`Raw BattlePresets ctor failed: ${e?.message || String(e)}`);
          }
        }

        if (!presetPtr) {
          throw new Error(`Failed to create BattlePresets for simulation (isTitan: ${isTitan}). Candidates: [${candidateErrors.join('; ')}]`);
        }

        // Step 3: Serialize and parse JSON input into LazyDataObject
        currentPhase = 'PARSE_JSON_INPUT';
        const normalizedSeed = seed >>> 0;
        const rawJson = JSON.stringify(Object.assign({}, rawBattle, { seed: normalizedSeed }));
        const rawJsonStrPtr = forgeString(rawJson);
        let jsonNodePtr = 0;
        try {
          jsonNodePtr = invokePtr('JSON_Parse', rawJsonStrPtr);
        } finally {
          free(rawJsonStrPtr);
        }
        if (!jsonNodePtr) throw new Error('JSON_Parse returned null for rawBattle payload');

        currentPhase = 'CONVERT_LAZY_DATA_OBJECT';
        // Prefer IL2CPP managed heap allocation (GetUninitializedObject) so Boehm GC scans internal roots safely
        if (!cachedLazyTypePtr && sym.Type_GetType && sym.GetUninitializedObject) {
          const lazyTypeNamePtr = forgeString('LazyDataObject');
          try {
            const tPtr = invokePtr('Type_GetType', lazyTypeNamePtr);
            if (tPtr > 0) cachedLazyTypePtr = tPtr;
          } catch (_) {} finally {
            free(lazyTypeNamePtr);
          }
        }
        if (cachedLazyTypePtr && sym.GetUninitializedObject) {
          try {
            const managedLazy = invokePtr('GetUninitializedObject', cachedLazyTypePtr);
            if (managedLazy > 0) lazyDataPtr = managedLazy;
          } catch (_) {}
        }
        if (!lazyDataPtr) {
          let lazyKlass = cachedLazyKlass;
          if (!lazyKlass) {
            const cand = heap.u32[0x15aacd4 >>> 2];
            if (cand > 65536 && cand < memory.buffer.byteLength && (cand % 4 === 0)) {
              lazyKlass = cand;
            } else {
              lazyKlass = findClassByName('LazyDataObject');
            }
            if (lazyKlass) cachedLazyKlass = lazyKlass;
          }
          if (!lazyKlass) throw new Error('LazyDataObject Il2CppClass descriptor not found');

          lazyDataPtr = malloc(128) >>> 0;
          lazyAllocatedByMalloc = true;
          heap.u8.fill(0, lazyDataPtr, lazyDataPtr + 128);
          heap.u32[lazyDataPtr >>> 2] = lazyKlass;
        }
        invoke('LazyDataObject_ctor', lazyDataPtr, jsonNodePtr, 0);

        // Step 4: Allocate BattleInstantPlay on managed heap (prevents mid-battle Boehm GC UAF in START_BATTLE_PLAY)
        currentPhase = 'ALLOC_PLAY_OBJECT';
        if (!cachedPlayTypePtr && sym.Type_GetType && sym.GetUninitializedObject) {
          const playTypeNamePtr = forgeString('BattleInstantPlay');
          try {
            const tPtr = invokePtr('Type_GetType', playTypeNamePtr);
            if (tPtr > 0) cachedPlayTypePtr = tPtr;
          } catch (_) {} finally {
            free(playTypeNamePtr);
          }
        }
        if (cachedPlayTypePtr && sym.GetUninitializedObject) {
          try {
            const managedPlay = invokePtr('GetUninitializedObject', cachedPlayTypePtr);
            if (managedPlay > 0) playPtr = managedPlay;
          } catch (_) {}
        }
        if (!playPtr) {
          let playKlass = cachedPlayKlass;
          if (!playKlass) {
            playKlass = findClassByName('BattleInstantPlay');
            if (playKlass) cachedPlayKlass = playKlass;
          }
          if (!playKlass) {
            const cand = heap.u32[0x159ffd0 >>> 2];
            if (cand > 65536 && cand < memory.buffer.byteLength && (cand % 4 === 0)) {
              playKlass = cand;
              cachedPlayKlass = playKlass;
            }
          }
          if (!playKlass) throw new Error('BattleInstantPlay Il2CppClass descriptor not found');

          playPtr = malloc(1024) >>> 0;
          playAllocatedByMalloc = true;
          heap.u8.fill(0, playPtr, playPtr + 1024);
          heap.u32[playPtr >>> 2] = playKlass;
        }

        // Step 5: Construct BattleInstantPlay(lazyDataObj, presets, 0, 0, 0, 0)
        currentPhase = 'CONSTRUCT_BATTLE_PLAY';
        invoke('Play_ctor', playPtr, lazyDataPtr, presetPtr, 0, 0, 0, 0);

        // Step 6: Start battle execution loop
        currentPhase = 'START_BATTLE_PLAY';
        invoke('Play_start', playPtr, 0);

        // Step 7: Await completion via Play_get_result polling
        currentPhase = 'WAIT_BATTLE_RESULT';
        let resultHandle = 0;
        const startWait = Date.now();
        while (!resultHandle && Date.now() - startWait < 5000) {
          resultHandle = invokePtr('Play_get_result', playPtr, 0);
          if (!resultHandle) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
        if (!resultHandle) throw new Error('Simulation timed out waiting for MultiBattleResult');

        // Step 8: Extract victory, stars, and progress from MultiBattleResult
        currentPhase = 'EXTRACT_BATTLE_RESULT';
        const win = Boolean(invoke('MultiBattleResult_get_victory', resultHandle, 0));
        const stars = Number(invoke('MultiBattleResult_get_stars', resultHandle, 0)) || 0;
        const progressListPtr = invokePtr('MultiBattleResult_get_progress', resultHandle, 0);
        let parsedProgress: any = null;
        let pJsonStr: string | null = null;
        let pStrPtr = 0;
        if (progressListPtr) {
          pStrPtr = invokePtr('DataObject_asJson', progressListPtr, 0);
          pJsonStr = readString(pStrPtr);
          if (pJsonStr) {
            try {
              const pObj = JSON.parse(pJsonStr);
              parsedProgress = Array.isArray(pObj) ? pObj[0] : pObj;
            } catch (_) {}
          }
        }

        // Map attackers and defenders state from progress.
        // In HWA Unity/PHP DataObject_asJson, an empty map (0 survivors on total wipe) serializes as `[]` or is omitted.
        // - When `!win`, normalize empty/missing `attackers.heroes` to `{}` so every deployed unit is marked dead (normal defeat).
        // - When `win === true`, keep the P1-14 hard guard so malformed/empty progress NEVER reaches dungeonEndBattle.
        const rawProgAttackers = parsedProgress?.attackers?.heroes;
        const isPlainProgAttackers =
          Boolean(rawProgAttackers) && typeof rawProgAttackers === 'object' && !Array.isArray(rawProgAttackers);
        const isWipeEmptyAttackers =
          !win && (rawProgAttackers == null || (Array.isArray(rawProgAttackers) && rawProgAttackers.length === 0));

        if (!isPlainProgAttackers && !isWipeEmptyAttackers) {
          const shape = !parsedProgress
            ? `progress=null,pPtr=0x${progressListPtr.toString(16)},sPtr=0x${pStrPtr.toString(16)},sLen=${pJsonStr == null ? 'null' : pJsonStr.length}`
            : !parsedProgress.attackers
              ? 'attackers=missing'
              : Array.isArray(rawProgAttackers)
                ? `attackers.heroes=Array(${rawProgAttackers.length})`
                : `attackers.heroes=${typeof rawProgAttackers}`;
          const snippet = pJsonStr ? ` [${pJsonStr.slice(0, 140)}]` : '';
          throw new Error(
            `Unity simulation returned missing or malformed battle progress (attackers.heroes unavailable: win=${win}, stars=${stars}, ${shape})${snippet}`
          );
        }
        if (win && Object.keys(rawProgAttackers).length === 0) {
          const snippet = pJsonStr ? ` [${pJsonStr.slice(0, 140)}]` : '';
          throw new Error(
            `Unity simulation returned empty attackers.heroes on a winning battle (win=true, stars=${stars})${snippet}`
          );
        }

        const attackersOut: Record<string, any> = {};
        const rawAttackers = rawBattle?.attackers || {};
        const progAttackers = isPlainProgAttackers ? rawProgAttackers : {};

        for (const [idStr, rawAttacker] of Object.entries(rawAttackers) as any) {
          const maxHp = Number(rawAttacker.hp || rawAttacker.maxHp || 1000000);
          const initHp = Number(rawAttacker.state?.hp != null ? rawAttacker.state.hp : maxHp);
          const hasProgEntry = Object.prototype.hasOwnProperty.call(progAttackers, idStr);

          if (!hasProgEntry) {
            // Per Hero Wars Alliance server convention, any deployed titan omitted from
            // progress[0].attackers.heroes is DEAD (hp: 0, isDead: true). Never fall back to initHp!
            attackersOut[idStr] = {
              hp: 0,
              maxHp,
              energy: 0,
              isDead: true,
              hpDelta: -initHp,
            };
            continue;
          }

          const progHero = progAttackers[idStr] || {};
          const finalHp = Math.max(0, Number(progHero.hp != null ? progHero.hp : 0));
          const isDead = Boolean(progHero.isDead === true || finalHp <= 0);
          const hpDelta = (isDead ? 0 : finalHp) - initHp;
          attackersOut[idStr] = {
            hp: isDead ? 0 : finalHp,
            maxHp,
            energy: isDead ? 0 : Number(progHero.energy ?? rawAttacker.state?.energy ?? 0),
            isDead,
            hpDelta
          };
        }

        const defendersOut: Record<string, any> = {};
        const rawProgDefenders = parsedProgress?.defenders?.heroes;
        const progDefenders =
          rawProgDefenders && typeof rawProgDefenders === 'object' && !Array.isArray(rawProgDefenders)
            ? rawProgDefenders
            : {};
        for (const [idStr, progDef] of Object.entries(progDefenders) as any) {
          defendersOut[idStr] = {
            hp: Number(progDef.hp || 0),
            isDead: Boolean(progDef.isDead || progDef.hp <= 0)
          };
        }

        const duration = Number(parsedProgress?.duration) || 0;

        simCountSinceGc++;
        let wasmMemoryMb = memory?.buffer ? Math.round(memory.buffer.byteLength / 1048576) : 0;
        const gcDecision = shouldTriggerWasmGc({ simCountSinceGc, wasmMemoryMb, lastGcMemoryMb });
        if (gcDecision.trigger) {
          const gcRes = await runWasmGcCycle(table, memory, sym, {
            passes: gcDecision.passes,
            yieldMs: gcDecision.yieldMs,
          });
          wasmMemoryMb = gcRes.wasmMemoryMb;
        }

        return {
          win,
          stars,
          duration,
          seed: normalizedSeed,
          attackers: attackersOut,
          defenders: defendersOut,
          progress: parsedProgress,
          rawBattle,
          endArgs: {
            result: { win, stars },
            progress: [parsedProgress]
          },
          telemetry: {
            wasmMemoryMb,
            gcRuns: totalGcRuns,
            gcTriggered: gcDecision.trigger,
            gcReason: gcDecision.reason,
            highMemoryPressure: gcDecision.highMemoryPressure,
            managedAlloc: !playAllocatedByMalloc,
          }
        };
      } catch (err: any) {
        const errorDetail = describeWasmException(err, currentPhase, {
          type: rawBattle?.type,
          seed,
          attackers: rawBattle?.attackers,
          defenders: rawBattle?.defenders
        });
        console.error('[HWA-Simulator] Battle Simulation Failure Diagnostics:', errorDetail);
        const enrichedError = new Error(errorDetail.message);
        (enrichedError as any).errorDetail = errorDetail;
        throw enrichedError;
      } finally {
        try { if (playPtr) invoke('Play_dispose', playPtr, 0); } catch (_) {}
        try { if (playPtr && playAllocatedByMalloc) free(playPtr); } catch (_) {}
        try { if (lazyDataPtr && lazyAllocatedByMalloc) free(lazyDataPtr); } catch (_) {}
        try { if (presetPtr && presetAllocatedByMalloc) free(presetPtr); } catch (_) {}
      }
    };
  }

  async function testWasmEngineProbe(targetInst?: any) {
    let currentPhase = 'INIT_BRIDGE';
    try {
      const activeInst = targetInst || activeUnityInstance || findActiveUnityInstance(win, doc);
      if (!activeInst) {
        throw new Error('Unity game instance not found. Make sure the game is loaded in this tab.');
      }

      currentPhase = 'INSPECT_MODULE';
      const mod = activeInst?.Module || win.unityFramework?.Module || (win as any).__hwaUnityModule || activeInst;
      const asm = mod?.asm || mod;
      if (!asm) {
        throw new Error('Unity WebAssembly asm not found in game engine instance');
      }

      const values = Object.values(asm);
      const table = (values.find((v: any) => v instanceof WebAssembly.Table) || (mod as any).wasmTable) as WebAssembly.Table | undefined;
      const memory = (values.find((v: any) => v instanceof WebAssembly.Memory) || (mod as any).wasmMemory) as WebAssembly.Memory | undefined;

      if (!table || !memory) {
        throw new Error('WASM table or memory not accessible in Unity engine');
      }

      currentPhase = 'MEMORY_PRIMITIVES';
      const malloc = (asm as any).Ol || (asm as any).malloc || (asm as any)._malloc;
      const free = (asm as any).Pl || (asm as any).free || (asm as any)._free;
      if (typeof malloc !== 'function' || typeof free !== 'function') {
        throw new Error('WASM malloc/free memory primitives not found');
      }

      // Live WASM heap views that transparently rebind if WASM calls memory.grow() mid-simulation
      // (a detached ArrayBuffer would otherwise make heap.i32[...] return undefined and readString() return "").
      let _heapBuf = memory.buffer;
      let _heapU8 = new Uint8Array(_heapBuf);
      let _heapU16 = new Uint16Array(_heapBuf);
      let _heapI32 = new Int32Array(_heapBuf);
      let _heapU32 = new Uint32Array(_heapBuf);
      const syncHeap = () => {
        if (memory.buffer !== _heapBuf) {
          _heapBuf = memory.buffer;
          _heapU8 = new Uint8Array(_heapBuf);
          _heapU16 = new Uint16Array(_heapBuf);
          _heapI32 = new Int32Array(_heapBuf);
          _heapU32 = new Uint32Array(_heapBuf);
        }
      };
      const heap = {
        get buffer() { syncHeap(); return _heapBuf; },
        get u8() { syncHeap(); return _heapU8; },
        get u16() { syncHeap(); return _heapU16; },
        get i32() { syncHeap(); return _heapI32; },
        get u32() { syncHeap(); return _heapU32; },
      };

      // Read string from IL2CPP System.String pointer (always refreshes views in case memory.grow() detached old buffer)
      const readString = (ptr: number): string | null => {
        if (!ptr) return null;
        const i32 = heap.i32;
        const u16 = heap.u16;
        const len = i32[(ptr + 8) >>> 2];
        if (!Number.isFinite(len) || len < 0 || len > 2000000) return null;
        const u16Start = (ptr + 12) >>> 1;
        let s = '';
        for (let i = 0; i < len; i += 8192) {
          s += String.fromCharCode.apply(null, Array.from(u16.subarray(u16Start + i, u16Start + Math.min(len, i + 8192))));
        }
        return s;
      };

      currentPhase = 'STRING_ROUNDTRIP';
      const sampleText = 'HWA_DIAGNOSTIC_' + Date.now();
      const byteCount = 12 + (sampleText.length * 2) + 2;
      const strPtr = malloc(byteCount) >>> 0;
      if (!strPtr) {
        throw new Error(`Failed to allocate ${byteCount} bytes in WASM heap for string diagnostic`);
      }

      let readBack: string | null = null;
      try {
        heap.i32[(strPtr + 8) >>> 2] = sampleText.length;
        const u16Start = (strPtr + 12) >>> 1;
        for (let i = 0; i < sampleText.length; i++) {
          heap.u16[u16Start + i] = sampleText.charCodeAt(i);
        }
        heap.u16[u16Start + sampleText.length] = 0;

        readBack = readString(strPtr);
        if (readBack !== sampleText) {
          throw new Error(`String roundtrip mismatch: expected "${sampleText}", got "${readBack}"`);
        }
      } finally {
        try { free(strPtr); } catch (_) {}
      }

      currentPhase = 'VERIFY_TABLE_SYMBOLS';
      const activeProfile = getActiveWasmProfile();
      const sym = buildSymMap(activeProfile);
      const profileVerification = verifyWasmProfile(
        table,
        activeProfile,
        typeof win.hwaHelperGameVersion === 'string' ? win.hwaHelperGameVersion : null
      );
      const verifiedSyms: string[] = [];
      for (const [sName, sIdx] of Object.entries(sym)) {
        if (sIdx > 0 && sIdx < table.length) {
          const fn = table.get(sIdx);
          if (typeof fn === 'function') {
            verifiedSyms.push(sName);
          }
        }
      }

      currentPhase = 'PROBE_PRESETS';
      const callTableFn = (index: number, ...args: any[]): number => {
        const func = table.get(index);
        if (typeof func !== 'function') return 0;
        const requiredLen = func.length;
        const callArgs = args.slice(0, requiredLen);
        while (callArgs.length < requiredLen) callArgs.push(0);
        try {
          return (func(...callArgs) >>> 0);
        } catch {
          return 0;
        }
      };

      const presetCandidates = [
        { name: 'clanWarReplay(0,0)', idx: sym.Presets_clanWarReplay, args: [0, 0] },
        { name: 'clanWarReplay(1,0)', idx: sym.Presets_clanWarReplay, args: [1, 0] },
        { name: 'replay(0,1,0)', idx: sym.Presets_replay, args: [0, 1, 0] },
        { name: 'createReplay(0)', idx: sym.Presets_createReplay, args: [0] },
        { name: 'tower(0)', idx: sym.Presets_tower, args: [0] },
      ];
      const verifiedPresets: string[] = [];
      let probedStringClass = 0;

      for (const p of presetCandidates) {
        try {
          const ptr = callTableFn(p.idx, ...p.args);
          if (ptr > 0) {
            verifiedPresets.push(`${p.name} (0x${ptr.toString(16)})`);
            if (!probedStringClass) {
              const strFn = table.get(sym.Object_ToString);
              if (typeof strFn === 'function') {
                const sPtr = (strFn(ptr, 0) >>> 0);
                if (sPtr > 0) {
                  const k = heap.u32[sPtr >>> 2];
                  if (k > 65536 && k < memory.buffer.byteLength) {
                    probedStringClass = k;
                  }
                }
              }
            }
          }
        } catch (_) {}
      }

      if (!probedStringClass) {
        const targetWords = ['BattleInstantPlay', 'BattlePresets', 'BattleData', 'dungeon', 'titan'];
        const maxScan = Math.min(memory.buffer.byteLength, 256 * 1024 * 1024);
        const u16 = heap.u16;
        for (const word of targetWords) {
          const wLen = word.length;
          const firstCode = word.charCodeAt(0);
          const u16Limit = (maxScan - (16 + wLen * 2)) >>> 1;
          for (let i = 8; i < u16Limit && !probedStringClass; i += 2) {
            if (u16[i] === firstCode) {
              let match = true;
              for (let j = 1; j < wLen; j++) {
                if (u16[i + j] !== word.charCodeAt(j)) { match = false; break; }
              }
              if (match) {
                const strPtr = (i * 2) - 12;
                if (strPtr >= 1024 && strPtr + 16 < memory.buffer.byteLength) {
                  const rLen = heap.i32[(strPtr + 8) >>> 2];
                  const sync = heap.u32[(strPtr + 4) >>> 2];
                  const candKlass = heap.u32[strPtr >>> 2];
                  if (rLen === wLen && sync === 0 && candKlass > 65536 && candKlass < memory.buffer.byteLength) {
                    probedStringClass = candKlass;
                    break;
                  }
                }
              }
            }
          }
          if (probedStringClass) break;
        }
      }

      let liveCallReport: any = null;
      try {
        currentPhase = 'PROBE_BASIC_ENGINE_CALL';
        liveCallReport = await testWasmEngineCall(activeInst);
      } catch (callErr: any) {
        liveCallReport = {
          ok: false,
          error: callErr?.message || String(callErr),
          detail: callErr?.errorDetail || null
        };
      }

      return {
        ok: true,
        tableSize: table.length,
        memorySizeMb: Math.round(memory.buffer.byteLength / (1024 * 1024)),
        sampleString: readBack,
        profileVersion: activeProfile.gameVersion,
        profileStatus: profileVerification.status,
        profileMismatches: profileVerification.mismatches.length,
        verifiedSymbolsCount: verifiedSyms.length,
        verifiedSymbols: verifiedSyms.slice(0, 5),
        stringClass: probedStringClass > 0 ? `0x${probedStringClass.toString(16)}` : 'Not found',
        verifiedPresets: verifiedPresets.length > 0
          ? verifiedPresets.join(', ')
          : (probedStringClass ? 'Managed GetUninitializedObject fallback ready' : 'Direct ctor fallback available'),
        liveCall: liveCallReport,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      const errorDetail = describeWasmException(err, currentPhase, { kind: 'diagnostic_probe' });
      const enriched = new Error(errorDetail.message);
      (enriched as any).errorDetail = errorDetail;
      (enriched as any)._phase = currentPhase;
      throw enriched;
    }
  }

  win.__hwaTestWasmEngine = testWasmEngineProbe;

  async function testWasmEngineCall(targetInst?: any) {
    let currentPhase = 'INIT_BRIDGE';
    try {
      const activeInst = targetInst || activeUnityInstance || findActiveUnityInstance(win, doc);
      if (!activeInst) {
        throw new Error('Unity game instance not found. Make sure the game is loaded in this tab.');
      }

      currentPhase = 'INSPECT_MODULE';
      const mod = activeInst?.Module || win.unityFramework?.Module || (win as any).__hwaUnityModule || activeInst;
      const asm = mod?.asm || mod;
      if (!asm) {
        throw new Error('Unity WebAssembly asm not found in game engine instance');
      }

      const values = Object.values(asm);
      const table = (values.find((v: any) => v instanceof WebAssembly.Table) || (mod as any).wasmTable) as WebAssembly.Table | undefined;
      const memory = (values.find((v: any) => v instanceof WebAssembly.Memory) || (mod as any).wasmMemory) as WebAssembly.Memory | undefined;

      if (!table || !memory) {
        throw new Error('WASM table or memory not accessible in Unity engine');
      }

      currentPhase = 'MEMORY_PRIMITIVES';
      const malloc = (asm as any).Ol || (asm as any).malloc || (asm as any)._malloc;
      const free = (asm as any).Pl || (asm as any).free || (asm as any)._free;
      if (typeof malloc !== 'function' || typeof free !== 'function') {
        throw new Error('WASM malloc/free memory primitives not found');
      }

      // Live WASM heap views that transparently rebind if WASM calls memory.grow() mid-simulation
      // (a detached ArrayBuffer would otherwise make heap.i32[...] return undefined and readString() return "").
      let _heapBuf = memory.buffer;
      let _heapU8 = new Uint8Array(_heapBuf);
      let _heapU16 = new Uint16Array(_heapBuf);
      let _heapI32 = new Int32Array(_heapBuf);
      let _heapU32 = new Uint32Array(_heapBuf);
      const syncHeap = () => {
        if (memory.buffer !== _heapBuf) {
          _heapBuf = memory.buffer;
          _heapU8 = new Uint8Array(_heapBuf);
          _heapU16 = new Uint16Array(_heapBuf);
          _heapI32 = new Int32Array(_heapBuf);
          _heapU32 = new Uint32Array(_heapBuf);
        }
      };
      const heap = {
        get buffer() { syncHeap(); return _heapBuf; },
        get u8() { syncHeap(); return _heapU8; },
        get u16() { syncHeap(); return _heapU16; },
        get i32() { syncHeap(); return _heapI32; },
        get u32() { syncHeap(); return _heapU32; },
      };

      const sym = buildSymMap(getActiveWasmProfile());

      const callTableFn = (index: number, ...args: any[]): number => {
        const func = table.get(index);
        if (typeof func !== 'function') return 0;
        const requiredLen = func.length;
        const callArgs = args.slice(0, requiredLen);
        while (callArgs.length < requiredLen) {
          callArgs.push(0);
        }
        return (func(...callArgs) >>> 0);
      };

      const invokePtr = (name: keyof typeof sym, ...args: any[]) => {
        const idx = sym[name];
        return callTableFn(idx, ...args) >>> 0;
      };

      // Step 1: Learn String class pointer
      currentPhase = 'RESOLVE_STRING_CLASS';
      let stringClassPtr = 0;
      const probeObjects = [
        () => callTableFn(sym.Presets_clanWarReplay, 1, 0),
        () => callTableFn(sym.Presets_clanWarReplay, 0, 0),
      ];
      for (const probeFn of probeObjects) {
        try {
          const probePtr = probeFn();
          if (probePtr > 0) {
            const strSamplePtr = invokePtr('Object_ToString', probePtr);
            if (strSamplePtr > 0) {
              const kPtr = heap.u32[strSamplePtr >>> 2];
              if (kPtr > 65536 && kPtr < memory.buffer.byteLength) {
                stringClassPtr = kPtr;
                break;
              }
            }
          }
        } catch (_) {}
      }

      if (!stringClassPtr) {
        const targetWords = ['BattleInstantPlay', 'BattlePresets', 'BattleData', 'dungeon', 'titan'];
        const maxScan = Math.min(memory.buffer.byteLength, 256 * 1024 * 1024);
        const u16 = heap.u16;
        for (const word of targetWords) {
          const wLen = word.length;
          const firstCode = word.charCodeAt(0);
          const u16Limit = (maxScan - (16 + wLen * 2)) >>> 1;
          for (let i = 8; i < u16Limit && !stringClassPtr; i += 2) {
            if (u16[i] === firstCode) {
              let match = true;
              for (let j = 1; j < wLen; j++) {
                if (u16[i + j] !== word.charCodeAt(j)) { match = false; break; }
              }
              if (match) {
                const strPtr = (i * 2) - 12;
                if (strPtr >= 1024 && strPtr + 16 < memory.buffer.byteLength) {
                  const rLen = heap.i32[(strPtr + 8) >>> 2];
                  const sync = heap.u32[(strPtr + 4) >>> 2];
                  const candKlass = heap.u32[strPtr >>> 2];
                  if (rLen === wLen && sync === 0 && candKlass > 65536 && candKlass < memory.buffer.byteLength) {
                    stringClassPtr = candKlass;
                    break;
                  }
                }
              }
            }
          }
          if (stringClassPtr) break;
        }
      }

      if (!stringClassPtr) {
        throw new Error('Could not resolve IL2CPP String class descriptor from live objects or heap scan');
      }

      const forgeString = (str: string): number => {
        const len = str.length;
        const ptr = malloc(16 + 2 * len) >>> 0;
        if (!ptr) throw new Error('malloc failed for forgeString');
        heap.u32[ptr >>> 2] = stringClassPtr;
        heap.u32[(ptr + 4) >>> 2] = 0;
        heap.i32[(ptr + 8) >>> 2] = len;
        const u16Start = (ptr + 12) >>> 1;
        for (let i = 0; i < len; i++) {
          heap.u16[u16Start + i] = str.charCodeAt(i);
        }
        heap.u16[u16Start + len] = 0;
        return ptr;
      };

      // Step 2: Live function execution probe (calling JSON_Parse with small test JSON)
      currentPhase = 'EXECUTE_JSON_PARSE_PROBE';
      const testJson = '{"diagnostic_check":1}';
      const testJsonPtr = forgeString(testJson);
      let jsonNodePtr = 0;
      try {
        jsonNodePtr = invokePtr('JSON_Parse', testJsonPtr);
      } finally {
        try { free(testJsonPtr); } catch (_) {}
      }

      if (!jsonNodePtr) {
        throw new Error('Unity JSON_Parse returned null/zero pointer for test JSON');
      }

      // Step 3: LazyDataObject construction probe
      currentPhase = 'EXECUTE_LAZY_DATA_OBJECT_PROBE';
      let lazyObjPtr = 0;
      const lazyKlass = heap.u32[0x15aacd4 >>> 2];
      try {
        if (lazyKlass > 0) {
          lazyObjPtr = malloc(128) >>> 0;
          heap.u8.fill(0, lazyObjPtr, lazyObjPtr + 128);
          heap.u32[lazyObjPtr >>> 2] = lazyKlass;
          callTableFn(sym.LazyDataObject_ctor, lazyObjPtr, jsonNodePtr, 0);
        }
      } finally {
        if (lazyObjPtr) try { free(lazyObjPtr); } catch (_) {}
      }

      return {
        ok: true,
        jsonNodePtr: `0x${jsonNodePtr.toString(16)}`,
        lazyObjKlass: lazyKlass > 0 ? `0x${lazyKlass.toString(16)}` : 'N/A',
        stringClass: `0x${stringClassPtr.toString(16)}`,
        message: 'Unity Engine basic functions (JSON_Parse, LazyDataObject) executed successfully without traps',
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      const errorDetail = describeWasmException(err, currentPhase, { kind: 'live_call_probe' });
      const enriched = new Error(errorDetail.message);
      (enriched as any).errorDetail = errorDetail;
      (enriched as any)._phase = currentPhase;
      throw enriched;
    }
  }

  win.__hwaTestWasmCall = testWasmEngineCall;

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

  // --- Message Listener ---
  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.origin !== loc.origin) return;

    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      rpcDispatchMode = event.data.socketRefreshMode === 'direct' ? 'direct' : 'piggyback';
      recordingActive = event.data.recordingActive === true;
      if ('sanitizeTeamEnabled' in event.data) {
        sanitizeTeamEnabled = event.data.sanitizeTeamEnabled !== false;
        try {
          const s = getStorage();
          if (s) s.setItem('hwa_sanitize_team_enabled', String(sanitizeTeamEnabled));
        } catch (_) {}
      }
      if ('wasmSymbolOverrides' in event.data) {
        wasmSymbolOverrides = event.data.wasmSymbolOverrides || null;
        verifiedTableRef = null;
        lastWasmVerification = null;
      }
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
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'refresh-rpc') {
      if (!popupRpcEnabled) return;
      if (Number.isFinite(event.data.expiresAt) && getNow() >= event.data.expiresAt) return;
      const isDirectAction = event.data.direct === true || event.data.userAction === true;
      if (rpcDispatchMode !== 'direct' && !isDirectAction) {
        win.postMessage({ ...event.data, kind: 'queue-rpc' }, loc.origin);
        return;
      }
      const calls = event.data.calls;
      const s = getStorage();
      const storedUrl = s ? s.getItem('hwa_last_rpc_url') : null;
      const rawUrl = (lastRpcUrl && lastRpcUrl.includes('/api/rpc')) ? lastRpcUrl : ((storedUrl && storedUrl.includes('/api/rpc')) ? storedUrl : null);
      const url = rawUrl || 'https://api.hero-wars-alliance.com/api/rpc';
      if (!url || !Array.isArray(calls) || calls.length === 0) {
        if (event.data.requestId) {
          win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', requestId: event.data.requestId, ok: false, error: 'Empty calls or invalid RPC URL.' }, loc.origin);
        }
        return;
      }
      if (calls.some((call: any) => (['refillable_alchemyUseVideo', 'refillable_skillpointsUseVideo', 'artifact_expeditionStart', 'expeditionFarm'].includes(typeof call === 'string' ? call : call?.name) || /^speedUp.*WithResources$/.test(call?.name)) && !isHelperAction(call))) {
        if (event.data.requestId) {
          win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', requestId: event.data.requestId, ok: false, error: 'Blocked restricted call in refresh-rpc.' }, loc.origin);
        }
        return;
      }
      const multiTeamCheck = validateOutgoingMultiTeamRpcCalls(calls);
      if (!multiTeamCheck.ok) {
        console.error('[HWA Interceptor]', multiTeamCheck.error);
        if (event.data.requestId) {
          win.postMessage({ source: 'hwa-helper-api', kind: 'refresh-rpc-result', requestId: event.data.requestId, ok: false, error: multiTeamCheck.error }, loc.origin);
        }
        return;
      }

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
          credentials: 'include',
          body: JSON.stringify(payload)
        }).then(async (res: any) => {
          let responseText: string | null = null;
          try { responseText = await res.clone().text(); } catch (_) {}
          let responseJson: any = null;
          if (responseText) {
            try { responseJson = JSON.parse(responseText); } catch (_) {}
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
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'refresh-rpc-result',
            requestId: event.data.requestId || null,
            ok: res.ok,
            status: res.status,
            results: responseJson?.results || null,
            data: responseJson || null
          }, loc.origin);
        }).catch((err: any) => {
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'refresh-rpc-result',
            requestId: event.data.requestId || null,
            ok: false,
            error: err?.message || String(err)
          }, loc.origin);
        });
      } catch (err: any) {
        win.postMessage({
          source: 'hwa-helper-api',
          kind: 'refresh-rpc-result',
          requestId: event.data.requestId || null,
          ok: false,
          error: err?.message || String(err)
        }, loc.origin);
      }
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

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'simulate-battle') {
      const { simId, rawBattle, seed } = event.data;
      (async () => {
        try {
          if (!win.__hwaSimulateBattle) {
            setupWasmSimulationBridge(activeUnityInstance);
          }
          if (typeof win.__hwaSimulateBattle !== 'function') {
            throw new Error('Unity battle simulation engine is not initialized or ready. Please reload the game page.');
          }
          const result = await win.__hwaSimulateBattle(rawBattle, seed);
          if (!result) throw new Error('Unity simulation produced empty result.');
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'simulate-battle-result',
            simId,
            ok: true,
            result
          }, loc.origin);
        } catch (err: any) {
          const detail = err?.errorDetail || describeWasmException(err, 'DISPATCH_SIMULATION', {
            type: rawBattle?.type,
            seed,
            attackers: rawBattle?.attackers,
            defenders: rawBattle?.defenders
          });
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'simulate-battle-result',
            simId,
            ok: false,
            error: detail.message || err?.message || String(err),
            errorDetail: detail
          }, loc.origin);
        }
      })();
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'test-wasm-engine') {
      const testId = event.data.testId;
      (async () => {
        try {
          const result = await testWasmEngineProbe();
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'test-wasm-engine-result',
            testId,
            ok: true,
            result
          }, loc.origin);
        } catch (err: any) {
          const detail = (err as any)?.errorDetail || describeWasmException(err, (err as any)?._phase || 'TEST_WASM_ENGINE', { kind: 'diagnostic_probe' });
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'test-wasm-engine-result',
            testId,
            ok: false,
            error: detail.message || err?.message || String(err),
            errorDetail: detail
          }, loc.origin);
        }
      })();
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'test-wasm-call') {
      const testId = event.data.testId;
      (async () => {
        try {
          const result = await testWasmEngineCall();
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'test-wasm-call-result',
            testId,
            ok: true,
            result
          }, loc.origin);
        } catch (err: any) {
          const detail = (err as any)?.errorDetail || describeWasmException(err, (err as any)?._phase || 'TEST_WASM_CALL', { kind: 'live_call_probe' });
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'test-wasm-call-result',
            testId,
            ok: false,
            error: detail.message || err?.message || String(err),
            errorDetail: detail
          }, loc.origin);
        }
      })();
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'retry-draft-decrypt') {
      if (typeof event.data.ciphertext === 'string' && event.data.ciphertext.length > 0) {
        decryptDraftPayloadFromUnity(event.data.ciphertext, {
          stageId: event.data.stageId,
          matchId: event.data.matchId,
          enemyCiphertext: typeof event.data.enemyCiphertext === 'string' ? event.data.enemyCiphertext : null
        }, 0);
      }
      return;
    }

    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'run-wasm-gc') {
      const gcId = event.data.gcId;
      (async () => {
        try {
          const gcFn = (win as any).__hwaRunWasmGc;
          const res = typeof gcFn === 'function'
            ? await gcFn(event.data.force !== false)
            : { wasmMemoryMb: 0, gcRuns: 0, gcMethod: 'unavailable' };
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'run-wasm-gc-result',
            gcId,
            ok: true,
            wasmMemoryMb: res.wasmMemoryMb,
            gcRuns: res.gcRuns,
            gcMethod: res.gcMethod
          }, loc.origin);
        } catch (err: any) {
          win.postMessage({
            source: 'hwa-helper-api',
            kind: 'run-wasm-gc-result',
            gcId,
            ok: false,
            error: err?.message || String(err)
          }, loc.origin);
        }
      })();
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

      if (isInternalZipUrl(urlStr)) {
        if (typeof Response === 'function') {
          const isHead = String(options?.method || input?.method || 'GET').toUpperCase() === 'HEAD';
          const headers = typeof Headers === 'function' ? new Headers() : ({} as any);
          if (typeof headers.set === 'function') {
            headers.set('Content-Type', 'application/zip');
            headers.set('Content-Length', String(EMPTY_ZIP_BYTES.byteLength));
            headers.set('Access-Control-Allow-Origin', '*');
          }
          const res = new Response(isHead ? null : EMPTY_ZIP_BYTES.buffer.slice(0), {
            status: 200,
            statusText: 'OK',
            headers: typeof headers.set === 'function' ? headers : { 'Content-Type': 'application/zip', 'Content-Length': '22', 'Access-Control-Allow-Origin': '*' }
          });
          try { Object.defineProperty(res, 'url', { value: urlStr }); } catch (_) {}
          return Promise.resolve(res);
        }
      }

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
              const duration = perf.now() - started;

              if (piggyback) {
                try {
                  const fullText = await response.clone().text();
                  const full = JSON.parse(fullText);
                  if (!response.ok || !Array.isArray(full.results)) throw Error('Piggyback RPC failed');

                  if (sanitizeTeamEnabled) {
                    const sanitizedResult = sanitizeTeamGetAllRpcPayload(piggyback.options?.body ?? null, full);
                    if (sanitizedResult.mutated) {
                      console.warn('[HWA Interceptor] Sanitized malformed teamGetAll entry:', sanitizedResult.fixes);
                    }
                  }

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

                  inspectDraftRpc(piggyback.options.body, fullText);
                  record('fetch', method, url, response.status, duration, 'completed', {
                    requestBody: piggyback.options.body,
                    responseBody: fullText
                  });
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

              let responseToReturn = response;
              if (sanitizeTeamEnabled && isPost && url.includes('/api/rpc') && response.ok) {
                try {
                  const reqInfo = await requestBody;
                  const reqText = reqInfo?.text ?? null;
                  if (hasTeamGetAllRequest(reqText)) {
                    const rawText = await response.clone().text();
                    const parsed = JSON.parse(rawText);
                    const sanitizedResult = sanitizeTeamGetAllRpcPayload(reqText, parsed);
                    if (sanitizedResult.mutated) {
                      console.warn('[HWA Interceptor] Sanitized malformed teamGetAll entry:', sanitizedResult.fixes);
                      const headers = new Headers(response.headers);
                      headers.delete('content-length');
                      headers.delete('content-encoding');
                      const sanitized = new Response(JSON.stringify(parsed), {
                        status: response.status,
                        statusText: response.statusText,
                        headers
                      });
                      for (const property of ['url', 'redirected', 'type']) {
                        try { Object.defineProperty(sanitized, property, { value: response[property] }); } catch (_) {}
                      }
                      responseToReturn = sanitized;
                    }
                  }
                } catch (_) {}
              }

              if (!captureEnabled) return responseToReturn;

              if (isPost) {
                Promise.all([requestBody, readFetchResponse(responseToReturn)]).then(([request, received]) => {
                  const reqText = request?.text ?? null;
                  const resText = received?.text ?? null;
                  inspectDraftRpc(reqText, resText);
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
              return responseToReturn;
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
      if (isInternalZipUrl(urlStr)) {
        requestInfo.set(this, { method, url: urlStr, isMockInternalZip: true });
        return originalOpen.call(this, method, url, ...rest);
      }
      const result = originalOpen.call(this, method, url, ...rest);
      if (!captureEnabled || isTrackingUrl(urlStr, loc.href)) requestInfo.delete(this);
      else requestInfo.set(this, { method, url, outcome: 'completed' });
      return result;
    };

    xhrProto.send = function (this: any, ...args: any[]) {
      const internalInfo = requestInfo.get(this);
      if (internalInfo?.isMockInternalZip) {
        const urlStr = internalInfo.url;
        const self = this;
        const setProp = (prop: string, val: any) => {
          try {
            Object.defineProperty(self, prop, { value: val, writable: true, configurable: true });
          } catch (_) {
            self[prop] = val;
          }
        };

        const buf = EMPTY_ZIP_BYTES.buffer.slice(0);
        let respData: any = buf;
        const respType = (self.responseType || '').toLowerCase();
        if (respType === 'blob' && typeof Blob !== 'undefined') {
          respData = new Blob([buf], { type: 'application/zip' });
        } else if (respType === 'text' || respType === '') {
          respData = typeof TextDecoder !== 'undefined' ? new TextDecoder('latin1').decode(EMPTY_ZIP_BYTES) : '';
        } else if (respType === 'json') {
          respData = null;
        }

        setProp('status', 200);
        setProp('statusText', 'OK');
        setProp('responseURL', urlStr);
        setProp('response', respData);
        setProp('responseText', typeof respData === 'string' ? respData : '');

        self.getResponseHeader = function (name: string) {
          const n = (name || '').toLowerCase();
          if (n === 'content-type') return 'application/zip';
          if (n === 'content-length') return String(EMPTY_ZIP_BYTES.byteLength);
          if (n === 'access-control-allow-origin') return '*';
          return null;
        };
        self.getAllResponseHeaders = function () {
          return 'content-type: application/zip\r\ncontent-length: 22\r\naccess-control-allow-origin: *\r\n';
        };

        const fire = (type: string) => {
          try {
            const evt = typeof Event === 'function' ? new Event(type) : { type, target: self, currentTarget: self };
            if (typeof self['on' + type] === 'function') {
              self['on' + type](evt);
            }
            if (typeof self.dispatchEvent === 'function') {
              self.dispatchEvent(evt);
            }
            if (typeof self.emit === 'function') {
              self.emit(type);
            }
          } catch (_) {}
        };

        setTimer(() => {
          setProp('readyState', 2);
          fire('readystatechange');
          setProp('readyState', 3);
          fire('readystatechange');
          setProp('readyState', 4);
          fire('readystatechange');
          fire('load');
          fire('loadend');
        }, 0);
        return;
      }
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
            info.requestBody.then((request: any) => {
              const reqText = request?.text ?? null;
              inspectDraftRpc(reqText, resText);
              record('xhr', info.method, info.url,
                this.status || null, duration, info.outcome, {
                  requestBody: request?.text ?? null,
                  requestBodyTruncated: request?.truncated ?? false,
                  responseBody: received?.text ?? null,
                  responseBodyTruncated: received?.truncated ?? false
                });
            }).catch(() => record('xhr', info.method, info.url, this.status || null, duration, info.outcome));
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
