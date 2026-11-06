---
id: VHE-EZ49PN
title: Fix Resources sort and require version bump per build
status: done
priority: high
labels: []
createdAt: '2026-11-03T06:05:10.015Z'
updatedAt: '2026-11-06T10:31:33.863Z'
completedAt: '2026-11-03T06:12:07.491Z'
timeSpent: 408
archivedAt: '2026-11-06T10:31:33.863Z'
---
# Fix Resources sort and require version bump per build

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resources tab crashes when a cached resource has a finite amount but no label; update fallback and regression coverage. Make every npm build increment synchronized package, lock, and manifest versions, and update Knowns release policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resources name sorting handles unlabeled resource entries without throwing and displays a useful fallback
- [x] #2 Every npm run build increments patch by default while keeping package.json, package-lock.json, extension/manifest.json, and dist manifest synchronized
- [x] #3 Knowns release policy describes the per-build version rule and how to request minor/major versions
- [x] #4 Targeted tests, build behavior, and docs validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the Resources crash using an unlabeled cache entry. 2. Add a deterministic label fallback and regression test. 3. Implement per-build version bump with build success handling and document the rule. 4. Verify versions, targeted tests, build, and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: resourceLabel returned undefined for finite-amount cache entries lacking data.label, causing Resources name sort to call localeCompare on undefined. Added deterministic key-based fallback and a regression test that reproduced the original TypeError before fix. Build now bumps SemVer once after asset compilation, checks source version synchronization and monotonicity, and copies the updated manifest to dist. Updated @doc/workflows/extension-versioning-and-release. Tests: 54 UI/data/version tests pass; npm run build bumped 0.9.34 to 0.9.35 and all four version files agree; Knowns doc/task validation clean. System Decision Impact: version policy recorded in the existing release workflow doc.
<!-- SECTION:NOTES:END -->

