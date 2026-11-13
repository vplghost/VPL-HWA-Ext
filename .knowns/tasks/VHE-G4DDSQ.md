---
id: VHE-G4DDSQ
title: Normalize object-form team hero collections before auto-join options
status: done
priority: medium
labels: []
createdAt: '2026-11-13T16:10:17.154Z'
updatedAt: '2026-11-13T16:12:45.233Z'
completedAt: '2026-11-13T16:12:45.233Z'
timeSpent: 129
---
# Normalize object-form team hero collections before auto-join options

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix popup TypeError object is not iterable at new Set in autoJoinTeamOptions/normalizeCustomTeam. Reproduce with server or stored object-form heroIds, normalize supported collection forms consistently and reject malformed values without crashing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reported new Set crash is reproduced and eliminated for supported object-form heroIds without changing valid team selection semantics.
- [x] #2 Regression tests exercise the actual classic helper used by popup, including malformed inputs and array/object parity.
- [x] #3 Tests, typecheck, versioned production build and commit are complete.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the shared helper crash from stack and inspect actual team collection contracts. 2. Normalize object-form hero collections in the classic helper used by Vue and validate IDs; cover options, malformed input and valid array behavior. 3. Run tests/typecheck/build, document root cause, release patch and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced reported TypeError twice with numeric-key object heroIds through the actual classic autoJoinTeamOptions stack. Root cause: classic normalizeCustomTeam directly constructed Set from object while the parallel TS version already normalizes collections. Added local asArray normalization for heroIds and both custom-team option builders; no ID coercion or validation changes. Tests cover ordered object values, outer team collections, malformed scalar/object IDs, ownership/duplicates, and real Vue popup computation/save. Focused28tests pass.

Verification:656tests total,644passed,0failed,12optional skips; typecheck passed. Review PASS:P1=0,P2=0,P3=0. Root cause fixed in the production classic helper used by Vue, with regression coverage for real popup team computation and persistence. System Decision Impact: none — this restores existing collection normalization and validation behavior, without changing team selection rules or accepted architecture.

Production build0.10.61 and synchronized source/dist helper verified. Code, regression tests, root-cause memory, changelog and release artifacts committed; final task status folded into the same commit. Unrelated staged empty TypeScript LSP log remains excluded.
<!-- SECTION:NOTES:END -->

