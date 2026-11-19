import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventExportPayload,
  exportEventsAsJson,
  copyEventsToClipboard,
} from '../src/utils/eventExport.ts';

test('buildEventExportPayload correctly bundles captured event and battle pass caches', () => {
  const sampleCache = {
    specialQuestStatus: {
      data: {
        events: [{ id: 100275, viewId: 65, groups: [{ id: 1, localeKey: 'QUEST_TAB_NAME_LOGIN' }] }]
      }
    },
    'getSpecialQuestState:quest': {
      data: {
        events: [{ id: 100292, viewId: 94 }]
      }
    },
    questEvents: {
      data: {
        events: [{ id: 100382, startTime: 1700000000, endTime: 1750000000 }]
      }
    },
    clanVersusStatus: {
      data: {
        battle: { clan: { name: 'Alpha' }, enemyClan: { name: 'Beta' } }
      }
    },
    battlepassLiveStatus: {
      data: {
        battlepasses: [{ battlepassId: 10001, points: 450, activatedTrackIds: [1, 2] }]
      }
    },
    'getBattlepassState:battlepass': {
      data: {
        battlepasses: [{ battlepassId: 10002, points: 120 }]
      }
    },
    'getDailyQuests:quest': {
      data: {
        quests: [{ id: 362, progress: 1, state: 'inProgress' }]
      }
    }
  };

  const dynamicCatalog = {
    events: [{ id: 100275, name: 'Clan Clash' }],
    battlepass: { levels: [{ id: 1, battlepassId: 10001, points: 100 }] }
  };

  const context = { activeCardsCount: 3, sourceModal: 'EventsTab' };

  const payload = buildEventExportPayload(sampleCache, dynamicCatalog, context);

  assert.ok(payload.exportedAt);
  assert.equal(payload.source, 'hwa-extension-cache');
  assert.equal(payload.events.specialQuestStatus.events[0].id, 100275);
  assert.equal(payload.events.getSpecialQuestState.events[0].id, 100292);
  assert.equal(payload.events.questEvents.events[0].id, 100382);
  assert.equal(payload.events.clanVersusStatus.battle.clan.name, 'Alpha');
  assert.equal(payload.battlepass.battlepassLiveStatus.battlepasses[0].battlepassId, 10001);
  assert.equal(payload.dailyQuests.getDailyQuests.quests[0].id, 362);
  assert.equal(payload.dynamicCatalog.events[0].name, 'Clan Clash');
  assert.equal(payload.context.sourceModal, 'EventsTab');
});

test('buildEventExportPayload safely handles empty or null cache', () => {
  const payload = buildEventExportPayload(null);
  assert.ok(payload.exportedAt);
  assert.equal(payload.source, 'hwa-extension-cache');
  assert.equal(payload.events.specialQuestStatus, undefined);
  assert.equal(payload.battlepass.battlepassLiveStatus, undefined);
  assert.equal(payload.dynamicCatalog, null);
  assert.equal(payload.context, null);
});

test('exportEventsAsJson builds payload and triggers json download', () => {
  const sampleCache = { questEvents: { data: { events: [{ id: 1 }] } } };
  const payload = exportEventsAsJson(sampleCache, null, { test: true }, 'hwa-test-export');
  assert.equal(payload.events.questEvents.events[0].id, 1);
  assert.equal(payload.context.test, true);
});

test('copyEventsToClipboard copies formatted JSON to navigator clipboard', async () => {
  let clipboardText = '';
  const originalClipboard = globalThis.navigator?.clipboard;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: {
      writeText: async (text) => {
        clipboardText = text;
      }
    },
    configurable: true
  });

  try {
    const sampleCache = { questEvents: { data: { events: [{ id: 99 }] } } };
    const ok = await copyEventsToClipboard(sampleCache);
    assert.equal(ok, true);
    assert.ok(clipboardText.includes('"id": 99'));
    assert.ok(clipboardText.includes('"source": "hwa-extension-cache"'));
  } finally {
    if (originalClipboard) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true
      });
    } else {
      delete globalThis.navigator.clipboard;
    }
  }
});
