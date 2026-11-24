const http = require('http');

const DEFAULT_TIMEOUT_MS = 15000;

function request(method, endpoint, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 9876,
        path: endpoint,
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            resolve(data);
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP ${method} ${endpoint} timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('Live Debug Bridge host is not running on 127.0.0.1:9876 (open Chrome with unpacked .output/chrome-mv3 extension).'));
      } else {
        reject(err);
      }
    });

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function post(endpoint, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return request('POST', endpoint, body, timeoutMs);
}

function get(endpoint, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return request('GET', endpoint, undefined, timeoutMs);
}

async function checkHealth(timeoutMs = 6000) {
  return get('/health', timeoutMs);
}

async function reloadTab(waitMs = 45000) {
  const res = await post('/reload-tab', {}, 10000);
  if (!res || !res.ok) return res;
  if (waitMs <= 0) return res;

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const h = await checkHealth(5000);
      if (h && h.ok && h.unityReady) {
        return { ...res, recovered: true, health: h };
      }
    } catch (_) {}
  }
  return { ...res, recovered: false, error: `Unity did not become ready within ${waitMs}ms after reload.` };
}

async function evalInGame(code, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return post('/eval', { code, timeoutMs }, timeoutMs + 2000);
}

async function runChain(steps, timeoutMs = 20000) {
  return post('/chain', { steps, timeoutMs }, timeoutMs + 2000);
}

module.exports = { post, get, checkHealth, reloadTab, evalInGame, runChain };

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'health';

  const getFlagNum = (flag, fallback) => {
    const idx = args.indexOf(flag);
    if (idx >= 0 && args[idx + 1]) {
      const n = Number(args[idx + 1]);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  (async () => {
    if (cmd === 'health') {
      const res = await checkHealth(getFlagNum('--timeout-ms', 6000));
      console.log(JSON.stringify(res, null, 2));
      process.exit(res && res.ok ? 0 : 1);
    } else if (cmd === 'reload-tab') {
      const res = await reloadTab(getFlagNum('--wait-ms', 45000));
      console.log(JSON.stringify(res, null, 2));
      process.exit(res && res.ok && res.recovered !== false ? 0 : 1);
    } else if (cmd === 'eval') {
      const code = args[1] || 'document.title';
      const res = await evalInGame(code, getFlagNum('--timeout-ms', DEFAULT_TIMEOUT_MS));
      console.log(JSON.stringify(res, null, 2));
      process.exit(res && res.ok ? 0 : 1);
    } else {
      // Backwards-compatible shorthand: `node bridge-cli.js "<js-expression>"`
      const res = await evalInGame(cmd, getFlagNum('--timeout-ms', DEFAULT_TIMEOUT_MS));
      console.log(JSON.stringify(res, null, 2));
      process.exit(res && res.ok ? 0 : 1);
    }
  })().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
    process.exit(1);
  });
}
