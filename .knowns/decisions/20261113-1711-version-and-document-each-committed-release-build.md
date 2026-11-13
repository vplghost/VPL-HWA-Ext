---
id: 20261113-1711-version-and-document-each-committed-release-build
title: Version and document each committed release build
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-H7PB0V'
  - '@doc/architecture/committed-build-versions-and-changelog'
  - 'scripts/bump-version.mjs:bumpVersion'
  - User request, 2026-11-13
relatedDocs:
  - architecture/committed-build-versions-and-changelog
relatedTasks:
  - VHE-H7PB0V
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-H7PB0V" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches:
  - id: 20261111-1038-always-build-release-bundle-and-track-in-git-on-version-release
    title: Always build release bundle and track in git on version release
    status: accepted
    score: 0.850000
    kind: conflict
    hash: f7d324510226e07188f959c079ad7c17f6178e83d1b7c7d999233b4fa53d0864
    matchedBy:
      - 'lexical:conflict_topic'
    snippet: Every time a new version is created or released, the project build command must always be executed, and the built release bundle must be included in git commits and pushed so that a ready-to-run extension is available...
    tags:
      - release
      - build
      - workflow
      - git
reviewAllowedResolutions: []
reviewEvaluatedHash: 'a2c8a2ac415d7cbc19df59e407c7d2fc1137a1c38165d07edfe73c00ee469dc2'
reviewEvaluatedAt: '2026-11-13T10:11:48.175Z'
createdAt: '2026-11-13T10:11:48.175Z'
updatedAt: '2026-11-13T10:11:48.175Z'
---

## Context

The user explicitly requests version increments for builds associated with commits, with changelogs. Existing version:bump already synchronizes the three source version files; build compiles WXT artifacts.

## Decision

For each new committed release build, prepare one patch version increment (unless another boundary is requested), add dated user-visible CHANGELOG.md notes, build dist and verify source/lock/generated manifests match. Repeated verification builds before that same commit reuse its prepared version. Keep build compilation free of implicit version mutations; the release preparation invokes the existing version:bump utility.

## Alternatives Considered


## Consequences
