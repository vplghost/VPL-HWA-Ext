import test from 'node:test';
import assert from 'node:assert/strict';
import { questRefreshCalls, questClaimCalls, sendQuestClaim, waitForCampaignRaidResult, towerSettingsForAccount } from '../src/utils/dialogRpc.ts';

test('quest requests preserve established refresh and multi-farm contracts', () => {
  assert.deepEqual(questClaimCalls(365), [
    { name: 'quest_multiFarm', args: { questIds: [365] } }, { name: 'questGetAll' },
  ]);
  assert.deepEqual(questRefreshCalls().map(call => call.name), ['getDailyQuests', 'getSpecialQuestState', 'questGetAll', 'questGetEvents']);
  assert.equal(questRefreshCalls().filter(call => call.name === 'questGetAll').length, 1);
});

test('quest claims use claim-rewards envelope and preserve queued or rejected results', async () => {
  const sent = [];
  const sender = async message => { sent.push(message); return { ok: true, queued: true }; };
  assert.deepEqual(await sendQuestClaim([365, 10019], sender), { ok: true, queued: true });
  assert.deepEqual(sent, [{ kind: 'claim-rewards', calls: [
    { name: 'quest_multiFarm', args: { questIds: [365, 10019] } }, { name: 'questGetAll' },
  ] }]);
  assert.deepEqual(await sendQuestClaim(365, async () => ({ ok: false, error: 'RPC disabled' })), { ok: false, error: 'RPC disabled' });
  assert.deepEqual(await sendQuestClaim(365, async () => { throw new Error('disconnected'); }), { ok: false, error: 'disconnected' });
  assert.equal((await sendQuestClaim(365, async () => undefined)).ok, false);
});

test('tower settings are isolated by known account identity', () => {
  const settings = { accountId: 7, heroes: [1, 2, 3, 4, 5], buffPriority: [9, 8] };
  assert.deepEqual(towerSettingsForAccount(settings, '7'), { heroes: [1, 2, 3, 4, 5], buffPriority: [9, 8] });
  assert.deepEqual(towerSettingsForAccount(settings, 8), {});
  assert.deepEqual(towerSettingsForAccount(settings, undefined), {});
  assert.deepEqual(towerSettingsForAccount(null, 7), {});
});

test('campaign result polling never succeeds with stale drops on timeout', async () => {
  let clock = 0;
  const result = await waitForCampaignRaidResult(() => ({ updatedAt: 'old', data: { drops: { gold: 10 } } }),
    'old', 120, () => clock, async ms => { clock += ms; });
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
  assert.equal(result.drops, undefined);
});

test('campaign result polling returns only fresh results and propagates rejection', async () => {
  assert.deepEqual(await waitForCampaignRaidResult(() => ({ updatedAt: 'new', data: { currentDrops: { gold: 20 } } }), 'old'),
    { ok: true, drops: { gold: 20 } });
  assert.deepEqual(await waitForCampaignRaidResult(() => ({ updatedAt: 'new', data: { failed: true, error: 'No energy' } }), 'old'),
    { ok: false, error: 'No energy' });
});
