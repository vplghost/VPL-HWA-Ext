import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';

test('shared dialog ignores backdrop clicks and closes explicitly with button or Escape', async t => {
  const { descriptor } = parse(await readFile(new URL('../src/components/common/ModalDialog.vue', import.meta.url), 'utf8'));
  const compiled = compileScript(descriptor, { id: 'modal-dismissal', inlineTemplate: true });
  const code = ts.transpileModule(compiled.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
  } }).outputText;
  const exports = {}, handlers = new Map();
  const originalDocument = globalThis.document;
  globalThis.document = { addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name) };
  t.after(() => { globalThis.document = originalDocument; });
  const useModalsModule = await import('../src/composables/useModals.ts');
  const requireFn = (id) => {
    if (id === '@/src/composables/useModals' || id.endsWith('useModals')) return useModalsModule;
    return Vue;
  };
  vm.runInNewContext(code, { exports, require: requireFn, document: globalThis.document });
  const root = { children: [] }, body = { children: [] };
  const renderer = Vue.createRenderer({
    createElement: type => ({ type, props: {}, children: [] }), createText: text => ({ text }), createComment: () => ({}),
    insert(child, parent, anchor) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child); child.parent = parent;
    },
    remove(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); },
    setText(el, text) { el.text = text; }, setElementText(el, text) { el.text = text; },
    patchProp(el, key, old, value) { el.props[key] = value; }, parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1], querySelector: () => body,
  });
  const shown = Vue.ref(false), updates = [];
  const app = renderer.createApp({ render: () => Vue.h(exports.default, {
    modelValue: shown.value, title: 'Test dialog', 'onUpdate:modelValue': value => updates.push(value)
  }) });
  app.mount(root); shown.value = true; await Vue.nextTick();
  const find = (el, predicate) => predicate(el) ? el : el.children?.map(child => find(child, predicate)).find(Boolean);
  const overlay = find(body, el => el.props?.class?.includes('fixed inset-0'));
  assert.ok(overlay);
  overlay.props.onClick?.({ target: overlay, currentTarget: overlay });
  assert.deepEqual(updates, []);
  find(body, el => el.type === 'button').props.onClick();
  assert.deepEqual(updates, [false]);
  handlers.get('keydown')({ key: 'Escape' });
  assert.deepEqual(updates, [false, false]);
  app.unmount();
  assert.equal(handlers.has('keydown'), false);
});

test('stacked modals close in LIFO order on Escape (top-most first, underlying modal remains open)', async () => {
  const {
    useModals,
    registerModalOpen,
    registerModalClose,
    isTopModal,
    getModalStackLevel,
  } = await import('../src/composables/useModals.ts');

  const { openModal, closeModal, modalState } = useModals();

  // Initially, both modals closed
  assert.equal(modalState.hero, false);
  assert.equal(modalState.campaign, false);

  // 1. Open hero modal first
  openModal('hero');
  assert.equal(modalState.hero, true);
  assert.equal(isTopModal('hero'), true);
  assert.equal(getModalStackLevel('hero'), 50);

  // 2. Open campaign modal on top of hero
  openModal('campaign');
  assert.equal(modalState.campaign, true);
  assert.equal(isTopModal('campaign'), true);
  assert.equal(isTopModal('hero'), false, 'Hero modal must not be top modal while Campaign is stacked on top');
  assert.equal(getModalStackLevel('campaign'), 60, 'Stacked Campaign modal must have higher z-index (60 > 50)');

  // 3. Simulate Escape press when stacked
  // Escape key event arrives at Hero listener:
  let heroClosed = false;
  let campaignClosed = false;

  const simulateHeroEscape = () => {
    if (isTopModal('hero')) {
      heroClosed = true;
      closeModal('hero');
    }
  };

  const simulateCampaignEscape = () => {
    if (isTopModal('campaign')) {
      campaignClosed = true;
      closeModal('campaign');
    }
  };

  // First Escape press:
  simulateHeroEscape();
  simulateCampaignEscape();

  // Campaign closed, Hero stayed open!
  assert.equal(campaignClosed, true, 'Top-most Campaign modal must close on first Escape');
  assert.equal(heroClosed, false, 'Underlying Hero modal must remain open on first Escape');
  assert.equal(modalState.campaign, false);
  assert.equal(modalState.hero, true);

  // Now Hero is the top modal again!
  assert.equal(isTopModal('hero'), true);
  assert.equal(getModalStackLevel('hero'), 50);

  // Second Escape press:
  simulateHeroEscape();
  assert.equal(heroClosed, true, 'Underlying Hero modal closes on second Escape');
  assert.equal(modalState.hero, false);
});
