---
id: doc-62dc94eb050af678d49cd1dfea471bc5
title: Mail RPC contract and dialog
description: Explicit mail deadlines, account-scoped claims, reward display and local expiry cleanup
createdAt: '2026-11-15T06:58:39.728Z'
updatedAt: '2026-11-15T09:12:24.658Z'
tags: []
---

# Mail RPC contract and dialog

MailModal opens from Header without a server request; Refresh explicitly reads mailGetAll and getPage:report. Letter rewards and deadlines remain primary. Source tasks: @task-VHE-7AC9T3 and @task-VHE-GVWTTW. Prior protocol source: @doc/architecture/auto-claim-automation-bridge. No new wire capture is asserted by the summary feature.

## Claims and expiry

Letters use availableUntil seconds; reports use expiresAt milliseconds. Zero, missing and invalid deadlines stay unknown. Letter claims use mailFarm {letterIds} with ID-to-reward responses; report claims use readAndClaimAll:report {types}, plus native single claimReward:report {id}. Account-scoped pending state is persisted before sending and receipt tokens survive Direct/Piggyback. Ambiguous acknowledgments hold without automatic retry; explicit failures do not archive reports. Newer authoritative balances win over reward deltas and unknown balances wait for a real snapshot. Full mailGetAll replaces letters; report pages merge pending reports across pagination.

## Claimed report compaction — 0.10.97

mail-data.compactReports runs from canonical prune AFTER native combat result actions are extracted/applied. It removes claimed report details from mailStatus and legacy getPage:report, preserving operational caches needed for active raid/monster controllers. Reports still waiting for claim remain available and Mail groups them by type, showing known rewards and earliest known expiry once per group.

battleReportSummary is account-scoped and keeps the last30 UTC calendar days of observed claimed report counts by type, known wins/losses and confirmed collected reward totals. Counts use createdAt milliseconds or first observation when unavailable. Receipt rewards use the UTC claim date and recognized reward entries from extractRewardActions; report prize previews are never added to collected totals. Historical totals cover observations available to this extension, not complete in-game history.

Minimal report-ID to [day,outcome] markers prevent pagination, repeated RPC and MQTT stubs from recounting or resurrecting archived reports. A later full page may enrich an unknown outcome once. Token-to-day markers deduplicate confirmed reward receipts, including after the normal receipt ring rolls over. Markers expire with their daily statistics; report payloads, reward previews and full report-claim call/reward bodies are discarded after aggregation, retaining only acknowledgment/stale-snapshot fields. Legacy successful report receipts migrate through the same reward normalizer without changing balances. Already claimed unscoped/foreign inbox entries are removed without assigning their counts to the current account; aggregation requires verified ownership. Account changes clear summary/receipts/cache together and old-account replies cannot resurrect them.

Startup, RPC records, local mail-prune and explicit expiry alarms run compaction/pruning without requesting history pages. Unknown deadlines stay available until confirmed claimed; explicit expired pending entries are removed. UTC30-day retention advances on these normal prune triggers. Mail history displays daily totals without one row per claimed report; empty or unknown rewards are not presented as zero received.

## Verification

Tests: tests/mail-summary.test.mjs, tests/mail.test.mjs, tests/mail-background.test.mjs and tests/intercept.test.mjs. Coverage includes migration size reduction, input immutability, repeat pages/MQTT, same-batch resource precedence, native single/bulk claims, rejected claims, legacy receipts, late battle outcomes, retention and account transitions. scripts/browser-mail-acceptance.mjs exercises grouped pending reports, confirmed collection, duplicate page replay and daily history in actual Chrome Direct/Piggyback.
Verification for0.10.97: full870 tests,858 pass and12 optional private-capture skips; typecheck and WXT build passed. Actual Chrome Direct/Piggyback fixture shows two pending report groups, confirmed collection, five archived reports with3 known wins/1 loss, no claimed detail rows and no duplicate counts or rewards after repeat pages. Evidence: docs/acceptance/mail-summary-2026-11-15.json. This is a local transport/UI fixture, not a live-game history completeness claim.
## Reusable extraction: compact history without losing correctness

1. Compact payloads only after operational consumers have processed the event. Mail history retention and active combat confirmation have different lifetimes; removing a claimed report must not suppress solo/rally result actions. Proof: compactReports invocation through pruneCache and the operational reducer regression in tests/mail-summary.test.mjs.
2. Keep small replay guards for the same horizon as aggregates. Removing full rows without report-ID/day/outcome and receipt-token/day guards would recount repeated pages or resurrect already claimed rewards. Unknown outcomes may be enriched once from a later page without incrementing the report count again. Proof: repeated page/MQTT, receipt-ring rollover and late-outcome tests in tests/mail-summary.test.mjs.
3. Separate event time from collection time. Counts follow report creation (or first observation when absent), while actual normalized claim rewards follow confirmation dates. Preview rewards are not evidence of collection; legacy receipt migration updates history without replaying resource deltas, and authoritative same-batch balances still win. Proof: distinct-date, migration and resource-precedence regressions in tests/mail-summary.test.mjs.
4. Validate both storage reduction and user-visible accuracy. The migration fixture verifies greater-than4x serialized-cache reduction for25 duplicate claimed payloads, immutability and idempotent pruning; Chrome fixture verifies grouped pending reports, five archived reports, known outcomes, reward totals and duplicate-page replay in both modes. These are observed local fixture results, not completeness or throughput claims about live-game history.

Canonical provenance: @task-VHE-GVWTTW, extension/mail-data.js:compactReports, extension/rpc-cache.js:merge/pruneCache, tests/mail-summary.test.mjs and docs/acceptance/mail-summary-2026-11-15.json. Existing @decision/20261115-1550-archive-claimed-mail-battle-reports-as-daily-aggregates remains a draft; this extraction adds evidence rather than a duplicate guidance record.
