import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateDraftLineup,
  mapTeamToRoundPicks,
  buildDraftGetInfoCall,
  buildDraftRegisterCall,
  buildDraftSaveLineupCall,
  buildDraftStartBattleCall,
  buildDraftResultCall,
  parseDraftMatchOutcome,
  getDraftChipsCount,
  canStartDraftMatch,
  buildSyntheticDraftBattle,
} from '../src/services/draftPlayService.ts';
import { handleDraftMessage, flushDraftMessageQueue } from '../src/background/handlers/draftHandler.ts';

const SAMPLE_STEPS = [
  [11, 2, 6],
  [75, 54, 25],
  [71, 77, 18],
  [66, 67, 36],
  [16, 1, 78],
];

test('validateDraftLineup accepts valid 5-round lineup and rejects incomplete, duplicate, or out-of-pool heroes', () => {
  const ok = validateDraftLineup([11, 54, 77, 36, 78], SAMPLE_STEPS);
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.normalizedHeroes, [11, 54, 77, 36, 78]);

  const missing = validateDraftLineup([11, null, 77, 36, 78], SAMPLE_STEPS);
  assert.equal(missing.valid, false);
  assert.match(missing.error || '', /Round 2/i);

  const dup = validateDraftLineup([11, 11, 77, 36, 78], SAMPLE_STEPS);
  assert.equal(dup.valid, false);
  assert.match(dup.error || '', /Duplicate/i);

  const invalidPool = validateDraftLineup([11, 54, 99, 36, 78], SAMPLE_STEPS);
  assert.equal(invalidPool.valid, false);
  assert.match(invalidPool.error || '', /Round 3/i);

  // Swap hero fallback accepted
  const withSwap = validateDraftLineup([11, 54, 99, 36, 78], SAMPLE_STEPS, [99]);
  assert.equal(withSwap.valid, true);
});

test('mapTeamToRoundPicks aligns arbitrary-ordered recommended team to exact Round 1..5 columns', () => {
  const shuffled = [78, 36, 11, 77, 54];
  const mapped = mapTeamToRoundPicks(shuffled, SAMPLE_STEPS);
  assert.deepEqual(mapped, [11, 54, 77, 36, 78]);
  assert.equal(validateDraftLineup(mapped, SAMPLE_STEPS).valid, true);
});

test('draftPlayService RPC builders & parseDraftMatchOutcome match verified 6-RPC contract', () => {
  assert.deepEqual(buildDraftGetInfoCall(), { name: 'randomDraft_getInfo', args: {} });
  assert.deepEqual(buildDraftRegisterCall(), { name: 'randomDraft_register', args: {} });
  assert.deepEqual(buildDraftSaveLineupCall('defense', [11, 54, 77, 36, 78]), {
    name: 'randomDraft_saveDefence',
    args: { heroes: [11, 54, 77, 36, 78] },
  });
  assert.deepEqual(buildDraftSaveLineupCall('attack', [55, 10, 29, 72, 57]), {
    name: 'randomDraft_saveAttack',
    args: { heroes: [55, 10, 29, 72, 57] },
  });
  assert.deepEqual(buildDraftStartBattleCall(), { name: 'randomDraft_startBattle', args: {} });
  assert.deepEqual(buildDraftResultCall(360295686), {
    name: 'randomDraft_result',
    args: { matchId: 360295686 },
  });

  const outcome = parseDraftMatchOutcome({
    matchId: 360295686,
    result: 0,
    resultDetails: 2,
    reward: { draftBpExp: 100 },
    rating: { userRating: 1650, enemyRating: 1730, userDifRating: 50 },
  });
  assert.deepEqual(outcome, {
    matchId: 360295686,
    win: true,
    result: 0,
    resultDetails: 2,
    userRating: 1650,
    enemyRating: 1730,
    ratingDelta: 50,
    draftBpExp: 100,
  });

  assert.equal(getDraftChipsCount({ 'resource:refillable:60': { data: { amount: 4 } } }), 4);
  assert.equal(canStartDraftMatch(0, 4), true);
  assert.equal(canStartDraftMatch(0, 0), false);
  assert.equal(canStartDraftMatch(2, 4), false);
});

test('interceptor allowlists exactly the 6 verified randomDraft RPCs with strict args and zero Emerald spend', () => {
  const src = fs.readFileSync('src/content/interceptor.ts', 'utf8');
  assert.match(src, /'randomDraft_getInfo'/);
  assert.match(src, /'randomDraft_register'/);
  assert.match(src, /'randomDraft_startBattle'/);
  assert.match(src, /call\?\.name === 'randomDraft_saveDefence' \|\| call\?\.name === 'randomDraft_saveAttack'/);
  assert.match(src, /call\?\.name === 'randomDraft_result'/);
  assert.doesNotMatch(src, /randomDraft_restoreWinstreak/i);
});

test('LegendsDraftModal exposes headless play toolbar, 1-click pick team (local only), explicit confirm submit, and result card', () => {
  const src = fs.readFileSync('src/components/dialogs/LegendsDraftModal.vue', 'utf8');
  for (const selector of [
    'id="draft-action-toolbar"',
    'id="draft-start-match-btn"',
    'id="draft-refresh-btn"',
    'id="draft-auto-finish-toggle"',
    'id="draft-start-battle-btn"',
    'id="draft-match-result-card"',
    'id="draft-submit-bar"',
    'id="draft-quick-pick-top1-btn"',
    'id="draft-clear-picks-btn"',
    'id="draft-submit-lineup-btn"',
    '`draft-apply-rec-${tIdx}`',
    'Confirm & Submit Attack',
    'Confirm & Submit Defense',
  ]) {
    assert.ok(src.includes(selector), `LegendsDraftModal.vue should include ${selector}`);
  }

  // Ensure 1-click applyRecommendedTeam never auto-dispatches RPC
  const fnMatch = src.match(/function applyRecommendedTeam\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'applyRecommendedTeam should exist');
  assert.doesNotMatch(fnMatch[0], /dispatchRpc|confirmAndSubmitLineup/, '1-click pick team must NOT auto-submit RPC');

  // P2-36: Picked team simulation button, result badge, buildSyntheticDraftBattle, and waiting locked state
  for (const selector of [
    'id="draft-sim-picked-btn"',
    'id="draft-sim-picked-result"',
    'id="draft-pool-locked-badge"',
    'buildSyntheticDraftBattle(',
    'isWaitingLocked',
  ]) {
    assert.ok(src.includes(selector), `LegendsDraftModal.vue should include ${selector}`);
  }
});

test('P2-36: buildSyntheticDraftBattle standardizes Legends Draft max stats (Lv120, max skills, min 3★) and isolates mirror heroes', () => {
  const attackers = [
    { id: 54, star: 2, power: 175000 }, // star < 3 -> must clamp to 3
    { id: 55, star: 6, power: 192000 }, // star > 3 -> keep 6
  ];
  const defenders = [
    { id: 54, star: 5, power: 185000 }, // mirror hero ID 54 with different star/power
    { id: 19, star: 3, power: 172992 },
  ];
  const playerHeroCache = {
    '54': { id: 54, skills: { '301': 80, '302': 75, '303': 60, '304': 50 }, skins: { '54': 20, '210': 10 }, baseSkinId: 54 },
  };
  const payload = buildSyntheticDraftBattle(attackers, defenders, 12345, { playerHeroCache, matchId: 365784110 });

  assert.equal(payload.type, 'drafts');
  assert.equal(payload.attackers['54'].level, 120);
  assert.equal(payload.attackers['54'].color, 16);
  assert.equal(payload.attackers['54'].star, 3, 'Star below 3 must default to 3');
  assert.equal(payload.defenders[0]['54'].star, 5, 'Mirror hero on defender side must not overwrite attacker star');
  assert.equal(payload.attackers['55'].star, 6, 'Player star > 3 must be preserved');
  assert.deepEqual(payload.attackers['54'].skills, { '301': 120, '302': 120, '303': 120, '304': 120 });
  assert.deepEqual(payload.attackers['54'].hero_runes, [40, 40, 40, 40, 40]);
  assert.equal(payload.attackers['54'].titanGiftLevel, 30);
  assert.equal(payload.attackers['54'].artifacts.length, 3);
  assert.equal(Array.isArray(payload.attackers['54'].skinsInfo), false, 'skinsInfo must be an object, not an array');
});

test('P2-36: draftHandler preserves 5-column heroSteps when stageId=3 returns reduced 5-hero payload', async () => {
  const storageState = {};
  const mockChrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb({ ...storageState }),
        set: (patch, cb) => {
          Object.assign(storageState, patch);
          cb?.();
        },
      },
    },
    runtime: { sendMessage: () => Promise.resolve() },
  };

  // Stage 2: full 15-hero 5x3 pool
  const fullPool = {};
  for (const id of [4, 6, 20, 22, 28, 31, 34, 53, 54, 56, 60, 61, 77, 502, 503]) {
    fullPool[String(id)] = { id, level: 120, color: 16, star: 4, power: 180000 };
  }
  handleDraftMessage(
    { kind: 'draft-decrypted', data: { matchId: 365784110, stageId: 2, draft: { base: fullPool, swap: null } } },
    mockChrome
  );
  await flushDraftMessageQueue();
  assert.equal(storageState.legendsDraftSession.heroSteps.length, 5);

  // Stage 3: server sends reduced 5-hero submitted defense payload
  const submittedPool = {};
  for (const id of [31, 54, 56, 60, 502]) {
    submittedPool[String(id)] = { id, level: 120, color: 16, star: 4, power: 180000 };
  }
  handleDraftMessage(
    { kind: 'draft-decrypted', data: { matchId: 365784110, stageId: 3, draft: { base: submittedPool, swap: null } } },
    mockChrome
  );
  await flushDraftMessageQueue();

  assert.equal(storageState.legendsDraftSession.heroSteps.length, 5, 'Must keep all 5 Round columns intact at stageId=3');
  assert.deepEqual(storageState.legendsDraftSession.chosenDefenceHeroes, [31, 54, 56, 60, 502]);
});
