---
id: VHE-HHA1TB
title: Browser acceptance of migration across queued RPC and accounts
status: done
priority: high
labels:
  - migration
  - acceptance
  - browser
createdAt: '2026-11-13T03:55:34.027Z'
updatedAt: '2026-11-14T15:02:27.863Z'
completedAt: '2026-11-14T14:52:31.393Z'
timeSpent: 641
parent: VHE-HRA25T
---
# Browser acceptance of migration across queued RPC and accounts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow timestamped migration audit browser checklist using disposable/mock game responses first; then authorized live account. Verify install both WXT/dist, popup/standalone, refresh/reopen, account switch, each mutation direct/piggyback/MQTT, unknown/empty data, dark/system theme, recorder export, campaign pending result. Static/helper tests do not prove live parity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both artifacts install in Chrome with worker/content hooks and assets available
- [x] #2 All mounted tabs/dialogs work with empty/partial data, keyboard and dark/system theme
- [x] #3 Account switch and queued/rejected RPC scenarios preserve correct state
- [x] #4 Live-game acceptance evidence or explicit limitations are attached per feature group
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Launch installed Chrome in a disposable isolated profile with CDP; load both .output and dist artifacts and record actual install/worker/content-hook/asset evidence. 2. Drive real rendered popup/standalone tabs/dialogs under empty/partial/zero fixture caches, keyboard and light/dark/system themes; capture screenshots/errors. 3. Exercise isolated account changes and queued/rejected RPC fixtures with no live-game mutations. 4. Attach per-feature live limitations and exact versions; check only criteria proven by browser evidence. 5. Extract reusable acceptance harness/lessons and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Actual Chrome 157.0.8103.52 fixture acceptance PASS on both dist and .output/chrome-mv3, 73 checks each, zero recorded popup runtime exceptions. Evidence and per-feature live limitations: @doc/audits/backlog-acceptance-audit-2026-11-14, docs/acceptance/browser-2026-11-14.json. Checked AC2 for empty/partial mounted UI, dialog Escape and basic keyboard/theme scope; no blanket focus/accessibility or all-entry-point claim. Checked AC3 for actual team account switch/cache deletion and queued/rejected read paths, not all pending mutation races. AC4 explicitly permits attached live limitations; those are listed by group and tracked in @task-VHE-Z0RGFJ. Extracted reusable scripts, canonical conventions and @memory/ca1gyu. Review: PASS within stated scope; no P1/P2 outstanding. Spec Decision Compliance: N/A — no linked spec. System Decision Impact: none — browser evidence and accessibility annotations implement existing migration guidance; no new policy.

Final artifact rerun after quest metadata integration:74 checks per artifact,148 total; report refreshed at docs/acceptance/browser-2026-11-14.json. Both artifacts still PASS with no recorded popup Runtime exceptions; quest364 exact locale and5/10 progress verified. Disposable Chrome process closed.
<!-- SECTION:NOTES:END -->

