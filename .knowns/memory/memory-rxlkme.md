---
id: rxlkme
title: Compacted report history retains replay guards and separate event dates
layer: project
category: pattern
status: proposed
tags:
  - mail
  - cache
  - rpc
createdAt: '2026-11-15T09:12:24.931Z'
updatedAt: '2026-11-15T09:12:24.931Z'
---

mail-data.compactReports removes claimed Mail payloads only after combat reducers run, retaining report-ID/day/outcome and receipt-token/day guards for the same30-day UTC horizon as aggregates. Replayed pages/claims cannot recount reports or rewards; a later page may enrich an unknown outcome once. Report counts use creation/first-observation dates, while collected rewards use confirmed claim dates and normalized response rewards, never previews. Provenance: @task-VHE-GVWTTW, @doc/api/mail-rpc-contract-and-dialog, extension/mail-data.js:compactReports and tests/mail-summary.test.mjs.
