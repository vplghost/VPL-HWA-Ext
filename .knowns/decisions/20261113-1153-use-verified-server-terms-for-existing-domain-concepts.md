---
id: 20261113-1153-use-verified-server-terms-for-existing-domain-concepts
title: Use verified server terms for existing domain concepts
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-QAYD52'
  - '@doc/architecture/ui-language-standardization'
  - '@doc/api/roster-inventory-rpc-catalog'
  - '@doc/api/world-map-rpc-contracts'
relatedDocs:
  - architecture/ui-language-standardization
relatedTasks:
  - VHE-QAYD52
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-QAYD52" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'e6c73466b4e9bfcb9a335c4a919a0fc921354737292835b25cbdd2169d33c483'
reviewEvaluatedAt: '2026-11-13T04:53:31.792Z'
createdAt: '2026-11-13T04:53:31.792Z'
updatedAt: '2026-11-13T04:53:31.792Z'
---

## Context

User requested terminology alignment with server on 2026-11-13. Captured team RPCs and shared squad payloads distinguish these concepts; UI wording has been aligned in VHE-QAYD52.

## Decision

Use verified server terminology consistently for concepts that already exist: Team for selected or saved hero/titan groups, Squad for world-map heroes+units payloads and deployed squadId entities. Avoid Lineup as a synonym for Team in user-facing copy. Preserve RPC, persisted, compatibility identifiers and user-created names when changing copy.

## Alternatives Considered


## Consequences
