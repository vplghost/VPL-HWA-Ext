---
id: VHE-F8X6B6
title: Coalesce incoming march and rally detail refreshes
status: done
priority: medium
labels: []
createdAt: '2026-11-15T07:37:53.842Z'
updatedAt: '2026-11-15T07:47:33.563Z'
completedAt: '2026-11-15T07:47:33.563Z'
timeSpent: 511
---
# Coalesce incoming march and rally detail refreshes

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce automatic getIncomingMarches:march and getRallyById:rally frequency after passive march optimization; preserve captured attack safety, current rally membership/version checks, explicit user refresh and queue cancellation deadlines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Idle incoming monitoring uses bounded fallback and passive attack updates; duplicate reads coalesce per account while near-impact safety remains timely.
- [x] #2 Repeated rally pushes coalesce per rally/map/version; native details satisfy reads while fresh join and auto-cancel checks remain intact.
- [x] #3 Request-count, native/MQTT, stale/failed read, account and queue regressions pass with full checks/build and canonical documentation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace defense, socket, login, reservation and raid queue callers against canonical reducers and D1-D5. 2. Add bounded incoming/rally read coordination and idle-vs-active monitoring; keep decision-critical queue checks explicit. 3. Verify request counts, stale/new-version recovery, passive native reuse and mutation confirmations. 4. Full checks/build, docs and task validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented world-read.plan with bounded serialized account-scoped leases, persisted version-aware trailing reads and worker-startup alarm recovery. Idle incoming fallback60s, active threats15s, reuse full native snapshot plus passive deltas; mine return no longer requests incoming. Native rallyReadStatus satisfies matching versions/maps; explicit refresh, reservation join rechecks and Raid auto-cancel reads bypass debounce. Review: checked stale/failed/native results, partial hydration, account switches, shared policy, serialization and cancellation/recall deadlines; no outstanding findings. Full861 tests:849 pass,12 optional skips; typecheck/build0.10.96 passed and runtime asset hashes match dist. Actual Chrome Direct/Piggyback: ten incoming checks=0 extra reads; ten rally versions=2 reads, trailing alarm confirmed. Evidence docs/acceptance/world-read-2026-11-15.json. Pre-source-update checkpoint committed as4247c37 per user request; this followup remains uncommitted. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: candidate @decision/20261115-1445-coalesce-optional-incoming-and-rally-reads-without-delaying-decisions (added) — bounded optional reads retain decision-critical freshness.
<!-- SECTION:NOTES:END -->

