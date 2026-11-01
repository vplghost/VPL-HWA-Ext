---
id: 20261101-1936-extension-ui-and-displayed-game-names-use-english
title: Extension UI and displayed game names use English
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-TCQV7Q'
relatedDocs: []
relatedTasks:
  - VHE-TCQV7Q
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-TCQV7Q" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '598d7365a43515a7c4c0a3ee60c5366ebcbdb4d220ed66e2ddd8bf3b9e19b397'
reviewEvaluatedAt: '2026-11-01T12:36:52.360Z'
createdAt: '2026-11-01T12:36:52.360Z'
updatedAt: '2026-11-01T12:36:52.360Z'
---

## Context

The popup and generated game name data previously mixed Vietnamese and a few Cyrillic strings from the upstream English locale.

## Decision

Use English for all user-facing extension text, including generated game names. Correct confirmed non-English anomalies in the name generator. Offer resource header selection only for counters with verified automatic refill or producer-backed materials; Energy and World Energy stay fixed in the header.

## Alternatives Considered


## Consequences

The popup, badges, tooltips, status text and star labels are English. Unknown game names use a neutral ID fallback. Resource selection is limited to eligible balances.
