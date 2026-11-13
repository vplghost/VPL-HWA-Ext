---
id: VHE-QREKB0
title: Restore Vue type checking and missing refresh bindings
status: done
priority: high
labels:
  - migration
  - typescript
createdAt: '2026-11-13T03:51:01.886Z'
updatedAt: '2026-11-13T04:00:44.316Z'
completedAt: '2026-11-13T04:00:44.316Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Restore Vue type checking and missing refresh bindings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add vue-tsc check (TypeScript 7 currently incompatible with vue-tsc lib/tsc API), align WXT alias and chrome/node types, repair missing dispatchRpc in Raid/Monster. Track remaining strict storage/template/index errors explicitly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 vue-tsc runs with compatible compiler and WXT aliases/types
- [x] #2 Missing refresh dispatch bindings and invalid RPC names fixed
- [x] #3 Strict Vue typecheck passes without disabling strict or unchecked-index checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Install compatible vue-tsc + TypeScript compiler API version, expose typecheck script, retain WXT strict checks. Fix missing dispatch bindings, validate storage boundaries with explicit types, guard unchecked indexed access and fix template numeric indices. Run typecheck and full tests without suppressing errors.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
System Decision Impact: candidate @decision/20261113-1059-preserve-wxt-vue-tailwind-boundaries-during-html-parity-migration (added) — WXT-only packaging and strict Vue validation conventions documented.
Spec Decision Compliance: not applicable — audit task wave has no linked spec.
Validation: npm run check passed (573 tests;561 pass;12 skip;0 fail), strict vue-tsc and artifact checks pass. Browser acceptance remains @task-VHE-HHA1TB.
<!-- SECTION:NOTES:END -->

