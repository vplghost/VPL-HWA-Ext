---
id: VHE-7AC9T3
title: Add reward-first mail dialog and expire cached inbox entries
status: done
priority: high
labels: []
createdAt: '2026-11-15T06:31:20.221Z'
updatedAt: '2026-11-15T06:59:11.826Z'
completedAt: '2026-11-15T06:59:11.826Z'
timeSpent: 1660
---
# Add reward-first mail dialog and expire cached inbox entries

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Header mail icon should open a dialog showing cached mail rewards, deadline and claim controls. Reuse existing mailFarm/report claims under shared RPC policy; prune only explicit expired mail/report deadlines from cache, keep unknown deadlines, and retain accurate account-scoped server-confirmed claim state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Header icon opens an accessible Mail dialog with reward details/item names/icons, expiry/remaining time, known/unknown/empty states and explicit refresh.
- [x] #2 Single/all mail claims and existing report reward access use exact supported RPCs; queued/failed/uncertain claims do not optimistically credit rewards, repeat, or leak across accounts.
- [x] #3 Expired availableUntil-second mail and expiresAt-millisecond reports are removed from canonical/raw caches and header counts automatically; unknown expiry stays, and fresh snapshots supersede stale/claimed data safely.
- [x] #4 Capture-shaped parsing/pruning, actual UI and background claim lifecycle, Direct/Piggyback and real Chrome regressions plus full tests/typecheck/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify captured mail/report fields, existing reward parser/assets, claim contract and cache merge/pruning. 2. Add shared mail model/expiry helpers and account-safe prune/receipt/snapshot reduction plus background expiry scheduling and claim ownership. 3. Build reward-first Mail dialog, single/all/report claim actions and header/modal wiring; no auto-claim on opening. 4. Test deadline units, raw/canonical cleanup, snapshot precedence, unknown/expired/claimed rows, UI and exact claim pending/error/account paths. 5. Verify real Chrome Direct/Piggyback, run full checks/build and document contract/decision impact.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented reward-first Mail dialog, explicit expiry cleanup and account-scoped confirmed claims. Full tests: 847 total, 835 pass, 12 optional skips; typecheck/build 0.10.95 passed. Actual Chrome local fixture passed Direct and Piggyback, no refresh on open, expired hidden, unknown deadline retained, claim token settled. Evidence: docs/acceptance/mail-2026-11-15.json. Spec Decision Compliance: N/A (standalone). System Decision Impact: candidate @decision/20261115-1358-account-scoped-mail-claims-and-explicit-expiry (added) — explicit deadlines and confirmed mail claims.
<!-- SECTION:NOTES:END -->

