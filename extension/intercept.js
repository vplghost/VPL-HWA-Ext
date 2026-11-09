(() => {
  const flag = Symbol.for('hwa-helper-api-intercept-installed');
  if (window[flag]) return;
  window[flag] = true;
  const MAX_BODY_CHARS = 512 * 1024;
  const isTrackingUrl = globalThis.hwaHelperIsTrackingUrl;
  const originalFetch = typeof window.fetch === 'function' ? window.fetch : null;
  let captureEnabled = false;
  let popupRpcEnabled = false;
  let rpcDispatchMode = 'piggyback';
  let recordingActive = false;
  let lastNudgeAt = -Infinity;
  let lastNudgeTrackId = null;
  let lastNudgeType = null;
  const queuedRpcCalls = new Map();
  const queuedClaimKeys = new Set();
  const queuedActionExpiry = new Map();
  const queuedRpcGroups = new Map();
  let claimQueueTimer = null;
  let actionQueueTimer = null;
  function reportQueueStatus() {
    for (const key of queuedRpcGroups.keys()) if (!queuedRpcCalls.has(key)) queuedRpcGroups.delete(key);
    window.postMessage({ source: 'hwa-helper-api', kind: 'rpc-queue-status',
      count: queuedRpcCalls.size }, location.origin);
    if (actionQueueTimer !== null) clearTimeout(actionQueueTimer);
    actionQueueTimer = null;
    if (queuedActionExpiry.size && typeof setTimeout === 'function') {
      const delay = Math.max(0, Math.min(...queuedActionExpiry.values()) - Date.now());
      actionQueueTimer = setTimeout(() => {
        for (const [key, expiresAt] of queuedActionExpiry) {
          if (Date.now() >= expiresAt) { queuedRpcCalls.delete(key); queuedActionExpiry.delete(key); }
        }
        reportQueueStatus();
      }, delay);
    }
  }
  const piggybackMethods = new Set(['randomDraft_getInfo', 'getPage',
    'questGetAll', 'questGetEvents', 'getMarches', 'getRallyById', 'getUnitSummary',
    'userGetInfo', 'inventoryGet', 'heroGetAll', 'titanGetAll', 'teamGetAll',
    'refillableGetAll', 'missionGetAll', 'artifact_getAll', 'titan_artifactGetCounters',
    'skin_getAll', 'rune_getAll', 'arenaGetAll', 'clanWarGetBriefInfo', 'mailGetAll',
    'searchMob', 'searchMine']);
  const helperActionMethods = new Set(['createRally', 'cancelRally', 'joinRally', 'attackMob', 'attackMine', 'stopMineGathering',
    'randomDraft_saveDefence', 'randomDraft_saveAttack',
    'magicTower_enterRoom', 'magicTower_startBattle', 'magicTower_activateBuff',
    'magicTower_openChest', 'magicTower_enterNextFloor',
    'startConstruction', 'completeConstruction']);
  const claimActionMethods = new Set(['mailFarm', 'readAndClaimAll', 'quest_multiFarm']);
  const claimQueueMethods = new Set([...claimActionMethods, 'mailGetAll', 'questGetAll']);
  const reportClaimResult = (ok, error = null) => window.postMessage({
    source: 'hwa-helper-api', kind: 'claim-rpc-result', ok, error
  }, location.origin);
  const tracePiggyback = (action, detail = '') => {
    if (!recordingActive) return;
    window.postMessage({ source: 'hwa-helper-api', kind: 'interaction-record',
      entry: { category: 'rpc', action, target: 'api/rpc', methodName: detail,
        timestamp: new Date().toISOString() }
    }, location.origin);
  };
  let lastRpcUrl = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hwa_last_rpc_url') : null;
  let lastRpcHeaders = null;
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

  function syncRequestId(candidate) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = parseInt(sessionStorage.getItem('hwa_highest_request_id'), 10);
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
        // Game client's sequence fell behind our dispatch counter (or cached session ID).
        // Rewrite to strictly monotonic value so server doesn't reject with "Request id less then cached request id".
        highestRequestId++;
        candidate = String(highestRequestId);
      }
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
        }
      } catch (_) {}
    }
    return candidate;
  }

  try {
    window.__hwaRequestIdState = {
      get: () => {
        try {
          if (typeof sessionStorage !== 'undefined') {
            const stored = parseInt(sessionStorage.getItem('hwa_highest_request_id'), 10);
            if (!isNaN(stored) && stored > highestRequestId) highestRequestId = stored;
          }
        } catch (_) {}
        return highestRequestId;
      },
      setOffset: (offset) => {
        const val = parseInt(offset, 10);
        if (!isNaN(val) && val > highestRequestId) {
          highestRequestId = val;
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
            }
          } catch (_) {}
        }
        return highestRequestId;
      }
    };
  } catch (_) {}

  function getNextRequestId(baseHeaders) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = parseInt(sessionStorage.getItem('hwa_highest_request_id'), 10);
        if (!isNaN(stored) && stored > highestRequestId) {
          highestRequestId = stored;
        }
      }
    } catch (_) {}

    if (baseHeaders && typeof baseHeaders === 'object') {
      const reqIdKey = Object.keys(baseHeaders).find((k) => k.toLowerCase() === 'x-request-id');
      const raw = reqIdKey ? baseHeaders[reqIdKey] : null;
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > highestRequestId) {
          highestRequestId = parsed;
        }
      }
    }
    highestRequestId++;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
      }
    } catch (_) {}
    return String(highestRequestId);
  }

  function buildDispatchHeaders(baseHeaders) {
    const headers = {};
    if (baseHeaders && typeof baseHeaders === 'object') {
      for (const [rawKey, val] of Object.entries(baseHeaders)) {
        if (!rawKey || val === undefined || val === null) continue;
        const key = rawKey.toLowerCase();
        // Exclude HTTP/2 pseudo-headers
        if (key.startsWith(':')) continue;
        // Exclude headers that must not be carried over or are browser fetch controlled
        if (key === 'content-length' || key === 'host' || key === 'origin' || key === 'referer') continue;
        // CRITICAL: Strip stale signature! A signature is strictly bound to its specific payload.
        // Sending a stale signature causes Nexters server to fail signature verification with HTTP 500.
        if (key === 'x-auth-signature') continue;
        // Strip request-id and timestamp as we generate fresh sequential ones
        if (key === 'x-request-id' || key === 'x-env-timestamp') continue;

        headers[rawKey] = val;
      }
    }

    // Set standard content headers
    headers['content-type'] = 'application/json; charset=UTF-8';
    headers['accept'] = '*/*';
    headers['x-requested-with'] = 'XMLHttpRequest';

    // Monotonic request ID synchronized with game client
    headers['x-request-id'] = getNextRequestId(baseHeaders);
    headers['x-env-timestamp'] = String(Math.floor(Date.now() / 1000));

    // If webglAuth accessToken is available on window, attach Authorization
    try {
      const auth = window.webglAuth;
      if (auth && auth.accessToken) {
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
        if (auth.accountId && !headers['x-auth-user-id'] && !headers['X-Auth-User-Id']) {
          headers['x-auth-user-id'] = String(auth.accountId);
        }
      }
    } catch (_) {}

    return headers;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled === true;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      rpcDispatchMode = ['direct', 'mqtt-piggyback'].includes(event.data.socketRefreshMode) ? event.data.socketRefreshMode : 'piggyback';
      recordingActive = event.data.recordingActive === true;
      if (!captureEnabled || !popupRpcEnabled || event.data.socketRefreshMode === 'direct') {
        if (queuedClaimKeys.size) reportClaimResult(false, 'Queued claims were cancelled by Settings.');
        queuedRpcCalls.clear();
        queuedClaimKeys.clear();
        queuedActionExpiry.clear();
        if (claimQueueTimer !== null) clearTimeout(claimQueueTimer);
        claimQueueTimer = null;
      }
      reportQueueStatus();
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'drop-rpc-group') {
      for (const [key, group] of queuedRpcGroups) {
        if (!queuedRpcCalls.has(key) || group === event.data.group) {
          if (group === event.data.group) { queuedRpcCalls.delete(key); queuedActionExpiry.delete(key); }
          queuedRpcGroups.delete(key);
        }
      }
      reportQueueStatus();
    }
    if (event.data?.source === 'hwa-helper-control' &&
        ['queue-rpc', 'queue-claim'].includes(event.data.kind)) {
      if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct' || !Array.isArray(event.data.calls)) return;
      const isClaim = event.data.kind === 'queue-claim';
      if (Number.isFinite(event.data.expiresAt) && Date.now() >= event.data.expiresAt) return;
      for (const call of event.data.calls) {
        if (!(isClaim ? claimQueueMethods.has(call?.name) :
            piggybackMethods.has(call?.name) || helperActionMethods.has(call?.name))) continue;
        const safe = { name: call.name, args: call.args || {},
          ...(call.feature ? { feature: call.feature } : {}) };
        const key = JSON.stringify(safe);
        if (event.data.calls.some((item) => helperActionMethods.has(item?.name) || claimActionMethods.has(item?.name)) &&
            piggybackMethods.has(call.name)) queuedRpcCalls.delete(key);
        if (!queuedRpcCalls.has(key)) {
          if (queuedRpcCalls.size >= 64) {
            const oldest = [...queuedRpcCalls.keys()].find((item) =>
              !queuedClaimKeys.has(item) && !queuedActionExpiry.has(item));
            if (!oldest) continue;
            queuedRpcCalls.delete(oldest);
            queuedClaimKeys.delete(oldest);
          }
          queuedRpcCalls.set(key, safe);
          if (typeof event.data.group === 'string') queuedRpcGroups.set(key, event.data.group);
          if (helperActionMethods.has(call.name) || Number.isFinite(event.data.expiresAt)) {
            queuedActionExpiry.set(key, Math.min(Date.now() + 120000, event.data.expiresAt || Infinity));
          }
        }
        if (isClaim) queuedClaimKeys.add(key);
      }
      if (isClaim && queuedClaimKeys.size && typeof setTimeout === 'function') {
        if (claimQueueTimer !== null) clearTimeout(claimQueueTimer);
        claimQueueTimer = setTimeout(() => {
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
      if (event.data?.trackId) {
        console.log('[HWA-TRACK][4a/6 INTERCEPT_QUEUE]', {
          trackId: event.data.trackId,
          time: new Date().toISOString(),
          calls: event.data.calls,
          queueSize: queuedRpcCalls.size,
          dispatchMode: rpcDispatchMode
        });
      }
      if (rpcDispatchMode === 'mqtt-piggyback' && queuedRpcCalls.size) {
        lastNudgeAt = Date.now();
        lastNudgeTrackId = event.data?.trackId || null;
        if (event.data?.trackId) {
          console.log('[HWA-TRACK][4b/6 INTERCEPT_NUDGE_SIGNAL]', {
            trackId: event.data.trackId,
            time: new Date().toISOString(),
            queueSize: queuedRpcCalls.size
          });
        }
        window.postMessage({
          source: 'hwa-helper-control',
          kind: 'mqtt-rpc-nudge',
          trackId: event.data?.trackId,
          requestedAt: event.data?.requestedAt
        }, location.origin);
      }
    }
    if (event.data?.source === 'hwa-helper-api' && event.data.kind === 'mqtt-rpc-nudge-status') {
      if (event.data.state === 'triggered') {
        lastNudgeAt = Date.now();
        if (event.data.nudgeType) lastNudgeType = event.data.nudgeType;
        if (event.data.trackId) lastNudgeTrackId = event.data.trackId;
      }
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'refresh-rpc') {
      if (!popupRpcEnabled) return;
      if (Number.isFinite(event.data.expiresAt) && Date.now() >= event.data.expiresAt) return;
      if (rpcDispatchMode !== 'direct') {
        window.postMessage({ ...event.data, kind: 'queue-rpc' }, location.origin);
        return;
      }
      const calls = event.data.calls;
      const url = lastRpcUrl || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hwa_last_rpc_url') : null) || 'https://api.hero-wars-alliance.com/api/rpc';
      if (!url || !Array.isArray(calls) || calls.length === 0) return;
      let headersToUse = lastRpcHeaders;
      if (!headersToUse && typeof sessionStorage !== 'undefined') {
        try {
          const stored = sessionStorage.getItem('hwa_last_rpc_headers');
          if (stored) headersToUse = JSON.parse(stored);
        } catch (_) {}
      }
      const randHex = () => Math.random().toString(16).slice(2).padStart(16, '0').slice(0, 16);
      const payload = {
        calls: calls.map((c) => ({
          name: typeof c === 'string' ? c : c.name,
          args: (typeof c === 'object' && c.args) ? c.args : {},
          ident: randHex() + randHex(),
          ...(typeof c === 'object' && c.feature ? { feature: c.feature } : {})
        }))
      };
      const headers = buildDispatchHeaders(headersToUse);
      try {
        (originalFetch || window.fetch)(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).then(async (res) => {
          let responseText = null;
          try {
            responseText = await res.clone().text();
          } catch (_) {}

          // Unconditionally emit api-record so rpcCache gets updated even if logging/capture is disabled
          if (responseText) {
            try {
              const u = new URL(String(url), location.href);
              window.postMessage({
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
              }, location.origin);
            } catch (_) {}
          }

          window.postMessage({
            source: 'hwa-helper-api',
            kind: 'refresh-rpc-result',
            ok: res.ok,
            status: res.status
          }, location.origin);
        }).catch((err) => {
          window.postMessage({
            source: 'hwa-helper-api',
            kind: 'refresh-rpc-result',
            ok: false,
            error: err?.message || String(err)
          }, location.origin);
        });
      } catch (err) {
        window.postMessage({
          source: 'hwa-helper-api',
          kind: 'refresh-rpc-result',
          ok: false,
          error: err?.message || String(err)
        }, location.origin);
      }
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'draft-action') {
      if (!popupRpcEnabled || !['saveDefence', 'saveAttack'].includes(event.data.action) ||
          !Array.isArray(event.data.heroes) || event.data.heroes.length !== 5 ||
          event.data.heroes.some((id) => !Number.isInteger(id))) return;
      window.postMessage({ source: 'hwa-helper-control', kind: 'refresh-rpc', calls: [
        { name: event.data.action === 'saveDefence' ? 'randomDraft_saveDefence' : 'randomDraft_saveAttack',
          args: { heroes: event.data.heroes } }, { name: 'randomDraft_getInfo' }
      ] }, location.origin);
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'engine-ping') {
      reportEngineStatus('ping');
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'engine-send-message') {
      if (!popupRpcEnabled || rpcDispatchMode !== 'direct') return;
      const { objectName, methodName, param } = event.data;
      let ok = false;
      let error = null;
      try {
        if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
          const found = findActiveUnityInstance(window, typeof document !== 'undefined' ? document : null);
          if (found) setUnityInstance(found, 'pre-send-message');
        }
        if (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function') {
          activeUnityInstance.SendMessage(objectName, methodName, param ?? '');
          ok = true;
        } else {
          error = 'Unity instance not ready or SendMessage not available';
        }
      } catch (err) {
        error = err?.message || String(err);
      }
      window.postMessage({
        source: 'hwa-helper-api',
        kind: 'engine-send-message-result',
        ok,
        error,
        call: { objectName, methodName, param }
      }, location.origin);
    }
  });

  let activeUnityInstance = null;

  function findActiveUnityInstance(win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null) {
    if (!win) return null;

    // 1. Direct window SendMessage
    if (typeof win.SendMessage === 'function') {
      return {
        SendMessage: win.SendMessage.bind(win),
        _source: 'window.SendMessage'
      };
    }

    // 2. Candidate global objects
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
        const val = win[prop];
        if (val && typeof val === 'object') {
          if (typeof val.SendMessage === 'function') {
            return val;
          }
          if (val.unityInstance && typeof val.unityInstance.SendMessage === 'function') {
            return val.unityInstance;
          }
          if (val.instance && typeof val.instance.SendMessage === 'function') {
            return val.instance;
          }
        }
      } catch (_) {}
    }

    // 3. Canvas element properties
    if (doc) {
      try {
        const canvases = (typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('canvas#unity-canvas, canvas#canvas, canvas') : []) || [];
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
            if (cand && typeof cand === 'object' && typeof cand.SendMessage === 'function') {
              return cand;
            }
          }
        }
      } catch (_) {}
    }

    // 4. Sweep window properties for anything with SendMessage
    try {
      const props = Object.getOwnPropertyNames(win);
      for (const prop of props) {
        if (/unity|game|hwa|nexter|module|engine/i.test(prop)) {
          try {
            const val = win[prop];
            if (val && typeof val === 'object' && typeof val.SendMessage === 'function') {
              return val;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 5. Fallback: check if unityInstance or gameInstance exists as an object without SendMessage
    try {
      if (win.unityInstance && typeof win.unityInstance === 'object') return win.unityInstance;
      if (win.gameInstance && typeof win.gameInstance === 'object') return win.gameInstance;
    } catch (_) {}

    return null;
  }

  function reportEngineStatus(reason = 'check') {
    try {
      if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
        const candidate = findActiveUnityInstance(window, typeof document !== 'undefined' ? document : null);
        if (candidate) {
          setUnityInstance(candidate, `scanner-${reason}`);
        }
      }

      const hasSendMessage = typeof activeUnityInstance?.SendMessage === 'function';
      const hasCanvas = typeof document !== 'undefined' && typeof document.querySelector === 'function' && Boolean(document.querySelector('canvas#unity-canvas, canvas#canvas, canvas'));

      let detectedGlobals = [];
      try {
        detectedGlobals = Object.getOwnPropertyNames(window).filter((k) =>
          /unity|game|hwa|nexter|launch|module/i.test(k)
        ).slice(0, 20);
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
      window.postMessage({
        source: 'hwa-helper-api',
        kind: 'engine-status',
        status
      }, location.origin);
    } catch (_) {}
  }

  function setUnityInstance(instance, source = 'detected') {
    if (!instance) return;
    instrumentEngineMethod(instance, 'SendMessage', source);
    if (activeUnityInstance === instance) return;
    if (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function' && typeof instance.SendMessage !== 'function') {
      return;
    }
    activeUnityInstance = instance;
    window.__hwaUnityInstance = instance;
    reportEngineStatus(`instance-${source}`);
  }

  function instrumentEngineMethod(instance, methodName, source) {
    try {
      const original = instance?.[methodName];
      if (typeof original !== 'function' || original.__hwaRecordWrapped) return;
      const wrapped = function (...args) {
        if (recordingActive) {
          const param = args[2];
          window.postMessage({
            source: 'hwa-helper-api', kind: 'interaction-record',
            entry: {
              category: 'engine', action: 'call', timestamp: new Date().toISOString(),
              target: String(source).slice(0, 80), objectName: String(args[0] ?? '').slice(0, 160),
              methodName: String(args[1] ?? methodName).slice(0, 160),
              paramType: typeof param, paramLength: typeof param === 'string' ? param.length : 0
            }
          }, location.origin);
        }
        return original.apply(this, args);
      };
      wrapped.__hwaRecordWrapped = true;
      instance[methodName] = wrapped;
    } catch (_) {
      // Some Unity exports are read-only. Keep the game method unchanged.
    }
  }

  function hookCreateUnityInstance(original) {
    if (typeof original !== 'function' || original.__hwaHooked) return original;
    const hooked = function (canvas, config, onProgress) {
      reportEngineStatus('createUnityInstance-called');
      const res = original.apply(this, arguments);
      if (res && typeof res.then === 'function') {
        return res.then((instance) => {
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
    if (typeof window.createUnityInstance === 'function') {
      window.createUnityInstance = hookCreateUnityInstance(window.createUnityInstance);
    } else {
      let _cui = undefined;
      Object.defineProperty(window, 'createUnityInstance', {
        configurable: true,
        enumerable: true,
        get: () => _cui,
        set: (fn) => {
          _cui = hookCreateUnityInstance(fn);
        }
      });
    }
  } catch (_) {}

  try {
    let _uf = window.unityFramework;
    Object.defineProperty(window, 'unityFramework', {
      configurable: true,
      enumerable: true,
      get: () => _uf,
      set: (fn) => {
        if (typeof fn === 'function' && !fn.__hwaHooked) {
          const origFn = fn;
          _uf = function (mod) {
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
            return origFn.apply(this, arguments);
          };
          _uf.__hwaHooked = true;
        } else {
          _uf = fn;
        }
      }
    });
  } catch (_) {}

  function watchGlobalProperty(propName) {
    try {
      let val = window[propName];
      if (val) {
        if (typeof val === 'function' && propName === 'SendMessage') {
          setUnityInstance({ SendMessage: val.bind(window), _source: 'window.SendMessage' }, 'existing-SendMessage');
        } else if (typeof val === 'object') {
          setUnityInstance(val, `existing-${propName}`);
        }
      }
      Object.defineProperty(window, propName, {
        configurable: true,
        enumerable: true,
        get: () => val,
        set: (newVal) => {
          val = newVal;
          if (typeof newVal === 'function' && propName === 'SendMessage') {
            setUnityInstance({ SendMessage: newVal.bind(window), _source: 'window.SendMessage' }, 'set-SendMessage');
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

  // --- Legend Draft Unity Memory Hook & Candidate Scanner ---
  let lastDraftPayload = null;
  let draftHookScanTimers = [];
  const capturedDraftStrings = [];

  function getWasmMemory() {
    const mod = activeUnityInstance?.Module || window.Module || activeUnityInstance;
    if (!mod) return null;
    let heapU8 = null;
    let heapU32 = null;
    try {
      if (mod.HEAPU8 && mod.HEAPU8.buffer && !mod.HEAPU8.buffer.detached) {
        heapU8 = mod.HEAPU8;
      } else if (mod.wasmMemory?.buffer && !mod.wasmMemory.buffer.detached) {
        heapU8 = new Uint8Array(mod.wasmMemory.buffer);
      }
      if (mod.HEAPU32 && mod.HEAPU32.buffer && !mod.HEAPU32.buffer.detached) {
        heapU32 = mod.HEAPU32;
      } else if (mod.wasmMemory?.buffer && !mod.wasmMemory.buffer.detached) {
        heapU32 = new Uint32Array(mod.wasmMemory.buffer);
      }
    } catch (_) {}
    return { mod, heapU8, heapU32 };
  }

  function findSequenceInHeap(heapU8, targetBytes, maxMatches = 10) {
    if (!heapU8 || !targetBytes || targetBytes.length === 0) return [];
    const len = targetBytes.length;
    const max = heapU8.length - len;
    const first = targetBytes[0];
    const matches = [];
    for (let i = 0; i < max; i++) {
      if (heapU8[i] === first) {
        let match = true;
        for (let j = 1; j < len; j++) {
          if (heapU8[i + j] !== targetBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          matches.push(i);
          if (matches.length >= maxMatches) break;
        }
      }
    }
    return matches;
  }

  function scanCandidateHeroArrays(heapU32, maxResults = 8) {
    if (!heapU32) return [];
    const results = [];
    const len = heapU32.length - 26;
    for (let i = 0; i < len; i++) {
      const candidateCount = heapU32[i];
      if (candidateCount === 25 || candidateCount === 15) {
        let valid = true;
        const heroIds = [];
        for (let j = 1; j <= candidateCount; j++) {
          const val = heapU32[i + j];
          if (val < 1 || val > 150) {
            valid = false;
            break;
          }
          heroIds.push(val);
        }
        if (valid) {
          const chunkSize = candidateCount === 25 ? 5 : 3;
          let distinctInChunks = true;
          for (let c = 0; c < candidateCount; c += chunkSize) {
            const chunk = heroIds.slice(c, c + chunkSize);
            const set = new Set(chunk);
            if (set.size !== chunkSize) {
              distinctInChunks = false;
              break;
            }
          }
          if (distinctInChunks) {
            results.push({
              ptr: i * 4,
              count: candidateCount,
              heroIds
            });
            if (results.length >= maxResults) break;
          }
        }
      }
    }
    return results;
  }

  function instrumentModuleStrings(mod) {
    if (!mod || mod.__hwaStringsHooked) return;
    const origUTF8ToString = mod.UTF8ToString;
    if (typeof origUTF8ToString === 'function') {
      mod.UTF8ToString = function (ptr, maxBytesToRead) {
        const str = origUTF8ToString.apply(this, arguments);
        if (typeof str === 'string' && str.length > 0) {
          if (str.length < 250 && (str.includes('hero') || str.includes('draft') || str.includes('Hero') || str.includes('Draft'))) {
            if (capturedDraftStrings.length > 100) capturedDraftStrings.shift();
            capturedDraftStrings.push({ time: Date.now(), str, ptr });
          }
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

    let cipherOffsets = [];
    if (lastDraftPayload?.draft) {
      try {
        const binStr = atob(lastDraftPayload.draft);
        const rawTargetBytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) rawTargetBytes[i] = binStr.charCodeAt(i);
        if (memory.heapU8) {
          cipherOffsets = findSequenceInHeap(memory.heapU8, rawTargetBytes);
        }
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

    if (topCandidateIds) {
      window.__hwa_legend_draft_candidates = topCandidateIds;
      console.log('[HWA-DRAFT-HOOK][CANDIDATES_DISCOVERED]', {
        count: topCandidateIds.length,
        heroIds: topCandidateIds,
        ptr: detectedPools[0]?.ptr
      });
    }

    try {
      window.postMessage({
        source: 'hwa-helper-api',
        kind: 'legend-draft-hook-result',
        payload: result
      }, location.origin);
    } catch (_) {}

    return result;
  }

  function scheduleLegendDraftScans() {
    draftHookScanTimers.forEach(clearTimeout);
    draftHookScanTimers = [];
    const delays = [100, 300, 700, 1500, 3000];
    for (const delay of delays) {
      const timer = setTimeout(() => {
        const res = runLegendDraftMemoryScan();
        if (res?.topCandidateIds) {
          draftHookScanTimers.forEach(clearTimeout);
          draftHookScanTimers = [];
        }
      }, delay);
      draftHookScanTimers.push(timer);
    }
  }

  function handleLegendDraftRpcResponse(resText) {
    if (!resText || !resText.includes('randomDraft_getInfo')) return;
    try {
      const parsed = JSON.parse(resText);
      const draftObj = parsed?.results?.find((r) => r.ident === 'randomDraft_getInfo' || r.result?.response?.draft)?.result?.response;
      if (draftObj && draftObj.draft) {
        lastDraftPayload = {
          stageId: draftObj.stageId,
          draft: draftObj.draft,
          draftEnemy: draftObj.draftEnemy,
          receivedAt: Date.now()
        };
        console.log('[HWA-DRAFT-HOOK][RECEIVE_DRAFT_RPC]', {
          stageId: draftObj.stageId,
          draftLength: draftObj.draft.length
        });
        scheduleLegendDraftScans();
      }
    } catch (_) {}
  }

  window.__hwaLegendDraftHook = {
    getMemory: getWasmMemory,
    runScan: runLegendDraftMemoryScan,
    getLastPayload: () => lastDraftPayload,
    getCapturedStrings: () => [...capturedDraftStrings],
    findSequenceInHeap,
    scanCandidateHeroArrays,
    handleLegendDraftRpcResponse
  };

  if (typeof setInterval === 'function') {
    let pollAttempts = 0;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      try {
        if (typeof window.createUnityInstance === 'function' && !window.createUnityInstance.__hwaHooked) {
          window.createUnityInstance = hookCreateUnityInstance(window.createUnityInstance);
        }
        if (!activeUnityInstance || typeof activeUnityInstance.SendMessage !== 'function') {
          const candidate = findActiveUnityInstance(window, typeof document !== 'undefined' ? document : null);
          if (candidate) {
            setUnityInstance(candidate, 'startup-poll');
          }
        }
      } catch (_) {}
      if (pollAttempts >= 50 || (activeUnityInstance && typeof activeUnityInstance.SendMessage === 'function')) {
        clearInterval(pollInterval);
      }
    }, 200);
    if (pollInterval && typeof pollInterval.unref === 'function') {
      pollInterval.unref();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => reportEngineStatus('dom-ready'), { once: true });
    }
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => reportEngineStatus('window-load'), { once: true });
  }

  window.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, location.origin);
  reportEngineStatus('initial');

  if (typeof setInterval === 'function') {
    let statusPolls = 0;
    const statusInterval = setInterval(() => {
      statusPolls++;
      const hasCanvas = typeof document !== 'undefined' && typeof document.querySelector === 'function' &&
        Boolean(document.querySelector('canvas#unity-canvas, canvas#canvas, canvas'));
      if (hasCanvas || activeUnityInstance || statusPolls >= 20) {
        reportEngineStatus('canvas-poll');
        if (hasCanvas && activeUnityInstance) {
          clearInterval(statusInterval);
        }
      }
    }, 2000);
  }

  function limit(text) {
    return { text: text.slice(0, MAX_BODY_CHARS), truncated: text.length > MAX_BODY_CHARS };
  }

  function isTextType(type) {
    return !type || /(?:json|text|xml|javascript|x-www-form-urlencoded)/i.test(type);
  }

  async function readStream(stream) {
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
      // Stop inspecting this clone after the preview limit. The game keeps its original stream.
      void reader.cancel().catch(() => {});
      return limit(text);
    } catch (_) {
      return null;
    }
  }

  async function readRequestBody(input, options) {
    try {
      const body = options && Object.hasOwn(options, 'body') ? options.body : undefined;
      if (typeof body === 'string') return limit(body);
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return limit(body.toString());
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        let text = '';
        for (const [key, value] of body) {
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
    } catch (_) {
      // Some request bodies are streams that cannot be cloned or decoded.
    }
    return null;
  }

  async function readFetchResponse(response) {
    try {
      if (!isTextType(response.headers?.get('content-type'))) return null;
      return await readStream(response.clone().body);
    } catch (_) {
      return null;
    }
  }

  function readXhrResponse(xhr) {
    try {
      if (!isTextType(xhr.getResponseHeader?.('content-type'))) return null;
      if (!xhr.responseType || xhr.responseType === 'text') return limit(xhr.responseText);
      if (xhr.responseType === 'json') return limit(JSON.stringify(xhr.response));
    } catch (_) {
      // responseText is unavailable for binary response types.
    }
    return null;
  }

  function record(transport, method, inputUrl, status, durationMs, outcome, bodies = {}) {
    if (!captureEnabled) return;
    try {
      const url = new URL(String(inputUrl), location.href);
      window.postMessage({
        source: 'hwa-helper-api',
        kind: 'api-record',
        record: {
          transport,
          method: String(method || 'GET').toUpperCase(),
          // Query strings and fragments can contain credentials or personal data.
          endpoint: `${url.origin}${url.pathname}`,
          status,
          durationMs: Math.round(durationMs),
          outcome,
          timestamp: new Date().toISOString(),
          ...(String(method).toUpperCase() === 'POST' ? bodies : {})
        }
      }, location.origin);
    } catch (_) {
      // Instrumentation must never interrupt the game.
    }
  }

  function preparePiggyback(url, method, options, source = 'init') {
    for (const [key, expiresAt] of queuedActionExpiry) {
      if (Date.now() >= expiresAt) { queuedRpcCalls.delete(key); queuedActionExpiry.delete(key); }
    }
    if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct' || !queuedRpcCalls.size ||
        String(method).toUpperCase() !== 'POST' || typeof options?.body !== 'string' ||
        typeof Response !== 'function') return null;
    try {
      const target = new URL(String(url), location.href);
      if (`${target.origin}${target.pathname}` !== 'https://api.hero-wars-alliance.com/api/rpc') return null;
      const request = JSON.parse(options.body);
      if (!Array.isArray(request.calls)) return null;
      const existing = new Map(request.calls.map((call) => [
        JSON.stringify({ name: call.name, args: call.args || {},
          ...(call.feature ? { feature: call.feature } : {}) }), call.ident
      ]));
      const appended = [];
      const consumed = [];
      const claimIds = [];
      const hasActions = [...queuedRpcCalls.values()].some((call) =>
        helperActionMethods.has(call.name) || claimActionMethods.has(call.name));
      for (const [key, call] of queuedRpcCalls) {
        if (!existing.has(key) || (hasActions && piggybackMethods.has(call.name))) {
          const ident = Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16) +
            Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16);
          appended.push({ ...call, ident });
          if (queuedClaimKeys.has(key) && claimActionMethods.has(call.name)) claimIds.push(ident);
        } else if (queuedClaimKeys.has(key) && claimActionMethods.has(call.name)) {
          claimIds.push(existing.get(key));
        }
        consumed.push(key);
      }
      const now = Date.now();
      const delayMs = Number.isFinite(lastNudgeAt) && lastNudgeAt > 0 ? Math.max(0, now - lastNudgeAt) : null;
      const nativeNames = request.calls.map((c) => c.name);
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
        if (rpcDispatchMode === 'mqtt-piggyback') window.postMessage({
          source: 'hwa-helper-api',
          kind: 'mqtt-rpc-nudge-status',
          state: 'carrier-attached',
          carrierSource,
          carrierDelayMs: delayMs,
          carrierMethod: nativeNames[0] || 'unknown',
          nudgeType: lastNudgeType,
          trackId: lastNudgeTrackId
        }, location.origin);
      };

      if (!appended.length) {
        for (const key of consumed) {
          queuedRpcCalls.delete(key);
          queuedClaimKeys.delete(key);
          queuedActionExpiry.delete(key);
        }
        if (!queuedClaimKeys.size && claimQueueTimer !== null) {
          clearTimeout(claimQueueTimer);
          claimQueueTimer = null;
        }
        if (claimIds.length) tracePiggyback('piggyback-covered', source);
        reportQueueStatus();
        notifyCarrierAttached();
        return claimIds.length ? { appended, claimIds, options } : null;
      }
      const headers = typeof Headers === 'function' ? new Headers(options.headers || {}) :
        { ...(options.headers || {}) };
      if (typeof headers.delete === 'function') headers.delete('x-auth-signature');
      else for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'x-auth-signature') delete headers[key];
      }
      const prepared = { appended, claimIds, options: { ...options,
        headers, body: JSON.stringify({ ...request, calls: [...request.calls, ...appended] }) } };
      for (const key of consumed) {
        queuedRpcCalls.delete(key);
        queuedClaimKeys.delete(key);
        queuedActionExpiry.delete(key);
      }
      if (!queuedClaimKeys.size && claimQueueTimer !== null) {
        clearTimeout(claimQueueTimer);
        claimQueueTimer = null;
      }
      tracePiggyback('piggyback-attached', `${source}:${appended.length}`);
      console.log('[HWA-TRACK][6a/6 PIGGYBACK_ATTACHED]', {
        time: new Date().toISOString(),
        source,
        carrierSource,
        carrierDelayMs: delayMs,
        nativeCalls: nativeNames,
        appendedCalls: appended.map((c) => c.name),
        totalCalls: request.calls.length + appended.length,
        xAuthSignatureStripped: true
      });
      reportQueueStatus();
      notifyCarrierAttached();
      return prepared;
    } catch (_) {
      return null;
    }
  }

  function restorePiggyback(appended) {
    if (!captureEnabled || !popupRpcEnabled || rpcDispatchMode === 'direct') return;
    for (const { ident, ...call } of appended || []) {
      if (!piggybackMethods.has(call.name)) continue;
      const key = JSON.stringify(call);
      if (!queuedRpcCalls.has(key)) queuedRpcCalls.set(key, call);
    }
    reportQueueStatus();
  }

  if (typeof window.fetch === 'function') {
    const nativeFetch = originalFetch || window.fetch;
    window.fetch = function (...args) {
      const input = args[0];
      const options = args[1];
      const url = typeof input === 'string' || input instanceof URL ? input : input?.url;
      const urlStr = String(url || '');
      if (urlStr.includes('/api/rpc') || urlStr.includes('api.hero-wars-alliance.com')) {
        lastRpcUrl = urlStr;
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('hwa_last_rpc_url', urlStr);
        } catch (_) {}

        // Transparent Monotonic Request ID Guard for native game engine fetch requests
        try {
          let origReqId = null;
          let reqIdKey = null;

          if (options && options.headers) {
            if (typeof options.headers.get === 'function' && typeof options.headers.set === 'function') {
              origReqId = options.headers.get('x-request-id');
              if (origReqId) {
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) {
                  options.headers.set('x-request-id', synced);
                }
              }
            } else if (Array.isArray(options.headers)) {
              const pair = options.headers.find((p) => p && String(p[0]).toLowerCase() === 'x-request-id');
              if (pair) {
                origReqId = pair[1];
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) {
                  pair[1] = synced;
                }
              }
            } else if (typeof options.headers === 'object') {
              reqIdKey = Object.keys(options.headers).find((k) => k.toLowerCase() === 'x-request-id');
              if (reqIdKey) {
                origReqId = options.headers[reqIdKey];
                const synced = syncRequestId(origReqId);
                if (synced !== origReqId) {
                  options.headers[reqIdKey] = synced;
                }
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
                  if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
                  }
                }
              }
              const appVerKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-application-version');
              if (appVerKey && lastRpcHeaders[appVerKey]) {
                const appVer = String(lastRpcHeaders[appVerKey]);
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.setItem('hwa_game_version', appVer);
                }
                window.hwaHelperGameVersion = appVer;
              }
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('hwa_last_rpc_headers', JSON.stringify(lastRpcHeaders));
              }
            }
            reportEngineStatus('rpc-traffic');
          } catch (_) {}
        }
      }
      if (!captureEnabled || isTrackingUrl(url, location.href)) return nativeFetch.apply(this, args);
      const method = options?.method || input?.method || 'GET';
      const isPost = String(method).toUpperCase() === 'POST';
      const dispatch = (piggyback) => {
      if (piggyback) args[1] = piggyback.options;
      const requestBody = isPost ? readRequestBody(input, args[1]) : Promise.resolve(null);
      const started = performance.now();
      try {
        return Promise.resolve(nativeFetch.apply(this, args)).then(
          async (response) => {
            if (!captureEnabled && !piggyback) return response;
            const duration = performance.now() - started;
            if (piggyback) {
              try {
                const fullText = await response.clone().text();
                const full = JSON.parse(fullText);
                if (!response.ok || !Array.isArray(full.results)) throw Error('Piggyback RPC failed');
                console.log('[HWA-TRACK][6b/6 API_RESPONSE_RECEIVED]', {
                  time: new Date().toISOString(),
                  status: response.status,
                  durationMs: Math.round(duration),
                  appendedCalls: piggyback.appended.map((c) => c.name)
                });
                const appendedIds = new Set(piggyback.appended.map((call) => call.ident));
                const extraResults = full.results.filter((item) => appendedIds.has(item.ident));
                if (extraResults.length < piggyback.appended.length) {
                  const receivedIds = new Set(extraResults.map((item) => item.ident));
                  restorePiggyback(piggyback.appended.filter((call) => !receivedIds.has(call.ident)));
                }
                const gameResponse = { ...full,
                  results: full.results.filter((item) => !appendedIds.has(item.ident)) };
                console.log('[HWA-TRACK][6c/6 API_RESPONSE_SPLIT]', {
                  time: new Date().toISOString(),
                  nativeResultsReturnedToGame: gameResponse.results.length,
                  extraResultsForHelper: extraResults.length,
                  helperCalls: piggyback.appended.map((c) => c.name)
                });
                const headers = new Headers(response.headers);
                headers.delete('content-length');
                headers.delete('content-encoding');
                const filtered = new Response(JSON.stringify(gameResponse), {
                  status: response.status, statusText: response.statusText, headers
                });
                for (const property of ['url', 'redirected', 'type']) {
                  try { Object.defineProperty(filtered, property, { value: response[property] }); } catch (_) {}
                }
                record('fetch', method, url, response.status, duration, 'completed', {
                  requestBody: piggyback.options.body, responseBody: fullText
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
                  const ok = piggyback.claimIds.every((ident) => {
                    const result = full.results.find((item) => item.ident === ident);
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
                    const gv = parsed?.results?.find((r) => r.result?.response?.version)?.result?.response?.version;
                    if (gv) {
                      const gvStr = String(gv);
                      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('hwa_game_version', gvStr);
                      window.hwaHelperGameVersion = gvStr;
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
          (error) => {
            if (piggyback) restorePiggyback(piggyback.appended);
            if (piggyback?.claimIds.length) reportClaimResult(false, 'Reward claim RPC failed.');
            const duration = performance.now() - started;
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
        const duration = performance.now() - started;
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
        if (bodyText) return bodyText.then((text) => {
          const extra = text.length <= MAX_BODY_CHARS ? preparePiggyback(url, method, {
            ...(options || {}), body: text,
            headers: options?.headers || input?.headers || {}
          }, 'request') : null;
          return dispatch(extra);
        }, () => {
          tracePiggyback('piggyback-skipped', 'request-body-unreadable');
          return dispatch(null);
        });
      }
      const sourceOptions = options?.body && !options.headers && input?.headers ?
        { ...options, headers: input.headers } : options;
      return dispatch(preparePiggyback(url, method, sourceOptions));
    };
  }

  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr) {
    const originalOpen = xhr.open;
    const originalSetRequestHeader = xhr.setRequestHeader;
    const originalSend = xhr.send;
    const requestInfo = new WeakMap();
    const xhrHeaders = new WeakMap();
    const xhrUrls = new WeakMap();

    if (typeof originalSetRequestHeader === 'function') {
      xhr.setRequestHeader = function (name, value) {
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

    xhr.open = function (method, url, ...rest) {
      const urlStr = String(url || '');
      xhrUrls.set(this, urlStr);
      if (urlStr.includes('/api/rpc') || urlStr.includes('api.hero-wars-alliance.com')) {
        lastRpcUrl = urlStr;
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('hwa_last_rpc_url', urlStr);
        } catch (_) {}
      }
      const result = originalOpen.call(this, method, url, ...rest);
      if (!captureEnabled || isTrackingUrl(url, location.href)) requestInfo.delete(this);
      else requestInfo.set(this, { method, url, outcome: 'completed' });
      return result;
    };

    xhr.send = function (...args) {
      try {
        const urlStr = xhrUrls.get(this) || '';
        if (urlStr.includes('/api/rpc') || urlStr.includes('api.hero-wars-alliance.com')) {
          const headers = xhrHeaders.get(this);
          if (headers && Object.keys(headers).length > 0) {
            lastRpcHeaders = { ...headers };
            const reqIdKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-request-id');
            const reqId = reqIdKey ? lastRpcHeaders[reqIdKey] : null;
            if (reqId) {
              const parsed = parseInt(reqId, 10);
              if (!isNaN(parsed) && parsed > highestRequestId) {
                highestRequestId = parsed;
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.setItem('hwa_highest_request_id', String(highestRequestId));
                }
              }
            }
            const appVerKey = Object.keys(lastRpcHeaders).find((k) => k.toLowerCase() === 'x-application-version');
            if (appVerKey && lastRpcHeaders[appVerKey]) {
              const appVer = String(lastRpcHeaders[appVerKey]);
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('hwa_game_version', appVer);
              }
              window.hwaHelperGameVersion = appVer;
            }
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('hwa_last_rpc_headers', JSON.stringify(lastRpcHeaders));
            }
            reportEngineStatus('rpc-traffic');
          }
        }
      } catch (_) {}
      const info = captureEnabled ? requestInfo.get(this) : null;
      if (info) {
        info.started = performance.now();
        info.requestBody = String(info.method).toUpperCase() === 'POST'
          ? readRequestBody(null, { body: args[0] }) : Promise.resolve(null);
        const markFailed = () => { info.outcome = 'failed'; };
        this.addEventListener('error', markFailed, { once: true });
        this.addEventListener('abort', markFailed, { once: true });
        this.addEventListener('timeout', markFailed, { once: true });
        this.addEventListener('loadend', () => {
          if (!captureEnabled) return;
          const duration = performance.now() - info.started;
          if (String(info.method).toUpperCase() === 'POST') {
            const received = readXhrResponse(this);
            const resText = received?.text ?? null;
            if (resText && resText.includes('randomDraft_getInfo')) {
              handleLegendDraftRpcResponse(resText);
            }
            info.requestBody.then((request) => record('xhr', info.method, info.url,
              this.status || null, duration, info.outcome, {
                requestBody: request?.text ?? null,
                requestBodyTruncated: request?.truncated ?? false,
                responseBody: received?.text ?? null,
                responseBodyTruncated: received?.truncated ?? false
              })).catch(() => record('xhr', info.method, info.url, this.status || null,
              duration, info.outcome));
          } else {
            record('xhr', info.method, info.url, this.status || null, duration, info.outcome);
          }
        }, { once: true });
      }
      try {
        return originalSend.apply(this, args);
      } catch (error) {
        if (info) {
          const duration = performance.now() - info.started;
          if (String(info.method).toUpperCase() === 'POST') {
            info.requestBody.then((request) => record('xhr', info.method, info.url, null,
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
})();
