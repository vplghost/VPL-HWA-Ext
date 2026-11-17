import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('LogTab provides config export, full data export, and import with overwrite checkbox', async () => {
  const content = await readFile(join(root, 'src/components/tabs/LogTab.vue'), 'utf8');

  // Verify backup section and action buttons exist
  assert.match(content, /id="data-backup-section"/, 'Must have #data-backup-section');
  assert.match(content, /id="export-config-btn"/, 'Must have #export-config-btn');
  assert.match(content, /id="export-all-data-btn"/, 'Must have #export-all-data-btn');
  assert.match(content, /id="import-overwrite-checkbox"/, 'Must have #import-overwrite-checkbox');
  assert.match(content, /id="import-data-btn"/, 'Must have #import-data-btn');

  // Verify methods & bindings
  assert.match(content, /exportConfig/, 'Must define exportConfig');
  assert.match(content, /exportAllData/, 'Must define exportAllData');
  assert.match(content, /createConfigExportPayload/, 'Must use createConfigExportPayload');
  assert.match(content, /createFullDataExportPayload/, 'Must use createFullDataExportPayload');
  assert.match(content, /prepareImportUpdates/, 'Must use prepareImportUpdates');
  assert.match(content, /overwriteExisting/, 'Must bind overwriteExisting');

  // Verify existing log features remain intact
  assert.match(content, /v-model="search"/, 'Must preserve search filter');
  assert.match(content, /v-model="sort"/, 'Must preserve sort');
  assert.match(content, /record-clear/, 'Must preserve record-clear');
  assert.match(content, /record-export/, 'Must preserve record-export');

  // Verify Legends Draft section & controls
  assert.match(content, /id="legend-draft-log-section"/, 'Must have #legend-draft-log-section');
  assert.match(content, /id="toggle-draft-logging"/, 'Must have #toggle-draft-logging');
  assert.match(content, /id="export-draft-log-btn"/, 'Must have #export-draft-log-btn');
  assert.match(content, /id="clear-draft-log-btn"/, 'Must have #clear-draft-log-btn');
  assert.match(content, /legendDraftLoggingEnabled/, 'Must bind legendDraftLoggingEnabled');
  assert.match(content, /exportDraftLog/, 'Must define exportDraftLog');
  assert.match(content, /clearDraftLog/, 'Must define clearDraftLog');
});
