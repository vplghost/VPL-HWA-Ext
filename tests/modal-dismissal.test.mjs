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
  vm.runInNewContext(code, { exports, require: () => Vue, document: globalThis.document });
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
