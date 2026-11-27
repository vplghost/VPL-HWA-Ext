import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  resolveDailyResetAnchor,
  buildDailyExecutionPlan,
  computeExpeditionNextWakeMs,
  computeHeroicChestNextWakeMs,
  computeRealmProductionPending,
  computeFreeGiftStripItems,
  mergeActivityWithAutopilotState,
  DEFAULT_DAILY_STEP_ORDER,
  HIGH_RISK_ACTIVITIES,
} from '../src/services/dailyAutopilotService.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';
import { towerActivityState, arenaActivityState } from '../src/composables/activityState.ts';

const root = resolve(process.cwd());

test('resolveDailyResetAnchor aligns with Event Daily Quest reset (02:00 UTC / 09:00 UTC+7) and ignores 05:00 personal daily reset', () => {
  const now = Date.UTC(2026, 10, 25, 1, 0, 0); // 2026-11-25 01:00 UTC (08:00 UTC+7)

  // Default fallback: 02:00 UTC (09:00 UTC+7)
  const fallback = resolveDailyResetAnchor({}, null, now);
  assert.equal(fallback.source, 'default-02utc');
  assert.equal(fallback.formattedUtc, '02:00 UTC');
  assert.equal(fallback.nextResetMs, Date.UTC(2026, 10, 25, 2, 0, 0));

  // Personal daily reset (questResetStatus.nextDayAt at 22:00 UTC / 05:00 UTC+7) & account timezone MUST be ignored
  const personalReset = Date.UTC(2026, 10, 25, 22, 0, 0);
  const ignoringPersonal = resolveDailyResetAnchor(
    {
      questResetStatus: { data: { nextDayAt: personalReset } },
      userGetInfo: { data: { timeZone: 7 } },
    },
    null,
    now
  );
  assert.equal(ignoringPersonal.source, 'default-02utc');
  assert.equal(ignoringPersonal.formattedUtc, '02:00 UTC');
  assert.equal(ignoringPersonal.nextResetMs, Date.UTC(2026, 10, 25, 2, 0, 0));

  // Verified battlePass_getAll[].nextDayTime (1795658400 = 2026-11-26T02:00:00Z) takes priority over events & default
  const fromBp = resolveDailyResetAnchor(
    {
      questResetStatus: { data: { nextDayAt: personalReset } },
      battlePass_getAll: { data: [{ id: 177, nextDayTime: 1795658400 }] },
    },
    null,
    now
  );
  assert.equal(fromBp.source, 'battlePassNextDay');
  assert.equal(fromBp.formattedUtc, '02:00 UTC');
  assert.equal(fromBp.nextResetMs, 1795658400 * 1000);

  // Verified getSpecialQuestState:quest daily event start (1795399200000 = 2026-11-23T02:00:00Z) rolls forward to 2026-11-25T02:00:00Z
  const fromEvent = resolveDailyResetAnchor(
    {
      'getSpecialQuestState:quest': {
        data: {
          events: [
            {
              id: 100402,
              start: 1795399200000,
              end: 1797818400000,
              groups: [{ id: 1425, repeatType: 'daily', quests: [] }],
            },
          ],
        },
      },
    },
    null,
    now
  );
  assert.equal(fromEvent.source, 'eventReset');
  assert.equal(fromEvent.formattedUtc, '02:00 UTC');
  assert.equal(fromEvent.nextResetMs, Date.UTC(2026, 10, 25, 2, 0, 0));

  // Manual override takes highest priority
  const fromOverride = resolveDailyResetAnchor(
    { battlePass_getAll: { data: [{ id: 177, nextDayTime: 1795658400 }] } },
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

test('computeFreeGiftStripItems splits all 8 free gift groups with isolated error and disabled states', () => {
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
  assert.equal(items.length, 8);
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

  // Heroic Chest Video is clickable when 24h cooldown expired and shows 30m window tooltip
  assert.equal(byId.heroicChestVideo.state, 'available');
  assert.equal(byId.heroicChestVideo.clickable, true);
  assert.equal(byId.heroicChestVideo.disabled, false);

  // Cooldown active -> disabled + next wake timestamp scheduled (+5s)
  const futureCdSec = Math.floor(now / 1000) + 86400;
  const cdCache = { heroChest_getInfo: { data: { videoCooldown: futureCdSec, opensCount: 114 } } };
  const cdItems = computeFreeGiftStripItems(cdCache, now, { hasGameTab: true });
  const cdHeroic = cdItems.find((i) => i.id === 'heroicChestVideo');
  assert.equal(cdHeroic.state, 'done');
  assert.equal(cdHeroic.disabled, true);
  assert.equal(computeHeroicChestNextWakeMs(cdCache, now), futureCdSec * 1000 + 5000);

  // rpcCache syncs heroChest_openChest response into heroChest_getInfo.videoCooldown immediately
  const merged = rpcCacheService.merge({}, [{
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-25T15:39:56.519Z',
    requestBody: JSON.stringify({
      calls: [{ name: 'heroChest_openChest', args: { count: 1, free: true, video: true, costId: '' }, ident: 'hc1' }],
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'hc1', result: { response: { cost: [], opensCount: 114, videoCooldown: 1795707596 } } }],
    }),
  }]).cache;
  assert.equal(merged.heroChest_getInfo?.data?.videoCooldown, 1795707596);
  assert.equal(merged.heroChest_getInfo?.data?.opensCount, 114);
});

test('mergeActivityWithAutopilotState supports running, waiting, skipped, error, and done statuses and prioritizes card done over autopilot skipped', () => {
  const base = { id: 'expeditions', title: 'Expeditions', state: 'pending', detail: '1 active' };
  const running = mergeActivityWithAutopilotState(base, { status: 'running', detail: 'Collecting' });
  assert.equal(running.state, 'running');
  assert.match(running.detail, /Running · 1 active/, 'Must preserve live card detail while running');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'waiting', waitingUntil: Date.now() + 60000 }).state, 'waiting');
  const errored = mergeActivityWithAutopilotState(base, { status: 'error', error: 'Timeout' });
  assert.equal(errored.state, 'error');
  assert.equal(errored.errorReason, 'Timeout');
  assert.match(errored.statusTooltip, /Timeout/);

  const skipped = mergeActivityWithAutopilotState(
    { id: 'arena', title: 'Arena', state: 'pending', detail: 'Rank 42 · 3/5 free (3 battles left today)' },
    { status: 'skipped', detail: 'High-risk skipped by default' }
  );
  assert.equal(skipped.state, 'skipped');
  assert.equal(skipped.detail, 'Rank 42 · 3/5 free (3 battles left today)', 'Skipped state must preserve live card progress');
  assert.equal(skipped.skipReason, 'High-risk skipped by default');
  assert.match(skipped.statusTooltip, /Skipped: High-risk skipped by default/);

  assert.equal(mergeActivityWithAutopilotState({ id: 'frontier', title: 'Frontier', state: 'info', detail: 'AFK chest checked' }, { status: 'done', completedAt: Date.now() }).state, 'done');
  assert.equal(mergeActivityWithAutopilotState(base, { status: 'done', completedAt: Date.now() }).state, 'pending', 'Pending card with live remaining work must not be forced to false done');

  // Card's own verified `done` state MUST win over autopilot `skipped`
  const doneCard = { id: 'tower', title: 'Tower', state: 'done', detail: 'Cleared today' };
  const mergedDone = mergeActivityWithAutopilotState(doneCard, { status: 'skipped', detail: 'Already cleared today' });
  assert.equal(mergedDone.state, 'done');
  assert.equal(mergedDone.detail, 'Cleared today');
});

test('towerActivityState and arenaActivityState expose clear live floor/free-token details and progress', () => {
  const now = Date.UTC(2026, 10, 26, 5, 0, 0);
  const ts = new Date(now - 1000).toISOString();

  // Tower reads floorData.floorNumber as well as floorNumber
  const tower = towerActivityState({ towerStatus: { updatedAt: ts, data: { floorData: { floorNumber: 18 } } } }, now);
  assert.equal(tower.state, 'pending');
  assert.equal(tower.detail, 'Floor 18 / 23');

  // Arena displays remaining free tokens (X/5 free) and progress %
  const arena = arenaActivityState(
    {
      'resource:refillable:6': { updatedAt: ts, data: { amount: 3 } },
      arenaGetAll: { updatedAt: ts, data: { arenaPlace: 42 } },
    },
    false,
    now
  );
  assert.equal(arena.state, 'pending');
  assert.match(arena.detail, /Rank 42 · 3\/5 free/);
  assert.equal(arena.progress, 40);

  // Already-done activities are marked alreadyDone in buildDailyExecutionPlan rather than generic skip
  const plan = buildDailyExecutionPlan(
    {},
    {
      towerStatus: { updatedAt: ts, data: { isCleared: true } },
      'resource:refillable:6': { updatedAt: ts, data: { amount: 0 } },
    },
    now
  );
  assert.equal(plan.find((s) => s.id === 'tower')?.alreadyDone, true);
  assert.equal(plan.find((s) => s.id === 'arena')?.alreadyDone, true);
});

test('ActivityGoals, FreeGiftsStrip, and SettingsTab wire Daily Autopilot controls cleanly', async () => {
  const activitySrc = await readFile(resolve(root, 'src/components/dashboard/ActivityGoals.vue'), 'utf8');
  assert.ok(activitySrc.includes('id="btn-daily-autopilot-toggle"'));
  assert.ok(activitySrc.includes('id="daily-autopilot-status"'));
  assert.ok(activitySrc.includes('<FreeGiftsStrip'));
  assert.ok(activitySrc.includes('`activity-card-${act.id}`'));
  assert.ok(activitySrc.includes('`activity-status-${act.id}`'));
  assert.ok(activitySrc.includes('`btn-activity-retry-${act.id}`'));
  assert.ok(activitySrc.includes('act.statusTooltip'));

  const stripSrc = await readFile(resolve(root, 'src/components/dashboard/FreeGiftsStrip.vue'), 'utf8');
  assert.ok(stripSrc.includes('id="dashboard-free-gifts-strip"'));
  assert.ok(stripSrc.includes('free-gift-chip-'));

  const settingsSrc = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.ok(settingsSrc.includes('id="settings-daily-autopilot"'));
  assert.ok(settingsSrc.includes('id="setting-daily-autopilot-skip-high-risk"'));
  assert.ok(settingsSrc.includes('id="settings-auto-collectors-section"'));
  assert.ok(settingsSrc.includes('Auto Freebies & Resource Collectors'));
  assert.ok(settingsSrc.includes('id="setting-auto-free-spin"'));
  assert.ok(settingsSrc.includes('id="setting-auto-frontier-rewards"'));
  assert.ok(settingsSrc.includes('id="setting-auto-realm-resources"'));
});

test('rpcCache preserves/updates lastCollectDate and computeRealmProductionPending enforces 60s min & 8h cap', async () => {
  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  const lastCollect = 1_795_631_435_636;
  const now2h = lastCollect + 2 * 3600 * 1000;

  // 1. getSummary:resourceProduction preserves lastCollectDate & version
  let cache = rpcCacheService.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-26T06:58:00.000Z',
    requestBody: JSON.stringify({
      calls: [{ ident: 'rp1', name: 'getSummary', feature: 'resourceProduction', args: {} }],
    }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'rp1',
        result: {
          response: {
            producers: [
              { id: 1, residents: [2], lastCollectDate: lastCollect, version: 336 },
              { id: 5, residents: [], lastCollectDate: lastCollect, version: 358 },
            ],
          },
        },
      }],
    }),
  }]).cache;

  assert.equal(cache.productionStatus.data.producers[0].lastCollectDate, lastCollect);
  assert.equal(cache.productionStatus.data.producers[1].lastCollectDate, lastCollect);

  // Add campaign progress so producer 5 (material 1) produces ratePerMinute > 0
  cache.missionProgressStatus = { data: { completed: [190] } };

  // 2. Under 60s elapsed -> 0 calls, chip state = done
  const tooSoon = computeRealmProductionPending(cache, lastCollect + 30_000);
  assert.equal(tooSoon.hasSummary, true);
  assert.equal(tooSoon.readyCount, 0);
  const soonChip = computeFreeGiftStripItems(cache, lastCollect + 30_000, { hasGameTab: true })
    .find((i) => i.id === 'realmResources');
  assert.equal(soonChip.state, 'done');
  assert.equal(soonChip.disabled, true);

  // 3. After 2h -> producer 5 has valid collectedAmount and RPC payload
  const pending2h = computeRealmProductionPending(cache, now2h);
  assert.equal(pending2h.readyCount, 1);
  assert.equal(pending2h.calls[0].name, 'collectResource');
  assert.equal(pending2h.calls[0].feature, 'resourceProduction');
  assert.equal(pending2h.calls[0].args.producerId, 5);
  assert.ok(pending2h.calls[0].args.collectedAmount > 6000);

  const readyChip = computeFreeGiftStripItems(cache, now2h, { hasGameTab: true })
    .find((i) => i.id === 'realmResources');
  assert.equal(readyChip.state, 'available');
  assert.equal(readyChip.count, 1);
  assert.equal(readyChip.disabled, false);

  // 4. Cap at 8h (24h elapsed produces exact same amount as 8h)
  const pending8h = computeRealmProductionPending(cache, lastCollect + 8 * 3600 * 1000);
  const pending24h = computeRealmProductionPending(cache, lastCollect + 24 * 3600 * 1000);
  assert.equal(pending24h.calls[0].args.collectedAmount, pending8h.calls[0].args.collectedAmount);

  // 5. Merging collectResource:resourceProduction updates lastCollectDate immediately
  cache = rpcCacheService.merge(cache, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-26T09:00:00.000Z',
    requestBody: JSON.stringify({
      calls: [{
        ident: 'rc1',
        name: 'collectResource',
        feature: 'resourceProduction',
        args: { producerId: 5, collectDate: now2h, collectedAmount: 6140 },
      }],
    }),
    responseBody: JSON.stringify({
      results: [{ ident: 'rc1', result: { response: {} } }],
    }),
  }]).cache;

  const updatedP5 = cache.productionStatus.data.producers.find((p) => p.id === 5);
  assert.equal(updatedP5.lastCollectDate, now2h);

  // 6. Background runtime wires hwa-auto-realm-resources & realm-resources-tick
  const bgSrc = await readFile(resolve(root, 'src/background/backgroundRuntime.ts'), 'utf8');
  assert.ok(bgSrc.includes('hwa-auto-realm-resources'));
  assert.ok(bgSrc.includes('realm-resources-tick'));
  assert.ok(bgSrc.includes('runRealmResourcesClaim'));
});


test('P1-21: Tower (boss floor 23 cleared across older entry) & Dungeon (exhausted or unwinnable) are marked done and excluded from Autopilot plan', async () => {
  const { towerActivityState, dungeonActivityState } = await import('../src/composables/activityState.ts');
  const now = Date.parse('2026-11-27T14:00:00Z');
  const t1 = '2026-11-27T13:50:00Z';
  const t2 = '2026-11-27T13:55:00Z';

  // Tower cleared at floor 23 in towerStatus, while newer magicTower_briefInfo has no rooms/isCleared
  const cache = {
    towerStatus: {
      updatedAt: t1,
      data: {
        floorNumber: 23,
        rooms: [{ type: 'boss_battle', state: 'room_completed' }],
      },
    },
    magicTower_briefInfo: {
      updatedAt: t2,
      data: { floorNumber: 23 },
    },
    dungeonStatus: {
      updatedAt: t2,
      data: {
        floorNumber: 120,
        dungeonActivity: 150,
        unwinnableFloor: 120,
        unwinnableDate: '2026-11-27',
        currentFloorDoors: [{ attackerType: 'water' }],
      },
    },
  };

  assert.equal(towerActivityState(cache, now).state, 'done', 'Tower must remain done when floor 23 boss was completed today');
  assert.equal(dungeonActivityState(cache, now).state, 'done', 'Dungeon must be done when current floor is marked unwinnable today');

  const plan = buildDailyExecutionPlan({ skipHighRiskByDefault: false }, cache, now);
  const towerStep = plan.find((s) => s.id === 'tower');
  const dungeonStep = plan.find((s) => s.id === 'dungeon');
  assert.equal(towerStep?.shouldRun, false);
  assert.equal(towerStep?.alreadyDone, true);
  assert.equal(dungeonStep?.shouldRun, false);
  assert.equal(dungeonStep?.alreadyDone, true);
});

test('P1-21: mergeActivityWithAutopilotState never mutates done cards and never forces false done on pending cards', () => {
  const doneRow = { id: 'tower', title: 'Tower', state: 'done', detail: 'Cleared today' };
  const mergedDone = mergeActivityWithAutopilotState(doneRow, { status: 'running', detail: 'Running Tower…' });
  assert.equal(mergedDone.state, 'done', 'Already-done card must never flip to running');
  assert.equal(mergedDone.detail, 'Cleared today');

  const pendingRow = { id: 'quests', title: 'Daily Quests', state: 'pending', detail: '3 daily quests remaining · 1 ready' };
  const mergedPending = mergeActivityWithAutopilotState(pendingRow, { status: 'done', detail: 'Quests synced', completedAt: Date.now() });
  assert.equal(mergedPending.state, 'pending', 'Pending card must NOT flip to false done after sync');
  assert.equal(mergedPending.detail, '3 daily quests remaining · 1 ready');
});
