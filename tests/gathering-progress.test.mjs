import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { gatheringProgress } from '../src/utils/gatheringProgress.ts';
import { formatMarchTooltip } from '../src/utils/marchTooltip.ts';
import { dashboardMarches } from '../src/utils/dashboardState.ts';

const context = { TextEncoder };
import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
const start = 1794407868742, duration = 34829722, total = 375000;
function rpc(name, feature, response, at = start + 1000) {
  return { method: 'POST', endpoint: 'https://api.hero-wars-alliance.com/api/rpc', status: 200,
    timestamp: new Date(at).toISOString(), requestBody: JSON.stringify({ calls: [{ name, feature, ident: name }] }),
    responseBody: JSON.stringify({ results: [{ ident: name, result: { response } }] }) };
}
const summary = rpc('getMineSummary', 'mine', { gatherings: [{ mineId: 'private-mine-id', squadId: 'private-squad-id',
  startedAt: start, plannedDurationMs: duration, plannedDuration: duration, plannedGatheredResourceAmount: total }] });
const march = { kind: 'wood', mineConfigId: 56, mineId: 'private-mine-id', squadId: 'private-squad-id', stage: 'interactionWithTarget' };

test('captured getMineSummary milliseconds and planned total produce bounded linear estimates and named resource', () => {
  const cache = reducer.merge({}, [summary]).cache;
  for (const [fraction, expected] of [[-1, 0], [0, 0], [0.5, 187500], [1, total], [2, total]]) {
    const progress = gatheringProgress(march, start + duration * fraction, cache);
    assert.equal(progress.collected, expected);
    assert.equal(progress.resource, 'Wood');
    assert.ok(progress.progress >= 0 && progress.progress <= 100);
  }
  const tooltip = formatMarchTooltip(march, start + duration / 2, cache);
  assert.match(tooltip, /Wood Mine/); assert.match(tooltip, /50%/);
  assert.match(tooltip, /187,500/); assert.doesNotMatch(tooltip, /private-mine-id|private-squad-id/);
  const rows = dashboardMarches({ ...cache, marchStatus: { data: { marches: [march] } } }, start + duration / 2);
  assert.match(rows[0].target, /Wood/); assert.equal(rows[0].gathering.collected, 187500);
});

test('recall freezes collection at server return-start time even after active summary clears', () => {
  const snapshot = rpc('getMarches', 'march', { marches: { interactionWithTarget: [{ squadId: march.squadId,
    targetType: 'mine', targetId: march.mineId, target: { objectId: march.mineId, objectConfigId: 56 }, startedAt: start, durationMs: duration }] } });
  let state = reducer.merge({}, [summary, snapshot]).cache;
  const stoppedAt = start + duration / 4;
  const recall = rpc('stopMineGathering', 'mine', { squadId: march.squadId, remainingResourceAmount: 10000,
    route: { startedAt: stoppedAt, durationMs: 60000 } }, stoppedAt + 1);
  state = reducer.merge(state, [recall, rpc('getMineSummary', 'mine', { gatherings: [] }, stoppedAt + 2)]).cache;
  const returning = state.marchStatus.data.marches[0];
  const progress = gatheringProgress(returning, stoppedAt + 30000, state);
  assert.equal(progress.phase, 'Returning'); assert.equal(progress.collected, 93750);
  assert.equal(progress.progress, 25); assert.equal(progress.remainingSeconds, 30);
  assert.equal(gatheringProgress(returning, stoppedAt + 50000, state).collected, 93750);
});

test('travel has zero collected and incomplete timings never fabricate a quantity or completion', () => {
  assert.equal(gatheringProgress({ ...march, stage: 'moveToTargetInSolo', targetArrivalAt: start + 10000 }, start).collected, 0);
  assert.equal(gatheringProgress(march, start).collected, null);
  assert.equal(gatheringProgress({ ...march, gatheringStartedAt: start, gatheringDurationMs: 0, gatheringTotalAmount: 100 }, start).progress, null);
  const state = reducer.merge({}, [summary]).cache;
  assert.equal(gatheringProgress({ ...march, mineId: 'different-mine' }, start + duration / 2, state).total, null);
});
