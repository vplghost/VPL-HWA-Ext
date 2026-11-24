import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';
import {
  calculateStageEnemyPower,
  getFrontierChestInfo,
  buildFrontierBattlePayload,
} from '../src/services/frontierService.ts';
import { frontierActivityState } from '../src/composables/activityState.ts';

const root = resolve(process.cwd());

test('Frontier tracking data extraction and RPC cache integration', async () => {
  const { readTrackingLog } = await import('./helpers/trackingLog.mjs');
  const raw = await readTrackingLog('hwa-game-record-202611231422_frontier.json');
  const recordFile = JSON.parse(raw);

  let currentCache = {};
  let statusCount = 0;
  let chestCount = 0;
  let collectCount = 0;
  let fightResultCount = 0;
  let teamSetCount = 0;

  for (const entry of (recordFile.timeline || [])) {
    if (!entry.requestBody || !entry.responseBody) continue;
    try {
      const extracted = rpcCacheService.extract(entry);
      if (extracted.length > 0) {
        for (const item of extracted) {
          if (item.key === 'eternalStoryStatus') statusCount++;
          if (item.key === 'eternalStoryChestStatus') chestCount++;
          if (item.key === 'eternalStoryCollectChestAction') collectCount++;
          if (item.key === 'eternalStoryFightResult') fightResultCount++;
          if (item.key === 'eternalStoryTeam') teamSetCount++;
        }
        const merged = rpcCacheService.merge(currentCache, extracted);
        currentCache = merged.cache;
      }
    } catch (_) {}
  }

  assert.ok(statusCount > 0, 'Should extract eternalStoryStatus from tracking records');
  assert.ok(chestCount > 0, 'Should extract eternalStoryChestStatus from tracking records');
  assert.ok(collectCount > 0, 'Should extract eternalStoryCollectChestAction from tracking records');
  assert.ok(fightResultCount > 0, 'Should extract eternalStoryFightResult from tracking records');
  assert.ok(teamSetCount > 0, 'Should extract eternalStoryTeam from tracking records');

  // Verify merged cache state
  assert.ok(currentCache.eternalStoryStatus?.data?.mission, 'Mission data must be present in cache');
  assert.equal(currentCache.eternalStoryStatus.data.mission.world, 3, 'World should be 3');
  assert.equal(currentCache.eternalStoryStatus.data.mission.position, 254, 'Position should be 254');
  assert.equal(currentCache.eternalStoryStatus.data.mission.defender_packs?.[0]?.length, 5, 'Defenders pack should have 5 heroes');

  // Verify daily progress was accumulated from won fights
  assert.ok(currentCache.eternalStoryDailyProgress?.data, 'Daily progress must be tracked');
  assert.ok(currentCache.eternalStoryDailyProgress.data.clearedCount > 0, 'Cleared count should be > 0');
});

test('calculateStageEnemyPower correctly sums defender power', () => {
  const defenders = [
    { id: 24, power: 46000 },
    { id: 53, power: 42112 },
    { id: 57, power: 41431 },
    { id: 58, power: 41256 },
    { id: 504, power: 42109 },
  ];
  const total = calculateStageEnemyPower(defenders);
  assert.equal(total, 46000 + 42112 + 41431 + 41256 + 42109);
  assert.equal(calculateStageEnemyPower([]), 0);
  assert.equal(calculateStageEnemyPower(null), 0);
});

test('getFrontierChestInfo formats chest progress and rewards', () => {
  const info1 = getFrontierChestInfo({
    reward: { coin: { '23': 250 } },
    filled_in_percents: 45,
    collected_at: 1700000000,
  });
  assert.equal(info1.percent, 45);
  assert.equal(info1.coins, 250);
  assert.equal(info1.claimable, true);

  const infoZero = getFrontierChestInfo({
    reward: { coin: { '23': 0 } },
    filled_in_percents: 0,
    collected_at: 1700000000,
  });
  assert.equal(infoZero.claimable, false);
});

test('buildFrontierBattlePayload constructs valid simulation structure', () => {
  const heroes = [{ id: 1, power: 50000, level: 120, star: 5 }];
  const defenders = [{ id: 24, power: 46000, level: 120, star: 5 }];
  const payload = buildFrontierBattlePayload(heroes, defenders, 254, 12345);

  assert.equal(payload.type, 'hero');
  assert.equal(payload.stage, 254);
  assert.equal(payload.seed, 12345);
  assert.equal(payload.attackers.length, 1);
  assert.equal(payload.attackers[0].unit.id, 1);
  assert.equal(payload.defenders.length, 1);
  assert.equal(payload.defenders[0].unit.id, 24);
});

test('frontierActivityState computes correct stage, detail, and pending state', () => {
  const fakeCache = {
    eternalStoryStatus: {
      data: {
        mission: {
          position: 254,
          world: 3,
          defender_packs: [[
            { id: 24, power: 46000 },
            { id: 53, power: 42112 },
          ]],
        },
      },
    },
    eternalStoryChestStatus: {
      data: {
        reward: { coin: { '23': 600 } },
        filled_in_percents: 85,
      },
    },
    eternalStoryDailyProgress: {
      data: {
        date: new Date().toDateString(),
        clearedCount: 3,
      },
    },
  };

  const state = frontierActivityState(fakeCache);
  assert.equal(state.currentStage, 254);
  assert.equal(state.world, 3);
  assert.equal(state.enemyPower, 46000 + 42112);
  assert.equal(state.todayCleared, 3);
  assert.equal(state.chestPercent, 85);
  assert.equal(state.chestCoins, 600);
  assert.equal(state.state, 'pending'); // Chest >= 80% triggers pending
  assert.ok(state.detail.includes('Stage 254'));
  assert.ok(state.detail.includes('World 3'));
  assert.ok(state.detail.includes('Cleared: 3 today'));
});

test('Frontier is integrated in ActivityGoals and FrontierModal has full UI controls with English localization', async () => {
  const dashSrc = await readFile(resolve(root, 'src/components/dashboard/DashboardTab.vue'), 'utf8');
  assert.ok(!dashSrc.includes('FrontierCard'), 'DashboardTab should not render standalone FrontierCard');
  assert.ok(dashSrc.includes('ActivityGoals'), 'DashboardTab should render ActivityGoals');

  const activitySrc = await readFile(resolve(root, 'src/components/dashboard/ActivityGoals.vue'), 'utf8');
  assert.ok(activitySrc.includes('frontierActivityState'), 'ActivityGoals should use frontierActivityState');
  assert.ok(activitySrc.includes("openModal('frontier')"), 'ActivityGoals should open frontier modal on click');

  const modalSrc = await readFile(resolve(root, 'src/components/dialogs/FrontierModal.vue'), 'utf8');
  assert.ok(modalSrc.includes('ModalDialog'), 'Modal should use ModalDialog');
  assert.ok(modalSrc.includes('Lineup & Stage'), 'Modal should display Lineup & Stage tab in English');
  assert.ok(modalSrc.includes('Automation & Simulation'), 'Modal should display Automation & Simulation tab in English');
  assert.ok(modalSrc.includes('frontier-preset-picker'), 'Modal should have preset picker for saved teams');
  assert.ok(modalSrc.includes('onSelectPresetTeam'), 'Modal should handle preset team selection');
  assert.ok(modalSrc.includes('selectedSquad'), 'Modal should support squad selection');
  assert.ok(modalSrc.includes('maxDefeats'), 'Modal should provide maxDefeats threshold setting');
  assert.ok(modalSrc.includes('rotateTeams'), 'Modal should provide rotateTeams on defeat option');
  assert.ok(modalSrc.includes('selectedRotateTeamIds'), 'Modal should allow selecting custom teams for rotation');
  assert.ok(modalSrc.includes('startAutoFight'), 'Modal should have auto battle function');
  assert.ok(modalSrc.includes('handleSingleFight'), 'Modal should have single fight function');
  assert.ok(modalSrc.includes('useWasmSim'), 'Modal should have WASM simulation option');
  assert.ok(modalSrc.includes('stopOnDefeat'), 'Modal should have stop on defeat option');
  assert.ok(modalSrc.includes('combatLogs'), 'Modal should have combat log history');

  const appSrc = await readFile(resolve(root, 'entrypoints/popup/App.vue'), 'utf8');
  assert.ok(appSrc.includes('FrontierModal'), 'App.vue should mount FrontierModal');
});
