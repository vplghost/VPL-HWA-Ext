import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { teamMemberIds, serverTeamGroups } from '../src/utils/teamMembers.ts';
import { normalizeAccountTeams } from '../src/composables/useAccountTeams.ts';
import { normalizeArray } from '../src/utils/troops.ts';
import { formatNumber } from '../src/utils/formatters.ts';

test('custom team storage normalizes indexed member objects without mutating saved data', () => {
  const raw = { 0: { id: 'legacy', name: 'Legacy Gather', heroIds: { 0: '1', 1: 2, 2: 2, 3: null, 4: false }, maxTroops: 1234 } };
  const result = normalizeAccountTeams(raw);
  assert.deepEqual(result, [{ id: 'legacy', name: 'Legacy Gather', heroIds: [1, 2], maxTroops: 1234 }]);
  assert.equal(Array.isArray(raw[0].heroIds), false);
  assert.deepEqual(teamMemberIds({ 0: { heroId: 1 }, 1: { id: 4000 }, 2: 'invalid' }), [1, 4000]);
  assert.deepEqual(teamMemberIds(null), []);
});

test('server teams retain flat indexed objects, nested arrays and nested dictionaries', () => {
  assert.deepEqual(serverTeamGroups({ 0: 1, 1: 2 }), [[1, 2]]);
  assert.deepEqual(serverTeamGroups({ first: { 0: 1, 1: 2 }, second: [3, 4] }), [[1, 2], [3, 4]]);
  assert.deepEqual(serverTeamGroups([[1, 2], [4000, 4001]]), [[1, 2], [4000, 4001]]);
  assert.deepEqual(serverTeamGroups(null), []);
});

const require = createRequire(import.meta.url), cache = Vue.ref({}), custom = Vue.ref([]);
const { descriptor } = parse(await readFile(new URL('../src/components/tabs/TeamsTab.vue', import.meta.url), 'utf8'));
const compiled = compileScript(descriptor, { id: 'teams-members-fixture', inlineTemplate: true });
const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} }, hover = { setup: (_, { slots }) => () => slots.default?.() };
const imports = {
  '@/src/composables/useRpcCache': { useRpcCache: () => ({ cache, dispatchRpc: async () => ({ ok: false }) }) },
  '@/src/composables/useAccountTeams': { useAccountTeams: () => ({ customTeams: custom, saveTeams: async () => {}, storageError: Vue.ref('') }) },
  '@/src/utils/teamMembers': { teamMemberIds, serverTeamGroups }, '@/src/utils/troops': { normalizeArray }, '@/src/utils/formatters': { formatNumber },
  '@/src/utils/metadata': { getHeroMetadata: id => ({ name: 'Hero ' + id }), getTitanMetadata: id => Number(id) >= 4000 ? { name: 'Titan ' + id } : undefined, starGlowClass: () => '' },
  '@/src/components/common/HeroHoverCard.vue': hover, '@/src/components/common/TitanHoverCard.vue': hover
};
new Function('require', 'module', 'exports', js)(name => imports[name] || require(name), module, module.exports);
const render = () => renderToString(Vue.createSSRApp({ render: () => Vue.h(module.exports.default) }));

test('actual Teams component renders legacy object member power and reacts to a hero-cache refresh', async () => {
  // Deliberately bypass the normalized loader: the power function must also be defensive.
  custom.value = [{ id: 'legacy', name: 'Legacy Gather', heroIds: { 0: 1, 1: 2 } }];
  cache.value = { accountStatus: { data: { id: 1 } }, heroGetAll: { data: { 1: { power: 1000 }, 2: { power: 2000 } } },
    teamGetAll: { data: { arena: { 0: 1, 1: 2 }, dungeon: { 0: 4000 } } }, titanGetAll: { data: { 4000: { power: 4000 } } } };
  const first = await render();
  assert.match(first, /Teams Management/); assert.match(first, /Legacy Gather/); assert.match(first, /Arena Defense/);
  assert.match(first, /Power: 3,000/); assert.match(first, /4,000/);
  cache.value.heroGetAll.data[1].power = 7000;
  const refreshed = await render();
  assert.match(refreshed, /Power: 9,000/); assert.doesNotMatch(refreshed, /NaN|undefined/);
});
