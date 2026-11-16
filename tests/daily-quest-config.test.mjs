import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { deriveDailyDefinitions, conditionTitle } from '../scripts/generate-quest-data.mjs';
import { normalizeArray } from '../src/utils/troops.ts';
import * as questDataModule from '../src/data/questData.ts';
import * as nameDataModule from '../src/data/nameData.ts';
import * as popupDataModule from '../src/utils/popupData.ts';

// Reduced pinned remote config, plus sanitized getDailyQuests from firstattack timeline 11.
const fixture = JSON.parse(await readFile(new URL('fixtures/daily-quest-config.json', import.meta.url)));
const data = questDataModule.questData || questDataModule.default || questDataModule;
const derived = deriveDailyDefinitions(fixture.quests, fixture.chains, fixture.conditions, fixture.packs, fixture.locale);

test('verified daily camp chain is cumulative 1 / 5 / 10, with phase 3 named correctly', () => {
  assert.deepEqual([362, 363, 364].map(id => derived.definitions[id].condition.target), [1, 5, 10]);
  for (const id of [362, 363, 364]) assert.equal(derived.definitions[id].transferProgress, true);
  assert.equal(derived.definitions[364].phase, 3);
  assert.equal(derived.definitions[364].translationMethod, 'globalMapCampVictories');
  assert.equal(data.dailyTitle(fixture.observed), 'Clear Brigand Camp 10 times');
  assert.equal(data.dailyDefinition(364).condition.target, 10);
  // Captured progress 5 transfers from the completed 5-win phase; 5 more wins, not 10 new wins.
  assert.equal(data.dailyDefinition(364).condition.target - fixture.observed.progress, 5);
});

test('all generated daily labels match pinned game conditions and exported catalog', async () => {
  const catalog = JSON.parse(await readFile(new URL('../extension/quest-catalog.json', import.meta.url)));
  for (const [id, title] of Object.entries(derived.titles)) {
    assert.equal(data.dailyTitle(Number(id)), title, id);
    assert.equal(catalog.dailyTitles[id], title, id);
  }
  assert.equal(data.dailyTitle(348), 'Train 10 Infantry');
  assert.equal(data.dailyTitle(351), 'Train 30 Infantry');
  assert.equal(data.dailyTitle(358), 'Collect 250,000 units of Food on the map');
  assert.equal(data.dailyTitle(365), 'Gather 1 time resources on the map');
  assert.equal(data.dailyTitle(2413), 'Start Research');
  assert.equal(data.dailyTitle(987654321), 'Daily Quest #987654321');
  assert.equal(conditionTitle({ name: 'unverifiedAction', target: 10 }, 'Do %param1%'), null);
  assert.equal(conditionTitle({ name: 'unitsTrained', target: 10, args: { unitType: 'unknown' } }), null);
  assert.equal(conditionTitle({ name: 'globalMapCampVictories', target: 0 }), null);
  assert.equal(conditionTitle({ name: 'globalMapCampVictories', target: 10 }, 'Clear %param2%'), null);
  assert.equal(conditionTitle({ name: 'globalMapCampVictories', target: 10 }, 'Clear %param3%'), null);
});

const require = createRequire(import.meta.url);
const current = Vue.ref({});
const { descriptor } = parse(await readFile(new URL('../src/components/dialogs/QuestDetailModal.vue', import.meta.url), 'utf8'));
const compiled = compileScript(descriptor, { id: 'quest-config-fixture', inlineTemplate: true });
const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
const imports = {
  '@/src/composables/useRpcCache': { useRpcCache: () => ({ cache: current }) },
  '@/src/utils/dialogRpc': { questRefreshCalls: () => [], sendQuestClaim: () => ({ ok: false }) },
  '@/src/utils/troops': { normalizeArray },
  '@/src/data/questData': questDataModule,
  '@/src/data/nameData': nameDataModule,
  '@/src/utils/popupData': popupDataModule,
};
new Function('require', 'module', 'exports', js)(name => imports[name] || require(name), module, module.exports);
async function render(quests) {
  globalThis.hwaHelperQuestData = data;
  current.value = { towerStatus: { data: { isCleared: true } }, 'getDailyQuests:quest': {
    updatedAt: new Date().toISOString(), data: { quests } } };
  const ssr = {};
  try {
    const html = await renderToString(Vue.createSSRApp({ render: () => Vue.h(module.exports.default, { modelValue: true }) }), ssr);
    return html + (ssr.teleports?.body || '');
  } finally { delete globalThis.hwaHelperQuestData; }
}

test('quest dialog displays captured phase progress 5 / 10 and truthful brigand label', async () => {
  const html = await render([fixture.observed]);
  assert.match(html, /Clear Brigand Camp 10 times/);
  assert.match(html, /Progress: 5.*\/ 10/);
  assert.doesNotMatch(html, /Daily Quest #364/);
});

test('map gathering quest #365 stays actionable when tower is already cleared', async () => {
  const html = await render([{ id: 365, state: 'inProgress', progress: 0 }]);
  assert.match(html, /Gather 1 time resources on the map/);
  assert.match(html, /Progress: 0.*\/ 1/);
  assert.doesNotMatch(html, /Tower cleared today|Cannot perform/);
  const goals = popupDataModule.extractEventGoals(current.value, Date.now());
  const goal = goals.all.find(goal => goal.key === 'act:daily_quest_365');
  assert.ok(goal);
  assert.equal(goal.title, 'Gather 1 time resources on the map');
  assert.equal(goal.isUnavailable, false);
});
