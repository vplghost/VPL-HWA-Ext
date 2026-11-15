import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import * as viewHelpers from '../src/utils/guildVersusView.ts';
import { normalizeArray } from '../src/utils/troops.ts';
import * as clanVersusDataModule from '../src/data/clanVersusData.ts';
const require = createRequire(import.meta.url);
const current = Vue.ref({});
const { descriptor } = parse(await readFile(new URL('../src/components/dialogs/GuildVersusModal.vue', import.meta.url), 'utf8'));
const compiled = compileScript(descriptor, { id: 'guild-versus-fixture', inlineTemplate: true });
const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
const imports = {
  '@/src/composables/useRpcCache': { useRpcCache: () => ({ cache: current }) },
  '@/src/utils/guildVersusView': viewHelpers,
  '@/src/utils/troops': { normalizeArray },
  '@/src/data/clanVersusData': clanVersusDataModule
};
new Function('require', 'module', 'exports', js)(name => imports[name] || require(name), module, module.exports);
const Component = module.exports.default;
async function render(cache) {
  current.value = cache;
  const context = {};
  const html = await renderToString(Vue.createSSRApp({ render: () => Vue.h(Component, { modelValue: true }) }), context);
  return html + (context.teleports?.body || '');
}
const cache = data => ({ clanVersusStatus: { updatedAt: new Date().toISOString(), data } });

test('missing Guild Versus state renders unknown without sample metrics or claim readiness', async () => {
  const html = await render({});
  for (const text of ['4-LEAF CLOVER', 'Bronze', 'Radar Training', 'Eligible', 'Ready to Claim', 'Satisfied']) assert.equal(html.includes(text), false, text);
  assert.match(html, /Unknown/); assert.match(html, /Round schedule unavailable/);
  assert.doesNotMatch(html, /NaN|Infinity|null%/);
});

test('server zero/false metrics remain zero and unqualified, including a tied 0:0 matchup', async () => {
  const input = cache({ score: 0, chestNumbers: [], battle: { clan: { name: 'Own', server: 0 }, enemyClan: { name: 'Other', server: 0 }, clanRoundPoints: 0, enemyClanRoundPoints: 0 },
    info: { battleNumber: 0, roundNumber: 0, currentNumActiveUsers: 0, numActiveUsers: 5, weeklyUserActivity: 0, personalRequirementsIsSatisfied: false, guildRequirementsIsSatisfied: false, challenges: [] },
    rewards: { userBattlePoints: 0, userSeasonPoints: 0 } });
  const view = viewHelpers.guildVersusView(input);
  assert.equal(view.personalRoundPoints, 0); assert.equal(view.currentUsers, 0); assert.equal(view.personalEligible, false);
  assert.equal(view.clanPct, 0); assert.equal(view.enemyPct, 0);
  const html = await render(input);
  assert.match(html, /Battle #0/); assert.match(html, /Server 0/); assert.match(html, /Pending/); assert.doesNotMatch(html, /Eligible|Ready to Claim/);
});

test('known rules and full reported state enable readiness; missing eligibility never does', async t => {
  globalThis.hwaHelperClanVersusChestThresholds = { 1: 25000 };
  t.after(() => { delete globalThis.hwaHelperClanVersusChestThresholds; });
  const input = cache({ score: 30000, chestNumbers: [], battle: { clan: { name: 'Verified' }, enemyClan: { name: 'Actual' }, rounds: { 1: { index: 1, status: 'inProgress', theme: 'Confirmed theme', score: 0 } } },
    info: { battleNumber: 7, roundNumber: 1, personalRequirementsIsSatisfied: true, guildRequirementsIsSatisfied: true } });
  assert.match(await render(input), />Ready</);
  delete input.clanVersusStatus.data.info.personalRequirementsIsSatisfied;
  assert.doesNotMatch(await render(input), />Ready</);
  delete globalThis.hwaHelperClanVersusChestThresholds;
  assert.doesNotMatch(await render(input), />Ready</);
});

test('unknown challenge conversion and stale daily state stay unknown instead of synthetic zero', () => {
  assert.equal(viewHelpers.challengeConvertedPoints({ id: 9 }, { 9: 10 }, { 9: 3000 }), null);
  assert.equal(viewHelpers.challengeConvertedPoints({ id: 9, progress: 0 }, { 9: 10 }, { 9: 3000 }), 0);
  assert.equal(viewHelpers.challengeConvertedPoints({ id: 9, progress: 6000 }, { 9: 10 }, {}), null);
  const input = cache({ score: 123, chestNumbers: { 1: true } }); input.clanVersusStatus.updatedAt = '2020-01-01T00:00:00Z';
  assert.equal(viewHelpers.guildVersusView(input).personalRoundPoints, null);
  assert.equal(viewHelpers.guildVersusView(input).claimsKnown, false);
});
