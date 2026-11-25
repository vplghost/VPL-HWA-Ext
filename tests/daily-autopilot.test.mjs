import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  resolveDailyResetAnchor,
  buildDailyExecutionPlan,
  computeExpeditionNextWakeMs,
  computeFreeGiftStripItems,
  mergeActivityWithAutopilotState,
  DEFAULT_DAILY_STEP_ORDER,
  HIGH_RISK_ACTIVITIES,
} from '../src/services/dailyAutopilotService.ts';

const root = resolve(process.cwd());

test('resolveDailyResetAnchor prioritizes override -> questResetStatus -> eventReset -> timezone -> 02:00 UTC (09:00 UTC+7) fallback', () => {
  const now = Date.UTC(2026, 10, 25, 1, 0, 0); // 2026-11-25 01:00 UTC (08:00 UTC+7)

  // Default fallback: 02:00 UTC (09:00 UTC+7)
  const fallback = resolveDailyResetAnchor({}, null, now);
  assert.equal(fallback.source, 'default-02utc');
  assert.equal(fallback.formattedUtc, '02:00 UTC');
  assert.equal(fallback.nextResetMs, Date.UTC(2026, 10, 25, 2, 0, 0));

  // questResetStatus.nextDayAt takes priority over default
  const serverNext = Date.UTC(2026, 10, 25, 2, 0, 0);
  const fromQuest = resolveDailyResetAnchor(
    { questResetStatus: { data: { nextDayAt: serverNext } } },
    null,
    now
  );
  assert.equal(fromQuest.source, 'questResetStatus');
  assert.equal(fromQuest.nextResetMs, serverNext);

  // Account timezone offset (+7h = 25200s -> 05:00 local = 22:00 UTC)
  const fromTz = resolveDailyResetAnchor(
    { settingsGetAll: { data: { timeZone: 25200 } } },
    null,
    now
  );
  assert.equal(fromTz.source, 'accountTimezone');
  assert.equal(fromTz.formattedUtc, '22:00 UTC');

  // Manual override takes highest priority
  const fromOverride = resolveDailyResetAnchor(
    { questResetStatus: { data: { nextDayAt: serverNext } } },
    { resetOverrideUtcMinutes: 150 }, // 02:30 UTC
    now
  );
  assert.equal(fromOverride.source, 'override');
  assert.equal(fromOverride.formattedUtc, '02:30 UTC');
});

test('buildDailyExecutionPlan places high-risk activities at bottom and skips them by default', () => {
  // Verify high-risk steps are at the end of default order
  const tail = DEFAULT_DAILY_STEP_ORDER.slice(-4);
  assert.deepEqual(tail, ['hydra', 'arena', 'grand-arena', 'dungeon']);
  for (const id of tail) assert.ok(HIGH_RISK_ACTIVITIES.has(id));

  const plan = buildDailyExecutionPlan({}, {});
  const byId = Object.fromEntries(plan.map((s) => [s.id, s]));
  assert.equal(byId.freebies.shouldRun, true);
  assert.equal(byId.expeditions.shouldRun, true);
  assert.equal(byId.arena.shouldRun, false);
  assert.equal(byId['grand-arena'].shouldRun, false);
  assert.equal(byId.dungeon.shouldRun, false);
  assert.equal(byId.hydra.shouldRun, false);

  // Explicit opt-in for Arena runs it while keeping Dungeon skipped
  const optInPlan = buildDailyExecutionPlan({ skippedSteps: { arena: false } }, {});
  assert.equal(optInPlan.find((s) => s.id === 'arena').shouldRun, true);
  assert.equal(optInPlan.find((s) => s.id === 'dungeon').shouldRun, false);
});

test('computeExpeditionNextWakeMs schedules single earliest finish + 5s buffer without polling', () => {
  const now = 1_795_000_000_000;
  const wake = computeExpeditionNextWakeMs(
    {
      expeditionGet: {
        data: [
          { id: 1, endTime: Math.floor((now + 3600_000) / 1000) },
          { id: 2, endTime: Math.floor((now + 600_000) / 1000) },
          { id: 3, endTime: Math.floor((now - 10_000) / 1000) },
        ],
      },
    },
    now
  );
  assert.equal(wake, now + 600_000 + 5000);
  assert.equal(computeExpeditionNextWakeMs({}, now), null);
});

test('computeFreeGiftStripItems splits all 7 free gift groups with isolated error and disabled states', () => {
  const now = 1_795_000_000_000;
  const items = computeFreeGiftStripItems(
    {
      cinemaGetCounters: { data: { placementViewed: 2, viewed: 8 } },
      zeppelinGiftGet: { data: { available: true } },
      heroChest_getInfo: { data: { videoCooldown: Math.floor(now / 1000) - 10 } },
    },
    now,
    {
      hasGameTab: true,
      errorMap: { zeppelinGift: 'RPC timeout' },
    }
  );
  assert.equal(items.length, 7);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  assert.equal(byId.videoBoxes.state, 'available');
  assert.equal(byId.videoBoxes.count, 3);
  assert.equal(byId.videoBoxes.disabled, false);

  assert.equal(byId.videoTickets.state, 'done');
  assert.equal(byId.videoTickets.disabled, true);

  // Error in zeppelinGift is isolated and does NOT break videoBoxes
  assert.equal(byId.zeppelinGift.state, 'error');
  assert.equal(byId.zeppelinGift.badgeText, '!');
  assert.match(byId.zeppelinGift.tooltip, /RPC timeout/);

  // Heroic Chest Video tracks readiness from heroChest_getInfo.videoCooldown (read-only until open RPC verified)
  assert.equal(byId.heroicChestVideo.state, 'available');
  assert.equal(byId.heroicChestVideo.clickable, false);
  assert.equal(byId.heroicChestVideo.disabled, true);
});

test('mergeActivityWithAutopilotState supports running, waiting, skipped, error, and done statuses', () => {
  const base = { id: 'expeditions', state: 'pending', detail: '1 active' };
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'running', detail: 'Collecting' }).state, 'running');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'waiting', waitingUntil: Date.now() + 60000 }).state, 'waiting');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'error', error: 'Timeout' }).state, 'error');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'skipped', detail: 'High-risk skipped' }).state, 'skipped');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'done', completedAt: Date.now() }).state, 'done');
});

test('ActivityGoals, FreeGiftsStrip, and SettingsTab wire Daily Autopilot controls cleanly', async () => {
  const activitySrc = await readFile(resolve(root, 'src/components/dashboard/ActivityGoals.vue'), 'utf8');
  assert.ok(activitySrc.includes('id="btn-daily-autopilot-toggle"'));
  assert.ok(activitySrc.includes('id="daily-autopilot-status"'));
  assert.ok(activitySrc.includes('<FreeGiftsStrip'));

  const stripSrc = await readFile(resolve(root, 'src/components/dashboard/FreeGiftsStrip.vue'), 'utf8');
  assert.ok(stripSrc.includes('id="dashboard-free-gifts-strip"'));
  assert.ok(stripSrc.includes('free-gift-chip-'));

  const settingsSrc = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.ok(settingsSrc.includes('id="settings-daily-autopilot"'));
  assert.ok(settingsSrc.includes('id="setting-daily-autopilot-skip-high-risk"'));
});
