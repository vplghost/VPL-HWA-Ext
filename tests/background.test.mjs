import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const filterSource = await readFile(new URL('../extension/tracking-filter.js', import.meta.url), 'utf8');
const cacheSource = await readFile(new URL('../extension/rpc-cache.js', import.meta.url), 'utf8');
const refillRules = await readFile(new URL('../extension/refillable-rules.js', import.meta.url), 'utf8');
const experimentalSource = await readFile(new URL('../extension/experimental-data.js', import.meta.url), 'utf8');
const raidSource = await readFile(new URL('../extension/raid-queue.js', import.meta.url), 'utf8');
const monsterSource = await readFile(new URL('../extension/monster-queue.js', import.meta.url), 'utf8');
const towerAutomationSource = await readFile(new URL('../extension/tower-automation.js', import.meta.url), 'utf8');
const towerRunnerSource = await readFile(new URL('../extension/tower-runner.js', import.meta.url), 'utf8');
const dungeonAutomationSource = await readFile(new URL('../extension/dungeon-automation.js', import.meta.url), 'utf8');
const dungeonRunnerSource = await readFile(new URL('../extension/dungeon-runner.js', import.meta.url), 'utf8');
const buildingQueueSource = await readFile(new URL('../extension/building-queue.js', import.meta.url), 'utf8');
const researchQueueSource = await readFile(new URL('../extension/research-queue.js', import.meta.url), 'utf8');
const gameSender = { url: 'https://www.hero-wars-alliance.com/' };
const popupSender = { url: 'chrome-extension://test-extension/popup.html' };

test('confirmed Brigand victory refreshes authoritative energy only under enabled RPC policy', async () => {
  for (const mode of ['direct', 'piggyback', 'disabled', 'failed']) {
    const env = setup();
    env.local.popupRpcEnabled = mode !== 'disabled';
    env.local.socketRefreshMode = mode === 'direct' ? 'direct' : 'piggyback';
    const event = rpc([{ name: 'winCampBattle', feature: 'camp', ident: 'camp', args: {
      campId: 'camp-target', userHeroesIds: [79, 72, 16, 54, 60]
    } }], [{ ident: 'camp', result: mode === 'failed' ? { error: 'notEnoughEnergy' } :
      { response: { reward: [{ type: 'gold', id: 0, amount: 15000 }] } } }]);
    await env.send('api-record', event, { ...gameSender, tab: { id: 1 } });
    assert.equal(env.forwardedMessages.length, ['direct', 'piggyback'].includes(mode) ? 1 : 0);
    if (env.forwardedMessages.length) {
      const msg = env.forwardedMessages[0].msg;
      assert.equal(msg.kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
      assert.equal(JSON.stringify(msg.calls), JSON.stringify([
        { name: 'refillableGetAll', feature: 'refillable' }, { name: 'inventoryGet' }
      ]));
    }
  }
});

function setup(quota = Infinity) {
  let listener;
  let installed;
  const local = {};
  const session = {};
  const pick = (state, keys) => keys == null ? { ...state } :
    Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]]));
  const tabsList = [];
  const forwardedMessages = [];
  let reloadedTabId = null;
  let onTabRemoved;
  const chrome = {
    tabs: {
      onRemoved: { addListener: (handler) => { onTabRemoved = handler; } },
      query: (filter, cb) => cb(tabsList),
      reload: (tabId, opts, cb) => { reloadedTabId = tabId; if (cb) cb(); },
      sendMessage: async (tabId, msg) => { forwardedMessages.push({ tabId, msg }); }
    },
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: '0.9.117' }),
      onMessage: { addListener: (callback) => { listener = callback; } },
      onInstalled: { addListener: (callback) => { installed = callback; } }
    },
    storage: {
      local: {
        get: async (keys) => pick(local, keys),
        set: async (value) => { Object.assign(local, value); },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key]; }
      },
      session: {
        get: async (keys) => pick(session, keys),
        set: async (value) => {
          const next = { ...session, ...value };
          if (new TextEncoder().encode(JSON.stringify(next)).byteLength > quota) throw Error('QUOTA_BYTES exceeded');
          Object.assign(session, value);
        },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete session[key]; }
      }
    }
  };
  runInNewContext(`${filterSource}\n${refillRules}\n${cacheSource}\n${experimentalSource}\n${raidSource}\n${monsterSource}\n${towerAutomationSource}\n${towerRunnerSource}\n${dungeonAutomationSource}\n${dungeonRunnerSource}\n${buildingQueueSource}\n${researchQueueSource}\n${source}`, {
    chrome, URL, Date, console, Promise, Number, Array, TextEncoder, importScripts: () => {}
  });
  const send = (kind, record, sender = kind === 'api-record' ? gameSender : popupSender) =>
    new Promise((resolve) => listener({ kind, record }, sender, resolve));
  return { local, session, send, installed, listener, tabsList, forwardedMessages, removeTab: (id) => onTabRemoved(id), getReloadedTabId: () => reloadedTabId };
}

test('city queue Add persists until server acknowledgement and fresh idle summaries chain immediately', async t => {
  const now = Date.parse('2026-11-13T08:33:46Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  for (const type of ['building', 'research']) {
    const env = setup(), key = type + 'Queue', feature = type === 'building' ? 'building' : 'personalResearch';
    const idKey = type === 'building' ? 'buildingId' : 'researchId';
    env.tabsList.push({ id: 1, url: gameSender.url });
    env.local.popupRpcEnabled = true; env.local.socketRefreshMode = 'direct';
    const command = data => new Promise(resolve => env.listener({ kind: type + '-queue-action', ...data }, popupSender, resolve));
    const item = { [idKey]: 40, currentLevel: 1, nextLevel: 2, durationMs: 30000 };
    const added = await command({ action: 'add', item });
    assert.equal(added.ok, true);
    assert.equal(env.local[key].items.length, 1, 'Missing occupancy cannot consume an added item');
    assert.equal(env.forwardedMessages.at(-1).msg.calls[0].name, 'getSummary');
    assert.ok(env.local[key + 'Logs'].some(log => log.action === 'enqueue'));
    await Promise.all([command({ action: 'sync' }), command({ action: 'sync' })]);
    assert.equal(env.forwardedMessages.length, 1, 'Summary verification is throttled');
    const summary = (queues, levels = []) => rpc([{ name: 'getSummary', feature, ident: 'summary' }],
      [{ ident: 'summary', result: { response: { queues, [type === 'building' ? 'buildings' : 'completedResearches']: levels } } }],
      new Date(Date.now()).toISOString());
    await env.send('api-record', summary([]), { ...gameSender, tab: { id: 1 } });
    const sent = env.forwardedMessages.at(-1).msg.calls;
    assert.ok(sent.some(call => call.name === (type === 'building' ? 'startConstruction' : 'startResearch')));
    assert.equal(env.local[key].items.length, 1, 'Transport acknowledgement must not remove the item');
    assert.ok(env.local[key].pendingRequest);
    const count = env.forwardedMessages.length;
    await Promise.all([command({ action: 'sync' }), command({ action: 'sync' })]);
    assert.equal(env.forwardedMessages.length, count, 'Concurrent triggers cannot send duplicate starts');
    const calls = sent.map((call, i) => ({ ...call, ident: String(i) }));
    const responses = calls.map(call => ({ ident: call.ident, result: { response: call.name === 'getSummary'
      ? { queues: [{ [idKey]: 40, level: 2, startDate: now, durationMs: 30000 }] } : {} } }));
    await env.send('api-record', rpc(calls, responses, new Date(Date.now()).toISOString()), { ...gameSender, tab: { id: 1 } });
    assert.equal(env.local[key].items.length, 0);
    assert.ok(env.local[key + 'Logs'].some(log => log.action === 'start' && log.status === 'success'));
    await command({ action: 'add', item: { ...item, [idKey]: 41 } });
    env.local[key].wakeAt = now + 8 * 3600000; // A previous incorrect wait must not gate a new idle snapshot.
    await env.send('api-record', summary([], [{ [idKey]: 40, level: 2 }]), { ...gameSender, tab: { id: 1 } });
    assert.ok(env.forwardedMessages.at(-1).msg.calls.some(call => call.args?.[idKey] === 41 && call.name.startsWith('start')));
    const duplicate = await command({ action: 'add', item: { ...item, [idKey]: 41 } });
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /already queued/);
    assert.equal(env.local[key].items.length, 1);
    assert.ok(env.local[key + 'Logs'].some(log => log.action === 'error'));
  }
});

test('city queue stale waits are verified and completion is neither duplicated nor falsely logged', async t => {
  const now = Date.parse('2026-11-13T08:33:46Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  for (const type of ['building', 'research']) {
    const env = setup(), key = type + 'Queue', feature = type === 'building' ? 'building' : 'personalResearch';
    const idKey = type === 'building' ? 'buildingId' : 'researchId';
    env.tabsList.push({ id: 1, url: gameSender.url });
    env.local.popupRpcEnabled = true; env.local.socketRefreshMode = 'piggyback';
    env.local[key] = { enabled: true, items: [] };
    env.local.rpcCache = { [type + 'Status']: { method: 'getSummary', updatedAt: new Date(now - 120000).toISOString(),
      data: { queues: [{ [idKey]: 40, level: 2, startDate: now, durationMs: 8 * 3600000 }] } } };
    const command = () => new Promise(resolve => env.listener({ kind: type + '-queue-action', action: 'sync' }, popupSender, resolve));
    await command();
    assert.equal(env.forwardedMessages.length, 1);
    assert.equal(env.forwardedMessages[0].msg.kind, 'queue-rpc');
    assert.equal(env.forwardedMessages[0].msg.calls[0].name, 'getSummary');
    const summary = rpc([{ name: 'getSummary', feature, ident: 's' }],
      [{ ident: 's', result: { response: { queues: [{ [idKey]: 40, level: 2, startDate: now - 31000, duration: 30000 }] } } }],
      new Date(now).toISOString());
    await env.send('api-record', summary, { ...gameSender, tab: { id: 1 } });
    const dispatched = env.forwardedMessages.at(-1).msg.calls;
    assert.ok(dispatched[0].name.startsWith('complete'));
    assert.equal(env.local[key + 'Logs'].some(log => log.action === 'complete'), false);
    const count = env.forwardedMessages.length;
    await command(); await command();
    assert.equal(env.forwardedMessages.length, count);
    const calls = dispatched.map((call, i) => ({ ...call, ident: String(i) }));
    const result = rpc(calls, calls.map(call => ({ ident: call.ident,
      result: { response: call.name === 'getSummary' ? { queues: [] } : {} } })), new Date(now).toISOString());
    await env.send('api-record', result, { ...gameSender, tab: { id: 1 } });
    await env.send('api-record', result, { ...gameSender, tab: { id: 1 } });
    assert.equal(env.local[key + 'Logs'].filter(log => log.action === 'complete').length, 1);
  }
});

test('city queue timed-out dispatch is verified before retrying and retains its item', async t => {
  const now = Date.parse('2026-11-13T08:33:46Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const env = setup();
  env.tabsList.push({ id: 1, url: gameSender.url });
  env.local.popupRpcEnabled = true; env.local.socketRefreshMode = 'direct';
  env.local.rpcCache = { buildingStatus: { method: 'getSummary', updatedAt: new Date(now).toISOString(), data: { queues: [] } } };
  const command = data => new Promise(resolve => env.listener({ kind: 'building-queue-action', ...data }, popupSender, resolve));
  await command({ action: 'add', item: { buildingId: 40, currentLevel: 1, nextLevel: 2, durationMs: 30000 } });
  const oldStart = env.forwardedMessages[0].msg.calls.find(call => call.name === 'startConstruction').args.startDate;
  t.mock.timers.tick(120001);
  await command({ action: 'sync' });
  assert.equal(env.forwardedMessages.at(-1).msg.calls[0].name, 'getSummary');
  assert.equal(env.local.buildingQueue.items.length, 1);
  const summary = rpc([{ name: 'getSummary', feature: 'building', ident: 'recheck' }],
    [{ ident: 'recheck', result: { response: { queues: [] } } }], new Date(Date.now()).toISOString());
  await env.send('api-record', summary, { ...gameSender, tab: { id: 1 } });
  const retry = env.forwardedMessages.at(-1).msg.calls.find(call => call.name === 'startConstruction');
  assert.ok(retry.args.startDate > oldStart);
  assert.equal(env.local.buildingQueue.items.length, 1);
});

test('city queue rejected starts retain targets and never fabricate occupancy or success', async t => {
  const now = Date.parse('2026-11-13T08:33:46Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  for (const type of ['building', 'research']) {
    const env = setup(), key = type + 'Queue', feature = type === 'building' ? 'building' : 'personalResearch';
    const idKey = type === 'building' ? 'buildingId' : 'researchId';
    env.tabsList.push({ id: 1, url: gameSender.url });
    env.local.popupRpcEnabled = true; env.local.socketRefreshMode = 'direct';
    env.local.rpcCache = { [type + 'Status']: { method: 'getSummary', updatedAt: new Date(now).toISOString(), data: { queues: [] } } };
    await new Promise(resolve => env.listener({ kind: type + '-queue-action', action: 'add',
      item: { [idKey]: 40, currentLevel: 1, nextLevel: 2, durationMs: 30000 } }, popupSender, resolve));
    const calls = env.forwardedMessages.at(-1).msg.calls.map((call, i) => ({ ...call, ident: String(i) }));
    await env.send('api-record', rpc(calls, calls.map(call => ({ ident: call.ident,
      result: call.name.startsWith('start') ? { error: 'Not enough resources', response: {} } : { response: { queues: [] } } })),
      new Date(now).toISOString()), { ...gameSender, tab: { id: 1 } });
    assert.equal(env.local[key].items.length, 1);
    assert.equal(env.local.rpcCache[type + 'Status'].data.queues.length, 0);
    assert.equal(env.local[key + 'Logs'].some(log => log.action === 'start' && log.status === 'success'), false);
    assert.ok(env.local[key + 'Logs'].some(log => log.status === 'error' && log.message.includes('Not enough resources')));
  }
});

test('city queue invalid adds are logged and shared RPC settings never discard saved work', async () => {
  const env = setup();
  const command = data => new Promise(resolve => env.listener({ kind: 'building-queue-action', ...data }, popupSender, resolve));
  assert.equal((await command({ action: 'add', item: { buildingId: NaN } })).ok, false);
  assert.ok(env.local.buildingQueueLogs.some(log => log.action === 'error'));
  assert.equal(env.local.buildingQueue, undefined);
  const reply = await command({ action: 'add', item: { buildingId: 40, currentLevel: 1, nextLevel: 2, durationMs: 30000 } });
  assert.equal(reply.ok, true);
  assert.equal(env.local.buildingQueue.items.length, 1);
  assert.equal(env.forwardedMessages.length, 0);
});

test('RPC queue totals aggregate live game tabs and remove closed tabs', async () => {
  const { local, listener, removeTab } = setup();
  const report = (id, count) => new Promise((resolve) => listener({ kind: 'rpc-queue-status', count },
    { ...gameSender, tab: { id } }, resolve));
  await report(1, 3); await report(2, 2);
  assert.equal(local.rpcQueueStatus.count, 5);
  await report(1, 0);
  assert.equal(local.rpcQueueStatus.count, 2);
  removeTab(2);
  await report(1, 0);
  assert.equal(local.rpcQueueStatus.count, 0);
});

test('managed raid queue uses shared policy, pins one game tab and waits for return across popup closure', async () => {
  for (const mode of ['piggyback', 'mqtt-piggyback', 'direct']) {
    const env = setup();
    const { local, tabsList, forwardedMessages, listener } = env;
    local.popupRpcEnabled = true; local.socketRefreshMode = mode;
    tabsList.push({ id: 1, url: gameSender.url }, { id: 2, url: gameSender.url });
    const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { level: 30, star: 2, power: 100 }]));
    const capacities = Object.fromEntries(Object.keys(heroes).map((id) => [id, { count: 600, signature: JSON.stringify([30, 2, 100]) }]));
    local.troopCapacitySettings = { defaultHero: 700, base: 1000 };
    local.rpcCache = { accountStatus: { data: { id: 10 } }, heroGetAll: { data: heroes },
      'getUnitSummary:unit': { data: { squads: [], available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) } },
      experimentalRallySearch: { data: { mapId: 'map', mobConfigIds: [60], mobs: [{ mobId: 'boss' }] } } };
    const invoke = (message, sender = popupSender) => new Promise((resolve) => listener(message, sender, resolve));
    const response = await invoke({ kind: 'raid-queue-start', options: {
      mapId: 'map', center: { x: 1, y: 2 }, level: 1, heroIds: [1, 2, 3, 4, 5], capacities,
      baseTroops: 200, waitSeconds: 60, minMembers: 4, autoCancel: true, count: 2, firstMobId: 'boss'
    } });
    assert.equal(response.ok, true);
    assert.equal(forwardedMessages[0].tabId, 1);
    assert.equal(forwardedMessages[0].msg.kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
    assert.equal(forwardedMessages[0].msg.calls[0].name, 'createRally');
    assert.equal(forwardedMessages[0].msg.calls[0].args.mobId, 'boss');
    assert.equal(forwardedMessages[0].msg.calls[0].args.squad.units.reduce((sum, unit) => sum + unit.count, 0), 4500);
    let clock = Date.now() + 1000;
    const answer = async (bodies) => {
      const calls = forwardedMessages.at(-1).msg.calls.map((call, ident) => ({ ...call, ident: String(ident) }));
      await env.send('api-record', rpc(calls, bodies.map((body, ident) => ({ ident: String(ident), result: { response: body } })),
        new Date(clock++).toISOString()), { ...gameSender, tab: { id: 1 } });
    };
    await answer([{ squadId: 'squad', rally: { rallyId: 'rally', plannedStartTime: clock + 60000 } }]);
    assert.equal(local.raidQueue.phase, 'active');
    await env.send('api-record', socket('mobRallyAttackResult', { rallyId: 'rally', squadId: 'squad',
      battleResult: { battleResult: 'win' } }, new Date(clock++).toISOString()), { ...gameSender, tab: { id: 2 } });
    assert.equal(local.raidQueue.current.result, undefined, 'another game tab cannot advance the queue');
    await env.send('api-record', socket('mobRallyAttackResult', { rallyId: 'rally', squadId: 'squad',
      battleResult: { battleResult: 'win' } }, new Date(clock++).toISOString()), { ...gameSender, tab: { id: 1 } });
    assert.equal(local.raidQueue.completed, 0);
    await env.send('api-record', socket('returnFromMobCompleted', { squadId: 'squad' }, new Date(clock++).toISOString()),
      { ...gameSender, tab: { id: 1 } });
    assert.equal(local.raidQueue.completed, 1); assert.equal(local.raidQueue.phase, 'refreshing');
    assert.equal(forwardedMessages.at(-1).msg.calls[0].name, 'heroGetAll');
    local.popupRpcEnabled = false;
    await invoke({ kind: 'raid-queue-tick' }, { ...gameSender, tab: { id: 1 } });
    assert.equal(local.raidQueue.phase, 'stopped');
    assert.equal(forwardedMessages.at(-1).msg.kind, 'drop-rpc-group');
  }
});

test('monster queue dispatches one attack at a time and stops after a correlated loss', async () => {
  const env = setup();
  const { local, tabsList, forwardedMessages, listener } = env;
  local.popupRpcEnabled = true; local.socketRefreshMode = 'direct';
  tabsList.push({ id: 1, url: gameSender.url });
  local.rpcCache = { accountStatus: { data: { id: 10 } },
    heroGetAll: { data: Object.fromEntries([1, 2, 3, 4, 5].map((id) =>
      [id, { level: 30, star: 2, power: 100, troopCapacity: 500 }])) },
    'getUnitSummary:unit': { data: { available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) } },
    experimentalSoloSearch: { data: { mapId: 'map', mobConfigIds: [37, 67],
      mobs: [{ mobId: 'mob-a' }, { mobId: 'mob-b' }] } },
    'resource:world-energy': { data: { amount: 100 } } };
  const invoke = (message, sender = popupSender) => new Promise((resolve) => listener(message, sender, resolve));
  const response = await invoke({ kind: 'monster-queue-start', options: {
    mapId: 'map', center: { x: 1, y: 2 }, level: 15, heroIds: [1, 2, 3, 4, 5],
    firstMobId: 'mob-a', count: 2
  } });
  assert.equal(response.ok, true);
  assert.equal(forwardedMessages.at(-1).msg.calls[0].name, 'attackMob');
  assert.equal(forwardedMessages.at(-1).msg.calls[0].args.mobId, 'mob-a');
  const answer = async (bodies) => {
    const calls = forwardedMessages.at(-1).msg.calls.map((call, ident) => ({ ...call, ident: String(ident) }));
    await env.send('api-record', rpc(calls, bodies.map((body, ident) => ({ ident: String(ident), result: { response: body } })),
      new Date(Date.now() + 1000).toISOString()), { ...gameSender, tab: { id: 1 } });
  };
  await answer([{ squadId: 'squad-a', route: { routeId: 'route-a', startedAt: Date.now(), durationMs: 1000 } }]);
  assert.equal(local.monsterQueue.phase, 'active');
  const count = forwardedMessages.length;
  await env.send('api-record', socket('mobSoloAttackResult', { squadId: 'wrong', mobId: 'mob-a',
    battleResult: { battleResult: 'win' } }, new Date(Date.now() + 2000).toISOString()),
  { ...gameSender, tab: { id: 1 } });
  assert.equal(forwardedMessages.length, count);
  await env.send('api-record', socket('mobSoloAttackResult', { squadId: 'squad-a', mobId: 'mob-a', mobConfigId: 67,
    battleResult: { battleResult: 'win' } }, new Date(Date.now() + 3000).toISOString()),
  { ...gameSender, tab: { id: 1 } });
  assert.equal(local.monsterQueue.completed, 0);
  await env.send('api-record', socket('returnFromMobCompleted', { squadId: 'squad-a' },
    new Date(Date.now() + 4000).toISOString()), { ...gameSender, tab: { id: 1 } });
  assert.equal(local.monsterQueue.completed, 1);
  assert.equal(forwardedMessages.at(-1).msg.calls[0].name, 'heroGetAll');
  await answer([local.rpcCache.heroGetAll.data, local.rpcCache['getUnitSummary:unit'].data]);
  assert.equal(local.monsterQueue.phase, 'attacking', JSON.stringify(local.monsterQueue));
  assert.equal(forwardedMessages.at(-1).msg.calls[0].args.mobId, 'mob-b');
  await answer([{ squadId: 'squad-b', route: { routeId: 'route-b', startedAt: Date.now(), durationMs: 1000 } }]);
  await env.send('api-record', socket('mobSingleAttackResult', { squadId: 'squad-b', mobId: 'mob-b', mobConfigId: 67,
    battleResult: { battleResult: 'lose' } }, new Date(Date.now() + 5000).toISOString()),
  { ...gameSender, tab: { id: 1 } });
  assert.equal(local.monsterQueue.phase, 'stopped');
  assert.match(local.monsterQueue.reason, /lost/);
  assert.equal(forwardedMessages.at(-1).msg.kind, 'drop-rpc-group');
});

test('cancel queue clears pending bosses without sending cancelRally for the active raid', async () => {
  const { local, listener, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  local.raidQueue = { id: 'raid:1', tabId: 1, accountId: 10, phase: 'active',
    bossQueue: { remain_raid_count: 2, queue: [{ mobId: 'boss-a' }, { mobId: 'boss-b' }] },
    current: { rallyId: 'rally-a', squadId: 'squad-a', mobId: 'boss-a' } };
  const reply = await new Promise((resolve) => listener({ kind: 'raid-queue-stop' }, popupSender, resolve));
  assert.equal(reply.ok, true);
  assert.equal(local.raidQueue.phase, 'stopped');
  assert.equal(local.raidQueue.bossQueue, null);
  assert.equal(local.raidQueue.current.rallyId, 'rally-a');
  assert.deepEqual(Array.from(forwardedMessages, ({ msg }) => msg.kind), ['drop-rpc-group']);
});

function rpc(calls, results, timestamp = '2026-11-01T09:18:28.248Z') {
  return {
    transport: 'fetch', method: 'POST', endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    status: 200, durationMs: 3, outcome: 'completed', timestamp,
    requestBody: JSON.stringify({ calls }), responseBody: JSON.stringify({ results })
  };
}

function getRecord(index) {
  return {
    transport: 'fetch', method: 'GET',
    endpoint: `https://www.hero-wars-alliance.com/api/test?token=${index}#fragment`,
    status: 200, durationMs: index, outcome: 'completed',
    timestamp: new Date(2026, 10, 1, 0, 0, index).toISOString()
  };
}

function socket(type, body, timestamp = '2026-11-05T14:56:24.426Z') {
  const payload = JSON.stringify({ method: 'msg', result: { type, body } });
  return { transport: 'websocket', method: 'PUBLISH',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    status: null, durationMs: 0, outcome: 'completed', timestamp,
    direction: 'received', topic: 'hwm/user/example', qos: 0,
    payload, payloadBytes: new TextEncoder().encode(payload).length,
    encoding: 'utf8', payloadTruncated: false, eventType: type };
}

test('passive cache updates Energy and World Energy without recording or account data', async () => {
  const { local, session, send } = setup();
  const record = rpc([
    { name: 'userGetInfo', ident: 1 },
    { name: 'refillableGetAll', feature: 'refillable', ident: 2 }
  ], [
    { ident: 1, result: { response: { id: 'private-id', name: 'private-name',
      refillable: [{ id: 1, amount: 42 }] } } },
    { ident: 2, result: { response: { refillables: [{ refillableId: 2, amount: 44 }] } } }
  ]);
  const result = await send('api-record', record);
  assert.equal(result.saved, false);
  assert.equal(result.cached, true);
  assert.equal(local.rpcCache.energyStatus.data.energy, 42);
  assert.equal(local.rpcCache.worldEnergyStatus.data.energy, 44);
  assert.equal(JSON.stringify(local).includes('private-id'), false);
  assert.equal('apiRecords' in local, false);
  assert.equal(Object.keys(session).length, 0);
});

test('game interactions persist locally only while recording and export beside API records', async () => {
  const { local, session, send, listener } = setup();
  const entry = { category: 'pointer', action: 'pointerdown', timestamp: '2026-11-04T07:00:00.000Z',
    target: 'canvas#unity-canvas', x: 42, y: 60, privateValue: 'must not persist' };
  const sendInteraction = () => new Promise((resolve) =>
    listener({ kind: 'record-interaction', entry }, gameSender, resolve));
  assert.equal((await sendInteraction()).saved, false);
  await send('record-start');
  assert.equal(local.gameRecordingActive, true);
  assert.equal((await sendInteraction()).saved, true);
  assert.equal(local['interaction:0'].target, 'canvas#unity-canvas');
  assert.equal(JSON.stringify(local).includes('must not persist'), false);
  assert.equal(session.recordingState.nextInteractionIndex, 1);
  const exported = await send('record-export');
  assert.equal(exported.interactions.length, 1);
  assert.equal(exported.extensionVersion, '0.9.117');
  await send('record-stop');
  assert.equal(local.gameRecordingActive, false);
  assert.equal((await sendInteraction()).saved, false);
  assert.equal((await send('record-export')).interactions.length, 1);
  assert.equal((await send('record-export')).extensionVersion, '0.9.117');
  await send('record-clear');
  assert.equal(Object.hasOwn(local, 'interaction:0'), false);
});

test('empty event quest claim requests authoritative resource and item snapshots once', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  const claim = rpc([{ name: 'completeQuest', feature: 'quest', ident: 'claim', args: { questId: 14360 } }],
    [{ ident: 'claim', result: { response: {} } }], '2026-11-03T14:55:01.620Z');
  const sender = { ...gameSender, tab: { id: 42 } };
  await send('api-record', claim, sender);
  assert.equal(local.rpcCache.questClaimStatus.data.claims[0].needsSync, true);
  assert.equal(forwardedMessages.length, 1);
  assert.deepEqual(Array.from(forwardedMessages[0].msg.calls, (call) => call.name),
    ['userGetInfo', 'inventoryGet', 'refillableGetAll']);
  await send('api-record', claim, sender);
  assert.equal(forwardedMessages.length, 1);
});

test('api-record safely handles object-shaped questClaimStatus claims without TypeError', async () => {
  const { local, send } = setup();
  local.popupRpcEnabled = true;
  local.rpcCache = {
    questClaimStatus: {
      key: 'questClaimStatus',
      data: {
        claims: {
          '0': { id: 14360, token: 'claim-1', needsSync: false, at: '2026-11-03T14:50:00.000Z' }
        }
      }
    }
  };
  const dummy = rpc([{ name: 'userGetInfo', ident: 'u-1' }], [{ ident: 'u-1', result: { response: { id: 1 } } }], '2026-11-03T14:55:01.620Z');
  const res = await send('api-record', dummy, { ...gameSender, tab: { id: 42 } });
  assert.equal(res.cached, true);
});

test('confirmed healing completion refreshes authoritative troop state in each shared dispatch mode', async () => {
  for (const mode of ['direct', 'piggyback', 'mqtt-piggyback']) {
    const { local, send, forwardedMessages } = setup();
    const completeDate = 1794552240233;
    local.popupRpcEnabled = true;
    local.socketRefreshMode = mode;
    local.rpcCache = { 'getHealing:unit': { data: {
      injuredUnits: [{ unitId: 7, count: 2 }],
      healing: { startDate: completeDate - 20000, duration: 8000, units: [{ unitId: 7, count: 1 }] }
    } } };
    const record = rpc([{ name: 'completeHealing', feature: 'unit', args: { completeDate }, ident: 'heal-done' }],
      [{ ident: 'heal-done', result: { response: {} } }], '2026-11-13T06:44:00.882Z');
    await send('api-record', record, { ...gameSender, tab: { id: 7 } });
    assert.equal(local.rpcCache['getHealing:unit'].data.healing, null);
    assert.equal(forwardedMessages.length, 1);
    assert.equal(forwardedMessages[0].tabId, 7);
    assert.equal(forwardedMessages[0].msg.kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
    assert.deepEqual(Array.from(forwardedMessages[0].msg.calls, call => call.name),
      ['getUnitSummary', 'getTrainings', 'getHealing']);
    await send('api-record', record, { ...gameSender, tab: { id: 7 } });
    assert.equal(forwardedMessages.length, 1, 'Duplicate completion must not schedule another refresh');
  }
});

test('skin upgrade requests fresh hero stats and stone balances once', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  const upgrade = rpc([{ name: 'skin_upgrade', ident: 'skin-1',
    args: { unitId: 501, skinId: 1002 } }],
  [{ ident: 'skin-1', result: { response: { reward: [] } } }],
  '2026-11-03T16:17:52.563Z');
  const sender = { ...gameSender, tab: { id: 42 } };
  await send('api-record', upgrade, sender);
  assert.equal(Object.keys(local.rpcCache.resourceActionHistory.data).length, 1);
  assert.deepEqual(Array.from(forwardedMessages[0].msg.calls, (call) => call.name),
    ['heroGetAll', 'inventoryGet']);
  await send('api-record', upgrade, sender);
  assert.equal(forwardedMessages.length, 1);
});

test('popup RPC calls and automatic follow-up refreshes are disabled by default', async () => {
  const { local, send, listener, tabsList, forwardedMessages } = setup();
  tabsList.push({ id: 42, url: gameSender.url });
  for (const message of [
    { kind: 'refresh-rpc', calls: [{ name: 'inventoryGet' }] },
    { kind: 'draft-action', action: 'saveDefence', heroes: [1, 2, 3, 4, 5] },
    { kind: 'engine-send-message', method: 'test' }
  ]) {
    const reply = await new Promise((resolve) => listener(message, popupSender, resolve));
    assert.equal(reply.ok, false);
  }
  assert.equal(forwardedMessages.length, 0);

  const claim = rpc([{ name: 'completeQuest', feature: 'quest', ident: 'claim-off',
    args: { questId: 14360 } }],
  [{ ident: 'claim-off', result: { response: {} } }], '2026-11-03T14:55:01.620Z');
  await send('api-record', claim, { ...gameSender, tab: { id: 42 } });
  assert.equal(local.rpcCache.questClaimStatus.data.claims[0].id, 14360);
  assert.equal(forwardedMessages.length, 0);

  local.popupRpcEnabled = true;
  const allowed = await new Promise((resolve) => listener({ kind: 'refresh-rpc',
    calls: [{ name: 'inventoryGet' }] }, popupSender, resolve));
  assert.equal(allowed.ok, true);
  assert.equal(forwardedMessages.length, 1);
});

test('experimental actions require popup RPC and reach one game tab', async () => {
  const { local, listener, tabsList, forwardedMessages } = setup();
  tabsList.push({ id: 1, url: gameSender.url }, { id: 2, url: gameSender.url });
  const call = { name: 'stopMineGathering', feature: 'mine', args: { squadId: 'team-1' } };
  const send = (calls) => new Promise((resolve) => listener({ kind: 'experimental-rpc', calls }, popupSender, resolve));
  assert.equal((await send([call])).ok, false);
  local.popupRpcEnabled = true;
  assert.equal((await send([{ name: 'unknown', feature: 'mob' }])).ok, false);
  assert.equal((await send([call])).ok, true);
  assert.equal((await send([{ name: 'createRally', feature: 'mob', args: {
    mapId: 'map-1', mobId: 'boss-1', squad: {}, startDelay: 300000
  } }])).ok, true);
  assert.equal(forwardedMessages.length, 2);
  assert.equal(forwardedMessages[0].tabId, 1);
  assert.equal(forwardedMessages[0].msg.kind, 'queue-rpc');
});

test('manual refresh, Draft and Experimental inherit both global dispatch modes', async () => {
  for (const mode of ['piggyback', 'direct', 'mqtt-piggyback']) {
    const { local, listener, tabsList, forwardedMessages, send } = setup();
    tabsList.push({ id: 1, url: gameSender.url }, { id: 2, url: gameSender.url });
    local.popupRpcEnabled = true;
    local.socketRefreshMode = mode;
    const messages = [
      { kind: 'refresh-rpc', calls: [{ name: 'inventoryGet' }] },
      { kind: 'draft-action', action: 'saveAttack', heroes: [1, 2, 3, 4, 5] },
      { kind: 'experimental-rpc', calls: [{ name: 'createRally', feature: 'mob', args: { startDelay: 300000 } }] }
    ];
    for (const message of messages) {
      const reply = await new Promise((resolve) => listener(message, popupSender, resolve));
      assert.equal(reply.ok, true);
      assert.equal(reply.queued, mode !== 'direct');
    }
    assert.equal(forwardedMessages.length, 3);
    assert.ok(forwardedMessages.every(({ tabId, msg }) => tabId === 1 &&
      msg.kind === (mode === 'direct' ? 'refresh-rpc' : 'queue-rpc')));
    assert.equal(forwardedMessages[1].msg.calls[0].name, 'randomDraft_saveAttack');
    await send('api-record', rpc([{ name: 'skin_upgrade', ident: 'skin-policy',
      args: { unitId: 501, skinId: 1002 } }],
    [{ ident: 'skin-policy', result: { response: { reward: [] } } }]),
    { ...gameSender, tab: { id: 1 } });
    assert.equal(forwardedMessages.at(-1).msg.kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
    assert.equal(forwardedMessages.at(-1).msg.calls[0].name, 'heroGetAll');
    await send('api-record', rpc([{ name: 'completeQuest', feature: 'quest', ident: 'quest-policy',
      args: { questId: 14360 } }], [{ ident: 'quest-policy', result: { response: {} } }]),
    { ...gameSender, tab: { id: 1 } });
    assert.equal(forwardedMessages.at(-1).msg.kind, mode === 'direct' ? 'refresh-rpc' : 'queue-rpc');
    assert.equal(forwardedMessages.at(-1).msg.calls[0].name, 'userGetInfo');
    local.captureSettings = { interceptEnabled: false };
    const reply = await new Promise((resolve) => listener(messages[0], popupSender, resolve));
    assert.equal(reply.ok, mode === 'direct');
  }
});

test('reward claims follow dispatch mode and target one game tab', async () => {
  const { local, listener, tabsList, forwardedMessages } = setup();
  tabsList.push({ id: 42, url: gameSender.url }, { id: 43, url: gameSender.url });
  const claim = { kind: 'claim-rewards', calls: [
    { name: 'mailFarm', args: { letterIds: [501] } }, { name: 'mailGetAll', args: {} }
  ] };
  const sendClaim = () => new Promise((resolve) => listener(claim, popupSender, resolve));
  assert.equal((await sendClaim()).ok, false);
  local.popupRpcEnabled = true;
  const queued = await sendClaim();
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, true);
  assert.equal(forwardedMessages.length, 1);
  assert.equal(forwardedMessages[0].msg.kind, 'queue-claim');
  assert.equal(local.claimRpcStatus.state, 'queued');
  local.socketRefreshMode = 'direct';
  const direct = await sendClaim();
  assert.equal(direct.ok, true);
  assert.equal(direct.queued, false);
  assert.equal(forwardedMessages.length, 2);
  assert.equal(forwardedMessages[1].msg.kind, 'refresh-rpc');
  assert.equal(forwardedMessages[1].tabId, 42);
  local.socketRefreshMode = 'piggyback';
  local.captureSettings = { interceptEnabled: false };
  assert.equal((await sendClaim()).ok, false);
  assert.equal(forwardedMessages.length, 2);
});

test('Record and Stop keep an uncapped session log and never write raw records locally', async () => {
  const { local, session, send } = setup();
  local.apiRecords = [{ legacy: true }];
  local.captureSettings = { interceptEnabled: false, logEnabled: true };
  const started = await send('record-start');
  assert.equal(started.active, true);
  assert.equal(local.captureSettings.interceptEnabled, true);
  assert.equal('apiRecords' in local, false);
  for (let index = 0; index < 501; index++) {
    const result = await send('api-record', getRecord(index));
    assert.equal(result.saved, true);
  }
  assert.equal(session.recordingState.nextIndex, 501);
  assert.equal(Object.keys(session).filter((key) => key.startsWith('record:')).length, 501);
  assert.equal(session['record:500'].endpoint, 'https://www.hero-wars-alliance.com/api/test');
  assert.equal('apiRecords' in local, false);
  await send('record-stop');
  assert.equal((await send('api-record', getRecord(502))).saved, false);
  assert.equal(session.recordingState.nextIndex, 501);
  await send('record-clear');
  assert.equal(Object.keys(session).filter((key) => key.startsWith('record:')).length, 0);
});

test('unrecognized MQTT PUBLISH is recorded only during Record', async () => {
  const { local, session, send, listener } = setup();
  const frame = { transport: 'websocket', method: 'PUBLISH',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt?secret=hidden',
    status: null, durationMs: 0, outcome: 'completed', timestamp: '2026-11-05T00:00:00.000Z',
    direction: 'received', topic: 'hero/update', qos: 1, payload: '{"id":1}',
    encoding: 'utf8', payloadBytes: 8, payloadTruncated: false,
    eventMethod: 'msg', eventType: 'rallyCreated' };
  assert.equal((await send('api-record', frame)).saved, false);
  await send('record-start');
  assert.equal((await send('api-record', frame)).saved, true);
  assert.equal(session['record:0'].endpoint, 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt');
  assert.equal(session['record:0'].topic, 'hero/update');
  assert.equal(session['record:0'].payload, '{"id":1}');
  assert.equal(session['record:0'].eventType, 'rallyCreated');
  assert.equal('rpcCache' in local, false);
  assert.equal(listener({ kind: 'api-record', record: { ...frame, endpoint: 'wss://other.example/mqtt' } },
    gameSender, () => {}), undefined);
  assert.equal(session.recordingState.nextIndex, 1);
});

test('MQTT pushes update rally return, report, quest, and guild chat without recording', async () => {
  const { local, session, send } = setup();
  await send('api-record', rpc([{ name: 'getMarches', feature: 'march', ident: 'march' }],
    [{ ident: 'march', result: { response: { marches: {
      moveToTargetInRally: [{ squadId: 'squad-1', targetType: 'mob',
        route: { startedAt: 1793890538294, durationMs: 45721 } }]
    } } } }], '2026-11-05T14:56:04.085Z'));
  const result = await send('api-record', socket('mobRallyAttackResult', {
    rallyId: 'rally-1', squadId: 'squad-1', mobConfigId: 75,
    battleResult: { battleResult: 'win' },
    routeToOutpost: { startedAt: 1793890584360, durationMs: 68380 }
  }));
  assert.equal(result.saved, false);
  assert.equal(result.cached, true);
  const march = local.rpcCache.marchStatus.data.marches[0];
  assert.equal(march.stage, 'returnToOutpost');
  assert.equal(march.endsAt, 1793890652740);
  assert.equal(march.rally.id, 'rally-1');
  assert.equal(march.result, 'win');

  await send('api-record', socket('newReport', {
    reportId: 'report-1', type: 'rallyMobAttackResult'
  }, '2026-11-05T14:56:24.488Z'));
  assert.equal(local.rpcCache.mailStatus.data.unclaimedReportsCount, 1);
  assert.equal(local.rpcCache.mailStatus.data.reports[0].id, 'report-1');

  await send('api-record', socket('specialQuestEvents', {
    events: [{ id: 100, groups: [{ id: 1, quests: [{ id: 2, state: 'completed' }] }] }]
  }, '2026-11-05T14:56:25.000Z'));
  assert.equal(local.rpcCache.specialQuestStatus.data.events[0].groups[0].quests[0].state,
    'completed');

  await send('api-record', socket('chatMessage', { id: 42, userId: 7,
    chatType: 'clan', messageType: 'text', ctime: 1793890585,
    data: { text: 'hello' }, user: { id: '7', name: 'Member' }
  }, '2026-11-05T14:56:25.001Z'));
  assert.equal(local.rpcCache.guildChat.data.messages[0].data.text, 'hello');
  assert.equal(local.rpcCache.guildChat.data.users['7'].name, 'Member');

  await send('api-record', socket('returnFromMobCompleted', { squadId: 'squad-1' },
    '2026-11-05T14:57:33.027Z'));
  assert.equal(local.rpcCache.marchStatus.data.marches.length, 0);
  assert.equal(Object.keys(session).length, 0);
});

test('metadata-only MQTT pushes request authoritative RPC only when enabled', async () => {
  const { local, send, forwardedMessages } = setup();
  const sender = { ...gameSender, tab: { id: 42 } };
  await send('api-record', socket('randomDraft_statusChanged', {}), sender);
  assert.equal(forwardedMessages.length, 0);
  local.popupRpcEnabled = true;
  for (const type of ['randomDraft_statusChanged', 'newReport', 'questUpdateAll',
    'rallyCompleted']) {
    await send('api-record', socket(type, type === 'newReport' ?
      { reportId: 'report-1' } : {}), sender);
  }
  assert.deepEqual(forwardedMessages.map((item) =>
    Array.from(item.msg.calls, (call) => call.name)),
    [['randomDraft_getInfo'], ['getPage'],
      ['getDailyQuests', 'getSpecialQuestState', 'questGetAll', 'questGetEvents'], ['getMarches']]);
  assert.ok(forwardedMessages.every((item) => item.msg.kind === 'queue-rpc'));
  local.socketRefreshMode = 'direct';
  await send('api-record', socket('randomDraft_statusChanged', {},
    '2026-11-05T14:57:40.389Z'), sender);
  assert.equal(forwardedMessages.at(-1).msg.kind, 'refresh-rpc');
});

test('full special quest MQTT snapshot updates cache without dispatching a duplicate RPC', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  const result = await send('api-record', socket('specialQuestEvents', {
    events: [{ id: 100273, start: 0, end: Date.now() + 86400000, viewId: 65,
      groups: [{ id: 1070, hide: false, quests: [{ id: 11241, state: 'inProgress', progress: 5 }] }] }]
  }), { ...gameSender, tab: { id: 42 } });
  assert.equal(result.cached, true);
  assert.equal(local.rpcCache.specialQuestStatus.data.events[0].groups[0].quests[0].progress, 5);
  assert.equal(forwardedMessages.length, 0);
});

test('rally result push can create a return march and ignores sent or binary data', async () => {
  const { local, send } = setup();
  const result = socket('mobRallyAttackResult', { rallyId: 'rally-2',
    squadId: 'squad-2', routeToOutpost: { startedAt: 1000, durationMs: 8000 }
  });
  await send('api-record', { ...result, direction: 'sent' });
  await send('api-record', { ...result, encoding: 'base64', payload: 'AA==' });
  assert.equal('rpcCache' in local, false);
  await send('api-record', result);
  assert.equal(local.rpcCache.marchStatus.data.marches[0].endsAt, 9000);
});

test('auto-join push starts a rally march and refreshes its details', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  const sender = { ...gameSender, tab: { id: 42 } };
  await send('api-record', socket('rallyUserAutojoined', {
    rallyId: 'rally-3', squad: { squadId: 'squad-3',
      heroes: [{ heroId: 16 }], units: [{ unitId: 7, count: 100 }] },
    route: { startedAt: 1000, durationMs: 3000 }
  }), sender);
  const march = local.rpcCache.marchStatus.data.marches[0];
  assert.equal(march.stage, 'moveToRallyLeader');
  assert.equal(march.endsAt, 4000);
  assert.equal(march.rally.team.heroIds[0], 16);
  assert.deepEqual(Array.from(forwardedMessages[0].msg.calls, (call) => call.name),
    ['getRallyById', 'getMarches']);
  await send('api-record', socket('rallyMembersUpdated', { rallyId: 'rally-3' },
    '2026-11-05T14:56:25.000Z'), sender);
  assert.deepEqual(Array.from(forwardedMessages[1].msg.calls, (call) => call.name),
    ['getRallyById']);
});

test('priority auto-join joins guild rally when boss level meets or exceeds threshold', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  local.priorityAutoJoin = { enabled: true, minLevel: 15 };
  local.troopCapacitySettings = { defaultHero: 700, base: 1000 };
  const heroes = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { level: 30, star: 2, power: 100 }]));
  local.rpcCache = {
    accountStatus: { data: { id: 10 } },
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: { squads: [], available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) } },
    marchStatus: { data: { marches: [] } }
  };
  const sender = { ...gameSender, tab: { id: 42 } };

  // 1. rallyCreated MQTT triggers getRallyById and getMarches
  await send('api-record', socket('rallyCreated', { rallyId: 'rally-high' }), sender);
  assert.equal(forwardedMessages.length, 1);
  assert.deepEqual(Array.from(forwardedMessages[0].msg.calls, (c) => c.name), ['getRallyById', 'getMarches']);

  // 2. getRallyById response with boss level 15 (mobConfigId 74 >= 74) triggers joinRally
  const rallyHighRecord = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 1, args: { rallyId: 'rally-high' } }],
    [{ ident: 1, result: { response: { rally: {
      rallyId: 'rally-high', mapId: 'map-1',
      mob: { mobId: 'mob-1', mobConfigId: 74 },
      target: { objectId: 'mob-1', objectConfigId: 74 },
      leader: { userId: 999, squad: { squadId: 'leader-squad' } },
      members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', rallyHighRecord, sender);
  assert.equal(forwardedMessages.length, 2);
  const joinMsg = forwardedMessages[1].msg;
  assert.equal(joinMsg.calls[0].name, 'joinRally');
  assert.equal(joinMsg.calls[0].feature, 'rally');
  assert.equal(joinMsg.calls[0].args.rallyId, 'rally-high');
  assert.equal(joinMsg.calls[0].args.squad.heroes.length, 5);

  // 3. Duplicate getRallyById does not dispatch join again
  await send('api-record', rallyHighRecord, sender);
  assert.equal(forwardedMessages.length, 2);

  // 4. Low level boss (level 10 -> mobConfigId 69 < 15) does NOT join
  const rallyLowRecord = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 2, args: { rallyId: 'rally-low' } }],
    [{ ident: 2, result: { response: { rally: {
      rallyId: 'rally-low', mapId: 'map-1',
      mob: { mobId: 'mob-2', mobConfigId: 69 },
      leader: { userId: 999 }, members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', rallyLowRecord, sender);
  assert.equal(forwardedMessages.length, 2);

  // 5. Own rally does NOT join
  const ownRallyRecord = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 3, args: { rallyId: 'rally-own' } }],
    [{ ident: 3, result: { response: { rally: {
      rallyId: 'rally-own', mapId: 'map-1',
      mob: { mobId: 'mob-3', mobConfigId: 80 },
      leader: { userId: 10 }, members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', ownRallyRecord, sender);
  assert.equal(forwardedMessages.length, 2);

  // 6. When priority auto join is disabled, high level boss does NOT join
  local.priorityAutoJoin.enabled = false;
  const disabledRecord = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 4, args: { rallyId: 'rally-disabled' } }],
    [{ ident: 4, result: { response: { rally: {
      rallyId: 'rally-disabled', mapId: 'map-1',
      mob: { mobId: 'mob-4', mobConfigId: 85 },
      leader: { userId: 888 }, members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', disabledRecord, sender);
  assert.equal(forwardedMessages.length, 2);
});

test('priority auto-join uses selected team and falls back to highest power heroes if lineup is not ready', async () => {
  const { local, send, forwardedMessages } = setup();
  local.popupRpcEnabled = true;
  local.priorityAutoJoin = { enabled: true, minLevel: 10, teamId: 'custom:elite' };
  local.troopCapacitySettings = { defaultHero: 700, base: 1000 };
  local.customTeams = {
    '10': [{ id: 'elite', name: 'Elite 5', heroIds: [1, 2, 3, 4, 5] }]
  };
  const heroes = {
    1: { level: 30, star: 2, power: 100 },
    2: { level: 30, star: 2, power: 200 },
    3: { level: 30, star: 2, power: 300 },
    4: { level: 30, star: 2, power: 400 },
    5: { level: 30, star: 2, power: 500 },
    6: { level: 30, star: 2, power: 6000 },
    7: { level: 30, star: 2, power: 7000 },
    8: { level: 30, star: 2, power: 8000 },
    9: { level: 30, star: 2, power: 9000 },
    10: { level: 30, star: 2, power: 10000 },
  };
  local.rpcCache = {
    accountStatus: { data: { id: 10 } },
    heroGetAll: { data: heroes },
    'getUnitSummary:unit': { data: { squads: [], available: [7, 17, 27].map((unitId) => ({ unitId, count: 5000 })) } },
    marchStatus: { data: { marches: [] } }
  };
  const sender = { ...gameSender, tab: { id: 42 } };

  // 1. All custom team heroes available: uses [1, 2, 3, 4, 5]
  const rally1 = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 1, args: { rallyId: 'rally-t1' } }],
    [{ ident: 1, result: { response: { rally: {
      rallyId: 'rally-t1', mapId: 'map-1',
      mob: { mobId: 'm1', mobConfigId: 74 },
      leader: { userId: 999 }, members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', rally1, sender);
  assert.equal(forwardedMessages.length, 1);
  const pickedHeroes1 = forwardedMessages[0].msg.calls[0].args.squad.heroes.map((h) => h.heroId);
  assert.deepEqual(Array.from(pickedHeroes1), [1, 2, 3, 4, 5]);

  // 2. Hero 1 is busy on a march -> custom lineup is not ready!
  // Should fall back to highest power available heroes: [10, 9, 8, 7, 6]
  local.rpcCache.marchStatus.data.marches = [{ team: { heroIds: [1] } }];
  const rally2 = rpc(
    [{ name: 'getRallyById', feature: 'rally', ident: 2, args: { rallyId: 'rally-t2' } }],
    [{ ident: 2, result: { response: { rally: {
      rallyId: 'rally-t2', mapId: 'map-1',
      mob: { mobId: 'm2', mobConfigId: 74 },
      leader: { userId: 999 }, members: [], membersCapacityLeft: 5,
      plannedStartTime: Date.now() + 60000
    } } } }]
  );
  await send('api-record', rally2, sender);
  assert.equal(forwardedMessages.length, 2);
  const pickedHeroes2 = forwardedMessages[1].msg.calls[0].args.squad.heroes.map((h) => h.heroId);
  assert.deepEqual(Array.from(pickedHeroes2), [10, 9, 8, 7, 6]);
});

test('recorded POST bodies remain bounded and tracking endpoints stay excluded', async () => {
  const { session, send, listener } = setup();
  await send('record-start');
  await send('api-record', {
    ...getRecord(1), method: 'POST', requestBody: 'a'.repeat(530000), responseBody: '{"ok":true}'
  });
  assert.equal(session['record:0'].requestBody.length, 524288);
  assert.equal(session['record:0'].requestBodyTruncated, true);
  assert.equal(session['record:0'].responseBody, '{"ok":true}');
  assert.equal(listener({ kind: 'api-record', record: {
    ...getRecord(2), endpoint: 'https://analytics.nextersglobal.com/analytics/event/gamebeat'
  } }, gameSender, () => {}), undefined);
  assert.equal(session.recordingState.nextIndex, 1);
});

test('session quota failure stops recording and preserves earlier records', async () => {
  const { session, send } = setup(650);
  await send('record-start');
  assert.equal((await send('api-record', getRecord(1))).saved, true);
  const result = await send('api-record', {
    ...getRecord(2), method: 'POST', requestBody: 'x'.repeat(1000), responseBody: 'ok'
  });
  assert.equal(result.saved, false);
  assert.equal(session.recordingState.active, false);
  assert.match(session.recordingState.error, /full/);
  assert.equal(session['record:0'].endpoint, 'https://www.hero-wars-alliance.com/api/test');
  assert.equal('record:1' in session, false);
});

test('cache can rebuild from temporary session records and old local logs are removed on update', async () => {
  const { local, send, installed } = setup();
  local.apiRecords = [{ legacy: true }];
  installed();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal('apiRecords' in local, false);
  await send('record-start');
  await send('api-record', rpc([{ name: 'heroGetAll', ident: 1 }],
    [{ ident: 1, result: { response: { 5: { level: 70 } } } }]));
  assert.equal(local.rpcCache.heroGetAll.data[5].level, 70);
  delete local.rpcCache;
  const rebuilt = await send('rebuild-cache');
  assert.equal(rebuilt.count, 1);
  assert.equal(local.rpcCache.heroGetAll.data[5].level, 70);
  local.captureSettings = { interceptEnabled: false };
  const skipped = await send('api-record', getRecord(3));
  assert.equal(skipped.saved, false);
  assert.equal(skipped.cached, false);
});

test('reload-game-tab reloads matching game tab or returns error when none found', async () => {
  const { send, tabsList, getReloadedTabId } = setup();
  // No game tab
  tabsList.length = 0;
  const noTabResult = await send('reload-game-tab');
  assert.equal(noTabResult.ok, false);
  assert.equal(noTabResult.error, 'No active Hero Wars tab found.');

  // With game tab
  tabsList.push({ id: 42, url: 'https://www.hero-wars-alliance.com/play' });
  const tabResult = await send('reload-game-tab');
  assert.equal(tabResult.ok, true);
  assert.equal(tabResult.error, null);
  assert.equal(getReloadedTabId(), 42);
});


test('engine-ping forwards to active game tab', async () => {
  const { send, tabsList, forwardedMessages } = setup();
  tabsList.push({ id: 99, url: 'https://www.hero-wars-alliance.com/' });
  const result = await send('engine-ping');
  assert.equal(result.ok, true);
  assert.ok(forwardedMessages.some((f) => f.tabId === 99 && f.msg.kind === 'engine-ping'));
});

test('Tower start dispatches a saved-team run to one game tab and stop clears pending actions', async () => {
  const { local, tabsList, forwardedMessages, listener } = setup();
  const invoke = (message) => new Promise((resolve) => listener(message, popupSender, resolve));
  const now = new Date().toISOString();
  local.popupRpcEnabled = true;
  local.socketRefreshMode = 'direct';
  local.rpcCache = {
    accountStatus: { data: { id: 10 } },
    teamGetAll: { data: { magicTower: [79, 72, 16, 54, 60] } },
    towerStatus: { data: { state: 'inProgress' } },
    towerSession: { updatedAt: now, data: { floorNumber: 1, roomNumber: 0,
      rooms: { 1: { roomNumber: 1, type: 'hero_battle', state: 'initial' },
        2: { roomNumber: 2, type: 'buffs', buffs: [34] } }, history: [] } }
  };
  local.towerAutomationSettings = { accountId: 10, buffPriority: [34] };
  tabsList.push({ id: 1, url: gameSender.url }, { id: 2, url: gameSender.url });
  assert.equal((await invoke({ kind: 'tower-run-start' })).ok, true);
  assert.equal(local.towerRun.phase, 'acting');
  assert.equal(local.towerRun.tabId, 1);
  assert.deepEqual(Array.from(local.towerRun.buffPriority), [34]);
  assert.equal(forwardedMessages[0].tabId, 1);
  assert.equal(forwardedMessages[0].msg.kind, 'refresh-rpc');
  assert.equal(forwardedMessages[0].msg.calls[0].name, 'magicTower_enterRoom');
  assert.equal((await invoke({ kind: 'tower-run-stop' })).ok, true);
  assert.equal(local.towerRun.phase, 'stopped');
  assert.equal(forwardedMessages.at(-1).msg.kind, 'drop-rpc-group');
});

test('Dungeon start dispatches automation to game tab and stop clears pending state', async () => {
  const { local, tabsList, forwardedMessages, listener } = setup();
  const invoke = (message) => new Promise((resolve) => listener(message, popupSender, resolve));
  local.popupRpcEnabled = true;
  local.captureSettings = { monitor: true };
  local.socketRefreshMode = 'piggyback';
  local.rpcCache = {
    accountStatus: { data: { id: 10 } },
    dungeonStatus: {
      data: {
        floorNumber: 800,
        currentFloorDoors: [
          { attackerType: 'water', defenderType: 'fire', power: 30000 }
        ],
        states: { titans: {} }
      }
    }
  };
  tabsList.push({ id: 1, url: gameSender.url });
  assert.equal((await invoke({ kind: 'dungeon-run-start' })).ok, true);
  assert.equal(local.dungeonRun.phase, 'starting-battle');
  assert.equal(local.dungeonRun.tabId, 1);
  assert.equal(forwardedMessages[0].tabId, 1);
  assert.equal(forwardedMessages[0].msg.calls[0].name, 'dungeonStartBattle');
  assert.equal((await invoke({ kind: 'dungeon-run-stop' })).ok, true);
  assert.equal(local.dungeonRun.phase, 'stopped');
  assert.equal(forwardedMessages.at(-1).msg.kind, 'drop-rpc-group');
});

test('campaign-raid, craft-fragment, and craft-recipe messages forward RPC calls to active game tab', async () => {
  const { local, tabsList, forwardedMessages, listener } = setup();
  const invoke = (message) => new Promise((resolve) => listener(message, popupSender, resolve));

  tabsList.push({ id: 5, url: gameSender.url });

  // Disabled RPC check
  local.popupRpcEnabled = false;
  const disabledRaid = await invoke({ kind: 'campaign-raid', missionId: 10, times: 3 });
  assert.equal(disabledRaid.ok, false);
  assert.match(disabledRaid.error, /disabled/i);

  local.popupRpcEnabled = true;
  local.socketRefreshMode = 'direct';

  // Invalid mission ID check
  const invalidRaid = await invoke({ kind: 'campaign-raid', missionId: 'abc', times: 3 });
  assert.equal(invalidRaid.ok, false);
  assert.match(invalidRaid.error, /invalid mission ID/i);

  // Valid campaign-raid
  const validRaid = await invoke({ kind: 'campaign-raid', missionId: 42, times: 5 });
  assert.equal(validRaid.ok, true);
  const raidMsg = forwardedMessages.find((m) => m.msg.calls?.some((c) => c.name === 'missionRaid'));
  assert.ok(raidMsg);
  assert.equal(raidMsg.tabId, 5);
  assert.equal(raidMsg.msg.calls[0].name, 'missionRaid');
  assert.equal(raidMsg.msg.calls[0].args.id, 42);
  assert.equal(raidMsg.msg.calls[0].args.times, 5);
  assert.equal(raidMsg.msg.calls[1].name, 'playable_getAvailable');
  assert.equal(raidMsg.msg.calls[2].name, 'worldStars_getAvailable');

  // Valid craft-fragment (gear)
  const validFrag = await invoke({ kind: 'craft-fragment', type: 'gear', libId: 57, amount: 1 });
  assert.equal(validFrag.ok, true);
  const fragMsg = forwardedMessages.find((m) => m.msg.calls?.some((c) => c.name === 'inventoryCraftFragments'));
  assert.ok(fragMsg);
  assert.equal(fragMsg.msg.calls[0].args.type, 'gear');
  assert.equal(fragMsg.msg.calls[0].args.libId, 57);
  assert.equal(fragMsg.msg.calls[0].args.amount, 1);

  // Valid craft-recipe (scroll/recipe)
  const validRecipe = await invoke({ kind: 'craft-recipe', type: 'gear', libId: 102, amount: 1 });
  assert.equal(validRecipe.ok, true);
  const recipeMsg = forwardedMessages.find((m) => m.msg.calls?.some((c) => c.name === 'inventoryCraftRecipe'));
  assert.ok(recipeMsg);
  assert.equal(recipeMsg.msg.calls[0].args.type, 'gear');
  assert.equal(recipeMsg.msg.calls[0].args.libId, 102);
  assert.equal(recipeMsg.msg.calls[0].args.amount, 1);
});
