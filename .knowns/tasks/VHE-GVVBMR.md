---
id: VHE-GVVBMR
title: Add Brigand Camp dialog and confirmed world energy deduction
status: done
priority: medium
labels: []
createdAt: '2026-11-13T09:08:16.374Z'
updatedAt: '2026-11-13T09:15:46.811Z'
completedAt: '2026-11-13T09:15:46.811Z'
timeSpent: 435
---
# Add Brigand Camp dialog and confirmed world energy deduction

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze hwa-game-record-202611131602_brigand.json and immutable game config. Add Dashboard Brigand dialog using verified globalMapCamp team and winCampBattle:camp protocol; reconcile successful camp energy deductions without replay or fabricated marches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard opens Brigand Camp dialog next to Solo Monster; supports camp ID and up to five unique owned heroes from globalMapCamp.
- [x] #2 Successful winCampBattle deducts 10 World Energy once from known snapshot; failures, replay and stale actions do not deduct incorrectly.
- [x] #3 Dialog reflects RPC pending, errors and confirmed reward response; does not invent camp discovery or marches.
- [x] #4 Tests, typecheck and build pass; protocol evidence and limitations documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Document captured protocol and verified 10 World Energy cost. 2. Implement camp result/team cache and deduplicated successful energy deductions. 3. Add Dashboard dialog with explicit camp ID and hero team, transport/server result feedback and no automatic replay. 4. Test reducer and dialog contract, typecheck and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Brigand Camp modal beside Solo Monster, saved/custom hero teams, manual camp UUID, known regenerated World Energy, pending/server-result handling and reward display. Added passive successful settlement accounting and policy-respecting authoritative refill/inventory follow-up. Piggyback action allowlist and replay tests cover one-shot dispatch. Immutable config MD5 verified. Validation: 611 total tests, 599 passed, 12 optional private-data skips, zero failures; typecheck and production build passed. Evidence/limitations: @doc/api/brigand-camp-rpc-contract. No discovery RPC or battle-start API was captured, so no automated search or Unity battle launch is claimed; direct live settlement remains untested. Changes are uncommitted, alongside the previously completed city queue work.
System Decision Impact: candidate @decision/20261113-1615-keep-brigand-camp-settlement-separate-from-monster-marches (added) — distinguish hero-only camp settlement from squad marches and enforce confirmed energy accounting.
<!-- SECTION:NOTES:END -->

