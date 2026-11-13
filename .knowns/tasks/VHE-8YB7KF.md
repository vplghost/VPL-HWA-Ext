---
id: VHE-8YB7KF
title: Restore Vue cache initialization and account-scoped squad settings
status: done
priority: high
labels:
  - migration
  - rpc
  - vue
createdAt: '2026-11-13T03:47:23.410Z'
updatedAt: '2026-11-13T04:01:51.285Z'
completedAt: '2026-11-13T03:53:41.606Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Restore Vue cache initialization and account-scoped squad settings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix shared cache initial read races/removal handling, runtime messaging error propagation, cross-account squad preference leakage and ignored troop capacity settings; restore system theme changes. Scope shared Vue composables only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Concurrent initial consumers share one storage read and newer storage events/removals win
- [x] #2 RPC callback transport errors reject; optimistic UI changes never persist entire canonical rpcCache
- [x] #3 Squad teams/preferences stay account-scoped and use saved capacity settings
- [x] #4 System theme and external storage changes update UI with listener cleanup
- [x] #5 Behavioral regression tests pass and remaining unowned protocol risks are reported
- [x] #6 Troop actions never fabricate training/healing/collected resource state before background receives game success
- [x] #7 Strict vue-tsc diagnostics in owned composables and resource/capacity utilities are resolved without disabling strict checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve established refresh-rpc/background dispatch contract; coalesce shared startup, attach listener before initial reads, ignore stale initial fields superseded by events, clear removed keys, propagate runtime transport failures.
2. Keep optimistic cache changes popup-local to prevent whole-cache overwrites of background-authoritative RPC state.
3. Scope custom teams and raid/monster prefs strictly to current account; load configured capacity defaults and refresh on relevant storage/account changes.
4. Restore reactive system theme/storage theme changes with cleanup; test composable behavior via Vue SSR/no-DOM harness and mocked Chrome.
5. Read-only audit remaining message payloads, report unresolved defects with evidence, run targeted tests and validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded scope authorized by parent: useTroopTraining plus experimentalData/resourceData strict typing. Removed all optimistic troop writes; game response reducer remains source of truth. Added rejection regression and lifecycle tests. No live game actions sent.

Verification: node --test tests/vue-runtime-state.test.mjs tests/wxt-vue-frontend.test.mjs tests/experimental-data.test.mjs tests/resource-data.test.mjs tests/troops-train-heal.test.mjs -> 74 tests, 74 pass, 0 fail. npx vue-tsc --noEmit has zero diagnostics in all owned files (integrated errors elsewhere delegated to parent). Behavioral tests mount real Vue composables with custom renderer and mocked Chrome: stale cache reads/events/removals, transport failure, optimistic write isolation, account-scoped team selection, OS/storage theme updates, shared monitor teardown, rejected troop mutations. Review: cache source-of-truth restored, no game calls executed, no secret logging added; existing any types retained where not changed. System Decision Impact: none — restores legacy background-authoritative cache, account boundary and theme behavior without introducing a new durable policy. Spec Decision Compliance: not applicable — task has no linked spec. Canonical conventions/draft decision managed by parent VHE-HRA25T.

AC wording clarification: transport errors resolve structured {ok:false,error} for compatibility with existing callers; they do not reject the Promise. Behavioral tests prove this; no blanket exception behavior was introduced.
<!-- SECTION:NOTES:END -->

