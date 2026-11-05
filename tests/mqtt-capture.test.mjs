import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/mqtt-capture.js', import.meta.url), 'utf8');
const origin = 'https://www.hero-wars-alliance.com';
const endpoint = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';

function setup() {
  const records = [];
  const listeners = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.listeners = {}; this.sent = []; }
    addEventListener(kind, listener) { (this.listeners[kind] ||= []).push(listener); }
    send(data) { this.sent.push(data); }
    receive(data) { for (const listener of this.listeners.message || []) listener({ data }); }
  }
  const window = {
    WebSocket: FakeWebSocket,
    addEventListener: (kind, listener) => { if (kind === 'message') listeners.push(listener); },
    postMessage: (data) => {
      if (data.kind === 'api-record') records.push(data.record);
      for (const listener of listeners) listener({ source: window, origin, data });
    }
  };
  runInNewContext(source, { window, URL, Symbol, Proxy, Reflect, ArrayBuffer, Blob,
    TextDecoder, TextEncoder, Uint8Array, btoa, Date, location: { origin, href: `${origin}/` } });
  const control = (recordingActive, interceptEnabled = true) => window.postMessage({
    source: 'hwa-helper-config', kind: 'control', interceptEnabled, recordingActive
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
