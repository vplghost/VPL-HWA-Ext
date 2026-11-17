import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseRewards, formatRewardsSummary } from '../src/utils/rewardHelper.ts';

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

test('EventsTab integrates with EventDetailModal for specialQuest and battlePass cards', async () => {
  const eventsTabPath = join(root, 'src/components/tabs/EventsTab.vue');
  const content = await readFile(eventsTabPath, 'utf8');

  assert.match(content, /openModal\('eventDetail',\s*\{\s*selectedEventId:\s*event\.id\s*\}\)/, 'Must open eventDetail for specialQuest');
  assert.match(content, /openModal\('eventDetail',\s*\{\s*selectedEventId:\s*`bp:\$\{bp\.id\}`\s*\}\)/, 'Must open eventDetail for battlePass');
});
