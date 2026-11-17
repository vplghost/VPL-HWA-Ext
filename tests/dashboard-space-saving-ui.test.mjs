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

test('IncomeOverview.vue lays out gold and emerald diagrams in 2 columns without right legend or bottom history list', async () => {
  const content = await readFile(new URL('../src/components/dashboard/IncomeOverview.vue', import.meta.url), 'utf8');

  // Verify 2-column grid layout
  assert.ok(content.includes('grid-cols-1 md:grid-cols-2 gap-3'), 'Must layout gold and emerald in 2 columns');

  // Verify right-side legend table was removed from gold view
  assert.ok(!content.includes('Legends with Metrics Column'), 'Must remove separate right legend column');
  assert.ok(!content.includes('md:col-span-7'), 'Must not have 7-column legend block');

  // Verify "Lịch sử biến động hôm nay" was removed from emerald view
  assert.ok(!content.includes('Lịch sử biến động hôm nay'), 'Must remove bottom fluctuation history list');
});
