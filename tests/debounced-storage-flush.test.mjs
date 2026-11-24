import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupBackgroundRuntime,
  isPassiveEvent
} from '../src/background/backgroundRuntime.ts';

const gameSender = { url: 'https://www.hero-wars-alliance.com/' };

function makeSocketRecord(type, body, timestamp = '2026-11-21T02:00:00.000Z') {
  const payload = JSON.stringify({ method: 'msg', result: { type, body } });
  return {
    transport: 'websocket',
    method: 'PUBLISH',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    status: null,
    durationMs: 0,
    outcome: 'completed',
    timestamp,
    direction: 'received',
    topic: 'hwm/user/example',
    qos: 0,
    payload,
    payloadBytes: new TextEncoder().encode(payload).length,
    encoding: 'utf8',
    payloadTruncated: false,
    eventType: type
  };
}

function makeRpcRecord(calls, responses, timestamp = '2026-11-21T02:00:00.000Z', extra = {}) {
  return {
    transport: 'fetch',
    method: 'POST',
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200,
    durationMs: 50,
    outcome: 'completed',
    timestamp,
    requestBody: JSON.stringify({ calls }),
    responseBody: JSON.stringify({ results: responses }),
    ...extra
  };
}

function setupMockStorageEnv(debounceMs = 300) {
  let listener;
  const local = {};
  const setCalls = [];

  const chromeMock = {
    alarms: {
      get: (_name, cb) => cb(null),
      create: () => {},
      onAlarm: { addListener: () => {} }
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      query: (_filter, cb) => cb([]),
      reload: () => {},
      sendMessage: async () => {}
    },
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: '0.11.147' }),
      onMessage: { addListener: (cb) => { listener = cb; } },
      onInstalled: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return { ...local };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => Object.hasOwn(local, k)).map((k) => [k, local[k]]));
        },
        set: async (value) => {
          setCalls.push({ ...value });
          Object.assign(local, value);
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete local[k];
        }
      },
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    }
  };

  const bg = setupBackgroundRuntime({ chrome: chromeMock, rpcDebounceMs: debounceMs });

  const send = (record, sender = gameSender) =>
    new Promise((resolve) => listener({ kind: 'api-record', record }, sender, resolve));

  return { local, setCalls, bg, send, chrome: chromeMock };
}

test('isPassiveEvent distinguishes passive MQTT and march reads from user mutations', () => {
  // 1. Passive MQTT PUBLISH packet
  const mqttPacket = makeSocketRecord('chatMessage', {
    id: 1,
    userId: 7,
    chatType: 'clan',
    messageType: 'text',
    ctime: 1793890585,
    data: { text: 'hello' },
    user: { id: '7', name: 'Member' }
  });
  assert.equal(isPassiveEvent(mqttPacket), true);

  // 2. Passive March HTTP read
  const marchRead = makeRpcRecord(
    [{ name: 'getMarches', feature: 'march', ident: '1' }],
    [{ ident: '1', result: { response: { marches: [] } } }]
  );
  assert.equal(isPassiveEvent(marchRead), true);

  // 3. Explicit userAction flag overrides
  assert.equal(isPassiveEvent({ ...mqttPacket, userAction: true }), false);
  assert.equal(isPassiveEvent({ ...marchRead, direct: true }), false);

  // 4. Mutation / action RPCs
  const attackRpc = makeRpcRecord(
    [{ name: 'winCampBattle', feature: 'camp', ident: '1', args: { campId: 'camp1' } }],
    [{ ident: '1', result: { response: {} } }]
  );
  assert.equal(isPassiveEvent(attackRpc), false);

  const claimRpc = makeRpcRecord(
    [{ name: 'claimDailyQuest', feature: 'quest', ident: '1' }],
    [{ ident: '1', result: { response: {} } }]
  );
  assert.equal(isPassiveEvent(claimRpc), false);

  const upgradeRpc = makeRpcRecord(
    [{ name: 'upgradeHeroSkin', feature: 'hero', ident: '1' }],
    [{ ident: '1', result: { response: {} } }]
  );
  assert.equal(isPassiveEvent(upgradeRpc), false);
});

test('coalesces rapid passive MQTT events into a single debounced storage write', async () => {
  const env = setupMockStorageEnv(300);
  const nowSec = Math.floor(Date.now() / 1000);

  // Send 5 rapid MQTT chat messages
  for (let i = 1; i <= 5; i++) {
    const packet = makeSocketRecord(
      'chatMessage',
      {
        id: i,
        userId: 7,
        chatType: 'clan',
        messageType: 'text',
        ctime: nowSec + i,
        data: { text: `chat #${i}` },
        user: { id: '7', name: 'Member' }
      },
      new Date(Date.now() + i * 10).toISOString()
    );
    await env.send(packet);
  }

  // During debounce window (before flush), writes are buffered in RAM, 0 disk set calls
  const rpcWritesBefore = env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c);
  assert.equal(rpcWritesBefore.length, 0);

  // Trigger flush
  await env.bg.flushRpcCache();

  // Exactly 1 consolidated write should have occurred to disk
  const rpcWritesAfter = env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c);
  assert.equal(rpcWritesAfter.length, 1);
  assert.equal(env.local.guildChat.data.messages.length, 5);
});

test('user mutation flushes debounced passive buffer immediately without delay', async () => {
  const env = setupMockStorageEnv(300);
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Passive event buffered in debounce window
  const passivePacket = makeSocketRecord(
    'chatMessage',
    {
      id: 99,
      userId: 7,
      chatType: 'clan',
      messageType: 'text',
      ctime: nowSec,
      data: { text: 'buffered passive text' },
      user: { id: '7', name: 'Member' }
    },
    new Date().toISOString()
  );
  await env.send(passivePacket);
  assert.equal(env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c).length, 0);

  // 2. User mutation arrives: should trigger immediate flush
  const mutationRecord = makeRpcRecord(
    [{ name: 'winCampBattle', feature: 'camp', ident: 'camp1', args: { campId: 'camp1' } }],
    [{ ident: 'camp1', result: { response: { reward: [{ type: 'gold', id: 0, amount: 15000 }] } } }],
    new Date().toISOString(),
    { userAction: true }
  );
  await env.send(mutationRecord);

  // Immediate write must have executed
  const writesAfterMutation = env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c);
  assert.ok(writesAfterMutation.length >= 1);
  assert.ok(env.local.guildChat);
  assert.equal(env.local.guildChat.data.messages[0].data.text, 'buffered passive text');
});

test('drainPending flushes any pending debounced writes', async () => {
  const env = setupMockStorageEnv(300);
  const nowSec = Math.floor(Date.now() / 1000);

  const packet = makeSocketRecord(
    'chatMessage',
    {
      id: 101,
      userId: 7,
      chatType: 'clan',
      messageType: 'text',
      ctime: nowSec,
      data: { text: 'drain test' },
      user: { id: '7', name: 'Member' }
    }
  );
  await env.send(packet);
  assert.equal(env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c).length, 0);

  // Call drain
  await env.bg.drain();

  // Flushed
  assert.equal(env.setCalls.filter((c) => 'rpcCache' in c || 'guildChat' in c).length, 1);
  assert.equal(env.local.guildChat.data.messages[0].data.text, 'drain test');
});


test('api-record-batch merges multiple packets in one pass and emits immediate rpc-cache-delta to UI', async () => {
  let listener;
  const local = {};
  const setCalls = [];
  const runtimeMessages = [];

  const chromeMock = {
    alarms: {
      get: (_name, cb) => cb(null),
      create: () => {},
      onAlarm: { addListener: () => {} }
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      query: (_filter, cb) => cb([]),
      reload: () => {},
      sendMessage: async () => {}
    },
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: '0.11.233' }),
      onMessage: { addListener: (cb) => { listener = cb; } },
      onInstalled: { addListener: () => {} },
      sendMessage: async (msg) => { runtimeMessages.push(msg); }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return { ...local };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => Object.hasOwn(local, k)).map((k) => [k, local[k]]));
        },
        set: async (value) => {
          setCalls.push({ ...value });
          Object.assign(local, value);
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete local[k];
        }
      },
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    }
  };

  const bg = setupBackgroundRuntime({ chrome: chromeMock, rpcDebounceMs: 100 });
  const nowSec = Math.floor(Date.now() / 1000);
  const batch = [1, 2, 3, 4].map((i) =>
    makeSocketRecord(
      'chatMessage',
      {
        id: 500 + i,
        userId: 7,
        chatType: 'clan',
        messageType: 'text',
        ctime: nowSec + i,
        data: { text: `batch msg #${i}` },
        user: { id: '7', name: 'Member' }
      },
      new Date(Date.now() + i * 5).toISOString()
    )
  );

  await new Promise((resolve) =>
    listener({ kind: 'api-record-batch', records: batch }, gameSender, resolve)
  );

  // Instant UI delta must be emitted immediately (before disk debounce!)
  const deltaMsg = runtimeMessages.find((m) => m?.kind === 'rpc-cache-delta');
  assert.ok(deltaMsg, 'Must broadcast rpc-cache-delta immediately to open UI');
  assert.equal(deltaMsg.delta.guildChat.data.messages.length, 4);

  // Disk write is still debounced until flush
  assert.equal(setCalls.filter((c) => 'guildChat' in c).length, 0);

  await bg.flushRpcCache();
  assert.equal(setCalls.filter((c) => 'guildChat' in c).length, 1);
  assert.equal(local.guildChat.data.messages.length, 4);
});
