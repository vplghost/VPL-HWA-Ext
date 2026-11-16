---
id: VHE-BCK7WZ
title: Select nearest mines with over one hour remaining
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.461Z'
updatedAt: '2026-11-16T03:39:31.943Z'
completedAt: '2026-11-14T12:04:08.387Z'
timeSpent: 148
spec: specs/smart-auto-gathering
fulfills:
  - AC-4
order: 40
---
# Select nearest mines with over one hour remaining

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Establish candidate gathering-duration evidence and implement nearest eligible mine across levels only when the hour threshold can be proved. Search results currently have no resource amount or squad-specific speed.

Blocked by @task-VHE-MA5SJK{blocked-by}
Runtime foundation blocked by @task-VHE-WBZH46{blocked-by}
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Interrupted mines may bypass the one-hour rule but must still exist and be gatherable.
- [x] #2 Missing duration inputs are reported with exact user capture request; no guessed speed is used.
- [x] #3 Nearest candidates are sorted by distance and require estimated gathering duration >3600s using remaining resource/configured mine speed, as authorized by user.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read spec Locked Decisions and inspect existing gathering coordination contracts. 2. Implement only evidence-backed behavior for AC-4, recording exact missing inputs without guesses. 3. Add outcome tests and wire background/UI as required. 4. Review diff, document verification and decision impact, validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Nearest mode searches one config per level (1–10), retaining bounded account/map/center-scoped candidates, orders Euclidean distance, and probes remaining resource with getMineById. Strict estimated >3600s from verified configured speed; exact3600 and unavailable probes rejected. Interrupted mine bypasses threshold through separate validated resume path. Empty/invalid search does not loop; explicit restart resets search. User approved configured-speed estimate; updated AC accordingly. Focused tests 8 passed, typecheck passed. Review: stale map/center selection resets state, no runtime CDN fetch. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — task-specific estimated mine policy, metadata follows existing hash-verified packaging.

Final integrated verification: 762 tests total,750 passed,12 optional skipped; typecheck passed; version0.10.80 WXT artifact built and validated. Review PASS (quality/architecture/security/completeness): own-outpost coordinate selection, current-account cache clearing, stale-input refresh, preserved daily baseline, safe pending-probe restart and shared-RPC dispatch gating verified. No live in-game account validation. AC-6 defense remains in separate blocked task VHE-CB9VBW per user-supplied-capture agreement.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

