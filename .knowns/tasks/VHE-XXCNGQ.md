---
id: VHE-XXCNGQ
title: Yield gathering to raid and monster queues
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.398Z'
updatedAt: '2026-11-14T12:17:19.843Z'
completedAt: '2026-11-14T12:01:39.419Z'
timeSpent: 216
spec: specs/smart-auto-gathering
fulfills:
  - AC-3
order: 30
---
# Yield gathering to raid and monster queues

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coordinate gathering with explicitly started raid/monster queues: recall the nearest eligible gathering squad when a slot/team is needed, wait for confirmed return, retain account-scoped interrupted mines and resume after queue completion/cancellation.

Blocked by @task-VHE-MA5SJK{blocked-by}
Runtime foundation blocked by @task-VHE-WBZH46{blocked-by}
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Active raid/monster queues suppress automatic gathering dispatch.
- [x] #2 Recall only an eligible gathering squad; queue starts after confirmed return and never assumes dispatch acknowledgement equals completion.
- [x] #3 Interrupted mine resumption validates remaining resource and is account-scoped; user cancellation and failures do not loop.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read spec Locked Decisions and inspect existing gathering coordination contracts. 2. Implement only evidence-backed behavior for AC-3, recording exact missing inputs without guesses. 3. Add outcome tests and wire background/UI as required. 4. Review diff, document verification and decision impact, validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Queue start now creates waiting_gather reservation, recalls one eligible nearest gathering squad, waits for confirmed return plus fresh march/unit snapshots, then delegates to existing raid/monster controller. All active queues suppress Smart gather. Interrupted mine retained only after recall success; getMineById validates resource before resume, target consumed only after attackMine confirmation. Runtime account mismatch/recall error/timeout stops pending queue. Focused integration tests 7 passed, including real background/controller wiring and terminal queue resumption; typecheck fix uses explicit storage status shape. Review found stale runtime overwrite after queue transition; fixed by reloading runtime/queue state before auto-gather evaluation. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — implements spec-specific coordination and established confirmed-mutation rules.

Final integrated verification: 762 tests total,750 passed,12 optional skipped; typecheck passed; version0.10.80 WXT artifact built and validated. Review PASS (quality/architecture/security/completeness): own-outpost coordinate selection, current-account cache clearing, stale-input refresh, preserved daily baseline, safe pending-probe restart and shared-RPC dispatch gating verified. No live in-game account validation. AC-6 defense remains in separate blocked task VHE-CB9VBW per user-supplied-capture agreement.
<!-- SECTION:NOTES:END -->

