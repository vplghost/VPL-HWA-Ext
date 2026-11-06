---
id: VHE-XTBH0Y
title: Search gathering mines by level and move Draft alert to header
status: done
priority: high
labels: []
createdAt: '2026-11-06T03:54:11.361Z'
updatedAt: '2026-11-06T04:01:17.217Z'
completedAt: '2026-11-06T04:01:17.217Z'
timeSpent: 420
---
# Search gathering mines by level and move Draft alert to header

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the Experimental gather flow with mine type/level search from captured RPC, and replace Draft navigation/banner with a header alert icon that opens the existing dialog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gather controls choose resource type and level, search full mines using captured RPC arguments, and select returned targets for attackMine.
- [x] #2 Draft tab and banner are removed from navigation while the existing Draft dialog remains accessible.
- [x] #3 An active Draft alert icon appears immediately left of new mail with matching pulse/dot behavior and opens the dialog.
- [x] #4 Relevant tests, syntax, style compilation, and Knowns validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map mine type/level to config IDs from captured remote config and build searchMine RPC args in experimental-data.js.
2. Capture search results and map context in rpc-cache.js; render mine search and target selection in Experimental gather controls.
3. Remove Draft tab/banner and reuse the existing Draft dialog from a header alert icon beside mail.
4. Update focused tests and run syntax, CSS compilation, relevant suites, and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented full-only mine search by type/level with captured searchMine contract and config mapping; removed Draft navigation/banner and added header dialog button left of mail with active dot animation. 14 focused tests pass, syntax and CSS compile pass. System Decision Impact: none — bounded UI and captured RPC integration.
<!-- SECTION:NOTES:END -->

