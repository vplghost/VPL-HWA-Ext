---
id: VHE-MA5SJK
title: Specify smart gathering rules and evidence gaps
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.256Z'
updatedAt: '2026-11-16T03:39:32.678Z'
completedAt: '2026-11-14T11:54:09.395Z'
timeSpent: 127
spec: specs/smart-auto-gathering
fulfills:
  - AC-1
order: 10
---
# Specify smart gathering rules and evidence gaps

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite the requested docs/Smart-auto-gathering.md as a trackable contract and canonical spec with stable requirement IDs, data readiness, scenarios and user evidence requests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Document all five rule groups without losing original thresholds or priority order.
- [x] #2 Separate verified contracts, assumptions, missing inputs, task dependencies and outcomes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify current gathering/quest/mine RPC contracts and user clarifications. 2. Rewrite source description with requirements, scenarios, unknowns and task links; update canonical spec. 3. Validate docs and task; skip behavior tests because this task only changes docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source description rewritten with SG-1…SG-6, AC-1…AC-6, evidence E1…E7, exact user inputs and task schedule. User confirms final milestone ×1.02, configured-speed ETA/duration estimates, hospital = summed Infirmary capacity minus wounded, and will provide incoming-attack capture later. Review: no missing original rule; tests skipped (documentation only). Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — documents task-specific spec rules, not new system guidance.

Final integrated verification: 762 tests total,750 passed,12 optional skipped; typecheck passed; version0.10.80 WXT artifact built and validated. Review PASS (quality/architecture/security/completeness): own-outpost coordinate selection, current-account cache clearing, stale-input refresh, preserved daily baseline, safe pending-probe restart and shared-RPC dispatch gating verified. No live in-game account validation. AC-6 defense remains in separate blocked task VHE-CB9VBW per user-supplied-capture agreement.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

