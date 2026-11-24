import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  extractArenaOverview,
  isEnemyWithinPowerRatio,
  buildArenaEndBattleArgs,
  runArenaMonteCarloSim,
} from '../src/services/arenaService.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

const root = resolve(process.cwd());

test('ArenaModal is wired into useModals, ActivityGoals, and App.vue', async () => {
  const modalsSrc = await readFile(resolve(root, 'src/composables/useModals.ts'), 'utf8');
  assert.ok(modalsSrc.includes("'arena'"), 'useModals must include arena in ModalName');
  assert.ok(modalsSrc.includes('arena: false'), 'modalState must initialize arena as false');

  const activitySrc = await readFile(resolve(root, 'src/components/dashboard/ActivityGoals.vue'), 'utf8');
  assert.ok(activitySrc.includes("id: 'arena'") && activitySrc.includes("openModal('arena')"), 'ActivityGoals must open arena modal on click');

  const appSrc = await readFile(resolve(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.ok(appSrc.includes('ArenaModal') && appSrc.includes('modalState.arena'), 'App.vue must mount ArenaModal');

  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/ArenaModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('id="btn-arena-auto-start"'), 'ArenaModal must have #btn-arena-auto-start');
  assert.ok(modalSrc.includes('id="arena-max-power-ratio"'), 'ArenaModal must have #arena-max-power-ratio');
  assert.ok(modalSrc.includes('id="arena-sim-rounds"'), 'ArenaModal must have #arena-sim-rounds');
  assert.ok(modalSrc.includes('id="arena-min-win-rate"'), 'ArenaModal must have #arena-min-win-rate');
});

test('isEnemyWithinPowerRatio enforces player power ratio threshold', () => {
  assert.equal(isEnemyWithinPowerRatio(150000, 172882, 90), true);
  assert.equal(isEnemyWithinPowerRatio(160000, 172882, 90), false);
  assert.equal(isEnemyWithinPowerRatio(155593, 172882, 90), true);
});

test('buildArenaEndBattleArgs builds exact customArena_endBattle payload', () => {
  const progress = {
    defenders: { heroes: {}, input: [] },
    attackers: { heroes: { '16': { isDead: false, hp: 161577, energy: 1000 } }, input: [] },
    duration: 19.94,
    seed: 1153971605,
  };
  const args = buildArenaEndBattleArgs({ win: true, stars: 3, progress }, 'NormalArena');
  assert.deepEqual(args, {
    type: 'NormalArena',
    result: [{ win: true, stars: 3 }],
    progress: [[progress]],
    auto: true,
  });
});

test('runArenaMonteCarloSim executes 10 rounds with canonical seed first and computes win rate', async () => {
  const seenSeeds = [];
  let callIndex = 0;
  const result = await runArenaMonteCarloSim(
    { seed: 1153971605, type: 'arena' },
    async (_battle, seed) => {
      seenSeeds.push(seed);
      const win = callIndex++ < 9; // 9/10 wins = 90%
      return { win, stars: win ? 3 : 0, duration: 20, progress: { seed } };
    },
    10
  );
  assert.equal(result.total, 10);
  assert.equal(result.wins, 9);
  assert.equal(result.losses, 1);
  assert.equal(result.winRatePct, 90);
  assert.equal(seenSeeds[0], 1153971605, 'Round 0 must use the exact server seed');
  assert.equal(result.canonicalOutcome?.win, true);
});

test('rpcCache extracts arenaFindEnemies, League_getInfo, and deducts free battle on customArena_endBattle', () => {
  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  let state = rpcCacheService.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T07:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [
        { name: 'userGetInfo', args: {}, ident: 'u1' },
        { name: 'arenaFindEnemies', args: {}, ident: 'e1' },
        { name: 'League_getInfo', args: { type: 'ratingArena' }, ident: 'l1' },
      ],
    }),
    responseBody: JSON.stringify({
      results: [
        { ident: 'u1', result: { response: { id: 1, refillable: [{ id: 6, amount: 5, lastRefill: 1795413600 }] } } },
        { ident: 'e1', result: { response: { type: 'RatingArena', enemies: [{ userId: '603563468', power: 140000, rating: 7000, user: { name: 'Rival', level: 100 }, heroes: [{ id: 2, level: 100, power: 28000 }] }] } } },
        { ident: 'l1', result: { response: { league: 1056, rewards: [] } } },
      ],
    }),
  }]).cache;

  const before = extractArenaOverview(state);
  assert.equal(before.freeBattlesLeft, 5);
  assert.equal(before.leagueId, 1056);
  assert.equal(before.enemies.length, 1);
  assert.equal(before.enemies[0].userId, '603563468');

  state = rpcCacheService.merge(state, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T07:01:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'customArena_endBattle', args: { type: 'NormalArena' }, ident: 'end1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'end1',
        result: {
          response: {
            replayId: 'rep-1',
            valid: true,
            state: { arenaType: 'NormalArena', place: 12046, bestPlace: 12046, numBattles: 267, numWins: 260, power: 172882, defenders: [] },
            enemies: [],
          },
        },
      }],
    }),
  }]).cache;

  const after = extractArenaOverview(state);
  assert.equal(after.freeBattlesLeft, 4, 'Free Arena battles should decrement after customArena_endBattle');
  assert.equal(after.place, 12046);
  assert.equal(after.numWins, 260);
});
