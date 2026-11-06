(() => {
  const flag = Symbol.for('hwa-helper-mqtt-capture-installed');
  if (window[flag] || typeof window.WebSocket !== 'function') return;
  window[flag] = true;

  const NativeWebSocket = window.WebSocket;
  const MQTT_ENDPOINT = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';
  const MAX_FRAME_BYTES = 1024 * 1024;
  const MAX_PAYLOAD_BYTES = 128 * 1024;
  let captureEnabled = false;
  let popupRpcEnabled = false;
  let assistedMode = false;
  let recordingActive = false;
  let triggerTemplate = null;
  let lastTriggerAt = -Infinity;
  const syntheticEvents = new WeakSet();
  const reportTrigger = (state) => window.postMessage({
    source: 'hwa-helper-api', kind: 'mqtt-rpc-nudge-status', state
  }, location.origin);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled === true;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      assistedMode = event.data.socketRefreshMode === 'mqtt-piggyback';
      recordingActive = event.data.recordingActive === true;
      if (!captureEnabled || !popupRpcEnabled) triggerTemplate = null;
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'mqtt-rpc-nudge') triggerGameRefresh();
  });

  function rememberTrigger(packet, state) {
    if (packet.payload.length > MAX_PAYLOAD_BYTES || packet.topic.length > 512) return;
    try {
      const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packet.payload));
      const chunks = message?.result?.body?.chunks;
      if (message?.method !== 'msg' || message?.result?.type !== 'mapChunksUpdated' ||
          !Array.isArray(chunks) || !chunks.length || chunks.length > 32 ||
          chunks.some((chunk) => !Number.isInteger(chunk?.x) || !Number.isInteger(chunk?.y) ||
            !Number.isFinite(chunk?.updatedAt))) return;
      triggerTemplate = { state, topic: packet.topic, observedAt: Date.now(),
        chunks: chunks.map(({ x, y, updatedAt }) => ({ x, y, updatedAt })) };
    } catch (_) {}
  }

  function triggerGameRefresh() {
    if (!captureEnabled || !popupRpcEnabled || !assistedMode) return reportTrigger('disabled');
    const sample = triggerTemplate;
    if (!sample) return reportTrigger('waiting-template');
    if (Date.now() - sample.observedAt > 60000) return reportTrigger('expired-template');
    if (sample.state.closed || sample.state.socket.readyState !== 1) return reportTrigger('socket-closed');
    if (Date.now() - lastTriggerAt < 5000) return reportTrigger('cooldown');
    if (typeof MessageEvent !== 'function' || typeof sample.state.socket.dispatchEvent !== 'function') return reportTrigger('error');
    try {
      const encoder = new TextEncoder();
      const topic = encoder.encode(sample.topic);
      const payload = encoder.encode(JSON.stringify({ method: 'msg', result: {
        type: 'mapChunksUpdated', body: { chunks: sample.chunks.map((chunk) => ({
          ...chunk, updatedAt: Math.max(Date.now(), chunk.updatedAt + 1)
        })) }
      } }));
      // A fresh QoS0 PUBLISH avoids reusing packet IDs or server push counters.
      const body = new Uint8Array(2 + topic.length + (sample.state.version === 5 ? 1 : 0) + payload.length);
      body[0] = topic.length >> 8; body[1] = topic.length & 255;
      body.set(topic, 2);
      body.set(payload, 2 + topic.length + (sample.state.version === 5 ? 1 : 0));
      const length = []; let remaining = body.length;
      do { let byte = remaining % 128; remaining = Math.floor(remaining / 128);
        if (remaining) byte |= 128; length.push(byte);
      } while (remaining);
      const packet = new Uint8Array(1 + length.length + body.length);
      packet[0] = 0x30; packet.set(length, 1); packet.set(body, 1 + length.length);
      const data = sample.state.socket.binaryType === 'blob' ? new Blob([packet]) : packet.buffer;
      const event = new MessageEvent('message', { data, origin: new URL(sample.state.socket.url).origin });
      syntheticEvents.add(event);
      lastTriggerAt = Date.now();
      reportTrigger('triggered');
      sample.state.socket.dispatchEvent(event);
      if (recordingActive) window.postMessage({ source: 'hwa-helper-api', kind: 'interaction-record',
        entry: { category: 'rpc', action: 'mqtt-nudge', target: 'mapChunksUpdated',
          timestamp: new Date().toISOString() }
      }, location.origin);
    } catch (_) { reportTrigger('error'); }
  }

  function variableLength(bytes, start, end) {
    let value = 0;
    let multiplier = 1;
    for (let index = start; index < Math.min(start + 4, end); index++) {
      const byte = bytes[index];
      value += (byte & 127) * multiplier;
      if (!(byte & 128)) return { value, next: index + 1 };
      multiplier *= 128;
    }
    return null;
  }

  function packetPayload(bytes, version, direction) {
    const packets = [];
    let offset = 0;
    while (offset < bytes.length) {
      const header = bytes[offset++];
      const remaining = variableLength(bytes, offset, bytes.length);
      if (!remaining) break;
      const end = remaining.next + remaining.value;
      if (end > bytes.length) break;
      offset = remaining.next;
      const type = header >> 4;
      if (type === 1 && direction === 'sent') {
        // CONNECT identifies the MQTT version, but its credentials are never recorded.
        const protocolLength = (bytes[offset] << 8) | bytes[offset + 1];
        const versionOffset = offset + 2 + protocolLength;
        if (versionOffset < end) version = bytes[versionOffset];
      } else if (type === 3) {
        if (offset + 2 > end) break;
        const topicLength = (bytes[offset] << 8) | bytes[offset + 1];
        let cursor = offset + 2;
        if (cursor + topicLength > end) break;
        const topic = new TextDecoder('utf-8').decode(bytes.subarray(cursor, cursor + topicLength));
        cursor += topicLength;
        const qos = (header >> 1) & 3;
        if (qos > 0) cursor += 2;
        if (version === 5) {
          const properties = variableLength(bytes, cursor, end);
          if (!properties) break;
          cursor = properties.next + properties.value;
        }
        if (cursor > end) break;
        packets.push({ topic: topic.slice(0, 512), qos, payload: bytes.subarray(cursor, end) });
      }
      offset = end;
    }
    return { packets, version };
  }

  function base64(bytes) {
    let encoded = '';
    for (let offset = 0; offset < bytes.length; offset += 8190) {
      encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 8190)));
    }
    return encoded;
  }

  function describePayload(bytes) {
    const preview = bytes.subarray(0, MAX_PAYLOAD_BYTES);
    let payload;
    let encoding = 'utf8';
    try {
      payload = new TextDecoder('utf-8', { fatal: true }).decode(preview);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(payload)) throw new Error('binary payload');
    } catch (_) {
      payload = base64(preview);
      encoding = 'base64';
    }
    let eventMethod;
    let eventType;
    if (encoding === 'utf8' && bytes.length <= MAX_PAYLOAD_BYTES) {
      try {
        const message = JSON.parse(payload);
        if (typeof message?.method === 'string') eventMethod = message.method.slice(0, 100);
        if (typeof message?.result?.type === 'string') eventType = message.result.type.slice(0, 100);
      } catch (_) {}
    }
    return { payload, encoding, payloadBytes: bytes.length,
      payloadTruncated: bytes.length > MAX_PAYLOAD_BYTES,
      ...(eventMethod ? { eventMethod } : {}), ...(eventType ? { eventType } : {}) };
  }

  function frameBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      if (data.size > MAX_FRAME_BYTES) return null;
      return data.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }
    return null;
  }

  function observe(data, direction, state) {
    const captureAtArrival = captureEnabled;
    if (!captureAtArrival && direction !== 'sent') return;
    const timestamp = new Date().toISOString();
    state.pending = state.pending.then(async () => {
      const bytes = await frameBytes(data);
      if (!bytes || bytes.length > MAX_FRAME_BYTES) return;
      if (!captureAtArrival && bytes[0] >> 4 !== 1) return;
      const parsed = packetPayload(bytes, state.version, direction);
      state.version = parsed.version;
      if (!captureAtArrival || !captureEnabled) return;
      for (const packet of parsed.packets) {
        if (direction === 'received') rememberTrigger(packet, state);
        window.postMessage({ source: 'hwa-helper-api', kind: 'api-record', record: {
          transport: 'websocket', method: 'PUBLISH', endpoint: MQTT_ENDPOINT,
          status: null, durationMs: 0, outcome: 'completed', timestamp,
          direction, topic: packet.topic, qos: packet.qos, ...describePayload(packet.payload)
        } }, location.origin);
      }
    }).catch(() => {});
  }

  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      let endpoint;
      try {
        const url = new URL(String(args[0]), location.href);
        endpoint = `${url.origin}${url.pathname}`;
      } catch (_) { return socket; }
      if (endpoint !== MQTT_ENDPOINT) return socket;
      const state = { version: 4, pending: Promise.resolve(), socket, closed: false };
      socket.addEventListener('close', () => { state.closed = true; });
      socket.addEventListener('message', (event) => {
        if (!syntheticEvents.has(event)) observe(event.data, 'received', state);
      });
      const nativeSend = socket.send;
      socket.send = function (data) {
        observe(data, 'sent', state);
        return nativeSend.call(this, data);
      };
      return socket;
    }
  });
  window.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, location.origin);
})();
