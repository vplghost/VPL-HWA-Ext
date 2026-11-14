---
id: 20261114-2152-display-unknown-account-state-until-server-evidence-establishes-eligibility
title: Display unknown account state until server evidence establishes eligibility
status: draft
supersedes: []
supersededBy: []
tags:
  - ui
  - data-integrity
  - unknown
sources:
  - src/utils/guildVersusView.ts
  - tests/guild-versus-unknown.test.mjs
relatedDocs:
  - architecture/goals-tracking
  - architecture/wxt-vue-tailwind-conventions
relatedTasks:
  - VHE-VT9095
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedHash: '0f48e4d5bddc88cd936588151d077269ea261b8d847fc2b427693d8d56e06514'
reviewEvaluatedAt: '2026-11-14T14:52:07.297Z'
createdAt: '2026-11-14T14:52:07.297Z'
updatedAt: '2026-11-14T14:52:07.297Z'
---

## Context

Guild Versus previously invented league, participation, schedule and eligibility from sample fallback values; @task-VHE-VT9095 replaced them and proved missing/zero/false behavior with compiled SFC rendering.

## Decision

Candidate guidance for account-status UI: preserve explicit zero and false, display absent or invalid account metrics as unknown, and keep static rule metadata separate from observed account state. Positive readiness/eligibility needs actual observed prerequisites and verified rules.

## Alternatives Considered

Sample/default state produces misleading account status. Coercing unknown to zero/false obscures missing data. Hidden sections alone prevent users from seeing what must still sync.

## Consequences

UI models represent unknown explicitly and render honest placeholders; tests cover absent data separately from reported zero/false. This draft is not current policy until reviewed.
