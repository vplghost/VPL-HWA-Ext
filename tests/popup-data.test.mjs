import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const context = {};
for (const file of ['clan-versus-rules.js', 'data-names.js', 'name-map.js', 'resource-data.js', 'hero-metadata.js', 'titan-metadata.js', 'hero-stat-data.js', 'popup-data.js']) {
  runInNewContext(await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'), context);
}
const { heroSoulProgress, formatTitanArtifactLevels, isTitanArtifactUpgradable, exportTableData, teamRows, sortRows, isNumericColumn,
  rallyTooltip, getChallengeResourceStock, extractEventGoals, getUnreadChatCount, isTowerCleared,
  isResourceSelectableForHeader, isDebugOrEventResource } = context.hwaHelperPopupData;

test('solo attack stays visible through battle and expires after its return ETA', () => {
  const { isMarchExpired } = context.hwaHelperPopupData;
  const arrival = 100000;
  const outbound = { kind: 'attack', stage: 'moveToTargetInSolo',
    targetArrivalAt: arrival, durationMs: 45000, endsAt: arrival };
  assert.equal(isMarchExpired(outbound, arrival + 1000), false);
  const returning = { ...outbound, stage: 'returnToOutpost', returnAt: arrival + 45500,
    endsAt: arrival + 45500, result: 'lose' };
  assert.equal(isMarchExpired(returning, arrival + 45499), false);
  assert.equal(isMarchExpired(returning, arrival + 45500), true);
});

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

test('sortRows prioritizes favorite rows at top regardless of sort column and direction', () => {
  const rows = [
    ['1', 'Aurora', 150000],
    ['2', 'Galahad', 160000],
    ['3', 'Keira', 180000],
    ['4', 'Astaroth', 140000]
  ];
  const isFav = (row) => row[0] === '1' || row[0] === '4'; // Aurora and Astaroth are favorites

  // Power desc: favorites (Aurora 150k, Astaroth 140k) then non-favorites (Keira 180k, Galahad 160k)
  const sortedDesc = sortRows(rows, 2, 'desc', isFav);
  assert.deepEqual(Array.from(sortedDesc, r => r[1]), ['Aurora', 'Astaroth', 'Keira', 'Galahad']);

  // Power asc: favorites (Astaroth 140k, Aurora 150k) then non-favorites (Galahad 160k, Keira 180k)
  const sortedAsc = sortRows(rows, 2, 'asc', isFav);
  assert.deepEqual(Array.from(sortedAsc, r => r[1]), ['Astaroth', 'Aurora', 'Galahad', 'Keira']);

  // Name asc: favorites (Astaroth, Aurora) then non-favorites (Galahad, Keira)
  const sortedName = sortRows(rows, 1, 'asc', isFav);
  assert.deepEqual(Array.from(sortedName, r => r[1]), ['Astaroth', 'Aurora', 'Galahad', 'Keira']);
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

  // gathering march traveling to mine and gathering at mine
  const gatherTraveling = {
    kind: "wood",
    stage: "moveToTargetInSolo",
    targetArrivalAt: now + 50000,
    endsAt: now + 50000
  };
  assert.equal(isMarchExpired(gatherTraveling, now), false);
  assert.equal(isMarchExpired(gatherTraveling, now + 50001), false); // once arrived, gathering begins and does not expire

  const gatherAtMine = {
    kind: "wood",
    stage: "interactionWithTarget",
    targetArrivalAt: now - 10000,
    endsAt: now - 10000
  };
  assert.equal(isMarchExpired(gatherAtMine, now), false);

  // returning march from gathering spot expires exactly at returnAt
  const returningMarch = {
    kind: "return",
    stage: "returnToOutpost",
    previousKind: "wood",
    returnAt: now + 60000,
    endsAt: now + 60000
  };
  assert.equal(isMarchExpired(returningMarch, now), false);
  assert.equal(isMarchExpired(returningMarch, now + 59999), false);
  assert.equal(isMarchExpired(returningMarch, now + 60000), true);
  assert.equal(isMarchExpired(returningMarch, now + 70000), true);
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

test('getChallengeResourceStock resolves inventory balances and returns null for activities', () => {
  const cache = {
    inventoryGet: {
      data: {
        coin: {
          '8': 410, '9': 460, '10': 150, // Hero Skin Stones total: 1020
          '20': 2410, // Titan Skin Stones
          '13': 17,   // Summon Titan Circle
          '40065': 250, // Relic Shards
          '40078': 1585, // Rune Spheres
          '40077': 9195  // Rune Stones
        },
        consumable: {
          '20': 11650, // Titan Potions
          '46': 23,    // Elemental Spheres
          '44': 3,     // Chaos Cores
          '45': 24     // Artifact Chest Keys
        },
        fragmentHero: { '1': 50, '2': 30 }
      }
    },
    energyStatus: { data: { energy: 59 } }
  };

  // Resources by numeric ID
  assert.equal(getChallengeResourceStock(cache, 37), 1020);
  assert.equal(getChallengeResourceStock(cache, 54), 2410);
  assert.equal(getChallengeResourceStock(cache, 40), 11650);
  assert.equal(getChallengeResourceStock(cache, 29), 23);
  assert.equal(getChallengeResourceStock(cache, 28), 17);
  assert.equal(getChallengeResourceStock(cache, 55), 250);
  assert.equal(getChallengeResourceStock(cache, 57), 3);
  assert.equal(getChallengeResourceStock(cache, 38), 24);
  assert.equal(getChallengeResourceStock(cache, 50), 1585);
  assert.equal(getChallengeResourceStock(cache, 51), 9195);
  assert.equal(getChallengeResourceStock(cache, 49), 59);
  assert.equal(getChallengeResourceStock(cache, 47), 80);

  // Resources by label string
  assert.equal(getChallengeResourceStock(cache, 'Spend 15 Titan Skin Stones'), 2410);
  assert.equal(getChallengeResourceStock(cache, 'Open 1 Elemental Sphere'), 23);
  assert.equal(getChallengeResourceStock(cache, 'Spend 100 Titan Potions'), 11650);
  assert.equal(getChallengeResourceStock(cache, 'Spend 15 Hero Skin Stones'), 1020);
  assert.equal(getChallengeResourceStock(cache, 'Spend 10 Relic Shards'), 250);
  assert.equal(getChallengeResourceStock(cache, 'Spend 1 Chaos Core'), 3);
  assert.equal(getChallengeResourceStock(cache, 'Open 1 Artifact Chest'), 24);
  assert.equal(getChallengeResourceStock(cache, 'Spend 3 Energy'), 59);

  // Activities (should return null)
  assert.equal(getChallengeResourceStock(cache, 27), null); // Increase Titan Power by 3
  assert.equal(getChallengeResourceStock(cache, 'Increase Titan Power by 3'), null);
  assert.equal(getChallengeResourceStock(cache, 'Defeat 1 Map Boss / Rally'), null);
  assert.equal(getChallengeResourceStock(cache, 'Open 1 Tower Chest'), null);
  assert.equal(getChallengeResourceStock(cache, 'Fight 1 Arena Battle'), null);
  assert.equal(getChallengeResourceStock(cache, 'Start 1 Expedition'), null);
  assert.equal(getChallengeResourceStock(cache, 'Complete 1 Daily Quest'), null);
  assert.equal(getChallengeResourceStock(cache, 'Clear 1 Bandit Camp'), null);
});

test('extractEventGoals groups activities and resources, calculates synergies, and prioritizes optimal roadmap', () => {
  const cache = {
    clanVersusStatus: {
      data: {
        battle: {
          rounds: [
            { index: 1, theme: 'Radar Training & Titan Power', status: 'inProgress' }
          ]
        },
        info: {
          roundNumber: 1,
          challenges: [
            { id: 27, progress: 9 },   // Titan Power
            { id: 54, progress: 30 },  // Titan Skin Stones
            { id: 29, progress: 2 },   // Elemental Spheres
            { id: 31, progress: 15 },  // Tower Chest
            { id: 13, progress: 5 }    // Map Boss / Rally
          ]
        }
      }
    },
    dungeonStatus: {
      data: {
        floorNumber: 581,
        maxFloorPassed: 580,
        dungeonActivity: 738,
        elements: { prime: 'earth' }
      }
    },
    clanWarChampStatus: {
      data: {
        seasonId: 58,
        tries: 2
      }
    },
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 100347,
            groups: [
              {
                id: 101,
                localeKey: 'QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND',
                repeatType: 'chain',
                quests: [{ id: 1, state: 'inProgress', progress: 15 }]
              },
              {
                id: 102,
                localeKey: 'QUEST_TAB_NAME_TOWER_CHESTS',
                repeatType: 'chain',
                quests: [{ id: 2, state: 'inProgress', progress: 5 }]
              },
              {
                id: 103,
                localeKey: 'STRATEGIC_GLOBAL_MAP_RALLY_POPUP_TITLE',
                repeatType: 'daily',
                quests: [{ id: 3, state: 'inProgress', progress: 1 }]
              }
            ]
          }
        ]
      }
    },
    inventoryGet: {
      data: {
        coin: {
          '20': 2410,
          '13': 17,
          '40065': 250
        },
        consumable: {
          '20': 11650,
          '46': 23
        }
      }
    }
  };

  const goals = extractEventGoals(cache);
  assert.ok(goals.all.length > 0);
  assert.ok(goals.activities.length > 0);
  assert.ok(goals.resources.length > 0);
  assert.equal(goals.metrics.totalGoals, goals.all.length);
  assert.ok(goals.metrics.synergiesCount >= 3);

  // Check that overlapping resources are detected
  const titanStones = goals.resources.find(r => r.key === 'res:titan_skin_stones');
  assert.ok(titanStones);
  assert.equal(titanStones.overlapCount, 2);
  assert.equal(titanStones.inStock, true);
  assert.equal(titanStones.stock, 2410);

  const spheres = goals.resources.find(r => r.key === 'res:elemental_spheres');
  assert.ok(spheres);
  assert.equal(spheres.overlapCount, 1);
  assert.equal(spheres.inStock, true);

  // Check that overlapping activities are detected
  const tower = goals.activities.find(a => a.key === 'act:tower');
  assert.ok(tower);
  assert.equal(tower.overlapCount, 2);
  assert.equal(tower.isLimited, true);

  // Synergies / overlaps appear first in sorted lists
  assert.ok(goals.resources[0].overlapCount > 1);
  assert.ok(goals.activities[0].overlapCount > 1);
});

test('extractEventGoals mines specialQuestStatus and questGetAll into goals and finds synergies', () => {
  const cache = {
    clanVersusStatus: {
      data: {
        battle: { rounds: [{ index: 1, status: 'inProgress' }] },
        info: {
          challenges: [
            { id: 31, progress: 5 },  // Tower Chest
            { id: 54, progress: 10 }  // Titan Skin Stones
          ]
        }
      }
    },
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 100347,
            groups: [
              {
                id: 101,
                localeKey: 'QUEST_TAB_NAME_TOWER_CHESTS',
                repeatType: 'chain',
                quests: [
                  { id: 1, state: 'inProgress', progress: 5 }
                ]
              },
              {
                id: 102,
                localeKey: 'QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND',
                repeatType: 'chain',
                quests: [
                  { id: 2, state: 'inProgress', progress: 15 }
                ]
              },
              {
                id: 103,
                localeKey: 'QUEST_TAB_NAME_LOGIN',
                repeatType: 'daily',
                quests: [
                  { id: 3, state: 'inProgress', progress: 1 }
                ]
              }
            ]
          }
        ]
      }
    },
    questGetAll: {
      data: [
        { id: 1020640, state: 2, progress: 4 }, // ready to claim!
        { id: 249, state: 1, progress: 0 }
      ]
    },
    inventoryGet: {
      data: {
        coin: { '20': 500 }
      }
    }
  };

  const goals = extractEventGoals(cache);
  assert.ok(goals.all.length > 0);

  // Tower should have 2x synergy: Guild Versus Round 1 + Special Quest
  const tower = goals.activities.find(a => a.key === 'act:tower');
  assert.ok(tower);
  assert.equal(tower.overlapCount, 2);
  assert.equal(tower.events.length, 2);
  assert.ok(tower.isLimited);

  // Titan Skin Stones should have 2x synergy: Guild Versus Round 1 + Special Quest
  const titanStones = goals.resources.find(r => r.key === 'res:titan_skin_stones');
  assert.ok(titanStones);
  assert.equal(titanStones.overlapCount, 2);
  assert.equal(titanStones.inStock, true);
  assert.equal(titanStones.stock, 500);

  // Claim completed quests should be extracted as ready activity
  const claimGoal = goals.activities.find(a => a.key === 'act:claim_completed_quests');
  assert.ok(claimGoal);
  assert.equal(claimGoal.needed, 1);
  assert.ok(claimGoal.isLimited);

  // Login quest extracted
  const loginGoal = goals.activities.find(a => a.key === 'act:login');
  assert.ok(loginGoal);
  assert.ok(loginGoal.isLimited);
});

test('getChallengeResourceStock resolves emerald and starmoney balances', () => {
  const cache = {
    'resource:starMoney': { data: { amount: 12500 } }
  };
  assert.equal(getChallengeResourceStock(cache, 'Spend Emeralds'), 12500);
  assert.equal(getChallengeResourceStock(cache, 'Spend StarMoney'), 12500);
});

test('getUnreadChatCount calculates unread count accurately against lastReadTime', () => {
  assert.equal(getUnreadChatCount(null, 1000), 0);
  assert.equal(getUnreadChatCount([], 1000), 0);

  const messages = [
    { id: '1', ctime: '100' },
    { id: '2', ctime: '200' },
    { id: '3', ctime: '300' }
  ];

  // When lastReadTime <= 0, all messages are unread
  assert.equal(getUnreadChatCount(messages, 0), 3);
  assert.equal(getUnreadChatCount(messages, null), 3);

  // When lastReadTime is 150, messages 2 and 3 are unread
  assert.equal(getUnreadChatCount(messages, 150), 2);

  // When lastReadTime is 250, only message 3 is unread
  assert.equal(getUnreadChatCount(messages, 250), 1);

  // When lastReadTime is 300 or greater, no messages are unread
  assert.equal(getUnreadChatCount(messages, 300), 0);
  assert.equal(getUnreadChatCount(messages, 500), 0);
});

test('isTowerCleared detects win state or isCleared flag across snapshots', () => {
  assert.equal(isTowerCleared({}), false);
  assert.equal(isTowerCleared({ towerStatus: { data: { state: 'inProgress', isCleared: false } } }), false);
  assert.equal(isTowerCleared({ towerStatus: { data: { state: 'win', isCleared: true } } }), true);
  assert.equal(isTowerCleared({ magicTower_briefInfo: { data: { state: 'win' } } }), true);
});

test('extractEventGoals disables and deprioritizes Tower Chest goal when tower is cleared', () => {
  const cacheWithUncleared = {
    clanVersusStatus: {
      data: {
        info: { challenges: [{ id: 31, progress: 5 }] }
      }
    },
    towerStatus: {
      data: { isCleared: false, state: 'inProgress' }
    }
  };

  const unclearedGoals = extractEventGoals(cacheWithUncleared);
  const towerAvailable = unclearedGoals.activities.find(a => a.key === 'act:tower');
  assert.ok(towerAvailable);
  assert.equal(towerAvailable.isUnavailable, false);
  assert.equal(towerAvailable.isLimited, true);
  assert.ok(unclearedGoals.metrics.readyCount >= 1);

  const cacheWithCleared = {
    clanVersusStatus: {
      data: {
        info: { challenges: [{ id: 31, progress: 15 }] }
      }
    },
    towerStatus: {
      data: { isCleared: true, state: 'win' }
    }
  };

  const clearedGoals = extractEventGoals(cacheWithCleared);
  const towerUnavailable = clearedGoals.activities.find(a => a.key === 'act:tower');
  assert.ok(towerUnavailable);
  assert.equal(towerUnavailable.isUnavailable, true);
  assert.equal(towerUnavailable.isLimited, false);
  assert.ok(towerUnavailable.hint.includes('Tower cleared today'));
  // Not included in readyCount
  assert.equal(clearedGoals.metrics.readyCount, 0);
});

test('isResourceSelectableForHeader allows all resources except energy and world-energy', () => {
  assert.equal(isResourceSelectableForHeader({ key: 'resource:energy' }), false);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:world-energy' }), false);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:gold' }), true);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:starMoney' }), true);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:coin:1' }), true);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:refillable:2' }), true);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:material:5' }), true);
  assert.equal(isResourceSelectableForHeader({ key: 'resource:consumable:20' }), true);
  assert.equal(isResourceSelectableForHeader(null), false);
});

test('isDebugOrEventResource identifies test, unmapped, and inactive event resources', () => {
  // Standard resources are not debug/event
  assert.equal(isDebugOrEventResource({ key: 'resource:gold', data: { label: 'Gold', amount: 5000 } }), false);
  assert.equal(isDebugOrEventResource({ key: 'resource:starMoney', data: { label: 'Emeralds', amount: 100 } }), false);
  assert.equal(isDebugOrEventResource({ key: 'resource:refillable:2', data: { label: 'Skill Points', amount: 10 } }), false);
  assert.equal(isDebugOrEventResource({ key: 'resource:coin:1', data: { label: 'Arena coin', amount: 120 } }), false);
  assert.equal(isDebugOrEventResource({ key: 'resource:material:5', data: { label: 'Food', amount: 2000 } }), false);

  // Test / debug keywords
  assert.equal(isDebugOrEventResource({ key: 'resource:coin:1101', data: { label: 'Test Coin', amount: 10 } }), true);
  assert.equal(isDebugOrEventResource({ key: 'resource:debugItem', data: { label: 'Debug Item', amount: 1 } }), true);

  // Unmapped fallback labels
  assert.equal(isDebugOrEventResource({ key: 'resource:coin:100011', data: { label: 'coin #100011', amount: 50 } }), true);
  assert.equal(isDebugOrEventResource({ key: 'resource:material:8', data: { label: 'material #8', amount: 2 } }), true);

  // Event refillables with 0 balance or Event Energy / Refillable #
  assert.equal(isDebugOrEventResource({ key: 'resource:refillable:10', data: { label: 'Refillable #10', amount: 0 } }), true);
  assert.equal(isDebugOrEventResource({ key: 'resource:refillable:61', data: { label: 'Event Energy #61', amount: 0 } }), true);
  assert.equal(isDebugOrEventResource({ key: 'resource:refillable:70', data: { label: 'Refillable #70', amount: 5 } }), true);
});

test('formatTitanArtifactLevels formats artifact levels joined by dash', () => {
  assert.equal(formatTitanArtifactLevels('4000', {
    artifacts: [{ level: 20 }, { level: 15 }, { level: 20 }]
  }), '20 - 15 - 20');
  assert.equal(formatTitanArtifactLevels('4001', {
    artifacts: [{ level: 10 }, { level: 5 }, { level: 10 }]
  }), '10 - 5 - 10');
  assert.equal(formatTitanArtifactLevels('4030', { artifacts: [] }), '—');
  assert.equal(formatTitanArtifactLevels('4030', null), '—');
});

test('isTitanArtifactUpgradable evaluates level upgrade and star evolution readiness', () => {
  const titan4000 = {
    level: 45,
    artifacts: [
      { level: 20, star: 3 },
      { level: 45, star: 1 },
      { level: 45, star: 6 }
    ]
  };

  const cache1 = {
    inventoryGet: {
      data: {
        coin: { '18': 200 },
        fragmentArtifact: { '11001': 10, '12003': 50, '13003': 0 }
      }
    },
    'resource:gold': { value: 100000 }
  };
  assert.equal(isTitanArtifactUpgradable('4000', 0, titan4000, cache1), true);
  assert.equal(isTitanArtifactUpgradable('4000', 1, titan4000, cache1), false);
  assert.equal(isTitanArtifactUpgradable('4000', 2, titan4000, cache1), false);

  const cache2 = {
    inventoryGet: {
      data: {
        coin: { '18': 0 },
        fragmentArtifact: { '11001': 10, '12003': 400, '13003': 0 }
      }
    },
    'resource:gold': { value: 0 }
  };
  assert.equal(isTitanArtifactUpgradable('4000', 0, titan4000, cache2), false);
  assert.equal(isTitanArtifactUpgradable('4000', 1, titan4000, cache2), true);
  assert.equal(isTitanArtifactUpgradable('4000', 2, titan4000, cache2), false);

  assert.equal(isTitanArtifactUpgradable('4000', 0, null, cache1), false);
  assert.equal(isTitanArtifactUpgradable('4000', 0, titan4000, null), false);
  assert.equal(isTitanArtifactUpgradable('4000', 5, titan4000, cache1), false);
});

test('exportTableData enriches titans with structured artifacts and skins', () => {
  const cache = {
    titanGetAll: {
      data: {
        '4000': {
          level: 45,
          star: 3,
          power: 7358,
          currentSkin: 10001,
          skins: { '10001': 20, '10013': 10 },
          artifacts: [
            { level: 20, star: 3 },
            { level: 15, star: 1 },
            { level: 20, star: 2 }
          ]
        }
      }
    },
    inventoryGet: {
      data: {
        coin: { '18': 500 },
        fragmentArtifact: { '11001': 10 }
      }
    },
    'resource:gold': { value: 500000 }
  };

  const exported = exportTableData('titans', cache);
  assert.equal(exported.length, 1);
  const titan = exported[0];
  assert.equal(titan.id, 4000);
  assert.equal(titan.name, 'Sigurd');
  assert.equal(titan.artifacts.length, 3);
  assert.equal(titan.artifacts[0].type, 'weapon');
  assert.equal(titan.artifacts[0].level, 20);
  assert.equal(titan.artifacts[0].isUpgradable, true);
  assert.equal(titan.skins.length, 2);
  assert.equal(titan.skins[0].skinId, 10001);
  assert.equal(titan.skins[0].stat, 'Arm');
  assert.equal(titan.skins[0].isCurrent, true);
  assert.equal(titan.skins[1].stat, 'MD');
  assert.equal(titan.skins[1].isCurrent, false);
});

test('countEvolvableHeroes counts only heroes with sufficient soul stones for star upgrade', () => {
  const { countEvolvableHeroes } = context.hwaHelperPopupData;
  const heroes = {
    1: { star: 3 },
    2: { star: 5 },
    3: { star: 6 }
  };
  const inventory = {
    fragmentHero: {
      1: 150,
      2: 290,
      3: 500
    }
  };
  assert.equal(countEvolvableHeroes(heroes, inventory), 1);
  assert.equal(countEvolvableHeroes(null, inventory), 0);
  assert.equal(countEvolvableHeroes(heroes, null), 0);
});

test('countEvolvableTitans counts titans with sufficient soul stones for star upgrade', () => {
  const { countEvolvableTitans } = context.hwaHelperPopupData;
  const titans = {
    4000: { star: 2 },
    4001: { star: 3 },
    4002: { star: 6 }
  };
  const inventory = {
    fragmentTitan: {
      4000: 164,
      4001: 500,
      4002: 1000
    }
  };
  assert.equal(countEvolvableTitans(titans, inventory), 2);
  assert.equal(countEvolvableTitans(null, inventory), 0);
  assert.equal(countEvolvableTitans(titans, null), 0);
});

test('getChallengeResourceStock resolves 0 for missing inventory items instead of falling back to stale resource cache', () => {
  const staleCache = {
    inventoryGet: {
      data: {
        coin: { '1': 1000 },
        consumable: { '20': 500 }
      }
    },
    'resource:coin:13': { data: { amount: 5 } },
    'resource:consumable:46': { data: { amount: 20 } }
  };
  assert.equal(getChallengeResourceStock(staleCache, 'Summon 1 Titan in Circle'), 0);
  assert.equal(getChallengeResourceStock(staleCache, 28), 0);
  assert.equal(getChallengeResourceStock(staleCache, 'Summoning sphere'), 0);
  assert.equal(getChallengeResourceStock(staleCache, 'Open 1 Elemental Sphere'), 0);
  assert.equal(getChallengeResourceStock(staleCache, 29), 0);

  // When inventoryGet is missing, it still falls back to resource cache
  const noInvCache = {
    'resource:coin:13': { data: { amount: 5 } },
    'resource:consumable:46': { data: { amount: 20 } }
  };
  assert.equal(getChallengeResourceStock(noInvCache, 'Summon 1 Titan in Circle'), 5);
  assert.equal(getChallengeResourceStock(noInvCache, 'Open 1 Elemental Sphere'), 20);
});

test('Honor Marks stock uses material 12 rather than Gold coin 1', () => {
  const cache = {
    inventoryGet: { data: { coin: { '1': 2106 } } },
    'resource:gold': { data: { amount: 58476691 } },
    'resource:material:12': { data: { amount: 730 } }
  };
  assert.equal(getChallengeResourceStock(cache, 92), 730);
  assert.equal(getChallengeResourceStock(cache, 'Spend 1 Honor Mark'), 730);
});

test('getItemCategoryMeta orders groups matching in-game inventory priority and returns metadata', () => {
  const { getItemCategoryMeta } = context.hwaHelperPopupData;
  const consumable = getItemCategoryMeta('consumable');
  const gear = getItemCategoryMeta('gear');
  const fragmentGear = getItemCategoryMeta('fragmentGear');
  const scroll = getItemCategoryMeta('scroll');
  const fragmentHero = getItemCategoryMeta('fragmentHero');
  const fragmentTitan = getItemCategoryMeta('fragmentTitan');
  const coin = getItemCategoryMeta('coin');
  const material = getItemCategoryMeta('material');
  const unknown = getItemCategoryMeta('customGroup');

  // Verify priority order: consumable < gear < recipes (fragmentGear/scroll) < soul stones < resources (coin/material) < unknown
  assert.ok(consumable.order < gear.order, 'consumable should precede gear');
  assert.ok(gear.order < fragmentGear.order, 'gear should precede fragmentGear');
  assert.ok(fragmentGear.order <= scroll.order, 'recipes should precede soul stones');
  assert.ok(scroll.order < fragmentHero.order, 'scroll should precede fragmentHero');
  assert.ok(fragmentHero.order <= fragmentTitan.order, 'fragmentHero should be with fragments');
  assert.ok(fragmentTitan.order < coin.order, 'fragments should precede resources');
  assert.ok(coin.order <= material.order, 'coin should be with resources');
  assert.ok(material.order < unknown.order, 'known categories should precede custom ones');

  // Verify labels
  assert.equal(consumable.label, 'Consumables');
  assert.equal(gear.label, 'Equipment');
  assert.equal(fragmentGear.label, 'Gear Recipes');
  assert.equal(fragmentHero.label, 'Hero Soul Stones');
  assert.equal(coin.label, 'Coins & Currency');
  assert.equal(unknown.label, 'Custom Group');
});

test('getItemAbbr generates concise uppercase abbreviations for inventory grid view', () => {
  const { getItemAbbr } = context.hwaHelperPopupData;
  // Multi-word names: first letters
  assert.equal(getItemAbbr('Energy Potion', 1), 'EP');
  assert.equal(getItemAbbr('Large EXP Potion', 2), 'LEP');
  assert.equal(getItemAbbr('Flawless Artifact Chest', 3), 'FAC');
  assert.equal(getItemAbbr('Hero Soul Stone', 4), 'HSS');
  assert.equal(getItemAbbr('Chaos Core', 5), 'CC');

  // Single-word names: first 3-4 letters
  assert.equal(getItemAbbr('Gold', 10), 'GOLD');
  assert.equal(getItemAbbr('Iron', 11), 'IRON');
  assert.equal(getItemAbbr('Emerald', 12), 'EME');

  // Fallback for missing/empty
  assert.equal(getItemAbbr('', 99), '#99');
  assert.equal(getItemAbbr('—', 105), '#105');
});

test('getHeroArtifactTier and getHeroArtifactTierStyle apply 5-color scale breakpoints', () => {
  const { getHeroArtifactTier, getHeroArtifactTierStyle } = context.hwaHelperPopupData;

  // Tier 1: 1-25 (Gray/slate instead of pure white)
  assert.equal(getHeroArtifactTier(1), 1);
  assert.equal(getHeroArtifactTier(25), 1);
  const styleT1 = getHeroArtifactTierStyle(15);
  assert.equal(styleT1.tier, 1);
  assert.ok(styleT1.badge.includes('bg-slate-700/80'));
  assert.equal(styleT1.starColor, 'text-slate-400');

  // Tier 2: 26-50 (Green)
  assert.equal(getHeroArtifactTier(26), 2);
  assert.equal(getHeroArtifactTier(50), 2);
  const styleT2 = getHeroArtifactTierStyle(40);
  assert.equal(styleT2.tier, 2);
  assert.ok(styleT2.badge.includes('bg-emerald-950/60'));
  assert.equal(styleT2.starColor, 'text-green-500');

  // Tier 3: 51-70 (Blue)
  assert.equal(getHeroArtifactTier(51), 3);
  assert.equal(getHeroArtifactTier(70), 3);
  const styleT3 = getHeroArtifactTierStyle(65);
  assert.equal(styleT3.tier, 3);
  assert.ok(styleT3.badge.includes('bg-sky-950/60'));
  assert.equal(styleT3.starColor, 'text-blue-500');

  // Tier 4: 71-85 (Violet)
  assert.equal(getHeroArtifactTier(71), 4);
  assert.equal(getHeroArtifactTier(85), 4);
  const styleT4 = getHeroArtifactTierStyle(80);
  assert.equal(styleT4.tier, 4);
  assert.ok(styleT4.badge.includes('bg-purple-950/60'));
  assert.equal(styleT4.starColor, 'text-violet-500');

  // Tier 5: 86-100 (Orange)
  assert.equal(getHeroArtifactTier(86), 5);
  assert.equal(getHeroArtifactTier(100), 5);
  assert.equal(getHeroArtifactTier(120), 5);
  const styleT5 = getHeroArtifactTierStyle(95);
  assert.equal(styleT5.tier, 5);
  assert.ok(styleT5.badge.includes('bg-amber-950/60'));
  assert.equal(styleT5.starColor, 'text-orange-400');
});
