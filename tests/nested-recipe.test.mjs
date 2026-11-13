import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ref, computed, createRenderer, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { buildGearRecipeTree, findFirstUnfulfilledNode, findRecipeNode, recipeMissions, recipeFarmCategory } from '../src/utils/recipeTree.ts';

const require = createRequire(import.meta.url);
for (const file of ['data-names.js', 'hero-metadata.js', 'campaign-missions.js']) {
  vm.runInThisContext(await readFile(new URL('../extension/' + file, import.meta.url), 'utf8'));
}
const cache = (inventory = {}) => ({ inventoryGet: { data: inventory } });
const trineKey = 'gear:131/gear:127';
const headKey = trineKey + '/gear:94';

test('World Tremor expands Trine and all three ingredients with distinct repeated-item paths', () => {
  const tree = buildGearRecipeTree(131, cache());
  const trine = findRecipeNode(tree, trineKey);
  assert.equal(trine.name, 'Trine');
  assert.deepEqual(trine.children.map(node => node.id), ['94', '95', '96']);
  assert.equal(findRecipeNode(tree, headKey).fragment.required, 20);
  assert.notEqual(findRecipeNode(tree, headKey).key, tree.children[0].key);
  assert.equal(findFirstUnfulfilledNode(tree).id, '94');
  assert.ok(recipeMissions(findRecipeNode(tree, headKey)).every(m => m.drops.fragmentGear.includes(94)));
  assert.equal(recipeMissions(trine).length, 0);
});

test('owned parents skip descendant farming and shared gear/fragments are reserved only once', () => {
  const tree = buildGearRecipeTree(131, cache({ gear: { 94: 1 }, fragmentGear: { 94: 10 } }));
  assert.equal(tree.children[0].isFulfilled, true);
  const nested = findRecipeNode(tree, headKey);
  assert.equal(nested.owned, 0, 'The direct World Tremor ingredient already reserves the one owned item');
  assert.equal(nested.fragment.owned, 10);
  const fragments = buildGearRecipeTree(131, cache({ fragmentGear: { 94: 20 } }));
  assert.equal(fragments.children[0].canCraft, true);
  assert.equal(findRecipeNode(fragments, headKey).fragment.isFulfilled, false);
  const owned = buildGearRecipeTree(131, cache({ gear: { 131: 1 } }));
  assert.equal(findFirstUnfulfilledNode(owned), null);
  assert.equal(findRecipeNode(owned, headKey).requiredCount, 0);
});

test('required copies propagate through deeper recipes and cycles cannot become craftable', () => {
  const prior = globalThis.hwaHelperGearCraftData;
  try {
    globalThis.hwaHelperGearCraftData = { 900: { recipe: { 901: 2 } }, 901: { recipe: { 902: 3 } },
      902: { recipe: { 903: 2 } }, 903: { fragmentCount: 5 } };
    const tree = buildGearRecipeTree(900, cache({ gear: { 901: 1 } }));
    const leaf = tree.children[0].children[0].children[0];
    assert.equal(leaf.requiredCount, 6);
    assert.equal(leaf.fragment.required, 30);
    globalThis.hwaHelperGearCraftData = { 900: { recipe: { 901: 1 } }, 901: { recipe: { 900: 1 } } };
    const cycle = buildGearRecipeTree(900, cache());
    assert.equal(cycle.children[0].children[0].cycle, true);
    assert.equal(cycle.children[0].canCraft, false);
  } finally { globalThis.hwaHelperGearCraftData = prior; }
});

async function recipeComponent() {
  const text = await readFile(new URL('../src/components/dialogs/RecipeTreeNode.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(text, { filename: 'RecipeTreeNode.vue' });
  const compiled = compileScript(descriptor, { id: 'recipe-test', inlineTemplate: true });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { require, exports: module.exports, module });
  return module.exports.default;
}
test('recursive Vue template renders every nested name and craft control', async () => {
  const component = await recipeComponent();
  const tree = buildGearRecipeTree(131, cache({ fragmentGear: { 95: 20 } }));
  const html = await renderToString(createSSRApp(component, { node: tree, selectedKey: headKey, isCrafting: false, isRunning: false }));
  for (const name of ['World Tremor', 'Trine', 'Hand of Glory', 'Desert Blade']) assert.ok(html.includes(name), name);
  assert.ok(html.includes('data-recipe-key="' + headKey + '"'));
  assert.ok(html.includes('Craft'));
});

test('deep component select/craft events bubble to the root with the correct branch', async () => {
  const component = await recipeComponent();
  const root = { children: [] };
  const renderer = createRenderer({
    createElement: type => ({ type, children: [], props: {} }), createText: text => ({ text }), createComment: () => ({}),
    insert(child, parent) { parent.children.push(child); }, remove() {}, setElementText(el, text) { el.text = text; },
    setText(el, text) { el.text = text; }, patchProp(el, key, old, value) { el.props[key] = value; }, parentNode: () => null, nextSibling: () => null,
  });
  const selected = [], crafted = [];
  const tree = buildGearRecipeTree(131, cache({ fragmentGear: { 95: 20 } }));
  const app = renderer.createApp(component, { node: tree, selectedKey: null, isCrafting: false, isRunning: false,
    onSelect: node => selected.push(node.key), onCraft: node => crafted.push(node.key) });
  app.mount(root);
  const find = (el, predicate) => predicate(el) ? el : el.children?.map(child => find(child, predicate)).find(Boolean);
  const branch = find(root, el => el.props?.['data-recipe-key'] === trineKey + '/gear:95');
  const buttons = [];
  const walk = el => { if (el.type === 'button') buttons.push(el); for (const child of el.children || []) walk(child); };
  walk(branch);
  buttons[0].props.onClick(); buttons[1].props.onClick(); await nextTick();
  assert.deepEqual(selected, [trineKey + '/gear:95']);
  assert.deepEqual(crafted, selected);
  app.unmount();
});

test('actual dialog targets nested fragments, computes progress and blocks unrelated composite raids', async () => {
  const text = await readFile(new URL('../src/components/dialogs/CampaignRaidModal.vue', import.meta.url), 'utf8');
  const source = text.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const data = ref({ ...cache(), missionGetAll: { data: Object.fromEntries(Object.keys(globalThis.hwaHelperCampaignMissions.missions).map(id => [id, { stars: 3 }])) } });
  const context = { ref, computed, watch() {}, onMounted() {}, onUnmounted() {},
    defineProps: () => ({ modelValue: true }), defineEmits: () => () => {},
    useRpcCache: () => ({ cache: data, dispatchRpc: async () => ({ ok: false }) }), useModals: () => ({ modalContext: {} }),
    buildGearRecipeTree, findFirstUnfulfilledNode, findRecipeNode, recipeMissions, recipeFarmCategory,
    hwaHelperCampaignMissions: globalThis.hwaHelperCampaignMissions,
    testCache: data, raidCalls: 0,
  };
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(js + '\nglobalThis.api = {selectedGearId, selectedRecipeNodeId, recipeTree, selectRecipeNode, candidateMissions, missionId, targetItemProgress, sessionFarmedCount, localRaidResult, canFarmSelectedTarget, isNodeRequirementMet, executeSequentialLoop, loopStatusMsg};', context);
  const ui = context.api;
  ui.selectedGearId.value = 131;
  const child = findRecipeNode(ui.recipeTree.value, trineKey + '/gear:95');
  ui.selectRecipeNode(child);
  assert.equal(ui.selectedRecipeNodeId.value, child.key);
  assert.ok(ui.candidateMissions.value.length > 0);
  assert.equal(ui.canFarmSelectedTarget.value, true);
  assert.equal(ui.targetItemProgress.value.required, 20);
  data.value.inventoryGet.data.fragmentGear = { 95: 20 };
  assert.equal(ui.targetItemProgress.value.isFulfilled, true);
  assert.equal(ui.isNodeRequirementMet(findRecipeNode(ui.recipeTree.value, child.key)), true);
  ui.localRaidResult.value = { drops: { fragmentGear: { 95: 2 }, scroll: { 95: 8 } } };
  assert.equal(ui.sessionFarmedCount.value, 2, 'Only the selected item category counts');
  data.value.inventoryGet.data.fragmentGear = { 95: 19 };
  vm.runInNewContext("executeRaidCall = async () => { raidCalls++; testCache.value.inventoryGet.data.fragmentGear[95]++; return {ok:true, drops:{fragmentGear:{95:1}}}; };", context);
  await ui.executeSequentialLoop(10);
  assert.equal(context.raidCalls, 1, 'Nested farming auto-stops when its fragment requirement is reached');
  assert.match(ui.loopStatusMsg.value, /Target requirement reached/);
  ui.selectRecipeNode(findRecipeNode(ui.recipeTree.value, trineKey));
  assert.equal(ui.canFarmSelectedTarget.value, false);
  data.value.inventoryGet.data.gear = { 131: 1 };
  assert.equal(ui.targetItemProgress.value.required, 0);
  assert.equal(ui.targetItemProgress.value.isFulfilled, true);
});
