import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root = new URL('../extension/', import.meta.url);
async function environment() {
  const local = {}, sent = [], alarms = [], clock = { now: Date.parse('2026-11-15T10:00:00Z') };
  let listener, bridgeAccount = '1';
  class Clock extends Date { static now() { return clock.now; } }
  const area = { get: async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in local).map(k => [k, local[k]]))), set: async value => Object.assign(local, structuredClone(value)), remove: async () => {} };
  const chrome = { storage: { local: area, session: area, onChanged: { addListener() {} } },
    runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    alarms: { get: (name, cb) => cb({}), create: (name, args) => alarms.push({ name, ...args }), onAlarm: { addListener() {} } },
    tabs: { query: (args, cb) => { setTimeout(() => cb([{ id: 1, url: 'https://www.hero-wars-alliance.com/' }]), 0); },
      sendMessage: async (tabId, message) => { if (message.kind === 'free-spin-context') return { ok: true, accountId: bridgeAccount }; sent.push({ tabId, ...message }); return { ok: true }; } } };
  const ctx = vm.createContext({ chrome, console, Date: Clock, TextEncoder, URL, structuredClone });
  ctx.importScripts = (...files) => files.forEach(file => vm.runInContext(readFileSync(new URL(file, root), 'utf8'), ctx));
  vm.runInContext(readFileSync(new URL('background.js', root), 'utf8') + '\nglobalThis.run = runFreeSpin; globalThis.drain = () => pending;', ctx);
  await ctx.drain();
  local.rpcCache = { accountStatus: { data: { id: 1 }, updatedAt: new Date(clock.now).toISOString() },
    questResetStatus: { data: { nextDayAt: clock.now + 3600000 } },
    'resource:refillable:53': { data: { amount: 1 }, updatedAt: new Date(clock.now).toISOString() } };
  Object.assign(local, { autoFreeSpinEnabled: true, popupRpcEnabled: true, socketRefreshMode: 'direct' });
  const quota = amount => {
    clock.now++;
    local.rpcCache['resource:refillable:53'] = { data: { amount }, updatedAt: new Date(clock.now).toISOString() };
  };
  const spins = () => sent.filter(m => m.calls?.[0]?.name === 'refillable_alchemyUseVideo');
  const send = message => new Promise(resolve => listener(message, { url: 'chrome-extension://test/popup.html' }, resolve));
  return { ctx, local, sent, alarms, clock, quota, spins, send, bridge: id => { bridgeAccount = id; } };
}

test('timer expiry refreshes quota before one automatic free spin and duplicate wakes never resend', async () => {
  const e = await environment(), { local, clock } = e;
  local.rpcCache['resource:refillable:53'].data = { amount: 0, lastRefillAt: clock.now - 28800000 + 1000 };
  await e.ctx.run(); assert.equal(e.sent.length, 0);
  assert.equal(e.alarms.at(-1).when, clock.now + 1000);
  clock.now += 1000; await e.ctx.run();
  assert.equal(e.sent.at(-1).calls[0].name, 'userGetInfo'); assert.equal(e.spins().length, 0);
  e.quota(1); await e.ctx.run();
  assert.equal(e.spins().length, 1);
  assert.equal(JSON.stringify(e.spins()[0].calls), JSON.stringify([{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }]));
  clock.now += 120000; await e.ctx.run(); await e.ctx.run();
  assert.equal(e.spins().length, 1);
  assert.match(local.autoFreeSpinState.status, /confirmation/);
});

test('manual clicks and auto quota completion serialize through one persisted mutation lock', async () => {
  const e = await environment();
  await e.ctx.run(); e.quota(1);
  await Promise.all([e.send({ kind: 'free-alchemy-spin' }), e.send({ kind: 'free-spin-tick' }), e.send({ kind: 'refresh-rpc', calls: [{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }] })]);
  assert.equal(e.spins().length, 1);
  assert.ok(e.local.autoFreeSpinState.pending);
});

test('receipt confirmation schedules next cooldown; new game day restores automatic eligibility', async () => {
  const e = await environment();
  await e.ctx.run(); e.quota(1); await e.ctx.run();
  const request = e.local.autoFreeSpinState.pending;
  e.clock.now++;
  e.local.rpcCache.freeAlchemySpinStatus = { updatedAt: new Date(e.clock.now).toISOString(), data: { token: 'confirmed', success: true, cooldownUntil: e.clock.now + 28800000 } };
  await e.ctx.run();
  assert.equal(e.local.autoFreeSpinState.pending, null);
  assert.equal(e.local.autoFreeSpinState.wakeAt, e.local.rpcCache.questResetStatus.data.nextDayAt);
  e.clock.now = e.local.rpcCache.questResetStatus.data.nextDayAt;
  await e.ctx.run();
  assert.equal(e.local.autoFreeSpinState.pending.phase, 'refresh');
  e.quota(1); await e.ctx.run();
  assert.equal(e.spins().length, 2);
  assert.ok(request.sentAt < e.local.autoFreeSpinState.pending.sentAt);
});

test('opt-in/shared RPC gates and mismatched game-account bridge prevent automatic sends', async () => {
  const e = await environment();
  e.local.autoFreeSpinEnabled = false; await e.ctx.run(); assert.equal(e.sent.length, 0);
  e.local.autoFreeSpinEnabled = true; e.local.popupRpcEnabled = false; await e.ctx.run(); assert.equal(e.sent.length, 0);
  e.local.popupRpcEnabled = true; e.bridge('2'); await e.ctx.run(); assert.equal(e.sent.length, 0);
  assert.match(e.local.autoFreeSpinState.status, /current account/);
});

test('queued mode respects policy; disabling auto cancels its queue without pretending the mutation failed', async () => {
  const e = await environment(); e.local.socketRefreshMode = 'mqtt-piggyback';
  await e.ctx.run(); e.quota(1); await e.ctx.run();
  assert.equal(e.spins()[0].kind, 'queue-rpc');
  e.local.autoFreeSpinEnabled = false; await e.ctx.run();
  assert.ok(e.sent.some(m => m.kind === 'drop-rpc-group' && m.group === 'free-alchemy-spin'));
  assert.equal(e.spins().length, 1); assert.ok(e.local.autoFreeSpinState.pending);
});

test('unknown rejection stops auto attempts within the same eligibility cycle', async () => {
  const e = await environment(); await e.ctx.run(); e.quota(1); await e.ctx.run();
  e.clock.now++;
  e.local.rpcCache.freeAlchemySpinStatus = { updatedAt: new Date(e.clock.now).toISOString(), data: { token: 'failed', success: false, error: 'Denied' } };
  await e.ctx.run(); await e.ctx.run();
  assert.equal(e.spins().length, 1); assert.equal(e.local.autoFreeSpinState.pending, null);
  assert.equal(e.local.autoFreeSpinState.status, 'Denied');
});

test('account change cancels old queued work and does not transfer its pending spin to the new account', async () => {
  const e = await environment(); e.local.socketRefreshMode = 'piggyback';
  await e.ctx.run(); e.quota(1); await e.ctx.run();
  e.clock.now++;
  e.local.rpcCache.accountStatus = { data: { id: 2 }, updatedAt: new Date(e.clock.now).toISOString() };
  e.local.rpcCache['resource:refillable:53'] = { data: { amount: 0, lastRefillAt: e.clock.now }, updatedAt: new Date(e.clock.now).toISOString() };
  e.bridge('2'); await e.ctx.run();
  assert.equal(e.local.autoFreeSpinState.accountId, 2);
  assert.equal(e.local.autoFreeSpinState.pending, null);
  assert.ok(e.sent.some(m => m.kind === 'drop-rpc-group'));
  assert.equal(e.spins().length, 1);
});
