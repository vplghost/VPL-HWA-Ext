---
id: 20261101-1542-hwa-helper-mv3-source-and-api-logging-boundary
title: HWA Helper MV3 source and API logging boundary
status: rejected
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-N8QQGB'
relatedDocs: []
relatedTasks:
  - VHE-N8QQGB
verification: []
reviewState: ''
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '361e3ba45785104f10cb322791436e3babaf594b9c29e1daeaf168cca628430d'
reviewEvaluatedAt: '2026-11-01T08:42:39.042Z'
createdAt: '2026-11-01T08:42:39.042Z'
updatedAt: '2026-11-01T08:57:20.910Z'
---

## Context

Initial personal-use extension architecture and profiling scope.

## Decision

Use dependency-free Manifest V3 sources in extension/, generate dist/ with npm run build, and capture only bounded fetch/XHR metadata from the game origin. Do not store request or response bodies, headers, query strings, or fragments.

## Alternatives Considered


## Consequences

The popup exposes local logs, but this is exploratory profiling and does not cover every browser request source.
