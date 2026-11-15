---
id: 20261115-1412-prefer-passive-complete-march-state-with-targeted-recovery-reads
title: Prefer passive complete march state with targeted recovery reads
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-ZRSTK3'
  - '@doc/architecture/passive-first-gathering-march-observations'
relatedDocs:
  - architecture/passive-first-gathering-march-observations
relatedTasks:
  - VHE-ZRSTK3
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-ZRSTK3" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '5e1884a33114ab388c3a20f45f8d721e184d8de59843e7322e8252ecd7a52e06'
reviewEvaluatedAt: '2026-11-15T07:12:07.097Z'
createdAt: '2026-11-15T07:12:07.098Z'
updatedAt: '2026-11-15T07:12:07.098Z'
---

## Context


## Decision

Automatic gathering and dashboard bootstrap should reuse canonical native RPC and captured MQTT observations, coalesce overlapping march/unit reads per account, and request only missing confirmation evidence. A partial push cannot substitute for initial complete march hydration. Wait until return ETA before polling, and retain fresh troop plus march evidence before reusing teams. Explicit user refresh remains available.

## Alternatives Considered


## Consequences
