---
id: VHE-8SXKQF
title: Add free alchemy wheel spin to Dashboard quick actions
status: done
priority: medium
labels: []
createdAt: '2026-11-14T01:09:40.478Z'
updatedAt: '2026-11-14T01:19:36.510Z'
completedAt: '2026-11-14T01:19:36.477Z'
timeSpent: 586
---
# Add free alchemy wheel spin to Dashboard quick actions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze supplied client1.293.1010 free spin trace and implement a small Dashboard Quick Actions icon button using refillable_alchemyUseVideo(type:alchemy), shared RPC settings, server-confirmed reward/quota updates and safe pending/error handling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard Quick Actions includes a compact free alchemy spin button using only the captured free RPC.
- [x] #2 Confirmed spins update gold and relevant quest/quota cache without replay/double credit; pending/errors and unavailable attempts are handled safely.
- [x] #3 Relevant checks, documentation, versioned build and commit complete.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect captured contract, dashboard actions, refillable alchemy quota/config and dispatch allowlists. 2. Add strictly free spin action and passive cache handling with confirmation/pending/availability UI. 3. Test rewards/quests/quota/no-paid-fallback, document observed contract and release version/build/commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented compact Dashboard FreeAlchemySpinButton with exact free refillable_alchemyUseVideo({type:alchemy}) call, shared RPC settings, no paid fallback, pending duplicate-click guard, server-result/error tooltip/live status and no uncertain timeout retry. Captured response73800gold/crit2 credits73800once; result.quests updates progress/state without awarding unclaimed quest rewards. Passive extraction/reducer keep100receipt tokens, support array/object quest caches and newer/same-batch authoritative balance/quest precedence. Success refreshes userGetInfo/questGetAll under global RPC policy; this supplies main refillable53quota without invented decrements or archived62cooldowns. Verified splitlib identifies53alchemy_video,19alchemy,62alchemy_free; original free trace SHA256af747b7aa6446a56281d4502bfbcc09078a536ef3e78aefd7dee0f7a119033e7. Interceptor classifies only exact method/type/no-feature/one-argument contract as a bounded one-use mutation, including strict Direct validation and Piggyback helper-result isolation. Preserved archived62header suspension and clarified memory/archive scope for this explicit user resumption. Final709tests:697pass,0fail,12optional skips; typecheck and production build0.10.74 passed. Review PASS P1=0/P2=0/P3=0. Docs @doc/architecture/rpc-cache-pipeline and @doc/archive/shelved-wheel-of-fortune validated. System Decision Impact: none — scoped feature follows existing shared RPC, passive reward reduction and small dashboard action conventions; no global policy change.
<!-- SECTION:NOTES:END -->

