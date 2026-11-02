import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Load rpcCache and popupData scripts
import '../extension/refillable-rules.js';
import '../extension/mission-costs.js';
import '../extension/march-rules.js';
import '../extension/rpc-cache.js';
import '../extension/popup-data.js';

const rpcCache = globalThis.hwaHelperRpcCache;
const popupData = globalThis.hwaHelperPopupData;

// Load sample records from the draft trace log
let rawLog;
try {
  rawLog = JSON.parse(readFileSync(new URL('../temp/hwa-api-202611012327_legend_draft.json', import.meta.url), 'utf8'));
} catch (_) {
  rawLog = JSON.parse(readFileSync(new URL('./fixtures/legend-draft-trace.json', import.meta.url), 'utf8'));
}

test('legend draft stage descriptions and countdown helpers work as expected', () => {
  assert.equal(popupData.draftStageDescription(0), 'Not in match');
  assert.equal(popupData.draftStageDescription(1), 'Matching...');
  assert.equal(popupData.draftStageDescription(2), 'Defense Draft');
  assert.equal(popupData.draftStageDescription(4), 'Attack Draft');
  assert.equal(popupData.draftStageDescription(5), 'Ready for Battle');

  assert.equal(popupData.isDraftActive(0), false);
  assert.equal(popupData.isDraftActive(1), true);
  assert.equal(popupData.isDraftActive(2), true);
  assert.equal(popupData.isDraftActive(4), true);
  assert.equal(popupData.isDraftActive(5), false);

  const futureTs = 1000 + 95; // 95s in future
  assert.equal(popupData.formatCountdown(futureTs, 1000), '01:35');
  assert.equal(popupData.formatCountdown(1000, 1000), '00:00');
  assert.equal(popupData.formatCountdown(900, 1000), '00:00');
  assert.equal(popupData.formatCountdown(null), '—');
});

test('rpc-cache extracts legendDraftStatus from randomDraft_getInfo', () => {
  // Record 7: match found, stage 2 (defense drafting)
  const entries7 = rpcCache.extract(rawLog[7]);
  const draftStatus7 = entries7.find((e) => e.key === 'legendDraftStatus');
  assert.ok(draftStatus7, 'legendDraftStatus should be extracted from record 7');
  assert.equal(draftStatus7.data.active, true);
  assert.equal(draftStatus7.data.stageId, 2);
  assert.equal(draftStatus7.data.matchId, 358200026);
  assert.equal(draftStatus7.data.stageFinishTs, 1793550458);
  assert.equal(draftStatus7.data.enemyUser.name, 'Ieon1973');
  assert.equal(draftStatus7.data.enemyUser.level, 72);
});

test('rpc-cache extracts and merges defense pick (randomDraft_saveDefence)', () => {
  // Record 8: randomDraft_saveDefence with heroes [24, 12, 47, 68, 51]
  const entries8 = rpcCache.extract(rawLog[8]);
  const actionEntry = entries8.find((e) => e.key === 'legendDraftAction');
  assert.ok(actionEntry, 'legendDraftAction should be extracted');
  assert.equal(actionEntry.data.action, 'saveDefence');
  assert.deepEqual(actionEntry.data.heroes, [24, 12, 47, 68, 51]);

  // Merge record 7 then record 8
  let cache = {};
  cache = rpcCache.merge(cache, [rawLog[7]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 2);
  assert.equal(cache.legendDraftStatus.data.defenceHeroes.length, 0);

  cache = rpcCache.merge(cache, [rawLog[8]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 4); // Advances to attack draft
  assert.deepEqual(cache.legendDraftStatus.data.defenceHeroes, [24, 12, 47, 68, 51]);
});

test('rpc-cache extracts and merges attack pick (randomDraft_saveAttack)', () => {
  // Record 10: randomDraft_saveAttack with heroes [51, 55, 16, 502, 503]
  const entries10 = rpcCache.extract(rawLog[10]);
  const actionEntry = entries10.find((e) => e.key === 'legendDraftAction');
  assert.ok(actionEntry);
  assert.equal(actionEntry.data.action, 'saveAttack');
  assert.deepEqual(actionEntry.data.heroes, [51, 55, 16, 502, 503]);

  let cache = rpcCache.merge({}, [rawLog[7], rawLog[8], rawLog[10]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 5); // Ready for battle
  assert.deepEqual(cache.legendDraftStatus.data.attackHeroes, [51, 55, 16, 502, 503]);
});

test('full draft flow from queue to battle result updates cache coherently', () => {
  let cache = {};

  // Step 1: Idle (record 4)
  cache = rpcCache.merge(cache, [rawLog[4]]).cache;
  assert.equal(cache.legendDraftStatus.data.active, false);
  assert.equal(cache.legendDraftStatus.data.stageId, 0);

  // Step 2: Queue registered (record 5)
  cache = rpcCache.merge(cache, [rawLog[5]]).cache;
  assert.equal(cache.legendDraftStatus.data.active, true);
  assert.equal(cache.legendDraftStatus.data.stageId, 1);

  // Step 3: Match found, defense stage (record 7)
  cache = rpcCache.merge(cache, [rawLog[7]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 2);
  assert.equal(cache.legendDraftStatus.data.matchId, 358200026);

  // Step 4: Defense locked in-game (record 8)
  cache = rpcCache.merge(cache, [rawLog[8]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 4);
  assert.deepEqual(cache.legendDraftStatus.data.defenceHeroes, [24, 12, 47, 68, 51]);

  // Step 5: Attack locked in-game (record 10)
  cache = rpcCache.merge(cache, [rawLog[10]]).cache;
  assert.equal(cache.legendDraftStatus.data.stageId, 5);
  assert.deepEqual(cache.legendDraftStatus.data.attackHeroes, [51, 55, 16, 502, 503]);

  // Step 6: Battle started (record 11)
  cache = rpcCache.merge(cache, [rawLog[11]]).cache;
  assert.equal(cache.legendDraftStatus.data.inBattle, true);
  assert.ok(cache.legendDraftStatus.data.enemyDefenceHeroes?.length > 0);

  // Step 7: Match result (record 27)
  cache = rpcCache.merge(cache, [rawLog[27]]).cache;
  assert.equal(cache.legendDraftStatus.data.active, false);
  assert.equal(cache.legendDraftStatus.data.stageId, 0);
  assert.equal(cache.legendDraftStatus.data.inBattle, false);
  assert.equal(cache.legendDraftStatus.data.lastResult.result, 0); // 0 = Win
  assert.equal(cache.legendDraftStatus.data.lastResult.reward.draftBpExp, 100);
});

test('legend draft 5-step picking process and validation work correctly', () => {
  const defaultCandidates = popupData.defaultDraftCandidates();
  assert.equal(defaultCandidates.length, 5, 'Must have 5 steps of draft candidates');
  defaultCandidates.forEach((round, idx) => {
    assert.equal(round.length, 3, `Round ${idx + 1} must present exactly 3 hero choices`);
  });

  // Empty picks
  const empty = [null, null, null, null, null];
  assert.deepEqual(popupData.validateDraftPicks(empty), {
    valid: false,
    count: 0,
    missingSteps: [1, 2, 3, 4, 5],
    heroes: []
  });
  assert.equal(popupData.getDraftActiveStep(empty), 0);

  // Partial picks (picked step 1 and step 2)
  const partial = [24, 12, null, null, null];
  assert.deepEqual(popupData.validateDraftPicks(partial), {
    valid: false,
    count: 2,
    missingSteps: [3, 4, 5],
    heroes: [24, 12]
  });
  assert.equal(popupData.getDraftActiveStep(partial), 2);

  // 4 out of 5 picks (cannot lock yet)
  const almostDone = [24, 12, 47, 68, null];
  const almostRes = popupData.validateDraftPicks(almostDone);
  assert.equal(almostRes.valid, false);
  assert.equal(almostRes.count, 4);
  assert.deepEqual(almostRes.missingSteps, [5]);
  assert.equal(popupData.getDraftActiveStep(almostDone), 4);

  // Complete 5-hero squad (valid to lock/submit)
  const complete = [24, 12, 47, 68, 51];
  const completeRes = popupData.validateDraftPicks(complete);
  assert.equal(completeRes.valid, true);
  assert.equal(completeRes.count, 5);
  assert.deepEqual(completeRes.missingSteps, []);
  assert.deepEqual(completeRes.heroes, [24, 12, 47, 68, 51]);
  assert.equal(popupData.getDraftActiveStep(complete), 4);
});

test('rpc-cache resets defense and attack picks when a new match begins so defense is not falsely locked', () => {
  const previousMatchState = {
    legendDraftStatus: {
      data: {
        active: false,
        stageId: 7,
        matchId: 111111111,
        defenceHeroes: [24, 12, 47, 68, 51],
        attackHeroes: [51, 55, 16, 502, 503],
        lastResult: { result: 0 }
      },
      updatedAt: '2026-11-01T10:00:00.000Z'
    }
  };

  const newMatchRecord = {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_getInfo', ident: 'info' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'info', result: { response: {
      matchId: 222222222,
      stageId: 2,
      stageFinishTs: 1793550458,
      enemyUser: { id: '999', name: 'Opponent', level: 80 }
    } } }] }),
    timestamp: '2026-11-01T10:05:00.000Z'
  };

  const merged = rpcCache.merge(previousMatchState, [newMatchRecord]).cache;
  assert.equal(merged.legendDraftStatus.data.matchId, 222222222);
  assert.equal(merged.legendDraftStatus.data.stageId, 2);
  assert.deepEqual(merged.legendDraftStatus.data.defenceHeroes, [], 'New match must have empty defenceHeroes');
  assert.deepEqual(merged.legendDraftStatus.data.attackHeroes, [], 'New match must have empty attackHeroes');
  assert.equal(merged.legendDraftStatus.data.lastResult, null, 'New match must clear previous lastResult');
});

test('rpc-cache resets old draft cache when starting queue or defense draft without matchId change', () => {
  const previousMatchEndedState = {
    legendDraftStatus: {
      data: {
        active: false,
        stageId: 0,
        matchId: 111111111,
        defenceHeroes: [24, 12, 47, 68, 51],
        attackHeroes: [51, 55, 16, 502, 503],
        enemyDefenceHeroes: [1, 2, 3, 4, 5],
        enemyAttackHeroes: [6, 7, 8, 9, 10],
        lastResult: { result: 0, reward: { draftBpExp: 100 } },
        lastPickAction: 'saveAttack'
      },
      updatedAt: '2026-11-01T10:00:00.000Z'
    }
  };

  const queueRecord = {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_getInfo', ident: 'info' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'info', result: { response: {
      stageId: 1
    } } }] }),
    timestamp: '2026-11-01T10:05:00.000Z'
  };

  const queueMerged = rpcCache.merge(previousMatchEndedState, [queueRecord]).cache;
  assert.equal(queueMerged.legendDraftStatus.data.stageId, 1);
  assert.equal(queueMerged.legendDraftStatus.data.lastResult, null, 'Queue must clear old lastResult');
  assert.deepEqual(queueMerged.legendDraftStatus.data.defenceHeroes, [], 'Queue must clear defenceHeroes');
  assert.deepEqual(queueMerged.legendDraftStatus.data.attackHeroes, [], 'Queue must clear attackHeroes');
  assert.equal(queueMerged.legendDraftStatus.data.lastPickAction, null, 'Queue must clear lastPickAction');

  const defenseStartRecord = {
    method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ name: 'randomDraft_getInfo', ident: 'info' }] }),
    responseBody: JSON.stringify({ results: [{ ident: 'info', result: { response: {
      stageId: 2,
      matchId: 333333333,
      stageFinishTs: 1793550458
    } } }] }),
    timestamp: '2026-11-01T10:06:00.000Z'
  };

  const defenseMerged = rpcCache.merge(queueMerged, [defenseStartRecord]).cache;
  assert.equal(defenseMerged.legendDraftStatus.data.stageId, 2);
  assert.deepEqual(defenseMerged.legendDraftStatus.data.defenceHeroes, []);
  assert.deepEqual(defenseMerged.legendDraftStatus.data.attackHeroes, []);
  assert.equal(defenseMerged.legendDraftStatus.data.lastResult, null);
});
