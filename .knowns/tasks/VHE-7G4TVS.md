---
id: VHE-7G4TVS
title: Use synced icons for pinned header resources
status: done
priority: medium
labels: []
createdAt: '2026-11-13T18:05:25.969Z'
updatedAt: '2026-11-13T18:06:36.971Z'
completedAt: '2026-11-13T18:06:36.940Z'
timeSpent: 67
---
# Use synced icons for pinned header resources

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render available bundled resource icons for pinned header resources with existing symbolic fallback for missing or failed images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pinned header resources use available bundled icons and retain a fallback for missing or failed images.
- [x] #2 Typecheck, relevant verification and versioned production build pass; changes committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect header resource presentation and shared icon lookup. 2. Apply synced icons with bounded layout and image-error fallback. 3. Verify, bump patch/changelog, build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Header.vue now reuses getResourceIcon for pinned badges, with fixed16px contain sizing and per-resource image-error fallback to existing symbols. Shared bundled asset lookup preserves resource namespace checks; pin selection, amounts and cap indicators remain intact. Review PASS with no findings. Typecheck passed,16 relevant resource/icon tests passed and version0.10.69 production build validated. Changelog and package/lock/source/dist versions updated. System Decision Impact: none — extends existing shared local icon/fallback behavior to header presentation.
<!-- SECTION:NOTES:END -->

