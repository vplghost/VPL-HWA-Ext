import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pruneHeroPool,
  generateOneSwapCandidates,
  buildHeroPoolMap,
  buildSyntheticArenaBattle,
  normalizeBattleHero,
  runTenRoundPvpMatch,
  runPvpOptimizationSession,
  teamKey,
} from '../src/services/pvpTeamOptimizer.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MOCK_HEROES = {
  '1': { id: 1, power: 200000, level: 120, color: 16, star: 6 },
  '2': { id: 2, power: 190000, level: 120, color: 16, star: 6 },
  '3': { id: 3, power: 185000, level: 120, color: 16, star: 6 },
  '4': { id: 4, power: 180000, level: 120, color: 16, star: 6 },
  '5': { id: 5, power: 175000, level: 120, color: 16, star: 6 },
  '6': { id: 6, power: 170000, level: 120, color: 16, star: 6 },
  '7': { id: 7, power: 160000, level: 120, color: 16, star: 6 },
  '8': { id: 8, power: 140000, level: 120, color: 15, star: 5 },
  '9': { id: 9, power: 60000, level: 80, color: 10, star: 4 },   // too weak (< 55% of 200k)
  '10': { id: 10, power: 25000, level: 50, color: 7, star: 3 },  // too weak
};

test('pruneHeroPool filters weak heroes by power thresholds, topN, exclusions, and preserves seed heroes', () => {
  const pruned = pruneHeroPool(MOCK_HEROES, [1, 2, 3, 4, 5], {
    topN: 7,
    minPowerPctOfMax: 55,
    minPowerPctOfSeedMin: 70,
    excludedHeroIds: [7],
  });

  const ids = pruned.map((h) => h.id);
  assert.ok(ids.includes(1) && ids.includes(5), 'Seed team heroes must always be kept');
  assert.ok(ids.includes(6) && ids.includes(8), 'Strong pool heroes must be kept');
  assert.ok(!ids.includes(7), 'Excluded hero must be removed');
  assert.ok(!ids.includes(9) && !ids.includes(10), 'Weak heroes below power threshold must be pruned');
  assert.ok(ids.length <= 7, 'Pool must respect topN limit');
});

test('generateOneSwapCandidates respects lockedHeroIds, visitedKeys deduplication, and minTeamPower', () => {
  const map = buildHeroPoolMap(MOCK_HEROES);
  const visited = new Set([teamKey([1, 2, 3, 4, 5])]);

  const cands = generateOneSwapCandidates([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7], map, {
    lockedHeroIds: [1, 2],
    visitedKeys: visited,
    minTeamPower: 900000,
  });

  // Only 3 unlocked slots (3, 4, 5) x 2 external heroes (6, 7) = 6 candidates
  assert.equal(cands.length, 6);
  for (const team of cands) {
    assert.ok(team.includes(1) && team.includes(2), 'Locked heroes must stay in every candidate');
  }

  // Calling again with same visited set returns 0 duplicates
  const dup = generateOneSwapCandidates([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7], map, {
    lockedHeroIds: [1, 2],
    visitedKeys: visited,
  });
  assert.equal(dup.length, 0);
});

test('runTenRoundPvpMatch supports 5+5 symmetric mode and earlyExit pruning', async () => {
  const map = buildHeroPoolMap(MOCK_HEROES);
  const roles = [];

  // Full 10 rounds (5 atk + 5 def)
  const fullRes = await runTenRoundPvpMatch(
    [1, 2, 3, 4, 6],
    [1, 2, 3, 4, 5],
    map,
    async (battle) => {
      const aIsAtk = '6' in battle.attackers;
      roles.push(aIsAtk ? 'atk' : 'def');
      return { win: aIsAtk, stars: 3, duration: 22 }; // Team A wins 10/10 (wins as atk, defenders win when B is atk -> win=false)
    },
    { rounds: 10, symmetric: true, earlyExit: false }
  );

  assert.equal(fullRes.roundsPlayed, 10);
  assert.equal(fullRes.winsA, 10);
  assert.equal(fullRes.winRateAPct, 100);
  assert.equal(roles.filter((r) => r === 'atk').length, 5);
  assert.equal(roles.filter((r) => r === 'def').length, 5);

  // Early-exit when Team A loses first 5 rounds straight (0-5 -> cannot reach 6/10)
  const earlyRes = await runTenRoundPvpMatch(
    [1, 2, 3, 4, 8],
    [1, 2, 3, 4, 5],
    map,
    async (battle) => {
      const aIsAtk = '8' in battle.attackers;
      return { win: !aIsAtk, stars: 3, duration: 20 }; // Team A always loses
    },
    { rounds: 10, symmetric: true, earlyExit: true }
  );

  assert.equal(earlyRes.earlyExited, true);
  assert.equal(earlyRes.roundsPlayed, 5, 'Should stop after 5 consecutive losses');
  assert.equal(earlyRes.winsA, 0);
});

test('runPvpOptimizationSession ranks Giant Killer above Seed Team and runs Top-K Round-Robin', async () => {
  // Hero 8 has lower power (140k < 175k) than Hero 5, but in our mock engine any team with Hero 8 wins 80%
  let roundCounter = 0;
  const mockSim = async (battle) => {
    roundCounter++;
    const atkHas8 = '8' in battle.attackers;
    const defHas8 = Object.values(battle.defenders?.[0] || {}).some((h) => Number(h?.id) === 8);
    if (atkHas8 && !defHas8) return { win: roundCounter % 5 !== 0, stars: 3, duration: 18 };
    if (!atkHas8 && defHas8) return { win: roundCounter % 5 === 0, stars: 3, duration: 18 };
    return { win: roundCounter % 2 === 0, stars: 3, duration: 25 };
  };

  const session = await runPvpOptimizationSession({
    rawHeroes: MOCK_HEROES,
    seedHeroIds: [1, 2, 3, 4, 5],
    simulateFn: mockSim,
    searchMode: 'top-k-round-robin',
    filterOptions: {
      topN: 8,
      minPowerPctOfMax: 55,
      minPowerPctOfSeedMin: 70,
      lockedHeroIds: [1, 2, 3],
      minTeamPowerPctOfSeed: 80,
    },
    matchOptions: { rounds: 10, symmetric: true, earlyExit: true },
    maxMatchups: 30,
    roundRobinTopK: 4,
  });

  assert.ok(session.totalMatchups > 0);
  assert.ok(session.leaderboard.length >= 2);
  const top = session.leaderboard[0];
  assert.ok(top.heroIds.includes(8), 'Team containing Giant Killer hero #8 should rank #1');
  assert.equal(top.isGiantKiller, true);
  assert.ok((top.winRateVsSeedPct ?? 0) > 50);
  assert.ok(session.leaderboard.some((e) => e.isSeed), 'Seed team must remain in leaderboard');
});

test('PvpTeamOptimizerModal is wired into useModals, App.vue, and TeamsTab.vue', () => {
  const modalsSrc = fs.readFileSync(path.join(ROOT, 'src', 'composables', 'useModals.ts'), 'utf8');
  assert.match(modalsSrc, /'pvpOptimizer'/);

  const appSrc = fs.readFileSync(path.join(ROOT, 'entrypoints', 'popup', 'App.vue'), 'utf8');
  assert.match(appSrc, /PvpTeamOptimizerModal/);
  assert.match(appSrc, /modalState\.pvpOptimizer/);

  const teamsSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'tabs', 'TeamsTab.vue'), 'utf8');
  assert.match(teamsSrc, /id="btn-open-pvp-optimizer"/);
  assert.match(teamsSrc, /openModal\('pvpOptimizer'\)/);

  const modalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dialogs', 'PvpTeamOptimizerModal.vue'), 'utf8');
  assert.match(modalSrc, /id="pvp-optimizer-modal"/);
  assert.match(modalSrc, /id="btn-start-pvp-optimizer"/);
  assert.match(modalSrc, /id="pvp-optimizer-leaderboard"/);
  assert.match(modalSrc, /id="pvp-optimizer-hydration-badge"/);
});

test('buildSyntheticArenaBattle produces CONSTRUCT_BATTLE_PLAY-compatible envelope and prefers hydrated hero stats', () => {
  const hydrated = {
    '16': {
      id: 16,
      level: 90,
      color: 12,
      star: 5,
      power: 52197,
      hp: 92217,
      armor: 2281.4,
      magicResist: 1653.3,
      physicalAttack: 6108,
      magicPower: 2812,
      agility: 4506,
      strength: 1734,
      intelligence: 1737,
      hero_runes: [30, 15, 10, 40, 40],
      artifacts: [
        { level: 40, star: 4, artifactType: 'weapon' },
        { level: 60, star: 3, artifactType: 'book' },
        { level: 60, star: 4, artifactType: 'ring' },
      ],
    },
  };

  // Verify works with both plain Record and Map hero pools
  const battle = buildSyntheticArenaBattle(
    [16, 2],
    [3, 4],
    { '2': { id: 2, level: 90, color: 11, star: 5, power: 42054 } },
    123456,
    {
      hydratedHeroStats: hydrated,
      battleTemplate: { battleFeatures: ['battleFeature_202'], battleEffects: { StatUp: 5 } },
      userId: '1216438103',
    }
  );

  assert.equal(Array.isArray(battle.effects), true, 'effects MUST be an array [] to avoid CONSTRUCT_BATTLE_PLAY IL2CPP exception');
  assert.equal(Array.isArray(battle.reward), true);
  assert.ok(Number.isFinite(battle.startTime) && battle.startTime > 0);
  assert.deepEqual(battle.battleFeatures, ['battleFeature_202']);
  assert.deepEqual(battle.battleEffects, { StatUp: 5 });
  assert.equal(battle.attackers['16'].hp, 92217, 'Must prefer exact server-hydrated HP');
  assert.ok(battle.attackers['2'].hp > 0 && battle.attackers['2'].artifacts.length === 3, 'Fallback hero must have valid non-zero C# fields');
  assert.deepEqual(Object.keys(battle.defenders[0]), ['1', '2'], 'defenders[0] MUST be keyed by 1-indexed slot ("1".."5")');
  assert.equal(battle.defenders[0]['1'].id, 3);
  assert.equal(battle.defenders[0]['2'].id, 4);

  // When battleTemplate is omitted, must populate full 450-entry DEFAULT_ARENA_BATTLE_EFFECTS
  const defaultBattle = buildSyntheticArenaBattle([16], [2], { '16': { id: 16, power: 50000 }, '2': { id: 2, power: 40000 } }, 999);
  assert.ok(Object.keys(defaultBattle.battleEffects).length >= 400, 'Must include baseline battleEffects map');

  const normFallback = normalizeBattleHero(99, undefined, { id: 99, level: 80, power: 25000 });
  assert.equal(normFallback.GlobalAttack, 100);
  assert.equal(normFallback.artifacts.length, 3);
  assert.ok(normFallback.hp > 0);
});

test('rpcCache passively accumulates battleHeroStatsCache, battleEnvelopeTemplate, and clanTrainingsCache', () => {
  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  let state = rpcCacheService.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T13:16:00.000Z',
    requestBody: JSON.stringify({
      calls: [
        { name: 'customArena_startBattle', args: { type: 'NormalArena', userId: '646392096', units: [16] }, ident: 's1' },
        { name: 'clanTrainings_createChallenge', args: { heroes: [79, 72, 16, 54, 60], type: 'hero', description: '1st' }, ident: 't1' },
      ],
    }),
    responseBody: JSON.stringify({
      results: [
        {
          ident: 's1',
          result: {
            response: {
              battles: [{
                type: 'arena',
                seed: 111,
                battleFeatures: ['battleFeature_202'],
                battleEffects: { StatUp: 5 },
                attackers: { '16': { id: 16, level: 90, hp: 92217, power: 52197 } },
                defenders: [{}],
              }],
            },
          },
        },
        {
          ident: 't1',
          result: {
            response: {
              id: 101,
              data: {
                description: '1st',
                defenders: { heroes: [{ id: 79 }, { id: 72 }, { id: 16 }, { id: 54 }, { id: 60 }] },
              },
            },
          },
        },
      ],
    }),
  }]).cache;

  assert.equal(state.battleHeroStatsCache?.data?.['16']?.hp, 92217);
  assert.deepEqual(state.battleEnvelopeTemplate?.data?.battleFeatures, ['battleFeature_202']);
  assert.equal(state.clanTrainingsCache?.data?.challenges?.length, 1);

  // Subsequent battle accumulates hero #54 without erasing hero #16
  state = rpcCacheService.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T13:17:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'customArena_startBattle', args: { type: 'NormalArena', userId: '999', units: [54] }, ident: 's2' }],
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 's2',
        result: {
          response: {
            battles: [{
              type: 'arena',
              seed: 222,
              attackers: { '54': { id: 54, level: 90, hp: 85000, power: 37000 } },
              defenders: [{}],
            }],
          },
        },
      }],
    }),
  }]).cache;

  assert.equal(state.battleHeroStatsCache?.data?.['16']?.hp, 92217, 'Must preserve previously hydrated hero #16');
  assert.equal(state.battleHeroStatsCache?.data?.['54']?.hp, 85000, 'Must accumulate newly hydrated hero #54');
});

test('Custom Hero Pool mode uses first 5 picked heroes as Seed and tests 100% of picked pool regardless of low power', async () => {
  // Include very weak heroes #9 (60k) and #10 (25k) that auto-power mode would prune!
  const customPicks = [1, 2, 3, 4, 5, 9, 10];
  const pruned = pruneHeroPool(MOCK_HEROES, [], {
    poolMode: 'custom-pool',
    customPoolHeroIds: customPicks,
    topN: 5,
    minPowerPctOfMax: 90,
  });
  assert.deepEqual(pruned.map((h) => h.id), customPicks, 'Custom pool must keep 100% of picked heroes in exact pick order');

  const session = await runPvpOptimizationSession({
    rawHeroes: MOCK_HEROES,
    seedHeroIds: [], // auto-derived from first 5 of customPoolHeroIds
    simulateFn: async (battle) => {
      const atkHas10 = '10' in battle.attackers;
      return { win: atkHas10, stars: 3, duration: 20 };
    },
    searchMode: 'one-swap',
    filterOptions: {
      poolMode: 'custom-pool',
      customPoolHeroIds: customPicks,
      minTeamPowerPctOfSeed: 99, // must be bypassed in custom-pool mode
    },
    matchOptions: { rounds: 4, symmetric: true, earlyExit: false },
    maxMatchups: 3, // smaller than Gen-1 count (10) -> must auto-expand to cover 100% of pool
  });

  assert.equal(session.poolMode, 'custom-pool');
  assert.deepEqual(session.seedHeroIds, [1, 2, 3, 4, 5]);
  assert.equal(session.poolCoveragePct, 100, 'Every picked hero in custom pool must be tested');
  assert.ok(session.testedHeroIds?.includes(9), 'Weak picked hero #9 must be tested');
  assert.ok(session.testedHeroIds?.includes(10), 'Weak picked hero #10 must be tested');
  assert.ok(session.totalMatchups >= 10, 'All 5x2=10 Gen-1 custom-pool matchups must run');

  const modalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'dialogs', 'PvpTeamOptimizerModal.vue'), 'utf8');
  assert.match(modalSrc, /id="pvp-pool-mode-toggle"/);
  assert.match(modalSrc, /id="pvp-custom-pool-picker"/);
});
