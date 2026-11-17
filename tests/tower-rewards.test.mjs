import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('TowerModal displays chest rewards and tower rewards summary box', async () => {
  const content = await readFile(join(root, 'src/components/dialogs/TowerModal.vue'), 'utf8');

  // Verify rewards summary section exists
  assert.match(content, /id="tower-rewards-summary"/, 'Must have #tower-rewards-summary');
  assert.match(content, /Tower Run Rewards Summary/, 'Must have rewards summary title');
  assert.match(content, /towerTotalRewards/, 'Must compute towerTotalRewards');
  assert.match(content, /towerCurrencies/, 'Must compute towerCurrencies');

  // Verify opened chest reward display
  assert.match(content, /parseTowerReward/, 'Must have parseTowerReward helper');
  assert.match(content, /group\.chest\.reward/, 'Must check group.chest.reward in template');

  // Verify required regression assertions remain intact
  assert.match(content, /id="tower-modal-badge"/, 'Must retain #tower-modal-badge');
  assert.match(content, /id="tower-modal-cleared-badge"/, 'Must retain #tower-modal-cleared-badge');
  assert.match(content, /v-if="isComplete && !isRunning"/, 'Must retain isComplete condition');
  assert.match(content, /Tower Cleared Today/, 'Must retain Tower Cleared Today label');
  assert.match(content, /data-tower-accordion/, 'Must retain data-tower-accordion');
});
