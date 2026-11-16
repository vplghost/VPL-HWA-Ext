import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { mail } from '../src/utils/mail.ts';
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
import { mailService as mailHelper } from '../src/services/mailService.ts';
const now = Date.now(), stamp = time => new Date(time).toISOString();
const entry = (data, time = now) => ({ data, updatedAt: stamp(time) });
const letter = (id = '101', extra = {}) => ({ id, type: 'common', reward: { gold: '50', stamina: '20', consumable: { 105: '1' } },
  availableUntil: String(Math.floor(now / 1000) + 60), ...extra });
function baseline() {
  const letters = [letter(), letter('102', { availableUntil: String(Math.floor(now / 1000) - 1) }), letter('103', { availableUntil: null })];
  const reports = [{ id: 'report', type: 'rallyMobAttackResult', claimedReward: false, expiresAt: now + 60000 }];
  return { accountStatus: entry({ id: 1 }), mailStatus: entry({ accountId: '1', letters, reports, lettersObservedAt: stamp(now - 1000), reportsObservedAt: stamp(now - 1000) }, now - 1000),
    mailGetAll: entry({ letters }, now - 1000), 'getPage:report': entry({ reports }, now - 1000),
    'resource:gold': entry({ amount: 100 }, now - 1000), 'resource:energy': entry({ amount: 10 }, now - 1000) };
}
function rpc(call, response, time = now + 10, error) {
  const sent = { ...call, ident: call.ident || '0123456789abcdef0123456789abcdef' };
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp: stamp(time),
    requestBody: JSON.stringify({ calls: [sent] }), responseBody: JSON.stringify(error ? { error: { name: error, call: sent } } : { results: [{ ident: sent.ident, result: { response } }] }) };
}

test('mail deadline seconds and report deadline milliseconds remain distinct; missing/sentinel expiry stays unknown', () => {
  // Captured 20261108 mail availableUntil and 20261102 getPage:report expiresAt fields.
  assert.equal(mail.expiry({ availableUntil: '1794392985' }), 1794392985000);
  assert.equal(mail.expiry({ expiresAt: 1794198086044 }, 'report'), 1794198086044);
  for (const value of [null, undefined, '', 0, -1, 'invalid']) assert.equal(mail.expiry({ availableUntil: value }), null);
  assert.equal(mail.expired({ availableUntil: String(now / 1000) }, 'letter', now), true);
  assert.deepEqual(mail.rewards({ coin: { 18: '25' }, stamina: '20' }), [{ key: 'resource:coin:18', amount: 25 }, { key: 'resource:energy', amount: 20 }]);
});

test('expiry pruning removes canonical/raw entries and counts, preserves unknown expiry and input objects', () => {
  const original = baseline(), copy = structuredClone(original);
  const result = reducer.pruneCache(original, now);
  assert.equal(result.changed, true); assert.equal(result.cache.mailStatus.data.letters.length, 2);
  assert.equal(result.cache.mailGetAll.data.letters.length, 2); assert.equal(result.cache.mailStatus.data.unclaimedLettersCount, 2);
  assert.deepEqual(original, copy);
  const allExpired = reducer.pruneCache(result.cache, now + 70000);
  assert.deepEqual(allExpired.cache.mailStatus.data.letters.map(row => row.id), ['103']);
  assert.equal(allExpired.cache.mailStatus.data.reports.length, 0); assert.equal(allExpired.cache['getPage:report'].data.reports.length, 0);
  assert.equal(allExpired.cache.mailStatus.data.totalUnclaimed, 1); assert.equal(reducer.pruneCache(allExpired.cache, now + 70000).changed, false);
});

test('mailFarm confirms only returned letter IDs, credits known balances once, and never treats queued ack as completion', () => {
  const original = baseline(), event = rpc({ name: 'mailFarm', args: { letterIds: ['101', '103'] } }, { 101: letter().reward });
  const result = reducer.merge(original, [event]).cache;
  assert.equal(result.mailStatus.data.letters.find(row => row.id === '101').claimed, true);
  assert.equal(result.mailStatus.data.letters.find(row => row.id === '103').claimed, undefined);
  assert.equal(result['resource:gold'].data.amount, 150); assert.equal(result['resource:energy'].data.amount, 30);
  assert.equal(result['resource:consumable:105'], undefined, 'unknown balance waits for a real inventory snapshot');
  assert.equal(reducer.merge(result, [event]).changed, false);
  const rejected = reducer.merge(original, [rpc({ name: 'mailFarm', args: { letterIds: ['101'] } }, {}, now + 10, 'NotFound')]).cache;
  assert.equal(rejected.mailClaimStatus.data.success, false); assert.equal(rejected['resource:gold'].data.amount, 100);
  const ambiguous = reducer.merge(original, [rpc({ name: 'mailFarm', args: { letterIds: ['101'] } }, {})]).cache;
  assert.equal(ambiguous.mailClaimReceipts, undefined);
});

test('full mail snapshots replace absent letters, preserve newer claim flags and merge independently from report pages', () => {
  let cache = reducer.merge(baseline(), [rpc({ name: 'mailFarm', args: { letterIds: ['101'] } }, { 101: { gold: 50 } }, now + 20)]).cache;
  cache = reducer.merge(cache, [rpc({ name: 'mailGetAll', args: {} }, { letters: [letter()] }, now + 15)]).cache;
  assert.equal(cache.mailStatus.data.letters.length, 1); assert.equal(cache.mailStatus.data.letters[0].claimed, true);
  cache = reducer.merge(cache, [rpc({ name: 'mailGetAll', args: {} }, { letters: [] }, now + 30)]).cache;
  assert.equal(cache.mailStatus.data.letters.length, 0); assert.equal(cache.mailStatus.data.reports.length, 1);
  const mailCall = { name: 'mailGetAll', args: {}, ident: 'letters' }, pageCall = { name: 'getPage', feature: 'report', args: {}, ident: 'reports' };
  const combined = rpc(mailCall, {}), at = now + 40;
  combined.timestamp = stamp(at); combined.requestBody = JSON.stringify({ calls: [mailCall, pageCall] });
  combined.responseBody = JSON.stringify({ results: [{ ident: 'letters', result: { response: { letters: [letter()] } } },
    { ident: 'reports', result: { response: { reports: [{ id: 'new-report', type: 'rallyMobAttackResult', claimedReward: false, expiresAt: now + 100000 }] } } }] });
  const result = reducer.merge(cache, [combined]).cache;
  assert.equal(result.mailStatus.data.letters.length, 1); assert.equal(result.mailStatus.data.reports.length, 2);
});

test('account transitions clear inbox and old-account mail replies cannot resurrect or credit it', () => {
  const switched = reducer.merge(baseline(), [rpc({ name: 'userGetInfo', args: {} }, { id: 2, name: 'Other', level: 80 }, now + 100)]).cache;
  assert.equal(switched.mailStatus, undefined); assert.equal(switched.mailGetAll, undefined);
  const replay = reducer.merge(switched, [rpc({ name: 'mailGetAll', args: {} }, { letters: [letter()] }, now + 50),
    rpc({ name: 'mailFarm', args: { letterIds: ['101'] } }, { 101: { gold: 50 } }, now + 50)]).cache;
  assert.equal(replay.mailStatus, undefined); assert.equal(replay.mailGetAll, undefined); assert.equal(replay['resource:gold'].data.amount, 100);
});

test('Mail dialog compiles and opening is cache-only; claim waits while expiry and account changes disable stale choices', async t => {
  const source = await readFile(new URL('../src/components/dialogs/MailModal.vue', import.meta.url), 'utf8');
  assert.doesNotThrow(() => compileScript(parse(source).descriptor, { id: 'mail-fixture', inlineTemplate: true }));
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const cache = Vue.ref(baseline()), clock = Vue.ref(now), props = Vue.reactive({ modelValue: false }), calls = [], refreshes = [], stops = [], storage = {};
  class Clock extends Date { static now() { return clock.value; } }
  const context = { ...Vue, Date: Clock, mail, defineProps: () => props, defineEmits: () => () => {},
    useNow: () => clock, useGameConnection: () => ({ hasGameTab: Vue.ref(true) }),
    useRpcCache: () => ({ cache, dispatchRpc: async rows => { refreshes.push(rows); return { ok: true }; } }),
    watch: (...args) => { const stop = Vue.watch(...args); stops.push(stop); return stop; }, onMounted() {}, onUnmounted() {},
    chrome: { storage: { local: { get: async () => storage } }, runtime: { sendMessage: async message => {
      if (message.kind === 'mail-claim') { calls.push(message); storage.mailClaimState = { accountId: 1, pending: { token: 'pending' } }; }
      return { ok: true, queued: true };
    } } } };
  vm.runInNewContext(js + '\nglobalThis.ui = { claim, refresh, rows, pending };', context);
  t.after(() => stops.forEach(stop => stop()));
  props.modelValue = true; await Vue.nextTick(); assert.equal(calls.length, 0); assert.equal(refreshes.length, 0);
  await context.ui.claim(['102']); assert.equal(calls.length, 0, 'expired mail is never sent');
  await context.ui.claim(['101']); assert.equal(calls.length, 1); assert.equal(context.ui.pending.value, true);
  await context.ui.claim(['101']); assert.equal(calls.length, 1); assert.equal(cache.value['resource:gold'].data.amount, 100);
  clock.value += 70000; assert.equal(context.ui.rows.value.letters.length, 1);
});
