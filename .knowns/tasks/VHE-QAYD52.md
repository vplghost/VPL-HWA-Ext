---
id: VHE-QAYD52
title: Align team terminology with verified server concepts
status: done
priority: medium
labels: []
createdAt: '2026-11-13T04:52:38.804Z'
updatedAt: '2026-11-13T04:53:48.426Z'
completedAt: '2026-11-13T04:53:48.426Z'
timeSpent: 52
---
# Align team terminology with verified server concepts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Standardize user-facing team/lineup wording using observed team RPC contracts; preserve distinct world-map squad concepts and existing protocol/storage identifiers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 User-facing team selection, previews and errors consistently use Team instead of Lineup.
- [x] #2 Verified Squad payload/march semantics and protocol/storage identifiers remain unchanged.
- [x] #3 Terminology convention documented; relevant tests, typecheck and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify team and squad terms against captured RPC contracts.
2. Replace user-facing lineup wording with team in Vue UI, shared/background errors and retained popup; preserve protocol/storage/helper identifiers.
3. Update language convention and existing text assertions.
4. Run targeted UI tests, typecheck, build and validate task/docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Aligned Team copy in Vue dialogs/Teams tab, queue tooltips, background errors, dungeon status and retained popup. Preserved camelCase helpers, options.lineups, storage keys, RPC payloads and user names; Squad remains world-map dispatch/deployed terminology. Existing text assertions updated. Validation: 118 targeted tests passed; npm run typecheck and npm run build passed; git diff --check clean; language doc validation 0 issues.
System Decision Impact: candidate @decision/20261113-1153-use-verified-server-terms-for-existing-domain-concepts (added) — verified server terminology guides domain naming and UI copy.
<!-- SECTION:NOTES:END -->

