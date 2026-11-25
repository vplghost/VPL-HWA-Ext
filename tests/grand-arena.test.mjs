import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  normalizeGrandArenaEnemy,
  extractGrandArenaOverview,
  computeBo3WinProbability,
  findBestGrandArenaPermutation,
  buildGrandArenaEndBattleArgs,
  extractDefendersFromStartBattles,
  pruneGrandArenaIntelCache,
  validateGrandArenaUnitsPayload,
  inspectServerGrandTeamIntegrity,
  GRAND_ARENA_INTEL_TTL_MS,
} from '../src/services/grandArenaService.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

const root = resolve(process.cwd());

test('GrandArenaModal is wired into useModals, ActivityGoals, and App.vue', async () => {
  const modalsSrc = await readFile(resolve(root, 'src/composables/useModals.ts'), 'utf8');
  assert.ok(modalsSrc.includes("'grandArena'"), 'useModals must include grandArena');
  assert.ok(modalsSrc.includes('grandArena: false'), 'modalState must initialize grandArena as false');

  const activitySrc = await readFile(resolve(root, 'src/components/dashboard/ActivityGoals.vue'), 'utf8');
  assert.ok(activitySrc.includes("openModal('grandArena')"), 'ActivityGoals must open grandArena modal on click');

  const appSrc = await readFile(resolve(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.ok(appSrc.includes('GrandArenaModal') && appSrc.includes('modalState.grandArena'), 'App.vue must mount GrandArenaModal');

  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/GrandArenaModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="btn-grand-arena-auto-start"'));
  assert.ok(modalSrc.includes('id="grand-arena-hidden-policy"'));
});

test('normalizeGrandArenaEnemy computes exact hiddenCount and hiddenTeamPower from live-shaped payloads', () => {
  // Exact numbers from PlayerXHeroWars (place 51): total 388061, T1 188622, T2 100559 -> hidden T3 ~98880
  const top51 = normalizeGrandArenaEnemy({
    userId: '1216398426',
    place: '51',
    power: '388061',
    user: { name: 'PlayerXHeroWars', level: '93', clanTitle: '4-LEAF CLOVER' },
    heroes: [
      [{ id: 64, level: 93, power: 188622 }],
      [{ id: 53, level: 90, power: 100559 }],
    ],
  });
  assert.ok(top51);
  assert.equal(top51.place, 51);
  assert.equal(top51.totalPower, 388061);
  assert.equal(top51.hiddenCount, 1);
  assert.equal(top51.hiddenTeamPower, 98880);

  // Top 20 (place 18): 1 visible team -> 2 hidden teams
  const top18 = normalizeGrandArenaEnemy({
    userId: '1216282274',
    place: '18',
    power: '658730',
    user: { name: 'Top20Rival', level: '120' },
    heroes: [[{ id: 1, level: 120, power: 250000 }]],
  });
  assert.ok(top18);
  assert.equal(top18.hiddenCount, 2);
  assert.equal(top18.hiddenTeamPower, 0);
});

test('computeBo3WinProbability and 3x3 full-intel permutation selection', () => {
  assert.ok(Math.abs(computeBo3WinProbability(1, 1, 0) - 1) < 1e-9);
  assert.ok(Math.abs(computeBo3WinProbability(0.5, 0.5, 0.5) - 0.5) < 1e-9);

  const enemy = normalizeGrandArenaEnemy({
    userId: '100',
    place: '120',
    power: '300000',
    heroes: [
      [{ id: 1, power: 100000 }],
      [{ id: 2, power: 100000 }],
      [{ id: 3, power: 100000 }],
    ],
  });
  const teams = [[11, 12, 13, 14, 15], [21, 22, 23, 24, 25], [31, 32, 33, 34, 35]];
  // Team 2 beats D0 (1.0), Team 0 beats D1 (1.0), Team 1 loses to D2 (0.0) -> order [2, 0, 1] wins 100% Bo3
  const matrix = [
    [0.1, 1.0, 0.2],
    [0.0, 0.1, 0.0],
    [1.0, 0.2, 0.1],
  ];
  const plan = findBestGrandArenaPermutation(teams, [150000, 100000, 180000], enemy, matrix, { minBo3WinRatePct: 80 });
  assert.equal(plan.strategy, 'full-3x3');
  assert.deepEqual(plan.order, [2, 0, 1]);
  assert.equal(plan.bo3WinRatePct, 100);
  assert.equal(plan.recommended, true);
});

test('Top 50 (1 hidden team): Visible-2 Lock picks strongest spare for hidden slot, and Hidden-Power Sacrifice handles strong D0 + weak hidden D2', () => {
  const teams = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]];
  const powers = [100000, 140000, 190000]; // T1 weakest, T2 mid, T3 strongest

  // Case A: Visible-2 Lock — all teams beat both visible teams -> must keep T3 (190k) on hidden slot!
  const easyVisEnemy = normalizeGrandArenaEnemy({
    userId: '200',
    place: '45',
    power: '350000',
    heroes: [[{ id: 10, power: 110000 }], [{ id: 20, power: 110000 }]],
  });
  const allWinMatrix = [
    [1.0, 1.0],
    [1.0, 1.0],
    [1.0, 1.0],
  ];
  const vis2Plan = findBestGrandArenaPermutation(teams, powers, easyVisEnemy, allWinMatrix, {
    minMatchWinRatePct: 80,
    minBo3WinRatePct: 80,
    hiddenPolicy: 'visible2-and-sacrifice',
  });
  assert.equal(vis2Plan.strategy, 'visible-2-lock');
  assert.equal(vis2Plan.recommended, true);
  assert.equal(vis2Plan.order[2], 2, 'Tie-breaker must place strongest spare team (T3) on hidden slot');

  // Case B: Hidden-Power Sacrifice (PlayerXHeroWars scenario: D0=188k unbeatable, D1=100k beatable, Hidden D2=99k weak)
  const playerX = normalizeGrandArenaEnemy({
    userId: '1216398426',
    place: '51',
    power: '388061',
    heroes: [[{ id: 64, power: 188622 }], [{ id: 53, power: 100559 }]],
  });
  const sacrificeMatrix = [
    [0.0, 0.2], // T1 (100k) loses both -> sacrifice into D0
    [0.0, 1.0], // T2 (140k) beats D1 (100k)
    [0.2, 1.0], // T3 (190k) crushes hidden D2 (99k = 52% <= 80%)
  ];
  const sacPlan = findBestGrandArenaPermutation(teams, powers, playerX, sacrificeMatrix, {
    minMatchWinRatePct: 80,
    hiddenPolicy: 'visible2-and-sacrifice',
    maxHiddenPowerRatioPct: 80,
  });
  assert.equal(sacPlan.strategy, 'hidden-power-sacrifice');
  assert.equal(sacPlan.recommended, true);
  assert.deepEqual(sacPlan.order, [0, 1, 2], 'Must sacrifice T1 into D0, beat D1 with T2, and crush hidden D2 with T3');

  // Strict Visible-2 Only policy must reject Case B
  const strictPlan = findBestGrandArenaPermutation(teams, powers, playerX, sacrificeMatrix, {
    minMatchWinRatePct: 80,
    hiddenPolicy: 'visible2-only',
  });
  assert.equal(strictPlan.recommended, false);
});

test('Top 20 (2 hidden teams) is skipped by default in Auto mode', () => {
  const top20 = normalizeGrandArenaEnemy({
    userId: '300',
    place: '18',
    power: '658730',
    heroes: [[{ id: 1, power: 220000 }]],
  });
  const plan = findBestGrandArenaPermutation(
    [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]],
    [150000, 160000, 200000],
    top20,
    [[1.0], [1.0], [1.0]],
    { skipTwoHidden: true }
  );
  assert.equal(plan.recommended, false);
  assert.equal(plan.strategy, 'manual-only');
});

test('buildGrandArenaEndBattleArgs, intel cache pruning, and rpcCache Grand Arena isolation', () => {
  const endArgs = buildGrandArenaEndBattleArgs([
    { win: false, stars: 0, progress: { seed: 1 } },
    { win: true, stars: 3, progress: { seed: 2 } },
    { win: true, stars: 3, progress: { seed: 3 } },
  ]);
  assert.deepEqual(endArgs, {
    type: 'GrandArena',
    result: [
      { win: false, stars: 0 },
      { win: true, stars: 3 },
      { win: true, stars: 3 },
    ],
    progress: [[{ seed: 1 }], [{ seed: 2 }], [{ seed: 3 }]],
  });

  const intel = extractDefendersFromStartBattles('1216398426', [
    { defenders: [{ 1: { id: 64, power: 40000 } }] },
    { defenders: [{ 1: { id: 53, power: 30000 } }] },
    { defenders: [{ 1: { id: 16, power: 25000 } }] },
  ], 10_000);
  assert.deepEqual(intel?.teams, [[64], [53], [16]]);
  const pruned = pruneGrandArenaIntelCache(
    { old: { userId: 'old', teams: [], teamPowers: [], updatedAt: 1000 }, fresh: intel },
    10_000 + GRAND_ARENA_INTEL_TTL_MS - 100
  );
  assert.ok(!pruned.old && pruned.fresh);

  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  let state = rpcCacheService.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T13:02:19.000Z',
    requestBody: JSON.stringify({
      calls: [
        { name: 'userGetInfo', args: {}, ident: 'u1' },
        { name: 'grandFindEnemies', args: {}, ident: 'g1' },
      ],
    }),
    responseBody: JSON.stringify({
      results: [
        { ident: 'u1', result: { response: { id: 1, refillable: [{ id: 21, amount: 5, lastRefill: 1795413600 }] } } },
        { ident: 'g1', result: { response: { useCustomArenaMode: true, enemies: [{ userId: '1216398426', place: '51', power: '388061', heroes: [[{ id: 64, power: 188622 }], [{ id: 53, power: 100559 }]] }] } } },
      ],
    }),
  }]).cache;

  assert.equal(extractGrandArenaOverview(state).freeBattlesLeft, 5);
  assert.equal(extractGrandArenaOverview(state).enemies.length, 1);

  // customArena_startBattle (GrandArena) deducts refillable:21 immediately
  state = rpcCacheService.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T13:02:44.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'customArena_startBattle', args: { type: 'GrandArena', userId: '1216398426' }, ident: 'gs1' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'gs1', result: { response: { paid: { refillable: { '20': 1, '21': 1 } }, battles: [] } } }] }),
  }]).cache;

  assert.equal(extractGrandArenaOverview(state).freeBattlesLeft, 4, 'Grand Arena startBattle must deduct refillable:21');

  // customArena_endBattle (GrandArena) updates grandArenaState & grandArenaEnemies without touching Normal Arena
  state = rpcCacheService.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T13:02:45.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'customArena_endBattle', args: { type: 'GrandArena' }, ident: 'ge1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'ge1',
        result: {
          response: {
            valid: true,
            replayId: 'rep-g1',
            state: { arenaType: 'GrandArena', place: 51, defenders: [[{ id: 7, power: 22331 }]] },
            enemies: {
              useCustomArenaMode: true,
              enemies: [{ userId: '1216266742', place: '40', power: '408937', heroes: [[{ id: 1, power: 150000 }], [{ id: 2, power: 130000 }]] }],
            },
          },
        },
      }],
    }),
  }]).cache;

  const after = extractGrandArenaOverview(state);
  assert.equal(after.place, 51);
  assert.equal(after.enemies[0]?.userId, '1216266742');
  assert.equal(after.freeBattlesLeft, 4, 'Grand Arena endBattle must NOT double-deduct refillable:21');
  assert.equal(state.arenaState, undefined, 'Grand Arena must not overwrite Normal Arena state');
});

test('validateGrandArenaUnitsPayload enforces strict 3x5 unique owned heroes and rejects 1D/corrupt shapes', async () => {
  const owned = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const valid3x5 = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
  ];
  const ok = validateGrandArenaUnitsPayload(valid3x5, owned);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.units, valid3x5);

  // Reject flat 1D array (the exact shape that corrupted teamGetAll.grand)
  assert.equal(validateGrandArenaUnitsPayload([1, 2, 3, 4, 5], owned).ok, false);
  // Reject wrong team count
  assert.equal(validateGrandArenaUnitsPayload([[1, 2, 3, 4, 5]], owned).ok, false);
  // Reject duplicate hero across teams
  assert.equal(validateGrandArenaUnitsPayload([[1, 2, 3, 4, 5], [5, 7, 8, 9, 10], [11, 12, 13, 14, 15]], owned).ok, false);
  // Reject unowned hero
  assert.equal(validateGrandArenaUnitsPayload([[1, 2, 3, 4, 999], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]], owned).ok, false);
  // Reject incomplete sub-team
  assert.equal(validateGrandArenaUnitsPayload([[1, 2, 3, 4], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]], owned).ok, false);

  // inspectServerGrandTeamIntegrity detects flat 1D and partial teamGetAll.grand
  assert.equal(inspectServerGrandTeamIntegrity({ grand: valid3x5 }, owned).valid, true);
  assert.equal(inspectServerGrandTeamIntegrity({ grand: [1, 2, 3, 4, 5] }, owned).valid, false);
  assert.equal(inspectServerGrandTeamIntegrity({ grand: [[1, 2, 3, 4, 5]] }, owned).valid, false);
  assert.equal(inspectServerGrandTeamIntegrity({ grand: 0 }, owned).valid, false);

  // Verify GrandArenaModal wires pre-dispatch validation and integrity warning banner
  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/GrandArenaModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('validateGrandArenaUnitsPayload('));
  assert.ok(modalSrc.includes('id="grand-arena-integrity-warning"'));
});
