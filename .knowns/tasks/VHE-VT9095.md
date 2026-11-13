---
id: VHE-VT9095
title: Replace Guild Versus sample fallback metrics with unknown states
status: todo
priority: medium
labels:
  - migration
  - followup
  - data-integrity
createdAt: '2026-11-13T03:55:34.148Z'
updatedAt: '2026-11-13T04:01:51.214Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Replace Guild Versus sample fallback metrics with unknown states

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GuildVersusModal contains sample fallbacks (guild name, battle/round defaults, eligibility activity/user counts). Compare full baseline behavior and replace synthetic progress/eligibility with explicit unknown UI and fixtures; preserve real reported zeros. This is inherited/pre-existing behavior, not proven migration regression.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Missing guild and eligibility data displays unknown rather than sample values
- [ ] #2 Reported zero values remain zero
- [ ] #3 Fixture tests cover missing, zero and full status without enabling claims from fabricated thresholds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compare legacy and Vue sample fallbacks in GVS; introduce normalized unknown-aware view model; preserve true zeros; update template placeholders and add fixtures for absent/zero/full server data, then test/typecheck/build.
<!-- SECTION:PLAN:END -->

