import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_MINE_TYPES,
  normalizeAutoGatherSettings,
  resolveNextMineType,
  countActiveMarches,
  isGameLoadRecord,
  isMarchReturnRecord,
  planAutoGather,
  autoGatherService,
} from '../src/services/queues/autoGather.ts';

import {
  fresh,
  gathering,
  blockedMineIds,
  skipMine,
  rpcFailure,
  sync,
  smartGatherService,
} from '../src/services/queues/smartGather.ts';

test('autoGatherService - settings normalization and rotation', () => {
  const defaults = normalizeAutoGatherSettings({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.smartEnabled, false);
  assert.equal(defaults.maxMarches, 3);
  assert.equal(defaults.mineLevel, 5);
  assert.equal(defaults.mineType, 'rotate');
  assert.equal(defaults.lastAutoMineType, null);

  const clamped = normalizeAutoGatherSettings({
    enabled: true,
    smartEnabled: true,
    maxMarches: 25, // Should clamp to 3 or max 10
    mineLevel: 'nearest',
    mineType: 'iron',
  });
  assert.equal(clamped.enabled, true);
  assert.equal(clamped.maxMarches, 3);
  assert.equal(clamped.mineLevel, 'nearest');
  assert.equal(clamped.mineType, 'iron');

  // Next mine rotation
  assert.equal(resolveNextMineType('stone'), 'stone');
  assert.equal(resolveNextMineType('rotate', null), 'food');
  assert.equal(resolveNextMineType('rotate', 'food'), 'wood');
  assert.equal(resolveNextMineType('rotate', 'wood'), 'stone');
  assert.equal(resolveNextMineType('rotate', 'stone'), 'iron');
  assert.equal(resolveNextMineType('rotate', 'iron'), 'food');
});

test('autoGatherService - march counting and game record checks', () => {
  const now = 100000;
  const marches = [
    { squadId: 1, stage: 'gathering' },
    { squadId: 2, stage: 'returnToOutpost', endsAt: now + 5000 },
    { squadId: 3, stage: 'returnToOutpost', endsAt: now - 1000 }, // Expired return
  ];

  assert.equal(countActiveMarches(marches, now), 2);

  // Game load record
  assert.equal(isGameLoadRecord({ requestBody: JSON.stringify({ calls: [{ name: 'mobileLogin' }] }) }), true);
  assert.equal(isGameLoadRecord({ requestBody: JSON.stringify({ calls: [{ name: 'getMineById' }] }) }), false);

  // March return record
  const wsRecord = {
    transport: 'websocket',
    direction: 'received',
    encoding: 'utf8',
    payload: JSON.stringify({ result: { type: 'returnToOutpostFromMine' } }),
  };
  assert.equal(isMarchReturnRecord(wsRecord, {}, {}, now), true);
});

test('autoGatherService - planAutoGather transitions', () => {
  const now = 100000;
  const storedDisabled = { popupRpcEnabled: true, autoGatherSettings: { enabled: false } };
  assert.equal(planAutoGather({}, storedDisabled, now).action, 'idle');

  const storedNoRpc = { popupRpcEnabled: false, autoGatherSettings: { enabled: true } };
  assert.equal(planAutoGather({}, storedNoRpc, now).action, 'idle');

  // Limit reached
  const storedEnabled = { popupRpcEnabled: true, autoGatherSettings: { enabled: true, maxMarches: 1 } };
  const cacheWithMarches = {
    marchStatus: { data: { marches: [{ squadId: 1, stage: 'gathering' }] } },
  };
  const planWait = planAutoGather(cacheWithMarches, storedEnabled, now);
  assert.equal(planWait.action, 'wait');
  assert.match(planWait.reason, /limit reached/);
});

test('smartGatherService - fresh, gathering, and skipMine tracking', () => {
  const now = 100000;
  assert.equal(fresh({ updatedAt: new Date(now - 10000).toISOString() }, now), true);
  assert.equal(fresh({ updatedAt: new Date(now - 70000).toISOString() }, now), false, 'Expired after 60s');

  assert.equal(gathering({ mineId: 'm1', stage: 'gathering' }), true);
  assert.equal(gathering({ mineId: 'm1', stage: 'returnToOutpost' }), false);

  // Skip mine
  const state = { rejectedMines: [] };
  skipMine(state, 'm10', now, 'occupied');
  const blocked = blockedMineIds(state, now);
  assert.ok(blocked.has('m10'));

  // RPC failure extraction
  assert.equal(rpcFailure({ error: { code: 'MineNotFound' } }), 'MineNotFound');
  assert.equal(rpcFailure({ response: { errorCode: 'BattleTypeMismatch' } }), 'BattleTypeMismatch');
  assert.equal(rpcFailure({ response: { errorCode: 0 } }), null);
});

test('smartGatherService - sync state mutations', () => {
  const now = 100000;
  const raw = {
    accountId: 'acc1',
    pending: {
      call: { name: 'getMineById', feature: 'mine', args: { mineId: 'm99' } },
      sentAt: now - 5000,
      purpose: 'nearestProbe',
      mine: { mineId: 'm99', configId: '23' },
    },
    nearest: { candidates: [{ mineId: 'm99', configId: '23' }], selected: null },
  };

  const record = {
    timestamp: new Date(now - 2000).toISOString(),
    method: 'POST',
    status: 200,
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    requestBody: JSON.stringify({ calls: [{ name: 'getMineById', feature: 'mine', args: { mineId: 'm99' }, ident: 'i1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'i1',
        result: {
          response: {
            mineId: 'm99',
            gathering: null,
            resourceAmount: 1200000,
          },
        },
      }],
    }),
  };

  const synced = sync(raw, record, { accountStatus: { data: { id: 'acc1' } } }, now);
  assert.equal(synced.pending, null);
  assert.ok(synced.nearest?.selected, 'Eligible mine should be selected');
  assert.equal(synced.nearest?.selected?.mineId, 'm99');
});

test('autoGatherService - planAutoGather with optimizeTeam dispatches optimized squad', () => {
  const now = 100000;
  const stored = {
    popupRpcEnabled: true,
    autoGatherSettings: {
      enabled: true,
      mineType: 'food',
      mineLevel: 1,
      selectedTeam: 'optimized',
    },
  };
  const cache = {
    accountStatus: { data: { id: 'acc1' } },
    experimentalMapContext: { data: { mapId: 'map1', center: { x: 10, y: 20 } } },
    heroGetAll: {
      data: {
        10: { power: 1000 },
        20: { power: 5000 },
      },
    },
    'getUnitSummary:unit': {
      data: {
        available: [{ unitId: 7, count: 500 }],
      },
    },
    marchStatus: { data: { marches: [] } },
    experimentalMineSearch: {
      data: {
        mineConfigId: 27,
        mines: [{ mineId: 'm1' }],
      },
    },
  };

  const plan = planAutoGather(cache, stored, now);
  assert.equal(plan.action, 'gather');
  assert.equal(plan.mineId, 'm1');
  assert.equal(plan.call.name, 'attackMine');
  assert.equal(plan.call.args.squad.heroes.length, 1);
  assert.equal(plan.call.args.squad.heroes[0].heroId, 10);
  assert.equal(plan.call.args.squad.units[0].count, 37);
});
