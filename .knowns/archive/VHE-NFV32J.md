---
id: VHE-NFV32J
title: Simplify rally troops and learn capacity from squads
status: done
priority: high
labels: []
createdAt: '2026-11-06T09:59:04.510Z'
updatedAt: '2026-11-06T10:31:35.780Z'
completedAt: '2026-11-06T10:11:30.044Z'
timeSpent: 665
archivedAt: '2026-11-06T10:31:35.780Z'
---
# Simplify rally troops and learn capacity from squads

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove manual capacity inputs, add Settings defaults 600 per hero and 950 base, infer capacity evidence from manual rallies/auto-join/gathering, and correct troop labels/tier ranges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rally has no per-hero/base capacity inputs; Settings persists defaults 600/950 and affects preview/background queue.
- [x] #2 Successful own manual rally, auto-join and gathering squads provide bounded stat-bound capacity evidence; identifiable hero contributions can be inferred without assigning arbitrary values to an underdetermined lineup.
- [x] #3 UI shows counts and tiers for Marksmen 1–9, Spearmen 11–19, Infantry 21–29; allocator excludes IDs outside those ranges.
- [x] #4 Tests/build/docs updated and reviewed changes committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect capacity/Settings/cache squad sources and current tests. 2. Add normalized defaults and a stat-bound observation model with conservative team load estimates and unique-solution hero inference. 3. Capture own squad evidence from successful rally, auto-join and gathering events. 4. Replace capacity form inputs with a compact per-type troop summary; add Settings fields; background uses settings and refreshed evidence. 5. Cover defaults/settings propagation, underdetermined/conflicting evidence, ownership, and troop mapping in tests; update docs/memory, build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented compact per-type/tier summary, Settings defaults 600/950, fresh settings in background allocation, and corrected troop ID ranges excluding 10/20/30. Successful own create/getRallyById/auto-join/gathering learn bounded max loads with account+hero-stat signatures. Row-reduced identifiable contributions are inferred; underdetermined/conflicting cases retain defaults and exact-lineup observed totals. Legacy manual preference capacities ignored. Full tests currently 280 passed, 10 optional private trace skips, 0 failures. Docs and prior active capacity memory updated to remove the obsolete manual-input requirement.

Verification: npm run check passed 280 tests with 10 optional private-trace skips and no failures; build version 0.9.76. New regressions cover Settings defaults/serialized writes/blank rejection, no capacity inputs in Rally, per-type counts, corrected ID boundaries, custom Settings applied in background across all RPC modes, own manual-join details, max-load deduplication, stale/account isolation and identifiable/conflicting/underdetermined equations. System Decision Impact: candidate @decision/20261106-1709-estimate-rally-capacity-from-settings-and-identifiable-squad-observations (added) — replaces the requested explicit-input workflow with Settings fallback and observed-load inference; draft only, not accepted. No linked spec/locked D-IDs apply.

Final review from quality/architecture/security/completeness perspectives: no unresolved P1/P2 findings. Own-account capture guard requires level/star/power snapshots and no successful-response evidence is learned from rejected RPCs. Settings preview/background, no-manual-input UI, source/dist equality, docs validation and full tests/build are verified. Build 0.9.76 ready; inferred capacity remains an estimate based on squad loads, not a claim of an exact game formula.
<!-- SECTION:NOTES:END -->

