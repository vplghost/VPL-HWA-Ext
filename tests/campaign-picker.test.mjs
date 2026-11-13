import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { recentMissionIds, rememberMission } from '../src/utils/campaignMissionHistory.ts';
import { getItemIcon } from '../src/utils/itemResources.ts';

const data = JSON.parse(await readFile(new URL('../src/data/campaign-picker.json', import.meta.url)));
vm.runInThisContext(await readFile(new URL('../extension/campaign-missions.js', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
async function loadComponent(path, imports = {}) {
  const { descriptor } = parse(await readFile(new URL('../src/components/dialogs/' + path, import.meta.url), 'utf8'));
  const compiled = compileScript(descriptor, { id: path, inlineTemplate: true });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => imports[name] || require(name), module, module.exports);
  return module.exports.default;
}
const Tooltip = { setup: (_, { slots }) => () => Vue.h('div', [slots.default?.(), slots.content?.()]) };
const MissionTooltip = await loadComponent('MissionDropTooltip.vue', {
  '@/src/data/campaign-picker.json': data,
  '@/src/components/common/BaseTooltip.vue': Tooltip,
  '@/src/utils/metadata': { getItemName: (category, id) => `${category} ${id}` },
  '@/src/utils/itemResources': { getItemIcon },
});
const Picker = await loadComponent('CampaignMissionPicker.vue', {
  '@/src/data/campaign-picker.json': data, './MissionDropTooltip.vue': MissionTooltip,
});

test('picker uses verified campaign world names and previews actual possible drops with bundled images', async () => {
  assert.equal(data.chapters['10'], 'Cursed Waters');
  assert.equal(data.missions['135'].name, '10-5: Roaring Abyss');
  assert.ok(data.missions['1'].drops.some(drop => drop.category === 'fragmentHero' && drop.id === 7));
  assert.ok(data.missions['135'].drops.some(drop => drop.category === 'consumable' && drop.id === 10));
  const html = await renderToString(Vue.createSSRApp({ render: () => Vue.h(Picker, {
    modelValue: 135, isMissionDisabled: () => false, missionStatus: () => 'Mission #135',
  }) }));
  assert.match(html, /10 · Cursed Waters/);
  assert.match(html, /campaign-chapter-select/); assert.match(html, /campaign-mission-input/);
  assert.match(html, /Possible item drops/); assert.match(html, /fragmentGear 169/);
  assert.match(html, /assets\/items\/gear\/9.png/);
});

test('recent farms are unique, ordered newest first, capped at five and reject malformed storage', () => {
  let recent = [];
  for (const id of [1, 2, 3, 4, 5, 6, 3]) recent = rememberMission(recent, id);
  assert.deepEqual(recent, [3, 6, 5, 4, 2]);
  assert.deepEqual(recentMissionIds({ 1: 135 }), []);
  assert.deepEqual(recentMissionIds([null, '135', -1, 2, 2, 1.1]), [2]);
});

test('chapter and mission actions select matching missions, retain exhausted restrictions and follow external candidate selection', async t => {
  const source = await readFile(new URL('../src/components/dialogs/CampaignMissionPicker.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const props = Vue.reactive({ modelValue: 135, disabled: false, isMissionDisabled: id => id === 1 });
  const updates = [], stops = [];
  const context = { ...Vue, pickerData: data, hwaHelperCampaignMissions: globalThis.hwaHelperCampaignMissions,
    defineProps: () => props, defineEmits: () => (_, id) => updates.push(id),
    watch: (...args) => { const stop = Vue.watch(...args); stops.push(stop); return stop; },
  };
  t.after(() => stops.forEach(stop => stop()));
  vm.runInNewContext(js + '\nglobalThis.api = { chapter, chapterMissions, open, changeChapter, selectMission };', context);
  const ui = context.api;
  ui.chapter.value = 1; ui.changeChapter();
  assert.equal(updates.at(-1), 1);
  assert.ok(ui.chapterMissions.value.every(mission => mission.chapter === 1));
  ui.selectMission(1); assert.equal(updates.length, 1, 'Exhausted mission cannot be clicked');
  ui.selectMission(2); assert.equal(updates.at(-1), 2);
  props.modelValue = 135; props.modelValue = 140; await Vue.nextTick();
  assert.equal(ui.chapter.value, 10, 'Recommended/recent mission changes synchronize the chapter');
  props.disabled = true; await Vue.nextTick();
  ui.selectMission(3); assert.equal(updates.at(-1), 2);
  assert.equal(ui.open.value, false);
});

test('actual Campaign raid only records history after confirmed successful results, never a queued or rejected action', async () => {
  const source = await readFile(new URL('../src/components/dialogs/CampaignRaidModal.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const state = Vue.ref({ accountStatus: { data: { id: 1 } } }), records = [];
  let result = { ok: false, pending: true }, transport = { ok: true, queued: true };
  const context = { ...Vue, pickerData: data, console,
    defineProps: () => ({ modelValue: false }), defineEmits: () => () => {}, watch() {}, onMounted() {}, onUnmounted() {},
    useRpcCache: () => ({ cache: state, dispatchRpc: async () => transport }),
    useModals: () => ({ modalContext: {} }),
    useCampaignMissionHistory: () => ({ recent: Vue.ref([]), record: async (...args) => records.push(args) }),
    waitForCampaignRaidResult: async () => result,
    chrome: { storage: { local: { set: async () => {}, get: async () => ({}) } } },
    hwaHelperCampaignMissions: globalThis.hwaHelperCampaignMissions,
  };
  vm.runInNewContext(js + '\nglobalThis.api = { executeRaidCall };', context);
  await context.api.executeRaidCall(1); assert.equal(records.length, 0);
  result = { ok: false, error: 'Rejected' };
  await context.api.executeRaidCall(1); assert.equal(records.length, 0);
  // Use another mission after the rejected one was marked disabled for today.
  vm.runInNewContext('missionId.value = 136;', context);
  result = { ok: true, drops: { gold: 20 } };
  await context.api.executeRaidCall(1);
  assert.deepEqual(records, [[136, 1]]);
});

test('history merges successful farms during a late load, survives reopening and isolates accounts', async t => {
  const source = await readFile(new URL('../src/composables/useCampaignMissionHistory.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source.replace(/^import .*;\r?$/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/export /g, '');
  const stored = {}, stops = [], reads = [];
  let delay = true;
  const context = { ...Vue, recentMissionIds, rememberMission, console,
    watch: (...args) => { const stop = Vue.watch(...args); stops.push(stop); return stop; },
    chrome: { storage: { local: {
      get: key => delay ? new Promise(resolve => reads.push({ key, resolve })) : Promise.resolve({ [key]: stored[key] }),
      set: async value => Object.assign(stored, value),
    } } },
  };
  vm.runInNewContext(js + '\nglobalThis.make = useCampaignMissionHistory;', context);
  t.after(() => stops.forEach(stop => stop()));
  const account = Vue.ref(1), history = context.make(account);
  const record = history.record(135);
  reads.shift().resolve({ 'campaignRecentMissions:1': [10, 20, 30, 40, 50] });
  await record;
  assert.deepEqual([...history.recent.value], [135, 10, 20, 30, 40]);
  assert.deepEqual([...stored['campaignRecentMissions:1']], [135, 10, 20, 30, 40]);
  delay = false;
  const reopened = context.make(account);
  for (let i = 0; i < 5; i++) { await Vue.nextTick(); await Promise.resolve(); }
  assert.deepEqual([...reopened.recent.value], [135, 10, 20, 30, 40]);
  account.value = 2; await Vue.nextTick(); await Promise.resolve();
  assert.deepEqual([...history.recent.value], []);
  await history.record(99, 1);
  assert.equal(stored['campaignRecentMissions:2'], undefined);
  await history.record(80, 2);
  assert.deepEqual([...stored['campaignRecentMissions:2']], [80]);
});
