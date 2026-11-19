import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTierDetail, resolveTierTarget } from '../src/utils/tierHelper.ts';
import { questData } from '../src/data/questData.ts';
import { getPendingClaims, buildAutoClaimCalls } from '../src/utils/popupData.ts';
import { eventQuestClaimCalls } from '../src/utils/dialogRpc.ts';

test('chained quest tier resolution evaluates partial and milestone targets for Brigand Camps', () => {
  const group = {
    localeKey: 'LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES',
    title: 'Clear Brigand Camp'
  };

  // Phase 1: Quest 362 (target 1) with 1 camp cleared -> ready
  const q362 = { id: 362, progress: 1, state: 'inProgress', completionCount: 0 };
  const res362 = resolveTierDetail(q362, group, 1);
  assert.equal(res362.target, 1);
  assert.equal(res362.state, 'ready');
  assert.equal(res362.percent, 100);
  assert.equal(res362.unit, 'camps');

  // Phase 2: Quest 363 (target 5) with 2 camps cleared -> inProgress (40%)
  const q363Partial = { id: 363, progress: 2, state: 'inProgress', completionCount: 0 };
  const res363Partial = resolveTierDetail(q363Partial, group, 2);
  assert.equal(res363Partial.target, 5);
  assert.equal(res363Partial.state, 'inProgress');
  assert.equal(res363Partial.percent, 40);

  // Phase 2: Quest 363 with 5 camps cleared -> ready (100%)
  const q363Ready = { id: 363, progress: 5, state: 'inProgress', completionCount: 0 };
  const res363Ready = resolveTierDetail(q363Ready, group, 2);
  assert.equal(res363Ready.target, 5);
  assert.equal(res363Ready.state, 'ready');
  assert.equal(res363Ready.percent, 100);

  // Phase 3: Quest 364 (target 10) with 5 camps cleared (transferred from phase 2) -> inProgress (50%)
  const q364Partial = { id: 364, progress: 5, state: 'inProgress', completionCount: 0 };
  const res364 = resolveTierDetail(q364Partial, group, 3);
  assert.equal(res364.target, 10);
  assert.equal(res364.state, 'inProgress');
  assert.equal(res364.percent, 50);

  // Already completed tier
  const qCompleted = { id: 362, progress: 1, state: 'completed', completionCount: 1 };
  const resCompleted = resolveTierDetail(qCompleted, group, 1);
  assert.equal(resCompleted.state, 'completed');
  assert.equal(resCompleted.percent, 100);
});

test('eventQuestClaimCalls dispatches completeQuest RPC with feature quest', () => {
  const calls = eventQuestClaimCalls(362);
  assert.ok(calls.some(c => c.name === 'completeQuest' && c.feature === 'quest' && c.args.questId === 362));
});

test('getPendingClaims and buildAutoClaimCalls recognize ready chained daily quests', () => {
  const now = 1794736960000;
  const cache = {
    'getDailyQuests:quest': {
      updatedAt: new Date(now).toISOString(),
      data: {
        quests: [
          { id: 362, progress: 1, state: 'inProgress' }, // Brigand Camp 1x -> ready
          { id: 365, progress: 0, state: 'inProgress' }, // Gathering 1x -> not ready
        ]
      }
    }
  };

  const pending = getPendingClaims(cache, now);
  assert.deepEqual(pending.dailyQuestIds, [362]);
  assert.equal(pending.totalCount, 1);

  const { calls: autoCalls } = buildAutoClaimCalls(cache, { quests: true }, now);
  const claimCall = autoCalls.find(c => c.name === 'completeQuest' && c.args?.questId === 362);
  assert.ok(claimCall, 'Must emit completeQuest for daily quest 362');
  assert.equal(claimCall.feature, 'quest');
});
