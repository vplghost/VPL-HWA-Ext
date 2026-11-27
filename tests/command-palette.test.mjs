import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  applyTabPreset,
  COMPACT_TAB_IDS,
} from '../src/utils/commandPalette.ts';

test('buildCommandPaletteItems & filterCommandPaletteItems index tabs, modals, and owned heroes with prefix ranking', () => {
  const cache = {
    heroGetAll: {
      data: {
        '1': { id: 1, level: 120, star: 6, power: 145000 },
        '54': { id: 54, level: 120, star: 5, power: 162000 },
      },
    },
  };
  const items = buildCommandPaletteItems(cache);
  assert.ok(items.some((i) => i.category === 'tab' && i.tabId === 'dashboard'));
  assert.ok(items.some((i) => i.category === 'modal' && i.modalName === 'legendsDraft'));
  assert.ok(items.some((i) => i.category === 'modal' && i.modalName === 'pvpOptimizer'));
  assert.ok(items.some((i) => i.category === 'hero' && i.hero?.id === 54));

  const draftMatches = filterCommandPaletteItems(items, 'draft');
  assert.equal(draftMatches[0]?.modalName, 'legendsDraft');

  const auroraMatches = filterCommandPaletteItems(items, 'aurora');
  assert.equal(auroraMatches[0]?.category, 'hero');
  assert.equal(auroraMatches[0]?.hero?.id, 1);

  const emptyMatches = filterCommandPaletteItems(items, 'zzzz-nonexistent');
  assert.equal(emptyMatches.length, 0);
});

test('applyTabPreset toggles Compact (5) and Show All (9) without changing custom drag-and-drop order', () => {
  const customOrder = [
    { id: 'guild', visible: true },
    { id: 'heroes', visible: true },
    { id: 'items', visible: true },
    { id: 'dashboard', visible: true },
    { id: 'titans', visible: false },
    { id: 'events', visible: true },
    { id: 'goals', visible: true },
    { id: 'resources', visible: true },
    { id: 'teams', visible: true },
  ];

  const compact = applyTabPreset(customOrder, 'compact');
  assert.deepEqual(
    compact.map((t) => t.id),
    customOrder.map((t) => t.id),
    'Custom tab order must be preserved'
  );
  assert.equal(compact.filter((t) => t.visible).length, COMPACT_TAB_IDS.size);
  assert.equal(compact.find((t) => t.id === 'guild')?.visible, false);
  assert.equal(compact.find((t) => t.id === 'titans')?.visible, true);

  const all = applyTabPreset(compact, 'all');
  assert.equal(all.every((t) => t.visible), true);
  assert.deepEqual(all.map((t) => t.id), customOrder.map((t) => t.id));
});

test('Header, App, CommandPaletteModal, and SettingsTab wire Ctrl+K palette & tab presets cleanly', () => {
  const headerSrc = fs.readFileSync('src/components/common/Header.vue', 'utf8');
  assert.ok(headerSrc.includes('id="header-command-palette-btn"'));
  assert.ok(headerSrc.includes("openModal('commandPalette')"));

  const appSrc = fs.readFileSync('entrypoints/popup/App.vue', 'utf8');
  assert.ok(appSrc.includes('CommandPaletteModal'));

  const modalSrc = fs.readFileSync('src/components/common/CommandPaletteModal.vue', 'utf8');
  assert.ok(modalSrc.includes('id="command-palette-modal"'));
  assert.ok(modalSrc.includes('id="command-palette-input"'));
  assert.match(modalSrc, /e\.key\.toLowerCase\(\)\s*===\s*'k'/);

  const settingsSrc = fs.readFileSync('src/components/tabs/SettingsTab.vue', 'utf8');
  assert.ok(settingsSrc.includes('id="settings-tabs-preset-compact"'));
  assert.ok(settingsSrc.includes('id="settings-tabs-preset-all"'));
});
