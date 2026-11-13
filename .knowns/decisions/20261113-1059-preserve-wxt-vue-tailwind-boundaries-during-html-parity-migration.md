---
id: 20261113-1059-preserve-wxt-vue-tailwind-boundaries-during-html-parity-migration
title: Preserve WXT Vue Tailwind boundaries during HTML parity migration
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - migration
  - wxt
  - vue
sources:
  - '@task-VHE-HRA25T'
  - '@doc/architecture/wxt-vue-tailwind-conventions'
  - '@doc/reviews/wxt-vue-migration-review-2026-11-13-10-46-35'
  - wxt.config.ts
  - src/composables/useRpcCache.ts
relatedDocs:
  - architecture/wxt-vue-tailwind-conventions
  - reviews/wxt-vue-migration-review-2026-11-13-10-46-35
relatedTasks:
  - VHE-HRA25T
  - VHE-FY1G5K
  - VHE-QREKB0
  - VHE-8YB7KF
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-HRA25T" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '9e1f8cc228e962ce6045e3a300f9c2eaa3aeeb3242d864ed6c4442da386ba537'
reviewEvaluatedAt: '2026-11-13T03:59:20.910Z'
createdAt: '2026-11-13T03:59:20.910Z'
updatedAt: '2026-11-13T03:59:20.910Z'
---

## Context

Audit of HTML@12baa70 v0.9.244 and master@d3cd034 v0.10.52 found incomplete WXT artifacts and UI state/RPC regressions.

## Decision

Use WXT as sole popup/manifest compiler; retain validated classic worker/content as public assets until a separately verified native entrypoint migration. UI additions use Vue SFC/composables/pure helpers and Tailwind Vite. Background owns persisted RPC cache; honor global dispatch policy and account isolation. Strict typecheck, behavioral tests and artifact validation are required; live parity remains acceptance evidence.

## Alternatives Considered


## Consequences

No silent legacy fallback; version bump explicit; live browser acceptance remains required. Does not replace existing shared RPC settings guidance.
