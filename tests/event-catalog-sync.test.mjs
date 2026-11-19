import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { questData } from '../src/data/questData.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';
import {
  cleanLocaleTitle,
  parseSpecialQuestEventViews,
  parseQuestChains,
  parseQuestChainTransferProgress,
  parseQuests,
  syncRemoteEventCatalog,
  getBattlePassName,
  eventCatalogService
} from '../src/services/eventCatalogService.ts';
import {
  runtimeQuestTargets,
  runtimeQuestRewards,
  registerRuntimeTierData,
  resolveTierTarget,
  resolveTierDetail
} from '../src/utils/tierHelper.ts';

test('eventCatalogService parses raw remote configs into clean titles', () => {
  // 1. cleanLocaleTitle tests
  assert.equal(cleanLocaleTitle('LIB_SPECIAL_QUEST_EVENT_NAME_9'), 'Clash of Worlds Battles');
  assert.equal(cleanLocaleTitle('LIB_TEST_BP_DAILY_QUESTS'), 'Battle Pass Daily Quests');
  assert.equal(cleanLocaleTitle('STRATEGIC_BASE_INTERFACE_TROOPS_TRAIN'), 'Train Troops in Barracks');
  assert.equal(cleanLocaleTitle('EVENT_GLORY_NAME_QUEST_1'), 'Rising Legend');
  assert.equal(cleanLocaleTitle('EVENT_GLORY_NAME_QUEST_2'), 'Trial of Legends');
  assert.equal(cleanLocaleTitle('EVENT_GLORY_NAME_QUEST_3'), 'Glory of the Chosen');
  assert.equal(cleanLocaleTitle('LIB_SPECIAL_QUEST_EVENT_NAME_90934'), 'Clan Clash Event');
  assert.equal(cleanLocaleTitle('UI_HERO78_TITLE'), 'Wodryn Hero Quests');
  assert.equal(cleanLocaleTitle('LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_99'), 'Event #99');

  // 2. parseSpecialQuestEventViews supports snake_case, camelCase, and descriptive labels
  const rawViews = {
    12: { id: 12, label: 'Outland Splendor season 25', nameLocaleKey: 'LIB_SPECIAL_QUEST_EVENT_NAME_229' },
    94: { id: 94, label: 'КИ на прокачку Водрина - адвенчура 31 сезон', nameLocaleKey: 'UI_HERO78_TITLE' },
    99: { id: 99, label: "Hero's Way S31", nameLocaleKey: 'empty' },
    134: { id: 134, name_localeKey: 'LIB_SEASON_PASS_TITLE' },
    135: { id: 135, name_localeKey: 'LIB_SPECIAL_QUEST_EVENT_NAME_143' },
    136: { id: 136, name_localeKey: 'UI_DIALOG_RATING_TAB_CLAN' },
    146: { id: 146, label: 'ProgressivePlan. TeamLevel. Event View (pp166951)', nameLocaleKey: 'empty' }
  };
  const parsedViews = parseSpecialQuestEventViews(rawViews);
  assert.equal(parsedViews[12], 'Outland Splendor');
  assert.equal(parsedViews[94], 'Wodryn Hero Quests');
  assert.equal(parsedViews[99], "Hero's Way S31");
  assert.equal(parsedViews[134], 'Season Pass Title');
  assert.equal(parsedViews[135], 'Tower Floor Progress');
  assert.equal(parsedViews[136], 'Guild Activity Points');
  assert.equal(parsedViews[146], 'Progressive Plan: Team Level');

  // 3. getBattlePassName tests
  assert.equal(getBattlePassName(1017), "Hero's Way S31");
  assert.equal(getBattlePassName(1016), 'Season Pass S31');
  assert.equal(getBattlePassName(1036), 'Wodryn Relic Pass S31');
  assert.equal(getBattlePassName(1037), 'Glory Pass S31');
  assert.equal(getBattlePassName(1051), 'Team Level Progressive Plan');
  assert.equal(getBattlePassName({ type: 'draft', id: 186 }), 'Draft Pass');
  assert.equal(
    getBattlePassName(9999, {
      battlepass: { tracks: [{ battlepassId: 9999, label: 'Cosmic Glory Pass Free' }] }
    }),
    'Cosmic Glory Pass'
  );

  // 4. parseQuestChains & parseQuestChainTransferProgress
  const rawChains = {
    1301: { id: 1301, name: 'LIB_TEST_BP_DAILY_QUESTS', transferProgress: false },
    1304: { id: 1304, label: 'QUEST_TAB_NAME_LOGIN', transferProgress: true }
  };
  const parsedChains = parseQuestChains(rawChains);
  assert.equal(parsedChains[1301], 'Battle Pass Daily Quests');
  assert.equal(parsedChains[1304], 'Daily Sign In');

  const parsedTransfer = parseQuestChainTransferProgress(rawChains);
  assert.equal(parsedTransfer[1301], false);
  assert.equal(parsedTransfer[1304], true);

  // 5. parseQuests parses targets, rewards, and chain mapping
  const rawQuests = {
    14855: {
      id: 14855,
      chainId: 1325,
      condition: { name: 'barracksTrainTroops', target: 3000 },
      reward: [{ type: 'gold', amount: 500000 }, { type: 'coin', id: 40208, amount: 10 }]
    },
    14856: {
      id: 14856,
      chainId: 1325,
      condition: { name: 'barracksTrainTroops', target: 7500 },
      reward: [{ type: 'gold', amount: 1000000 }, { type: 'coin', id: 40208, amount: 15 }]
    },
    99001: {
      id: 99001,
      chainId: 9900,
      target: 50,
      reward: [{ type: 'starmoney', amount: 500 }]
    }
  };
  const { targets, rewards, chains } = parseQuests(rawQuests);
  assert.equal(targets[14855], 3000);
  assert.equal(targets[14856], 7500);
  assert.equal(targets[99001], 50);
  assert.equal(rewards[14855].length, 2);
  assert.equal(rewards[14855][0].amount, 500000);
  assert.equal(rewards[99001][0].type, 'starmoney');
  assert.equal(chains[14855], 1325);
  assert.equal(chains[99001], 9900);
});

test('syncRemoteEventCatalog updates storage and runtime definitions when URLs change', async () => {
  const mockStorageData = {};
  const mockStorage = {
    get: async (keys) => {
      const res = {};
      for (const k of keys) res[k] = mockStorageData[k];
      return res;
    },
    set: async (items) => {
      Object.assign(mockStorageData, items);
    }
  };

  const configData = {
    specialQuestEventViewUrl: 'https://example.com/view.json',
    questChainUrl: 'https://example.com/chain.json',
    questUrl: 'https://example.com/quest.json'
  };

  // Mock global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('view.json')) {
      return {
        ok: true,
        json: async () => ({
          134: { id: 134, name_localeKey: 'Hero’s Way / Season Quests' },
          135: { id: 135, name_localeKey: 'Elemental Synergy & Titan Power' }
        })
      };
    }
    if (url.includes('chain.json')) {
      return {
        ok: true,
        json: async () => ({
          1301: { id: 1301, name: 'Season Daily Quests', transferProgress: true }
        })
      };
    }
    if (url.includes('quest.json')) {
      return {
        ok: true,
        json: async () => ({
          88001: {
            id: 88001,
            chainId: 1301,
            condition: { name: 'winArena', target: 25 },
            reward: [{ type: 'starmoney', amount: 300 }]
          }
        })
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const result = await syncRemoteEventCatalog(configData, mockStorage);
    assert.equal(result.updated, true);
    assert.equal(result.catalog.viewTitles[134], 'Hero’s Way / Season Quests');
    assert.equal(result.catalog.viewTitles[135], 'Elemental Synergy & Titan Power');
    assert.equal(result.catalog.chainTitles[1301], 'Season Daily Quests');
    assert.equal(result.catalog.chainTransferProgress[1301], true);
    assert.equal(result.catalog.questTargets[88001], 25);
    assert.equal(result.catalog.questRewards[88001][0].type, 'starmoney');

    // Calling again with same URLs should skip fetching
    const secondResult = await syncRemoteEventCatalog(configData, mockStorage);
    assert.equal(secondResult.updated, false);

    // Calling with force=true should force re-fetch
    const forceResult = await syncRemoteEventCatalog(configData, mockStorage, true);
    assert.equal(forceResult.updated, true);

    // questData runtime definitions should have been updated
    assert.equal(questData.title({ viewId: 134 }), 'Hero’s Way / Season Quests');

    // tierHelper runtime targets should have been populated
    assert.equal(resolveTierTarget({ id: 88001 }, { localeKey: 'UNKNOWN' }, 1), 25);
    const detail = resolveTierDetail({ id: 88001, progress: 10 }, { localeKey: 'UNKNOWN' }, 1);
    assert.equal(detail.target, 25);
    assert.equal(detail.rewards.length, 1);
    assert.equal(detail.rewards[0].label, 'Emeralds');
    assert.equal(detail.rewards[0].amount, 300);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tierHelper dynamically resolves targets and rewards for un-hardcoded new events using runtime catalog', () => {
  const newQuestId = 999555;
  const newChainId = 888111;

  // Before runtime registration, resolveTierTarget falls back to step (e.g. 10 * tierIndex)
  const fallbackTarget = resolveTierTarget({ id: newQuestId }, { localeKey: 'UNKNOWN_NEW_EVENT' }, 1);
  assert.equal(fallbackTarget, 1); // 1 * defaultStep(1)

  // Register runtime definitions from remote CDN
  registerRuntimeTierData({
    questTargets: { [newQuestId]: 45000 },
    questRewards: {
      [newQuestId]: [
        { type: 'coin', id: 40208, amount: 80 },
        { type: 'gold', amount: 10000000 }
      ]
    },
    chainTransferProgress: { [newChainId]: true }
  });

  // Now resolveTierTarget resolves the dynamic 45,000 target
  const dynamicTarget = resolveTierTarget({ id: newQuestId }, { localeKey: 'UNKNOWN_NEW_EVENT' }, 1);
  assert.equal(dynamicTarget, 45000);

  // resolveTierDetail resolves the exact dynamic rewards (Legend Coin + Gold)
  const detail = resolveTierDetail(
    { id: newQuestId, progress: 20000, completionCount: 0, chainId: newChainId },
    { localeKey: 'UNKNOWN_NEW_EVENT', id: newChainId },
    1
  );
  assert.equal(detail.target, 45000);
  assert.equal(detail.progress, 20000);
  assert.equal(detail.percent, 44);
  assert.equal(detail.state, 'inProgress');
  assert.equal(detail.rewards.length, 2);
  assert.equal(detail.rewards[0].label, 'Legend Coin');
  assert.equal(detail.rewards[0].amount, 80);
  assert.equal(detail.rewards[1].label, 'Gold');
  assert.equal(detail.rewards[1].amount, 10000000);
});

test('questData.getMilestoneSummary accurately calculates event progress and groups breakdown', () => {
  const event = {
    id: 100378,
    viewId: 135,
    groups: [
      {
        id: 1304,
        repeatType: 'single',
        localeKey: 'QUEST_TAB_NAME_LOGIN',
        quests: [
          { id: 14654, state: 'completed', progress: 1 },
          { id: 14655, state: 'completed', progress: 2 },
          { id: 14656, state: 'inProgress', progress: 2 },
          { id: 14657, state: 'inProgress', progress: 2 }
        ]
      },
      {
        id: 1305,
        repeatType: 'daily',
        localeKey: 'QUEST_TAB_NAME_GET_VIP',
        quests: [
          { id: 14661, state: 'inProgress', progress: 0 },
          { id: 14662, state: 'inProgress', progress: 0 }
        ]
      }
    ]
  };

  const summary = questData.getMilestoneSummary(event);
  assert.equal(summary.totalMilestones, 6);
  assert.equal(summary.completedMilestones, 2);
  assert.equal(summary.inProgressCount, 4);
  assert.equal(summary.percent, 33);
  assert.equal(summary.dailyGroups.length, 1);
  assert.equal(summary.singleGroups.length, 1);
  assert.equal(summary.groups[0].title, 'Daily Sign In');
  assert.equal(summary.groups[0].completedMilestones, 2);
  assert.equal(summary.groups[0].activeMilestoneIndex, 3);
  assert.equal(summary.groups[1].title, 'Obtain VIP Points');
  assert.equal(summary.groups[1].completedMilestones, 0);
  assert.equal(summary.groups[1].activeMilestoneIndex, 1);
});

test('rpcCache accurately extracts and merges remoteConfigStatus and battlepassStatus from game record', async (t) => {
  let recordData;
  try {
    const raw = await readFile('temp/tracking-data/hwa-game-record-202611172043_events.json', 'utf8');
    recordData = JSON.parse(raw);
  } catch (e) {
    t.skip('Tracking data file unavailable');
    return;
  }

  // Filter the RPC records
  const timeline = recordData.timeline || [];
  const rpcRecords = timeline.filter(item => item.transport === 'fetch' && item.endpoint.includes('/api/rpc'));
  const wsRecords = timeline.filter(item => item.transport === 'websocket');

  // Merge into clean cache
  const merged = rpcCacheService.merge({}, [...rpcRecords, ...wsRecords]);
  const cache = merged.cache;

  // 1. Verify remoteConfigStatus was extracted
  assert.ok(cache.remoteConfigStatus, 'remoteConfigStatus should exist');
  assert.equal(cache.remoteConfigStatus.group, 'internal');
  assert.ok(cache.remoteConfigStatus.data.specialQuestEventViewUrl, 'specialQuestEventViewUrl should be extracted');
  assert.ok(cache.remoteConfigStatus.data.questChainUrl, 'questChainUrl should be extracted');
  assert.ok(cache.remoteConfigStatus.data.battlepassTrackUrl, 'battlepassTrackUrl should be extracted');

  // 2. Verify battlepassStatus was extracted
  assert.ok(cache.battlepassStatus, 'battlepassStatus should exist');
  assert.equal(cache.battlepassStatus.group, 'events');
  const passes = cache.battlepassStatus.data.passes;
  assert.ok(Array.isArray(passes), 'passes should be an array');
  assert.equal(passes.length, 2);
  assert.equal(passes[0].id, 186);
  assert.equal(passes[0].type, 'draft');
  assert.equal(passes[0].battlePassExp, 19990);
  assert.equal(passes[1].id, 188);
  assert.equal(passes[1].type, 'regular');

  // 3. Verify questData.getBattlePassState parses the battlepassStatus
  const parsedBp = questData.getBattlePassState(cache);
  assert.equal(parsedBp.length, 2);
  assert.equal(parsedBp[0].id, 186);
  assert.equal(parsedBp[0].exp, 19990);
  assert.equal(parsedBp[0].farmedNormal, 15);
  assert.equal(parsedBp[0].farmedGold, 0);

  // 4. Verify questData.visibleEvents resolves the weekly events
  const visible = questData.visibleEvents(cache, Date.parse('2026-11-17T13:42:57Z'));
  assert.ok(visible.length >= 4, `Should have at least 4 active events, got ${visible.length}`);

  // Check event titles
  const titles = visible.map(ev => questData.title(ev));
  assert.ok(titles.includes('Clan Clash Event'));
  assert.ok(titles.includes('Hero Upgrade Event'));
  assert.ok(titles.includes('Elemental Synergy & Titan Power'));
  assert.ok(titles.includes('Champions’ Season & Guild Growth'));
  assert.ok(titles.includes('Spark of Glory'));
});
