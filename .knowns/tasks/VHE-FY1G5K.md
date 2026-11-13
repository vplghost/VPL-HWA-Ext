---
id: VHE-FY1G5K
title: Make WXT output complete and distribution builds fail on errors
status: done
priority: high
labels:
  - migration
  - build
  - wxt
createdAt: '2026-11-13T03:47:14.454Z'
updatedAt: '2026-11-13T04:00:44.213Z'
completedAt: '2026-11-13T04:00:44.213Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Make WXT output complete and distribution builds fail on errors

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WXT currently emits popup only while manifest references absent background/content files and assets. Hybrid build silently falls back to legacy and bumps versions during checks. Make WXT public asset pipeline complete, validate output, fail closed, build without implicit version changes; fix alias mismatch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npm run wxt:build output includes every manifest/background dependency and game asset
- [x] #2 Distribution uses only WXT Vue popup and fails when dependencies missing
- [x] #3 Build/check does not implicitly bump extension versions
- [x] #4 Fixture-based artifact validation tests and full build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use WXT build:publicAssets hook to expose existing non-UI worker/content runtime dependencies and game assets without bundling legacy popup. Preserve classic importScripts/world boundaries. Replace hybrid build with fail-fast WXT invocation and validated output copy to dist. Retain explicit version:bump, fix root alias. Add fixture-driven artifact tests plus real build verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
System Decision Impact: candidate @decision/20261113-1059-preserve-wxt-vue-tailwind-boundaries-during-html-parity-migration (added) — WXT-only packaging and strict Vue validation conventions documented.
Spec Decision Compliance: not applicable — audit task wave has no linked spec.
Validation: npm run check passed (573 tests;561 pass;12 skip;0 fail), strict vue-tsc and artifact checks pass. Browser acceptance remains @task-VHE-HHA1TB.
<!-- SECTION:NOTES:END -->

