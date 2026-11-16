import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';

async function environment(existing) {
  const now = Date.now(), stamp = new Date(now - 1000).toISOString();
  const letter = { id: '101', reward: { gold: 50 }, availableUntil: String(Math.floor(now / 1000) + 60) };
  const local = existing ? structuredClone(existing) : { popupRpcEnabled: true, socketRefreshMode: 'direct', rpcCache: {
    accountStatus: { data: { id: 1 } }, mailStatus: { updatedAt: stamp, data: { accountId: '1', letters: [letter], reports: [], lettersObservedAt: stamp } },
    mailGetAll: { updatedAt: stamp, data: { letters: [letter] } }, 'resource:gold': { updatedAt: stamp, data: { amount: 100 } } } };
  const sent = [], alarms = [], clock = { now }; let listener, account = '1', alarm;
  const area = { get: async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]]))),
    set: async value => Object.assign(local, structuredClone(value)), remove: async () => {} };
  const chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    storage: { local: area, session: area, onChanged: { addListener() {} } },
    alarms: { get: (_, cb) => cb({}), create: (name, options) => alarms.push({ name, ...options }), clear() {}, onAlarm: { addListener: fn => { alarm = fn; } } },
    tabs: { query: (_, cb) => setTimeout(() => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]), 0),
      sendMessage: async (_, message) => { if (message.kind === 'game-account-context') return { ok: true, accountId: account }; sent.push(structuredClone(message)); return { ok: true }; } } };

  const withClock = async fn => {
    const orig = Date.now;
    Date.now = () => clock.now;
    try {
      return await fn();
    } finally {
      Date.now = orig;
    }
  };

  const bg = await withClock(() => setupBackgroundRuntime({ chrome }));
  const ctx = {
    drain: () => bg.drain(),
    reconcile: cache => withClock(() => bg.reconcileMailClaim(cache)),
    hwaHelperRpcCache: rpcCacheService
  };
  await ctx.drain();
  const send = message => withClock(() => new Promise(resolve => listener(message, { url: 'chrome-extension://test/popup.html' }, resolve)));
  return { local, sent, ctx, alarms, clock, send, setAccount: value => { account = value; }, fire: name => withClock(() => alarm({ name })) };
}

test('mail claims serialize and retain pending across restart until their own server receipt', async () => {
  const e = await environment(), message = { kind: 'mail-claim', accountId: 1, ids: ['101'] };
  const responses = await Promise.all([e.send(message), e.send(message)]);
  assert.equal(responses.filter(row => row.ok).length, 1); assert.equal(e.sent.length, 1);
  const pending = e.local.mailClaimState.pending, call = e.sent[0].calls[0];
  assert.equal(call.name, 'mailFarm'); assert.deepEqual(call.args, { letterIds: ['101'] }); assert.equal(call.ident, pending.token);
  assert.equal(e.local.rpcCache.mailStatus.data.letters[0].claimed, undefined);
  const restarted = await environment(e.local); assert.ok(restarted.local.mailClaimState.pending);
  const time = new Date(pending.sentAt + 10).toISOString();
  const record = { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: time,
    requestBody: JSON.stringify({ calls: [call] }), responseBody: JSON.stringify({ results: [{ ident: call.ident, result: { response: { 101: { gold: 50 } } } }] }) };
  restarted.local.rpcCache = restarted.ctx.hwaHelperRpcCache.merge(restarted.local.rpcCache, [record]).cache;
  await restarted.ctx.reconcile(restarted.local.rpcCache);
  assert.equal(restarted.local.mailClaimState.pending, null); assert.equal(restarted.local.rpcCache['resource:gold'].data.amount, 150);
});

test('expiry alarm clears canonical/raw mail and counts without issuing game RPC', async () => {
  const e = await environment();
  const expiry = Number(e.local.rpcCache.mailStatus.data.letters[0].availableUntil) * 1000;
  assert.ok(e.alarms.some(alarm => alarm.name === 'hwa-mail-expiry' && alarm.when === expiry));
  e.clock.now = expiry;
  await e.fire('hwa-mail-expiry');
  assert.equal(e.local.rpcCache.mailStatus.data.letters.length, 0); assert.equal(e.local.rpcCache.mailGetAll.data.letters.length, 0);
  assert.equal(e.local.rpcCache.mailStatus.data.totalUnclaimed, 0); assert.equal(e.sent.length, 0);
  assert.equal((await e.send({ kind: 'mail-claim', accountId: 1, ids: ['101'] })).ok, false);
});

test('mail claim account, expired/missing ID and shared RPC are checked before sending', async () => {
  for (const change of [e => { e.local.popupRpcEnabled = false; }, e => { e.setAccount('2'); },
    e => { e.local.rpcCache.mailStatus.data.accountId = '2'; }, e => { e.clock.now += 70000; }]) {
    const e = await environment(); change(e);
    assert.equal((await e.send({ kind: 'mail-claim', accountId: 1, ids: ['101'] })).ok, false);
    assert.equal(e.sent.filter(message => message.calls).length, 0);
  }
});
