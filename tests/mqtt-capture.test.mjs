import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/mqtt-capture.js', import.meta.url), 'utf8');
const interceptSource = await readFile(new URL('../extension/intercept.js', import.meta.url), 'utf8');
const filterSource = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');
const origin = 'https://www.hero-wars-alliance.com';
const endpoint = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';

function setup(options = {}) {
  const records = [];
  const triggerStates = [];
  const listeners = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.listeners = {}; this.sent = []; this.readyState = 1; this.binaryType = 'arraybuffer'; }
    addEventListener(kind, listener) { (this.listeners[kind] ||= []).push(listener); }
    send(data) { this.sent.push(data); }
    receive(data) { for (const listener of this.listeners.message || []) listener({ data }); }
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); return true; }
  }
  const window = {
    WebSocket: FakeWebSocket,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    addEventListener: (kind, listener) => { if (kind === 'message') listeners.push(listener); },
    postMessage: (data) => {
      if (data.kind === 'api-record') records.push(data.record);
      if (data.kind === 'mqtt-rpc-nudge-status') triggerStates.push(data.state);
      for (const listener of listeners) listener({ source: window, origin, data });
    }
  };
  runInNewContext((options.intercept ? `${filterSource}\n${interceptSource}\n` : '') + source,
    { window, URL, Symbol, Proxy, Reflect, ArrayBuffer, Blob, Response, Headers, MessageEvent,
    performance: { now: () => 0 }, Promise, sessionStorage: { getItem: () => null, setItem: () => {} },
    TextDecoder, TextEncoder, Uint8Array, btoa, Date: options.Date || Date, location: { origin, href: `${origin}/` } });
  const control = (recordingActive, interceptEnabled = true, settings = {}) => window.postMessage({
    source: 'hwa-helper-config', kind: 'control', interceptEnabled, recordingActive, ...settings
  });
  return { window, records, control, triggerStates };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const assisted = { popupRpcEnabled: true, socketRefreshMode: 'mqtt-piggyback' };
const mapMessage = { method: 'msg', result: { type: 'mapChunksUpdated', body: {
  chunks: [{ x: 60, y: 37, updatedAt: 100 }]
} } };

test('assisted trigger produces v4/v5 QoS0 packets without recording synthetic MQTT or sending to server', async () => {
  for (const version of [4, 5]) {
    class Clock extends Date { static now() { return 1000; } }
    const { window, records, control, triggerStates } = setup({ Date: Clock });
    const socket = new window.WebSocket(endpoint);
    socket.binaryType = version === 4 ? 'blob' : 'arraybuffer';
    control(true, true, assisted);
    if (version === 5) socket.send(Uint8Array.from([0x10, 0x0c, 0, 4, 77, 81, 84, 84, 5, 2, 0, 60, 0, 0]));
    socket.receive(publish('map/topic', JSON.stringify(mapMessage), 1, version));
    await tick();
    let injected;
    socket.addEventListener('message', (event) => { injected = event.data; });
    const sentBefore = socket.sent.length;
    window.postMessage({ source: 'hwa-helper-control', kind: 'mqtt-rpc-nudge' });
    await tick();
    assert.equal(triggerStates.at(-1), 'triggered');
    const expected = structuredClone(mapMessage); expected.result.body.chunks[0].updatedAt = 1000;
    const injectedBytes = injected instanceof Blob ? new Uint8Array(await injected.arrayBuffer()) : new Uint8Array(injected);
    assert.deepEqual(injectedBytes, publish('map/topic', JSON.stringify(expected), 0, version));
    assert.equal(records.length, 1);
    assert.equal(socket.sent.length, sentBefore);
  }
});

test('assisted trigger requires a fresh safe template, open socket, settings and cooldown', async () => {
  let now = 1000;
  class Clock extends Date { static now() { return now; } }
  const { window, control, triggerStates } = setup({ Date: Clock });
  const socket = new window.WebSocket(endpoint);
  const nudge = () => window.postMessage({ source: 'hwa-helper-control', kind: 'mqtt-rpc-nudge' });
  control(false, true, assisted);
  nudge(); assert.equal(triggerStates.at(-1), 'waiting-template');
  socket.receive(publish('map/topic', '{"method":"msg","result":{"type":"mobRallyAttackResult","body":{}}}'));
  await tick(); nudge(); assert.equal(triggerStates.at(-1), 'waiting-template');
  socket.receive(publish('map/topic', JSON.stringify(mapMessage))); await tick();
  nudge(); assert.equal(triggerStates.at(-1), 'triggered');
  nudge(); assert.equal(triggerStates.at(-1), 'cooldown');
  socket.readyState = 3; nudge(); assert.equal(triggerStates.at(-1), 'socket-closed');
  socket.readyState = 1; now += 60001; nudge(); assert.equal(triggerStates.at(-1), 'expired-template');
  control(false, false, assisted); nudge(); assert.equal(triggerStates.at(-1), 'disabled');
  control(false, true, { ...assisted, popupRpcEnabled: false }); nudge(); assert.equal(triggerStates.at(-1), 'disabled');
  control(false, true, { ...assisted, socketRefreshMode: 'piggyback' }); nudge(); assert.equal(triggerStates.at(-1), 'disabled');
});

test('local map trigger lets the engine create a native carrier and hides appended helper results', async () => {
  const network = [];
  const { window, records, control, triggerStates } = setup({ intercept: true,
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body); network.push(request);
      return new Response(JSON.stringify({ results: request.calls.map((call) => ({
        ident: call.ident, result: { response: { method: call.name } }
      })) }), { status: 200 });
    }
  });
  const socket = new window.WebSocket(endpoint);
  control(false, true, assisted);
  socket.receive(publish('map/topic', JSON.stringify(mapMessage))); await tick();
  let carrier;
  socket.addEventListener('message', () => {
    carrier = window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
      method: 'POST', body: JSON.stringify({ calls: [{ name: 'getChunks', feature: 'globalMap',
        args: { mapId: 'map', lod: 1, chunkCoordinates: [{ x: 60, y: 37 }] }, ident: 'native' }] })
    });
  });
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls: [{ name: 'inventoryGet' }] });
  assert.equal(triggerStates.at(-1), 'carrier-attached');
  const response = await carrier;
  assert.deepEqual(network[0].calls.map((call) => call.name), ['getChunks', 'inventoryGet']);
  assert.deepEqual(JSON.parse(await response.text()).results.map((item) => item.ident), ['native']);
  assert.equal(network.length, 1);
  assert.equal(records.filter((record) => record.transport === 'websocket').length, 1);
});

test('missing MQTT template never falls back to a separate RPC', async () => {
  const network = [];
  const { window, control, triggerStates } = setup({ intercept: true,
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body); network.push(request);
      return new Response(JSON.stringify({ results: request.calls.map((call) => ({
        ident: call.ident, result: { response: {} }
      })) }), { status: 200 });
    }
  });
  control(false, true, assisted);
  window.postMessage({ source: 'hwa-helper-control', kind: 'queue-rpc', calls: [{ name: 'inventoryGet' }] });
  await tick();
  assert.equal(triggerStates.at(-1), 'waiting-template');
  assert.equal(network.length, 0);
  await window.fetch('https://api.hero-wars-alliance.com/api/rpc', {
    method: 'POST', body: '{"calls":[{"name":"userGetInfo","ident":"native"}]}'
  });
  assert.deepEqual(network[0].calls.map((call) => call.name), ['userGetInfo', 'inventoryGet']);
});

function publish(topic, payload, qos = 0, version = 4) {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  const payloadBytes = typeof payload === 'string' ? encoder.encode(payload) : payload;
  const body = [topicBytes.length >> 8, topicBytes.length & 255, ...topicBytes,
    ...(qos ? [0, 1] : []), ...(version === 5 ? [0] : []), ...payloadBytes];
  const length = [];
  let remaining = body.length;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 128;
    length.push(byte);
  } while (remaining);
  return Uint8Array.from([(3 << 4) | (qos << 1), ...length, ...body]);
}

test('records MQTT PUBLISH topics and payloads without altering the game socket', async () => {
  const { window, records, control } = setup();
  const socket = new window.WebSocket(`${endpoint}?token=secret`);
  const unrelated = new window.WebSocket('wss://example.com/mqtt');
  control(true);
  const payload = '{"method":"msg","result":{"type":"rallyCreated","body":{}}}';
  const packet = publish('hero/update', payload, 1);
  socket.send(packet);
  socket.receive(new Blob([packet]));
  unrelated.receive(packet);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(socket.sent[0], packet);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.direction), ['sent', 'received']);
  assert.equal(records[0].endpoint, endpoint);
  assert.equal(records[0].topic, 'hero/update');
  assert.equal(records[0].payload, payload);
  assert.equal(records[0].eventMethod, 'msg');
  assert.equal(records[0].eventType, 'rallyCreated');
  assert.equal(records[0].qos, 1);
  assert.equal(records[0].encoding, 'utf8');
  control(false);
  socket.receive(packet);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(records.length, 3, 'live cache capture continues when Record is off');
  control(false, false);
  socket.receive(packet);
  assert.equal(records.length, 3);
});

test('ignores CONNECT credentials and encodes binary PUBLISH payloads', async () => {
  const { window, records, control } = setup();
  const socket = new window.WebSocket(endpoint);
  control(true);
  const connect = Uint8Array.from([0x10, 0x0c, 0, 4, 77, 81, 84, 84, 5, 2, 0, 60, 0, 0]);
  socket.send(connect);
  socket.receive(publish('battle/result', Uint8Array.from([0, 255, 1]), 0, 5).buffer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(records.length, 1);
  assert.equal(records[0].topic, 'battle/result');
  assert.equal(records[0].encoding, 'base64');
  assert.equal(records[0].payload, 'AP8B');
});
