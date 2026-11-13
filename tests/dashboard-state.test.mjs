import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed } from 'vue';
import { dashboardQueues, dashboardMarches, queueEndMs } from '../src/utils/dashboardState.ts';
import { towerActivityState, arenaActivityState, dungeonActivityState, observedToday, readyQuestCount } from '../src/composables/activityState.ts';

const now = new Date(2026, 10, 13, 12).getTime();
const entry = (data, time = now - 1000) => ({ data, updatedAt: new Date(time).toISOString() });
const yesterday = now - 86400000;

test('queue times honor seconds, milliseconds, explicit finish and zero duration', () => {
  assert.equal(queueEndMs({ startDate: now, durationMs: 60000 }), now + 60000);
  assert.equal(queueEndMs({ startDate: now / 1000, duration: 60 }), now + 60000);
  assert.equal(queueEndMs({ finishTime: now / 1000 + 60 }), now + 60000);
  assert.equal(queueEndMs({ endTime: now + 60000 }), now + 60000);
  assert.equal(queueEndMs({ startDate: now, durationMs: 0 }), now);
  assert.equal(queueEndMs({ durationMs: 60 }), null);
});

test('queues show every active/ready upgrade, object maps and distinguish unknown from idle', () => {
  const cache = { buildingStatus: entry({ queues: {
    0: { buildingId: 1, nextLevel: 2, startDate: now, durationMs: 60000 },
    1: { buildingId: 2, level: 3, finishTime: now - 1000 },
  } }) };
  const model = dashboardQueues(cache, 'building', now);
  assert.deepEqual(model.rows.map(row => row.state), ['active', 'ready']);
  assert.equal(model.rows[0].level, 2);
  assert.equal(model.rows[1].timerText, 'Ready');
  assert.equal(dashboardQueues(cache, 'building', now + 60000).rows[0].state, 'ready');
  assert.equal(dashboardQueues({}, 'research', now).state, 'unknown');
  assert.equal(dashboardQueues({ researchStatus: entry({ queues: [] }) }, 'research', now).state, 'idle');
  assert.equal(dashboardQueues({ research_getQueue: entry({ 0: { researchId: 4, finishTime: now + 1000 } }) }, 'research', now).rows[0].entityId, 4);
  assert.equal(dashboardQueues({ building_getQueue: entry({ buildingId: 9, finishTime: now + 1000 }) }, 'building', now).rows.length, 1);
  assert.equal(dashboardQueues({ researchStatus: entry({ queue: [{ researchId: 5 }] }) }, 'research', now).rows[0].state, 'unknown');
});

test('marches retain normalized gathering, battle and return stages and remove only expired returns', () => {
  const cache = { marchStatus: entry({ marches: {
    0: { id: 'g', kind: 'wood', mineId: 42, stage: 'moveToTargetInSolo', targetArrivalAt: now + 10000, endsAt: now + 60000 },
    1: { id: 'r', kind: 'raid', stage: 'battle', endsAt: now - 1000, rally: {} },
    2: { id: 'm', kind: 'attack', mobId: 22, targetArrivalAt: now - 1000 },
    3: { id: 'back', kind: 'return', previousKind: 'raid', endsAt: now + 20000 },
    4: { id: 'gone', kind: 'return', previousKind: 'wood', endsAt: now },
    5: { id: 'wait', kind: 'raid', stage: 'waitingForRallyStart', rally: { waitUntil: now + 5000 } },
  } }) };
  const rows = dashboardMarches(cache, now);
  assert.deepEqual(rows.map(row => row.id), ['g', 'r', 'm', 'back', 'wait']);
  assert.deepEqual(rows.map(row => row.stage), ['Traveling', 'In battle', 'In battle', 'Returning', 'Preparing rally']);
  assert.deepEqual(rows.map(row => row.category), ['gather', 'raid', 'monster', 'raid', 'raid']);
  assert.equal(dashboardMarches(cache, now + 11000)[0].stage, 'Gathering');
  assert.equal(dashboardMarches(cache, now + 21000).some(row => row.id === 'back'), false);
});

test('tower completion expires daily and a newer reset beats an older completed session', () => {
  assert.equal(towerActivityState({ towerStatus: entry({ isCleared: true }) }, now).state, 'done');
  assert.equal(towerActivityState({ towerSession: entry({ completed: true }) }, now).state, 'done');
  assert.equal(towerActivityState({ magicTower_briefInfo: entry({ state: 'win' }) }, now).state, 'done');
  assert.equal(towerActivityState({ towerStatus: entry({ isCleared: true }, yesterday) }, now).state, 'unknown');
  assert.equal(towerActivityState({ towerStatus: entry({ floorNumber: 1 }, now), towerSession: entry({ completed: true }) }, now).state, 'pending');
  assert.equal(towerActivityState({ towerStatus: { data: { isCleared: true } } }, now).state, 'unknown');
});

test('daily freshness follows observed server reset instead of midnight when available', () => {
  const reset = now - 3600000;
  const cache = { questResetStatus: entry({ nextDayAt: reset + 86400000 }),
    towerStatus: entry({ isCleared: true }, reset - 1000),
    'resource:refillable:6': entry({ amount: 0 }, reset - 1000) };
  assert.equal(towerActivityState(cache, now).state, 'unknown');
  assert.equal(arenaActivityState(cache, false, now).state, 'unknown');
  cache.towerStatus = entry({ isCleared: true }, reset + 1000);
  assert.equal(towerActivityState(cache, now).state, 'done');
  assert.equal(observedToday(entry({}, now + 1000), now), false);
});

test('arena zero attempts is done independently of rank; stale, negative and absent amounts are unknown', () => {
  const cache = { 'resource:refillable:6': entry({ amount: 0 }), 'resource:refillable:21': entry({ amount: 2 }) };
  assert.equal(arenaActivityState(cache, false, now).state, 'done');
  assert.equal(arenaActivityState(cache, true, now).state, 'pending');
  assert.match(arenaActivityState(cache, false, now).detail, /0 battles left today/);
  for (const amount of [undefined, null, -1, '0', NaN]) {
    assert.equal(arenaActivityState({ 'resource:refillable:6': entry({ amount }) }, false, now).state, 'unknown');
  }
  assert.equal(arenaActivityState({ 'resource:refillable:6': entry({ amount: 0 }, yesterday) }, false, now).state, 'unknown');
});

const meta = { 4000: { element: 'Water' }, 4001: { element: 'Water' }, 4010: { element: 'Fire' } };
function dungeon(overrides = {}) {
  return { titanGetAll: entry({ 4000: { id: 4000 }, 4001: { id: 4001 }, 4010: { id: 4010 } }),
    dungeonStatus: entry({ floorNumber: 42, dungeonActivity: 150,
      dailyCombatLog: { date: new Date(now).toDateString(), totalBattles: 2 },
      currentFloorDoors: [{ attackerType: 'water' }],
      states: { titans: { 4000: { hp: 0 }, 4001: { isDead: true }, 4010: { hp: 50 } } }, ...overrides }) };
}
test('dungeon ends today only when every next door has no surviving owned eligible titan', () => {
  assert.equal(dungeonActivityState(dungeon(), now, meta).state, 'done');
  // A saved team cannot hide another owned surviving titan.
  const healthy = dungeon({ states: { titans: { 4000: { hp: 0 }, 4001: { hp: 1 } } } });
  healthy.teamGetAll = entry({ dungeon_water: [4000] });
  assert.equal(dungeonActivityState(healthy, now, meta).state, 'pending');
  assert.equal(dungeonActivityState(dungeon({ currentFloorDoors: [{ attackerType: 'water' }, { attackerType: 'fire' }] }), now, meta).state, 'pending');
  assert.equal(dungeonActivityState(dungeon({ currentFloorDoors: [{ attackerType: 'neutral' }] }), now, meta).state, 'pending');
  assert.equal(dungeonActivityState(dungeon({ activeBattle: { heroes: [4000] } }), now, meta).state, 'pending');
});
test('dungeon refuses completion with missing/stale combat, missing HP, roster, metadata or next doors', () => {
  for (const changes of [{ dailyCombatLog: null },
    { dailyCombatLog: { date: new Date(yesterday).toDateString(), totalBattles: 10 } },
    { states: { titans: { 4000: { hp: 0 } } } },
    { currentFloorDoors: [{ attackerType: 'heroes' }] }]) {
    assert.notEqual(dungeonActivityState(dungeon(changes), now, meta).state, 'done');
  }
  const noRoster = dungeon(); delete noRoster.titanGetAll;
  assert.notEqual(dungeonActivityState(noRoster, now, meta).state, 'done');
  assert.notEqual(dungeonActivityState(dungeon(), now, {}).state, 'done');
  assert.equal(dungeonActivityState(dungeon({ currentFloorDoors: [] }), now, meta).state, 'unknown');
  const old = dungeon(); old.dungeonStatus.updatedAt = new Date(yesterday).toISOString();
  assert.equal(dungeonActivityState(old, now, meta).state, 'unknown');
  const latestBattle = dungeon({ dailyCombatLog: null, lastBattleResult: { win: false } });
  latestBattle.dungeonStatus.method = 'dungeonEndBattle';
  assert.equal(dungeonActivityState(latestBattle, now, meta).state, 'done');
});

// Execute each real SFC setup with Vue computed refs; templates remain build-checked.
async function setupComponent(file, expose, initial = {}) {
  const source = await readFile(new URL('../src/components/dashboard/' + file, import.meta.url), 'utf8');
  const setup = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import [\s\S]*?;\r?$/gm, '');
  const cache = ref(initial), clock = ref(now), opened = [];
  const context = { computed, ref, useNow: () => clock, useRpcCache: () => ({ cache }),
    useModals: () => ({ openModal: id => opened.push(id) }), dashboardQueues, dashboardMarches,
    getBuildingName: id => `Building ${id}`, getResearchName: id => `Research ${id}`,
    towerActivityState, arenaActivityState, observedToday, dungeonActivityState: (cache, time) => dungeonActivityState(cache, time, meta), readyQuestCount };
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  vm.runInNewContext(js + '\nglobalThis.exposed = {' + expose + '};', context);
  return { ...context.exposed, cache, clock, opened };
}

test('dashboard queue SFC reacts to snapshots, countdown expiry and march dialog clicks', async () => {
  const view = await setupComponent('QueuesOverview.vue', 'queueGroups, marches, marchesKnown, handleMarchClick');
  assert.equal(view.queueGroups.value[0].state, 'unknown');
  assert.equal(view.marchesKnown.value, false);
  view.cache.value = { buildingStatus: entry({ queues: [{ buildingId: 2, nextLevel: 4, finishTime: now + 1000 }] }),
    marchStatus: entry({ marches: [{ id: 1, kind: 'return', previousKind: 'wood', endsAt: now + 1000 }] }) };
  assert.equal(view.queueGroups.value[0].rows[0].name, 'Building 2');
  assert.equal(view.queueGroups.value[0].rows[0].state, 'active');
  assert.equal(view.marches.value.length, 1);
  view.clock.value += 1000;
  assert.equal(view.queueGroups.value[0].rows[0].state, 'ready');
  assert.equal(view.marches.value.length, 0);
  for (const kind of ['gather', 'raid', 'monster', 'other']) view.handleMarchClick(kind);
  assert.deepEqual(view.opened, ['gathering', 'raid', 'monster']);
});

test('daily activity SFC reacts to exhaustion, new attempts and day rollover', async () => {
  const view = await setupComponent('ActivityGoals.vue', 'activities', { ...dungeon(),
    towerStatus: entry({ isCleared: true }), 'resource:refillable:6': entry({ amount: 0 }) });
  const state = id => view.activities.value.find(row => row.id === id).state;
  assert.equal(state('tower'), 'done'); assert.equal(state('arena'), 'done'); assert.equal(state('dungeon'), 'done');
  assert.equal(state('hydra'), 'unknown'); assert.equal(state('quests'), 'unknown');
  view.cache.value.clanBoss_getAll = entry({ tries: 0, superTries: 0 });
  assert.equal(state('hydra'), 'done');
  view.cache.value.clanBoss_getAll = entry({ tries: 0, superTries: 1 });
  assert.equal(state('hydra'), 'pending');
  view.cache.value['resource:refillable:6'] = entry({ amount: 1 });
  assert.equal(state('arena'), 'pending');
  view.clock.value += 86400000;
  for (const id of ['tower', 'arena', 'dungeon']) assert.equal(state(id), 'unknown');
});
