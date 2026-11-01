import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../extension/export-name.js', import.meta.url), 'utf8');
const context = {};
runInNewContext(source, context);

test('export names use local YYYYMMDDHHmm and a sequence within the same minute', async () => {
  let state = {};
  const storage = {
    get: async () => state,
    set: async (next) => { state = { ...state, ...next }; }
  };
  const nextName = context.hwaHelperNextExportName;
  assert.equal(await nextName(storage, new Date(2026, 10, 1, 16, 24)), 'hwa-api-202611011624.json');
  assert.equal(await nextName(storage, new Date(2026, 10, 1, 16, 24)), 'hwa-api-202611011624-2.json');
  assert.equal(await nextName(storage, new Date(2026, 10, 1, 16, 25)), 'hwa-api-202611011625.json');
});
