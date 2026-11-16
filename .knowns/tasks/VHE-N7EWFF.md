---
id: VHE-N7EWFF
title: Recall threatened gatherers above 50 percent infirmary occupancy
status: done
priority: medium
labels: []
createdAt: '2026-11-14T17:38:04.358Z'
updatedAt: '2026-11-16T03:39:32.936Z'
completedAt: '2026-11-14T17:40:08.363Z'
timeSpent: 94
spec: specs/smart-auto-gathering
---
# Recall threatened gatherers above 50 percent infirmary occupancy

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User changes attacked-mine recall eligibility: wounded troops must exceed 50% total Infirmary capacity. Replace defending-squad-versus-free-space comparison; retain exact attack window, freshness, account and confirmed-return protections.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Attacked mine recall eligibility uses wounded > total Infirmary capacity * 0.5; exactly 50 percent does not trigger and defending troop count no longer determines the threshold.
- [x] #2 Retain known positive capacity, fresh snapshots, correct defending squad, shared RPC mode, final 10-second window and confirmed-return protections.
- [x] #3 Cover below/equal/above threshold and squad-size independence; update canonical and user-facing docs; pass focused tests, typecheck and build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace hospital-space comparison in mine-defense.plan with strict occupancy >50%, guarding unknown/zero capacity. 2. Add threshold boundary and squad-size regression cases; retain existing lifecycle tests. 3. Update smart-gathering spec and attack-contract/user docs to remove the old rule. 4. Run tests/typecheck/build, record evidence and complete task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented strict occupancy guard room.wounded > room.capacity *0.5, with positive known capacity; retained fresh march/unit validation and all existing attack/lifecycle protections. UI now states the50% threshold. Spec D4 and SG-6/AC-6, user-facing docs and attack contract updated; existing memory6jiqu0 refreshed. Tests cover below/equal/above50%, squad-size independence, missing/stale/zero capacity and wake-time recheck; all15 mine-defense tests pass. Full suite786 tests:774 passed,12 optional private-log skips. Typecheck/build PASS. Review: PASS — narrow predicate/UI change; no P1/P2 findings. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass (threshold updated per user's2026-11-15 instruction), D5=pass. System Decision Impact: none — threshold is maintained canonically in the linked spec's D4; no duplicate System Decision candidate created.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

