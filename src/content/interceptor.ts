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
    'eternalStory_collectChest'
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
    if (win.__hwaSimulateBattle) return;

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

      const heap = {
        buffer: memory.buffer,
        u8: new Uint8Array(memory.buffer),
        u16: new Uint16Array(memory.buffer),
        i32: new Int32Array(memory.buffer),
        u32: new Uint32Array(memory.buffer)
      };

      const malloc = (asm as any).Ol || (asm as any).malloc || (asm as any)._malloc;
      const free = (asm as any).Pl || (asm as any).free || (asm as any)._free;
      if (typeof malloc !== 'function' || typeof free !== 'function') {
        throw new Error('WASM malloc/free memory primitives not found');
      }

      const sym = {
        Play_ctor: 11594,
        Play_start: 469995,
        Play_get_result: 469999,
        Play_createBattleData: 175082,
        Play_executeBattle: 175078,
        Play_createResult: 175081,
        Play_dispose: 175079,
        Presets_clanWarReplay: 174207,
        Presets_arenaReplay: 174209,
        Presets_titanArenaReplay: 468119,
        Presets_createReplay: 468122,
        Presets_get_isReplay: 468101,
        BattlePresets_ctor5: 6579,
        BattleData_serializeResult: 49386,
        BattleData_getStars: 28182,
        JSON_Parse: 1763,
        DataObject_fromObject: 15292,
        Type_GetType: 38793,
        GetUninitializedObject: 26825,
        Object_ToString: 16323,
        GCHandle_Alloc: 2129,
        GCHandle_FreeHandle: 1845
      };

      const fn = (name: keyof typeof sym) => {
        const idx = sym[name];
        const func = table.get(idx);
        if (typeof func !== 'function') throw new Error(`Unity engine function '${name}' (index ${idx}) not available in WASM table`);
        return func;
      };

      const invoke = (name: keyof typeof sym, ...args: any[]) => fn(name)(...args, 0);
      const invokePtr = (name: keyof typeof sym, ...args: any[]) => fn(name)(...args, 0) >>> 0;

      // Read string from IL2CPP System.String pointer
      const readString = (ptr: number): string | null => {
        if (!ptr) return null;
        const len = heap.i32[(ptr + 8) >>> 2];
        if (len < 0 || len > 2000000) return null;
        const u16Start = (ptr + 12) >>> 1;
        let s = '';
        for (let i = 0; i < len; i += 8192) {
          s += String.fromCharCode.apply(null, Array.from(heap.u16.subarray(u16Start + i, u16Start + Math.min(len, i + 8192))));
        }
        return s;
      };

      let hPlay = 0;
      let hPresets = 0;
      let playPtr = 0;

      try {
        // Step 1: Create presets for battle
        // In HWA client, Presets_clanWarReplay: 0 = Titan replay, 1 = Hero replay
        currentPhase = 'CREATE_PRESETS';
        const isTitan = String(rawBattle?.type || '').toLowerCase().includes('titan');
        let presetPtr = 0;
        const candidateErrors: string[] = [];

        // Candidate list in priority order
        const candidates = isTitan
          ? [
              { name: 'Presets_clanWarReplay(0)', fn: () => invokePtr('Presets_clanWarReplay', 0) },
              { name: 'Presets_clanWarReplay(1)', fn: () => invokePtr('Presets_clanWarReplay', 1) },
              { name: 'Presets_titanArenaReplay(0)', fn: () => invokePtr('Presets_titanArenaReplay', 0) },
              { name: 'Presets_createReplay(0)', fn: () => invokePtr('Presets_createReplay', 0) },
              { name: 'Presets_arenaReplay(0)', fn: () => invokePtr('Presets_arenaReplay', 0) },
            ]
          : [
              { name: 'Presets_clanWarReplay(1)', fn: () => invokePtr('Presets_clanWarReplay', 1) },
              { name: 'Presets_clanWarReplay(0)', fn: () => invokePtr('Presets_clanWarReplay', 0) },
              { name: 'Presets_arenaReplay(0)', fn: () => invokePtr('Presets_arenaReplay', 0) },
              { name: 'Presets_createReplay(0)', fn: () => invokePtr('Presets_createReplay', 0) },
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

        if (!presetPtr) {
          throw new Error(`Failed to create BattlePresets for simulation (isTitan: ${isTitan}). Candidates: [${candidateErrors.join('; ')}]`);
        }

        // Step 2: Learn String class pointer from Object.ToString(presetPtr)
        currentPhase = 'LEARN_STRING_CLASS';
        const strSamplePtr = invokePtr('Object_ToString', presetPtr);
        if (!strSamplePtr) throw new Error('Failed to obtain String class descriptor from Object.ToString');
        const stringClassPtr = heap.u32[strSamplePtr >>> 2];

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

        // Step 3: Serialize and parse JSON input into game data structure
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

        currentPhase = 'CONVERT_DATA_OBJECT';
        const dataObjPtr = invokePtr('DataObject_fromObject', jsonNodePtr);
        if (!dataObjPtr) throw new Error('DataObject_fromObject returned null');

        // Step 4: Allocate BattleInstantPlay
        currentPhase = 'RESOLVE_PLAY_TYPE';
        const playTypeNamePtr = forgeString('BattleInstantPlay');
        let playTypePtr = 0;
        try {
          playTypePtr = invokePtr('Type_GetType', playTypeNamePtr);
        } finally {
          free(playTypeNamePtr);
        }
        if (!playTypePtr) throw new Error('BattleInstantPlay type not found in Unity IL2CPP runtime');

        currentPhase = 'ALLOC_PLAY_OBJECT';
        playPtr = invokePtr('GetUninitializedObject', playTypePtr);
        if (!playPtr) throw new Error('Could not instantiate BattleInstantPlay object');

        hPlay = invokePtr('GCHandle_Alloc', playPtr);
        hPresets = invokePtr('GCHandle_Alloc', presetPtr);

        // Step 5: Construct BattleInstantPlay(dataObj, presets, 0, 0, 0)
        currentPhase = 'CONSTRUCT_BATTLE_PLAY';
        invoke('Play_ctor', playPtr, dataObjPtr, presetPtr, 0, 0, 0);

        // Step 6: Start battle execution loop
        currentPhase = 'START_BATTLE_PLAY';
        invoke('Play_start', playPtr);

        // Step 7: Await completion via Play_get_result polling
        currentPhase = 'WAIT_BATTLE_RESULT';
        let resultHandle = 0;
        const startWait = Date.now();
        while (!resultHandle && Date.now() - startWait < 5000) {
          resultHandle = invokePtr('Play_get_result', playPtr);
          if (!resultHandle) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        // Step 8: Create battle data and execute physics & AI simulation
        currentPhase = 'CREATE_BATTLE_DATA';
        const battleDataPtr = invokePtr('Play_createBattleData', playPtr, dataObjPtr, 1);
        if (!battleDataPtr) throw new Error('Play_createBattleData returned null');

        currentPhase = 'EXECUTE_BATTLE';
        invoke('Play_executeBattle', playPtr);

        currentPhase = 'CREATE_RESULT';
        invoke('Play_createResult', playPtr);

        currentPhase = 'SERIALIZE_RESULT';
        const resultStrPtr = invokePtr('BattleData_serializeResult', battleDataPtr);
        const resultJsonStr = readString(resultStrPtr);
        if (!resultJsonStr) throw new Error('BattleData_serializeResult returned empty string');

        const parsedProgress = JSON.parse(resultJsonStr);
        const stars = Number(invoke('BattleData_getStars', battleDataPtr)) || 0;
        const win = stars > 0;

        // Map attackers and defenders state from progress
        const attackersOut: Record<string, any> = {};
        const rawAttackers = rawBattle?.attackers || {};
        const progAttackers = parsedProgress?.attackers?.heroes || {};

        for (const [idStr, rawAttacker] of Object.entries(rawAttackers) as any) {
          const progHero = progAttackers[idStr] || {};
          const maxHp = Number(rawAttacker.hp || rawAttacker.maxHp || 1000000);
          const finalHp = Number(progHero.hp != null ? progHero.hp : (rawAttacker.state?.hp != null ? rawAttacker.state.hp : maxHp));
          const initHp = Number(rawAttacker.state?.hp != null ? rawAttacker.state.hp : maxHp);
          const hpDelta = finalHp - initHp;
          attackersOut[idStr] = {
            hp: finalHp,
            maxHp,
            energy: Number(progHero.energy || rawAttacker.state?.energy || 0),
            isDead: Boolean(progHero.isDead || finalHp <= 0),
            hpDelta
          };
        }

        const defendersOut: Record<string, any> = {};
        const progDefenders = parsedProgress?.defenders?.heroes || {};
        for (const [idStr, progDef] of Object.entries(progDefenders) as any) {
          defendersOut[idStr] = {
            hp: Number(progDef.hp || 0),
            isDead: Boolean(progDef.isDead || progDef.hp <= 0)
          };
        }

        const duration = Number(parsedProgress?.duration) || 0;

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
        try { if (playPtr) invoke('Play_dispose', playPtr); } catch (_) {}
        try { if (hPlay) invoke('GCHandle_FreeHandle', hPlay); } catch (_) {}
        try { if (hPresets) invoke('GCHandle_FreeHandle', hPresets); } catch (_) {}
      }
    };
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

  // --- Message Listener ---
  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.origin !== loc.origin) return;

    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      rpcDispatchMode = event.data.socketRefreshMode === 'direct' ? 'direct' : 'piggyback';
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
                  const reqText = request?.text ?? null;
                  const resText = received?.text ?? null;
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
