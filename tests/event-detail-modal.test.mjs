import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseRewards, formatRewardsSummary } from '../src/utils/rewardHelper.ts';
import { resolveTierDetail, resolveTierTarget, getGroupMeta } from '../src/utils/tierHelper.ts';

const root = resolve(import.meta.dirname, '..');

test('parseRewards correctly parses both object-shaped and array-shaped rewards', () => {
  // 1. Array-shaped reward
  const arrayReward = [
    { type: 'gold', amount: 50000, id: 0 },
    { type: 'starmoney', amount: 200 },
    { type: 'coin', id: 18, amount: 1500 },
    { type: 'consumable', id: 20, amount: 300 }
  ];
  const parsedArr = parseRewards(arrayReward);
  assert.equal(parsedArr.length, 4);
  assert.equal(parsedArr[0].label, 'Gold');
  assert.equal(parsedArr[0].amount, 50000);
  assert.equal(parsedArr[1].label, 'Emeralds');
  assert.equal(parsedArr[1].amount, 200);
  assert.equal(parsedArr[2].label, 'Fairy Dust');
  assert.equal(parsedArr[2].amount, 1500);
  assert.equal(parsedArr[3].label, 'Titan Potion');
  assert.equal(parsedArr[3].amount, 300);

  // 2. Object-shaped reward
  const objReward = {
    gold: 100000,
    stamina: 120,
    coin: { '18': 500 },
    consumable: { '20': 50 }
  };
  const parsedObj = parseRewards(objReward);
  assert.equal(parsedObj.length, 4);
  assert.ok(parsedObj.some(r => r.label === 'Gold' && r.amount === 100000));
  assert.ok(parsedObj.some(r => r.label === 'Energy' && r.amount === 120));
  assert.ok(parsedObj.some(r => r.label === 'Fairy Dust' && r.amount === 500));
  assert.ok(parsedObj.some(r => r.label === 'Titan Potion' && r.amount === 50));

  // 3. formatRewardsSummary
  const summary = formatRewardsSummary(arrayReward);
  assert.match(summary, /50,000 × Gold/);
  assert.match(summary, /200 × Emeralds/);
  assert.match(summary, /1,500 × Fairy Dust/);
});

test('EventDetailModal component defines eventDetail modal, milestones, chains, and rewards view', async () => {
  const modalPath = join(root, 'src/components/dialogs/EventDetailModal.vue');
  const content = await readFile(modalPath, 'utf8');

  // Verify structure and contracts
  assert.match(content, /modal-name="eventDetail"/, 'Must specify modal-name eventDetail');
  assert.match(content, /activeEvents/, 'Must compute activeEvents');
  assert.match(content, /battlePasses/, 'Must compute battlePasses');
  assert.match(content, /processedChains/, 'Must compute processedChains with milestones');
  assert.match(content, /filteredChains/, 'Must support filtering chains');
  assert.match(content, /claimSingleQuest/, 'Must support claiming individual quests');
  assert.match(content, /claimAllReady/, 'Must support claim all ready rewards');
  assert.match(content, /parseRewards/, 'Must parse milestone rewards');
  assert.match(content, /Milestone Tiers/, 'Must render Milestone Tiers ladder');
  assert.match(content, /Current Objective/, 'Must render Current Objective banner');
});

test('EventsTab integrates with EventDetailModal for specialQuest and BattlePassModal for battlePass cards', async () => {
  const eventsTabPath = join(root, 'src/components/tabs/EventsTab.vue');
  const content = await readFile(eventsTabPath, 'utf8');

  assert.match(content, /openModal\('eventDetail',\s*\{\s*selectedEventId:\s*event\.id\s*\}\)/, 'Must open eventDetail for specialQuest');
  assert.match(content, /openModal\('battlePass',\s*\{\s*selectedBattlePassId:\s*id\s*\}\)/, 'Must open battlePass for liveOps battlePass');
  assert.match(content, /openModal\('battlePass',\s*\{\s*selectedBattlePassId:\s*bp\.id\s*\}\)/, 'Must open battlePass for legacy battlePass');
});

test('resolveTierDetail accurately resolves task, unit, tier target, and progress', () => {
  // 1. Daily Sign In (login)
  const loginGroup = { localeKey: 'QUEST_TAB_NAME_LOGIN' };
  const loginTier1 = resolveTierDetail({ id: 14654, state: 'completed', progress: 1 }, loginGroup, 1);
  assert.equal(loginTier1.task, 'Daily Sign In');
  assert.equal(loginTier1.unit, 'days');
  assert.equal(loginTier1.target, 1);
  assert.equal(loginTier1.state, 'completed');
  assert.equal(loginTier1.targetDisplay, '1 days');
  assert.match(loginTier1.progressDisplay, /100%/);

  const loginTier3 = resolveTierDetail({ id: 14656, state: 'inProgress', progress: 2 }, loginGroup, 3);
  assert.equal(loginTier3.target, 3);
  assert.equal(loginTier3.unit, 'days');
  assert.equal(loginTier3.progress, 2);
  assert.equal(loginTier3.percent, 67);
  assert.equal(loginTier3.targetDisplay, '3 days');
  assert.equal(loginTier3.progressDisplay, '2 / 3 days (67%)');

  // 2. Arena Battles (known CDN target for quest 11309: target 3)
  const arenaGroup = { localeKey: 'LIB_SPECIAL_QUEST_EVENT_NAME_9' };
  const arenaTier2 = resolveTierDetail({ id: 11309, state: 'completed', progress: 5 }, arenaGroup, 2);
  assert.equal(arenaTier2.task, 'Clash of Worlds Battles');
  assert.equal(arenaTier2.unit, 'battles');
  assert.equal(arenaTier2.target, 3);
  assert.equal(arenaTier2.targetDisplay, '3 battles');

  // 3. Spend Emeralds ladder
  const emeraldGroup = { localeKey: 'LIB_PSEUDO_STARMONEY' };
  const emTier4 = resolveTierDetail({ id: 99999, state: 'inProgress', progress: 650 }, emeraldGroup, 4);
  assert.equal(emTier4.task, 'Spend Emeralds');
  assert.equal(emTier4.unit, 'Emeralds');
  assert.equal(emTier4.target, 1000);
  assert.equal(emTier4.percent, 65);
  assert.equal(emTier4.targetDisplay, '1,000 Emeralds');
  assert.equal(emTier4.progressDisplay, '650 / 1,000 Emeralds (65%)');

  // 4. Trial of Legends (viewId 137 / EVENT_GLORY_NAME_QUEST_2) steps: 5, 10, 15, 20, 25, 30, 33, 35, 40...
  const gloryGroup = { localeKey: 'EVENT_GLORY_NAME_QUEST_2' };
  const tolTier1 = resolveTierDetail({ id: 14820, state: 'completed', progress: 9 }, gloryGroup, 1);
  assert.equal(tolTier1.target, 5);
  assert.equal(tolTier1.targetDisplay, '5 battles');

  const tolTier2 = resolveTierDetail({ id: 14821, state: 'completed', progress: 10 }, gloryGroup, 2);
  assert.equal(tolTier2.target, 10);
  assert.equal(tolTier2.targetDisplay, '10 battles');

  const tolTier3 = resolveTierDetail({ id: 14822, state: 'inProgress', progress: 13 }, gloryGroup, 3);
  assert.equal(tolTier3.target, 15);
  assert.equal(tolTier3.targetDisplay, '15 battles');
  assert.equal(tolTier3.progressDisplay, '13 / 15 battles (87%)');

  const tolTier4 = resolveTierDetail({ id: 14823, state: 'inProgress', progress: 13 }, gloryGroup, 4);
  assert.equal(tolTier4.target, 20);
  assert.equal(tolTier4.targetDisplay, '20 battles');

  const tolTier5 = resolveTierDetail({ id: 14824, state: 'inProgress', progress: 13 }, gloryGroup, 5);
  assert.equal(tolTier5.target, 25);
  assert.equal(tolTier5.targetDisplay, '25 battles');

  const tolTier6 = resolveTierDetail({ id: 14825, state: 'inProgress', progress: 13 }, gloryGroup, 6);
  assert.equal(tolTier6.target, 30);
  assert.equal(tolTier6.targetDisplay, '30 battles');

  const tolTier7 = resolveTierDetail({ id: 14826, state: 'inProgress', progress: 13 }, gloryGroup, 7);
  assert.equal(tolTier7.target, 33);
  assert.equal(tolTier7.targetDisplay, '33 battles');

  const tolTier8 = resolveTierDetail({ id: 14827, state: 'inProgress', progress: 13 }, gloryGroup, 8);
  assert.equal(tolTier8.target, 35);
  assert.equal(tolTier8.targetDisplay, '35 battles');

  const tolTier9 = resolveTierDetail({ id: 14828, state: 'inProgress', progress: 13 }, gloryGroup, 9);
  assert.equal(tolTier9.target, 40);
  assert.equal(tolTier9.targetDisplay, '40 battles');
});
