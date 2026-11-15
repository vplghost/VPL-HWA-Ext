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
relatedDocs:
  - architecture/passive-first-gathering-march-observations
relatedTasks:
  - VHE-F8X6B6
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-F8X6B6" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '2501a74ee798454295699891f355eb28f321053bf273d0b710e25688724203c1'
reviewEvaluatedAt: '2026-11-15T07:45:32.366Z'
createdAt: '2026-11-15T07:45:32.366Z'
updatedAt: '2026-11-15T07:45:32.366Z'
---

## Context


## Decision

Use bounded account-scoped coordination for optional incoming/rally reads. Quiet incoming fallback is 60 seconds and active threats 15 seconds, retaining full initial hydration and passive attack handling. Coalesce rally push bursts with a five-second window and persisted latest-version trailing read; native details may satisfy it. Preserve explicit refresh, Smart join rechecks and deadline-critical Raid membership/cancellation reads.

## Alternatives Considered


## Consequences
