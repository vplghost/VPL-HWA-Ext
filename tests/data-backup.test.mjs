import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterConfigData,
  createConfigExportPayload,
  createFullDataExportPayload,
  prepareImportUpdates,
  CONFIG_KEYS,
} from '../src/utils/dataBackup.ts';

test('filterConfigData extracts configuration and queue keys and excludes runtime rpcCache', () => {
  const sampleStorage = {
    tabConfig: { visibleTabs: ['dashboard'] },
    theme: 'dark',
    customTeams: [{ id: 1, name: 'Main' }],
    buildingQueue: { active: [] },
    researchQueue: { active: [] },
    rpcCache: { userGetInfo: { data: { gold: 5000000 } } },
    gameRecordingActive: true,
    recordingState: { recording: true },
    squadPreference_123: { gatherTeam: 1 },
  };

  const config = filterConfigData(sampleStorage);
  assert.equal(config.tabConfig.visibleTabs[0], 'dashboard');
  assert.equal(config.theme, 'dark');
  assert.equal(config.customTeams.length, 1);
  assert.ok(config.buildingQueue);
  assert.ok(config.researchQueue);
  assert.ok(config.squadPreference_123);

  // Must exclude rpcCache and transient recording states
  assert.equal(config.rpcCache, undefined);
  assert.equal(config.gameRecordingActive, undefined);
  assert.equal(config.recordingState, undefined);
});

test('createConfigExportPayload generates envelope with format hwa-helper-config', () => {
  const sampleStorage = {
    theme: 'dark',
    customTeams: [],
  };
  const payload = createConfigExportPayload(sampleStorage);
  assert.equal(payload._format, 'hwa-helper-config');
  assert.equal(payload._version, 1);
  assert.ok(payload._exportedAt);
  assert.equal(payload.config.theme, 'dark');
});

test('createFullDataExportPayload includes rpcCache, queues, and user configs', () => {
  const sampleStorage = {
    theme: 'dark',
    customTeams: [{ id: 1 }],
    buildingQueue: { active: [] },
    researchQueue: { active: [] },
    rpcCache: {
      resourceIncomeHistory: { data: { '2026-11-17': { gold: 100000 } } },
      emeraldHistory: { data: { records: [{ delta: 50 }] } },
    },
    recordingState: { transient: true },
  };

  const payload = createFullDataExportPayload(sampleStorage);
  assert.equal(payload._format, 'hwa-helper-full-data');
  assert.equal(payload._version, 1);
  assert.ok(payload.data.rpcCache);
  assert.ok(payload.data.rpcCache.resourceIncomeHistory);
  assert.ok(payload.data.rpcCache.emeraldHistory);
  assert.equal(payload.data.theme, 'dark');
  assert.equal(payload.data.recordingState, undefined); // transient excluded
});

test('prepareImportUpdates overwrites when overwrite = true', () => {
  const imported = {
    _format: 'hwa-helper-config',
    config: {
      theme: 'dark',
      customTeams: [{ id: 99, name: 'Imported' }],
      buildingQueue: { active: ['item99'] },
    },
  };

  const currentLocal = {
    theme: 'light',
    customTeams: [{ id: 1, name: 'Local' }],
  };

  const res = prepareImportUpdates(imported, currentLocal, true);
  assert.equal(res.success, true);
  assert.equal(res.updates.theme, 'dark');
  assert.equal(res.updates.customTeams[0].id, 99);
  assert.ok(res.updates.buildingQueue);
  assert.equal(res.keysCount, 3);
});

test('prepareImportUpdates preserves local values when overwrite = false', () => {
  const imported = {
    _format: 'hwa-helper-full-data',
    data: {
      theme: 'dark', // exists locally as 'light' -> should NOT overwrite
      newSetting: 'from-backup', // missing locally -> should be added
      customTeams: [{ id: 99 }], // array exists locally -> should NOT overwrite
      rpcCache: {
        newSlice: { data: 123 }, // missing in local rpcCache -> merged in
        existingSlice: { data: 'imported' }, // exists in local rpcCache -> local preserved
      },
    },
  };

  const currentLocal = {
    theme: 'light',
    customTeams: [{ id: 1 }],
    rpcCache: {
      existingSlice: { data: 'local' },
    },
  };

  const res = prepareImportUpdates(imported, currentLocal, false);
  assert.equal(res.success, true);
  // theme was already in currentLocal, so not overwritten
  assert.equal(res.updates.theme, undefined);
  // newSetting was missing locally, so added
  assert.equal(res.updates.newSetting, 'from-backup');
  // rpcCache merged without overwriting existing local slice
  assert.equal(res.updates.rpcCache.newSlice.data, 123);
  assert.equal(res.updates.rpcCache.existingSlice.data, 'local');
});

test('prepareImportUpdates fails gracefully on invalid or empty files', () => {
  const emptyRes = prepareImportUpdates({}, {}, true);
  assert.equal(emptyRes.success, false);
  assert.match(emptyRes.error, /empty/);

  const nullRes = prepareImportUpdates(null, {}, true);
  assert.equal(nullRes.success, false);

  const arrayRes = prepareImportUpdates([], {}, true);
  assert.equal(arrayRes.success, false);
});
