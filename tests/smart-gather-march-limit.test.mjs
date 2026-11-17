import test from 'node:test';
import assert from 'node:assert/strict';
import smartGatherService from '../src/services/queues/smartGather.ts';
import autoGatherService from '../src/services/queues/autoGather.ts';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';

function rpc(call, response, time) {
  return {
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    timestamp: new Date(time).toISOString(),
    requestBody: JSON.stringify({ calls: [{ ...call, ident: '1' }] }),
    responseBody: JSON.stringify({ results: [{ ident: '1', result: { response } }] }),
  };
}

function environment() {
  const local = {}, sent = [], session = {};
  const clock = { now: Date.now() };
  const area = (state) => ({
    get: async (keys) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(state))
          .filter((k) => k in state)
          .map((k) => [k, state[k]])
      ),
    set: async (data) => Object.assign(state, data),
    remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete state[k]),
  });
  const chrome = {
    runtime: { id: 'test', onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
    storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
    alarms: { get: (_name, cb) => cb({}), onAlarm: { addListener() {} } },
    tabs: {
      query: (_filter, cb) => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]),
      sendMessage: async (_tabId, message) => sent.push(message),
    },
  };
  const bg = setupBackgroundRuntime({ chrome });
  const withClock = async (fn) => {
    const orig = Date.now;
    Date.now = () => clock.now;
    try {
      return await fn();
    } finally {
      Date.now = orig;
    }
  };
  const ctx = {
    runSmart: (...args) => withClock(() => bg.evaluateSmartGather(...args)),
  };
  return { local, sent, ctx, clock };
}

test('smartGather.sync: attackMine rejected with MarchLimitExceeded clears pending, avoids state.error, and sets backoff', () => {
  const now = 100000;
  const attackCall = { name: 'attackMine', feature: 'mine', args: { mineId: 55 } };
  const state = {
    accountId: 42,
    pending: { call: attackCall, phase: 'sent', sentAt: now - 1000 },
  };
  const record = rpc(attackCall, { errorCode: 'MarchLimitExceeded' }, now);

  const next = smartGatherService.sync(state, record, { accountStatus: { data: { id: 42 } } }, now);

  assert.equal(next.pending, null);
  assert.equal(next.error, undefined);
  assert.equal(next.marchLimitBackoffUntil, now + 15000);
  assert.match(next.notice?.message || '', /MarchLimitExceeded/);
  assert.match(next.notice?.message || '', /waiting for squad return/);
});

test('smartGather.sync: auto-heals pre-existing stuck state with MarchLimitExceeded error', () => {
  const now = 200000;
  const state = {
    accountId: 42,
    error: 'attackMine rejected by game: MarchLimitExceeded; restart Smart gathering to retry',
  };

  const next = smartGatherService.sync(state, null, { accountStatus: { data: { id: 42 } } }, now);

  assert.equal(next.error, undefined);
  assert.match(next.notice?.message || '', /Resuming gathering; checking available targets/);
});

test('smartGather.sync: clears marchLimitBackoffUntil once time expires', () => {
  const now = 300000;
  const state = {
    accountId: 42,
    marchLimitBackoffUntil: now - 1,
  };

  const next = smartGatherService.sync(state, null, { accountStatus: { data: { id: 42 } } }, now);

  assert.equal(next.marchLimitBackoffUntil, undefined);
});

test('autoGather.planAutoGather: pauses with wait action when marchLimitBackoffUntil is active', () => {
  const now = 400000;
  const stored = {
    popupRpcEnabled: true,
    autoGatherSettings: {
      enabled: true,
      smartEnabled: true,
      maxMarches: 3,
      mineLevel: 5,
      mineType: 'rotate',
    },
    smartGatherState: {
      accountId: 42,
      marchLimitBackoffUntil: now + 10000,
    },
  };
  const cache = {
    accountStatus: { data: { id: 42 } },
    marchStatus: { updatedAt: new Date(now).toISOString(), data: { marches: [] } },
    'getUnitSummary:unit': { updatedAt: new Date(now).toISOString(), data: { squads: [] } },
    gatheringStatus: { updatedAt: new Date(now).toISOString() },
  };

  const plan = autoGatherService.planAutoGather(cache, stored, now);

  assert.equal(plan.action, 'wait');
  assert.match(plan.reason || '', /MarchLimitExceeded/);
  assert.match(plan.reason || '', /waiting for squad return/);

  // Once backoff expires, planning resumes
  const planAfterExpiry = autoGatherService.planAutoGather(cache, {
    ...stored,
    smartGatherState: { accountId: 42, marchLimitBackoffUntil: now - 1 },
  }, now);
  assert.notEqual(planAfterExpiry.reason, 'Server march limit reached (MarchLimitExceeded); waiting for squad return');
});

test('background evaluateSmartGather: handles MarchLimitExceeded by entering backoff and dispatching march/unit refresh without fatal error', async () => {
  const { local, ctx, sent } = environment();
  const at = 500000;
  const heroes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { id: i + 1, power: 10000, level: 40, star: 3 }]));
  const attackCall = { name: 'attackMine', feature: 'mine', args: { mineId: 77 } };

  local.popupRpcEnabled = true;
  local.socketRefreshMode = 'direct';
  local.autoGatherSettings = { enabled: true, smartEnabled: true, maxMarches: 3, mineType: 'rotate', mineLevel: 5 };
  local.rpcCache = {
    accountStatus: { data: { id: 1 } },
    heroGetAll: { data: heroes },
    marchStatus: { updatedAt: new Date(at).toISOString(), data: { marches: [] } },
    'getUnitSummary:unit': { updatedAt: new Date(at).toISOString(), data: { available: [{ unitId: 7, count: 10000 }], squads: [] } },
    gatheringStatus: { updatedAt: new Date(at).toISOString() },
  };
  local.smartGatherState = {
    accountId: 1,
    pending: { call: attackCall, phase: 'sent', sentAt: at },
  };

  const record = rpc(attackCall, { errorCode: 'MarchLimitExceeded' }, at + 100);

  await ctx.runSmart(record, local.rpcCache, local, 1, at + 6000);

  // Verify smartGatherState has no fatal error
  assert.equal(local.smartGatherState.error, undefined);
  assert.equal(local.smartGatherState.pending, null);
  assert(local.smartGatherState.marchLimitBackoffUntil > at + 6000);

  // Status should reflect waiting for squad return instead of fatal error
  assert.match(local.smartGatherState.status, /MarchLimitExceeded|waiting for squad return/);

  // Check that refresh calls (getMarches and getUnitSummary) were dispatched to reconcile client cache
  const lastSent = sent.at(-1);
  assert(lastSent, 'Expected RPC message to be dispatched');
  const dispatchedNames = (lastSent.calls || []).map((c) => c.name);
  assert(dispatchedNames.includes('getMarches'), 'Should request getMarches to refresh march state');
  assert(dispatchedNames.includes('getUnitSummary'), 'Should request getUnitSummary to refresh squad state');
});
