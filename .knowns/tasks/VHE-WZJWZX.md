---
id: VHE-WZJWZX
title: Prioritize energy snapshots in Dashboard refresh
status: done
priority: medium
labels: []
createdAt: '2026-11-15T03:30:45.674Z'
updatedAt: '2026-11-15T03:32:26.852Z'
completedAt: '2026-11-15T03:32:26.852Z'
timeSpent: 81
---
# Prioritize energy snapshots in Dashboard refresh

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure Dashboard Refresh All explicitly refreshes Energy via userGetInfo and World Energy via refillableGetAll:refillable, before unrelated dashboard reads, with accurate request feedback under shared RPC policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Refresh All requests both energy sources first, without duplicate energy calls in remaining dashboard reads.
- [x] #2 Loading guards prevent overlapping clicks; queued/error messages are explicit and no energy balance is invented from dispatch acknowledgement.
- [x] #3 Actual Dashboard setup and resource snapshot regression, typecheck, full tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse existing verified energy source/extraction and shared dispatcher. 2. Prioritize a dedicated two-call energy refresh, preserve remaining dashboard reads, and show pending/transport feedback. 3. Verify actual SFC setup and authoritative reducer updates, run checks and build patch release. 4. Update canonical dashboard guidance and task evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Existing Refresh All already contained both resource reads inside a broad batch. They now dispatch first as userGetInfo + refillableGetAll:refillable, with no duplicates in the remaining read batch. Added overlapping-click/no-game guards and accurate queued/error transport status. No optimistic balance changes; actual cache reducer updates both ResourceSummary energy values. Focused13 tests passed; full820 tests:808 passed,12 optional private-log skips; typecheck and build0.10.92 passed. Review:PASS, no unresolved P1/P2. Spec Decision Compliance:N/A, standalone UI refinement. System Decision Impact:none — preserves existing verified energy sources, canonical reduction and shared RPC policy; request priority and feedback are local implementation improvements. Canonical @doc/architecture/dashboard-live-status-model.
<!-- SECTION:NOTES:END -->

