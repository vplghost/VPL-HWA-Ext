import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { ref, computed } from 'vue';
import * as resourceIncome from '../src/utils/resourceIncome.ts';

async function setup(name, exports, extra = {}) {
  const source = await readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8');
  const scriptMatch = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, `${name} must have a <script setup> block`);
  const script = scriptMatch[1].replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  const js = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ScriptTarget.ESNext },
  }).outputText.replace(/export \{\};?/g, '');

  const context = {
    ref,
    computed,
    watch: (src, cb) => {},
    onMounted() {},
    onUnmounted() {},
    chrome: {
      storage: {
        local: {
          get: (keys, cb) => (cb ? cb({}) : Promise.resolve({})),
          set: (items, cb) => (cb ? cb() : Promise.resolve()),
        },
      },
    },
    ...resourceIncome,
    useModals: () => ({ openModal() {} }),
    useGameConnection: () => ({ hasGameTab: ref(true) }),
    ...extra,
  };

  vm.runInNewContext(js + '\nglobalThis.api = {' + exports + '};', context);
  return context.api;
}

test('IncomeOverview.vue computes today income and breakdown by source and supports view switching', async () => {
  const cache = ref({
    battleReportSummary: {
      data: {
        days: {
          [new Date().toISOString().slice(0, 10)]: {
            rewards: {
              'resource:gold': 120000,
            },
          },
        },
      },
    },
    freeAlchemySpinAction: {
      updatedAt: new Date().toISOString(),
      data: {
        success: true,
        gold: 73800,
      },
    },
  });

  const useRpcCache = () => ({ cache });
  const ui = await setup(
    'IncomeOverview.vue',
    'goldViewMode, toggleGoldViewMode, todayTotal, todayBreakdown, dailyTrend, activePreset, applyPreset, fromDate, toDate',
    { useRpcCache }
  );

  // Default active gold view mode is 'today' (donut)
  assert.equal(ui.goldViewMode.value, 'today');
  // Today's total gold = 120,000 (battles) + 73,800 (alchemy) = 193,800
  assert.equal(ui.todayTotal.value, 193800);
  assert.equal(ui.todayBreakdown.value.length, 2);
  const alchemyItem = ui.todayBreakdown.value.find((b) => b.key === 'alchemy');
  assert.ok(alchemyItem);
  assert.equal(alchemyItem.amount, 73800);

  // Toggle view mode in-place to 'trend' and back
  ui.toggleGoldViewMode();
  assert.equal(ui.goldViewMode.value, 'trend');
  ui.toggleGoldViewMode();
  assert.equal(ui.goldViewMode.value, 'today');

  // Verify daily trend defaults to 7 days
  assert.equal(ui.activePreset.value, '7d');
  assert.equal(ui.dailyTrend.value.length, 7);

  // Test switching presets to 14d and 30d
  ui.applyPreset('14d');
  assert.equal(ui.activePreset.value, '14d');
  assert.equal(ui.dailyTrend.value.length, 14);

  ui.applyPreset('30d');
  assert.equal(ui.activePreset.value, '30d');
  assert.equal(ui.dailyTrend.value.length, 30);
});

test('DashboardTab.vue renders IncomeOverview component below ResourceSummary', async () => {
  const source = await readFile(new URL('../src/components/dashboard/DashboardTab.vue', import.meta.url), 'utf8');
  assert.match(source, /import IncomeOverview from '\.\/IncomeOverview\.vue';/, 'Must import IncomeOverview');
  assert.match(source, /<ResourceSummary \/>\s*<!--[^>]*-->\s*<IncomeOverview \/>/, 'Must render IncomeOverview right below ResourceSummary');
});

test('IncomeOverview.vue generates donut slices for gold and supports day navigation up to 30 days', async () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cache = ref({
    freeAlchemySpinAction: {
      updatedAt: new Date().toISOString(),
      data: {
        success: true,
        gold: 100000,
      },
    },
    battleReportSummary: {
      data: {
        days: {
          [todayStr]: {
            rewards: {
              'resource:gold': 50000,
            },
          },
        },
      },
    },
  });

  const useRpcCache = () => ({ cache });
  const ui = await setup(
    'IncomeOverview.vue',
    'donutSlices, todayBreakdown, selectedDayOffset, changeDay, jumpToToday, selectedDate, maxDaysBack',
    { useRpcCache }
  );

  // Gold donut slices
  assert.equal(ui.donutSlices.value.length, 2);
  const totalLength = ui.donutSlices.value.reduce((acc, s) => acc + s.length, 0);
  assert.ok(Math.abs(totalLength - 326.72) < 2);

  // Day navigation
  assert.equal(ui.selectedDayOffset.value, 0);
  assert.equal(ui.maxDaysBack, 30);
  assert.equal(ui.selectedDate.value, todayStr);

  // Navigate back 1 day
  ui.changeDay(-1);
  assert.equal(ui.selectedDayOffset.value, -1);

  // Jump back to today
  ui.jumpToToday();
  assert.equal(ui.selectedDayOffset.value, 0);
  assert.equal(ui.selectedDate.value, todayStr);
});

test('IncomeOverview.vue computes and exposes activityStats with auto-join, campaign, and energy metrics', async () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cache = ref({
    priorityAutoJoinedRallies: { data: ['r1', 'r2'] },
    campaignRaidReceipts: {
      data: [{ at: new Date().toISOString(), times: 12, missionId: 10 }],
    },
    battleReportSummary: {
      data: {
        days: {
          [todayStr]: {
            types: {
              rallyMobAttackResult: 3, // 2 ext + 1 game
              soloMobAttackResult: 5,  // 5 monsters
              campBattleResult: 1,     // 1 camp
            },
          },
        },
      },
    },
  });

  const useRpcCache = () => ({ cache });
  const ui = await setup(
    'IncomeOverview.vue',
    'activityStats',
    { useRpcCache }
  );

  assert.ok(ui.activityStats.value);
  assert.equal(ui.activityStats.value.extAutoJoinCount, 2);
  assert.equal(ui.activityStats.value.gameAutoJoinCount, 1);
  assert.equal(ui.activityStats.value.campaignCount, 12);
  assert.equal(ui.activityStats.value.monstersCount, 5);
  assert.equal(ui.activityStats.value.brigandCampsCount, 1);
  assert.equal(ui.activityStats.value.campaignEnergySpent, 72); // 12 * 6
  // World Energy: (3 rallies * 25) + (5 monsters * 10) + (1 camp * 10) = 75 + 50 + 10 = 135
  assert.equal(ui.activityStats.value.worldEnergySpent, 135);
  assert.equal(ui.activityStats.value.totalEnergySpent, 207);   // 72 + 135
});
