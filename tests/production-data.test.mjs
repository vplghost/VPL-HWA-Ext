import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
for (const file of ['production-rules.js', 'production-data.js']) {
  runInNewContext(await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'), context);
}
const production = context.hwaHelperProductionData;
const rules = context.hwaHelperProductionRules;
const snapshot = JSON.parse(await readFile(new URL('./fixtures/production-snapshot.json', import.meta.url)));

test('production rates from the captured snapshot agree with the game screen', () => {
  const displayed = { 5: 11661, 4: 8835, 3: 1790, 2: 523, 1: 51 };
  for (const [id, screenRate] of Object.entries(displayed)) {
    const estimated = production.ratePerMinute(snapshot, Number(id));
    assert.ok(Math.abs(estimated - screenRate) / screenRate < 0.01,
      `Material ${id}: ${estimated} vs ${screenRate}/min`);
  }
});

test('production rates follow bonus and staffing snapshots only with matching config', () => {
  const current = production.ratePerMinute(snapshot, 4);
  const otherConfig = structuredClone(snapshot);
  otherConfig.productionConfigStatus.data.bonusUrl = 'https://example.invalid/new-config';
  assert.equal(production.ratePerMinute(otherConfig, 4), null);
  const fewerResidents = structuredClone(snapshot);
  fewerResidents.productionStatus.data.producers[0].residentCount -= 1;
  assert.equal(production.ratePerMinute(fewerResidents, 4), null);
  const noBonus = structuredClone(snapshot);
  noBonus.productionBonusStatus.data.bonuses = [];
  assert.equal(production.ratePerMinute(noBonus, 4), null);
  const changedBonus = structuredClone(snapshot);
  const woodMain = rules.bonusRows.find(([id, materialId, kind, value]) => materialId === 4 &&
    kind === 'main' && value > 0 && changedBonus.productionBonusStatus.data.bonuses
      .some(([activeId]) => activeId === id));
  changedBonus.productionBonusStatus.data.bonuses.find(([id]) => id === woodMain[0])[1] += 1;
  assert.ok(production.ratePerMinute(changedBonus, 4) > current);
  assert.equal(production.ratePerMinute(snapshot, 4), current);
});
