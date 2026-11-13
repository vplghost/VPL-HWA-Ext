---
id: VHE-H7PB0V
title: Version committed builds and maintain release changelog
status: done
priority: medium
labels: []
createdAt: '2026-11-13T10:11:25.667Z'
updatedAt: '2026-11-13T10:12:01.591Z'
completedAt: '2026-11-13T10:12:01.591Z'
timeSpent: 21
---
# Version committed builds and maintain release changelog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User requests version increments for builds included with commits, with changelogs. Use existing version:bump utility; define release build convention so repeated verification builds do not increment again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Version 0.10.53 is synchronized in package.json, package-lock.json, source manifest and built manifest.
- [x] #2 CHANGELOG.md records Tower completion and Brigand camp search changes.
- [x] #3 Durable workflow documents patch bumps and changelog updates for committed builds, while repeated verification builds reuse the prepared version.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record per-commit release build convention. 2. Bump patch to 0.10.53 and write release notes covering Tower final boss state and Brigand discovery. 3. Build/verify synchronized package, lock, source and generated manifest versions; commit pending feature with release metadata.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prepared 0.10.53 with the existing version:bump utility. Added CHANGELOG.md covering Tower completion (086fb77) and camp discovery; documented once-per-committed-release preparation in @doc/architecture/committed-build-versions-and-changelog and user preference memory e29xg0. Production build passed and package, lock root, lock root-package, source manifest and dist manifest all equal 0.10.53. Existing full verification: 618 tests, 606 pass, 12 optional skips; typecheck passed. Release artifacts will be included with the pending Search Camps commit; LSP log stays outside.
System Decision Impact: candidate @decision/20261113-1711-version-and-document-each-committed-release-build (added) — patch version and changelog preparation for committed builds; repeated verification builds reuse version. This complements the existing requirement to build and track release bundles.
<!-- SECTION:NOTES:END -->

