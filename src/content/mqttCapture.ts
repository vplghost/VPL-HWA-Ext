/**
 * MQTT WebSocket frame capture and nudge injection.
 * Operates in the game page MAIN world.
 */

export function installMqttCapture(customWindow?: any): void {
  const win = customWindow || (typeof window !== 'undefined' ? window : null);
  if (!win) return;
  const loc = win.location || (typeof location !== 'undefined' ? location : { origin: 'https://www.hero-wars-alliance.com', href: 'https://www.hero-wars-alliance.com/' });
  const getNow = () => (typeof win.Date?.now === 'function' ? win.Date.now() : Date.now());
  const flag = Symbol.for('hwa-helper-mqtt-capture-installed');
  if ((win as any)[flag] || typeof win.WebSocket !== 'function') return;
  (win as any)[flag] = true;

  const NativeWebSocket = win.WebSocket;
  const MQTT_ENDPOINT = 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt';
  const MAX_FRAME_BYTES = 1024 * 1024;
  const MAX_PAYLOAD_BYTES = 128 * 1024;
  let captureEnabled = true;
  let popupRpcEnabled = false;
  let assistedMode = false;
  let recordingActive = false;
  let draftLoggingEnabled = false;
  let triggerTemplate: any = null;
  let userPushTemplate: any = null;
  let viewedChunks: any = null;
  let lastTriggerAt = -Infinity;
  const syntheticEvents = new WeakSet();

  const reportTrigger = (state: string, details: Record<string, any> = {}) =>
    win.postMessage(
      { source: 'hwa-helper-api', kind: 'mqtt-rpc-nudge-status', state, ...details },
      loc.origin
    );

  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.origin !== loc.origin) return;
    if (event.data?.source === 'hwa-helper-config' && event.data.kind === 'control') {
      captureEnabled = event.data.interceptEnabled !== false;
      popupRpcEnabled = event.data.popupRpcEnabled === true;
      assistedMode = event.data.socketRefreshMode === 'mqtt-piggyback';
      recordingActive = event.data.recordingActive === true;
      if (event.data.legendDraftLoggingEnabled !== undefined) {
        draftLoggingEnabled = event.data.legendDraftLoggingEnabled === true;
      }
      if (!captureEnabled || !popupRpcEnabled) {
        triggerTemplate = null;
        userPushTemplate = null;
      }
      return;
    }
    if (event.data?.source === 'hwa-helper-api' && event.data.kind === 'api-record') {
      rememberViewedChunks(event.data.record);
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'mqtt-rpc-nudge') {
      triggerGameRefresh(event.data.trackId, event.data.requestedAt);
      return;
    }
    if (event.data?.source === 'hwa-helper-control' && event.data.kind === 'mqtt-send-upstream') {
      sendUpstreamMqttPacket(event.data.packet || event.data.payload, event.data.trackId);
      return;
    }
  });

  function sendUpstreamMqttPacket(payload: any, trackId?: string) {
    const sample = triggerTemplate || userPushTemplate;
    if (!sample || sample.state.closed || sample.state.socket.readyState !== 1) {
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
      sample.state.socket.send(payload);
    } catch (err) {
      console.error('[HWA-TRACK][MQTT_UPSTREAM_ERROR]', { trackId, error: String(err) });
    }
  }

  function rememberViewedChunks(record: any) {
    if (
      record?.transport !== 'fetch' ||
      record.method !== 'POST' ||
      record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
      record.requestBodyTruncated ||
      typeof record.requestBody !== 'string' ||
      record.requestBody.length > MAX_PAYLOAD_BYTES
    )
      return;
    try {
      const calls = JSON.parse(record.requestBody)?.calls;
      const native = calls?.find(
        (call: any) =>
          call.name === 'getChunks' &&
          call.feature === 'globalMap' &&
          typeof call.args?.mapId === 'string' &&
          Array.isArray(call.args?.chunkCoordinates)
      );
      if (!native) return;
      const coordinates = native.args.chunkCoordinates
        .filter((item: any) => Number.isInteger(item?.x) && Number.isInteger(item?.y))
        .slice(-32)
        .map(({ x, y }: any) => ({ x, y }));
      if (coordinates.length)
        viewedChunks = {
          mapId: native.args.mapId,
          observedAt: getNow(),
          coordinates
        };
    } catch (_) {}
  }

  function rememberTrigger(packet: any, state: any) {
    if (packet.payload.length > MAX_PAYLOAD_BYTES || packet.topic.length > 512) return;
    try {
      const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packet.payload));

      if (packet.topic.startsWith('hwm/user/') || packet.topic.includes('/user/')) {
        const type = message?.result?.type || message?.method || 'user-push';
        userPushTemplate = {
          state,
          topic: packet.topic,
          type,
          rawJson: message,
          observedAt: getNow()
        };
      }

      const chunks = message?.result?.body?.chunks;
      if (
        message?.method !== 'msg' ||
        message?.result?.type !== 'mapChunksUpdated' ||
        !Array.isArray(chunks) ||
        !chunks.length ||
        chunks.length > 32 ||
        chunks.some(
          (chunk: any) =>
            !Number.isInteger(chunk?.x) ||
            !Number.isInteger(chunk?.y) ||
            !Number.isFinite(chunk?.updatedAt)
        )
      )
        return;
      const observedAt = getNow();
      const previous =
        triggerTemplate?.state === state && triggerTemplate.topic === packet.topic
          ? triggerTemplate.chunks.filter((chunk: any) => observedAt - chunk.observedAt <= 60000)
          : [];
      const byCoordinate = new Map(previous.map((chunk: any) => [`${chunk.x}:${chunk.y}`, chunk]));
      for (const { x, y, updatedAt } of chunks) {
        const key = `${x}:${y}`;
        byCoordinate.delete(key);
        byCoordinate.set(key, { x, y, updatedAt, observedAt });
      }
      triggerTemplate = {
        state,
        topic: packet.topic,
        observedAt,
        chunks: [...byCoordinate.values()].slice(-32)
      };
    } catch (_) {}
  }

  function buildQoS0PublishPacket(topicStr: string, payloadStr: string, version = 4): Uint8Array {
    const encoder = new TextEncoder();
    const topic = encoder.encode(topicStr);
    const payload = encoder.encode(payloadStr);
    const body = new Uint8Array(2 + topic.length + (version === 5 ? 1 : 0) + payload.length);
    body[0] = topic.length >> 8;
    body[1] = topic.length & 255;
    body.set(topic, 2);
    body.set(payload, 2 + topic.length + (version === 5 ? 1 : 0));
    const length: number[] = [];
    let remaining = body.length;
    do {
      let byte = remaining % 128;
      remaining = Math.floor(remaining / 128);
      if (remaining) byte |= 128;
      length.push(byte);
    } while (remaining);
    const packet = new Uint8Array(1 + length.length + body.length);
    packet[0] = 0x30;
    packet.set(length, 1);
    packet.set(body, 1 + length.length);
    return packet;
  }

  function triggerGameRefresh(trackId: string | null = null, _requestedAt: any = null) {
    if (!captureEnabled || !popupRpcEnabled || !assistedMode) return reportTrigger('disabled');
    const mapSample = triggerTemplate;
    const userSample = userPushTemplate;
    const sample = mapSample || userSample;

    console.log('[HWA-TRACK][5a/6 MQTT_NUDGE_CHECK]', {
      trackId,
      time: new Date().toISOString(),
      assistedMode,
      captureEnabled,
      popupRpcEnabled,
      hasMapTemplate: Boolean(mapSample),
      hasUserTemplate: Boolean(userSample),
      mapTemplateAgeMs: mapSample ? getNow() - mapSample.observedAt : null,
      userTemplateAgeMs: userSample ? getNow() - userSample.observedAt : null,
      viewedChunks: viewedChunks
        ? {
            mapId: viewedChunks.mapId,
            count: viewedChunks.coordinates.length,
            ageMs: getNow() - viewedChunks.observedAt
          }
        : null
    });

    if (!sample) return reportTrigger('waiting-template');

    const mapFresh = Boolean(mapSample && getNow() - mapSample.observedAt <= 60000);
    const userFresh = Boolean(userSample && getNow() - userSample.observedAt <= 120000);
    if (!mapFresh && !userFresh) return reportTrigger('expired-template');

    const mapReady = Boolean(mapFresh && !mapSample.state.closed && mapSample.state.socket.readyState === 1);
    const userReady = Boolean(userFresh && !userSample.state.closed && userSample.state.socket.readyState === 1);
    if (!mapReady && !userReady) return reportTrigger('socket-closed');

    if (getNow() - lastTriggerAt < 5000) return reportTrigger('cooldown');
    if (typeof MessageEvent !== 'function') return reportTrigger('error');

    try {
      let nudgeType = 'none';
      const isMapActive = viewedChunks && getNow() - viewedChunks.observedAt <= 60000;
      let mapEvent: MessageEvent | null = null;
      let userEvent: MessageEvent | null = null;

      if (mapReady) {
        if (typeof mapSample.state.socket.dispatchEvent !== 'function') return reportTrigger('error');
        const chunks = new Map(mapSample.chunks.map((chunk: any) => [`${chunk.x}:${chunk.y}`, chunk]));
        if (isMapActive && mapSample.topic.endsWith(`/${viewedChunks.mapId}`)) {
          const latestTimestamp = Math.max(...mapSample.chunks.map((chunk: any) => chunk.updatedAt));
          for (const { x, y } of viewedChunks.coordinates) {
            const key = `${x}:${y}`;
            const chunk = chunks.get(key);
            chunks.delete(key);
            chunks.set(key, chunk || { x, y, updatedAt: latestTimestamp });
          }
        }
        const payloadStr = JSON.stringify({
          method: 'msg',
          result: {
            type: 'mapChunksUpdated',
            body: {
              chunks: [...chunks.values()].slice(-32).map(({ x, y, updatedAt }: any) => ({
                x,
                y,
                updatedAt: Math.max(getNow(), updatedAt + 1)
              }))
            }
          }
        });
        const packet = buildQoS0PublishPacket(mapSample.topic, payloadStr, mapSample.state.version);
        const data =
          mapSample.state.socket.binaryType === 'blob'
            ? new Blob([packet.buffer as ArrayBuffer])
            : packet.buffer;
        mapEvent = new MessageEvent('message', {
          data,
          origin: new URL(mapSample.state.socket.url).origin
        });
        syntheticEvents.add(mapEvent);
        nudgeType = 'map';
      }

      if (userReady && (!mapReady || !isMapActive)) {
        if (typeof userSample.state.socket.dispatchEvent !== 'function') return reportTrigger('error');
        const payloadStr = JSON.stringify(
          userSample.rawJson || { method: 'msg', result: { type: userSample.type, body: {} } }
        );
        const packet = buildQoS0PublishPacket(userSample.topic, payloadStr, userSample.state.version);
        const data =
          userSample.state.socket.binaryType === 'blob'
            ? new Blob([packet.buffer as ArrayBuffer])
            : packet.buffer;
        userEvent = new MessageEvent('message', {
          data,
          origin: new URL(userSample.state.socket.url).origin
        });
        syntheticEvents.add(userEvent);
        nudgeType = mapReady ? 'multi' : 'user';
      }

      lastTriggerAt = getNow();
      reportTrigger('triggered', { nudgeType, trackId });

      if (mapEvent) mapSample.state.socket.dispatchEvent(mapEvent);
      if (userEvent) userSample.state.socket.dispatchEvent(userEvent);

      console.log('[HWA-TRACK][5b/6 MQTT_DISPATCH_DOWNSTREAM_ENGINE]', {
        trackId,
        time: new Date().toISOString(),
        mechanism: 'synthetic MessageEvent dispatched locally to socket (downstream: server -> local engine)',
        nudgeType,
        mapTopic: mapReady ? mapSample.topic : null,
        userTopic: userReady ? userSample.topic : null
      });

      if (recordingActive)
        win.postMessage(
          {
            source: 'hwa-helper-api',
            kind: 'interaction-record',
            entry: {
              category: 'rpc',
              action: 'mqtt-nudge',
              target: nudgeType === 'user' ? userSample?.type || 'userPush' : 'mapChunksUpdated',
              nudgeType,
              timestamp: new Date().toISOString()
            }
          },
          loc.origin
        );
    } catch (_) {
      reportTrigger('error');
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
          if (direction === 'received') rememberTrigger(packet, state);
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

          const isDraftLogging = Boolean(
            draftLoggingEnabled ||
            win.__hwaLegendDraftHook?.isLoggingEnabled?.()
          );
          if (isDraftLogging) {
            const payloadInfo = describePayload(packet.payload);
            const isDraftMqtt =
              /draft/i.test(packet.topic || '') ||
              payloadInfo.eventType?.startsWith('randomDraft_') ||
              (typeof payloadInfo.payload === 'string' && /randomDraft/i.test(payloadInfo.payload));
            if (isDraftMqtt) {
              const entry = {
                type: 'mqtt-packet',
                timestamp: getNow(),
                direction,
                topic: packet.topic,
                qos: packet.qos,
                ...payloadInfo
              };
              if (typeof win.__hwaLegendDraftHook?.emitDraftLog === 'function') {
                win.__hwaLegendDraftHook.emitDraftLog(entry);
              } else {
                try {
                  win.postMessage(
                    {
                      source: 'hwa-helper-api',
                      kind: 'legend-draft-log-entry',
                      entry: {
                        ...entry,
                        id: `draft-log-${getNow()}-${Math.random().toString(36).slice(2, 7)}`,
                        isoTime: new Date().toISOString()
                      }
                    },
                    loc.origin
                  );
                } catch (_) {}
              }
            }
          }
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
      socket.addEventListener('close', () => {
        state.closed = true;
      });
      socket.addEventListener('message', (event: MessageEvent) => {
        if (!syntheticEvents.has(event)) observe(event.data, 'received', state);
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
