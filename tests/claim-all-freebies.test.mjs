import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeAutoClaim,
  getPendingClaims,
  buildAutoClaimCalls,
  getUserVipLevel,
  canClaimDailyBonusVip,
} from '../src/utils/popupData.ts';
import { setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';

test('normalizeAutoClaim keeps separated freebie channels with opt-out defaults', () => {
  const defaults = normalizeAutoClaim();
  assert.equal(defaults.mail, true);
  assert.equal(defaults.reports, true);
  assert.equal(defaults.quests, true);
  assert.equal(defaults.attentionBonuses, true);
  assert.equal(defaults.videoBoxes, true);
  assert.equal(defaults.alchemySpin, true);
  assert.equal(defaults.airshipGift, true);
  assert.equal(defaults.dailyBonus, true);
  assert.equal(defaults.freeOffers, true);
  assert.equal(defaults.onOpen, false);

  const custom = normalizeAutoClaim({
    mail: false,
    attentionBonuses: false,
    videoBoxes: false,
    freeOffers: false,
    onOpen: true,
  });
  assert.equal(custom.mail, false);
  assert.equal(custom.reports, true);
  assert.equal(custom.attentionBonuses, false);
  assert.equal(custom.videoBoxes, false);
  assert.equal(custom.freeOffers, false);
  assert.equal(custom.alchemySpin, true);
  assert.equal(custom.onOpen, true);
});

test('getPendingClaims detects all daily freebie reward channels', () => {
  const now = 1794736960000;
  const sampleCache = {
    mailStatus: {
      data: {
        hasUnclaimed: true,
        letters: [
          { id: 101, reward: { gold: 1000 }, claimed: false },
          { id: 102, reward: { stamina: 30 }, claimed: false },
        ],
      },
    },
    questGetAll: {
      data: [
        { id: 201, state: 2 },
        { id: 202, state: 1 },
      ],
    },
    attentionBonusStatus: {
      data: {
        bonuses: [
          { id: 1, collected: false, endTime: 0 },
          { id: 4, collected: false, endTime: 0 },
          { id: 13, collected: true, refreshTime: 0, endTime: 0 },
        ],
      },
    },
    cinemaGetCounters: {
      data: {
        placementViewed: 3,
        placementAvailable: 2,
        placementRewards: [
          { boxNum: 0 },
          { boxNum: 1 },
          { boxNum: 2 },
        ],
      },
    },
    'resource:refillable:53': {
      data: { amount: 1 },
      updatedAt: new Date(now).toISOString(),
    },
    zeppelinGiftGet: {
      data: { available: true },
    },
    dailyBonusGetInfo: {
      data: { availableToday: true },
    },
    offerGetAll: {
      data: [
        {
          id: 1000016972,
          isActive: true,
          offerType: 'progressiveBundle',
          clientData: { stage: 0 },
          offerData: {
            progressive: {
              slot: [
                [{ freeReward: { stamina: 75, gold: 50000 } }],
                [106605],
              ],
            },
          },
        },
      ],
    },
  };

  const pending = getPendingClaims(sampleCache, now);
  assert.equal(pending.letterIds.length, 2);
  assert.equal(pending.hasReports, true);
  assert.equal(pending.questIds.length, 1);
  assert.deepEqual(pending.attentionBonusIds, [1, 4]);
  assert.deepEqual(pending.videoBoxNums, [3, 4]);
  assert.equal(pending.hasAlchemySpin, true);
  assert.equal(pending.hasAirshipGift, true);
  assert.equal(pending.hasDailyBonus, true);
  assert.deepEqual(pending.freeOfferIds, [1000016972]);
  // Total: 2 letters + 1 report + 1 quest + 2 chests + 2 video boxes + 1 alchemy + 1 airship + 1 daily bonus + 1 offer = 12
  assert.equal(pending.totalCount, 12);
});

test('buildAutoClaimCalls generates calls for enabled freebie channels and syncs resources', () => {
  const now = 1794736960000;
  const sampleCache = {
    attentionBonusStatus: {
      data: { bonuses: [{ id: 1, collected: false, endTime: 0 }] },
    },
    cinemaGetCounters: {
      data: {
        placementViewed: 4,
        placementAvailable: 1,
        placementRewards: [{ boxNum: 0 }, { boxNum: 1 }, { boxNum: 2 }, { boxNum: 3 }],
      },
    },
    'resource:refillable:53': {
      data: { amount: 1 },
      updatedAt: new Date(now).toISOString(),
    },
    zeppelinGiftGet: {
      data: { available: true },
    },
    dailyBonusGetInfo: {
      data: { availableToday: true },
    },
    offerGetAll: {
      data: [
        {
          id: 1000016955,
          isActive: true,
          offerType: 'progressiveBundle',
          clientData: { stage: 0 },
          offerData: {
            progressive: {
              slot: [
                [{ freeReward: { consumable: { '51': 1 }, gold: 15000 } }],
              ],
            },
          },
        },
      ],
    },
  };

  const { calls } = buildAutoClaimCalls(sampleCache, {
    mail: true,
    reports: true,
    quests: true,
    attentionBonuses: true,
    videoBoxes: true,
    alchemySpin: true,
    airshipGift: true,
    dailyBonus: true,
    freeOffers: true,
  }, now);

  const callNames = calls.map((c) => c.name);
  assert.ok(callNames.includes('attentionBonus_collectReward'));
  assert.ok(callNames.includes('cinemaGiveReward'));
  assert.ok(callNames.includes('refillable_alchemyUseVideo'));
  assert.ok(callNames.includes('zeppelinGiftGet'));
  assert.ok(callNames.includes('dailyBonusFarm'));
  assert.ok(callNames.includes('dailyBonusGetInfo'));
  assert.ok(callNames.includes('offerFarmReward'));
  assert.ok(callNames.includes('userGetInfo'));
  assert.ok(callNames.includes('refillableGetAll'));
  assert.ok(callNames.includes('inventoryGet'));
  assert.ok(callNames.includes('cinemaGetCounters'));
  assert.ok(callNames.includes('offerGetAll'));

  const dailyBonusCall = calls.find((c) => c.name === 'dailyBonusFarm');
  assert.deepEqual(dailyBonusCall.args, {});

  const offerFarmCall = calls.find((c) => c.name === 'offerFarmReward');
  assert.deepEqual(offerFarmCall.args, { offerId: 1000016955 });
});

test('buildAutoClaimCalls respects disabled options', () => {
  const now = 1794736960000;
  const sampleCache = {
    attentionBonusStatus: {
      data: { bonuses: [{ id: 1, collected: false, endTime: 0 }] },
    },
    cinemaGetCounters: {
      data: {
        placementViewed: 4,
        placementAvailable: 1,
        placementRewards: [{ boxNum: 0 }, { boxNum: 1 }, { boxNum: 2 }, { boxNum: 3 }],
      },
    },
    zeppelinGiftGet: { data: { available: true } },
  };

  const { calls } = buildAutoClaimCalls(sampleCache, {
    attentionBonuses: false,
    videoBoxes: true,
    airshipGift: false,
  }, now);

  const callNames = calls.map((c) => c.name);
  assert.equal(callNames.includes('attentionBonus_collectReward'), false);
  assert.equal(callNames.includes('zeppelinGiftGet'), false);
  assert.equal(callNames.includes('cinemaGiveReward'), true);
});

test('buildAutoClaimCalls sets vip arg only when user VIP level satisfies daily requirement', () => {
  const now = 1794736960000;
  // Day 21 requires VIP 13 (40,000 points)
  const highVipCache = {
    userGetInfo: {
      data: { vipPoints: 50000 },
    },
    dailyBonusGetInfo: {
      data: { currentDay: 21, availableToday: true, availableVip: true },
    },
  };
  const { calls: highCalls } = buildAutoClaimCalls(highVipCache, { dailyBonus: true }, now);
  const highVipCall = highCalls.find((c) => c.name === 'dailyBonusFarm');
  assert.ok(highVipCall);
  assert.deepEqual(highVipCall.args, { vip: 1 });

  // Insufficient VIP (e.g. VIP 3 with 350 points on Day 21 which requires VIP 13)
  const lowVipCache = {
    userGetInfo: {
      data: { vipPoints: 350 },
    },
    dailyBonusGetInfo: {
      data: { currentDay: 21, availableToday: true, availableVip: true },
    },
  };
  const { calls: lowCalls } = buildAutoClaimCalls(lowVipCache, { dailyBonus: true }, now);
  const lowVipCall = lowCalls.find((c) => c.name === 'dailyBonusFarm');
  assert.ok(lowVipCall);
  assert.deepEqual(lowVipCall.args, {}, 'Must safely omit vip arg when user VIP level is insufficient');

  // Sufficient VIP for Day 5 (requires VIP 3, player has 350 points -> VIP 3)
  const day5Cache = {
    userGetInfo: {
      data: { vipPoints: 350 },
    },
    dailyBonusGetInfo: {
      data: { currentDay: 5, availableToday: true, availableVip: true },
    },
  };
  const { calls: day5Calls } = buildAutoClaimCalls(day5Cache, { dailyBonus: true }, now);
  const day5Call = day5Calls.find((c) => c.name === 'dailyBonusFarm');
  assert.ok(day5Call);
  assert.deepEqual(day5Call.args, { vip: 1 });

  // When availableVip is false
  const noVipCache = {
    userGetInfo: {
      data: { vipPoints: 50000 },
    },
    dailyBonusGetInfo: {
      data: { currentDay: 21, availableToday: true, availableVip: false },
    },
  };
  const { calls: noVipCalls } = buildAutoClaimCalls(noVipCache, { dailyBonus: true }, now);
  const noVipCall = noVipCalls.find((c) => c.name === 'dailyBonusFarm');
  assert.ok(noVipCall);
  assert.deepEqual(noVipCall.args, {});
});

test('backgroundRuntime accepts all freebie claims in claim-rewards envelope', async () => {
  const local = {
    popupRpcEnabled: true,
    socketRefreshMode: 'direct',
  };
  const fakeCr = {
    runtime: { id: 'test-ext-id' },
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.map((k) => [k, local[k]])),
        set: async () => {},
        remove: async () => {},
      },
    },
    tabs: {
      query: (filter, cb) => cb([{ id: 100 }]),
      sendMessage: async () => ({ ok: true }),
    },
  };

  let listener = null;
  fakeCr.runtime.onMessage = {
    addListener: (fn) => { listener = fn; },
  };

  setupBackgroundRuntime({ chrome: fakeCr });

  const claimMessage = {
    kind: 'claim-rewards',
    calls: [
      { name: 'attentionBonus_collectReward', args: { id: 1 } },
      { name: 'cinemaGiveReward', args: { type: 'firstPlacement', boxNum: 4 } },
      { name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } },
      { name: 'zeppelinGiftGet', args: {} },
      { name: 'dailyBonusFarm', args: { vip: 1 } },
      { name: 'dailyBonusGetInfo', args: {} },
      { name: 'dailyBonus_claim', args: {} },
      { name: 'offerFarmReward', args: { offerId: 1000016955 } },
      { name: 'userGetInfo', args: {} },
      { name: 'refillableGetAll', args: { getAt: Date.now() }, feature: 'refillable' },
      { name: 'inventoryGet', args: {} },
      { name: 'cinemaGetCounters', args: {} },
      { name: 'offerGetAll', args: {} },
    ],
  };

  const sender = { url: `chrome-extension://${fakeCr.runtime.id}/popup.html` };
  const response = await new Promise((resolve) => listener(claimMessage, sender, resolve));
  assert.equal(response.ok, true);
});

test('SettingsTab.vue contains separate checkboxes for every freebie group and preserves legacy IDs', () => {
  const settingsTabPath = path.resolve('src/components/tabs/SettingsTab.vue');
  const content = fs.readFileSync(settingsTabPath, 'utf8');

  // Verify all 9 separated freebie group checkbox IDs
  assert.ok(content.includes('id="autoclaim-opt-mail"'), 'mail checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-reports"'), 'reports checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-quests"'), 'quests checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-attention-bonuses"'), 'attention-bonuses checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-video-boxes"'), 'video-boxes checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-alchemy-spin"'), 'alchemy-spin checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-airship-gift"'), 'airship-gift checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-daily-bonus"'), 'daily-bonus checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-free-offers"'), 'free-offers checkbox ID must exist');
  assert.ok(content.includes('id="autoclaim-opt-on-open"'), 'on-open trigger checkbox ID must exist');
  assert.ok(content.includes('id="btn-claim-all"'), 'claim all button ID must exist');
});

test('DashboardTab.vue and ClaimAllFreebiesButton.vue provide dashboard claim integration', () => {
  const dashboardTabPath = path.resolve('src/components/dashboard/DashboardTab.vue');
  const dashContent = fs.readFileSync(dashboardTabPath, 'utf8');
  assert.ok(dashContent.includes('ClaimAllFreebiesButton'), 'DashboardTab must mount ClaimAllFreebiesButton');

  const buttonPath = path.resolve('src/components/dashboard/ClaimAllFreebiesButton.vue');
  const buttonContent = fs.readFileSync(buttonPath, 'utf8');
  assert.ok(buttonContent.includes('id="dashboard-claim-all-freebies"'), 'button ID must be dashboard-claim-all-freebies');
  assert.ok(buttonContent.includes('id="dashboard-claim-all-freebies-badge"'), 'badge ID must exist');
});

test('getPendingClaims and buildAutoClaimCalls include cinema video tickets', () => {
  const cacheWithTickets = {
    cinemaGetCounters: {
      data: {
        viewed: 2,
        available: 6,
        placementViewed: 5,
        placementAvailable: 0,
        placementRewards: [
          { boxNum: 0 }, { boxNum: 1 }, { boxNum: 2 }, { boxNum: 3 }, { boxNum: 4 }
        ]
      }
    }
  };

  const pending = getPendingClaims(cacheWithTickets);
  assert.equal(pending.videoBoxNums.length, 0, 'All video boxes claimed');
  assert.equal(pending.videoTicketCount, 6, 'Should detect 6 available video tickets');

  const { calls } = buildAutoClaimCalls(cacheWithTickets, { videoBoxes: true });
  const ticketCalls = calls.filter((c) => c.name === 'cinemaGiveReward' && c.args?.type === 'cinema');
  assert.equal(ticketCalls.length, 6, 'Must generate 6 cinemaGiveReward calls with type cinema');
});

test('getPendingClaims ignores empty/zero Frontier chest rewards (claim_null prevention)', () => {
  // Case 1: Empty coin 0 reward as seen in actual tracking logs (hwa-game-record-202611221718_claim_null.json)
  const emptyChestCache = {
    eternalStoryChestStatus: {
      data: {
        reward: { coin: { '23': 0 } },
        filled_in_percents: 0,
        collected_at: 1795342723
      }
    }
  };
  const pendingEmpty = getPendingClaims(emptyChestCache);
  assert.equal(pendingEmpty.hasFrontierRewards, false, 'Must not report hasFrontierRewards when reward amount is 0 and filled_in_percents is 0');
  const { calls: emptyCalls } = buildAutoClaimCalls(emptyChestCache, { frontierRewards: true });
  const collectCalls = emptyCalls.filter((c) => c.name === 'eternalStory_collectChest');
  assert.equal(collectCalls.length, 0, 'Must not dispatch eternalStory_collectChest when chest is empty');

  // Case 2: Legitimate Frontier reward with non-zero coin
  const realChestCache = {
    eternalStoryChestStatus: {
      data: {
        reward: { coin: { '23': 25 } },
        filled_in_percents: 0,
        collected_at: 1795342723
      }
    }
  };
  const pendingReal = getPendingClaims(realChestCache);
  assert.equal(pendingReal.hasFrontierRewards, true, 'Must report hasFrontierRewards when reward contains positive coins');
  const { calls: realCalls } = buildAutoClaimCalls(realChestCache, { frontierRewards: true });
  assert.ok(realCalls.some((c) => c.name === 'eternalStory_collectChest'));

  // Case 3: Filled percentage > 0
  const filledPercentCache = {
    eternalStoryChestStatus: {
      data: {
        reward: {},
        filled_in_percents: 50,
        collected_at: 1795342723
      }
    }
  };
  const pendingPercent = getPendingClaims(filledPercentCache);
  assert.equal(pendingPercent.hasFrontierRewards, true, 'Must report hasFrontierRewards when filled_in_percents > 0');
});
