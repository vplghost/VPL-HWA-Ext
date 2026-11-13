---
id: VHE-YVXJB9
title: Finish dashboard cache compatibility and Vue diagnostics lifecycle
status: done
priority: medium
labels:
  - migration
  - vue
  - parity
createdAt: '2026-11-13T03:54:55.289Z'
updatedAt: '2026-11-13T03:56:22.345Z'
completedAt: '2026-11-13T03:56:22.345Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Finish dashboard cache compatibility and Vue diagnostics lifecycle

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore ActivityGoals canonical quest cache and tower completion precedence; remove favorite storage listeners on unmount and clear on deletion; show engine diagnostics using actual gameEngineStatus fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard honors canonical quest cache and brief-only tower completion
- [x] #2 Favorites clear on key deletion and unsubscribe on unmount
- [x] #3 Settings displays engine diagnostics based only on actual status fields and supported ping
- [x] #4 Behavioral tests and strict Vue typecheck pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Extract tested activity cache adapters and storage favorite lifecycle. Wire ActivityGoals canonical questGetAll alias and completion precedence. Replace anonymous favorite listeners in Heroes/Titans with useStoredFavorites including deletion/reset and unmount cleanup. Restore Settings diagnostics for ready/hasCanvas/hasSendMessage/hasRpcHeaders/rpcUrlAvailable using useGameConnection status plus engine-ping contract. Run runtime tests, strict Vue typecheck and source review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ActivityGoals now uses tested towerActivityState/readyQuestCount adapters: canonical questGetAll then legacy alias, and brief-only win completion precedes unknown state. Heroes/Titans useStoredFavorites subscribes before initial read, suppresses stale reads, handles deletion and unsubscribes on unmount. Settings engine diagnostics mirrors actual ready/hasCanvas/hasSendMessage/hasRpcHeaders/rpcUrlAvailable fields from useGameConnection and sends supported engine-ping. Runtime coverage includes all adapter branches and mounted favorite lifecycle. node --test tests/vue-ui-parity-runtime.test.mjs tests/wxt-vue-frontend.test.mjs => 55 pass, 0 fail. npx vue-tsc --noEmit exit 0 across full current tree. System Decision Impact: none — restores established HTML behavior, no new architecture rule. Spec Decision Compliance: not applicable — standalone subtask.
<!-- SECTION:NOTES:END -->

