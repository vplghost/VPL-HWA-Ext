---
id: VHE-B86D4M
title: Resume configured gathering teams after game reload using own outpost summary
status: done
priority: high
labels: []
createdAt: '2026-11-14T18:00:51.818Z'
updatedAt: '2026-11-16T03:39:31.470Z'
completedAt: '2026-11-14T18:05:31.456Z'
timeSpent: 262
spec: specs/smart-auto-gathering
---
# Resume configured gathering teams after game reload using own outpost summary

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate hwa-game-record-202611150055_relaod.json: user configures3 teams but only1 is outside. Replay actual startup data, fix confirmed gathering blockers and verify filling3 slots without duplicate squads or losing confirmation guards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Replay sanitized reload startup to reproduce the confirmed own-outpost context blocker despite an authoritative getOutpostSummary response.
- [x] #2 Hydrate account-scoped own outpost/map coordinates from successful getOutpostSummary:outpost with validation, freshness and account-switch guards.
- [x] #3 Demonstrate sequential filling from1 to3 gathering squads after reload using actual captured cache plus simulated successful search/dispatch confirmations; no duplicate dispatch beyond3.
- [x] #4 Document confirmed cause versus capture limitations and pass regression tests, typecheck and validated build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract sanitized relevant RPCs from supplied log and replay reducer/planner. 2. Add own-outpost summary hydration and scoped guards. 3. Test startup before world-map chunks, rejected/stale/foreign data, and1→3 confirmed dispatch lifecycle. 4. Update canonical gathering docs, review/test/build and complete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed startup blocker: capture timeline14 getOutpostSummary:outpost includes own606,376/mapId but was ignored, leaving Smart nearest waiting until getChunks at timeline39. Secondary reproduced bug: generic center587,340 from mine march overrode known own-base center in fixed-level searches. Added account-scoped own summary hydration with identity/time/map validation; prefer outposts[activeAccount] before generic center. Sanitized capture fixture and actual background/reducer/planner regression prove startup recovery without chunks and1→2→3 server-confirmed squads, no fourth; old-account/rejected/invalid/stale/relocated summaries covered. User max3 is the supplied requirement, not an exported setting. The44-entry, ~30s capture contains no helper search/attack request or persisted automation state, so root-cause report explicitly limits conclusions; simulated responses prove regression behavior, not live-game outcome. Full suite789 tests:777 passed,12 optional private-capture skips; typecheck/build PASS at0.10.84. Review: PASS, no P1/P2 remaining; preserved confirmation/freshness/queue/RPC/account guards. Spec Decision Compliance: D1=pass,D2=pass,D3=pass,D4=pass,D5=pass. System Decision Impact: none — fixes enforcement of existing own-outpost/account-scoping rules, no new durable policy. Canonical evidence: @doc/specs/smart-auto-gathering and @doc/api/world-map-rpc-contracts.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

