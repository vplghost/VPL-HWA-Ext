---
id: 20261101-1616-retain-rpc-sized-post-bodies-for-profiling
title: Retain RPC-sized POST bodies for profiling
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-X1SQQH'
relatedDocs: []
relatedTasks:
  - VHE-X1SQQH
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-X1SQQH" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'fbcc6003da6cd54ae8ea53cc3086baeea05b26e031fcf1acf47c145749629359'
reviewEvaluatedAt: '2026-11-01T09:16:27.973Z'
createdAt: '2026-11-01T09:16:27.973Z'
updatedAt: '2026-11-01T09:16:27.973Z'
---

## Context

HAR and fresh extension export showed JSON RPC responses up to about 322 KB; six of fourteen captured RPC responses were truncated by the former 16000-character cap.

## Decision

Capture fetch/XHR metadata on the game page. For POST, retain readable request and response bodies up to 524288 characters each, with about 5 MB total local storage and a maximum of 500 records. Mark older records that predate body capture; exclude URL query and fragment, headers, and cookies as separate fields.

## Alternatives Considered


## Consequences

Large bodies displace older records sooner. Exports may include sensitive POST data. The earlier 16000-character draft was rejected.
