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
    onMounted() {},
    onUnmounted() {},
    ...resourceIncome,
    useModals: () => ({ openModal() {} }),
    useGameConnection: () => ({ hasGameTab: ref(true) }),
    ...extra,
  };

  vm.runInNewContext(js + '\nglobalThis.api = {' + exports + '};', context);
  return context.api;
}

test('IncomeOverview.vue computes today income and breakdown by source', async () => {
  const cache = ref({
    battleReportSummary: {
      data: {
        days: {
          [new Date().toISOString().slice(0, 10)]: {
            rewards: {
              'resource:gold': 120000,
              'resource:starMoney': 50,
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
    'activeResource, todayTotal, todayBreakdown, dailyTrend, activePreset, applyPreset, fromDate, toDate',
    { useRpcCache }
  );

  // Default active resource is gold
  assert.equal(ui.activeResource.value, 'gold');
  // Today's total gold = 120,000 (battles) + 73,800 (alchemy) = 193,800
  assert.equal(ui.todayTotal.value, 193800);
  assert.equal(ui.todayBreakdown.value.length, 2);
  const alchemyItem = ui.todayBreakdown.value.find((b) => b.key === 'alchemy');
  assert.ok(alchemyItem);
  assert.equal(alchemyItem.amount, 73800);

  // Switch to emeralds
  ui.activeResource.value = 'emerald';
  assert.equal(ui.todayTotal.value, 50);
  assert.equal(ui.todayBreakdown.value.length, 1);
  assert.equal(ui.todayBreakdown.value[0].key, 'battles');
  assert.equal(ui.todayBreakdown.value[0].amount, 50);

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

test('IncomeOverview.vue generates donut slices for gold and tracks emerald fluctuations', async () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cache = ref({
    'resource:starMoney': {
      data: { amount: 15420 },
    },
    emeraldHistory: {
      data: {
        lastKnownAmount: 15420,
        records: [
          {
            id: 'em-1',
            timestamp: Date.now() - 3600000,
            date: todayStr,
            time: '08:00:00',
            prevAmount: 15000,
            newAmount: 15500,
            delta: 500,
          },
          {
            id: 'em-2',
            timestamp: Date.now() - 1800000,
            date: todayStr,
            time: '08:30:00',
            prevAmount: 15500,
            newAmount: 15420,
            delta: -80,
          },
        ],
        dailyAggregates: {
          [todayStr]: {
            date: todayStr,
            startAmount: 15000,
            endAmount: 15420,
            netDelta: 420,
            totalGain: 500,
            totalSpend: 80,
            fluctuationCount: 2,
          },
        },
      },
    },
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
    'activeResource, donutSlices, todayBreakdown, todayEmeraldSummary, todayEmeraldFluctuations, currentEmeraldBalance, dailyEmeraldTrend',
    { useRpcCache }
  );

  // Gold donut slices
  assert.equal(ui.donutSlices.value.length, 2);
  const totalLength = ui.donutSlices.value.reduce((acc, s) => acc + s.length, 0);
  assert.ok(Math.abs(totalLength - 326.72) < 2);

  // Emerald analytics
  assert.equal(ui.currentEmeraldBalance.value, 15420);
  assert.equal(ui.todayEmeraldFluctuations.value.length, 2);
  assert.equal(ui.todayEmeraldSummary.value.netDelta, 420);
  assert.equal(ui.todayEmeraldSummary.value.totalGain, 500);
  assert.equal(ui.todayEmeraldSummary.value.totalSpend, 80);
  assert.equal(ui.dailyEmeraldTrend.value.length, 7);
});
