---
id: VHE-DHB6KB
title: Discover Brigand camps from captured getCampSummary RPC
status: done
priority: medium
labels: []
createdAt: '2026-11-13T09:49:40.801Z'
updatedAt: '2026-11-13T09:53:27.876Z'
completedAt: '2026-11-13T09:53:27.876Z'
timeSpent: 199
---
# Discover Brigand camps from captured getCampSummary RPC

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement camp search from hwa-game-record-202611131645_brigand_search.json: getCampSummary:camp args {} returns campsSummary with camps and nextRespawnDt. Replace manual-only target workflow with selectable server targets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Search Camps sends captured getCampSummary:camp args {} and populates selectable camps with levels/defenders and respawn time.
- [x] #2 Errors and queued transport never count as successful/empty search; expired and defeated camps cannot remain selectable.
- [x] #3 Camp search inherits global dispatch settings and works in Piggyback; search itself never spends World Energy.
- [x] #4 Tests, typecheck and build pass; docs describe verified discovery protocol.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reduce valid camp summary and search errors, invalidate defeated/expired targets. 2. Allow exact search read through shared Piggyback policy. 3. Add search/filter/select, defenders and respawn UI to Brigand dialog. 4. Verify receipt/pending/errors, trace replay, policy and target invalidation; update superseded documentation and guidance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Observed getCampSummary:camp args {}, campsSummary.nextRespawnDt epoch milliseconds and six camp entries (config IDs 1,2,2,1,1,1; five defenders each). Added canonical search status/summary, feature-scoped Piggyback read, search/filter/select UI and authoritative target invalidation after victory or expiry. Removed manual-only discovery limitation from canonical docs and updated existing memory. Verification: 618 tests total, 606 passed, 12 optional private-data skips, zero failures; typecheck/build passed; actual Vue setup verifies queued/error/result races, local filter, selection and expiry; private search trace replay confirms six targets and zero energy cost. No live game actions sent. Tower changes from prior task remain uncommitted.
System Decision Impact: candidate @decision/20261113-1653-discover-brigand-targets-through-camp-summary (added) — verified discovery replaces manual-only limitation; settlement and energy guidance retained.
<!-- SECTION:NOTES:END -->

