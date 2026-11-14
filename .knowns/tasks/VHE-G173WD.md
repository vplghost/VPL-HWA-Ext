---
id: VHE-G173WD
title: Compare boss and rally power in Raid tooltips
status: done
priority: medium
labels: []
createdAt: '2026-11-14T11:09:17.442Z'
updatedAt: '2026-11-14T11:16:52.571Z'
completedAt: '2026-11-14T11:16:52.571Z'
timeSpent: 372
---
# Compare boss and rally power in Raid tooltips

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show verified preset boss heroes/troops power alongside total observed rally troop power and known player hero power; mark incomplete hero totals with +, e.g.114k+. Reuse shared Header/Dashboard tooltip. Related earlier full-power work: @task-VHE-YE18TG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Header/Dashboard Raid tooltip compares boss heroes/troops/total power with the observed rally totals.
- [x] #2 Only known participant hero power is summed; incomplete totals use + (114k+), foreign hero IDs never resolve through own roster.
- [x] #3 Sources are hash-verified and packaged; account/version/unknown-data regressions and tests/typecheck/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Generate packaged boss heroes/troop totals and unit power from hash-verified config/preset sources. 2. Retain account-scoped full rally participant power inputs from details with version/timestamp guards, plus own-team fallback. 3. Add Rally/Boss heroes, troops and total comparison to shared march tooltip; incomplete known hero totals display + and unknowns remain explicit. 4. Test boss19/20/22, own vs foreign heroes, missing roster/troops, stale/version/account updates and shared tooltip; document semantics and version/build/validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented shared Raid tooltip Rally / Boss comparison using hash-verified packaged presets for all 30 boss levels. Account-scoped bounded rallyPowerStatus survives march refreshes and rejects older/lower-version snapshots. Only own matching hero profiles resolve; unknown heroes/troops remain explicit and known partial totals use +. Tests: 747 total, 735 passed, 12 optional skipped; focused rally/gathering tests 9 passed; typecheck and build passed, git diff --check clean. Release 0.10.79. Documentation: @doc/api/world-map-rpc-contracts. System Decision Impact: candidate 20261114-1816-display-observed-rally-power-with-explicit-partial-subtotals persisted as draft. Spec Decision Compliance: no linked spec D-rules. Prior blocked full-result task VHE-YE18TG remains unchanged.
<!-- SECTION:NOTES:END -->

