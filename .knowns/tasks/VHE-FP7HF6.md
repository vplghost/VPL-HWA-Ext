---
id: VHE-FP7HF6
title: Apply captured Guild Clash reward events to cache
status: done
priority: medium
labels: []
createdAt: '2026-11-13T23:50:56.670Z'
updatedAt: '2026-11-13T23:56:36.722Z'
completedAt: '2026-11-13T23:56:36.678Z'
timeSpent: 332
---
# Apply captured Guild Clash reward events to cache

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Captured Guild Clash reward receipt adds each authoritative reward to resources/inventory cache exactly once.
- [x] #2 Failed claims or duplicate/replayed events cannot create extra rewards; regressions and release build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Analyze the supplied claim/event capture, identify authoritative reward payload and existing deduplication path, implement scoped reward reduction with regressions, document evidence and validate version/build/commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Analyzed supplied16083-byte client1.293.1010 capture SHA256ca189eb47f14c6a85e0aaf40eb8c50e945510e8c3a04d01fff5d513494cb912e. Observed clanClash_claimReward args ClashEventId1/ClaimedTypes[1] at2026-11-13T23:49:09.310Z; response{} has no reward quantities and no accompanying socket reward event. Added receipt extraction/reduction, bounded100ident dedup history, shared-policy once-only userGetInfo/inventoryGet/refillableGetAll follow-up reads. Authoritative snapshots update balances and resource mirrors; no guessed clan-ranking/config rewards or claim re-dispatch. Existing explicit-payload compatibility supports shared deltas if present, guards newer snapshots and skips deltas for same-batch authoritative resource snapshots in either call order. Replayed actual private trace yields1receipt/no invented resource entries/replayChanged=false. Sanitized regressions cover failures, truncation, missing/mismatched results, explicit rewards, same-batch snapshots, Direct/Piggyback/disabled policy, follow-up dedup and inventory/resource consistency. Final702tests:690pass,0fail,12optional skips; typecheck and rebuilt0.10.73 production artifacts passed. Review PASS P1=0/P2=0/P3=0. Updated @doc/architecture/rpc-cache-pipeline with captured contract, source hash and evidence limitations. System Decision Impact: none — extends established passive receipt/deduplicated reward/authoritative sync pipeline under unchanged shared RPC policy.
<!-- SECTION:NOTES:END -->

