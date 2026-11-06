---
id: 20261106-1132-shelve-wheel-and-preserve-draft-dialog-isolation
title: Shelve Wheel and preserve Draft dialog isolation
status: draft
supersedes: []
supersededBy: []
tags:
  - wheel
  - draft
  - rpc
  - user-rule
sources:
  - '@task-VHE-8D82V9'
  - '@doc/archive/shelved-wheel-of-fortune'
  - '@doc/architecture/legend-draft-system'
relatedDocs:
  - archive/shelved-wheel-of-fortune
  - architecture/legend-draft-system
relatedTasks:
  - VHE-8D82V9
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-8D82V9" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'd5723910b4aa2534c4616fbc811205d200632a354d056329624924dce96af72a'
reviewEvaluatedAt: '2026-11-06T04:32:15.267Z'
createdAt: '2026-11-06T04:32:15.267Z'
updatedAt: '2026-11-06T04:32:15.267Z'
---

## Context

User identified Draft click replacing tab content and explicitly requested Wheel suspension and replacement by queue count on 2026-11-06.

## Decision

Wheel/Free Spin is shelved: no live feature tracking or development until explicitly resumed by the user. Preserve its non-executable archive. The header uses actual RPC queue counts. Draft dialog rendering must target its modal body and its header icon is visible only for active stages.

## Alternatives Considered


## Consequences
