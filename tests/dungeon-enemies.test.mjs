import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import { normalizeArray } from '../src/utils/troops.ts';
import { formatNumber } from '../src/utils/formatters.ts';
import UnitStars from './helpers/unit-stars.mjs';

const source = await readFile(new URL('../src/components/dialogs/DungeonModal.vue', import.meta.url), 'utf8');
const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
const template = source.match(/<template>([\s\S]*)<\/template>/)[1];
function findGrid(node) {
  if (node.props?.some(prop => prop.name === 'id' && prop.value?.content === 'dungeon-doors-grid')) return node;
  for (const child of node.children || []) { const found = findGrid(child); if (found) return found; }
}
// Render the actual door template with the actual SFC computed state.
const render = new Function('Vue', compile(findGrid(parse(template)).loc.source, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
const metadata = {};
vm.runInNewContext(await readFile(new URL('../extension/titan-metadata.js', import.meta.url), 'utf8'), metadata);
function setup(data) {
  const cache = Vue.ref({ dungeonStatus: { data } });
  const context = { ref: Vue.ref, computed: Vue.computed, normalizeArray, formatNumber,
    getTitanMetadata: id => metadata.hwaHelperTitanMetadata[id],
    useRpcCache: () => ({ cache, dispatchRpc() {}, updateCacheLocally() {} }),
    defineProps: () => ({ modelValue: true }), defineEmits: () => () => {},
    onMounted() {}, onUnmounted() {}, watch() {} };
  vm.runInNewContext(js + '\nglobalThis.api = { doors, activeBattle, floorNumber, handleImgError };', context);
  const html = () => renderToString(Vue.createSSRApp({ components: { UnitStars }, setup: () => ({ ...context.api, formatNumber }), render }));
  return { cache, api: context.api, html };
}

test('Dungeon renders captured door.team Titans with names, levels, stars, elements and avatars per door', async () => {
  const runtime = setup({ floorNumber: 782, currentFloorDoors: [
    { power: 69378, team: [{ id: 4012, level: 55, star: 5 }, { id: 4024, level: 62, star: 5 }] },
    { team: [{ id: 4003, level: 54, star: 4 }] },
  ] });
  const html = await runtime.html();
  const door1 = html.match(/aria-label="Door 1 enemy Titans"([\s\S]*?)<\/ul>/)[1];
  const door2 = html.match(/aria-label="Door 2 enemy Titans"([\s\S]*?)<\/ul>/)[1];
  assert.match(door1, /Ignis/); assert.match(door1, /Verdoc/);
  assert.match(door1, /Lv\. 55/); assert.match(door1, /Lv\. 62/);
  assert.match(door1, /5★/); assert.match(door1, /Fire/); assert.match(door1, /Earth/);
  assert.match(door1, /assets\/titans\/4012.png/);
  assert.doesNotMatch(door1, /Hyperion/);
  assert.match(door2, /Hyperion/); assert.match(door2, /4★/);
  assert.doesNotMatch(door2, /Ignis|Verdoc/);
});

test('six-star enemy Titans use the shared Absolute icon instead of a numeric badge', async () => {
  const runtime = setup({ currentFloorDoors: [{ team: [{ id: 4012, star: 6 }] }] });
  const html = await runtime.html();
  assert.match(html, /aria-label="6 stars \(Absolute\)"/);
  assert.match(html, /justice-star/);
  assert.doesNotMatch(html, /6★|★★★★★★/);
});

test('Dungeon roster handles object collections, missing metadata and legacy enemies without inventing stats', async () => {
  const runtime = setup({ currentFloorDoors: {
    0: { team: { 0: { id: 9999 }, 1: { id: '4001', level: 0, star: 0 } } },
    1: { enemies: [4021, null, true, {}, { id: -1 }] },
    2: {},
  } });
  const html = await runtime.html();
  assert.match(html, /Titan 9999/); assert.doesNotMatch(html, /9999.png/);
  assert.match(html, /Nova/); assert.match(html, /Lv\. 0/);
  assert.match(html, /Sylva/); assert.match(html, /Enemy Titan data unavailable/);
  assert.deepEqual(Array.from(runtime.api.doors.value[1].enemies, titan => titan.id), [4021]);
  assert.equal(runtime.api.doors.value[0].enemies[0].level, null);
  assert.equal(runtime.api.doors.value[0].enemies[0].star, null);
});

test('Dungeon floor changes replace enemy rosters and never substitute player Titans', async () => {
  const runtime = setup({ floorNumber: 1, currentFloorDoors: [{ team: [{ id: 4012, level: 55, star: 5 }] }],
    states: { titans: { 4003: { hp: 100, maxHp: 100 } } } });
  assert.match(await runtime.html(), /Ignis/);
  runtime.cache.value.dungeonStatus.data = { floorNumber: 2,
    currentFloorDoors: [{ team: [{ id: 4024, level: 62, star: 5 }], enemies: [4003] }] };
  const html = await runtime.html();
  assert.equal(runtime.api.floorNumber.value, 2);
  assert.match(html, /Verdoc/); assert.doesNotMatch(html, /Ignis|Hyperion/);
  runtime.cache.value.dungeonStatus.data = { floorNumber: 3, currentFloorDoors: [] };
  assert.equal(runtime.api.doors.value.length, 0);
});
