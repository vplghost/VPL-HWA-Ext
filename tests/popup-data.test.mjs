import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
for (const file of ['data-names.js', 'name-map.js', 'resource-data.js', 'hero-metadata.js', 'titan-metadata.js', 'popup-data.js']) {
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

test('titan soul progress uses inventory fragments and next-star cost', () => {
  const { titanSoulProgress } = context.hwaHelperPopupData;
  // 4000 Sigurd with star 3 needs 500 fragments for star 4
  assert.deepEqual({ ...titanSoulProgress('4000', { star: 3 }, { fragmentTitan: { 4000: 472 } }) },
    { owned: 472, needed: 500 });
  assert.deepEqual({ ...titanSoulProgress('4001', { star: 1 }, { fragmentTitan: { 4001: 50 } }) },
    { owned: 50, needed: 50 });
  assert.deepEqual({ ...titanSoulProgress('4001', { star: 5 }, { fragmentTitan: {} }) },
    { owned: 0, needed: 1500 });
  assert.deepEqual({ ...titanSoulProgress('4001', { star: 6 }, { fragmentTitan: { 4001: 250 } }) },
    { owned: 250, needed: 'Max' });
  assert.deepEqual({ ...titanSoulProgress('4001', { star: 2 }, null) },
    { owned: null, needed: 150 });
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
  for (const heading of ['Level', 'Star', 'Soul stones / needed', 'Soul stone', 'Soul stones', 'Power',
    'Amount', 'Members', 'Size']) assert.equal(isNumericColumn(heading), true);
  for (const heading of ['Hero ID', 'Titan ID', 'Item ID', 'Skin ID',
    'Hero/Titan ID', 'Team', 'Name']) assert.equal(isNumericColumn(heading), false);
});

test('isSoulUpgradeReady correctly determines if soul stones meet upgrade threshold', () => {
  const { isSoulUpgradeReady } = context.hwaHelperPopupData;
  assert.equal(isSoulUpgradeReady('73 / 50'), true);
  assert.equal(isSoulUpgradeReady('50 / 50'), true);
  assert.equal(isSoulUpgradeReady('1,500 / 900'), true);
  assert.equal(isSoulUpgradeReady('30 / 50'), false);
  assert.equal(isSoulUpgradeReady('500 / Max'), false);
  assert.equal(isSoulUpgradeReady('— / 50'), false);
  assert.equal(isSoulUpgradeReady(100, 50), true);
  assert.equal(isSoulUpgradeReady(50, 100), false);
  assert.equal(isSoulUpgradeReady(null, 50), false);
  assert.equal(isSoulUpgradeReady(100, 'Max'), false);
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

test('formatChatRole and formatChatTime format roles and timestamps properly', () => {
  const { formatChatRole, formatChatTime } = context.hwaHelperPopupData;
  assert.equal(formatChatRole('255').label, 'Leader');
  assert.equal(formatChatRole('4').label, 'Officer');
  assert.equal(formatChatRole('3').label, 'Member');
  assert.equal(formatChatRole('99').label, 'Role #99');
  assert.equal(formatChatRole(null).label, 'Member');

  assert.equal(formatChatTime('invalid'), '—');
  const formatted = formatChatTime(1793538537);
  assert.match(formatted, /\d{2}\/\d{2} \d{2}:\d{2}/);
});

test('isMarchExpired accurately evaluates expiration for standard marches and rallies', () => {
  const { isMarchExpired } = context.hwaHelperPopupData;
  const now = 1000000;

  // null or undefined march
  assert.equal(isMarchExpired(null, now), true);
  assert.equal(isMarchExpired(undefined, now), true);

  // standard march (non-rally)
  assert.equal(isMarchExpired({ endsAt: now + 5000 }, now), false);
  assert.equal(isMarchExpired({ endsAt: now }, now), true);
  assert.equal(isMarchExpired({ endsAt: now - 1000 }, now), true);

  // rally with explicit returnAt
  const rallyExplicitReturn = {
    rally: { waitUntil: now - 60000, outboundMs: 30000, returnAt: now + 10000 }
  };
  assert.equal(isMarchExpired(rallyExplicitReturn, now), false);
  assert.equal(isMarchExpired(rallyExplicitReturn, now + 10000), true);
  assert.equal(isMarchExpired(rallyExplicitReturn, now + 20000), true);

  // rally in returnToOutpost stage with endsAt
  const rallyReturning = {
    stage: 'returnToOutpost',
    endsAt: now + 15000,
    rally: { waitUntil: now - 80000 }
  };
  assert.equal(isMarchExpired(rallyReturning, now), false);
  assert.equal(isMarchExpired(rallyReturning, now + 15000), true);

  // rally with calculated estimated return (waitUntil + outboundMs + returnMs)
  const rallyEstimated = {
    rally: { waitUntil: now - 30000, outboundMs: 20000, returnMs: 25000 }
  };
  // arrivalAt = (now - 30000) + 20000 = now - 10000
  // returnAt = (now - 10000) + 25000 = now + 15000
  assert.equal(isMarchExpired(rallyEstimated, now), false);
  assert.equal(isMarchExpired(rallyEstimated, now + 14999), false);
  assert.equal(isMarchExpired(rallyEstimated, now + 15000), true);
  assert.equal(isMarchExpired(rallyEstimated, now + 20000), true);

  // rally without route estimates falls back to 30min stale threshold
  const rallyNoRoutes = {
    rally: { waitUntil: now - 10000 }
  };
  assert.equal(isMarchExpired(rallyNoRoutes, now), false);
  assert.equal(isMarchExpired(rallyNoRoutes, now + 29 * 60000), false);
  assert.equal(isMarchExpired(rallyNoRoutes, now + 31 * 60000), true);
});

test('tableExportFilename generates standardized filename with timestamp', () => {
  const { tableExportFilename } = context.hwaHelperPopupData;
  const fixedDate = new Date(2026, 10, 2, 12, 30);
  assert.equal(tableExportFilename('heroes', fixedDate), 'hwa-heroes-202611021230.json');
  assert.equal(tableExportFilename('titans', fixedDate), 'hwa-titans-202611021230.json');
  assert.equal(tableExportFilename('items', fixedDate), 'hwa-items-202611021230.json');
});

test('exportTableData exports rich hero information including level, star, soul stones, power, sparks, skills, skins, glyphs, and artifacts', () => {
  const { exportTableData } = context.hwaHelperPopupData;
  const sampleCache = {
    heroGetAll: {
      data: {
        '1': {
          id: 1,
          star: 3,
          level: 80,
          power: 45678,
          titanGiftLevel: 15,
          skills: { '10': 80, '11': 70, '12': 60, '13': 50 },
          skins: { '1': 60, '2': 30 },
          currentSkin: 2,
          runes: [40, 30, 20, 10, 5],
          artifacts: [
            { id: 101, star: 3, level: 50 },
            { id: 102, star: 2, level: 40 },
            { id: 103, star: 1, level: 20 }
          ]
        },
        '60': {
          id: 60,
          star: 5,
          level: 75,
          power: 38000,
          titanGiftLevel: 0,
          skills: { '350': 74 },
          skins: {},
          runes: []
        }
      }
    },
    inventoryGet: {
      data: {
        fragmentHero: {
          '1': 73,
          '60': 150
        }
      }
    }
  };

  const allHeroes = exportTableData('heroes', sampleCache);
  assert.equal(allHeroes.length, 2);

  const hero1 = allHeroes.find(h => h.id === 1);
  assert.ok(hero1);
  assert.equal(hero1.name, 'Aurora');
  assert.equal(hero1.level, 80);
  assert.equal(hero1.star, 3);
  assert.equal(hero1.power, 45678);
  assert.equal(hero1.role, 'Front');
  assert.equal(hero1.class, 'Tank');
  assert.equal(hero1.faction, 'Way of Nature');
  assert.deepEqual({ ...hero1.soulStones }, { current: 73, needed: 100 });
  assert.deepEqual({ ...hero1.sparksOfPower }, { level: 15, max: 30 });
  assert.equal(hero1.skills.length, 4);
  assert.deepEqual({ ...hero1.skills[0] }, { slot: 1, skillId: 10, level: 80 });
  assert.equal(hero1.skins.length, 2);
  assert.equal(hero1.skins.find(s => s.skinId === 2).isCurrent, true);
  assert.equal(hero1.glyphs.length, 5);
  assert.equal(hero1.artifacts.length, 3);
  assert.deepEqual({ ...hero1.artifacts[0] }, { slot: 1, id: 101, star: 3, level: 50 });

  // Filtering by search query
  const filtered = exportTableData('heroes', sampleCache, 'Aurora');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 1);

  const noMatch = exportTableData('heroes', sampleCache, 'NonExistent');
  assert.equal(noMatch.length, 0);
});

test('exportTableData exports titans, items, resources, teams, and other snapshots', () => {
  const { exportTableData } = context.hwaHelperPopupData;
  const sampleCache = {
    titanGetAll: {
      data: {
        '4000': {
          id: 4000,
          star: 4,
          level: 85,
          power: 60000,
          skills: { '1': 85, '2': 85 },
          artifacts: [{ id: 1, level: 80 }]
        }
      }
    },
    inventoryGet: {
      data: {
        fragmentTitan: { '4000': 472 },
        material: { '1': 25000, '2': 50000 },
        scroll: { '10': 15 }
      }
    },
    'resource:gold': {
      data: { label: 'Gold', amount: 1500000 }
    },
    'resource:energy': {
      data: { label: 'Energy', amount: 120, cap: 138, renewable: true, refillEveryMs: 360000, refillAmount: 1 }
    },
    teamGetAll: {
      data: {
        arena: [1, 60]
      }
    },
    sampleSnapshot: {
      key: 'sampleSnapshot',
      method: 'getSampleData',
      feature: 'sample',
      updatedAt: '2026-11-02T12:00:00.000Z',
      data: { key1: 'value1' }
    }
  };

  // Titans
  const titans = exportTableData('titans', sampleCache);
  assert.equal(titans.length, 1);
  assert.equal(titans[0].id, 4000);
  assert.equal(titans[0].name, 'Sigurd');
  assert.equal(titans[0].role, 'Tank');
  assert.equal(titans[0].element, 'Water');
  assert.deepEqual({ ...titans[0].soulStones }, { current: 472, needed: 900 });

  // Items
  const items = exportTableData('items', sampleCache);
  assert.equal(items.length, 4);
  const scrollItem = exportTableData('items', sampleCache, '', 'scroll');
  assert.equal(scrollItem.length, 1);
  assert.equal(scrollItem[0].group, 'scroll');
  assert.equal(scrollItem[0].amount, 15);

  // Resources
  const resources = exportTableData('resources', sampleCache);
  assert.equal(resources.length, 2);
  const energy = resources.find(r => r.key === 'resource:energy');
  assert.ok(energy);
  assert.equal(energy.name, 'Energy');
  assert.equal(energy.amount, 120);
  assert.equal(energy.cap, 138);
  assert.equal(energy.renewable, true);

  // Teams
  const teams = exportTableData('teams', sampleCache);
  assert.equal(teams.length, 1);
  assert.equal(teams[0].mode, 'arena');
  assert.equal(teams[0].memberCount, 2);

  // Other
  const other = exportTableData('other', sampleCache);
  assert.equal(other.length, 1);
  assert.equal(other[0].key, 'sampleSnapshot');
  assert.equal(other[0].method, 'getSampleData');
});
