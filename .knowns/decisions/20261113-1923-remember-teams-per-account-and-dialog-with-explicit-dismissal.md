---
id: 20261113-1923-remember-teams-per-account-and-dialog-with-explicit-dismissal
title: Remember teams per account and dialog with explicit dismissal
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-A1W68G'
  - '@doc/architecture/dialog-team-memory-and-explicit-dismissal'
  - 'src/composables/useDialogTeamSelection.ts:useDialogTeamSelection'
  - tests/dialog-team-selection.test.mjs
  - tests/modal-dismissal.test.mjs
relatedDocs:
  - architecture/dialog-team-memory-and-explicit-dismissal
relatedTasks:
  - VHE-A1W68G
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-A1W68G" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'fb1579166c754d7e38ae9fc1ad413436b1e1bd52f3607474b07a48d9077cedd7'
reviewEvaluatedAt: '2026-11-13T12:23:25.862Z'
createdAt: '2026-11-13T12:23:25.862Z'
updatedAt: '2026-11-13T12:23:25.862Z'
---

## Context

Shared preferences were overwritten by unrelated option saves and Brigand had no persistent selection. User requests the last chosen team on reopening and no dismissal from backdrop clicks.

## Decision

Persist explicit team choices in separate dialogTeam:<account>:<dialog> Chrome local keys, preferring them over legacy option objects. Guard async restoration against newer user choices and account switches; copy hero arrays and preserve legacy settings needed by automation. All dialogs require explicit close or Escape rather than backdrop dismissal.

## Alternatives Considered


## Consequences
