(() => {
  const flag = Symbol.for('hwa-helper-api-intercept-installed');
  if (window[flag]) return;
  window[flag] = true;
  const MAX_BODY_CHARS = 512 * 1024;
  const isTrackingUrl = globalThis.hwaHelperIsTrackingUrl;
  let captureEnabled = false;
  let lastRpcUrl = null;
  let lastRpcHeaders = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled === true;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'refresh-rpc') {
      const calls = event.data.calls;
      const url = lastRpcUrl || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hwa_last_rpc_url') : null) || 'https://api.hero-wars-alliance.com/api/rpc';
      if (!url || !Array.isArray(calls) || calls.length === 0) return;
      const randHex = () => Math.random().toString(16).slice(2).padStart(16, '0').slice(0, 16);
      const payload = {
        calls: calls.map((c) => ({
          name: typeof c === 'string' ? c : c.name,
          args: (typeof c === 'object' && c.args) ? c.args : {},
          ident: randHex() + randHex(),
          ...(typeof c === 'object' && c.feature ? { feature: c.feature } : {})
        }))
      };
      const headers = { 'content-type': 'application/json', ...(lastRpcHeaders || {}) };
      try {
        (window.fetch || originalFetch)(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (_) {}
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'draft-action') {
      const { action, heroes } = event.data;
      if (!lastRpcUrl || !Array.isArray(heroes) || heroes.length === 0) return;
      const callName = action === 'saveDefence' ? 'randomDraft_saveDefence' : 'randomDraft_saveAttack';
      const randHex = () => Math.random().toString(16).slice(2).padStart(16, '0').slice(0, 16);
      const ident1 = randHex() + randHex();
      const ident2 = randHex() + randHex();
      const payload = {
        calls: [
          { name: callName, args: { heroes }, ident: ident1 },
          { name: 'randomDraft_getInfo', args: {}, ident: ident2 }
        ]
      };
      const headers = { 'content-type': 'application/json', ...(lastRpcHeaders || {}) };
      try {
        (window.fetch || originalFetch)(lastRpcUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (_) {}
    }
  });
  window.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, location.origin);

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

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
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
        if (options?.headers) {
          try {
            if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
              lastRpcHeaders = Object.fromEntries(options.headers.entries());
            } else if (typeof options.headers === 'object') {
              lastRpcHeaders = { ...options.headers };
            }
          } catch (_) {}
        }
      }
      if (!captureEnabled || isTrackingUrl(url, location.href)) return originalFetch.apply(this, args);
      const method = options?.method || input?.method || 'GET';
      const isPost = String(method).toUpperCase() === 'POST';
      const requestBody = isPost ? readRequestBody(input, options) : Promise.resolve(null);
      const started = performance.now();
      try {
        return Promise.resolve(originalFetch.apply(this, args)).then(
          (response) => {
            if (!captureEnabled) return response;
            const duration = performance.now() - started;
            if (isPost) {
              Promise.all([requestBody, readFetchResponse(response)]).then(([request, received]) => {
                record('fetch', method, url, response.status, duration, 'completed', {
                  requestBody: request?.text ?? null,
                  requestBodyTruncated: request?.truncated ?? false,
                  responseBody: received?.text ?? null,
                  responseBodyTruncated: received?.truncated ?? false
                });
              }).catch(() => record('fetch', method, url, response.status, duration, 'completed'));
            } else {
              record('fetch', method, url, response.status, duration, 'completed');
            }
            return response;
          },
          (error) => {
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
  }

  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr) {
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const requestInfo = new WeakMap();

    xhr.open = function (method, url, ...rest) {
      const result = originalOpen.call(this, method, url, ...rest);
      if (!captureEnabled || isTrackingUrl(url, location.href)) requestInfo.delete(this);
      else requestInfo.set(this, { method, url, outcome: 'completed' });
      return result;
    };

    xhr.send = function (...args) {
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
