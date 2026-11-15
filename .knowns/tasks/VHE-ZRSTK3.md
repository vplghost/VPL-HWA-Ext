---
id: VHE-ZRSTK3
title: Reduce redundant gathering march refresh requests
status: done
priority: medium
labels: []
createdAt: '2026-11-15T06:39:57.814Z'
updatedAt: '2026-11-15T07:14:45.381Z'
completedAt: '2026-11-15T07:14:45.381Z'
timeSpent: 802
---
# Reduce redundant gathering march refresh requests

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow Mail and Dashboard march layout work, preserving sequential execution. Audit gathering getMarches sources, coalesce redundant reads and prefer fresh passive RPC/MQTT snapshots. Preserve server-confirmed dispatch/recall/return gates and perform targeted reads only when passive evidence is absent or stale.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Identify request sources and passive evidence; remove or deduplicate redundant getMarches calls without weakening gather/return confirmation.
- [x] #2 Fresh passive RPC/MQTT data prevents unnecessary refreshes; missing/stale required state still recovers with bounded targeted reads.
- [x] #3 Regression request-count and confirmation tests, full checks/build and canonical docs pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit Header bootstrap, userGetInfo followups, MQTT and smart/defense refresh loops; preserve D1-D5. 2. Add selective passive-first march/unit reads with bounded account/tab deduplication and ETA-aware return polling. 3. Reduce captured gathering/return MQTT into canonical marches without inventing unit availability; request only missing evidence. 4. Add request-count, stale recovery and server-confirmation regressions, full checks/build and document verified behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed passiveMarchReads filtering and bounded per-account leases, Header passive bootstrap, initial-login-only queue bootstrap, selective stale feed reads and ETA-aware return followups. Captured mine MQTT updates known own squads without crediting troop availability. Full snapshot proof prevents partial push hydration; actual return timestamp strengthens the fresh-troop gate. Tests: 853 total, 841 pass, 12 optional private-capture skips; typecheck/build 0.10.95 pass. Fresh-profile Chrome Direct and Piggyback verify zero extra getMarches for two energy refreshes, Mail claims, expiry and two-column compact marches; evidence docs/acceptance/gather-passive-2026-11-15.json. Review: verified account clearing, stale/replay/unknown squad rejection, explicit-refresh bypass, lost-read bounded retries; no outstanding findings. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: candidate @decision/20261115-1412-prefer-passive-complete-march-state-with-targeted-recovery-reads (added) — passive observations and targeted recovery.
<!-- SECTION:NOTES:END -->

