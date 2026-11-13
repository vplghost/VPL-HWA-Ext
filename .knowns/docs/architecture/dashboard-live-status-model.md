---
id: doc-d229300ad19a499cc8f6e79fc5ea4df4
title: Dashboard Live Status Model
description: Vue Dashboard queue/march sources, countdown lifecycle, and evidence-based daily activity completion and reset rules.
createdAt: '2026-11-13T05:20:28.286Z'
updatedAt: '2026-11-13T05:20:28.286Z'
tags:
  - dashboard
  - queues
  - marches
  - daily
---

## Sources and rendering

Implemented by @task-VHE-64GPHS.

- `src/utils/dashboardState.ts::dashboardQueues` reads canonical `buildingStatus.data.queues` and `researchStatus.data.queues`, with legacy queue cache fallbacks. Show every observed upgrade, metadata names, target levels and active/ready timing. Epoch seconds are converted to milliseconds; explicit `durationMs` takes precedence over legacy seconds. Missing snapshots are unknown; observed empty queues are idle. Elapsed upgrades remain Ready until the authoritative cache removes them.
- `dashboardMarches` uses normalized `marchStatus.data.marches`, existing `getMarchBadgeInfo` and `isMarchExpired`. Keep battle, rally wait, gathering and outbound entries awaiting authoritative updates; remove returns when their normalized `endsAt` expires. Show phase/countdowns and existing detailed squad tooltips; link raid, gather and monster entries to their dialogs.
- `QueuesOverview.vue` and `ActivityGoals.vue` use `useNow` so countdowns and daily freshness react while mounted/active and stop while deactivated/unmounted. Cache changes remain reactive through `useRpcCache`.
- Dashboard Refresh All requests summaries, marches, Tower, Arena, `userGetInfo` (Arena refillable amounts), world refillables with their feature, Dungeon/titan roster, Hydra and quest/reset snapshots through the existing shared RPC dispatch policy.

## Daily states

`src/composables/activityState.ts` owns the Tower, Arena and Dungeon models.

- A completion observation must be fresh. Use the observed server daily reset `questResetStatus.data.nextDayAt` when present; fall back to the local calendar convention used by existing reducers. Missing dates, old observations and future observations cannot prove today's completion.
- Tower: a fresh canonical cleared status, completed session or brief win/completed state is Done. The newest snapshot wins over an older completed session. No current evidence is Unknown.
- Arena and Grand Arena: fresh nonnegative integer amounts from `resource:refillable:6` and `resource:refillable:21` respectively. Zero is Done; positive is Pending; missing/stale/invalid values are Unknown. Rank is independent of attempt availability.
- Dungeon: require fresh status, evidence of today's combat (`dailyCombatLog` with today's date and a positive battle count, or a current `dungeonEndBattle` result), known next-floor doors and no active battle. Done requires every next door's eligible owned titans to be explicitly dead (`isDead` or numeric nonpositive HP). Examine all owned titans using packaged element metadata, rather than a saved team/automation pool. Missing HP/roster/metadata or unsupported doors cannot prove exhaustion. An alternate door or surviving eligible titan keeps Pending. Missing next doors is Unknown.
- Hydra: fresh, valid regular/super attempt counters are Done only when both are exhausted. Missing/stale counters are Unknown.
- Daily quests distinguish current claimable rewards and in-progress daily work from missing snapshots; absence of a reward does not by itself prove all daily quests completed.

## Verification

`tests/dashboard-state.test.mjs` exercises time units, active/ready/idle/unknown queues, object-shaped collections, march lifecycle, completion evidence, alternate Dungeon doors/remaining titans, missing observations, daily reset and reactive execution of the actual Dashboard SFC setup code. Existing `vue-ui-parity-runtime.test.mjs` covers brief-only Tower state with dated observations. Live Chrome/game visual acceptance remains separate from these automated setup tests.
