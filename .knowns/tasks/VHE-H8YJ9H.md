---
id: VHE-H8YJ9H
title: Keep Vue resources live and custom teams account isolated
status: done
priority: high
labels:
  - migration
  - vue
  - storage
createdAt: '2026-11-13T03:51:26.333Z'
updatedAt: '2026-11-13T03:54:21.049Z'
completedAt: '2026-11-13T03:54:21.049Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Keep Vue resources live and custom teams account isolated

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ResourcesTab never advances regeneration clock; TeamsTab loads customTeams once and falls back to first stored account before cache loads. Add lifecycle ticker and account-reactive teams loading without cross-account fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resources regenerate while active and timer stops on unmount/deactivation
- [x] #2 Custom teams never use another account fallback or stale async response
- [x] #3 Saving without account or during account switch is rejected
- [x] #4 Behavioral tests pass and owned files pass Vue strict typecheck
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use lifecycle-aware useNow for resource regeneration. Extract useAccountTeams with account-keyed reads/writes, no first-account fallback, stale async reply suppression and storage updates; reset editor on account switch. Add runtime tests for clock updates/cleanup and account switching/read races/write guards. Run Vue typecheck and frontend tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted useNow lifecycle ticker and useAccountTeams. Unknown account shows no teams; stale loads suppressed; account switch resets editor; writes reject absent/switched account and preserve other account entries; storage changes reload active list. Positive troop limit validation added. Runtime tests cover clock tick/unmount, unknown account, stale reads, save switch and storage notifications. node --test tests/vue-ui-parity-runtime.test.mjs tests/wxt-vue-frontend.test.mjs => 52 passed. Owned files have no vue-tsc errors. useNow KeepAlive hooks reviewed; deactivation behavior not browser-tested. System Decision Impact: none — restores existing regeneration and account-keyed team contracts. Spec Decision Compliance: not applicable — standalone subtask.
<!-- SECTION:NOTES:END -->

