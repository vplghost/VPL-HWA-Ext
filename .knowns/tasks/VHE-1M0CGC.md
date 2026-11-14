---
id: VHE-1M0CGC
title: Release a gathering slot for priority rally join
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.522Z'
updatedAt: '2026-11-14T12:17:19.954Z'
completedAt: '2026-11-14T12:06:44.171Z'
timeSpent: 155
spec: specs/smart-auto-gathering
fulfills:
  - AC-5
order: 50
---
# Release a gathering slot for priority rally join

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Preserve existing auto-join eligibility; when all slots are used, recall one gathering squad only if estimated/verified return ETA is strictly under29s (pending user choice), retain rally reservation and resume interrupted mine after raid return.

Blocked by @task-VHE-MA5SJK{blocked-by}
Runtime foundation blocked by @task-VHE-XXCNGQ{blocked-by}
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing auto-join membership, capacity, level and remaining rally window conditions stay enforced.
- [x] #2 Strict under29s eligibility and real return completion gate join; no duplicate recalls or joins.
- [x] #3 Unknown ETA or expired rally skips recall/join and exposes waiting reason.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read spec Locked Decisions and inspect existing gathering coordination contracts. 2. Implement only evidence-backed behavior for AC-5, recording exact missing inputs without guesses. 3. Add outcome tests and wire background/UI as required. 4. Review diff, document verification and decision impact, validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Priority auto-join now considers Smart slot preemption only after existing rally eligibility. Uses estimated configured return ETA strictly <29s and sufficient start window; reserves one rally, sends one recall, rechecks fresh details after confirmed return, joins once and waits for raid team return before resuming interrupted mine. Join errors/expired/full/departed rally do not rejoin; attempts persisted per account. Added lower-version details guard and account-scoped session attempt keys. Focused 60 tests passed, including full background recall→return→recheck→join flow and exact29s/unknown/insufficient-window bounds. Review pending final integrated verification. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — spec-specific priority arbitration using prior verified RPC lifecycle.

Final integrated verification: 762 tests total,750 passed,12 optional skipped; typecheck passed; version0.10.80 WXT artifact built and validated. Review PASS (quality/architecture/security/completeness): own-outpost coordinate selection, current-account cache clearing, stale-input refresh, preserved daily baseline, safe pending-probe restart and shared-RPC dispatch gating verified. No live in-game account validation. AC-6 defense remains in separate blocked task VHE-CB9VBW per user-supplied-capture agreement.
<!-- SECTION:NOTES:END -->

