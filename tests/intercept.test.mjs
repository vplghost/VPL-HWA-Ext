import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/intercept.js', import.meta.url), 'utf8');
const filterSource = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');

function setup(fetchImplementation, enable = true, extraContext = {}) {
  const messages = [];
  const claimResults = [];
  const interactions = [];
  const queueCounts = [];
  const listeners = [];
  let now = 0;
  class FakeXHR {
    listeners = new Map();
    status = 204;
    responseText = '{"ok":true}';
    responseType = '';
    addEventListener(name, handler) {
      const handlers = this.listeners.get(name) ?? [];
      handlers.push(handler);
      this.listeners.set(name, handlers);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this[name] = value; }
    send() { this.emit('loadend'); return undefined; }
    emit(name) { for (const handler of this.listeners.get(name) ?? []) handler(); }
  }
  const storage = {};
  const sessionStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  const window = {
    fetch: fetchImplementation,
    XMLHttpRequest: FakeXHR,
    sessionStorage,
    addEventListener: (name, handler) => { if (name === 'message') listeners.push(handler); },
    postMessage: (data, targetOrigin) => {
      if (data.kind === 'api-record') messages.push({ data, targetOrigin });
      if (data.kind === 'claim-rpc-result') claimResults.push(data);
      if (data.kind === 'interaction-record') interactions.push(data.entry);
      if (data.kind === 'rpc-queue-status') queueCounts.push(data.count);
      for (const handler of listeners) handler({ source: window, origin: targetOrigin, data });
    },
    ...extraContext.window
  };
  const context = {
    window, URL, Date, Promise, Symbol, WeakMap, TextDecoder, URLSearchParams, FormData, Blob, sessionStorage,
    location: { href: 'https://www.hero-wars-alliance.com/', origin: 'https://www.hero-wars-alliance.com' },
    performance: { now: () => ++now },
    ...extraContext
  };
  context.window = window;
  runInNewContext(`${filterSource}\n${source}`, context);
  if (enable) window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true,
    popupRpcEnabled: true },
    'https://www.hero-wars-alliance.com');
  return { window, messages, claimResults, interactions, sessionStorage, queueCounts };
}

async function waitForMessage(messages) {
  for (let attempt = 0; attempt < 20 && messages.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(messages.length > 0, 'expected an API record');
}

test('POST fetch preserves response and stores request/response text', async () => {
  const response = new Response('{"hero":1}', { status: 200, headers: { 'content-type': 'application/json' } });
  const { window, messages } = setup(async () => response);
  assert.equal(await window.fetch('/api/heroes?token=secret#fragment', {
    method: 'POST', body: '{"id":1}'
  }), response);
  await waitForMessage(messages);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].targetOrigin, 'https://www.hero-wars-alliance.com');
  assert.equal(messages[0].data.record.endpoint, 'https://www.hero-wars-alliance.com/api/heroes');
  assert.equal(messages[0].data.record.method, 'POST');
  assert.equal(messages[0].data.record.status, 200);
  assert.equal(messages[0].data.record.durationMs, 1);
  assert.equal(messages[0].data.record.requestBody, '{"id":1}');
  assert.equal(messages[0].data.record.responseBody, '{"hero":1}');
  assert.equal(await response.text(), '{"hero":1}');
});

test('tracking fetch bypasses interception while game RPC is recorded', async () => {
  let calls = 0;
  const { window, messages } = setup(async () => { calls++; return new Response('ok'); });
  await window.fetch('https://analytics.nextersglobal.com/analytics/event/gamebeat', {
    method: 'POST', body: '{}'
  });
  assert.equal(calls, 1);
  assert.equal(messages.length, 0);
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', { method: 'POST', body: '{}' });
  await waitForMessage(messages);
  assert.equal(messages.length, 1);
});

test('intercept off bypasses request capture and resumes on next request', async () => {
  let calls = 0;
  const { window, messages } = setup(async () => { calls++; return new Response('ok'); });
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: false },
    'https://www.hero-wars-alliance.com');
  await window.fetch('/api/rpc', { method: 'POST', body: '{}' });
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/api/rpc');
  xhr.send('{}');
  assert.equal(messages.length, 0);
  assert.equal(calls, 1);
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true },
    'https://www.hero-wars-alliance.com');
  await window.fetch('/api/rpc', { method: 'GET' });
  await waitForMessage(messages);
  assert.equal(messages.length, 1);
});

test('capture waits for saved settings and drops in-flight result after switch off', async () => {
  let resolveFetch;
  const { window, messages } = setup(() => new Promise((resolve) => { resolveFetch = resolve; }), false);
  const beforeSettings = window.fetch('/api/rpc');
  resolveFetch(new Response('before'));
  await beforeSettings;
  assert.equal(messages.length, 0);
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true },
    'https://www.hero-wars-alliance.com');
  const inFlight = window.fetch('/api/rpc');
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: false },
    'https://www.hero-wars-alliance.com');
  resolveFetch(new Response('after'));
  assert.equal(await (await inFlight).text(), 'after');
  assert.equal(messages.length, 0);
});

test('fetch failure remains a rejection and is recorded', async () => {
  const failure = new Error('network');
  const { window, messages } = setup(() => Promise.reject(failure));
  await assert.rejects(window.fetch('/api/fail'), failure);
  await waitForMessage(messages);
  assert.equal(messages[0].data.record.outcome, 'failed');
  assert.equal(messages[0].data.record.status, null);
});

test('GET fetch keeps metadata without body', async () => {
  const { window, messages } = setup(async () => new Response('secret'));
  await window.fetch('/api/get');
  await waitForMessage(messages);
  assert.equal('responseBody' in messages[0].data.record, false);
});

test('POST fetch marks long bodies as truncated', async () => {
  const { window, messages } = setup(async () => new Response('b'.repeat(530000), {
    headers: { 'content-type': 'text/plain' }
  }));
  await window.fetch('/api/post', { method: 'POST', body: 'a'.repeat(530000) });
  await waitForMessage(messages);
  assert.equal(messages[0].data.record.requestBody.length, 524288);
  assert.equal(messages[0].data.record.responseBody.length, 524288);
  assert.equal(messages[0].data.record.requestBodyTruncated, true);
  assert.equal(messages[0].data.record.responseBodyTruncated, true);
});

test('POST fetch retains an RPC-sized JSON response in full', async () => {
  const body = JSON.stringify({ data: 'x'.repeat(325000) });
  const { window, messages } = setup(async () => new Response(body, {
    headers: { 'content-type': 'application/json' }
  }));
  await window.fetch('/api/rpc', { method: 'POST', body: '{"calls":[]}' });
  await waitForMessage(messages);
  assert.equal(messages[0].data.record.responseBody, body);
  assert.equal(messages[0].data.record.responseBodyTruncated, false);
});

test('POST fetch reads a Request clone without consuming the game request', async () => {
  let gameBody;
  const { window, messages } = setup(async (request) => {
    gameBody = await request.text();
    return new Response('accepted', { headers: { 'content-type': 'text/plain' } });
  });
  const request = new Request('https://www.hero-wars-alliance.com/api/request', {
    method: 'POST', body: '{"unit":2}'
  });
  await window.fetch(request);
  await waitForMessage(messages);
  assert.equal(gameBody, '{"unit":2}');
  assert.equal(messages[0].data.record.requestBody, '{"unit":2}');
  assert.equal(messages[0].data.record.responseBody, 'accepted');
});

test('XHR logs status and endpoint after loadend', () => {
  const { window, messages } = setup(async () => ({ status: 200 }));
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', '/api/inventory?user=123');
  xhr.send();
  assert.equal(messages[0].data.record.transport, 'xhr');
  assert.equal(messages[0].data.record.status, 204);
  assert.equal(messages[0].data.record.endpoint, 'https://www.hero-wars-alliance.com/api/inventory');
});

test('POST XHR captures text response after loadend', async () => {
  const { window, messages } = setup(async () => ({ status: 200 }));
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/api/save');
  xhr.send('{"save":1}');
  await waitForMessage(messages);
  assert.equal(messages[0].data.record.requestBody, '{"save":1}');
  assert.equal(messages[0].data.record.responseBody, '{"ok":true}');
});

test('tracking XHR is not recorded', () => {
  const { window, messages } = setup(async () => ({ status: 200 }));
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://wa.appsflyersdk.com/events');
  xhr.send('{}');
  assert.equal(messages.length, 0);
});

test('fetch captures RPC url and headers into sessionStorage and refresh-rpc sends them', async () => {
  let refreshSent = null;
  const { window, sessionStorage } = setup(async (url, opts) => {
    if (opts?.body?.includes('userGetInfo')) {
      refreshSent = { url, opts };
    }
    return new Response('ok');
  });

  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST',
    headers: {
      'x-auth-user-id': '12345',
      'x-auth-session-id': 'abc-session'
    },
    body: '{"calls":[]}'
  });

  assert.equal(sessionStorage.getItem('hwa_last_rpc_url'), 'https://api.hero-wars-alliance.com/api/rpc');
  const storedHeaders = JSON.parse(sessionStorage.getItem('hwa_last_rpc_headers'));
  assert.equal(storedHeaders['x-auth-user-id'], '12345');
  assert.equal(storedHeaders['x-auth-session-id'], 'abc-session');

  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'refresh-rpc',
    calls: ['userGetInfo']
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(refreshSent);
  assert.equal(refreshSent.opts.headers['x-auth-user-id'], '12345');
  assert.equal(refreshSent.opts.headers['x-auth-session-id'], 'abc-session');
});

test('piggyback queues read-only calls for the next game RPC and hides their results from game', async () => {
  const sent = [];
  const { window, messages } = setup(async (url, options) => {
    const request = JSON.parse(options.body);
    sent.push({ url, options, request });
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: { response: { name: call.name } }
    })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers });

  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls: [
    { name: 'randomDraft_getInfo' },
    { name: 'getMarches', feature: 'march' },
    { name: 'randomDraft_getInfo' }
  ] }, 'https://www.hero-wars-alliance.com');
  assert.equal(sent.length, 0);
  const gameRequest = { calls: [{ name: 'userGetInfo', ident: 'game-1', args: {} }] };
  const response = await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', headers: { 'x-request-id': '42', 'x-auth-signature': 'old' },
    body: JSON.stringify(gameRequest)
  });
  assert.deepEqual(JSON.parse(await response.text()).results.map((item) => item.ident),
    ['game-1']);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].request.calls.map((call) => call.name),
    ['userGetInfo', 'randomDraft_getInfo', 'getMarches']);
  assert.equal(sent[0].options.headers.get('x-request-id'), '42');
  assert.equal(sent[0].options.headers.has('x-auth-signature'), false);
  assert.equal(messages.length, 1);
  const captured = messages[0].data.record;
  assert.equal(JSON.parse(captured.requestBody).calls.length, 3);
  assert.equal(JSON.parse(captured.responseBody).results.length, 3);

  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(gameRequest)
  });
  assert.equal(sent[1].request.calls.length, 1, 'queued refresh is consumed once');
});

test('piggyback retries after a failed RPC and records added results from a large response', async () => {
  let attempts = 0;
  const { window, messages } = setup(async (_url, options) => {
    attempts++;
    if (attempts === 1) return new Response('{"error":"temporary"}', { status: 503 });
    const request = JSON.parse(options.body);
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: { response: { name: call.name } }
    })), padding: 'x'.repeat(530000) }), { status: 200,
      headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers });
  const original = { calls: [{ name: 'userGetInfo', ident: 'game-1', args: {} }] };
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc',
    calls: [{ name: 'randomDraft_getInfo' }] }, 'https://www.hero-wars-alliance.com');
  const first = await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(original)
  });
  assert.equal(first.status, 503);
  const second = await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(original)
  });
  assert.equal(JSON.parse(await second.text()).results.length, 1);
  assert.equal(attempts, 2);
  assert.equal(messages.length, 3);
  const targeted = messages.at(-1).data.record;
  assert.deepEqual(JSON.parse(targeted.requestBody).calls.map((call) => call.name),
    ['randomDraft_getInfo']);
  assert.equal(JSON.parse(targeted.responseBody).results.length, 1);
});

test('queued reward claim runs once in game RPC and reports actual result', async () => {
  let networkCalls = 0;
  const { window, claimResults, messages } = setup(async (_url, options) => {
    networkCalls++;
    const request = JSON.parse(options.body);
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: { response: [] }
    })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers });
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-claim', calls: [
    { name: 'mailFarm', args: { letterIds: [501] } },
    { name: 'mailGetAll', args: {} }
  ] }, 'https://www.hero-wars-alliance.com');
  assert.equal(networkCalls, 0);
  assert.equal(claimResults.length, 0);
  const gameRequest = { calls: [{ name: 'userGetInfo', args: {}, ident: 'game-1' }] };
  const response = await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(gameRequest)
  });
  assert.equal(networkCalls, 1);
  assert.equal(JSON.parse(await response.text()).results.length, 1);
  assert.deepEqual(JSON.parse(messages[0].data.record.requestBody).calls.map((call) => call.name),
    ['userGetInfo', 'mailFarm', 'mailGetAll']);
  assert.equal(claimResults.length, 1);
  assert.equal(claimResults[0].ok, true);
});

test('piggyback appends claims when game fetch uses a Request object', async () => {
  let sentCalls;
  const { window, claimResults, messages, interactions } = setup(async (input, options) => {
    const request = new Request(input, options);
    const payload = JSON.parse(await request.text());
    sentCalls = payload.calls;
    return new Response(JSON.stringify({ results: payload.calls.map((call) => ({
      ident: call.ident, result: { response: [] }
    })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, true, { Request, Response, Headers });
  window.postMessage({ source: 'hwa-helper-config', kind: 'control',
    interceptEnabled: true, popupRpcEnabled: true, recordingActive: true,
    socketRefreshMode: 'piggyback' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-claim', calls: [
    { name: 'mailFarm', args: { letterIds: [501] } }
  ] }, 'https://www.hero-wars-alliance.com');
  const request = new Request('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json',
      'x-auth-signature': 'body-bound' },
    body: '{"calls":[{"name":"userGetInfo","ident":"game-1"}]}'
  });
  const response = await window.fetch(request);
  assert.deepEqual(sentCalls.map((call) => call.name), ['userGetInfo', 'mailFarm']);
  assert.equal(JSON.parse(await response.text()).results.length, 1);
  assert.equal(claimResults[0].ok, true);
  assert.equal(JSON.parse(messages[0].data.record.requestBody).calls.length, 2);
  assert.deepEqual(interactions.map((item) => item.action),
    ['piggyback-queued', 'piggyback-attached', 'piggyback-claim-ok']);
});

test('piggyback appends refresh when game sends JSON in a Blob body', async () => {
  let names;
  const { window } = setup(async (_url, options) => {
    const payload = JSON.parse(options.body);
    names = payload.calls.map((call) => call.name);
    return new Response(JSON.stringify({ results: payload.calls.map((call) => ({
      ident: call.ident, result: { response: {} }
    })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers });
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc',
    calls: [{ name: 'randomDraft_getInfo' }] }, 'https://www.hero-wars-alliance.com');
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: new Blob([
      '{"calls":[{"name":"userGetInfo","ident":"game-1"}]}'
    ], { type: 'application/json' })
  });
  assert.deepEqual(names, ['userGetInfo', 'randomDraft_getInfo']);
});

test('failed piggyback claim reports failure without retrying action', async () => {
  const sent = [];
  const { window, claimResults } = setup(async (_url, options) => {
    const request = JSON.parse(options.body);
    sent.push(request.calls.map((call) => call.name));
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: call.name === 'mailFarm' ?
        { error: 'claim failed' } : { response: [] }
    })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers });
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-claim', calls: [
    { name: 'mailFarm', args: { letterIds: [501] } }
  ] }, 'https://www.hero-wars-alliance.com');
  const original = { calls: [{ name: 'userGetInfo', args: {}, ident: 'game-1' }] };
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(original)
  });
  assert.equal(claimResults[0].ok, false);
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify(original)
  });
  assert.deepEqual(sent[1], ['userGetInfo']);
});

test('queued claim expires when no game RPC arrives', async () => {
  let expire;
  const sent = [];
  const { window, claimResults } = setup(async (_url, options) => {
    sent.push(JSON.parse(options.body).calls.map((call) => call.name));
    return new Response('{"results":[]}', { status: 200,
      headers: { 'content-type': 'application/json' } });
  }, true, { Response, Headers,
    setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout: () => {} });
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-claim', calls: [
    { name: 'mailFarm', args: { letterIds: [501] } }
  ] }, 'https://www.hero-wars-alliance.com');
  expire();
  assert.equal(claimResults[0].ok, false);
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: '{"calls":[{"name":"userGetInfo","ident":"game-1"}]}'
  });
  assert.deepEqual(sent[0], ['userGetInfo']);
});

test('queue count tracks deduplication, expiry, dispatch and settings cancellation', async () => {
  let now = 1000; let expire;
  class Clock extends Date { static now() { return now; } }
  const { window, queueCounts } = setup(async (_url, options) => {
    const request = JSON.parse(options.body);
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: { response: {} }
    })) }), { status: 200 });
  }, true, { Response, Headers, Date: Clock, setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout: () => {} });
  const origin = 'https://www.hero-wars-alliance.com';
  const enqueue = (calls) => window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls }, origin);
  assert.equal(queueCounts.at(-1), 0);
  enqueue([{ name: 'inventoryGet' }, { name: 'inventoryGet' }]);
  assert.equal(queueCounts.at(-1), 1);
  enqueue([{ name: 'attackMine', feature: 'mine', args: { mineId: 'mine' } }]);
  assert.equal(queueCounts.at(-1), 2);
  now += 120001; expire();
  assert.equal(queueCounts.at(-1), 1);
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: '{"calls":[{"name":"userGetInfo","ident":"native"}]}'
  });
  assert.equal(queueCounts.at(-1), 0);
  enqueue([{ name: 'inventoryGet' }]);
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: false }, origin);
  assert.equal(queueCounts.at(-1), 0);
});

test('legacy direct messages and Draft submissions piggyback by default with action results hidden', async () => {
  const batches = [];
  const { window } = setup(async (_url, options) => {
    const request = JSON.parse(options.body); batches.push(request.calls);
    return new Response(JSON.stringify({ results: request.calls.map((call) => ({
      ident: call.ident, result: { response: {} }
    })) }), { status: 200 });
  }, true, { Response, Headers });
  const origin = 'https://www.hero-wars-alliance.com';
  window.postMessage({ source: 'hwa-helper-control', kind: 'refresh-rpc', calls: [
    { name: 'createRally', feature: 'mob', args: { startDelay: 300000, mobId: 'boss' } }
  ] }, origin);
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls: [{ name: 'randomDraft_getInfo' }] }, origin);
  window.postMessage({ source: 'hwa-helper-control', kind: 'draft-action', action: 'saveDefence', heroes: [1, 2, 3, 4, 5] }, origin);
  assert.equal(batches.length, 0);
  const response = await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: JSON.stringify({ calls: [{ name: 'randomDraft_getInfo', ident: 'native' }] })
  });
  assert.deepEqual(batches[0].map((call) => call.name),
    ['randomDraft_getInfo', 'createRally', 'randomDraft_saveDefence', 'randomDraft_getInfo']);
  assert.equal(batches[0][1].args.startDelay, 300000);
  assert.deepEqual(JSON.parse(await response.text()).results.map((result) => result.ident), ['native']);
});

test('queued actions expire, cancel on settings change and never retry after network failure', async () => {
  for (const scenario of ['expiry', 'disable', 'direct', 'failure']) {
    let now = 1000; const batches = [];
    class Clock extends Date { static now() { return now; } }
    const { window } = setup(async (_url, options) => {
      const request = JSON.parse(options.body); batches.push(request.calls.map((call) => call.name));
      if (scenario === 'failure' && batches.length === 1) throw Error('network failure');
      return new Response(JSON.stringify({ results: request.calls.map((call) => ({ ident: call.ident, result: { response: {} } })) }), { status: 200 });
    }, true, { Response, Headers, Date: Clock });
    const origin = 'https://www.hero-wars-alliance.com';
    window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls: [
      { name: 'attackMine', feature: 'mine', args: { mineId: 'mine' } }
    ] }, origin);
    if (scenario === 'expiry') now += 120001;
    if (scenario === 'disable' || scenario === 'direct') window.postMessage({
      source: 'hwa-helper-config', kind: 'control', interceptEnabled: true,
      popupRpcEnabled: scenario !== 'disable', socketRefreshMode: scenario === 'direct' ? 'direct' : 'piggyback'
    }, origin);
    const request = () => window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
      method: 'POST', body: '{"calls":[{"name":"userGetInfo","ident":"native"}]}'
    });
    if (scenario === 'failure') await assert.rejects(request(), /network failure/);
    else await request();
    await request();
    assert.deepEqual(batches.at(-1), ['userGetInfo']);
    assert.equal(batches[0].includes('attackMine'), scenario === 'failure');
  }
});

test('XHR captures RPC url and headers via setRequestHeader into sessionStorage', async () => {
  const { window, sessionStorage } = setup(async () => new Response('ok'));
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://api.hero-wars-alliance.com/api/rpc');
  xhr.setRequestHeader('X-Auth-User-Id', '777');
  xhr.setRequestHeader('X-Auth-Token', 'secret-token');
  xhr.send('{}');

  assert.equal(sessionStorage.getItem('hwa_last_rpc_url'), 'https://api.hero-wars-alliance.com/api/rpc');
  const storedHeaders = JSON.parse(sessionStorage.getItem('hwa_last_rpc_headers'));
  assert.equal(storedHeaders['x-auth-user-id'], '777');
  assert.equal(storedHeaders['x-auth-token'], 'secret-token');
});

test('createUnityInstance hook captures instance and reports engine status', async () => {
  const engineMessages = [];
  const { window } = setup(async () => new Response('ok'));
  window.addEventListener('message', (ev) => {
    if (ev.data?.source === 'hwa-helper-api' && ev.data?.kind === 'engine-status') {
      engineMessages.push(ev.data.status);
    }
  });

  const fakeInstance = {
    SendMessage: (obj, method, val) => { fakeInstance.lastCall = { obj, method, val }; }
  };
  window.createUnityInstance = async (canvas, config) => fakeInstance;

  const instance = await window.createUnityInstance({}, {});
  assert.equal(instance, fakeInstance);
  assert.equal(window.__hwaUnityInstance, fakeInstance);

  const lastStatus = engineMessages[engineMessages.length - 1];
  assert.equal(lastStatus.ready, true);
  assert.equal(lastStatus.hasSendMessage, true);

  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-send-message',
    objectName: 'GameController',
    methodName: 'ClaimReward',
    param: '123'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(fakeInstance.lastCall, { obj: 'GameController', method: 'ClaimReward', val: '123' });
});

test('recording observes exposed SendMessage calls without changing arguments or capturing payload', async () => {
  const events = [];
  const { window } = setup(async () => new Response('ok'));
  window.addEventListener('message', (ev) => {
    if (ev.data?.kind === 'interaction-record') events.push(ev.data.entry);
  });
  const calls = [];
  window.createUnityInstance = async () => ({
    SendMessage(...args) { calls.push(args); return 'game-result'; }
  });
  const engine = await window.createUnityInstance({}, {});
  engine.SendMessage('Hero', 'Open', 'secret-before-record');
  assert.equal(events.length, 0);
  window.postMessage({ source: 'hwa-helper-config', kind: 'control',
    interceptEnabled: true, popupRpcEnabled: false, recordingActive: true },
  'https://www.hero-wars-alliance.com');
  assert.equal(engine.SendMessage('Hero', 'LevelUp', 'sensitive-payload'), 'game-result');
  assert.equal(calls.length, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].objectName, 'Hero');
  assert.equal(events[0].methodName, 'LevelUp');
  assert.equal(events[0].paramLength, 17);
  assert.equal(JSON.stringify(events).includes('sensitive-payload'), false);
});

test('property setter for unityInstance captures instance and responds to engine-ping', async () => {
  const engineMessages = [];
  const { window } = setup(async () => new Response('ok'));
  window.addEventListener('message', (ev) => {
    if (ev.data?.source === 'hwa-helper-api' && ev.data?.kind === 'engine-status') {
      engineMessages.push(ev.data.status);
    }
  });

  const fakeInstance = { SendMessage: () => {} };
  window.unityInstance = fakeInstance;
  assert.equal(window.__hwaUnityInstance, fakeInstance);

  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-ping'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pingStatus = engineMessages.find((s) => s.reason === 'ping');
  assert.ok(pingStatus);
  assert.equal(pingStatus.ready, true);
  assert.equal(pingStatus.hasSendMessage, true);
});

test('engine scanner discovers SendMessage on window.Module and executes calls', async () => {
  const engineMessages = [];
  const fakeModule = {
    lastCall: null,
    SendMessage: (obj, method, param) => { fakeModule.lastCall = { obj, method, param }; }
  };
  const { window } = setup(async () => new Response('ok'), true, {
    window: { Module: fakeModule }
  });
  window.addEventListener('message', (ev) => {
    if (ev.data?.source === 'hwa-helper-api' && ev.data?.kind === 'engine-status') {
      engineMessages.push(ev.data.status);
    }
  });

  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-ping'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pingStatus = engineMessages.find((s) => s.reason === 'ping');
  assert.ok(pingStatus);
  assert.equal(pingStatus.ready, true);
  assert.equal(pingStatus.hasSendMessage, true);
  assert.ok(Array.isArray(pingStatus.detectedGlobals));
  assert.ok(pingStatus.detectedGlobals.includes('Module'));

  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-send-message',
    objectName: 'UI',
    methodName: 'ClaimMail',
    param: 'all'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(fakeModule.lastCall, { obj: 'UI', method: 'ClaimMail', param: 'all' });
});

test('engine scanner discovers unity instance attached to canvas element', async () => {
  const engineMessages = [];
  const canvasInstance = {
    SendMessage: (o, m, p) => {}
  };
  const fakeDoc = {
    querySelector: (sel) => ({ id: 'canvas' }),
    querySelectorAll: (sel) => (sel.includes('canvas') ? [{ _unityInstance: canvasInstance }] : [])
  };
  const { window } = setup(async () => new Response('ok'), true, {
    document: fakeDoc
  });
  window.addEventListener('message', (ev) => {
    if (ev.data?.source === 'hwa-helper-api' && ev.data?.kind === 'engine-status') {
      engineMessages.push(ev.data.status);
    }
  });

  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-ping'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pingStatus = engineMessages.find((s) => s.reason === 'ping');
  assert.ok(pingStatus);
  assert.equal(pingStatus.ready, true);
  assert.equal(pingStatus.hasSendMessage, true);
  assert.equal(pingStatus.hasCanvas, true);
});

test('engine scanner discovers direct window.SendMessage function', async () => {
  const engineMessages = [];
  let directCall = null;
  const { window } = setup(async () => new Response('ok'), true, {
    window: {
      SendMessage: (o, m, p) => { directCall = { o, m, p }; }
    }
  });
  window.addEventListener('message', (ev) => {
    if (ev.data?.source === 'hwa-helper-api' && ev.data?.kind === 'engine-status') {
      engineMessages.push(ev.data.status);
    }
  });

  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-ping'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  const pingStatus = engineMessages.find((s) => s.reason === 'ping');
  assert.ok(pingStatus);
  assert.equal(pingStatus.ready, true);
  assert.equal(pingStatus.hasSendMessage, true);

  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: 'hwa-helper-control',
    kind: 'engine-send-message',
    objectName: 'Audio',
    methodName: 'Mute',
    param: 'true'
  }, 'https://www.hero-wars-alliance.com');

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(directCall, { o: 'Audio', m: 'Mute', p: 'true' });
});

test("refresh-rpc cleans headers, strips stale x-auth-signature, increments x-request-id, and attaches Authorization", async () => {
  let dispatched = null;
  const { window } = setup(async (url, opts) => {
    if (opts?.body?.includes("mailFarm")) {
      dispatched = { url, opts };
    }
    return new Response("{\"results\":[]}", { status: 200, headers: { "content-type": "application/json" } });
  }, true, {
    window: {
      webglAuth: {
        accessToken: "mock-jwt-token-xyz",
        accountId: "999888"
      }
    }
  });

  // Simulate a previous game RPC request having captured headers with stale signature and request-id
  await window.fetch("https://api.hero-wars-alliance.com/api/rpc", {
    method: "POST",
    headers: {
      ":authority": "api.hero-wars-alliance.com",
      ":method": "POST",
      "x-auth-signature": "stale-md5-signature-abc",
      "x-request-id": "42",
      "x-auth-user-id": "12345",
      "x-auth-session-id": "session-789",
      "x-env-timestamp": "1000000000",
      "content-length": "999"
    },
    body: "{\"calls\":[{\"name\":\"mobileLogin\"}]}"
  });

  // Now trigger refresh-rpc for mailFarm
  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: "hwa-helper-control",
    kind: "refresh-rpc",
    calls: [{ name: "mailFarm", args: { letterId: 101 } }]
  }, "https://www.hero-wars-alliance.com");

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(dispatched, "Dispatched request should be captured");
  const headers = dispatched.opts.headers;

  // Stale signature must be stripped to prevent HTTP 500 Invalid signature from server
  assert.equal(headers["x-auth-signature"], undefined);
  assert.equal(headers[":authority"], undefined);
  assert.equal(headers["content-length"], undefined);

  // Valid session headers preserved
  assert.equal(headers["x-auth-user-id"], "12345");
  assert.equal(headers["x-auth-session-id"], "session-789");

  // Request ID monotonically incremented above 42
  const nextReqId = parseInt(headers["x-request-id"], 10);
  assert.ok(nextReqId > 42, `Next request ID ${nextReqId} must be greater than 42`);

  // Timestamp updated
  assert.ok(parseInt(headers["x-env-timestamp"], 10) > 1000000000);

  // Authorization Bearer token attached from window.webglAuth
  assert.equal(headers["Authorization"], "Bearer mock-jwt-token-xyz");
});

test("unityFramework hook captures Module and SendMessage on postRun", async () => {
  const engineMessages = [];
  const { window } = setup(async () => new Response("ok"), true);
  window.addEventListener("message", (ev) => {
    if (ev.data?.source === "hwa-helper-api" && ev.data?.kind === "engine-status") {
      engineMessages.push(ev.data.status);
    }
  });

  // Simulate framework.js assigning unityFramework
  let fakeSendMessageCalled = null;
  const mockModule = {
    postRun: [],
    SendMessage: (o, m, p) => { fakeSendMessageCalled = { o, m, p }; }
  };

  assert.equal(typeof window.unityFramework, "undefined");
  window.unityFramework = function (mod) {
    return mod;
  };

  // Simulate loader.js calling unityFramework(mockModule)
  window.unityFramework(mockModule);

  // Trigger postRun callbacks
  for (const cb of mockModule.postRun) cb();

  await new Promise((resolve) => setTimeout(resolve, 10));
  const postRunStatus = engineMessages.find((s) => s.reason === "instance-unityFramework-postRun");
  assert.ok(postRunStatus, "Should receive instance-unityFramework-postRun status");
  assert.equal(postRunStatus.ready, true);
  assert.equal(postRunStatus.hasSendMessage, true);
});

test("syncRequestId rewrites stale x-request-id in xhr.setRequestHeader to prevent server rejection", async () => {
  const { window, sessionStorage } = setup(async () => new Response("ok"), true);

  // Set current highest request ID (e.g. extension dispatched request #50)
  sessionStorage.setItem("hwa_highest_request_id", "50");

  const req = new window.XMLHttpRequest();
  req.open("POST", "https://api.hero-wars-alliance.com/api/rpc");

  // Unity tries to send a request with an internal counter that fell behind (e.g. 26)
  req.setRequestHeader("X-Request-Id", "26");

  // Header should be rewritten to strictly > 50 (i.e. 51)
  assert.equal(req["X-Request-Id"], "51");
  assert.equal(sessionStorage.getItem("hwa_highest_request_id"), "51");

  // Next Unity request with 27 is also rewritten to 52
  const req2 = new window.XMLHttpRequest();
  req2.open("POST", "https://api.hero-wars-alliance.com/api/rpc");
  req2.setRequestHeader("x-request-id", "27");
  assert.equal(req2["x-request-id"], "52");
  assert.equal(sessionStorage.getItem("hwa_highest_request_id"), "52");

  // Unity request with a genuinely higher counter (e.g. 100) is accepted and advances the tracker
  const req3 = new window.XMLHttpRequest();
  req3.open("POST", "https://api.hero-wars-alliance.com/api/rpc");
  req3.setRequestHeader("x-request-id", "100");
  assert.equal(req3["x-request-id"], "100");
  assert.equal(sessionStorage.getItem("hwa_highest_request_id"), "100");
});

test('disabled popup RPC leaves game request ids untouched and ignores direct dispatch', () => {
  let calls = 0;
  const { window, sessionStorage } = setup(async () => { calls++; return new Response('ok'); });
  window.postMessage({ source: 'hwa-helper-config', kind: 'control',
    interceptEnabled: true, popupRpcEnabled: false }, 'https://www.hero-wars-alliance.com');
  sessionStorage.setItem('hwa_highest_request_id', '50');
  const request = new window.XMLHttpRequest();
  request.open('POST', 'https://api.hero-wars-alliance.com/api/rpc');
  request.setRequestHeader('X-Request-Id', '26');
  assert.equal(request['X-Request-Id'], '26');
  window.postMessage({ source: 'hwa-helper-control', kind: 'refresh-rpc',
    calls: [{ name: 'inventoryGet' }] }, 'https://www.hero-wars-alliance.com');
  assert.equal(calls, 0);
});

test("refresh-rpc dispatch emits api-record with response body to update rpcCache", async () => {
  const messages = [];
  const fakeResponse = JSON.stringify({
    results: [
      { ident: "claim1", result: { response: { ok: true } } }
    ]
  });

  const { window } = setup(async (url, opts) => {
    return new Response(fakeResponse, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }, false); // Even with captureEnabled = false!

  window.postMessage({ source: 'hwa-helper-config', kind: 'control',
    interceptEnabled: false, popupRpcEnabled: true }, 'https://www.hero-wars-alliance.com');

  window.addEventListener("message", (ev) => {
    if (ev.data?.source === "hwa-helper-api") {
      messages.push(ev.data);
    }
  });

  window.postMessage({ source: 'hwa-helper-config', kind: 'control', interceptEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' }, 'https://www.hero-wars-alliance.com');
  window.postMessage({
    source: "hwa-helper-control",
    kind: "refresh-rpc",
    calls: [{ name: "mailFarm", args: { letterIds: [1] } }]
  }, "https://www.hero-wars-alliance.com");

  await new Promise((resolve) => setTimeout(resolve, 30));

  const resultMsg = messages.find((m) => m.kind === "refresh-rpc-result");
  assert.ok(resultMsg, "Should emit refresh-rpc-result");
  assert.equal(resultMsg.ok, true);

  const apiRecordMsg = messages.find((m) => m.kind === "api-record");
  assert.ok(apiRecordMsg, "Should emit api-record so rpcCache gets merged");
  assert.equal(apiRecordMsg.record.responseBody, fakeResponse);
});

