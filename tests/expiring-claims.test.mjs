import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AUTO_EXPIRING_CLAIMS_ALARM_NAME,
  collectExpiringClaimPlan,
} from '../src/services/expiringClaimService.ts';
import { runAutoExpiringClaims } from '../src/background/backgroundRuntime.ts';
import { computeActiveAutomations, AUTOMATION_STORAGE_KEYS } from '../src/composables/useActiveAutomations.ts';
import { CONFIG_KEYS } from '../src/utils/dataBackup.ts';

test('P2-49: collectExpiringClaimPlan waits when > leadMinutes, claims <= leadMinutes, and skips expired items', () => {
  const now = 1_800_000_000_000;
  const nowSec = Math.floor(now / 1000);

  // 1. Timed Energy quest expiring in 45m (> 10m lead) -> wait, nextWakeAt = endTime - 10m
  const waitCache = {
    questGetAll: {
      data: [
        { id: 1001, state: 2, endTime: nowSec + 45 * 60 },
        { id: 1002, state: 2, endTime: nowSec - 60 }, // already expired -> ignored
      ],
    },
  };
  const waitPlan = collectExpiringClaimPlan(
    waitCache,
    { enabled: true, leadMinutes: 10, includeTimedQuests: true, includeDailyResetQuests: false, includeEventRewards: false },
    now
  );
  assert.equal(waitPlan.action, 'wait');
  assert.equal(waitPlan.calls.length, 0);
  assert.equal(waitPlan.upcomingItems.length, 1);
  assert.equal(waitPlan.nextWakeAt, (nowSec + 45 * 60) * 1000 - 10 * 60_000);

  // 2. Timed Energy quest expiring in 8m (<= 10m lead) + Event quest expiring in 5m -> claim both
  const dueCache = {
    questGetAll: {
      data: [{ id: 1001, state: 2, endTime: nowSec + 8 * 60 }],
    },
    specialQuestStatus: {
      data: {
        events: [
          {
            id: 500,
            endTime: nowSec + 5 * 60,
            groups: [
              {
                id: 501,
                localeKey: 'Event Milestone',
                quests: [{ id: 9001, state: 'ready', progress: 10, target: 10 }],
              },
            ],
          },
        ],
      },
    },
  };
  const duePlan = collectExpiringClaimPlan(
    dueCache,
    { enabled: true, leadMinutes: 10, includeTimedQuests: true, includeDailyResetQuests: false, includeEventRewards: true },
    now
  );
  assert.equal(duePlan.action, 'claim');
  assert.equal(duePlan.dueItems.length, 2);
  assert.equal(duePlan.calls[0].name, 'quest_multiFarm');
  assert.deepEqual(duePlan.calls[0].args, { questIds: [1001] });
  assert.equal(duePlan.calls[1].name, 'completeQuest');
  assert.deepEqual(duePlan.calls[1].args, { questId: 9001 });
  assert.equal(
    duePlan.calls.some((c) => /starmoney|emerald|buy/i.test(JSON.stringify(c))),
    false
  );
});

test('P2-49: runAutoExpiringClaims schedules single alarm, deduplicates claims, and wires Settings/ActiveAutomations/CONFIG_KEYS', async () => {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);

  const storageState = {
    expiringClaimSettings: {
      enabled: true,
      leadMinutes: 10,
      includeTimedQuests: true,
      includeDailyResetQuests: false,
      includeEventRewards: false,
    },
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: {
      questGetAll: {
        data: [
          { id: 2001, state: 2, endTime: nowSec + 6 * 60 },  // due now
          { id: 2002, state: 2, endTime: nowSec + 120 * 60 }, // upcoming -> wake at +110m
        ],
      },
    },
  };

  const createdAlarms = [];
  const sentMessages = [];
  const mockChrome = {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, storageState[k]]));
          return { ...storageState };
        },
        async set(patch) {
          Object.assign(storageState, patch);
        },
      },
    },
    alarms: {
      create(name, info) {
        createdAlarms.push({ name, info });
      },
      clear() {},
    },
    tabs: {
      query(_f, cb) {
        cb([{ id: 88, url: 'https://www.hero-wars-alliance.com/', active: true }]);
      },
      async sendMessage(tabId, msg) {
        sentMessages.push({ tabId, msg });
        return { ok: true, results: [] };
      },
    },
  };

  // First run: claims quest 2001 and schedules single alarm for quest 2002 (-10m)
  const r1 = await runAutoExpiringClaims(true, mockChrome);
  assert.equal(r1.ok, true);
  assert.equal(r1.claimed, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(createdAlarms.length, 1);
  assert.equal(createdAlarms[0].name, AUTO_EXPIRING_CLAIMS_ALARM_NAME);
  assert.equal(createdAlarms[0].info.when, (nowSec + 120 * 60) * 1000 - 10 * 60_000);

  // Second run immediately: dedupe prevents re-claiming quest 2001
  const r2 = await runAutoExpiringClaims(false, mockChrome);
  assert.equal(r2.ok, true);
  assert.equal(sentMessages.length, 1);

  // Wiring checks
  assert.ok(CONFIG_KEYS.includes('expiringClaimSettings'));
  assert.ok(AUTOMATION_STORAGE_KEYS.includes('expiringClaimSettings'));
  const active = computeActiveAutomations({ expiringClaimSettings: { enabled: true }, expiringClaimState: {} });
  const item = active.find((a) => a.id === 'expiring-claims');
  assert.ok(item);
  assert.equal(item.storageDisableKey?.patch?.enabled, false);

  const settingsVue = await readFile(resolve('src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsVue, /id="setting-auto-expiring-claims"/);
  assert.match(settingsVue, /id="setting-expiring-claims-lead-min"/);
});
