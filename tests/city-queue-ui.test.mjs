import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { useCityQueueActions } from '../src/composables/useCityQueueActions.ts';

test('Building dialog candidates and saved queue timeline preserve Hall multi-day duration', async () => {
  const source = await readFile(new URL('../src/components/dialogs/BuildingModal.vue', import.meta.url), 'utf8');
  const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const context = { ref, computed, useCityQueueActions,
    useRpcCache: () => ({ cache: ref({ buildingStatus: { data: { queues: [],
      buildings: [{ buildingId: 20, level: 20 }, { buildingId: 40, level: 20 }, { buildingId: 182, level: 20 }] } } }),
      dispatchRpc: async () => ({ ok: false }) }),
    defineProps: () => ({ modelValue: false }), defineEmits: () => () => {}, onMounted() {}, onUnmounted() {}, watch() {},
    getBuildingName: id => String(id), normalizeArray: value => Array.isArray(value) ? value : Object.values(value || {}) };
  for (const name of ['building-data', 'building-queue']) {
    vm.runInNewContext(await readFile(new URL('../extension/' + name + '.js', import.meta.url), 'utf8'), context);
  }
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(js + '\nglobalThis.api = { upgradeCandidates, queueTimeline, buildingQueue };', context);
  const hall = context.api.upgradeCandidates.value.find(item => item.id === 20);
  assert.equal(hall.nextLevel, 21);
  assert.equal(hall.durationMs, 223381200);
  context.api.buildingQueue.value.items = [{ buildingId: 20, nextLevel: 21, durationMs: 10614000 }];
  assert.equal(context.api.queueTimeline.value.items[0].durationMs, 223381200);
});

test('both queue helpers preserve millisecond duration and distinguish legacy seconds by start units', async () => {
  const now = Date.parse('2026-11-13T08:33:46Z');
  for (const type of ['building', 'research']) {
    const context = { globalThis: {} };
    vm.runInNewContext(await readFile(new URL('../extension/' + type + '-queue.js', import.meta.url), 'utf8'), context);
    const helper = context.globalThis[type === 'building' ? 'hwaHelperBuildingQueue' : 'hwaHelperResearchQueue'];
    assert.equal(helper.getQueueEnd({ startDate: now, duration: 30000 }, now), now + 30000);
    assert.equal(helper.getQueueEnd({ startDate: now, durationMs: 30000 }, now), now + 30000);
    assert.equal(helper.getQueueEnd({ startDate: now - 1500000, duration: 30000 }, now), now - 1470000,
      'A finished 30-second upgrade must not appear busy for another 7h55m');
    assert.equal(helper.getQueueEnd({ startTime: now / 1000, duration: 30 }, now), now + 30000);
    const plan = helper.planNextStep({ enabled: true, items: [] }, {
      [type + 'Status']: { data: { queues: [{ [type + 'Id']: 40, level: 2, startDate: now, duration: 30000 }] } },
    }, now);
    assert.equal(plan.wakeAt, now + 31000, '30 seconds must not turn into an 8-hour wait');
  }
});

test('UI queue commands wait for persistence, reject stale replies and surface logged errors', async t => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  const pending = [], messages = [], writes = [], applied = [];
  globalThis.chrome = { runtime: { sendMessage(message, callback) { messages.push(message); pending.push(callback); } },
    storage: { local: { get: async () => ({}), set: async value => writes.push(value) } } };
  const actions = useCityQueueActions('building', queue => applied.push(queue));
  const first = actions.commandQueue('add', { item: { buildingId: 40, nextLevel: 2 } });
  assert.equal(actions.queueBusy.value, true);
  assert.equal(applied.length, 0, 'No optimistic UI-only queue insertion');
  actions.applyQueueSnapshot({ updatedAt: 20, items: [{ buildingId: 41 }] });
  pending.shift()({ ok: true, queue: { updatedAt: 10, items: [{ buildingId: 40 }] } });
  await first;
  assert.equal(applied.length, 1, 'Older command reply cannot overwrite newer background state');
  assert.equal(applied[0].items[0].buildingId, 41);
  const rejected = actions.commandQueue('add', { item: { buildingId: 40 } });
  pending.shift()({ ok: false, error: 'This target level is already queued.', logged: true });
  await rejected;
  assert.match(actions.queueError.value, /already queued/);
  assert.equal(actions.queueBusy.value, false);
  assert.deepEqual(writes, [], 'Background-logged errors should not be duplicated');
  const disconnected = actions.commandQueue('clear');
  pending.shift()(undefined);
  await disconnected;
  assert.match(actions.queueError.value, /No confirmation/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].buildingQueueLogs[0].action, 'ui_error');
  assert.ok(messages.every(message => message.kind === 'building-queue-action'));
});

test('actual Building and Research Add Queue handlers send intent and retain UI on logical failure', async t => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  for (const type of ['building', 'research']) {
    const cap = type[0].toUpperCase() + type.slice(1);
    const source = await readFile(new URL('../src/components/dialogs/' + cap + 'Modal.vue', import.meta.url), 'utf8');
    const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
    const messages = [], callbacks = [], writes = [];
    globalThis.chrome = { runtime: { sendMessage(message, callback) { messages.push(message); callbacks.push(callback); } },
      storage: { local: { get: async () => ({}), set: async value => writes.push(value) } } };
    const context = { ref, computed, useCityQueueActions, useRpcCache: () => ({ cache: ref({}), dispatchRpc: async () => ({ ok: false }) }),
      defineProps: () => ({ modelValue: false }), defineEmits: () => () => {}, onMounted() {}, onUnmounted() {}, watch() {},
      normalizeArray: value => Array.isArray(value) ? value : Object.values(value || {}) };
    const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
    vm.runInNewContext(js + '\nglobalThis.api = { addToQueue, queue: ' + type + 'Queue, queueError, removeQueueItem };', context);
    const ui = context.api;
    const add = ui.addToQueue({ id: 40, currentLevel: 1, nextLevel: 2, durationMs: 30000 });
    assert.equal(ui.queue.value.items.length, 0);
    assert.equal(messages[0].action, 'add');
    assert.equal(messages[0].item[type + 'Id'], 40);
    callbacks.shift()({ ok: true, queue: { updatedAt: 1, enabled: true,
      items: [{ [type + 'Id']: 40, nextLevel: 2, queueItemId: 'saved' }] } });
    await add;
    assert.equal(ui.queue.value.items.length, 1);
    const duplicate = ui.addToQueue({ id: 40, currentLevel: 1, nextLevel: 2 });
    callbacks.shift()({ ok: false, error: 'Already queued', logged: true });
    await duplicate;
    assert.equal(ui.queue.value.items.length, 1);
    assert.match(ui.queueError.value, /Already queued/);
    assert.deepEqual(writes, [], 'Queue snapshots must be persisted only by background');
  }
});
