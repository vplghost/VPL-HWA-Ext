import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ResourceSummary.vue places 4 mini resources in same row as currencies and removes "+1 in" prefix', async () => {
  const content = await readFile(new URL('../src/components/dashboard/ResourceSummary.vue', import.meta.url), 'utf8');

  // Verify 5-column grid layout
  assert.ok(
    content.includes('grid-cols-2') && (content.includes('lg:grid-cols-5') || content.includes('md:grid-cols-5')),
    'ResourceSummary must feature a 5-column grid layout placing resources inline'
  );

  // Verify "+1 in" was removed
  assert.ok(!content.includes('+1 in {{ formatDuration'), 'Must remove "+1 in" prefix from refill duration');
  assert.ok(content.includes('{{ formatDuration(energyRefillSec) }}'), 'Must display formatted refill duration');
  assert.ok(content.includes('{{ formatDuration(worldEnergyRefillSec) }}'), 'Must display world energy refill duration');

  // Verify all 4 resources are in the mini card
  assert.ok(content.includes('🌾') && content.includes('Food:'), 'Must display Food');
  assert.ok(content.includes('🪵') && content.includes('Wood:'), 'Must display Wood');
  assert.ok(content.includes('🪨') && content.includes('Stone:'), 'Must display Stone');
  assert.ok(content.includes('⚙️') && content.includes('Iron:'), 'Must display Iron');

  // Verify separate bottom bar was removed
  assert.ok(!content.includes('City Resources Bar'), 'Must remove separate bottom city resources bar');
});

test('IncomeOverview.vue lays out gold and progress/automation diagrams in 1:2 ratio columns without right legend or bottom history list', async () => {
  const content = await readFile(new URL('../src/components/dashboard/IncomeOverview.vue', import.meta.url), 'utf8');

  // Verify 1:2 ratio grid layout (lg:grid-cols-3 with lg:col-span-1 and lg:col-span-2)
  assert.ok(content.includes('grid-cols-1 lg:grid-cols-3 gap-3'), 'Must layout gold and progress/automation in 1:2 ratio');
  assert.ok(content.includes('lg:col-span-1'), 'Must have 1-col span for gold');
  assert.ok(content.includes('lg:col-span-2'), 'Must have 2-col span for progress and automation');

  // Verify right-side legend table was removed from gold view
  assert.ok(!content.includes('Legends with Metrics Column'), 'Must remove separate right legend column');
  assert.ok(!content.includes('md:col-span-7'), 'Must not have 7-column legend block');

  // Verify "Lịch sử biến động hôm nay" and "Multi-Day Historical Trends" were removed
  assert.ok(!content.includes('Lịch sử biến động hôm nay'), 'Must remove bottom fluctuation history list');
  assert.ok(!content.includes('Multi-Day Historical Trends'), 'Must completely remove bottom Multi-Day Historical Trends section');

  // Verify in-place view switcher for gold and anti-jitter date navigator
  assert.ok(content.includes('goldViewMode'), 'Must support in-place view mode switching for gold');
  assert.ok(content.includes('w-24 text-center'), 'Must have fixed-width date container to avoid jitter');
  assert.ok(content.includes('changeDay'), 'Must support day navigation with changeDay');

  // Verify loss slots and whitespace placeholders across all cards
  assert.ok(content.includes('activityStats.rallyLosses'), 'Must track rally losses');
  assert.ok(content.includes('activityStats.monsterLosses'), 'Must track monster losses');
  assert.ok(content.includes('activityStats.campaignLosses'), 'Must track campaign raid losses');
  assert.ok(content.includes('&nbsp;'), 'Must render whitespace placeholder when 0 losses to align cards');
  assert.ok(content.includes('h-4 flex items-center text-[10px]'), 'Must provide fixed height slot across cards');
});
