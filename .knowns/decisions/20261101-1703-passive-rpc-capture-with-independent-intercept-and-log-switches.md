---
id: 20261101-1703-passive-rpc-capture-with-independent-intercept-and-log-switches
title: Passive RPC capture with independent intercept and log switches
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-E85RA5'
relatedDocs: []
relatedTasks:
  - VHE-E85RA5
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-E85RA5" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '6b055b49a9264e1badfb247cb22a7b7c748b4c3def15684c545b5077bfd2c70d'
reviewEvaluatedAt: '2026-11-01T10:03:34.065Z'
createdAt: '2026-11-01T10:03:34.065Z'
updatedAt: '2026-11-01T10:03:34.065Z'
---

## Context

User corrected the earlier refresh behavior and requested independent on/off controls for interception and raw logging.

## Decision

The extension observes game fetch/XHR only and never initiates game API calls or reloads the game for refresh. The popup refresh action replays retained local log records into rpcCache. Persist interceptEnabled and logEnabled separately: disabling intercept bypasses capture and blocks both cache/log updates; disabling raw log writes still allows selected RPC cache updates while intercept is enabled.

## Alternatives Considered


## Consequences

Cache changes only when game naturally emits RPC or when retained local logs are replayed. Older cache/log remain viewable with interception off. The previous draft requiring a user-initiated game reload was rejected.
