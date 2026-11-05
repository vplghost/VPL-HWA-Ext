(() => {
  const flag = Symbol.for('hwa-helper-mqtt-capture-installed');
  if (window[flag] || typeof window.WebSocket !== 'function') return;
  window[flag] = true;

  const NativeWebSocket = window.WebSocket;
  const MQTT_ENDPOINT = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';
  const MAX_FRAME_BYTES = 1024 * 1024;
  const MAX_PAYLOAD_BYTES = 128 * 1024;
  let captureEnabled = false;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source !== 'hwa-helper-config' || event.data.kind !== 'control') return;
    captureEnabled = event.data.interceptEnabled === true;
  });

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
      const state = { version: 4, pending: Promise.resolve() };
      socket.addEventListener('message', (event) => observe(event.data, 'received', state));
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
