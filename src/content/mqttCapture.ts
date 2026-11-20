/**
 * MQTT WebSocket frame capture.
 * Operates in the game page MAIN world.
 * Pure passive telemetry for game events, chat, rallies, and recording.
 */

export function installMqttCapture(customWindow?: any): void {
  const win = customWindow || (typeof window !== 'undefined' ? window : null);
  if (!win) return;
  const loc = win.location || (typeof location !== 'undefined' ? location : { origin: 'https://www.hero-wars-alliance.com', href: 'https://www.hero-wars-alliance.com/' });
  const flag = Symbol.for('hwa-helper-mqtt-capture-installed');
  if ((win as any)[flag] || typeof win.WebSocket !== 'function') return;
  (win as any)[flag] = true;

  const NativeWebSocket = win.WebSocket;
  const MQTT_ENDPOINT = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';
  const MAX_FRAME_BYTES = 1024 * 1024;
  const MAX_PAYLOAD_BYTES = 128 * 1024;
  let captureEnabled = true;
  let activeSocketState: any = null;

  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.origin !== loc.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'mqtt-send-upstream') {
      sendUpstreamMqttPacket(event.data.packet || event.data.payload, event.data.trackId);
      return;
    }
  });

  function sendUpstreamMqttPacket(payload: any, trackId?: string) {
    if (!activeSocketState || activeSocketState.closed || activeSocketState.socket.readyState !== 1) {
      console.warn('[HWA-TRACK][MQTT_UPSTREAM_FAILED]', {
        trackId,
        time: new Date().toISOString(),
        reason: 'No open MQTT socket available to send upstream to game server'
      });
      return;
    }
    try {
      console.log('[HWA-TRACK][MQTT_SEND_UPSTREAM_SERVER]', {
        trackId,
        time: new Date().toISOString(),
        mechanism: 'WebSocket.send to remote MQTT broker (upstream: client -> server)',
        payloadType: typeof payload
      });
      activeSocketState.socket.send(payload);
    } catch (err) {
      console.error('[HWA-TRACK][MQTT_UPSTREAM_ERROR]', { trackId, error: String(err) });
    }
  }

  function variableLength(bytes: Uint8Array, start: number, end: number) {
    let value = 0;
    let multiplier = 1;
    for (let index = start; index < Math.min(start + 4, end); index++) {
      const byte = bytes[index];
      if (byte === undefined) return null;
      value += (byte & 127) * multiplier;
      if (!(byte & 128)) return { value, next: index + 1 };
      multiplier *= 128;
    }
    return null;
  }

  function packetPayload(bytes: Uint8Array, version: number, direction: 'sent' | 'received') {
    const packets: any[] = [];
    let offset = 0;
    while (offset < bytes.length) {
      const header = bytes[offset++];
      if (header === undefined) break;
      const remaining = variableLength(bytes, offset, bytes.length);
      if (!remaining) break;
      const end = remaining.next + remaining.value;
      if (end > bytes.length) break;
      offset = remaining.next;
      const type = header >> 4;
      if (type === 1 && direction === 'sent') {
        const b0 = bytes[offset];
        const b1 = bytes[offset + 1];
        if (b0 === undefined || b1 === undefined) break;
        const protocolLength = (b0 << 8) | b1;
        const versionOffset = offset + 2 + protocolLength;
        const verByte = bytes[versionOffset];
        if (versionOffset < end && verByte !== undefined) version = verByte;
      } else if (type === 3) {
        if (offset + 2 > end) break;
        const b0 = bytes[offset];
        const b1 = bytes[offset + 1];
        if (b0 === undefined || b1 === undefined) break;
        const topicLength = (b0 << 8) | b1;
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

  function base64(bytes: Uint8Array) {
    let encoded = '';
    for (let offset = 0; offset < bytes.length; offset += 8190) {
      encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 8190)));
    }
    return encoded;
  }

  function describePayload(bytes: Uint8Array) {
    const preview = bytes.subarray(0, MAX_PAYLOAD_BYTES);
    let payload: string;
    let encoding = 'utf8';
    try {
      payload = new TextDecoder('utf-8', { fatal: true }).decode(preview);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(payload)) throw new Error('binary payload');
    } catch (_) {
      payload = base64(preview);
      encoding = 'base64';
    }
    let eventMethod: string | undefined;
    let eventType: string | undefined;
    if (encoding === 'utf8' && bytes.length <= MAX_PAYLOAD_BYTES) {
      try {
        const message = JSON.parse(payload);
        if (typeof message?.method === 'string') eventMethod = message.method.slice(0, 100);
        if (typeof message?.result?.type === 'string') eventType = message.result.type.slice(0, 100);
      } catch (_) {}
    }
    return {
      payload,
      encoding,
      payloadBytes: bytes.length,
      payloadTruncated: bytes.length > MAX_PAYLOAD_BYTES,
      ...(eventMethod ? { eventMethod } : {}),
      ...(eventType ? { eventType } : {})
    };
  }

  function frameBytes(data: any): Uint8Array | Promise<Uint8Array> | null {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      if (data.size > MAX_FRAME_BYTES) return null;
      return data.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }
    return null;
  }

  function observe(data: any, direction: 'sent' | 'received', state: any) {
    const captureAtArrival = captureEnabled;
    if (!captureAtArrival && direction !== 'sent') return;
    const timestamp = new Date().toISOString();
    state.pending = state.pending
      .then(async () => {
        const bytes = await frameBytes(data);
        if (!bytes || bytes.length > MAX_FRAME_BYTES) return;
        const firstByte = bytes[0];
        if (firstByte === undefined) return;
        if (!captureAtArrival && firstByte >> 4 !== 1) return;
        const parsed = packetPayload(bytes, state.version, direction);
        state.version = parsed.version;
        if (!captureAtArrival || !captureEnabled) return;
        for (const packet of parsed.packets) {
          if (
            packet.topic.includes('map') ||
            packet.topic.includes('chunks') ||
            direction === 'sent'
          ) {
            console.log(`[HWA-TRACK][MQTT_${direction.toUpperCase()}]`, {
              time: timestamp,
              direction,
              topic: packet.topic,
              qos: packet.qos,
              bytes: packet.payload.length
            });
          }
          win.postMessage(
            {
              source: 'hwa-helper-api',
              kind: 'api-record',
              record: {
                transport: 'websocket',
                method: 'PUBLISH',
                endpoint: MQTT_ENDPOINT,
                status: null,
                durationMs: 0,
                outcome: 'completed',
                timestamp,
                direction,
                topic: packet.topic,
                qos: packet.qos,
                ...describePayload(packet.payload)
              }
            },
            loc.origin
          );
        }
      })
      .catch(() => {});
  }

  (win as any).WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      let endpoint: string;
      let url: URL;
      try {
        url = new URL(String(args[0]), loc.href);
        endpoint = `${url.origin}${url.pathname}`;
      } catch (_) {
        return socket;
      }
      const isMqtt =
        endpoint === MQTT_ENDPOINT ||
        (url &&
          url.pathname.includes('/mqtt') &&
          (url.hostname.includes('nextersglobal.com') || url.hostname.includes('emqx'))) ||
        (url && url.hostname.includes('emqx'));
      if (!isMqtt) return socket;
      const state = { version: 4, pending: Promise.resolve(), socket, closed: false };
      activeSocketState = state;
      socket.addEventListener('close', () => {
        state.closed = true;
        if (activeSocketState === state) activeSocketState = null;
      });
      socket.addEventListener('message', (event: MessageEvent) => {
        observe(event.data, 'received', state);
      });
      const nativeSend = socket.send;
      socket.send = function (data: any) {
        observe(data, 'sent', state);
        return nativeSend.call(this, data);
      };
      return socket;
    }
  });

  win.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, loc.origin);
}
