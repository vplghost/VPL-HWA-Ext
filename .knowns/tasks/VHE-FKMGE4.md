---
id: VHE-FKMGE4
title: Remove obsolete globalThis registrations in nameData and generator scripts
status: done
priority: medium
labels:
  - refactor,data
createdAt: '2026-11-21T05:12:47.719Z'
updatedAt: '2026-11-21T05:15:09.484Z'
completedAt: '2026-11-21T05:15:09.484Z'
timeSpent: 0
---
# Remove obsolete globalThis registrations in nameData and generator scripts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 nameData.ts removes globalThis.hwaHelperNameData and hwaHelperNameMap
- [ ] #2 generate-name-map and sync-observed-item-assets generator templates remove globalThis assignments
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed globalThis registrations from nameData.ts, generate-name-map.mjs, and sync-observed-item-assets.mjs
<!-- SECTION:NOTES:END -->

