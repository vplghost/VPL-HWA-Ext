#!/usr/bin/env node
/**
 * Chrome Native Messaging Host & Local Live REPL Bridge for Unity WASM Hook.
 * Communicates with Chrome extension over stdio (binary 32-bit LE uint32 length prefix)
 * and exposes a local HTTP API at http://127.0.0.1:9876 for Antigravity CLI (agy) / curl.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const HTTP_PORT = 9876;
const HTTP_HOST = '127.0.0.1';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(PROJECT_ROOT, '.debug-bridge');
const LOG_FILE = path.join(LOG_DIR, 'unity-hook.jsonl');

// In-memory buffer of recent logs (up to 1000)
const MAX_LOGS = 1000;
const memoryLogs = [];

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  process.stderr.write(`[Host] Failed to create log dir: ${err.message}\n`);
}

// Load existing logs if available
try {
  if (fs.existsSync(LOG_FILE)) {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const recent = lines.slice(-MAX_LOGS);
    for (const line of recent) {
      try {
        memoryLogs.push(JSON.parse(line));
      } catch (_) {}
    }
  }
} catch (_) {}

function appendLog(entry) {
  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs.shift();
  }
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[Host] Failed to write log: ${err.message}\n`);
  }
}

// Native Messaging State
let chromeConnected = false;
let lastSeenTabId = null;
const pendingEvals = new Map(); // id -> { resolve, timer }
const pendingChains = new Map(); // id -> { resolve, timer }
const pendingReloads = new Map(); // id -> { resolve, timer }

function logStderr(msg) {
  process.stderr.write(`[Host ${new Date().toISOString()}] ${msg}\n`);
}

/**
 * Send JSON message to Chrome Native Messaging host via stdout
 */
function sendNativeMessage(msg) {
  if (!process.stdout.writable) {
    logStderr('stdout not writable');
    return false;
  }
  try {
    const jsonStr = JSON.stringify(msg);
    const bodyBuf = Buffer.from(jsonStr, 'utf8');
    const headerBuf = Buffer.alloc(4);
    headerBuf.writeUInt32LE(bodyBuf.length, 0);
    process.stdout.write(headerBuf);
    process.stdout.write(bodyBuf);
    return true;
  } catch (err) {
    logStderr(`Error sending native message: ${err.message}`);
    return false;
  }
}

/**
 * Native Messaging Binary Protocol Reader on process.stdin
 */
let inputBuffer = Buffer.alloc(0);

function handleNativeMessage(message) {
  chromeConnected = true;
  if (!message || typeof message !== 'object') return;

  if (message.tabId) {
    lastSeenTabId = message.tabId;
  }

  // Chrome sends: { type: 'log', tag, data, timestamp, tabId }
  if (message.type === 'log') {
    const entry = {
      timestamp: message.timestamp || new Date().toISOString(),
      tag: message.tag || 'general',
      data: message.data,
      tabId: message.tabId || null
    };
    appendLog(entry);
    return;
  }

  // Chrome sends: { type: 'eval_result', id, ok, result, error, stack }
  if (message.type === 'eval_result' && message.id) {
    const pending = pendingEvals.get(message.id);
    if (pending) {
      pendingEvals.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve({
        ok: message.ok !== false,
        result: message.result,
        error: message.error || null,
        stack: message.stack || null
      });
    }
    return;
  }

  // Chrome sends: { type: 'chain_result', id, ok, results, error }
  if (message.type === 'chain_result' && message.id) {
    const pending = pendingChains.get(message.id);
    if (pending) {
      pendingChains.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);
      appendLog({
        timestamp: new Date().toISOString(),
        tag: 'chain-execution',
        data: {
          chainId: message.id,
          ok: message.ok,
          stepCount: Array.isArray(message.results) ? message.results.length : 0,
          error: message.error || null,
        },
      });
      pending.resolve({
        ok: message.ok !== false,
        results: message.results || [],
        error: message.error || null,
      });
    }
    return;
  }

  // Chrome sends: { type: 'reload_result', id, ok, tabId, error }
  if (message.type === 'reload_result' && message.id) {
    const pending = pendingReloads.get(message.id);
    if (pending) {
      pendingReloads.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve({
        ok: message.ok !== false,
        tabId: message.tabId || lastSeenTabId,
        error: message.error || null
      });
    }
    return;
  }

  // Chrome sends heartbeat / tab status
  if (message.type === 'ping' || message.type === 'tab_ready') {
    chromeConnected = true;
    if (message.tabId) lastSeenTabId = message.tabId;
  }
}

if (!process.stdin.isTTY) {
  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);

    while (inputBuffer.length >= 4) {
      const msgLen = inputBuffer.readUInt32LE(0);
      if (inputBuffer.length < 4 + msgLen) {
        break; // Wait for full message
      }

      const msgBuf = inputBuffer.subarray(4, 4 + msgLen);
      inputBuffer = inputBuffer.subarray(4 + msgLen);

      try {
        const text = msgBuf.toString('utf8');
        const parsed = JSON.parse(text);
        handleNativeMessage(parsed);
      } catch (err) {
        logStderr(`Failed to parse native message: ${err.message}`);
      }
    }
  });

  process.stdin.on('end', () => {
    logStderr('Chrome native pipe closed (stdin end). Exiting.');
    chromeConnected = false;
    process.exit(0);
  });

  process.stdin.on('close', () => {
    logStderr('Chrome native pipe closed (stdin close). Exiting.');
    chromeConnected = false;
    process.exit(0);
  });

  process.stdin.on('error', (err) => {
    logStderr(`stdin error: ${err.message}`);
  });
} else {
  logStderr('Running in standalone TTY mode (no Chrome stdin pipe). HTTP server active.');
}

/**
 * Local HTTP API Server
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;

  // GET /health (fast read-only Unity WASM probe)
  if (req.method === 'GET' && pathname === '/health') {
    const startedAt = Date.now();
    if (!chromeConnected && !process.stdin.isTTY) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        chromeConnected: false,
        tabId: lastSeenTabId,
        unityReady: false,
        error: 'No active Chrome extension connected via Native Messaging.',
        latencyMs: Date.now() - startedAt
      }, null, 2));
      return;
    }

    const evalId = `health_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timeoutMs = 4000;
    const healthCode = `(() => {
      const inst = window.__hwaUnityInstance || window.unityInstance || window.gameInstance;
      const mod = inst?.Module || window.__hwaUnityModule || window.unityFramework?.Module || inst;
      const asm = mod?.asm || mod;
      const vals = asm ? Object.values(asm) : [];
      const mem = vals.find((v) => v instanceof WebAssembly.Memory) || mod?.wasmMemory;
      const tbl = vals.find((v) => v instanceof WebAssembly.Table) || mod?.wasmTable;
      return {
        unityReady: Boolean(inst && mem?.buffer && tbl),
        wasmMemoryMb: mem?.buffer ? Math.round(mem.buffer.byteLength / (1024 * 1024)) : 0,
        wasmTableSize: tbl ? tbl.length : 0,
        hasSimulateBattle: typeof window.__hwaSimulateBattle === 'function',
        hasSafeMem: Boolean(window.__unityBridge?.safeMem),
        gameVersion: window.hwaHelperGameVersion || null
      };
    })()`;

    const evalPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingEvals.delete(evalId);
        resolve({ ok: false, error: `Health probe timed out after ${timeoutMs}ms` });
      }, timeoutMs);
      pendingEvals.set(evalId, { resolve, timer });
    });

    const sent = sendNativeMessage({ type: 'eval', id: evalId, payload: { code: healthCode, timeoutMs } });
    if (!sent && !process.stdin.isTTY) {
      const p = pendingEvals.get(evalId);
      if (p?.timer) clearTimeout(p.timer);
      pendingEvals.delete(evalId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, chromeConnected, unityReady: false, error: 'Failed to write to Native Messaging pipe.' }));
      return;
    }

    evalPromise.then((probe) => {
      const data = (probe && probe.ok && probe.result && typeof probe.result === 'object') ? probe.result : {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: Boolean(probe?.ok && data.unityReady),
        chromeConnected,
        tabId: lastSeenTabId,
        unityReady: Boolean(data.unityReady),
        wasmMemoryMb: data.wasmMemoryMb || 0,
        wasmTableSize: data.wasmTableSize || 0,
        hasSimulateBattle: Boolean(data.hasSimulateBattle),
        hasSafeMem: Boolean(data.hasSafeMem),
        gameVersion: data.gameVersion || null,
        error: probe?.ok ? null : (probe?.error || 'Unity not ready'),
        latencyMs: Date.now() - startedAt
      }, null, 2));
    });
    return;
  }

  // POST /reload-tab (reloads the active Hero Wars game tab)
  if (req.method === 'POST' && pathname === '/reload-tab') {
    if (!chromeConnected && !process.stdin.isTTY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No active Chrome extension connected via Native Messaging.' }));
      return;
    }
    const reloadId = `reload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timeoutMs = 8000;
    const reloadPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingReloads.delete(reloadId);
        resolve({ ok: false, error: `Timeout waiting for reload_tab acknowledgement after ${timeoutMs}ms.` });
      }, timeoutMs);
      pendingReloads.set(reloadId, { resolve, timer });
    });

    const sent = sendNativeMessage({ type: 'reload_tab', id: reloadId });
    if (!sent && !process.stdin.isTTY) {
      const p = pendingReloads.get(reloadId);
      if (p?.timer) clearTimeout(p.timer);
      pendingReloads.delete(reloadId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Failed to write reload_tab to Native Messaging pipe.' }));
      return;
    }

    reloadPromise.then((result) => {
      res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    });
    return;
  }

  // GET /status
  if (req.method === 'GET' && (pathname === '/status' || pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'wxt-unity-debug-bridge',
      chromeConnected,
      lastSeenTabId,
      memoryLogCount: memoryLogs.length,
      uptimeSeconds: Math.floor(process.uptime()),
      logFile: LOG_FILE
    }, null, 2));
    return;
  }

  // GET /logs?limit=50
  if (req.method === 'GET' && pathname === '/logs') {
    const limitParam = parsedUrl.searchParams.get('limit') || parsedUrl.searchParams.get('n');
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 1000);
    const logs = memoryLogs.slice(-limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      count: logs.length,
      totalInMemory: memoryLogs.length,
      logs
    }, null, 2));
    return;
  }

  // DELETE /logs (clear logs)
  if (req.method === 'DELETE' && pathname === '/logs') {
    memoryLogs.length = 0;
    try {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Logs cleared' }));
    return;
  }

  // POST /eval
  if (req.method === 'POST' && pathname === '/eval') {
    let bodyText = '';
    req.on('data', (c) => { bodyText += c; });
    req.on('end', () => {
      let body = {};
      try {
        if (bodyText.trim()) {
          body = JSON.parse(bodyText);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `Invalid JSON body: ${err.message}` }));
        return;
      }

      if (!chromeConnected && !process.stdin.isTTY) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: 'No active Chrome extension connected via Native Messaging.'
        }));
        return;
      }

      const evalId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : 10000;

      const evalPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingEvals.delete(evalId);
          resolve({
            ok: false,
            error: `Timeout waiting for tab execution response after ${timeoutMs}ms.`
          });
        }, timeoutMs);

        pendingEvals.set(evalId, { resolve, timer });
      });

      const sent = sendNativeMessage({
        type: 'eval',
        id: evalId,
        payload: body
      });

      if (!sent && !process.stdin.isTTY) {
        const pending = pendingEvals.get(evalId);
        if (pending?.timer) clearTimeout(pending.timer);
        pendingEvals.delete(evalId);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Failed to write message to Chrome Native Messaging pipe.' }));
        return;
      }

      evalPromise.then((result) => {
        const statusCode = result.ok ? 200 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      });
    });
    return;
  }

  // POST /chain
  if (req.method === 'POST' && pathname === '/chain') {
    let bodyText = '';
    req.on('data', (c) => { bodyText += c; });
    req.on('end', () => {
      let body = {};
      try {
        if (bodyText.trim()) {
          body = JSON.parse(bodyText);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `Invalid JSON body: ${err.message}` }));
        return;
      }

      if (!chromeConnected && !process.stdin.isTTY) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: 'No active Chrome extension connected via Native Messaging.'
        }));
        return;
      }

      const chainId = `chain_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : 15000;

      const chainPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingChains.delete(chainId);
          resolve({
            ok: false,
            results: [],
            error: `Timeout waiting for chain execution response after ${timeoutMs}ms.`
          });
        }, timeoutMs);

        pendingChains.set(chainId, { resolve, timer });
      });

      const sent = sendNativeMessage({
        type: 'chain',
        id: chainId,
        payload: body
      });

      if (!sent && !process.stdin.isTTY) {
        const pending = pendingChains.get(chainId);
        if (pending?.timer) clearTimeout(pending.timer);
        pendingChains.delete(chainId);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Failed to write message to Chrome Native Messaging pipe.' }));
        return;
      }

      chainPromise.then((result) => {
        const statusCode = result.ok ? 200 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logStderr(`Port ${HTTP_PORT} already in use. Local API might already be running.`);
  } else {
    logStderr(`HTTP Server error: ${err.message}`);
  }
});

server.listen(HTTP_PORT, HTTP_HOST, () => {
  logStderr(`Native Host HTTP server listening on http://${HTTP_HOST}:${HTTP_PORT}`);
});
