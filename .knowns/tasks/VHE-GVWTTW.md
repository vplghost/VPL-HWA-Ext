---
id: VHE-GVWTTW
title: Compact claimed battle reports into daily mail statistics
status: done
priority: medium
labels: []
createdAt: '2026-11-15T08:41:23.114Z'
updatedAt: '2026-11-15T09:12:48.903Z'
completedAt: '2026-11-15T08:51:41.526Z'
timeSpent: 585
---
# Compact claimed battle reports into daily mail statistics

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace duplicate claimed battle-report storage/display in Mail with account-scoped daily aggregates, retaining pending claims and operational battle-result reducers. Use30 UTC days of observed statistics and minimal dedup keys; no invented rewards or optimistic claim completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Confirmed claimed reports compact into daily counts by type and known battle results with replay-safe minimal dedup markers; canonical/raw Mail caches drop claimed details.
- [x] #2 Daily observed claim rewards count once from confirmed responses, account/expiry/older-snapshot guards hold and native report actions still reach combat controllers.
- [x] #3 Mail groups pending reports and displays concise daily summaries without per-report claimed rows; claim actions and unknown rewards remain accurate.
- [x] #4 Migration, replay, pagination, claim/native order, account and UI regressions plus full checks/build and docs validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect report extraction, claim receipts and Mail cache ownership. 2. Add bounded account-scoped daily compaction and minimal dedup metadata, invoked by canonical prune after combat actions. 3. Group pending reports and render daily summary with explicit UTC/observed scope. 4. Verify migration, duplicates, stale/new responses, claim/account/resource precedence and real Chrome UI; document and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented account-scoped battleReportSummary with30 UTC days of observed claimed counts/types/results, normalized confirmed claim rewards by claim date, minimal ID/day/outcome and token/day replay guards. Compaction removes claimed canonical/raw Mail reports and full report-claim payloads after operational reducers run; preserves pending claims, pagination, native single/bulk confirmation, fresh snapshots and old-account guards. Legacy receipts migrate without changing balances; later pages enrich unknown outcomes once. Mail groups pending reports and shows collapsed daily totals with explicit observed/UTC/date scope. Review checked migration, immutability, replay, same-batch balances, rejected/native claims, retention/account changes and receipt compaction; no outstanding findings. Verification:870 tests,858 pass,12 optional skips; typecheck/build0.10.97 pass; runtime hashes match dist. Actual Chrome Direct/Piggyback fixture passed, evidence docs/acceptance/mail-summary-2026-11-15.json. Spec Decision Compliance: N/A (standalone Mail task); existing combat/claim confirmation preserved. System Decision Impact: candidate @decision/20261115-1550-archive-claimed-mail-battle-reports-as-daily-aggregates (changed) — claimed report retention becomes daily observed aggregates.

kn-extract: canonical lessons added to @doc/api/mail-rpc-contract-and-dialog (post-consumer compaction, equal retention of replay guards and aggregates, separate event/claim dates, count-and-outcome verification). Added proposed @memory/rxlkme and linked code/Chrome evidence to existing draft @decision/20261115-1550-archive-claimed-mail-battle-reports-as-daily-aggregates, now ready_for_review and not accepted. No duplicate Decision or task/AC status change.
<!-- SECTION:NOTES:END -->

