---
id: 20261101-1650-cache-selected-rpc-snapshots-independently-of-raw-logs
title: Cache selected RPC snapshots independently of raw logs
status: rejected
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-434QVD'
relatedDocs: []
relatedTasks:
  - VHE-434QVD
verification: []
reviewState: ''
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'cfccc01dfade0f8200e9f3df15f314d2bd6aa3712ac0c14a028eb858a282b1c2'
reviewEvaluatedAt: '2026-11-01T09:50:22.371Z'
createdAt: '2026-11-01T09:50:22.371Z'
updatedAt: '2026-11-01T10:03:27.326Z'
---

## Context

The user requested reusable hero/item tables and cache/update views from observed game API responses.

## Decision

Use a separate bounded local rpcCache for selected complete /api/rpc responses, keyed by RPC name and optional feature. Refresh it passively on new game responses or by replaying retained log records. Exclude auth, chat, mail, and analytics data. Expose heroes, items, titans, teams, other snapshots, and log in popup tabs; use a user-initiated game reload for fresh RPC data.

## Alternatives Considered


## Consequences

Cache can outlive raw logs and remains a latest-observed snapshot, not a direct live API query. Tabs may show stale data until the game emits another matching RPC.
