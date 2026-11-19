import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { questData } from '../src/data/questData.ts';
import { rpcCacheService } from '../src/core/cache/index.ts';
import {
  cleanLocaleTitle,
  parseSpecialQuestEventViews,
  parseQuestChains,
  syncRemoteEventCatalog,
  getBattlePassName,
  eventCatalogService
} from '../src/services/eventCatalogService.ts';

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

  // 4. parseQuestChains
  const rawChains = {
    1301: { id: 1301, name: 'LIB_TEST_BP_DAILY_QUESTS' },
    1304: { id: 1304, label: 'QUEST_TAB_NAME_LOGIN' }
  };
  const parsedChains = parseQuestChains(rawChains);
  assert.equal(parsedChains[1301], 'Battle Pass Daily Quests');
  assert.equal(parsedChains[1304], 'Daily Sign In');
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
    questChainUrl: 'https://example.com/chain.json'
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
          1301: { id: 1301, name: 'Season Daily Quests' }
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

    // Calling again with same URLs should skip fetching
    const secondResult = await syncRemoteEventCatalog(configData, mockStorage);
    assert.equal(secondResult.updated, false);

    // questData runtime definitions should have been updated
    assert.equal(questData.title({ viewId: 134 }), 'Hero’s Way / Season Quests');
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.ok(titles.includes('Trial of Legends & Arena Glory'));
});
