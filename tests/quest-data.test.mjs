import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { Date, Number, Array, TextEncoder, console };
for (const file of ['refillable-rules.js', 'rpc-cache.js', 'quest-data.js', 'dashboard-data.js', 'popup-data.js']) {
  vm.runInNewContext(await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'), context);
}
const data = context.hwaHelperQuestData;
const cacheReducer = context.hwaHelperRpcCache;
const dashboard = context.hwaHelperDashboardData.dailyDashboard;
const goals = context.hwaHelperPopupData.extractEventGoals;
let trace = null;
try {
  trace = JSON.parse(await readFile(new URL('../temp/tracking-data/hwa-game-record-202611062259_start.json', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const rpcRecords = trace ? trace.timeline.filter((entry) => entry.kind === 'api' && entry.transport === 'fetch' &&
  entry.endpoint === 'https://api.hero-wars-alliance.com/api/rpc') : [];
const mqttRecord = trace ? trace.timeline.find((entry) => entry.kind === 'api' && entry.transport === 'websocket' &&
  entry.eventType === 'specialQuestEvents') : null;
const at = trace ? Date.parse(trace.exportedAt) : 0;

test('startup trace yields actionable daily quests and only visible timed events', (t) => {
  if (!trace) {
    t.skip('Optional private trace unavailable: hwa-game-record-202611062259_start.json');
    return;
  }
  const cache = cacheReducer.merge({}, rpcRecords).cache;
  assert.deepEqual(Array.from(data.dailyQuests(cache, at).filter((quest) => quest.state === 'inProgress'),
    (quest) => quest.id), [346, 356, 363]);
  assert.equal(data.nextReset(cache, at), Date.parse('2026-11-06T22:00:00Z'));
  assert.deepEqual(Array.from(data.visibleEvents(cache, at), (event) => event.id).sort(),
    [100273, 100292, 100344, 100347, 100351]);
  assert.equal(data.visibleMetadata(cache, at).length, 0);
  assert.equal(dashboard(cache, at).quests[0].state, 'pending');
  assert.match(dashboard(cache, at).quests[0].detail, /3 remaining of 23/);
  assert.match(dashboard(cache, at).quests[1].detail, /6 active groups/);
  const keys = goals(cache, at).all.map((goal) => goal.key);
  assert.ok(keys.includes('act:daily_quest_346'));
  assert.ok(keys.includes('act:daily_quest_356'));
  assert.ok(keys.includes('act:daily_quest_363'));
  assert.ok(!keys.includes('act:special_event_90249'));
  assert.ok(!keys.includes('misc:lib_special_quest_event_chain_name_test_wendygift'));
});

test('full MQTT specialQuestEvents snapshot updates timed progress without a quest RPC', (t) => {
  if (!trace) {
    t.skip('Optional private trace unavailable: hwa-game-record-202611062259_start.json');
    return;
  }
  assert.ok(mqttRecord);
  const before = cacheReducer.merge({}, rpcRecords).cache;
  delete before.specialQuestStatus;
  assert.equal(before.specialQuestStatus, undefined);
  const after = cacheReducer.merge(before, [mqttRecord]).cache;
  assert.equal(after.specialQuestStatus.method, 'specialQuestEvents');
  assert.equal(after.specialQuestStatus.data.events.length, 9);
  assert.equal(data.visibleEvents(after, at).length, 5);
  assert.equal(after['getDailyQuests:quest'].data.quests.length, 23);
  const empty = { ...mqttRecord, timestamp: new Date(at + 1000).toISOString(),
    payload: JSON.stringify({ result: { type: 'specialQuestEvents', body: {
      pushUserId: after.accountStatus.data.id, events: [] } } }) };
  assert.equal(cacheReducer.merge(after, [empty]).cache.specialQuestStatus.data.events.length, 0);
});

test('quest eligibility excludes hidden, future, expired, inactive and stale daily data', () => {
  const cache = {
    questResetStatus: { data: { nextDayAt: 200000 } },
    'getDailyQuests:quest': { data: { quests: [{ id: 346, state: 'inProgress' }] },
      updatedAt: new Date(150000).toISOString() },
    specialQuestStatus: { updatedAt: new Date(150000).toISOString(), data: { events: [
      { id: 1, viewId: 65, start: 0, end: 300000, groups: [
        { id: 1, repeatType: 'single', hide: false, inactiveQuestIds: ['2'],
          quests: [{ id: 2, state: 'inProgress' }, { id: 3, state: 'inProgress' }] },
        { id: 2, repeatType: 'daily', hide: false, quests: [{ id: 4, state: 'inProgress' }] },
        { id: 3, hide: true, quests: [{ id: 5, state: 'inProgress' }] }
      ] },
      { id: 2, viewId: 29, start: 0, end: 300000, groups: [{ id: 4, quests: [] }] },
      { id: 3, viewId: 65, start: 300000, end: 400000, groups: [{ id: 5, quests: [] }] },
      { id: 4, viewId: 65, start: 0, end: 100000, groups: [{ id: 6, quests: [] }] }
    ] } }
  };
  assert.deepEqual(Array.from(data.visibleEvents(cache, 150000), (event) => event.id), [1]);
  assert.deepEqual(Array.from(data.visibleEvents(cache, 150000)[0].groups[0].quests, (quest) => quest.id), [3]);
  assert.equal(data.dailyQuests(cache, 200000), null);
  assert.equal(data.visibleEvents(cache, 200000)[0].groups.length, 1);
});

test('runtime quest definitions update, catalog export, and unknown quest filtering', () => {
  // Test runtime registration of new definitions
  data.registerRuntimeDefinitions({
    dailyTitles: {
      99999: 'Custom Test Daily Quest'
    },
    viewTitles: {
      999: 'Custom Holiday Festival'
    },
    localeTitles: {
      CUSTOM_LOCALE_TEST: { title: 'Custom Mission Chain', category: 'Activities', unit: 'tasks', amount: 1 }
    },
    questTemplates: {
      88888: 'Custom Template Battle'
    }
  });

  assert.equal(data.dailyTitle({ id: 99999 }), 'Custom Test Daily Quest');
  assert.equal(data.title({ viewId: 999, id: 1 }), 'Custom Holiday Festival');
  assert.equal(data.groupTitle('CUSTOM_LOCALE_TEST'), 'Custom Mission Chain');
  assert.equal(data.questTemplateTitle(88888), 'Custom Template Battle');
  assert.equal(data.isRecognizedQuest(99999), true);
  assert.equal(data.isRecognizedQuest(12345678), false);

  // Fallback humanizer for unmapped localeKey
  assert.equal(data.groupTitle('LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_99'), 'Mission Chain #99');

  // Daily map gather quests accurately identify resources (iron not gold)
  assert.equal(data.dailyTitle({ id: 354 }), 'Gather food on world map');
  assert.equal(data.dailyTitle({ id: 355 }), 'Gather wood on world map');
  assert.equal(data.dailyTitle({ id: 356 }), 'Gather stone on world map');
  assert.equal(data.dailyTitle({ id: 357 }), 'Gather iron on world map');

  // Verify catalog export is valid JSON
  const exported = data.exportCatalogJson();
  assert.ok(typeof exported === 'string');
  const parsed = JSON.parse(exported);
  assert.equal(parsed.dailyTitles['99999'], 'Custom Test Daily Quest');
  assert.equal(parsed.viewTitles['999'], 'Custom Holiday Festival');
});
