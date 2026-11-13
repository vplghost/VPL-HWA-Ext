import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import * as formatting from '../src/utils/resourceData.ts';
import * as itemResources from '../src/utils/itemResources.ts';

const source = await readFile(new URL('../src/components/tabs/ResourcesTab.vue', import.meta.url), 'utf8');
const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
const render = new Function('Vue', compile(source.match(/<template>([\s\S]*)<\/template>/)[1],
  { mode: 'function', prefixIdentifiers: true }).code)(Vue);
const resource = (amount, label) => ({ data: { amount, label } });
function setup(data) {
  const cache = Vue.ref(data), pins = Vue.ref(['resource:gold', 'resource:lootboxChanced:27']);
  const downloads = [], calls = [];
  const boundary = { ...formatting, ...itemResources, ref: Vue.ref, computed: Vue.computed,
    useNow: () => Vue.ref(Date.parse('2026-11-14T00:00:00Z')),
    useRpcCache: () => ({ cache, dispatchRpc: async rpc => { calls.push(rpc); } }),
    useResourceSelection: () => ({ isPinned: key => pins.value.includes(key),
      togglePin: key => { pins.value = pins.value.includes(key) ? pins.value.filter(pin => pin !== key) : [...pins.value, key]; } }),
    downloadJson: (filename, value) => downloads.push({ filename, value }),
  };
  vm.runInNewContext(js + '\nglobalThis.api = { allResources, filteredResources, pinnedResourceCount, search, filterPinnedOnly, isRefreshing, togglePin, refreshResources, exportResourcesJson, handleResourceImageError };', boundary);
  const html = () => renderToString(Vue.createSSRApp({ setup: () => ({ ...boundary, ...boundary.api }), render }));
  return { cache, pins, api: boundary.api, downloads, calls, html };
}

test('duplicate matching follows actual Items category/ID and positive-stock semantics', () => {
  const inventory = { coin: { 1: 20 }, material: { 1: 0 }, consumable: { 2: '3' } };
  assert.equal(formatting.isListedInventoryItem({ key: 'resource:coin:1' }, inventory), true);
  assert.equal(formatting.isListedInventoryItem({ key: 'resource:material:1' }, inventory), false);
  assert.equal(formatting.isListedInventoryItem({ key: 'resource:consumable:2' }, inventory), true);
  for (const key of ['resource:gold', 'resource:refillable:1', 'resource:coin:3', 'other:coin:1', 'resource:coin:1:extra']) {
    assert.equal(formatting.isListedInventoryItem({ key }, inventory), false, key);
  }
  assert.equal(formatting.isListedInventoryItem({ key: 'resource:coin:1' }, null), false);
});

test('Resources hides only items listed in Items and reacts when inventory arrives or changes', () => {
  const runtime = setup({ 'resource:gold': resource(50, 'Gold'),
    'resource:lootboxChanced:27': resource(2, 'Tomes Casket'),
    'resource:coin:1': resource(5, 'Arena Coin'), 'resource:material:1': resource(10, 'Elarite') });
  assert.equal(runtime.api.allResources.value.length, 4, 'Keep balances when no inventory snapshot exists');
  runtime.cache.value.inventoryGet = { data: { lootboxChanced: { 27: 2 }, coin: { 1: 5 } } };
  assert.deepEqual(Array.from(runtime.api.allResources.value, item => item.key), ['resource:gold', 'resource:material:1']);
  assert.equal(runtime.api.pinnedResourceCount.value, 1);
  assert.deepEqual(runtime.pins.value, ['resource:gold', 'resource:lootboxChanced:27'], 'Do not erase header pin preferences');
  runtime.cache.value.inventoryGet.data.lootboxChanced[27] = 0;
  assert.ok(runtime.api.allResources.value.some(item => item.key === 'resource:lootboxChanced:27'));
});

test('search, pinned filtering and JSON export use the same deduplicated resource list', () => {
  const runtime = setup({ inventoryGet: { data: { lootboxChanced: { 27: 2 } } },
    'resource:gold': resource(50, 'Gold'), 'resource:material:4': resource(80, 'Wood'),
    'resource:lootboxChanced:27': resource(2, 'Tomes Casket') });
  runtime.api.filterPinnedOnly.value = true;
  runtime.api.exportResourcesJson();
  assert.deepEqual(Array.from(runtime.downloads[0].value, item => item.key), ['resource:gold']);
  runtime.api.filterPinnedOnly.value = false;
  runtime.api.search.value = 'Wood'; runtime.api.exportResourcesJson();
  assert.deepEqual(Array.from(runtime.downloads[1].value, item => item.key), ['resource:material:4']);
  assert.equal(runtime.downloads[1].filename, 'hwa-resources.json');
  runtime.api.search.value = 'Tomes'; runtime.api.exportResourcesJson();
  assert.equal(runtime.downloads[2].value.length, 0);
  runtime.api.search.value = ''; runtime.api.togglePin('resource:material:4');
  assert.equal(runtime.api.pinnedResourceCount.value, 2);
});

test('expired events and technical counters are absent from Resources and export while zero battle quotas stay', () => {
  const old = resource(200, 'Old Adventure Energy');
  const runtime = setup({ 'resource:refillable:511': old,
    'resource:refillable:512': resource(52, 'Adventure Energy'),
    'resource:refillable:6': resource(0, 'Arena battles'),
    'resource:refillable:10': resource(0, 'Shop reset'), 'resource:gold': resource(50, 'Gold') });
  assert.deepEqual(Array.from(runtime.api.allResources.value, item => item.key),
    ['resource:refillable:512', 'resource:refillable:6', 'resource:gold']);
  runtime.api.exportResourcesJson();
  assert.equal(runtime.downloads[0].value.length, 3);
  assert.equal(runtime.cache.value['resource:refillable:511'].data.amount, 200);
});

test('resource images fall back to the category icon after a load failure', async () => {
  const runtime = setup({ 'resource:lootboxChanced:27': resource(1, 'Tomes Casket') });
  assert.match(await runtime.html(), /assets\/items\/lootboxChanced\/27.png/);
  runtime.api.handleResourceImageError('resource:lootboxChanced:27');
  assert.doesNotMatch(await runtime.html(), /assets\/items\/lootboxChanced\/27.png/);
});

test('actual Resources template renders compact automatic columns and accessible pin controls', async () => {
  const runtime = setup({ inventoryGet: { data: { lootboxChanced: { 27: 2 } } },
    'resource:gold': resource(50, 'Gold'), 'resource:lootboxChanced:27': resource(2, 'Tomes Casket') });
  const html = await runtime.html();
  assert.match(html, /grid-cols-\[repeat\(auto-fill,minmax\(min\(100%,12rem\),1fr\)\)\]/);
  assert.match(html, /aria-label="Search resources"/);
  assert.match(html, /aria-label="Unpin Gold from header"/);
  assert.match(html, /aria-checked="true"/);
  assert.doesNotMatch(html, /Tomes Casket/);
  await runtime.api.refreshResources();
  assert.equal(runtime.calls[0][0].name, 'inventoryGet');
});
