---
id: 20261115-1550-archive-claimed-mail-battle-reports-as-daily-aggregates
title: Archive claimed mail battle reports as daily aggregates
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-GVWTTW'
  - '@doc/api/mail-rpc-contract-and-dialog'
  - extension/mail-data.js
  - tests/mail-summary.test.mjs
  - extension/rpc-cache.js
  - docs/acceptance/mail-summary-2026-11-15.json
relatedDocs:
  - api/mail-rpc-contract-and-dialog
relatedTasks:
  - VHE-GVWTTW
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedHash: '42b6594dd8c37a5bf803e62313742634d145868fe43f356a7e47c1cc813813b1'
reviewEvaluatedAt: '2026-11-15T09:12:25.171Z'
createdAt: '2026-11-15T08:50:32.529Z'
updatedAt: '2026-11-15T09:12:25.171Z'
---

## Context


## Decision

After operational combat reducers process a report, compact claimed Mail report details into account-scoped observed daily UTC statistics with30-day retention and minimal ID/outcome/token replay guards. Group unclaimed reports by type; retain pending claims and explicit expiry. Count collected rewards only from successful normalized claim responses on claim dates, never from report previews, and preserve account/resource/confirmation guards.

## Alternatives Considered


## Consequences
