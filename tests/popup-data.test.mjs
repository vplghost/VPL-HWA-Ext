import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
for (const file of ['data-names.js', 'name-map.js', 'resource-data.js', 'popup-data.js']) {
  runInNewContext(await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'), context);
}
const { heroSoulProgress, teamRows, sortRows, isNumericColumn,
  rallyTooltip } = context.hwaHelperPopupData;

test('hero soul progress uses inventory fragments and next-star cost', () => {
  assert.deepEqual({ ...heroSoulProgress('1', { star: 3 }, { fragmentHero: { 1: 73 } }) },
    { owned: 73, needed: 100 });
  assert.deepEqual({ ...heroSoulProgress('1', { star: 5 }, { fragmentHero: {} }) },
    { owned: 0, needed: 300 });
  assert.deepEqual({ ...heroSoulProgress('1', { star: 3 }, null) },
    { owned: null, needed: 100 });
  assert.deepEqual({ ...heroSoulProgress('1', { star: 6 }, { fragmentHero: { 1: 12 } }) },
    { owned: 12, needed: 'Max' });
});

test('teams retain every nested squad and resolve hero/titan names', () => {
  const rows = teamRows({ arena: [1, 4000], grand: [[1, 999999], [4000]] }, context.hwaHelperNameMap);
  assert.deepEqual(Array.from(rows, (row) => Array.from(row)), [
    ['arena', '—', 2, 'Aurora, Sigurd', [1, 4000]],
    ['grand', 1, 2, 'Aurora, #999999', [1, 999999]],
    ['grand', 2, 1, 'Sigurd', [4000]]
  ]);
});

test('table sorting handles numeric counts, names, and missing values', () => {
  const rows = [['Aurora', '73 / 100'], ['Thea', '9 / 150'], ['Unknown', '—']];
  assert.deepEqual(Array.from(sortRows(rows, 1, 'asc'), (row) => row[0]), ['Thea', 'Aurora', 'Unknown']);
  assert.deepEqual(Array.from(sortRows(rows, 0, 'desc'), (row) => row[0]), ['Unknown', 'Thea', 'Aurora']);
});

test('numeric columns align values and headings while IDs and ordinals stay left', () => {
  for (const heading of ['Level', 'Star', 'Soul stones / needed', 'Power',
    'Amount', 'Members', 'Size']) assert.equal(isNumericColumn(heading), true);
  for (const heading of ['Hero ID', 'Titan ID', 'Item ID', 'Skin ID',
    'Hero/Titan ID', 'Team', 'Name']) assert.equal(isNumericColumn(heading), false);
});

test('rally tooltip names the target and departing team with exact wait and marked route estimates', () => {
  const now = 1000000;
  const march = { rally: { target: 'Boss, level 20', waitUntil: now + 300000,
    outboundMs: 31000, returnMs: 42000,
    team: { heroIds: [16, 79], units: [{ id: 7, count: 1556 }] } } };
  const tooltip = rallyTooltip(march, now, context.hwaHelperNameMap.hero);
  assert.match(tooltip, /Raid · Boss, level 20/);
  assert.match(tooltip, /Team: .+, .+/);
  assert.match(tooltip, /Troops: #7 ×1,556/);
  assert.match(tooltip, /Wait: 5 min/);
  assert.match(tooltip, /Travel to target: ~31 sec/);
  assert.match(tooltip, /Arrival: ~5 min remaining/);
  assert.match(tooltip, /Return to base: ~42 sec travel after battle/);
  const exact = rallyTooltip({ rally: { ...march.rally,
    arrivalAt: now + 30000, returnAt: now + 40000 } }, now,
  context.hwaHelperNameMap.hero);
  assert.match(exact, /Arrival: 30 sec remaining/);
  assert.match(exact, /Return to base: 40 sec remaining/);
});

test('buildingTooltip and researchTooltip display queue details with name, level, and remaining time', () => {
  const now = 10000000;
  const buildingStatus = {
    data: {
      queues: [{
        buildingId: 183,
        level: 13,
        startDate: now - 10000,
        durationMs: 70000
      }]
    }
  };
  const bTooltip = context.hwaHelperPopupData.buildingTooltip(
    buildingStatus, now, context.hwaHelperNameMap.building
  );
  assert.match(bTooltip, /Construction in progress:/);
  assert.match(bTooltip, /Headquarters 2 \(Lv\. 13\)/);
  assert.match(bTooltip, /00:01 remaining/);

  const idleBuilding = context.hwaHelperPopupData.buildingTooltip(
    { data: { queues: [] } }, now, context.hwaHelperNameMap.building
  );
  assert.equal(idleBuilding, 'Construction: Idle');

  const researchStatus = {
    data: {
      queues: [{
        researchId: 119,
        level: 2,
        startDate: now - 20000,
        durationMs: 140000
      }]
    }
  };
  const rTooltip = context.hwaHelperPopupData.researchTooltip(
    researchStatus, now, context.hwaHelperNameMap.research
  );
  assert.match(rTooltip, /Research in progress:/);
  assert.match(rTooltip, /Enhanced Spears III \(Lv\. 2\)/);
  assert.match(rTooltip, /00:02 remaining/);

  const idleResearch = context.hwaHelperPopupData.researchTooltip(
    { data: { queues: [] } }, now, context.hwaHelperNameMap.research
  );
  assert.equal(idleResearch, 'Research: Idle');
});
