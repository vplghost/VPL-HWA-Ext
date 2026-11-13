import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = await readFile(new URL('../../src/components/common/UnitStars.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'unit-stars', inlineTemplate: true });
const js = ts.transpileModule(compiled.content, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', js)(createRequire(import.meta.url), module, module.exports);
export default module.exports.default;
