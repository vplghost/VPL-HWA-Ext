import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';

// Execute the actual SFC setup handlers with Chrome/composable boundaries mocked.
// Template rendering and live Chrome behavior remain browser acceptance work.
async function setup(file, exposed, cacheData = {}) {
  const text = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
  const source = text.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/^import [\s\S]*?;\r?$/gm, '');
  const mounted = [], sent = [], writes = [];
  const cache = ref(cacheData);
  const api = { cache, dispatchRpc: async calls => { sent.push(calls); return { ok: false, error: 'disabled' }; } };
  const context = vm.createContext({ ref, computed, console, Date, Map, Set, Number, Object, Array,
    defineProps: () => ({ modelValue: false, hero: { id: 1 } }), defineEmits: () => () => {},
    onMounted: fn => mounted.push(fn), onUnmounted() {}, watch() {},
    useRpcCache: () => api, useModals: () => ({ openModal() {} }),
    useSquadTeams: () => ({ loadSquadData: async () => {} }),
    normalizeArray: value => Array.isArray(value) ? value : Object.values(value || {}),
    window: { setInterval: () => 1 }, document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, clearInterval() {},
    chrome: { storage: { local: { get: async () => ({ popupRpcEnabled: false }), set: async value => writes.push(value) },
      onChanged: { addListener() {}, removeListener() {} } } },
  });
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInContext(js + '\nglobalThis.exposed = {' + exposed + '};', context);
  return { handlers: context.exposed, mounted, sent, writes, cache };
}

test('mounting raid and monster dialogs preserves disabled shared RPC policy', async () => {
  for (const file of ['dialogs/RaidModal.vue', 'dialogs/MonsterModal.vue']) {
    const runtime = await setup(file, 'refreshMapCoordinates');
    for (const fn of runtime.mounted) await fn();
    assert.deepEqual(runtime.writes, [], file + ' must not enable RPC during mount');
    await runtime.handlers.refreshMapCoordinates();
    assert.ok(runtime.sent.flat().some(call => call.name === 'getMarches' && call.feature === 'march'));
  }
});

test('hero skill rejection never fabricates a successful skill level', async () => {
  const data = { heroGetAll: { data: { 1: { id: 1, skills: { 1: 10 } } } }, 'resource:refillable:2': { data: { amount: 5 } } };
  const runtime = await setup('dialogs/HeroDetailModal.vue', 'upgradeSkill, internalHeroId', data);
  runtime.handlers.internalHeroId.value = '1';
  await runtime.handlers.upgradeSkill({ slot: 1 });
  assert.equal(runtime.cache.value.heroGetAll.data[1].skills[1], 10);
  assert.equal(runtime.sent[0][0].name, 'heroUpgradeSkill');
  assert.ok(runtime.sent[0].some(call => call.name === 'heroGetAll'));
});
