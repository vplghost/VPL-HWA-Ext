import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed, watch, nextTick } from 'vue';
import { selectSquadStorage } from '../src/utils/squadStorage.ts';

const source = await readFile(new URL('../src/composables/useDialogTeamSelection.ts', import.meta.url), 'utf8');
const squadSource = await readFile(new URL('../src/composables/useSquadTeams.ts', import.meta.url), 'utf8');
function js(input) {
  return ts.transpileModule(input.replace(/^import [\s\S]*?;\r?$/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText.replace(/export /g, '');
}
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick(); } };
function harness(t) {
  const stored = {}, listeners = new Set(), stops = [], cleanups = [];
  let read = async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])]));
  const chrome = { storage: { local: { get: keys => read(keys), set: async values => {
    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: structuredClone(value) }]));
    Object.assign(stored, structuredClone(values));
    for (const listener of listeners) listener(changes, 'local');
  } }, onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } } };
  const cache = ref({ accountStatus: { data: { id: 10 } } });
  const context = { chrome, ref, computed, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop; },
    onMounted: callback => callback(), onUnmounted: callback => cleanups.push(callback),
    useRpcCache: () => ({ cache }), selectSquadStorage };
  vm.runInNewContext(js(source) + '\nglobalThis.makeSelection = useDialogTeamSelection;', context);
  vm.runInNewContext(js(squadSource) + '\nglobalThis.makeSquad = useSquadTeams;', context);
  t.after(() => { cleanups.forEach(cleanup => cleanup()); stops.forEach(stop => stop()); });
  return { ...context, stored, cache, setRead: value => { read = value; } };
}

test('team memory is isolated by account and dialog and restores after recreation', async t => {
  const h = harness(t), account = ref(10);
  const raid = h.makeSelection('raidPreferences', account);
  const monster = h.makeSelection('monsterPreferences', account);
  await flush();
  await raid.saveSelection({ teamId: 'custom:raid' });
  await monster.saveSelection({ teamId: 'arena:0' });
  const reopened = h.makeSelection('raidPreferences', account);
  await flush();
  assert.equal(reopened.selection.value.teamId, 'custom:raid');
  account.value = 20;
  await flush();
  assert.equal(reopened.selection.value, null);
  await reopened.saveSelection({ teamId: 'weakest' });
  account.value = 10;
  await flush();
  assert.equal(reopened.selection.value.teamId, 'custom:raid');
  assert.equal(monster.selection.value.teamId, 'arena:0');
});

test('late storage reads cannot undo a newer choice or leak another account', async t => {
  const h = harness(t), account = ref(10), reads = [];
  h.setRead(key => new Promise(resolve => reads.push({ key, resolve })));
  const selection = h.makeSelection('brigand', account);
  await selection.saveSelection({ heroIds: [5, 4, 3, 2, 1], teamId: 'chosen' });
  reads.shift().resolve({ 'dialogTeam:10:brigand': { heroIds: [1], teamId: 'old' } });
  await flush();
  assert.equal(selection.selection.value.teamId, 'chosen');
  const loading = selection.loadSelection();
  account.value = 20;
  await nextTick();
  const old = reads.shift();
  old.resolve({ [old.key]: { teamId: 'wrong-account' } });
  await loading;
  assert.equal(selection.selection.value, null);
  const current = reads.shift(); current.resolve({ [current.key]: { teamId: 'account-20' } });
  await flush();
  assert.equal(selection.selection.value.teamId, 'account-20');
});

test('Raid, Monster and Gathering selections survive unrelated preference replacement and popup recreation', async t => {
  const h = harness(t);
  for (const [key, field] of [['raidPreferences', 'rallyTeam'], ['monsterPreferences', 'teamId'], ['autoGatherSettings', 'selectedTeam']]) {
    const squad = h.makeSquad(key, field);
    await flush();
    await squad.handleTeamChange('custom:' + key);
    await h.chrome.storage.local.set({ [key]: { level: 7 } });
    await flush();
    assert.equal(squad.selectedTeamId.value, 'custom:' + key);
    const reopened = h.makeSquad(key, field);
    await reopened.loadSquadData();
    await flush();
    assert.equal(reopened.selectedTeamId.value, 'custom:' + key);
  }
});

test('Brigand and Tower hero arrays are copied and restored independently', async t => {
  const h = harness(t), account = ref(10), heroes = [1, 2, 3, 4, 5];
  const camp = h.makeSelection('brigand', account), tower = h.makeSelection('tower', account);
  await camp.saveSelection({ teamId: 'custom-one', heroIds: heroes });
  await tower.saveSelection({ heroIds: [5, 4, 3, 2, 1] });
  heroes[0] = 99;
  const reopened = h.makeSelection('brigand', account);
  await flush();
  assert.deepEqual([...reopened.selection.value.heroIds], [1, 2, 3, 4, 5]);
  assert.deepEqual([...tower.selection.value.heroIds], [5, 4, 3, 2, 1]);
});
