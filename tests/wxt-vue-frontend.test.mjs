import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getTroopType } from '../src/utils/troops.ts';
import { formatDuration, formatNumber, formatCompact } from '../src/utils/formatters.ts';
import { formatResourceAmount, getAmountAt, getNextRefillSeconds } from '../src/utils/resourceData.ts';

const root = resolve(import.meta.dirname, '..');

test('WXT + Vue 3 formatters and duration helpers work accurately', () => {
  assert.equal(formatDuration(0), 'Ready');
  assert.equal(formatDuration(-5), 'Ready');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.equal(formatDuration(3665), '1h 1m');

  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), '0');

  assert.equal(formatCompact(500), '500');
  assert.equal(formatCompact(15000), '15k');
  assert.equal(formatCompact(2500000), '2.5M');
  assert.equal(formatCompact(3200000000), '3.2B');
});

test('WXT + Vue 3 resource refill logic calculates elapsed regeneration clamped to cap', () => {
  const entry = {
    data: {
      amount: 50,
      cap: 100,
      lastRefillAt: 10000,
      refillEveryMs: 1000,
      refillAmount: 1,
    },
  };

  assert.equal(getAmountAt(entry, 10000), 50);
  assert.equal(getAmountAt(entry, 15000), 55);
  assert.equal(getAmountAt(entry, 70000), 100); // Clamped to cap

  const refillSec = getNextRefillSeconds(entry, 10400);
  assert.equal(refillSec, 1);

  assert.equal(formatResourceAmount(950), '950');
  assert.equal(formatResourceAmount(1500000), '1.5M');
  assert.equal(formatResourceAmount(2400000000), '2.4B');
});

test('WXT + Vue 3 getTroopType maps all 3 categories and 9 levels', () => {
  // Marksmen (type 0)
  assert.deepEqual(getTroopType(1), { type: 0, level: 1 });
  assert.deepEqual(getTroopType(7), { type: 0, level: 7 });
  assert.deepEqual(getTroopType(9), { type: 0, level: 9 });

  // Spearmen (type 1)
  assert.deepEqual(getTroopType(11), { type: 1, level: 1 });
  assert.deepEqual(getTroopType(18), { type: 1, level: 8 });

  // Infantry (type 2)
  assert.deepEqual(getTroopType(21), { type: 2, level: 1 });
  assert.deepEqual(getTroopType(29), { type: 2, level: 9 });

  assert.equal(getTroopType(35), null);
});

test('WXT + Vue 3 Single File Components exist and are non-empty', async () => {
  const components = [
    'entrypoints/popup/App.vue',
    'src/components/common/Header.vue',
    'src/components/common/TabNav.vue',
    'src/components/common/FabDial.vue',
    'src/components/dashboard/DashboardTab.vue',
    'src/components/dashboard/TroopsOverview.vue',
    'src/components/dashboard/ResourceSummary.vue',
    'src/components/dashboard/QueuesOverview.vue',
    'src/components/dashboard/ActivityGoals.vue',
    'src/components/tabs/HeroesTab.vue',
    'src/components/tabs/TitansTab.vue',
    'src/components/tabs/ItemsTab.vue',
    'src/components/tabs/ResourcesTab.vue',
    'src/components/tabs/TeamsTab.vue',
    'src/components/tabs/GatheringTab.vue',
    'src/components/tabs/DungeonTab.vue',
    'src/components/tabs/TowerTab.vue',
    'src/components/tabs/QuestsTab.vue',
    'src/components/tabs/SettingsTab.vue',
    'src/components/tabs/LogTab.vue',
    'src/components/common/ModalDialog.vue',
    'src/components/dialogs/RaidModal.vue',
    'src/components/dialogs/GatheringModal.vue',
    'src/components/dialogs/MonsterModal.vue',
    'src/components/dialogs/BuildingModal.vue',
    'src/components/dialogs/ResearchModal.vue',
    'src/components/dialogs/CampaignRaidModal.vue',
    'src/components/dialogs/HeroDetailModal.vue',
  ];

  for (const comp of components) {
    const s = await stat(join(root, comp));
    assert.ok(s.isFile(), `${comp} must be a file`);
    assert.ok(s.size > 50, `${comp} must not be empty`);
  }
});
