import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed, watch, nextTick } from 'vue';
import { raidEnergyAutoService as auto } from '../src/services/queues/raidEnergyAuto.ts';
const config = { enabled: true, accountId: 10, threshold: 200, options: {
  mapId: 'map', center: { x: 1, y: 2 }, level: 5, count: 2, waitSeconds: 300,
  minMembers: 4, autoCancel: true, teamId: 'weakest', heroIds: [1, 2, 3, 4, 5]
} };
const energy = (amount = 199) => ({ method: 'refillableGetAll', data: {
  amount, cap: 200, lastRefillAt: 0, refillEveryMs: 300000, refillAmount: 1
} });
const observe = (previous, at, entry = energy(), settings = config, account = 10, session = 'page-1') =>
  auto.observe(previous, settings, entry, account, 1, session, at);

test('natural exact crossing fires once and can re-arm only after spending below threshold', () => {
  let step = observe(null, 270000);
  assert.equal(step.trigger, false);
  step = observe(step.state, 300001);
  assert.equal(step.trigger, true);
  step = observe(step.state, 330001);
  assert.equal(step.trigger, false);
  const spent = energy(199); spent.data.lastRefillAt = 330001;
  step = observe(step.state, 330002, spent);
  assert.equal(step.trigger, false);
  for (let at = 360001; at < 630001; at += 30000) step = observe(step.state, at, spent);
  assert.equal(observe(step.state, 630001, spent).trigger, true);
});

test('startup, reload, offline gap, account switch, configuration change and above threshold never trigger', () => {
  assert.equal(observe(null, 300001).trigger, false, 'Startup exactly at threshold');
  assert.equal(observe(null, 300001, energy(250)).trigger, false, 'Startup above cap');
  const before = observe(null, 270000).state;
  assert.equal(observe(before, 300001, energy(), config, 10, 'page-reload').trigger, false);
  assert.equal(observe(before, 400001).trigger, false, 'No offline catch-up');
  assert.equal(observe(before, 300001, energy(), config, 11).trigger, false);
  assert.equal(observe(before, 300001, energy(), { ...config, enabled: false }).trigger, false);
  assert.equal(observe(before, 300001, energy(), { ...config, options: { ...config.options, level: 2 } }).trigger, false);
  const low = { ...config, threshold: 100 };
  const previous = observe(null, 270000, energy(99), low).state;
  assert.equal(observe(previous, 300001, energy(101), low).trigger, false, 'Overshoot must not fire');
});

test('manual resource increases and missing refill evidence never count as natural regeneration', () => {
  const previous = observe(null, 200000).state;
  const manual = energy(200); manual.method = 'inventory_use';
  assert.equal(observe(previous, 210000, manual).trigger, false);
  assert.equal(observe(previous, 210000, energy(200)).trigger, false, 'Snapshot gain before refill tick');
  assert.equal(observe(previous, 300001, manual).trigger, false, 'Item at natural tick is excluded');
  assert.equal(observe(previous, 210000, { data: { amount: 200 } }).trigger, false);
  const invalid = observe(null, 200000, { data: { amount: 199 } });
  assert.equal(observe(invalid.state, 210000, energy(200)).trigger, false);
});

test('fresh authoritative snapshot consistent with natural refill can confirm exact crossing', () => {
  const previous = observe(null, 270000).state;
  const next = energy(200); next.data.lastRefillAt = 300000;
  assert.equal(observe(previous, 300001, next).trigger, true);
});

test('auto raid configuration validates complete bound dialog options', () => {
  assert.equal(!!auto.validConfig(config), true);
  assert.equal(!!auto.validConfig({ enabled: false }), true);
  for (const override of [{ threshold: 24 }, { threshold: 201 }, { threshold: 100.5 }, { options: {} },
    { options: { ...config.options, heroIds: [1, 1, 2, 3, 4] } },
    { options: { ...config.options, count: 0 } }, { options: { ...config.options, waitSeconds: 10 } }]) {
    assert.equal(!!auto.validConfig({ ...config, ...override }), false);
  }
});

test('actual Raid dialog saves full raidPreferences snapshot and does not silently enable global RPC (P2-50: Auto Raid moved to SettingsTab)', async t => {
  const source = await readFile(new URL('../src/components/dialogs/RaidModal.vue', import.meta.url), 'utf8');
  const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const writes = [], stops = [];
  const selectedTeamId = ref('custom:test');
  const team = ref({ id: 'custom:test', heroIds: [1, 2, 3, 4, 5], maxTroops: 1200 });
  const cache = ref({ accountStatus: { data: { id: 10 } } });
  const context = { ref, computed, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; },
    onMounted() {}, onUnmounted() {}, defineProps: () => ({ modelValue: false }), defineEmits: () => () => {},
    useRpcCache: () => ({ cache, dispatchRpc: async () => ({ ok: true }) }),
    useSquadTeams: () => ({ selectedTeamId, selectedTeam: team, teams: ref([team.value]),
      mapContext: ref({ mapId: 'map' }), mapCenter: ref({ x: 5, y: 6 }) }),
    normalizeArray: raw => Array.isArray(raw) ? raw : Object.values(raw || {}),
    bossConfigId: level => 59 + level, rallyWaitOptions: [60, 300],
    chrome: { storage: { local: { get: async () => ({ popupRpcEnabled: false }), set: async value => writes.push(value) } },
      runtime: { sendMessage: async () => ({ ok: true }) } } };
  t.after(() => stops.forEach(stop => stop()));
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(js + '\nglobalThis.api = { savePreferences, bossLevel, raidCount, waitSeconds, autoCancel, statusMessage, ensureRpcEnabled };', context);
  const ui = context.api;
  ui.bossLevel.value = 9;
  ui.raidCount.value = 3;
  ui.waitSeconds.value = 60;
  ui.autoCancel.value = false;
  await ui.savePreferences();
  const saved = writes.at(-1)?.raidPreferences;
  assert.equal(saved.accountId, 10);
  assert.equal(saved.mapId, 'map');
  assert.deepEqual(saved.center, { x: 5, y: 6 });
  assert.equal(saved.teamId, 'custom:test');
  assert.deepEqual(saved.heroIds, [1, 2, 3, 4, 5]);
  assert.equal(saved.maxTroops, 1200);
  assert.equal(saved.bossLevel, 9);
  assert.equal(saved.raidCount, 3);
  assert.equal(saved.waitSeconds, 60);
  assert.equal(saved.autoCancel, false);
  assert.ok(writes.every(value => !('popupRpcEnabled' in value)), 'Saving options cannot override global policy');
  assert.equal(await ui.ensureRpcEnabled(), false);
  assert.match(ui.statusMessage.value, /Enable RPC/);
});
