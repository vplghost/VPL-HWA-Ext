import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { patronName, refillableMetadata, selectItemTexture } from '../scripts/lib/observed-item-metadata.mjs';
import { getItemIcon, getResourceIcon, isInactiveResource } from '../src/utils/itemResources.ts';
import { isSelectableForHeader } from '../src/utils/resourceData.ts';

const context = {};
for (const name of ['data-names', 'item-resources', 'name-map']) {
  vm.runInNewContext(await readFile(new URL(`../extension/${name}.js`, import.meta.url), 'utf8'), context);
}

test('metadata selects unique texture names and explicit typed manifest entries without numeric guesses', () => {
  const manifest = { 'extends/icons/inventory/gear_6_new.img': {},
    'extends/strategic/resource_icons/lootBox/strategic_lootbox_chanced_27_icon.img': {},
    'extends/icons/patron/unique.img': {}, 'extends/icons/a/ambiguous.img': {}, 'extends/icons/b/ambiguous.img': {} };
  assert.equal(selectItemTexture(manifest, 'gear', 1, { icon: { imagePath: 'gear_6_new.png' } }).key,
    'extends/icons/inventory/gear_6_new.img');
  assert.equal(selectItemTexture(manifest, 'gear', 1), null);
  assert.equal(selectItemTexture(manifest, 'patron', 1, { icon: { imagePath: 'ambiguous.png' } }), null);
  assert.equal(selectItemTexture(manifest, 'lootboxChanced', 27).mapping, 'manifest-typed-resource-id');
  assert.equal(selectItemTexture(manifest, 'lootboxChanced', 28), null);
  assert.equal(selectItemTexture(manifest, 'unknown', 1, null), null);
});

test('relic shard titles follow library hero ident and the official locale template', () => {
  const locale = { PATRON_UNIVERSAL_ITEM_NAME: 'Relic Shard', LIB_PATRON_NAME: '%param1% Relic Shard' };
  assert.equal(patronName({ ident: 'universal' }, locale, {}), 'Relic Shard');
  assert.equal(patronName({ ident: 'hero_70' }, locale, { 70: 'Somna' }), 'Somna Relic Shard');
  assert.equal(patronName({ ident: 'hero_700' }, locale, { 70: 'Somna' }), null);
});

test('expiry and technical-counter classification keep active daily battle quotas', () => {
  const now = Date.parse('2026-11-14T00:00:00Z');
  const old = refillableMetadata({ id: 61, ident: 'refillable_energy', expiresAt: '2024-08-05 02:00:00' }, {}, {});
  assert.equal(old.expiresAt, Date.parse('2024-08-05T02:00:00Z'));
  assert.equal(refillableMetadata({ id: 10, ident: 'shopReset_merchant' }, {}, {}).internal, true);
  assert.equal(refillableMetadata({ id: 5, ident: 'arena_cooldown' }, {}, {}).internal, true);
  for (const id of [61, 511]) assert.equal(isInactiveResource({ key: `resource:refillable:${id}` }, now), true);
  for (const key of ['resource:gold', 'resource:refillable:6', 'resource:refillable:21',
    'resource:refillable:512', 'resource:world-refillable:6', 'resource:refillable:99999']) {
    assert.equal(isInactiveResource({ key }, now), false, key);
  }
  assert.equal(isInactiveResource({ key: 'resource:refillable:512' }, Date.parse('2026-11-23T02:00:00Z')), true);
  assert.equal(isSelectableForHeader({ key: 'resource:refillable:61' }), false);
});

test('missing inventory labels and alias icons resolve through the bundled supplement', () => {
  assert.equal(context.hwaHelperNameMap.item('patron', 1), 'Relic Shard');
  assert.equal(context.hwaHelperNameMap.item('patron', 2), 'Somna Relic Shard');
  assert.equal(context.hwaHelperNameMap.item('fragmentSkin', 327), 'Cascade Mythical Skin fragment');
  assert.equal(context.hwaHelperNameMap.item('fragmentSkin', 1004), 'Sebastian Dark Depths Skin fragment');
  assert.equal(context.hwaHelperNameMap.item('border', 127493), 'Avatar Frame');
  assert.equal(getItemIcon('fragmentSkin', 327), 'assets/items/skin/327.png');
  assert.equal(getItemIcon('patron', 1), 'assets/items/patron/1.png');
  assert.equal(getResourceIcon({ key: 'resource:lootboxChanced:27' }), 'assets/items/lootboxChanced/27.png');
  assert.equal(getItemIcon('unknown', 999999), null);
});

test('actual Items image handler uses bundled mappings and falls back after image errors', async () => {
  const source = await readFile(new URL('../src/components/tabs/ItemsTab.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const boundary = { ref, computed, getItemIcon, useRpcCache: () => ({ cache: ref({}), dispatchRpc() {} }),
    getItemName: (category, id) => context.hwaHelperNameMap.item(category, id) };
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js + '\nglobalThis.api = { getItemImgSrc, handleItemImageError };', boundary);
  const item = { category: 'patron', id: 1 };
  assert.equal(boundary.api.getItemImgSrc(item), 'assets/items/patron/1.png');
  assert.equal(boundary.api.getItemImgSrc({ category: 'fragmentSkin', id: 327 }), 'assets/items/skin/327.png');
  assert.equal(boundary.api.getItemImgSrc({ category: 'unknown', id: 999999 }), '');
  boundary.api.handleItemImageError(item);
  assert.equal(boundary.api.getItemImgSrc(item), '');
});

test('all newly extracted bundled images match audit hashes and original dimensions', async () => {
  const audit = JSON.parse(await readFile(new URL('../docs/observed-item-assets-1.293.1010-audit.json', import.meta.url), 'utf8'));
  assert.equal(audit.inputs.resources.rows, 150); assert.equal(audit.inputs.inventory.rows, 418);
  assert.equal(audit.source.library.md5, '1357804ab5ab599e3522f8cbdeb75802');
  assert.equal(audit.source.manifest.md5, 'c40122f2b0fb79fc5e133f9b9f9d5ee3');
  const extracted = audit.results.filter(row => row.imageStatus === 'extracted');
  assert.equal(extracted.length, 65);
  for (const row of extracted) {
    const bytes = await readFile(new URL('../extension/' + row.icon, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.pngSha256, row.icon);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), row.width); assert.equal(bytes.readUInt32BE(20), row.height);
    assert.match(row.sourceMd5, /^[a-f0-9]{32}$/);
  }
  const retired = audit.results.filter(row => row.visibility === 'expired');
  assert.equal(retired.length, 27);
  assert.equal(audit.results.filter(row => row.visibility === 'internal-counter').length, 27);
});
