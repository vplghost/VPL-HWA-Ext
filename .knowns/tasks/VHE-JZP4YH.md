---
id: VHE-JZP4YH
title: 'P2-35: Legends Draft Headless Play (Start, 1-Click Pick + Confirm & Finish Battle)'
status: done
priority: medium
labels:
  - draft
  - ui
  - p2
createdAt: '2026-11-27T09:49:05.629Z'
updatedAt: '2026-11-27T09:51:50.053Z'
completedAt: '2026-11-27T09:51:50.053Z'
timeSpent: 0
---
# P2-35: Legends Draft Headless Play (Start, 1-Click Pick + Confirm & Finish Battle)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement headless Legends Draft play directly from LegendsDraftModal.vue with verified 6-RPC allowlist, 1-click pick team + explicit confirm, battle finish & result display
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-35 headless Legends Draft play: draftPlayService.ts (validateDraftLineup, mapTeamToRoundPicks, 6-RPC builders, parseDraftMatchOutcome), strict interceptor allowlist for 6 randomDraft RPCs (zero Emerald spend), winstreak & lastMatchResult persistence, LegendsDraftModal.vue interactive 5-round picker + 1-click Pick Team (local only) + explicit Confirm & Submit + Start Battle & Claim Result + Auto-finish toggle. Verified with 1,350 passing tests (0 fail) and dual-build.
<!-- SECTION:NOTES:END -->

