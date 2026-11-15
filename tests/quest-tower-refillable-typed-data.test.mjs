import test from 'node:test';
import assert from 'node:assert/strict';

import {
  questData,
  dailyTitles,
  viewTitles,
  localeTitles,
  questTemplates,
  getDailyTitle,
  getEventTitle,
  getGroupTitle,
  questTemplateTitle,
  isRecognizedQuest,
  nextReset,
  dailyQuests,
  visibleEvents
} from '../src/data/questData.ts';

import {
  towerBuffs,
  towerRules,
  getTowerBuff
} from '../src/data/towerData.ts';

import {
  refillableRules,
  getRefillableRule
} from '../src/data/refillableData.ts';

import {
  speedupData,
  getSpeedupDuration
} from '../src/data/speedupData.ts';

import {
  clanVersusRewards,
  clanVersusChestThresholds,
  clanVersusChallengeNames,
  clanVersusChallengePoints,
  clanVersusChallengeSteps,
  clanVersusRoundQuests
} from '../src/data/clanVersusData.ts';

test('questData correctly resolves daily titles, event titles, group titles and templates', () => {
  // Daily quest titles
  assert.equal(dailyTitles['346'], 'Upgrade 1 building');
  assert.equal(dailyTitles['362'], 'Clear Brigand Camp 1 time');
  assert.equal(dailyTitles['368'], 'Defeat Boss 1 time');
  assert.equal(getDailyTitle(346), 'Upgrade 1 building');
  assert.equal(getDailyTitle({ id: 362 }), 'Clear Brigand Camp 1 time');
  assert.equal(getDailyTitle(10001), 'Level up hero skills');
  assert.equal(getDailyTitle(999999), 'Daily Quest #999999');

  // Event titles
  assert.equal(getEventTitle({ viewId: 65, id: 10 }), 'Clan Clash Event');
  assert.equal(getEventTitle({ viewId: 67, id: 12 }), 'Glory Pass');
  assert.equal(getEventTitle({ viewId: 999, id: 50 }), 'Special Event #50');

  // Group titles
  assert.equal(getGroupTitle('QUEST_TAB_NAME_SKINSTONES_SPEND'), 'Spend Hero Skin Stones');
  assert.equal(getGroupTitle('LIB_PSEUDO_STAMINA'), 'Spend Energy');
  assert.equal(getGroupTitle('LIB_PSEUDO_STARMONEY'), 'Spend Emeralds');
  assert.equal(getGroupTitle(''), 'Special Quest');

  // Templates
  assert.equal(questTemplateTitle(10001), 'Level up hero skills');
  assert.equal(questTemplateTitle(10019), 'Open Tower Chests');
  assert.equal(questTemplateTitle(999999), null);
  assert.equal(isRecognizedQuest(346), true);
  assert.equal(isRecognizedQuest(10001), true);
  assert.equal(isRecognizedQuest(999999), false);
});

test('questData nextReset, dailyQuests and visibleEvents calculations', () => {
  const now = 1700000000000;
  const cache = {
    questResetStatus: { data: { nextDayAt: now + 3600000 } },
    'getDailyQuests:quest': {
      updatedAt: new Date(now - 1000).toISOString(),
      data: { quests: [{ id: 346, state: 1, progress: 0 }] }
    },
    specialQuestStatus: {
      updatedAt: new Date(now - 1000).toISOString(),
      data: {
        events: [
          {
            id: 1,
            viewId: 65,
            start: now - 3600000,
            end: now + 3600000,
            groups: [{ id: 10, hide: false, quests: [{ id: 1001 }] }]
          }
        ]
      }
    }
  };

  assert.equal(nextReset(cache, now), now + 3600000);
  const dailies = dailyQuests(cache, now);
  assert.ok(Array.isArray(dailies));
  assert.equal(dailies.length, 1);
  assert.equal(dailies[0].id, 346);

  const events = visibleEvents(cache, now);
  assert.ok(Array.isArray(events));
  assert.equal(events.length, 1);
  assert.equal(events[0].viewId, 65);
});

test('towerData exports valid buff metadata, floor rules, and accessor', () => {
  assert.ok(Object.keys(towerBuffs).length >= 40);
  assert.equal(towerBuffs['1'].name, 'Exploding Morningstar');
  assert.equal(towerBuffs['46'].name, 'Wand of Despair');

  assert.equal(getTowerBuff(1)?.name, 'Exploding Morningstar');
  assert.equal(getTowerBuff('2')?.name, 'Razor Flurry');
  assert.equal(getTowerBuff(9999), undefined);

  assert.equal(towerRules.floorCount, 23);
  assert.equal(towerRules.finalFloor, 23);
  assert.equal(towerRules.finalTemplateId, 12);
});

test('refillableData exports accurate refill intervals, caps, and accessor', () => {
  assert.equal(refillableRules[1].label, 'Energy');
  assert.equal(refillableRules[1].interval, 360000);
  assert.equal(refillableRules[1].capFromTeamLevel, true);

  assert.equal(refillableRules[2].label, 'Skill Points');
  assert.equal(refillableRules[2].interval, 300000);
  assert.equal(refillableRules[2].cap, 10);

  assert.equal(getRefillableRule(1)?.label, 'Energy');
  assert.equal(getRefillableRule('58')?.label, 'Sky Arena Fuel');
  assert.equal(getRefillableRule(99999), undefined);
});

test('speedupData exports valid speedup sources, durations, and accessor', () => {
  assert.ok(speedupData.sources.speedUpConstruction.url);
  assert.ok(speedupData.sources.speedUpResearch.url);
  assert.ok(speedupData.sources.speedUpUnitHealing.url);

  // 1 = 1m (60000ms), 2 = 5m (300000ms), 3 = 1h (3600000ms), 4 = 3h (10800000ms), 5 = 8h (28800000ms)
  assert.equal(speedupData.durations.speedUpConstruction['1'], 60000);
  assert.equal(speedupData.durations.speedUpConstruction['5'], 28800000);

  assert.equal(getSpeedupDuration('speedUpConstruction', 1), 60000);
  assert.equal(getSpeedupDuration('speedUpResearch', 3), 3600000);
  assert.equal(getSpeedupDuration('speedUpUnitHealing', '5'), 28800000);
  assert.equal(getSpeedupDuration('speedUpConstruction', 99), null);
});

test('clanVersusData exports 9 chest rewards, thresholds, challenge maps, and rounds', () => {
  assert.equal(clanVersusRewards[1].gold, 30000);
  assert.equal(clanVersusRewards[9].energy, 1000);

  assert.equal(clanVersusChestThresholds[1], 25000);
  assert.equal(clanVersusChestThresholds[9], 4500000);

  assert.equal(clanVersusChallengeNames[7], 'Defeat 1 Map Monster (Lv. 1+)');
  assert.equal(clanVersusChallengePoints[7], 2000);
  assert.equal(clanVersusChallengeSteps[7], 1);

  assert.equal(clanVersusChallengeNames[9], 'Gather 3,000 Food on Map');
  assert.equal(clanVersusChallengePoints[9], 10);
  assert.equal(clanVersusChallengeSteps[9], 3000);

  assert.equal(clanVersusRoundQuests[1].theme, 'Radar Training & Titan Power');
  assert.equal(clanVersusRoundQuests[6].theme, 'Grand Finale & PvP Clash');
  assert.ok(clanVersusRoundQuests[1].quests.length > 0);
});
