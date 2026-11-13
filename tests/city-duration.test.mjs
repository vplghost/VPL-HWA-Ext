import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseRemoteDurationSeconds } from '../scripts/lib/remote-duration.mjs';
import { formatDuration, formatFinishTime } from '../src/utils/formatters.ts';

const runtime = {};
for (const name of ['building-data', 'research-data', 'building-queue', 'research-queue']) {
  vm.runInNewContext(await readFile(new URL(`../extension/${name}.js`, import.meta.url), 'utf8'), runtime);
}
const building = runtime.hwaHelperBuildingData, research = runtime.hwaHelperResearchData;
const buildingQueue = runtime.hwaHelperBuildingQueue, researchQueue = runtime.hwaHelperResearchQueue;

test('remote duration parsing preserves days, zero padding, long hours and legacy short forms', () => {
  for (const [raw, seconds] of [
    ['4.10:59:00', 385140], ['1.06:28:00', 109680], ['00.00:00:02', 2],
    ['07.19:30:00', 675000], ['01.09:40:00', 121200], ['02.14:30:00', 225000],
    ['62:03:01', 223381], ['00:59:59', 3599], ['02:30', 150], ['120', 120], [0, 0], [null, 0],
  ]) assert.equal(parseRemoteDurationSeconds(raw), seconds, String(raw));
  for (const bad of ['1.24:00:00', '1.01:60:00', '-1:00:00', '1.2', '1d 2h', {}, Infinity,
    '9999999999999999999.00:00:00']) assert.throws(() => parseRemoteDurationSeconds(bad));
});

test('Hall of Heroes20→21 uses the full four-day base and displays2d14h03m after the existing estimate', () => {
  assert.equal(building.getBuildingLevelData(20, 21).d, 385140);
  assert.equal(building.calculateEffectiveDurationMs(20, 21, 1), 385140000);
  assert.equal(building.calculateEffectiveDurationMs(20, 21), 223381200);
  assert.equal(formatDuration(Math.ceil(building.calculateEffectiveDurationMs(20, 21) / 1000)), '2d 14h 3m');
  assert.equal(building.getBuildingLevelData(20, 16).d, 109680);
});

test('Research retains correct multi-day base duration and millisecond calculations', () => {
  for (const [id, level, raw] of [[568, 5, '07.19:30:00'], [634, 1, '01.09:40:00'], [635, 1, '02.14:30:00']]) {
    const seconds = parseRemoteDurationSeconds(raw);
    assert.equal(research.getResearchLevelData(id, level).d, seconds);
    assert.equal(research.calculateEffectiveDurationMs(id, level, 1), seconds * 1000);
    assert.equal(research.calculateEffectiveDurationMs(id, level), Math.round(seconds * 1000 * 0.892));
  }
});

test('only matching legacy queued estimates are repaired, retaining identities and user durations', () => {
  const old = { buildingId: 20, nextLevel: 21, durationMs: 10614000, queueItemId: 'saved', addedAt: 42 };
  const repaired = building.normalizeQueuedDuration(old);
  assert.equal(repaired.durationMs, 223381200);
  assert.equal(repaired.queueItemId, 'saved'); assert.equal(repaired.addedAt, 42);
  assert.equal(old.durationMs, 10614000, 'Do not mutate a shared or in-flight item');
  assert.equal(building.normalizeQueuedDuration(repaired), repaired);
  const custom = { ...old, durationMs: 200000000 };
  assert.equal(building.normalizeQueuedDuration(custom), custom);
  const short = { buildingId: 20, nextLevel: 2, durationMs: 1000 };
  assert.equal(building.normalizeQueuedDuration(short), short);
});

test('saved legacy estimates are corrected in building timelines and start RPC arguments', () => {
  const now = Date.parse('2026-11-13T08:00:00Z');
  const item = { buildingId: 20, nextLevel: 21, durationMs: 10614000 };
  const timeline = buildingQueue.calculateQueueTimeline([], [item, item], now);
  assert.equal(timeline.items[0].durationMs, 223381200);
  assert.equal(timeline.items[0].estFinish, now + 223381200);
  assert.equal(timeline.allDoneAt, now + 446762400);
  assert.equal(timeline.totalDurationMs, 446762400);
  const plan = buildingQueue.planNextStep({ items: [item] }, { buildingStatus: { data: { queues: [] } } }, now);
  assert.equal(plan.calls.find(call => call.name === 'startConstruction').args.durationMs, 223381200);
  assert.equal(plan.wakeAt, now + 223382200);
});

test('authoritative multi-day queue rows keep their server duration and absolute finish', () => {
  const now = Date.parse('2026-11-13T08:00:00Z'), durationMs = 223381200;
  for (const [type, helper] of [['building', buildingQueue], ['research', researchQueue]]) {
    const row = { [type + 'Id']: 20, level: 21, startDate: now - 3600000, durationMs };
    assert.equal(helper.getQueueEnd(row, now), now - 3600000 + durationMs);
    assert.equal(helper.getQueueEnd({ startTime: now / 1000, duration: durationMs / 1000 }, now), now + durationMs);
    const timeline = helper.calculateQueueTimeline([row], [{ durationMs }], now);
    assert.equal(timeline.allDoneAt, now - 3600000 + durationMs * 2);
    const plan = helper.planNextStep({ items: [] }, { [type + 'Status']: { data: { queues: [row] } } }, now);
    assert.equal(plan.action, 'wait');
    assert.equal(plan.wakeAt, now - 3600000 + durationMs + 1000);
    assert.equal(row.durationMs, durationMs);
  }
});

test('duration and finish-time formatting show day boundaries without dropping hours', () => {
  assert.equal(formatDuration(86399), '23h 59m');
  assert.equal(formatDuration(86400), '1d 0h 0m');
  assert.equal(formatDuration(172800 + 14 * 3600 + 3 * 60), '2d 14h 3m');
  const now = new Date(2026, 10, 13, 10).getTime();
  assert.equal(formatFinishTime(now + 3600000, now), new Date(now + 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  assert.equal(formatFinishTime(now + 86400000, now), new Date(now + 86400000).toLocaleString([],
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
  assert.match(formatFinishTime(new Date(2027, 0, 1).getTime(), now), /2027/);
  assert.equal(formatFinishTime(NaN, now), '—');
});
