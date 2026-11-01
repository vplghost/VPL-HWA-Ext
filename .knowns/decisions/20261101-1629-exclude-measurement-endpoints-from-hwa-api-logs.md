---
id: 20261101-1629-exclude-measurement-endpoints-from-hwa-api-logs
title: Exclude measurement endpoints from HWA API logs
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-GQ0290'
relatedDocs: []
relatedTasks:
  - VHE-GQ0290
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-GQ0290" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '8cb79efff0cea6887c5594941591f79bdd564b3a7ee9168bee6ab1cf888974e7'
reviewEvaluatedAt: '2026-11-01T09:29:53.037Z'
createdAt: '2026-11-01T09:29:53.037Z'
updatedAt: '2026-11-01T09:29:53.037Z'
---

## Context

Analysis of 179 captured requests found 127 measurement or advertising calls, obscuring 52 game and commerce requests.

## Decision

Exclude identified Nexters analytics, AppsFlyer, Google Analytics, and Google Ads endpoints from newly captured API logs, popup display, and JSON export. Keep game RPC, authentication, and Aghanim shop endpoints. Use local YYYYMMDDHHmm in export filenames and a sequence suffix for repeated exports within a minute.

## Alternatives Considered


## Consequences

Filtering is endpoint-based and may require updates as the game adds hosts. Existing raw data in temp remains private and ignored by Git.
