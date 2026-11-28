import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AUTO_ENERGY_BURN_ALARM_NAME,
  computeExactRefillWakeAt,
  evaluateWorldEnergyMonsterFallback,
  planCampaignEnergyBurn,
} from '../src/services/energyAutoBurnService.ts';
import { runAutoEnergyBurn } from '../src/background/backgroundRuntime.ts';
import { computeActiveAutomations, AUTOMATION_STORAGE_KEYS } from '../src/composables/useActiveAutomations.ts';
import { CONFIG_KEYS } from '../src/utils/dataBackup.ts';

function makeEnergyCache(amount, cap = 180, now = 1_800_000_000_000) {
  return {
    'resource:energy': {
      data: {
        amount,
        cap,
        lastRefillAt: now,
        refillEveryMs: 360_000, // 6 min per 1 energy
        refillAmount: 1,
      },
    },
    missionGetAll: {
      data: {
        // Mission 10 (6⚡ normal) and Mission 11 (6⚡ normal) cleared with 3★
        '10': { id: 10, stars: 3, triesSpent: 0 },
        '11': { id: 11, stars: 3, triesSpent: 0 },
      },
    },
  };
}

test('P3-09: planCampaignEnergyBurn preserves over-cap user energy (> cap) and schedules exact zero-polling wake below threshold', () => {
  const now = 1_800_000_000_000;

  // 1. Over-cap energy (450 / 180) -> strictly preserved, 0 calls
  const overCapCache = makeEnergyCache(450, 180, now);
  const overCapPlan = planCampaignEnergyBurn(
    overCapCache,
    {},
    { enabled: true, campaignTriggerPct: 90, fallbackMissionIds: [10] },
    now
  );
  assert.equal(overCapPlan.action, 'over_cap_preserved');
  assert.equal(overCapPlan.calls.length, 0);
  assert.equal(overCapPlan.plannedRaids, 0);

  // 2. Below threshold (150 < ceil(180*0.9)=162) -> wait with exact wake at +12 ticks * 6m + 5s
  const belowCache = makeEnergyCache(150, 180, now);
  const waitPlan = planCampaignEnergyBurn(
    belowCache,
    {},
    { enabled: true, campaignTriggerPct: 90, fallbackMissionIds: [10] },
    now
  );
  assert.equal(waitPlan.action, 'wait');
  assert.equal(waitPlan.calls.length, 0);
  assert.equal(waitPlan.nextWakeAt, now + 12 * 360_000 + 5000);
});

test('P3-09: planCampaignEnergyBurn burns within [triggerTarget, cap], respects reserve, maxRaidsPerTick, disabled missions, and 0-Emerald safety', () => {
  const now = 1_800_000_000_000;
  // Energy = 170 / 180 (>= 162 trigger, <= 180 cap)
  const cache = makeEnergyCache(170, 180, now);

  // Mission 10 is disabled -> falls back to Mission 11
  const plan = planCampaignEnergyBurn(
    cache,
    { campaign_disabled_missions: [10] },
    {
      enabled: true,
      campaignTriggerPct: 90,
      campaignReserveEnergy: 30,
      campaignMaxRaidsPerTick: 4,
      useFavoriteSoulMissionsFirst: false,
      fallbackMissionIds: [10, 11],
    },
    now
  );

  assert.equal(plan.action, 'burn');
  // Mission 11 is a Heroic mission (maxTries = 3), so plannedRaids is clamped to 3 even though campaignMaxRaidsPerTick = 4
  assert.equal(plan.plannedRaids, 3);
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].missionId, 11);
  assert.equal(plan.calls.filter((c) => c.name === 'missionRaid').length, 3);
  assert.equal(
    plan.calls.some((c) => /starmoney|emerald|buyEnergy|bottle|consumable/i.test(JSON.stringify(c))),
    false
  );

  // Error backoff respected
  const backoffPlan = planCampaignEnergyBurn(
    cache,
    { energyAutoBurnState: { nextRetryAt: now + 600_000 } },
    { enabled: true, fallbackMissionIds: [11] },
    now
  );
  assert.equal(backoffPlan.action, 'backoff');
  assert.equal(backoffPlan.calls.length, 0);
  assert.equal(backoffPlan.nextWakeAt, now + 600_000);
});

test('P3-09: evaluateWorldEnergyMonsterFallback preserves over-cap World Energy, yields to raidEnergyAuto, and starts monster fallback in [trigger, cap]', () => {
  const now = 1_800_000_000_000;
  const baseWorldCache = (amount, cap = 200) => ({
    'resource:world-energy': {
      data: { amount, cap, lastRefillAt: now, refillEveryMs: 360_000, refillAmount: 1 },
    },
    heroGetAll: {
      data: {
        1: { id: 1, power: 50000 },
        2: { id: 2, power: 49000 },
        3: { id: 3, power: 48000 },
        4: { id: 4, power: 47000 },
        5: { id: 5, power: 46000 },
      },
    },
  });
  const prefs = {
    monsterPreferences: { mapId: 1, center: { x: 100, y: 100 }, mobLevel: 15 },
  };

  // 1. Over-cap World Energy (320 / 200) -> preserved
  const overCap = evaluateWorldEnergyMonsterFallback(
    baseWorldCache(320, 200),
    prefs,
    { enabled: true, worldFallbackEnabled: true, worldTriggerPct: 90 },
    now
  );
  assert.equal(overCap.action, 'over_cap_preserved');
  assert.equal(overCap.attacks, 0);

  // 2. Yields when raidEnergyAuto is enabled
  const yielding = evaluateWorldEnergyMonsterFallback(
    baseWorldCache(190, 200),
    { ...prefs, raidEnergyAuto: { enabled: true } },
    { enabled: true, worldFallbackEnabled: true, worldTriggerPct: 90 },
    now
  );
  assert.equal(yielding.action, 'raid_auto_active');

  // 3. Within [180, 200] with reserve 30 and max 5 -> starts 5 solo monster attacks
  const startPlan = evaluateWorldEnergyMonsterFallback(
    baseWorldCache(190, 200),
    prefs,
    { enabled: true, worldFallbackEnabled: true, worldTriggerPct: 90, worldReserveEnergy: 30, worldMaxAttacksPerTick: 5 },
    now
  );
  assert.equal(startPlan.action, 'start_monster');
  assert.equal(startPlan.attacks, 5);
  assert.equal(startPlan.monsterOptions?.count, 5);
});

test('P3-09: runAutoEnergyBurn schedules single zero-polling alarm, preserves over-cap, and wires UI/ActiveAutomations/CONFIG_KEYS', async () => {
  const now = Date.now();
  const storageState = {
    energyAutoBurnSettings: {
      enabled: true,
      campaignEnabled: true,
      campaignTriggerPct: 90,
      campaignReserveEnergy: 30,
      campaignMaxRaidsPerTick: 2,
      useFavoriteSoulMissionsFirst: false,
      fallbackMissionIds: [10],
      worldFallbackEnabled: false,
    },
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
    rpcCache: makeEnergyCache(170, 180, now),
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
        cb([{ id: 55, url: 'https://www.hero-wars-alliance.com/', active: true }]);
      },
      async sendMessage(tabId, msg) {
        sentMessages.push({ tabId, msg });
        return { ok: true, results: [] };
      },
    },
  };

  const res = await runAutoEnergyBurn(true, mockChrome);
  assert.equal(res.ok, true);
  assert.equal(res.campaignAction, 'burn');
  assert.equal(sentMessages.length, 1);
  assert.equal(createdAlarms.length, 1);
  assert.equal(createdAlarms[0].name, AUTO_ENERGY_BURN_ALARM_NAME);

  // ActiveAutomations & CONFIG_KEYS & SettingsTab selectors
  assert.ok(CONFIG_KEYS.includes('energyAutoBurnSettings'));
  assert.ok(AUTOMATION_STORAGE_KEYS.includes('energyAutoBurnSettings'));
  const active = computeActiveAutomations({ energyAutoBurnSettings: { enabled: true }, energyAutoBurnState: {} });
  const item = active.find((a) => a.id === 'energy-burn');
  assert.ok(item);
  assert.equal(item.storageDisableKey?.patch?.enabled, false);

  const settingsVue = await readFile(resolve('src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.match(settingsVue, /id="settings-auto-energy-burn-section"/);
  assert.match(settingsVue, /id="setting-auto-energy-burn"/);
  assert.match(settingsVue, /id="setting-energy-burn-campaign-pct"/);
  assert.match(settingsVue, /id="setting-energy-burn-world-fallback"/);

  // Sanity check computeExactRefillWakeAt
  const wake = computeExactRefillWakeAt(
    { data: { amount: 100, cap: 180, lastRefillAt: now, refillEveryMs: 360_000, refillAmount: 1 } },
    162,
    now
  );
  assert.equal(wake, now + 62 * 360_000 + 5000);
});
