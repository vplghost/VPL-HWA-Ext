import test from 'node:test';
import assert from 'node:assert/strict';
import { installMqttCapture } from '../src/content/mqttCapture.ts';

const origin = 'https://www.hero-wars-alliance.com';
const endpoint = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';

function setup(options = {}) {
  const records = [];
  const listeners = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.listeners = {}; this.sent = []; this.readyState = 1; this.binaryType = 'arraybuffer'; }
    addEventListener(kind, listener) { (this.listeners[kind] ||= []).push(listener); }
    send(data) { this.sent.push(data); }
    receive(data) { for (const listener of this.listeners.message || []) listener({ data }); }
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); return true; }
  }
  const storage = {};
  const sessionStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  const window = {
    WebSocket: FakeWebSocket,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    addEventListener: (kind, listener) => { if (kind === 'message') listeners.push(listener); },
    postMessage: (data) => {
      if (data.kind === 'api-record') records.push(data.record);
      for (const listener of listeners) listener({ source: window, origin, data });
    },
    location: { origin, href: `${origin}/` },
    sessionStorage,
    performance: { now: () => 0 },
    Date: options.Date || Date
  };
  installMqttCapture(window);
  const control = (recordingActive, interceptEnabled = true, settings = {}) => window.postMessage({
    source: 'hwa-helper-config', kind: 'control', interceptEnabled, recordingActive, ...settings
  });
  return { window, records, control };
}

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

test('decodes MQTT 5 PUBLISH chatMessage with empty and non-empty properties as UTF-8', async () => {
  const { window, records, control } = setup();
  const socket = new window.WebSocket(endpoint);
  control(true);

  // 1. MQTT 5 with 0-length properties (standard game push)
  const chatPayload = JSON.stringify({
    method: 'msg',
    result: {
      type: 'chatMessage',
      body: {
        chatType: 'clan',
        id: 12345,
        userId: 6789,
        ctime: 1795000000,
        data: { text: 'Hello guild members!' },
        user: { id: '6789', name: 'Commander' }
      }
    }
  });
  socket.receive(publish('hwm/user/6789', chatPayload, 0, 5));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(records.length, 1);
  assert.equal(records[0].encoding, 'utf8');
  assert.equal(records[0].eventType, 'chatMessage');
  assert.equal(records[0].eventMethod, 'msg');
  assert.ok(records[0].payload.includes('Hello guild members!'));

  // 2. MQTT 4 framed message without properties also decodes correctly
  socket.receive(publish('hwm/user/6789', chatPayload, 0, 4));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(records.length, 2);
  assert.equal(records[1].encoding, 'utf8');
  assert.equal(records[1].eventType, 'chatMessage');
  assert.ok(records[1].payload.includes('Hello guild members!'));
});
