---
id: VHE-YXR60J
title: Restore Vue recorder logs and missing automation settings
status: done
priority: high
labels:
  - migration
  - vue
  - parity
createdAt: '2026-11-13T03:47:17.827Z'
updatedAt: '2026-11-13T03:54:20.908Z'
completedAt: '2026-11-13T03:54:20.908Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Restore Vue recorder logs and missing automation settings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verified migration regressions: LogTab uses local apiLogs while background records session record:*; Settings lacks autoClaimSettings and priorityAutoJoin; Fab lacks guild unread badges. Restore existing contracts using Vue composables and Tailwind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Log reads session recorder, filters and exports actual payload; clear calls background
- [x] #2 Auto claim and priority auto join settings preserve legacy storage/RPC contracts
- [x] #3 Unread badge reacts to chat and marks read while chat modal open
- [x] #4 Behavioral regression tests pass and new Vue code compiles
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace LogTab local apiLogs with session record:* reader, live storage subscription, filtering/sorting/details and background clear/export commands.
2. Add dedicated automation settings composable preserving autoClaimSettings/priorityAutoJoin contracts and existing popup-data helpers; restore settings controls and on-open claim from globally mounted FabDial.
3. Restore guild unread badge and read tracking in FabDial using existing helper/storage key.
4. Behavioral tests for record ordering/filtering, settings normalization, claim payload/gating and unread calculation; compile SFCs and review diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Vue session recorder with live updates/filter/sort/details and background clear/export; dedicated automation composable preserves legacy reward claim/rally settings and account-scoped teams; once-on-open claim is mounted globally from FabDial; restored guild unread badges/read tracking. Tests: node --test tests/vue-ui-parity-runtime.test.mjs tests/wxt-vue-frontend.test.mjs => 52 pass, 0 fail (6 behavioral plus 46 frontend). WXT build passed. vue-tsc no errors in owned files; combined project errors handled by root. Review: no P1/P2 in owned diff; live game RPC mutation deliberately not run. System Decision Impact: none — restores existing HTML UI/storage/message contracts without introducing durable new guidance. Spec Decision Compliance: not applicable — standalone subtask, no linked spec.
<!-- SECTION:NOTES:END -->

