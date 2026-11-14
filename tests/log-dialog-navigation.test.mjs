import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as Vue from 'vue';

function script(source) {
  return ts.transpileModule(source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/export /g, '');
}
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Log FAB opens the log modal and keeps Tower/Dungeon only in Dashboard/global modal routing', async () => {
  const source = await read('src/components/common/FabDial.vue'), opened = [];
  const boundary = { ...Vue, watch() {}, onMounted() {}, onUnmounted() {}, usePopupAutomation() {},
    useModals: () => ({ openModal: name => opened.push(name), modalState: Vue.reactive({ guildChat: false, log: false }) }),
    useRpcCache: () => ({ cache: Vue.ref({}) }),
  };
  vm.runInNewContext(script(source) + '\nglobalThis.api = { toggle, handleAction, isOpen };', boundary);
  boundary.api.toggle(); assert.equal(boundary.api.isOpen.value, true);
  boundary.api.handleAction('log'); assert.equal(boundary.api.isOpen.value, false);
  assert.deepEqual(opened, ['log']);
  assert.match(source, /id="log-fab"/); assert.doesNotMatch(source, /id="tower-fab"|id="dungeon-fab"/);
  const app = await read('entrypoints/popup/App.vue');
  assert.match(app, /<LogModal v-model="modalState.log"/);
  assert.match(app, /<TowerModal v-model="modalState.tower"/);
  assert.match(app, /<DungeonModal v-model="modalState.dungeon"/);
  const modal = await read('src/components/dialogs/LogModal.vue');
  assert.match(modal, /<ModalDialog/); assert.match(modal, /<LogTab/);
  const viewer = await read('src/components/tabs/LogTab.vue');
  for (const control of ['v-model="search"', 'v-model="sort"', 'record-clear', 'record-export']) assert.ok(viewer.includes(control));
});

test('saved tab settings discard the old Log tab, retain preferences and include Guild', async () => {
  const source = await read('src/components/common/TabNav.vue');
  const boundary = { ...Vue, onMounted() {}, defineProps: () => ({ modelValue: 'dashboard' }), defineEmits: () => () => {},
    useRpcCache: () => ({ cache: Vue.ref({}) }),
  };
  vm.runInNewContext(script(source) + '\nglobalThis.api = { normalizeConfig };', boundary);
  const config = boundary.api.normalizeConfig([{ id: 'log', visible: true }, { id: 'heroes', visible: false }]);
  assert.equal(config.some(tab => tab.id === 'log'), false);
  assert.equal(config.find(tab => tab.id === 'heroes').visible, false);
  assert.equal(config.find(tab => tab.id === 'guild').visible, true);
});
