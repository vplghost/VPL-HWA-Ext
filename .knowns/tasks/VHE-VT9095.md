---
id: VHE-VT9095
title: Replace Guild Versus sample fallback metrics with unknown states
status: done
priority: medium
labels:
  - migration
  - followup
  - data-integrity
createdAt: '2026-11-13T03:55:34.148Z'
updatedAt: '2026-11-14T14:52:31.058Z'
completedAt: '2026-11-14T14:41:50.051Z'
timeSpent: 307
parent: VHE-HRA25T
---
# Replace Guild Versus sample fallback metrics with unknown states

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GuildVersusModal contains sample fallbacks (guild name, battle/round defaults, eligibility activity/user counts). Compare full baseline behavior and replace synthetic progress/eligibility with explicit unknown UI and fixtures; preserve real reported zeros. This is inherited/pre-existing behavior, not proven migration regression.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Missing guild and eligibility data displays unknown rather than sample values
- [x] #2 Reported zero values remain zero
- [x] #3 Fixture tests cover missing, zero and full status without enabling claims from fabricated thresholds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect GuildVersusModal and canonical GVS source fields/static metadata, replacing sample/live default mixing with a tested unknown-aware view model. 2. Preserve explicit zero/false values and avoid inventing round, eligibility, threshold or challenge progress. 3. Wire all six modal sections and test actual Vue state/rendering for missing/zero/full fixtures. 4. Review, validate task, typecheck and build; then run browser acceptance sequentially.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed sample guild/league/round/participation/eligibility and schedule values via unknown-aware guildVersusView; preserved zeros and false, unknown challenge rates and stale round values. Readiness requires actual score, rule threshold, claim state and both explicit eligibility flags. Actual compiled Vue SFC SSR fixtures cover missing/zero/full state and absence of fake Ready/Eligible labels. Targeted50 tests, strict typecheck and validated WXT0.10.82 build passed. Review PASS: no blocking findings; existing source-pattern tests now follow helper wiring and assert dictionary normalization behavior. Canonical notes: @doc/architecture/goals-tracking. System Decision Impact: none — removes synthetic fallback debt under existing evidence-based state semantics. Spec Decision Compliance: not applicable — standalone migration follow-up.

Knowns extract: @doc/architecture/wxt-vue-tailwind-conventions, @memory/ajap7g. System Decision Impact: candidate @decision/20261114-2152-display-unknown-account-state-until-server-evidence-establishes-eligibility (added) — draft generalization of observed unknown-versus-zero eligibility behavior; remains non-current.
<!-- SECTION:NOTES:END -->

