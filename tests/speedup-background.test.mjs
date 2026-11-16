import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';
import { speedupService } from '../src/services/speedupService.ts';

async function environment(existing = {}) {
  const local = structuredClone(existing), sent = [], clock = { now: Date.now() };
  let listener, account = '1', failTransport = false;
  const area = { get: async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]]))),
    set: async value => Object.assign(local, structuredClone(value)), remove: async () => {} };
  const chrome = { storage: { local: area, session: area, onChanged: { addListener() {} } },
    runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    alarms: { get: (_, cb) => cb({}), create() {}, onAlarm: { addListener() {} } },
    tabs: { query: (_, cb) => setTimeout(() => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]), 0),
      sendMessage: async (_, message) => {
        if (message.kind === 'game-account-context') return { ok: true, accountId: account };
        sent.push(structuredClone(message)); if (failTransport) throw Error('Bridge unavailable'); return { ok: true };
      } } };

  const bg = setupBackgroundRuntime({ chrome });
  const withClock = async fn => {
    const orig = Date.now;
    Date.now = () => clock.now;
    try {
      return await fn();
    } finally {
      Date.now = orig;
    }
  };
  const ctx = {
    reconcile: (...args) => withClock(() => bg.reconcileSpeedup(...args)),
    drain: () => bg.drain(),
    hwaHelperSpeedup: speedupService
  };
  await ctx.drain();
  if (!local.rpcCache) {
    const at = new Date(clock.now).toISOString();
    local.rpcCache = { accountStatus: { data: { id: 1 } }, buildingStatus: { updatedAt: at,
      data: { queues: [{ buildingId: 20, level: 21, startDate: clock.now - 1000, durationMs: 3600000 }] } },
      speedupInventory: { updatedAt: at, data: { accountId: '1', observedAt: at, items: [{ type: 'speedUpConstruction', id: 1, quantity: 10 }] } } };
    Object.assign(local, { popupRpcEnabled: true, socketRefreshMode: 'direct' });
  }
  const quote = () => speedupService.quote(local.rpcCache, 'building', 20, 1, 1, clock.now);
  const send = message => withClock(() => new Promise(resolve => listener(message, { url: 'chrome-extension://test/popup.html' }, resolve)));
  return { local, sent, ctx, clock, quote, send, setAccount: value => { account = value; }, breakTransport: () => { failTransport = true; } };
}

test('confirmed speedups serialize across popups and preserve exact token until server receipt', async () => {
  const e = await environment(), message = { kind: 'speedup-use', confirmed: true, quote: e.quote() };
  const results = await Promise.all([e.send(message), e.send(message)]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(e.sent.length, 1);
  const pending = e.local.speedupSpendState.pending;
  assert.match(pending.token, /^[a-f0-9]{32}$/); assert.equal(e.sent[0].calls[0].ident, pending.token);
  e.clock.now += 300000;
  await e.ctx.reconcile(e.local.rpcCache); assert.equal(e.local.speedupSpendState.pending.token, pending.token, 'timeout never releases uncertain consumption');
  const restarted = await environment(e.local);
  assert.ok(restarted.local.speedupSpendState.pending); assert.equal((await restarted.send(message)).ok, false);
  restarted.local.rpcCache.speedupReceipts = { data: [{ token: pending.token, at: new Date(e.clock.now).toISOString(), accountId: '1', success: true }] };
  await restarted.ctx.reconcile(restarted.local.rpcCache); assert.equal(restarted.local.speedupSpendState.pending, null);
});

test('confirmation, stock/target/account and shared RPC are revalidated before any spend', async () => {
  for (const change of [e => { e.local.popupRpcEnabled = false; }, e => { e.local.rpcCache.speedupInventory.data.items[0].quantity--; },
    e => { e.local.rpcCache.buildingStatus.data.queues[0].durationMs--; }, e => { e.setAccount('2'); }]) {
    const e = await environment(), quote = e.quote(); change(e);
    assert.equal((await e.send({ kind: 'speedup-use', confirmed: true, quote })).ok, false); assert.equal(e.sent.length, 0);
  }
  const e = await environment();
  assert.equal((await e.send({ kind: 'speedup-use', quote: e.quote() })).ok, false);
  const call = e.ctx.hwaHelperSpeedup.buildCall(e.quote(), e.clock.now);
  assert.equal((await e.send({ kind: 'refresh-rpc', calls: [call] })).ok, false, 'generic refresh cannot bypass confirmation');
});

test('transport uncertainty holds pending and account transition cancels the old queued group', async () => {
  const e = await environment(); e.breakTransport();
  assert.equal((await e.send({ kind: 'speedup-use', confirmed: true, quote: e.quote() })).ok, false);
  assert.ok(e.local.speedupSpendState.pending);
  e.local.rpcCache.accountStatus.data.id = 2;
  await e.ctx.reconcile(e.local.rpcCache);
  assert.equal(e.local.speedupSpendState.pending, null); assert.equal(e.sent.at(-1).kind, 'drop-rpc-group');
});
