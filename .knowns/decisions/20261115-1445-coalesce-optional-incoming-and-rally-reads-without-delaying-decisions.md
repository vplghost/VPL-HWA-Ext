---
id: 20261115-1445-coalesce-optional-incoming-and-rally-reads-without-delaying-decisions
title: Coalesce optional incoming and rally reads without delaying decisions
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-F8X6B6'
  - '@doc/architecture/passive-first-gathering-march-observations'
  - extension/world-read.js
  - tests/world-read.test.mjs
  - docs/acceptance/world-read-2026-11-15.json
relatedDocs:
  - architecture/passive-first-gathering-march-observations
relatedTasks:
  - VHE-F8X6B6
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedHash: '68b6e26070b4868387956a0bd783e8a729e35be8ff30e9225ca3a52632a6611a'
reviewEvaluatedAt: '2026-11-15T07:54:20.281Z'
createdAt: '2026-11-15T07:45:32.366Z'
updatedAt: '2026-11-15T07:54:20.281Z'
---

## Context


## Decision

Use bounded account-scoped coordination for optional incoming/rally reads. Quiet incoming fallback is 60 seconds and active threats 15 seconds, retaining full initial hydration and passive attack handling. Coalesce rally push bursts with a five-second window and persisted latest-version trailing read; native details may satisfy it. Preserve explicit refresh, Smart join rechecks and deadline-critical Raid membership/cancellation reads.

## Alternatives Considered


## Consequences
