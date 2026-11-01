---
id: 20261101-1557-bounded-post-body-capture-for-api-profiling
title: Bounded POST body capture for API profiling
status: rejected
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-EBNKTR'
relatedDocs: []
relatedTasks:
  - VHE-EBNKTR
verification: []
reviewState: ''
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '315fb3b571d0c98ba1d93a35c7a0fdadaf47c43b53fd7d0b927b104ce0ffdbeb'
reviewEvaluatedAt: '2026-11-01T08:57:33.789Z'
createdAt: '2026-11-01T08:57:33.790Z'
updatedAt: '2026-11-01T09:16:21.096Z'
---

## Context

Detailed analysis of POST API calls was explicitly requested after the initial metadata-only implementation.

## Decision

Capture fetch/XHR metadata for game-page requests. For POST, additionally retain textual request and response bodies when readable, capped at 16000 characters per body and about 5 MB total local log storage. Do not retain URL query or fragment, headers, or cookies as separate fields.

## Alternatives Considered


## Consequences

POST bodies may contain sensitive data; export files require review before sharing. Binary and inaccessible streams remain null. Replaces the rejected metadata-only draft.
