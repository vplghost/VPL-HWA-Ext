---
id: 20261115-1358-account-scoped-mail-claims-and-explicit-expiry
title: Account-scoped mail claims and explicit expiry
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-7AC9T3'
relatedDocs:
  - api/mail-rpc-contract-and-dialog
relatedTasks:
  - VHE-7AC9T3
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-7AC9T3" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'ec6bdc5899c4872373826c8c8b3f2ebbe452e2099ab13e437573eee9f0ddffbe'
reviewEvaluatedAt: '2026-11-15T06:58:40.031Z'
createdAt: '2026-11-15T06:58:40.032Z'
updatedAt: '2026-11-15T06:58:40.032Z'
---

## Context


## Decision

Use explicit server deadlines only for cache expiry, preserve unknown deadlines, and persist account-scoped claim tokens before sending. Ambiguous acknowledgments remain pending; update rewards only from matching receipts or authoritative snapshots. Opening Mail reads cache and refresh is explicit.

## Alternatives Considered


## Consequences
